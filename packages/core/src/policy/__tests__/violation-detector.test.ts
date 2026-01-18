/**
 * Tests for Violation Detector Service (D5.2)
 *
 * Tests violation detection, storage, aggregation, and deduplication.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InMemoryViolationStore,
  ViolationDetector,
  createInMemoryViolationStore,
  createViolationDetector,
  initializeViolationDetector,
  getViolationDetector,
  resetViolationDetector,
  type ViolationStore,
  type PolicyEvaluationContext,
  type ApprovalBypassContext,
  type RateLimitContext,
  type AnomalyContext,
} from '../violation-detector.js';
import type { ViolationActor, ViolationResource, ViolationAction, Violation } from '../violation-schema.js';
import type { PolicyEvaluationResult } from '../schema.js';

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

function createTestAction(): ViolationAction {
  return {
    type: 'push',
    category: 'git',
    description: 'Push to repository',
  };
}

function createDeniedEvaluationResult(): PolicyEvaluationResult {
  return {
    allowed: false,
    effect: 'deny',
    reason: 'Policy rule blocked this action',
    matchedRule: {
      id: 'rule-1',
      name: 'Block Direct Push',
      policyId: 'policy-1',
    },
    metadata: {
      evaluatedAt: new Date(),
      evaluationTimeMs: 5,
      rulesEvaluated: 3,
      policiesEvaluated: 1,
    },
  };
}

function createAllowedEvaluationResult(): PolicyEvaluationResult {
  return {
    allowed: true,
    effect: 'allow',
    reason: 'Action permitted',
    metadata: {
      evaluatedAt: new Date(),
      evaluationTimeMs: 2,
      rulesEvaluated: 3,
      policiesEvaluated: 1,
    },
  };
}

// =============================================================================
// InMemoryViolationStore Tests
// =============================================================================

describe('InMemoryViolationStore', () => {
  let store: InMemoryViolationStore;

  beforeEach(() => {
    store = createInMemoryViolationStore();
  });

  describe('create and get', () => {
    it('should create and retrieve a violation', async () => {
      const detector = createViolationDetector({ store });
      const result = await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      expect(result.created).toBe(true);
      expect(result.violation).toBeDefined();

      const retrieved = await store.get(result.violation!.id);
      expect(retrieved).toEqual(result.violation);
    });

    it('should return null for non-existent violation', async () => {
      const result = await store.get('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update violation status', async () => {
      const detector = createViolationDetector({ store });
      const result = await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      const updated = await store.updateStatus(result.violation!.id, 'acknowledged', {
        updatedBy: 'operator-1',
      });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('acknowledged');
      expect(updated!.metadata.updatedBy).toBe('operator-1');
    });

    it('should return null for non-existent violation', async () => {
      const result = await store.updateStatus('non-existent', 'acknowledged');
      expect(result).toBeNull();
    });
  });

  describe('query', () => {
    it('should query violations by tenant', async () => {
      const detector = createViolationDetector({ store });

      // Create violations for different tenants
      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-2',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      const result = await store.query({ tenantId: 'tenant-1' });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].tenantId).toBe('tenant-1');
    });

    it('should filter by type', async () => {
      const detector = createViolationDetector({ store });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      await detector.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor('user-456'),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'force',
      });

      const result = await store.query({
        tenantId: 'tenant-1',
        types: ['policy-denied'],
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('policy-denied');
    });

    it('should filter by severity', async () => {
      const detector = createViolationDetector({ store });

      // Policy denied = high severity by default
      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      // Approval bypassed = critical severity by default
      await detector.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor('user-456'),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'force',
      });

      const result = await store.query({
        tenantId: 'tenant-1',
        severities: ['critical'],
      });

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('approval-bypassed');
    });

    it('should paginate results', async () => {
      const detector = createViolationDetector({ store, minViolationIntervalMs: 0 });

      // Create multiple violations
      for (let i = 0; i < 5; i++) {
        await detector.detectFromPolicyEvaluation({
          tenantId: 'tenant-1',
          actor: createTestActor(`user-${i}`),
          resource: createTestResource(`repo-${i}`),
          action: createTestAction(),
          evaluationResult: createDeniedEvaluationResult(),
        });
      }

      const page1 = await store.query({ tenantId: 'tenant-1', limit: 2, offset: 0 });
      expect(page1.violations).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await store.query({ tenantId: 'tenant-1', limit: 2, offset: 2 });
      expect(page2.violations).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      const page3 = await store.query({ tenantId: 'tenant-1', limit: 2, offset: 4 });
      expect(page3.violations).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it('should sort by severity', async () => {
      const detector = createViolationDetector({ store });

      await detector.detectFromRateLimit({
        tenantId: 'tenant-1',
        actor: createTestActor('user-1'),
        resource: createTestResource(),
        action: createTestAction(),
        limitType: 'rate',
        limitName: 'api-calls',
        limit: 100,
        actual: 150,
      });

      await detector.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor('user-2'),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'force',
      });

      const result = await store.query({
        tenantId: 'tenant-1',
        sortBy: 'severity',
        sortOrder: 'desc',
      });

      expect(result.violations[0].severity).toBe('critical');
      expect(result.violations[1].severity).toBe('medium');
    });
  });

  describe('aggregate', () => {
    it('should aggregate by type', async () => {
      const detector = createViolationDetector({ store, minViolationIntervalMs: 0 });

      for (let i = 0; i < 3; i++) {
        await detector.detectFromPolicyEvaluation({
          tenantId: 'tenant-1',
          actor: createTestActor(`user-${i}`),
          resource: createTestResource(`repo-${i}`),
          action: createTestAction(),
          evaluationResult: createDeniedEvaluationResult(),
        });
      }

      await detector.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor('user-10'),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'force',
      });

      const aggregations = await store.aggregate('tenant-1', {
        groupBy: 'type',
      });

      expect(aggregations).toHaveLength(2);
      const policyDenied = aggregations.find((a) => a.type === 'policy-denied');
      expect(policyDenied?.count).toBe(3);
    });

    it('should aggregate by actor', async () => {
      const detector = createViolationDetector({ store, minViolationIntervalMs: 0 });

      // Same actor, multiple violations
      for (let i = 0; i < 3; i++) {
        await detector.detectFromPolicyEvaluation({
          tenantId: 'tenant-1',
          actor: createTestActor('repeat-offender'),
          resource: createTestResource(`repo-${i}`),
          action: createTestAction(),
          evaluationResult: createDeniedEvaluationResult(),
        });
      }

      const aggregations = await store.aggregate('tenant-1', {
        groupBy: 'actor',
        minCount: 2,
      });

      expect(aggregations).toHaveLength(1);
      expect(aggregations[0].count).toBe(3);
      expect(aggregations[0].uniqueResources).toBe(3);
    });

    it('should respect time window', async () => {
      const detector = createViolationDetector({ store, minViolationIntervalMs: 0 });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      // Query with future window
      const aggregations = await store.aggregate('tenant-1', {
        groupBy: 'type',
        startTime: new Date(Date.now() + 10000),
      });

      expect(aggregations).toHaveLength(0);
    });
  });

  describe('getRecent', () => {
    it('should get recent violations within window', async () => {
      const detector = createViolationDetector({ store, minViolationIntervalMs: 0 });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      const recent = await store.getRecent('tenant-1', {
        type: 'policy-denied',
        windowMs: 60000,
      });

      expect(recent).toHaveLength(1);
    });

    it('should filter by actor', async () => {
      const detector = createViolationDetector({ store, minViolationIntervalMs: 0 });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor('user-1'),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor('user-2'),
        resource: createTestResource('repo-2'),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      const recent = await store.getRecent('tenant-1', {
        type: 'policy-denied',
        actorId: 'user-1',
        windowMs: 60000,
      });

      expect(recent).toHaveLength(1);
      expect(recent[0].actor.id).toBe('user-1');
    });
  });

  describe('clear', () => {
    it('should clear all violations', async () => {
      const detector = createViolationDetector({ store });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      await store.clear();

      const result = await store.query({ tenantId: 'tenant-1' });
      expect(result.violations).toHaveLength(0);
    });

    it('should clear violations for specific tenant', async () => {
      const detector = createViolationDetector({ store });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-2',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      await store.clear('tenant-1');

      const result1 = await store.query({ tenantId: 'tenant-1' });
      const result2 = await store.query({ tenantId: 'tenant-2' });

      expect(result1.violations).toHaveLength(0);
      expect(result2.violations).toHaveLength(1);
    });
  });
});

// =============================================================================
// ViolationDetector Tests
// =============================================================================

describe('ViolationDetector', () => {
  let store: InMemoryViolationStore;
  let detector: ViolationDetector;

  beforeEach(() => {
    store = createInMemoryViolationStore();
    detector = createViolationDetector({
      store,
      minViolationIntervalMs: 0, // Disable for testing
    });
  });

  describe('detectFromPolicyEvaluation', () => {
    it('should create violation for denied action', async () => {
      const result = await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      expect(result.created).toBe(true);
      expect(result.violation).toBeDefined();
      expect(result.violation!.type).toBe('policy-denied');
      expect(result.violation!.severity).toBe('high');
      expect(result.deduplicated).toBe(false);
    });

    it('should not create violation for allowed action', async () => {
      const result = await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createAllowedEvaluationResult(),
      });

      expect(result.created).toBe(false);
      expect(result.violation).toBeUndefined();
    });

    it('should deduplicate identical violations', async () => {
      const context: PolicyEvaluationContext = {
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      };

      const result1 = await detector.detectFromPolicyEvaluation(context);
      const result2 = await detector.detectFromPolicyEvaluation(context);

      expect(result1.created).toBe(true);
      expect(result2.created).toBe(false);
      expect(result2.deduplicated).toBe(true);
    });

    it('should include policy details', async () => {
      const result = await detector.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
        policyId: 'custom-policy',
        policyName: 'Custom Policy Name',
      });

      expect(result.violation!.details).toMatchObject({
        violationType: 'policy-denied',
        policyId: 'custom-policy',
        policyName: 'Custom Policy Name',
      });
    });

    it('should call onViolationDetected callback', async () => {
      const callback = vi.fn();
      const detectorWithCallback = createViolationDetector({
        store,
        onViolationDetected: callback,
      });

      await detectorWithCallback.detectFromPolicyEvaluation({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        evaluationResult: createDeniedEvaluationResult(),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'policy-denied',
      }));
    });
  });

  describe('detectFromApprovalBypass', () => {
    it('should create critical violation for approval bypass', async () => {
      const result = await detector.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        workflowName: 'PR Approval',
        bypassMethod: 'force',
      });

      expect(result.created).toBe(true);
      expect(result.violation!.type).toBe('approval-bypassed');
      expect(result.violation!.severity).toBe('critical');
      expect(result.violation!.source).toBe('approval-gate');
    });

    it('should include bypass details', async () => {
      const result = await detector.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'skip',
        requiredApprovers: ['user-a', 'user-b'],
      });

      expect(result.violation!.details).toMatchObject({
        violationType: 'approval-bypassed',
        workflowId: 'workflow-1',
        bypassMethod: 'skip',
        requiredApprovers: ['user-a', 'user-b'],
      });
    });
  });

  describe('detectFromRateLimit', () => {
    it('should create medium severity violation for rate limit', async () => {
      const result = await detector.detectFromRateLimit({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        limitType: 'rate',
        limitName: 'api-calls',
        limit: 100,
        actual: 150,
        unit: 'requests/min',
      });

      expect(result.created).toBe(true);
      expect(result.violation!.type).toBe('limit-exceeded');
      expect(result.violation!.severity).toBe('medium');
      expect(result.violation!.source).toBe('rate-limiter');
    });

    it('should use quota-manager source for quota limits', async () => {
      const result = await detector.detectFromRateLimit({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        limitType: 'quota',
        limitName: 'storage',
        limit: 1000,
        actual: 1200,
      });

      expect(result.violation!.source).toBe('quota-manager');
    });

    it('should include percent over in summary', async () => {
      const result = await detector.detectFromRateLimit({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        limitType: 'rate',
        limitName: 'api-calls',
        limit: 100,
        actual: 200,
      });

      expect(result.violation!.summary).toContain('100%');
    });
  });

  describe('detectFromAnomaly', () => {
    it('should create high severity violation for anomaly', async () => {
      const result = await detector.detectFromAnomaly({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        anomalyType: 'behavioral',
        confidence: 0.85,
        score: 75,
      });

      expect(result.created).toBe(true);
      expect(result.violation!.type).toBe('anomaly-detected');
      expect(result.violation!.severity).toBe('high');
      expect(result.violation!.source).toBe('anomaly-detector');
    });

    it('should include anomaly details', async () => {
      const result = await detector.detectFromAnomaly({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        anomalyType: 'volumetric',
        confidence: 0.92,
        score: 88,
        baseline: { avgRequests: 100 },
        observed: { avgRequests: 500 },
        detectionModel: 'ml-model-v2',
      });

      expect(result.violation!.details).toMatchObject({
        violationType: 'anomaly-detected',
        anomalyType: 'volumetric',
        confidence: 0.92,
        score: 88,
        detectionModel: 'ml-model-v2',
      });
    });
  });

  describe('pattern detection', () => {
    it('should detect patterns when threshold is reached', async () => {
      const onPatternDetected = vi.fn();
      const detectorWithPattern = createViolationDetector({
        store,
        enableAggregation: true,
        patternThreshold: 3,
        aggregationWindowMs: 60000,
        minViolationIntervalMs: 0,
        onPatternDetected,
      });

      // Create violations from the same actor
      for (let i = 0; i < 4; i++) {
        await detectorWithPattern.detectFromPolicyEvaluation({
          tenantId: 'tenant-1',
          actor: createTestActor('repeat-offender'),
          resource: createTestResource(`repo-${i}`),
          action: createTestAction(),
          evaluationResult: createDeniedEvaluationResult(),
        });
      }

      // Pattern callback should have been called
      expect(onPatternDetected).toHaveBeenCalled();
      const pattern = onPatternDetected.mock.calls[0][0];
      expect(pattern.count).toBeGreaterThanOrEqual(3);
    });

    it('should not detect pattern below threshold', async () => {
      const onPatternDetected = vi.fn();
      const detectorWithPattern = createViolationDetector({
        store,
        enableAggregation: true,
        patternThreshold: 10,
        minViolationIntervalMs: 0,
        onPatternDetected,
      });

      // Create only 2 violations
      for (let i = 0; i < 2; i++) {
        await detectorWithPattern.detectFromPolicyEvaluation({
          tenantId: 'tenant-1',
          actor: createTestActor('user'),
          resource: createTestResource(`repo-${i}`),
          action: createTestAction(),
          evaluationResult: createDeniedEvaluationResult(),
        });
      }

      expect(onPatternDetected).not.toHaveBeenCalled();
    });
  });

  describe('auto-escalation', () => {
    it('should auto-escalate critical violations when enabled', async () => {
      const detectorWithEscalation = createViolationDetector({
        store,
        autoEscalateCritical: true,
      });

      const result = await detectorWithEscalation.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'force',
      });

      expect(result.violation!.status).toBe('escalated');
    });

    it('should not auto-escalate when disabled', async () => {
      const detectorWithoutEscalation = createViolationDetector({
        store,
        autoEscalateCritical: false,
      });

      const result = await detectorWithoutEscalation.detectFromApprovalBypass({
        tenantId: 'tenant-1',
        actor: createTestActor(),
        resource: createTestResource(),
        action: createTestAction(),
        workflowId: 'workflow-1',
        bypassMethod: 'force',
      });

      expect(result.violation!.status).toBe('detected');
    });
  });

  describe('getStore', () => {
    it('should return the underlying store', () => {
      expect(detector.getStore()).toBe(store);
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton Management', () => {
  beforeEach(() => {
    resetViolationDetector();
  });

  it('should initialize and get singleton', () => {
    const store = createInMemoryViolationStore();
    const detector = initializeViolationDetector({ store });

    expect(getViolationDetector()).toBe(detector);
  });

  it('should throw when getting uninitialized singleton', () => {
    expect(() => getViolationDetector()).toThrow('not initialized');
  });

  it('should reset singleton', () => {
    const store = createInMemoryViolationStore();
    initializeViolationDetector({ store });
    resetViolationDetector();

    expect(() => getViolationDetector()).toThrow('not initialized');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should handle complete violation lifecycle', async () => {
    const store = createInMemoryViolationStore();
    const violations: Violation[] = [];

    const detector = createViolationDetector({
      store,
      onViolationDetected: (v) => violations.push(v),
      minViolationIntervalMs: 0,
    });

    // 1. Create various violations
    await detector.detectFromPolicyEvaluation({
      tenantId: 'tenant-1',
      actor: createTestActor(),
      resource: createTestResource(),
      action: createTestAction(),
      evaluationResult: createDeniedEvaluationResult(),
    });

    await detector.detectFromApprovalBypass({
      tenantId: 'tenant-1',
      actor: createTestActor('user-2'),
      resource: createTestResource(),
      action: createTestAction(),
      workflowId: 'wf-1',
      bypassMethod: 'skip',
    });

    await detector.detectFromRateLimit({
      tenantId: 'tenant-1',
      actor: createTestActor('user-3'),
      resource: createTestResource(),
      action: createTestAction(),
      limitType: 'rate',
      limitName: 'api',
      limit: 100,
      actual: 200,
    });

    expect(violations).toHaveLength(3);

    // 2. Query and verify
    const queryResult = await store.query({
      tenantId: 'tenant-1',
      sortBy: 'severity',
      sortOrder: 'desc',
    });

    expect(queryResult.total).toBe(3);
    expect(queryResult.violations[0].severity).toBe('critical'); // approval bypass

    // 3. Update status
    const acknowledged = await store.updateStatus(
      violations[0].id,
      'acknowledged',
      { updatedBy: 'operator' }
    );
    expect(acknowledged!.status).toBe('acknowledged');

    // 4. Aggregate
    const aggregations = await store.aggregate('tenant-1', {
      groupBy: 'type',
    });
    expect(aggregations).toHaveLength(3);

    // 5. Count
    const count = await store.count({
      tenantId: 'tenant-1',
      severities: ['critical', 'high'],
    });
    expect(count).toBe(2);
  });
});
