/**
 * Phase 51: Canonical Time-Series Schema Tests
 *
 * Comprehensive test suite covering:
 * - Schema validation with stable error codes
 * - Point and series creation
 * - Aggregation functions
 * - Statistics computation
 * - Streaming conversions
 * - Golden fixtures
 */

import { describe, it, expect } from 'vitest';
import {
  TIME_SERIES_SCHEMA_VERSION,
  TimeSeriesErrorCodes,
  validatePoint,
  validateSeries,
  validatePointBatch,
  validateLabels,
  createSeries,
  createPoint,
  createPointBatch,
  streamingToCanonical,
  canonicalToStreaming,
  aggregatePoints,
  computeStatistics,
  migrateSeries,
  CanonicalPoint,
  CanonicalSeries,
  StreamingPoint,
  SeriesLabels,
  PointBatch,
} from '../index.js';

// =============================================================================
// GOLDEN FIXTURES
// =============================================================================

const GOLDEN_VALID_POINT: CanonicalPoint = {
  timestamp: 1700000000000,
  value: 42.5,
  confidence: 0.95,
  additionalValues: { count: 10 },
  tags: { source: 'test' },
  isAnomaly: false,
};

const GOLDEN_VALID_LABELS: SeriesLabels = {
  tenantId: 'tenant-123',
  workspaceId: 'workspace-456',
  environment: 'production',
  service: 'api-gateway',
  region: 'us-east-1',
  dimensions: {
    host: 'server-01',
    instance: 'i-abc123',
  },
};

const GOLDEN_VALID_SERIES: CanonicalSeries = {
  id: 'series-001',
  schemaVersion: TIME_SERIES_SCHEMA_VERSION,
  name: 'api_request_latency',
  labels: GOLDEN_VALID_LABELS,
  metadata: {
    displayName: 'API Request Latency',
    description: 'P99 latency for API requests',
    unit: 'milliseconds',
    valueType: 'numeric',
    nativeResolution: 'second',
    expectedRange: { min: 0, max: 10000 },
    seasonality: { daily: true, weekly: true },
    trendType: 'stationary',
    fillStrategy: 'interpolate',
    defaultAggregation: 'avg',
    allowNegative: false,
    allowNull: true,
  },
  provenance: {
    sourceSystem: 'prometheus',
    connectorId: 'connector-prom-001',
    sourceSeriesId: 'http_request_duration_seconds',
    extractedAt: 1700000000000,
    transformations: [
      {
        type: 'unit_conversion',
        parameters: { from: 'seconds', to: 'milliseconds' },
        appliedAt: 1700000000000,
      },
    ],
    sourceQuality: 0.99,
  },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  retentionDays: 90,
  isActive: true,
  state: 'active',
  statistics: {
    pointCount: 86400,
    firstTimestamp: 1699913600000,
    lastTimestamp: 1700000000000,
    valueStats: {
      min: 5,
      max: 500,
      mean: 45.5,
      stddev: 25.3,
      nullCount: 0,
    },
    qualityMetrics: {
      missingRatio: 0.001,
      anomalyRatio: 0.005,
      duplicateRatio: 0,
    },
    computedAt: 1700000000000,
  },
};

const GOLDEN_VALID_BATCH: PointBatch = {
  seriesId: 'series-001',
  batchId: 'batch-001',
  points: [
    { timestamp: 1700000000000, value: 10 },
    { timestamp: 1700000001000, value: 15 },
    { timestamp: 1700000002000, value: 12 },
  ],
  metadata: {
    source: 'test',
    correlationId: 'trace-123',
    expectedCount: 3,
  },
};

// =============================================================================
// SCHEMA VERSION TESTS
// =============================================================================

