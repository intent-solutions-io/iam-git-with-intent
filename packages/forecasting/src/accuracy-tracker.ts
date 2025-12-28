/**
 * Accuracy Tracker
 *
 * Tracks prediction accuracy by comparing predicted values to actual outcomes.
 * Calculates and stores various accuracy metrics for model evaluation.
 */

import {
  PredictionTrackingRecord,
  PredictionTrackingRecordSchema,
  AggregatedAccuracyMetrics,
  AggregatedAccuracyMetricsSchema,
  RunOutcomePrediction,
} from './models/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Actual run outcome for comparison
 */
export interface ActualOutcome {
  /** Run ID */
  runId: string;
  /** Whether the run succeeded */
  success: boolean;
  /** Actual duration in milliseconds */
  durationMs: number;
  /** Actual tokens used */
  tokensUsed?: number;
  /** When the run completed */
  completedAt: Date;
}

/**
 * Storage interface for prediction tracking
 */
export interface PredictionTrackingStore {
  /** Save a new tracking record */
  save(record: PredictionTrackingRecord): Promise<void>;
  /** Get a tracking record by prediction ID */
  get(predictionId: string): Promise<PredictionTrackingRecord | null>;
  /** Get tracking record by run ID */
  getByRunId(runId: string): Promise<PredictionTrackingRecord | null>;
  /** Update a tracking record with actual values */
  updateActual(
    predictionId: string,
    actual: Pick<PredictionTrackingRecord, 'actualSuccess' | 'actualDurationMs' | 'actualTokens' | 'actualRecordedAt'>
  ): Promise<void>;
  /** List tracking records for a time period */
  list(options: {
    since?: Date;
    until?: Date;
    tenantId?: string;
    runType?: string;
    limit?: number;
    offset?: number;
  }): Promise<PredictionTrackingRecord[]>;
  /** Count records */
  count(options: { since?: Date; until?: Date; tenantId?: string }): Promise<number>;
}

/**
 * Storage interface for accuracy metrics
 */
export interface AccuracyMetricsStore {
  /** Save aggregated metrics */
  saveAggregated(metrics: AggregatedAccuracyMetrics): Promise<void>;
  /** Get aggregated metrics for a period */
  getAggregated(options: {
    periodStart: Date;
    periodEnd: Date;
    tenantId?: string;
    runType?: string;
  }): Promise<AggregatedAccuracyMetrics | null>;
  /** List aggregated metrics */
  listAggregated(options: {
    since?: Date;
    until?: Date;
    tenantId?: string;
    limit?: number;
  }): Promise<AggregatedAccuracyMetrics[]>;
}

/**
 * In-memory store implementation (for testing and development)
 */
export class InMemoryPredictionTrackingStore implements PredictionTrackingStore {
  private records: Map<string, PredictionTrackingRecord> = new Map();
  private byRunId: Map<string, string> = new Map();

  async save(record: PredictionTrackingRecord): Promise<void> {
    this.records.set(record.predictionId, record);
    this.byRunId.set(record.runId, record.predictionId);
  }

  async get(predictionId: string): Promise<PredictionTrackingRecord | null> {
    return this.records.get(predictionId) ?? null;
  }

  async getByRunId(runId: string): Promise<PredictionTrackingRecord | null> {
    const predictionId = this.byRunId.get(runId);
    if (!predictionId) return null;
    return this.records.get(predictionId) ?? null;
  }

  async updateActual(
    predictionId: string,
    actual: Pick<PredictionTrackingRecord, 'actualSuccess' | 'actualDurationMs' | 'actualTokens' | 'actualRecordedAt'>
  ): Promise<void> {
    const record = this.records.get(predictionId);
    if (record) {
      this.records.set(predictionId, { ...record, ...actual });
    }
  }

  async list(options: {
    since?: Date;
    until?: Date;
    tenantId?: string;
    runType?: string;
    limit?: number;
    offset?: number;
  }): Promise<PredictionTrackingRecord[]> {
    let records = Array.from(this.records.values());

    if (options.since) {
      records = records.filter(r => r.predictedAt >= options.since!);
    }
    if (options.until) {
      records = records.filter(r => r.predictedAt <= options.until!);
    }
    if (options.tenantId) {
      records = records.filter(r => r.tenantId === options.tenantId);
    }
    if (options.runType) {
      records = records.filter(r => r.runType === options.runType);
    }

    records.sort((a, b) => b.predictedAt.getTime() - a.predictedAt.getTime());

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;

    return records.slice(offset, offset + limit);
  }

