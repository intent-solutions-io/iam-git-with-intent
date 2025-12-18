/**
 * Phase 54: Series Storage Layer
 *
 * Dual-layer storage for canonical time-series data:
 * - Hot storage (Firestore): Recent data for real-time queries
 * - Cold storage (BigQuery): Historical data for analytics
 * - Unified query interface with automatic routing
 * - Multi-tenant isolation
 * - Automatic data tiering and retention
 *
 * @module @gwi/core/series-storage
 */

import { z } from 'zod';
import type { CanonicalPoint, TimeResolution, AggregationType } from '../time-series/index.js';

// =============================================================================
// STORAGE CONTRACT VERSION
// =============================================================================

export const SERIES_STORAGE_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const SeriesStorageErrorCodes = {
  // Config errors (1xxx)
  INVALID_CONFIG: 'SS_1001',
  MISSING_PROJECT_ID: 'SS_1002',
  MISSING_DATASET: 'SS_1003',
  INVALID_TIER_CONFIG: 'SS_1004',

  // Connection errors (2xxx)
  CONNECTION_FAILED: 'SS_2001',
  AUTH_FAILED: 'SS_2002',
  TIMEOUT: 'SS_2003',
  QUOTA_EXCEEDED: 'SS_2004',

  // Query errors (3xxx)
  QUERY_FAILED: 'SS_3001',
  INVALID_TIME_RANGE: 'SS_3002',
  SERIES_NOT_FOUND: 'SS_3003',
  QUERY_TIMEOUT: 'SS_3004',

  // Write errors (4xxx)
  WRITE_FAILED: 'SS_4001',
  BATCH_TOO_LARGE: 'SS_4002',
  DUPLICATE_POINT: 'SS_4003',
  SCHEMA_MISMATCH: 'SS_4004',

  // Tiering errors (5xxx)
  TIER_FAILED: 'SS_5001',
  ARCHIVE_FAILED: 'SS_5002',
  RESTORE_FAILED: 'SS_5003',
  RETENTION_FAILED: 'SS_5004',
} as const;

export type SeriesStorageErrorCode =
  (typeof SeriesStorageErrorCodes)[keyof typeof SeriesStorageErrorCodes];

// =============================================================================
// STORAGE TIERS
// =============================================================================

export type StorageTier = 'hot' | 'warm' | 'cold' | 'archive';

export interface TierConfig {
  /** Tier name */
  tier: StorageTier;
  /** Max age in hours for this tier */
  maxAgeHours: number;
  /** Storage backend */
  backend: 'firestore' | 'bigquery' | 'gcs';
  /** Compression enabled */
  compression: boolean;
  /** Query latency SLA in ms */
  latencySlaMs: number;
}

export const DEFAULT_TIER_CONFIG: TierConfig[] = [
  { tier: 'hot', maxAgeHours: 24, backend: 'firestore', compression: false, latencySlaMs: 50 },
  { tier: 'warm', maxAgeHours: 168, backend: 'firestore', compression: true, latencySlaMs: 200 },
  { tier: 'cold', maxAgeHours: 8760, backend: 'bigquery', compression: true, latencySlaMs: 2000 },
  { tier: 'archive', maxAgeHours: Infinity, backend: 'gcs', compression: true, latencySlaMs: 30000 },
];

// =============================================================================
// STORAGE CONFIG
// =============================================================================

export interface SeriesStorageConfig {
  /** GCP Project ID */
  projectId: string;
  /** BigQuery dataset for cold storage */
  bigqueryDataset: string;
  /** Firestore collection prefix */
  firestorePrefix: string;
  /** GCS bucket for archive */
  gcsBucket?: string;
  /** Tier configuration */
  tiers: TierConfig[];
  /** Enable automatic tiering */
  autoTiering: boolean;
  /** Tiering interval in minutes */
  tieringIntervalMinutes: number;
  /** Retention policy in days */
  retentionDays: number;
  /** Max batch size for writes */
  maxBatchSize: number;
  /** Query timeout in ms */
  queryTimeoutMs: number;
  /** Enable query caching */
  queryCacheEnabled: boolean;
  /** Query cache TTL in seconds */
  queryCacheTtlSeconds: number;
}

