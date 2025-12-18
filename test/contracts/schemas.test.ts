/**
 * Contract Tests - Schema Validation
 *
 * Validates that schema validation helpers are available and work correctly.
 * These tests ensure the contract infrastructure is in place.
 */

import { describe, it, expect } from 'vitest';

// Import validation helpers from core
import {
  validateTriageResult,
  validatePlanResult,
  validateResolveResult,
  validateReviewResult,
} from '../../packages/core/dist/index.js';

import {
  ComplexityScore,
  RiskLevel,
} from '../../packages/core/src/run-bundle/schemas/common.js';

// =============================================================================
// Contract Infrastructure Tests
// =============================================================================

describe('Contract Infrastructure', () => {
  describe('Validation helpers exist', () => {
    it('validateTriageResult is available', () => {
      expect(validateTriageResult).toBeDefined();
      expect(typeof validateTriageResult).toBe('function');
    });

    it('validatePlanResult is available', () => {
      expect(validatePlanResult).toBeDefined();
      expect(typeof validatePlanResult).toBe('function');
    });

    it('validateResolveResult is available', () => {
      expect(validateResolveResult).toBeDefined();
      expect(typeof validateResolveResult).toBe('function');
    });

    it('validateReviewResult is available', () => {
      expect(validateReviewResult).toBeDefined();
      expect(typeof validateReviewResult).toBe('function');
    });
  });

  describe('Validation helpers reject invalid input', () => {
    it('validateTriageResult rejects empty object', () => {
      const result = validateTriageResult({});
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('validatePlanResult rejects empty object', () => {
      const result = validatePlanResult({});
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('validateResolveResult rejects empty object', () => {
      const result = validateResolveResult({});
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('validateReviewResult rejects empty object', () => {
      const result = validateReviewResult({});
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});

// =============================================================================
// Schema Primitive Tests
// =============================================================================

describe('Schema Primitives', () => {
  describe('ComplexityScore', () => {
    it('accepts valid scores 1-10', () => {
      for (let i = 1; i <= 10; i++) {
        const result = ComplexityScore.safeParse(i);
        expect(result.success).toBe(true);
      }
    });

    it('rejects scores outside range', () => {
      expect(ComplexityScore.safeParse(0).success).toBe(false);
      expect(ComplexityScore.safeParse(11).success).toBe(false);
      expect(ComplexityScore.safeParse(-1).success).toBe(false);
    });
  });

  describe('RiskLevel', () => {
    it('accepts valid risk levels', () => {
      const levels = ['low', 'medium', 'high', 'critical'];
      for (const level of levels) {
        const result = RiskLevel.safeParse(level);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid risk levels', () => {
      expect(RiskLevel.safeParse('unknown').success).toBe(false);
      expect(RiskLevel.safeParse('').success).toBe(false);
    });
  });
});

// =============================================================================
// Version Field Tests
// =============================================================================

describe('Version Field Enforcement', () => {
  it('triage rejects invalid version', () => {
    // Version must be exactly 1
    const withBadVersion = {
      version: 2,
      timestamp: new Date().toISOString(),
      // ... other fields
    };
    const result = validateTriageResult(withBadVersion);
    expect(result.valid).toBe(false);
  });

  it('triage rejects missing version', () => {
    const withoutVersion = {
      timestamp: new Date().toISOString(),
    };
    const result = validateTriageResult(withoutVersion);
    expect(result.valid).toBe(false);
  });
});
