/**
 * Rate Limiter with Token Bucket Algorithm
 *
 * Implements rate limiting with token bucket algorithm, supporting:
 * - Per-connector rate limits
 * - Retry-After header respect
 * - Proactive throttling
 * - Sliding window support
 *
 * Based on production patterns from:
 * - 014-DR-DSGN-connector-abstraction.md (Layer 3: HTTP Transport)
 * - 011-DR-PATT-production-connector-patterns.md (Rate limiting patterns)
 *
 * @module @gwi/core/connectors/utils
 */

import { z } from 'zod';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Rate limit configuration
 */
export const RateLimitConfigSchema = z.object({
  /** Maximum number of tokens in the bucket */
  maxTokens: z.number().int().min(1).default(100),

  /** Number of tokens to refill per interval */
  refillRate: z.number().int().min(1).default(10),

  /** Refill interval in milliseconds (default: 1000ms = 1s) */
  refillIntervalMs: z.number().int().min(1).default(1000),

  /** Tokens consumed per request (default: 1) */
  tokensPerRequest: z.number().int().min(1).default(1),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
    public readonly key: string,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Rate limit metrics
 */
export interface RateLimitMetrics {
  /** Total requests made */
  totalRequests: number;

  /** Total requests rate limited */
  rateLimitedRequests: number;

  /** Total time spent waiting (ms) */
  totalWaitTimeMs: number;

  /** Average tokens available */
  averageTokensAvailable: number;

  /** Last refill time */
  lastRefillTime: string;
}

/**
 * Token bucket state
 */
interface TokenBucket {
  /** Current number of tokens */
  tokens: number;

  /** Last refill timestamp */
  lastRefillTime: number;

  /** Metrics for this bucket */
  metrics: RateLimitMetrics;
}

// =============================================================================
// Rate Limiter Interface
// =============================================================================

/**
 * Interface for rate limiters
 */
export interface IRateLimiter {
  /**
   * Check if request can proceed (throws if rate limited)
   *
   * @param key - Rate limit key (e.g., connector name)
   * @throws RateLimitError if rate limit exceeded
   */
  checkLimit(key: string): Promise<void>;

  /**
   * Record a successful request (consumes tokens)
   *
   * @param key - Rate limit key
   */
  recordRequest(key: string): void;

  /**
   * Handle a rate limit error from the API
   *
   * @param key - Rate limit key
   * @param retryAfterMs - Retry-After duration in milliseconds
   */
  handleRateLimit(key: string, retryAfterMs: number): Promise<void>;

  /**
   * Get current metrics for a key
   *
   * @param key - Rate limit key
   */
  getMetrics(key: string): RateLimitMetrics | null;

  /**
   * Reset rate limiter for a key
   *
   * @param key - Rate limit key
   */
  reset(key: string): void;

  /**
   * Get available tokens for a key
   *
   * @param key - Rate limit key
   */
  getAvailableTokens(key: string): number;
}

// =============================================================================
// Token Bucket Rate Limiter Implementation
// =============================================================================

/**
 * Token bucket rate limiter
 *
 * Algorithm:
 * 1. Each key has a bucket with maxTokens capacity
 * 2. Tokens refill at refillRate tokens per refillIntervalMs
 * 3. Each request consumes tokensPerRequest tokens
 * 4. If insufficient tokens, request is blocked until tokens available
 */
export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets: Map<string, TokenBucket> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = RateLimitConfigSchema.parse(config ?? {});
  }

  /**
   * Get or create a token bucket for a key
   */
  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefillTime: Date.now(),
        metrics: {
          totalRequests: 0,
          rateLimitedRequests: 0,
          totalWaitTimeMs: 0,
          averageTokensAvailable: this.config.maxTokens,
          lastRefillTime: new Date().toISOString(),
        },
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefillTime;

    if (elapsedMs < this.config.refillIntervalMs) {
      // Not enough time elapsed for refill
      return;
    }

    // Calculate number of refill intervals that have passed
    const intervals = Math.floor(elapsedMs / this.config.refillIntervalMs);

    // Calculate tokens to add
    const tokensToAdd = intervals * this.config.refillRate;

    // Refill bucket (cap at maxTokens)
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.config.maxTokens);

    // Update last refill time (account for partial intervals)
    bucket.lastRefillTime += intervals * this.config.refillIntervalMs;

    // Update metrics
    bucket.metrics.lastRefillTime = new Date().toISOString();
  }

  /**
   * Calculate wait time until enough tokens are available
   *
   * @param bucket - Token bucket
   * @param tokensNeeded - Number of tokens needed
   * @returns Wait time in milliseconds
   */
  private calculateWaitTime(bucket: TokenBucket, tokensNeeded: number): number {
    const tokensShort = tokensNeeded - bucket.tokens;

    if (tokensShort <= 0) {
      return 0; // Already have enough tokens
    }

    // Calculate how many refill intervals needed
    const intervalsNeeded = Math.ceil(tokensShort / this.config.refillRate);

    return intervalsNeeded * this.config.refillIntervalMs;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if request can proceed
   */
  async checkLimit(key: string): Promise<void> {
    const bucket = this.getBucket(key);

    // Refill tokens based on elapsed time
    this.refillTokens(bucket);

    const tokensNeeded = this.config.tokensPerRequest;

    // Check if we have enough tokens
    if (bucket.tokens >= tokensNeeded) {
      // Update metrics
      bucket.metrics.totalRequests++;
      bucket.metrics.averageTokensAvailable =
        (bucket.metrics.averageTokensAvailable * (bucket.metrics.totalRequests - 1) +
          bucket.tokens) /
        bucket.metrics.totalRequests;

      // Consume tokens
      bucket.tokens -= tokensNeeded;
      return;
    }

    // Not enough tokens - calculate wait time
    const waitTimeMs = this.calculateWaitTime(bucket, tokensNeeded);

    // Update metrics
    bucket.metrics.rateLimitedRequests++;
    bucket.metrics.totalWaitTimeMs += waitTimeMs;

    throw new RateLimitError(
      `Rate limit exceeded for ${key}. Retry after ${waitTimeMs}ms`,
      waitTimeMs,
      key,
    );
  }

  /**
   * Record a successful request
   */
  recordRequest(key: string): void {
    const bucket = this.getBucket(key);
    bucket.metrics.totalRequests++;
  }

  /**
   * Handle rate limit error from API
   *
   * This is called when the API returns a 429 with Retry-After header.
   * We drain tokens to prevent further requests.
   */
  async handleRateLimit(key: string, retryAfterMs: number): Promise<void> {
    const bucket = this.getBucket(key);

    // Drain all tokens to prevent further requests
    bucket.tokens = 0;

    // Update last refill time to prevent immediate refill
    bucket.lastRefillTime = Date.now() + retryAfterMs;

    // Update metrics
    bucket.metrics.rateLimitedRequests++;
    bucket.metrics.totalWaitTimeMs += retryAfterMs;
    bucket.metrics.lastRefillTime = new Date(bucket.lastRefillTime).toISOString();

    // Wait for the specified duration
    await this.sleep(retryAfterMs);

    // After waiting, refill tokens
    bucket.tokens = this.config.maxTokens;
  }

  /**
   * Get current metrics for a key
   */
  getMetrics(key: string): RateLimitMetrics | null {
    const bucket = this.buckets.get(key);
    return bucket ? { ...bucket.metrics } : null;
  }

  /**
   * Reset rate limiter for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Get available tokens for a key
   */
  getAvailableTokens(key: string): number {
    const bucket = this.getBucket(key);
    this.refillTokens(bucket);
    return bucket.tokens;
  }
}

