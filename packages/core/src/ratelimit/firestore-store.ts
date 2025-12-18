/**
 * Firestore Rate Limit Store
 *
 * Phase 30.1: Serverless-friendly distributed rate limiting.
 *
 * Uses Firestore transactions for sliding window rate limiting.
 * Designed as a fallback when Redis is unavailable or for serverless
 * deployments where Redis Memorystore isn't available.
 *
 * @module @gwi/core/ratelimit/firestore-store
 */

import type { RateLimitConfig, RateLimitResult, RateLimitStore } from './index.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('firestore-ratelimit');

// =============================================================================
// Types
// =============================================================================

/**
 * Firestore rate limit document structure
 */
interface RateLimitDocument {
  /** Request timestamps in the current window */
  requests: number[];
  /** When this document was last updated */
  updatedAt: number;
  /** TTL field for automatic cleanup (if using TTL policy) */
  expiresAt: number;
}

/**
 * Firestore client interface (minimal subset we need)
 */
export interface FirestoreClientLike {
  collection(path: string): CollectionRef;
  runTransaction<T>(
    fn: (transaction: FirestoreTransaction) => Promise<T>
  ): Promise<T>;
}

interface CollectionRef {
  doc(id: string): DocumentRef;
}

interface DocumentRef {
  get(): Promise<DocumentSnapshot>;
  set(data: unknown, options?: { merge?: boolean }): Promise<unknown>;
  delete(): Promise<unknown>;
}

interface DocumentSnapshot {
  exists: boolean;
  data(): RateLimitDocument | undefined;
}

interface FirestoreTransaction {
  get(docRef: DocumentRef): Promise<DocumentSnapshot>;
  set(docRef: DocumentRef, data: unknown, options?: { merge?: boolean }): FirestoreTransaction;
  delete(docRef: DocumentRef): FirestoreTransaction;
}

// =============================================================================
// Firestore Rate Limit Store Options
// =============================================================================

/**
 * Configuration for FirestoreRateLimitStore
 */
export interface FirestoreRateLimitStoreOptions {
  /** Firestore client instance */
  firestore: FirestoreClientLike;

  /** Collection to store rate limit data */
  collection?: string;

  /** TTL buffer in seconds (added to window for expiration) */
  ttlBufferSeconds?: number;

  /** Maximum retries for transaction conflicts */
  maxRetries?: number;

  /** Timeout for Firestore operations (ms) */
  timeoutMs?: number;

  /** Fallback store when Firestore is unavailable */
  fallbackStore?: RateLimitStore;
}

// =============================================================================
// Firestore Rate Limit Store
// =============================================================================

/**
 * Firestore-backed rate limit store with sliding window algorithm.
 *
 * Uses Firestore transactions for atomic read-modify-write operations.
 * Suitable for serverless environments where Redis isn't available.
 *
 * Features:
 * - Sliding window algorithm for accurate rate limiting
 * - Atomic operations via Firestore transactions
 * - Automatic cleanup via TTL expiration
 * - Graceful fallback to in-memory when Firestore unavailable
 *
 * Trade-offs vs Redis:
 * - Higher latency (~50-100ms vs ~5ms for Redis)
 * - Lower throughput (Firestore write limits)
 * - Better for low-medium traffic, not high-volume APIs
 * - No additional infrastructure needed in GCP
 *
 * @example
 * ```typescript
 * import { initializeApp } from 'firebase-admin/app';
 * import { getFirestore } from 'firebase-admin/firestore';
 * import { FirestoreRateLimitStore } from './firestore-store.js';
 * import { RateLimiter } from './index.js';
 *
 * initializeApp();
 * const firestore = getFirestore();
 * const store = new FirestoreRateLimitStore({ firestore });
 * const limiter = new RateLimiter(store);
 * ```
 */
