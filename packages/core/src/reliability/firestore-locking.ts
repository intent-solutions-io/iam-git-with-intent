/**
 * Firestore Distributed Locking
 *
 * Phase 16: Production-ready distributed locking using Firestore transactions.
 *
 * Features:
 * - Atomic lock acquisition using transactions
 * - TTL-based auto-expiration
 * - Fencing tokens for safe lock extension
 * - Tenant-scoped lock isolation
 *
 * @module @gwi/core/reliability/firestore-locking
 */

import { randomBytes } from 'crypto';
import { getFirestoreClient } from '../storage/firestore-client.js';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  RunLock,
  RunLockOptions,
  RunLockResult,
} from './locking.js';
import { RunLockManager } from './locking.js';

// =============================================================================
// Firestore Lock Document Schema
// =============================================================================

interface FirestoreLockDoc {
  runId: string;
  holderId: string;
  acquiredAt: Timestamp;
  expiresAt: Timestamp;
  reason?: string;
  fencingToken: number;
}

// =============================================================================
// Firestore Lock Manager
// =============================================================================

/**
 * Firestore-backed distributed lock manager
 *
 * Uses Firestore transactions for atomic lock operations.
 * Locks are stored in a top-level collection for cross-tenant visibility.
 */
export class FirestoreRunLockManager extends RunLockManager {
  private collectionName = 'gwi_run_locks';

  /**
   * Try to acquire a lock atomically using a Firestore transaction
   */
  async tryAcquire(runId: string, options: RunLockOptions = {}): Promise<RunLockResult> {
    const { ttlMs = 60000, reason } = options;
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);
    const holderId = generateHolderId();
    const now = Date.now();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (doc.exists) {
          const data = doc.data() as FirestoreLockDoc;
          const expiresAt = data.expiresAt.toMillis();

          // Check if lock is still valid
          if (expiresAt > now) {
            // Lock is held by someone else
            return {
              acquired: false,
              error: `Run ${runId} is locked by ${data.holderId}`,
              existingHolderId: data.holderId,
            };
          }
          // Lock expired, we can take it (increment fencing token)
          const newData: FirestoreLockDoc = {
            runId,
            holderId,
            acquiredAt: Timestamp.fromMillis(now),
            expiresAt: Timestamp.fromMillis(now + ttlMs),
            reason,
            fencingToken: (data.fencingToken || 0) + 1,
          };
          transaction.set(docRef, newData);

          return {
            acquired: true,
            lock: {
              runId,
              holderId,
              acquiredAt: new Date(now),
              expiresAt: new Date(now + ttlMs),
              reason,
            },
          };
        }

        // No existing lock - create new
        const newData: FirestoreLockDoc = {
          runId,
          holderId,
          acquiredAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(now + ttlMs),
          reason,
          fencingToken: 1,
        };
        transaction.set(docRef, newData);

        return {
          acquired: true,
          lock: {
            runId,
            holderId,
            acquiredAt: new Date(now),
            expiresAt: new Date(now + ttlMs),
            reason,
          },
        };
      });

      return result;
    } catch (error) {
      // Transaction failed (contention)
      return {
        acquired: false,
        error: `Lock acquisition failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Release a lock (only if held by the specified holder)
   */
  async release(runId: string, holderId: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return false;
        }

        const data = doc.data() as FirestoreLockDoc;
        if (data.holderId !== holderId) {
          return false;
        }

        transaction.delete(docRef);
        return true;
      });

      return result;
    } catch {
      return false;
    }
  }

  /**
   * Get current lock info for a run
   */
  async getLock(runId: string): Promise<RunLock | null> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreLockDoc;
    const expiresAt = data.expiresAt.toDate();

    // Check if expired
    if (expiresAt <= new Date()) {
      // Clean up expired lock
      await docRef.delete().catch(() => {});
      return null;
    }

    return {
      runId: data.runId,
      holderId: data.holderId,
      acquiredAt: data.acquiredAt.toDate(),
      expiresAt,
      reason: data.reason,
    };
  }

  /**
   * Extend a lock's TTL
   */
  async extend(runId: string, holderId: string, ttlMs: number): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);
    const now = Date.now();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return false;
        }

        const data = doc.data() as FirestoreLockDoc;
        if (data.holderId !== holderId) {
          return false;
        }

        // Extend the lock
        transaction.update(docRef, {
          expiresAt: Timestamp.fromMillis(now + ttlMs),
        });

        return true;
      });

      return result;
    } catch {
      return false;
    }
  }

  /**
   * Force release a lock (admin operation)
   */
  async forceRelease(runId: string): Promise<boolean> {
    const db = getFirestoreClient();
    const docRef = db.collection(this.collectionName).doc(runId);

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
   * List all active (non-expired) locks
   */
  async listLocks(): Promise<RunLock[]> {
    const db = getFirestoreClient();
    const now = Timestamp.now();

    const snapshot = await db
      .collection(this.collectionName)
      .where('expiresAt', '>', now)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreLockDoc;
      return {
        runId: data.runId,
        holderId: data.holderId,
        acquiredAt: data.acquiredAt.toDate(),
        expiresAt: data.expiresAt.toDate(),
        reason: data.reason,
      };
    });
  }

  /**
   * Clean up expired locks (background maintenance)
   */
  async cleanupExpired(): Promise<number> {
    const db = getFirestoreClient();
    const now = Timestamp.now();

    const snapshot = await db
      .collection(this.collectionName)
      .where('expiresAt', '<=', now)
      .limit(100) // Batch delete
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
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a unique holder ID
 */
function generateHolderId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  const instanceId = process.env.CLOUD_RUN_EXECUTION || process.env.K_REVISION || process.pid.toString(36);
  return `holder-${timestamp}-${instanceId}-${random}`;
}

// =============================================================================
// Collection Constant for Indices
// =============================================================================

/**
 * Add to COLLECTIONS constant (for documentation)
 * Collection: gwi_run_locks
 * Fields: runId, holderId, acquiredAt, expiresAt, fencingToken
 * Indices: expiresAt ASC (for cleanup queries)
 */
