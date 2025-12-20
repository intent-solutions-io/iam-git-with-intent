/**
 * Job Queue Abstraction
 *
 * Phase 17: Unified queue interface for publishing jobs to workers.
 *
 * Features:
 * - Google Cloud Pub/Sub integration
 * - In-memory fallback for development
 * - Type-safe job publishing
 * - Priority and deadline support
 *
 * @module @gwi/core/queue
 */

import { getLogger } from '../reliability/observability.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Job to be queued for worker processing
 */
export interface QueueJob {
  /** Unique job ID (auto-generated if not provided) */
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
    /** Priority (higher = more important) */
    priority?: number;
    /** Deadline timestamp (job expires after this) */
    deadline?: number;
    /** Delay in milliseconds before processing */
    delayMs?: number;
    /** Ordering key (for ordered processing) */
    orderingKey?: string;
  };
}

/**
 * Result of publishing a job
 */
export interface QueuePublishResult {
  /** Message ID from the queue */
  messageId: string;
  /** Whether publish was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** GCP project ID */
  projectId: string;
  /** Pub/Sub topic ID */
  topicId: string;
  /** Enable message ordering */
  enableOrdering?: boolean;
}

/**
 * Queue publisher interface
 */
export interface JobQueue {
  /** Publish a job to the queue */
  publish(job: QueueJob): Promise<QueuePublishResult>;

  /** Publish multiple jobs (batch) */
  publishBatch(jobs: QueueJob[]): Promise<QueuePublishResult[]>;

  /** Check if the queue is connected */
  isConnected(): boolean;

  /** Close connections */
  close(): Promise<void>;
}

// =============================================================================
// Pub/Sub Implementation
// =============================================================================

/**
 * Google Cloud Pub/Sub job queue
 */
