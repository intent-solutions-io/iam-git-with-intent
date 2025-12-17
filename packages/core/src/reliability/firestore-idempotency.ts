/**
 * Firestore Idempotency Store
 *
 * Phase 16: Production-ready idempotency storage using Firestore.
 *
 * Features:
 * - Atomic record creation with transactions
 * - TTL-based auto-expiration
 * - Run-scoped queries for replay analysis
 * - Efficient cleanup of expired records
 *
 * @module @gwi/core/reliability/firestore-idempotency
 */

import { getFirestoreClient } from '../storage/firestore-client.js';
import { Timestamp } from 'firebase-admin/firestore';
import type { IdempotencyKey, IdempotencyRecord, IdempotencyOptions } from './idempotency.js';
import { IdempotencyStore } from './idempotency.js';

// =============================================================================
// Firestore Idempotency Document Schema
// =============================================================================

interface FirestoreIdempotencyDoc {
  key: string;
  runId: string;
  stepId: string;
  operation: string;
  inputHash: string;
  status: 'pending' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt: Timestamp;
}

// =============================================================================
// Firestore Idempotency Store
// =============================================================================

/**
 * Firestore-backed idempotency store
 *
 * Uses Firestore transactions for atomic operations.
 * Records are stored in a top-level collection.
 */
export class FirestoreIdempotencyStore extends IdempotencyStore {
  private collectionName = 'gwi_idempotency';

  /**
   * Get an existing idempotency record
   */
  async get(key: string): Promise<IdempotencyRecord | null> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(this.sanitizeKey(key));

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreIdempotencyDoc;
    const expiresAt = data.expiresAt.toDate();

    // Check expiration
    if (expiresAt <= new Date()) {
      // Clean up expired record
      await docRef.delete().catch(() => {});
      return null;
    }

    return this.toRecord(data);
  }

  /**
   * Create a pending idempotency record atomically
   */
  async create(
    key: string,
    components: IdempotencyKey,
    options: IdempotencyOptions = {}
  ): Promise<{ record: IdempotencyRecord; created: boolean }> {
    const { ttlMs = 24 * 60 * 60 * 1000 } = options; // 24 hours default
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(this.sanitizeKey(key));
    const now = Date.now();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (doc.exists) {
          const data = doc.data() as FirestoreIdempotencyDoc;
          const expiresAt = data.expiresAt.toMillis();

          // Check if expired
          if (expiresAt <= now) {
            // Expired - overwrite with new record
            const newData: FirestoreIdempotencyDoc = {
              key,
              runId: components.runId,
              stepId: components.stepId,
              operation: components.operation,
              inputHash: components.inputHash,
              status: 'pending',
              createdAt: Timestamp.fromMillis(now),
              expiresAt: Timestamp.fromMillis(now + ttlMs),
            };
            transaction.set(docRef, newData);

            return {
              record: this.toRecord(newData),
              created: true,
            };
          }

          // Not expired - return existing
          return {
            record: this.toRecord(data),
            created: false,
          };
        }

        // Create new record
        const newData: FirestoreIdempotencyDoc = {
          key,
          runId: components.runId,
          stepId: components.stepId,
          operation: components.operation,
          inputHash: components.inputHash,
          status: 'pending',
          createdAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(now + ttlMs),
        };
        transaction.set(docRef, newData);

        return {
          record: this.toRecord(newData),
          created: true,
        };
      });

      return result;
    } catch (error) {
      // Transaction failed - could be contention
      // Try to get existing record
      const existing = await this.get(key);
      if (existing) {
        return { record: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * Complete an idempotency record with success
   */
  async complete(key: string, result: unknown): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(this.sanitizeKey(key));

    try {
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        if (!doc.exists) {
          throw new Error('Record not found');
        }

        transaction.update(docRef, {
          status: 'completed',
          result,
          completedAt: Timestamp.now(),
        });
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Complete an idempotency record with failure
   */
  async fail(key: string, error: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(this.sanitizeKey(key));

    try {
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        if (!doc.exists) {
          throw new Error('Record not found');
        }

        transaction.update(docRef, {
          status: 'failed',
          error,
          completedAt: Timestamp.now(),
        });
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an idempotency record
   */
  async delete(key: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(this.sanitizeKey(key));

    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        return false;
      }

      await docRef.delete();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all records for a run
   */
  async listByRun(runId: string): Promise<IdempotencyRecord[]> {
    const db = getFirestoreClient();
    const now = Timestamp.now();

    const snapshot = await db
      .collection(this.collectionName)
      .where('runId', '==', runId)
      .where('expiresAt', '>', now)
      .get();

    return snapshot.docs.map((doc) => this.toRecord(doc.data() as FirestoreIdempotencyDoc));
  }

  /**
   * Cleanup expired records
   */
  async cleanup(): Promise<number> {
    const db = getFirestoreClient();
    const now = Timestamp.now();

    // Query for expired records in batches
    const snapshot = await db
      .collection(this.collectionName)
      .where('expiresAt', '<=', now)
      .limit(100)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    return snapshot.size;
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  /**
   * Sanitize key for Firestore document ID
   * Firestore doesn't allow '/' in document IDs
   */
  private sanitizeKey(key: string): string {
    return key.replace(/\//g, '_').replace(/:/g, '-');
  }

  /**
   * Convert Firestore document to IdempotencyRecord
   */
  private toRecord(data: FirestoreIdempotencyDoc): IdempotencyRecord {
    return {
      key: data.key,
      keyComponents: {
        runId: data.runId,
        stepId: data.stepId,
        operation: data.operation,
        inputHash: data.inputHash,
      },
      status: data.status,
      result: data.result,
      error: data.error,
      createdAt: data.createdAt.toDate(),
      completedAt: data.completedAt?.toDate(),
      expiresAt: data.expiresAt.toDate(),
    };
  }
}

// =============================================================================
// Collection Constant for Indices
// =============================================================================

/**
 * Add to COLLECTIONS constant (for documentation)
 * Collection: gwi_idempotency
 * Fields: key, runId, stepId, operation, inputHash, status, result, error, createdAt, completedAt, expiresAt
 * Indices:
 *   - runId ASC, expiresAt ASC (for listByRun)
 *   - expiresAt ASC (for cleanup)
 */
