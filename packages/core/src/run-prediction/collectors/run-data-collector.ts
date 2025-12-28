/**
 * Historical Run Data Collector
 *
 * Collects and transforms historical run data from storage for use in predictions.
 * Supports both Firestore (production) and in-memory (testing) storage backends.
 *
 * @module @gwi/core/run-prediction/collectors/run-data-collector
 */

import type { Run, RunStore, SaaSRun, TenantStore } from '../../storage/interfaces.js';
import type {
  RunDataPoint,
  PredictionRunType,
  RunOutcome,
  ComplexityBucket,
} from '../index.js';
import { RunPredictionErrorCodes, complexityToBucket } from '../index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Data collector configuration
 */
export interface RunDataCollectorConfig {
  /** Maximum runs to fetch per query */
  maxRunsPerQuery: number;
  /** Maximum age of runs to consider (days) */
  maxAgeDays: number;
  /** Include tenant-scoped data */
  tenantScoped: boolean;
  /** Cache collected data for this duration (ms) */
  cacheTtlMs: number;
}

/**
 * Filter options for data collection
 */
export interface RunDataFilter {
  /** Filter by run type */
  runType?: PredictionRunType;
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by repository */
  repoFullName?: string;
  /** Filter by complexity bucket */
  complexityBucket?: ComplexityBucket;
  /** Minimum timestamp */
  sinceTimestamp?: number;
  /** Maximum results */
  limit?: number;
}

/**
 * Collection result with metadata
 */
export interface CollectionResult {
  /** Collected data points */
  dataPoints: RunDataPoint[];
  /** Total count before limit */
  totalCount: number;
  /** Time period covered (ms) */
  periodCovered: number;
  /** Collection timestamp */
  collectedAt: number;
  /** From cache */
  cached: boolean;
}

/**
 * Run data collector error
 */
export class RunDataCollectorError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RunDataCollectorError';
  }
}

// =============================================================================
// RUN DATA COLLECTOR
// =============================================================================

/**
 * Collects historical run data for prediction training and inference
 *
 * Transforms Run/SaaSRun objects from storage into RunDataPoint format
 * suitable for time series analysis and prediction.
 */
export class RunDataCollector {
  private config: RunDataCollectorConfig;
  private cache: Map<string, { result: CollectionResult; expiresAt: number }> =
    new Map();

  constructor(config: Partial<RunDataCollectorConfig> = {}) {
    this.config = {
      maxRunsPerQuery: config.maxRunsPerQuery ?? 1000,
      maxAgeDays: config.maxAgeDays ?? 90,
      tenantScoped: config.tenantScoped ?? true,
      cacheTtlMs: config.cacheTtlMs ?? 300000, // 5 minutes
    };
  }

