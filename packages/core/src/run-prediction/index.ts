/**
 * Epic I1: Run Outcome Prediction
 *
 * AI-powered run outcome forecasting using TimeGPT for time series prediction.
 * Predicts run success probability, estimated duration, and confidence intervals.
 *
 * Features:
 * - Historical run data collection from RunStore
 * - TimeGPT integration for advanced predictions
 * - Fallback to baseline statistical models
 * - Accuracy tracking and metrics
 * - Integration with run creation workflow
 *
 * @module @gwi/core/run-prediction
 */

import { z } from 'zod';

// =============================================================================
// VERSION AND ERROR CODES
// =============================================================================

export const RUN_PREDICTION_VERSION = '1.0.0';

export const RunPredictionErrorCodes = {
  // Config errors (1xxx)
  INVALID_CONFIG: 'RP_1001',
  MISSING_API_KEY: 'RP_1002',
  INVALID_HORIZON: 'RP_1003',
  INVALID_MODEL: 'RP_1004',

  // Data errors (2xxx)
  INSUFFICIENT_HISTORY: 'RP_2001',
  NO_HISTORICAL_RUNS: 'RP_2002',
  INVALID_RUN_DATA: 'RP_2003',
  DATA_GAP: 'RP_2004',

  // Prediction errors (3xxx)
  PREDICTION_FAILED: 'RP_3001',
  MODEL_UNAVAILABLE: 'RP_3002',
  TIMEOUT: 'RP_3003',
  RATE_LIMITED: 'RP_3004',

  // Accuracy tracking errors (4xxx)
  TRACKING_FAILED: 'RP_4001',
  METRICS_UNAVAILABLE: 'RP_4002',
  INVALID_OUTCOME: 'RP_4003',
  STALE_PREDICTION: 'RP_4004',

  // Storage errors (5xxx)
  STORE_UNAVAILABLE: 'RP_5001',
  QUERY_FAILED: 'RP_5002',
  WRITE_FAILED: 'RP_5003',
} as const;

export type RunPredictionErrorCode =
  (typeof RunPredictionErrorCodes)[keyof typeof RunPredictionErrorCodes];

// =============================================================================
// RUN OUTCOME MODEL
// =============================================================================

/**
 * Run outcome categories for classification
 */
export type RunOutcome = 'success' | 'failure' | 'cancelled' | 'timeout';

/**
 * Complexity level buckets for stratification
 */
export type ComplexityBucket = 'low' | 'medium' | 'high' | 'extreme';

/**
 * Run type for prediction stratification
 */
export type PredictionRunType =
  | 'triage'
  | 'plan'
  | 'resolve'
  | 'review'
  | 'autopilot'
  | 'issue_to_code';

/**
 * Historical run data point for time series
 */
export interface RunDataPoint {
  /** Run ID */
  runId: string;
  /** Timestamp when run started */
  timestamp: number;
  /** Run type */
  runType: PredictionRunType;
  /** Complexity score (1-10) */
  complexityScore: number;
  /** Complexity bucket */
  complexityBucket: ComplexityBucket;
  /** Duration in milliseconds */
  durationMs: number;
  /** Final outcome */
  outcome: RunOutcome;
  /** Number of files changed */
  filesChanged?: number;
  /** Lines of code affected */
  linesAffected?: number;
  /** Number of conflicts (for resolve runs) */
  conflictCount?: number;
  /** Number of steps in the run */
  stepCount?: number;
  /** Token usage */
  tokensUsed?: number;
  /** Repository context */
  repoContext?: {
    owner: string;
    repo: string;
    language?: string;
  };
  /** Tenant ID */
  tenantId?: string;
}

/**
 * Prediction input features
 */
export interface PredictionFeatures {
  /** Run type */
  runType: PredictionRunType;
  /** Complexity score (1-10) */
  complexityScore: number;
  /** Number of files involved */
  filesChanged?: number;
  /** Lines of code affected */
  linesAffected?: number;
  /** Number of conflicts */
  conflictCount?: number;
  /** Repository language */
  language?: string;
  /** Time of day (hour 0-23) */
  hourOfDay?: number;
  /** Day of week (0-6, 0=Sunday) */
  dayOfWeek?: number;
  /** Tenant ID for tenant-specific predictions */
  tenantId?: string;
  /** Repository full name */
  repoFullName?: string;
}

/**
 * Predicted run outcome with confidence intervals
 */
