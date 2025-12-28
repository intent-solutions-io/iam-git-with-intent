/**
 * Rate Limiting Module
 *
 * @module @gwi/webhook-receiver/ratelimit
 */

export {
  RateLimiter,
  getRateLimiter,
  resetRateLimiter,
  DEFAULT_RATE_LIMITER_CONFIG,
  type RateLimiterConfig,
  type RateLimitResult,
} from './RateLimiter.js';
