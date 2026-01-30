/**
 * Heartbeat Service Tests
 *
 * B2: Cloud Run Reliability - Durable Orchestration State
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HeartbeatService, getHeartbeatService, resetHeartbeatService } from '../heartbeat.js';
import { InMemoryTenantStore } from '@gwi/core';

describe('HeartbeatService', () => {
  let store: InMemoryTenantStore;
  let service: HeartbeatService;

  beforeEach(() => {
    store = new InMemoryTenantStore();
    service = new HeartbeatService({ store, intervalMs: 100 });
  });

  afterEach(() => {
    service.shutdown();
    resetHeartbeatService();
  });

  describe('initialization', () => {
    it('should generate a unique owner ID', () => {
      const service1 = new HeartbeatService({ store });
      const service2 = new HeartbeatService({ store });

      expect(service1.getOwnerId()).toBeTruthy();
      expect(service2.getOwnerId()).toBeTruthy();
      expect(service1.getOwnerId()).not.toBe(service2.getOwnerId());

      service1.shutdown();
      service2.shutdown();
    });

    it('should accept custom owner ID', () => {
      const customService = new HeartbeatService({
        store,
        ownerId: 'custom-instance-123',
      });

      expect(customService.getOwnerId()).toBe('custom-instance-123');
      customService.shutdown();
    });
  });

  describe('startHeartbeat', () => {
    it('should track active runs', async () => {
      // Create a run first
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
      });

      service.startHeartbeat('tenant-1', 'run-1');

      expect(service.getActiveRunCount()).toBe(1);
      expect(service.getActiveRunIds()).toContain('run-1');
    });

    it('should not duplicate heartbeat for same run', async () => {
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
      });

      service.startHeartbeat('tenant-1', 'run-1');
      service.startHeartbeat('tenant-1', 'run-1');

      expect(service.getActiveRunCount()).toBe(1);
    });
  });

  describe('stopHeartbeat', () => {
    it('should remove run from tracking', async () => {
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
      });

      service.startHeartbeat('tenant-1', 'run-1');
      expect(service.getActiveRunCount()).toBe(1);

      service.stopHeartbeat('run-1');
      expect(service.getActiveRunCount()).toBe(0);
    });

    it('should be safe to call for non-existent run', () => {
      expect(() => service.stopHeartbeat('non-existent')).not.toThrow();
    });
  });

  describe('recoverOrphanedRuns', () => {
    it('should find runs with stale heartbeat', async () => {
      // Create a run with old heartbeat
      const oldDate = new Date(Date.now() - 600_000); // 10 minutes ago
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      const orphans = await service.recoverOrphanedRuns({
        staleThresholdMs: 300_000, // 5 minutes
        failOrphans: false,
      });

      expect(orphans.length).toBe(1);
      expect(orphans[0].ownerId).toBe('dead-instance');
    });

    it('should not find runs with fresh heartbeat', async () => {
      // Create a run with fresh heartbeat
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: new Date(), // Now
        ownerId: 'active-instance',
      });

      const orphans = await service.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
        failOrphans: false,
      });

      expect(orphans.length).toBe(0);
    });

    it('should fail orphaned runs when failOrphans=true', async () => {
      // Create an orphaned run
      const oldDate = new Date(Date.now() - 600_000);
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: oldDate,
        ownerId: 'dead-instance',
      });

      await service.recoverOrphanedRuns({
        staleThresholdMs: 300_000,
        failOrphans: true,
      });

      // Check that the run was failed
      const runs = await store.listRuns('tenant-1', {});
      expect(runs[0].status).toBe('failed');
      expect(runs[0].error).toContain('orphaned');
    });
  });

  describe('recoverOwnedRuns', () => {
    it('should find runs owned by this instance', async () => {
      // Create a run owned by this instance
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: new Date(),
        ownerId: service.getOwnerId(),
      });

      const ownedRuns = await service.recoverOwnedRuns();
      expect(ownedRuns.length).toBe(1);
    });

    it('should not find runs owned by other instances', async () => {
      // Create a run owned by different instance
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
        lastHeartbeatAt: new Date(),
        ownerId: 'other-instance',
      });

      const ownedRuns = await service.recoverOwnedRuns();
      expect(ownedRuns.length).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop all active heartbeats', async () => {
      await store.createRun('tenant-1', {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        prId: 'pr-1',
        prUrl: 'https://github.com/test/repo/pull/1',
        type: 'review',
        status: 'running',
        steps: [],
        trigger: { source: 'cli' },
      });

      service.startHeartbeat('tenant-1', 'run-1');
      service.startHeartbeat('tenant-1', 'run-2');
      expect(service.getActiveRunCount()).toBe(2);

      service.shutdown();
      expect(service.getActiveRunCount()).toBe(0);
    });

    it('should prevent new heartbeats after shutdown', async () => {
      service.shutdown();
      service.startHeartbeat('tenant-1', 'run-1');
      expect(service.getActiveRunCount()).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getHeartbeatService', () => {
      const s1 = getHeartbeatService(store);
      const s2 = getHeartbeatService();

      expect(s1).toBe(s2);
    });

    it('should throw if no store provided on first call', () => {
      resetHeartbeatService();
      expect(() => getHeartbeatService()).toThrow('not initialized');
    });
  });
});
