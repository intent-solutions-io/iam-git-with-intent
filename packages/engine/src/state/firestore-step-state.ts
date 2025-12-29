/**
 * Firestore Step State Store
 *
 * C2: Firestore implementation of StepStateStore for production use.
 * Provides persistent step state for Cloud Run resilience.
 *
 * @module @gwi/engine/state/firestore-step-state
 */

import { randomUUID } from 'crypto';
import type { StepStateStore } from './step-state-store.js';
import type {
  StepState,
  StepStateCreate,
  StepStateUpdate,
  StepStateFilter,
  StepStateSort,
  StepStatePagination,
} from './types.js';

// =============================================================================
// Firestore Types (avoid direct dependency for portability)
// =============================================================================

/**
 * Minimal Firestore interface for dependency injection
 */
export interface FirestoreClient {
  collection(path: string): CollectionRef;
}

interface CollectionRef {
  doc(id?: string): DocumentRef;
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  offset(n: number): Query;
  get(): Promise<QuerySnapshot>;
}

interface DocumentRef {
  id: string;
  get(): Promise<DocumentSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  offset(n: number): Query;
  get(): Promise<QuerySnapshot>;
}

interface QuerySnapshot {
  empty: boolean;
  size: number;
  docs: DocumentSnapshot[];
}

interface DocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

// =============================================================================
// Firestore Store Implementation
// =============================================================================

/**
 * Firestore implementation of StepStateStore
 *
 * Features:
 * - Persistent storage across Cloud Run restarts
 * - Multi-tenant isolation via collection structure
 * - Optimized queries with composite indexes
 *
 * Collection structure:
 * ```
 * stepStates/{stateId}
 *   ├── runId (indexed)
 *   ├── stepId
 *   ├── tenantId (indexed)
 *   ├── status (indexed)
 *   └── ... other fields
 * ```
 *
 * @example
 * ```typescript
 * import { Firestore } from '@google-cloud/firestore';
 *
 * const firestore = new Firestore({ projectId: 'my-project' });
 * const store = new FirestoreStepStateStore(firestore, {
 *   collection: 'stepStates',
 * });
 * ```
 */
export class FirestoreStepStateStore implements StepStateStore {
  private readonly collection: string;

