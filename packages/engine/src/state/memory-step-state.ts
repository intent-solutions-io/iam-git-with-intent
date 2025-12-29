/**
 * In-Memory Step State Store
 *
 * C2: In-memory implementation of StepStateStore for testing and development.
 * Not suitable for production - use FirestoreStepStateStore instead.
 *
 * @module @gwi/engine/state/memory-step-state
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
// In-Memory Store Implementation
// =============================================================================

/**
 * In-memory implementation of StepStateStore
 *
 * Features:
 * - Full interface compliance
 * - Fast for testing
 * - No persistence (data lost on restart)
 *
 * @example
 * ```typescript
 * const store = new MemoryStepStateStore();
 * const state = await store.create({
 *   runId: 'run-123',
 *   stepId: 'triage',
 *   stepType: 'triage',
 *   tenantId: 'tenant-1',
 * });
 * ```
 */
export class MemoryStepStateStore implements StepStateStore {
  private states: Map<string, StepState> = new Map();
  private runIndex: Map<string, Set<string>> = new Map();

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

    this.states.set(id, state);
    this.addToRunIndex(state.runId, id);

    return state;
  }

  async get(id: string): Promise<StepState | null> {
    return this.states.get(id) || null;
  }

  async getByRunAndStep(runId: string, stepId: string): Promise<StepState | null> {
    for (const state of this.states.values()) {
      if (state.runId === runId && state.stepId === stepId) {
        return state;
      }
    }
    return null;
  }

  async update(id: string, data: StepStateUpdate): Promise<StepState> {
    const existing = this.states.get(id);
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

    this.states.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const state = this.states.get(id);
    if (!state) return false;

    this.removeFromRunIndex(state.runId, id);
    return this.states.delete(id);
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  async createMany(data: StepStateCreate[]): Promise<StepState[]> {
    const results: StepState[] = [];
    for (const item of data) {
      results.push(await this.create(item));
    }
    return results;
  }

  async getByRun(runId: string): Promise<StepState[]> {
    const ids = this.runIndex.get(runId);
    if (!ids) return [];

    const results: StepState[] = [];
    for (const id of ids) {
      const state = this.states.get(id);
      if (state) results.push(state);
    }
    return results;
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
    const ids = this.runIndex.get(runId);
    if (!ids) return 0;

    let count = 0;
    for (const id of ids) {
      if (this.states.delete(id)) count++;
    }
    this.runIndex.delete(runId);
    return count;
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
    let results = Array.from(this.states.values());

    // Apply filters
    if (filter.runId) {
      results = results.filter(s => s.runId === filter.runId);
    }
    if (filter.stepIds && filter.stepIds.length > 0) {
      const stepIdSet = new Set(filter.stepIds);
      results = results.filter(s => stepIdSet.has(s.stepId));
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const statusSet = new Set(statuses);
      results = results.filter(s => statusSet.has(s.status));
    }
    if (filter.stepType) {
      const types = Array.isArray(filter.stepType) ? filter.stepType : [filter.stepType];
      const typeSet = new Set(types);
      results = results.filter(s => typeSet.has(s.stepType));
    }
    if (filter.tenantId) {
      results = results.filter(s => s.tenantId === filter.tenantId);
    }
    if (filter.requiresApproval) {
      results = results.filter(s => s.approval?.required);
    }
    if (filter.waitingExternal) {
      results = results.filter(s => s.status === 'waiting');
    }

    // Apply sorting
    if (options?.sort) {
      const { field, direction } = options.sort;
      results.sort((a, b) => {
        const aVal = a[field] || '';
        const bVal = b[field] || '';
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return direction === 'desc' ? -cmp : cmp;
      });
    }

    // Apply pagination
    if (options?.pagination) {
      const { offset = 0, limit } = options.pagination;
      results = results.slice(offset, limit ? offset + limit : undefined);
    }

    return results;
  }

  async count(filter: StepStateFilter): Promise<number> {
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
    let count = 0;

    for (const state of this.states.values()) {
      if (state.status !== 'waiting' || !state.externalWait) continue;

      const startedAt = new Date(state.externalWait.startedAt).getTime();
      const timeoutMs = state.externalWait.timeoutMs;

      if (timeoutMs && now - startedAt > timeoutMs) {
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
    const now = new Date();
    const results: StepState[] = [];

    for (const state of this.states.values()) {
      if (!state.retry?.nextRetryAt) continue;

      const nextRetryAt = new Date(state.retry.nextRetryAt);
      if (nextRetryAt <= now) {
        results.push(state);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.states.clear();
    this.runIndex.clear();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private addToRunIndex(runId: string, stateId: string): void {
    let ids = this.runIndex.get(runId);
    if (!ids) {
      ids = new Set();
      this.runIndex.set(runId, ids);
    }
    ids.add(stateId);
  }

  private removeFromRunIndex(runId: string, stateId: string): void {
    const ids = this.runIndex.get(runId);
    if (ids) {
      ids.delete(stateId);
      if (ids.size === 0) {
        this.runIndex.delete(runId);
      }
    }
  }

  // ===========================================================================
  // Test Helpers (not part of interface)
  // ===========================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.states.clear();
    this.runIndex.clear();
  }

  /**
   * Get total count (for testing)
   */
  size(): number {
    return this.states.size;
  }
}

/**
 * Create an in-memory step state store
 */
export function createMemoryStepStateStore(): StepStateStore {
  return new MemoryStepStateStore();
}
