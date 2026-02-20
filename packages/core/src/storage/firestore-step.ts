/**
 * Firestore Step Store — Scale & Ops Maturity (gwi-o06)
 *
 * Implements StepStore against gwi_runs/{runId}/steps/{stepId} subcollection.
 *
 * Agent-first: Agents can query individual steps without loading the full
 * run document. Supports pagination via Firestore cursors.
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  RunStep,
  StepStatus,
  StepStore,
  PaginatedResult,
} from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
} from './firestore-client.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

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
// Converters
// =============================================================================

function stepDocToStep(doc: StepDoc): RunStep {
  return {
    id: doc.id,
    runId: doc.runId,
    agent: doc.agent,
    status: doc.status as StepStatus,
    input: doc.input,
    output: doc.output,
    error: doc.error,
    startedAt: doc.startedAt ? timestampToDate(doc.startedAt) : undefined,
    completedAt: doc.completedAt ? timestampToDate(doc.completedAt) : undefined,
    durationMs: doc.durationMs,
    tokensUsed: doc.tokensUsed,
  };
}

function stepToDoc(step: RunStep): StepDoc {
  return {
    id: step.id,
    runId: step.runId,
    agent: step.agent,
    status: step.status,
    input: step.input,
    output: step.output,
    error: step.error,
    startedAt: step.startedAt ? dateToTimestamp(step.startedAt) : undefined,
    completedAt: step.completedAt ? dateToTimestamp(step.completedAt) : undefined,
    durationMs: step.durationMs,
    tokensUsed: step.tokensUsed,
  };
}

// =============================================================================
// Implementation
// =============================================================================

export class FirestoreStepStore implements StepStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  private stepsCollection(runId: string) {
    return this.db
      .collection(COLLECTIONS.RUNS)
      .doc(runId)
      .collection(COLLECTIONS.STEPS);
  }

  async addStep(runId: string, step: RunStep): Promise<void> {
    const doc = stepToDoc(step);
    await this.stepsCollection(runId).doc(step.id).set(doc);
  }

  async getStep(runId: string, stepId: string): Promise<RunStep | null> {
    const snapshot = await this.stepsCollection(runId).doc(stepId).get();
    if (!snapshot.exists) return null;
    return stepDocToStep(snapshot.data() as StepDoc);
  }

  async listSteps(
    runId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<PaginatedResult<RunStep>> {
    const limit = opts?.limit ?? 100;
    let query = this.stepsCollection(runId).orderBy('startedAt').limit(limit + 1);

    if (opts?.cursor) {
      const cursorDoc = await this.stepsCollection(runId).doc(opts.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.map(d => stepDocToStep(d.data() as StepDoc));

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;

    return {
      items,
      cursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
    };
  }

  async updateStepStatus(
    runId: string,
    stepId: string,
    status: StepStatus,
    update?: Partial<Pick<RunStep, 'output' | 'error' | 'completedAt' | 'durationMs' | 'tokensUsed'>>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = { status };

    if (update?.output !== undefined) updateData.output = update.output;
    if (update?.error !== undefined) updateData.error = update.error;
    if (update?.completedAt) updateData.completedAt = dateToTimestamp(update.completedAt);
    if (update?.durationMs !== undefined) updateData.durationMs = update.durationMs;
    if (update?.tokensUsed) updateData.tokensUsed = update.tokensUsed;

    await this.stepsCollection(runId).doc(stepId).update(updateData);
  }
}
