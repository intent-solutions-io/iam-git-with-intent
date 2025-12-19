/**
 * Firestore Run Store Implementation
 *
 * Production-ready RunStore backed by Google Firestore.
 * This is the simpler, PR-centric RunStore (not tenant-scoped).
 *
 * For multi-tenant SaaS runs, use FirestoreTenantStore.createRun() instead.
 *
 * Collection Structure:
 * - gwi_runs/{runId}
 *   - steps/{stepId}  (subcollection)
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  Run,
  RunStep,
  RunType,
  RunStatus,
  RunResult,
  RunStore,
  RunCancellation,
  CompensationLogEntry,
} from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
} from './firestore-client.js';
import { validateRunStatusTransition } from './run-status-machine.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface RunDoc {
  id: string;
  prId: string;
  prUrl: string;
  type: string;
  status: string;
  currentStep?: string;
  result?: unknown;
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
  /** Version field for optimistic locking (A2.s3) */
  version: number;
  /** Schema version for migrations (A1.s4) */
  schemaVersion: number;
  /** A2.s4: Cancellation details */
  cancellation?: {
    initiator: string;
    reason: string;
    userId?: string;
    requestedAt: Timestamp;
    completedAt?: Timestamp;
    interruptedStep?: string;
    context?: Record<string, unknown>;
  };
  /** A2.s4: Compensation log */
  compensationLog?: Array<{
    actionId: string;
    description: string;
    success: boolean;
    error?: string;
    durationMs: number;
    executedAt: Timestamp;
  }>;
}

/**
 * Error thrown when optimistic locking fails due to concurrent modification
 */
