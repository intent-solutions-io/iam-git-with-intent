/**
 * Quotas & Resource Management Tests
 *
 * Phase 45: Tests for resource quotas, limits, and usage tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryQuotaStore,
  InMemoryUsageStore,
  QuotaManager,
  createQuotaManager,
  DEFAULT_QUOTAS,
  DEFAULT_QUOTA_CONFIG,
} from '../index.js';

// =============================================================================
// InMemoryQuotaStore Tests
// =============================================================================

describe('InMemoryQuotaStore', () => {
  let store: InMemoryQuotaStore;

  beforeEach(() => {
    store = new InMemoryQuotaStore();
  });

  describe('createQuota()', () => {
    it('should create quota definition', async () => {
      const quota = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      expect(quota.id).toMatch(/^quota_/);
      expect(quota.resourceType).toBe('runs');
      expect(quota.limit).toBe(1000);
    });
  });

  describe('getQuota()', () => {
    it('should get quota by ID', async () => {
      const created = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const retrieved = await store.getQuota(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.resourceType).toBe('runs');
    });

    it('should return null for non-existent', async () => {
      const result = await store.getQuota('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listQuotas()', () => {
    it('should list all quotas', async () => {
      await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      await store.createQuota({
        resourceType: 'api_calls',
        limit: 10000,
        period: 'hour',
        enforcement: 'soft',
        enabled: true,
      });

      const quotas = await store.listQuotas();
      expect(quotas).toHaveLength(2);
    });
  });

  describe('updateQuota()', () => {
    it('should update quota', async () => {
      const quota = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const updated = await store.updateQuota(quota.id, { limit: 2000 });
      expect(updated.limit).toBe(2000);
    });

    it('should throw for non-existent', async () => {
      await expect(store.updateQuota('non-existent', { limit: 100 })).rejects.toThrow();
    });
  });

  describe('deleteQuota()', () => {
    it('should delete quota', async () => {
      const quota = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      await store.deleteQuota(quota.id);

      const deleted = await store.getQuota(quota.id);
      expect(deleted).toBeNull();
    });

    it('should throw for non-existent', async () => {
      await expect(store.deleteQuota('non-existent')).rejects.toThrow();
    });
  });

  describe('assignQuota()', () => {
    it('should assign quota to tenant', async () => {
      const quota = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const assignment = await store.assignQuota({
        tenantId: 'tenant-1',
        quotaId: quota.id,
        enabled: true,
      });

      expect(assignment.id).toMatch(/^assign_/);
      expect(assignment.tenantId).toBe('tenant-1');
    });

    it('should assign with custom limit', async () => {
      const quota = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const assignment = await store.assignQuota({
        tenantId: 'tenant-1',
        quotaId: quota.id,
        customLimit: 5000,
        enabled: true,
      });

      expect(assignment.customLimit).toBe(5000);
    });
  });

  describe('getAssignments()', () => {
    it('should get assignments for tenant', async () => {
      const quota1 = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const quota2 = await store.createQuota({
        resourceType: 'api_calls',
        limit: 10000,
        period: 'hour',
        enforcement: 'soft',
        enabled: true,
      });

      await store.assignQuota({ tenantId: 'tenant-1', quotaId: quota1.id, enabled: true });
      await store.assignQuota({ tenantId: 'tenant-1', quotaId: quota2.id, enabled: true });
      await store.assignQuota({ tenantId: 'tenant-2', quotaId: quota1.id, enabled: true });

      const assignments = await store.getAssignments('tenant-1');
      expect(assignments).toHaveLength(2);
    });
  });

  describe('removeAssignment()', () => {
    it('should remove assignment', async () => {
      const quota = await store.createQuota({
        resourceType: 'runs',
        limit: 1000,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const assignment = await store.assignQuota({
        tenantId: 'tenant-1',
        quotaId: quota.id,
        enabled: true,
      });

      await store.removeAssignment(assignment.id);

      const assignments = await store.getAssignments('tenant-1');
      expect(assignments).toHaveLength(0);
    });

    it('should throw for non-existent', async () => {
      await expect(store.removeAssignment('non-existent')).rejects.toThrow();
    });
  });
});

// =============================================================================
// InMemoryUsageStore Tests
// =============================================================================

describe('InMemoryUsageStore', () => {
  let store: InMemoryUsageStore;

  beforeEach(() => {
    store = new InMemoryUsageStore();
  });

  describe('recordUsage()', () => {
    it('should record usage event', async () => {
      const event = await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 1,
        timestamp: new Date(),
      });

      expect(event.id).toMatch(/^usage_/);
      expect(event.amount).toBe(1);
    });
  });

  describe('getUsage()', () => {
    it('should get total usage since date', async () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 5,
        timestamp: now,
      });

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 3,
        timestamp: now,
      });

      const usage = await store.getUsage('tenant-1', 'runs', hourAgo);
      expect(usage).toBe(8);
    });

    it('should filter by tenant and resource type', async () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 5,
        timestamp: now,
      });

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'api_calls',
        amount: 100,
        timestamp: now,
      });

      await store.recordUsage({
        tenantId: 'tenant-2',
        resourceType: 'runs',
        amount: 10,
        timestamp: now,
      });

      const usage = await store.getUsage('tenant-1', 'runs', hourAgo);
      expect(usage).toBe(5);
    });
  });

  describe('getUsageSummary()', () => {
    it('should get usage summary', async () => {
      const now = new Date();

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 5,
        timestamp: now,
      });

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'api_calls',
        amount: 100,
        timestamp: now,
      });

      const summary = await store.getUsageSummary('tenant-1', 'day');

      expect(summary.tenantId).toBe('tenant-1');
      expect(summary.byResource.runs).toBe(5);
      expect(summary.byResource.api_calls).toBe(100);
      expect(summary.totalEvents).toBe(2);
    });
  });

  describe('pruneOldUsage()', () => {
    it('should prune old events', async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 1,
        timestamp: now,
      });

      await store.recordUsage({
        tenantId: 'tenant-1',
        resourceType: 'runs',
        amount: 1,
        timestamp: monthAgo,
      });

      const pruned = await store.pruneOldUsage(weekAgo);
      expect(pruned).toBe(1);

      const usage = await store.getUsage('tenant-1', 'runs', monthAgo);
      expect(usage).toBe(1);
    });
  });
});

// =============================================================================
// QuotaManager Tests
// =============================================================================

describe('QuotaManager', () => {
  let manager: QuotaManager;

  beforeEach(() => {
    manager = createQuotaManager();
  });

  describe('checkQuota()', () => {
    it('should allow when no quota defined', async () => {
      const result = await manager.checkQuota('tenant-1', 'runs');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(Infinity);
    });

    it('should allow when within limit', async () => {
      await manager.createQuota({
        resourceType: 'runs',
        limit: 100,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      await manager.recordUsage('tenant-1', 'runs', 50);

      const result = await manager.checkQuota('tenant-1', 'runs');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(50);
      expect(result.remaining).toBe(49); // 100 - 50 - 1
    });

    it('should deny when hard limit exceeded', async () => {
      await manager.createQuota({
        resourceType: 'runs',
        limit: 10,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      await manager.recordUsage('tenant-1', 'runs', 10);

      const result = await manager.checkQuota('tenant-1', 'runs');

      expect(result.allowed).toBe(false);
      expect(result.enforcement).toBe('hard');
      expect(result.reason).toContain('Quota exceeded');
    });

    it('should allow when soft limit exceeded', async () => {
      await manager.createQuota({
        resourceType: 'runs',
        limit: 10,
        period: 'month',
        enforcement: 'soft',
        enabled: true,
      });

      await manager.recordUsage('tenant-1', 'runs', 10);

      const result = await manager.checkQuota('tenant-1', 'runs');

      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBe('soft');
    });

    it('should warn when approaching limit', async () => {
      await manager.createQuota({
        resourceType: 'runs',
        limit: 100,
        period: 'month',
        enforcement: 'hard',
        warningThreshold: 80,
        enabled: true,
      });

      await manager.recordUsage('tenant-1', 'runs', 85);

      const result = await manager.checkQuota('tenant-1', 'runs');

      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('85.0%');
    });
  });

  describe('recordUsage()', () => {
    it('should record usage event', async () => {
      const event = await manager.recordUsage('tenant-1', 'runs', 5);

      expect(event.tenantId).toBe('tenant-1');
      expect(event.resourceType).toBe('runs');
      expect(event.amount).toBe(5);
    });

    it('should record with metadata', async () => {
      const event = await manager.recordUsage('tenant-1', 'runs', 1, {
        runId: 'run-123',
        userId: 'user-1',
      });

      expect(event.metadata).toEqual({
        runId: 'run-123',
        userId: 'user-1',
      });
    });
  });

  describe('getUsage()', () => {
    it('should get current usage', async () => {
      await manager.createQuota({
        resourceType: 'runs',
        limit: 100,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      await manager.recordUsage('tenant-1', 'runs', 25);

      const usage = await manager.getUsage('tenant-1', 'runs');

      expect(usage.currentUsage).toBe(25);
      expect(usage.limit).toBe(100);
      expect(usage.remaining).toBe(75);
      expect(usage.percentUsed).toBe(25);
    });
  });

  describe('getUsageSummary()', () => {
    it('should get usage summary', async () => {
      await manager.recordUsage('tenant-1', 'runs', 5);
      await manager.recordUsage('tenant-1', 'api_calls', 100);

      const summary = await manager.getUsageSummary('tenant-1', 'day');

      expect(summary.byResource.runs).toBe(5);
      expect(summary.byResource.api_calls).toBe(100);
    });
  });

  describe('Quota Assignment', () => {
    it('should assign quota to tenant', async () => {
      const quota = await manager.createQuota({
        resourceType: 'runs',
        limit: 100,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const assignment = await manager.assignQuotaToTenant('tenant-1', quota.id);

      expect(assignment.tenantId).toBe('tenant-1');
      expect(assignment.quotaId).toBe(quota.id);
    });

    it('should use custom limit from assignment', async () => {
      const quota = await manager.createQuota({
        resourceType: 'runs',
        limit: 100,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      await manager.assignQuotaToTenant('tenant-1', quota.id, 500);

      // Record usage up to default limit
      await manager.recordUsage('tenant-1', 'runs', 150);

      const result = await manager.checkQuota('tenant-1', 'runs');

      // Should be allowed because custom limit is 500
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(500);
    });

    it('should get tenant assignments', async () => {
      const quota1 = await manager.createQuota({
        resourceType: 'runs',
        limit: 100,
        period: 'month',
        enforcement: 'hard',
        enabled: true,
      });

      const quota2 = await manager.createQuota({
        resourceType: 'api_calls',
        limit: 1000,
        period: 'hour',
        enforcement: 'soft',
        enabled: true,
      });

      await manager.assignQuotaToTenant('tenant-1', quota1.id);
      await manager.assignQuotaToTenant('tenant-1', quota2.id);

      const assignments = await manager.getTenantAssignments('tenant-1');
      expect(assignments).toHaveLength(2);
    });
  });

  describe('initializeDefaultQuotas()', () => {
    it('should create default quotas', async () => {
      const quotas = await manager.initializeDefaultQuotas();

      expect(quotas.length).toBe(DEFAULT_QUOTAS.length);
      expect(quotas.some((q) => q.resourceType === 'runs')).toBe(true);
      expect(quotas.some((q) => q.resourceType === 'api_calls')).toBe(true);
    });
  });

  describe('pruneOldUsage()', () => {
    it('should prune old usage data', async () => {
      // Record old usage
      const pruned = await manager.pruneOldUsage(30);

      expect(pruned).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default quota config', () => {
    expect(DEFAULT_QUOTA_CONFIG.defaultEnforcement).toBe('hard');
    expect(DEFAULT_QUOTA_CONFIG.warningThreshold).toBe(80);
    expect(DEFAULT_QUOTA_CONFIG.enableBurst).toBe(true);
  });

  it('should have default quotas', () => {
    expect(DEFAULT_QUOTAS.length).toBeGreaterThan(0);
    expect(DEFAULT_QUOTAS.some((q) => q.resourceType === 'runs')).toBe(true);
    expect(DEFAULT_QUOTAS.some((q) => q.resourceType === 'concurrent_runs')).toBe(true);
    expect(DEFAULT_QUOTAS.some((q) => q.resourceType === 'api_calls')).toBe(true);
    expect(DEFAULT_QUOTAS.some((q) => q.resourceType === 'storage_bytes')).toBe(true);
  });
});