  async count(options: { since?: Date; until?: Date; tenantId?: string }): Promise<number> {
    const records = await this.list({ ...options, limit: Infinity });
    return records.length;
  }

  clear(): void {
    this.records.clear();
    this.byRunId.clear();
  }
}

/**
 * In-memory metrics store implementation
 */
export class InMemoryAccuracyMetricsStore implements AccuracyMetricsStore {
  private metrics: AggregatedAccuracyMetrics[] = [];

  async saveAggregated(metrics: AggregatedAccuracyMetrics): Promise<void> {
    // Replace existing metrics for the same period
    const existingIndex = this.metrics.findIndex(
      m =>
        m.periodStart.getTime() === metrics.periodStart.getTime() &&
        m.periodEnd.getTime() === metrics.periodEnd.getTime() &&
        m.tenantId === metrics.tenantId &&
        m.runType === metrics.runType
    );

    if (existingIndex >= 0) {
      this.metrics[existingIndex] = metrics;
    } else {
      this.metrics.push(metrics);
    }
  }

  async getAggregated(options: {
    periodStart: Date;
    periodEnd: Date;
    tenantId?: string;
    runType?: string;
  }): Promise<AggregatedAccuracyMetrics | null> {
    return this.metrics.find(
      m =>
        m.periodStart.getTime() === options.periodStart.getTime() &&
        m.periodEnd.getTime() === options.periodEnd.getTime() &&
        m.tenantId === options.tenantId &&
        m.runType === options.runType
    ) ?? null;
  }

  async listAggregated(options: {
    since?: Date;
    until?: Date;
    tenantId?: string;
    limit?: number;
  }): Promise<AggregatedAccuracyMetrics[]> {
    let metrics = this.metrics;

    if (options.since) {
      metrics = metrics.filter(m => m.periodEnd >= options.since!);
    }
    if (options.until) {
      metrics = metrics.filter(m => m.periodStart <= options.until!);
    }
    if (options.tenantId) {
      metrics = metrics.filter(m => m.tenantId === options.tenantId);
    }

    metrics.sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());

    return metrics.slice(0, options.limit ?? 100);
  }

  clear(): void {
    this.metrics = [];
  }
}

// =============================================================================
// Accuracy Tracker
// =============================================================================

/**
 * Tracks and calculates prediction accuracy
 */
export class AccuracyTracker {
  constructor(
    private readonly trackingStore: PredictionTrackingStore,
    private readonly metricsStore: AccuracyMetricsStore,
    private readonly modelVersion: string = '1.0'
  ) {}

  /**
   * Record a new prediction for tracking
   *
   * @param prediction - The prediction to track
   * @param runId - The run ID this prediction is for
   * @param context - Additional context
   */
  async recordPrediction(
    prediction: RunOutcomePrediction,
    runId: string,
    context: {
      tenantId?: string;
      runType: string;
      complexity: number;
    }
  ): Promise<void> {
    const record: PredictionTrackingRecord = {
      predictionId: prediction.predictionId,
      runId,
      tenantId: context.tenantId,
      predictedAt: prediction.predictedAt,
      predictedSuccess: prediction.successProbability >= 0.5,
      predictedDurationMs: prediction.predictedDurationMs,
      predictedTokens: prediction.predictedTokens,
      actualSuccess: null,
      actualDurationMs: null,
      actualTokens: null,
      actualRecordedAt: null,
      modelVersion: prediction.modelVersion,
      runType: context.runType,
      complexity: context.complexity,
    };

    const validated = PredictionTrackingRecordSchema.parse(record);
    await this.trackingStore.save(validated);
  }

  /**
   * Record actual outcome for a run
   *
   * @param outcome - The actual outcome
   */
  async recordActualOutcome(outcome: ActualOutcome): Promise<void> {
    const record = await this.trackingStore.getByRunId(outcome.runId);
    if (!record) {
      // No prediction was made for this run
      return;
    }

    await this.trackingStore.updateActual(record.predictionId, {
      actualSuccess: outcome.success,
      actualDurationMs: outcome.durationMs,
      actualTokens: outcome.tokensUsed ?? null,
      actualRecordedAt: outcome.completedAt,
    });
  }

