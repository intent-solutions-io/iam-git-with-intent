/**
 * Historical Run Data Collector
 *
 * Collects and formats historical run data from the RunStore
 * for use in time series forecasting with TimeGPT.
 */

import {
  getLogger,
  type Run,
  type RunStore,
  type SaaSRun,
  type TenantStore,
} from '@gwi/core';
import {
  HistoricalRunData,
  HistoricalRunDataSchema,
  TimeSeriesDataset,
  toTimeSeriesDuration,
  toTimeSeriesSuccessRate,
  calculateRunStatistics,
} from '../models/index.js';

const logger = getLogger('run-data-collector');

// =============================================================================
// Types
// =============================================================================

/**
 * Options for collecting historical run data
 */
export interface CollectorOptions {
  /** Maximum number of runs to collect */
  limit?: number;
  /** Only collect runs after this date */
  sinceDate?: Date;
  /** Only collect runs before this date */
  untilDate?: Date;
  /** Filter by run type */
  runType?: 'triage' | 'plan' | 'resolve' | 'review' | 'autopilot';
  /** Filter by tenant ID (for multi-tenant systems) */
  tenantId?: string;
  /** Filter by repository */
  repoFullName?: string;
  /** Minimum complexity to include */
  minComplexity?: number;
  /** Maximum complexity to include */
  maxComplexity?: number;
  /** Only include completed runs */
  completedOnly?: boolean;
}

/**
 * Collection result with metadata
 */
export interface CollectionResult {
  /** Collected run data */
  data: HistoricalRunData[];
  /** Collection metadata */
  metadata: {
    /** Total runs found */
    totalFound: number;
    /** Runs included after filtering */
    included: number;
    /** Runs excluded (validation failures, etc.) */
    excluded: number;
    /** Collection timestamp */
    collectedAt: Date;
    /** Collection options used */
    options: CollectorOptions;
    /** Run statistics */
    statistics: ReturnType<typeof calculateRunStatistics>;
  };
}

/**
 * Time series export result
 */
export interface TimeSeriesExportResult {
  /** Duration time series */
  durationSeries: TimeSeriesDataset;
  /** Success rate time series */
  successRateSeries: TimeSeriesDataset;
  /** Raw data points count */
  dataPointsCount: number;
  /** Export timestamp */
  exportedAt: Date;
}

// =============================================================================
// RunDataCollector
// =============================================================================

/**
 * Collector for historical run data
 *
 * Uses RunStore (for local/CLI) or TenantStore (for SaaS) to fetch
 * historical runs and convert them to the format needed for TimeGPT.
 */
export class RunDataCollector {
  constructor(
    private readonly runStore?: RunStore,
    private readonly tenantStore?: TenantStore
  ) {
    if (!runStore && !tenantStore) {
      throw new Error('Either runStore or tenantStore must be provided');
    }
  }

