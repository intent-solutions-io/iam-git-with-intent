/**
 * Connector Utilities
 *
 * Shared utilities for building production-ready connectors:
 * - Retry handler with exponential backoff
 * - Rate limiter with token bucket algorithm
 * - Circuit breaker for fault tolerance
 *
 * @module @gwi/core/connectors/utils
 */

// Retry Handler
export {
  type RetryOptions,
  type RetryMetrics,
  type HttpError,
  type IRetryHandler,
  ExponentialBackoffRetryHandler,
  createRetryHandler,
  RetryOptionsSchema,
} from './retry-handler.js';

// Rate Limiter
export {
  type RateLimitConfig,
  type RateLimitMetrics,
  type SlidingWindowConfig,
  type IRateLimiter,
  RateLimitError,
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  createRateLimiter,
  createSlidingWindowRateLimiter,
  RateLimitConfigSchema,
  SlidingWindowConfigSchema,
} from './rate-limiter.js';

// Circuit Breaker
export {
  CircuitBreakerState,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type ICircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreaker,
  createCircuitBreaker,
  CircuitBreakerConfigSchema,
} from './circuit-breaker.js';
