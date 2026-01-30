/**
 * Recovery Orchestrator
 *
 * B3: Cloud Run Reliability - Recovery/Resume on Restart
 *
 * Coordinates recovery of interrupted runs on engine startup:
 * - Detects orphaned runs via HeartbeatService
 * - Checks checkpoint state to determine resumability
 * - Resumes resumable runs, fails non-resumable ones
 * - Tracks recovery metrics for observability
 *
 * Recovery Decision Tree:
 * 1. Find orphaned runs (stale heartbeat + in-flight status)
 * 2. For each orphaned run:
 *    a. Check if checkpoint exists
 *    b. If resumable checkpoint found → resume run
 *    c. If no checkpoint or non-resumable → fail run
 *
 * @module @gwi/engine/run/recovery
 */

import type { TenantStore, SaaSRun } from '@gwi/core';
import { getLogger } from '@gwi/core';
import { HeartbeatService } from './heartbeat.js';
import {
  canResume,
  resumeRun,
  type ResumeResult,
  type CanResumeResult,
} from './resume.js';
import {
  InMemoryCheckpointStore,
  type CheckpointStore,
} from './checkpoint.js';

const logger = getLogger('recovery');

// =============================================================================
// Types
// =============================================================================

/**
 * Recovery decision for an orphaned run
 */
export type RecoveryDecision = 'resume' | 'fail' | 'skip';

/**
 * Result of recovery decision for a single run
 */
export interface RunRecoveryResult {
  /** Run ID */
  runId: string;
  /** Tenant ID */
  tenantId: string;
  /** Decision made */
  decision: RecoveryDecision;
  /** Whether action was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Resume context if resumed */
  resumeContext?: ResumeResult['context'];
  /** Reason for decision */
  reason: string;
}

/**
 * Summary of recovery operation
 */
export interface RecoveryResult {
  /** Total orphaned runs found */
  orphanedCount: number;
  /** Runs resumed */
  resumedCount: number;
  /** Runs failed */
  failedCount: number;
  /** Runs skipped */
  skippedCount: number;
  /** Errors encountered */
  errorCount: number;
  /** Details per run */
  runs: RunRecoveryResult[];
  /** Time taken in ms */
  durationMs: number;
  /** Owner ID of recovery instance */
  ownerId: string;
}

/**
 * Options for recovery operation
 */
export interface RecoveryOptions {
  /** Threshold for stale heartbeat (default: 5 minutes) */
  staleThresholdMs?: number;
  /** Maximum runs to process in one recovery (default: 100) */
  maxRuns?: number;
  /** Whether to actually resume runs or just check (default: true) */
  executeResume?: boolean;
  /** Checkpoint store (defaults to in-memory) */
  checkpointStore?: CheckpointStore;
}

/**
 * Configuration for RecoveryOrchestrator
 */
export interface RecoveryOrchestratorConfig {
  /** TenantStore for run persistence */
  store: TenantStore;
  /** Heartbeat service (optional, created if not provided) */
  heartbeatService?: HeartbeatService;
  /** Checkpoint store for resume state */
  checkpointStore?: CheckpointStore;
  /** Instance owner ID (auto-generated if not provided) */
  ownerId?: string;
}

// =============================================================================
// Recovery Orchestrator
// =============================================================================

/**
 * Orchestrates recovery of interrupted runs on engine startup.
 *
 * Usage:
 * ```typescript
 * const orchestrator = new RecoveryOrchestrator({ store });
 *
 * // On engine startup
 * const result = await orchestrator.recoverOrphanedRuns();
 *
 * console.log(`Resumed: ${result.resumedCount}, Failed: ${result.failedCount}`);
 * ```
 */
export class RecoveryOrchestrator {
  private readonly store: TenantStore;
  private readonly heartbeatService: HeartbeatService;
  private readonly checkpointStore: CheckpointStore;

