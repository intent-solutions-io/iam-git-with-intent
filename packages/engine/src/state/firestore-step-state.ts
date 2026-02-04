/**
 * Firestore Step State Store
 *
 * C2: Firestore implementation of StepStateStore for production use.
 * Provides persistent step state for Cloud Run resilience.
 *
 * ## Required Firestore Indexes
 *
 * Create these composite indexes in the Firebase Console or via
 * firestore.indexes.json for optimal query performance:
 *
 * ```json
 * {
 *   "indexes": [
 *     {
 *       "collectionGroup": "stepStates",
 *       "queryScope": "COLLECTION",
 *       "fields": [
 *         { "fieldPath": "runId", "order": "ASCENDING" },
 *         { "fieldPath": "stepId", "order": "ASCENDING" }
 *       ]
 *     },
 *     {
 *       "collectionGroup": "stepStates",
 *       "queryScope": "COLLECTION",
 *       "fields": [
 *         { "fieldPath": "tenantId", "order": "ASCENDING" },
 *         { "fieldPath": "status", "order": "ASCENDING" }
 *       ]
 *     },
 *     {
 *       "collectionGroup": "stepStates",
 *       "queryScope": "COLLECTION",
 *       "fields": [
 *         { "fieldPath": "status", "order": "ASCENDING" },
 *         { "fieldPath": "retry.nextRetryAt", "order": "ASCENDING" }
 *       ]
 *     },
 *     {
 *       "collectionGroup": "stepStates",
 *       "queryScope": "COLLECTION",
 *       "fields": [
 *         { "fieldPath": "status", "order": "ASCENDING" },
 *         { "fieldPath": "externalWait.eventType", "order": "ASCENDING" }
 *       ]
 *     },
 *     {
 *       "collectionGroup": "stepStates",
 *       "queryScope": "COLLECTION",
 *       "fields": [
 *         { "fieldPath": "tenantId", "order": "ASCENDING" },
 *         { "fieldPath": "status", "order": "ASCENDING" },
 *         { "fieldPath": "approval.required", "order": "ASCENDING" }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * Without these indexes, queries will fail with "requires an index" errors
 * in production.
 *
 * @module @gwi/engine/state/firestore-step-state
 */

import { randomUUID } from 'crypto';
import { getLogger } from '@gwi/core';
import type { StepStateStore } from './step-state-store.js';
import {
  StepState as StepStateSchema,
  type StepState,
  type StepStateCreate,
  type StepStateUpdate,
  type StepStateFilter,
  type StepStateSort,
  type StepStatePagination,
} from './types.js';

const logger = getLogger('firestore-step-state');

// =============================================================================
// Firestore Types (avoid direct dependency for portability)
// =============================================================================

/**
 * Minimal Firestore interface for dependency injection
 */
export interface FirestoreClient {
  collection(path: string): CollectionRef;
  runTransaction<T>(
    updateFunction: (transaction: FirestoreTransaction) => Promise<T>
  ): Promise<T>;
  batch(): FirestoreBatch;
}

/**
 * Batch write interface for efficient bulk operations
 */
export interface FirestoreBatch {
  set(docRef: DocumentRef, data: Record<string, unknown>): FirestoreBatch;
  update(docRef: DocumentRef, data: Record<string, unknown>): FirestoreBatch;
  delete(docRef: DocumentRef): FirestoreBatch;
  commit(): Promise<void>;
}

/**
 * Transaction interface for atomic read-modify-write operations
 */
export interface FirestoreTransaction {
  get(docRef: DocumentRef): Promise<DocumentSnapshot>;
  set(docRef: DocumentRef, data: Record<string, unknown>): FirestoreTransaction;
  update(docRef: DocumentRef, data: Record<string, unknown>): FirestoreTransaction;
  delete(docRef: DocumentRef): FirestoreTransaction;
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
    if (data.length === 0) return [];

    const now = new Date().toISOString();
    const states: StepState[] = [];

    // Prepare all states first
    for (const item of data) {
      const id = randomUUID();
      const state: StepState = {
        id,
        runId: item.runId,
        workflowInstanceId: item.workflowInstanceId,
        stepId: item.stepId,
        stepType: item.stepType,
        tenantId: item.tenantId,
        status: item.status || 'pending',
        resultCode: item.resultCode,
        input: item.input,
        output: item.output,
        error: item.error,
        errorStack: item.errorStack,
        retry: item.retry,
        approval: item.approval,
        externalWait: item.externalWait,
        createdAt: now,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        updatedAt: now,
        durationMs: item.durationMs,
        tokenUsage: item.tokenUsage,
        model: item.model,
        correlationId: item.correlationId,
        metadata: item.metadata,
      };
      states.push(state);
    }

    // Firestore batch limit is 500 operations
    // NOTE: This is not atomic across all batches. If a batch fails,
    // previous batches remain committed. Caller should handle partial success.
    const BATCH_SIZE = 500;
    let committedCount = 0;

