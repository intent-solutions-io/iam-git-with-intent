/**
 * Phase 51: Canonical Time-Series Schema v1
 *
 * Defines the canonical data model for time-series data in @gwi/core:
 * - Canonical series object model with ML-ready features
 * - Point model with timestamp rules and validation
 * - Metadata, labels, and tags schema
 * - Runtime validators with stable error codes
 * - Schema versioning with migration support
 * - Multi-resolution and streaming support
 *
 * @module @gwi/core/time-series
 */

import { z } from 'zod';

// =============================================================================
// SCHEMA VERSION
// =============================================================================

/**
 * Current schema version following semver
 * Major: Breaking changes to point/series structure
 * Minor: New optional fields
 * Patch: Bug fixes to validation
 */
export const TIME_SERIES_SCHEMA_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES (stable, documented)
// =============================================================================

export const TimeSeriesErrorCodes = {
  // Timestamp errors (1xxx)
  INVALID_TIMESTAMP: 'TS_1001',
  TIMESTAMP_OUT_OF_RANGE: 'TS_1002',
  NON_MONOTONIC_TIMESTAMPS: 'TS_1003',
  INVALID_TIMEZONE: 'TS_1004',
  FUTURE_TIMESTAMP: 'TS_1005',

  // Value errors (2xxx)
  INVALID_VALUE: 'TS_2001',
  VALUE_OUT_OF_RANGE: 'TS_2002',
  MISSING_REQUIRED_VALUE: 'TS_2003',
  TYPE_MISMATCH: 'TS_2004',

  // Series errors (3xxx)
  INVALID_SERIES_ID: 'TS_3001',
  DUPLICATE_SERIES_ID: 'TS_3002',
  MISSING_TENANT_ID: 'TS_3003',
  INVALID_METADATA: 'TS_3004',
  SCHEMA_VERSION_MISMATCH: 'TS_3005',

  // Label/tag errors (4xxx)
  INVALID_LABEL_KEY: 'TS_4001',
  INVALID_LABEL_VALUE: 'TS_4002',
  TOO_MANY_LABELS: 'TS_4003',
  RESERVED_LABEL: 'TS_4004',

  // Resolution errors (5xxx)
  INVALID_RESOLUTION: 'TS_5001',
  RESOLUTION_MISMATCH: 'TS_5002',
  UNSUPPORTED_AGGREGATION: 'TS_5003',
} as const;

export type TimeSeriesErrorCode =
  (typeof TimeSeriesErrorCodes)[keyof typeof TimeSeriesErrorCodes];

// =============================================================================
// TIME RESOLUTION
// =============================================================================

/**
 * Supported time resolutions for series data
 */
export type TimeResolution =
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

export const TimeResolutionMs: Record<TimeResolution, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000, // Approximate
  quarter: 91 * 24 * 60 * 60 * 1000, // Approximate
  year: 365 * 24 * 60 * 60 * 1000, // Approximate
};

// =============================================================================
// AGGREGATION TYPES
// =============================================================================

/**
 * Supported aggregation methods for downsampling
 */
export type AggregationType =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'first'
  | 'last'
  | 'median'
  | 'stddev'
  | 'variance'
  | 'percentile_90'
  | 'percentile_95'
  | 'percentile_99';

// =============================================================================
// VALUE TYPES
// =============================================================================

/**
 * Data types for series values
 */
export type SeriesValueType =
  | 'numeric'
  | 'integer'
  | 'boolean'
  | 'categorical'
  | 'text'
  | 'json';

// =============================================================================
// CANONICAL POINT MODEL
// =============================================================================

/**
 * Canonical data point with full metadata
 */
export interface CanonicalPoint {
  /** Unix timestamp in milliseconds (UTC) */
  timestamp: number;

  /** Primary value (required) */
  value: number | boolean | string | null;

  /** Confidence/quality score 0-1 (ML-ready) */
  confidence?: number;

  /** Additional numeric values for multivariate series */
  additionalValues?: Record<string, number>;

  /** Point-level tags for filtering */
  tags?: Record<string, string>;

  /** Anomaly flag (ML-ready) */
  isAnomaly?: boolean;

  /** Anomaly score if detected (ML-ready) */
  anomalyScore?: number;

  /** Original value before any transformation */
  rawValue?: number | boolean | string | null;

