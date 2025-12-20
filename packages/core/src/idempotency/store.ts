/**
 * Idempotency Store
 *
 * A4.s2: Atomic check-and-set for idempotency keys using Firestore transactions
 * A4.s3: TTL/retention policy for idempotency records
 *
 * Provides:
 * - Atomic create-if-not-exists for idempotency keys
 * - Firestore transaction-based implementation
 * - In-memory implementation for testing
 * - Payload hash validation to detect duplicate-but-different requests
 * - TTL expiration logic with configurable retention policies
 * - Background cleanup for expired records
 *
 * @module @gwi/core/idempotency
 */

import type { Firestore } from 'firebase-admin/firestore';
import * as crypto from 'node:crypto';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
} from '../storage/firestore-client.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Idempotency record status
 */
export type IdempotencyStatus = 'pending' | 'completed' | 'failed';

/**
 * TTL configuration for idempotency store
 */
export interface IdempotencyTTLConfig {
  /**
   * Default TTL in seconds for new records
   * @default 86400 (24 hours)
   */
  defaultTTLSeconds: number;

  /**
   * Minimum allowed TTL in seconds
   * @default 60 (1 minute)
   */
  minTTLSeconds: number;

  /**
   * Maximum allowed TTL in seconds
   * @default 604800 (7 days)
   */
  maxTTLSeconds: number;
}

/**
 * Cleanup result statistics
 */
export interface CleanupResult {
  /** Number of expired records deleted */
  deletedCount: number;

  /** Number of records scanned */
  scannedCount: number;

  /** Timestamp when cleanup started */
  startedAt: Date;

  /** Timestamp when cleanup completed */
  completedAt: Date;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Idempotency record stored in the database
 */
export interface IdempotencyRecord {
  /** SHA-256 hash of the idempotency key (used as document ID) */
  keyHash: string;

  /** Original idempotency key */
  key: string;

  /** Tenant ID for isolation */
  tenantId: string;

  /** Associated run ID if created */
  runId?: string;

  /** Current status of the operation */
  status: IdempotencyStatus;

  /** Cached result for completed operations */
  result?: unknown;

  /** Created timestamp */
  createdAt: Date;

  /** Expiration timestamp for TTL */
  expiresAt: Date;

  /** SHA-256 hash of the request payload (for validation) */
  payloadHash?: string;
}

/**
 * Result of check-and-set operation
 */
export interface CheckAndSetResult {
  /** True if this is a new record, false if it already existed */
  isNew: boolean;

  /** The idempotency record (existing or newly created) */
  record: IdempotencyRecord;
}

/**
 * Idempotency store interface
 */
export interface IdempotencyStore {
  /**
   * Atomically check if key exists and create if not
   *
   * Returns existing record if key exists, creates new if not.
   * Uses Firestore transaction for atomicity.
   *
   * @param key - Idempotency key
   * @param tenantId - Tenant ID for isolation
   * @param ttlSeconds - TTL in seconds (default: from config or 86400 = 24 hours)
   * @param payloadHash - Optional payload hash for validation
   * @returns Check-and-set result with isNew flag and record
   */
  checkAndSet(
    key: string,
    tenantId: string,
    ttlSeconds?: number,
    payloadHash?: string
  ): Promise<CheckAndSetResult>;

  /**
   * Update status and result after operation completes
   *
   * @param keyHash - SHA-256 hash of the idempotency key
   * @param runId - Run ID to associate with this key
   * @param result - Optional result to cache
   */
  complete(keyHash: string, runId: string, result?: unknown): Promise<void>;

  /**
   * Mark operation as failed
   *
   * @param keyHash - SHA-256 hash of the idempotency key
   * @param error - Error message
   */
  fail(keyHash: string, error: string): Promise<void>;

  /**
   * Check if key exists (read-only)
   *
   * @param key - Idempotency key
   * @returns True if key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get existing record
   *
   * @param key - Idempotency key
   * @returns Record if exists, null otherwise
   */
  get(key: string): Promise<IdempotencyRecord | null>;