class PubSubJobQueue implements JobQueue {
  private config: QueueConfig;
  private logger = getLogger('pubsub-queue');
  private connected = false;
  private pubsub: unknown = null;
  private topic: unknown = null;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.topic) return;

    try {
      const { PubSub } = await import('@google-cloud/pubsub');
      this.pubsub = new PubSub({ projectId: this.config.projectId });
      this.topic = (this.pubsub as InstanceType<typeof PubSub>).topic(
        this.config.topicId,
        {
          messageOrdering: this.config.enableOrdering ?? false,
        }
      );
      this.connected = true;
      this.logger.info('Connected to Pub/Sub', {
        projectId: this.config.projectId,
        topicId: this.config.topicId,
      });
    } catch (error) {
      this.logger.error('Failed to connect to Pub/Sub', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(job: QueueJob): Promise<QueuePublishResult> {
    await this.ensureConnected();

    const jobId = job.id || generateJobId();
    const jobWithId = { ...job, id: jobId };

    try {
      const attributes: Record<string, string> = {
        type: job.type,
        tenantId: job.tenantId,
        jobId,
      };

      if (job.runId) {
        attributes.runId = job.runId;
      }

      if (job.metadata?.priority !== undefined) {
        attributes.priority = String(job.metadata.priority);
      }

      const messageOptions: {
        data: Buffer;
        attributes: Record<string, string>;
        orderingKey?: string;
      } = {
        data: Buffer.from(JSON.stringify(jobWithId)),
        attributes,
      };

      if (job.metadata?.orderingKey && this.config.enableOrdering) {
        messageOptions.orderingKey = job.metadata.orderingKey;
      }

      const messageId = await (this.topic as {
        publishMessage: (options: typeof messageOptions) => Promise<string>;
      }).publishMessage(messageOptions);

      this.logger.info('Job published', {
        messageId,
        jobId,
        type: job.type,
        tenantId: job.tenantId,
      });

      return {
        messageId,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to publish job', {
        jobId,
        type: job.type,
        error: errorMessage,
      });

      return {
        messageId: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  async publishBatch(jobs: QueueJob[]): Promise<QueuePublishResult[]> {
    // Pub/Sub batching is automatic, but we can process in parallel
    const results = await Promise.all(jobs.map((job) => this.publish(job)));
    return results;
  }

  async close(): Promise<void> {
    if (this.topic) {
      await (this.topic as { flush: () => Promise<void> }).flush?.();
    }
    this.connected = false;
    this.topic = null;
    this.pubsub = null;
    this.logger.info('Pub/Sub connection closed');
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory job queue for development and testing
 */
class InMemoryJobQueue implements JobQueue {
  private logger = getLogger('inmem-queue');
  private queue: QueueJob[] = [];
  private messageCounter = 0;
  private handlers: Map<string, (job: QueueJob) => Promise<void>> = new Map();

  isConnected(): boolean {
    return true;
  }

  async publish(job: QueueJob): Promise<QueuePublishResult> {
    const jobId = job.id || generateJobId();
    const messageId = `inmem-${++this.messageCounter}-${Date.now()}`;

    const jobWithId = { ...job, id: jobId };
    this.queue.push(jobWithId);

    this.logger.info('Job queued (in-memory)', {
      messageId,
      jobId,
      type: job.type,
      tenantId: job.tenantId,
      queueLength: this.queue.length,
    });

    // Trigger async processing if handlers registered
    const handler = this.handlers.get(job.type) || this.handlers.get('*');
    if (handler) {
      setImmediate(async () => {
        try {
          await handler(jobWithId);
          this.queue.shift(); // Remove processed job
        } catch (error) {
          this.logger.error('In-memory handler failed', {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    return {
      messageId,
      success: true,
    };
  }

  async publishBatch(jobs: QueueJob[]): Promise<QueuePublishResult[]> {
    return Promise.all(jobs.map((job) => this.publish(job)));
  }

  async close(): Promise<void> {
    this.queue = [];
    this.handlers.clear();
    this.logger.info('In-memory queue closed');
  }

  // Testing utilities

  /**
   * Register a handler for testing
   */
  registerHandler(type: string, handler: (job: QueueJob) => Promise<void>): void {
    this.handlers.set(type, handler);
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get all queued jobs
   */
  getQueuedJobs(): QueueJob[] {
    return [...this.queue];
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Pop next job from queue
   */
  popJob(): QueueJob | undefined {
    return this.queue.shift();
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

let queueInstance: JobQueue | null = null;

/**
 * Create a job queue based on configuration
 */
export function createJobQueue(config: QueueConfig): JobQueue {
  const logger = getLogger('queue-factory');

  if (config.projectId) {
    logger.info('Creating Pub/Sub job queue', {
      projectId: config.projectId,
      topicId: config.topicId,
    });
    return new PubSubJobQueue(config);
  }

  logger.info('Creating in-memory job queue (dev mode)');
  return new InMemoryJobQueue();
}

/**
 * Get the global job queue instance
 *
 * Creates the queue on first call based on environment:
 * - Production (GCP_PROJECT_ID set): Pub/Sub
 * - Development: In-memory
 */
export function getJobQueue(): JobQueue {
  if (queueInstance) {
    return queueInstance;
  }

  const projectId = process.env.GCP_PROJECT_ID || process.env.PROJECT_ID || '';
  const topicId = process.env.PUBSUB_TOPIC || process.env.GWI_WORKER_TOPIC || 'gwi-worker-jobs';

  queueInstance = createJobQueue({
    projectId,
    topicId,
    enableOrdering: process.env.PUBSUB_ENABLE_ORDERING === 'true',
  });

  return queueInstance;
}

/**
 * Reset the queue instance (for testing)
 */
export function resetJobQueue(): void {
  if (queueInstance) {
    queueInstance.close().catch(() => {});
  }
  queueInstance = null;
}

/**
 * Set a custom queue instance (for testing)
 */
export function setJobQueue(queue: JobQueue): void {
  queueInstance = queue;
}

/**
 * Get the in-memory queue for testing
 */
export function getInMemoryQueue(): InMemoryJobQueue | null {
  if (queueInstance instanceof InMemoryJobQueue) {
    return queueInstance;
  }
  return null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job-${timestamp}-${random}`;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Publish a job to the default queue
 */
export async function enqueueJob(job: QueueJob): Promise<QueuePublishResult> {
  const queue = getJobQueue();
  return queue.publish(job);
}

/**
 * Publish multiple jobs to the default queue
 */
export async function enqueueJobs(jobs: QueueJob[]): Promise<QueuePublishResult[]> {
  const queue = getJobQueue();
  return queue.publishBatch(jobs);
}

/**
 * Create a workflow execution job
 */
export function createWorkflowJob(
  tenantId: string,
  runId: string,
  workflowType: string,
  payload: Record<string, unknown>,
  options?: { priority?: number; deadline?: number }
): QueueJob {
  return {
    type: 'workflow:execute',
    tenantId,
    runId,
    payload: {
      workflowType,
      ...payload,
    },
    metadata: {
      maxRetries: 3,
      priority: options?.priority ?? 5,
      deadline: options?.deadline,
    },
  };
}

/**
 * Create a signal processing job
 */
export function createSignalJob(
  tenantId: string,
  signalId: string,
  signalType: string,
  payload: Record<string, unknown>
): QueueJob {
  return {
    type: 'signal:process',
    tenantId,
    payload: {
      signalId,
      signalType,
      ...payload,
    },
    metadata: {
      maxRetries: 2,
      priority: 7, // Higher priority for signals
    },
  };
}

/**
 * Create a PR candidate generation job
 */
export function createCandidateJob(
  tenantId: string,
  runId: string,
  workItemId: string,
  payload: Record<string, unknown>
): QueueJob {
  return {
    type: 'candidate:generate',
    tenantId,
    runId,
    payload: {
      workItemId,
      ...payload,
    },
    metadata: {
      maxRetries: 2,
      priority: 5,
    },
  };
}

// Export types for external use
export { InMemoryJobQueue };

// Phase 34: Export durable job store
export {
  FirestoreJobStore,
  getFirestoreJobStore,
  resetFirestoreJobStore,
  createDurableJob,
  DEFAULT_HEARTBEAT_INTERVAL,
  type DurableJob,
  type JobStatus,
  type JobClaimOptions,
  type JobCompletionOptions,
} from './firestore-job-store.js';

// Epic A5: Export job envelope schemas and helpers
export {
  // Schemas
  JobEnvelope,
  JobPriority,
  JobType,
  PreviousAttempt,
  TypedJobEnvelope,
  RunStartJob,
  RunResumeJob,
  StepExecuteJob,
  StepRetryJob,
  CleanupRunJob,
  NotificationSendJob,
  RunStartPayload,
  RunResumePayload,
  StepExecutePayload,
  StepRetryPayload,
  CleanupRunPayload,
  NotificationSendPayload,
  // Helper functions
  createJobEnvelope,
  parseJobEnvelope,
  validateJobEnvelope,
  parseTypedJobEnvelope,
  validateTypedJobEnvelope,
  createPreviousAttempt,
  addRetryAttempt,
  isRetryExceeded,
  isDeadlineExpired,
  shouldDelay,
  getRemainingDelay,
} from './job-envelope.js';
