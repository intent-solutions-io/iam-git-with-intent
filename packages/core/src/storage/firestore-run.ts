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
} from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
} from './firestore-client.js';

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

function runDocToModel(doc: RunDoc, steps: RunStep[]): Run {
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

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    await this.runDoc(runId).update({
      status,
      updatedAt: Timestamp.now(),
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

  async completeRun(runId: string, result: RunResult): Promise<void> {
    const snapshot = await this.runDoc(runId).get();
    if (!snapshot.exists) return;

    const runDoc = snapshot.data() as RunDoc;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - timestampToDate(runDoc.createdAt)!.getTime();

    await this.runDoc(runId).update({
      status: 'completed',
      result,
      completedAt: Timestamp.fromDate(completedAt),
      durationMs,
      updatedAt: Timestamp.now(),
    });
  }

  async failRun(runId: string, error: string): Promise<void> {
    const snapshot = await this.runDoc(runId).get();
    if (!snapshot.exists) return;

    const runDoc = snapshot.data() as RunDoc;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - timestampToDate(runDoc.createdAt)!.getTime();

    await this.runDoc(runId).update({
      status: 'failed',
      error,
      completedAt: Timestamp.fromDate(completedAt),
      durationMs,
      updatedAt: Timestamp.now(),
    });
  }

  async cancelRun(runId: string): Promise<void> {
    const snapshot = await this.runDoc(runId).get();
    if (!snapshot.exists) return;

    const runDoc = snapshot.data() as RunDoc;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - timestampToDate(runDoc.createdAt)!.getTime();

    await this.runDoc(runId).update({
      status: 'cancelled',
      completedAt: Timestamp.fromDate(completedAt),
      durationMs,
      updatedAt: Timestamp.now(),
    });
  }
}
