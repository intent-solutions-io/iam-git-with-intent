/**
 * Idempotency Store
 *
 * A4.s2: Implements check-and-set using Firestore transactions.
 * A4.s3: Adds TTL/retention policy for idempotency records.
 *
 * @module @gwi/engine/idempotency
 */

import type {
  IdempotencyConfig,
  IdempotencyRecord,
  IdempotencyKeyInput,
  IdempotencyCheckResult,
  IdempotencyStatus,
  EventSource,
} from './types.js';
import {
  DEFAULT_IDEMPOTENCY_CONFIG,
  generateIdempotencyKey,
  hashRequestPayload,
} from './types.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Idempotency store interface
 */
export interface IdempotencyStore {
  /**
   * Check if a request is a duplicate and acquire processing lock
   *
   * Uses Firestore transaction for atomic check-and-set:
   * 1. Check if key exists
   * 2. If new, create record with 'processing' status
   * 3. If exists, check status and return appropriate result
   *
   * @param input - Idempotency key components
   * @param tenantId - Tenant making the request
   * @param payload - Request payload (for hash comparison)
   * @returns Check result indicating if request should proceed
   */
  checkAndSet(
    input: IdempotencyKeyInput,
    tenantId: string,
    payload: unknown
  ): Promise<IdempotencyCheckResult>;

  /**
   * Mark a request as completed with response
   *
   * @param key - Idempotency key
   * @param runId - Run ID created (if any)
   * @param response - Response to cache for duplicates
   */
  markCompleted(key: string, runId: string | undefined, response: unknown): Promise<void>;

  /**
   * Mark a request as failed
   *
   * @param key - Idempotency key
   * @param error - Error message
   */
  markFailed(key: string, error: string): Promise<void>;

  /**
   * Get a record by key
   */
  getRecord(key: string): Promise<IdempotencyRecord | null>;

  /**
   * Clean up expired records (for TTL enforcement)
   *
   * @returns Number of records deleted
   */
  cleanupExpired(): Promise<number>;
}

// =============================================================================
// In-Memory Store (Development/Testing)
// =============================================================================

/**
 * In-memory idempotency store for development and testing
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private config: IdempotencyConfig;

  constructor(config: Partial<IdempotencyConfig> = {}) {
    this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
  }

  async checkAndSet(
    input: IdempotencyKeyInput,
    tenantId: string,
    payload: unknown
  ): Promise<IdempotencyCheckResult> {
    const key = generateIdempotencyKey(input);
    const requestHash = hashRequestPayload(payload);
    const now = new Date();

    // Check existing record
    const existing = this.records.get(key);

    if (existing) {
      // Check if lock has expired
      if (existing.status === 'processing' && existing.lockExpiresAt) {
        if (existing.lockExpiresAt < now) {
          // Lock expired - check if we should retry
          if (existing.attempts >= this.config.maxAttempts) {
            // Too many attempts - mark as failed
            existing.status = 'failed';
            existing.error = 'Max processing attempts exceeded';
            existing.updatedAt = now;
            return {
              status: 'duplicate',
              key,
              record: existing,
            };
          }

          // Reacquire lock
          existing.lockExpiresAt = new Date(now.getTime() + this.config.lockTimeoutMs);
          existing.attempts += 1;
          existing.updatedAt = now;
          return { status: 'new', key };
        }

        // Still processing
        return {
          status: 'processing',
          key,
          record: existing,
        };
      }

      // Check if record has expired
      if (existing.expiresAt < now) {
        // Expired - treat as new
        this.records.delete(key);
      } else {
        // Return cached result
        return {
          status: 'duplicate',
          key,
          record: existing,
        };
      }
    }

    // Create new record
    const record: IdempotencyRecord = {
      key,
      source: input.source,
      tenantId,
      status: 'processing',
      requestHash,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.config.completedTtlMs),
      lockExpiresAt: new Date(now.getTime() + this.config.lockTimeoutMs),
      attempts: 1,
    };

    this.records.set(key, record);

    return { status: 'new', key };
  }

  async markCompleted(key: string, runId: string | undefined, response: unknown): Promise<void> {
    const record = this.records.get(key);
    if (!record) return;

    const now = new Date();
    record.status = 'completed';
    record.runId = runId;
    record.response = response;
    record.updatedAt = now;
    record.expiresAt = new Date(now.getTime() + this.config.completedTtlMs);
    record.lockExpiresAt = undefined;
  }

  async markFailed(key: string, error: string): Promise<void> {
    const record = this.records.get(key);
    if (!record) return;

    const now = new Date();
    record.status = 'failed';
    record.error = error;
    record.updatedAt = now;
    record.expiresAt = new Date(now.getTime() + this.config.failedTtlMs);
    record.lockExpiresAt = undefined;
  }

  async getRecord(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    let deleted = 0;

    for (const [key, record] of this.records) {
      if (record.expiresAt < now) {
        this.records.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  // Test helpers
  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }
}

// =============================================================================
// Firestore Store (Production)
// =============================================================================

/**
 * Firestore-backed idempotency store for production
 *
 * Collection: gwi_idempotency
 * Document ID: {idempotency_key}
 *
 * Uses Firestore transactions for atomic check-and-set.
 * TTL is enforced via scheduled cleanup (Cloud Scheduler).
 */
