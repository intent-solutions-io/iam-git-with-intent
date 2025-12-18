/**
 * Redis Rate Limit Store
 *
 * Phase 30: Distributed rate limiting for multi-instance deployments.
 *
 * Uses Redis sorted sets for sliding window rate limiting.
 * Supports Redis Cluster and Redis Sentinel for high availability.
 *
 * @module @gwi/core/ratelimit/redis-store
 */

import type { RateLimitConfig, RateLimitResult, RateLimitStore } from './index.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('redis-ratelimit');

// =============================================================================
// Redis Client Interface (avoids direct ioredis dependency)
// =============================================================================

/**
 * Minimal Redis client interface
 *
 * Compatible with ioredis, node-redis, and other Redis clients.
 * Pass any client that implements these methods.
 */
export interface RedisClientLike {
  /**
   * Add member with score to sorted set
   */
  zadd(key: string, score: number, member: string): Promise<number>;

  /**
   * Remove members by score range
   */
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;

  /**
   * Count members in sorted set
   */
  zcard(key: string): Promise<number>;

  /**
   * Get members in score range
   */
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;

  /**
   * Delete key
   */
  del(key: string): Promise<number>;

  /**
   * Set key expiration
   */
  expire(key: string, seconds: number): Promise<number>;

  /**
   * Execute Lua script
   */
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// =============================================================================
// Lua Scripts (atomic operations)
// =============================================================================

/**
 * Lua script for atomic sliding window increment
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = current timestamp (ms)
 * ARGV[2] = window size (ms)
 * ARGV[3] = max requests
 * ARGV[4] = unique request ID
 * ARGV[5] = TTL (seconds)
 *
 * Returns: [allowed (0/1), current_count, remaining]
 */
const SLIDING_WINDOW_INCREMENT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local request_id = ARGV[4]
local ttl_seconds = tonumber(ARGV[5])

local window_start = now - window_ms

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current entries in window
local current_count = redis.call('ZCARD', key)

if current_count >= max_requests then
  -- Rate limited
  return {0, current_count, 0}
end

-- Add new entry (score = timestamp, member = unique ID)
redis.call('ZADD', key, now, request_id)

-- Set/update TTL
redis.call('EXPIRE', key, ttl_seconds)

local new_count = current_count + 1
local remaining = max_requests - new_count

return {1, new_count, remaining}
`;

/**
 * Lua script for getting current count without incrementing
 */
const SLIDING_WINDOW_GET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])

local window_start = now - window_ms

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current entries
local current_count = redis.call('ZCARD', key)

local remaining = math.max(0, max_requests - current_count)
local allowed = current_count < max_requests and 1 or 0

return {allowed, current_count, remaining}
`;

// =============================================================================
// Redis Rate Limit Store
// =============================================================================

/**
 * Redis-backed rate limit store options
 */
export interface RedisRateLimitStoreOptions {
  /** Redis client instance */
  client: RedisClientLike;

  /** Key prefix for rate limit entries */
  keyPrefix?: string;

  /** Default TTL in seconds (should be >= max window size) */
  defaultTTLSeconds?: number;

  /** Generate unique request IDs (default: random UUID-like) */
  generateRequestId?: () => string;

  /** Fallback store when Redis is unavailable */
  fallbackStore?: RateLimitStore;

  /** Timeout for Redis operations (ms) */
  timeoutMs?: number;
}

/**
 * Redis-backed rate limit store with sliding window algorithm
 *
 * Uses Redis sorted sets for O(log N) operations and atomic Lua scripts
 * for consistency across distributed instances.
 *
 * Features:
 * - Sliding window algorithm (more accurate than fixed windows)
 * - Atomic operations via Lua scripts
 * - Automatic cleanup of expired entries
 * - Graceful fallback to in-memory when Redis unavailable
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { RedisRateLimitStore } from './redis-store.js';
 * import { RateLimiter } from './index.js';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const store = new RedisRateLimitStore({ client: redis });
 * const limiter = new RateLimiter(store);
 * ```
 */
export class RedisRateLimitStore implements RateLimitStore {
  private client: RedisClientLike;
  private keyPrefix: string;
  private generateRequestId: () => string;
  private fallbackStore?: RateLimitStore;
  private timeoutMs: number;

