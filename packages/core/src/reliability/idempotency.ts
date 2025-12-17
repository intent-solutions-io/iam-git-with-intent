/**
 * Idempotency Keys
 *
 * Phase 7: Ensure tool invocations and workflow steps are idempotent.
 *
 * Hard rules:
 * - Every tool invocation can have an idempotency key
 * - If key exists, return cached result instead of re-executing
 * - Keys are scoped to runId + stepId + operation
 * - Records have TTL for cleanup
 *
 * @module @gwi/core/reliability/idempotency
 */

import { createHash } from 'crypto';

// =============================================================================
// Types
// =============================================================================

/**
 * Idempotency key components
 */
export interface IdempotencyKey {
  /** Run ID */
  runId: string;

  /** Step ID within the run */
  stepId: string;

  /** Operation name (e.g., tool name, agent action) */
  operation: string;

  /** Hash of input parameters */
  inputHash: string;
}

/**
 * Stored idempotency record
 */
export interface IdempotencyRecord {
  /** The key */
  key: string;

  /** Parsed key components */
  keyComponents: IdempotencyKey;

  /** Status of the operation */
  status: 'pending' | 'completed' | 'failed';

  /** Cached result (if completed) */
  result?: unknown;

  /** Error message (if failed) */
  error?: string;

  /** When the record was created */
  createdAt: Date;

  /** When the operation completed */
  completedAt?: Date;

  /** When the record expires */
  expiresAt: Date;
}

/**
 * Idempotency options
 */
export interface IdempotencyOptions {
  /** TTL for idempotency records in milliseconds (default: 24 hours) */
  ttlMs?: number;

  /** Whether to return pending records as cache hits (default: false) */
  allowPending?: boolean;
}

// =============================================================================
// Idempotency Store
// =============================================================================

/**
 * Abstract idempotency store interface
 */
export abstract class IdempotencyStore {
  /**
   * Get an existing idempotency record
   *
   * @param key - The idempotency key string
   * @returns Record if exists and not expired, null otherwise
   */
  abstract get(key: string): Promise<IdempotencyRecord | null>;

  /**
   * Create a pending idempotency record
   *
   * @param key - The idempotency key string
   * @param components - Parsed key components
   * @param options - Options including TTL
   * @returns The created record, or existing if already present
   */
  abstract create(
    key: string,
    components: IdempotencyKey,
    options?: IdempotencyOptions
  ): Promise<{ record: IdempotencyRecord; created: boolean }>;

  /**
   * Complete an idempotency record with success
   *
   * @param key - The idempotency key string
   * @param result - The result to cache
   * @returns true if updated, false if not found
   */
  abstract complete(key: string, result: unknown): Promise<boolean>;

  /**
   * Complete an idempotency record with failure
   *
   * @param key - The idempotency key string
   * @param error - The error message
   * @returns true if updated, false if not found
   */
  abstract fail(key: string, error: string): Promise<boolean>;

  /**
   * Delete an idempotency record
   *
   * @param key - The idempotency key string
   * @returns true if deleted, false if not found
   */
  abstract delete(key: string): Promise<boolean>;

  /**
   * List all records for a run
   *
   * @param runId - Run ID to filter by
   * @returns Array of records
   */
  abstract listByRun(runId: string): Promise<IdempotencyRecord[]>;

  /**
   * Cleanup expired records
   *
   * @returns Number of records cleaned up
   */
  abstract cleanup(): Promise<number>;

  /**
   * Check if an operation should be skipped due to idempotency
   *
   * @param components - Key components
   * @param options - Idempotency options
   * @returns Cached result if should skip, null if should execute
   */
  async checkIdempotency(
    components: IdempotencyKey,
    options: IdempotencyOptions = {}
  ): Promise<{ skip: boolean; result?: unknown; error?: string }> {
    const key = generateIdempotencyKey(components);
    const existing = await this.get(key);

    if (!existing) {
      return { skip: false };
    }

    switch (existing.status) {
      case 'completed':
        return { skip: true, result: existing.result };

      case 'failed':
        return { skip: true, error: existing.error };

      case 'pending':
        if (options.allowPending) {
          return { skip: true, result: undefined };
        }
        // Pending but allowPending is false - could be stale, let caller decide
        return { skip: false };

      default:
        return { skip: false };
    }
  }

