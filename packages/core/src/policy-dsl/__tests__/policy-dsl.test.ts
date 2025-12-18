/**
 * Policy DSL Parser Tests
 *
 * Phase 42: Tests for policy DSL parsing and evaluation.
 */

import { describe, it, expect } from 'vitest';
import {
  parseCondition,
  parseConditions,
  evaluateDslCondition,
  evaluateDslRule,
  evaluateDslPolicy,
  validateDslPolicy,
  createDslAllowPolicy,
  createDslDenyPolicy,
  createDslRule,
  PolicyCondition,
  DslDslPolicyContext,
  DslDslPolicyDocument,
} from '../index.js';

// =============================================================================
// Condition Parsing Tests
// =============================================================================

describe('parseCondition', () => {
  it('should parse equality condition', () => {
    const condition = parseCondition('actor.type == "user"');

    expect(condition.field).toBe('actor.type');
    expect(condition.operator).toBe('eq');
    expect(condition.value).toBe('user');
  });

  it('should parse inequality condition', () => {
    const condition = parseCondition('actor.type != "system"');

    expect(condition.field).toBe('actor.type');
    expect(condition.operator).toBe('ne');
    expect(condition.value).toBe('system');
  });

  it('should parse comparison operators', () => {
    expect(parseCondition('resource.size > 100').operator).toBe('gt');
    expect(parseCondition('resource.size >= 100').operator).toBe('gte');
    expect(parseCondition('resource.size < 100').operator).toBe('lt');
    expect(parseCondition('resource.size <= 100').operator).toBe('lte');
  });

  it('should parse in operator', () => {
    const condition = parseCondition('actor.role in "admin"');

    expect(condition.operator).toBe('in');
  });

  it('should parse contains operator', () => {
    const condition = parseCondition('resource.name contains "test"');

    expect(condition.operator).toBe('contains');
  });

  it('should parse boolean values', () => {
    expect(parseCondition('resource.active == true').value).toBe(true);
    expect(parseCondition('resource.active == false').value).toBe(false);
  });

  it('should parse number values', () => {
    expect(parseCondition('resource.count == 42').value).toBe(42);
    expect(parseCondition('resource.score == 3.14').value).toBeCloseTo(3.14);
  });
});

describe('parseConditions', () => {
  it('should parse multiple AND conditions', () => {
    const conditions = parseConditions(
      'actor.type == "user" and resource.type == "run"'
    );

    expect(conditions).toHaveLength(2);
    expect(conditions[0].field).toBe('actor.type');
    expect(conditions[1].field).toBe('resource.type');
  });

  it('should parse with && operator', () => {
    const conditions = parseConditions(
      'actor.type == "user" && resource.active == true'
    );

    expect(conditions).toHaveLength(2);
  });
});

// =============================================================================
// Condition Evaluation Tests
// =============================================================================

describe('evaluateDslCondition', () => {
  const context: DslPolicyContext = {
    actor: {
      id: 'user-1',
      type: 'user',
      roles: ['admin', 'developer'],
      attributes: { department: 'engineering' },
    },
    action: 'create',
    resource: {
      type: 'run',
      id: 'run-1',
      attributes: { size: 150, name: 'test-run', active: true },
    },
  };

  describe('equality operators', () => {
    it('should evaluate eq', () => {
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'eq', value: 'user' }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'eq', value: 'system' }, context)).toBe(false);
    });

    it('should evaluate ne', () => {
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'ne', value: 'system' }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'ne', value: 'user' }, context)).toBe(false);
    });
  });

  describe('comparison operators', () => {
    it('should evaluate gt', () => {
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'gt', value: 100 }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'gt', value: 200 }, context)).toBe(false);
    });

    it('should evaluate gte', () => {
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'gte', value: 150 }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'gte', value: 151 }, context)).toBe(false);
    });

    it('should evaluate lt', () => {
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'lt', value: 200 }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'lt', value: 100 }, context)).toBe(false);
    });

    it('should evaluate lte', () => {
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'lte', value: 150 }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'resource.attributes.size', operator: 'lte', value: 149 }, context)).toBe(false);
    });
  });

  describe('collection operators', () => {
    it('should evaluate in', () => {
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'in', value: ['user', 'admin'] }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'in', value: ['system'] }, context)).toBe(false);
    });

    it('should evaluate nin', () => {
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'nin', value: ['system'] }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'actor.type', operator: 'nin', value: ['user'] }, context)).toBe(false);
    });
  });

  describe('string operators', () => {
    it('should evaluate contains', () => {
      expect(evaluateDslCondition({ field: 'resource.attributes.name', operator: 'contains', value: 'test' }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'resource.attributes.name', operator: 'contains', value: 'prod' }, context)).toBe(false);
    });

    it('should evaluate matches', () => {
      expect(evaluateDslCondition({ field: 'resource.attributes.name', operator: 'matches', value: '^test-.*' }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'resource.attributes.name', operator: 'matches', value: '^prod-.*' }, context)).toBe(false);
    });
  });

  describe('exists operator', () => {
    it('should evaluate exists', () => {
      expect(evaluateDslCondition({ field: 'actor.id', operator: 'exists', value: true }, context)).toBe(true);
      expect(evaluateDslCondition({ field: 'actor.unknown', operator: 'exists', value: true }, context)).toBe(false);
    });
  });
});