  /**
   * Collect run data from a RunStore (simple, non-tenant-scoped)
   */
  async collectFromRunStore(
    store: RunStore,
    prIds: string[],
    filter: RunDataFilter = {}
  ): Promise<CollectionResult> {
    const cacheKey = this.getCacheKey('runstore', filter, prIds);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cached: true };
    }

    try {
      const dataPoints: RunDataPoint[] = [];
      const cutoffTimestamp = this.getCutoffTimestamp();
      const limit = filter.limit ?? this.config.maxRunsPerQuery;

      // Collect runs for each PR
      for (const prId of prIds) {
        if (dataPoints.length >= limit) break;

        const runs = await store.listRuns(prId, Math.min(100, limit - dataPoints.length));

        for (const run of runs) {
          if (dataPoints.length >= limit) break;
          if (run.createdAt.getTime() < cutoffTimestamp) continue;
          if (!this.matchesFilter(run, filter)) continue;

          const dataPoint = this.transformRunToDataPoint(run);
          if (dataPoint) {
            dataPoints.push(dataPoint);
          }
        }
      }

      const result: CollectionResult = {
        dataPoints: dataPoints.sort((a, b) => a.timestamp - b.timestamp),
        totalCount: dataPoints.length,
        periodCovered: this.calculatePeriodCovered(dataPoints),
        collectedAt: Date.now(),
        cached: false,
      };

      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });

      return result;
    } catch (error) {
      throw new RunDataCollectorError(
        RunPredictionErrorCodes.QUERY_FAILED,
        `Failed to collect run data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Collect run data from a TenantStore (multi-tenant SaaS)
   */
  async collectFromTenantStore(
    store: TenantStore,
    tenantId: string,
    filter: RunDataFilter = {}
  ): Promise<CollectionResult> {
    const cacheKey = this.getCacheKey('tenantstore', { ...filter, tenantId });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cached: true };
    }

    try {
      const cutoffTimestamp = this.getCutoffTimestamp();
      const limit = filter.limit ?? this.config.maxRunsPerQuery;

      // Query runs from tenant store
      const runs = await store.listRuns(tenantId, {
        type: filter.runType as Run['type'] | undefined,
        status: 'completed', // Only completed runs have outcomes
        limit,
      });

      // Transform and filter
      const dataPoints: RunDataPoint[] = [];
      for (const run of runs) {
        if (run.createdAt.getTime() < cutoffTimestamp) continue;
        if (!this.matchesSaaSFilter(run, filter)) continue;

        const dataPoint = this.transformSaaSRunToDataPoint(run);
        if (dataPoint) {
          dataPoints.push(dataPoint);
        }
      }

      const result: CollectionResult = {
        dataPoints: dataPoints.sort((a, b) => a.timestamp - b.timestamp),
        totalCount: dataPoints.length,
        periodCovered: this.calculatePeriodCovered(dataPoints),
        collectedAt: Date.now(),
        cached: false,
      };

      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });

      return result;
    } catch (error) {
      throw new RunDataCollectorError(
        RunPredictionErrorCodes.QUERY_FAILED,
        `Failed to collect tenant run data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Collect aggregate data across multiple tenants (for global models)
   */
  async collectGlobalData(
    store: TenantStore,
    tenantIds: string[],
    filter: RunDataFilter = {}
  ): Promise<CollectionResult> {
    const allDataPoints: RunDataPoint[] = [];
    const limit = filter.limit ?? this.config.maxRunsPerQuery;

    for (const tenantId of tenantIds) {
      if (allDataPoints.length >= limit) break;

      const tenantResult = await this.collectFromTenantStore(store, tenantId, {
        ...filter,
        limit: Math.min(100, limit - allDataPoints.length),
      });

      allDataPoints.push(...tenantResult.dataPoints);
    }

    return {
      dataPoints: allDataPoints.slice(0, limit).sort((a, b) => a.timestamp - b.timestamp),
      totalCount: allDataPoints.length,
      periodCovered: this.calculatePeriodCovered(allDataPoints),
      collectedAt: Date.now(),
      cached: false,
    };
  }

  /**
   * Transform a Run to RunDataPoint
   */
  private transformRunToDataPoint(run: Run): RunDataPoint | null {
    // Skip incomplete runs
    if (!run.completedAt) return null;
    if (!run.status || run.status === 'pending' || run.status === 'running') return null;

    // Extract complexity from run result or steps
    const complexityScore = this.extractComplexityScore(run);

    // Calculate duration
    const durationMs = run.durationMs ??
      (run.completedAt.getTime() - run.createdAt.getTime());

    return {
      runId: run.id,
      timestamp: run.createdAt.getTime(),
      runType: run.type as PredictionRunType,
      complexityScore,
      complexityBucket: complexityToBucket(complexityScore),
      durationMs,
      outcome: this.mapStatusToOutcome(run.status),
      stepCount: run.steps?.length,
    };
  }

  /**
   * Transform a SaaSRun to RunDataPoint
   */
  private transformSaaSRunToDataPoint(run: SaaSRun): RunDataPoint | null {
    // Skip incomplete runs
    if (!run.completedAt) return null;
    if (!run.status || run.status === 'pending' || run.status === 'running') return null;

    const complexityScore = this.extractComplexityScore(run);
    const durationMs = run.durationMs ??
      (run.completedAt.getTime() - run.createdAt.getTime());

    return {
      runId: run.id,
      timestamp: run.createdAt.getTime(),
      runType: run.type as PredictionRunType,
      complexityScore,
      complexityBucket: complexityToBucket(complexityScore),
      durationMs,
      outcome: this.mapStatusToOutcome(run.status),
      stepCount: run.steps?.length,
      tokensUsed: run.tokensUsed?.total,
      tenantId: run.tenantId,
    };
  }

  /**
   * Extract complexity score from run data
   */
  private extractComplexityScore(run: Run): number {
    // Check if triage step has complexity info
    const triageStep = run.steps?.find((s) => s.agent === 'triage');
    if (triageStep?.output && typeof triageStep.output === 'object') {
      const output = triageStep.output as Record<string, unknown>;
      if (typeof output.complexityScore === 'number') {
        return Math.min(10, Math.max(1, output.complexityScore));
      }
      if (typeof output.complexity === 'number') {
        return Math.min(10, Math.max(1, output.complexity));
      }
    }

    // Check result for complexity
    if (run.result && typeof run.result === 'object') {
      const result = run.result as Record<string, unknown>;
      if (typeof result.complexityScore === 'number') {
        return Math.min(10, Math.max(1, result.complexityScore));
      }
    }

    // Estimate from step count and duration
    const stepCount = run.steps?.length ?? 1;
    const durationMin = (run.durationMs ?? 60000) / 60000;

    // Simple heuristic: more steps and longer duration = higher complexity
    const estimated = Math.min(10, 3 + stepCount + Math.log2(durationMin + 1));
    return Math.round(estimated);
  }

  /**
   * Map run status to outcome category
   */
  private mapStatusToOutcome(status: Run['status']): RunOutcome {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'failure';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'failure';
    }
  }

  /**
   * Check if run matches filter criteria
   */
  private matchesFilter(run: Run, filter: RunDataFilter): boolean {
    if (filter.runType && run.type !== filter.runType) {
      return false;
    }

    if (filter.sinceTimestamp && run.createdAt.getTime() < filter.sinceTimestamp) {
      return false;
    }

    if (filter.complexityBucket) {
      const score = this.extractComplexityScore(run);
      if (complexityToBucket(score) !== filter.complexityBucket) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if SaaS run matches filter criteria
   */
  private matchesSaaSFilter(run: SaaSRun, filter: RunDataFilter): boolean {
    if (!this.matchesFilter(run, filter)) {
      return false;
    }

    if (filter.tenantId && run.tenantId !== filter.tenantId) {
      return false;
    }

    return true;
  }

  /**
   * Get cutoff timestamp based on max age
   */
  private getCutoffTimestamp(): number {
    return Date.now() - this.config.maxAgeDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Calculate period covered by data points
   */
  private calculatePeriodCovered(dataPoints: RunDataPoint[]): number {
    if (dataPoints.length < 2) return 0;

    const timestamps = dataPoints.map((p) => p.timestamp).sort((a, b) => a - b);
    return timestamps[timestamps.length - 1] - timestamps[0];
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    source: string,
    filter: RunDataFilter,
    prIds?: string[]
  ): string {
    const parts = [
      source,
      filter.runType ?? 'all',
      filter.tenantId ?? 'all',
      filter.complexityBucket ?? 'all',
      filter.limit ?? this.config.maxRunsPerQuery,
    ];
    if (prIds) {
      parts.push(prIds.slice(0, 5).join(','));
    }
    return parts.join(':');
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get statistics about collected data
   */
  getCollectionStats(dataPoints: RunDataPoint[]): {
    byRunType: Record<PredictionRunType, number>;
    byOutcome: Record<RunOutcome, number>;
    byComplexity: Record<ComplexityBucket, number>;
    avgDurationMs: number;
    successRate: number;
  } {
    const byRunType: Record<PredictionRunType, number> = {
      triage: 0,
      plan: 0,
      resolve: 0,
      review: 0,
      autopilot: 0,
      issue_to_code: 0,
    };

    const byOutcome: Record<RunOutcome, number> = {
      success: 0,
      failure: 0,
      cancelled: 0,
      timeout: 0,
    };

    const byComplexity: Record<ComplexityBucket, number> = {
      low: 0,
      medium: 0,
      high: 0,
      extreme: 0,
    };

    let totalDuration = 0;

    for (const point of dataPoints) {
      byRunType[point.runType] = (byRunType[point.runType] || 0) + 1;
      byOutcome[point.outcome] = (byOutcome[point.outcome] || 0) + 1;
      byComplexity[point.complexityBucket] = (byComplexity[point.complexityBucket] || 0) + 1;
      totalDuration += point.durationMs;
    }

    const avgDurationMs = dataPoints.length > 0 ? totalDuration / dataPoints.length : 0;
    const successRate = dataPoints.length > 0
      ? byOutcome.success / dataPoints.length
      : 0;

    return {
      byRunType,
      byOutcome,
      byComplexity,
      avgDurationMs,
      successRate,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a run data collector with configuration
 */
export function createRunDataCollector(
  config?: Partial<RunDataCollectorConfig>
): RunDataCollector {
  return new RunDataCollector(config);
}