  /** Processing metadata */
  processingMetadata?: {
    /** Source connector ID */
    sourceConnectorId?: string;
    /** Ingestion timestamp */
    ingestedAt?: number;
    /** Transformation applied */
    transformation?: string;
    /** Batch ID for traceability */
    batchId?: string;
  };
}

/**
 * Lightweight point for high-frequency streaming
 */
export interface StreamingPoint {
  /** Unix timestamp in milliseconds (UTC) */
  t: number;
  /** Primary value */
  v: number | null;
  /** Quality flag (0=bad, 1=good, 2=uncertain) */
  q?: 0 | 1 | 2;
}

// =============================================================================
// CANONICAL SERIES MODEL
// =============================================================================

/**
 * Series metadata for provenance and ML features
 */
export interface SeriesMetadata {
  /** Human-readable name */
  displayName?: string;

  /** Description of what this series measures */
  description?: string;

  /** Unit of measurement (e.g., "requests/sec", "USD", "celsius") */
  unit?: string;

  /** Value type */
  valueType: SeriesValueType;

  /** Native resolution of the data */
  nativeResolution: TimeResolution;

  /** Expected data range for validation */
  expectedRange?: {
    min?: number;
    max?: number;
  };

  /** Seasonality hints for forecasting (ML-ready) */
  seasonality?: {
    daily?: boolean;
    weekly?: boolean;
    monthly?: boolean;
    yearly?: boolean;
    customPeriods?: number[]; // In native resolution units
  };

  /** Trend characteristics (ML-ready) */
  trendType?: 'stationary' | 'trending' | 'seasonal' | 'random_walk';

  /** Fill strategy for missing values */
  fillStrategy?: 'none' | 'forward_fill' | 'backward_fill' | 'interpolate' | 'zero';

  /** Aggregation method when downsampling */
  defaultAggregation: AggregationType;

  /** Whether negative values are allowed */
  allowNegative: boolean;

  /** Whether null/missing values are allowed */
  allowNull: boolean;

  /** Custom properties for extensibility */
  customProperties?: Record<string, unknown>;
}

/**
 * Source provenance information
 */
export interface SeriesProvenance {
  /** Source system identifier */
  sourceSystem: string;

  /** Source connector ID */
  connectorId?: string;

  /** Original series identifier in source */
  sourceSeriesId?: string;

  /** Original schema/table in source */
  sourceSchema?: string;

  /** Extraction timestamp */
  extractedAt: number;

  /** Transformation lineage */
  transformations?: Array<{
    type: string;
    parameters?: Record<string, unknown>;
    appliedAt: number;
  }>;

  /** Data quality score from source */
  sourceQuality?: number;
}

/**
 * Labels for series identification and filtering
 * Following Prometheus-style label conventions
 */
export interface SeriesLabels {
  /** Tenant identifier (required for multi-tenancy) */
  tenantId: string;

  /** Workspace/project within tenant */
  workspaceId?: string;

  /** Environment (prod, staging, dev) */
  environment?: string;

  /** Application or service name */
  service?: string;

  /** Region or location */
  region?: string;

  /** Custom dimension labels */
  dimensions?: Record<string, string>;
}

/**
 * Canonical time series definition
 */
export interface CanonicalSeries {
  /** Unique series identifier (UUID v4 or tenant-scoped) */
  id: string;

  /** Schema version for migration support */
  schemaVersion: string;

  /** Series name (unique within tenant/workspace) */
  name: string;

  /** Labels for identification and filtering */
  labels: SeriesLabels;

  /** Series metadata */
  metadata: SeriesMetadata;

  /** Source provenance */
  provenance: SeriesProvenance;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Retention policy override (days, 0 = use default) */
  retentionDays?: number;

  /** Whether series is active */
  isActive: boolean;

  /** Soft delete timestamp */
  deletedAt?: number;

  /** Series state */
  state: SeriesState;

  /** Statistics (updated periodically) */
  statistics?: SeriesStatistics;
}

/**
 * Series state machine
 */
export type SeriesState =
  | 'pending' // Created but no data yet
  | 'active' // Receiving data
  | 'stale' // No recent data
  | 'paused' // Manually paused
  | 'archived' // Historical only
  | 'deleted'; // Soft deleted

/**
 * Series statistics for monitoring and optimization
 */
export interface SeriesStatistics {
  /** Total point count */
  pointCount: number;

  /** First data point timestamp */
  firstTimestamp?: number;

  /** Last data point timestamp */
  lastTimestamp?: number;

  /** Value statistics */
  valueStats?: {
    min: number;
    max: number;
    mean: number;
    stddev: number;
    nullCount: number;
  };

