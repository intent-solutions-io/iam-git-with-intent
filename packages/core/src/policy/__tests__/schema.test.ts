/**
 * Policy Schema Tests
 *
 * Epic D: Policy & Audit - Story D1: Policy Definition Schema
 *
 * Tests for all policy schema types, validation, and helpers.
 */

import { describe, it, expect } from 'vitest';

import {
  // Version and scope
  PolicyVersion,
  PolicyScope,
  ActorType,
  AgentType,
  ActionSource,
  // Conditions
  ComplexityCondition,
  FilePatternCondition,
  AuthorCondition,
  TimeWindowCondition,
  RepositoryCondition,
  BranchCondition,
  LabelCondition,
  AgentCondition,
  CustomCondition,
  PolicyCondition,
  // Actions
  ActionEffect,
  ApprovalConfig,
  NotificationConfig,
  PolicyAction,
  // Rules
  PolicyRule,
  // Documents
  PolicyDocument,
  PolicySet,
  // Evaluation
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  // Validation helpers
  validatePolicyDocument,
  validatePolicyRule,
  validateEvaluationRequest,
  isPolicyDocumentValid,
  getPolicyValidationErrors,
} from '../schema.js';

// =============================================================================
// Base Types Tests
// =============================================================================

describe('Base Types', () => {
  describe('PolicyVersion', () => {
    it('should accept valid versions', () => {
      expect(PolicyVersion.parse('1.0')).toBe('1.0');
      expect(PolicyVersion.parse('1.1')).toBe('1.1');
      expect(PolicyVersion.parse('2.0')).toBe('2.0');
    });

    it('should reject invalid versions', () => {
      expect(() => PolicyVersion.parse('3.0')).toThrow();
      expect(() => PolicyVersion.parse('invalid')).toThrow();
    });
  });

  describe('PolicyScope', () => {
    it('should accept valid scopes', () => {
      expect(PolicyScope.parse('global')).toBe('global');
      expect(PolicyScope.parse('org')).toBe('org');
      expect(PolicyScope.parse('repo')).toBe('repo');
      expect(PolicyScope.parse('branch')).toBe('branch');
    });
  });

  describe('ActorType', () => {
    it('should accept valid actor types', () => {
      expect(ActorType.parse('human')).toBe('human');
      expect(ActorType.parse('agent')).toBe('agent');
      expect(ActorType.parse('service')).toBe('service');
      expect(ActorType.parse('github_app')).toBe('github_app');
      expect(ActorType.parse('api_key')).toBe('api_key');
    });
  });

  describe('AgentType', () => {
    it('should accept valid agent types', () => {
      expect(AgentType.parse('triage')).toBe('triage');
      expect(AgentType.parse('coder')).toBe('coder');
      expect(AgentType.parse('resolver')).toBe('resolver');
      expect(AgentType.parse('reviewer')).toBe('reviewer');
      expect(AgentType.parse('orchestrator')).toBe('orchestrator');
    });
  });

  describe('ActionSource', () => {
    it('should accept valid sources', () => {
      expect(ActionSource.parse('cli')).toBe('cli');
      expect(ActionSource.parse('web')).toBe('web');
      expect(ActionSource.parse('api')).toBe('api');
      expect(ActionSource.parse('webhook')).toBe('webhook');
      expect(ActionSource.parse('scheduled')).toBe('scheduled');
    });
  });
});

// =============================================================================
// Condition Tests
// =============================================================================

