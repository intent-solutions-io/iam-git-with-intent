/**
 * Tests for accuracy tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AccuracyTracker,
  InMemoryPredictionTrackingStore,
  InMemoryAccuracyMetricsStore,
  createInMemoryAccuracyTracker,
} from '../accuracy-tracker.js';
import type { RunOutcomePrediction } from '../models/index.js';

describe('InMemoryPredictionTrackingStore', () => {
  let store: InMemoryPredictionTrackingStore;

  beforeEach(() => {
    store = new InMemoryPredictionTrackingStore();
  });

  it('should save and retrieve records', async () => {
    const record = createMockTrackingRecord('pred-1', 'run-1');
    await store.save(record);

    const retrieved = await store.get('pred-1');
    expect(retrieved).toEqual(record);
  });

  it('should retrieve by run ID', async () => {
    const record = createMockTrackingRecord('pred-1', 'run-1');
    await store.save(record);

    const retrieved = await store.getByRunId('run-1');
    expect(retrieved).toEqual(record);
  });

  it('should update actual values', async () => {
    const record = createMockTrackingRecord('pred-1', 'run-1');
    await store.save(record);

    await store.updateActual('pred-1', {
      actualSuccess: true,
      actualDurationMs: 5500,
      actualTokens: 950,
      actualRecordedAt: new Date(),
    });

    const retrieved = await store.get('pred-1');
    expect(retrieved?.actualSuccess).toBe(true);
    expect(retrieved?.actualDurationMs).toBe(5500);
    expect(retrieved?.actualTokens).toBe(950);
  });

  it('should list records with filters', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await store.save(createMockTrackingRecord('pred-1', 'run-1', 'tenant-1', yesterday));
    await store.save(createMockTrackingRecord('pred-2', 'run-2', 'tenant-1', now));
    await store.save(createMockTrackingRecord('pred-3', 'run-3', 'tenant-2', now));

    // Filter by tenant
    const tenant1Records = await store.list({ tenantId: 'tenant-1' });
    expect(tenant1Records).toHaveLength(2);

    // Filter by date
    const recentRecords = await store.list({ since: now });
    expect(recentRecords).toHaveLength(2);

    // Filter with limit
    const limitedRecords = await store.list({ limit: 1 });
    expect(limitedRecords).toHaveLength(1);
  });

  it('should count records', async () => {
    await store.save(createMockTrackingRecord('pred-1', 'run-1', 'tenant-1'));
    await store.save(createMockTrackingRecord('pred-2', 'run-2', 'tenant-1'));
    await store.save(createMockTrackingRecord('pred-3', 'run-3', 'tenant-2'));

    const count = await store.count({});
    expect(count).toBe(3);

    const tenant1Count = await store.count({ tenantId: 'tenant-1' });
    expect(tenant1Count).toBe(2);
  });
});

describe('InMemoryAccuracyMetricsStore', () => {
  let store: InMemoryAccuracyMetricsStore;

  beforeEach(() => {
    store = new InMemoryAccuracyMetricsStore();
  });

  it('should save and retrieve aggregated metrics', async () => {
    const metrics = createMockAggregatedMetrics(
      new Date('2024-01-01'),
      new Date('2024-01-07')
    );
    await store.saveAggregated(metrics);

    const retrieved = await store.getAggregated({
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-07'),
    });

    expect(retrieved?.predictionCount).toBe(metrics.predictionCount);
  });

  it('should replace existing metrics for same period', async () => {
    const metrics1 = createMockAggregatedMetrics(
      new Date('2024-01-01'),
      new Date('2024-01-07'),
      10
    );
    const metrics2 = createMockAggregatedMetrics(
      new Date('2024-01-01'),
      new Date('2024-01-07'),
      20
    );

    await store.saveAggregated(metrics1);
    await store.saveAggregated(metrics2);

    const list = await store.listAggregated({});
    expect(list).toHaveLength(1);
    expect(list[0].predictionCount).toBe(20);
  });

  it('should list metrics with filters', async () => {
    await store.saveAggregated(createMockAggregatedMetrics(
      new Date('2024-01-01'),
      new Date('2024-01-07'),
      10,
      'tenant-1'
    ));
    await store.saveAggregated(createMockAggregatedMetrics(
      new Date('2024-01-08'),
      new Date('2024-01-14'),
      20,
      'tenant-1'
    ));
    await store.saveAggregated(createMockAggregatedMetrics(
      new Date('2024-01-01'),
      new Date('2024-01-07'),
      15,
      'tenant-2'
    ));

    const tenant1Metrics = await store.listAggregated({ tenantId: 'tenant-1' });
    expect(tenant1Metrics).toHaveLength(2);
  });
});

describe('AccuracyTracker', () => {
  let tracker: AccuracyTracker;
  let trackingStore: InMemoryPredictionTrackingStore;
  let metricsStore: InMemoryAccuracyMetricsStore;

  beforeEach(() => {
    const result = createInMemoryAccuracyTracker('test-1.0');
    tracker = result.tracker;
    trackingStore = result.trackingStore;
    metricsStore = result.metricsStore;
  });

  describe('recordPrediction', () => {
    it('should record a prediction', async () => {
      const prediction = createMockPrediction('pred-1');

      await tracker.recordPrediction(prediction, 'run-1', {
        tenantId: 'tenant-1',
        runType: 'resolve',
        complexity: 3,
      });

      const record = await trackingStore.get('pred-1');
      expect(record).not.toBeNull();
      expect(record?.runId).toBe('run-1');
      expect(record?.tenantId).toBe('tenant-1');
      expect(record?.predictedSuccess).toBe(true); // 0.85 > 0.5
      expect(record?.predictedDurationMs).toBe(5000);
    });
  });

  describe('recordActualOutcome', () => {
    it('should record actual outcome', async () => {
      const prediction = createMockPrediction('pred-1');
      await tracker.recordPrediction(prediction, 'run-1', {
        runType: 'resolve',
        complexity: 3,
      });

      await tracker.recordActualOutcome({
        runId: 'run-1',
        success: true,
        durationMs: 5200,
        tokensUsed: 1100,
        completedAt: new Date(),
      });

      const record = await trackingStore.get('pred-1');
      expect(record?.actualSuccess).toBe(true);
      expect(record?.actualDurationMs).toBe(5200);
      expect(record?.actualTokens).toBe(1100);
    });

    it('should handle missing prediction gracefully', async () => {
      // Should not throw when no prediction exists
      await expect(tracker.recordActualOutcome({
        runId: 'non-existent',
        success: true,
        durationMs: 5000,
        completedAt: new Date(),
      })).resolves.not.toThrow();
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate metrics for completed predictions', async () => {
      // Create predictions with outcomes
      const predictions = [
        { predictionId: 'pred-1', predicted: { success: true, duration: 5000 }, actual: { success: true, duration: 5200 } },
        { predictionId: 'pred-2', predicted: { success: true, duration: 6000 }, actual: { success: true, duration: 5800 } },
        { predictionId: 'pred-3', predicted: { success: true, duration: 4000 }, actual: { success: false, duration: 4500 } },
        { predictionId: 'pred-4', predicted: { success: false, duration: 8000 }, actual: { success: false, duration: 7500 } },
      ];

      for (let i = 0; i < predictions.length; i++) {
        const p = predictions[i];
        await tracker.recordPrediction(
          createMockPrediction(p.predictionId, p.predicted.success ? 0.8 : 0.3, p.predicted.duration),
          `run-${i}`,
          { runType: 'resolve', complexity: 3 }
        );
        await tracker.recordActualOutcome({
          runId: `run-${i}`,
          success: p.actual.success,
          durationMs: p.actual.duration,
          completedAt: new Date(),
        });
      }

      const metrics = await tracker.calculateMetrics({
        periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        periodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      expect(metrics.predictionCount).toBe(4);

      // Success metrics
      expect(metrics.successMetrics.truePositives).toBe(2);
      expect(metrics.successMetrics.trueNegatives).toBe(1);
      expect(metrics.successMetrics.falsePositives).toBe(1);
      expect(metrics.successMetrics.falseNegatives).toBe(0);
      expect(metrics.successMetrics.accuracy).toBe(0.75);

      // Duration metrics
      expect(metrics.durationMetrics.mae).toBeGreaterThan(0);
      expect(metrics.durationMetrics.rmse).toBeGreaterThan(0);
    });

    it('should return empty metrics when no data', async () => {
      const metrics = await tracker.calculateMetrics({
        periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        periodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      expect(metrics.predictionCount).toBe(0);
      expect(metrics.successMetrics.accuracy).toBe(0);
      expect(metrics.durationMetrics.mae).toBe(0);
    });
  });

  describe('getAccuracyTrend', () => {
    it('should return trend over multiple periods', async () => {
      // Create predictions across multiple weeks
      for (let week = 0; week < 3; week++) {
        const baseTime = Date.now() - week * 7 * 24 * 60 * 60 * 1000;
        for (let i = 0; i < 5; i++) {
          const timestamp = new Date(baseTime - i * 24 * 60 * 60 * 1000);
          await trackingStore.save({
            predictionId: `pred-${week}-${i}`,
            runId: `run-${week}-${i}`,
            predictedAt: timestamp,
            predictedSuccess: true,
            predictedDurationMs: 5000,
            actualSuccess: Math.random() > 0.2,
            actualDurationMs: 5000 + Math.random() * 1000,
            actualTokens: null,
            actualRecordedAt: timestamp,
            modelVersion: 'test-1.0',
            runType: 'resolve',
            complexity: 3,
          });
        }
      }

      const trend = await tracker.getAccuracyTrend({
        periods: 3,
        periodDays: 7,
      });

      expect(trend).toHaveLength(3);
      expect(trend[0].predictionCount).toBeGreaterThan(0);
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return performance summary', async () => {
      // Create some predictions
      for (let i = 0; i < 10; i++) {
        await tracker.recordPrediction(
          createMockPrediction(`pred-${i}`),
          `run-${i}`,
          { runType: 'resolve', complexity: 3 }
        );
        await tracker.recordActualOutcome({
          runId: `run-${i}`,
          success: i < 8, // 80% success
          durationMs: 5000 + i * 100,
          completedAt: new Date(),
        });
      }

      const summary = await tracker.getPerformanceSummary({});

      expect(summary.predictionCount).toBe(10);
      expect(summary.overallAccuracy).toBeGreaterThan(0);
      expect(summary.durationMAE).toBeGreaterThan(0);
      expect(['improving', 'stable', 'degrading']).toContain(summary.trend);
    });
  });
});

// Helper functions

function createMockTrackingRecord(
  predictionId: string,
  runId: string,
  tenantId?: string,
  predictedAt?: Date
) {
  return {
    predictionId,
    runId,
    tenantId,
    predictedAt: predictedAt ?? new Date(),
    predictedSuccess: true,
    predictedDurationMs: 5000,
    predictedTokens: 1000,
    actualSuccess: null,
    actualDurationMs: null,
    actualTokens: null,
    actualRecordedAt: null,
    modelVersion: 'test-1.0',
    runType: 'resolve',
    complexity: 3,
  };
}

function createMockAggregatedMetrics(
  periodStart: Date,
  periodEnd: Date,
  predictionCount: number = 10,
  tenantId?: string
) {
  return {
    periodStart,
    periodEnd,
    predictionCount,
    durationMetrics: {
      mae: 500,
      rmse: 600,
      mape: 10,
      smape: 9,
    },
    successMetrics: {
      accuracy: 0.9,
      precision: 0.88,
      recall: 0.92,
      f1: 0.90,
      truePositives: 8,
      trueNegatives: 1,
      falsePositives: 1,
      falseNegatives: 0,
    },
    modelVersion: 'test-1.0',
    tenantId,
  };
}

function createMockPrediction(
  predictionId: string,
  successProbability: number = 0.85,
  predictedDurationMs: number = 5000
): RunOutcomePrediction {
  return {
    predictionId,
    runId: null,
    predictedAt: new Date(),
    successProbability,
    confidence: 0.8,
    predictedDurationMs,
    durationLowerBound: predictedDurationMs * 0.7,
    durationUpperBound: predictedDurationMs * 1.3,
    predictedTokens: 1000,
    features: {
      complexity: 3,
      filesChanged: 10,
      runType: 'resolve',
      historicalSuccessRate: 0.9,
      avgHistoricalDuration: 4800,
      recentTrend: 'stable',
    },
    modelVersion: 'test-1.0',
  };
}