  constructor(config: RecoveryOrchestratorConfig) {
    this.store = config.store;

    // Use provided heartbeat service or create new one
    this.heartbeatService = config.heartbeatService ?? new HeartbeatService({
      store: config.store,
      ownerId: config.ownerId,
    });

    // Use provided checkpoint store or create in-memory one.
    // Warn if no persistent store is provided in non-test environments,
    // as this breaks cross-instance recovery.
    this.checkpointStore = config.checkpointStore ?? new InMemoryCheckpointStore();
    if (!config.checkpointStore && process.env.NODE_ENV !== 'test') {
      logger.warn(
        'RecoveryOrchestrator using InMemoryCheckpointStore - run recovery will not work across instance restarts',
        { ownerId: this.getOwnerId() }
      );
    }
  }

  /**
   * Get the owner ID for this recovery instance
   */
  getOwnerId(): string {
    return this.heartbeatService.getOwnerId();
  }

  /**
   * Get the heartbeat service
   */
  getHeartbeatService(): HeartbeatService {
    return this.heartbeatService;
  }

  /**
   * Recover orphaned runs with resume capability
   *
   * This is the main entry point for recovery on startup.
   * It finds orphaned runs and either resumes or fails them
   * based on checkpoint state.
   */
  async recoverOrphanedRuns(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    const startTime = Date.now();
    const {
      staleThresholdMs = 300_000, // 5 minutes
      maxRuns = 100,
      executeResume = true,
    } = options;

    logger.info('Starting recovery of orphaned runs', {
      ownerId: this.getOwnerId(),
      staleThresholdMs,
      maxRuns,
      executeResume,
    });

    const result: RecoveryResult = {
      orphanedCount: 0,
      resumedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      runs: [],
      durationMs: 0,
      ownerId: this.getOwnerId(),
    };

    try {
      // Find orphaned runs via heartbeat service
      const orphanedRuns = await this.heartbeatService.recoverOrphanedRuns({
        staleThresholdMs,
        failOrphans: false, // Don't auto-fail, we'll make the decision
      });

      result.orphanedCount = orphanedRuns.length;

      if (orphanedRuns.length === 0) {
        logger.info('No orphaned runs found');
        result.durationMs = Date.now() - startTime;
        return result;
      }

      logger.warn('Found orphaned runs', {
        count: orphanedRuns.length,
        runIds: orphanedRuns.map(r => r.id).slice(0, 10),
      });

      // Process each orphaned run (up to maxRuns)
      const runsToProcess = orphanedRuns.slice(0, maxRuns);

      for (const run of runsToProcess) {
        const runResult = await this.processOrphanedRun(run, executeResume);
        result.runs.push(runResult);

        switch (runResult.decision) {
          case 'resume':
            if (runResult.success) {
              result.resumedCount++;
            } else {
              result.errorCount++;
            }
            break;
          case 'fail':
            if (runResult.success) {
              result.failedCount++;
            } else {
              result.errorCount++;
            }
            break;
          case 'skip':
            result.skippedCount++;
            break;
        }
      }

      if (runsToProcess.length < orphanedRuns.length) {
        logger.warn('Recovery limit reached', {
          processed: runsToProcess.length,
          remaining: orphanedRuns.length - runsToProcess.length,
        });
      }
    } catch (error) {
      logger.error('Recovery failed', { error: getErrorMessage(error) });
      result.errorCount++;
    }

    result.durationMs = Date.now() - startTime;

    logger.info('Recovery complete', {
      orphanedCount: result.orphanedCount,
      resumedCount: result.resumedCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      durationMs: result.durationMs,
    });

    return result;
  }