  /** Data quality metrics */
  qualityMetrics?: {
    missingRatio: number;
    anomalyRatio: number;
    duplicateRatio: number;
  };

  /** Last statistics update */
  computedAt: number;
}

// =============================================================================
// BATCH AND STREAMING MODELS
// =============================================================================

/**
 * Batch of points for ingestion
 */
export interface PointBatch {
  /** Series ID */
  seriesId: string;

  /** Batch identifier for idempotency */
  batchId: string;

  /** Points in the batch */
  points: CanonicalPoint[];

  /** Batch metadata */
  metadata?: {
    /** Source system */
    source?: string;
    /** Correlation ID for tracing */
    correlationId?: string;
    /** Expected point count for validation */
    expectedCount?: number;
    /** Checksum for integrity */
    checksum?: string;
  };
}

/**
 * Streaming batch for high-frequency data
 */
export interface StreamingBatch {
  /** Series ID */
  seriesId: string;

  /** Sequence number for ordering */
  sequenceNumber: number;

  /** Lightweight points */
  points: StreamingPoint[];

  /** Timestamp of batch creation */
  createdAt: number;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

const labelKeyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const seriesIdRegex = /^[a-zA-Z0-9_-]+$/;

export const CanonicalPointSchema = z.object({
  timestamp: z
    .number()
    .int()
    .positive()
    .refine(
      (ts) => ts <= Date.now() + 60000, // Allow 1 minute future tolerance
      { message: 'Timestamp cannot be more than 1 minute in the future' }
    ),
  value: z.union([z.number(), z.boolean(), z.string(), z.null()]),
  confidence: z.number().min(0).max(1).optional(),
  additionalValues: z.record(z.string(), z.number()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  isAnomaly: z.boolean().optional(),
  anomalyScore: z.number().min(0).max(1).optional(),
  rawValue: z.union([z.number(), z.boolean(), z.string(), z.null()]).optional(),
  processingMetadata: z
    .object({
      sourceConnectorId: z.string().optional(),
      ingestedAt: z.number().optional(),
      transformation: z.string().optional(),
      batchId: z.string().optional(),
    })
    .optional(),
});

export const StreamingPointSchema = z.object({
  t: z.number().int().positive(),
  v: z.union([z.number(), z.null()]),
  q: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

export const SeriesLabelsSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().optional(),
  environment: z.string().optional(),
  service: z.string().optional(),
  region: z.string().optional(),
  dimensions: z
    .record(
      z.string().regex(labelKeyRegex, { message: 'Invalid label key format' }),
      z.string()
    )
    .optional()
    .refine((dims) => !dims || Object.keys(dims).length <= 50, {
      message: 'Maximum 50 dimension labels allowed',
    }),
});

export const SeriesMetadataSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  valueType: z.enum([
    'numeric',
    'integer',
    'boolean',
    'categorical',
    'text',
    'json',
  ]),
  nativeResolution: z.enum([
    'millisecond',
    'second',
    'minute',
    'hour',
    'day',
    'week',
    'month',
    'quarter',
    'year',
  ]),
  expectedRange: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  seasonality: z
    .object({
      daily: z.boolean().optional(),
      weekly: z.boolean().optional(),
      monthly: z.boolean().optional(),
      yearly: z.boolean().optional(),
      customPeriods: z.array(z.number().positive()).optional(),
    })
    .optional(),
  trendType: z
    .enum(['stationary', 'trending', 'seasonal', 'random_walk'])
    .optional(),
  fillStrategy: z
    .enum(['none', 'forward_fill', 'backward_fill', 'interpolate', 'zero'])
    .optional(),
  defaultAggregation: z.enum([
    'sum',
    'avg',
    'min',
    'max',
    'count',
    'first',
    'last',
    'median',
    'stddev',
    'variance',
    'percentile_90',
    'percentile_95',
    'percentile_99',
  ]),
  allowNegative: z.boolean(),
  allowNull: z.boolean(),
  customProperties: z.record(z.string(), z.unknown()).optional(),
});

export const SeriesProvenanceSchema = z.object({
  sourceSystem: z.string().min(1),
  connectorId: z.string().optional(),
  sourceSeriesId: z.string().optional(),
  sourceSchema: z.string().optional(),
  extractedAt: z.number().int().positive(),
  transformations: z
    .array(
      z.object({
        type: z.string(),
        parameters: z.record(z.string(), z.unknown()).optional(),
        appliedAt: z.number().int().positive(),
      })
    )
    .optional(),
  sourceQuality: z.number().min(0).max(1).optional(),
});