describe('Policy Conditions', () => {
  describe('ComplexityCondition', () => {
    it('should accept valid complexity conditions', () => {
      const condition = ComplexityCondition.parse({
        type: 'complexity',
        operator: 'gte',
        threshold: 5,
      });
      expect(condition.type).toBe('complexity');
      expect(condition.operator).toBe('gte');
      expect(condition.threshold).toBe(5);
    });

    it('should reject threshold outside range', () => {
      expect(() => ComplexityCondition.parse({
        type: 'complexity',
        operator: 'gt',
        threshold: 15, // > 10
      })).toThrow();

      expect(() => ComplexityCondition.parse({
        type: 'complexity',
        operator: 'gt',
        threshold: -1, // < 0
      })).toThrow();
    });
  });

  describe('FilePatternCondition', () => {
    it('should accept valid file patterns', () => {
      const condition = FilePatternCondition.parse({
        type: 'file_pattern',
        patterns: ['*.ts', 'src/**/*.js'],
        matchType: 'include',
      });
      expect(condition.patterns).toHaveLength(2);
      expect(condition.matchType).toBe('include');
    });

    it('should default matchType to include', () => {
      const condition = FilePatternCondition.parse({
        type: 'file_pattern',
        patterns: ['*.ts'],
      });
      expect(condition.matchType).toBe('include');
    });

    it('should require at least one pattern', () => {
      expect(() => FilePatternCondition.parse({
        type: 'file_pattern',
        patterns: [],
      })).toThrow();
    });
  });

  describe('AuthorCondition', () => {
    it('should accept author conditions with various criteria', () => {
      const condition = AuthorCondition.parse({
        type: 'author',
        authors: ['alice', 'bob'],
        roles: ['maintainer', 'admin'],
        teams: ['core-team'],
      });
      expect(condition.authors).toEqual(['alice', 'bob']);
      expect(condition.roles).toEqual(['maintainer', 'admin']);
      expect(condition.teams).toEqual(['core-team']);
    });

    it('should allow empty criteria', () => {
      const condition = AuthorCondition.parse({
        type: 'author',
      });
      expect(condition.authors).toBeUndefined();
      expect(condition.roles).toBeUndefined();
    });
  });

  describe('TimeWindowCondition', () => {
    it('should accept valid time window', () => {
      const condition = TimeWindowCondition.parse({
        type: 'time_window',
        timezone: 'America/New_York',
        windows: [
          { days: ['mon', 'tue', 'wed', 'thu', 'fri'], startHour: 9, endHour: 17 },
        ],
        matchType: 'during',
      });
      expect(condition.timezone).toBe('America/New_York');
      expect(condition.windows).toHaveLength(1);
    });

    it('should default timezone to UTC', () => {
      const condition = TimeWindowCondition.parse({
        type: 'time_window',
        windows: [{ days: ['sat', 'sun'] }],
      });
      expect(condition.timezone).toBe('UTC');
    });
  });

  describe('LabelCondition', () => {
    it('should accept label conditions', () => {
      const condition = LabelCondition.parse({
        type: 'label',
        labels: ['security', 'critical'],
        matchType: 'any',
      });
      expect(condition.labels).toEqual(['security', 'critical']);
      expect(condition.matchType).toBe('any');
    });

    it('should support all match types', () => {
      expect(LabelCondition.parse({
        type: 'label',
        labels: ['a'],
        matchType: 'all',
      }).matchType).toBe('all');

      expect(LabelCondition.parse({
        type: 'label',
        labels: ['a'],
        matchType: 'none',
      }).matchType).toBe('none');
    });
  });

  describe('AgentCondition', () => {
    it('should accept agent conditions', () => {
      const condition = AgentCondition.parse({
        type: 'agent',
        agents: ['coder', 'resolver'],
        confidence: {
          operator: 'gte',
          threshold: 0.8,
        },
      });
      expect(condition.agents).toEqual(['coder', 'resolver']);
      expect(condition.confidence?.threshold).toBe(0.8);
    });
  });

  describe('PolicyCondition (discriminated union)', () => {
    it('should correctly discriminate condition types', () => {
      const complexity = PolicyCondition.parse({
        type: 'complexity',
        operator: 'gt',
        threshold: 7,
      });
      expect(complexity.type).toBe('complexity');

      const file = PolicyCondition.parse({
        type: 'file_pattern',
        patterns: ['*.ts'],
      });
      expect(file.type).toBe('file_pattern');

      const custom = PolicyCondition.parse({
        type: 'custom',
        field: 'pr.title',
        operator: 'contains',
        value: 'WIP',
      });
      expect(custom.type).toBe('custom');
    });
  });
});

