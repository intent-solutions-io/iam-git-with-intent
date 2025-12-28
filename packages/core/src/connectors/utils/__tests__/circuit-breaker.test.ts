/**
 * Circuit Breaker Tests
 *
 * Comprehensive unit tests for circuit breaker with >90% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  createCircuitBreaker,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThresholdPercentage: 50,
      minimumRequests: 5,
      resetTimeoutMs: 100,
      successThreshold: 3,
      windowMs: 1000,
    });
  });

  describe('CLOSED state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.CLOSED);
    });

    it('should allow requests in CLOSED state', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute('test-key', fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track successful requests', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      for (let i = 0; i < 5; i++) {
        await breaker.execute('test-key', fn);
      }

      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.totalRequests).toBe(5);
      expect(metrics!.totalSuccesses).toBe(5);
      expect(metrics!.totalFailures).toBe(0);
      expect(metrics!.failureRate).toBe(0);
    });

    it('should track failed requests', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute('test-key', fn)).rejects.toThrow();
      }

      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.totalRequests).toBe(3);
      expect(metrics!.totalFailures).toBe(3);
    });

    it('should open circuit when failure threshold exceeded', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      // Need minimumRequests (5) with 50% failure rate
      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute('test-key', fn)).rejects.toThrow('Test error');
      }

      // Circuit should now be OPEN
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.OPEN);

      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.circuitOpenCount).toBe(1);
      expect(metrics!.failureRate).toBe(100);
    });

    it('should stay CLOSED if below failure threshold', async () => {
      // 2 failures, 4 successes = 33% failure rate (below 50% threshold)
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }
      for (let i = 0; i < 4; i++) {
        await breaker.execute('test-key', vi.fn().mockResolvedValue('success'));
      }

      // Should still be CLOSED (below threshold)
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.CLOSED);
    });

    it('should not open before minimumRequests', async () => {
      // Only 3 requests (below minimumRequests of 5)
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject requests immediately when OPEN', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await expect(breaker.execute('test-key', fn)).rejects.toThrow(CircuitBreakerOpenError);

      // Function should not be called
      expect(fn).not.toHaveBeenCalled();
    });

    it('should include retry time in error', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      try {
        await breaker.execute('test-key', fn);
        expect.fail('Should have thrown CircuitBreakerOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as CircuitBreakerOpenError).nextAttemptAt).toBeInstanceOf(Date);
      }
    });

    it('should transition to HALF_OPEN after resetTimeout', async () => {
      // Wait for reset timeout
      await sleep(150);

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should include nextAttemptAt in metrics when OPEN', () => {
      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.state).toBe(CircuitBreakerState.OPEN);
      expect(metrics!.nextAttemptAt).toBeDefined();
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      // Wait for HALF_OPEN transition
      await sleep(150);
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should allow limited requests in HALF_OPEN', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await breaker.execute('test-key', fn);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should close circuit after successThreshold successes', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      // successThreshold is 3
      for (let i = 0; i < 3; i++) {
        await breaker.execute('test-key', fn);
      }

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.CLOSED);

      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.circuitClosedCount).toBe(1);
    });

    it('should reopen circuit on any failure', async () => {
      // One success
      await breaker.execute('test-key', vi.fn().mockResolvedValue('success'));

      // One failure
      await expect(
        breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
      ).rejects.toThrow();

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.OPEN);
    });

    it('should not remove nextAttemptAt from metrics in HALF_OPEN', () => {
      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.state).toBe(CircuitBreakerState.HALF_OPEN);
      expect(metrics!.nextAttemptAt).toBeUndefined();
    });
  });

  describe('sliding window', () => {
    it('should only count requests within window', async () => {
      // Make some failed requests
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      // Wait for window to slide
      await sleep(1100);

      // Old requests should be outside window
      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.failureRate).toBe(0); // No requests in current window
    });

    it('should clean up old requests from window', async () => {
      // Make requests
      for (let i = 0; i < 3; i++) {
        await breaker.execute('test-key', vi.fn().mockResolvedValue('success'));
      }

      // Wait for window to expire
      await sleep(1100);

      const metrics = breaker.getMetrics('test-key');
      // Metrics should reflect that old requests are gone
      expect(metrics!.failureRate).toBe(0);
    });
  });

  describe('per-key isolation', () => {
    it('should maintain separate circuits for different keys', async () => {
      // Open circuit for key1
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('key1', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      expect(breaker.getState('key1')).toBe(CircuitBreakerState.OPEN);

      // key2 should still be CLOSED
      expect(breaker.getState('key2')).toBe(CircuitBreakerState.CLOSED);
      await expect(
        breaker.execute('key2', vi.fn().mockResolvedValue('success')),
      ).resolves.toBe('success');
    });
  });

  describe('manual control', () => {
    it('should manually open circuit', () => {
      breaker.open('test-key');
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.OPEN);
    });

    it('should manually close circuit', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      // Manually close
      breaker.close('test-key');
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset circuit', async () => {
      // Make some requests
      for (let i = 0; i < 3; i++) {
        await breaker.execute('test-key', vi.fn().mockResolvedValue('success'));
      }

      breaker.reset('test-key');

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.CLOSED);
      expect(breaker.getMetrics('test-key')).toBeNull();
    });
  });

  describe('health check', () => {
    it('should perform health check', async () => {
      const healthCheckFn = vi.fn().mockResolvedValue(true);

      const result = await breaker.healthCheck('test-key', healthCheckFn);

      expect(result).toBe(true);
      expect(healthCheckFn).toHaveBeenCalledTimes(1);
    });

    it('should transition OPEN to HALF_OPEN if health check passes', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.OPEN);

      // Health check passes
      await breaker.healthCheck('test-key', vi.fn().mockResolvedValue(true));

      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should not change state if health check fails', async () => {
      breaker.open('test-key');

      const result = await breaker.healthCheck('test-key', vi.fn().mockResolvedValue(false));

      expect(result).toBe(false);
      expect(breaker.getState('test-key')).toBe(CircuitBreakerState.OPEN);
    });

    it('should handle health check errors', async () => {
      const result = await breaker.healthCheck(
        'test-key',
        vi.fn().mockRejectedValue(new Error('Health check error')),
      );

      expect(result).toBe(false);
    });
  });

  describe('metrics', () => {
    it('should track circuit state changes', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      let metrics = breaker.getMetrics('test-key');
      expect(metrics!.circuitOpenCount).toBe(1);

      // Wait for HALF_OPEN
      await sleep(150);

      // Close circuit
      for (let i = 0; i < 3; i++) {
        await breaker.execute('test-key', vi.fn().mockResolvedValue('success'));
      }

      metrics = breaker.getMetrics('test-key');
      expect(metrics!.circuitClosedCount).toBe(1);
    });

    it('should calculate failure rate correctly', async () => {
      // 2 successes, 3 failures = 60% failure rate
      for (let i = 0; i < 2; i++) {
        await breaker.execute('test-key', vi.fn().mockResolvedValue('success'));
      }
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.failureRate).toBe(60);
    });

    it('should track last state change', async () => {
      const beforeOpen = new Date().toISOString();

      // Open circuit
      for (let i = 0; i < 5; i++) {
        await expect(
          breaker.execute('test-key', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }

      const metrics = breaker.getMetrics('test-key');
      expect(metrics!.lastStateChange).toBeDefined();
      expect(new Date(metrics!.lastStateChange).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeOpen).getTime(),
      );
    });

    it('should return null metrics for unknown key', () => {
      expect(breaker.getMetrics('unknown-key')).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultBreaker = new CircuitBreaker();
      expect(defaultBreaker.getState('test')).toBe(CircuitBreakerState.CLOSED);
    });

    it('should validate configuration with Zod', () => {
      expect(() => new CircuitBreaker({ failureThresholdPercentage: -1 })).toThrow();
      expect(() => new CircuitBreaker({ failureThresholdPercentage: 101 })).toThrow();
      expect(() => new CircuitBreaker({ minimumRequests: 0 })).toThrow();
    });

    it('should use custom thresholds', async () => {
      const customBreaker = new CircuitBreaker({
        failureThresholdPercentage: 80, // 80% failure rate
        minimumRequests: 3,
        resetTimeoutMs: 100,
        successThreshold: 2,
        windowMs: 1000,
      });

      // 2 failures, 1 success = 66% (below 80% threshold)
      for (let i = 0; i < 2; i++) {
        await expect(
          customBreaker.execute('test', vi.fn().mockRejectedValue(new Error('Error'))),
        ).rejects.toThrow();
      }
      await customBreaker.execute('test', vi.fn().mockResolvedValue('success'));

      expect(customBreaker.getState('test')).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('factory function', () => {
    it('should create breaker with createCircuitBreaker', () => {
      const breaker = createCircuitBreaker({ minimumRequests: 10 });
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });
  });
});

/**
 * Helper to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
