/**
 * Token Bucket Rate Limiter
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Implements token bucket algorithm for rate limiting webhooks.
 * Default: 100 webhooks/minute per tenant per source.
 *
 * @module @gwi/webhook-receiver/ratelimit
 */

import { RateLimitError } from '../types.js';

/**
 * Token bucket state
 */
interface TokenBucket {
  /** Current number of tokens */
  tokens: number;
  /** Last refill timestamp (ms) */
  lastRefill: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum tokens in bucket (burst capacity) */
  maxTokens: number;
  /** Refill rate (tokens per second) */
  refillRate: number;
  /** Cleanup interval in ms */
  cleanupIntervalMs: number;
}

/**
 * Default configuration: 100 webhooks/minute per tenant per source
 */
export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxTokens: 100,
  refillRate: 100 / 60, // ~1.67 tokens per second
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current tokens remaining */
  remaining: number;
  /** Time until bucket refill (ms) */
  resetInMs: number;
  /** Maximum tokens */
  limit: number;
}

/**
 * Token Bucket Rate Limiter
 *
 * Implements per-tenant, per-source rate limiting using token bucket algorithm.
 * Tokens are refilled continuously at a fixed rate.
 */
export class RateLimiter {
  private readonly buckets: Map<string, TokenBucket> = new Map();
  private readonly config: RateLimiterConfig;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      ...DEFAULT_RATE_LIMITER_CONFIG,
      ...config,
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Create a bucket key for tenant + source
   */
  private createKey(tenantId: string, source: string): string {
    return `${tenantId}:${source}`;
  }

  /**
   * Get or create a token bucket for a key
   */
  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.config.refillRate;

    bucket.tokens = Math.min(this.config.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Check if a request is allowed and consume a token if so
   *
   * @param tenantId - Tenant ID
   * @param source - Webhook source
   * @returns Rate limit result
   */
  check(tenantId: string, source: string): RateLimitResult {
    const key = this.createKey(tenantId, source);
    const bucket = this.getBucket(key);

    // Refill based on elapsed time
    this.refillBucket(bucket);

    // Calculate reset time (time until bucket is full)
    const tokensNeeded = this.config.maxTokens - bucket.tokens;
    const resetInMs = tokensNeeded > 0
      ? Math.ceil((tokensNeeded / this.config.refillRate) * 1000)
      : 0;

    // Check if we have tokens available
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetInMs,
        limit: this.config.maxTokens,
      };
    }

    // Rate limited
    return {
      allowed: false,
      remaining: 0,
      resetInMs: Math.ceil((1 / this.config.refillRate) * 1000), // Time until 1 token
      limit: this.config.maxTokens,
    };
  }

  /**
   * Check rate limit and throw if exceeded
   *
   * @param tenantId - Tenant ID
   * @param source - Webhook source
   * @throws RateLimitError if rate limited
   */
  checkLimit(tenantId: string, source: string): void {
    const result = this.check(tenantId, source);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil(result.resetInMs / 1000);
      throw new RateLimitError(
        `Rate limit exceeded for ${source} webhooks. Try again in ${retryAfterSeconds} seconds.`,
        source,
        retryAfterSeconds
      );
    }
  }

  /**
   * Get current rate limit status without consuming a token
   */
  status(tenantId: string, source: string): RateLimitResult {
    const key = this.createKey(tenantId, source);
    const bucket = this.getBucket(key);

    // Refill based on elapsed time
    this.refillBucket(bucket);

    const tokensNeeded = this.config.maxTokens - bucket.tokens;
    const resetInMs = tokensNeeded > 0
      ? Math.ceil((tokensNeeded / this.config.refillRate) * 1000)
      : 0;

    return {
      allowed: bucket.tokens >= 1,
      remaining: Math.floor(bucket.tokens),
      resetInMs,
      limit: this.config.maxTokens,
    };
  }

  /**
   * Reset rate limit for a tenant + source
   */
  reset(tenantId: string, source: string): void {
    const key = this.createKey(tenantId, source);
    this.buckets.delete(key);
  }

  /**
   * Reset all rate limits for a tenant
   */
  resetTenant(tenantId: string): void {
    const prefix = `${tenantId}:`;

    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Start periodic cleanup of stale buckets
   */
  private startCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't block process exit
    if (this.cleanupIntervalId.unref) {
      this.cleanupIntervalId.unref();
    }
  }

  /**
   * Clean up stale buckets (those that have been full for a while)
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThresholdMs = this.config.cleanupIntervalMs * 2;

    for (const [key, bucket] of this.buckets) {
      // Refill to check if bucket is full
      this.refillBucket(bucket);

      // If bucket is full and hasn't been used recently, remove it
      if (
        bucket.tokens >= this.config.maxTokens &&
        now - bucket.lastRefill > staleThresholdMs
      ) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Get the number of active buckets (for monitoring)
   */
  get bucketCount(): number {
    return this.buckets.size;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let rateLimiterInstance: RateLimiter | null = null;

/**
 * Get the global rate limiter instance
 */
export function getRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config);
  }
  return rateLimiterInstance;
}

/**
 * Reset the global rate limiter (for testing)
 */
export function resetRateLimiter(): void {
  if (rateLimiterInstance) {
    rateLimiterInstance.stop();
    rateLimiterInstance = null;
  }
}