// =============================================================================
// QUERY TYPES
// =============================================================================

export interface SeriesQuery {
  /** Tenant ID */
  tenantId: string;
  /** Series ID */
  seriesId: string;
  /** Start timestamp (inclusive) */
  startTime: number;
  /** End timestamp (exclusive) */
  endTime: number;
  /** Time resolution for downsampling */
  resolution?: TimeResolution;
  /** Aggregation type for downsampling */
  aggregation?: AggregationType;
  /** Label filters */
  labelFilters?: Record<string, string | string[]>;
  /** Limit number of points */
  limit?: number;
  /** Skip points (for pagination) */
  offset?: number;
  /** Force specific tier */
  forceTier?: StorageTier;
  /** Include metadata */
  includeMetadata?: boolean;
}

export interface SeriesQueryResult {
  /** Query that was executed */
  query: SeriesQuery;
  /** Resulting points */
  points: CanonicalPoint[];
  /** Total count (before limit/offset) */
  totalCount: number;
  /** Which tier served the query */
  servedFrom: StorageTier;
  /** Query execution time in ms */
  executionTimeMs: number;
  /** Whether result was cached */
  cached: boolean;
  /** Next page token (if more results) */
  nextPageToken?: string;
}

export interface MultiSeriesQuery {
  /** Tenant ID */
  tenantId: string;
  /** Series IDs to query */
  seriesIds: string[];
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Resolution for downsampling */
  resolution?: TimeResolution;
  /** Aggregation type */
  aggregation?: AggregationType;
  /** Common label filters */
  labelFilters?: Record<string, string | string[]>;
}

export interface MultiSeriesQueryResult {
  /** Query that was executed */
  query: MultiSeriesQuery;
  /** Results per series */
  series: Map<string, CanonicalPoint[]>;
  /** Execution time */
  executionTimeMs: number;
  /** Tiers used */
  tiersUsed: StorageTier[];
}

// =============================================================================
// WRITE TYPES
// =============================================================================

export interface WriteRequest {
  /** Tenant ID */
  tenantId: string;
  /** Series ID */
  seriesId: string;
  /** Points to write */
  points: CanonicalPoint[];
  /** Source connector ID */
  sourceConnectorId?: string;
  /** Batch ID for tracking */
  batchId?: string;
  /** Deduplication enabled */
  dedup?: boolean;
  /** Force write to specific tier */
  forceTier?: StorageTier;
}

export interface WriteResult {
  /** Whether write succeeded */
  success: boolean;
  /** Number of points written */
  pointsWritten: number;
  /** Number of duplicates skipped */
  duplicatesSkipped: number;
  /** Tier written to */
  tier: StorageTier;
  /** Write duration in ms */
  durationMs: number;
  /** Any errors */
  errors?: Array<{ point: CanonicalPoint; error: string }>;
}

export interface BatchWriteRequest {
  /** Multiple write requests */
  writes: WriteRequest[];
  /** Atomic write (all or nothing) */
  atomic?: boolean;
}

export interface BatchWriteResult {
  /** Overall success */
  success: boolean;
  /** Individual results */
  results: WriteResult[];
  /** Total points written */
  totalPointsWritten: number;
  /** Total duplicates */
  totalDuplicatesSkipped: number;
  /** Total duration */
  totalDurationMs: number;
}

// =============================================================================
// SERIES METADATA
// =============================================================================