// =============================================================================
// Action Tests
// =============================================================================

describe('Policy Actions', () => {
  describe('ActionEffect', () => {
    it('should accept all effect types', () => {
      const effects = ['allow', 'deny', 'require_approval', 'notify', 'log_only', 'warn'];
      effects.forEach(effect => {
        expect(ActionEffect.parse(effect)).toBe(effect);
      });
    });
  });

  describe('ApprovalConfig', () => {
    it('should accept valid approval config', () => {
      const config = ApprovalConfig.parse({
        minApprovers: 2,
        requiredRoles: ['maintainer'],
        timeoutHours: 24,
        allowSelfApproval: false,
      });
      expect(config.minApprovers).toBe(2);
      expect(config.requiredRoles).toEqual(['maintainer']);
      expect(config.timeoutHours).toBe(24);
    });

    it('should default minApprovers to 1', () => {
      const config = ApprovalConfig.parse({});
      expect(config.minApprovers).toBe(1);
    });

    it('should reject timeout over 168 hours', () => {
      expect(() => ApprovalConfig.parse({
        timeoutHours: 200,
      })).toThrow();
    });
  });

  describe('NotificationConfig', () => {
    it('should accept valid notification config', () => {
      const config = NotificationConfig.parse({
        channels: ['slack', 'email'],
        recipients: ['team-security'],
        severity: 'warning',
      });
      expect(config.channels).toEqual(['slack', 'email']);
      expect(config.severity).toBe('warning');
    });

    it('should require at least one channel', () => {
      expect(() => NotificationConfig.parse({
        channels: [],
      })).toThrow();
    });
  });

  describe('PolicyAction', () => {
    it('should accept full action definition', () => {
      const action = PolicyAction.parse({
        effect: 'require_approval',
        reason: 'High complexity change requires review',
        approval: {
          minApprovers: 2,
          requiredRoles: ['maintainer'],
        },
        notification: {
          channels: ['slack'],
          severity: 'warning',
        },
      });
      expect(action.effect).toBe('require_approval');
      expect(action.approval?.minApprovers).toBe(2);
    });

    it('should default continueOnMatch to false', () => {
      const action = PolicyAction.parse({
        effect: 'allow',
      });
      expect(action.continueOnMatch).toBe(false);
    });
  });
});

// =============================================================================
// Policy Rule Tests
// =============================================================================

describe('PolicyRule', () => {
  it('should accept valid rule', () => {
    const rule = PolicyRule.parse({
      id: 'require-review-high-complexity',
      name: 'Require Review for High Complexity',
      description: 'Changes with complexity >= 7 require human review',
      enabled: true,
      priority: 100,
      conditions: [
        { type: 'complexity', operator: 'gte', threshold: 7 },
      ],
      action: {
        effect: 'require_approval',
        reason: 'High complexity requires review',
        approval: { minApprovers: 1 },
      },
      tags: ['security', 'quality'],
    });
    expect(rule.id).toBe('require-review-high-complexity');
    expect(rule.conditions).toHaveLength(1);
  });

  it('should validate rule ID format', () => {
    expect(() => PolicyRule.parse({
      id: 'invalid id with spaces',
      name: 'Test',
      action: { effect: 'allow' },
    })).toThrow();

    expect(() => PolicyRule.parse({
      id: 'valid-rule-123',
      name: 'Test',
      action: { effect: 'allow' },
    })).not.toThrow();
  });

  it('should enforce name length limits', () => {
    expect(() => PolicyRule.parse({
      id: 'test',
      name: '', // Empty
      action: { effect: 'allow' },
    })).toThrow();

    expect(() => PolicyRule.parse({
      id: 'test',
      name: 'a'.repeat(101), // > 100 chars
      action: { effect: 'allow' },
    })).toThrow();
  });

  it('should default enabled to true', () => {
    const rule = PolicyRule.parse({
      id: 'test',
      name: 'Test Rule',
      action: { effect: 'allow' },
    });
    expect(rule.enabled).toBe(true);
  });
});