  constructor(
    private readonly db: FirestoreClient,
    options: { collection?: string } = {}
  ) {
    this.collection = options.collection || 'stepStates';
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  async create(data: StepStateCreate): Promise<StepState> {
    const now = new Date().toISOString();
    const id = randomUUID();

    const state: StepState = {
      id,
      runId: data.runId,
      workflowInstanceId: data.workflowInstanceId,
      stepId: data.stepId,
      stepType: data.stepType,
      tenantId: data.tenantId,
      status: data.status || 'pending',
      resultCode: data.resultCode,
      input: data.input,
      output: data.output,
      error: data.error,
      errorStack: data.errorStack,
      retry: data.retry,
      approval: data.approval,
      externalWait: data.externalWait,
      createdAt: now,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      updatedAt: now,
      durationMs: data.durationMs,
      tokenUsage: data.tokenUsage,
      model: data.model,
      correlationId: data.correlationId,
      metadata: data.metadata,
    };

    await this.db.collection(this.collection).doc(id).set(this.toFirestore(state));
    return state;
  }

  async get(id: string): Promise<StepState | null> {
    const doc = await this.db.collection(this.collection).doc(id).get();
    if (!doc.exists) return null;
    return this.fromFirestore(doc.id, doc.data()!);
  }

  async getByRunAndStep(runId: string, stepId: string): Promise<StepState | null> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('runId', '==', runId)
      .where('stepId', '==', stepId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return this.fromFirestore(doc.id, doc.data()!);
  }

  async update(id: string, data: StepStateUpdate): Promise<StepState> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Step state not found: ${id}`);
    }

    const updated: StepState = {
      ...existing,
      ...data,
      id: existing.id,
      runId: existing.runId,
      stepId: existing.stepId,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.db.collection(this.collection).doc(id).update(this.toFirestore(updated));
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;

    await this.db.collection(this.collection).doc(id).delete();
    return true;
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  async createMany(data: StepStateCreate[]): Promise<StepState[]> {
    // For simplicity, create one at a time
    // In production, use batched writes
    const results: StepState[] = [];
    for (const item of data) {
      results.push(await this.create(item));
    }
    return results;
  }

  async getByRun(runId: string): Promise<StepState[]> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('runId', '==', runId)
      .get();

    return snapshot.docs.map(doc => this.fromFirestore(doc.id, doc.data()!));
  }

  async getByRunAsMap(runId: string): Promise<Map<string, StepState>> {
    const states = await this.getByRun(runId);
    const map = new Map<string, StepState>();
    for (const state of states) {
      map.set(state.stepId, state);
    }
    return map;
  }

  async deleteByRun(runId: string): Promise<number> {
    const states = await this.getByRun(runId);
    for (const state of states) {
      await this.delete(state.id);
    }
    return states.length;
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  async query(
    filter: StepStateFilter,
    options?: {
      sort?: StepStateSort;
      pagination?: StepStatePagination;
    }
  ): Promise<StepState[]> {
    let query: Query = this.db.collection(this.collection) as unknown as Query;

    // Apply filters
    if (filter.runId) {
      query = query.where('runId', '==', filter.runId);
    }
    if (filter.tenantId) {
      query = query.where('tenantId', '==', filter.tenantId);
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (statuses.length === 1) {
        query = query.where('status', '==', statuses[0]);
      } else {
        query = query.where('status', 'in', statuses);
      }
    }
    if (filter.stepType) {
      const types = Array.isArray(filter.stepType) ? filter.stepType : [filter.stepType];
      if (types.length === 1) {
        query = query.where('stepType', '==', types[0]);
      } else {
        query = query.where('stepType', 'in', types);
      }
    }

    // Apply sorting
    if (options?.sort) {
      query = query.orderBy(options.sort.field, options.sort.direction);
    } else {
      query = query.orderBy('createdAt', 'desc');
    }

    // Apply pagination
    if (options?.pagination?.offset) {
      query = query.offset(options.pagination.offset);
    }
    if (options?.pagination?.limit) {
      query = query.limit(options.pagination.limit);
    }

    const snapshot = await query.get();
    let results = snapshot.docs.map(doc => this.fromFirestore(doc.id, doc.data()!));

    // Apply client-side filters for unsupported queries
    if (filter.stepIds && filter.stepIds.length > 0) {
      const stepIdSet = new Set(filter.stepIds);
      results = results.filter(s => stepIdSet.has(s.stepId));
    }
    if (filter.requiresApproval) {
      results = results.filter(s => s.approval?.required);
    }
    if (filter.waitingExternal) {
      results = results.filter(s => s.status === 'waiting');
    }

    return results;
  }

  async count(filter: StepStateFilter): Promise<number> {
    // Firestore doesn't have efficient count, so query and count
    const results = await this.query(filter);
    return results.length;
  }

  // ===========================================================================
  // Status Transition Operations
  // ===========================================================================

  async markRunning(id: string): Promise<StepState> {
    return this.update(id, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });
  }

  async markCompleted(id: string, output?: unknown): Promise<StepState> {
    const now = new Date();
    const state = await this.get(id);
    const startedAt = state?.startedAt ? new Date(state.startedAt) : now;
    const durationMs = now.getTime() - startedAt.getTime();

    return this.update(id, {
      status: 'completed',
      resultCode: 'ok',
      output,
      completedAt: now.toISOString(),
      durationMs,
    });
  }

  async markFailed(id: string, error: string, stack?: string): Promise<StepState> {
    const now = new Date();
    const state = await this.get(id);
    const startedAt = state?.startedAt ? new Date(state.startedAt) : now;
    const durationMs = now.getTime() - startedAt.getTime();

    return this.update(id, {
      status: 'failed',
      resultCode: 'fatal',
      error,
      errorStack: stack,
      completedAt: now.toISOString(),
      durationMs,
    });
  }

  async markSkipped(id: string, reason?: string): Promise<StepState> {
    return this.update(id, {
      status: 'skipped',
      resultCode: 'skipped',
      error: reason,
      completedAt: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // Approval Gate Operations (C3)
  // ===========================================================================

  async markBlocked(id: string, contentHash?: string): Promise<StepState> {
    return this.update(id, {
      status: 'blocked',
      resultCode: 'blocked',
      approval: {
        required: true,
        status: 'pending',
        contentHash,
      },
    });
  }

  async recordApproval(id: string, userId: string, reason?: string): Promise<StepState> {
    const state = await this.get(id);
    if (!state) throw new Error(`Step state not found: ${id}`);

    return this.update(id, {
      status: 'running',
      resultCode: undefined,
      approval: {
        ...state.approval,
        required: state.approval?.required ?? true,
        status: 'approved',
        userId,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async recordRejection(id: string, userId: string, reason?: string): Promise<StepState> {
    const state = await this.get(id);
    if (!state) throw new Error(`Step state not found: ${id}`);

    return this.update(id, {
      status: 'failed',
      resultCode: 'fatal',
      error: reason || 'Approval rejected',
      approval: {
        ...state.approval,
        required: state.approval?.required ?? true,
        status: 'rejected',
        userId,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async getPendingApprovals(tenantId: string): Promise<StepState[]> {
    return this.query({
      tenantId,
      status: 'blocked',
      requiresApproval: true,
    });
  }

  // ===========================================================================
  // External Wait Operations (C3)
  // ===========================================================================

  async markWaiting(
    id: string,
    eventType: string,
    eventId?: string,
    timeoutMs?: number
  ): Promise<StepState> {
    return this.update(id, {
      status: 'waiting',
      externalWait: {
        eventType,
        eventId,
        startedAt: new Date().toISOString(),
        timeoutMs,
        received: false,
      },
    });
  }

  async recordExternalEvent(id: string, payload?: unknown): Promise<StepState> {
    const state = await this.get(id);
    if (!state) throw new Error(`Step state not found: ${id}`);

    return this.update(id, {
      status: 'running',
      externalWait: {
        ...state.externalWait!,
        received: true,
        payload,
      },
    });
  }

  async getWaitingForEvent(eventType: string, eventId?: string): Promise<StepState[]> {
    const results = await this.query({
      status: 'waiting',
      waitingExternal: true,
    });

    return results.filter(s => {
      if (s.externalWait?.eventType !== eventType) return false;
      if (eventId && s.externalWait?.eventId !== eventId) return false;
      return true;
    });
  }

  async processTimeouts(): Promise<number> {
    const now = Date.now();
    const waiting = await this.query({
      status: 'waiting',
      waitingExternal: true,
    });

    let count = 0;
    for (const state of waiting) {
      if (!state.externalWait?.timeoutMs) continue;

      const startedAt = new Date(state.externalWait.startedAt).getTime();
      if (now - startedAt > state.externalWait.timeoutMs) {
        await this.markFailed(state.id, 'External wait timeout');
        count++;
      }
    }

    return count;
  }

  // ===========================================================================
  // Retry Operations
  // ===========================================================================

  async scheduleRetry(
    id: string,
    error: string,
    nextRetryAt: Date
  ): Promise<StepState> {
    const state = await this.get(id);
    if (!state) throw new Error(`Step state not found: ${id}`);

    const retry = state.retry || { attempt: 0, maxAttempts: 3, errors: [] };

    return this.update(id, {
      status: 'pending',
      retry: {
        ...retry,
        attempt: retry.attempt + 1,
        nextRetryAt: nextRetryAt.toISOString(),
        errors: [
          ...retry.errors,
          {
            attempt: retry.attempt,
            error,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
  }

  async getRetryReady(limit = 100): Promise<StepState[]> {
    const now = new Date().toISOString();

    // Query pending states with retry scheduled
    const snapshot = await this.db
      .collection(this.collection)
      .where('status', '==', 'pending')
      .where('retry.nextRetryAt', '<=', now)
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => this.fromFirestore(doc.id, doc.data()!));
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  async healthCheck(): Promise<boolean> {
    try {
      // Try to read a document that doesn't exist
      await this.db.collection(this.collection).doc('__health_check__').get();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Firestore client is managed externally
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private toFirestore(state: StepState): Record<string, unknown> {
    // Convert to Firestore-compatible format
    return {
      ...state,
      // Ensure nested objects are properly handled
      retry: state.retry ? { ...state.retry } : null,
      approval: state.approval ? { ...state.approval } : null,
      externalWait: state.externalWait ? { ...state.externalWait } : null,
      tokenUsage: state.tokenUsage ? { ...state.tokenUsage } : null,
      metadata: state.metadata ? { ...state.metadata } : null,
    };
  }

  private fromFirestore(id: string, data: Record<string, unknown>): StepState {
    return {
      id,
      runId: data.runId as string,
      workflowInstanceId: data.workflowInstanceId as string | undefined,
      stepId: data.stepId as string,
      stepType: data.stepType as string,
      tenantId: data.tenantId as string,
      status: data.status as StepState['status'],
      resultCode: data.resultCode as StepState['resultCode'],
      input: data.input,
      output: data.output,
      error: data.error as string | undefined,
      errorStack: data.errorStack as string | undefined,
      retry: data.retry as StepState['retry'],
      approval: data.approval as StepState['approval'],
      externalWait: data.externalWait as StepState['externalWait'],
      createdAt: data.createdAt as string,
      startedAt: data.startedAt as string | undefined,
      completedAt: data.completedAt as string | undefined,
      updatedAt: data.updatedAt as string,
      durationMs: data.durationMs as number | undefined,
      tokenUsage: data.tokenUsage as StepState['tokenUsage'],
      model: data.model as string | undefined,
      correlationId: data.correlationId as string | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
    };
  }
}

/**
 * Create a Firestore step state store
 *
 * @param db - Firestore client instance
 * @param options - Store options
 * @returns StepStateStore implementation
 */
export function createFirestoreStepStateStore(
  db: FirestoreClient,
  options: { collection?: string } = {}
): StepStateStore {
  return new FirestoreStepStateStore(db, options);
}