export interface StoredSeriesMetadata {
  /** Series ID */
  seriesId: string;
  /** Tenant ID */
  tenantId: string;
  /** Series name */
  name: string;
  /** Description */
  description?: string;
  /** Labels */
  labels: Record<string, string>;
  /** Dimensions */
  dimensions: Record<string, string>;
  /** Unit of measurement */
  unit?: string;
  /** Data type */
  dataType: 'gauge' | 'counter' | 'histogram' | 'summary';
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** First point timestamp */
  firstPointAt?: number;
  /** Last point timestamp */
  lastPointAt?: number;
  /** Total point count */
  pointCount: number;
  /** Current storage tier */
  currentTier: StorageTier;
  /** Retention override (days) */
  retentionOverrideDays?: number;
}

// =============================================================================
// SERIES STORAGE INTERFACE
// =============================================================================

export interface ISeriesStorage {
  /** Write points to storage */
  write(request: WriteRequest): Promise<WriteResult>;

  /** Batch write multiple series */
  batchWrite(request: BatchWriteRequest): Promise<BatchWriteResult>;

  /** Query a single series */
  query(query: SeriesQuery): Promise<SeriesQueryResult>;

  /** Query multiple series */
  queryMultiple(query: MultiSeriesQuery): Promise<MultiSeriesQueryResult>;

  /** Get series metadata */
  getMetadata(tenantId: string, seriesId: string): Promise<StoredSeriesMetadata | null>;

  /** List series for tenant */
  listSeries(tenantId: string, filter?: {
    labelFilters?: Record<string, string>;
    prefix?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ series: StoredSeriesMetadata[]; total: number }>;

  /** Create or update series metadata */
  upsertMetadata(metadata: StoredSeriesMetadata): Promise<void>;

  /** Delete series and all data */
  deleteSeries(tenantId: string, seriesId: string): Promise<void>;

  /** Trigger tiering for a series */
  tierSeries(tenantId: string, seriesId: string): Promise<{
    pointsMoved: number;
    fromTier: StorageTier;
    toTier: StorageTier;
  }>;

  /** Get storage stats */
  getStats(tenantId: string): Promise<StorageStats>;
}

export interface StorageStats {
  /** Tenant ID */
  tenantId: string;
  /** Total series count */
  totalSeries: number;
  /** Total point count */
  totalPoints: number;
  /** Storage by tier */
  byTier: Record<StorageTier, {
    seriesCount: number;
    pointCount: number;
    bytesUsed: number;
  }>;
  /** Query stats */
  queryStats: {
    queriesLast24h: number;
    avgLatencyMs: number;
    cacheHitRate: number;
  };
  /** Write stats */
  writeStats: {
    pointsWrittenLast24h: number;
    avgBatchSize: number;
    errorRate: number;
  };
}

// =============================================================================
// IN-MEMORY IMPLEMENTATION
// =============================================================================

/**
 * In-memory series storage for development and testing
 */
export class InMemorySeriesStorage implements ISeriesStorage {
  private config: SeriesStorageConfig;
  private series: Map<string, StoredSeriesMetadata> = new Map();
  private points: Map<string, CanonicalPoint[]> = new Map();
  private queryCount = 0;
  private writeCount = 0;

  constructor(config: Partial<SeriesStorageConfig> = {}) {
    this.config = {
      projectId: config.projectId ?? 'test-project',
      bigqueryDataset: config.bigqueryDataset ?? 'test_dataset',
      firestorePrefix: config.firestorePrefix ?? 'series',
      tiers: config.tiers ?? DEFAULT_TIER_CONFIG,
      autoTiering: config.autoTiering ?? false,
      tieringIntervalMinutes: config.tieringIntervalMinutes ?? 60,
      retentionDays: config.retentionDays ?? 365,
      maxBatchSize: config.maxBatchSize ?? 10000,
      queryTimeoutMs: config.queryTimeoutMs ?? 30000,
      queryCacheEnabled: config.queryCacheEnabled ?? true,
      queryCacheTtlSeconds: config.queryCacheTtlSeconds ?? 60,
    };
  }

  /**
   * Get the storage configuration
   */
  getConfig(): SeriesStorageConfig {
    return this.config;
  }