  /**
   * Clean up expired idempotency records
   *
   * Scans for records where expiresAt < now and deletes them.
   * For Firestore: Use this sparingly, prefer TTL policy.
   * For in-memory: Call periodically to prevent memory leaks.
   *
   * @param batchSize - Maximum number of records to delete in one operation (default: 500)
   * @returns Cleanup result statistics
   */
  cleanup(batchSize?: number): Promise<CleanupResult>;

  /**
   * Get current TTL configuration
   */
  getTTLConfig(): IdempotencyTTLConfig;
}

// =============================================================================
// Constants & Defaults
// =============================================================================

/**
 * Default TTL configuration
 */
export const DEFAULT_TTL_CONFIG: IdempotencyTTLConfig = {
  defaultTTLSeconds: 86400, // 24 hours
  minTTLSeconds: 60, // 1 minute
  maxTTLSeconds: 604800, // 7 days
};

/**
 * Validate and normalize TTL seconds
 *
 * @param ttlSeconds - Requested TTL in seconds
 * @param config - TTL configuration
 * @returns Normalized TTL within min/max bounds
 */
function normalizeTTL(ttlSeconds: number | undefined, config: IdempotencyTTLConfig): number {
  const requested = ttlSeconds ?? config.defaultTTLSeconds;
  return Math.max(config.minTTLSeconds, Math.min(config.maxTTLSeconds, requested));
}

// =============================================================================
// Hash Functions
// =============================================================================

/**
 * Compute SHA-256 hash of an idempotency key
 *
 * This hash is used as the Firestore document ID to ensure:
 * - Consistent lookup regardless of key format
 * - Safe characters for document IDs
 * - Fixed length for efficient indexing
 *
 * @param key - Idempotency key to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashIdempotencyKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// =============================================================================
// Firestore Implementation
// =============================================================================

/**
 * Firestore-backed idempotency store
 *
 * Uses Firestore transactions for atomic check-and-set operations.
 * Collection: gwi_idempotency (top-level, not per-tenant)
 *
 * TTL Policy Setup (Production):
 * --------------------------------
 * Firestore supports automatic TTL deletion via the 'expiresAt' field.
 * To enable automatic cleanup in production:
 *
 * 1. Create a TTL policy on the collection:
 *    gcloud firestore fields ttls update expiresAt \
 *      --collection-group=gwi_idempotency \
 *      --enable-ttl
 *
 * 2. Verify TTL is enabled:
 *    gcloud firestore fields ttls list --collection-group=gwi_idempotency
 *
 * 3. Monitor cleanup in Firestore console or logs
 *
 * Note: Firestore TTL cleanup typically runs within 72 hours of expiration.
 * For immediate cleanup needs, use the cleanup() method.
 */
export class FirestoreIdempotencyStore implements IdempotencyStore {
  private db: Firestore;
  private ttlConfig: IdempotencyTTLConfig;

  constructor(db?: Firestore, ttlConfig?: Partial<IdempotencyTTLConfig>) {
    this.db = db ?? getFirestoreClient();
    this.ttlConfig = {
      ...DEFAULT_TTL_CONFIG,
      ...ttlConfig,
    };
  }

  /**
   * Get reference to idempotency collection
   */
  private idempotencyRef() {
    return this.db.collection(COLLECTIONS.IDEMPOTENCY);
  }

  /**
   * Get document reference for a key hash
   */
  private docRef(keyHash: string) {
    return this.idempotencyRef().doc(keyHash);
  }

  /**
   * Convert Firestore document to IdempotencyRecord
   */
  private docToRecord(data: FirebaseFirestore.DocumentData): IdempotencyRecord {
    return {
      keyHash: data.keyHash,
      key: data.key,
      tenantId: data.tenantId,
      runId: data.runId,
      status: data.status as IdempotencyStatus,
      result: data.result,
      createdAt: timestampToDate(data.createdAt)!,
      expiresAt: timestampToDate(data.expiresAt)!,
      payloadHash: data.payloadHash,
    };
  }