describe('Schema Version', () => {
  it('should have a valid semver version', () => {
    expect(TIME_SERIES_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should be version 1.0.0', () => {
    expect(TIME_SERIES_SCHEMA_VERSION).toBe('1.0.0');
  });
});

// =============================================================================
// POINT VALIDATION TESTS
// =============================================================================

describe('Point Validation', () => {
  describe('Valid Points', () => {
    it('should validate golden fixture point', () => {
      const result = validatePoint(GOLDEN_VALID_POINT);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(GOLDEN_VALID_POINT);
    });

    it('should validate minimal point', () => {
      const result = validatePoint({ timestamp: 1700000000000, value: 42 });
      expect(result.success).toBe(true);
    });

    it('should validate point with null value', () => {
      const result = validatePoint({ timestamp: 1700000000000, value: null });
      expect(result.success).toBe(true);
    });

    it('should validate point with boolean value', () => {
      const result = validatePoint({ timestamp: 1700000000000, value: true });
      expect(result.success).toBe(true);
    });

    it('should validate point with string value', () => {
      const result = validatePoint({ timestamp: 1700000000000, value: 'high' });
      expect(result.success).toBe(true);
    });

    it('should validate point with confidence', () => {
      const result = validatePoint({
        timestamp: 1700000000000,
        value: 42,
        confidence: 0.95,
      });
      expect(result.success).toBe(true);
    });

    it('should validate point with anomaly flags', () => {
      const result = validatePoint({
        timestamp: 1700000000000,
        value: 999,
        isAnomaly: true,
        anomalyScore: 0.85,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid Points', () => {
    it('should reject point without timestamp', () => {
      const result = validatePoint({ value: 42 });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(TimeSeriesErrorCodes.INVALID_TIMESTAMP);
    });

    it('should reject negative timestamp', () => {
      const result = validatePoint({ timestamp: -1, value: 42 });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(
        TimeSeriesErrorCodes.TIMESTAMP_OUT_OF_RANGE
      );
    });

    it('should reject far future timestamp', () => {
      const result = validatePoint({
        timestamp: Date.now() + 3600000, // 1 hour in future
        value: 42,
      });
      expect(result.success).toBe(false);
    });

    it('should reject confidence > 1', () => {
      const result = validatePoint({
        timestamp: 1700000000000,
        value: 42,
        confidence: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject anomalyScore > 1', () => {
      const result = validatePoint({
        timestamp: 1700000000000,
        value: 42,
        anomalyScore: 2.0,
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// LABELS VALIDATION TESTS
// =============================================================================

describe('Labels Validation', () => {
  describe('Valid Labels', () => {
    it('should validate golden fixture labels', () => {
      const result = validateLabels(GOLDEN_VALID_LABELS);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(GOLDEN_VALID_LABELS);
    });

    it('should validate minimal labels', () => {
      const result = validateLabels({ tenantId: 'tenant-123' });
      expect(result.success).toBe(true);
    });

    it('should validate labels with dimensions', () => {
      const result = validateLabels({
        tenantId: 'tenant-123',
        dimensions: {
          host: 'server-01',
          app: 'myapp',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid Labels', () => {
    it('should reject labels without tenantId', () => {
      const result = validateLabels({ workspaceId: 'ws-123' });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(TimeSeriesErrorCodes.MISSING_TENANT_ID);
    });

    it('should reject empty tenantId', () => {
      const result = validateLabels({ tenantId: '' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid dimension key format', () => {
      const result = validateLabels({
        tenantId: 'tenant-123',
        dimensions: {
          '123invalid': 'value', // Keys must start with letter or underscore
        },
      });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(
        TimeSeriesErrorCodes.INVALID_LABEL_KEY
      );
    });

    it('should reject too many dimensions (>50)', () => {
      const dimensions: Record<string, string> = {};
      for (let i = 0; i < 51; i++) {
        dimensions[`dim_${i}`] = `value_${i}`;
      }
      const result = validateLabels({
        tenantId: 'tenant-123',
        dimensions,
      });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(TimeSeriesErrorCodes.TOO_MANY_LABELS);
    });
  });
});

// =============================================================================
// SERIES VALIDATION TESTS
// =============================================================================

describe('Series Validation', () => {
  describe('Valid Series', () => {
    it('should validate golden fixture series', () => {
      const result = validateSeries(GOLDEN_VALID_SERIES);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(GOLDEN_VALID_SERIES);
    });

    it('should validate series created with factory', () => {
      const series = createSeries({
        id: 'test-series',
        name: 'Test Series',
        labels: { tenantId: 'tenant-123' },
        provenance: {
          sourceSystem: 'test',
          extractedAt: Date.now(),
        },
      });
      const result = validateSeries(series);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid Series', () => {
    it('should reject series without id', () => {
      const invalid = { ...GOLDEN_VALID_SERIES };
      delete (invalid as Partial<CanonicalSeries>).id;
      const result = validateSeries(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(TimeSeriesErrorCodes.INVALID_SERIES_ID);
    });

    it('should reject series with invalid id format', () => {
      const invalid = { ...GOLDEN_VALID_SERIES, id: 'invalid id!' };
      const result = validateSeries(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject series without name', () => {
      const invalid = { ...GOLDEN_VALID_SERIES };
      delete (invalid as Partial<CanonicalSeries>).name;
      const result = validateSeries(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject series with invalid state', () => {
      const invalid = { ...GOLDEN_VALID_SERIES, state: 'invalid' };
      const result = validateSeries(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject series with invalid valueType', () => {
      const invalid = {
        ...GOLDEN_VALID_SERIES,
        metadata: { ...GOLDEN_VALID_SERIES.metadata, valueType: 'invalid' },
      };
      const result = validateSeries(invalid);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// BATCH VALIDATION TESTS
// =============================================================================

describe('Batch Validation', () => {
  describe('Valid Batches', () => {
    it('should validate golden fixture batch', () => {
      const result = validatePointBatch(GOLDEN_VALID_BATCH);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(GOLDEN_VALID_BATCH);
    });

    it('should validate batch with monotonic timestamps', () => {
      const result = validatePointBatch(GOLDEN_VALID_BATCH, true);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid Batches', () => {
    it('should reject batch without seriesId', () => {
      const invalid = { ...GOLDEN_VALID_BATCH };
      delete (invalid as Partial<PointBatch>).seriesId;
      const result = validatePointBatch(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject batch without batchId', () => {
      const invalid = { ...GOLDEN_VALID_BATCH };
      delete (invalid as Partial<PointBatch>).batchId;
      const result = validatePointBatch(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject non-monotonic timestamps when enforced', () => {
      const batch = {
        ...GOLDEN_VALID_BATCH,
        points: [
          { timestamp: 1700000002000, value: 12 },
          { timestamp: 1700000001000, value: 15 }, // Out of order
          { timestamp: 1700000000000, value: 10 },
        ],
      };
      const result = validatePointBatch(batch, true);
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe(
        TimeSeriesErrorCodes.NON_MONOTONIC_TIMESTAMPS
      );
    });

    it('should allow non-monotonic timestamps when not enforced', () => {
      const batch = {
        ...GOLDEN_VALID_BATCH,
        points: [
          { timestamp: 1700000002000, value: 12 },
          { timestamp: 1700000001000, value: 15 },
        ],
      };
      const result = validatePointBatch(batch, false);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// FACTORY FUNCTION TESTS
// =============================================================================

describe('Factory Functions', () => {
  describe('createSeries', () => {
    it('should create series with defaults', () => {
      const series = createSeries({
        id: 'test-series',
        name: 'Test Series',
        labels: { tenantId: 'tenant-123' },
        provenance: {
          sourceSystem: 'test',
          extractedAt: 1700000000000,
        },
      });

      expect(series.id).toBe('test-series');
      expect(series.schemaVersion).toBe(TIME_SERIES_SCHEMA_VERSION);
      expect(series.state).toBe('pending');
      expect(series.isActive).toBe(true);
      expect(series.metadata.valueType).toBe('numeric');
      expect(series.metadata.nativeResolution).toBe('minute');
      expect(series.metadata.defaultAggregation).toBe('avg');
    });

    it('should allow overriding defaults', () => {
      const series = createSeries({
        id: 'test-series',
        name: 'Test Series',
        labels: { tenantId: 'tenant-123' },
        provenance: {
          sourceSystem: 'test',
          extractedAt: 1700000000000,
        },
        state: 'active',
        metadata: {
          valueType: 'integer',
          nativeResolution: 'hour',
          defaultAggregation: 'sum',
          allowNegative: false,
          allowNull: true,
        },
      });

      expect(series.state).toBe('active');
      expect(series.metadata.valueType).toBe('integer');
      expect(series.metadata.nativeResolution).toBe('hour');
    });
  });

  describe('createPoint', () => {
    it('should create point with required fields', () => {
      const point = createPoint(1700000000000, 42);
      expect(point.timestamp).toBe(1700000000000);
      expect(point.value).toBe(42);
    });

    it('should create point with options', () => {
      const point = createPoint(1700000000000, 42, {
        confidence: 0.95,
        isAnomaly: false,
        tags: { source: 'test' },
      });
      expect(point.confidence).toBe(0.95);
      expect(point.isAnomaly).toBe(false);
      expect(point.tags).toEqual({ source: 'test' });
    });
  });

  describe('createPointBatch', () => {
    it('should create batch with generated batchId', () => {
      const points = [
        createPoint(1700000000000, 10),
        createPoint(1700000001000, 20),
      ];
      const batch = createPointBatch('series-001', points);
      expect(batch.seriesId).toBe('series-001');
      expect(batch.batchId).toMatch(/^batch_\d+_[a-z0-9]+$/);
      expect(batch.points).toHaveLength(2);
    });

    it('should accept custom batchId', () => {
      const batch = createPointBatch('series-001', [], {
        batchId: 'custom-batch-id',
      });
      expect(batch.batchId).toBe('custom-batch-id');
    });
  });
});

// =============================================================================
// STREAMING CONVERSION TESTS
// =============================================================================

describe('Streaming Conversions', () => {
  describe('streamingToCanonical', () => {
    it('should convert streaming points to canonical', () => {
      const streaming: StreamingPoint[] = [
        { t: 1700000000000, v: 10, q: 1 },
        { t: 1700000001000, v: 20, q: 2 },
        { t: 1700000002000, v: null, q: 0 },
      ];

      const canonical = streamingToCanonical(streaming);

      expect(canonical).toHaveLength(3);
      expect(canonical[0].timestamp).toBe(1700000000000);
      expect(canonical[0].value).toBe(10);
      expect(canonical[0].confidence).toBe(1);
      expect(canonical[1].confidence).toBe(0.5);
      expect(canonical[2].confidence).toBe(0);
    });

    it('should add source connector ID', () => {
      const streaming: StreamingPoint[] = [{ t: 1700000000000, v: 10 }];
      const canonical = streamingToCanonical(streaming, 'connector-001');
      expect(canonical[0].processingMetadata?.sourceConnectorId).toBe(
        'connector-001'
      );
    });
  });

  describe('canonicalToStreaming', () => {
    it('should convert canonical points to streaming', () => {
      const canonical: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: 10, confidence: 0.95 },
        { timestamp: 1700000001000, value: 20, confidence: 0.7 },
        { timestamp: 1700000002000, value: 30, confidence: 0.3 },
      ];

      const streaming = canonicalToStreaming(canonical);

      expect(streaming).toHaveLength(3);
      expect(streaming[0]).toEqual({ t: 1700000000000, v: 10, q: 1 });
      expect(streaming[1]).toEqual({ t: 1700000001000, v: 20, q: 2 });
      expect(streaming[2]).toEqual({ t: 1700000002000, v: 30, q: 0 });
    });

    it('should handle null values', () => {
      const canonical: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: null },
      ];
      const streaming = canonicalToStreaming(canonical);
      expect(streaming[0].v).toBeNull();
    });

    it('should handle non-numeric values', () => {
      const canonical: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: 'high' },
      ];
      const streaming = canonicalToStreaming(canonical);
      expect(streaming[0].v).toBeNull();
    });
  });
});

// =============================================================================
// AGGREGATION TESTS
// =============================================================================

describe('Aggregation Functions', () => {
  const testPoints: CanonicalPoint[] = [
    { timestamp: 1700000000000, value: 10 },
    { timestamp: 1700000000500, value: 20 },
    { timestamp: 1700000001000, value: 15 },
    { timestamp: 1700000001500, value: 25 },
    { timestamp: 1700000002000, value: 30 },
  ];

  describe('sum aggregation', () => {
    it('should sum values in each bucket', () => {
      const result = aggregatePoints(testPoints, 'second', 'sum');
      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(30); // 10 + 20
      expect(result[1].value).toBe(40); // 15 + 25
      expect(result[2].value).toBe(30);
    });
  });

  describe('avg aggregation', () => {
    it('should average values in each bucket', () => {
      const result = aggregatePoints(testPoints, 'second', 'avg');
      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(15); // (10 + 20) / 2
      expect(result[1].value).toBe(20); // (15 + 25) / 2
      expect(result[2].value).toBe(30);
    });
  });

  describe('min aggregation', () => {
    it('should return minimum in each bucket', () => {
      const result = aggregatePoints(testPoints, 'second', 'min');
      expect(result[0].value).toBe(10);
      expect(result[1].value).toBe(15);
    });
  });

  describe('max aggregation', () => {
    it('should return maximum in each bucket', () => {
      const result = aggregatePoints(testPoints, 'second', 'max');
      expect(result[0].value).toBe(20);
      expect(result[1].value).toBe(25);
    });
  });

  describe('count aggregation', () => {
    it('should count points in each bucket', () => {
      const result = aggregatePoints(testPoints, 'second', 'count');
      expect(result[0].value).toBe(2);
      expect(result[1].value).toBe(2);
      expect(result[2].value).toBe(1);
    });
  });

  describe('first/last aggregation', () => {
    it('should return first value', () => {
      const result = aggregatePoints(testPoints, 'second', 'first');
      expect(result[0].value).toBe(10);
    });

    it('should return last value', () => {
      const result = aggregatePoints(testPoints, 'second', 'last');
      expect(result[0].value).toBe(20);
    });
  });

  describe('median aggregation', () => {
    it('should return median with even count', () => {
      const result = aggregatePoints(testPoints, 'second', 'median');
      expect(result[0].value).toBe(15); // median of [10, 20]
    });

    it('should return median with odd count', () => {
      const points: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: 10 },
        { timestamp: 1700000000300, value: 30 },
        { timestamp: 1700000000600, value: 20 },
      ];
      const result = aggregatePoints(points, 'second', 'median');
      expect(result[0].value).toBe(20);
    });
  });

  describe('percentile aggregation', () => {
    it('should calculate percentile_90', () => {
      const points: CanonicalPoint[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: 1700000000000 + i,
        value: i + 1,
      }));
      const result = aggregatePoints(points, 'second', 'percentile_90');
      expect(result[0].value).toBeCloseTo(90.1, 0);
    });
  });

  describe('stddev/variance aggregation', () => {
    it('should calculate standard deviation', () => {
      const points: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: 2 },
        { timestamp: 1700000000100, value: 4 },
        { timestamp: 1700000000200, value: 4 },
        { timestamp: 1700000000300, value: 4 },
        { timestamp: 1700000000400, value: 5 },
        { timestamp: 1700000000500, value: 5 },
        { timestamp: 1700000000600, value: 7 },
        { timestamp: 1700000000700, value: 9 },
      ];
      const result = aggregatePoints(points, 'second', 'stddev');
      expect(result[0].value).toBeCloseTo(2, 0);
    });
  });

  describe('null handling', () => {
    it('should handle points with null values', () => {
      const points: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: 10 },
        { timestamp: 1700000000500, value: null },
      ];
      const result = aggregatePoints(points, 'second', 'avg');
      expect(result[0].value).toBe(10); // Only non-null value
      expect(result[0].additionalValues?.nullCount).toBe(1);
    });

    it('should return null for bucket with all nulls', () => {
      const points: CanonicalPoint[] = [
        { timestamp: 1700000000000, value: null },
        { timestamp: 1700000000500, value: null },
      ];
      const result = aggregatePoints(points, 'second', 'avg');
      expect(result[0].value).toBeNull();
    });
  });

  describe('empty input', () => {
    it('should return empty array for empty input', () => {
      const result = aggregatePoints([], 'second', 'avg');
      expect(result).toEqual([]);
    });
  });

  describe('sorting', () => {
    it('should return sorted results', () => {
      const result = aggregatePoints(testPoints, 'second', 'avg');
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp).toBeGreaterThan(result[i - 1].timestamp);
      }
    });
  });
});

// =============================================================================
// STATISTICS COMPUTATION TESTS
// =============================================================================

describe('Statistics Computation', () => {
  it('should compute statistics for points', () => {
    const points: CanonicalPoint[] = [
      { timestamp: 1700000000000, value: 10 },
      { timestamp: 1700000001000, value: 20 },
      { timestamp: 1700000002000, value: 30 },
      { timestamp: 1700000003000, value: 40 },
      { timestamp: 1700000004000, value: 50 },
    ];

    const stats = computeStatistics(points);

    expect(stats.pointCount).toBe(5);
    expect(stats.firstTimestamp).toBe(1700000000000);
    expect(stats.lastTimestamp).toBe(1700000004000);
    expect(stats.valueStats?.min).toBe(10);
    expect(stats.valueStats?.max).toBe(50);
    expect(stats.valueStats?.mean).toBe(30);
    expect(stats.valueStats?.nullCount).toBe(0);
    expect(stats.qualityMetrics?.missingRatio).toBe(0);
  });

  it('should handle null values in statistics', () => {
    const points: CanonicalPoint[] = [
      { timestamp: 1700000000000, value: 10 },
      { timestamp: 1700000001000, value: null },
      { timestamp: 1700000002000, value: 30 },
    ];

    const stats = computeStatistics(points);

    expect(stats.pointCount).toBe(3);
    expect(stats.valueStats?.nullCount).toBe(1);
    expect(stats.valueStats?.mean).toBe(20); // (10 + 30) / 2
    expect(stats.qualityMetrics?.missingRatio).toBeCloseTo(0.333, 2);
  });

  it('should detect anomalies in statistics', () => {
    const points: CanonicalPoint[] = [
      { timestamp: 1700000000000, value: 10, isAnomaly: false },
      { timestamp: 1700000001000, value: 999, isAnomaly: true },
      { timestamp: 1700000002000, value: 15, isAnomaly: false },
    ];

    const stats = computeStatistics(points);
    expect(stats.qualityMetrics?.anomalyRatio).toBeCloseTo(0.333, 2);
  });

  it('should detect duplicate timestamps', () => {
    const points: CanonicalPoint[] = [
      { timestamp: 1700000000000, value: 10 },
      { timestamp: 1700000000000, value: 15 }, // Duplicate
      { timestamp: 1700000001000, value: 20 },
    ];

    const stats = computeStatistics(points);
    expect(stats.qualityMetrics?.duplicateRatio).toBeCloseTo(0.333, 2);
  });

  it('should handle empty points array', () => {
    const stats = computeStatistics([]);

    expect(stats.pointCount).toBe(0);
    expect(stats.firstTimestamp).toBeUndefined();
    expect(stats.lastTimestamp).toBeUndefined();
    expect(stats.valueStats).toBeUndefined();
    expect(stats.qualityMetrics).toBeUndefined();
  });
});

// =============================================================================
// MIGRATION TESTS
// =============================================================================

describe('Schema Migration', () => {
  it('should pass through valid current-version series', () => {
    const result = migrateSeries(GOLDEN_VALID_SERIES);
    expect(result).toEqual(GOLDEN_VALID_SERIES);
  });

  it('should throw for invalid series after migration', () => {
    const invalid = { ...GOLDEN_VALID_SERIES };
    delete (invalid as Partial<CanonicalSeries>).id;
    expect(() => migrateSeries(invalid)).toThrow('Migration failed validation');
  });
});

// =============================================================================
// ERROR CODE STABILITY TESTS
// =============================================================================

describe('Error Code Stability', () => {
  it('should have stable timestamp error codes', () => {
    expect(TimeSeriesErrorCodes.INVALID_TIMESTAMP).toBe('TS_1001');
    expect(TimeSeriesErrorCodes.TIMESTAMP_OUT_OF_RANGE).toBe('TS_1002');
    expect(TimeSeriesErrorCodes.NON_MONOTONIC_TIMESTAMPS).toBe('TS_1003');
  });

  it('should have stable value error codes', () => {
    expect(TimeSeriesErrorCodes.INVALID_VALUE).toBe('TS_2001');
    expect(TimeSeriesErrorCodes.TYPE_MISMATCH).toBe('TS_2004');
  });

  it('should have stable series error codes', () => {
    expect(TimeSeriesErrorCodes.INVALID_SERIES_ID).toBe('TS_3001');
    expect(TimeSeriesErrorCodes.MISSING_TENANT_ID).toBe('TS_3003');
  });

  it('should have stable label error codes', () => {
    expect(TimeSeriesErrorCodes.INVALID_LABEL_KEY).toBe('TS_4001');
    expect(TimeSeriesErrorCodes.TOO_MANY_LABELS).toBe('TS_4003');
  });
});

// =============================================================================
// GOLDEN FIXTURE INVARIANT TESTS
// =============================================================================

describe('Golden Fixture Invariants', () => {
  it('should maintain golden point fixture validity', () => {
    const result = validatePoint(GOLDEN_VALID_POINT);
    expect(result.success).toBe(true);
  });

  it('should maintain golden series fixture validity', () => {
    const result = validateSeries(GOLDEN_VALID_SERIES);
    expect(result.success).toBe(true);
  });

  it('should maintain golden batch fixture validity', () => {
    const result = validatePointBatch(GOLDEN_VALID_BATCH);
    expect(result.success).toBe(true);
  });

  it('should maintain golden labels fixture validity', () => {
    const result = validateLabels(GOLDEN_VALID_LABELS);
    expect(result.success).toBe(true);
  });
});
