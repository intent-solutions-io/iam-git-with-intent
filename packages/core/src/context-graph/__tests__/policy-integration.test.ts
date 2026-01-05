/**
 * Policy Integration Tests
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.3: Add Context Graph integration
 *
 * @module @gwi/core/context-graph/policy-integration.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PolicyGate,
  createPolicyGate,
  createPolicyDecisionRecord,
  createAllowAllEvaluator,
  createDenyAllEvaluator,
  getPolicyDecisionsForRun,
  getBlockedActionsForRun,
  explainPolicyBlock,
  type PolicyEvaluationInput,
  type PolicyDecisionRecord,
} from '../policy-integration.js';
import { InMemoryDecisionTraceStore, resetDecisionTraceStore } from '../decision-trace.js';
import { InMemoryContextGraphStore, resetContextGraphStore } from '../graph-store.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMinimalInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return {
    actor: { id: 'user-1', type: 'human' },
    action: { name: 'test.action' },
    resource: { type: 'test' },
    context: { source: 'cli' },
    ...overrides,
  };
}

function createMockEvaluator(decision: Partial<PolicyDecisionRecord> = {}) {
  return (_input: PolicyEvaluationInput): PolicyDecisionRecord => ({
    id: `mock_decision_${Date.now()}`,
    timestamp: new Date(),
    allowed: true,
    effect: 'allow',
    reason: 'Mock decision',
    ...decision,
  });
}

// =============================================================================
// PolicyGate Tests
// =============================================================================

describe('PolicyGate', () => {
  let traceStore: InMemoryDecisionTraceStore;
  let graphStore: InMemoryContextGraphStore;

  beforeEach(() => {
    traceStore = new InMemoryDecisionTraceStore();
    graphStore = new InMemoryContextGraphStore();
    resetDecisionTraceStore();
    resetContextGraphStore();
  });

  describe('check()', () => {
    it('should allow action when evaluator returns allowed=true', async () => {
      const gate = new PolicyGate({
        evaluator: createAllowAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const result = await gate.check(createMinimalInput());

      expect(result.allowed).toBe(true);
      expect(result.decision.effect).toBe('allow');
    });

    it('should deny action when evaluator returns allowed=false', async () => {
      const gate = new PolicyGate({
        evaluator: createDenyAllEvaluator('Test denial'),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const result = await gate.check(createMinimalInput());

      expect(result.allowed).toBe(false);
      expect(result.decision.effect).toBe('deny');
      expect(result.decision.reason).toBe('Test denial');
    });

    it('should record trace when runId is provided', async () => {
      const gate = new PolicyGate({
        evaluator: createAllowAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const result = await gate.check(createMinimalInput(), 'run-123');

      expect(result.traceId).toBeDefined();
      expect(traceStore.count()).toBe(1);
    });

    it('should not record trace when runId is not provided', async () => {
      const gate = new PolicyGate({
        evaluator: createAllowAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const result = await gate.check(createMinimalInput());

      expect(result.traceId).toBeUndefined();
      expect(traceStore.count()).toBe(0);
    });

    it('should add node to context graph when addToGraph is true', async () => {
      const gate = new PolicyGate({
        evaluator: createAllowAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
        addToGraph: true,
      });

      const result = await gate.check(createMinimalInput());

      expect(result.nodeId).toBeDefined();
    });

    it('should not add node when addToGraph is false', async () => {
      const gate = new PolicyGate({
        evaluator: createAllowAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
        addToGraph: false,
      });

      const result = await gate.check(createMinimalInput());

      expect(result.nodeId).toBeUndefined();
    });

    it('should record blocked actions when recordBlockedActions is true', async () => {
      const gate = new PolicyGate({
        evaluator: createDenyAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
        recordBlockedActions: true,
      });

      await gate.check(createMinimalInput(), 'run-123');

      expect(traceStore.count()).toBe(1);
    });

    it('should not record blocked actions when recordBlockedActions is false', async () => {
      const gate = new PolicyGate({
        evaluator: createDenyAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
        recordBlockedActions: false,
      });

      await gate.check(createMinimalInput(), 'run-123');

      expect(traceStore.count()).toBe(0);
    });
  });

  describe('evaluateWithTrace()', () => {
    it('should be equivalent to check with runId', async () => {
      const gate = new PolicyGate({
        evaluator: createAllowAllEvaluator(),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const result = await gate.evaluateWithTrace(createMinimalInput(), 'run-123', 'step-1');

      expect(result.allowed).toBe(true);
      expect(result.traceId).toBeDefined();
    });
  });

  describe('with custom evaluator', () => {
    it('should pass input to evaluator', async () => {
      let capturedInput: PolicyEvaluationInput | null = null;

      const gate = new PolicyGate({
        evaluator: (input) => {
          capturedInput = input;
          return createAllowAllEvaluator()(input);
        },
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const input = createMinimalInput({
        actor: { id: 'special-user', type: 'human' },
        action: { name: 'special.action' },
      });

      await gate.check(input);

      expect(capturedInput).toEqual(input);
    });

    it('should handle require_approval effect', async () => {
      const gate = new PolicyGate({
        evaluator: createMockEvaluator({
          allowed: false,
          effect: 'require_approval',
          reason: 'Requires approval',
          matchedRuleId: 'approval-rule',
          requiredActions: [{ type: 'approval', config: { minApprovers: 2 } }],
        }),
        traceStore,
        graphStore,
        tenantId: 'test-tenant',
      });

      const result = await gate.check(createMinimalInput());

      expect(result.allowed).toBe(false);
      expect(result.decision.effect).toBe('require_approval');
      expect(result.decision.requiredActions).toHaveLength(1);
      expect(result.decision.requiredActions![0].type).toBe('approval');
    });
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('createPolicyDecisionRecord()', () => {
  it('should create decision record from evaluation result', () => {
    const result = createPolicyDecisionRecord({
      allowed: true,
      effect: 'allow',
      reason: 'Test reason',
      matchedRule: { id: 'rule-1', name: 'Rule 1', policyId: 'policy-1' },
      metadata: { evaluationTimeMs: 10, rulesEvaluated: 5, policiesEvaluated: 2 },
    });

    expect(result.id).toBeDefined();
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.allowed).toBe(true);
    expect(result.effect).toBe('allow');
    expect(result.reason).toBe('Test reason');
    expect(result.matchedRuleId).toBe('rule-1');
    expect(result.matchedRuleName).toBe('Rule 1');
    expect(result.matchedPolicyId).toBe('policy-1');
    expect(result.metadata?.evaluationTimeMs).toBe(10);
  });

  it('should handle missing optional fields', () => {
    const result = createPolicyDecisionRecord({
      allowed: false,
      effect: 'deny',
      reason: 'Denied',
    });

    expect(result.matchedRuleId).toBeUndefined();
    expect(result.matchedRuleName).toBeUndefined();
    expect(result.requiredActions).toBeUndefined();
  });
});

describe('createPolicyGate()', () => {
  it('should create gate with config', () => {
    const gate = createPolicyGate({
      evaluator: createAllowAllEvaluator(),
      tenantId: 'test',
    });

    expect(gate).toBeInstanceOf(PolicyGate);
  });
});

describe('createAllowAllEvaluator()', () => {
  it('should always return allowed=true', () => {
    const evaluator = createAllowAllEvaluator();
    const result = evaluator(createMinimalInput());

    expect(result.allowed).toBe(true);
    expect(result.effect).toBe('allow');
  });
});

describe('createDenyAllEvaluator()', () => {
  it('should always return allowed=false', () => {
    const evaluator = createDenyAllEvaluator();
    const result = evaluator(createMinimalInput());

    expect(result.allowed).toBe(false);
    expect(result.effect).toBe('deny');
  });

  it('should use custom reason', () => {
    const evaluator = createDenyAllEvaluator('Custom reason');
    const result = evaluator(createMinimalInput());

    expect(result.reason).toBe('Custom reason');
  });
});

// =============================================================================
// Query Helper Tests
// =============================================================================

describe('getPolicyDecisionsForRun()', () => {
  it('should return policy decisions for a run', async () => {
    const traceStore = new InMemoryDecisionTraceStore();
    const graphStore = new InMemoryContextGraphStore();

    const gate = new PolicyGate({
      evaluator: createAllowAllEvaluator(),
      traceStore,
      graphStore,
      tenantId: 'test-tenant',
    });

    await gate.check(createMinimalInput(), 'run-123');
    await gate.check(createMinimalInput(), 'run-123');
    await gate.check(createMinimalInput(), 'run-456');

    const decisions = await getPolicyDecisionsForRun('run-123', traceStore);

    expect(decisions).toHaveLength(2);
    expect(decisions.every(d => d.allowed === true)).toBe(true);
  });

  it('should return empty array when no decisions exist', async () => {
    const traceStore = new InMemoryDecisionTraceStore();
    const decisions = await getPolicyDecisionsForRun('non-existent', traceStore);

    expect(decisions).toHaveLength(0);
  });
});

describe('getBlockedActionsForRun()', () => {
  it('should return only blocked actions', async () => {
    const traceStore = new InMemoryDecisionTraceStore();
    const graphStore = new InMemoryContextGraphStore();

    const allowGate = new PolicyGate({
      evaluator: createAllowAllEvaluator(),
      traceStore,
      graphStore,
      tenantId: 'test-tenant',
    });

    const denyGate = new PolicyGate({
      evaluator: createDenyAllEvaluator(),
      traceStore,
      graphStore,
      tenantId: 'test-tenant',
    });

    await allowGate.check(createMinimalInput(), 'run-123');
    await denyGate.check(createMinimalInput(), 'run-123');
    await denyGate.check(createMinimalInput(), 'run-123');

    const blocked = await getBlockedActionsForRun('run-123', traceStore);

    expect(blocked).toHaveLength(2);
    expect(blocked.every(t => t.blockedByPolicy === true)).toBe(true);
  });
});

describe('explainPolicyBlock()', () => {
  it('should format denial explanation', () => {
    const decision: PolicyDecisionRecord = {
      id: 'test',
      timestamp: new Date(),
      allowed: false,
      effect: 'deny',
      reason: 'Complex PR requires review',
      matchedRuleId: 'complex-review',
      matchedRuleName: 'Complex Review Rule',
      matchedPolicyId: 'security-policy',
    };

    const explanation = explainPolicyBlock(decision);

    expect(explanation).toContain('denied');
    expect(explanation).toContain('Complex PR requires review');
    expect(explanation).toContain('Complex Review Rule');
    expect(explanation).toContain('security-policy');
  });

  it('should format require_approval explanation', () => {
    const decision: PolicyDecisionRecord = {
      id: 'test',
      timestamp: new Date(),
      allowed: false,
      effect: 'require_approval',
      reason: 'Approval required',
      requiredActions: [
        { type: 'approval', config: { minApprovers: 2 } },
        { type: 'notification', config: { channels: ['slack'] } },
      ],
    };

    const explanation = explainPolicyBlock(decision);

    expect(explanation).toContain('blocked');
    expect(explanation).toContain('Approval required');
    expect(explanation).toContain('Required actions');
    expect(explanation).toContain('approval');
    expect(explanation).toContain('notification');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('integration', () => {
  it('should create linked trace and graph node', async () => {
    const traceStore = new InMemoryDecisionTraceStore();
    const graphStore = new InMemoryContextGraphStore();

    const gate = new PolicyGate({
      evaluator: createMockEvaluator({
        matchedRuleId: 'test-rule',
        matchedRuleName: 'Test Rule',
      }),
      traceStore,
      graphStore,
      tenantId: 'test-tenant',
      addToGraph: true,
    });

    const result = await gate.check(createMinimalInput(), 'run-123');

    // Verify trace was created
    expect(result.traceId).toBeDefined();
    const trace = await traceStore.getTrace(result.traceId!);
    expect(trace).toBeDefined();
    expect(trace!.runId).toBe('run-123');

    // Verify graph node was created
    expect(result.nodeId).toBeDefined();
    const node = await graphStore.getNode(result.nodeId!);
    expect(node).toBeDefined();
    expect(node!.type).toBe('policy');
    expect((node!.data as Record<string, unknown>).traceId).toBe(result.traceId);
  });
});