  /**
   * Execute a function with idempotency
   *
   * @param components - Key components
   * @param fn - Function to execute
   * @param options - Idempotency options
   * @returns Result of function (cached or fresh)
   */
  async withIdempotency<T>(
    components: IdempotencyKey,
    fn: () => Promise<T>,
    options: IdempotencyOptions = {}
  ): Promise<T> {
    const key = generateIdempotencyKey(components);

    // Try to create or get existing
    const { record, created } = await this.create(key, components, options);

    // If not created, check status
    if (!created) {
      switch (record.status) {
        case 'completed':
          return record.result as T;

        case 'failed':
          throw new Error(`Cached failure: ${record.error}`);

        case 'pending':
          // Another process is running - could wait or throw
          throw new Error(`Operation already in progress: ${key}`);
      }
    }

    // Execute function
    try {
      const result = await fn();
      await this.complete(key, result);
      return result;
    } catch (error) {
      await this.fail(key, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory idempotency store
 */
export class MemoryIdempotencyStore extends IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key);
    if (!record) {
      return null;
    }

    // Check expiration
    if (record.expiresAt <= new Date()) {
      this.records.delete(key);
      return null;
    }

    return record;
  }

  async create(
    key: string,
    components: IdempotencyKey,
    options: IdempotencyOptions = {}
  ): Promise<{ record: IdempotencyRecord; created: boolean }> {
    const { ttlMs = 24 * 60 * 60 * 1000 } = options; // 24 hours default

    // Check existing
    const existing = await this.get(key);
    if (existing) {
      return { record: existing, created: false };
    }

    // Create new
    const now = new Date();
    const record: IdempotencyRecord = {
      key,
      keyComponents: components,
      status: 'pending',
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };

    this.records.set(key, record);
    return { record, created: true };
  }

  async complete(key: string, result: unknown): Promise<boolean> {
    const record = this.records.get(key);
    if (!record) {
      return false;
    }

    record.status = 'completed';
    record.result = result;
    record.completedAt = new Date();
    return true;
  }

  async fail(key: string, error: string): Promise<boolean> {
    const record = this.records.get(key);
    if (!record) {
      return false;
    }

    record.status = 'failed';
    record.error = error;
    record.completedAt = new Date();
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async listByRun(runId: string): Promise<IdempotencyRecord[]> {
    const results: IdempotencyRecord[] = [];
    const now = new Date();

    for (const record of this.records.values()) {
      if (record.keyComponents.runId === runId && record.expiresAt > now) {
        results.push(record);
      }
    }

    return results;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records.clear();
  }
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate an idempotency key string from components
 */
export function generateIdempotencyKey(components: IdempotencyKey): string {
  const { runId, stepId, operation, inputHash } = components;
  return `idem:${runId}:${stepId}:${operation}:${inputHash}`;
}

/**
 * Hash input for idempotency key
 */
export function hashInput(input: unknown): string {
  const serialized = JSON.stringify(input, Object.keys(input as object).sort());
  return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
}

/**
 * Create idempotency key components
 */
export function createIdempotencyKey(
  runId: string,
  stepId: string,
  operation: string,
  input: unknown
): IdempotencyKey {
  return {
    runId,
    stepId,
    operation,
    inputHash: hashInput(input),
  };
}

// =============================================================================
// Global Singleton
// =============================================================================

let globalIdempotencyStore: IdempotencyStore | null = null;

/**
 * Get the global idempotency store
 */
export function getIdempotencyStore(): IdempotencyStore {
  if (!globalIdempotencyStore) {
    globalIdempotencyStore = new MemoryIdempotencyStore();
  }
  return globalIdempotencyStore;
}

/**
 * Set a custom idempotency store
 */
export function setIdempotencyStore(store: IdempotencyStore): void {
  globalIdempotencyStore = store;
}