    try {
      for (let i = 0; i < states.length; i += BATCH_SIZE) {
        const batch = this.db.batch();
        const chunk = states.slice(i, i + BATCH_SIZE);

        for (const state of chunk) {
          const docRef = this.db.collection(this.collection).doc(state.id);
          batch.set(docRef, this.toFirestore(state));
        }

        await batch.commit();
        committedCount += chunk.length;
      }

      return states;
    } catch (error) {
      // Log partial success info for debugging
      logger.error('Batch write failed', {
        committedCount,
        totalCount: states.length,
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-throw with additional context
      const err = error instanceof Error ? error : new Error(String(error));
      err.message = `Batch write failed after ${committedCount}/${states.length} records: ${err.message}`;
      throw err;
    }
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
    if (states.length === 0) return 0;

    // Use batch delete for efficiency
    // NOTE: Not atomic across batches - partial deletes possible on failure
    const BATCH_SIZE = 500;
    let deletedCount = 0;

    try {
      for (let i = 0; i < states.length; i += BATCH_SIZE) {
        const batch = this.db.batch();
        const chunk = states.slice(i, i + BATCH_SIZE);

        for (const state of chunk) {
          const docRef = this.db.collection(this.collection).doc(state.id);
          batch.delete(docRef);
        }

        await batch.commit();
        deletedCount += chunk.length;
      }

      return deletedCount;
    } catch (error) {
      logger.error('Batch delete failed', {
        deletedCount,
        totalCount: states.length,
        error: error instanceof Error ? error.message : String(error),
      });
      const err = error instanceof Error ? error : new Error(String(error));
      err.message = `Batch delete failed after ${deletedCount}/${states.length} records: ${err.message}`;
      throw err;
    }
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
    // Use transaction to prevent race conditions on approval state
    return this.db.runTransaction(async (transaction) => {
      const docRef = this.db.collection(this.collection).doc(id);
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error(`Step state not found: ${id}`);
      }

      const state = this.fromFirestore(doc.id, doc.data()!);

      // Handle idempotency - if already approved by same user, return existing state
      if (state.approval?.status === 'approved') {
        if (state.approval.userId === userId) {
          // Idempotent: same user re-approving, return existing state
          return state;
        }
        // Different user trying to approve - error
        throw new Error(
          `Step ${id} was already approved by ${state.approval.userId}`
        );
      }

      // Verify step is in blocked state awaiting approval
      if (state.status !== 'blocked') {
        throw new Error(
          `Cannot approve step ${id}: expected status 'blocked', got '${state.status}'`
        );
      }

      const updated: StepState = {
        ...state,
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
        updatedAt: new Date().toISOString(),
      };

      transaction.update(docRef, this.toFirestore(updated));
      return updated;
    });
  }

  async recordRejection(id: string, userId: string, reason?: string): Promise<StepState> {
    // Use transaction to prevent race conditions on rejection state
    return this.db.runTransaction(async (transaction) => {
      const docRef = this.db.collection(this.collection).doc(id);
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error(`Step state not found: ${id}`);
      }

      const state = this.fromFirestore(doc.id, doc.data()!);

      // Handle idempotency - if already rejected by same user, return existing state
      if (state.approval?.status === 'rejected') {
        if (state.approval.userId === userId) {
          // Idempotent: same user re-rejecting, return existing state
          return state;
        }
        // Different user trying to reject - error
        throw new Error(
          `Step ${id} was already rejected by ${state.approval.userId}`
        );
      }

      // Verify step is in blocked state awaiting approval
      if (state.status !== 'blocked') {
        throw new Error(
          `Cannot reject step ${id}: expected status 'blocked', got '${state.status}'`
        );
      }

      const updated: StepState = {
        ...state,
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
        updatedAt: new Date().toISOString(),
      };

      transaction.update(docRef, this.toFirestore(updated));
      return updated;
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
    // Validate with Zod to ensure data integrity from Firestore
    const rawState = {
      id,
      runId: data.runId,
      workflowInstanceId: data.workflowInstanceId,
      stepId: data.stepId,
      stepType: data.stepType,
      tenantId: data.tenantId,
      status: data.status,
      resultCode: data.resultCode,
      input: data.input,
      output: data.output,
      error: data.error,
      errorStack: data.errorStack,
      retry: data.retry,
      approval: data.approval,
      externalWait: data.externalWait,
      createdAt: data.createdAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      updatedAt: data.updatedAt,
      durationMs: data.durationMs,
      tokenUsage: data.tokenUsage,
      model: data.model,
      correlationId: data.correlationId,
      metadata: data.metadata,
    };

    const result = StepStateSchema.safeParse(rawState);
    if (!result.success) {
      // Fail fast on validation errors - data corruption or schema mismatch
      // should be caught immediately, not silently propagated
      const issues = result.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(
        `[FirestoreStepStateStore] Data validation failed for step state ${id}: ${issues}`
      );
    }

    return result.data;
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
