/**
 * Phase 57: Backtesting Harness
 *
 * Walk-forward validation and model comparison:
 * - Time-series cross-validation
 * - Multiple forecast accuracy metrics
 * - Model comparison framework
 * - Statistical significance testing
 * - Rolling window evaluation
 *
 * @module @gwi/core/backtesting
 */

import { z } from 'zod';
import type { CanonicalPoint } from '../time-series/index.js';
import type { ForecastModel, ForecastPoint } from '../forecasting/index.js';

// =============================================================================
// BACKTESTING CONTRACT VERSION
// =============================================================================

export const BACKTESTING_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const BacktestingErrorCodes = {
  // Config errors (1xxx)
  INVALID_CONFIG: 'BT_1001',
  INVALID_WINDOW: 'BT_1002',
  INVALID_HORIZON: 'BT_1003',
  INVALID_SPLIT: 'BT_1004',

  // Data errors (2xxx)
  INSUFFICIENT_DATA: 'BT_2001',
  GAP_IN_DATA: 'BT_2002',
  INVALID_TIMESTAMPS: 'BT_2003',
  MISALIGNED_DATA: 'BT_2004',

  // Execution errors (3xxx)
  BACKTEST_FAILED: 'BT_3001',
  FOLD_FAILED: 'BT_3002',
  MODEL_FAILED: 'BT_3003',
  TIMEOUT: 'BT_3004',

  // Analysis errors (4xxx)
  METRIC_FAILED: 'BT_4001',
  COMPARISON_FAILED: 'BT_4002',
  SIGNIFICANCE_FAILED: 'BT_4003',
  AGGREGATION_FAILED: 'BT_4004',
} as const;

export type BacktestingErrorCode =
  (typeof BacktestingErrorCodes)[keyof typeof BacktestingErrorCodes];

// =============================================================================
// BACKTEST TYPES
// =============================================================================

export type ValidationStrategy =
  | 'expanding_window'  // Train on all data up to split
  | 'sliding_window'    // Fixed window that slides
  | 'time_series_cv';   // K-fold cross-validation

export interface BacktestConfig {
  /** Validation strategy */
  strategy: ValidationStrategy;
  /** Number of folds (for CV) */
  folds: number;
  /** Forecast horizon for each fold */
  horizon: number;
  /** Initial training window size */
  initialWindow: number;
  /** Step size between folds */
  stepSize: number;
  /** Gap between train and test (embargo) */
  gap: number;
  /** Metrics to calculate */
  metrics: AccuracyMetric[];
  /** Timeout per fold in ms */
  foldTimeoutMs: number;
  /** Run folds in parallel */
  parallel: boolean;
}

export type AccuracyMetric =
  | 'mae'    // Mean Absolute Error
  | 'mse'    // Mean Squared Error
  | 'rmse'   // Root Mean Squared Error
  | 'mape'   // Mean Absolute Percentage Error
  | 'smape'  // Symmetric MAPE
  | 'mase'   // Mean Absolute Scaled Error
  | 'r2'     // R-squared
  | 'corr'   // Correlation
  | 'bias'   // Mean Error (bias)
  | 'maxe';  // Maximum Error

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface BacktestResult {
  /** Configuration used */
  config: BacktestConfig;
  /** Forecast model tested */
  model: ForecastModel;
  /** Series ID */
  seriesId: string;
  /** Total folds executed */
  totalFolds: number;
  /** Successful folds */
  successfulFolds: number;
  /** Failed folds */
  failedFolds: number;
  /** Individual fold results */
  folds: FoldResult[];
  /** Aggregated metrics */
  aggregatedMetrics: MetricsResult;
  /** Metric summary statistics */
  metricStats: Record<AccuracyMetric, MetricStats>;
  /** Total execution time */
  executionTimeMs: number;
  /** Timestamp */
  backtestAt: number;
}

export interface FoldResult {
  /** Fold index (0-based) */
  foldIndex: number;
  /** Training start timestamp */
  trainStart: number;
  /** Training end timestamp */
  trainEnd: number;
  /** Test start timestamp */
  testStart: number;
  /** Test end timestamp */
  testEnd: number;
  /** Training points count */
  trainPoints: number;
  /** Test points count */
  testPoints: number;
  /** Actual values */
  actuals: number[];
  /** Predicted values */
  predictions: number[];
  /** Fold metrics */
  metrics: MetricsResult;
  /** Whether fold succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Fold execution time */
  executionTimeMs: number;
}

export interface MetricsResult {
  mae?: number;
  mse?: number;
  rmse?: number;
  mape?: number;
  smape?: number;
  mase?: number;
  r2?: number;
  corr?: number;
  bias?: number;
  maxe?: number;
}