export interface RunOutcomePrediction {
  /** Prediction ID */
  id: string;
  /** Input features used */
  features: PredictionFeatures;
  /** Predicted outcome (most likely) */
  predictedOutcome: RunOutcome;
  /** Outcome probabilities */
  outcomeProbabilities: Record<RunOutcome, number>;
  /** Predicted duration in milliseconds */
  predictedDurationMs: number;
  /** Duration confidence interval */
  durationInterval: {
    lower: number;
    upper: number;
    confidenceLevel: number;
  };
  /** Overall prediction confidence (0-1) */
  confidence: number;
  /** Model used for prediction */
  model: PredictionModel;
  /** Risk assessment */
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  };
  /** Timestamp of prediction */
  predictedAt: number;
  /** Historical data count used */
  historicalDataCount: number;
  /** Feature importance (for explainability) */
  featureImportance?: Record<string, number>;
}

/**
 * Model types for prediction
 */
export type PredictionModel =
  | 'timegpt'
  | 'baseline_naive'
  | 'baseline_weighted'
  | 'ensemble';

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const RunOutcomeSchema = z.enum([
  'success',
  'failure',
  'cancelled',
  'timeout',
]);

export const ComplexityBucketSchema = z.enum([
  'low',
  'medium',
  'high',
  'extreme',
]);

export const PredictionRunTypeSchema = z.enum([
  'triage',
  'plan',
  'resolve',
  'review',
  'autopilot',
  'issue_to_code',
]);

export const PredictionModelSchema = z.enum([
  'timegpt',
  'baseline_naive',
  'baseline_weighted',
  'ensemble',
]);

export const RunDataPointSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.number().int().positive(),
  runType: PredictionRunTypeSchema,
  complexityScore: z.number().min(1).max(10),
  complexityBucket: ComplexityBucketSchema,
  durationMs: z.number().int().min(0),
  outcome: RunOutcomeSchema,
  filesChanged: z.number().int().min(0).optional(),
  linesAffected: z.number().int().min(0).optional(),
  conflictCount: z.number().int().min(0).optional(),
  stepCount: z.number().int().min(0).optional(),
  tokensUsed: z.number().int().min(0).optional(),
  repoContext: z
    .object({
      owner: z.string(),
      repo: z.string(),
      language: z.string().optional(),
    })
    .optional(),
  tenantId: z.string().optional(),
});

export const PredictionFeaturesSchema = z.object({
  runType: PredictionRunTypeSchema,
  complexityScore: z.number().min(1).max(10),
  filesChanged: z.number().int().min(0).optional(),
  linesAffected: z.number().int().min(0).optional(),
  conflictCount: z.number().int().min(0).optional(),
  language: z.string().optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  tenantId: z.string().optional(),
  repoFullName: z.string().optional(),
});

export const RunOutcomePredictionSchema = z.object({
  id: z.string().min(1),
  features: PredictionFeaturesSchema,
  predictedOutcome: RunOutcomeSchema,
  outcomeProbabilities: z.record(RunOutcomeSchema, z.number().min(0).max(1)),
  predictedDurationMs: z.number().int().min(0),
  durationInterval: z.object({
    lower: z.number().int().min(0),
    upper: z.number().int().min(0),
    confidenceLevel: z.number().min(0).max(1),
  }),
  confidence: z.number().min(0).max(1),
  model: PredictionModelSchema,
  risk: z.object({
    level: z.enum(['low', 'medium', 'high', 'critical']),
    factors: z.array(z.string()),
  }),
  predictedAt: z.number().int().positive(),
  historicalDataCount: z.number().int().min(0),
  featureImportance: z.record(z.string(), z.number()).optional(),
});

// =============================================================================
// ACCURACY TRACKING
// =============================================================================

/**
 * Accuracy metrics for prediction quality
 */
export interface PredictionAccuracyMetrics {
  /** Total predictions made */
  totalPredictions: number;
  /** Predictions with actual outcomes recorded */
  completedPredictions: number;
  /** Outcome accuracy (correct outcome / total) */
  outcomeAccuracy: number;
  /** Mean Absolute Error for duration */
  durationMAE: number;
  /** Root Mean Squared Error for duration */
  durationRMSE: number;
  /** Mean Absolute Percentage Error for duration */
  durationMAPE: number;
  /** Accuracy by run type */
  accuracyByRunType: Record<PredictionRunType, number>;
  /** Accuracy by complexity bucket */
  accuracyByComplexity: Record<ComplexityBucket, number>;
  /** Confidence calibration (how well confidence matches accuracy) */
  confidenceCalibration: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Time period covered (days) */
  periodDays: number;
}

/**
 * Individual prediction accuracy record
 */
