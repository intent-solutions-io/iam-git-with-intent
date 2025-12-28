/**
 * Rate Limiter Tests
 *
 * Comprehensive unit tests for rate limiter with >90% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  RateLimitError,
  createRateLimiter,
  createSlidingWindowRateLimiter,
} from '../rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 2,
      refillIntervalMs: 100,
      tokensPerRequest: 1,
    });
  });

  describe('basic functionality', () => {
    it('should allow requests when tokens available', async () => {
      await expect(limiter.checkLimit('test-key')).resolves.toBeUndefined();
    });

    it('should consume tokens on successful request', async () => {
      const initialTokens = limiter.getAvailableTokens('test-key');
      await limiter.checkLimit('test-key');
      const remainingTokens = limiter.getAvailableTokens('test-key');

      expect(remainingTokens).toBe(initialTokens - 1);
    });

    it('should throw RateLimitError when tokens exhausted', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit('test-key');
      }

      // Next request should fail
      await expect(limiter.checkLimit('test-key')).rejects.toThrow(RateLimitError);
    });

    it('should include retry time in RateLimitError', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit('test-key');
      }

      try {
        await limiter.checkLimit('test-key');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfterMs).toBeGreaterThan(0);
        expect((error as RateLimitError).key).toBe('test-key');
      }
    });
  });

  describe('token refill', () => {
    it('should refill tokens after interval', async () => {
      // Consume some tokens
      await limiter.checkLimit('test-key');
      await limiter.checkLimit('test-key');
      const tokensAfterConsumption = limiter.getAvailableTokens('test-key');

      // Wait for refill interval
      await sleep(150);

      const tokensAfterRefill = limiter.getAvailableTokens('test-key');
      expect(tokensAfterRefill).toBeGreaterThan(tokensAfterConsumption);
    });

    it('should not exceed maxTokens after refill', async () => {
      // Wait for multiple refill intervals
      await sleep(500);

      const tokens = limiter.getAvailableTokens('test-key');
      expect(tokens).toBe(10); // maxTokens
    });

    it('should refill multiple intervals if enough time passed', async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit('test-key');
      }

      expect(limiter.getAvailableTokens('test-key')).toBe(0);

      // Wait for 3 refill intervals (3 * 100ms = 300ms)
      await sleep(350);

      // Should refill 3 * 2 = 6 tokens
      const tokens = limiter.getAvailableTokens('test-key');
      expect(tokens).toBeGreaterThanOrEqual(6);
      expect(tokens).toBeLessThanOrEqual(10);
    });
  });

  describe('per-key isolation', () => {
    it('should maintain separate buckets for different keys', async () => {
      // Exhaust tokens for key1
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit('key1');
      }

      // key2 should still have tokens
      await expect(limiter.checkLimit('key2')).resolves.toBeUndefined();
      expect(limiter.getAvailableTokens('key2')).toBe(9);
    });

    it('should track metrics separately per key', () => {
      limiter.recordRequest('key1');
      limiter.recordRequest('key2');
      limiter.recordRequest('key2');

      const metrics1 = limiter.getMetrics('key1');
      const metrics2 = limiter.getMetrics('key2');

      expect(metrics1!.totalRequests).toBe(1);
      expect(metrics2!.totalRequests).toBe(2);
    });
  });

  describe('handleRateLimit', () => {
    it('should drain tokens and wait for retry duration', async () => {
      const startTime = Date.now();
      await limiter.handleRateLimit('test-key', 100);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(limiter.getAvailableTokens('test-key')).toBe(10); // Refilled after wait
    });

    it('should update metrics on rate limit', async () => {
      await limiter.handleRateLimit('test-key', 50);

      const metrics = limiter.getMetrics('test-key');
      expect(metrics!.rateLimitedRequests).toBe(1);
      expect(metrics!.totalWaitTimeMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('metrics', () => {
    it('should track total requests', async () => {
      await limiter.checkLimit('test-key');
      await limiter.checkLimit('test-key');
      await limiter.checkLimit('test-key');

      const metrics = limiter.getMetrics('test-key');
      expect(metrics!.totalRequests).toBe(3);
    });

    it('should track rate limited requests', async () => {
      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit('test-key');
      }

      // Try more requests
      try {
        await limiter.checkLimit('test-key');
      } catch {
        // Expected
      }

      const metrics = limiter.getMetrics('test-key');
      expect(metrics!.rateLimitedRequests).toBe(1);
    });

    it('should track average tokens available', async () => {
      await limiter.checkLimit('test-key');
      await limiter.checkLimit('test-key');

      const metrics = limiter.getMetrics('test-key');
      expect(metrics!.averageTokensAvailable).toBeGreaterThan(0);
      expect(metrics!.averageTokensAvailable).toBeLessThanOrEqual(10);
    });

    it('should return null metrics for unknown key', () => {
      expect(limiter.getMetrics('unknown-key')).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset rate limiter for a key', async () => {
      await limiter.checkLimit('test-key');
      limiter.reset('test-key');

      const metrics = limiter.getMetrics('test-key');
      expect(metrics).toBeNull();

      // Should have full tokens again
      const tokens = limiter.getAvailableTokens('test-key');
      expect(tokens).toBe(10);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultLimiter = new TokenBucketRateLimiter();
      expect(defaultLimiter.getAvailableTokens('test')).toBe(100); // Default maxTokens
    });

    it('should validate configuration with Zod', () => {
      expect(() => new TokenBucketRateLimiter({ maxTokens: 0 })).toThrow();
      expect(() => new TokenBucketRateLimiter({ maxTokens: -1 })).toThrow();
      expect(() => new TokenBucketRateLimiter({ refillRate: 0 })).toThrow();
    });
  });

  describe('factory function', () => {
    it('should create limiter with createRateLimiter', () => {
      const limiter = createRateLimiter({ maxTokens: 50 });
      expect(limiter).toBeInstanceOf(TokenBucketRateLimiter);
    });
  });
});

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter({
      maxRequests: 5,
      windowMs: 100,
    });
  });

  describe('basic functionality', () => {
    it('should allow requests up to maxRequests', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(limiter.checkLimit('test-key')).resolves.toBeUndefined();
      }
    });

    it('should throw RateLimitError when limit exceeded', async () => {
      // Make max requests
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit('test-key');
      }

      // Next request should fail
      await expect(limiter.checkLimit('test-key')).rejects.toThrow(RateLimitError);
    });

    it('should track available requests', async () => {
      await limiter.checkLimit('test-key');
      expect(limiter.getAvailableTokens('test-key')).toBe(4);

      await limiter.checkLimit('test-key');
      expect(limiter.getAvailableTokens('test-key')).toBe(3);
    });
  });

  describe('sliding window', () => {
    it('should allow new requests after old ones leave window', async () => {
      // Fill up the window
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit('test-key');
      }

      // Should be rate limited
      await expect(limiter.checkLimit('test-key')).rejects.toThrow(RateLimitError);

      // Wait for window to slide
      await sleep(150);

      // Should work again (old requests left window)
      await expect(limiter.checkLimit('test-key')).resolves.toBeUndefined();
    });

    it('should only count requests within window', async () => {
      await limiter.checkLimit('test-key');
      await sleep(150); // Wait for first request to leave window

      // Should have capacity for 5 more requests
      for (let i = 0; i < 5; i++) {
        await expect(limiter.checkLimit('test-key')).resolves.toBeUndefined();
      }
    });
  });

  describe('per-key isolation', () => {
    it('should maintain separate windows for different keys', async () => {
      // Fill window for key1
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit('key1');
      }

      // key2 should still have capacity
      await expect(limiter.checkLimit('key2')).resolves.toBeUndefined();
    });
  });

  describe('handleRateLimit', () => {
    it('should clear window and wait', async () => {
      await limiter.checkLimit('test-key');
      await limiter.checkLimit('test-key');

      const startTime = Date.now();
      await limiter.handleRateLimit('test-key', 50);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(limiter.getAvailableTokens('test-key')).toBe(5); // Window cleared
    });
  });

  describe('metrics', () => {
    it('should track requests and rate limits', async () => {
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit('test-key');
      }

      try {
        await limiter.checkLimit('test-key');
      } catch {
        // Expected
      }

      const metrics = limiter.getMetrics('test-key');
      expect(metrics!.totalRequests).toBe(5);
      expect(metrics!.rateLimitedRequests).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset window for a key', async () => {
      await limiter.checkLimit('test-key');
      limiter.reset('test-key');

      expect(limiter.getMetrics('test-key')).toBeNull();
      expect(limiter.getAvailableTokens('test-key')).toBe(5);
    });
  });

  describe('factory function', () => {
    it('should create limiter with createSlidingWindowRateLimiter', () => {
      const limiter = createSlidingWindowRateLimiter({ maxRequests: 10 });
      expect(limiter).toBeInstanceOf(SlidingWindowRateLimiter);
    });
  });
});

/**
 * Helper to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