export class FirestoreIdempotencyStore implements IdempotencyStore {
  private config: IdempotencyConfig;
  private firestore: FirebaseFirestore.Firestore | null = null;
  private collectionName = 'gwi_idempotency';

  constructor(config: Partial<IdempotencyConfig> = {}) {
    this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
  }

  /**
   * Lazy-load Firestore to avoid import issues in non-Firebase environments
   */
  private async getFirestore(): Promise<FirebaseFirestore.Firestore> {
    if (this.firestore) return this.firestore;

    // Dynamic import to avoid bundling firebase-admin in all environments
    const { getFirestore } = await import('firebase-admin/firestore');
    this.firestore = getFirestore();
    return this.firestore;
  }

  async checkAndSet(
    input: IdempotencyKeyInput,
    tenantId: string,
    payload: unknown
  ): Promise<IdempotencyCheckResult> {
    const db = await this.getFirestore();
    const key = generateIdempotencyKey(input);
    const requestHash = hashRequestPayload(payload);
    const docRef = db.collection(this.collectionName).doc(key);

    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const now = new Date();

      if (doc.exists) {
        const data = doc.data() as IdempotencyRecordFirestore;
        const existing = this.fromFirestore(data);

        // Check if lock has expired
        if (existing.status === 'processing' && existing.lockExpiresAt) {
          if (existing.lockExpiresAt < now) {
            // Lock expired - check if we should retry
            if (existing.attempts >= this.config.maxAttempts) {
              // Too many attempts - mark as failed
              transaction.update(docRef, {
                status: 'failed',
                error: 'Max processing attempts exceeded',
                updatedAt: now,
                lockExpiresAt: null,
              });
              existing.status = 'failed';
              existing.error = 'Max processing attempts exceeded';
              return {
                status: 'duplicate' as const,
                key,
                record: existing,
              };
            }

            // Reacquire lock
            const newLockExpiry = new Date(now.getTime() + this.config.lockTimeoutMs);
            transaction.update(docRef, {
              lockExpiresAt: newLockExpiry,
              attempts: existing.attempts + 1,
              updatedAt: now,
            });
            return { status: 'new' as const, key };
          }

          // Still processing
          return {
            status: 'processing' as const,
            key,
            record: existing,
          };
        }

        // Check if record has expired
        if (existing.expiresAt < now) {
          // Expired - recreate record
          transaction.set(docRef, this.toFirestore({
            key,
            source: input.source,
            tenantId,
            status: 'processing',
            requestHash,
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(now.getTime() + this.config.completedTtlMs),
            lockExpiresAt: new Date(now.getTime() + this.config.lockTimeoutMs),
            attempts: 1,
          }));
          return { status: 'new' as const, key };
        }

        // Return cached result
        return {
          status: 'duplicate' as const,
          key,
          record: existing,
        };
      }

      // Create new record
      const record: IdempotencyRecord = {
        key,
        source: input.source,
        tenantId,
        status: 'processing',
        requestHash,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + this.config.completedTtlMs),
        lockExpiresAt: new Date(now.getTime() + this.config.lockTimeoutMs),
        attempts: 1,
      };

