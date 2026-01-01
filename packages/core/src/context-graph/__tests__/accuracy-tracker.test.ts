/**
 * Accuracy Tracker Tests
 *
 * Phase 35: Context Graph - Tests for trust calibration metrics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  type AccuracyMetrics,
  type DecisionOutcomeRecord,
  InMemoryAccuracyTrackerStore,
  AccuracyTracker,
  createAccuracyTracker,
  formatPeriod,
  getComplexityBand,
  getAccuracyTrackerStore,
  setAccuracyTrackerStore,
  resetAccuracyTrackerStore,
} from '../accuracy-tracker.js';

import {
  type AgentDecisionTrace,
  InMemoryDecisionTraceStore,
  createDecisionTrace,
  generateTraceId,
} from '../decision-trace.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestMetrics(overrides?: Partial<AccuracyMetrics>): AccuracyMetrics {
  return {
    agentType: 'coder',
    period: '2025-01',
    tenantId: 'tenant-1',
    totalDecisions: 100,
    humanOverrides: 20,
    correctOverrides: 15,
    incorrectOverrides: 5,
    pendingOutcomes: 10,
    accuracy: 0.85,
    overrideRate: 0.2,
    overrideCorrectness: 0.75,
    byComplexity: {
      low: { decisions: 50, overrides: 5, correctOverrides: 4, incorrectOverrides: 1, accuracy: 0.92 },
      medium: { decisions: 35, overrides: 10, correctOverrides: 8, incorrectOverrides: 2, accuracy: 0.80 },
      high: { decisions: 15, overrides: 5, correctOverrides: 3, incorrectOverrides: 2, accuracy: 0.73 },
    },
    accuracyTrend: [0.80, 0.82, 0.84, 0.85],
    lastUpdatedAt: new Date(),
    ...overrides,
  };
}

function createTestTrace(
  tenantId: string,
  agentType: 'triage' | 'coder' | 'resolver' | 'reviewer',
  complexity: number
): AgentDecisionTrace {
  return createDecisionTrace(
    'run-123',
    agentType,
    tenantId,
    {
      prompt: 'Test prompt',
      contextWindow: [],
      previousSteps: [],
      complexity,
    },
    {
      action: 'test_action',
      reasoning: 'Test reasoning',
      confidence: 0.8,
      alternatives: [],
    }
  );
}

// =============================================================================
// InMemoryAccuracyTrackerStore Tests
// =============================================================================

describe('InMemoryAccuracyTrackerStore', () => {
  let store: InMemoryAccuracyTrackerStore;

  beforeEach(() => {
    store = new InMemoryAccuracyTrackerStore();
  });

  describe('recordOutcome', () => {
    it('should record an outcome', async () => {
      const outcome: DecisionOutcomeRecord = {
        traceId: 'trace-123',
        wasOverridden: false,
        actualOutcome: 'success',
        recordedAt: new Date(),
      };

      await store.recordOutcome(outcome);

      const retrieved = store.getOutcome('trace-123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.wasOverridden).toBe(false);
    });

    it('should record override with correctness', async () => {
      const outcome: DecisionOutcomeRecord = {
        traceId: 'trace-456',
        wasOverridden: true,
        overrideCorrect: true,
        recordedAt: new Date(),
      };

      await store.recordOutcome(outcome);

      const retrieved = store.getOutcome('trace-456');
      expect(retrieved?.wasOverridden).toBe(true);
      expect(retrieved?.overrideCorrect).toBe(true);
    });
  });

  describe('saveMetrics and getMetrics', () => {
    it('should save and retrieve metrics', async () => {
      const metrics = createTestMetrics();
      await store.saveMetrics(metrics);

      const retrieved = await store.getMetrics('tenant-1', 'coder', '2025-01');
      expect(retrieved).toBeDefined();
      expect(retrieved?.totalDecisions).toBe(100);
      expect(retrieved?.accuracy).toBe(0.85);
    });

    it('should return null for non-existent metrics', async () => {
      const result = await store.getMetrics('tenant-1', 'coder', '2024-01');
      expect(result).toBeNull();
    });
  });

  describe('getSummary', () => {
    beforeEach(async () => {
      await store.saveMetrics(createTestMetrics({ agentType: 'triage', accuracy: 0.9 }));
      await store.saveMetrics(createTestMetrics({ agentType: 'coder', accuracy: 0.85 }));
      await store.saveMetrics(createTestMetrics({ agentType: 'reviewer', accuracy: 0.88 }));
    });

    it('should return summary across all agents', async () => {
      const summary = await store.getSummary('tenant-1', '2025-01');

      expect(summary).toBeDefined();
      expect(summary?.byAgent.triage).toBeDefined();
      expect(summary?.byAgent.coder).toBeDefined();
      expect(summary?.byAgent.reviewer).toBeDefined();
      expect(summary?.totalDecisions).toBe(300);
    });

    it('should return null if no metrics exist', async () => {
      const summary = await store.getSummary('tenant-unknown', '2025-01');
      expect(summary).toBeNull();
    });
  });

  describe('getTrend', () => {
    beforeEach(async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01', accuracy: 0.80 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-02', accuracy: 0.82 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-03', accuracy: 0.85 }));
    });

    it('should return accuracy trend', async () => {
      const trend = await store.getTrend('tenant-1', 'coder', 3);

      expect(trend.length).toBe(3);
      // Sorted descending by period
      expect(trend[0]).toBe(0.85);
      expect(trend[1]).toBe(0.82);
      expect(trend[2]).toBe(0.80);
    });

    it('should respect limit', async () => {
      const trend = await store.getTrend('tenant-1', 'coder', 2);
      expect(trend.length).toBe(2);
    });
  });

  describe('listMetrics', () => {
    beforeEach(async () => {
      await store.saveMetrics(createTestMetrics({ tenantId: 'tenant-a', agentType: 'coder', period: '2025-01' }));
      await store.saveMetrics(createTestMetrics({ tenantId: 'tenant-a', agentType: 'triage', period: '2025-01' }));
      await store.saveMetrics(createTestMetrics({ tenantId: 'tenant-b', agentType: 'coder', period: '2025-01' }));
    });

    it('should list all metrics', async () => {
      const metrics = await store.listMetrics({});
      expect(metrics.length).toBe(3);
    });

    it('should filter by tenantId', async () => {
      const metrics = await store.listMetrics({ tenantId: 'tenant-a' });
      expect(metrics.length).toBe(2);
    });

    it('should filter by agentType', async () => {
      const metrics = await store.listMetrics({ agentType: 'coder' });
      expect(metrics.length).toBe(2);
    });
  });
});

// =============================================================================
// AccuracyTracker Tests
// =============================================================================

describe('AccuracyTracker', () => {
  let store: InMemoryAccuracyTrackerStore;
  let tracker: AccuracyTracker;

  beforeEach(() => {
    store = new InMemoryAccuracyTrackerStore();
    tracker = new AccuracyTracker({ store, tenantId: 'tenant-1' });
  });

  describe('recordOutcome', () => {
    it('should record a decision outcome', async () => {
      await tracker.recordOutcome('trace-123', {
        wasOverridden: false,
        actualOutcome: 'success',
      });

      const outcome = store.getOutcome('trace-123');
      expect(outcome).toBeDefined();
      expect(outcome?.wasOverridden).toBe(false);
    });

    it('should record with feedback', async () => {
      await tracker.recordOutcome('trace-456', {
        wasOverridden: true,
        overrideCorrect: true,
        feedback: {
          rating: 5,
          notes: 'Great job!',
        },
      });

      const outcome = store.getOutcome('trace-456');
      expect(outcome?.feedback?.rating).toBe(5);
    });
  });

  describe('getMetrics', () => {
    it('should get metrics for current period', async () => {
      const currentPeriod = new Date().toISOString().slice(0, 7);
      await store.saveMetrics(createTestMetrics({ period: currentPeriod }));

      const metrics = await tracker.getMetrics('coder');
      expect(metrics).toBeDefined();
    });

    it('should get metrics for specific period', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2024-06' }));

      const metrics = await tracker.getMetrics('coder', '2024-06');
      expect(metrics).toBeDefined();
      expect(metrics?.period).toBe('2024-06');
    });
  });

  describe('getSummary', () => {
    it('should get summary for period', async () => {
      await store.saveMetrics(createTestMetrics({ agentType: 'coder', period: '2025-01' }));
      await store.saveMetrics(createTestMetrics({ agentType: 'triage', period: '2025-01' }));

      const summary = await tracker.getSummary('2025-01');
      expect(summary).toBeDefined();
      expect(summary?.totalDecisions).toBe(200);
    });
  });

  describe('getTrend', () => {
    it('should get accuracy trend', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01', accuracy: 0.80 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-02', accuracy: 0.85 }));

      const trend = await tracker.getTrend('coder', 6);
      expect(trend.length).toBe(2);
    });
  });

  describe('getLearningVelocity', () => {
    it('should calculate positive velocity for improving accuracy', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01', accuracy: 0.70 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-02', accuracy: 0.75 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-03', accuracy: 0.80 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-04', accuracy: 0.85 }));

      const velocity = await tracker.getLearningVelocity('coder', 4);
      expect(velocity).toBeGreaterThan(0);
    });

    it('should return 0 for insufficient data', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01' }));

      const velocity = await tracker.getLearningVelocity('coder', 6);
      expect(velocity).toBe(0);
    });
  });

  describe('isCalibrated', () => {
    it('should return true for high, stable accuracy', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01', accuracy: 0.85 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-02', accuracy: 0.86 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-03', accuracy: 0.84 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-04', accuracy: 0.85 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-05', accuracy: 0.86 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-06', accuracy: 0.85 }));

      const calibrated = await tracker.isCalibrated('coder');
      expect(calibrated).toBe(true);
    });

    it('should return false for low accuracy', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01', accuracy: 0.50 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-02', accuracy: 0.52 }));
      await store.saveMetrics(createTestMetrics({ period: '2025-03', accuracy: 0.51 }));

      const calibrated = await tracker.isCalibrated('coder');
      expect(calibrated).toBe(false);
    });

    it('should return false for insufficient data', async () => {
      await store.saveMetrics(createTestMetrics({ period: '2025-01', accuracy: 0.90 }));

      const calibrated = await tracker.isCalibrated('coder');
      expect(calibrated).toBe(false);
    });
  });

  describe('getRecommendations', () => {
    it('should recommend improving low accuracy', async () => {
      const currentPeriod = new Date().toISOString().slice(0, 7);
      await store.saveMetrics(createTestMetrics({
        period: currentPeriod,
        accuracy: 0.50,
      }));

      const recommendations = await tracker.getRecommendations('coder');
      expect(recommendations.some(r => r.includes('accuracy is low'))).toBe(true);
    });

    it('should note when overrides are often incorrect', async () => {
      const currentPeriod = new Date().toISOString().slice(0, 7);
      await store.saveMetrics(createTestMetrics({
        period: currentPeriod,
        humanOverrides: 10,
        overrideCorrectness: 0.3,
      }));

      const recommendations = await tracker.getRecommendations('coder');
      expect(recommendations.some(r => r.includes('overrides are often incorrect'))).toBe(true);
    });

    it('should note high-complexity issues', async () => {
      const currentPeriod = new Date().toISOString().slice(0, 7);
      await store.saveMetrics(createTestMetrics({
        period: currentPeriod,
        byComplexity: {
          low: { decisions: 50, overrides: 5, correctOverrides: 4, incorrectOverrides: 1, accuracy: 0.92 },
          medium: { decisions: 35, overrides: 10, correctOverrides: 8, incorrectOverrides: 2, accuracy: 0.80 },
          high: { decisions: 15, overrides: 10, correctOverrides: 8, incorrectOverrides: 2, accuracy: 0.40 },
        },
      }));

      const recommendations = await tracker.getRecommendations('coder');
      expect(recommendations.some(r => r.includes('High-complexity'))).toBe(true);
    });

    it('should return empty for no metrics', async () => {
      const recommendations = await tracker.getRecommendations('coder');
      expect(recommendations.length).toBe(0);
    });
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('Utility Functions', () => {
  describe('formatPeriod', () => {
    const testDate = new Date('2025-03-15');

    it('should format as day', () => {
      expect(formatPeriod(testDate, 'day')).toBe('2025-03-15');
    });

    it('should format as month', () => {
      expect(formatPeriod(testDate, 'month')).toBe('2025-03');
    });

    it('should format as quarter', () => {
      expect(formatPeriod(testDate, 'quarter')).toBe('2025-Q1');
    });

    it('should format as year', () => {
      expect(formatPeriod(testDate, 'year')).toBe('2025');
    });

    it('should format as all-time', () => {
      expect(formatPeriod(testDate, 'all-time')).toBe('all');
    });
  });

  describe('getComplexityBand', () => {
    it('should return low for complexity <= 3', () => {
      expect(getComplexityBand(1)).toBe('low');
      expect(getComplexityBand(3)).toBe('low');
    });

    it('should return medium for complexity 4-7', () => {
      expect(getComplexityBand(4)).toBe('medium');
      expect(getComplexityBand(7)).toBe('medium');
    });

    it('should return high for complexity > 7', () => {
      expect(getComplexityBand(8)).toBe('high');
      expect(getComplexityBand(10)).toBe('high');
    });
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetAccuracyTrackerStore();
  });

  describe('createAccuracyTracker', () => {
    it('should create a tracker with default store', () => {
      const tracker = createAccuracyTracker('tenant-1');
      expect(tracker).toBeInstanceOf(AccuracyTracker);
    });

    it('should create a tracker with custom store', () => {
      const customStore = new InMemoryAccuracyTrackerStore();
      const tracker = createAccuracyTracker('tenant-1', customStore);
      expect(tracker).toBeInstanceOf(AccuracyTracker);
    });
  });

  describe('Singleton Store', () => {
    it('should return same instance', () => {
      const store1 = getAccuracyTrackerStore();
      const store2 = getAccuracyTrackerStore();

      expect(store1).toBe(store2);
    });

    it('should allow setting custom store', () => {
      const customStore = new InMemoryAccuracyTrackerStore();
      setAccuracyTrackerStore(customStore);

      expect(getAccuracyTrackerStore()).toBe(customStore);
    });
  });
});