  private getKey(tenantId: string, seriesId: string): string {
    return `${tenantId}:${seriesId}`;
  }

  async write(request: WriteRequest): Promise<WriteResult> {
    const start = Date.now();
    const key = this.getKey(request.tenantId, request.seriesId);

    let existing = this.points.get(key) ?? [];
    let duplicatesSkipped = 0;

    const newPoints: CanonicalPoint[] = [];
    for (const point of request.points) {
      if (request.dedup) {
        const isDup = existing.some(p => p.timestamp === point.timestamp);
        if (isDup) {
          duplicatesSkipped++;
          continue;
        }
      }
      newPoints.push(point);
    }

    existing = [...existing, ...newPoints].sort((a, b) => a.timestamp - b.timestamp);
    this.points.set(key, existing);

    // Update metadata
    let meta = this.series.get(key);
    if (!meta) {
      meta = {
        seriesId: request.seriesId,
        tenantId: request.tenantId,
        name: request.seriesId,
        labels: {},
        dimensions: {},
        dataType: 'gauge',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pointCount: 0,
        currentTier: 'hot',
      };
    }
    meta.updatedAt = Date.now();
    meta.pointCount = existing.length;
    if (existing.length > 0) {
      meta.firstPointAt = existing[0].timestamp;
      meta.lastPointAt = existing[existing.length - 1].timestamp;
    }
    this.series.set(key, meta);

    this.writeCount++;

    return {
      success: true,
      pointsWritten: newPoints.length,
      duplicatesSkipped,
      tier: 'hot',
      durationMs: Date.now() - start,
    };
  }

  async batchWrite(request: BatchWriteRequest): Promise<BatchWriteResult> {
    const start = Date.now();
    const results: WriteResult[] = [];
    let totalWritten = 0;
    let totalDuplicates = 0;

    for (const write of request.writes) {
      const result = await this.write(write);
      results.push(result);
      totalWritten += result.pointsWritten;
      totalDuplicates += result.duplicatesSkipped;
    }

    return {
      success: results.every(r => r.success),
      results,
      totalPointsWritten: totalWritten,
      totalDuplicatesSkipped: totalDuplicates,
      totalDurationMs: Date.now() - start,
    };
  }

  async query(query: SeriesQuery): Promise<SeriesQueryResult> {
    const start = Date.now();
    const key = this.getKey(query.tenantId, query.seriesId);

    let points = this.points.get(key) ?? [];

    // Filter by time range
    points = points.filter(
      p => p.timestamp >= query.startTime && p.timestamp < query.endTime
    );

    // Filter by labels (uses tags field on CanonicalPoint)
    if (query.labelFilters) {
      points = points.filter(p => {
        if (!p.tags) return true;
        for (const [k, v] of Object.entries(query.labelFilters!)) {
          const pointVal = p.tags[k];
          if (Array.isArray(v)) {
            if (!v.includes(pointVal)) return false;
          } else {
            if (pointVal !== v) return false;
          }
        }
        return true;
      });
    }

    const totalCount = points.length;

    // Apply offset and limit
    if (query.offset) {
      points = points.slice(query.offset);
    }
    if (query.limit) {
      points = points.slice(0, query.limit);
    }

    this.queryCount++;

    return {
      query,
      points,
      totalCount,
      servedFrom: 'hot',
      executionTimeMs: Date.now() - start,
      cached: false,
    };
  }

  async queryMultiple(query: MultiSeriesQuery): Promise<MultiSeriesQueryResult> {
    const start = Date.now();
    const seriesMap = new Map<string, CanonicalPoint[]>();

    for (const seriesId of query.seriesIds) {
      const result = await this.query({
        tenantId: query.tenantId,
        seriesId,
        startTime: query.startTime,
        endTime: query.endTime,
        resolution: query.resolution,
        aggregation: query.aggregation,
        labelFilters: query.labelFilters,
      });
      seriesMap.set(seriesId, result.points);
    }

    return {
      query,
      series: seriesMap,
      executionTimeMs: Date.now() - start,
      tiersUsed: ['hot'],
    };
  }

