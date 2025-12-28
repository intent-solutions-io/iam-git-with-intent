/**
 * Tests for data collectors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RunDataCollector,
  createRunDataCollector,
  mergeCollectionResults,
  filterByDateRange,
  groupByRunType,
  type CollectionResult,
} from '../collectors/index.js';
import type { TenantStore, SaaSRun, Run } from '@gwi/core';
import type { HistoricalRunData } from '../models/index.js';

describe('RunDataCollector', () => {
  describe('constructor', () => {
    it('should throw when neither store is provided', () => {
      expect(() => new RunDataCollector()).toThrow(
        'Either runStore or tenantStore must be provided'
      );
    });

    it('should accept tenantStore', () => {
      const mockTenantStore = createMockTenantStore();
      const collector = createRunDataCollector(undefined, mockTenantStore);
      expect(collector).toBeInstanceOf(RunDataCollector);
    });
  });

  describe('collect', () => {
    it('should collect and convert runs from TenantStore', async () => {
      const mockRuns = createMockSaaSRuns(5);
      const mockTenantStore = createMockTenantStore(mockRuns);

      const collector = createRunDataCollector(undefined, mockTenantStore);
      const result = await collector.collect({ tenantId: 'tenant-123' });

      expect(result.data).toHaveLength(5);
      expect(result.metadata.totalFound).toBe(5);
      expect(result.metadata.included).toBe(5);
      expect(mockTenantStore.listRuns).toHaveBeenCalledWith('tenant-123', expect.any(Object));
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const mockRuns = [
        createMockSaaSRun('run-1', twoDaysAgo),
        createMockSaaSRun('run-2', yesterday),
        createMockSaaSRun('run-3', now),
      ];
      const mockTenantStore = createMockTenantStore(mockRuns);

      const collector = createRunDataCollector(undefined, mockTenantStore);
      const result = await collector.collect({
        tenantId: 'tenant-123',
        sinceDate: yesterday,
      });

      expect(result.data).toHaveLength(2);
      expect(result.metadata.excluded).toBe(1);
    });

    it('should filter by complexity', async () => {
      const mockRuns = createMockSaaSRuns(5);
      // Set varying complexities through step outputs
      for (let i = 0; i < mockRuns.length; i++) {
        mockRuns[i].steps = [{
          id: 'step-1',
          runId: mockRuns[i].id,
          agent: 'triage',
          status: 'completed',
          output: { complexity: i + 1 },
        }];
      }

      const mockTenantStore = createMockTenantStore(mockRuns);
      const collector = createRunDataCollector(undefined, mockTenantStore);

      const result = await collector.collect({
        tenantId: 'tenant-123',
        minComplexity: 3,
        maxComplexity: 4,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.every(d => d.complexity >= 3 && d.complexity <= 4)).toBe(true);
    });

    it('should calculate statistics', async () => {
      const mockRuns = createMockSaaSRuns(10);
      const mockTenantStore = createMockTenantStore(mockRuns);

      const collector = createRunDataCollector(undefined, mockTenantStore);
      const result = await collector.collect({ tenantId: 'tenant-123' });

      expect(result.metadata.statistics.totalRuns).toBe(10);
      expect(result.metadata.statistics.successRate).toBeGreaterThan(0);
      expect(result.metadata.statistics.avgDurationMs).toBeGreaterThan(0);
    });
  });

  describe('exportTimeSeries', () => {
    it('should export time series data', async () => {
      const mockRuns = createMockSaaSRuns(20);
      const mockTenantStore = createMockTenantStore(mockRuns);

      const collector = createRunDataCollector(undefined, mockTenantStore);
      const result = await collector.exportTimeSeries({ tenantId: 'tenant-123' });

      expect(result.durationSeries.points.length).toBeGreaterThan(0);
      expect(result.durationSeries.seriesId).toBe('run_duration');
      expect(result.dataPointsCount).toBe(20);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const mockRuns = createMockSaaSRuns(10);
      const mockTenantStore = createMockTenantStore(mockRuns);

      const collector = createRunDataCollector(undefined, mockTenantStore);
      const stats = await collector.getStatistics({ tenantId: 'tenant-123' });

      expect(stats.totalRuns).toBe(10);
      expect(typeof stats.successRate).toBe('number');
      expect(typeof stats.avgDurationMs).toBe('number');
    });
  });

  describe('streamRuns', () => {
    it('should yield runs in batches', async () => {
      const mockRuns = createMockSaaSRuns(25);
      const mockTenantStore = createMockTenantStore(mockRuns);

      const collector = createRunDataCollector(undefined, mockTenantStore);

      const batches: HistoricalRunData[][] = [];
      for await (const batch of collector.streamRuns({ tenantId: 'tenant-123' }, 10)) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);
    });
  });
});

describe('Utility Functions', () => {
  describe('mergeCollectionResults', () => {
    it('should merge multiple results', () => {
      const result1 = createMockCollectionResult(['run-1', 'run-2']);
      const result2 = createMockCollectionResult(['run-3', 'run-4']);

      const merged = mergeCollectionResults(result1, result2);

      expect(merged.data).toHaveLength(4);
      expect(merged.metadata.included).toBe(4);
    });

    it('should deduplicate by runId', () => {
      const result1 = createMockCollectionResult(['run-1', 'run-2']);
      const result2 = createMockCollectionResult(['run-2', 'run-3']); // run-2 is duplicate

      const merged = mergeCollectionResults(result1, result2);

      expect(merged.data).toHaveLength(3);
    });

    it('should sort by timestamp', () => {
      const now = new Date();
      const result1: CollectionResult = {
        data: [
          createMockHistoricalRunData('run-2', new Date(now.getTime() + 1000)),
        ],
        metadata: createMockMetadata(1),
      };
      const result2: CollectionResult = {
        data: [
          createMockHistoricalRunData('run-1', now),
        ],
        metadata: createMockMetadata(1),
      };

      const merged = mergeCollectionResults(result1, result2);

      expect(merged.data[0].runId).toBe('run-1');
      expect(merged.data[1].runId).toBe('run-2');
    });
  });

  describe('filterByDateRange', () => {
    it('should filter by date range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const result: CollectionResult = {
        data: [
          createMockHistoricalRunData('run-1', twoDaysAgo),
          createMockHistoricalRunData('run-2', yesterday),
          createMockHistoricalRunData('run-3', now),
        ],
        metadata: createMockMetadata(3),
      };

      const filtered = filterByDateRange(result, yesterday, now);

      expect(filtered.data).toHaveLength(2);
      expect(filtered.data.map(d => d.runId)).toEqual(['run-2', 'run-3']);
    });
  });

  describe('groupByRunType', () => {
    it('should group by run type', () => {
      const result: CollectionResult = {
        data: [
          { ...createMockHistoricalRunData('run-1'), runType: 'resolve' },
          { ...createMockHistoricalRunData('run-2'), runType: 'triage' },
          { ...createMockHistoricalRunData('run-3'), runType: 'resolve' },
          { ...createMockHistoricalRunData('run-4'), runType: 'review' },
        ],
        metadata: createMockMetadata(4),
      };

      const grouped = groupByRunType(result);

      expect(grouped.size).toBe(3);
      expect(grouped.get('resolve')?.data).toHaveLength(2);
      expect(grouped.get('triage')?.data).toHaveLength(1);
      expect(grouped.get('review')?.data).toHaveLength(1);
    });
  });
});

// Helper functions

function createMockTenantStore(runs: SaaSRun[] = []): TenantStore {
  return {
    listRuns: vi.fn().mockResolvedValue(runs),
    createTenant: vi.fn(),
    getTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    addRepo: vi.fn(),
    getRepo: vi.fn(),
    listRepos: vi.fn(),
    updateRepo: vi.fn(),
    removeRepo: vi.fn(),
    createRun: vi.fn(),
    getRun: vi.fn(),
    updateRun: vi.fn(),
    countRuns: vi.fn(),
    countInFlightRuns: vi.fn(),
    getConnectorConfig: vi.fn(),
    setConnectorConfig: vi.fn(),
    listConnectorConfigs: vi.fn(),
    deleteConnectorConfig: vi.fn(),
  } as unknown as TenantStore;
}

function createMockSaaSRun(id: string, createdAt: Date = new Date()): SaaSRun {
  return {
    id,
    prId: 'pr-123',
    prUrl: 'https://github.com/org/repo/pull/123',
    type: 'resolve' as const,
    status: 'completed' as const,
    steps: [],
    createdAt,
    updatedAt: new Date(),
    completedAt: new Date(createdAt.getTime() + 5000),
    durationMs: 5000,
    tenantId: 'tenant-123',
    repoId: 'repo-123',
    trigger: {
      source: 'cli' as const,
    },
  };
}

function createMockSaaSRuns(count: number): SaaSRun[] {
  return Array.from({ length: count }, (_, i) =>
    createMockSaaSRun(`run-${i}`, new Date(Date.now() - i * 60 * 60 * 1000))
  );
}

function createMockHistoricalRunData(
  runId: string,
  timestamp: Date = new Date()
): HistoricalRunData {
  return {
    runId,
    timestamp,
    runType: 'resolve',
    complexity: 3,
    filesChanged: 10,
    linesAdded: 100,
    linesDeleted: 50,
    success: true,
    durationMs: 5000,
    stepsCompleted: 4,
    totalSteps: 4,
  };
}

function createMockCollectionResult(runIds: string[]): CollectionResult {
  return {
    data: runIds.map((id, i) =>
      createMockHistoricalRunData(id, new Date(Date.now() - i * 1000))
    ),
    metadata: createMockMetadata(runIds.length),
  };
}

function createMockMetadata(count: number): CollectionResult['metadata'] {
  return {
    totalFound: count,
    included: count,
    excluded: 0,
    collectedAt: new Date(),
    options: {},
    statistics: {
      totalRuns: count,
      successRate: 0.9,
      avgDurationMs: 5000,
      medianDurationMs: 5000,
      p95DurationMs: 8000,
      avgComplexity: 3,
      avgFilesChanged: 10,
      avgTokensUsed: 1000,
    },
  };
}