// =============================================================================
// Sliding Window Rate Limiter
// =============================================================================

/**
 * Sliding window rate limiter configuration
 */
export const SlidingWindowConfigSchema = z.object({
  /** Maximum requests per window */
  maxRequests: z.number().int().min(1).default(100),

  /** Window size in milliseconds (default: 60000ms = 1 minute) */
  windowMs: z.number().int().min(1).default(60000),
});

export type SlidingWindowConfig = z.infer<typeof SlidingWindowConfigSchema>;

/**
 * Sliding window rate limiter
 *
 * Tracks requests in a sliding time window.
 * More accurate than token bucket for burst prevention.
 */
export class SlidingWindowRateLimiter implements IRateLimiter {
  private readonly windows: Map<string, number[]> = new Map();
  private readonly config: SlidingWindowConfig;
  private readonly metrics: Map<string, RateLimitMetrics> = new Map();

  constructor(config?: Partial<SlidingWindowConfig>) {
    this.config = SlidingWindowConfigSchema.parse(config ?? {});
  }

  /**
   * Get or create metrics for a key
   */
  private getOrCreateMetrics(key: string): RateLimitMetrics {
    let metrics = this.metrics.get(key);

    if (!metrics) {
      metrics = {
        totalRequests: 0,
        rateLimitedRequests: 0,
        totalWaitTimeMs: 0,
        averageTokensAvailable: this.config.maxRequests,
        lastRefillTime: new Date().toISOString(),
      };
      this.metrics.set(key, metrics);
    }

    return metrics;
  }

