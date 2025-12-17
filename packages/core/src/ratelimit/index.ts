/**
 * Rate Limiting Module for Git With Intent (Phase 15)
 *
 * Provides tenant-scoped rate limiting with sliding window implementation.
 * Designed for Express middleware integration.
 *
 * Features:
 * - Tenant-scoped limits
 * - Sliding window algorithm
 * - Configurable limits per endpoint
 * - In-memory and Firestore storage options
 *
 * @module @gwi/core/ratelimit
 */

// =============================================================================
// Rate Limit Configuration
// =============================================================================

/**
 * Rate limit configuration for an endpoint or action
 */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Optional message when rate limited */
  message?: string;
  /** Skip rate limiting for certain conditions */
  skip?: (tenantId: string, metadata?: Record<string, unknown>) => boolean;
}

/**
 * Default rate limit configurations by action type
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Signal ingestion - high volume expected
  'signal:create': {
    maxRequests: 100,
    windowMs: 60 * 1000, // 100 per minute
    message: 'Signal rate limit exceeded. Please slow down.',
  },

  // API general endpoints
  'api:read': {
    maxRequests: 300,
    windowMs: 60 * 1000, // 300 reads per minute
    message: 'Read rate limit exceeded.',
  },

  'api:write': {
    maxRequests: 60,
    windowMs: 60 * 1000, // 60 writes per minute
    message: 'Write rate limit exceeded.',
  },

  // Workflow runs - expensive operations
  'run:create': {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 runs per minute
    message: 'Run rate limit exceeded. Please wait before starting new runs.',
  },

  // Candidate generation - AI operations
  'candidate:generate': {
    maxRequests: 5,
    windowMs: 60 * 1000, // 5 per minute
    message: 'Candidate generation rate limit exceeded.',
  },

  // Webhook handling
  'webhook:github': {
    maxRequests: 200,
    windowMs: 60 * 1000, // 200 per minute
    message: 'Webhook rate limit exceeded.',
  },

  // Authentication - anti-brute-force
  'auth:login': {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000, // 10 per 15 minutes
    message: 'Too many login attempts. Please wait.',
  },

  // Invite operations
  'invite:send': {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000, // 20 per hour
    message: 'Invite rate limit exceeded.',
  },
};

// =============================================================================
// Rate Limit Result
// =============================================================================

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  current: number;
  /** Maximum allowed requests */
  limit: number;
  /** Time until window resets (ms) */
  resetInMs: number;
  /** Number of remaining requests */
  remaining: number;
  /** Error message if rate limited */
  message?: string;
}

// =============================================================================
// Rate Limit Store Interface
// =============================================================================

/**
 * Interface for rate limit storage
 */
export interface RateLimitStore {
  /**
   * Increment counter and check if rate limited
   *
   * @param key - Unique key for this rate limit (e.g., "tenant:action")
   * @param config - Rate limit configuration
   * @returns Rate limit check result
   */
  increment(key: string, config: RateLimitConfig): Promise<RateLimitResult>;

  /**
   * Get current count without incrementing
   *
   * @param key - Unique key for this rate limit
   * @param config - Rate limit configuration
   * @returns Current rate limit status
   */
  get(key: string, config: RateLimitConfig): Promise<RateLimitResult>;

  /**
   * Reset rate limit for a key
   *
   * @param key - Key to reset
   */
  reset(key: string): Promise<void>;

  /**
   * Clean up expired entries
   */
  cleanup(): Promise<void>;
}

// =============================================================================
// In-Memory Rate Limit Store
// =============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
  requests: number[]; // Timestamps for sliding window
}

/**
 * In-memory rate limit store with sliding window algorithm
 *
 * Good for single-instance deployments or development.
 * For distributed deployments, use FirestoreRateLimitStore.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, RateLimitEntry>();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60 * 1000) {
    // Start cleanup interval
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup().catch(console.error);
    }, cleanupIntervalMs);
  }

  async increment(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let entry = this.entries.get(key);

    if (!entry) {
      entry = {
        count: 0,
        windowStart: now,
        requests: [],
      };
      this.entries.set(key, entry);
    }

    // Remove expired timestamps (sliding window)
    entry.requests = entry.requests.filter(ts => ts > windowStart);

    // Check if under limit before incrementing
    const currentCount = entry.requests.length;

    if (currentCount >= config.maxRequests) {
      // Rate limited
      const oldestRequest = entry.requests[0] || now;
      const resetInMs = Math.max(0, oldestRequest + config.windowMs - now);

      return {
        allowed: false,
        current: currentCount,
        limit: config.maxRequests,
        resetInMs,
        remaining: 0,
        message: config.message || 'Rate limit exceeded',
      };
    }

    // Add this request
    entry.requests.push(now);
    entry.count = entry.requests.length;

    return {
      allowed: true,
      current: entry.count,
      limit: config.maxRequests,
      resetInMs: config.windowMs,
      remaining: config.maxRequests - entry.count,
    };
  }

  async get(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const entry = this.entries.get(key);

    if (!entry) {
      return {
        allowed: true,
        current: 0,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining: config.maxRequests,
      };
    }

    // Remove expired timestamps
    const validRequests = entry.requests.filter(ts => ts > windowStart);
    const currentCount = validRequests.length;

    if (currentCount >= config.maxRequests) {
      const oldestRequest = validRequests[0] || now;
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
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.entries) {
      // Find the longest window we use (1 hour)
      const maxWindowMs = 60 * 60 * 1000;
      const windowStart = now - maxWindowMs;

      // Remove expired timestamps
      entry.requests = entry.requests.filter(ts => ts > windowStart);

      // Delete entry if empty
      if (entry.requests.length === 0) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.entries.delete(key);
    }
  }

  /**
   * Stop cleanup interval (call on shutdown)
   */
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

