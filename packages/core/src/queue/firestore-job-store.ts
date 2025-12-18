/**
 * Firestore Durable Job Store
 *
 * Phase 34: Durable job state tracking for crash recovery.
 *
 * Features:
 * - Job lifecycle tracking: pending → claimed → running → completed/failed
 * - Heartbeat-based liveness detection
 * - Job recovery after worker crashes
 * - Timeout and dead-letter handling
 *
 * @module @gwi/core/queue/firestore-job-store
 */

import { getFirestoreClient } from '../storage/firestore-client.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getLogger } from '../reliability/observability.js';
import type { QueueJob } from './index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Job lifecycle status
 */
export type JobStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'dead_letter';

/**
 * Durable job record in Firestore
 */
export interface DurableJob {
  /** Job ID */
  id: string;
  /** Job type */
  type: string;
  /** Tenant ID */
  tenantId: string;
  /** Associated run ID */
  runId?: string;
  /** Job payload */
  payload: Record<string, unknown>;
  /** Current status */
  status: JobStatus;
  /** Claimed by worker ID */
  claimedBy?: string;
  /** Number of attempts */
  attempts: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** Priority (higher = more important) */
  priority: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Claimed at timestamp */
  claimedAt?: Date;
  /** Started running timestamp */
  startedAt?: Date;
  /** Completed/failed timestamp */
  completedAt?: Date;
  /** Last heartbeat timestamp */
  lastHeartbeat?: Date;
  /** Error message if failed */
  error?: string;
  /** Result data if completed */
  result?: Record<string, unknown>;
  /** Pub/Sub message ID for correlation */
  messageId?: string;
}

/**
 * Firestore document schema
 */
interface FirestoreJobDoc {
  id: string;
  type: string;
  tenantId: string;
  runId?: string;
  payload: string; // JSON serialized
  status: JobStatus;
  claimedBy?: string;
  attempts: number;
  maxRetries: number;
  priority: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  claimedAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  lastHeartbeat?: Timestamp;
  error?: string;
  result?: string; // JSON serialized
  messageId?: string;
}

/**
 * Job claim options
 */
export interface JobClaimOptions {
  /** Worker ID claiming the job */
  workerId: string;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs?: number;
}

/**
 * Job completion options
 */
export interface JobCompletionOptions {
  /** Result data */
  result?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const COLLECTION_NAME = 'gwi_jobs';
/** Default heartbeat interval for workers */
export const DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30 seconds
const STALE_JOB_TIMEOUT = 120000; // 2 minutes without heartbeat = stale
const MAX_PAYLOAD_SIZE = 512 * 1024; // 512KB

// =============================================================================
// Firestore Job Store
// =============================================================================

/**
 * Firestore-backed durable job store
 */
export class FirestoreJobStore {
  private logger = getLogger('firestore-job-store');

  /**
   * Create a new job record from a queue job
   */
  async createJob(queueJob: QueueJob, messageId?: string): Promise<DurableJob> {
    const db = getFirestoreClient();
    const jobId = queueJob.id || this.generateJobId();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    const now = Timestamp.now();

    const doc: FirestoreJobDoc = {
      id: jobId,
      type: queueJob.type,
      tenantId: queueJob.tenantId,
      runId: queueJob.runId,
      payload: this.serializePayload(queueJob.payload),
      status: 'pending',
      attempts: 0,
      maxRetries: queueJob.metadata?.maxRetries ?? 3,
      priority: queueJob.metadata?.priority ?? 5,
      createdAt: now,
      updatedAt: now,
      messageId,
    };

    await docRef.set(doc);

    this.logger.info('Job created', {
      jobId,
      type: queueJob.type,
      tenantId: queueJob.tenantId,
      messageId,
    });

    return this.toJob(doc);
  }

  /**
   * Claim a job for processing
   */
  async claimJob(jobId: string, options: JobClaimOptions): Promise<DurableJob | null> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return null;
        }

        const data = doc.data() as FirestoreJobDoc;

        // Can only claim pending jobs or stale claimed jobs
        if (data.status === 'pending') {
          // Claim the job
        } else if (data.status === 'claimed' || data.status === 'running') {
          // Check if stale (no heartbeat for timeout period)
          const lastHeartbeat = data.lastHeartbeat?.toMillis() ?? data.claimedAt?.toMillis() ?? 0;
          const isStale = Date.now() - lastHeartbeat > STALE_JOB_TIMEOUT;

          if (!isStale) {
            // Job is actively being processed by another worker
            return null;
          }

          // Job is stale, can be reclaimed
          this.logger.warn('Reclaiming stale job', {
            jobId,
            previousWorker: data.claimedBy,
            newWorker: options.workerId,
          });
        } else {
          // Job is in terminal state
          return null;
        }