export class OptimisticLockError extends Error {
  constructor(
    public readonly runId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Optimistic lock failed for run ${runId}: ` +
      `expected version ${expectedVersion}, but found ${actualVersion}`
    );
    this.name = 'OptimisticLockError';
  }
}

interface StepDoc {
  id: string;
  runId: string;
  agent: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
  tokensUsed?: { input: number; output: number };
}

// =============================================================================
// Conversion Functions
// =============================================================================

function runDocToModel(doc: RunDoc, steps: RunStep[]): Run & { version?: number } {
  // Convert cancellation timestamps if present
  const cancellation: RunCancellation | undefined = doc.cancellation ? {
    initiator: doc.cancellation.initiator as RunCancellation['initiator'],
    reason: doc.cancellation.reason,
    userId: doc.cancellation.userId,
    requestedAt: timestampToDate(doc.cancellation.requestedAt)!,
    completedAt: timestampToDate(doc.cancellation.completedAt),
    interruptedStep: doc.cancellation.interruptedStep,
    context: doc.cancellation.context,
  } : undefined;

  // Convert compensation log timestamps if present
  const compensationLog: CompensationLogEntry[] | undefined = doc.compensationLog?.map(entry => ({
    actionId: entry.actionId,
    description: entry.description,
    success: entry.success,
    error: entry.error,
    durationMs: entry.durationMs,
    executedAt: timestampToDate(entry.executedAt)!,
  }));

  return {
    id: doc.id,
    prId: doc.prId,
    prUrl: doc.prUrl,
    type: doc.type as RunType,
    status: doc.status as RunStatus,
    currentStep: doc.currentStep,
    steps,
    result: doc.result,
    error: doc.error,
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
    completedAt: timestampToDate(doc.completedAt),
    durationMs: doc.durationMs,
    schemaVersion: doc.schemaVersion,
    // A2.s4: Include cancellation details
    cancellation,
    compensationLog,
    // Include version for optimistic locking
    version: doc.version,
  };
}

function stepDocToModel(doc: StepDoc): RunStep {
  return {
    id: doc.id,
    runId: doc.runId,
    agent: doc.agent,
    status: doc.status as RunStep['status'],
    input: doc.input,
    output: doc.output,
    error: doc.error,
    startedAt: timestampToDate(doc.startedAt),
    completedAt: timestampToDate(doc.completedAt),
    durationMs: doc.durationMs,
    tokensUsed: doc.tokensUsed,
  };
}

// =============================================================================
// Firestore Run Store Implementation
// =============================================================================

/**
 * Firestore-backed RunStore implementation
 *
 * Provides production-ready run tracking with:
 * - Run lifecycle management
 * - Step tracking as subcollections
 * - Efficient queries by PR and status
 */
export class FirestoreRunStore implements RunStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private runsRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.RUNS);
  }

  private runDoc(runId: string): DocumentReference {
    return this.runsRef().doc(runId);
  }

  private stepsRef(runId: string): CollectionReference {
    return this.runDoc(runId).collection(COLLECTIONS.STEPS);
  }

  private stepDoc(runId: string, stepId: string): DocumentReference {
    return this.stepsRef(runId).doc(stepId);
  }

  // ---------------------------------------------------------------------------
  // Run Operations
  // ---------------------------------------------------------------------------

  async createRun(prId: string, prUrl: string, type: RunType): Promise<Run> {
    const now = new Date();
    const runId = generateFirestoreId('run');

    const runDoc: RunDoc = {
      id: runId,
      prId,
      prUrl,
      type,
      status: 'pending',
      createdAt: dateToTimestamp(now)!,
      updatedAt: dateToTimestamp(now)!,
      // A2.s3: Initialize version for optimistic locking
      version: 1,
      // A1.s4: Schema version for migrations
      schemaVersion: 1,
    };

    await this.runDoc(runId).set(runDoc);

    return runDocToModel(runDoc, []);
  }

  async getRun(runId: string): Promise<Run | null> {
    const snapshot = await this.runDoc(runId).get();

    if (!snapshot.exists) {
      return null;
    }

    const runDoc = snapshot.data() as RunDoc;
    const steps = await this.getSteps(runId);

    return runDocToModel(runDoc, steps);
  }

  async getLatestRun(prId: string): Promise<Run | null> {
    const snapshot = await this.runsRef()
      .where('prId', '==', prId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const runDoc = doc.data() as RunDoc;
    const steps = await this.getSteps(runDoc.id);

    return runDocToModel(runDoc, steps);
  }

  async listRuns(prId: string, limit = 20): Promise<Run[]> {
    const snapshot = await this.runsRef()
      .where('prId', '==', prId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const runs: Run[] = [];
    for (const doc of snapshot.docs) {
      const runDoc = doc.data() as RunDoc;
      const steps = await this.getSteps(runDoc.id);
      runs.push(runDocToModel(runDoc, steps));
    }

    return runs;
  }

  /**
   * Update run status with atomic transaction and optimistic locking (A2.s3)
   *
   * Uses Firestore transaction to:
   * 1. Validate state transition
   * 2. Check version for optimistic locking
   * 3. Atomically update status and increment version
   *
   * @throws {Error} if run not found
   * @throws {InvalidRunStatusTransitionError} if transition is invalid
   * @throws {OptimisticLockError} if concurrent modification detected
   */
  async updateRunStatus(runId: string, status: RunStatus, expectedVersion?: number): Promise<void> {
    const runRef = this.runDoc(runId);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(runRef);

      if (!snapshot.exists) {
        throw new Error(`Run not found: ${runId}`);
      }

      const runDoc = snapshot.data() as RunDoc;
      const currentStatus = runDoc.status as RunStatus;
      const currentVersion = runDoc.version ?? 1;

      // Validate state transition (throws InvalidRunStatusTransitionError if invalid)
      validateRunStatusTransition(currentStatus, status, runId);

      // Optimistic locking: check version if provided
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new OptimisticLockError(runId, expectedVersion, currentVersion);
      }

      // Atomic update with version increment
      transaction.update(runRef, {
        status,
        version: currentVersion + 1,
        updatedAt: Timestamp.now(),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Step Operations
  // ---------------------------------------------------------------------------

  async addStep(runId: string, agent: string): Promise<RunStep> {
    const stepId = generateFirestoreId('step');

    const stepDoc: StepDoc = {
      id: stepId,
      runId,
      agent,
      status: 'pending',
    };

    await this.stepDoc(runId, stepId).set(stepDoc);

    // Update current step on run
    await this.runDoc(runId).update({
      currentStep: stepId,
      updatedAt: Timestamp.now(),
    });

    return stepDocToModel(stepDoc);
  }

  async updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void> {
    const updateDoc: Record<string, unknown> = {};

    if (update.status !== undefined) updateDoc.status = update.status;
    if (update.input !== undefined) updateDoc.input = update.input;
    if (update.output !== undefined) updateDoc.output = update.output;
    if (update.error !== undefined) updateDoc.error = update.error;
    if (update.startedAt !== undefined) updateDoc.startedAt = dateToTimestamp(update.startedAt);
    if (update.completedAt !== undefined) updateDoc.completedAt = dateToTimestamp(update.completedAt);
    if (update.durationMs !== undefined) updateDoc.durationMs = update.durationMs;
    if (update.tokensUsed !== undefined) updateDoc.tokensUsed = update.tokensUsed;

    await this.stepDoc(runId, stepId).update(updateDoc);

    // Update run's updatedAt
    await this.runDoc(runId).update({
      updatedAt: Timestamp.now(),
    });
  }

  async getSteps(runId: string): Promise<RunStep[]> {
    const snapshot = await this.stepsRef(runId)
      .orderBy('startedAt', 'asc')
      .get();

    return snapshot.docs.map(doc => stepDocToModel(doc.data() as StepDoc));
  }

  // ---------------------------------------------------------------------------
  // Run Completion
  // ---------------------------------------------------------------------------

  /**
   * Complete a run with atomic transaction (A2.s3)
   */
  async completeRun(runId: string, result: RunResult): Promise<void> {
    const runRef = this.runDoc(runId);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(runRef);
      if (!snapshot.exists) return;

      const runDoc = snapshot.data() as RunDoc;
      const currentVersion = runDoc.version ?? 1;
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - timestampToDate(runDoc.createdAt)!.getTime();

      // Validate transition
      validateRunStatusTransition(runDoc.status as RunStatus, 'completed', runId);

      transaction.update(runRef, {
        status: 'completed',
        result,
        completedAt: Timestamp.fromDate(completedAt),
        durationMs,
        version: currentVersion + 1,
        updatedAt: Timestamp.now(),
      });
    });
  }

  /**
   * Fail a run with atomic transaction (A2.s3)
   */
  async failRun(runId: string, error: string): Promise<void> {
    const runRef = this.runDoc(runId);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(runRef);
      if (!snapshot.exists) return;

      const runDoc = snapshot.data() as RunDoc;
      const currentVersion = runDoc.version ?? 1;
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - timestampToDate(runDoc.createdAt)!.getTime();

      // Validate transition
      validateRunStatusTransition(runDoc.status as RunStatus, 'failed', runId);

      transaction.update(runRef, {
        status: 'failed',
        error,
        completedAt: Timestamp.fromDate(completedAt),
        durationMs,
        version: currentVersion + 1,
        updatedAt: Timestamp.now(),
      });
    });
  }

  /**
   * Cancel a run with atomic transaction (A2.s3, A2.s4)
   *
   * @param runId - Run to cancel
   * @param cancellation - Optional cancellation details for audit trail
   * @param compensationLog - Optional log of compensation actions executed
   */
  async cancelRun(
    runId: string,
    cancellation?: Omit<RunCancellation, 'completedAt'>,
    compensationLog?: CompensationLogEntry[]
  ): Promise<void> {
    const runRef = this.runDoc(runId);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(runRef);
      if (!snapshot.exists) return;

      const runDoc = snapshot.data() as RunDoc;
      const currentVersion = runDoc.version ?? 1;
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - timestampToDate(runDoc.createdAt)!.getTime();

      // Validate transition
      validateRunStatusTransition(runDoc.status as RunStatus, 'cancelled', runId);

      // Build update object
      const updateData: Record<string, unknown> = {
        status: 'cancelled',
        completedAt: Timestamp.fromDate(completedAt),
        durationMs,
        version: currentVersion + 1,
        updatedAt: Timestamp.now(),
      };

      // A2.s4: Add cancellation details if provided
      if (cancellation) {
        updateData.cancellation = {
          initiator: cancellation.initiator,
          reason: cancellation.reason,
          userId: cancellation.userId,
          requestedAt: dateToTimestamp(cancellation.requestedAt)!,
          completedAt: Timestamp.fromDate(completedAt),
          interruptedStep: cancellation.interruptedStep ?? runDoc.currentStep,
          context: cancellation.context,
        };
      }

      // A2.s4: Add compensation log if provided
      if (compensationLog && compensationLog.length > 0) {
        updateData.compensationLog = compensationLog.map(entry => ({
          actionId: entry.actionId,
          description: entry.description,
          success: entry.success,
          error: entry.error,
          durationMs: entry.durationMs,
          executedAt: dateToTimestamp(entry.executedAt)!,
        }));
      }

      transaction.update(runRef, updateData);
    });
  }
}
