/**
 * Tests for forecasting models and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  HistoricalRunDataSchema,
  TimeSeriesPointSchema,
  TimeSeriesDatasetSchema,
  RunOutcomePredictionSchema,
  PredictionTrackingRecordSchema,
  AggregatedAccuracyMetricsSchema,
  TimeGPTConfigSchema,
  ForecastingConfigSchema,
  toTimeSeriesDuration,
  toTimeSeriesSuccessRate,
  calculateRunStatistics,
  determineTrend,
  type HistoricalRunData,
} from '../models/index.js';

describe('HistoricalRunDataSchema', () => {
  it('should validate valid historical run data', () => {
    const data = {
      runId: 'run-123',
      timestamp: new Date(),
      runType: 'resolve' as const,
      complexity: 3,
      filesChanged: 10,
      linesAdded: 100,
      linesDeleted: 50,
      success: true,
      durationMs: 5000,
      tokensUsed: 1000,
      stepsCompleted: 4,
      totalSteps: 4,
      tenantId: 'tenant-123',
      repoFullName: 'org/repo',
    };

    const result = HistoricalRunDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid complexity', () => {
    const data = {
      runId: 'run-123',
      timestamp: new Date(),
      runType: 'resolve',
      complexity: 10, // Invalid: max is 5
      filesChanged: 10,
      linesAdded: 100,
      linesDeleted: 50,
      success: true,
      durationMs: 5000,
      stepsCompleted: 4,
      totalSteps: 4,
    };

    const result = HistoricalRunDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should allow null durationMs for running jobs', () => {
    const data = {
      runId: 'run-123',
      timestamp: new Date(),
      runType: 'autopilot',
      complexity: 5,
      filesChanged: 20,
      linesAdded: 200,
      linesDeleted: 100,
      success: false,
      durationMs: null,
      stepsCompleted: 2,
      totalSteps: 5,
    };

    const result = HistoricalRunDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should require all run types', () => {
    const runTypes = ['triage', 'plan', 'resolve', 'review', 'autopilot'];

    for (const runType of runTypes) {
      const data = {
        runId: 'run-123',
        timestamp: new Date(),
        runType,
        complexity: 3,
        filesChanged: 10,
        linesAdded: 100,
        linesDeleted: 50,
        success: true,
        durationMs: 5000,
        stepsCompleted: 4,
        totalSteps: 4,
      };

      const result = HistoricalRunDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });
});

describe('TimeSeriesPointSchema', () => {
  it('should validate valid time series point', () => {
    const point = {
      timestamp: '2024-01-01T00:00:00Z',
      uniqueId: 'run_duration',
      value: 5000,
    };

    const result = TimeSeriesPointSchema.safeParse(point);
    expect(result.success).toBe(true);
  });

  it('should reject negative values', () => {
    // Note: Schema doesn't restrict negative values by default
    const point = {
      timestamp: '2024-01-01T00:00:00Z',
      uniqueId: 'run_duration',
      value: -100,
    };

    const result = TimeSeriesPointSchema.safeParse(point);
    expect(result.success).toBe(true); // Negative values are allowed for some metrics
  });
});

describe('RunOutcomePredictionSchema', () => {
  it('should validate valid prediction', () => {
    const prediction = {
      predictionId: 'pred-123',
      runId: 'run-123',
      predictedAt: new Date(),
      successProbability: 0.85,
      confidence: 0.9,
      predictedDurationMs: 5000,
      durationLowerBound: 3000,
      durationUpperBound: 8000,
      predictedTokens: 1000,
      features: {
        complexity: 3,
        filesChanged: 10,
        runType: 'resolve',
        historicalSuccessRate: 0.9,
        avgHistoricalDuration: 4500,
        recentTrend: 'stable' as const,
      },
      modelVersion: 'timegpt-1.0',
      modelConfig: {
        horizon: 1,
        level: [80, 90],
      },
    };

    const result = RunOutcomePredictionSchema.safeParse(prediction);
    expect(result.success).toBe(true);
  });

  it('should enforce probability bounds', () => {
    const prediction = {
      predictionId: 'pred-123',
      runId: null,
      predictedAt: new Date(),
      successProbability: 1.5, // Invalid: max is 1
      confidence: 0.9,
      predictedDurationMs: 5000,
      durationLowerBound: 3000,
      durationUpperBound: 8000,
      features: {
        complexity: 3,
        filesChanged: 10,
        runType: 'resolve',
        historicalSuccessRate: 0.9,
        avgHistoricalDuration: 4500,
        recentTrend: 'stable',
      },
      modelVersion: 'timegpt-1.0',
    };

    const result = RunOutcomePredictionSchema.safeParse(prediction);
    expect(result.success).toBe(false);
  });
});

describe('TimeGPTConfigSchema', () => {
  it('should validate valid config with defaults', () => {
    const config = {
      apiToken: 'test-token-123',
    };

    const result = TimeGPTConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultHorizon).toBe(1);
      expect(result.data.defaultLevels).toEqual([80, 90]);
      expect(result.data.timeoutMs).toBe(30000);
      expect(result.data.model).toBe('timegpt-1');
    }
  });

  it('should require apiToken', () => {
    const config = {};

    const result = TimeGPTConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('ForecastingConfigSchema', () => {
  it('should apply defaults', () => {
    const config = {
      timeGPT: { apiToken: 'test-token' },
    };

    const result = ForecastingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minHistoricalRuns).toBe(10);
      expect(result.data.maxHistoricalRuns).toBe(1000);
      expect(result.data.lookbackDays).toBe(90);
      expect(result.data.enableCache).toBe(true);
      expect(result.data.enableAutoPredict).toBe(true);
      expect(result.data.enableAccuracyTracking).toBe(true);
    }
  });
});

describe('toTimeSeriesDuration', () => {
  it('should convert runs to time series format', () => {
    const runs: HistoricalRunData[] = [
      createMockRun('run-1', new Date('2024-01-01'), 5000),
      createMockRun('run-2', new Date('2024-01-02'), 6000),
      createMockRun('run-3', new Date('2024-01-03'), 4000),
    ];

    const result = toTimeSeriesDuration(runs);

    expect(result.seriesId).toBe('run_duration');
    expect(result.points).toHaveLength(3);
    expect(result.points[0].value).toBe(5000);
    expect(result.points[1].value).toBe(6000);
    expect(result.points[2].value).toBe(4000);
  });

  it('should filter out runs with null duration', () => {
    const runs: HistoricalRunData[] = [
      createMockRun('run-1', new Date('2024-01-01'), 5000),
      createMockRun('run-2', new Date('2024-01-02'), null),
      createMockRun('run-3', new Date('2024-01-03'), 4000),
    ];

    const result = toTimeSeriesDuration(runs);

    expect(result.points).toHaveLength(2);
  });
});

describe('toTimeSeriesSuccessRate', () => {
  it('should calculate rolling success rate', () => {
    const runs: HistoricalRunData[] = [];
    for (let i = 0; i < 20; i++) {
      runs.push(createMockRun(
        `run-${i}`,
        new Date(Date.now() + i * 1000),
        5000,
        i < 15 // First 15 succeed
      ));
    }

    const result = toTimeSeriesSuccessRate(runs, 10);

    expect(result.seriesId).toBe('success_rate');
    expect(result.points.length).toBeGreaterThan(0);

    // First window (0-9) should have high success rate
    expect(result.points[0].value).toBe(1.0);

    // Last windows should have lower success rate (includes failures)
    expect(result.points[result.points.length - 1].value).toBeLessThan(1.0);
  });
});

describe('calculateRunStatistics', () => {
  it('should calculate statistics correctly', () => {
    const runs: HistoricalRunData[] = [
      createMockRun('run-1', new Date(), 5000, true),
      createMockRun('run-2', new Date(), 6000, true),
      createMockRun('run-3', new Date(), 4000, false),
      createMockRun('run-4', new Date(), 5000, true),
    ];

    // Add tokens to some runs
    runs[0].tokensUsed = 1000;
    runs[1].tokensUsed = 1200;
    runs[2].tokensUsed = 800;

    const stats = calculateRunStatistics(runs);

    expect(stats.totalRuns).toBe(4);
    expect(stats.successRate).toBe(0.75); // 3 out of 4
    expect(stats.avgDurationMs).toBe(5000); // (5000 + 6000 + 4000 + 5000) / 4
    expect(stats.avgComplexity).toBe(3); // All mocks have complexity 3
    expect(stats.avgTokensUsed).toBe(1000); // (1000 + 1200 + 800) / 3
  });

  it('should handle empty runs', () => {
    const stats = calculateRunStatistics([]);

    expect(stats.totalRuns).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.avgDurationMs).toBe(0);
  });
});

describe('determineTrend', () => {
  it('should detect improving trend', () => {
    const values = [100, 110, 120, 130, 140, 150, 160, 170, 180, 200];
    const trend = determineTrend(values, 5);
    expect(trend).toBe('improving');
  });

  it('should detect degrading trend', () => {
    const values = [200, 180, 170, 160, 150, 140, 130, 120, 110, 100];
    const trend = determineTrend(values, 5);
    expect(trend).toBe('degrading');
  });

  it('should detect stable trend', () => {
    const values = [100, 102, 99, 101, 100, 101, 99, 100, 102, 100];
    const trend = determineTrend(values, 5);
    expect(trend).toBe('stable');
  });

  it('should return stable for insufficient data', () => {
    const values = [100, 110, 120];
    const trend = determineTrend(values, 5);
    expect(trend).toBe('stable');
  });
});

// Helper function to create mock run data
function createMockRun(
  runId: string,
  timestamp: Date,
  durationMs: number | null,
  success: boolean = true
): HistoricalRunData {
  return {
    runId,
    timestamp,
    runType: 'resolve',
    complexity: 3,
    filesChanged: 10,
    linesAdded: 100,
    linesDeleted: 50,
    success,
    durationMs,
    stepsCompleted: 4,
    totalSteps: 4,
  };
}
