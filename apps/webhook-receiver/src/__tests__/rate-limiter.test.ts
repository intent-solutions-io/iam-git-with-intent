/**
 * Rate Limiter Tests
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Tests token bucket rate limiting implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, getRateLimiter, resetRateLimiter } from '../ratelimit/RateLimiter.js';
import { RateLimitError } from '../types.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxTokens: 10,
      refillRate: 10 / 60, // 10 per minute
      cleanupIntervalMs: 60000,
    });
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe('Token bucket algorithm', () => {
    it('should allow requests within limit', () => {
      const result = rateLimiter.check('tenant-1', 'github');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
    });

    it('should decrement tokens on each request', () => {
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.check('tenant-1', 'github');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9 - i);
      }
    });

    it('should reject when tokens exhausted', () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      // Next request should be rejected
      const result = rateLimiter.check('tenant-1', 'github');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track tenants separately', () => {
      // Consume tokens for tenant-1
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      // Tenant-2 should still have tokens
      const result = rateLimiter.check('tenant-2', 'github');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should track sources separately', () => {
      // Consume tokens for github
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      // GitLab should still have tokens
      const result = rateLimiter.check('tenant-1', 'gitlab');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });
  });

  describe('Token refill', () => {
    it('should refill tokens over time', async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      // Verify exhausted
      expect(rateLimiter.check('tenant-1', 'github').allowed).toBe(false);

      // Simulate time passing (6 seconds = 1 token at 10 per minute)
      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);

      // Should have ~1 token now
      const result = rateLimiter.check('tenant-1', 'github');
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });

    it('should not exceed max tokens', async () => {
      vi.useFakeTimers();

      // Start fresh
      const initialResult = rateLimiter.status('tenant-1', 'github');
      expect(initialResult.remaining).toBe(10);

      // Wait a long time
      vi.advanceTimersByTime(120000); // 2 minutes

      // Should still be capped at max
      const result = rateLimiter.status('tenant-1', 'github');
      expect(result.remaining).toBe(10);

      vi.useRealTimers();
    });
  });

  describe('checkLimit method', () => {
    it('should not throw when allowed', () => {
      expect(() => {
        rateLimiter.checkLimit('tenant-1', 'github');
      }).not.toThrow();
    });

    it('should throw RateLimitError when exhausted', () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      expect(() => {
        rateLimiter.checkLimit('tenant-1', 'github');
      }).toThrow(RateLimitError);
    });

    it('should include retry information in error', () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      try {
        rateLimiter.checkLimit('tenant-1', 'github');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rle = error as RateLimitError;
        expect(rle.source).toBe('github');
        expect(rle.retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('reset methods', () => {
    it('should reset specific tenant+source', () => {
      // Consume tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }
      expect(rateLimiter.check('tenant-1', 'github').allowed).toBe(false);

      // Reset
      rateLimiter.reset('tenant-1', 'github');

      // Should be allowed again
      expect(rateLimiter.check('tenant-1', 'github').allowed).toBe(true);
      expect(rateLimiter.status('tenant-1', 'github').remaining).toBe(9);
    });

    it('should reset all sources for tenant', () => {
      // Consume tokens for multiple sources
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
        rateLimiter.check('tenant-1', 'gitlab');
      }

      // Reset tenant
      rateLimiter.resetTenant('tenant-1');

      // All sources should be reset
      expect(rateLimiter.status('tenant-1', 'github').remaining).toBe(10);
      expect(rateLimiter.status('tenant-1', 'gitlab').remaining).toBe(10);
    });
  });

  describe('status method', () => {
    it('should return status without consuming tokens', () => {
      const initial = rateLimiter.status('tenant-1', 'github');
      const second = rateLimiter.status('tenant-1', 'github');

      expect(initial.remaining).toBe(10);
      expect(second.remaining).toBe(10);
    });

    it('should reflect current state', () => {
      // Consume some tokens
      for (let i = 0; i < 5; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      const status = rateLimiter.status('tenant-1', 'github');
      expect(status.remaining).toBe(5);
      expect(status.allowed).toBe(true);
    });

    it('should show not allowed when exhausted', () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        rateLimiter.check('tenant-1', 'github');
      }

      const status = rateLimiter.status('tenant-1', 'github');
      expect(status.allowed).toBe(false);
      expect(status.remaining).toBe(0);
    });
  });

  describe('bucket count', () => {
    it('should track active buckets', () => {
      expect(rateLimiter.bucketCount).toBe(0);

      rateLimiter.check('tenant-1', 'github');
      expect(rateLimiter.bucketCount).toBe(1);

      rateLimiter.check('tenant-1', 'gitlab');
      expect(rateLimiter.bucketCount).toBe(2);

      rateLimiter.check('tenant-2', 'github');
      expect(rateLimiter.bucketCount).toBe(3);
    });
  });
});

describe('getRateLimiter singleton', () => {
  afterEach(() => {
    resetRateLimiter();
  });

  it('should return same instance', () => {
    const limiter1 = getRateLimiter();
    const limiter2 = getRateLimiter();
    expect(limiter1).toBe(limiter2);
  });

  it('should reset singleton', () => {
    const limiter1 = getRateLimiter();
    limiter1.check('tenant', 'github');

    resetRateLimiter();

    const limiter2 = getRateLimiter();
    expect(limiter2).not.toBe(limiter1);
    expect(limiter2.status('tenant', 'github').remaining).toBe(100); // Default config
  });
});
