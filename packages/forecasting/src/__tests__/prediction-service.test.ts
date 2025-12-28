/**
 * Tests for prediction service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PredictionService,
  createPredictionService,
  createPredictionServiceFromEnv,
} from '../prediction-service.js';
import { TimeGPTClient } from '../timegpt-client.js';
import { RunDataCollector, type CollectionResult } from '../collectors/index.js';
import type { HistoricalRunData } from '../models/index.js';

describe('PredictionService', () => {
  let mockTimeGPT: Partial<TimeGPTClient>;
  let mockCollector: Partial<RunDataCollector>;

  beforeEach(() => {
    mockTimeGPT = {
      forecast: vi.fn(),
      healthCheck: vi.fn(),
    };

    mockCollector = {
      collect: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create service with minimal config', () => {
      const service = createPredictionService({
        config: {
          timeGPT: { apiToken: 'test-token' },
        },
        collector: mockCollector as RunDataCollector,
      });

      expect(service).toBeInstanceOf(PredictionService);
    });
  });

  describe('predict', () => {
    it('should return default prediction when no historical data', async () => {
      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        metadata: {
          totalFound: 0,
          included: 0,
          excluded: 0,
          collectedAt: new Date(),
          options: {},
          statistics: {
            totalRuns: 0,
            successRate: 0,
            avgDurationMs: 0,
            medianDurationMs: 0,
            p95DurationMs: 0,
            avgComplexity: 0,
            avgFilesChanged: 0,
            avgTokensUsed: 0,
          },
        },
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' } },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      const result = await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      expect(result.reliable).toBe(false);
      expect(result.warnings).toContain('No historical data available. Prediction based on run type defaults.');
      expect(result.prediction.modelVersion).toBe('default-1.0');
    });

    it('should use statistical prediction for limited data', async () => {
      const historicalData = createMockHistoricalData(5); // Less than default min of 10

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' } },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      const result = await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      expect(result.warnings.some(w => w.includes('Limited historical data'))).toBe(true);
      expect(result.prediction.modelVersion).toBe('statistical-1.0');
    });

    it('should use TimeGPT when sufficient data available', async () => {
      const historicalData = createMockHistoricalData(20);

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      (mockTimeGPT.forecast as ReturnType<typeof vi.fn>).mockResolvedValue({
        forecast: [{
          timestamp: new Date().toISOString(),
          value: 5500,
          lo80: 4500,
          hi80: 6500,
          lo90: 4000,
          hi90: 7000,
        }],
        uniqueId: 'run_duration',
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' } },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      const result = await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      expect(result.prediction.modelVersion).toBe('timegpt-1.0');
      expect(result.prediction.predictedDurationMs).toBe(5500);
      expect(mockTimeGPT.forecast).toHaveBeenCalled();
    });

    it('should fall back to statistical when TimeGPT fails', async () => {
      const historicalData = createMockHistoricalData(20);

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      (mockTimeGPT.forecast as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('TimeGPT API error')
      );

      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' } },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      const result = await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      expect(result.warnings.some(w => w.includes('Using statistical prediction'))).toBe(true);
      expect(result.prediction.modelVersion).toBe('statistical-1.0');
    });

    it('should use cache when enabled', async () => {
      const historicalData = createMockHistoricalData(20);

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      (mockTimeGPT.forecast as ReturnType<typeof vi.fn>).mockResolvedValue({
        forecast: [{
          timestamp: new Date().toISOString(),
          value: 5500,
          lo80: 4500,
          hi80: 6500,
        }],
        uniqueId: 'run_duration',
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' }, enableCache: true },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      // First call
      await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      // Second call should use cache
      await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      // Collector should only be called once
      expect(mockCollector.collect).toHaveBeenCalledTimes(1);
    });

    it('should adjust prediction based on complexity', async () => {
      const historicalData = createMockHistoricalData(20);

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: '' } }, // No TimeGPT
        collector: mockCollector as RunDataCollector,
      });

      const lowComplexity = await service.predict({
        runType: 'resolve',
        complexity: 1,
        filesChanged: 10,
      });

      // Clear cache
      service.clearCache();

      const highComplexity = await service.predict({
        runType: 'resolve',
        complexity: 5,
        filesChanged: 10,
      });

      // High complexity should predict longer duration
      expect(highComplexity.prediction.predictedDurationMs).toBeGreaterThan(
        lowComplexity.prediction.predictedDurationMs
      );
    });
  });

  describe('getPredictionForRun', () => {
    it('should return prediction when auto-predict enabled', async () => {
      const historicalData = createMockHistoricalData(20);

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: '' }, enableAutoPredict: true },
        collector: mockCollector as RunDataCollector,
      });

      const prediction = await service.getPredictionForRun('resolve', 3, 10);

      expect(prediction).not.toBeNull();
      expect(prediction?.features.runType).toBe('resolve');
    });

    it('should return null when auto-predict disabled', async () => {
      const service = createPredictionService({
        config: { timeGPT: { apiToken: '' }, enableAutoPredict: false },
        collector: mockCollector as RunDataCollector,
      });

      const prediction = await service.getPredictionForRun('resolve', 3, 10);

      expect(prediction).toBeNull();
    });

    it('should return null on error', async () => {
      (mockCollector.collect as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Collection failed')
      );

      const service = createPredictionService({
        config: { timeGPT: { apiToken: '' }, enableAutoPredict: true },
        collector: mockCollector as RunDataCollector,
      });

      const prediction = await service.getPredictionForRun('resolve', 3, 10);

      expect(prediction).toBeNull();
    });
  });

  describe('isConfigured', () => {
    it('should return true when TimeGPT client is available', () => {
      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' } },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when TimeGPT is not configured', () => {
      const service = createPredictionService({
        config: { timeGPT: { apiToken: '' } },
        collector: mockCollector as RunDataCollector,
      });

      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      (mockTimeGPT.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
        healthy: true,
        message: 'OK',
        latencyMs: 100,
      });

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        metadata: {
          totalFound: 100,
          included: 0,
          excluded: 0,
          collectedAt: new Date(),
          options: {},
          statistics: {} as any,
        },
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: 'test-token' } },
        collector: mockCollector as RunDataCollector,
        timeGPTClient: mockTimeGPT as TimeGPTClient,
      });

      const health = await service.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.timeGPTAvailable).toBe(true);
      expect(health.historicalDataAvailable).toBe(true);
      expect(health.dataPointsCount).toBe(100);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const historicalData = createMockHistoricalData(20);

      (mockCollector.collect as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: historicalData,
        metadata: createMockMetadata(historicalData),
      });

      const service = createPredictionService({
        config: { timeGPT: { apiToken: '' }, enableCache: true },
        collector: mockCollector as RunDataCollector,
      });

      // First call
      await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      // Clear cache
      service.clearCache();

      // Second call should collect again
      await service.predict({
        runType: 'resolve',
        complexity: 3,
        filesChanged: 10,
      });

      expect(mockCollector.collect).toHaveBeenCalledTimes(2);
    });
  });
});

// Helper functions

function createMockHistoricalData(count: number): HistoricalRunData[] {
  return Array.from({ length: count }, (_, i) => ({
    runId: `run-${i}`,
    timestamp: new Date(Date.now() - i * 60 * 60 * 1000),
    runType: 'resolve' as const,
    complexity: 3,
    filesChanged: 10,
    linesAdded: 100,
    linesDeleted: 50,
    success: Math.random() > 0.2,
    durationMs: 4000 + Math.random() * 2000,
    tokensUsed: 1000,
    stepsCompleted: 4,
    totalSteps: 4,
  }));
}

function createMockMetadata(data: HistoricalRunData[]): CollectionResult['metadata'] {
  const durations = data.filter(d => d.durationMs !== null).map(d => d.durationMs!);
  const successCount = data.filter(d => d.success).length;

  return {
    totalFound: data.length,
    included: data.length,
    excluded: 0,
    collectedAt: new Date(),
    options: {},
    statistics: {
      totalRuns: data.length,
      successRate: data.length > 0 ? successCount / data.length : 0,
      avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      medianDurationMs: durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)] : 0,
      p95DurationMs: durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] : 0,
      avgComplexity: 3,
      avgFilesChanged: 10,
      avgTokensUsed: 1000,
    },
  };
}