  async checkAndSet(
    key: string,
    tenantId: string,
    ttlSeconds?: number,
    payloadHash?: string
  ): Promise<CheckAndSetResult> {
    const keyHash = hashIdempotencyKey(key);
    const docRef = this.docRef(keyHash);
    const normalizedTTL = normalizeTTL(ttlSeconds, this.ttlConfig);

    const result = await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);

      // If record exists, return it
      if (snapshot.exists) {
        const existing = this.docToRecord(snapshot.data()!);

        // Validate payload hash if provided
        if (payloadHash && existing.payloadHash && payloadHash !== existing.payloadHash) {
          throw new Error(
            `Idempotency key collision: same key with different payload. ` +
            `Key: ${key}, Expected hash: ${existing.payloadHash}, Got: ${payloadHash}`
          );
        }

        return {
          isNew: false,
          record: existing,
        };
      }

      // Create new record
      const now = new Date();
      const expiresAt = new Date(now.getTime() + normalizedTTL * 1000);

      const newRecord: IdempotencyRecord = {
        keyHash,
        key,
        tenantId,
        status: 'pending',
        createdAt: now,
        expiresAt,
        payloadHash,
      };

      // Convert to Firestore format
      const docData = {
        keyHash,
        key,
        tenantId,
        status: 'pending',
        createdAt: dateToTimestamp(now)!,
        expiresAt: dateToTimestamp(expiresAt)!,
        payloadHash,
      };

      transaction.set(docRef, docData);

