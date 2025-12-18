/**
 * Tests for Phase 57: Backtesting Harness
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BACKTESTING_VERSION,
  BacktestingErrorCodes,
  Backtester,
  createBacktester,
  createBacktestConfig,
  validateBacktestConfig,
  BacktestConfigSchema,
  type BacktestConfig,
  type BacktestResult,
  type FoldResult,
  type MetricsResult,
  type ModelComparison,
  type AccuracyMetric,
  type ValidationStrategy,
} from '../index.js';
import type { CanonicalPoint } from '../../time-series/index.js';
import type { ForecastPoint } from '../../forecasting/index.js';

describe('Backtesting Module', () => {
  describe('Version and Constants', () => {
    it('should export version', () => {
      expect(BACKTESTING_VERSION).toBe('1.0.0');
    });

    it('should export error codes', () => {
      expect(BacktestingErrorCodes.INVALID_CONFIG).toBe('BT_1001');
      expect(BacktestingErrorCodes.INSUFFICIENT_DATA).toBe('BT_2001');
      expect(BacktestingErrorCodes.BACKTEST_FAILED).toBe('BT_3001');
      expect(BacktestingErrorCodes.METRIC_FAILED).toBe('BT_4001');
    });
  });

  describe('BacktestConfig Validation', () => {
    it('should validate valid config', () => {
      const config = createBacktestConfig();
      const result = validateBacktestConfig(config);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject invalid strategy', () => {
      const config = { ...createBacktestConfig(), strategy: 'invalid' };
      const result = validateBacktestConfig(config);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject negative folds', () => {
      const config = { ...createBacktestConfig(), folds: -1 };
      const result = validateBacktestConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject zero horizon', () => {
      const config = { ...createBacktestConfig(), horizon: 0 };
      const result = validateBacktestConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject empty metrics array', () => {
      const config = { ...createBacktestConfig(), metrics: [] };
      const result = validateBacktestConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('createBacktestConfig', () => {
    it('should create default config', () => {
      const config = createBacktestConfig();
      expect(config.strategy).toBe('expanding_window');
      expect(config.folds).toBe(5);
      expect(config.horizon).toBe(12);
      expect(config.initialWindow).toBe(100);
      expect(config.stepSize).toBe(12);
      expect(config.gap).toBe(0);
      expect(config.metrics).toEqual(['mae', 'rmse', 'mape']);
      expect(config.foldTimeoutMs).toBe(60000);
      expect(config.parallel).toBe(false);
    });

    it('should override defaults', () => {
      const config = createBacktestConfig({
        strategy: 'sliding_window',
        folds: 10,
        horizon: 24,
      });
      expect(config.strategy).toBe('sliding_window');
      expect(config.folds).toBe(10);
      expect(config.horizon).toBe(24);
    });
  });

  describe('createBacktester', () => {
    it('should create a backtester instance', () => {
      const backtester = createBacktester();
      expect(backtester).toBeInstanceOf(Backtester);
    });
  });

  describe('Backtester', () => {
    let backtester: Backtester;
    let testPoints: CanonicalPoint[];

    beforeEach(() => {
      backtester = createBacktester();
      // Generate test data - 200 points with trend and noise
      testPoints = [];
      const baseTimestamp = Date.now() - 200 * 3600000;
      for (let i = 0; i < 200; i++) {
        testPoints.push({
          timestamp: baseTimestamp + i * 3600000,
          value: 100 + i * 0.5 + Math.sin(i / 10) * 10,
          quality: 'good',
        });
      }
    });

    describe('runBacktest', () => {
      it('should run expanding window backtest', async () => {
        const config = createBacktestConfig({
          strategy: 'expanding_window',
          folds: 3,
          horizon: 5,
          initialWindow: 50,
          stepSize: 20,
        });

        // Simple naive forecaster
        const forecastFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        expect(result.model).toBe('naive');
        expect(result.seriesId).toBe('test_series');
        expect(result.totalFolds).toBeGreaterThanOrEqual(1);
        expect(result.successfulFolds).toBeGreaterThanOrEqual(1);
        expect(result.aggregatedMetrics).toBeDefined();
        expect(result.executionTimeMs).toBeGreaterThan(0);
      });

      it('should run sliding window backtest', async () => {
        const config = createBacktestConfig({
          strategy: 'sliding_window',
          folds: 3,
          horizon: 5,
          initialWindow: 50,
          stepSize: 20,
        });

        const forecastFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        expect(result.config.strategy).toBe('sliding_window');
        expect(result.totalFolds).toBeGreaterThanOrEqual(1);
      });

      it('should run time series CV backtest', async () => {
        const config = createBacktestConfig({
          strategy: 'time_series_cv',
          folds: 3,
          horizon: 5,
          initialWindow: 50,
          stepSize: 20,
        });

        const forecastFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        expect(result.config.strategy).toBe('time_series_cv');
      });

      it('should calculate multiple metrics', async () => {
        const config = createBacktestConfig({
          folds: 2,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
          metrics: ['mae', 'mse', 'rmse', 'mape', 'smape', 'mase', 'r2', 'corr', 'bias', 'maxe'],
        });

        const forecastFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue + i * 0.1,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        expect(result.aggregatedMetrics.mae).toBeDefined();
        expect(result.aggregatedMetrics.mse).toBeDefined();
        expect(result.aggregatedMetrics.rmse).toBeDefined();
        expect(result.aggregatedMetrics.mape).toBeDefined();
        expect(result.aggregatedMetrics.smape).toBeDefined();
      });

      it('should throw on insufficient data', async () => {
        const config = createBacktestConfig({
          initialWindow: 300,
          horizon: 50,
        });

        const forecastFn = async (): Promise<ForecastPoint[]> => [];

        await expect(
          backtester.runBacktest(testPoints, forecastFn, config, 'naive', 'test_series')
        ).rejects.toThrow('Insufficient data');
      });

      it('should throw on invalid folds', async () => {
        const config = createBacktestConfig({ folds: 0 });
        const forecastFn = async (): Promise<ForecastPoint[]> => [];

        await expect(
          backtester.runBacktest(testPoints, forecastFn, config, 'naive', 'test_series')
        ).rejects.toThrow();
      });

      it('should throw on invalid horizon', async () => {
        const config = createBacktestConfig({ horizon: 0 });
        const forecastFn = async (): Promise<ForecastPoint[]> => [];

        await expect(
          backtester.runBacktest(testPoints, forecastFn, config, 'naive', 'test_series')
        ).rejects.toThrow();
      });

      it('should handle forecaster errors gracefully', async () => {
        const config = createBacktestConfig({
          folds: 2,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
        });

        const forecastFn = async (): Promise<ForecastPoint[]> => {
          throw new Error('Model failed');
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        expect(result.successfulFolds).toBe(0);
        expect(result.failedFolds).toBeGreaterThan(0);
        result.folds.forEach(fold => {
          expect(fold.success).toBe(false);
          expect(fold.error).toBe('Model failed');
        });
      });

      it('should handle gap/embargo between train and test', async () => {
        const config = createBacktestConfig({
          folds: 2,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
          gap: 5,
        });

        const forecastFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        expect(result.config.gap).toBe(5);
        expect(result.successfulFolds).toBeGreaterThan(0);
      });

      it('should calculate metric statistics', async () => {
        const config = createBacktestConfig({
          folds: 3,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
        });

        const forecastFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const result = await backtester.runBacktest(
          testPoints,
          forecastFn,
          config,
          'naive',
          'test_series'
        );

        // Check metric stats for MAE
        const maeStats = result.metricStats['mae'];
        expect(maeStats).toBeDefined();
        expect(maeStats.mean).toBeDefined();
        expect(maeStats.std).toBeDefined();
        expect(maeStats.min).toBeDefined();
        expect(maeStats.max).toBeDefined();
        expect(maeStats.median).toBeDefined();
        expect(maeStats.p5).toBeDefined();
        expect(maeStats.p95).toBeDefined();
      });
    });

    describe('compareModels', () => {
      it('should compare multiple models', async () => {
        const config = createBacktestConfig({
          folds: 2,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
        });

        const naiveFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const meanFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const values = trainData.map(p => p.value as number);
          const meanValue = values.reduce((s, v) => s + v, 0) / values.length;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: meanValue,
            lower: meanValue - 5,
            upper: meanValue + 5,
            confidenceLevel: 0.95,
            model: 'moving_average' as const,
          }));
        };

        const forecasters = new Map([
          ['naive' as const, naiveFn],
          ['moving_average' as const, meanFn],
        ]);

        const comparison = await backtester.compareModels(
          testPoints,
          forecasters,
          config,
          'test_series',
          true
        );

        expect(comparison.models).toHaveLength(2);
        expect(comparison.results.size).toBe(2);
        expect(comparison.bestModelPerMetric).toBeDefined();
        expect(comparison.ranking).toHaveLength(2);
        expect(comparison.significanceTests).toBeDefined();
      });

      it('should rank models by average performance', async () => {
        const config = createBacktestConfig({
          folds: 2,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
        });

        const goodFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          return testPoints.slice(-horizon).map(p => ({
            timestamp: p.timestamp,
            value: p.value as number,
            lower: (p.value as number) - 0.1,
            upper: (p.value as number) + 0.1,
            confidenceLevel: 0.95,
            model: 'linear_trend' as const,
          }));
        };

        const badFn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: 0,
            lower: -5,
            upper: 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const forecasters = new Map([
          ['linear_trend' as const, goodFn],
          ['naive' as const, badFn],
        ]);

        const comparison = await backtester.compareModels(
          testPoints,
          forecasters,
          config,
          'test_series',
          false
        );

        // Linear trend should rank better (lower average rank)
        expect(comparison.ranking[0].averageRank).toBeLessThanOrEqual(comparison.ranking[1].averageRank);
      });

      it('should run significance tests when enabled', async () => {
        const config = createBacktestConfig({
          folds: 4,
          horizon: 5,
          initialWindow: 50,
          stepSize: 20,
        });

        const fn1 = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const fn2 = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const values = trainData.slice(-10).map(p => p.value as number);
          const meanValue = values.reduce((s, v) => s + v, 0) / values.length;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: meanValue,
            lower: meanValue - 5,
            upper: meanValue + 5,
            confidenceLevel: 0.95,
            model: 'moving_average' as const,
          }));
        };

        const forecasters = new Map([
          ['naive' as const, fn1],
          ['moving_average' as const, fn2],
        ]);

        const comparison = await backtester.compareModels(
          testPoints,
          forecasters,
          config,
          'test_series',
          true
        );

        expect(comparison.significanceTests).toBeDefined();
        expect(comparison.significanceTests!.length).toBeGreaterThan(0);

        const test = comparison.significanceTests![0];
        expect(test.testType).toBe('paired_t');
        expect(test.statistic).toBeDefined();
        expect(test.pValue).toBeDefined();
        expect(typeof test.significant).toBe('boolean');
      });

      it('should skip significance tests when disabled', async () => {
        const config = createBacktestConfig({
          folds: 2,
          horizon: 5,
          initialWindow: 50,
          stepSize: 30,
        });

        const fn = async (trainData: CanonicalPoint[], horizon: number): Promise<ForecastPoint[]> => {
          const lastValue = trainData[trainData.length - 1]?.value as number;
          return Array.from({ length: horizon }, (_, i) => ({
            timestamp: Date.now() + i * 3600000,
            value: lastValue,
            lower: lastValue - 5,
            upper: lastValue + 5,
            confidenceLevel: 0.95,
            model: 'naive' as const,
          }));
        };

        const forecasters = new Map([
          ['naive' as const, fn],
          ['moving_average' as const, fn],
        ]);

        const comparison = await backtester.compareModels(
          testPoints,
          forecasters,
          config,
          'test_series',
          false
        );

        expect(comparison.significanceTests).toBeUndefined();
      });
    });
  });

  describe('Zod Schema', () => {
    it('should validate with Zod schema', () => {
      const config = createBacktestConfig();
      const result = BacktestConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid metrics in Zod schema', () => {
      const config = { ...createBacktestConfig(), metrics: ['invalid_metric'] };
      const result = BacktestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject folds > 100', () => {
      const config = { ...createBacktestConfig(), folds: 101 };
      const result = BacktestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Exports', () => {
    it('should export all types', () => {
      // Type-only tests - if this compiles, the types are exported correctly
      const config: BacktestConfig = createBacktestConfig();
      const strategy: ValidationStrategy = 'expanding_window';
      const metric: AccuracyMetric = 'mae';

      expect(config).toBeDefined();
      expect(strategy).toBe('expanding_window');
      expect(metric).toBe('mae');
    });
  });
});
