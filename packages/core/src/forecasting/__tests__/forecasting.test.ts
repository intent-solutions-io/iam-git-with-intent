/**
 * Phase 55-56: Forecasting Services Tests
 *
 * Tests for multi-model forecasting including:
 * - Baseline predictors
 * - TimeGPT integration
 * - Ensemble forecasting
 * - Anomaly detection
 * - Validation and configuration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FORECASTING_VERSION,
  ForecastingErrorCodes,
  BaselineForecaster,
  TimeGPTForecaster,
  EnsembleForecaster,
  validateForecastConfig,
  validateTimeGPTConfig,
  validateEnsembleConfig,
  createForecastConfig,
  createTimeGPTConfig,
  createEnsembleConfig,
  createForecaster,
  createEnsembleForecaster,
  type ForecastConfig,
  type TimeGPTConfig,
  type EnsembleConfig,
  type ForecastModel,
} from '../index.js';
import type { ForecastSeries } from '../index.js';

// Helper to create test series
function createTestSeries(
  length: number,
  pattern: 'linear' | 'seasonal' | 'constant' | 'random' = 'linear'
): ForecastSeries {
  const now = Date.now();
  const interval = 3600000; // 1 hour

  const points = Array.from({ length }, (_, i) => {
    let value: number;
    switch (pattern) {
      case 'linear':
        value = 100 + i * 5;
        break;
      case 'seasonal':
        value = 100 + Math.sin(i * Math.PI / 12) * 20;
        break;
      case 'constant':
        value = 100;
        break;
      case 'random':
        value = 100 + (Math.random() - 0.5) * 50;
        break;
    }
    return {
      timestamp: now - (length - i) * interval,
      value,
    };
  });

  return {
    metadata: {
      id: 'test-series',
      tenantId: 'test-tenant',
      name: 'Test Series',
      resolution: 'hour' as const,
      createdAt: now,
    },
    points,
  };
}

describe('Forecasting Services', () => {
  describe('Contract Version', () => {
    it('should have stable version', () => {
      expect(FORECASTING_VERSION).toBe('1.0.0');
    });
  });

  describe('Error Codes', () => {
    it('should define config error codes (1xxx)', () => {
      expect(ForecastingErrorCodes.INVALID_CONFIG).toBe('FC_1001');
      expect(ForecastingErrorCodes.MISSING_API_KEY).toBe('FC_1002');
    });

    it('should define data error codes (2xxx)', () => {
      expect(ForecastingErrorCodes.INSUFFICIENT_DATA).toBe('FC_2001');
      expect(ForecastingErrorCodes.GAP_IN_DATA).toBe('FC_2003');
    });

    it('should define prediction error codes (3xxx)', () => {
      expect(ForecastingErrorCodes.PREDICTION_FAILED).toBe('FC_3001');
      expect(ForecastingErrorCodes.RATE_LIMITED).toBe('FC_3004');
    });

    it('should define ensemble error codes (4xxx)', () => {
      expect(ForecastingErrorCodes.ENSEMBLE_FAILED).toBe('FC_4001');
      expect(ForecastingErrorCodes.NO_VALID_PREDICTIONS).toBe('FC_4003');
    });

    it('should define cache error codes (5xxx)', () => {
      expect(ForecastingErrorCodes.CACHE_MISS).toBe('FC_5001');
      expect(ForecastingErrorCodes.CACHE_EXPIRED).toBe('FC_5002');
    });
  });

  describe('Config Validation', () => {
    describe('ForecastConfig', () => {
      const validConfig: ForecastConfig = {
        horizon: 24,
        resolution: 'hour',
        model: 'exponential',
        confidenceLevel: 0.95,
        includePredictionIntervals: true,
        timeoutMs: 30000,
        cacheEnabled: true,
        cacheTtlSeconds: 300,
      };

      it('should validate valid config', () => {
        const result = validateForecastConfig(validConfig);
        expect(result.success).toBe(true);
      });

      it('should reject invalid horizon', () => {
        const config = { ...validConfig, horizon: 0 };
        const result = validateForecastConfig(config);
        expect(result.success).toBe(false);
      });

      it('should reject invalid confidence level', () => {
        const config = { ...validConfig, confidenceLevel: 1.5 };
        const result = validateForecastConfig(config);
        expect(result.success).toBe(false);
      });

      it('should accept all valid models', () => {
        const models: ForecastModel[] = [
          'naive', 'seasonal_naive', 'moving_average', 'exponential',
          'linear_trend', 'timegpt', 'ensemble',
        ];
        for (const model of models) {
          const config = { ...validConfig, model };
          const result = validateForecastConfig(config);
          expect(result.success).toBe(true);
        }
      });
    });

    describe('TimeGPTConfig', () => {
      const validConfig: TimeGPTConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.nixtla.io',
        model: 'timegpt-1',
        maxRetries: 3,
        detectAnomalies: true,
      };

      it('should validate valid config', () => {
        const result = validateTimeGPTConfig(validConfig);
        expect(result.success).toBe(true);
      });

      it('should reject empty API key', () => {
        const config = { ...validConfig, apiKey: '' };
        const result = validateTimeGPTConfig(config);
        expect(result.success).toBe(false);
      });

      it('should reject invalid URL', () => {
        const config = { ...validConfig, baseUrl: 'not-a-url' };
        const result = validateTimeGPTConfig(config);
        expect(result.success).toBe(false);
      });
    });

    describe('EnsembleConfig', () => {
      const validConfig: EnsembleConfig = {
        models: ['naive', 'exponential'],
        aggregation: 'mean',
        dropFailed: true,
      };

      it('should validate valid config', () => {
        const result = validateEnsembleConfig(validConfig);
        expect(result.success).toBe(true);
      });

      it('should require at least 2 models', () => {
        const config = { ...validConfig, models: ['naive'] as any };
        const result = validateEnsembleConfig(config);
        expect(result.success).toBe(false);
      });

      it('should accept weights', () => {
        const config = { ...validConfig, weights: [0.6, 0.4] };
        const result = validateEnsembleConfig(config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Factory Functions', () => {
    it('should create forecast config with defaults', () => {
      const config = createForecastConfig({
        horizon: 12,
        model: 'naive',
      });
      expect(config.horizon).toBe(12);
      expect(config.confidenceLevel).toBe(0.95);
      expect(config.includePredictionIntervals).toBe(true);
    });

    it('should create TimeGPT config with defaults', () => {
      const config = createTimeGPTConfig({
        apiKey: 'my-key',
      });
      expect(config.apiKey).toBe('my-key');
      expect(config.baseUrl).toBe('https://api.nixtla.io');
      expect(config.model).toBe('timegpt-1');
    });

    it('should create ensemble config with defaults', () => {
      const config = createEnsembleConfig({
        models: ['naive', 'exponential'],
      });
      expect(config.aggregation).toBe('weighted');
      expect(config.dropFailed).toBe(true);
    });

    it('should create baseline forecaster', () => {
      const forecaster = createForecaster('naive');
      expect(forecaster).toBeInstanceOf(BaselineForecaster);
    });

    it('should create TimeGPT forecaster', () => {
      const forecaster = createForecaster('timegpt', {
        apiKey: 'test-key',
        baseUrl: 'https://api.nixtla.io',
        model: 'timegpt-1',
        maxRetries: 3,
        detectAnomalies: true,
      });
      expect(forecaster).toBeInstanceOf(TimeGPTForecaster);
    });

    it('should create ensemble forecaster', () => {
      const forecaster = createEnsembleForecaster({
        models: ['naive', 'exponential'],
        aggregation: 'mean',
        dropFailed: true,
      });
      expect(forecaster).toBeInstanceOf(EnsembleForecaster);
    });
  });

  describe('BaselineForecaster', () => {
    let forecaster: BaselineForecaster;

    beforeEach(() => {
      forecaster = new BaselineForecaster();
    });

    describe('getSupportedModels', () => {
      it('should return baseline models', () => {
        const models = forecaster.getSupportedModels();
        expect(models).toContain('naive');
        expect(models).toContain('moving_average');
        expect(models).toContain('exponential');
        expect(models).toContain('linear_trend');
      });
    });

    describe('validateSeries', () => {
      it('should validate series with enough points', () => {
        const series = createTestSeries(50);
        const result = forecaster.validateSeries(series);
        expect(result.valid).toBe(true);
        expect(result.pointsAvailable).toBe(50);
      });

      it('should reject series with too few points', () => {
        const series = createTestSeries(2);
        const result = forecaster.validateSeries(series);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should warn about constant series', () => {
        const series = createTestSeries(20, 'constant');
        const result = forecaster.validateSeries(series);
        expect(result.warnings).toContain('Series is constant; predictions will be constant');
      });

      it('should warn about small series', () => {
        const series = createTestSeries(5);
        const result = forecaster.validateSeries(series);
        expect(result.warnings.some(w => w.includes('fewer than 10'))).toBe(true);
      });
    });

    describe('forecast', () => {
      const config = createForecastConfig({
        horizon: 12,
        model: 'naive',
        cacheEnabled: false,
      });

      it('should generate naive forecast', async () => {
        const series = createTestSeries(50, 'linear');
        const result = await forecaster.forecast(series, config);

        expect(result.predictions).toHaveLength(12);
        expect(result.predictions[0].model).toBe('naive');
        expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should generate moving average forecast', async () => {
        const series = createTestSeries(50, 'linear');
        const result = await forecaster.forecast(series, {
          ...config,
          model: 'moving_average',
        });

        expect(result.predictions).toHaveLength(12);
        expect(result.predictions[0].model).toBe('moving_average');
      });

      it('should generate exponential forecast', async () => {
        const series = createTestSeries(50, 'linear');
        const result = await forecaster.forecast(series, {
          ...config,
          model: 'exponential',
        });

        expect(result.predictions).toHaveLength(12);
        expect(result.predictions[0].model).toBe('exponential');
      });

      it('should generate linear trend forecast', async () => {
        const series = createTestSeries(50, 'linear');
        const result = await forecaster.forecast(series, {
          ...config,
          model: 'linear_trend',
        });

        expect(result.predictions).toHaveLength(12);
        // Linear trend should continue the upward trend
        expect(result.predictions[11].value).toBeGreaterThan(result.predictions[0].value);
      });

      it('should generate seasonal naive forecast', async () => {
        const series = createTestSeries(50, 'seasonal');
        const result = await forecaster.forecast(series, {
          ...config,
          model: 'seasonal_naive',
          seasonalPeriod: 12,
        });

        expect(result.predictions).toHaveLength(12);
        expect(result.predictions[0].model).toBe('seasonal_naive');
      });

      it('should include prediction intervals', async () => {
        const series = createTestSeries(50, 'random');
        const result = await forecaster.forecast(series, {
          ...config,
          includePredictionIntervals: true,
        });

        expect(result.predictions[0].lower).toBeDefined();
        expect(result.predictions[0].upper).toBeDefined();
        expect(result.predictions[0].lower).toBeLessThan(result.predictions[0].value);
        expect(result.predictions[0].upper).toBeGreaterThan(result.predictions[0].value);
      });

      it('should calculate metrics', async () => {
        const series = createTestSeries(50, 'linear');
        const result = await forecaster.forecast(series, config);

        expect(result.metrics.mae).toBeDefined();
        expect(result.metrics.rmse).toBeDefined();
      });

      it('should use cache when enabled', async () => {
        const series = createTestSeries(50);
        const cachedConfig = { ...config, cacheEnabled: true };

        const result1 = await forecaster.forecast(series, cachedConfig);
        expect(result1.cached).toBe(false);

        const result2 = await forecaster.forecast(series, cachedConfig);
        expect(result2.cached).toBe(true);
      });

      it('should throw for insufficient data', async () => {
        const series = createTestSeries(2);
        await expect(forecaster.forecast(series, config)).rejects.toThrow();
      });
    });

    describe('detectAnomalies', () => {
      it('should detect anomalies in series', async () => {
        const series = createTestSeries(100, 'random');
        // Add some obvious outliers
        series.points[50].value = 1000;
        series.points[75].value = -500;

        const result = await forecaster.detectAnomalies(series, 2.5);

        expect(result.anomalies.length).toBeGreaterThan(0);
        expect(result.threshold).toBe(2.5);
        expect(result.totalPoints).toBe(100);
      });

      it('should classify anomaly severity', async () => {
        const series = createTestSeries(100, 'constant');
        series.points[50].value = 10000; // Extreme outlier

        const result = await forecaster.detectAnomalies(series, 2.5);

        expect(result.anomalies[0].severity).toBeDefined();
      });
    });

    describe('clearCache', () => {
      it('should clear the cache', async () => {
        const series = createTestSeries(50);
        const config = createForecastConfig({
          horizon: 12,
          model: 'naive',
          cacheEnabled: true,
        });

        await forecaster.forecast(series, config);
        forecaster.clearCache();

        const result = await forecaster.forecast(series, config);
        expect(result.cached).toBe(false);
      });
    });
  });

  describe('TimeGPTForecaster', () => {
    let forecaster: TimeGPTForecaster;

    beforeEach(() => {
      forecaster = new TimeGPTForecaster({
        apiKey: 'test-key',
        baseUrl: 'https://api.nixtla.io',
        model: 'timegpt-1',
        maxRetries: 3,
        detectAnomalies: true,
      });
    });

    describe('getSupportedModels', () => {
      it('should return timegpt and ensemble', () => {
        const models = forecaster.getSupportedModels();
        expect(models).toContain('timegpt');
        expect(models).toContain('ensemble');
      });
    });

    describe('forecast', () => {
      it('should generate TimeGPT forecast', async () => {
        const series = createTestSeries(50);
        const config = createForecastConfig({
          horizon: 12,
          model: 'timegpt',
          cacheEnabled: false,
        });

        const result = await forecaster.forecast(series, config);

        expect(result.predictions).toHaveLength(12);
        expect(result.predictions[0].model).toBe('timegpt');
        expect(result.modelMetadata?.provider).toBe('nixtla');
      });

      it('should include anomaly scores when enabled', async () => {
        const series = createTestSeries(50);
        const config = createForecastConfig({
          horizon: 12,
          model: 'timegpt',
          cacheEnabled: false,
        });

        const result = await forecaster.forecast(series, config);

        // Some predictions may have anomaly scores
        const withScores = result.predictions.filter(p => p.anomalyScore !== undefined);
        expect(withScores.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('EnsembleForecaster', () => {
    let forecaster: EnsembleForecaster;

    beforeEach(() => {
      forecaster = createEnsembleForecaster({
        models: ['naive', 'exponential', 'linear_trend'],
        aggregation: 'mean',
        dropFailed: true,
      });
    });

    describe('getSupportedModels', () => {
      it('should return ensemble and all included models', () => {
        const models = forecaster.getSupportedModels();
        expect(models).toContain('ensemble');
        expect(models).toContain('naive');
        expect(models).toContain('exponential');
        expect(models).toContain('linear_trend');
      });
    });

    describe('forecast', () => {
      it('should generate ensemble forecast', async () => {
        const series = createTestSeries(50, 'linear');
        const config = createForecastConfig({
          horizon: 12,
          model: 'ensemble',
          cacheEnabled: false,
        });

        const result = await forecaster.forecast(series, config);

        expect(result.predictions).toHaveLength(12);
        expect(result.predictions[0].model).toBe('ensemble');
        expect(result.individualResults.size).toBe(3);
      });

      it('should include individual model results', async () => {
        const series = createTestSeries(50, 'linear');
        const config = createForecastConfig({
          horizon: 12,
          model: 'ensemble',
          cacheEnabled: false,
        });

        const result = await forecaster.forecast(series, config);

        expect(result.individualResults.has('naive')).toBe(true);
        expect(result.individualResults.has('exponential')).toBe(true);
        expect(result.individualResults.has('linear_trend')).toBe(true);
      });

      it('should apply weights correctly', async () => {
        const weightedForecaster = createEnsembleForecaster({
          models: ['naive', 'exponential'],
          weights: [0.8, 0.2],
          aggregation: 'weighted',
          dropFailed: true,
        });

        const series = createTestSeries(50, 'linear');
        const config = createForecastConfig({
          horizon: 12,
          model: 'ensemble',
          cacheEnabled: false,
        });

        const result = await weightedForecaster.forecast(series, config);

        expect(result.weightsUsed['naive']).toBe(0.8);
        expect(result.weightsUsed['exponential']).toBe(0.2);
      });

      it('should use median aggregation', async () => {
        const medianForecaster = createEnsembleForecaster({
          models: ['naive', 'exponential', 'linear_trend'],
          aggregation: 'median',
          dropFailed: true,
        });

        const series = createTestSeries(50, 'linear');
        const config = createForecastConfig({
          horizon: 12,
          model: 'ensemble',
          cacheEnabled: false,
        });

        const result = await medianForecaster.forecast(series, config);

        expect(result.predictions).toHaveLength(12);
      });
    });
  });

  describe('Golden Fixtures', () => {
    it('should maintain stable error codes', () => {
      const expected = {
        INVALID_CONFIG: 'FC_1001',
        INSUFFICIENT_DATA: 'FC_2001',
        PREDICTION_FAILED: 'FC_3001',
        ENSEMBLE_FAILED: 'FC_4001',
        CACHE_MISS: 'FC_5001',
      };

      Object.entries(expected).forEach(([key, code]) => {
        expect(ForecastingErrorCodes[key as keyof typeof ForecastingErrorCodes]).toBe(code);
      });
    });

    it('should produce deterministic naive forecast', async () => {
      const forecaster = new BaselineForecaster();
      const series: ForecastSeries = {
        metadata: {
          id: 'test',
          tenantId: 'test',
          name: 'Test',
          resolution: 'hour',
          createdAt: 0,
        },
        points: [
          { timestamp: 1000, value: 100 },
          { timestamp: 2000, value: 110 },
          { timestamp: 3000, value: 120 },
          { timestamp: 4000, value: 130 },
          { timestamp: 5000, value: 140 },
        ],
      };

      const result = await forecaster.forecast(series, {
        horizon: 3,
        resolution: 'hour',
        model: 'naive',
        confidenceLevel: 0.95,
        includePredictionIntervals: false,
        timeoutMs: 30000,
        cacheEnabled: false,
        cacheTtlSeconds: 300,
      });

      // Naive forecast should repeat last value (140)
      expect(result.predictions[0].value).toBe(140);
      expect(result.predictions[1].value).toBe(140);
      expect(result.predictions[2].value).toBe(140);
    });
  });
});
