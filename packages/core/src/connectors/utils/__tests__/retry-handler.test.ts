/**
 * Retry Handler Tests
 *
 * Comprehensive unit tests for retry handler with >90% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExponentialBackoffRetryHandler,
  createRetryHandler,
  type RetryOptions,
  type HttpError,
} from '../retry-handler.js';

describe('ExponentialBackoffRetryHandler', () => {
  let handler: ExponentialBackoffRetryHandler;

  beforeEach(() => {
    handler = new ExponentialBackoffRetryHandler();
    vi.clearAllMocks();
  });

  describe('successful execution', () => {
    it('should return result on first try if successful', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await handler.retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);

      const metrics = handler.getMetrics();
      expect(metrics).toMatchObject({
        totalAttempts: 1,
        totalDelayMs: 0,
        succeeded: true,
      });
    });

    it('should succeed after retries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(createHttpError(500))
        .mockRejectedValueOnce(createHttpError(503))
        .mockResolvedValue('success');

      const result = await handler.retry(fn, { initialDelayMs: 10, maxJitterMs: 1 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);

      const metrics = handler.getMetrics();
      expect(metrics).toMatchObject({
        totalAttempts: 3,
        succeeded: true,
      });
      expect(metrics!.totalDelayMs).toBeGreaterThan(0);
    });
  });

  describe('retry logic', () => {
    it('should retry on 429 (rate limit)', async () => {
      const fn = vi.fn().mockRejectedValue(createHttpError(429));

      await expect(handler.retry(fn, { maxAttempts: 3, initialDelayMs: 1 })).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(3);

      const metrics = handler.getMetrics();
      expect(metrics!.succeeded).toBe(false);
      expect(metrics!.totalAttempts).toBe(3);
    });

    it('should retry on 500 errors', async () => {
      const fn = vi.fn().mockRejectedValue(createHttpError(500));

      await expect(handler.retry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on 502, 503, 504 errors', async () => {
      for (const status of [502, 503, 504]) {
        const fn = vi.fn().mockRejectedValue(createHttpError(status));
        const h = new ExponentialBackoffRetryHandler();

        await expect(h.retry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toThrow();

        expect(fn).toHaveBeenCalledTimes(2);
      }
    });

    it('should NOT retry on 4xx errors (except 429)', async () => {
      for (const status of [400, 401, 403, 404]) {
        const fn = vi.fn().mockRejectedValue(createHttpError(status));
        const h = new ExponentialBackoffRetryHandler();

        await expect(h.retry(fn, { maxAttempts: 3, initialDelayMs: 1 })).rejects.toThrow();

        expect(fn).toHaveBeenCalledTimes(1); // Only called once, no retries
      }
    });

    it('should retry on network errors', async () => {
      const networkErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

      for (const errorCode of networkErrors) {
        const fn = vi.fn().mockRejectedValue(new Error(`Network error: ${errorCode}`));
        const h = new ExponentialBackoffRetryHandler();

        await expect(h.retry(fn, { maxAttempts: 2, initialDelayMs: 1 })).rejects.toThrow();

        expect(fn).toHaveBeenCalledTimes(2);
      }
    });

    it('should NOT retry unknown errors by default', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Unknown error'));

      await expect(handler.retry(fn, { maxAttempts: 3, initialDelayMs: 1 })).rejects.toThrow(
        'Unknown error',
      );

      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('exponential backoff', () => {
    it('should use exponential backoff with jitter', async () => {
      const fn = vi.fn().mockRejectedValue(createHttpError(500));

      const startTime = Date.now();
      await expect(
        handler.retry(fn, {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxJitterMs: 10,
        }),
      ).rejects.toThrow();
      const elapsed = Date.now() - startTime;

      // First retry: ~100ms + jitter
      // Second retry: ~200ms + jitter
      // Total: ~300ms minimum (accounting for execution time)
      expect(elapsed).toBeGreaterThanOrEqual(280);

      const metrics = handler.getMetrics();
      expect(metrics!.totalDelayMs).toBeGreaterThanOrEqual(300);
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = vi.fn().mockRejectedValue(createHttpError(500));

      await expect(
        handler.retry(fn, {
          maxAttempts: 4,
          initialDelayMs: 100,
          maxDelayMs: 200,
          backoffMultiplier: 10,
          maxJitterMs: 1,
        }),
      ).rejects.toThrow();

      const metrics = handler.getMetrics();
      // Each delay should be capped at 200ms
      // 3 delays total (between 4 attempts)
      expect(metrics!.totalDelayMs).toBeLessThan(200 * 3 + 100);
      expect(metrics!.totalDelayMs).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Retry-After header', () => {
    it('should respect Retry-After header (seconds)', async () => {
      const error = createHttpError(429);
      error.response = {
        status: 429,
        headers: { 'retry-after': '2' }, // 2 seconds
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const startTime = Date.now();
      await handler.retry(fn, { initialDelayMs: 100 });
      const elapsed = Date.now() - startTime;

      // Should wait ~2000ms (2 seconds from header)
      expect(elapsed).toBeGreaterThanOrEqual(1900);
      expect(elapsed).toBeLessThan(2500);
    });

    it('should respect Retry-After header (HTTP date)', async () => {
      const retryDate = new Date(Date.now() + 500); // 500ms from now
      const error = createHttpError(429);
      error.response = {
        status: 429,
        headers: { 'retry-after': retryDate.toUTCString() },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const startTime = Date.now();
      await handler.retry(fn, { initialDelayMs: 100 });
      const elapsed = Date.now() - startTime;

      // Should wait ~500ms (allowing for timing variance and execution overhead)
      expect(elapsed).toBeGreaterThanOrEqual(300);
      expect(elapsed).toBeLessThan(1000);
    });

    it('should fall back to exponential backoff if Retry-After invalid', async () => {
      const error = createHttpError(429);
      error.response = {
        status: 429,
        headers: { 'retry-after': 'invalid' },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      await handler.retry(fn, { initialDelayMs: 10, maxJitterMs: 1 });

      const metrics = handler.getMetrics();
      // Should use exponential backoff (~10ms)
      expect(metrics!.totalDelayMs).toBeLessThan(100);
    });
  });

  describe('custom retry predicate', () => {
    it('should use custom predicate to determine retryability', async () => {
      const customPredicate = vi.fn().mockReturnValue(true);
      const fn = vi.fn().mockRejectedValue(new Error('Custom error'));

      await expect(
        handler.retry(fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
          retryableErrorPredicate: customPredicate,
        }),
      ).rejects.toThrow();

      expect(customPredicate).toHaveBeenCalledTimes(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry if custom predicate returns false', async () => {
      const customPredicate = vi.fn().mockReturnValue(false);
      const fn = vi.fn().mockRejectedValue(new Error('Custom error'));

      await expect(
        handler.retry(fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
          retryableErrorPredicate: customPredicate,
        }),
      ).rejects.toThrow();

      expect(customPredicate).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('configuration', () => {
    it('should use default configuration', async () => {
      const fn = vi.fn().mockRejectedValue(createHttpError(500));

      await expect(handler.retry(fn)).rejects.toThrow();

      // Default: 3 attempts
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should merge custom options with defaults', async () => {
      const customHandler = new ExponentialBackoffRetryHandler({
        maxAttempts: 5,
      });

      const fn = vi.fn().mockRejectedValue(createHttpError(500));

      await expect(customHandler.retry(fn, { initialDelayMs: 1 })).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should validate configuration with Zod', () => {
      expect(() => new ExponentialBackoffRetryHandler({ maxAttempts: 0 })).toThrow();
      expect(() => new ExponentialBackoffRetryHandler({ maxAttempts: -1 })).toThrow();
      expect(
        () => new ExponentialBackoffRetryHandler({ backoffMultiplier: 0.5 }),
      ).toThrow();
    });
  });

  describe('metrics', () => {
    it('should track metrics for successful operation', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await handler.retry(fn);

      const metrics = handler.getMetrics();
      expect(metrics).toMatchObject({
        totalAttempts: 1,
        totalDelayMs: 0,
        succeeded: true,
      });
      expect(metrics!.startedAt).toBeDefined();
      expect(metrics!.completedAt).toBeDefined();
    });

    it('should track metrics for failed operation', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(handler.retry(fn, { maxAttempts: 1, initialDelayMs: 1 })).rejects.toThrow();

      const metrics = handler.getMetrics();
      expect(metrics).toMatchObject({
        totalAttempts: 1,
        totalDelayMs: 0,
        succeeded: false,
        finalError: error,
      });
    });

    it('should update metrics after each retry', async () => {
      const fn = vi.fn().mockRejectedValue(createHttpError(500));

      await expect(handler.retry(fn, { maxAttempts: 3, initialDelayMs: 10 })).rejects.toThrow();

      const metrics = handler.getMetrics();
      expect(metrics!.totalAttempts).toBe(3);
      expect(metrics!.totalDelayMs).toBeGreaterThan(0);
    });

    it('should return null metrics if no retry performed yet', () => {
      const newHandler = new ExponentialBackoffRetryHandler();
      expect(newHandler.getMetrics()).toBeNull();
    });
  });

  describe('factory function', () => {
    it('should create handler with createRetryHandler', () => {
      const handler = createRetryHandler({ maxAttempts: 5 });
      expect(handler).toBeInstanceOf(ExponentialBackoffRetryHandler);
    });
  });
});

/**
 * Helper to create HTTP error
 */
function createHttpError(statusCode: number): HttpError {
  const error = new Error(`HTTP ${statusCode}`) as HttpError;
  error.statusCode = statusCode;
  error.response = {
    status: statusCode,
    headers: {},
  };
  return error;
}
