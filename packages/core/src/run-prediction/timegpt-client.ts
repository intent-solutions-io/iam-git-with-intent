/**
 * TimeGPT Client for Run Outcome Prediction
 *
 * Integrates with Nixtla's TimeGPT API for advanced time series forecasting.
 * Provides run outcome predictions using historical run data.
 *
 * API Reference: https://docs.nixtla.io/
 *
 * @module @gwi/core/run-prediction/timegpt-client
 */

import type {
  RunDataPoint,
  RunOutcome,
  PredictionFeatures,
  RunOutcomePrediction,
  // PredictionModel, // TODO: Implement when predictor module is added
  ComplexityBucket,
} from './index.js';
import {
  RunPredictionErrorCodes,
  generatePredictionId,
  complexityToBucket,
} from './index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * TimeGPT client configuration
 */
export interface TimeGPTClientConfig {
  /** API key for TimeGPT */
  apiKey: string;
  /** Base URL (default: https://api.nixtla.io) */
  baseUrl: string;
  /** Model to use */
  model: 'timegpt-1' | 'timegpt-1-long-horizon';
  /** Maximum retries on failure */
  maxRetries: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

/**
 * TimeGPT forecast request (simplified for our use case)
 */
interface TimeGPTForecastRequest {
  /** Unique series identifier */
  unique_id: string;
  /** Historical data points */
  y: number[];
  /** Timestamps */
  ds: string[];
  /** Forecast horizon */
  h: number;
  /** Confidence levels for prediction intervals */
  level?: number[];
  /** Model to use */
  model?: string;
  /** Frequency of the data */
  freq?: string;
}

/**
 * TimeGPT forecast response
 */
interface TimeGPTForecastResponse {
  /** Forecasted values */
  forecast: number[];
  /** Lower confidence interval */
  lo_90?: number[];
  /** Upper confidence interval */
  hi_90?: number[];
  /** Prediction timestamps */
  ds: string[];
  /** Model used */
  model: string;
}

/**
 * TimeGPT client error
 */
export class TimeGPTClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'TimeGPTClientError';
  }
}

// =============================================================================
// TIMEGPT CLIENT
// =============================================================================

/**
 * TimeGPT client for run outcome prediction
 *
 * Uses Nixtla's TimeGPT API for time series forecasting of run metrics.
 * Falls back to baseline predictions if API is unavailable.
 */
export class TimeGPTClient {
  private config: TimeGPTClientConfig;
  private cache: Map<string, { result: RunOutcomePrediction; expiresAt: number }> =
    new Map();
  private cacheTtlMs: number = 300000; // 5 minutes

  constructor(config: TimeGPTClientConfig) {
    this.config = config;
  }

  /**
   * Check if TimeGPT is configured and available
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl);
  }

  /**
   * Set cache TTL
   */
  setCacheTtl(ttlMs: number): void {
    this.cacheTtlMs = ttlMs;
  }

