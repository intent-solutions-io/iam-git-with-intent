/**
 * Phase 54: Series Storage Tests
 *
 * Tests for dual-layer time-series storage including:
 * - Write operations and deduplication
 * - Query operations and filtering
 * - Metadata management
 * - Storage tiering
 * - Query builder
 * - Validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SERIES_STORAGE_VERSION,
  SeriesStorageErrorCodes,
  DEFAULT_TIER_CONFIG,
  InMemorySeriesStorage,
  SeriesQueryBuilder,
  queryBuilder,
  validateSeriesStorageConfig,
  validateSeriesQuery,
  validateWriteRequest,
  validateStoredSeriesMetadata,
  createSeriesStorageConfig,
  createSeriesQuery,
  createWriteRequest,
  createStoredSeriesMetadata,
  determineTier,
  estimateQueryCost,
  calculateBatchSizes,
  type SeriesStorageConfig,
  type SeriesQuery,
  type WriteRequest,
  type StoredSeriesMetadata,
} from '../index.js';

describe('Series Storage', () => {
  describe('Contract Version', () => {
    it('should have stable version', () => {
      expect(SERIES_STORAGE_VERSION).toBe('1.0.0');
    });
  });

  describe('Error Codes', () => {
    it('should define config error codes (1xxx)', () => {
      expect(SeriesStorageErrorCodes.INVALID_CONFIG).toBe('SS_1001');
      expect(SeriesStorageErrorCodes.MISSING_PROJECT_ID).toBe('SS_1002');
    });

    it('should define connection error codes (2xxx)', () => {
      expect(SeriesStorageErrorCodes.CONNECTION_FAILED).toBe('SS_2001');
      expect(SeriesStorageErrorCodes.QUOTA_EXCEEDED).toBe('SS_2004');
    });

    it('should define query error codes (3xxx)', () => {
      expect(SeriesStorageErrorCodes.QUERY_FAILED).toBe('SS_3001');
      expect(SeriesStorageErrorCodes.SERIES_NOT_FOUND).toBe('SS_3003');
    });

    it('should define write error codes (4xxx)', () => {
      expect(SeriesStorageErrorCodes.WRITE_FAILED).toBe('SS_4001');
      expect(SeriesStorageErrorCodes.DUPLICATE_POINT).toBe('SS_4003');
    });

    it('should define tiering error codes (5xxx)', () => {
      expect(SeriesStorageErrorCodes.TIER_FAILED).toBe('SS_5001');
      expect(SeriesStorageErrorCodes.ARCHIVE_FAILED).toBe('SS_5002');
    });
  });

  describe('Default Tier Config', () => {
    it('should have 4 tiers', () => {
      expect(DEFAULT_TIER_CONFIG).toHaveLength(4);
    });

    it('should have correct tier order', () => {
      expect(DEFAULT_TIER_CONFIG[0].tier).toBe('hot');
      expect(DEFAULT_TIER_CONFIG[1].tier).toBe('warm');
      expect(DEFAULT_TIER_CONFIG[2].tier).toBe('cold');
      expect(DEFAULT_TIER_CONFIG[3].tier).toBe('archive');
    });

    it('should have increasing max ages', () => {
      for (let i = 1; i < DEFAULT_TIER_CONFIG.length - 1; i++) {
        expect(DEFAULT_TIER_CONFIG[i].maxAgeHours).toBeGreaterThan(
          DEFAULT_TIER_CONFIG[i - 1].maxAgeHours
        );
      }
    });
  });

  describe('Config Validation', () => {
    const validConfig: SeriesStorageConfig = {
      projectId: 'test-project',
      bigqueryDataset: 'test_dataset',
      firestorePrefix: 'series',
      tiers: DEFAULT_TIER_CONFIG,
      autoTiering: true,
      tieringIntervalMinutes: 60,
      retentionDays: 365,
      maxBatchSize: 10000,
      queryTimeoutMs: 30000,
      queryCacheEnabled: true,
      queryCacheTtlSeconds: 60,
    };

    it('should validate valid config', () => {
      const result = validateSeriesStorageConfig(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject empty project ID', () => {
      const config = { ...validConfig, projectId: '' };
      const result = validateSeriesStorageConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tier backend', () => {
      const config = {
        ...validConfig,
        tiers: [{ ...DEFAULT_TIER_CONFIG[0], backend: 'invalid' as any }],
      };
      const result = validateSeriesStorageConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Query Validation', () => {
    it('should validate valid query', () => {
      const query: SeriesQuery = {
        tenantId: 'tenant_1',
        seriesId: 'cpu_usage',
        startTime: 1704067200000,
        endTime: 1704153600000,
      };
      const result = validateSeriesQuery(query);
      expect(result.success).toBe(true);
    });

    it('should reject empty tenant ID', () => {
      const query = {
        tenantId: '',
        seriesId: 'cpu_usage',
        startTime: 1704067200000,
        endTime: 1704153600000,
      };
      const result = validateSeriesQuery(query);
      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const query: SeriesQuery = {
        tenantId: 'tenant_1',
        seriesId: 'cpu_usage',
        startTime: 1704067200000,
        endTime: 1704153600000,
        resolution: 'hour',
        aggregation: 'avg',
        limit: 100,
        offset: 0,
        forceTier: 'hot',
      };
      const result = validateSeriesQuery(query);
      expect(result.success).toBe(true);
    });
  });

  describe('Write Request Validation', () => {
    it('should validate valid write request', () => {
      const request: WriteRequest = {
        tenantId: 'tenant_1',
        seriesId: 'cpu_usage',
        points: [{ timestamp: 1704067200000, value: 50.5 }],
      };
      const result = validateWriteRequest(request);
      expect(result.success).toBe(true);
    });

    it('should accept points with various value types', () => {
      const request: WriteRequest = {
        tenantId: 'tenant_1',
        seriesId: 'mixed',
        points: [
          { timestamp: 1704067200000, value: 100 },
          { timestamp: 1704067260000, value: 'string_val' },
          { timestamp: 1704067320000, value: true },
          { timestamp: 1704067380000, value: null },
        ],
      };
      const result = validateWriteRequest(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Metadata Validation', () => {
    it('should validate valid metadata', () => {
      const meta: StoredSeriesMetadata = {
        seriesId: 'cpu_usage',
        tenantId: 'tenant_1',
        name: 'CPU Usage',
        labels: { host: 'server1' },
        dimensions: { region: 'us-east' },
        dataType: 'gauge',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pointCount: 0,
        currentTier: 'hot',
      };
      const result = validateStoredSeriesMetadata(meta);
      expect(result.success).toBe(true);
    });

    it('should reject invalid data type', () => {
      const meta = {
        seriesId: 'cpu_usage',
        tenantId: 'tenant_1',
        name: 'CPU Usage',
        labels: {},
        dimensions: {},
        dataType: 'invalid' as any,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pointCount: 0,
        currentTier: 'hot' as const,
      };
      const result = validateStoredSeriesMetadata(meta);
      expect(result.success).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('should create storage config with defaults', () => {
      const config = createSeriesStorageConfig({
        projectId: 'my-project',
        bigqueryDataset: 'my_dataset',
      });
      expect(config.projectId).toBe('my-project');
      expect(config.firestorePrefix).toBe('series');
      expect(config.autoTiering).toBe(true);
    });

    it('should create query', () => {
      const query = createSeriesQuery({
        tenantId: 'tenant_1',
        seriesId: 'cpu',
        startTime: 1000,
        endTime: 2000,
      });
      expect(query.tenantId).toBe('tenant_1');
      expect(query.startTime).toBe(1000);
    });

    it('should create write request with dedup enabled', () => {
      const request = createWriteRequest({
        tenantId: 'tenant_1',
        seriesId: 'cpu',
        points: [],
      });
      expect(request.dedup).toBe(true);
    });

    it('should create metadata with defaults', () => {
      const meta = createStoredSeriesMetadata({
        seriesId: 'cpu',
        tenantId: 'tenant_1',
        name: 'CPU Usage',
      });
      expect(meta.dataType).toBe('gauge');
      expect(meta.currentTier).toBe('hot');
      expect(meta.pointCount).toBe(0);
    });
  });

  describe('InMemorySeriesStorage', () => {
    let storage: InMemorySeriesStorage;

    beforeEach(() => {
      storage = new InMemorySeriesStorage();
    });

    describe('Write Operations', () => {
      it('should write points', async () => {
        const result = await storage.write({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          points: [
            { timestamp: 1000, value: 50 },
            { timestamp: 2000, value: 60 },
          ],
        });

        expect(result.success).toBe(true);
        expect(result.pointsWritten).toBe(2);
        expect(result.tier).toBe('hot');
      });

      it('should deduplicate points', async () => {
        await storage.write({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          points: [{ timestamp: 1000, value: 50 }],
          dedup: true,
        });

        const result = await storage.write({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          points: [
            { timestamp: 1000, value: 50 }, // duplicate
            { timestamp: 2000, value: 60 },
          ],
          dedup: true,
        });

        expect(result.pointsWritten).toBe(1);
        expect(result.duplicatesSkipped).toBe(1);
      });

      it('should update metadata on write', async () => {
        await storage.write({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          points: [
            { timestamp: 1000, value: 50 },
            { timestamp: 2000, value: 60 },
          ],
        });

        const meta = await storage.getMetadata('tenant_1', 'cpu');
        expect(meta).not.toBeNull();
        expect(meta!.pointCount).toBe(2);
        expect(meta!.firstPointAt).toBe(1000);
        expect(meta!.lastPointAt).toBe(2000);
      });
    });

    describe('Batch Write', () => {
      it('should write multiple series', async () => {
        const result = await storage.batchWrite({
          writes: [
            { tenantId: 'tenant_1', seriesId: 'cpu', points: [{ timestamp: 1000, value: 50 }] },
            { tenantId: 'tenant_1', seriesId: 'mem', points: [{ timestamp: 1000, value: 70 }] },
          ],
        });

        expect(result.success).toBe(true);
        expect(result.totalPointsWritten).toBe(2);
        expect(result.results).toHaveLength(2);
      });
    });

    describe('Query Operations', () => {
      beforeEach(async () => {
        await storage.write({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          points: [
            { timestamp: 1000, value: 50, tags: { host: 'a' } },
            { timestamp: 2000, value: 60, tags: { host: 'b' } },
            { timestamp: 3000, value: 70, tags: { host: 'a' } },
            { timestamp: 4000, value: 80, tags: { host: 'b' } },
            { timestamp: 5000, value: 90, tags: { host: 'a' } },
          ],
        });
      });

      it('should query by time range', async () => {
        const result = await storage.query({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          startTime: 2000,
          endTime: 4000,
        });

        expect(result.points).toHaveLength(2);
        expect(result.points[0].timestamp).toBe(2000);
        expect(result.points[1].timestamp).toBe(3000);
      });

      it('should filter by labels', async () => {
        const result = await storage.query({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          startTime: 0,
          endTime: 10000,
          labelFilters: { host: 'a' },
        });

        expect(result.points).toHaveLength(3);
        result.points.forEach(p => {
          expect(p.tags?.host).toBe('a');
        });
      });

      it('should filter by label array', async () => {
        const result = await storage.query({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          startTime: 0,
          endTime: 10000,
          labelFilters: { host: ['a', 'b'] },
        });

        expect(result.points).toHaveLength(5);
      });

      it('should apply limit', async () => {
        const result = await storage.query({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          startTime: 0,
          endTime: 10000,
          limit: 2,
        });

        expect(result.points).toHaveLength(2);
        expect(result.totalCount).toBe(5);
      });

      it('should apply offset', async () => {
        const result = await storage.query({
          tenantId: 'tenant_1',
          seriesId: 'cpu',
          startTime: 0,
          endTime: 10000,
          offset: 2,
          limit: 2,
        });

        expect(result.points).toHaveLength(2);
        expect(result.points[0].timestamp).toBe(3000);
      });

      it('should return empty for non-existent series', async () => {
        const result = await storage.query({
          tenantId: 'tenant_1',
          seriesId: 'nonexistent',
          startTime: 0,
          endTime: 10000,
        });

        expect(result.points).toHaveLength(0);
      });
    });

    describe('Multi-Series Query', () => {
      beforeEach(async () => {
        await storage.batchWrite({
          writes: [
            { tenantId: 't1', seriesId: 'cpu', points: [{ timestamp: 1000, value: 50 }] },
            { tenantId: 't1', seriesId: 'mem', points: [{ timestamp: 1000, value: 70 }] },
            { tenantId: 't1', seriesId: 'disk', points: [{ timestamp: 1000, value: 30 }] },
          ],
        });
      });

      it('should query multiple series', async () => {
        const result = await storage.queryMultiple({
          tenantId: 't1',
          seriesIds: ['cpu', 'mem', 'disk'],
          startTime: 0,
          endTime: 10000,
        });

        expect(result.series.size).toBe(3);
        expect(result.series.get('cpu')).toHaveLength(1);
        expect(result.series.get('mem')).toHaveLength(1);
      });
    });

    describe('Metadata Management', () => {
      it('should upsert metadata', async () => {
        const meta = createStoredSeriesMetadata({
          seriesId: 'cpu',
          tenantId: 'tenant_1',
          name: 'CPU Usage',
          description: 'Host CPU utilization',
        });

        await storage.upsertMetadata(meta);
        const retrieved = await storage.getMetadata('tenant_1', 'cpu');

        expect(retrieved).not.toBeNull();
        expect(retrieved!.name).toBe('CPU Usage');
        expect(retrieved!.description).toBe('Host CPU utilization');
      });

      it('should list series for tenant', async () => {
        await storage.batchWrite({
          writes: [
            { tenantId: 't1', seriesId: 'cpu', points: [{ timestamp: 1000, value: 50 }] },
            { tenantId: 't1', seriesId: 'mem', points: [{ timestamp: 1000, value: 70 }] },
            { tenantId: 't2', seriesId: 'cpu', points: [{ timestamp: 1000, value: 60 }] },
          ],
        });

        const result = await storage.listSeries('t1');
        expect(result.series).toHaveLength(2);
        expect(result.total).toBe(2);
      });

      it('should filter series by prefix', async () => {
        await storage.batchWrite({
          writes: [
            { tenantId: 't1', seriesId: 'system.cpu', points: [{ timestamp: 1000, value: 50 }] },
            { tenantId: 't1', seriesId: 'system.mem', points: [{ timestamp: 1000, value: 70 }] },
            { tenantId: 't1', seriesId: 'app.latency', points: [{ timestamp: 1000, value: 100 }] },
          ],
        });

        const result = await storage.listSeries('t1', { prefix: 'system.' });
        expect(result.series).toHaveLength(2);
      });

      it('should delete series', async () => {
        await storage.write({
          tenantId: 't1',
          seriesId: 'cpu',
          points: [{ timestamp: 1000, value: 50 }],
        });

        await storage.deleteSeries('t1', 'cpu');

        const meta = await storage.getMetadata('t1', 'cpu');
        expect(meta).toBeNull();

        const result = await storage.query({
          tenantId: 't1',
          seriesId: 'cpu',
          startTime: 0,
          endTime: 10000,
        });
        expect(result.points).toHaveLength(0);
      });
    });

    describe('Storage Stats', () => {
      it('should return stats', async () => {
        await storage.batchWrite({
          writes: [
            { tenantId: 't1', seriesId: 'cpu', points: [{ timestamp: 1000, value: 50 }, { timestamp: 2000, value: 60 }] },
            { tenantId: 't1', seriesId: 'mem', points: [{ timestamp: 1000, value: 70 }] },
          ],
        });

        const stats = await storage.getStats('t1');

        expect(stats.tenantId).toBe('t1');
        expect(stats.totalSeries).toBe(2);
        expect(stats.totalPoints).toBe(3);
        expect(stats.byTier.hot.seriesCount).toBe(2);
      });
    });

    describe('Clear', () => {
      it('should clear all data', async () => {
        await storage.write({
          tenantId: 't1',
          seriesId: 'cpu',
          points: [{ timestamp: 1000, value: 50 }],
        });

        storage.clear();

        const stats = await storage.getStats('t1');
        expect(stats.totalSeries).toBe(0);
        expect(stats.totalPoints).toBe(0);
      });
    });
  });

  describe('SeriesQueryBuilder', () => {
    it('should build basic query', () => {
      const query = queryBuilder()
        .tenant('t1')
        .series('cpu')
        .timeRange(1000, 2000)
        .build();

      expect(query.tenantId).toBe('t1');
      expect(query.seriesId).toBe('cpu');
      expect(query.startTime).toBe(1000);
      expect(query.endTime).toBe(2000);
    });

    it('should support last() helper', () => {
      const before = Date.now();
      const query = queryBuilder()
        .tenant('t1')
        .series('cpu')
        .last(24)
        .build();

      expect(query.endTime).toBeGreaterThanOrEqual(before);
      expect(query.startTime).toBeLessThan(query.endTime);
    });

    it('should support chained filters', () => {
      const query = queryBuilder()
        .tenant('t1')
        .series('cpu')
        .timeRange(1000, 2000)
        .resolution('hour')
        .aggregation('avg')
        .filterLabel('host', 'server1')
        .filterLabel('env', ['prod', 'staging'])
        .limit(100)
        .offset(50)
        .build();

      expect(query.resolution).toBe('hour');
      expect(query.aggregation).toBe('avg');
      expect(query.labelFilters?.host).toBe('server1');
      expect(query.labelFilters?.env).toEqual(['prod', 'staging']);
      expect(query.limit).toBe(100);
      expect(query.offset).toBe(50);
    });

    it('should throw if tenant missing', () => {
      expect(() =>
        queryBuilder().series('cpu').timeRange(1000, 2000).build()
      ).toThrow('tenantId and seriesId are required');
    });

    it('should throw if time range missing', () => {
      expect(() =>
        queryBuilder().tenant('t1').series('cpu').build()
      ).toThrow('Time range is required');
    });
  });

  describe('Utility Functions', () => {
    describe('determineTier', () => {
      it('should return hot for recent data', () => {
        const now = Date.now();
        const tier = determineTier(now - 1000, now, DEFAULT_TIER_CONFIG);
        expect(tier).toBe('hot');
      });

      it('should return warm for day-old data', () => {
        const now = Date.now();
        const dayAgo = now - 48 * 60 * 60 * 1000;
        const tier = determineTier(dayAgo, now, DEFAULT_TIER_CONFIG);
        expect(tier).toBe('warm');
      });

      it('should return cold for month-old data', () => {
        const now = Date.now();
        const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
        const tier = determineTier(monthAgo, now, DEFAULT_TIER_CONFIG);
        expect(tier).toBe('cold');
      });

      it('should return archive for very old data', () => {
        const now = Date.now();
        const yearAgo = now - 400 * 24 * 60 * 60 * 1000;
        const tier = determineTier(yearAgo, now, DEFAULT_TIER_CONFIG);
        expect(tier).toBe('archive');
      });
    });

    describe('estimateQueryCost', () => {
      it('should estimate costs for hot tier', () => {
        const cost = estimateQueryCost('hot', 1000);
        expect(cost.totalCost).toBeGreaterThan(0);
        expect(cost.scanCost).toBeGreaterThan(cost.networkCost);
      });

      it('should have lower costs for cold tier', () => {
        const hotCost = estimateQueryCost('hot', 1000);
        const coldCost = estimateQueryCost('cold', 1000);
        expect(coldCost.scanCost).toBeLessThan(hotCost.scanCost);
      });
    });

    describe('calculateBatchSizes', () => {
      it('should split into batches', () => {
        const batches = calculateBatchSizes(25000, 10000);
        expect(batches).toEqual([10000, 10000, 5000]);
      });

      it('should handle exact multiple', () => {
        const batches = calculateBatchSizes(30000, 10000);
        expect(batches).toEqual([10000, 10000, 10000]);
      });

      it('should handle smaller than batch', () => {
        const batches = calculateBatchSizes(5000, 10000);
        expect(batches).toEqual([5000]);
      });
    });
  });

  describe('Golden Fixtures', () => {
    it('should maintain stable error codes', () => {
      const expected = {
        INVALID_CONFIG: 'SS_1001',
        CONNECTION_FAILED: 'SS_2001',
        QUERY_FAILED: 'SS_3001',
        WRITE_FAILED: 'SS_4001',
        TIER_FAILED: 'SS_5001',
      };

      Object.entries(expected).forEach(([key, code]) => {
        expect(SeriesStorageErrorCodes[key as keyof typeof SeriesStorageErrorCodes]).toBe(code);
      });
    });

    it('should maintain stable tier config structure', () => {
      expect(DEFAULT_TIER_CONFIG[0]).toEqual({
        tier: 'hot',
        maxAgeHours: 24,
        backend: 'firestore',
        compression: false,
        latencySlaMs: 50,
      });
    });
  });
});
