/**
 * Prediction Service
 *
 * High-level service for run outcome prediction.
 * Integrates TimeGPT client with data collection and accuracy tracking.
 */

import {
  TimeGPTClient,
  TimeGPTError,
  TimeGPTInsufficientDataError,
  createTimeGPTClientFromEnv,
} from './timegpt-client.js';
import {
  RunDataCollector,
  CollectorOptions,
  createRunDataCollector,
} from './collectors/index.js';
import {
  RunOutcomePrediction,
  HistoricalRunData,
  ForecastingConfig,
  ForecastingConfigSchema,
  toTimeSeriesDuration,
  toTimeSeriesSuccessRate,
  calculateRunStatistics,
  determineTrend,
} from './models/index.js';
import type { RunStore, TenantStore } from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

/**
 * Prediction request for a new run
 */
export interface PredictionRequest {
  /** Run type */
  runType: 'triage' | 'plan' | 'resolve' | 'review' | 'autopilot';
  /** Estimated complexity (1-5) */
  complexity: number;
  /** Number of files in the PR */
  filesChanged: number;
  /** Lines added (optional) */
  linesAdded?: number;
  /** Lines deleted (optional) */
  linesDeleted?: number;
  /** Tenant ID for context (optional) */
  tenantId?: string;
  /** Repository for context (optional) */
  repoFullName?: string;
  /** Use cached historical data if available */
  useCache?: boolean;
}

/**
 * Prediction result with metadata
 */
export interface PredictionResult {
  /** The prediction */
  prediction: RunOutcomePrediction;
  /** Whether this was based on sufficient historical data */
  reliable: boolean;
  /** Warnings about the prediction */
  warnings: string[];
  /** Historical data used */
  historicalDataPoints: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Service configuration
 */
export interface PredictionServiceConfig {
  /** Forecasting configuration */
  config: Partial<ForecastingConfig>;
  /** Run store (for local usage) */
  runStore?: RunStore;
  /** Tenant store (for SaaS usage) */
  tenantStore?: TenantStore;
  /** Optional pre-configured TimeGPT client */
  timeGPTClient?: TimeGPTClient;
  /** Optional pre-configured collector */
  collector?: RunDataCollector;
}

// =============================================================================
// Prediction Service
// =============================================================================

/**
 * Service for run outcome prediction
 *
 * Provides high-level prediction functionality including:
 * - Automatic historical data collection
 * - TimeGPT-based forecasting
 * - Fallback to statistical prediction
 * - Caching for performance
 */
export class PredictionService {
  private readonly config: ForecastingConfig;
  private readonly timeGPT: TimeGPTClient | null;
  private readonly collector: RunDataCollector;
  private readonly cache: Map<string, {
    data: HistoricalRunData[];
    timestamp: Date;
  }> = new Map();

  constructor(options: PredictionServiceConfig) {
    // Parse and validate config
    this.config = ForecastingConfigSchema.parse({
      ...options.config,
      timeGPT: options.config.timeGPT ?? {
        apiToken: process.env.NIXTLA_API_KEY ?? process.env.TIMEGPT_API_KEY ?? '',
      },
    });

    // Initialize TimeGPT client (may be null if not configured)
    if (options.timeGPTClient) {
      this.timeGPT = options.timeGPTClient;
    } else if (this.config.timeGPT.apiToken) {
      try {
        this.timeGPT = createTimeGPTClientFromEnv();
      } catch {
        this.timeGPT = null;
      }
    } else {
      this.timeGPT = null;
    }

    // Initialize collector
    if (options.collector) {
      this.collector = options.collector;
    } else {
      this.collector = createRunDataCollector(options.runStore, options.tenantStore);
    }
  }

  /**
   * Predict outcome for a new run
   *
   * @param request - Prediction request
   * @returns Prediction result with metadata
   */
  async predict(request: PredictionRequest): Promise<PredictionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Collect historical data
    const historicalData = await this.getHistoricalData(request);

    if (historicalData.length === 0) {
      // No historical data - return statistical defaults
      return this.createDefaultPrediction(request, startTime, [
        'No historical data available. Prediction based on run type defaults.',
      ]);
    }

    if (historicalData.length < this.config.minHistoricalRuns) {
      warnings.push(
        `Limited historical data (${historicalData.length} runs). ` +
        `Prediction may be less accurate.`
      );
    }

    // Try TimeGPT prediction first
    if (this.timeGPT && historicalData.length >= this.config.minHistoricalRuns) {
      try {
        return await this.predictWithTimeGPT(request, historicalData, startTime, warnings);
      } catch (error) {
        if (error instanceof TimeGPTInsufficientDataError) {
          warnings.push('TimeGPT requires more data. Using statistical prediction.');
        } else if (error instanceof TimeGPTError) {
          warnings.push(`TimeGPT error: ${error.message}. Using statistical prediction.`);
        } else {
          warnings.push('TimeGPT unavailable. Using statistical prediction.');
        }
      }
    }

    // Fall back to statistical prediction
    return this.predictStatistical(request, historicalData, startTime, warnings);
  }