  /** Track Redis availability */
  private redisAvailable = true;
  private lastHealthCheck = 0;
  private healthCheckIntervalMs = 5000;

  constructor(options: RedisRateLimitStoreOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? 'gwi:ratelimit:';
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.fallbackStore = options.fallbackStore;

    // Default request ID generator (timestamp + random suffix)
    this.generateRequestId = options.generateRequestId ?? (() => {
      const ts = Date.now().toString(36);
      const rand = Math.random().toString(36).slice(2, 10);
      return `${ts}-${rand}`;
    });
  }

  /**
   * Get full Redis key
   */
  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Execute with timeout and fallback
   */
  private async withTimeout<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (!this.redisAvailable && this.fallbackStore) {
      // Check if we should retry Redis
      if (Date.now() - this.lastHealthCheck > this.healthCheckIntervalMs) {
        this.lastHealthCheck = Date.now();
        try {
          // Attempt a simple operation to check health
          await Promise.race([
            this.client.zcard(`${this.keyPrefix}__health__`),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Redis timeout')), 500)
            ),
          ]);
          this.redisAvailable = true;
          logger.info('Redis connection restored');
        } catch {
          // Still unavailable
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
          setTimeout(() => reject(new Error('Redis operation timeout')), this.timeoutMs)
        ),
      ]);
    } catch (error) {
      if (this.fallbackStore) {
        this.redisAvailable = false;
        this.lastHealthCheck = Date.now();
        logger.warn('Redis unavailable, falling back to in-memory store', {
          error: error instanceof Error ? error.message : String(error),
        });
        return fallback();
      }
      throw error;
    }
  }

  async increment(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redisKey = this.getKey(key);
    const now = Date.now();
    const requestId = this.generateRequestId();
    const ttlSeconds = Math.ceil(config.windowMs / 1000) + 60; // Add 60s buffer

    const operation = async (): Promise<RateLimitResult> => {
      const result = await this.client.eval(
        SLIDING_WINDOW_INCREMENT_SCRIPT,
        1,
        redisKey,
        now,
        config.windowMs,
        config.maxRequests,
        requestId,
        ttlSeconds
      ) as [number, number, number];

      const [allowed, current, remaining] = result;

      return {
        allowed: allowed === 1,
        current,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining,
        message: allowed === 0 ? (config.message || 'Rate limit exceeded') : undefined,
      };
    };

    const fallback = async (): Promise<RateLimitResult> => {
      if (this.fallbackStore) {
        return this.fallbackStore.increment(key, config);
      }
      // If no fallback, allow the request (fail open)
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
    const redisKey = this.getKey(key);
    const now = Date.now();

    const operation = async (): Promise<RateLimitResult> => {
      const result = await this.client.eval(
        SLIDING_WINDOW_GET_SCRIPT,
        1,
        redisKey,
        now,
        config.windowMs,
        config.maxRequests
      ) as [number, number, number];

      const [allowed, current, remaining] = result;

      return {
        allowed: allowed === 1,
        current,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining,
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
    const redisKey = this.getKey(key);

    const operation = async (): Promise<void> => {
      await this.client.del(redisKey);
    };

    const fallback = async (): Promise<void> => {
      if (this.fallbackStore) {
        await this.fallbackStore.reset(key);
      }
    };

    await this.withTimeout(operation, fallback);
  }

  async cleanup(): Promise<void> {
    // Redis automatically cleans up via TTL
    // If using fallback, clean that up too
    if (this.fallbackStore) {
      await this.fallbackStore.cleanup();
    }
  }

  /**
   * Check if Redis is currently available
   */
  isAvailable(): boolean {
    return this.redisAvailable;
  }

  /**
   * Force health check
   */
  async checkHealth(): Promise<boolean> {
    try {
      await Promise.race([
        this.client.zcard(`${this.keyPrefix}__health__`),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), this.timeoutMs)
        ),
      ]);
      this.redisAvailable = true;
      return true;
    } catch {
      this.redisAvailable = false;
      return false;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Try to load ioredis module dynamically
 * Returns null if not available
 */
async function tryLoadIoredis(): Promise<{ default: unknown } | null> {
  try {
    // Use Function constructor to avoid static analysis of the import
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return await dynamicImport('ioredis');
  } catch {
    return null;
  }
}

/**
 * Options for createRateLimitStore factory
 */
export interface CreateRateLimitStoreOptions {
  /** Firestore client for fallback (optional) */
  firestore?: unknown;
  /** Custom fallback store */
  fallbackStore?: RateLimitStore;
  /** Disable Firestore fallback even if available */
  disableFirestore?: boolean;
}

/**
 * Create a rate limit store with automatic fallback chain.
 *
 * Fallback priority:
 * 1. Redis (if REDIS_URL configured and ioredis available)
 * 2. Firestore (if firestore client provided)
 * 3. In-memory (always available)
 *
 * Note: Requires ioredis package to be installed for Redis support.
 * If ioredis is not available, falls back to next option.
 *
 * @param options - Configuration options
 * @returns Rate limit store (Redis, Firestore, or in-memory)
 */
export async function createRateLimitStore(
  options?: CreateRateLimitStoreOptions | RateLimitStore
): Promise<RateLimitStore> {
  // Handle legacy signature where first arg was fallbackStore
  const opts: CreateRateLimitStoreOptions =
    options && 'increment' in options
      ? { fallbackStore: options as RateLimitStore }
      : (options as CreateRateLimitStoreOptions) ?? {};

  const redisUrl = process.env.REDIS_URL;
  const { InMemoryRateLimitStore } = await import('./index.js');

  // Create the base in-memory store
  const memoryStore = opts.fallbackStore ?? new InMemoryRateLimitStore();

  // Try to create Firestore fallback if available
  let firestoreFallback: RateLimitStore | undefined;
  if (opts.firestore && !opts.disableFirestore) {
    try {
      const { FirestoreRateLimitStore } = await import('./firestore-store.js');
      firestoreFallback = new FirestoreRateLimitStore({
        firestore: opts.firestore as import('./firestore-store.js').FirestoreClientLike,
        fallbackStore: memoryStore,
      });
      logger.info('Firestore rate limit store available as fallback');
    } catch (error) {
      logger.warn('Failed to initialize Firestore rate limit store', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // The fallback chain: Firestore → In-memory
  const fallbackStore = firestoreFallback ?? memoryStore;

  if (!redisUrl) {
    if (firestoreFallback) {
      logger.info('REDIS_URL not configured, using Firestore rate limiting');
      return firestoreFallback;
    }
    logger.info('REDIS_URL not configured, using in-memory rate limiting');
    return memoryStore;
  }

  try {
    // Dynamic import to avoid bundling ioredis when not needed
    const ioredis = await tryLoadIoredis();

    if (!ioredis) {
      logger.warn('ioredis not installed, using fallback rate limiting');
      return fallbackStore;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Redis = (ioredis as any).default || ioredis;
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // Stop retrying
        return Math.min(times * 100, 1000);
      },
      enableOfflineQueue: false,
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    logger.info('Redis rate limit store initialized', {
      host: client.options?.host,
      port: client.options?.port,
      fallback: firestoreFallback ? 'firestore' : 'memory',
    });

    return new RedisRateLimitStore({
      client,
      fallbackStore,
    });
  } catch (error) {
    logger.warn('Failed to connect to Redis, using fallback rate limiting', {
      error: error instanceof Error ? error.message : String(error),
      fallback: firestoreFallback ? 'firestore' : 'memory',
    });

    return fallbackStore;
  }
}
