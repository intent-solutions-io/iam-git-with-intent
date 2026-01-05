/**
 * Policy Validation Tests
 *
 * Epic D: Policy & Audit - Story D1: Policy Definition Schema
 * Task D1.5: Add policy validation
 *
 * @module @gwi/core/policy/validation.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PolicyValidator,
  createPolicyValidator,
  isValidPolicy,
  validatePolicy,
  formatValidationErrors,
  ValidationErrorCodes,
  type ValidationError,
  type ValidationResult,
  type CustomValidationRule,
} from '../validation.js';
import type { PolicyDocument, PolicyRule } from '../schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMinimalValidPolicy(): PolicyDocument {
  return {
    version: '2.0',
    name: 'Test Policy',
    scope: 'repo',
    inheritance: 'override',
    defaultAction: { effect: 'deny', reason: 'Default deny' },
    rules: [],
  };
}

function createValidRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    enabled: true,
    priority: 0,
    action: { effect: 'allow' },
    ...overrides,
  };
}

// =============================================================================
// PolicyValidator Tests
// =============================================================================

describe('PolicyValidator', () => {
  let validator: PolicyValidator;

  beforeEach(() => {
    validator = new PolicyValidator();
  });

  describe('validate()', () => {
    describe('schema validation', () => {
      it('should pass for valid minimal policy', () => {
        const policy = createMinimalValidPolicy();
        const result = validator.validate(policy);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.policy).toBeDefined();
      });

      it('should fail for non-object input', () => {
        const result = validator.validate('not an object');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe(ValidationErrorCodes.INVALID_SCHEMA);
      });

      it('should fail for null input', () => {
        const result = validator.validate(null);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should fail for missing required name', () => {
        const result = validator.validate({
          version: '2.0',
          rules: [],
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('name'))).toBe(true);
      });

      it('should fail for invalid rule ID format', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [{
          id: 'invalid id with spaces',
          name: 'Test',
          action: { effect: 'allow' },
        }];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('id'))).toBe(true);
      });

      it('should fail for invalid action effect', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [{
          id: 'test-rule',
          name: 'Test',
          action: { effect: 'invalid' as any },
        }];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
      });

      it('should fail for invalid scope', () => {
        const result = validator.validate({
          version: '2.0',
          name: 'Test',
          scope: 'invalid',
          rules: [],
        });

        expect(result.valid).toBe(false);
      });
    });

    describe('semantic validation', () => {
      it('should detect duplicate rule IDs', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({ id: 'duplicate-id' }),
          createValidRule({ id: 'duplicate-id' }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationErrorCodes.DUPLICATE_RULE_ID)).toBe(true);
      });

      it('should error on require_approval without approval config', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            action: { effect: 'require_approval' },
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationErrorCodes.MISSING_APPROVAL_CONFIG)).toBe(true);
      });

      it('should pass require_approval with approval config', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            action: {
              effect: 'require_approval',
              approval: { minApprovers: 2 },
            },
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(true);
      });

      it('should error on global policy with parent', () => {
        const policy = createMinimalValidPolicy();
        policy.scope = 'global';
        policy.parentPolicyId = 'parent-policy-id';

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationErrorCodes.INVALID_PARENT_SCOPE)).toBe(true);
      });

      it('should allow org policy with parent', () => {
        const policy = createMinimalValidPolicy();
        policy.scope = 'org';
        policy.parentPolicyId = 'parent-policy-id';

        const result = validator.validate(policy);

        expect(result.valid).toBe(true);
      });
    });

    describe('condition validation', () => {
      it('should error on invalid complexity threshold (too high)', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{ type: 'complexity', operator: 'gt', threshold: 15 }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
      });

      it('should error on invalid complexity threshold (negative)', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{ type: 'complexity', operator: 'gt', threshold: -1 }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
      });

      it('should pass valid complexity condition', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{ type: 'complexity', operator: 'gt', threshold: 5 }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(true);
      });

      it('should error on invalid glob pattern (empty)', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{ type: 'file_pattern', patterns: [''] }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationErrorCodes.INVALID_PATTERN)).toBe(true);
      });

      it('should error on invalid glob pattern (triple asterisk)', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{ type: 'file_pattern', patterns: ['***'] }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationErrorCodes.INVALID_PATTERN)).toBe(true);
      });

      it('should pass valid file pattern conditions', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{ type: 'file_pattern', patterns: ['*.ts', 'src/**/*.js', '!node_modules/**'] }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(true);
      });

      it('should error on time window with start >= end', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{
              type: 'time_window',
              windows: [{ startHour: 17, endHour: 9 }],
            }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === ValidationErrorCodes.INVALID_FIELD_VALUE)).toBe(true);
      });

      it('should pass valid time window condition', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({
            conditions: [{
              type: 'time_window',
              windows: [{ days: ['mon', 'tue', 'wed'], startHour: 9, endHour: 17 }],
            }],
          }),
        ];

        const result = validator.validate(policy);

        expect(result.valid).toBe(true);
      });
    });

    describe('warnings', () => {
      it('should warn about disabled rules', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({ enabled: false }),
        ];

        const result = validator.validate(policy, { includeWarnings: true });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.code === ValidationErrorCodes.UNUSED_RULE)).toBe(true);
      });

      it('should warn about rules without conditions', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({ conditions: [] }),
        ];

        const result = validator.validate(policy, { includeWarnings: true });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.code === ValidationErrorCodes.OVERLAPPING_CONDITIONS)).toBe(true);
      });

      it('should warn about high rule count', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = Array.from({ length: 51 }, (_, i) =>
          createValidRule({ id: `rule-${i}` })
        );

        const result = validator.validate(policy, { includeWarnings: true });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.code === ValidationErrorCodes.HIGH_COMPLEXITY)).toBe(true);
      });

      it('should not include warnings when disabled', () => {
        const policy = createMinimalValidPolicy();
        policy.rules = [
          createValidRule({ enabled: false }),
        ];

        const result = validator.validate(policy, { includeWarnings: false });

        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('info messages', () => {
      it('should include inheritance info when enabled', () => {
        const policy = createMinimalValidPolicy();
        policy.parentPolicyId = 'parent-id';

        const result = validator.validate(policy, { includeInfo: true });

        expect(result.valid).toBe(true);
        expect(result.info.some(i => i.code === 'INHERITANCE_ENABLED')).toBe(true);
      });

      it('should not include info by default', () => {
        const policy = createMinimalValidPolicy();
        policy.parentPolicyId = 'parent-id';

        const result = validator.validate(policy);

        // Migration info is always included, but not inheritance info
        const inheritanceInfo = result.info.filter(i => i.code === 'INHERITANCE_ENABLED');
        expect(inheritanceInfo).toHaveLength(0);
      });
    });
  });

  describe('migratePolicy()', () => {
    it('should migrate from 1.0 to 2.0', () => {
      const policy: any = {
        version: '1.0',
        name: 'Old Policy',
        scope: 'repo',
        rules: [],
      };

      const result = validator.validate(policy, { autoMigrate: true });

      expect(result.valid).toBe(true);
      expect(result.migrated).toBe(true);
      expect(result.originalVersion).toBe('1.0');
      expect(result.policy?.version).toBe('2.0');
    });

    it('should migrate from 1.1 to 2.0', () => {
      const policy: any = {
        version: '1.1',
        name: 'Medium Policy',
        scope: 'repo',
        metadata: { createdAt: new Date(), revision: 1 },
        rules: [],
      };

      const result = validator.validate(policy, { autoMigrate: true });

      expect(result.valid).toBe(true);
      expect(result.migrated).toBe(true);
      expect(result.originalVersion).toBe('1.1');
      expect(result.policy?.version).toBe('2.0');
    });

    it('should not migrate when autoMigrate is false', () => {
      const policy: any = {
        version: '1.0',
        name: 'Old Policy',
        scope: 'repo',
        rules: [],
      };

      const result = validator.validate(policy, { autoMigrate: false });

      expect(result.migrated).toBe(false);
      expect(result.policy?.version).toBe('1.0');
    });

    it('should add default values during migration', () => {
      const policy: any = {
        version: '1.0',
        name: 'Old Policy',
        scope: 'repo',
        rules: [],
      };

      const result = validator.validate(policy, { autoMigrate: true });

      expect(result.policy?.inheritance).toBe('override');
      expect(result.policy?.defaultAction).toBeDefined();
      expect(result.policy?.metadata).toBeDefined();
    });

    it('should include migration info message', () => {
      const policy: any = {
        version: '1.0',
        name: 'Old Policy',
        scope: 'repo',
        rules: [],
      };

      const result = validator.validate(policy, { autoMigrate: true });

      expect(result.info.some(i => i.code === 'MIGRATION_APPLIED')).toBe(true);
    });
  });

  describe('addCustomRule()', () => {
    it('should run custom validation rules', () => {
      const customRule: CustomValidationRule = {
        id: 'no-allow-all',
        name: 'No allow-all rules',
        validate: (policy) => {
          const errors: ValidationError[] = [];
          for (let i = 0; i < policy.rules.length; i++) {
            const rule = policy.rules[i];
            if (rule.action.effect === 'allow' && !rule.conditions?.length && !rule.conditionLogic) {
              errors.push({
                code: 'NO_ALLOW_ALL',
                message: `Rule '${rule.id}' allows all requests without conditions`,
                path: `rules[${i}]`,
                severity: 'error',
              });
            }
          }
          return errors;
        },
      };

      validator.addCustomRule(customRule);

      const policy = createMinimalValidPolicy();
      policy.rules = [createValidRule({ action: { effect: 'allow' } })];

      const result = validator.validate(policy);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'NO_ALLOW_ALL')).toBe(true);
    });

    it('should support custom warning rules', () => {
      const customRule: CustomValidationRule = {
        id: 'warn-on-deny-all',
        name: 'Warn on deny-all',
        validate: (policy) => {
          if (policy.defaultAction.effect === 'deny') {
            return [{
              code: 'DENY_ALL_DEFAULT',
              message: 'Default deny may be too restrictive',
              path: 'defaultAction',
              severity: 'warning',
            }];
          }
          return [];
        },
      };

      validator.addCustomRule(customRule);

      const policy = createMinimalValidPolicy();
      const result = validator.validate(policy);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'DENY_ALL_DEFAULT')).toBe(true);
    });
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('createPolicyValidator()', () => {
  it('should create a validator instance', () => {
    const validator = createPolicyValidator();
    expect(validator).toBeInstanceOf(PolicyValidator);
  });

  it('should accept custom rules in constructor', () => {
    const customRule: CustomValidationRule = {
      id: 'test',
      name: 'Test',
      validate: () => [],
    };

    const validator = createPolicyValidator({ customRules: [customRule] });
    expect(validator).toBeInstanceOf(PolicyValidator);
  });
});

describe('isValidPolicy()', () => {
  it('should return true for valid policy', () => {
    const policy = createMinimalValidPolicy();
    expect(isValidPolicy(policy)).toBe(true);
  });

  it('should return false for invalid policy', () => {
    expect(isValidPolicy({ invalid: true })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isValidPolicy(null)).toBe(false);
  });
});

describe('validatePolicy()', () => {
  it('should return full validation result', () => {
    const policy = createMinimalValidPolicy();
    const result = validatePolicy(policy);

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('info');
    expect(result).toHaveProperty('migrated');
  });

  it('should accept options', () => {
    const policy = createMinimalValidPolicy();
    policy.rules = [createValidRule({ enabled: false })];

    const resultWithWarnings = validatePolicy(policy, { includeWarnings: true });
    const resultWithoutWarnings = validatePolicy(policy, { includeWarnings: false });

    expect(resultWithWarnings.warnings.length).toBeGreaterThan(0);
    expect(resultWithoutWarnings.warnings).toHaveLength(0);
  });
});

describe('formatValidationErrors()', () => {
  it('should format errors with details', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{
        code: 'TEST_ERROR',
        message: 'Test error message',
        path: 'rules[0].id',
        severity: 'error',
        suggestion: 'Fix the error',
      }],
      warnings: [],
      info: [],
      migrated: false,
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('TEST_ERROR');
    expect(formatted).toContain('Test error message');
    expect(formatted).toContain('rules[0].id');
    expect(formatted).toContain('Fix the error');
  });

  it('should format warnings', () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [{
        code: 'TEST_WARNING',
        message: 'Test warning message',
        path: 'rules[0]',
        severity: 'warning',
      }],
      info: [],
      migrated: false,
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('Warnings:');
    expect(formatted).toContain('TEST_WARNING');
  });

  it('should include migration note', () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      migrated: true,
      originalVersion: '1.0',
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toContain('migrated');
    expect(formatted).toContain('1.0');
  });

  it('should return empty string for no issues', () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      migrated: false,
    };

    const formatted = formatValidationErrors(result);

    expect(formatted).toBe('');
  });
});

// =============================================================================
// Edge Cases and Error Messages
// =============================================================================

describe('error messages', () => {
  it('should provide helpful suggestion for invalid effect', () => {
    const result = validatePolicy({
      version: '2.0',
      name: 'Test',
      rules: [{
        id: 'test',
        name: 'Test',
        action: { effect: 'block' },
      }],
    });

    expect(result.valid).toBe(false);
    // Should have suggestion about valid effects
    const effectError = result.errors.find(e => e.path.includes('effect'));
    expect(effectError?.suggestion).toContain('allow');
  });

  it('should provide helpful suggestion for invalid scope', () => {
    const result = validatePolicy({
      version: '2.0',
      name: 'Test',
      scope: 'team',
      rules: [],
    });

    expect(result.valid).toBe(false);
    const scopeError = result.errors.find(e => e.path.includes('scope'));
    expect(scopeError?.suggestion).toContain('global');
  });

  it('should provide helpful suggestion for invalid rule ID', () => {
    const result = validatePolicy({
      version: '2.0',
      name: 'Test',
      rules: [{
        id: 'invalid id!@#',
        name: 'Test',
        action: { effect: 'allow' },
      }],
    });

    expect(result.valid).toBe(false);
    const idError = result.errors.find(e => e.path.includes('id'));
    expect(idError?.suggestion).toContain('alphanumeric');
  });
});

describe('complex scenarios', () => {
  it('should validate complex policy with multiple rules and conditions', () => {
    const policy: PolicyDocument = {
      version: '2.0',
      name: 'Complex Policy',
      description: 'A complex policy for testing',
      scope: 'repo',
      inheritance: 'extend',
      defaultAction: { effect: 'deny', reason: 'No matching rule' },
      rules: [
        {
          id: 'allow-maintainers',
          name: 'Allow Maintainers',
          enabled: true,
          priority: 100,
          conditions: [
            { type: 'author', roles: ['maintainer', 'admin'] },
          ],
          action: { effect: 'allow' },
        },
        {
          id: 'require-review-complex',
          name: 'Require Review for Complex PRs',
          enabled: true,
          priority: 50,
          conditions: [
            { type: 'complexity', operator: 'gte', threshold: 7 },
            { type: 'file_pattern', patterns: ['src/**/*.ts'] },
          ],
          action: {
            effect: 'require_approval',
            approval: {
              minApprovers: 2,
              requiredRoles: ['senior-dev'],
              timeoutHours: 48,
            },
          },
        },
        {
          id: 'deny-after-hours',
          name: 'Deny After Hours',
          enabled: true,
          priority: 200,
          conditions: [
            {
              type: 'time_window',
              timezone: 'America/Los_Angeles',
              windows: [{ days: ['sat', 'sun'] }],
              matchType: 'during',
            },
          ],
          action: {
            effect: 'deny',
            reason: 'No deployments on weekends',
            notification: {
              channels: ['slack'],
              severity: 'warning',
            },
          },
        },
      ],
    };

    const result = validatePolicy(policy);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should catch multiple errors in one pass', () => {
    const policy = {
      version: '2.0',
      name: 'Bad Policy',
      scope: 'repo',
      rules: [
        {
          id: 'duplicate-id',
          name: 'First Rule',
          action: { effect: 'require_approval' }, // Missing approval config
        },
        {
          id: 'duplicate-id', // Duplicate ID
          name: 'Second Rule',
          action: { effect: 'allow' },
        },
      ],
    };

    const result = validatePolicy(policy);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some(e => e.code === ValidationErrorCodes.DUPLICATE_RULE_ID)).toBe(true);
    expect(result.errors.some(e => e.code === ValidationErrorCodes.MISSING_APPROVAL_CONFIG)).toBe(true);
  });
});
