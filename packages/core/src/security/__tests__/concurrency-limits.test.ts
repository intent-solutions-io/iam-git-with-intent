/**
 * Concurrency Limit Tests
 *
 * Phase A6: Tests for per-tenant concurrency caps
 */

import { describe, it, expect } from 'vitest';
import {
  checkConcurrencyLimit,
  checkRunLimit,
  getPlanConfig,
  type PlanId,
} from '../index.js';

describe('Concurrency Limits (A6)', () => {
  describe('checkConcurrencyLimit', () => {
    it('should allow run when under limit (free plan)', () => {
      const result = checkConcurrencyLimit(0, 'free');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(0);
      expect(result.limit).toBe(1);
    });

    it('should reject run when at limit (free plan)', () => {
      const result = checkConcurrencyLimit(1, 'free');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Concurrent run limit reached');
      expect(result.reason).toContain('1 concurrent runs');
      expect(result.reason).toContain('Free plan');
      expect(result.currentUsage).toBe(1);
      expect(result.limit).toBe(1);
    });

    it('should allow run when under limit (pro plan)', () => {
      const result = checkConcurrencyLimit(3, 'pro');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(3);
      expect(result.limit).toBe(5);
    });

    it('should reject run when at limit (pro plan)', () => {
      const result = checkConcurrencyLimit(5, 'pro');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Pro plan');
      expect(result.currentUsage).toBe(5);
      expect(result.limit).toBe(5);
    });

    it('should allow run when under limit (enterprise plan)', () => {
      const result = checkConcurrencyLimit(15, 'enterprise');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(15);
      expect(result.limit).toBe(20);
    });

    it('should reject run when at limit (enterprise plan)', () => {
      const result = checkConcurrencyLimit(20, 'enterprise');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Enterprise plan');
      expect(result.currentUsage).toBe(20);
      expect(result.limit).toBe(20);
    });

    it('should reject when over limit', () => {
      // Edge case: somehow over limit (race condition recovery)
      const result = checkConcurrencyLimit(25, 'enterprise');

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(25);
      expect(result.limit).toBe(20);
    });
  });

  describe('Plan configurations', () => {
    it('should have correct concurrency limits per plan', () => {
      expect(getPlanConfig('free').limits.maxConcurrentRuns).toBe(1);
      expect(getPlanConfig('pro').limits.maxConcurrentRuns).toBe(5);
      expect(getPlanConfig('enterprise').limits.maxConcurrentRuns).toBe(20);
    });

    it('should fall back to free plan for unknown plan ID', () => {
      const result = checkConcurrencyLimit(0, 'unknown' as PlanId);

      expect(result.limit).toBe(1); // Free plan limit
    });
  });

  describe('Integration with other limits', () => {
    it('should work alongside run limits', () => {
      // Both checks should work independently
      const runCheck = checkRunLimit(10, 'free');
      const concurrencyCheck = checkConcurrencyLimit(0, 'free');

      expect(runCheck.allowed).toBe(true); // Under 50/month
      expect(concurrencyCheck.allowed).toBe(true); // Under 1 concurrent

      // At monthly limit but not concurrency limit
      const runCheck2 = checkRunLimit(50, 'free');
      const concurrencyCheck2 = checkConcurrencyLimit(0, 'free');

      expect(runCheck2.allowed).toBe(false);
      expect(concurrencyCheck2.allowed).toBe(true);

      // At concurrency limit but not monthly limit
      const runCheck3 = checkRunLimit(10, 'free');
      const concurrencyCheck3 = checkConcurrencyLimit(1, 'free');

      expect(runCheck3.allowed).toBe(true);
      expect(concurrencyCheck3.allowed).toBe(false);
    });
  });
});
