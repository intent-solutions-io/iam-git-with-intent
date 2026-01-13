/**
 * Tests for Policy Violation Schema (D5.1)
 *
 * Tests violation types, severity levels, factory functions, and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  // Core types
  ViolationType,
  ViolationSeverity,
  ViolationStatus,
  ViolationSource,
  ViolationId,

  // Schemas
  ViolationActor,
  ViolationResource,
  ViolationAction,
  PolicyDeniedDetails,
  ApprovalBypassedDetails,
  LimitExceededDetails,
  AnomalyDetectedDetails,
  Violation,
  CreateViolationInput,
  ViolationQuery,

  // Factory functions
  generateViolationId,
  createViolation,
  createPolicyDeniedViolation,
  createApprovalBypassedViolation,
  createLimitExceededViolation,
  createAnomalyDetectedViolation,

  // Validation functions
  validateViolation,
  safeParseViolation,
  validateCreateViolationInput,
  validateViolationQuery,

  // Type guards
  isViolationType,
  isViolationSeverity,
  isViolationStatus,
  isViolation,

  // Utility functions
  getSeverityWeight,
  compareBySeverity,
  getViolationTypeDescription,
  calculateAggregateSeverity,

  // Constants
  VIOLATION_TYPE_DESCRIPTIONS,
  SEVERITY_WEIGHTS,
  DEFAULT_VIOLATION_SEVERITY,
  VIOLATION_SCHEMA_VERSION,
  ALL_VIOLATION_TYPES,
  ALL_SEVERITY_LEVELS,
  ALL_VIOLATION_STATUSES,
  ALL_VIOLATION_SOURCES,
} from '../violation-schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestActor(): typeof ViolationActor._type {
  return {
    type: 'user',
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    ipAddress: '192.168.1.1',
  };
}

function createTestResource(): typeof ViolationResource._type {
  return {
    type: 'repository',
    id: 'repo-456',
    name: 'test-repo',
    attributes: { visibility: 'private' },
  };
}

function createTestAction(): typeof ViolationAction._type {
  return {
    type: 'merge',
    category: 'git',
    description: 'Merge pull request',
    requestId: 'req-789',
  };
}

// =============================================================================
// ViolationType Tests
// =============================================================================

describe('ViolationType', () => {
  it('should accept all valid violation types', () => {
    expect(ViolationType.parse('policy-denied')).toBe('policy-denied');
    expect(ViolationType.parse('approval-bypassed')).toBe('approval-bypassed');
    expect(ViolationType.parse('limit-exceeded')).toBe('limit-exceeded');
    expect(ViolationType.parse('anomaly-detected')).toBe('anomaly-detected');
  });

  it('should reject invalid violation types', () => {
    expect(() => ViolationType.parse('invalid')).toThrow();
    expect(() => ViolationType.parse('')).toThrow();
    expect(() => ViolationType.parse(123)).toThrow();
  });

  it('should have descriptions for all types', () => {
    for (const type of ALL_VIOLATION_TYPES) {
      expect(VIOLATION_TYPE_DESCRIPTIONS[type]).toBeDefined();
      expect(typeof VIOLATION_TYPE_DESCRIPTIONS[type]).toBe('string');
    }
  });
});

// =============================================================================
// ViolationSeverity Tests
// =============================================================================

describe('ViolationSeverity', () => {
  it('should accept all valid severity levels', () => {
    expect(ViolationSeverity.parse('critical')).toBe('critical');
    expect(ViolationSeverity.parse('high')).toBe('high');
    expect(ViolationSeverity.parse('medium')).toBe('medium');
    expect(ViolationSeverity.parse('low')).toBe('low');
  });

  it('should reject invalid severity levels', () => {
    expect(() => ViolationSeverity.parse('urgent')).toThrow();
    expect(() => ViolationSeverity.parse('info')).toThrow();
  });

  it('should have weights for all severity levels', () => {
    for (const severity of ALL_SEVERITY_LEVELS) {
      expect(SEVERITY_WEIGHTS[severity]).toBeDefined();
      expect(typeof SEVERITY_WEIGHTS[severity]).toBe('number');
    }
  });

  it('should have descending weights from critical to low', () => {
    expect(SEVERITY_WEIGHTS.critical).toBeGreaterThan(SEVERITY_WEIGHTS.high);
    expect(SEVERITY_WEIGHTS.high).toBeGreaterThan(SEVERITY_WEIGHTS.medium);
    expect(SEVERITY_WEIGHTS.medium).toBeGreaterThan(SEVERITY_WEIGHTS.low);
  });
});

// =============================================================================
// ViolationStatus Tests
// =============================================================================

describe('ViolationStatus', () => {
  it('should accept all valid statuses', () => {
    for (const status of ALL_VIOLATION_STATUSES) {
      expect(ViolationStatus.parse(status)).toBe(status);
    }
  });

  it('should include expected statuses', () => {
    expect(ALL_VIOLATION_STATUSES).toContain('detected');
    expect(ALL_VIOLATION_STATUSES).toContain('acknowledged');
    expect(ALL_VIOLATION_STATUSES).toContain('investigating');
    expect(ALL_VIOLATION_STATUSES).toContain('resolved');
    expect(ALL_VIOLATION_STATUSES).toContain('dismissed');
    expect(ALL_VIOLATION_STATUSES).toContain('escalated');
  });
});

// =============================================================================
// ViolationSource Tests
// =============================================================================

describe('ViolationSource', () => {
  it('should accept all valid sources', () => {
    for (const source of ALL_VIOLATION_SOURCES) {
      expect(ViolationSource.parse(source)).toBe(source);
    }
  });

  it('should include expected sources', () => {
    expect(ALL_VIOLATION_SOURCES).toContain('policy-engine');
    expect(ALL_VIOLATION_SOURCES).toContain('approval-gate');
    expect(ALL_VIOLATION_SOURCES).toContain('rate-limiter');
    expect(ALL_VIOLATION_SOURCES).toContain('anomaly-detector');
  });
});

// =============================================================================
// ViolationId Tests
// =============================================================================

describe('ViolationId', () => {
  it('should accept valid violation ID format', () => {
    const id = 'viol-1704067200000-po-abc123';
    expect(ViolationId.parse(id)).toBe(id);
  });

  it('should reject invalid formats', () => {
    expect(() => ViolationId.parse('invalid-id')).toThrow();
    expect(() => ViolationId.parse('viol-abc-po-123456')).toThrow();
    expect(() => ViolationId.parse('viol-123-UPPER-abcdef')).toThrow();
  });
});

describe('generateViolationId', () => {
  it('should generate valid ID for each violation type', () => {
    for (const type of ALL_VIOLATION_TYPES) {
      const id = generateViolationId(type);
      expect(() => ViolationId.parse(id)).not.toThrow();
      expect(id).toMatch(/^viol-\d+-[a-z]{2}-[a-z0-9]{6}$/);
    }
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateViolationId('policy-denied'));
    }
    expect(ids.size).toBe(100);
  });

  it('should include type prefix in ID', () => {
    const policyId = generateViolationId('policy-denied');
    const approvalId = generateViolationId('approval-bypassed');
    const limitId = generateViolationId('limit-exceeded');
    const anomalyId = generateViolationId('anomaly-detected');

    expect(policyId).toContain('-po-');
    expect(approvalId).toContain('-ap-');
    expect(limitId).toContain('-li-');
    expect(anomalyId).toContain('-an-');
  });
});

// =============================================================================
// ViolationActor Tests
// =============================================================================

describe('ViolationActor', () => {
  it('should accept valid actor', () => {
    const actor = createTestActor();
    expect(ViolationActor.parse(actor)).toEqual(actor);
  });

  it('should accept minimal actor', () => {
    const actor = { type: 'user' as const, id: 'user-1' };
    expect(ViolationActor.parse(actor)).toEqual(actor);
  });

  it('should accept all actor types', () => {
    const types = ['user', 'agent', 'system', 'service', 'unknown'] as const;
    for (const type of types) {
      expect(ViolationActor.parse({ type, id: 'test' })).toBeDefined();
    }
  });

  it('should reject empty id', () => {
    expect(() => ViolationActor.parse({ type: 'user', id: '' })).toThrow();
  });

  it('should validate email format', () => {
    expect(() =>
      ViolationActor.parse({ type: 'user', id: 'test', email: 'not-an-email' })
    ).toThrow();
  });
});

// =============================================================================
// ViolationResource Tests
// =============================================================================

describe('ViolationResource', () => {
  it('should accept valid resource', () => {
    const resource = createTestResource();
    expect(ViolationResource.parse(resource)).toEqual(resource);
  });

  it('should accept resource with parent', () => {
    const resource = {
      type: 'file',
      id: 'file-1',
      parent: { type: 'repository', id: 'repo-1' },
    };
    expect(ViolationResource.parse(resource)).toEqual(resource);
  });

  it('should reject empty type or id', () => {
    expect(() => ViolationResource.parse({ type: '', id: 'test' })).toThrow();
    expect(() => ViolationResource.parse({ type: 'test', id: '' })).toThrow();
  });
});

// =============================================================================
// PolicyDeniedDetails Tests
// =============================================================================

describe('PolicyDeniedDetails', () => {
  it('should accept valid policy denied details', () => {
    const details = {
      policyId: 'policy-1',
      policyName: 'No Direct Push',
      ruleId: 'rule-1',
      ruleDescription: 'Prevent direct pushes to main',
      effect: 'deny',
      matchedConditions: [
        { field: 'branch', operator: 'equals', expected: 'main', actual: 'main' },
      ],
    };
    expect(PolicyDeniedDetails.parse(details)).toEqual(details);
  });

  it('should accept minimal details', () => {
    const details = {
      policyId: 'policy-1',
      ruleId: 'rule-1',
      effect: 'deny',
    };
    expect(PolicyDeniedDetails.parse(details)).toEqual(details);
  });
});

// =============================================================================
// ApprovalBypassedDetails Tests
// =============================================================================

describe('ApprovalBypassedDetails', () => {
  it('should accept valid approval bypassed details', () => {
    const details = {
      workflowId: 'workflow-1',
      workflowName: 'PR Approval',
      requiredApprovers: ['user-1', 'user-2'],
      requiredLevel: 'admin',
      bypassMethod: 'force' as const,
    };
    expect(ApprovalBypassedDetails.parse(details)).toEqual(details);
  });

  it('should accept all bypass methods', () => {
    const methods = ['skip', 'force', 'expired', 'revoked', 'insufficient', 'unauthorized', 'other'] as const;
    for (const method of methods) {
      expect(
        ApprovalBypassedDetails.parse({
          workflowId: 'wf-1',
          bypassMethod: method,
        })
      ).toBeDefined();
    }
  });
});

// =============================================================================
// LimitExceededDetails Tests
// =============================================================================

describe('LimitExceededDetails', () => {
  it('should accept valid limit exceeded details', () => {
    const details = {
      limitType: 'rate' as const,
      limitName: 'api-requests',
      limit: 100,
      actual: 150,
      unit: 'requests',
      window: { duration: 60, unit: 'minute' as const },
      percentOver: 50,
    };
    expect(LimitExceededDetails.parse(details)).toEqual(details);
  });

  it('should accept all limit types', () => {
    const types = ['rate', 'quota', 'concurrency', 'size', 'count', 'cost', 'other'] as const;
    for (const limitType of types) {
      expect(
        LimitExceededDetails.parse({
          limitType,
          limitName: 'test',
          limit: 100,
          actual: 150,
        })
      ).toBeDefined();
    }
  });
});

// =============================================================================
// AnomalyDetectedDetails Tests
// =============================================================================

describe('AnomalyDetectedDetails', () => {
  it('should accept valid anomaly detected details', () => {
    const details = {
      anomalyType: 'behavioral' as const,
      confidence: 0.95,
      score: 85,
      baseline: { avgRequests: 100 },
      observed: { avgRequests: 500 },
      detectionModel: 'ml-model-v2',
    };
    expect(AnomalyDetectedDetails.parse(details)).toEqual(details);
  });

  it('should validate confidence bounds', () => {
    expect(() =>
      AnomalyDetectedDetails.parse({
        anomalyType: 'behavioral',
        confidence: 1.5,
        score: 50,
      })
    ).toThrow();

    expect(() =>
      AnomalyDetectedDetails.parse({
        anomalyType: 'behavioral',
        confidence: -0.1,
        score: 50,
      })
    ).toThrow();
  });

  it('should validate score bounds', () => {
    expect(() =>
      AnomalyDetectedDetails.parse({
        anomalyType: 'behavioral',
        confidence: 0.5,
        score: 150,
      })
    ).toThrow();
  });

  it('should accept all anomaly types', () => {
    const types = ['behavioral', 'temporal', 'volumetric', 'geographic', 'sequential', 'statistical', 'signature', 'other'] as const;
    for (const anomalyType of types) {
      expect(
        AnomalyDetectedDetails.parse({
          anomalyType,
          confidence: 0.9,
          score: 80,
        })
      ).toBeDefined();
    }
  });
});

// =============================================================================
// CreateViolation Factory Tests
// =============================================================================

describe('createViolation', () => {
  it('should create a valid violation', () => {
    const input: typeof CreateViolationInput._type = {
      tenantId: 'tenant-1',
      type: 'policy-denied',
      source: 'policy-engine',
      actor: createTestActor(),
      resource: createTestResource(),
      action: createTestAction(),
      summary: 'Action was denied by policy',
      details: {
        violationType: 'policy-denied',
        policyId: 'policy-1',
        ruleId: 'rule-1',
        effect: 'deny',
      },
    };

    const violation = createViolation(input);

    expect(violation.id).toMatch(/^viol-/);
    expect(violation.tenantId).toBe('tenant-1');
    expect(violation.type).toBe('policy-denied');
    expect(violation.severity).toBe('high'); // default for policy-denied
    expect(violation.status).toBe('detected');
    expect(violation.metadata.schemaVersion).toBe('1.0');
    expect(() => validateViolation(violation)).not.toThrow();
  });

  it('should use provided severity over default', () => {
    const input: typeof CreateViolationInput._type = {
      tenantId: 'tenant-1',
      type: 'policy-denied',
      severity: 'critical',
      source: 'policy-engine',
      actor: createTestActor(),
      resource: createTestResource(),
      action: createTestAction(),
      summary: 'Critical policy violation',
      details: {
        violationType: 'policy-denied',
        policyId: 'policy-1',
        ruleId: 'rule-1',
        effect: 'deny',
      },
    };

    const violation = createViolation(input);
    expect(violation.severity).toBe('critical');
  });
});

describe('createPolicyDeniedViolation', () => {
  it('should create a policy-denied violation', () => {
    const violation = createPolicyDeniedViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      {
        policyId: 'policy-1',
        policyName: 'No Force Push',
        ruleId: 'rule-1',
        effect: 'deny',
      }
    );

    expect(violation.type).toBe('policy-denied');
    expect(violation.source).toBe('policy-engine');
    expect(violation.severity).toBe('high');
    expect(violation.summary).toContain('No Force Push');
    expect(() => validateViolation(violation)).not.toThrow();
  });
});

describe('createApprovalBypassedViolation', () => {
  it('should create an approval-bypassed violation', () => {
    const violation = createApprovalBypassedViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      {
        workflowId: 'workflow-1',
        workflowName: 'PR Review',
        bypassMethod: 'force',
      }
    );

    expect(violation.type).toBe('approval-bypassed');
    expect(violation.source).toBe('approval-gate');
    expect(violation.severity).toBe('critical'); // default for approval-bypassed
    expect(violation.summary).toContain('PR Review');
    expect(violation.summary).toContain('force');
    expect(() => validateViolation(violation)).not.toThrow();
  });
});

describe('createLimitExceededViolation', () => {
  it('should create a limit-exceeded violation', () => {
    const violation = createLimitExceededViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      {
        limitType: 'rate',
        limitName: 'api-calls',
        limit: 100,
        actual: 150,
        unit: 'requests/min',
      }
    );

    expect(violation.type).toBe('limit-exceeded');
    expect(violation.source).toBe('rate-limiter');
    expect(violation.severity).toBe('medium'); // default for limit-exceeded
    expect(violation.summary).toContain('150/100');
    expect(violation.summary).toContain('50%');
    expect(() => validateViolation(violation)).not.toThrow();
  });

  it('should use quota-manager source for quota limits', () => {
    const violation = createLimitExceededViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      {
        limitType: 'quota',
        limitName: 'storage',
        limit: 1000,
        actual: 1200,
        unit: 'MB',
      }
    );

    expect(violation.source).toBe('quota-manager');
  });
});

describe('createAnomalyDetectedViolation', () => {
  it('should create an anomaly-detected violation', () => {
    const violation = createAnomalyDetectedViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      {
        anomalyType: 'behavioral',
        confidence: 0.92,
        score: 85,
      }
    );

    expect(violation.type).toBe('anomaly-detected');
    expect(violation.source).toBe('anomaly-detector');
    expect(violation.severity).toBe('high'); // default for anomaly-detected
    expect(violation.summary).toContain('92%');
    expect(violation.summary).toContain('85');
    expect(() => validateViolation(violation)).not.toThrow();
  });
});

// =============================================================================
// Validation Function Tests
// =============================================================================

describe('validateViolation', () => {
  it('should validate a valid violation', () => {
    const violation = createPolicyDeniedViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      { policyId: 'p1', ruleId: 'r1', effect: 'deny' }
    );

    expect(() => validateViolation(violation)).not.toThrow();
  });

  it('should throw on invalid violation', () => {
    expect(() => validateViolation({})).toThrow();
    expect(() => validateViolation({ id: 'invalid' })).toThrow();
  });
});

describe('safeParseViolation', () => {
  it('should return success for valid violation', () => {
    const violation = createPolicyDeniedViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      { policyId: 'p1', ruleId: 'r1', effect: 'deny' }
    );

    const result = safeParseViolation(violation);
    expect(result.success).toBe(true);
  });

  it('should return error for invalid violation', () => {
    const result = safeParseViolation({});
    expect(result.success).toBe(false);
  });
});

describe('validateViolationQuery', () => {
  it('should validate a valid query', () => {
    const query = {
      tenantId: 'tenant-1',
      types: ['policy-denied', 'approval-bypassed'] as const,
      severities: ['critical', 'high'] as const,
      limit: 50,
    };

    expect(() => validateViolationQuery(query)).not.toThrow();
  });

  it('should apply defaults', () => {
    const query = validateViolationQuery({ tenantId: 'tenant-1' });
    expect(query.limit).toBe(100);
    expect(query.offset).toBe(0);
    expect(query.sortBy).toBe('detectedAt');
    expect(query.sortOrder).toBe('desc');
  });

  it('should enforce limit bounds', () => {
    expect(() =>
      validateViolationQuery({ tenantId: 't1', limit: 0 })
    ).toThrow();
    expect(() =>
      validateViolationQuery({ tenantId: 't1', limit: 10000 })
    ).toThrow();
  });
});

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('Type Guards', () => {
  describe('isViolationType', () => {
    it('should return true for valid types', () => {
      expect(isViolationType('policy-denied')).toBe(true);
      expect(isViolationType('approval-bypassed')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isViolationType('invalid')).toBe(false);
      expect(isViolationType(123)).toBe(false);
    });
  });

  describe('isViolationSeverity', () => {
    it('should return true for valid severities', () => {
      expect(isViolationSeverity('critical')).toBe(true);
      expect(isViolationSeverity('low')).toBe(true);
    });

    it('should return false for invalid severities', () => {
      expect(isViolationSeverity('urgent')).toBe(false);
    });
  });

  describe('isViolationStatus', () => {
    it('should return true for valid statuses', () => {
      expect(isViolationStatus('detected')).toBe(true);
      expect(isViolationStatus('resolved')).toBe(true);
    });

    it('should return false for invalid statuses', () => {
      expect(isViolationStatus('pending')).toBe(false);
    });
  });

  describe('isViolation', () => {
    it('should return true for valid violation', () => {
      const violation = createPolicyDeniedViolation(
        'tenant-1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { policyId: 'p1', ruleId: 'r1', effect: 'deny' }
      );
      expect(isViolation(violation)).toBe(true);
    });

    it('should return false for invalid violation', () => {
      expect(isViolation({})).toBe(false);
      expect(isViolation(null)).toBe(false);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Utility Functions', () => {
  describe('getSeverityWeight', () => {
    it('should return correct weights', () => {
      expect(getSeverityWeight('critical')).toBe(100);
      expect(getSeverityWeight('high')).toBe(75);
      expect(getSeverityWeight('medium')).toBe(50);
      expect(getSeverityWeight('low')).toBe(25);
    });
  });

  describe('compareBySeverity', () => {
    it('should sort violations by severity descending', () => {
      const low = createPolicyDeniedViolation(
        't1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { policyId: 'p1', ruleId: 'r1', effect: 'deny' },
        { severity: 'low' }
      );
      const critical = createPolicyDeniedViolation(
        't1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { policyId: 'p1', ruleId: 'r1', effect: 'deny' },
        { severity: 'critical' }
      );

      const violations = [low, critical];
      violations.sort(compareBySeverity);

      expect(violations[0].severity).toBe('critical');
      expect(violations[1].severity).toBe('low');
    });
  });

  describe('getViolationTypeDescription', () => {
    it('should return descriptions for all types', () => {
      for (const type of ALL_VIOLATION_TYPES) {
        const desc = getViolationTypeDescription(type);
        expect(desc).toBeDefined();
        expect(desc.length).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateAggregateSeverity', () => {
    it('should return low for empty array', () => {
      expect(calculateAggregateSeverity([])).toBe('low');
    });

    it('should return highest severity', () => {
      const violations = [
        createPolicyDeniedViolation('t1', createTestActor(), createTestResource(), createTestAction(), { policyId: 'p1', ruleId: 'r1', effect: 'deny' }, { severity: 'low' }),
        createPolicyDeniedViolation('t1', createTestActor(), createTestResource(), createTestAction(), { policyId: 'p1', ruleId: 'r1', effect: 'deny' }, { severity: 'high' }),
        createPolicyDeniedViolation('t1', createTestActor(), createTestResource(), createTestAction(), { policyId: 'p1', ruleId: 'r1', effect: 'deny' }, { severity: 'medium' }),
      ];

      expect(calculateAggregateSeverity(violations)).toBe('high');
    });

    it('should return critical when any violation is critical', () => {
      const violations = [
        createPolicyDeniedViolation('t1', createTestActor(), createTestResource(), createTestAction(), { policyId: 'p1', ruleId: 'r1', effect: 'deny' }, { severity: 'low' }),
        createApprovalBypassedViolation('t1', createTestActor(), createTestResource(), createTestAction(), { workflowId: 'w1', bypassMethod: 'force' }), // default critical
      ];

      expect(calculateAggregateSeverity(violations)).toBe('critical');
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have correct schema version', () => {
    expect(VIOLATION_SCHEMA_VERSION).toBe('1.0');
  });

  it('should have all violation types', () => {
    expect(ALL_VIOLATION_TYPES).toHaveLength(4);
    expect(ALL_VIOLATION_TYPES).toContain('policy-denied');
    expect(ALL_VIOLATION_TYPES).toContain('approval-bypassed');
    expect(ALL_VIOLATION_TYPES).toContain('limit-exceeded');
    expect(ALL_VIOLATION_TYPES).toContain('anomaly-detected');
  });

  it('should have all severity levels', () => {
    expect(ALL_SEVERITY_LEVELS).toHaveLength(4);
    expect(ALL_SEVERITY_LEVELS).toContain('critical');
    expect(ALL_SEVERITY_LEVELS).toContain('high');
    expect(ALL_SEVERITY_LEVELS).toContain('medium');
    expect(ALL_SEVERITY_LEVELS).toContain('low');
  });

  it('should have default severities for all types', () => {
    for (const type of ALL_VIOLATION_TYPES) {
      expect(DEFAULT_VIOLATION_SEVERITY[type]).toBeDefined();
      expect(ALL_SEVERITY_LEVELS).toContain(DEFAULT_VIOLATION_SEVERITY[type]);
    }
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should create, validate, and query violations', () => {
    // Create violations of different types
    const violations = [
      createPolicyDeniedViolation(
        'tenant-1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { policyId: 'p1', ruleId: 'r1', effect: 'deny' }
      ),
      createApprovalBypassedViolation(
        'tenant-1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { workflowId: 'w1', bypassMethod: 'skip' }
      ),
      createLimitExceededViolation(
        'tenant-1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { limitType: 'rate', limitName: 'api', limit: 100, actual: 200 }
      ),
      createAnomalyDetectedViolation(
        'tenant-1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        { anomalyType: 'behavioral', confidence: 0.9, score: 80 }
      ),
    ];

    // All should be valid
    for (const violation of violations) {
      expect(isViolation(violation)).toBe(true);
    }

    // Sort by severity
    violations.sort(compareBySeverity);
    expect(violations[0].type).toBe('approval-bypassed'); // critical

    // Calculate aggregate
    expect(calculateAggregateSeverity(violations)).toBe('critical');

    // Build a query
    const query = validateViolationQuery({
      tenantId: 'tenant-1',
      types: ['policy-denied', 'approval-bypassed'],
      severities: ['critical', 'high'],
    });
    expect(query.types).toHaveLength(2);
    expect(query.severities).toHaveLength(2);
  });
});