// =============================================================================
// Rate Limiter
// =============================================================================

/**
 * Rate limiter with tenant-scoped rate limiting
 */
export class RateLimiter {
  private store: RateLimitStore;
  private configs: Map<string, RateLimitConfig>;

  constructor(store?: RateLimitStore, configs?: Record<string, RateLimitConfig>) {
    this.store = store || new InMemoryRateLimitStore();
    this.configs = new Map(Object.entries(configs || DEFAULT_RATE_LIMITS));
  }

  /**
   * Create a rate limit key for tenant + action
   */
  private createKey(tenantId: string, action: string): string {
    return `ratelimit:${tenantId}:${action}`;
  }

  /**
   * Check and consume rate limit
   *
   * @param tenantId - Tenant ID
   * @param action - Action type (from DEFAULT_RATE_LIMITS)
   * @param metadata - Optional metadata for skip function
   * @returns Rate limit result
   */
  async check(
    tenantId: string,
    action: string,
    metadata?: Record<string, unknown>
  ): Promise<RateLimitResult> {
    const config = this.configs.get(action) || DEFAULT_RATE_LIMITS['api:read'];

    // Check skip condition
    if (config.skip && config.skip(tenantId, metadata)) {
      return {
        allowed: true,
        current: 0,
        limit: config.maxRequests,
        resetInMs: config.windowMs,
        remaining: config.maxRequests,
      };
    }

    const key = this.createKey(tenantId, action);
    return this.store.increment(key, config);
  }

  /**
   * Get current rate limit status without consuming
   */
  async status(tenantId: string, action: string): Promise<RateLimitResult> {
    const config = this.configs.get(action) || DEFAULT_RATE_LIMITS['api:read'];
    const key = this.createKey(tenantId, action);
    return this.store.get(key, config);
  }

  /**
   * Reset rate limit for a tenant + action
   */
  async reset(tenantId: string, action: string): Promise<void> {
    const key = this.createKey(tenantId, action);
    return this.store.reset(key);
  }

  /**
   * Add or update a rate limit configuration
   */
  setConfig(action: string, config: RateLimitConfig): void {
    this.configs.set(action, config);
  }

  /**
   * Get configuration for an action
   */
  getConfig(action: string): RateLimitConfig | undefined {
    return this.configs.get(action);
  }
}

// =============================================================================
// Express Middleware
// =============================================================================

import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware options
 */
export interface RateLimitMiddlewareOptions {
  /** Action type for rate limiting */
  action: string;
  /** Function to extract tenant ID from request */
  getTenantId?: (req: Request) => string | undefined;
  /** Custom error response */
  onRateLimited?: (req: Request, res: Response, result: RateLimitResult) => void;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Include rate limit headers in response */
  includeHeaders?: boolean;
}

/**
 * Default tenant ID extractor - tries params, then query, then header
 */
function defaultGetTenantId(req: Request): string | undefined {
  return (
    req.params?.tenantId ||
    (req.query?.tenantId as string) ||
    req.headers['x-tenant-id'] as string ||
    'global'
  );
}

/**
 * Default rate limited response handler
 */
function defaultOnRateLimited(_req: Request, res: Response, result: RateLimitResult): void {
  res.status(429).json({
    error: 'Too Many Requests',
    message: result.message || 'Rate limit exceeded',
    retryAfter: Math.ceil(result.resetInMs / 1000),
    limit: result.limit,
    current: result.current,
    remaining: result.remaining,
  });
}

// Global rate limiter instance
let globalRateLimiter: RateLimiter | null = null;

/**
 * Get or create the global rate limiter instance
 */
export function getRateLimiter(
  store?: RateLimitStore,
  configs?: Record<string, RateLimitConfig>
): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(store, configs);
  }
  return globalRateLimiter;
}

/**
 * Reset the global rate limiter (for testing)
 */
export function resetRateLimiter(): void {
  globalRateLimiter = null;
}

/**
 * Create rate limiting Express middleware
 *
 * Usage:
 * ```typescript
 * app.post('/api/signals', rateLimit({ action: 'signal:create' }), signalHandler);
 * ```
 */
export function rateLimit(options: RateLimitMiddlewareOptions) {
  const {
    action,
    getTenantId = defaultGetTenantId,
    onRateLimited = defaultOnRateLimited,
    skip,
    includeHeaders = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Check skip condition
    if (skip && skip(req)) {
      return next();
    }

    const tenantId = getTenantId(req);

    if (!tenantId) {
      // Can't rate limit without tenant ID, allow request
      return next();
    }

    const limiter = getRateLimiter();
    const result = await limiter.check(tenantId, action);

    // Add rate limit headers
    if (includeHeaders) {
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.resetInMs / 1000));
    }

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.resetInMs / 1000));
      return onRateLimited(req, res, result);
    }

    return next();
  };
}

/**
 * Create middleware that applies different limits based on request method
 */
export function methodBasedRateLimit(options: {
  read?: RateLimitMiddlewareOptions;
  write?: RateLimitMiddlewareOptions;
}) {
  const readMiddleware = options.read ? rateLimit(options.read) : null;
  const writeMiddleware = options.write ? rateLimit(options.write) : null;

  return (req: Request, res: Response, next: NextFunction): void => {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (isWrite && writeMiddleware) {
      writeMiddleware(req, res, next);
    } else if (!isWrite && readMiddleware) {
      readMiddleware(req, res, next);
    } else {
      next();
    }
  };
}