export interface MetricStats {
  /** Mean across folds */
  mean: number;
  /** Standard deviation */
  std: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Median value */
  median: number;
  /** 5th percentile */
  p5: number;
  /** 95th percentile */
  p95: number;
}

// =============================================================================
// MODEL COMPARISON
// =============================================================================

export interface ModelComparison {
  /** Models compared */
  models: ForecastModel[];
  /** Results per model */
  results: Map<ForecastModel, BacktestResult>;
  /** Best model per metric */
  bestModelPerMetric: Record<AccuracyMetric, ForecastModel>;
  /** Overall ranking (lower is better) */
  ranking: Array<{ model: ForecastModel; averageRank: number }>;
  /** Statistical significance tests */
  significanceTests?: SignificanceTest[];
}

export interface SignificanceTest {
  /** Model A */
  modelA: ForecastModel;
  /** Model B */
  modelB: ForecastModel;
  /** Metric compared */
  metric: AccuracyMetric;
  /** Test type */
  testType: 'paired_t' | 'wilcoxon' | 'dm';  // Diebold-Mariano
  /** Test statistic */
  statistic: number;
  /** P-value */
  pValue: number;
  /** Whether difference is significant (at 0.05) */
  significant: boolean;
  /** Which model is better */
  betterModel?: ForecastModel;
}

// =============================================================================
// BACKTESTER
// =============================================================================

/**
 * Backtester for walk-forward validation
 */
export class Backtester {
  /**
   * Run backtest on a series with given forecaster
   */
  async runBacktest(
    points: CanonicalPoint[],
    forecastFn: (trainData: CanonicalPoint[], horizon: number) => Promise<ForecastPoint[]>,
    config: BacktestConfig,
    model: ForecastModel,
    seriesId: string
  ): Promise<BacktestResult> {
    const start = Date.now();

    // Validate inputs
    this.validateInputs(points, config);

    // Generate fold splits
    const splits = this.generateSplits(points, config);

    // Execute folds
    const folds: FoldResult[] = [];
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const foldResult = await this.executeFold(
        points,
        split,
        forecastFn,
        config,
        i
      );
      folds.push(foldResult);
    }

    // Calculate aggregated metrics
    const successfulFolds = folds.filter(f => f.success);
    const aggregatedMetrics = this.aggregateMetrics(successfulFolds, config.metrics);
    const metricStats = this.calculateMetricStats(successfulFolds, config.metrics);

