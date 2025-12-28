/**
 * Run Outcome Prediction Model
 *
 * Zod schemas and types for run outcome prediction using TimeGPT.
 * Includes input data, predictions, and accuracy tracking.
 */

import { z } from 'zod';

// =============================================================================
// Input Schemas - Historical Run Data
// =============================================================================

/**
 * Historical run data point for time series analysis
 */
export const HistoricalRunDataSchema = z.object({
  /** Run ID for reference */
  runId: z.string(),
  /** Timestamp when run started */
  timestamp: z.date(),
  /** Run type (triage, plan, resolve, review, autopilot) */
  runType: z.enum(['triage', 'plan', 'resolve', 'review', 'autopilot']),
  /** Complexity score (1-5) */
  complexity: z.number().min(1).max(5),
  /** Files changed in the PR */
  filesChanged: z.number().min(0),
  /** Lines added */
  linesAdded: z.number().min(0),
  /** Lines deleted */
  linesDeleted: z.number().min(0),
  /** Whether the run succeeded */
  success: z.boolean(),
  /** Duration in milliseconds (null if run is still running) */
  durationMs: z.number().nullable(),
  /** Total tokens used */
  tokensUsed: z.number().min(0).optional(),
  /** Number of steps completed */
  stepsCompleted: z.number().min(0),
  /** Total steps in the run */
  totalSteps: z.number().min(0),
  /** Tenant ID for multi-tenant context */
  tenantId: z.string().optional(),
  /** Repository full name */
  repoFullName: z.string().optional(),
});

export type HistoricalRunData = z.infer<typeof HistoricalRunDataSchema>;

/**
 * Time series data point for TimeGPT
 */
export const TimeSeriesPointSchema = z.object({
  /** Timestamp in ISO format */
  timestamp: z.string(),
  /** Unique ID for the time series (e.g., "run_duration", "success_rate") */
  uniqueId: z.string(),
  /** The value to forecast */
  value: z.number(),
});

export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;

/**
 * Collection of time series data for forecasting
 */
export const TimeSeriesDatasetSchema = z.object({
  /** Series identifier */
  seriesId: z.string(),
  /** Description of what this series measures */
  description: z.string(),
  /** Data points sorted by timestamp */
  points: z.array(TimeSeriesPointSchema),
  /** Frequency of the data (e.g., "H" for hourly, "D" for daily) */
  frequency: z.string().default('H'),
  /** Minimum data points required for forecasting */
  minDataPoints: z.number().default(10),
});

export type TimeSeriesDataset = z.infer<typeof TimeSeriesDatasetSchema>;

// =============================================================================
// Prediction Schemas - Model Output
// =============================================================================

/**
 * Run outcome prediction
 */
export const RunOutcomePredictionSchema = z.object({
  /** Unique prediction ID */
  predictionId: z.string(),
  /** Run ID this prediction is for (may be null for pre-run predictions) */
  runId: z.string().nullable(),
  /** When the prediction was made */
  predictedAt: z.date(),
  /** Predicted success probability (0-1) */
  successProbability: z.number().min(0).max(1),
  /** Confidence in the prediction (0-1) */
  confidence: z.number().min(0).max(1),
  /** Predicted duration in milliseconds */
  predictedDurationMs: z.number().min(0),
  /** Duration prediction confidence interval (lower bound) */
  durationLowerBound: z.number().min(0),
  /** Duration prediction confidence interval (upper bound) */
  durationUpperBound: z.number().min(0),
  /** Predicted token usage */
  predictedTokens: z.number().min(0).optional(),
  /** Model features used for prediction */
  features: z.object({
    complexity: z.number().min(1).max(5),
    filesChanged: z.number().min(0),
    runType: z.string(),
    historicalSuccessRate: z.number().min(0).max(1),
    avgHistoricalDuration: z.number().min(0),
    recentTrend: z.enum(['improving', 'stable', 'degrading']),
  }),
  /** Model version used */
  modelVersion: z.string(),
  /** TimeGPT model configuration */
  modelConfig: z.object({
    horizon: z.number().default(1),
    level: z.array(z.number()).default([80, 90]),
    finetuneLoss: z.string().optional(),
  }).optional(),
});

export type RunOutcomePrediction = z.infer<typeof RunOutcomePredictionSchema>;

/**
 * Batch prediction request
 */
export const BatchPredictionRequestSchema = z.object({
  /** Historical runs to base prediction on */
  historicalRuns: z.array(HistoricalRunDataSchema).min(1),
  /** Number of future runs to predict */
  horizon: z.number().min(1).max(100).default(1),
  /** Confidence levels for prediction intervals */
  confidenceLevels: z.array(z.number().min(0).max(100)).default([80, 90]),
  /** Context for the prediction (new run parameters) */
  context: z.object({
    runType: z.enum(['triage', 'plan', 'resolve', 'review', 'autopilot']),
    complexity: z.number().min(1).max(5),
    filesChanged: z.number().min(0),
    linesAdded: z.number().min(0).optional(),
    linesDeleted: z.number().min(0).optional(),
  }).optional(),
});

export type BatchPredictionRequest = z.infer<typeof BatchPredictionRequestSchema>;