  /**
   * Calculate accuracy metrics for a time period
   *
   * @param options - Calculation options
   * @returns Aggregated accuracy metrics
   */
  async calculateMetrics(options: {
    periodStart: Date;
    periodEnd: Date;
    tenantId?: string;
    runType?: string;
  }): Promise<AggregatedAccuracyMetrics> {
    // Get all tracking records for the period
    const records = await this.trackingStore.list({
      since: options.periodStart,
      until: options.periodEnd,
      tenantId: options.tenantId,
      runType: options.runType,
    });

    // Filter to records with actual outcomes
    const completedRecords = records.filter(
      r => r.actualSuccess !== null && r.actualDurationMs !== null
    );

    if (completedRecords.length === 0) {
      // Return zero metrics if no completed records
      return this.createEmptyMetrics(options);
    }

    // Calculate duration metrics
    const durationMetrics = this.calculateDurationMetrics(completedRecords);

    // Calculate success metrics
    const successMetrics = this.calculateSuccessMetrics(completedRecords);

    // Calculate token metrics (if available)
    const tokenMetrics = this.calculateTokenMetrics(completedRecords);

    const metrics: AggregatedAccuracyMetrics = {
      periodStart: options.periodStart,
      periodEnd: options.periodEnd,
      predictionCount: completedRecords.length,
      durationMetrics,
      successMetrics,
      tokenMetrics,
      modelVersion: this.modelVersion,
      tenantId: options.tenantId,
      runType: options.runType,
    };

    const validated = AggregatedAccuracyMetricsSchema.parse(metrics);

    // Store the metrics
    await this.metricsStore.saveAggregated(validated);

    return validated;
  }

  /**
   * Get historical accuracy trend
   *
   * @param options - Query options
   * @returns List of aggregated metrics
   */
  async getAccuracyTrend(options: {
    periods: number;
    periodDays: number;
    tenantId?: string;
  }): Promise<AggregatedAccuracyMetrics[]> {
    const results: AggregatedAccuracyMetrics[] = [];
    const now = new Date();

    for (let i = 0; i < options.periods; i++) {
      const periodEnd = new Date(now.getTime() - i * options.periodDays * 24 * 60 * 60 * 1000);
      const periodStart = new Date(periodEnd.getTime() - options.periodDays * 24 * 60 * 60 * 1000);

      const metrics = await this.calculateMetrics({
        periodStart,
        periodEnd,
        tenantId: options.tenantId,
      });

      results.push(metrics);
    }

    return results.reverse();
  }