// =============================================================================
// Policy Document Tests
// =============================================================================

describe('PolicyDocument', () => {
  it('should accept valid policy document', () => {
    const doc = PolicyDocument.parse({
      version: '2.0',
      name: 'Production Security Policy',
      description: 'Policies for production deployments',
      scope: 'repo',
      scopeTarget: 'myorg/myrepo',
      inheritance: 'override',
      defaultAction: {
        effect: 'deny',
        reason: 'No matching policy rule',
      },
      rules: [
        {
          id: 'allow-read',
          name: 'Allow Read Operations',
          action: { effect: 'allow' },
        },
        {
          id: 'require-review',
          name: 'Require Review for Complex Changes',
          conditions: [
            { type: 'complexity', operator: 'gte', threshold: 5 },
          ],
          action: {
            effect: 'require_approval',
            approval: { minApprovers: 1 },
          },
        },
      ],
    });
    expect(doc.name).toBe('Production Security Policy');
    expect(doc.rules).toHaveLength(2);
  });

  it('should default version to 2.0', () => {
    const doc = PolicyDocument.parse({
      name: 'Test Policy',
      rules: [],
    });
    expect(doc.version).toBe('2.0');
  });

  it('should default scope to repo', () => {
    const doc = PolicyDocument.parse({
      name: 'Test Policy',
      rules: [],
    });
    expect(doc.scope).toBe('repo');
  });

  it('should default inheritance to override', () => {
    const doc = PolicyDocument.parse({
      name: 'Test Policy',
      rules: [],
    });
    expect(doc.inheritance).toBe('override');
  });
});

// =============================================================================
// Policy Set Tests
// =============================================================================

describe('PolicySet', () => {
  it('should accept valid policy set', () => {
    const set = PolicySet.parse({
      id: 'production-policies',
      name: 'Production Policy Set',
      description: 'All policies for production',
      policies: [
        {
          name: 'Security Policy',
          rules: [
            { id: 'rule1', name: 'Rule 1', action: { effect: 'allow' } },
          ],
        },
      ],
      stopOnFirstMatch: true,
    });
    expect(set.policies).toHaveLength(1);
    expect(set.stopOnFirstMatch).toBe(true);
  });
});

// =============================================================================
// Evaluation Types Tests
// =============================================================================

describe('PolicyEvaluationRequest', () => {
  it('should accept valid evaluation request', () => {
    const request = PolicyEvaluationRequest.parse({
      actor: {
        id: 'user-123',
        type: 'human',
        roles: ['developer'],
        teams: ['frontend'],
      },
      action: {
        name: 'pr.merge',
        agentType: 'coder',
        confidence: 0.9,
      },
      resource: {
        type: 'pull_request',
        repo: { owner: 'myorg', name: 'myrepo' },
        branch: 'main',
        files: ['src/index.ts', 'src/utils.ts'],
        labels: ['feature'],
        complexity: 5,
      },
      context: {
        source: 'cli',
        timestamp: new Date(),
        requestId: 'req-123',
      },
      hasApproval: false,
    });
    expect(request.actor.id).toBe('user-123');
    expect(request.action.confidence).toBe(0.9);
  });
});

describe('PolicyEvaluationResult', () => {
  it('should accept valid evaluation result', () => {
    const result = PolicyEvaluationResult.parse({
      allowed: false,
      effect: 'require_approval',
      reason: 'High complexity change requires review',
      matchedRule: {
        id: 'require-review',
        name: 'Require Review',
        policyId: 'prod-policy',
      },
      requiredActions: [
        { type: 'approval', config: { minApprovers: 2 } },
      ],
      metadata: {
        evaluatedAt: new Date(),
        evaluationTimeMs: 5,
        rulesEvaluated: 3,
        policiesEvaluated: 1,
      },
    });
    expect(result.allowed).toBe(false);
    expect(result.effect).toBe('require_approval');
  });
});