// =============================================================================
// Rule Evaluation Tests
// =============================================================================

describe('evaluateDslRule', () => {
  const context: DslPolicyContext = {
    actor: { id: 'user-1', type: 'user', roles: ['admin'] },
    action: 'create',
    resource: { type: 'run' },
  };

  it('should evaluate enabled rule with matching conditions', () => {
    const rule = createDslRule(
      'rule-1',
      'Allow Users',
      [{ field: 'actor.type', operator: 'eq', value: 'user' }],
      { type: 'allow' }
    );

    expect(evaluateDslRule(rule, context)).toBe(true);
  });

  it('should not evaluate disabled rule', () => {
    const rule = createDslRule(
      'rule-1',
      'Disabled Rule',
      [{ field: 'actor.type', operator: 'eq', value: 'user' }],
      { type: 'allow' }
    );
    rule.enabled = false;

    expect(evaluateDslRule(rule, context)).toBe(false);
  });

  it('should require all conditions to match (AND)', () => {
    const rule = createDslRule(
      'rule-1',
      'Multiple Conditions',
      [
        { field: 'actor.type', operator: 'eq', value: 'user' },
        { field: 'resource.type', operator: 'eq', value: 'workflow' }, // Won't match
      ],
      { type: 'allow' }
    );

    expect(evaluateDslRule(rule, context)).toBe(false);
  });

  it('should evaluate nested AND rules', () => {
    const rule = createDslRule(
      'rule-1',
      'Nested AND',
      [{ field: 'actor.type', operator: 'eq', value: 'user' }],
      { type: 'allow' }
    );
    rule.nested = {
      operator: 'and',
      rules: [
        createDslRule('nested-1', 'N1', [{ field: 'action', operator: 'eq', value: 'create' }], { type: 'allow' }),
        createDslRule('nested-2', 'N2', [{ field: 'resource.type', operator: 'eq', value: 'run' }], { type: 'allow' }),
      ],
    };

    expect(evaluateDslRule(rule, context)).toBe(true);
  });

  it('should evaluate nested OR rules', () => {
    const rule = createDslRule(
      'rule-1',
      'Nested OR',
      [{ field: 'actor.type', operator: 'eq', value: 'user' }],
      { type: 'allow' }
    );
    rule.nested = {
      operator: 'or',
      rules: [
        createDslRule('nested-1', 'N1', [{ field: 'action', operator: 'eq', value: 'delete' }], { type: 'allow' }), // Won't match
        createDslRule('nested-2', 'N2', [{ field: 'resource.type', operator: 'eq', value: 'run' }], { type: 'allow' }), // Matches
      ],
    };

    expect(evaluateDslRule(rule, context)).toBe(true);
  });
});

// =============================================================================
// Policy Evaluation Tests
// =============================================================================