  async getMetadata(tenantId: string, seriesId: string): Promise<StoredSeriesMetadata | null> {
    const key = this.getKey(tenantId, seriesId);
    return this.series.get(key) ?? null;
  }

  async listSeries(
    tenantId: string,
    filter?: {
      labelFilters?: Record<string, string>;
      prefix?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ series: StoredSeriesMetadata[]; total: number }> {
    let results = Array.from(this.series.values()).filter(
      s => s.tenantId === tenantId
    );

    if (filter?.prefix) {
      results = results.filter(s => s.seriesId.startsWith(filter.prefix!));
    }

    if (filter?.labelFilters) {
      results = results.filter(s => {
        for (const [k, v] of Object.entries(filter.labelFilters!)) {
          if (s.labels[k] !== v) return false;
        }
        return true;
      });
    }

    const total = results.length;

    if (filter?.offset) {
      results = results.slice(filter.offset);
    }
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return { series: results, total };
  }

  async upsertMetadata(metadata: StoredSeriesMetadata): Promise<void> {
    const key = this.getKey(metadata.tenantId, metadata.seriesId);
    this.series.set(key, { ...metadata, updatedAt: Date.now() });
  }

  async deleteSeries(tenantId: string, seriesId: string): Promise<void> {
    const key = this.getKey(tenantId, seriesId);
    this.series.delete(key);
    this.points.delete(key);
  }

  async tierSeries(
    _tenantId: string,
    _seriesId: string
  ): Promise<{ pointsMoved: number; fromTier: StorageTier; toTier: StorageTier }> {
    // In-memory doesn't have real tiering
    return { pointsMoved: 0, fromTier: 'hot', toTier: 'hot' };
  }

  async getStats(tenantId: string): Promise<StorageStats> {
    const tenantSeries = Array.from(this.series.values()).filter(
      s => s.tenantId === tenantId
    );

    let totalPoints = 0;
    for (const [key, pts] of this.points.entries()) {
      if (key.startsWith(tenantId + ':')) {
        totalPoints += pts.length;
      }
    }

    return {
      tenantId,
      totalSeries: tenantSeries.length,
      totalPoints,
      byTier: {
        hot: { seriesCount: tenantSeries.length, pointCount: totalPoints, bytesUsed: totalPoints * 100 },
        warm: { seriesCount: 0, pointCount: 0, bytesUsed: 0 },
        cold: { seriesCount: 0, pointCount: 0, bytesUsed: 0 },
        archive: { seriesCount: 0, pointCount: 0, bytesUsed: 0 },
      },
      queryStats: {
        queriesLast24h: this.queryCount,
        avgLatencyMs: 5,
        cacheHitRate: 0,
      },
      writeStats: {
        pointsWrittenLast24h: this.writeCount * 100,
        avgBatchSize: 100,
        errorRate: 0,
      },
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.series.clear();
    this.points.clear();
    this.queryCount = 0;
    this.writeCount = 0;
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const SeriesStorageConfigSchema = z.object({
  projectId: z.string().min(1),
  bigqueryDataset: z.string().min(1),
  firestorePrefix: z.string().min(1),
  gcsBucket: z.string().optional(),
  tiers: z.array(
    z.object({
      tier: z.enum(['hot', 'warm', 'cold', 'archive']),
      maxAgeHours: z.number().positive(),
      backend: z.enum(['firestore', 'bigquery', 'gcs']),
      compression: z.boolean(),
      latencySlaMs: z.number().positive(),
    })
  ),
  autoTiering: z.boolean(),
  tieringIntervalMinutes: z.number().int().positive(),
  retentionDays: z.number().int().positive(),
  maxBatchSize: z.number().int().positive(),
  queryTimeoutMs: z.number().int().positive(),
  queryCacheEnabled: z.boolean(),
  queryCacheTtlSeconds: z.number().int().positive(),
});

export const SeriesQuerySchema = z.object({
  tenantId: z.string().min(1),
  seriesId: z.string().min(1),
  startTime: z.number().int(),
  endTime: z.number().int(),
  resolution: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']).optional(),
  aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'first', 'last', 'median', 'stddev', 'variance', 'percentile_90', 'percentile_95', 'percentile_99']).optional(),
  labelFilters: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  forceTier: z.enum(['hot', 'warm', 'cold', 'archive']).optional(),
  includeMetadata: z.boolean().optional(),
});

export const WriteRequestSchema = z.object({
  tenantId: z.string().min(1),
  seriesId: z.string().min(1),
  points: z.array(
    z.object({
      timestamp: z.number().int(),
      value: z.union([z.number(), z.boolean(), z.string(), z.null()]),
      labels: z.record(z.string()).optional(),
      dimensions: z.record(z.string()).optional(),
      quality: z.number().optional(),
      annotations: z.array(z.string()).optional(),
      processingMetadata: z.any().optional(),
    })
  ),
  sourceConnectorId: z.string().optional(),
  batchId: z.string().optional(),
  dedup: z.boolean().optional(),
  forceTier: z.enum(['hot', 'warm', 'cold', 'archive']).optional(),
});

export const StoredSeriesMetadataSchema = z.object({
  seriesId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  labels: z.record(z.string()),
  dimensions: z.record(z.string()),
  unit: z.string().optional(),
  dataType: z.enum(['gauge', 'counter', 'histogram', 'summary']),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  firstPointAt: z.number().int().optional(),
  lastPointAt: z.number().int().optional(),
  pointCount: z.number().int().nonnegative(),
  currentTier: z.enum(['hot', 'warm', 'cold', 'archive']),
  retentionOverrideDays: z.number().int().positive().optional(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateSeriesStorageConfig(
  config: unknown
): { success: boolean; data?: SeriesStorageConfig; errors?: string[] } {
  const result = SeriesStorageConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateSeriesQuery(
  query: unknown
): { success: boolean; data?: SeriesQuery; errors?: string[] } {
  const result = SeriesQuerySchema.safeParse(query);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateWriteRequest(
  request: unknown
): { success: boolean; data?: WriteRequest; errors?: string[] } {
  const result = WriteRequestSchema.safeParse(request);
  if (result.success) {
    return { success: true, data: result.data as WriteRequest };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateStoredSeriesMetadata(
  metadata: unknown
): { success: boolean; data?: StoredSeriesMetadata; errors?: string[] } {
  const result = StoredSeriesMetadataSchema.safeParse(metadata);
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
 * Create default storage configuration
 */
export function createSeriesStorageConfig(
  params: Pick<SeriesStorageConfig, 'projectId' | 'bigqueryDataset'> &
    Partial<SeriesStorageConfig>
): SeriesStorageConfig {
  return {
    firestorePrefix: 'series',
    tiers: DEFAULT_TIER_CONFIG,
    autoTiering: true,
    tieringIntervalMinutes: 60,
    retentionDays: 365,
    maxBatchSize: 10000,
    queryTimeoutMs: 30000,
    queryCacheEnabled: true,
    queryCacheTtlSeconds: 60,
    ...params,
  };
}

/**
 * Create a series query
 */
export function createSeriesQuery(
  params: Pick<SeriesQuery, 'tenantId' | 'seriesId' | 'startTime' | 'endTime'> &
    Partial<SeriesQuery>
): SeriesQuery {
  return { ...params };
}

/**
 * Create a write request
 */
export function createWriteRequest(
  params: Pick<WriteRequest, 'tenantId' | 'seriesId' | 'points'> &
    Partial<WriteRequest>
): WriteRequest {
  return {
    dedup: true,
    ...params,
  };
}

/**
 * Create series metadata
 */
export function createStoredSeriesMetadata(
  params: Pick<StoredSeriesMetadata, 'seriesId' | 'tenantId' | 'name'> &
    Partial<StoredSeriesMetadata>
): StoredSeriesMetadata {
  const now = Date.now();
  return {
    labels: {},
    dimensions: {},
    dataType: 'gauge',
    createdAt: now,
    updatedAt: now,
    pointCount: 0,
    currentTier: 'hot',
    ...params,
  };
}

// =============================================================================
// QUERY BUILDER
// =============================================================================

/**
 * Fluent query builder for series queries
 */
export class SeriesQueryBuilder {
  private query: Partial<SeriesQuery> = {};

  tenant(tenantId: string): this {
    this.query.tenantId = tenantId;
    return this;
  }

  series(seriesId: string): this {
    this.query.seriesId = seriesId;
    return this;
  }

  timeRange(startTime: number, endTime: number): this {
    this.query.startTime = startTime;
    this.query.endTime = endTime;
    return this;
  }

  last(hours: number): this {
    const now = Date.now();
    this.query.endTime = now;
    this.query.startTime = now - hours * 60 * 60 * 1000;
    return this;
  }

  resolution(res: TimeResolution): this {
    this.query.resolution = res;
    return this;
  }

  aggregation(agg: AggregationType): this {
    this.query.aggregation = agg;
    return this;
  }

  filterLabel(key: string, value: string | string[]): this {
    if (!this.query.labelFilters) {
      this.query.labelFilters = {};
    }
    this.query.labelFilters[key] = value;
    return this;
  }

  limit(n: number): this {
    this.query.limit = n;
    return this;
  }

  offset(n: number): this {
    this.query.offset = n;
    return this;
  }

  forceTier(tier: StorageTier): this {
    this.query.forceTier = tier;
    return this;
  }

  includeMetadata(): this {
    this.query.includeMetadata = true;
    return this;
  }

  build(): SeriesQuery {
    if (!this.query.tenantId || !this.query.seriesId) {
      throw new Error('tenantId and seriesId are required');
    }
    if (this.query.startTime === undefined || this.query.endTime === undefined) {
      throw new Error('Time range is required');
    }
    return this.query as SeriesQuery;
  }
}

/**
 * Create a new query builder
 */
export function queryBuilder(): SeriesQueryBuilder {
  return new SeriesQueryBuilder();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Determine which tier should serve a query based on time range
 */
export function determineTier(
  startTime: number,
  _endTime: number,
  tiers: TierConfig[]
): StorageTier {
  const now = Date.now();
  const maxAge = now - startTime;
  const maxAgeHours = maxAge / (60 * 60 * 1000);

  // Find the appropriate tier
  for (const tier of tiers.sort((a, b) => a.maxAgeHours - b.maxAgeHours)) {
    if (maxAgeHours <= tier.maxAgeHours) {
      return tier.tier;
    }
  }

  return 'archive';
}

/**
 * Estimate query cost based on tier and point count
 */
export function estimateQueryCost(
  tier: StorageTier,
  estimatedPoints: number
): { scanCost: number; networkCost: number; totalCost: number } {
  const tierCosts: Record<StorageTier, { scan: number; network: number }> = {
    hot: { scan: 0.0001, network: 0.00001 },
    warm: { scan: 0.00005, network: 0.00001 },
    cold: { scan: 0.00001, network: 0.000005 },
    archive: { scan: 0.000001, network: 0.00001 },
  };

  const costs = tierCosts[tier];
  const scanCost = costs.scan * estimatedPoints;
  const networkCost = costs.network * estimatedPoints;

  return {
    scanCost,
    networkCost,
    totalCost: scanCost + networkCost,
  };
}

/**
 * Calculate optimal batch sizes for writes
 */
export function calculateBatchSizes(
  totalPoints: number,
  maxBatchSize: number
): number[] {
  const batches: number[] = [];
  let remaining = totalPoints;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, maxBatchSize);
    batches.push(batchSize);
    remaining -= batchSize;
  }

  return batches;
}