  /**
   * Collect historical run data with filtering
   *
   * @param options - Collection options
   * @returns Collection result with data and metadata
   */
  async collect(options: CollectorOptions = {}): Promise<CollectionResult> {
    const runs = await this.fetchRuns(options);
    const now = new Date();

    // Convert and validate runs
    const validatedData: HistoricalRunData[] = [];
    let excluded = 0;

    for (const run of runs) {
      try {
        const converted = this.convertRun(run, options.tenantId);

        // Apply date filters
        if (options.sinceDate && converted.timestamp < options.sinceDate) {
          excluded++;
          continue;
        }
        if (options.untilDate && converted.timestamp > options.untilDate) {
          excluded++;
          continue;
        }

        // Apply complexity filters
        if (options.minComplexity && converted.complexity < options.minComplexity) {
          excluded++;
          continue;
        }
        if (options.maxComplexity && converted.complexity > options.maxComplexity) {
          excluded++;
          continue;
        }

        // Validate with Zod schema
        const validated = HistoricalRunDataSchema.parse(converted);
        validatedData.push(validated);
      } catch {
        // Validation failed, skip this run
        excluded++;
      }
    }

    // Sort by timestamp
    validatedData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      data: validatedData,
      metadata: {
        totalFound: runs.length,
        included: validatedData.length,
        excluded,
        collectedAt: now,
        options,
        statistics: calculateRunStatistics(validatedData),
      },
    };
  }

  /**
   * Export data as time series for TimeGPT
   *
   * @param options - Collection options
   * @param successRateWindow - Window size for success rate calculation
   * @returns Time series datasets
   */
  async exportTimeSeries(
    options: CollectorOptions = {},
    successRateWindow: number = 10
  ): Promise<TimeSeriesExportResult> {
    const { data } = await this.collect(options);

    return {
      durationSeries: toTimeSeriesDuration(data),
      successRateSeries: toTimeSeriesSuccessRate(data, successRateWindow),
      dataPointsCount: data.length,
      exportedAt: new Date(),
    };
  }

  /**
   * Get run statistics for a time period
   *
   * @param options - Collection options
   * @returns Run statistics
   */
  async getStatistics(
    options: CollectorOptions = {}
  ): Promise<ReturnType<typeof calculateRunStatistics>> {
    const { data } = await this.collect(options);
    return calculateRunStatistics(data);
  }

  /**
   * Stream runs for large datasets (generator pattern)
   *
   * @param options - Collection options
   * @param batchSize - Number of runs per batch
   * @yields Batches of historical run data
   */
  async *streamRuns(
    options: CollectorOptions = {},
    batchSize: number = 100
  ): AsyncGenerator<HistoricalRunData[], void, unknown> {
    // For now, we collect all and yield in batches
    // In a production system, this would page through the database
    const { data } = await this.collect(options);

    for (let i = 0; i < data.length; i += batchSize) {
      yield data.slice(i, i + batchSize);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Fetch runs from the appropriate store
   */
  private async fetchRuns(options: CollectorOptions): Promise<(Run | SaaSRun)[]> {
    const limit = options.limit ?? 1000;

    if (options.tenantId && this.tenantStore) {
      // Use TenantStore for SaaS multi-tenant queries
      const filter: {
        repoId?: string;
        type?: 'triage' | 'plan' | 'resolve' | 'review' | 'autopilot';
        status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
        limit?: number;
      } = { limit };

      if (options.runType) {
        filter.type = options.runType;
      }

      if (options.completedOnly) {
        filter.status = 'completed';
      }

      return this.tenantStore.listRuns(options.tenantId, filter);
    } else if (this.runStore) {
      // Use RunStore for local/CLI queries
      // Note: RunStore.listRuns requires a prId, so we may need to query differently
      // For now, we return an empty array - in production, you'd have a different query method
      // or use a database query directly

      // This is a limitation of the current RunStore interface
      // TODO: Add listAllRuns method to RunStore for forecasting use case
      logger.warn('RunStore.listRuns requires prId, consider using TenantStore for forecasting');
      return [];
    }

    return [];
  }

  /**
   * Convert a Run or SaaSRun to HistoricalRunData format
   */
  private convertRun(run: Run | SaaSRun, tenantId?: string): HistoricalRunData {
    // Calculate complexity from run data
    // If not available, estimate from other factors
    const complexity = this.estimateComplexity(run);

    // Calculate files changed, lines added/deleted from run result
    const { filesChanged, linesAdded, linesDeleted } = this.extractFileChanges(run);

    // Calculate total tokens used
    const tokensUsed = this.calculateTotalTokens(run);

    // Determine success based on status and result
    const success = run.status === 'completed' && !run.error;

    // Calculate duration
    const durationMs = run.completedAt && run.createdAt
      ? run.completedAt.getTime() - run.createdAt.getTime()
      : run.durationMs ?? null;

    // Get tenant ID from SaaSRun or parameter
    const effectiveTenantId = 'tenantId' in run ? run.tenantId : tenantId;

    return {
      runId: run.id,
      timestamp: run.createdAt,
      runType: run.type,
      complexity,
      filesChanged,
      linesAdded,
      linesDeleted,
      success,
      durationMs,
      tokensUsed,
      stepsCompleted: run.steps.filter(s => s.status === 'completed').length,
      totalSteps: run.steps.length,
      tenantId: effectiveTenantId,
      repoFullName: 'repoId' in run ? run.repoId : undefined,
    };
  }

  /**
   * Estimate complexity from run data
   */
  private estimateComplexity(run: Run | SaaSRun): number {
    // Try to get complexity from triage step output
    const triageStep = run.steps.find(s => s.agent === 'triage');
    if (triageStep?.output && typeof triageStep.output === 'object') {
      const output = triageStep.output as Record<string, unknown>;
      if (typeof output.complexity === 'number') {
        return Math.min(5, Math.max(1, output.complexity));
      }
      if (typeof output.score === 'number') {
        // Convert score (0-100) to complexity (1-5)
        return Math.min(5, Math.max(1, Math.ceil(output.score / 20)));
      }
    }

    // Fallback: estimate from run type and step count
    const baseComplexity: Record<string, number> = {
      triage: 1,
      plan: 2,
      resolve: 4,
      review: 2,
      autopilot: 5,
    };

    return baseComplexity[run.type] ?? 3;
  }

  /**
   * Extract file change information from run result
   */
  private extractFileChanges(run: Run | SaaSRun): {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  } {
    // Try to get from run result
    if (run.result && typeof run.result === 'object') {
      const result = run.result as Record<string, unknown>;

      if (Array.isArray(result.changes)) {
        return {
          filesChanged: result.changes.length,
          linesAdded: 0, // Not available in current schema
          linesDeleted: 0,
        };
      }
    }

    // Try to get from step outputs
    for (const step of run.steps) {
      if (step.output && typeof step.output === 'object') {
        const output = step.output as Record<string, unknown>;

        if (typeof output.filesChanged === 'number') {
          return {
            filesChanged: output.filesChanged as number,
            linesAdded: (output.linesAdded as number) ?? 0,
            linesDeleted: (output.linesDeleted as number) ?? 0,
          };
        }
      }
    }

    // Default to 0 if not found
    return {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
    };
  }

  /**
   * Calculate total tokens used across all steps
   */
  private calculateTotalTokens(run: Run | SaaSRun): number | undefined {
    // Check for SaaS-specific token tracking
    if ('tokensUsed' in run && run.tokensUsed) {
      const tokens = run.tokensUsed;
      if (typeof tokens.total === 'number') {
        return tokens.total;
      }
    }

    // Sum tokens from individual steps
    let total = 0;
    let hasTokens = false;

    for (const step of run.steps) {
      if (step.tokensUsed) {
        hasTokens = true;
        total += step.tokensUsed.input + step.tokensUsed.output;
      }
    }

    return hasTokens ? total : undefined;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a run data collector from stores
 *
 * @param runStore - Local run store (for CLI usage)
 * @param tenantStore - Tenant store (for SaaS usage)
 * @returns Run data collector instance
 */
export function createRunDataCollector(
  runStore?: RunStore,
  tenantStore?: TenantStore
): RunDataCollector {
  return new RunDataCollector(runStore, tenantStore);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Merge multiple collection results
 *
 * @param results - Collection results to merge
 * @returns Merged collection result
 */
export function mergeCollectionResults(
  ...results: CollectionResult[]
): CollectionResult {
  const allData: HistoricalRunData[] = [];

  for (const result of results) {
    allData.push(...result.data);
  }

  // Sort by timestamp and deduplicate by runId
  const seen = new Set<string>();
  const dedupedData = allData
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .filter(d => {
      if (seen.has(d.runId)) {
        return false;
      }
      seen.add(d.runId);
      return true;
    });

  return {
    data: dedupedData,
    metadata: {
      totalFound: results.reduce((sum, r) => sum + r.metadata.totalFound, 0),
      included: dedupedData.length,
      excluded: results.reduce((sum, r) => sum + r.metadata.excluded, 0),
      collectedAt: new Date(),
      options: {}, // Merged results don't have specific options
      statistics: calculateRunStatistics(dedupedData),
    },
  };
}

/**
 * Filter collection result by date range
 *
 * @param result - Collection result to filter
 * @param sinceDate - Start date
 * @param untilDate - End date
 * @returns Filtered collection result
 */
export function filterByDateRange(
  result: CollectionResult,
  sinceDate?: Date,
  untilDate?: Date
): CollectionResult {
  const filteredData = result.data.filter(d => {
    if (sinceDate && d.timestamp < sinceDate) {
      return false;
    }
    if (untilDate && d.timestamp > untilDate) {
      return false;
    }
    return true;
  });

  return {
    data: filteredData,
    metadata: {
      ...result.metadata,
      included: filteredData.length,
      excluded: result.metadata.totalFound - filteredData.length,
      statistics: calculateRunStatistics(filteredData),
    },
  };
}

/**
 * Group collection result by run type
 *
 * @param result - Collection result to group
 * @returns Map of run type to collection result
 */
export function groupByRunType(
  result: CollectionResult
): Map<string, CollectionResult> {
  const groups = new Map<string, HistoricalRunData[]>();

  for (const data of result.data) {
    const existing = groups.get(data.runType) ?? [];
    existing.push(data);
    groups.set(data.runType, existing);
  }

  const groupedResults = new Map<string, CollectionResult>();

  for (const [runType, data] of groups) {
    groupedResults.set(runType, {
      data,
      metadata: {
        totalFound: data.length,
        included: data.length,
        excluded: 0,
        collectedAt: result.metadata.collectedAt,
        options: { ...result.metadata.options, runType: runType as CollectorOptions['runType'] },
        statistics: calculateRunStatistics(data),
      },
    });
  }

  return groupedResults;
}