  /**
   * Get prediction for a run that's about to be created
   *
   * This is a convenience method for integrating with run creation.
   *
   * @param runType - Type of run
   * @param complexity - Complexity score
   * @param filesChanged - Number of files
   * @param tenantId - Tenant ID (optional)
   * @returns Prediction or null if prediction fails
   */
  async getPredictionForRun(
    runType: PredictionRequest['runType'],
    complexity: number,
    filesChanged: number,
    tenantId?: string
  ): Promise<RunOutcomePrediction | null> {
    if (!this.config.enableAutoPredict) {
      return null;
    }

    try {
      const result = await this.predict({
        runType,
        complexity,
        filesChanged,
        tenantId,
      });
      return result.prediction;
    } catch {
      // Don't let prediction failures block run creation
      return null;
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.timeGPT !== null;
  }

  /**
   * Clear the historical data cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    timeGPTAvailable: boolean;
    timeGPTLatencyMs?: number;
    historicalDataAvailable: boolean;
    dataPointsCount?: number;
  }> {
    let timeGPTAvailable = false;
    let timeGPTLatencyMs: number | undefined;
    let historicalDataAvailable = false;
    let dataPointsCount: number | undefined;

    // Check TimeGPT
    if (this.timeGPT) {
      const health = await this.timeGPT.healthCheck();
      timeGPTAvailable = health.healthy;
      timeGPTLatencyMs = health.latencyMs;
    }

    // Check data availability
    try {
      const result = await this.collector.collect({ limit: 1 });
      historicalDataAvailable = result.metadata.totalFound > 0;
      dataPointsCount = result.metadata.totalFound;
    } catch {
      historicalDataAvailable = false;
    }

    return {
      healthy: timeGPTAvailable || historicalDataAvailable,
      timeGPTAvailable,
      timeGPTLatencyMs,
      historicalDataAvailable,
      dataPointsCount,
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Get historical data, using cache if available
   */
  private async getHistoricalData(request: PredictionRequest): Promise<HistoricalRunData[]> {
    const cacheKey = this.getCacheKey(request);

    // Check cache
    if (request.useCache !== false && this.config.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const age = Date.now() - cached.timestamp.getTime();
        if (age < this.config.cacheTtlSeconds * 1000) {
          return cached.data;
        }
      }
    }

    // Collect fresh data
    const collectorOptions: CollectorOptions = {
      limit: this.config.maxHistoricalRuns,
      sinceDate: new Date(Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000),
      runType: request.runType,
      tenantId: request.tenantId,
      repoFullName: request.repoFullName,
      completedOnly: true,
    };

    const result = await this.collector.collect(collectorOptions);

    // Update cache
    if (this.config.enableCache) {
      this.cache.set(cacheKey, {
        data: result.data,
        timestamp: new Date(),
      });
    }

    return result.data;
  }

  /**
   * Generate cache key for a request
   */
  private getCacheKey(request: PredictionRequest): string {
    return `${request.tenantId ?? 'global'}:${request.runType}:${request.repoFullName ?? 'all'}`;
  }