  /**
   * Get or create request window for a key
   */
  private getWindow(key: string): number[] {
    let window = this.windows.get(key);

    if (!window) {
      window = [];
      this.windows.set(key, window);
    }

    return window;
  }

  /**
   * Clean up old requests outside the window
   */
  private cleanWindow(window: number[]): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    // Remove requests older than window
    const firstValidIndex = window.findIndex((timestamp) => timestamp > cutoff);

    if (firstValidIndex > 0) {
      window.splice(0, firstValidIndex);
    } else if (firstValidIndex === -1 && window.length > 0) {
      // All requests are old
      window.length = 0;
    }
  }

  /**
   * Check if request can proceed
   */
  async checkLimit(key: string): Promise<void> {
    const window = this.getWindow(key);
    const metrics = this.getOrCreateMetrics(key);

    // Clean up old requests
    this.cleanWindow(window);

    // Check if we're at the limit
    if (window.length >= this.config.maxRequests) {
      // Calculate wait time (time until oldest request exits window)
      const oldestRequest = window[0];
      const waitTimeMs = this.config.windowMs - (Date.now() - oldestRequest);

      metrics.rateLimitedRequests++;
      metrics.totalWaitTimeMs += Math.max(waitTimeMs, 0);

      throw new RateLimitError(
        `Rate limit exceeded for ${key}. Retry after ${Math.max(waitTimeMs, 0)}ms`,
        Math.max(waitTimeMs, 0),
        key,
      );
    }

    // Record request
    window.push(Date.now());
    metrics.totalRequests++;
    metrics.averageTokensAvailable =
      (metrics.averageTokensAvailable * (metrics.totalRequests - 1) +
        (this.config.maxRequests - window.length)) /
      metrics.totalRequests;
  }

  /**
   * Record a successful request
   */
  recordRequest(key: string): void {
    const metrics = this.getOrCreateMetrics(key);
    metrics.totalRequests++;
  }

  /**
   * Handle rate limit error from API
   */
  async handleRateLimit(key: string, retryAfterMs: number): Promise<void> {
    const window = this.getWindow(key);
    const metrics = this.getOrCreateMetrics(key);

    // Clear window to prevent further requests
    window.length = 0;

    metrics.rateLimitedRequests++;
    metrics.totalWaitTimeMs += retryAfterMs;
    metrics.lastRefillTime = new Date(Date.now() + retryAfterMs).toISOString();

    // Wait
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  }

  /**
   * Get current metrics for a key
   */
  getMetrics(key: string): RateLimitMetrics | null {
    const metrics = this.metrics.get(key);
    return metrics ? { ...metrics } : null;
  }

  /**
   * Reset rate limiter for a key
   */
  reset(key: string): void {
    this.windows.delete(key);
    this.metrics.delete(key);
  }

  /**
   * Get available tokens (requests) for a key
   */
  getAvailableTokens(key: string): number {
    const window = this.getWindow(key);
    this.cleanWindow(window);
    return Math.max(this.config.maxRequests - window.length, 0);
  }
}

/**
 * Create a rate limiter with default options
 */
export function createRateLimiter(config?: Partial<RateLimitConfig>): IRateLimiter {
  return new TokenBucketRateLimiter(config);
}

/**
 * Create a sliding window rate limiter
 */
export function createSlidingWindowRateLimiter(
  config?: Partial<SlidingWindowConfig>,
): IRateLimiter {
  return new SlidingWindowRateLimiter(config);
}