export interface PredictionAccuracyRecord {
  /** Prediction ID */
  predictionId: string;
  /** Run ID (once run completes) */
  runId?: string;
  /** Original prediction */
  prediction: RunOutcomePrediction;
  /** Actual outcome (when run completes) */
  actualOutcome?: RunOutcome;
  /** Actual duration (when run completes) */
  actualDurationMs?: number;
  /** Whether prediction was correct */
  outcomeCorrect?: boolean;
  /** Duration prediction error (ms) */
  durationError?: number;
  /** Recorded at timestamp */
  recordedAt: number;
  /** Completed at timestamp (when outcome recorded) */
  completedAt?: number;
}

export const PredictionAccuracyMetricsSchema = z.object({
  totalPredictions: z.number().int().min(0),
  completedPredictions: z.number().int().min(0),
  outcomeAccuracy: z.number().min(0).max(1),
  durationMAE: z.number().min(0),
  durationRMSE: z.number().min(0),
  durationMAPE: z.number().min(0),
  accuracyByRunType: z.record(PredictionRunTypeSchema, z.number().min(0).max(1)),
  accuracyByComplexity: z.record(ComplexityBucketSchema, z.number().min(0).max(1)),
  confidenceCalibration: z.number().min(0).max(1),
  updatedAt: z.number().int().positive(),
  periodDays: z.number().int().positive(),
});

export const PredictionAccuracyRecordSchema = z.object({
  predictionId: z.string().min(1),
  runId: z.string().optional(),
  prediction: RunOutcomePredictionSchema,
  actualOutcome: RunOutcomeSchema.optional(),
  actualDurationMs: z.number().int().min(0).optional(),
  outcomeCorrect: z.boolean().optional(),
  durationError: z.number().optional(),
  recordedAt: z.number().int().positive(),
  completedAt: z.number().int().positive().optional(),
});

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Run prediction service configuration
 */
export interface RunPredictionConfig {
  /** Minimum historical runs required for prediction */
  minHistoricalRuns: number;
  /** Maximum historical runs to use */
  maxHistoricalRuns: number;
  /** Default prediction model */
  defaultModel: PredictionModel;
  /** TimeGPT configuration (if using TimeGPT) */
  timeGPT?: {
    apiKey: string;
    baseUrl: string;
    model: 'timegpt-1' | 'timegpt-1-long-horizon';
    maxRetries: number;
  };
  /** Confidence threshold for using predictions */
  minConfidenceThreshold: number;
  /** Enable accuracy tracking */
  enableAccuracyTracking: boolean;
  /** Cache predictions for this duration (ms) */
  predictionCacheTtlMs: number;
  /** Tenant-scoped predictions */
  tenantScoped: boolean;
}

export const RunPredictionConfigSchema = z.object({
  minHistoricalRuns: z.number().int().min(1).max(1000),
  maxHistoricalRuns: z.number().int().min(10).max(10000),
  defaultModel: PredictionModelSchema,
  timeGPT: z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.string().url(),
      model: z.enum(['timegpt-1', 'timegpt-1-long-horizon']),
      maxRetries: z.number().int().min(0).max(10),
    })
    .optional(),
  minConfidenceThreshold: z.number().min(0).max(1),
  enableAccuracyTracking: z.boolean(),
  predictionCacheTtlMs: z.number().int().min(0),
  tenantScoped: z.boolean(),
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create default run prediction configuration
 */
export function createRunPredictionConfig(
  overrides?: Partial<RunPredictionConfig>
): RunPredictionConfig {
  return {
    minHistoricalRuns: 10,
    maxHistoricalRuns: 1000,
    defaultModel: 'baseline_weighted',
    minConfidenceThreshold: 0.5,
    enableAccuracyTracking: true,
    predictionCacheTtlMs: 300000, // 5 minutes
    tenantScoped: true,
    ...overrides,
  };
}

/**
 * Convert complexity score to bucket
 */
export function complexityToBucket(score: number): ComplexityBucket {
  if (score <= 3) return 'low';
  if (score <= 5) return 'medium';
  if (score <= 7) return 'high';
  return 'extreme';
}

/**
 * Generate prediction ID
 */
export function generatePredictionId(): string {
  return `pred_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateRunDataPoint(
  data: unknown
): { success: boolean; data?: RunDataPoint; errors?: string[] } {
  const result = RunDataPointSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validatePredictionFeatures(
  features: unknown
): { success: boolean; data?: PredictionFeatures; errors?: string[] } {
  const result = PredictionFeaturesSchema.safeParse(features);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateRunPredictionConfig(
  config: unknown
): { success: boolean; data?: RunPredictionConfig; errors?: string[] } {
  const result = RunPredictionConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// RE-EXPORTS FROM SUB-MODULES
// =============================================================================

// TODO: Implement predictor and accuracy-tracker modules
// export * from './predictor.js';
export * from './collectors/run-data-collector.js';
export * from './timegpt-client.js';
// export * from './accuracy-tracker.js';