// =============================================================================
// Validation Helper Tests
// =============================================================================

describe('Validation Helpers', () => {
  describe('validatePolicyDocument', () => {
    it('should return parsed document for valid input', () => {
      const doc = validatePolicyDocument({
        name: 'Test Policy',
        rules: [],
      });
      expect(doc.name).toBe('Test Policy');
    });

    it('should throw for invalid input', () => {
      expect(() => validatePolicyDocument({
        // Missing name
        rules: [],
      })).toThrow();
    });
  });

  describe('validatePolicyRule', () => {
    it('should return parsed rule for valid input', () => {
      const rule = validatePolicyRule({
        id: 'test-rule',
        name: 'Test Rule',
        action: { effect: 'allow' },
      });
      expect(rule.id).toBe('test-rule');
    });
  });

  describe('isPolicyDocumentValid', () => {
    it('should return true for valid document', () => {
      expect(isPolicyDocumentValid({
        name: 'Test',
        rules: [],
      })).toBe(true);
    });

    it('should return false for invalid document', () => {
      expect(isPolicyDocumentValid({
        rules: [], // Missing name
      })).toBe(false);
    });
  });

  describe('getPolicyValidationErrors', () => {
    it('should return empty array for valid document', () => {
      const errors = getPolicyValidationErrors({
        name: 'Test',
        rules: [],
      });
      expect(errors).toEqual([]);
    });

    it('should return error messages for invalid document', () => {
      const errors = getPolicyValidationErrors({
        rules: [], // Missing name
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('name');
    });

    it('should return errors for invalid rules', () => {
      const errors = getPolicyValidationErrors({
        name: 'Test',
        rules: [
          { id: 'invalid id!', name: 'Bad Rule', action: { effect: 'allow' } },
        ],
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Complex Scenario Tests
// =============================================================================

describe('Complex Policy Scenarios', () => {
  it('should handle policy with multiple condition types', () => {
    const rule = PolicyRule.parse({
      id: 'complex-rule',
      name: 'Complex Security Rule',
      conditions: [
        { type: 'complexity', operator: 'gte', threshold: 7 },
        { type: 'file_pattern', patterns: ['**/security/**', '**/auth/**'] },
        { type: 'branch', branches: ['main', 'production'], protected: true },
        { type: 'label', labels: ['security'], matchType: 'any' },
      ],
      action: {
        effect: 'require_approval',
        reason: 'Security-sensitive changes require expert review',
        approval: {
          minApprovers: 2,
          requiredRoles: ['security-team'],
          timeoutHours: 48,
        },
        notification: {
          channels: ['slack', 'email'],
          recipients: ['security-team'],
          severity: 'critical',
        },
      },
    });
    expect(rule.conditions).toHaveLength(4);
    expect(rule.action.approval?.minApprovers).toBe(2);
  });

  it('should handle policy with inheritance', () => {
    const childPolicy = PolicyDocument.parse({
      name: 'Child Policy',
      scope: 'branch',
      scopeTarget: 'feature/*',
      inheritance: 'extend',
      parentPolicyId: 'parent-policy-id',
      rules: [
        {
          id: 'allow-feature-branches',
          name: 'Allow Feature Branch Changes',
          action: { effect: 'allow' },
        },
      ],
    });
    expect(childPolicy.inheritance).toBe('extend');
    expect(childPolicy.parentPolicyId).toBe('parent-policy-id');
  });

  it('should handle policy with metadata', () => {
    const doc = PolicyDocument.parse({
      name: 'Tracked Policy',
      rules: [],
      metadata: {
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        createdBy: 'admin-user',
        revision: 5,
        changelog: [
          {
            revision: 5,
            timestamp: new Date('2024-06-01'),
            userId: 'admin-user',
            description: 'Added complexity threshold',
          },
        ],
      },
    });
    expect(doc.metadata?.revision).toBe(5);
    expect(doc.metadata?.changelog).toHaveLength(1);
  });
});