  /**
   * Predict using TimeGPT
   */
  private async predictWithTimeGPT(
    request: PredictionRequest,
    historicalData: HistoricalRunData[],
    startTime: number,
    warnings: string[]
  ): Promise<PredictionResult> {
    // Prepare time series data
    const durationSeries = toTimeSeriesDuration(historicalData);
    const successSeries = toTimeSeriesSuccessRate(historicalData, 10);

    // Forecast duration
    const durationForecast = await this.timeGPT!.forecast(durationSeries, 1, {
      levels: [80, 90],
    });

    // Forecast success rate (if we have enough data)
    let successForecast = null;
    if (successSeries.points.length >= successSeries.minDataPoints) {
      try {
        successForecast = await this.timeGPT!.forecast(successSeries, 1, {
          levels: [80, 90],
        });
      } catch {
        warnings.push('Could not forecast success rate. Using historical average.');
      }
    }

    // Calculate statistics for features
    const stats = calculateRunStatistics(historicalData);
    const durationValues = historicalData
      .filter(r => r.durationMs !== null)
      .map(r => r.durationMs!);

    // Build prediction
    const predictedDuration = durationForecast.forecast[0].value;
    const durationLo80 = durationForecast.forecast[0].lo80 ?? predictedDuration * 0.7;
    const durationHi80 = durationForecast.forecast[0].hi80 ?? predictedDuration * 1.3;

    const successProbability = successForecast
      ? Math.min(1, Math.max(0, successForecast.forecast[0].value))
      : stats.successRate;

    // Calculate confidence based on historical data quality
    const confidence = this.calculateConfidence(historicalData, request);

    const prediction: RunOutcomePrediction = {
      predictionId: this.generateId(),
      runId: null,
      predictedAt: new Date(),
      successProbability,
      confidence,
      predictedDurationMs: Math.max(0, predictedDuration),
      durationLowerBound: Math.max(0, durationLo80),
      durationUpperBound: Math.max(0, durationHi80),
      predictedTokens: stats.avgTokensUsed > 0 ? Math.round(stats.avgTokensUsed) : undefined,
      features: {
        complexity: request.complexity,
        filesChanged: request.filesChanged,
        runType: request.runType,
        historicalSuccessRate: stats.successRate,
        avgHistoricalDuration: stats.avgDurationMs,
        recentTrend: determineTrend(durationValues),
      },
      modelVersion: 'timegpt-1.0',
      modelConfig: {
        horizon: 1,
        level: [80, 90],
      },
    };

    return {
      prediction,
      reliable: historicalData.length >= this.config.minHistoricalRuns,
      warnings,
      historicalDataPoints: historicalData.length,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Predict using statistical methods (fallback)
   */
  private predictStatistical(
    request: PredictionRequest,
    historicalData: HistoricalRunData[],
    startTime: number,
    warnings: string[]
  ): PredictionResult {
    const stats = calculateRunStatistics(historicalData);

    // Apply complexity adjustment
    const complexityFactor = this.getComplexityFactor(request.complexity);
    const adjustedDuration = stats.avgDurationMs * complexityFactor;

    // Calculate prediction intervals
    const durationStdDev = this.calculateStdDev(
      historicalData.filter(r => r.durationMs !== null).map(r => r.durationMs!)
    );

    const durationValues = historicalData
      .filter(r => r.durationMs !== null)
      .map(r => r.durationMs!);

    const prediction: RunOutcomePrediction = {
      predictionId: this.generateId(),
      runId: null,
      predictedAt: new Date(),
      successProbability: stats.successRate,
      confidence: this.calculateConfidence(historicalData, request),
      predictedDurationMs: adjustedDuration,
      durationLowerBound: Math.max(0, adjustedDuration - 1.28 * durationStdDev), // 80% CI
      durationUpperBound: adjustedDuration + 1.28 * durationStdDev,
      predictedTokens: stats.avgTokensUsed > 0 ? Math.round(stats.avgTokensUsed * complexityFactor) : undefined,
      features: {
        complexity: request.complexity,
        filesChanged: request.filesChanged,
        runType: request.runType,
        historicalSuccessRate: stats.successRate,
        avgHistoricalDuration: stats.avgDurationMs,
        recentTrend: determineTrend(durationValues),
      },
      modelVersion: 'statistical-1.0',
    };

    return {
      prediction,
      reliable: historicalData.length >= this.config.minHistoricalRuns,
      warnings,
      historicalDataPoints: historicalData.length,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Create a default prediction when no historical data is available
   */
  private createDefaultPrediction(
    request: PredictionRequest,
    startTime: number,
    warnings: string[]
  ): PredictionResult {
    // Default durations by run type (in milliseconds)
    const defaultDurations: Record<string, number> = {
      triage: 5000,
      plan: 15000,
      resolve: 60000,
      review: 30000,
      autopilot: 120000,
    };

    const baseDuration = defaultDurations[request.runType] ?? 30000;
    const complexityFactor = this.getComplexityFactor(request.complexity);
    const predictedDuration = baseDuration * complexityFactor;

    const prediction: RunOutcomePrediction = {
      predictionId: this.generateId(),
      runId: null,
      predictedAt: new Date(),
      successProbability: 0.8, // Optimistic default
      confidence: 0.3, // Low confidence without data
      predictedDurationMs: predictedDuration,
      durationLowerBound: predictedDuration * 0.5,
      durationUpperBound: predictedDuration * 2.0,
      features: {
        complexity: request.complexity,
        filesChanged: request.filesChanged,
        runType: request.runType,
        historicalSuccessRate: 0,
        avgHistoricalDuration: 0,
        recentTrend: 'stable',
      },
      modelVersion: 'default-1.0',
    };

    return {
      prediction,
      reliable: false,
      warnings,
      historicalDataPoints: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get complexity factor for duration adjustment
   */
  private getComplexityFactor(complexity: number): number {
    // Exponential scaling for complexity
    return Math.pow(1.5, complexity - 1);
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(
    historicalData: HistoricalRunData[],
    request: PredictionRequest
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence with more data
    const dataBonus = Math.min(0.3, historicalData.length / 100);
    confidence += dataBonus;

    // Decrease confidence for high complexity
    const complexityPenalty = (request.complexity - 3) * 0.05;
    confidence -= complexityPenalty;

    // Check for similar runs in history
    const similarRuns = historicalData.filter(
      r => r.runType === request.runType && Math.abs(r.complexity - request.complexity) <= 1
    );
    if (similarRuns.length >= 5) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Generate a unique prediction ID
   */
  private generateId(): string {
    // Use crypto.randomUUID if available, otherwise fall back to timestamp-based ID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a prediction service
 *
 * @param options - Service configuration
 * @returns Prediction service instance
 */
export function createPredictionService(options: PredictionServiceConfig): PredictionService {
  return new PredictionService(options);
}

/**
 * Create a prediction service from environment variables
 *
 * @param runStore - Run store (for local usage)
 * @param tenantStore - Tenant store (for SaaS usage)
 * @returns Prediction service instance
 */
export function createPredictionServiceFromEnv(
  runStore?: RunStore,
  tenantStore?: TenantStore
): PredictionService {
  return new PredictionService({
    config: {},
    runStore,
    tenantStore,
  });
}