/**
 * TimeGPT forecast response
 */
export const TimeGPTForecastSchema = z.object({
  /** Forecasted values */
  forecast: z.array(z.object({
    timestamp: z.string(),
    value: z.number(),
    lo80: z.number().optional(),
    hi80: z.number().optional(),
    lo90: z.number().optional(),
    hi90: z.number().optional(),
  })),
  /** Unique ID of the series */
  uniqueId: z.string(),
});

export type TimeGPTForecast = z.infer<typeof TimeGPTForecastSchema>;

// =============================================================================
// Accuracy Tracking Schemas
// =============================================================================

/**
 * Accuracy metric types
 */
export const AccuracyMetricTypeSchema = z.enum([
  'mae',      // Mean Absolute Error
  'rmse',     // Root Mean Square Error
  'mape',     // Mean Absolute Percentage Error
  'smape',    // Symmetric Mean Absolute Percentage Error
  'accuracy', // Binary accuracy for success/failure
  'precision',
  'recall',
  'f1',
]);

export type AccuracyMetricType = z.infer<typeof AccuracyMetricTypeSchema>;

/**
 * Single accuracy measurement
 */
export const AccuracyMeasurementSchema = z.object({
  /** Prediction ID */
  predictionId: z.string(),
  /** Run ID */
  runId: z.string(),
  /** Metric type */
  metricType: AccuracyMetricTypeSchema,
  /** Predicted value */
  predicted: z.number(),
  /** Actual value */
  actual: z.number(),
  /** Error (actual - predicted) */
  error: z.number(),
  /** Absolute error */
  absoluteError: z.number(),
  /** Percentage error (if applicable) */
  percentageError: z.number().nullable(),
  /** When the measurement was recorded */
  recordedAt: z.date(),
});

export type AccuracyMeasurement = z.infer<typeof AccuracyMeasurementSchema>;

/**
 * Aggregated accuracy metrics
 */
export const AggregatedAccuracyMetricsSchema = z.object({
  /** Time period start */
  periodStart: z.date(),
  /** Time period end */
  periodEnd: z.date(),
  /** Number of predictions in the period */
  predictionCount: z.number().min(0),
  /** Duration prediction metrics */
  durationMetrics: z.object({
    mae: z.number(),
    rmse: z.number(),
    mape: z.number().nullable(),
    smape: z.number().nullable(),
  }),
  /** Success prediction metrics */
  successMetrics: z.object({
    accuracy: z.number().min(0).max(1),
    precision: z.number().min(0).max(1),
    recall: z.number().min(0).max(1),
    f1: z.number().min(0).max(1),
    truePositives: z.number().min(0),
    trueNegatives: z.number().min(0),
    falsePositives: z.number().min(0),
    falseNegatives: z.number().min(0),
  }),
  /** Token usage prediction metrics */
  tokenMetrics: z.object({
    mae: z.number(),
    rmse: z.number(),
    mape: z.number().nullable(),
  }).optional(),
  /** Model version */
  modelVersion: z.string(),
  /** Tenant ID (if applicable) */
  tenantId: z.string().optional(),
  /** Run type filter (if applicable) */
  runType: z.string().optional(),
});

export type AggregatedAccuracyMetrics = z.infer<typeof AggregatedAccuracyMetricsSchema>;

/**
 * Prediction tracking record (stored with each prediction for later accuracy calculation)
 */
export const PredictionTrackingRecordSchema = z.object({
  /** Prediction ID */
  predictionId: z.string(),
  /** Run ID */
  runId: z.string(),
  /** Tenant ID */
  tenantId: z.string().optional(),
  /** When prediction was made */
  predictedAt: z.date(),
  /** Predicted success */
  predictedSuccess: z.boolean(),
  /** Predicted duration */
  predictedDurationMs: z.number(),
  /** Predicted tokens */
  predictedTokens: z.number().optional(),
  /** Actual success (null until run completes) */
  actualSuccess: z.boolean().nullable(),
  /** Actual duration (null until run completes) */
  actualDurationMs: z.number().nullable(),
  /** Actual tokens (null until run completes) */
  actualTokens: z.number().nullable(),
  /** When actual values were recorded */
  actualRecordedAt: z.date().nullable(),
  /** Model version */
  modelVersion: z.string(),
  /** Run type */
  runType: z.string(),
  /** Complexity */
  complexity: z.number(),
});

export type PredictionTrackingRecord = z.infer<typeof PredictionTrackingRecordSchema>;

// =============================================================================
// Configuration Schemas
// =============================================================================

/**
 * TimeGPT configuration
 */