      return {
        isNew: true,
        record: newRecord,
      };
    });

    return result;
  }

  async complete(keyHash: string, runId: string, result?: unknown): Promise<void> {
    const docRef = this.docRef(keyHash);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);

      if (!snapshot.exists) {
        throw new Error(`Idempotency record not found: ${keyHash}`);
      }

      transaction.update(docRef, {
        status: 'completed',
        runId,
        result,
      });
    });
  }

  async fail(keyHash: string, error: string): Promise<void> {
    const docRef = this.docRef(keyHash);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);

      if (!snapshot.exists) {
        throw new Error(`Idempotency record not found: ${keyHash}`);
      }

      transaction.update(docRef, {
        status: 'failed',
        result: { error },
      });
    });
  }

  async exists(key: string): Promise<boolean> {
    const keyHash = hashIdempotencyKey(key);
    const snapshot = await this.docRef(keyHash).get();
    return snapshot.exists;
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const keyHash = hashIdempotencyKey(key);
    const snapshot = await this.docRef(keyHash).get();

    if (!snapshot.exists) {
      return null;
    }

    return this.docToRecord(snapshot.data()!);
  }

  async cleanup(batchSize = 500): Promise<CleanupResult> {
    const startedAt = new Date();
    let deletedCount = 0;
    let scannedCount = 0;

    const now = new Date();

    // Query for expired records
    // Note: This requires a composite index on (expiresAt, __name__)
    const expiredQuery = this.idempotencyRef()
      .where('expiresAt', '<', dateToTimestamp(now)!)
      .limit(batchSize);

    const snapshot = await expiredQuery.get();
    scannedCount = snapshot.size;

    if (snapshot.empty) {
      const completedAt = new Date();
      return {
        deletedCount: 0,
        scannedCount: 0,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };
    }

    // Delete expired records in a batch
    const batch = this.db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deletedCount++;
    });

    await batch.commit();

    const completedAt = new Date();
    return {
      deletedCount,
      scannedCount,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  getTTLConfig(): IdempotencyTTLConfig {
    return { ...this.ttlConfig };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory idempotency store for testing and development
 *
 * Provides same interface as Firestore implementation but uses Map storage.
 * Data is lost on restart.
 *
 * Memory Management:
 * ------------------
 * Call cleanup() periodically to prevent memory leaks from expired records.
 * Recommended: Run cleanup every 5-15 minutes in long-running processes.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private ttlConfig: IdempotencyTTLConfig;

  constructor(ttlConfig?: Partial<IdempotencyTTLConfig>) {
    this.ttlConfig = {
      ...DEFAULT_TTL_CONFIG,
      ...ttlConfig,
    };
  }

  async checkAndSet(
    key: string,
    tenantId: string,
    ttlSeconds?: number,
    payloadHash?: string
  ): Promise<CheckAndSetResult> {
    const keyHash = hashIdempotencyKey(key);
    const normalizedTTL = normalizeTTL(ttlSeconds, this.ttlConfig);

    // Check if record exists
    const existing = this.records.get(keyHash);

    if (existing) {
      // Validate payload hash if provided
      if (payloadHash && existing.payloadHash && payloadHash !== existing.payloadHash) {
        throw new Error(
          `Idempotency key collision: same key with different payload. ` +
          `Key: ${key}, Expected hash: ${existing.payloadHash}, Got: ${payloadHash}`
        );
      }

      return {
        isNew: false,
        record: existing,
      };
    }

    // Create new record
    const now = new Date();
    const expiresAt = new Date(now.getTime() + normalizedTTL * 1000);

    const newRecord: IdempotencyRecord = {
      keyHash,
      key,
      tenantId,
      status: 'pending',
      createdAt: now,
      expiresAt,
      payloadHash,
    };

    this.records.set(keyHash, newRecord);

    return {
      isNew: true,
      record: newRecord,
    };
  }

  async complete(keyHash: string, runId: string, result?: unknown): Promise<void> {
    const record = this.records.get(keyHash);

    if (!record) {
      throw new Error(`Idempotency record not found: ${keyHash}`);
    }

    record.status = 'completed';
    record.runId = runId;
    record.result = result;
  }

  async fail(keyHash: string, error: string): Promise<void> {
    const record = this.records.get(keyHash);

    if (!record) {
      throw new Error(`Idempotency record not found: ${keyHash}`);
    }

    record.status = 'failed';
    record.result = { error };
  }

  async exists(key: string): Promise<boolean> {
    const keyHash = hashIdempotencyKey(key);
    return this.records.has(keyHash);
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const keyHash = hashIdempotencyKey(key);
    return this.records.get(keyHash) ?? null;
  }

  async cleanup(batchSize = 500): Promise<CleanupResult> {
    const startedAt = new Date();
    let deletedCount = 0;
    let scannedCount = 0;

    const now = new Date();
    const expiredKeys: string[] = [];

    // Scan for expired records
    // Use Array.from to avoid downlevelIteration requirement
    const entries = Array.from(this.records.entries());
    for (const [keyHash, record] of entries) {
      scannedCount++;

      if (record.expiresAt < now) {
        expiredKeys.push(keyHash);
      }

      // Limit scan to batchSize to prevent long-running operations
      if (scannedCount >= batchSize) {
        break;
      }
    }

    // Delete expired records
    for (const keyHash of expiredKeys) {
      this.records.delete(keyHash);
      deletedCount++;
    }

    const completedAt = new Date();
    return {
      deletedCount,
      scannedCount,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  getTTLConfig(): IdempotencyTTLConfig {
    return { ...this.ttlConfig };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Options for creating an idempotency store
 */
export interface IdempotencyStoreOptions {
  /** Storage backend */
  backend: 'firestore' | 'memory';

  /** Optional Firestore instance (for testing) */
  db?: Firestore;

  /** Optional TTL configuration */
  ttlConfig?: Partial<IdempotencyTTLConfig>;
}

/**
 * Create idempotency store instance
 *
 * @param options - Store creation options
 * @returns IdempotencyStore instance
 */
export function createIdempotencyStore(
  options: IdempotencyStoreOptions | 'firestore' | 'memory',
  db?: Firestore
): IdempotencyStore {
  // Support legacy signature: createIdempotencyStore('memory') or createIdempotencyStore('firestore', db)
  if (typeof options === 'string') {
    if (options === 'firestore') {
      return new FirestoreIdempotencyStore(db);
    }
    return new InMemoryIdempotencyStore();
  }

  // New signature with options object
  if (options.backend === 'firestore') {
    return new FirestoreIdempotencyStore(options.db, options.ttlConfig);
  }
  return new InMemoryIdempotencyStore(options.ttlConfig);
}