export const CanonicalSeriesSchema = z.object({
  id: z.string().regex(seriesIdRegex, { message: 'Invalid series ID format' }),
  schemaVersion: z.string(),
  name: z.string().min(1).max(256),
  labels: SeriesLabelsSchema,
  metadata: SeriesMetadataSchema,
  provenance: SeriesProvenanceSchema,
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  retentionDays: z.number().int().min(0).optional(),
  isActive: z.boolean(),
  deletedAt: z.number().int().positive().optional(),
  state: z.enum([
    'pending',
    'active',
    'stale',
    'paused',
    'archived',
    'deleted',
  ]),
  statistics: z
    .object({
      pointCount: z.number().int().min(0),
      firstTimestamp: z.number().optional(),
      lastTimestamp: z.number().optional(),
      valueStats: z
        .object({
          min: z.number(),
          max: z.number(),
          mean: z.number(),
          stddev: z.number(),
          nullCount: z.number().int().min(0),
        })
        .optional(),
      qualityMetrics: z
        .object({
          missingRatio: z.number().min(0).max(1),
          anomalyRatio: z.number().min(0).max(1),
          duplicateRatio: z.number().min(0).max(1),
        })
        .optional(),
      computedAt: z.number().int().positive(),
    })
    .optional(),
});

export const PointBatchSchema = z.object({
  seriesId: z.string().regex(seriesIdRegex),
  batchId: z.string().min(1),
  points: z.array(CanonicalPointSchema),
  metadata: z
    .object({
      source: z.string().optional(),
      correlationId: z.string().optional(),
      expectedCount: z.number().int().positive().optional(),
      checksum: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export interface TSValidationError {
  code: TimeSeriesErrorCode;
  message: string;
  path?: string;
  value?: unknown;
}

export interface TSValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: TSValidationError[];
}

// =============================================================================
// VALIDATORS
// =============================================================================

/**
 * Validate a canonical point
 */
export function validatePoint(point: unknown): TSValidationResult<CanonicalPoint> {
  const result = CanonicalPointSchema.safeParse(point);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: TSValidationError[] = result.error.issues.map((issue) => ({
    code: mapZodErrorToCode(issue),
    message: issue.message,
    path: issue.path.join('.'),
    value: (point as Record<string, unknown>)?.[issue.path[0] as string],
  }));

  return { success: false, errors };
}

/**
 * Validate a canonical series definition
 */
export function validateSeries(
  series: unknown
): TSValidationResult<CanonicalSeries> {
  const result = CanonicalSeriesSchema.safeParse(series);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: TSValidationError[] = result.error.issues.map((issue) => ({
    code: mapZodErrorToCode(issue),
    message: issue.message,
    path: issue.path.join('.'),
  }));

  return { success: false, errors };
}

/**
 * Validate a batch of points including monotonicity check
 */
export function validatePointBatch(
  batch: unknown,
  enforceMonotonic = false
): TSValidationResult<PointBatch> {
  const result = PointBatchSchema.safeParse(batch);

  if (!result.success) {
    const errors: TSValidationError[] = result.error.issues.map((issue) => ({
      code: mapZodErrorToCode(issue),
      message: issue.message,
      path: issue.path.join('.'),
    }));
    return { success: false, errors };
  }

  // Check monotonicity if required
  if (enforceMonotonic && result.data.points.length > 1) {
    const errors: TSValidationError[] = [];
    for (let i = 1; i < result.data.points.length; i++) {
      if (result.data.points[i].timestamp <= result.data.points[i - 1].timestamp) {
        errors.push({
          code: TimeSeriesErrorCodes.NON_MONOTONIC_TIMESTAMPS,
          message: `Timestamp at index ${i} is not monotonically increasing`,
          path: `points.${i}.timestamp`,
          value: result.data.points[i].timestamp,
        });
      }
    }
    if (errors.length > 0) {
      return { success: false, errors };
    }
  }

  return { success: true, data: result.data };
}

/**
 * Validate series labels
 */
export function validateLabels(
  labels: unknown
): TSValidationResult<SeriesLabels> {
  const result = SeriesLabelsSchema.safeParse(labels);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: TSValidationError[] = result.error.issues.map((issue) => ({
    code: mapZodErrorToCode(issue),
    message: issue.message,
    path: issue.path.join('.'),
  }));

  return { success: false, errors };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function mapZodErrorToCode(issue: z.ZodIssue): TimeSeriesErrorCode {
  const path = issue.path.join('.');

  if (path.includes('timestamp')) {
    if (issue.code === 'too_small' || issue.code === 'too_big') {
      return TimeSeriesErrorCodes.TIMESTAMP_OUT_OF_RANGE;
    }
    return TimeSeriesErrorCodes.INVALID_TIMESTAMP;
  }

  if (path.includes('value') && !path.includes('additionalValues')) {
    if (issue.code === 'invalid_type') {
      return TimeSeriesErrorCodes.TYPE_MISMATCH;
    }
    return TimeSeriesErrorCodes.INVALID_VALUE;
  }

  if (path.includes('tenantId')) {
    return TimeSeriesErrorCodes.MISSING_TENANT_ID;
  }

  // Check labels/dimensions BEFORE id check (dimensions keys may contain 'id')
  if (path.includes('labels') || path.includes('dimensions')) {
    if (issue.message?.includes('50')) {
      return TimeSeriesErrorCodes.TOO_MANY_LABELS;
    }
    if (issue.message?.includes('Invalid label key')) {
      return TimeSeriesErrorCodes.INVALID_LABEL_KEY;
    }
    return TimeSeriesErrorCodes.INVALID_LABEL_VALUE;
  }

  // Check for series ID - use exact field names
  if (path === 'id' || path === 'seriesId' || path.endsWith('.id') || path.endsWith('.seriesId')) {
    return TimeSeriesErrorCodes.INVALID_SERIES_ID;
  }

  if (path.includes('schemaVersion')) {
    return TimeSeriesErrorCodes.SCHEMA_VERSION_MISMATCH;
  }

  if (path.includes('Resolution') || path.includes('resolution')) {
    return TimeSeriesErrorCodes.INVALID_RESOLUTION;
  }

  return TimeSeriesErrorCodes.INVALID_METADATA;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a new canonical series with defaults
 */
export function createSeries(
  params: Pick<CanonicalSeries, 'id' | 'name' | 'labels' | 'provenance'> &
    Partial<Omit<CanonicalSeries, 'id' | 'name' | 'labels' | 'provenance'>>
): CanonicalSeries {
  const now = Date.now();
  return {
    schemaVersion: TIME_SERIES_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    state: 'pending',
    metadata: {
      valueType: 'numeric',
      nativeResolution: 'minute',
      defaultAggregation: 'avg',
      allowNegative: true,
      allowNull: false,
    },
    ...params,
  };
}

/**
 * Create a canonical point
 */
export function createPoint(
  timestamp: number,
  value: number | boolean | string | null,
  options?: Partial<Omit<CanonicalPoint, 'timestamp' | 'value'>>
): CanonicalPoint {
  return {
    timestamp,
    value,
    ...options,
  };
}

/**
 * Create a point batch
 */
export function createPointBatch(
  seriesId: string,
  points: CanonicalPoint[],
  options?: Partial<Omit<PointBatch, 'seriesId' | 'points'>>
): PointBatch {
  return {
    seriesId,
    batchId: options?.batchId ?? `batch_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    points,
    ...options,
  };
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert streaming points to canonical points
 */
export function streamingToCanonical(
  points: StreamingPoint[],
  sourceConnectorId?: string
): CanonicalPoint[] {
  return points.map((p) => ({
    timestamp: p.t,
    value: p.v,
    confidence: p.q === 1 ? 1 : p.q === 2 ? 0.5 : 0,
    processingMetadata: sourceConnectorId ? { sourceConnectorId } : undefined,
  }));
}

/**
 * Convert canonical points to streaming format
 */
export function canonicalToStreaming(points: CanonicalPoint[]): StreamingPoint[] {
  return points.map((p) => ({
    t: p.timestamp,
    v: typeof p.value === 'number' ? p.value : null,
    q: p.confidence !== undefined
      ? p.confidence >= 0.9
        ? 1
        : p.confidence >= 0.5
          ? 2
          : 0
      : 1,
  }));
}

// =============================================================================
// AGGREGATION UTILITIES
// =============================================================================

/**
 * Aggregate points to a lower resolution
 */
export function aggregatePoints(
  points: CanonicalPoint[],
  targetResolution: TimeResolution,
  aggregation: AggregationType
): CanonicalPoint[] {
  if (points.length === 0) return [];

  const bucketMs = TimeResolutionMs[targetResolution];
  const buckets = new Map<number, CanonicalPoint[]>();

  // Group points into buckets
  for (const point of points) {
    const bucketStart = Math.floor(point.timestamp / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(point);
    buckets.set(bucketStart, bucket);
  }

  // Aggregate each bucket
  const result: CanonicalPoint[] = [];
  for (const [timestamp, bucket] of buckets) {
    const values = bucket
      .map((p) => p.value)
      .filter((v): v is number => typeof v === 'number');

    if (values.length === 0) {
      result.push({ timestamp, value: null });
      continue;
    }

    let aggregatedValue: number;
    switch (aggregation) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      case 'first':
        aggregatedValue = values[0];
        break;
      case 'last':
        aggregatedValue = values[values.length - 1];
        break;
      case 'median': {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        aggregatedValue =
          sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
        break;
      }
      case 'stddev': {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map((v) => Math.pow(v - mean, 2));
        aggregatedValue = Math.sqrt(
          squareDiffs.reduce((a, b) => a + b, 0) / values.length
        );
        break;
      }
      case 'variance': {
        const meanVal = values.reduce((a, b) => a + b, 0) / values.length;
        const sqDiffs = values.map((v) => Math.pow(v - meanVal, 2));
        aggregatedValue = sqDiffs.reduce((a, b) => a + b, 0) / values.length;
        break;
      }
      case 'percentile_90':
        aggregatedValue = percentile(values, 90);
        break;
      case 'percentile_95':
        aggregatedValue = percentile(values, 95);
        break;
      case 'percentile_99':
        aggregatedValue = percentile(values, 99);
        break;
      default:
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
    }

    result.push({
      timestamp,
      value: aggregatedValue,
      additionalValues: {
        count: bucket.length,
        nullCount: bucket.filter((p) => p.value === null).length,
      },
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// =============================================================================
// STATISTICS COMPUTATION
// =============================================================================

/**
 * Compute statistics for a series from its points
 */
export function computeStatistics(points: CanonicalPoint[]): SeriesStatistics {
  const numericValues = points
    .map((p) => p.value)
    .filter((v): v is number => typeof v === 'number');

  const timestamps = points.map((p) => p.timestamp);
  const nullCount = points.filter((p) => p.value === null).length;
  const anomalyCount = points.filter((p) => p.isAnomaly).length;

  // Detect duplicates by timestamp
  const uniqueTimestamps = new Set(timestamps);
  const duplicateCount = timestamps.length - uniqueTimestamps.size;

  let valueStats: SeriesStatistics['valueStats'];
  if (numericValues.length > 0) {
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const mean = sum / numericValues.length;
    const squareDiffs = numericValues.map((v) => Math.pow(v - mean, 2));
    const variance =
      squareDiffs.reduce((a, b) => a + b, 0) / numericValues.length;

    valueStats = {
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      mean,
      stddev: Math.sqrt(variance),
      nullCount,
    };
  }

  return {
    pointCount: points.length,
    firstTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
    lastTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
    valueStats,
    qualityMetrics:
      points.length > 0
        ? {
            missingRatio: nullCount / points.length,
            anomalyRatio: anomalyCount / points.length,
            duplicateRatio: duplicateCount / points.length,
          }
        : undefined,
    computedAt: Date.now(),
  };
}

// =============================================================================
// MIGRATION UTILITIES
// =============================================================================

/**
 * Schema migration definition
 */
export interface SchemaMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (series: unknown) => CanonicalSeries;
}

/**
 * Registry of schema migrations
 */
export const schemaMigrations: SchemaMigration[] = [
  // Future migrations will be added here
  // Example:
  // {
  //   fromVersion: '1.0.0',
  //   toVersion: '1.1.0',
  //   migrate: (series) => ({ ...series, newField: 'default' }),
  // },
];

/**
 * Migrate a series to the latest schema version
 */
export function migrateSeries(series: unknown): CanonicalSeries {
  let current = series as CanonicalSeries;

  // Apply migrations in sequence
  for (const migration of schemaMigrations) {
    if (current.schemaVersion === migration.fromVersion) {
      current = migration.migrate(current);
    }
  }

  // Validate final result
  const result = validateSeries(current);
  if (!result.success) {
    throw new Error(
      `Migration failed validation: ${result.errors?.map((e) => e.message).join(', ')}`
    );
  }

  return current;
}

// Types are already exported via interface/type declarations above