  /**
   * Get current model performance summary
   */
  async getPerformanceSummary(options: {
    tenantId?: string;
    lookbackDays?: number;
  }): Promise<{
    overallAccuracy: number;
    durationMAE: number;
    successF1: number;
    predictionCount: number;
    trend: 'improving' | 'stable' | 'degrading';
  }> {
    const lookbackDays = options.lookbackDays ?? 30;
    const periodEnd = new Date();
    const periodStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const metrics = await this.calculateMetrics({
      periodStart,
      periodEnd,
      tenantId: options.tenantId,
    });

    // Calculate overall accuracy as weighted average
    const successWeight = 0.4;
    const durationWeight = 0.6;

    // Normalize duration MAE (assume 60s average, lower is better)
    const normalizedDurationScore = Math.max(0, 1 - metrics.durationMetrics.mae / 60000);

    const overallAccuracy =
      metrics.successMetrics.accuracy * successWeight +
      normalizedDurationScore * durationWeight;

    // Get trend from last 3 periods
    const trendMetrics = await this.getAccuracyTrend({
      periods: 3,
      periodDays: 7,
      tenantId: options.tenantId,
    });

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (trendMetrics.length >= 2) {
      const recent = trendMetrics[trendMetrics.length - 1];
      const previous = trendMetrics[trendMetrics.length - 2];

      if (recent.predictionCount > 0 && previous.predictionCount > 0) {
        const accuracyChange = recent.successMetrics.accuracy - previous.successMetrics.accuracy;
        if (accuracyChange > 0.05) {
          trend = 'improving';
        } else if (accuracyChange < -0.05) {
          trend = 'degrading';
        }
      }
    }

    return {
      overallAccuracy,
      durationMAE: metrics.durationMetrics.mae,
      successF1: metrics.successMetrics.f1,
      predictionCount: metrics.predictionCount,
      trend,
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private calculateDurationMetrics(records: PredictionTrackingRecord[]): {
    mae: number;
    rmse: number;
    mape: number | null;
    smape: number | null;
  } {
    const errors = records.map(r => r.actualDurationMs! - r.predictedDurationMs);
    const absErrors = errors.map(e => Math.abs(e));
    const sqErrors = errors.map(e => e * e);

    const mae = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
    const rmse = Math.sqrt(sqErrors.reduce((a, b) => a + b, 0) / sqErrors.length);

    // MAPE (handle division by zero)
    let mape: number | null = null;
    const nonZeroRecords = records.filter(r => r.actualDurationMs! > 0);
    if (nonZeroRecords.length > 0) {
      const apeValues = nonZeroRecords.map(
        r => Math.abs((r.actualDurationMs! - r.predictedDurationMs) / r.actualDurationMs!) * 100
      );
      mape = apeValues.reduce((a, b) => a + b, 0) / apeValues.length;
    }

    // SMAPE
    let smape: number | null = null;
    const smapeValues = records.map(r => {
      const denominator = Math.abs(r.actualDurationMs!) + Math.abs(r.predictedDurationMs);
      return denominator > 0
        ? (Math.abs(r.actualDurationMs! - r.predictedDurationMs) / denominator) * 200
        : null;
    }).filter((v): v is number => v !== null);

    if (smapeValues.length > 0) {
      smape = smapeValues.reduce((a, b) => a + b, 0) / smapeValues.length;
    }

    return { mae, rmse, mape, smape };
  }

  private calculateSuccessMetrics(records: PredictionTrackingRecord[]): {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    truePositives: number;
    trueNegatives: number;
    falsePositives: number;
    falseNegatives: number;
  } {
    let truePositives = 0;
    let trueNegatives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const record of records) {
      const predicted = record.predictedSuccess;
      const actual = record.actualSuccess!;

      if (predicted && actual) {
        truePositives++;
      } else if (!predicted && !actual) {
        trueNegatives++;
      } else if (predicted && !actual) {
        falsePositives++;
      } else {
        falseNegatives++;
      }
    }

    const total = records.length;
    const accuracy = (truePositives + trueNegatives) / total;
    const precision = truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
    const recall = truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;
    const f1 = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

    return {
      accuracy,
      precision,
      recall,
      f1,
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
    };
  }

  private calculateTokenMetrics(records: PredictionTrackingRecord[]): {
    mae: number;
    rmse: number;
    mape: number | null;
  } | undefined {
    const recordsWithTokens = records.filter(
      r => r.predictedTokens !== undefined && r.actualTokens !== null
    );

    if (recordsWithTokens.length === 0) {
      return undefined;
    }

    const errors = recordsWithTokens.map(r => r.actualTokens! - r.predictedTokens!);
    const absErrors = errors.map(e => Math.abs(e));
    const sqErrors = errors.map(e => e * e);

    const mae = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
    const rmse = Math.sqrt(sqErrors.reduce((a, b) => a + b, 0) / sqErrors.length);

    // MAPE
    let mape: number | null = null;
    const nonZeroRecords = recordsWithTokens.filter(r => r.actualTokens! > 0);
    if (nonZeroRecords.length > 0) {
      const apeValues = nonZeroRecords.map(
        r => Math.abs((r.actualTokens! - r.predictedTokens!) / r.actualTokens!) * 100
      );
      mape = apeValues.reduce((a, b) => a + b, 0) / apeValues.length;
    }

    return { mae, rmse, mape };
  }

  private createEmptyMetrics(options: {
    periodStart: Date;
    periodEnd: Date;
    tenantId?: string;
    runType?: string;
  }): AggregatedAccuracyMetrics {
    return {
      periodStart: options.periodStart,
      periodEnd: options.periodEnd,
      predictionCount: 0,
      durationMetrics: {
        mae: 0,
        rmse: 0,
        mape: null,
        smape: null,
      },
      successMetrics: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1: 0,
        truePositives: 0,
        trueNegatives: 0,
        falsePositives: 0,
        falseNegatives: 0,
      },
      modelVersion: this.modelVersion,
      tenantId: options.tenantId,
      runType: options.runType,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an accuracy tracker with in-memory stores (for testing)
 */
export function createInMemoryAccuracyTracker(
  modelVersion: string = '1.0'
): {
  tracker: AccuracyTracker;
  trackingStore: InMemoryPredictionTrackingStore;
  metricsStore: InMemoryAccuracyMetricsStore;
} {
  const trackingStore = new InMemoryPredictionTrackingStore();
  const metricsStore = new InMemoryAccuracyMetricsStore();
  const tracker = new AccuracyTracker(trackingStore, metricsStore, modelVersion);

  return { tracker, trackingStore, metricsStore };
}

/**
 * Create an accuracy tracker with custom stores
 */
export function createAccuracyTracker(
  trackingStore: PredictionTrackingStore,
  metricsStore: AccuracyMetricsStore,
  modelVersion: string = '1.0'
): AccuracyTracker {
  return new AccuracyTracker(trackingStore, metricsStore, modelVersion);
}
