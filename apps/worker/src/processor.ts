/**
 * Worker Job Processor
 *
 * Phase 16: Handles job execution with reliability guarantees.
 *
 * Features:
 * - Distributed locking to prevent concurrent execution
 * - Idempotency to prevent duplicate processing
 * - Checkpoint-based resume for long-running jobs
 * - Timeout handling with lock extension
 *
 * @module @gwi/worker/processor
 */

import type {
  RunLockManager,
  IdempotencyStore,
  IdempotencyKey,
} from '@gwi/core';
import type { FirestoreCheckpointManager } from '@gwi/core';
import { createIdempotencyKey, hashInput, getLogger } from '@gwi/core';
import type { BrokerMessage } from './pubsub.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Worker job definition
 */
export interface WorkerJob {
  /** Unique job ID */
  id?: string;

  /** Job type (determines handler) */
  type: string;

  /** Tenant ID for scoping */
  tenantId: string;

  /** Run ID (if associated with a run) */
  runId?: string;

  /** Job payload */
  payload: Record<string, unknown>;

  /** Job metadata */
  metadata?: {
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Current retry count */
    retryCount?: number;
    /** Priority (higher = more important) */
    priority?: number;
    /** Deadline timestamp */
    deadline?: number;
  };
}

/**
 * Job execution result
 */
export interface JobResult {
  /** Final status */
  status: 'completed' | 'failed' | 'skipped';

  /** Output data */
  output?: unknown;

  /** Error message if failed */
  error?: string;

  /** Whether job was already processed (idempotency) */
  cached?: boolean;

  /** Processing duration in ms */
  durationMs?: number;
}

/**
 * Job handler function
 */
export type JobHandler = (
  job: WorkerJob,
  context: JobContext
) => Promise<JobResult>;

/**
 * Job execution context
 */
export interface JobContext {
  /** Message ID from broker */
  messageId: string;

  /** Lock holder ID */
  lockHolderId?: string;

  /** Checkpoint manager for long-running jobs */
  checkpointManager: FirestoreCheckpointManager;

  /** Extend the job's lock TTL */
  extendLock: (additionalMs: number) => Promise<boolean>;

  /** Log with job context */
  log: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}

/**
 * Processor configuration
 */
export interface ProcessorConfig {
  /** Lock manager instance */
  lockManager: RunLockManager;

  /** Idempotency store instance */
  idempotencyStore: IdempotencyStore;

  /** Checkpoint manager instance */
  checkpointManager: FirestoreCheckpointManager;

  /** Job timeout in ms */
  jobTimeoutMs: number;

  /** Lock TTL in ms */
  lockTtlMs: number;
}

// =============================================================================
// Worker Processor
// =============================================================================

/**
 * Processes worker jobs with reliability guarantees
 */
export class WorkerProcessor {
  private config: ProcessorConfig;
  private handlers = new Map<string, JobHandler>();
  private logger = getLogger('processor');