  /**
   * Process a single orphaned run
   *
   * Decision logic:
   * 1. Check if run is in resumable state
   * 2. Check for checkpoints
   * 3. Decide: resume or fail
   */
  private async processOrphanedRun(
    run: SaaSRun,
    executeAction: boolean
  ): Promise<RunRecoveryResult> {
    const runResult: RunRecoveryResult = {
      runId: run.id,
      tenantId: run.tenantId,
      decision: 'fail',
      success: false,
      reason: '',
    };

    try {
      // Convert SaaSRun to Run for resume check (minimal conversion)
      const runForCheck = {
        id: run.id,
        prId: run.prId,
        prUrl: run.prUrl,
        type: run.type,
        status: run.status,
        steps: run.steps,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        resumeCount: run.resumeCount,
      };

      // Check if run can be resumed
      const resumeCheck = await canResume(runForCheck, this.checkpointStore);

      if (resumeCheck.canResume) {
        // Run is resumable
        runResult.decision = 'resume';
        runResult.reason = `Checkpoint found at step: ${resumeCheck.resumePoint?.checkpoint?.agent || 'unknown'}`;

        if (executeAction) {
          const resumeResult = await resumeRun({
            run: runForCheck,
            store: this.checkpointStore,
          });

          if (resumeResult.success) {
            // Update run status to indicate resume
            await this.store.updateRun(run.tenantId, run.id, {
              status: 'running',
              ownerId: this.getOwnerId(),
              lastHeartbeatAt: new Date(),
              resumeCount: (run.resumeCount || 0) + 1,
            });

            // Start heartbeat for resumed run
            this.heartbeatService.startHeartbeat(run.tenantId, run.id);

            runResult.success = true;
            runResult.resumeContext = resumeResult.context;

            logger.info('Resumed orphaned run', {
              runId: run.id,
              tenantId: run.tenantId,
              resumePoint: resumeResult.context?.resumeCheckpoint?.stepId,
              resumeCount: (run.resumeCount || 0) + 1,
            });
          } else {
            // Resume action failed - mark run as failed to prevent infinite recovery loops
            runResult.decision = 'fail';
            runResult.reason = `Resume action failed: ${resumeResult.error}`;
            runResult.error = resumeResult.error;

            logger.error('Failed to resume run, marking as failed', {
              runId: run.id,
              error: resumeResult.error,
            });

            // Fail the run to prevent recovery loops
            await this.store.updateRun(run.tenantId, run.id, {
              status: 'failed',
              error: `Run orphaned and resumable, but resume action failed: ${resumeResult.error}. Recovered by: ${this.getOwnerId()}`,
              completedAt: new Date(),
            });

            runResult.success = true; // The 'fail' action was successful
          }
        } else {
          // Dry run - just mark as would succeed
          runResult.success = true;
        }
      } else {
        // Run cannot be resumed - fail it
        runResult.decision = 'fail';
        runResult.reason = getResumeBlockerReason(resumeCheck);

        if (executeAction) {
          await this.store.updateRun(run.tenantId, run.id, {
            status: 'failed',
            error: `Run orphaned and not resumable: ${runResult.reason}. Previous owner: ${run.ownerId || 'unknown'}. Last heartbeat: ${run.lastHeartbeatAt?.toISOString() || 'never'}. Recovered by: ${this.getOwnerId()}`,
            completedAt: new Date(),
          });

          runResult.success = true;

          logger.info('Failed orphaned run (not resumable)', {
            runId: run.id,
            tenantId: run.tenantId,
            reason: runResult.reason,
          });
        } else {
          runResult.success = true;
        }
      }
    } catch (error) {
      runResult.success = false;
      runResult.error = getErrorMessage(error);
      runResult.reason = `Error during recovery: ${runResult.error}`;

      logger.error('Error processing orphaned run', {
        runId: run.id,
        error: runResult.error,
      });
    }

    return runResult;
  }

  /**
   * Shutdown the orchestrator
   */
  shutdown(): void {
    this.heartbeatService.shutdown();
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Get human-readable reason from resume blocker
 */
function getResumeBlockerReason(check: CanResumeResult): string {
  if (!check.blocker) {
    return check.reason || 'Unknown reason';
  }

  switch (check.blocker) {
    case 'run_completed':
      return 'Run already completed';
    case 'run_cancelled':
      return 'Run was cancelled';
    case 'no_checkpoints':
      return 'No checkpoints saved';
    case 'no_resumable_checkpoint':
      return 'No resumable checkpoint found';
    case 'run_not_found':
      return 'Run not found';
    case 'missing_steps':
      return 'Missing step definitions';
    default:
      return check.reason || 'Cannot resume';
  }
}

// =============================================================================
// Exports
// =============================================================================

export { RecoveryOrchestrator as default };