describe('evaluateDslPolicy', () => {
  const context: DslPolicyContext = {
    actor: { id: 'user-1', type: 'user', roles: ['developer'] },
    action: 'create',
    resource: { type: 'run' },
  };

  it('should use default action when no rules match', () => {
    const policy: DslPolicyDocument = {
      version: '1.0.0',
      name: 'Test Policy',
      defaultAction: { type: 'deny' },
      rules: [
        createDslRule(
          'admin-only',
          'Admin Only',
          [{ field: 'actor.type', operator: 'eq', value: 'admin' }],
          { type: 'allow' }
        ),
      ],
    };

    const result = evaluateDslPolicy(policy, context);

    expect(result.allowed).toBe(false);
    expect(result.matchedRuleId).toBeUndefined();
    expect(result.reasons).toContain('No matching rules, using default action');
  });

  it('should match first rule by priority', () => {
    const policy: DslPolicyDocument = {
      version: '1.0.0',
      name: 'Test Policy',
      defaultAction: { type: 'deny' },
      rules: [
        createDslRule(
          'rule-low',
          'Low Priority',
          [{ field: 'actor.type', operator: 'eq', value: 'user' }],
          { type: 'deny' },
          200
        ),
        createDslRule(
          'rule-high',
          'High Priority',
          [{ field: 'actor.type', operator: 'eq', value: 'user' }],
          { type: 'allow' },
          100
        ),
      ],
    };

    const result = evaluateDslPolicy(policy, context);

    expect(result.allowed).toBe(true);
    expect(result.matchedRuleId).toBe('rule-high');
  });

  it('should include audit information', () => {
    const policy = createDslAllowPolicy('Test');

    const result = evaluateDslPolicy(policy, context);

    expect(result.audit.timestamp).toBeDefined();
    expect(result.audit.policyVersion).toBe('1.0.0');
    expect(result.audit.context).toBe(context);
  });

  it('should return require_approval action', () => {
    const policy: DslPolicyDocument = {
      version: '1.0.0',
      name: 'Approval Policy',
      defaultAction: { type: 'deny' },
      rules: [
        createDslRule(
          'needs-approval',
          'Needs Approval',
          [{ field: 'actor.type', operator: 'eq', value: 'user' }],
          {
            type: 'require_approval',
            approval: { minApprovers: 2, requiredRoles: ['admin'], timeoutHours: 24 },
          }
        ),
      ],
    };

    const result = evaluateDslPolicy(policy, context);

    expect(result.allowed).toBe(false);
    expect(result.action.type).toBe('require_approval');
    expect(result.action.approval?.minApprovers).toBe(2);
  });
});

// =============================================================================
// Policy Validation Tests
// =============================================================================

describe('validateDslPolicy', () => {
  it('should pass valid policy', () => {
    const policy: DslPolicyDocument = {
      version: '1.0.0',
      name: 'Valid Policy',
      defaultAction: { type: 'deny' },
      rules: [
        createDslRule(
          'rule-1',
          'Allow Users',
          [{ field: 'actor.type', operator: 'eq', value: 'user' }],
          { type: 'allow' }
        ),
      ],
    };

    const errors = validateDslPolicy(policy);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('should detect missing version', () => {
    const policy = {
      version: '',
      name: 'Test',
      defaultAction: { type: 'deny' },
      rules: [],
    } as DslPolicyDocument;

    const errors = validateDslPolicy(policy);
    expect(errors.some(e => e.path === 'version')).toBe(true);
  });

  it('should detect missing name', () => {
    const policy = {
      version: '1.0.0',
      name: '',
      defaultAction: { type: 'deny' },
      rules: [],
    } as DslPolicyDocument;

    const errors = validateDslPolicy(policy);
    expect(errors.some(e => e.path === 'name')).toBe(true);
  });

  it('should detect duplicate rule IDs', () => {
    const policy: DslPolicyDocument = {
      version: '1.0.0',
      name: 'Test',
      defaultAction: { type: 'deny' },
      rules: [
        createDslRule('rule-1', 'Rule 1', [], { type: 'allow' }),
        createDslRule('rule-1', 'Rule 2', [], { type: 'deny' }),
      ],
    };

    const errors = validateDslPolicy(policy);
    expect(errors.some(e => e.message.includes('Duplicate rule ID'))).toBe(true);
  });

  it('should warn about rules without conditions', () => {
    const policy: DslPolicyDocument = {
      version: '1.0.0',
      name: 'Test',
      defaultAction: { type: 'deny' },
      rules: [createDslRule('rule-1', 'No Conditions', [], { type: 'allow' })],
    };

    const errors = validateDslPolicy(policy);
    expect(errors.some(e => e.severity === 'warning' && e.path.includes('conditions'))).toBe(true);
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  it('should create allow policy', () => {
    const policy = createDslAllowPolicy('Allow All');

    expect(policy.name).toBe('Allow All');
    expect(policy.defaultAction.type).toBe('allow');
  });

  it('should create deny policy', () => {
    const policy = createDslDenyPolicy('Deny All');

    expect(policy.name).toBe('Deny All');
    expect(policy.defaultAction.type).toBe('deny');
  });

  it('should create rule', () => {
    const rule = createDslRule(
      'test-rule',
      'Test Rule',
      [{ field: 'actor.type', operator: 'eq', value: 'user' }],
      { type: 'allow' },
      50
    );

    expect(rule.id).toBe('test-rule');
    expect(rule.name).toBe('Test Rule');
    expect(rule.priority).toBe(50);
    expect(rule.enabled).toBe(true);
  });
});