export const TimeGPTConfigSchema = z.object({
  /** API endpoint */
  apiEndpoint: z.string().url().default('https://api.nixtla.io'),
  /** API token (from environment). Empty string means not configured. */
  apiToken: z.string(),
  /** Default forecast horizon */
  defaultHorizon: z.number().min(1).default(1),
  /** Default confidence levels */
  defaultLevels: z.array(z.number().min(0).max(100)).default([80, 90]),
  /** Request timeout in milliseconds */
  timeoutMs: z.number().min(1000).default(30000),
  /** Maximum retries */
  maxRetries: z.number().min(0).max(5).default(3),
  /** Model to use (timegpt-1 or timegpt-1-long-horizon) */
  model: z.enum(['timegpt-1', 'timegpt-1-long-horizon']).default('timegpt-1'),
  /** Fine-tune parameters */
  finetune: z.object({
    enabled: z.boolean().default(false),
    loss: z.enum(['default', 'mae', 'mse', 'rmse', 'mape', 'smape']).default('default'),
    steps: z.number().min(1).max(500).default(50),
  }).optional(),
});

export type TimeGPTConfig = z.infer<typeof TimeGPTConfigSchema>;

/**
 * Forecasting service configuration
 */
export const ForecastingConfigSchema = z.object({
  /** TimeGPT configuration */
  timeGPT: TimeGPTConfigSchema,
  /** Minimum historical data points required */
  minHistoricalRuns: z.number().min(1).default(10),
  /** Maximum historical data points to use */
  maxHistoricalRuns: z.number().min(10).default(1000),
  /** Data collection lookback days */
  lookbackDays: z.number().min(1).default(90),
  /** Enable caching */
  enableCache: z.boolean().default(true),
  /** Cache TTL in seconds */
  cacheTtlSeconds: z.number().min(60).default(3600),
  /** Enable prediction on run creation */
  enableAutoPredict: z.boolean().default(true),
  /** Enable accuracy tracking */
  enableAccuracyTracking: z.boolean().default(true),
});

export type ForecastingConfig = z.infer<typeof ForecastingConfigSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert historical runs to time series format for duration prediction
 */
export function toTimeSeriesDuration(runs: HistoricalRunData[]): TimeSeriesDataset {
  const points: TimeSeriesPoint[] = runs
    .filter(r => r.durationMs !== null)
    .map(r => ({
      timestamp: r.timestamp.toISOString(),
      uniqueId: 'run_duration',
      value: r.durationMs!,
    }));

  return {
    seriesId: 'run_duration',
    description: 'Run duration in milliseconds',
    points,
    frequency: 'H',
    minDataPoints: 10,
  };
}

/**
 * Convert historical runs to time series format for success rate prediction
 */
export function toTimeSeriesSuccessRate(
  runs: HistoricalRunData[],
  windowSize: number = 10
): TimeSeriesDataset {
  // Calculate rolling success rate
  const points: TimeSeriesPoint[] = [];

  for (let i = windowSize - 1; i < runs.length; i++) {
    const window = runs.slice(i - windowSize + 1, i + 1);
    const successCount = window.filter(r => r.success).length;
    const successRate = successCount / windowSize;

    points.push({
      timestamp: runs[i].timestamp.toISOString(),
      uniqueId: 'success_rate',
      value: successRate,
    });
  }

  return {
    seriesId: 'success_rate',
    description: 'Rolling success rate',
    points,
    frequency: 'H',
    minDataPoints: windowSize,
  };
}

/**
 * Calculate basic statistics from historical runs
 */
export function calculateRunStatistics(runs: HistoricalRunData[]): {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  avgComplexity: number;
  avgFilesChanged: number;
  avgTokensUsed: number;
} {
  const completedRuns = runs.filter(r => r.durationMs !== null);
  const durations = completedRuns.map(r => r.durationMs!).sort((a, b) => a - b);
  const successCount = runs.filter(r => r.success).length;
  const tokensUsed = runs.filter(r => r.tokensUsed !== undefined).map(r => r.tokensUsed!);

  return {
    totalRuns: runs.length,
    successRate: runs.length > 0 ? successCount / runs.length : 0,
    avgDurationMs: durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0,
    medianDurationMs: durations.length > 0
      ? durations[Math.floor(durations.length / 2)]
      : 0,
    p95DurationMs: durations.length > 0
      ? durations[Math.floor(durations.length * 0.95)]
      : 0,
    avgComplexity: runs.length > 0
      ? runs.reduce((a, r) => a + r.complexity, 0) / runs.length
      : 0,
    avgFilesChanged: runs.length > 0
      ? runs.reduce((a, r) => a + r.filesChanged, 0) / runs.length
      : 0,
    avgTokensUsed: tokensUsed.length > 0
      ? tokensUsed.reduce((a, b) => a + b, 0) / tokensUsed.length
      : 0,
  };
}

/**
 * Determine trend direction from recent data
 */
export function determineTrend(
  values: number[],
  windowSize: number = 5
): 'improving' | 'stable' | 'degrading' {
  if (values.length < windowSize * 2) {
    return 'stable';
  }

  const recentWindow = values.slice(-windowSize);
  const previousWindow = values.slice(-windowSize * 2, -windowSize);

  const recentAvg = recentWindow.reduce((a, b) => a + b, 0) / windowSize;
  const previousAvg = previousWindow.reduce((a, b) => a + b, 0) / windowSize;

  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

  // For success rate: higher is better
  // For duration: lower is better (but we handle this in the caller)
  if (changePercent > 10) {
    return 'improving';
  } else if (changePercent < -10) {
    return 'degrading';
  }
  return 'stable';
}