  /**
   * Clear prediction cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Predict run outcome using TimeGPT
   *
   * Converts historical run data to time series format and uses TimeGPT
   * to forecast duration and success probability.
   */
  async predict(
    features: PredictionFeatures,
    historicalRuns: RunDataPoint[]
  ): Promise<RunOutcomePrediction> {
    // Check cache first
    const cacheKey = this.getCacheKey(features);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Filter runs by type and similar complexity
    const relevantRuns = this.filterRelevantRuns(features, historicalRuns);

    if (relevantRuns.length < 5) {
      // Not enough data for TimeGPT, fall back to baseline
      return this.baselinePrediction(features, relevantRuns);
    }

    try {
      // Use TimeGPT for duration prediction
      const durationPrediction = await this.predictDuration(relevantRuns, 1);

      // Use historical data for outcome prediction
      const outcomePrediction = this.predictOutcome(relevantRuns, features);

      const prediction: RunOutcomePrediction = {
        id: generatePredictionId(),
        features,
        predictedOutcome: outcomePrediction.predictedOutcome,
        outcomeProbabilities: outcomePrediction.probabilities,
        predictedDurationMs: Math.round(durationPrediction.forecast[0]),
        durationInterval: {
          lower: Math.round(durationPrediction.lo_90?.[0] ?? durationPrediction.forecast[0] * 0.7),
          upper: Math.round(durationPrediction.hi_90?.[0] ?? durationPrediction.forecast[0] * 1.5),
          confidenceLevel: 0.9,
        },
        confidence: this.calculateConfidence(relevantRuns.length, outcomePrediction.confidence),
        model: 'timegpt',
        risk: this.assessRisk(outcomePrediction, features),
        predictedAt: Date.now(),
        historicalDataCount: relevantRuns.length,
        featureImportance: this.calculateFeatureImportance(features, relevantRuns),
      };

      // Cache result
      this.cache.set(cacheKey, {
        result: prediction,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return prediction;
    } catch (error) {
      // Fall back to baseline on API error
      console.warn('TimeGPT prediction failed, falling back to baseline:', error);
      return this.baselinePrediction(features, relevantRuns);
    }
  }

  /**
   * Make a raw forecast request to TimeGPT API
   */
  private async predictDuration(
    runs: RunDataPoint[],
    horizon: number
  ): Promise<TimeGPTForecastResponse> {
    // Sort runs by timestamp
    const sortedRuns = [...runs].sort((a, b) => a.timestamp - b.timestamp);

    // Prepare request data
    const request: TimeGPTForecastRequest = {
      unique_id: 'run_duration',
      y: sortedRuns.map((r) => r.durationMs),
      ds: sortedRuns.map((r) => new Date(r.timestamp).toISOString()),
      h: horizon,
      level: [90],
      model: this.config.model,
      freq: 'H', // Hourly frequency as approximation
    };

    // Make API request
    const response = await this.makeRequest('/v2/forecast', request);
    return response as TimeGPTForecastResponse;
  }

  /**
   * Make HTTP request to TimeGPT API
   */
  private async makeRequest(
    endpoint: string,
    body: unknown,
    retries = 0
  ): Promise<unknown> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();

        if (response.status === 429 && retries < this.config.maxRetries) {
          // Rate limited, retry with backoff
          await this.delay(Math.pow(2, retries) * 1000);
          return this.makeRequest(endpoint, body, retries + 1);
        }

        throw new TimeGPTClientError(
          RunPredictionErrorCodes.PREDICTION_FAILED,
          `TimeGPT API error: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof TimeGPTClientError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new TimeGPTClientError(
          RunPredictionErrorCodes.TIMEOUT,
          'TimeGPT request timed out'
        );
      }

      throw new TimeGPTClientError(
        RunPredictionErrorCodes.PREDICTION_FAILED,
        `TimeGPT request failed: ${(error as Error).message}`
      );
    }
  }

  /**
   * Filter runs relevant to the prediction
   */
  private filterRelevantRuns(
    features: PredictionFeatures,
    runs: RunDataPoint[]
  ): RunDataPoint[] {
    const targetBucket = complexityToBucket(features.complexityScore);

    return runs.filter((run) => {
      // Must be same run type
      if (run.runType !== features.runType) return false;

      // Prefer same tenant if tenant-scoped
      if (features.tenantId && run.tenantId && run.tenantId !== features.tenantId) {
        return false;
      }

      // Prefer similar complexity (within 1 bucket)
      const runBucket = run.complexityBucket;
      if (this.bucketDistance(runBucket, targetBucket) > 1) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate bucket distance for similarity
   */
  private bucketDistance(a: ComplexityBucket, b: ComplexityBucket): number {
    const order: ComplexityBucket[] = ['low', 'medium', 'high', 'extreme'];
    return Math.abs(order.indexOf(a) - order.indexOf(b));
  }

  /**
   * Predict outcome based on historical data
   */
  private predictOutcome(
    runs: RunDataPoint[],
    features: PredictionFeatures
  ): {
    predictedOutcome: RunOutcome;
    probabilities: Record<RunOutcome, number>;
    confidence: number;
  } {
    // Count outcomes with weighting for recency and similarity
    const weights: Record<RunOutcome, number> = {
      success: 0,
      failure: 0,
      cancelled: 0,
      timeout: 0,
    };

    const now = Date.now();
    let totalWeight = 0;

    for (const run of runs) {
      // Recency weight: more recent runs get higher weight
      const ageMs = now - run.timestamp;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyWeight = Math.exp(-ageDays / 30); // Decay over 30 days

      // Complexity similarity weight
      const targetBucket = complexityToBucket(features.complexityScore);
      const bucketDist = this.bucketDistance(run.complexityBucket, targetBucket);
      const complexityWeight = 1 - bucketDist * 0.3;

      const weight = recencyWeight * complexityWeight;
      weights[run.outcome] += weight;
      totalWeight += weight;
    }

    // Normalize to probabilities
    const probabilities: Record<RunOutcome, number> = {
      success: totalWeight > 0 ? weights.success / totalWeight : 0.5,
      failure: totalWeight > 0 ? weights.failure / totalWeight : 0.25,
      cancelled: totalWeight > 0 ? weights.cancelled / totalWeight : 0.15,
      timeout: totalWeight > 0 ? weights.timeout / totalWeight : 0.1,
    };

    // Find most likely outcome
    const predictedOutcome = (Object.keys(probabilities) as RunOutcome[]).reduce(
      (a, b) => (probabilities[a] > probabilities[b] ? a : b)
    );

    // Confidence based on how dominant the predicted outcome is
    const maxProb = Math.max(...Object.values(probabilities));
    const confidence = Math.min(0.95, maxProb + runs.length * 0.01);

    return { predictedOutcome, probabilities, confidence };
  }

  /**
   * Baseline prediction without TimeGPT
   */
  private baselinePrediction(
    features: PredictionFeatures,
    runs: RunDataPoint[]
  ): RunOutcomePrediction {
    // Use simple statistics for duration
    let predictedDurationMs: number;
    let durationLower: number;
    let durationUpper: number;

    if (runs.length > 0) {
      const durations = runs.map((r) => r.durationMs).sort((a, b) => a - b);
      const median = durations[Math.floor(durations.length / 2)];
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
      predictedDurationMs = Math.round((median + mean) / 2);
      durationLower = durations[Math.floor(durations.length * 0.1)] ?? predictedDurationMs * 0.5;
      durationUpper = durations[Math.floor(durations.length * 0.9)] ?? predictedDurationMs * 2;
    } else {
      // Default estimates based on run type and complexity
      const baseEstimates: Record<string, number> = {
        triage: 30000,
        plan: 60000,
        resolve: 120000,
        review: 90000,
        autopilot: 300000,
        issue_to_code: 180000,
      };
      predictedDurationMs = baseEstimates[features.runType] ?? 60000;
      predictedDurationMs *= 1 + features.complexityScore * 0.2;
      durationLower = predictedDurationMs * 0.5;
      durationUpper = predictedDurationMs * 2;
    }

    const outcomePrediction = this.predictOutcome(runs, features);

    return {
      id: generatePredictionId(),
      features,
      predictedOutcome: runs.length > 0 ? outcomePrediction.predictedOutcome : 'success',
      outcomeProbabilities: runs.length > 0
        ? outcomePrediction.probabilities
        : { success: 0.7, failure: 0.2, cancelled: 0.05, timeout: 0.05 },
      predictedDurationMs: Math.round(predictedDurationMs),
      durationInterval: {
        lower: Math.round(durationLower),
        upper: Math.round(durationUpper),
        confidenceLevel: 0.8,
      },
      confidence: runs.length > 0 ? outcomePrediction.confidence * 0.8 : 0.4,
      model: 'baseline_weighted',
      risk: this.assessRisk(outcomePrediction, features),
      predictedAt: Date.now(),
      historicalDataCount: runs.length,
      featureImportance: this.calculateFeatureImportance(features, runs),
    };
  }

  /**
   * Assess risk level for the prediction
   */
  private assessRisk(
    outcomePrediction: { probabilities: Record<RunOutcome, number> },
    features: PredictionFeatures
  ): { level: 'low' | 'medium' | 'high' | 'critical'; factors: string[] } {
    const factors: string[] = [];
    let riskScore = 0;

    // Failure probability
    const failureProb = outcomePrediction.probabilities.failure +
      outcomePrediction.probabilities.timeout +
      outcomePrediction.probabilities.cancelled;
    if (failureProb > 0.5) {
      riskScore += 3;
      factors.push(`High failure probability: ${Math.round(failureProb * 100)}%`);
    } else if (failureProb > 0.3) {
      riskScore += 2;
      factors.push(`Moderate failure probability: ${Math.round(failureProb * 100)}%`);
    } else if (failureProb > 0.15) {
      riskScore += 1;
      factors.push(`Some failure risk: ${Math.round(failureProb * 100)}%`);
    }

    // Complexity
    if (features.complexityScore >= 8) {
      riskScore += 2;
      factors.push('Very high complexity');
    } else if (features.complexityScore >= 6) {
      riskScore += 1;
      factors.push('High complexity');
    }

    // Large changes
    if (features.filesChanged && features.filesChanged > 50) {
      riskScore += 2;
      factors.push(`Large scope: ${features.filesChanged} files`);
    } else if (features.filesChanged && features.filesChanged > 20) {
      riskScore += 1;
      factors.push(`Moderate scope: ${features.filesChanged} files`);
    }

    // Conflicts
    if (features.conflictCount && features.conflictCount > 10) {
      riskScore += 2;
      factors.push(`Many conflicts: ${features.conflictCount}`);
    } else if (features.conflictCount && features.conflictCount > 5) {
      riskScore += 1;
      factors.push(`Multiple conflicts: ${features.conflictCount}`);
    }

    // Determine level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 6) {
      level = 'critical';
    } else if (riskScore >= 4) {
      level = 'high';
    } else if (riskScore >= 2) {
      level = 'medium';
    } else {
      level = 'low';
    }

    if (factors.length === 0) {
      factors.push('No significant risk factors identified');
    }

    return { level, factors };
  }

  /**
   * Calculate feature importance for explainability
   */
  private calculateFeatureImportance(
    features: PredictionFeatures,
    runs: RunDataPoint[]
  ): Record<string, number> {
    // Simplified feature importance based on correlation with outcomes
    const importance: Record<string, number> = {};

    // Complexity is always important
    importance.complexityScore = 0.35;
    importance.runType = 0.25;

    // Optional features
    if (features.filesChanged !== undefined) {
      importance.filesChanged = 0.15;
    }
    if (features.conflictCount !== undefined) {
      importance.conflictCount = 0.15;
    }
    if (features.linesAffected !== undefined) {
      importance.linesAffected = 0.1;
    }

    // Historical data impact
    importance.historicalDataCount = Math.min(0.2, runs.length * 0.01);

    // Normalize
    const total = Object.values(importance).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(importance)) {
      importance[key] = importance[key] / total;
    }

    return importance;
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(dataCount: number, outcomeConfidence: number): number {
    // More data = higher confidence
    const dataConfidence = Math.min(0.95, 0.5 + dataCount * 0.01);
    return (dataConfidence + outcomeConfidence) / 2;
  }

  /**
   * Get cache key for prediction
   */
  private getCacheKey(features: PredictionFeatures): string {
    return [
      features.runType,
      features.complexityScore,
      features.filesChanged ?? 0,
      features.conflictCount ?? 0,
      features.tenantId ?? 'global',
    ].join(':');
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create TimeGPT client with configuration
 */
export function createTimeGPTClient(config: TimeGPTClientConfig): TimeGPTClient {
  return new TimeGPTClient(config);
}

/**
 * Create TimeGPT client from environment variables
 */
export function createTimeGPTClientFromEnv(): TimeGPTClient | null {
  const apiKey = process.env.NIXTLA_API_KEY || process.env.TIMEGPT_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new TimeGPTClient({
    apiKey,
    baseUrl: process.env.TIMEGPT_BASE_URL || 'https://api.nixtla.io',
    model: 'timegpt-1',
    maxRetries: 3,
    timeoutMs: 30000,
  });
}