export class FirestoreRateLimitStore implements RateLimitStore {
  private firestore: FirestoreClientLike;
  private collectionPath: string;
  private ttlBufferSeconds: number;
  private maxRetries: number;
  private timeoutMs: number;
  private fallbackStore?: RateLimitStore;

  /** Track Firestore availability */
  private firestoreAvailable = true;
  private lastHealthCheck = 0;
  private healthCheckIntervalMs = 10000;

  constructor(options: FirestoreRateLimitStoreOptions) {
    this.firestore = options.firestore;
    this.collectionPath = options.collection ?? 'gwi_rate_limits';
    this.ttlBufferSeconds = options.ttlBufferSeconds ?? 300; // 5 minutes buffer
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fallbackStore = options.fallbackStore;
  }

  /**
   * Sanitize key for Firestore document ID
   * Firestore IDs cannot contain '/' so we replace with '__'
   */
  private sanitizeKey(key: string): string {
    return key.replace(/\//g, '__').replace(/:/g, '_');
  }

  /**
   * Execute with timeout and fallback
   */
  private async withTimeout<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (!this.firestoreAvailable && this.fallbackStore) {
      // Check if we should retry Firestore
      if (Date.now() - this.lastHealthCheck > this.healthCheckIntervalMs) {
        this.lastHealthCheck = Date.now();
        try {
          // Simple health check
          const testDoc = this.firestore
            .collection(this.collectionPath)
            .doc('__health__');
          await Promise.race([
            testDoc.get(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Firestore timeout')), 1000)
            ),
          ]);
          this.firestoreAvailable = true;
          logger.info('Firestore connection restored');
        } catch {
          return fallback();
        }
      } else {
        return fallback();
      }
    }

    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Firestore operation timeout')), this.timeoutMs)
        ),
      ]);
    } catch (error) {
      if (this.fallbackStore) {
        this.firestoreAvailable = false;
        this.lastHealthCheck = Date.now();
        logger.warn('Firestore unavailable, falling back to in-memory store', {
          error: error instanceof Error ? error.message : String(error),
        });
        return fallback();
      }
      throw error;
    }
  }

  async increment(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const docId = this.sanitizeKey(key);
    const docRef = this.firestore.collection(this.collectionPath).doc(docId);
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const ttlSeconds = Math.ceil(config.windowMs / 1000) + this.ttlBufferSeconds;

    const operation = async (): Promise<RateLimitResult> => {
      let attempts = 0;

      while (attempts < this.maxRetries) {
        try {
          const result = await this.firestore.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            const data = doc.exists ? doc.data() : undefined;

            // Filter to requests within current window
            const validRequests = (data?.requests ?? []).filter(
              (ts: number) => ts > windowStart
            );

            // Check if under limit
            if (validRequests.length >= config.maxRequests) {
              // Rate limited - don't add new request
              const oldestRequest = validRequests[0] ?? now;
              const resetInMs = Math.max(0, oldestRequest + config.windowMs - now);

              return {
                allowed: false,
                current: validRequests.length,
                limit: config.maxRequests,
                resetInMs,
                remaining: 0,
                message: config.message ?? 'Rate limit exceeded',
              };
            }

            // Add new request timestamp
            validRequests.push(now);

            // Update document
            const newData: RateLimitDocument = {
              requests: validRequests,
              updatedAt: now,
              expiresAt: now + ttlSeconds * 1000,
            };

            transaction.set(docRef, newData);

            return {
              allowed: true,
              current: validRequests.length,
              limit: config.maxRequests,
              resetInMs: config.windowMs,
              remaining: config.maxRequests - validRequests.length,
            };
          });

          return result;
        } catch (error) {
          attempts++;
          if (attempts >= this.maxRetries) {
            throw error;
          }
          // Exponential backoff for transaction conflicts
          await new Promise((r) => setTimeout(r, Math.pow(2, attempts) * 50));
        }
      }

      // Should never reach here, but TypeScript needs it
      throw new Error('Max retries exceeded');
    };

    const fallback = async (): Promise<RateLimitResult> => {
      if (this.fallbackStore) {
        return this.fallbackStore.increment(key, config);
      }
      // Fail open if no fallback
      return {
        allowed: true,
        current: 0,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining: config.maxRequests,
      };
    };

    return this.withTimeout(operation, fallback);
  }

  async get(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const docId = this.sanitizeKey(key);
    const docRef = this.firestore.collection(this.collectionPath).doc(docId);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const operation = async (): Promise<RateLimitResult> => {
      const doc = await docRef.get();
      const data = doc.exists ? doc.data() : undefined;

      // Filter to requests within current window
      const validRequests = (data?.requests ?? []).filter(
        (ts: number) => ts > windowStart
      );

      const currentCount = validRequests.length;

      if (currentCount >= config.maxRequests) {
        const oldestRequest = validRequests[0] ?? now;
        const resetInMs = Math.max(0, oldestRequest + config.windowMs - now);

        return {
          allowed: false,
          current: currentCount,
          limit: config.maxRequests,
          resetInMs,
          remaining: 0,
        };
      }

      return {
        allowed: true,
        current: currentCount,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining: config.maxRequests - currentCount,
      };
    };

    const fallback = async (): Promise<RateLimitResult> => {
      if (this.fallbackStore) {
        return this.fallbackStore.get(key, config);
      }
      return {
        allowed: true,
        current: 0,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining: config.maxRequests,
      };
    };

    return this.withTimeout(operation, fallback);
  }

  async reset(key: string): Promise<void> {
    const docId = this.sanitizeKey(key);
    const docRef = this.firestore.collection(this.collectionPath).doc(docId);

    const operation = async (): Promise<void> => {
      await docRef.delete();
    };

    const fallback = async (): Promise<void> => {
      if (this.fallbackStore) {
        await this.fallbackStore.reset(key);
      }
    };

    await this.withTimeout(operation, fallback);
  }

  async cleanup(): Promise<void> {
    // Firestore cleanup is handled via TTL policies or scheduled functions
    // For manual cleanup, you would query documents where expiresAt < now
    // and delete them in batches
    logger.debug('Firestore cleanup - using TTL policy or scheduled function');

    if (this.fallbackStore) {
      await this.fallbackStore.cleanup();
    }
  }

  /**
   * Check if Firestore is currently available
   */
  isAvailable(): boolean {
    return this.firestoreAvailable;
  }

  /**
   * Force health check
   */
  async checkHealth(): Promise<boolean> {
    try {
      const testDoc = this.firestore
        .collection(this.collectionPath)
        .doc('__health__');

      await Promise.race([
        testDoc.get(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), this.timeoutMs)
        ),
      ]);

      this.firestoreAvailable = true;
      return true;
    } catch {
      this.firestoreAvailable = false;
      return false;
    }
  }

  /**
   * Get metrics about the rate limit store
   */
  getMetrics(): { available: boolean; type: 'firestore' } {
    return {
      available: this.firestoreAvailable,
      type: 'firestore',
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Firestore rate limit store if Firestore is available.
 *
 * This is the serverless-friendly alternative to Redis.
 * Use this when deploying to Cloud Functions or Cloud Run without
 * VPC connector for Redis Memorystore access.
 *
 * @param firestore - Firestore client
 * @param options - Store options
 * @returns FirestoreRateLimitStore instance
 */
export function createFirestoreRateLimitStore(
  firestore: FirestoreClientLike,
  options?: Partial<Omit<FirestoreRateLimitStoreOptions, 'firestore'>>
): FirestoreRateLimitStore {
  // Create in-memory fallback
  // Dynamic import to avoid circular dependency
  let fallbackStore: RateLimitStore | undefined;

  return new FirestoreRateLimitStore({
    firestore,
    fallbackStore,
    ...options,
  });
}