      transaction.set(docRef, this.toFirestore(record));

      return { status: 'new' as const, key };
    });
  }

  async markCompleted(key: string, runId: string | undefined, response: unknown): Promise<void> {
    const db = await this.getFirestore();
    const docRef = db.collection(this.collectionName).doc(key);
    const now = new Date();

    await docRef.update({
      status: 'completed',
      runId: runId ?? null,
      response: response ?? null,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.config.completedTtlMs),
      lockExpiresAt: null,
    });
  }

  async markFailed(key: string, error: string): Promise<void> {
    const db = await this.getFirestore();
    const docRef = db.collection(this.collectionName).doc(key);
    const now = new Date();

    await docRef.update({
      status: 'failed',
      error,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.config.failedTtlMs),
      lockExpiresAt: null,
    });
  }

  async getRecord(key: string): Promise<IdempotencyRecord | null> {
    const db = await this.getFirestore();
    const doc = await db.collection(this.collectionName).doc(key).get();

    if (!doc.exists) return null;

    return this.fromFirestore(doc.data() as IdempotencyRecordFirestore);
  }

  async cleanupExpired(): Promise<number> {
    const db = await this.getFirestore();
    const now = new Date();
    const batch = db.batch();
    let deleted = 0;

    // Query for expired records (in batches of 500)
    const expired = await db
      .collection(this.collectionName)
      .where('expiresAt', '<', now)
      .limit(500)
      .get();

    for (const doc of expired.docs) {
      batch.delete(doc.ref);
      deleted++;
    }

    if (deleted > 0) {
      await batch.commit();
    }

    return deleted;
  }

  /**
   * Convert to Firestore format (Timestamps instead of Dates)
   */
  private toFirestore(record: IdempotencyRecord): IdempotencyRecordFirestore {
    return {
      ...record,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      lockExpiresAt: record.lockExpiresAt ?? null,
    };
  }

  /**
   * Convert from Firestore format
   */
  private fromFirestore(data: IdempotencyRecordFirestore): IdempotencyRecord {
    return {
      ...data,
      source: data.source as EventSource,
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
      expiresAt: this.toDate(data.expiresAt),
      lockExpiresAt: data.lockExpiresAt ? this.toDate(data.lockExpiresAt) : undefined,
    };
  }

  /**
   * Convert Firestore Timestamp to Date
   */
  private toDate(value: Date | FirebaseFirestore.Timestamp): Date {
    if (value instanceof Date) return value;
    // Firestore Timestamp has toDate() method
    if ('toDate' in value) return value.toDate();
    return new Date(value as unknown as string);
  }
}

/**
 * Firestore document format (uses Timestamps)
 */
interface IdempotencyRecordFirestore {
  key: string;
  source: string;
  tenantId: string;
  runId?: string;
  status: IdempotencyStatus;
  requestHash: string;
  response?: unknown;
  error?: string;
  createdAt: Date | FirebaseFirestore.Timestamp;
  updatedAt: Date | FirebaseFirestore.Timestamp;
  expiresAt: Date | FirebaseFirestore.Timestamp;
  lockExpiresAt: Date | FirebaseFirestore.Timestamp | null;
  attempts: number;
}

// =============================================================================
// Store Factory
// =============================================================================

let defaultStore: IdempotencyStore | null = null;

/**
 * Get the idempotency store based on environment
 */
export function getIdempotencyStore(): IdempotencyStore {
  if (defaultStore) return defaultStore;

  const backend = process.env.GWI_STORE_BACKEND;

  if (backend === 'firestore') {
    defaultStore = new FirestoreIdempotencyStore();
  } else {
    defaultStore = new InMemoryIdempotencyStore();
  }

  return defaultStore;
}

/**
 * Set a custom idempotency store (for testing)
 */
export function setIdempotencyStore(store: IdempotencyStore): void {
  defaultStore = store;
}

/**
 * Reset the default store (for testing)
 */
export function resetIdempotencyStore(): void {
  defaultStore = null;
}
