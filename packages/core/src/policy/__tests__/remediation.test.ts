/**
 * Remediation Suggestions Tests
 *
 * Tests for remediation engine and suggestion generation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RemediationEngine,
  createRemediationEngine,
  generateRemediation,
  initializeRemediationEngine,
  getRemediationEngine,
  resetRemediationEngine,
  enrichViolationWithRemediation,
  getPrimaryRemediationAction,
  getOneClickActions,
  getActionsForActor,
  type RemediationEngineConfig,
  type RemediationSuggestion,
} from '../remediation.js';
import {
  createPolicyDeniedViolation,
  createApprovalBypassedViolation,
  createLimitExceededViolation,
  createAnomalyDetectedViolation,
  type ViolationActor,
  type ViolationResource,
  type ViolationAction,
  type PolicyDeniedDetails,
  type ApprovalBypassedDetails,
  type LimitExceededDetails,
  type AnomalyDetectedDetails,
  type Violation,
} from '../violation-schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestActor(id = 'user-123'): ViolationActor {
  return {
    type: 'user',
    id,
    name: 'Test User',
    email: 'test@example.com',
  };
}

function createTestResource(id = 'repo-456'): ViolationResource {
  return {
    type: 'repository',
    id,
    name: 'test-repo',
  };
}

function createTestAction(type = 'push'): ViolationAction {
  return {
    type,
    description: 'Test action',
    timestamp: new Date(),
  };
}

function createPolicyDeniedTestViolation(): Violation {
  const details: PolicyDeniedDetails = {
    policyId: 'policy-123',
    policyName: 'Protected Branch Policy',
    ruleId: 'rule-456',
    ruleDescription: 'Direct push to main is not allowed',
    effect: 'deny',
  };

  return createPolicyDeniedViolation(
    'tenant-1',
    createTestActor(),
    createTestResource(),
    createTestAction(),
    details
  );
}

function createApprovalBypassedTestViolation(): Violation {
  const details: ApprovalBypassedDetails = {
    workflowId: 'workflow-123',
    workflowName: 'PR Review Workflow',
    requiredApprovers: ['approver-1', 'approver-2'],
    bypassMethod: 'admin override',
    bypassReason: 'Emergency fix',
  };

  return createApprovalBypassedViolation(
    'tenant-1',
    createTestActor(),
    createTestResource(),
    createTestAction('merge'),
    details
  );
}

function createLimitExceededTestViolation(): Violation {
  const details: LimitExceededDetails = {
    limitType: 'rate',
    limitName: 'API Request Limit',
    limit: 100,
    actual: 150,
    unit: 'requests',
    window: {
      unit: 'hour',
      duration: 1,
    },
    percentOver: 50,
  };

  return createLimitExceededViolation(
    'tenant-1',
    createTestActor(),
    createTestResource(),
    createTestAction('api_call'),
    details
  );
}

function createAnomalyDetectedTestViolation(
  confidence = 0.9
): Violation {
  const details: AnomalyDetectedDetails = {
    anomalyType: 'behavioral',
    confidence,
    baseline: 'Normal access during business hours',
    observed: 'Access at 3am from unusual location',
    detectionModel: 'ml-model-v2',
  };

  return createAnomalyDetectedViolation(
    'tenant-1',
    createTestActor(),
    createTestResource(),
    createTestAction('access'),
    details
  );
}

// =============================================================================
// RemediationEngine Tests
// =============================================================================

describe('RemediationEngine', () => {
  let engine: RemediationEngine;

  beforeEach(() => {
    engine = createRemediationEngine();
    resetRemediationEngine();
  });

  afterEach(() => {
    resetRemediationEngine();
  });

  describe('generate', () => {
    it('should generate suggestion with all required fields', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.id).toMatch(/^rem-/);
      expect(suggestion.violationId).toBe(violation.id);
      expect(suggestion.violationType).toBe('policy-denied');
      expect(suggestion.title).toBeTruthy();
      expect(suggestion.explanation).toBeTruthy();
      expect(suggestion.rootCause).toBeTruthy();
      expect(suggestion.impact).toBeTruthy();
      expect(suggestion.actions).toBeInstanceOf(Array);
      expect(suggestion.actions.length).toBeGreaterThan(0);
      expect(suggestion.policyLinks).toBeInstanceOf(Array);
      expect(suggestion.generatedAt).toBeInstanceOf(Date);
    });

    it('should generate different suggestions for different violation types', () => {
      const policyDenied = engine.generate(createPolicyDeniedTestViolation());
      const approvalBypassed = engine.generate(createApprovalBypassedTestViolation());
      const limitExceeded = engine.generate(createLimitExceededTestViolation());
      const anomalyDetected = engine.generate(createAnomalyDetectedTestViolation());

      expect(policyDenied.violationType).toBe('policy-denied');
      expect(approvalBypassed.violationType).toBe('approval-bypassed');
      expect(limitExceeded.violationType).toBe('limit-exceeded');
      expect(anomalyDetected.violationType).toBe('anomaly-detected');

      // Different titles
      expect(policyDenied.title).not.toBe(approvalBypassed.title);
      expect(limitExceeded.title).not.toBe(anomalyDetected.title);
    });
  });

  describe('policy-denied suggestions', () => {
    it('should include request approval action', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      const requestApproval = suggestion.actions.find(a => a.type === 'request_approval');
      expect(requestApproval).toBeDefined();
      expect(requestApproval?.actor).toBe('user');
      expect(requestApproval?.oneClick).toBe(true);
    });

    it('should include modify request action', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      const modifyRequest = suggestion.actions.find(a => a.type === 'modify_request');
      expect(modifyRequest).toBeDefined();
      expect(modifyRequest?.actor).toBe('user');
    });

    it('should include add exception action for deny effect', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      const addException = suggestion.actions.find(a => a.type === 'add_exception');
      expect(addException).toBeDefined();
      expect(addException?.actor).toBe('admin');
    });

    it('should link to the violated policy', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.policyLinks.length).toBeGreaterThan(0);
      const link = suggestion.policyLinks[0];
      expect(link.policyId).toBe('policy-123');
      expect(link.policyName).toBe('Protected Branch Policy');
    });

    it('should explain the denial reason', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.rootCause).toContain('Direct push to main is not allowed');
    });
  });

  describe('approval-bypassed suggestions', () => {
    it('should include document justification action', () => {
      const violation = createApprovalBypassedTestViolation();
      const suggestion = engine.generate(violation);

      const docJustification = suggestion.actions.find(a => a.type === 'document_justification');
      expect(docJustification).toBeDefined();
      expect(docJustification?.actor).toBe('user');
    });

    it('should include retroactive approval action', () => {
      const violation = createApprovalBypassedTestViolation();
      const suggestion = engine.generate(violation);

      const requestApproval = suggestion.actions.find(a => a.type === 'request_approval');
      expect(requestApproval).toBeDefined();
      expect(requestApproval?.label).toContain('Retroactive');
    });

    it('should include escalate action', () => {
      const violation = createApprovalBypassedTestViolation();
      const suggestion = engine.generate(violation);

      const escalate = suggestion.actions.find(a => a.type === 'escalate');
      expect(escalate).toBeDefined();
    });

    it('should mention required approvers in explanation', () => {
      const violation = createApprovalBypassedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.explanation).toContain('approver-1');
      expect(suggestion.explanation).toContain('approver-2');
    });
  });

  describe('limit-exceeded suggestions', () => {
    it('should include wait cooldown action', () => {
      const violation = createLimitExceededTestViolation();
      const suggestion = engine.generate(violation);

      const waitCooldown = suggestion.actions.find(a => a.type === 'wait_cooldown');
      expect(waitCooldown).toBeDefined();
      expect(waitCooldown?.actor).toBe('user');
      expect(waitCooldown?.description).toContain('1 hour');
    });

    it('should include request quota action', () => {
      const violation = createLimitExceededTestViolation();
      const suggestion = engine.generate(violation);

      const requestQuota = suggestion.actions.find(a => a.type === 'request_quota');
      expect(requestQuota).toBeDefined();
    });

    it('should show current vs limit in root cause', () => {
      const violation = createLimitExceededTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.rootCause).toContain('150');
      expect(suggestion.rootCause).toContain('100');
    });

    it('should set expiry based on window', () => {
      const violation = createLimitExceededTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.expiresAt).toBeDefined();
      // Should expire in ~1 hour (window duration)
      const expiryMs = suggestion.expiresAt!.getTime() - Date.now();
      expect(expiryMs).toBeGreaterThan(3500000); // > 58 minutes
      expect(expiryMs).toBeLessThan(3700000); // < 62 minutes
    });
  });

  describe('anomaly-detected suggestions', () => {
    it('should include verify identity action', () => {
      const violation = createAnomalyDetectedTestViolation();
      const suggestion = engine.generate(violation);

      const verifyIdentity = suggestion.actions.find(a => a.type === 'verify_identity');
      expect(verifyIdentity).toBeDefined();
      expect(verifyIdentity?.oneClick).toBe(true);
    });

    it('should include review activity action', () => {
      const violation = createAnomalyDetectedTestViolation();
      const suggestion = engine.generate(violation);

      const reviewActivity = suggestion.actions.find(a => a.type === 'review_activity');
      expect(reviewActivity).toBeDefined();
    });

    it('should include escalate action for high confidence', () => {
      const violation = createAnomalyDetectedTestViolation(0.9);
      const suggestion = engine.generate(violation);

      const escalate = suggestion.actions.find(a => a.type === 'escalate');
      expect(escalate).toBeDefined();
      expect(escalate?.label).toContain('Report');
    });

    it('should not include escalate action for low confidence', () => {
      const violation = createAnomalyDetectedTestViolation(0.5);
      const suggestion = engine.generate(violation);

      const escalate = suggestion.actions.find(a => a.type === 'escalate');
      expect(escalate).toBeUndefined();
    });

    it('should show baseline vs observed in root cause', () => {
      const violation = createAnomalyDetectedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.rootCause).toContain('Normal access during business hours');
      expect(suggestion.rootCause).toContain('3am');
    });
  });

  describe('with configuration', () => {
    it('should include API endpoints when apiBaseUrl is set', () => {
      const configuredEngine = createRemediationEngine({
        apiBaseUrl: 'https://api.example.com',
      });

      const violation = createPolicyDeniedTestViolation();
      const suggestion = configuredEngine.generate(violation);

      const requestApproval = suggestion.actions.find(a => a.type === 'request_approval');
      expect(requestApproval?.endpoint).toContain('https://api.example.com');
    });

    it('should include dashboard URLs when dashboardBaseUrl is set', () => {
      const configuredEngine = createRemediationEngine({
        dashboardBaseUrl: 'https://dashboard.example.com',
      });

      const violation = createPolicyDeniedTestViolation();
      const suggestion = configuredEngine.generate(violation);

      const modifyRequest = suggestion.actions.find(a => a.type === 'modify_request');
      expect(modifyRequest?.url).toContain('https://dashboard.example.com');
    });

    it('should include documentation URLs when policyDocsBaseUrl is set', () => {
      const configuredEngine = createRemediationEngine({
        policyDocsBaseUrl: 'https://docs.example.com',
      });

      const violation = createPolicyDeniedTestViolation();
      const suggestion = configuredEngine.generate(violation);

      const policyLink = suggestion.policyLinks[0];
      expect(policyLink.documentationUrl).toContain('https://docs.example.com');
    });

    it('should use custom policy link resolver', () => {
      const configuredEngine = createRemediationEngine({
        policyLinkResolver: (policyId) => ({
          policyId,
          policyName: 'Custom Policy',
          documentationUrl: `https://custom.docs/${policyId}`,
          relevance: 'Custom relevance',
        }),
      });

      const violation = createPolicyDeniedTestViolation();
      const suggestion = configuredEngine.generate(violation);

      expect(suggestion.policyLinks.some(l => l.policyName === 'Custom Policy')).toBe(true);
    });

    it('should use custom action generators', () => {
      const customAction = {
        id: 'custom-action-1',
        type: 'custom' as const,
        label: 'Custom Action',
        description: 'A custom remediation action',
        actor: 'user' as const,
        difficulty: 'easy' as const,
        oneClick: false,
        requiresConfirmation: true,
      };

      const configuredEngine = createRemediationEngine({
        customGenerators: {
          'policy-denied': () => [customAction],
        },
      });

      const violation = createPolicyDeniedTestViolation();
      const suggestion = configuredEngine.generate(violation);

      expect(suggestion.actions).toHaveLength(1);
      expect(suggestion.actions[0].label).toBe('Custom Action');
    });
  });

  describe('notes and tags', () => {
    it('should include severity-based notes for critical violations', () => {
      const violation = createPolicyDeniedTestViolation();
      (violation as { severity: string }).severity = 'critical';

      const suggestion = engine.generate(violation);

      expect(suggestion.notes?.some(n => n.includes('critical'))).toBe(true);
    });

    it('should include type-specific notes', () => {
      const violation = createApprovalBypassedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.notes?.some(n => n.includes('logged'))).toBe(true);
    });

    it('should include relevant tags', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = engine.generate(violation);

      expect(suggestion.tags).toContain('policy-denied');
      expect(suggestion.tags).toContain('repository');
      expect(suggestion.tags).toContain('push');
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory functions', () => {
  beforeEach(() => {
    resetRemediationEngine();
  });

  afterEach(() => {
    resetRemediationEngine();
  });

  describe('createRemediationEngine', () => {
    it('should create engine with default config', () => {
      const engine = createRemediationEngine();
      expect(engine).toBeInstanceOf(RemediationEngine);
    });

    it('should create engine with custom config', () => {
      const engine = createRemediationEngine({
        apiBaseUrl: 'https://api.example.com',
      });
      expect(engine).toBeInstanceOf(RemediationEngine);
    });
  });

  describe('generateRemediation', () => {
    it('should generate suggestion without explicit engine', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = generateRemediation(violation);

      expect(suggestion.violationId).toBe(violation.id);
    });

    it('should use provided config', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = generateRemediation(violation, {
        apiBaseUrl: 'https://api.example.com',
      });

      const action = suggestion.actions.find(a => a.endpoint);
      expect(action?.endpoint).toContain('https://api.example.com');
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton management', () => {
  beforeEach(() => {
    resetRemediationEngine();
  });

  afterEach(() => {
    resetRemediationEngine();
  });

  it('should throw when getting uninitialized engine', () => {
    expect(() => getRemediationEngine()).toThrow('not initialized');
  });

  it('should initialize and get engine', () => {
    const engine = initializeRemediationEngine();
    expect(getRemediationEngine()).toBe(engine);
  });

  it('should reset engine', () => {
    initializeRemediationEngine();
    resetRemediationEngine();
    expect(() => getRemediationEngine()).toThrow();
  });
});

// =============================================================================
// Integration Helper Tests
// =============================================================================

describe('Integration helpers', () => {
  describe('enrichViolationWithRemediation', () => {
    it('should add remediation to violation', () => {
      const violation = createPolicyDeniedTestViolation();
      const enriched = enrichViolationWithRemediation(violation);

      expect(enriched.id).toBe(violation.id);
      expect(enriched.remediation).toBeDefined();
      expect(enriched.remediation.violationId).toBe(violation.id);
    });
  });

  describe('getPrimaryRemediationAction', () => {
    it('should return first action', () => {
      const violation = createPolicyDeniedTestViolation();
      const action = getPrimaryRemediationAction(violation);

      expect(action).toBeDefined();
      expect(action?.type).toBe('request_approval');
    });
  });

  describe('getOneClickActions', () => {
    it('should return only one-click actions', () => {
      const violation = createPolicyDeniedTestViolation();
      const actions = getOneClickActions(violation);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every(a => a.oneClick)).toBe(true);
    });
  });

  describe('getActionsForActor', () => {
    it('should filter by actor type', () => {
      const violation = createPolicyDeniedTestViolation();
      const suggestion = generateRemediation(violation);

      const userActions = getActionsForActor(suggestion, 'user');
      const adminActions = getActionsForActor(suggestion, 'admin');

      expect(userActions.every(a => a.actor === 'user')).toBe(true);
      expect(adminActions.every(a => a.actor === 'admin')).toBe(true);
      expect(userActions.length).toBeGreaterThan(0);
      expect(adminActions.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Action Schema Tests
// =============================================================================

describe('Action structure', () => {
  it('should have valid action structure', () => {
    const violation = createPolicyDeniedTestViolation();
    const suggestion = generateRemediation(violation);

    for (const action of suggestion.actions) {
      expect(action.id).toBeTruthy();
      expect(action.type).toBeTruthy();
      expect(action.label).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(['user', 'approver', 'admin', 'security_team']).toContain(action.actor);
      expect(['easy', 'moderate', 'complex']).toContain(action.difficulty);
      expect(typeof action.oneClick).toBe('boolean');
      expect(typeof action.requiresConfirmation).toBe('boolean');
    }
  });

  it('should include payload templates for API actions', () => {
    const engine = createRemediationEngine({
      apiBaseUrl: 'https://api.example.com',
    });

    const violation = createPolicyDeniedTestViolation();
    const suggestion = engine.generate(violation);

    const apiAction = suggestion.actions.find(a => a.endpoint);
    expect(apiAction?.payloadTemplate).toBeDefined();
    expect(apiAction?.method).toBeDefined();
  });
});
