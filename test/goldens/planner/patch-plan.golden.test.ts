/**
 * Phase 26: PatchPlan Golden Tests
 *
 * Deterministic tests using frozen fixtures.
 * NO live model calls - these test schema validation and PlanGuard only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validatePatchPlan,
  parsePatchPlan,
  safeParsePatchPlan,
  validatePatchPlanSecurity,
  PatchPlanSchema,
  PlanGuard,
  type PatchPlan,
} from '@gwi/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

// =============================================================================
// Test Helpers
// =============================================================================

function loadFixture(name: string): unknown {
  const path = join(FIXTURES_DIR, name);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('PatchPlan Schema Validation', () => {
  describe('Valid Plans', () => {
    it('should validate a complete valid plan', () => {
      const plan = loadFixture('valid-plan.json');
      const result = validatePatchPlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should parse a valid plan without throwing', () => {
      const plan = loadFixture('valid-plan.json');
      const parsed = parsePatchPlan(plan);

      expect(parsed.plan_id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(parsed.provider).toBe('gemini');
      expect(parsed.files.length).toBe(5);
      expect(parsed.steps.length).toBe(5);
    });

    it('should safely parse a valid plan', () => {
      const plan = loadFixture('valid-plan.json');
      const parsed = safeParsePatchPlan(plan);

      expect(parsed).not.toBeNull();
      expect(parsed?.version).toBe(1);
    });
  });

  describe('Invalid Plans - Schema Errors', () => {
    it('should reject plan missing required fields', () => {
      const invalidPlan = {
        plan_id: '550e8400-e29b-41d4-a716-446655440000',
        // Missing many required fields
      };

      const result = validatePatchPlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errorMessages).toBeDefined();
      expect(result.errorMessages?.length).toBeGreaterThan(0);
    });

    it('should reject plan with invalid UUID', () => {
      const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
      plan.plan_id = 'not-a-uuid';

      const result = validatePatchPlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errorMessages?.some((m) => m.includes('uuid'))).toBe(true);
    });

    it('should reject plan with invalid provider', () => {
      const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
      plan.provider = 'openai'; // Not supported

      const result = validatePatchPlan(plan);
      expect(result.valid).toBe(false);
    });

    it('should reject plan with empty files array', () => {
      const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
      plan.files = [];

      const result = validatePatchPlan(plan);
      expect(result.valid).toBe(false);
    });

    it('should reject plan with empty steps array', () => {
      const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
      plan.steps = [];

      const result = validatePatchPlan(plan);
      expect(result.valid).toBe(false);
    });

    it('should reject plan with invalid version', () => {
      const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
      plan.version = 2; // Only version 1 supported

      const result = validatePatchPlan(plan);
      expect(result.valid).toBe(false);
    });

    it('should safely return null for invalid plan', () => {
      const invalidPlan = { invalid: true };
      const parsed = safeParsePatchPlan(invalidPlan);
      expect(parsed).toBeNull();
    });
  });

  describe('Invalid Plans - Security Violations', () => {
    it('should reject plan with path traversal', () => {
      const plan = loadFixture('invalid-plan-path-traversal.json');
      const result = validatePatchPlan(plan);

      expect(result.valid).toBe(false);
      expect(
        result.errorMessages?.some((m) => m.includes('traversal'))
      ).toBe(true);
    });

    it('should reject plan with absolute path', () => {
      const plan = loadFixture('invalid-plan-absolute-path.json');
      const result = validatePatchPlan(plan);

      expect(result.valid).toBe(false);
      expect(
        result.errorMessages?.some((m) => m.includes('Absolute'))
      ).toBe(true);
    });
  });
});

// =============================================================================
// Security Validation Tests
// =============================================================================

describe('PatchPlan Security Validation', () => {
  it('should pass security validation for clean plan', () => {
    const plan = parsePatchPlan(loadFixture('valid-plan.json'));
    const result = validatePatchPlanSecurity(plan);

    expect(result.secure).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should detect shell injection in file paths', () => {
    const plan = parsePatchPlan(loadFixture('valid-plan.json'));
    // Modify to include suspicious pattern
    plan.files[0].path = 'src/`rm -rf /`.ts';

    const result = validatePatchPlanSecurity(plan);
    expect(result.secure).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('should detect dangerous test commands', () => {
    const plan = parsePatchPlan(loadFixture('valid-plan.json'));
    // Modify test command to include dangerous pattern
    plan.tests[0].command = 'npm test; rm -rf /';

    const result = validatePatchPlanSecurity(plan);
    expect(result.secure).toBe(false);
  });
});

// =============================================================================
// PlanGuard Tests
// =============================================================================

describe('PlanGuard', () => {
  let guard: PlanGuard;

  beforeEach(() => {
    guard = new PlanGuard({
      maxRiskLevel: 'high',
      maxFiles: 50,
      maxSteps: 20,
      enforcePolicyChecks: false, // Disable for golden tests
      emitAuditEvents: false, // Disable for tests
    });
  });

  describe('Valid Plans', () => {
    it('should allow a valid low-risk plan', async () => {
      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      const result = await guard.check(plan);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Risk Level Checks', () => {
    it('should block critical-risk plans when max is high', async () => {
      const plan = parsePatchPlan(loadFixture('high-risk-plan.json'));
      const result = await guard.check(plan);

      expect(result.allowed).toBe(false);
      expect(
        result.violations.some((v) => v.category === 'risk')
      ).toBe(true);
    });

    it('should allow critical-risk plans when configured', async () => {
      const permissiveGuard = new PlanGuard({
        maxRiskLevel: 'critical',
        enforcePolicyChecks: false,
        emitAuditEvents: false,
      });

      const plan = parsePatchPlan(loadFixture('high-risk-plan.json'));
      const result = await permissiveGuard.check(plan);

      // May still have other violations but not risk-level
      const riskViolations = result.violations.filter(
        (v) => v.category === 'risk'
      );
      expect(riskViolations).toHaveLength(0);
    });
  });

  describe('Limit Checks', () => {
    it('should block plans exceeding file limit', async () => {
      const strictGuard = new PlanGuard({
        maxFiles: 2,
        enforcePolicyChecks: false,
        emitAuditEvents: false,
      });

      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      const result = await strictGuard.check(plan);

      expect(result.allowed).toBe(false);
      expect(
        result.violations.some((v) => v.category === 'limits')
      ).toBe(true);
    });

    it('should block plans exceeding step limit', async () => {
      const strictGuard = new PlanGuard({
        maxSteps: 2,
        enforcePolicyChecks: false,
        emitAuditEvents: false,
      });

      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      const result = await strictGuard.check(plan);

      expect(result.allowed).toBe(false);
      expect(
        result.violations.some((v) => v.category === 'limits')
      ).toBe(true);
    });
  });

  describe('Blocked Files', () => {
    it('should block plans touching .env files', async () => {
      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      plan.files.push({
        path: '.env',
        action: 'modify',
        reason: 'Update environment variables',
      });

      const result = await guard.check(plan);

      expect(result.allowed).toBe(false);
      expect(
        result.violations.some((v) => v.category === 'blocked_file')
      ).toBe(true);
    });

    it('should block plans touching credential files', async () => {
      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      plan.files.push({
        path: 'config/credentials.json',
        action: 'create',
        reason: 'Store credentials',
      });

      const result = await guard.check(plan);

      expect(result.allowed).toBe(false);
      expect(
        result.violations.some((v) => v.category === 'blocked_file')
      ).toBe(true);
    });
  });

  describe('Test Requirements', () => {
    it('should warn when medium-risk plan has no tests', async () => {
      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      plan.risk.overall = 'medium';
      plan.tests = [];

      const result = await guard.check(plan);

      // Should have a warning about missing tests
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should error when high-risk plan has no tests', async () => {
      const plan = parsePatchPlan(loadFixture('valid-plan.json'));
      plan.risk.overall = 'high';
      plan.tests = [];

      const result = await guard.check(plan);

      expect(result.allowed).toBe(false);
      expect(
        result.violations.some((v) => v.category === 'missing_tests')
      ).toBe(true);
    });
  });
});

// =============================================================================
// Zod Schema Direct Tests
// =============================================================================

describe('PatchPlanSchema Direct', () => {
  it('should expose SafeFilePath validation rules', () => {
    const schema = PatchPlanSchema;
    expect(schema).toBeDefined();
  });

  it('should validate risk levels', () => {
    const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
    const risk = plan.risk as Record<string, unknown>;
    risk.overall = 'invalid-level';

    const result = validatePatchPlan(plan);
    expect(result.valid).toBe(false);
  });

  it('should validate test types', () => {
    const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
    const tests = plan.tests as Record<string, unknown>[];
    tests[0].type = 'invalid-type';

    const result = validatePatchPlan(plan);
    expect(result.valid).toBe(false);
  });

  it('should validate file actions', () => {
    const plan = loadFixture('valid-plan.json') as Record<string, unknown>;
    const files = plan.files as Record<string, unknown>[];
    files[0].action = 'invalid-action';

    const result = validatePatchPlan(plan);
    expect(result.valid).toBe(false);
  });
});