  // Stats
  private stats = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    cached: 0,
    lockConflicts: 0,
    startedAt: Date.now(),
  };

  constructor(config: ProcessorConfig) {
    this.config = config;
    this.registerDefaultHandlers();
  }

  /**
   * Register a job handler
   */
  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Process a job message from the broker
   */
  async processJob(message: BrokerMessage): Promise<JobResult> {
    const startTime = Date.now();
    this.stats.processed++;

    const job = message.data;
    const jobId = job.id || message.id;

    this.logger.info('Processing job', {
      jobId,
      type: job.type,
      tenantId: job.tenantId,
      messageId: message.id,
    });

    // Check deadline
    if (job.metadata?.deadline && Date.now() > job.metadata.deadline) {
      this.stats.skipped++;
      return {
        status: 'skipped',
        error: 'Job deadline exceeded',
        durationMs: Date.now() - startTime,
      };
    }

    // Check for handler
    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.stats.failed++;
      return {
        status: 'failed',
        error: `Unknown job type: ${job.type}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Create idempotency key
    const idempotencyKey = createIdempotencyKey(
      job.runId || job.tenantId,
      jobId,
      job.type,
      job.payload
    );

    // Check idempotency
    const idempotencyResult = await this.config.idempotencyStore.checkIdempotency(idempotencyKey);
    if (idempotencyResult.skip) {
      this.stats.cached++;
      this.stats.skipped++;
      return {
        status: idempotencyResult.error ? 'failed' : 'completed',
        output: idempotencyResult.result,
        error: idempotencyResult.error,
        cached: true,
        durationMs: Date.now() - startTime,
      };
    }

    // Acquire lock (if run-scoped)
    let lockHolderId: string | undefined;
    if (job.runId) {
      const lockResult = await this.config.lockManager.tryAcquire(job.runId, {
        ttlMs: this.config.lockTtlMs,
        reason: `job:${job.type}`,
      });

      if (!lockResult.acquired) {
        this.stats.lockConflicts++;
        this.logger.warn('Lock conflict', {
          jobId,
          runId: job.runId,
          existingHolder: lockResult.existingHolderId,
        });

        // Return failed but don't record idempotency (allow retry)
        return {
          status: 'failed',
          error: `Lock conflict: ${lockResult.error}`,
          durationMs: Date.now() - startTime,
        };
      }

      lockHolderId = lockResult.lock?.holderId;
    }

    // Create job context
    const context: JobContext = {
      messageId: message.id,
      lockHolderId,
      checkpointManager: this.config.checkpointManager,
      extendLock: async (additionalMs: number) => {
        if (job.runId && lockHolderId) {
          return this.config.lockManager.extend(job.runId, lockHolderId, additionalMs);
        }
        return false;
      },
      log: (level, msg, data) => {
        this.logger[level](msg, { ...data, jobId, type: job.type });
      },
    };

    // Record idempotency start
    await this.config.idempotencyStore.create(
      this.keyToString(idempotencyKey),
      idempotencyKey
    );

    try {
      // Execute handler with timeout
      const result = await this.executeWithTimeout(
        () => handler(job, context),
        this.config.jobTimeoutMs
      );

      // Record success
      await this.config.idempotencyStore.complete(
        this.keyToString(idempotencyKey),
        result.output
      );

      if (result.status === 'completed') {
        this.stats.completed++;
      } else if (result.status === 'failed') {
        this.stats.failed++;
      } else {
        this.stats.skipped++;
      }

      result.durationMs = Date.now() - startTime;
      return result;
    } catch (error) {
      // Record failure
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.config.idempotencyStore.fail(
        this.keyToString(idempotencyKey),
        errorMessage
      );

      this.stats.failed++;
      this.logger.error('Job failed', {
        jobId,
        type: job.type,
        error: errorMessage,
      });

      return {
        status: 'failed',
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    } finally {
      // Release lock
      if (job.runId && lockHolderId) {
        await this.config.lockManager.release(job.runId, lockHolderId);
      }
    }
  }

  /**
   * Get processor stats
   */
  getStats(): typeof this.stats & { uptime: number; qps: number } {
    const uptime = Date.now() - this.stats.startedAt;
    return {
      ...this.stats,
      uptime,
      qps: uptime > 0 ? (this.stats.processed / (uptime / 1000)) : 0,
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  }

  /**
   * Convert idempotency key to string
   */
  private keyToString(key: IdempotencyKey): string {
    return `idem:${key.runId}:${key.stepId}:${key.operation}:${key.inputHash}`;
  }

  /**
   * Register default job handlers
   */
  private registerDefaultHandlers(): void {
    // Noop handler for testing
    this.registerHandler('noop', async (_job, context) => {
      context.log('info', 'Noop job executed');
      return { status: 'completed', output: { noop: true } };
    });

    // Echo handler for testing
    this.registerHandler('echo', async (job, context) => {
      context.log('info', 'Echo job executed');
      return { status: 'completed', output: job.payload };
    });

    // Workflow execution handler
    this.registerHandler('workflow:execute', async (job, context) => {
      context.log('info', 'Workflow execution started', { payload: job.payload });

      // This would integrate with @gwi/engine
      // For now, just acknowledge receipt
      return {
        status: 'completed',
        output: {
          acknowledged: true,
          runId: job.runId,
          payload: job.payload,
        },
      };
    });

    // Signal processing handler
    this.registerHandler('signal:process', async (job, context) => {
      context.log('info', 'Signal processing started', { payload: job.payload });

      // This would process signals from Phase 14
      return {
        status: 'completed',
        output: {
          processed: true,
          signalId: job.payload.signalId,
        },
      };
    });

    // PR candidate handler
    this.registerHandler('candidate:generate', async (job, context) => {
      context.log('info', 'PR candidate generation started', { payload: job.payload });

      // This would generate PR candidates from Phase 14
      return {
        status: 'completed',
        output: {
          generated: true,
          workItemId: job.payload.workItemId,
        },
      };
    });
  }
}
