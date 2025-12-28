/**
 * Integration Tests for Retry, Rate Limiting, and Circuit Breaker
 *
 * Tests edge cases and interactions between different utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExponentialBackoffRetryHandler,
  TokenBucketRateLimiter,
  RateLimitError,
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  type HttpError,
} from '../index.js';

describe('Integration: Retry + Rate Limiter', () => {
  let retryHandler: ExponentialBackoffRetryHandler;
  let rateLimiter: TokenBucketRateLimiter;

  beforeEach(() => {
    retryHandler = new ExponentialBackoffRetryHandler({
      maxAttempts: 3,
      initialDelayMs: 10,
      maxJitterMs: 1,
    });
    rateLimiter = new TokenBucketRateLimiter({
      maxTokens: 5,
      refillRate: 1,
      refillIntervalMs: 50,
    });
  });

  it('should handle rate limit error with retry', async () => {
    // Make 5 successful calls (consume all tokens)
    for (let i = 0; i < 5; i++) {
      await rateLimiter.checkLimit('test-key');
    }

    // 6th call should be rate limited
    await expect(rateLimiter.checkLimit('test-key')).rejects.toThrow(RateLimitError);

    // Wait for refill
    await sleep(150);

    // Should work again after refill
    await expect(rateLimiter.checkLimit('test-key')).resolves.toBeUndefined();
  });

  it('should retry with exponential backoff when rate limited', async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;

      if (attempts <= 2) {
        // Simulate rate limit error
        throw createRateLimitError(100);
      }

      return 'success';
    };

    const result = await retryHandler.retry(fn, {
      retryableErrorPredicate: (error) =>
        error instanceof RateLimitError || (error as any).statusCode === 429,
    });

    expect(result).toBe('success');
    expect(attempts).toBe(3);

    const metrics = retryHandler.getMetrics();
    expect(metrics!.totalAttempts).toBe(3);
    expect(metrics!.succeeded).toBe(true);
  });
});

describe('Integration: Retry + Circuit Breaker', () => {
  let retryHandler: ExponentialBackoffRetryHandler;
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    retryHandler = new ExponentialBackoffRetryHandler({
      maxAttempts: 3,
      initialDelayMs: 10,
      maxJitterMs: 1,
    });
    circuitBreaker = new CircuitBreaker({
      failureThresholdPercentage: 50,
      minimumRequests: 3,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });
  });

  it('should not retry when circuit is open', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        circuitBreaker.execute('test', vi.fn().mockRejectedValue(new Error('Error'))),
      ).rejects.toThrow();
    }

    expect(circuitBreaker.getState('test')).toBe(CircuitBreakerState.OPEN);

    // Retry handler should fail immediately on CircuitBreakerOpenError
    const fn = async () => {
      return await circuitBreaker.execute('test', vi.fn().mockResolvedValue('success'));
    };

    await expect(
      retryHandler.retry(fn, {
        retryableErrorPredicate: (error) => !(error instanceof CircuitBreakerOpenError),
      }),
    ).rejects.toThrow(CircuitBreakerOpenError);

    const metrics = retryHandler.getMetrics();
    expect(metrics!.totalAttempts).toBe(1); // No retries for circuit breaker
  });

  it('should retry transient failures but respect circuit breaker', async () => {
    let callCount = 0;

    const fn = async () => {
      callCount++;

      return await circuitBreaker.execute('test', async () => {
        if (callCount === 1) {
          throw createHttpError(500); // Transient error
        }
        return 'success';
      });
    };

    const result = await retryHandler.retry(fn);

    expect(result).toBe('success');
    expect(callCount).toBe(2); // First failed, second succeeded
  });
});

describe('Integration: Rate Limiter + Circuit Breaker', () => {
  let rateLimiter: TokenBucketRateLimiter;
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    rateLimiter = new TokenBucketRateLimiter({
      maxTokens: 3,
      refillRate: 1,
      refillIntervalMs: 50,
    });
    circuitBreaker = new CircuitBreaker({
      failureThresholdPercentage: 50,
      minimumRequests: 3,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });
  });

  it('should open circuit when rate limit errors accumulate', async () => {
    const fn = async () => {
      await rateLimiter.checkLimit('test');
      return 'success';
    };

    // Exhaust rate limit
    for (let i = 0; i < 3; i++) {
      await circuitBreaker.execute('test', fn);
    }

    // Next requests will be rate limited
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute('test', fn)).rejects.toThrow(RateLimitError);
    }

    // Circuit should open due to failures
    expect(circuitBreaker.getState('test')).toBe(CircuitBreakerState.OPEN);
  });
});

describe('Integration: All Three Together', () => {
  let retryHandler: ExponentialBackoffRetryHandler;
  let rateLimiter: TokenBucketRateLimiter;
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    retryHandler = new ExponentialBackoffRetryHandler({
      maxAttempts: 3,
      initialDelayMs: 10,
      maxJitterMs: 1,
    });
    rateLimiter = new TokenBucketRateLimiter({
      maxTokens: 5,
      refillRate: 2,
      refillIntervalMs: 50,
    });
    circuitBreaker = new CircuitBreaker({
      failureThresholdPercentage: 60,
      minimumRequests: 5,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });
  });

  it('should handle complex failure scenario', async () => {
    let callCount = 0;

    const makeRequest = async () => {
      return await retryHandler.retry(
        async () => {
          return await circuitBreaker.execute('api', async () => {
            await rateLimiter.checkLimit('api');

            callCount++;

            // Simulate different failure modes
            if (callCount === 1) {
              throw createHttpError(500); // Retry
            } else if (callCount === 2) {
              throw createHttpError(503); // Retry
            }

            return `success-${callCount}`;
          });
        },
        {
          retryableErrorPredicate: (error) => {
            // Don't retry circuit breaker or non-retryable errors
            if (error instanceof CircuitBreakerOpenError) return false;
            if (error instanceof RateLimitError) return false;
            if ((error as HttpError).statusCode === 400) return false;
            return true;
          },
        },
      );
    };

    const result = await makeRequest();

    expect(result).toBe('success-3');
    expect(callCount).toBe(3);

    // Verify all components tracked correctly
    const retryMetrics = retryHandler.getMetrics();
    expect(retryMetrics!.succeeded).toBe(true);
    expect(retryMetrics!.totalAttempts).toBe(3);

    const circuitMetrics = circuitBreaker.getMetrics('api');
    expect(circuitMetrics!.state).toBe(CircuitBreakerState.CLOSED);
    expect(circuitMetrics!.totalRequests).toBe(3);
    expect(circuitMetrics!.totalSuccesses).toBe(1);
    expect(circuitMetrics!.totalFailures).toBe(2);

    const rateLimitMetrics = rateLimiter.getMetrics('api');
    expect(rateLimitMetrics!.totalRequests).toBe(3);
  });

  it('should fail gracefully when all protection mechanisms engaged', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await rateLimiter.checkLimit('api');
    }

    // Open circuit by repeated failures
    for (let i = 0; i < 5; i++) {
      try {
        await circuitBreaker.execute('api', async () => {
          await rateLimiter.checkLimit('api'); // Will throw RateLimitError
          return 'success';
        });
      } catch {
        // Expected
      }
    }

    expect(circuitBreaker.getState('api')).toBe(CircuitBreakerState.OPEN);

    // Now try request with all protection
    const fn = async () => {
      return await retryHandler.retry(
        async () => {
          return await circuitBreaker.execute('api', async () => {
            await rateLimiter.checkLimit('api');
            return 'success';
          });
        },
        {
          retryableErrorPredicate: (error) => !(error instanceof CircuitBreakerOpenError),
        },
      );
    };

    // Should fail with circuit breaker open
    await expect(fn()).rejects.toThrow(CircuitBreakerOpenError);
  });
});

describe('Edge Cases', () => {
  it('should handle rapid concurrent requests with rate limiter', async () => {
    const limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 5,
      refillIntervalMs: 100,
    });

    const requests = Array.from({ length: 15 }, (_, i) => async () => {
      try {
        await limiter.checkLimit('concurrent');
        return `success-${i}`;
      } catch (error) {
        if (error instanceof RateLimitError) {
          return `rate-limited-${i}`;
        }
        throw error;
      }
    });

    const results = await Promise.all(requests.map((fn) => fn()));

    const successes = results.filter((r) => r.startsWith('success'));
    const rateLimited = results.filter((r) => r.startsWith('rate-limited'));

    expect(successes.length).toBe(10); // First 10 succeed
    expect(rateLimited.length).toBe(5); // Last 5 rate limited
  });

  it('should handle zero-delay retry edge case', async () => {
    const handler = new ExponentialBackoffRetryHandler({
      maxAttempts: 3,
      initialDelayMs: 0,
      maxJitterMs: 0,
    });

    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw createHttpError(500);
      }
      return 'success';
    });

    const startTime = Date.now();
    const result = await handler.retry(fn);
    const elapsed = Date.now() - startTime;

    expect(result).toBe('success');
    expect(attempts).toBe(3);
    expect(elapsed).toBeLessThan(50); // Should be very fast with no delay
  });

  it('should handle circuit breaker state transitions under load', async () => {
    const breaker = new CircuitBreaker({
      failureThresholdPercentage: 50,
      minimumRequests: 10,
      resetTimeoutMs: 50,
      successThreshold: 3,
    });

    // Fill up with mixed results
    for (let i = 0; i < 6; i++) {
      await breaker.execute('load', vi.fn().mockResolvedValue('success'));
    }
    for (let i = 0; i < 6; i++) {
      await expect(
        breaker.execute('load', vi.fn().mockRejectedValue(new Error('Error'))),
      ).rejects.toThrow();
    }

    // Should open (12 requests, 50% failure)
    expect(breaker.getState('load')).toBe(CircuitBreakerState.OPEN);

    // Wait for HALF_OPEN
    await sleep(100);
    expect(breaker.getState('load')).toBe(CircuitBreakerState.HALF_OPEN);

    // Close with successes
    for (let i = 0; i < 3; i++) {
      await breaker.execute('load', vi.fn().mockResolvedValue('success'));
    }

    expect(breaker.getState('load')).toBe(CircuitBreakerState.CLOSED);
  });

  it('should handle retry with custom error types', async () => {
    class CustomRetryableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomRetryableError';
      }
    }

    class CustomNonRetryableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomNonRetryableError';
      }
    }

    const handler = new ExponentialBackoffRetryHandler({
      maxAttempts: 3,
      initialDelayMs: 1,
    });

    // Should retry CustomRetryableError
    let attempts1 = 0;
    await expect(
      handler.retry(
        async () => {
          attempts1++;
          throw new CustomRetryableError('Retry me');
        },
        {
          retryableErrorPredicate: (error) => error instanceof CustomRetryableError,
        },
      ),
    ).rejects.toThrow(CustomRetryableError);
    expect(attempts1).toBe(3);

    // Should NOT retry CustomNonRetryableError
    let attempts2 = 0;
    await expect(
      handler.retry(
        async () => {
          attempts2++;
          throw new CustomNonRetryableError('Do not retry');
        },
        {
          retryableErrorPredicate: (error) => error instanceof CustomRetryableError,
        },
      ),
    ).rejects.toThrow(CustomNonRetryableError);
    expect(attempts2).toBe(1);
  });
});

/**
 * Helpers
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHttpError(statusCode: number): HttpError {
  const error = new Error(`HTTP ${statusCode}`) as HttpError;
  error.statusCode = statusCode;
  error.response = {
    status: statusCode,
    headers: {},
  };
  return error;
}

function createRateLimitError(retryAfterMs: number): RateLimitError {
  return new RateLimitError('Rate limit exceeded', retryAfterMs, 'test-key');
}
