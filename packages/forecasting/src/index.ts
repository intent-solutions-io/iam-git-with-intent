/**
 * @gwi/forecasting
 *
 * Time series forecasting for Git With Intent using TimeGPT.
 * Provides run outcome prediction, historical data collection, and accuracy tracking.
 *
 * @example
 * ```typescript
 * import { createPredictionServiceFromEnv, createInMemoryAccuracyTracker } from '@gwi/forecasting';
 *
 * // Create prediction service
 * const predictionService = createPredictionServiceFromEnv(runStore, tenantStore);
 *
 * // Make a prediction
 * const result = await predictionService.predict({
 *   runType: 'resolve',
 *   complexity: 3,
 *   filesChanged: 5,
 * });
 *
 * console.log(`Predicted success: ${result.prediction.successProbability}`);
 * console.log(`Predicted duration: ${result.prediction.predictedDurationMs}ms`);
 * ```
 */

// Models and schemas
export {
  // Input schemas
  HistoricalRunDataSchema,
  TimeSeriesPointSchema,
  TimeSeriesDatasetSchema,
  // Prediction schemas
  RunOutcomePredictionSchema,
  BatchPredictionRequestSchema,
  TimeGPTForecastSchema,
  // Accuracy schemas
  AccuracyMetricTypeSchema,
  AccuracyMeasurementSchema,
  AggregatedAccuracyMetricsSchema,
  PredictionTrackingRecordSchema,
  // Configuration schemas
  TimeGPTConfigSchema,
  ForecastingConfigSchema,
  // Types
  type HistoricalRunData,
  type TimeSeriesPoint,
  type TimeSeriesDataset,
  type RunOutcomePrediction,
  type BatchPredictionRequest,
  type TimeGPTForecast,
  type AccuracyMetricType,
  type AccuracyMeasurement,
  type AggregatedAccuracyMetrics,
  type PredictionTrackingRecord,
  type TimeGPTConfig,
  type ForecastingConfig,
  // Helper functions
  toTimeSeriesDuration,
  toTimeSeriesSuccessRate,
  calculateRunStatistics,
  determineTrend,
} from './models/index.js';

// TimeGPT client
export {
  TimeGPTClient,
  TimeGPTError,
  TimeGPTRateLimitError,
  TimeGPTValidationError,
  TimeGPTAuthenticationError,
  TimeGPTInsufficientDataError,
  createTimeGPTClient,
  createTimeGPTClientFromEnv,
} from './timegpt-client.js';

// Data collectors
export {
  RunDataCollector,
  createRunDataCollector,
  mergeCollectionResults,
  filterByDateRange,
  groupByRunType,
  type CollectorOptions,
  type CollectionResult,
  type TimeSeriesExportResult,
} from './collectors/index.js';

// Prediction service
export {
  PredictionService,
  createPredictionService,
  createPredictionServiceFromEnv,
  type PredictionRequest,
  type PredictionResult,
  type PredictionServiceConfig,
} from './prediction-service.js';

// Accuracy tracking
export {
  AccuracyTracker,
  InMemoryPredictionTrackingStore,
  InMemoryAccuracyMetricsStore,
  createAccuracyTracker,
  createInMemoryAccuracyTracker,
  type ActualOutcome,
  type PredictionTrackingStore,
  type AccuracyMetricsStore,
} from './accuracy-tracker.js';