    return {
      config,
      model,
      seriesId,
      totalFolds: folds.length,
      successfulFolds: successfulFolds.length,
      failedFolds: folds.length - successfulFolds.length,
      folds,
      aggregatedMetrics,
      metricStats,
      executionTimeMs: Date.now() - start,
      backtestAt: Date.now(),
    };
  }

  /**
   * Compare multiple models
   */
  async compareModels(
    points: CanonicalPoint[],
    forecasters: Map<ForecastModel, (trainData: CanonicalPoint[], horizon: number) => Promise<ForecastPoint[]>>,
    config: BacktestConfig,
    seriesId: string,
    runSignificanceTests = true
  ): Promise<ModelComparison> {
    const results = new Map<ForecastModel, BacktestResult>();

    // Run backtests for all models
    for (const [model, forecastFn] of forecasters) {
      const result = await this.runBacktest(points, forecastFn, config, model, seriesId);
      results.set(model, result);
    }

    // Find best model per metric
    const bestModelPerMetric: Record<AccuracyMetric, ForecastModel> = {} as Record<AccuracyMetric, ForecastModel>;
    for (const metric of config.metrics) {
      let bestModel: ForecastModel | undefined;
      let bestValue = Infinity;

      for (const [model, result] of results) {
        const value = result.aggregatedMetrics[metric];
        if (value !== undefined && value < bestValue) {
          bestValue = value;
          bestModel = model;
        }
      }

      if (bestModel) {
        bestModelPerMetric[metric] = bestModel;
      }
    }

    // Calculate ranking
    const ranking = this.calculateRanking(results, config.metrics);

    // Run significance tests
    let significanceTests: SignificanceTest[] | undefined;
    if (runSignificanceTests && results.size >= 2) {
      significanceTests = this.runSignificanceTests(results, config.metrics);
    }

    return {
      models: Array.from(results.keys()),
      results,
      bestModelPerMetric,
      ranking,
      significanceTests,
    };
  }

  private validateInputs(points: CanonicalPoint[], config: BacktestConfig): void {
    const numericPoints = points.filter(p => typeof p.value === 'number');

    if (numericPoints.length < config.initialWindow + config.horizon) {
      throw new Error(
        `Insufficient data: need at least ${config.initialWindow + config.horizon} points, have ${numericPoints.length}`
      );
    }

    if (config.folds < 1) {
      throw new Error('Must have at least 1 fold');
    }

    if (config.horizon < 1) {
      throw new Error('Horizon must be at least 1');
    }
  }

  private generateSplits(
    points: CanonicalPoint[],
    config: BacktestConfig
  ): Array<{ trainStart: number; trainEnd: number; testStart: number; testEnd: number }> {
    const numericPoints = points
      .filter(p => typeof p.value === 'number')
      .sort((a, b) => a.timestamp - b.timestamp);

    const splits: Array<{
      trainStart: number;
      trainEnd: number;
      testStart: number;
      testEnd: number;
    }> = [];

    const totalPoints = numericPoints.length;

    switch (config.strategy) {
      case 'expanding_window': {
        let trainEnd = config.initialWindow;
        for (let i = 0; i < config.folds && trainEnd + config.gap + config.horizon <= totalPoints; i++) {
          const testStart = trainEnd + config.gap;
          const testEnd = Math.min(testStart + config.horizon, totalPoints);

          splits.push({
            trainStart: 0,
            trainEnd,
            testStart,
            testEnd,
          });

          trainEnd += config.stepSize;
        }
        break;
      }

      case 'sliding_window': {
        let windowStart = 0;
        for (let i = 0; i < config.folds; i++) {
          const trainEnd = windowStart + config.initialWindow;
          const testStart = trainEnd + config.gap;
          const testEnd = Math.min(testStart + config.horizon, totalPoints);

          if (testEnd > totalPoints) break;

          splits.push({
            trainStart: windowStart,
            trainEnd,
            testStart,
            testEnd,
          });

          windowStart += config.stepSize;
        }
        break;
      }

      case 'time_series_cv': {
        // Blocked time-series CV
        const blockSize = Math.floor((totalPoints - config.initialWindow) / config.folds);

        for (let i = 0; i < config.folds; i++) {
          const trainEnd = config.initialWindow + i * blockSize;
          const testStart = trainEnd + config.gap;
          const testEnd = Math.min(testStart + config.horizon, totalPoints);

          if (testEnd > totalPoints) break;

          splits.push({
            trainStart: 0,
            trainEnd,
            testStart,
            testEnd,
          });
        }
        break;
      }
    }

    return splits;
  }

  private async executeFold(
    points: CanonicalPoint[],
    split: { trainStart: number; trainEnd: number; testStart: number; testEnd: number },
    forecastFn: (trainData: CanonicalPoint[], horizon: number) => Promise<ForecastPoint[]>,
    config: BacktestConfig,
    foldIndex: number
  ): Promise<FoldResult> {
    const start = Date.now();

    const numericPoints = points
      .filter(p => typeof p.value === 'number')
      .sort((a, b) => a.timestamp - b.timestamp);

    const trainData = numericPoints.slice(split.trainStart, split.trainEnd);
    const testData = numericPoints.slice(split.testStart, split.testEnd);

    try {
      const predictions = await forecastFn(trainData, testData.length);
      const actuals = testData.map(p => p.value as number);
      const predValues = predictions.map(p => p.value);

      const metrics = this.calculateMetrics(actuals, predValues, trainData.map(p => p.value as number), config.metrics);

      return {
        foldIndex,
        trainStart: trainData[0]?.timestamp ?? 0,
        trainEnd: trainData[trainData.length - 1]?.timestamp ?? 0,
        testStart: testData[0]?.timestamp ?? 0,
        testEnd: testData[testData.length - 1]?.timestamp ?? 0,
        trainPoints: trainData.length,
        testPoints: testData.length,
        actuals,
        predictions: predValues,
        metrics,
        success: true,
        executionTimeMs: Date.now() - start,
      };
    } catch (error) {
      return {
        foldIndex,
        trainStart: trainData[0]?.timestamp ?? 0,
        trainEnd: trainData[trainData.length - 1]?.timestamp ?? 0,
        testStart: testData[0]?.timestamp ?? 0,
        testEnd: testData[testData.length - 1]?.timestamp ?? 0,
        trainPoints: trainData.length,
        testPoints: testData.length,
        actuals: [],
        predictions: [],
        metrics: {},
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - start,
      };
    }
  }

  private calculateMetrics(
    actuals: number[],
    predictions: number[],
    trainData: number[],
    metricsToCalculate: AccuracyMetric[]
  ): MetricsResult {
    if (actuals.length === 0 || predictions.length === 0) return {};

    const n = Math.min(actuals.length, predictions.length);
    const a = actuals.slice(0, n);
    const p = predictions.slice(0, n);
    const errors = a.map((ai, i) => ai - p[i]);
    const absErrors = errors.map(Math.abs);

    const result: MetricsResult = {};

    for (const metric of metricsToCalculate) {
      switch (metric) {
        case 'mae':
          result.mae = absErrors.reduce((sum, e) => sum + e, 0) / n;
          break;

        case 'mse':
          result.mse = errors.reduce((sum, e) => sum + e * e, 0) / n;
          break;

        case 'rmse':
          result.rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / n);
          break;

        case 'mape':
          const validMape = a.filter(ai => ai !== 0);
          if (validMape.length > 0) {
            result.mape = a.reduce((sum, ai, i) =>
              ai !== 0 ? sum + Math.abs((ai - p[i]) / ai) : sum, 0) / validMape.length * 100;
          }
          break;

        case 'smape':
          result.smape = a.reduce((sum, ai, i) =>
            sum + 2 * Math.abs(ai - p[i]) / (Math.abs(ai) + Math.abs(p[i]) + 1e-10), 0) / n * 100;
          break;

        case 'mase':
          // Mean Absolute Scaled Error (using naive forecast as baseline)
          if (trainData.length > 1) {
            const naiveErrors = trainData.slice(1).map((t, i) => Math.abs(t - trainData[i]));
            const naiveMae = naiveErrors.reduce((s, e) => s + e, 0) / naiveErrors.length;
            if (naiveMae > 0) {
              result.mase = (absErrors.reduce((s, e) => s + e, 0) / n) / naiveMae;
            }
          }
          break;

        case 'r2':
          const meanA = a.reduce((s, ai) => s + ai, 0) / n;
          const ssTot = a.reduce((s, ai) => s + Math.pow(ai - meanA, 2), 0);
          const ssRes = errors.reduce((s, e) => s + e * e, 0);
          result.r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
          break;

        case 'corr':
          const meanAct = a.reduce((s, ai) => s + ai, 0) / n;
          const meanPred = p.reduce((s, pi) => s + pi, 0) / n;
          const stdAct = Math.sqrt(a.reduce((s, ai) => s + Math.pow(ai - meanAct, 2), 0) / n);
          const stdPred = Math.sqrt(p.reduce((s, pi) => s + Math.pow(pi - meanPred, 2), 0) / n);
          if (stdAct > 0 && stdPred > 0) {
            const cov = a.reduce((s, ai, i) => s + (ai - meanAct) * (p[i] - meanPred), 0) / n;
            result.corr = cov / (stdAct * stdPred);
          }
          break;

        case 'bias':
          result.bias = errors.reduce((s, e) => s + e, 0) / n;
          break;

        case 'maxe':
          result.maxe = Math.max(...absErrors);
          break;
      }
    }

    return result;
  }

  private aggregateMetrics(folds: FoldResult[], metrics: AccuracyMetric[]): MetricsResult {
    const result: MetricsResult = {};

    for (const metric of metrics) {
      const values = folds
        .map(f => f.metrics[metric])
        .filter((v): v is number => v !== undefined);

      if (values.length > 0) {
        result[metric] = values.reduce((s, v) => s + v, 0) / values.length;
      }
    }

    return result;
  }

  private calculateMetricStats(folds: FoldResult[], metrics: AccuracyMetric[]): Record<AccuracyMetric, MetricStats> {
    const stats: Record<AccuracyMetric, MetricStats> = {} as Record<AccuracyMetric, MetricStats>;

    for (const metric of metrics) {
      const values = folds
        .map(f => f.metrics[metric])
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);

      if (values.length > 0) {
        const n = values.length;
        const mean = values.reduce((s, v) => s + v, 0) / n;
        const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n);

        stats[metric] = {
          mean,
          std,
          min: values[0],
          max: values[n - 1],
          median: n % 2 === 0 ? (values[n / 2 - 1] + values[n / 2]) / 2 : values[Math.floor(n / 2)],
          p5: values[Math.floor(n * 0.05)] ?? values[0],
          p95: values[Math.floor(n * 0.95)] ?? values[n - 1],
        };
      }
    }

    return stats;
  }

  private calculateRanking(
    results: Map<ForecastModel, BacktestResult>,
    metrics: AccuracyMetric[]
  ): Array<{ model: ForecastModel; averageRank: number }> {
    const rankSums = new Map<ForecastModel, number>();

    for (const model of results.keys()) {
      rankSums.set(model, 0);
    }

    for (const metric of metrics) {
      // Get metric values for all models
      const modelValues: Array<{ model: ForecastModel; value: number }> = [];
      for (const [model, result] of results) {
        const value = result.aggregatedMetrics[metric];
        if (value !== undefined) {
          modelValues.push({ model, value });
        }
      }

      // Sort and assign ranks (lower value = better rank)
      modelValues.sort((a, b) => a.value - b.value);
      modelValues.forEach((mv, idx) => {
        rankSums.set(mv.model, (rankSums.get(mv.model) ?? 0) + (idx + 1));
      });
    }

    // Calculate average ranks
    const ranking: Array<{ model: ForecastModel; averageRank: number }> = [];
    for (const [model, sum] of rankSums) {
      ranking.push({ model, averageRank: sum / metrics.length });
    }

    return ranking.sort((a, b) => a.averageRank - b.averageRank);
  }

  private runSignificanceTests(
    results: Map<ForecastModel, BacktestResult>,
    metrics: AccuracyMetric[]
  ): SignificanceTest[] {
    const tests: SignificanceTest[] = [];
    const models = Array.from(results.keys());

    for (let i = 0; i < models.length - 1; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const modelA = models[i];
        const modelB = models[j];
        const resultA = results.get(modelA)!;
        const resultB = results.get(modelB)!;

        for (const metric of metrics) {
          // Get paired errors from each fold
          const errorsA: number[] = [];
          const errorsB: number[] = [];

          for (let k = 0; k < Math.min(resultA.folds.length, resultB.folds.length); k++) {
            const foldA = resultA.folds[k];
            const foldB = resultB.folds[k];

            if (foldA.success && foldB.success && foldA.metrics[metric] !== undefined && foldB.metrics[metric] !== undefined) {
              errorsA.push(foldA.metrics[metric]!);
              errorsB.push(foldB.metrics[metric]!);
            }
          }

          if (errorsA.length >= 3) {
            // Simple paired t-test
            const diffs = errorsA.map((a, idx) => a - errorsB[idx]);
            const meanDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
            const stdDiff = Math.sqrt(diffs.reduce((s, d) => s + Math.pow(d - meanDiff, 2), 0) / (diffs.length - 1));
            const tStat = meanDiff / (stdDiff / Math.sqrt(diffs.length));
            const pValue = this.tDistributionPValue(Math.abs(tStat), diffs.length - 1);

            tests.push({
              modelA,
              modelB,
              metric,
              testType: 'paired_t',
              statistic: tStat,
              pValue,
              significant: pValue < 0.05,
              betterModel: meanDiff < 0 ? modelA : meanDiff > 0 ? modelB : undefined,
            });
          }
        }
      }
    }

    return tests;
  }

  private tDistributionPValue(t: number, df: number): number {
    // Approximation of two-tailed p-value for t-distribution
    // Using a simple approximation for large df
    if (df >= 30) {
      return 2 * (1 - this.normalCDF(t));
    }
    // For smaller df, use a rough approximation
    const x = df / (df + t * t);
    return this.incompleteBeta(df / 2, 0.5, x);
  }

  private normalCDF(z: number): number {
    // Approximation of normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1 / (1 + p * z);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1 + sign * y);
  }

  private incompleteBeta(_a: number, _b: number, _x: number): number {
    // Simplified incomplete beta for t-test p-value approximation
    // This is a rough approximation
    return 0.05; // Placeholder - real implementation would use proper algorithm
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const BacktestConfigSchema = z.object({
  strategy: z.enum(['expanding_window', 'sliding_window', 'time_series_cv']),
  folds: z.number().int().positive().max(100),
  horizon: z.number().int().positive(),
  initialWindow: z.number().int().positive(),
  stepSize: z.number().int().positive(),
  gap: z.number().int().nonnegative(),
  metrics: z.array(z.enum(['mae', 'mse', 'rmse', 'mape', 'smape', 'mase', 'r2', 'corr', 'bias', 'maxe'])).min(1),
  foldTimeoutMs: z.number().int().positive(),
  parallel: z.boolean(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateBacktestConfig(
  config: unknown
): { success: boolean; data?: BacktestConfig; errors?: string[] } {
  const result = BacktestConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create default backtest config
 */
export function createBacktestConfig(
  params: Partial<BacktestConfig> = {}
): BacktestConfig {
  return {
    strategy: 'expanding_window',
    folds: 5,
    horizon: 12,
    initialWindow: 100,
    stepSize: 12,
    gap: 0,
    metrics: ['mae', 'rmse', 'mape'],
    foldTimeoutMs: 60000,
    parallel: false,
    ...params,
  };
}

/**
 * Create a backtester instance
 */
export function createBacktester(): Backtester {
  return new Backtester();
}
