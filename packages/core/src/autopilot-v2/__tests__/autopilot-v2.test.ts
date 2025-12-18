/**
 * Autopilot v2 Tests
 *
 * Phase 48: Tests for enhanced autonomous operation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryAutopilotConfigStore,
  InMemoryAutopilotSessionStore,
  AutopilotManager,
  createAutopilotManager,
  DEFAULT_AUTOPILOT_CONFIG,
  DECISION_WEIGHTS,
} from '../index.js';

// =============================================================================
// InMemoryAutopilotConfigStore Tests
// =============================================================================

describe('InMemoryAutopilotConfigStore', () => {
  let store: InMemoryAutopilotConfigStore;

  beforeEach(() => {
    store = new InMemoryAutopilotConfigStore();
  });

  describe('create()', () => {
    it('should create config', async () => {
      const config = await store.create({
        tenantId: 'tenant-1',
        mode: 'supervised',
        confidenceThreshold: 0.85,
        autoMerge: false,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      expect(config.id).toMatch(/^autopilot_config_/);
      expect(config.mode).toBe('supervised');
    });
  });

  describe('getByTenant()', () => {
    it('should get config by tenant', async () => {
      await store.create({
        tenantId: 'tenant-1',
        mode: 'full',
        confidenceThreshold: 0.9,
        autoMerge: true,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      const config = await store.getByTenant('tenant-1');
      expect(config).not.toBeNull();
      expect(config!.tenantId).toBe('tenant-1');
    });

    it('should return null for unknown tenant', async () => {
      const config = await store.getByTenant('unknown');
      expect(config).toBeNull();
    });
  });
});

// =============================================================================
// InMemoryAutopilotSessionStore Tests
// =============================================================================

describe('InMemoryAutopilotSessionStore', () => {
  let store: InMemoryAutopilotSessionStore;

  beforeEach(() => {
    store = new InMemoryAutopilotSessionStore();
  });

  describe('create()', () => {
    it('should create session', async () => {
      const session = await store.create({
        tenantId: 'tenant-1',
        configId: 'config_1',
        targetType: 'pr',
        targetId: 'pr-123',
        targetUrl: 'https://github.com/test/repo/pull/123',
        status: 'active',
        decisions: [],
        actionsExecuted: [],
        startTime: new Date(),
      });

      expect(session.id).toMatch(/^session_/);
      expect(session.status).toBe('active');
    });
  });

  describe('addDecision()', () => {
    it('should add decision to session', async () => {
      const session = await store.create({
        tenantId: 'tenant-1',
        configId: 'config_1',
        targetType: 'pr',
        targetId: 'pr-123',
        targetUrl: 'https://github.com/test/repo/pull/123',
        status: 'active',
        decisions: [],
        actionsExecuted: [],
        startTime: new Date(),
      });

      const updated = await store.addDecision(session.id, {
        id: 'decision_1',
        type: 'approve',
        confidence: 'high',
        score: 95,
        reasoning: 'All checks pass',
        factors: [],
        suggestedActions: [],
        requiresApproval: false,
        timestamp: new Date(),
      });

      expect(updated.decisions).toHaveLength(1);
    });
  });
});

// =============================================================================
// AutopilotManager Tests
// =============================================================================

describe('AutopilotManager', () => {
  let manager: AutopilotManager;

  beforeEach(() => {
    manager = createAutopilotManager();
  });

  describe('Configuration', () => {
    it('should create and get config', async () => {
      const config = await manager.createConfig({
        tenantId: 'tenant-1',
        mode: 'supervised',
        confidenceThreshold: 0.85,
        autoMerge: false,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      const retrieved = await manager.getConfig(config.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.mode).toBe('supervised');
    });

    it('should get config for tenant', async () => {
      await manager.createConfig({
        tenantId: 'tenant-1',
        mode: 'full',
        confidenceThreshold: 0.9,
        autoMerge: true,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      const config = await manager.getConfigForTenant('tenant-1');
      expect(config).not.toBeNull();
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      await manager.createConfig({
        tenantId: 'tenant-1',
        mode: 'supervised',
        confidenceThreshold: 0.85,
        autoMerge: false,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });
    });

    it('should start session', async () => {
      const session = await manager.startSession(
        'tenant-1',
        'pr',
        'pr-123',
        'https://github.com/test/repo/pull/123'
      );

      expect(session.status).toBe('active');
      expect(session.targetType).toBe('pr');
    });

    it('should throw if no config exists', async () => {
      await expect(
        manager.startSession('unknown-tenant', 'pr', 'pr-1', 'http://example.com')
      ).rejects.toThrow('No autopilot configuration');
    });

    it('should pause and resume session', async () => {
      const session = await manager.startSession(
        'tenant-1',
        'pr',
        'pr-123',
        'https://github.com/test/repo/pull/123'
      );

      const paused = await manager.pauseSession(session.id);
      expect(paused.status).toBe('paused');

      const resumed = await manager.resumeSession(session.id);
      expect(resumed.status).toBe('active');
    });

    it('should complete session', async () => {
      const session = await manager.startSession(
        'tenant-1',
        'pr',
        'pr-123',
        'https://github.com/test/repo/pull/123'
      );

      const completed = await manager.completeSession(session.id);
      expect(completed.status).toBe('completed');
      expect(completed.endTime).toBeDefined();
    });

    it('should list sessions', async () => {
      await manager.startSession('tenant-1', 'pr', 'pr-1', 'http://example.com/1');
      await manager.startSession('tenant-1', 'pr', 'pr-2', 'http://example.com/2');

      const sessions = await manager.listSessions('tenant-1');
      expect(sessions).toHaveLength(2);
    });
  });

  describe('Decision Making', () => {
    let sessionId: string;

    beforeEach(async () => {
      await manager.createConfig({
        tenantId: 'tenant-1',
        mode: 'supervised',
        confidenceThreshold: 0.85,
        autoMerge: true,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      const session = await manager.startSession(
        'tenant-1',
        'pr',
        'pr-123',
        'https://github.com/test/repo/pull/123'
      );
      sessionId = session.id;
    });

    it('should make approve decision for good PR', async () => {
      const decision = await manager.makeDecision(sessionId, {
        testsPassing: true,
        codeQualityScore: 85,
        reviewsApproved: 2,
        reviewsRequested: 2,
        isMergeable: true,
        ciPassed: true,
        authorTrustScore: 90,
      });

      expect(decision.type).toBe('merge'); // autoMerge is true
      expect(decision.confidence).toBe('high');
      expect(decision.score).toBeGreaterThan(85);
    });

    it('should request changes for failing tests', async () => {
      const decision = await manager.makeDecision(sessionId, {
        testsPassing: false,
        codeQualityScore: 80,
        reviewsApproved: 2,
        reviewsRequested: 2,
        isMergeable: true,
        ciPassed: false,
        authorTrustScore: 90,
      });

      expect(decision.type).toBe('request_changes');
      expect(decision.factors.some((f) => f.name === 'Tests Passing' && f.impact === 'negative')).toBe(true);
    });

    it('should escalate for low confidence', async () => {
      const decision = await manager.makeDecision(sessionId, {
        testsPassing: false,
        codeQualityScore: 30,
        reviewsApproved: 0,
        reviewsRequested: 2,
        isMergeable: false,
        ciPassed: false,
        authorTrustScore: 20,
      });

      expect(decision.type).toBe('escalate');
      expect(decision.confidence).toBe('uncertain');
    });

    it('should include suggested actions', async () => {
      const decision = await manager.makeDecision(sessionId, {
        testsPassing: false,
        codeQualityScore: 80,
        reviewsApproved: 2,
        reviewsRequested: 2,
        isMergeable: true,
        ciPassed: true,
        authorTrustScore: 90,
      });

      expect(decision.suggestedActions.length).toBeGreaterThan(0);
    });
  });

  describe('Action Execution', () => {
    let sessionId: string;

    beforeEach(async () => {
      await manager.createConfig({
        tenantId: 'tenant-1',
        mode: 'full',
        confidenceThreshold: 0.85,
        autoMerge: true,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      const session = await manager.startSession('tenant-1', 'pr', 'pr-123', 'http://example.com');
      sessionId = session.id;
    });

    it('should execute successful action', async () => {
      const action = await manager.executeAction(sessionId, 'approve', async () => {
        return { approved: true };
      });

      expect(action.status).toBe('success');
      expect(action.result).toEqual({ approved: true });
    });

    it('should handle failed action', async () => {
      const action = await manager.executeAction(sessionId, 'merge', async () => {
        throw new Error('Merge conflict');
      });

      expect(action.status).toBe('failure');
      expect(action.error).toBe('Merge conflict');
    });
  });

  describe('Learning & Feedback', () => {
    let sessionId: string;
    let decisionId: string;

    beforeEach(async () => {
      await manager.createConfig({
        tenantId: 'tenant-1',
        mode: 'supervised',
        confidenceThreshold: 0.85,
        autoMerge: false,
        autoApprove: true,
        autoClose: false,
        escalationRules: [],
        exclusions: { labels: [], paths: [], authors: [], branches: [] },
        safetyChecks: [],
        notifications: { onDecision: true, onEscalation: true, onError: true, channels: [] },
      });

      const session = await manager.startSession('tenant-1', 'pr', 'pr-123', 'http://example.com');
      sessionId = session.id;

      const decision = await manager.makeDecision(sessionId, {
        testsPassing: true,
        codeQualityScore: 80,
        reviewsApproved: 1,
        reviewsRequested: 1,
        isMergeable: true,
        ciPassed: true,
        authorTrustScore: 80,
      });
      decisionId = decision.id;
    });

    it('should record feedback', async () => {
      const feedback = await manager.provideFeedback(
        sessionId,
        decisionId,
        true,
        'user-1'
      );

      expect(feedback.correct).toBe(true);
    });

    it('should record feedback with expected decision', async () => {
      const feedback = await manager.provideFeedback(
        sessionId,
        decisionId,
        false,
        'user-1',
        'request_changes',
        'Should have requested security review'
      );

      expect(feedback.correct).toBe(false);
      expect(feedback.expectedDecision).toBe('request_changes');
    });

    it('should calculate accuracy metrics', async () => {
      await manager.provideFeedback(sessionId, decisionId, true, 'user-1');
      await manager.provideFeedback(sessionId, decisionId, true, 'user-2');
      await manager.provideFeedback(sessionId, decisionId, false, 'user-3');

      const metrics = await manager.getAccuracyMetrics();

      expect(metrics.totalDecisions).toBe(3);
      expect(metrics.correctDecisions).toBe(2);
      expect(metrics.accuracy).toBeCloseTo(66.67, 1);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default autopilot config', () => {
    expect(DEFAULT_AUTOPILOT_CONFIG.defaultConfidenceThreshold).toBe(0.85);
    expect(DEFAULT_AUTOPILOT_CONFIG.maxSessionDuration).toBe(3600000);
    expect(DEFAULT_AUTOPILOT_CONFIG.enableLearning).toBe(true);
  });

  it('should have decision weights summing to 1', () => {
    const sum = Object.values(DECISION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