        const now = Timestamp.now();
        const updates: Partial<FirestoreJobDoc> = {
          status: 'claimed',
          claimedBy: options.workerId,
          claimedAt: now,
          lastHeartbeat: now,
          updatedAt: now,
          attempts: data.attempts + 1,
        };

        transaction.update(docRef, updates);

        return { ...data, ...updates };
      });

      if (!result) {
        return null;
      }

      this.logger.info('Job claimed', {
        jobId,
        workerId: options.workerId,
        attempts: result.attempts,
      });

      return this.toJob(result);
    } catch (error) {
      this.logger.error('Failed to claim job', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Mark job as running
   */
  async startJob(jobId: string, workerId: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return false;
        }

        const data = doc.data() as FirestoreJobDoc;

        if (data.status !== 'claimed' || data.claimedBy !== workerId) {
          return false;
        }

        const now = Timestamp.now();
        transaction.update(docRef, {
          status: 'running',
          startedAt: now,
          lastHeartbeat: now,
          updatedAt: now,
        });

        return true;
      });

      if (result) {
        this.logger.info('Job started', { jobId, workerId });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to start job', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Update job heartbeat
   */
  async heartbeat(jobId: string, workerId: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return false;
        }

        const data = doc.data() as FirestoreJobDoc;

        if (data.claimedBy !== workerId) {
          return false;
        }

        if (data.status !== 'claimed' && data.status !== 'running') {
          return false;
        }

        transaction.update(docRef, {
          lastHeartbeat: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        return true;
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to update heartbeat', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Complete a job successfully
   */
  async completeJob(jobId: string, workerId: string, options?: JobCompletionOptions): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return false;
        }

        const data = doc.data() as FirestoreJobDoc;

        if (data.claimedBy !== workerId) {
          return false;
        }

        const now = Timestamp.now();
        const updates: Partial<FirestoreJobDoc> = {
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        };

        if (options?.result) {
          updates.result = JSON.stringify(options.result);
        }

        transaction.update(docRef, updates);

        return true;
      });

      if (result) {
        this.logger.info('Job completed', { jobId, workerId });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to complete job', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Fail a job
   */
  async failJob(jobId: string, workerId: string, error: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return false;
        }

        const data = doc.data() as FirestoreJobDoc;

        if (data.claimedBy !== workerId) {
          return false;
        }

        const shouldRetry = data.attempts < data.maxRetries;
        const now = Timestamp.now();

        const updates: Partial<FirestoreJobDoc> = {
          status: shouldRetry ? 'pending' : 'failed',
          completedAt: shouldRetry ? undefined : now,
          updatedAt: now,
          error,
          claimedBy: undefined,
          claimedAt: undefined,
          lastHeartbeat: undefined,
        };

        // Use FieldValue.delete() for optional fields
        transaction.update(docRef, {
          ...updates,
          claimedBy: FieldValue.delete(),
          claimedAt: FieldValue.delete(),
          lastHeartbeat: FieldValue.delete(),
        });

        return { shouldRetry, attempts: data.attempts };
      });

      if (result) {
        this.logger.info('Job failed', {
          jobId,
          workerId,
          error,
          willRetry: result.shouldRetry,
          attempts: result.attempts,
        });
      }

      return !!result;
    } catch (err) {
      this.logger.error('Failed to fail job', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Move job to dead letter queue
   */
  async deadLetterJob(jobId: string, reason: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    try {
      await docRef.update({
        status: 'dead_letter',
        error: reason,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      this.logger.warn('Job moved to dead letter', { jobId, reason });
      return true;
    } catch (error) {
      this.logger.error('Failed to dead letter job', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<DurableJob | null> {
    const db = getFirestoreClient();
    const docRef = db.collection(COLLECTION_NAME).doc(jobId);

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }

    return this.toJob(doc.data() as FirestoreJobDoc);
  }

  /**
   * Get job by message ID
   */
  async getJobByMessageId(messageId: string): Promise<DurableJob | null> {
    const db = getFirestoreClient();

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('messageId', '==', messageId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return this.toJob(snapshot.docs[0].data() as FirestoreJobDoc);
  }

  /**
   * List pending jobs for a tenant
   */
  async listPendingJobs(tenantId: string, limit: number = 100): Promise<DurableJob[]> {
    const db = getFirestoreClient();

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'pending')
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => this.toJob(doc.data() as FirestoreJobDoc));
  }

  /**
   * List stale jobs (claimed/running but no heartbeat)
   */
  async listStaleJobs(limit: number = 100): Promise<DurableJob[]> {
    const db = getFirestoreClient();
    const staleTime = Timestamp.fromMillis(Date.now() - STALE_JOB_TIMEOUT);

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('status', 'in', ['claimed', 'running'])
      .where('lastHeartbeat', '<', staleTime)
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => this.toJob(doc.data() as FirestoreJobDoc));
  }

  /**
   * List jobs by run ID
   */
  async listJobsByRun(runId: string): Promise<DurableJob[]> {
    const db = getFirestoreClient();

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('runId', '==', runId)
      .orderBy('createdAt', 'asc')
      .get();

    return snapshot.docs.map((doc) => this.toJob(doc.data() as FirestoreJobDoc));
  }

  /**
   * Cleanup old completed/failed jobs
   */
  async cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
    const db = getFirestoreClient();
    const cutoff = Timestamp.fromMillis(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('status', 'in', ['completed', 'failed', 'dead_letter'])
      .where('completedAt', '<', cutoff)
      .limit(500)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    this.logger.info('Cleaned up old jobs', { count: snapshot.size });
    return snapshot.size;
  }

  /**
   * Get job statistics for a tenant
   */
  async getJobStats(tenantId: string): Promise<Record<JobStatus, number>> {
    const db = getFirestoreClient();

    const stats: Record<JobStatus, number> = {
      pending: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
      dead_letter: 0,
    };

    const statuses: JobStatus[] = ['pending', 'claimed', 'running', 'completed', 'failed', 'dead_letter'];

    await Promise.all(
      statuses.map(async (status) => {
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where('tenantId', '==', tenantId)
          .where('status', '==', status)
          .count()
          .get();

        stats[status] = snapshot.data().count;
      })
    );

    return stats;
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private generateJobId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `job-${timestamp}-${random}`;
  }

  private serializePayload(payload: Record<string, unknown>): string {
    const serialized = JSON.stringify(payload);

    if (serialized.length > MAX_PAYLOAD_SIZE) {
      this.logger.warn('Job payload truncated', {
        originalSize: serialized.length,
        maxSize: MAX_PAYLOAD_SIZE,
      });

      // Store truncation marker
      return JSON.stringify({
        _truncated: true,
        _originalSize: serialized.length,
      });
    }

    return serialized;
  }

  private toJob(doc: FirestoreJobDoc): DurableJob {
    let payload: Record<string, unknown> = {};
    let result: Record<string, unknown> | undefined;

    try {
      payload = JSON.parse(doc.payload);
    } catch {
      // Failed to parse payload
    }

    if (doc.result) {
      try {
        result = JSON.parse(doc.result);
      } catch {
        // Failed to parse result
      }
    }

    return {
      id: doc.id,
      type: doc.type,
      tenantId: doc.tenantId,
      runId: doc.runId,
      payload,
      status: doc.status,
      claimedBy: doc.claimedBy,
      attempts: doc.attempts,
      maxRetries: doc.maxRetries,
      priority: doc.priority,
      createdAt: doc.createdAt.toDate(),
      updatedAt: doc.updatedAt.toDate(),
      claimedAt: doc.claimedAt?.toDate(),
      startedAt: doc.startedAt?.toDate(),
      completedAt: doc.completedAt?.toDate(),
      lastHeartbeat: doc.lastHeartbeat?.toDate(),
      error: doc.error,
      result,
      messageId: doc.messageId,
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let jobStoreInstance: FirestoreJobStore | null = null;

/**
 * Get the Firestore job store singleton
 */
export function getFirestoreJobStore(): FirestoreJobStore {
  if (!jobStoreInstance) {
    jobStoreInstance = new FirestoreJobStore();
  }
  return jobStoreInstance;
}

/**
 * Reset the job store (for testing)
 */
export function resetFirestoreJobStore(): void {
  jobStoreInstance = null;
}

/**
 * Create a durable job from a queue job
 *
 * Use this when publishing to Pub/Sub to also track in Firestore
 */
export async function createDurableJob(queueJob: QueueJob, messageId?: string): Promise<DurableJob> {
  const store = getFirestoreJobStore();
  return store.createJob(queueJob, messageId);
}

/**
 * Collection constant for indices documentation
 *
 * Collection: gwi_jobs
 * Fields: id, type, tenantId, runId, payload, status, claimedBy, attempts,
 *         maxRetries, priority, createdAt, updatedAt, claimedAt, startedAt,
 *         completedAt, lastHeartbeat, error, result, messageId
 *
 * Indices:
 *   - tenantId ASC, status ASC, priority DESC, createdAt ASC (listPendingJobs)
 *   - status ASC, lastHeartbeat ASC (listStaleJobs)
 *   - runId ASC, createdAt ASC (listJobsByRun)
 *   - status ASC, completedAt ASC (cleanup)
 *   - messageId ASC (getJobByMessageId)
 *   - tenantId ASC, status ASC (getJobStats)
 */
