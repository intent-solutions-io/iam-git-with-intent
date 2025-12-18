/**
 * Disaster Recovery Tests
 *
 * Phase 44: Tests for backup, restore, and failover mechanisms.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryBackupStore,
  InMemoryRestoreStore,
  DisasterRecoveryManager,
  createDRManager,
  DEFAULT_DR_CONFIG,
} from '../index.js';

// =============================================================================
// InMemoryBackupStore Tests
// =============================================================================

describe('InMemoryBackupStore', () => {
  let store: InMemoryBackupStore;

  beforeEach(() => {
    store = new InMemoryBackupStore();
  });

  describe('createBackup()', () => {
    it('should create backup', async () => {
      const backup = await store.createBackup('tenant-1', 'full');

      expect(backup.id).toMatch(/^backup_/);
      expect(backup.tenantId).toBe('tenant-1');
      expect(backup.type).toBe('full');
      expect(backup.status).toBe('pending');
    });

    it('should create backup with options', async () => {
      const backup = await store.createBackup('tenant-1', 'incremental', {
        retentionDays: 90,
        tags: { environment: 'prod' },
      });

      expect(backup.retentionDays).toBe(90);
      expect(backup.tags.environment).toBe('prod');
    });

    it('should set expiration date', async () => {
      const backup = await store.createBackup('tenant-1', 'full', { retentionDays: 7 });

      expect(backup.expiresAt).toBeDefined();
      const daysUntilExpiry = (backup.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeGreaterThan(6);
      expect(daysUntilExpiry).toBeLessThan(8);
    });
  });

  describe('getBackup()', () => {
    it('should get backup by ID', async () => {
      const created = await store.createBackup('tenant-1', 'full');
      const retrieved = await store.getBackup(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent', async () => {
      const result = await store.getBackup('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listBackups()', () => {
    beforeEach(async () => {
      await store.createBackup('tenant-1', 'full');
      await store.createBackup('tenant-1', 'incremental');
      await store.createBackup('tenant-1', 'full');
      await store.createBackup('tenant-2', 'full');
    });

    it('should list backups for tenant', async () => {
      const backups = await store.listBackups('tenant-1');
      expect(backups).toHaveLength(3);
      expect(backups.every((b) => b.tenantId === 'tenant-1')).toBe(true);
    });

    it('should filter by type', async () => {
      const backups = await store.listBackups('tenant-1', { type: 'full' });
      expect(backups).toHaveLength(2);
      expect(backups.every((b) => b.type === 'full')).toBe(true);
    });

    it('should limit results', async () => {
      const backups = await store.listBackups('tenant-1', { limit: 2 });
      expect(backups).toHaveLength(2);
    });

    it('should sort by date descending', async () => {
      const backups = await store.listBackups('tenant-1');
      for (let i = 1; i < backups.length; i++) {
        expect(backups[i - 1].startedAt.getTime()).toBeGreaterThanOrEqual(
          backups[i].startedAt.getTime()
        );
      }
    });
  });

  describe('updateBackupStatus()', () => {
    it('should update status', async () => {
      const backup = await store.createBackup('tenant-1', 'full');
      const updated = await store.updateBackupStatus(backup.id, 'completed');

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('should throw for non-existent', async () => {
      await expect(store.updateBackupStatus('non-existent', 'completed')).rejects.toThrow();
    });
  });

  describe('deleteBackup()', () => {
    it('should delete backup', async () => {
      const backup = await store.createBackup('tenant-1', 'full');
      await store.deleteBackup(backup.id);

      const deleted = await store.getBackup(backup.id);
      expect(deleted).toBeNull();
    });

    it('should throw for non-existent', async () => {
      await expect(store.deleteBackup('non-existent')).rejects.toThrow();
    });
  });

  describe('verifyBackup()', () => {
    it('should verify valid backup', async () => {
      const backup = await store.createBackup('tenant-1', 'full');
      await store.updateBackupStatus(backup.id, 'completed');

      // Set required fields
      const updated = await store.getBackup(backup.id);
      updated!.checksum = 'sha256:abc123';
      updated!.sizeBytes = 1000;

      const result = await store.verifyBackup(backup.id);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for incomplete backup', async () => {
      const backup = await store.createBackup('tenant-1', 'full');

      const result = await store.verifyBackup(backup.id);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return false for non-existent', async () => {
      const result = await store.verifyBackup('non-existent');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Backup not found');
    });
  });
});

// =============================================================================
// InMemoryRestoreStore Tests
// =============================================================================

describe('InMemoryRestoreStore', () => {
  let store: InMemoryRestoreStore;

  beforeEach(() => {
    store = new InMemoryRestoreStore();
  });

  describe('createRestore()', () => {
    it('should create restore request', async () => {
      const restore = await store.createRestore({
        tenantId: 'tenant-1',
        backupId: 'backup_1',
        status: 'pending',
        requestedBy: 'user-1',
      });

      expect(restore.id).toMatch(/^restore_/);
      expect(restore.status).toBe('pending');
      expect(restore.requestedAt).toBeDefined();
    });
  });

  describe('getRestore()', () => {
    it('should get restore by ID', async () => {
      const created = await store.createRestore({
        tenantId: 'tenant-1',
        backupId: 'backup_1',
        status: 'pending',
        requestedBy: 'user-1',
      });

      const retrieved = await store.getRestore(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent', async () => {
      const result = await store.getRestore('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listRestores()', () => {
    it('should list restores for tenant', async () => {
      await store.createRestore({
        tenantId: 'tenant-1',
        backupId: 'backup_1',
        status: 'pending',
        requestedBy: 'user-1',
      });

      await store.createRestore({
        tenantId: 'tenant-1',
        backupId: 'backup_2',
        status: 'pending',
        requestedBy: 'user-1',
      });

      await store.createRestore({
        tenantId: 'tenant-2',
        backupId: 'backup_3',
        status: 'pending',
        requestedBy: 'user-2',
      });

      const restores = await store.listRestores('tenant-1');
      expect(restores).toHaveLength(2);
    });
  });

  describe('updateRestoreStatus()', () => {
    it('should update status', async () => {
      const restore = await store.createRestore({
        tenantId: 'tenant-1',
        backupId: 'backup_1',
        status: 'pending',
        requestedBy: 'user-1',
      });

      const updated = await store.updateRestoreStatus(restore.id, 'completed');
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('should set error message', async () => {
      const restore = await store.createRestore({
        tenantId: 'tenant-1',
        backupId: 'backup_1',
        status: 'pending',
        requestedBy: 'user-1',
      });

      const updated = await store.updateRestoreStatus(restore.id, 'failed', 'Disk full');
      expect(updated.status).toBe('failed');
      expect(updated.error).toBe('Disk full');
    });

    it('should throw for non-existent', async () => {
      await expect(store.updateRestoreStatus('non-existent', 'completed')).rejects.toThrow();
    });
  });
});

// =============================================================================
// DisasterRecoveryManager Tests
// =============================================================================

describe('DisasterRecoveryManager', () => {
  let manager: DisasterRecoveryManager;

  beforeEach(() => {
    manager = createDRManager();
  });

  describe('Backup Operations', () => {
    it('should create backup', async () => {
      const backup = await manager.createBackup('tenant-1', 'full');

      expect(backup.id).toBeDefined();
      expect(backup.type).toBe('full');
    });

    it('should list backups', async () => {
      await manager.createBackup('tenant-1', 'full');
      await manager.createBackup('tenant-1', 'incremental');

      const backups = await manager.listBackups('tenant-1');
      expect(backups).toHaveLength(2);
    });

    it('should verify backup', async () => {
      const backup = await manager.createBackup('tenant-1', 'full');

      // Wait for backup to complete (simulated)
      await new Promise((resolve) => setTimeout(resolve, 200));

      const result = await manager.verifyBackup(backup.id);
      expect(result.valid).toBe(true);
    });

    it('should delete backup', async () => {
      const backup = await manager.createBackup('tenant-1', 'full');
      await manager.deleteBackup(backup.id);

      const deleted = await manager.getBackup(backup.id);
      expect(deleted).toBeNull();
    });
  });

  describe('Restore Operations', () => {
    it('should restore from backup', async () => {
      const backup = await manager.createBackup('tenant-1', 'full');

      // Wait for backup to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const restore = await manager.restoreFromBackup('tenant-1', backup.id, 'user-1');

      expect(restore.backupId).toBe(backup.id);
      expect(restore.status).toBe('pending');
    });

    it('should reject restore from non-existent backup', async () => {
      await expect(
        manager.restoreFromBackup('tenant-1', 'non-existent', 'user-1')
      ).rejects.toThrow('not found');
    });

    it('should reject restore from other tenant backup', async () => {
      const backup = await manager.createBackup('tenant-2', 'full');

      // Wait for backup to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      await expect(
        manager.restoreFromBackup('tenant-1', backup.id, 'user-1')
      ).rejects.toThrow('does not belong');
    });

    it('should cancel restore', async () => {
      const backup = await manager.createBackup('tenant-1', 'full');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const restore = await manager.restoreFromBackup('tenant-1', backup.id, 'user-1');
      const cancelled = await manager.cancelRestore(restore.id);

      expect(cancelled.status).toBe('cancelled');
    });

    it('should list restores', async () => {
      const backup = await manager.createBackup('tenant-1', 'full');
      await new Promise((resolve) => setTimeout(resolve, 200));

      await manager.restoreFromBackup('tenant-1', backup.id, 'user-1');
      await manager.restoreFromBackup('tenant-1', backup.id, 'user-2');

      const restores = await manager.listRestores('tenant-1');
      expect(restores).toHaveLength(2);
    });
  });

  describe('Schedule Management', () => {
    it('should create schedule', async () => {
      const schedule = await manager.createSchedule({
        tenantId: 'tenant-1',
        name: 'Daily Backup',
        type: 'full',
        cronExpression: '0 0 * * *',
        retentionDays: 30,
        enabled: true,
      });

      expect(schedule.id).toMatch(/^schedule_/);
      expect(schedule.nextRunAt).toBeDefined();
    });

    it('should list schedules', async () => {
      await manager.createSchedule({
        tenantId: 'tenant-1',
        name: 'Schedule 1',
        type: 'full',
        cronExpression: '0 0 * * *',
        retentionDays: 30,
        enabled: true,
      });

      await manager.createSchedule({
        tenantId: 'tenant-1',
        name: 'Schedule 2',
        type: 'incremental',
        cronExpression: '0 * * * *',
        retentionDays: 7,
        enabled: true,
      });

      const schedules = await manager.listSchedules('tenant-1');
      expect(schedules).toHaveLength(2);
    });

    it('should enable/disable schedule', async () => {
      const schedule = await manager.createSchedule({
        tenantId: 'tenant-1',
        name: 'Test Schedule',
        type: 'full',
        cronExpression: '0 0 * * *',
        retentionDays: 30,
        enabled: true,
      });

      const disabled = await manager.setScheduleEnabled(schedule.id, false);
      expect(disabled.enabled).toBe(false);
      expect(disabled.nextRunAt).toBeUndefined();

      const enabled = await manager.setScheduleEnabled(schedule.id, true);
      expect(enabled.enabled).toBe(true);
      expect(enabled.nextRunAt).toBeDefined();
    });

    it('should delete schedule', async () => {
      const schedule = await manager.createSchedule({
        tenantId: 'tenant-1',
        name: 'Test Schedule',
        type: 'full',
        cronExpression: '0 0 * * *',
        retentionDays: 30,
        enabled: true,
      });

      await manager.deleteSchedule(schedule.id);

      const deleted = await manager.getSchedule(schedule.id);
      expect(deleted).toBeNull();
    });
  });

  describe('Failover Management', () => {
    it('should create failover config', async () => {
      const config = await manager.createFailoverConfig({
        tenantId: 'tenant-1',
        primaryRegion: 'us-central1',
        secondaryRegions: ['us-east1', 'us-west1'],
        mode: 'automatic',
        healthCheckInterval: 30,
        failoverThreshold: 3,
        enabled: true,
      });

      expect(config.id).toMatch(/^failover_/);
      expect(config.currentActiveRegion).toBe('us-central1');
    });

    it('should perform health check', async () => {
      const result = await manager.healthCheck('us-central1');

      expect(result.region).toBe('us-central1');
      expect(result.healthy).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('should trigger failover', async () => {
      const config = await manager.createFailoverConfig({
        tenantId: 'tenant-1',
        primaryRegion: 'us-central1',
        secondaryRegions: ['us-east1', 'us-west1'],
        mode: 'manual',
        healthCheckInterval: 30,
        failoverThreshold: 3,
        enabled: true,
      });

      const updated = await manager.triggerFailover(config.id, 'us-east1');

      expect(updated.currentActiveRegion).toBe('us-east1');
      expect(updated.lastFailoverAt).toBeDefined();
    });

    it('should reject failover to invalid region', async () => {
      const config = await manager.createFailoverConfig({
        tenantId: 'tenant-1',
        primaryRegion: 'us-central1',
        secondaryRegions: ['us-east1'],
        mode: 'manual',
        healthCheckInterval: 30,
        failoverThreshold: 3,
        enabled: true,
      });

      await expect(manager.triggerFailover(config.id, 'eu-west1')).rejects.toThrow(
        'not a valid secondary region'
      );
    });

    it('should get health history', async () => {
      await manager.healthCheck('us-central1');
      await manager.healthCheck('us-central1');
      await manager.healthCheck('us-central1');

      const history = await manager.getHealthHistory('us-central1', 2);
      expect(history).toHaveLength(2);
    });
  });

  describe('DR Plan Management', () => {
    it('should create DR plan', async () => {
      const plan = await manager.createDRPlan({
        tenantId: 'tenant-1',
        name: 'Production DR Plan',
        rpoLevel: '15min',
        rtoLevel: '1hour',
        backupSchedules: ['schedule_1'],
        runbooks: [
          {
            name: 'Database Failover',
            steps: ['Check health', 'Promote replica', 'Update DNS'],
            contacts: ['oncall@example.com'],
          },
        ],
      });

      expect(plan.id).toMatch(/^drplan_/);
      expect(plan.rpoLevel).toBe('15min');
    });

    it('should list DR plans', async () => {
      await manager.createDRPlan({
        tenantId: 'tenant-1',
        name: 'Plan 1',
        rpoLevel: '15min',
        rtoLevel: '1hour',
        backupSchedules: [],
        runbooks: [],
      });

      await manager.createDRPlan({
        tenantId: 'tenant-1',
        name: 'Plan 2',
        rpoLevel: '1hour',
        rtoLevel: '4hours',
        backupSchedules: [],
        runbooks: [],
      });

      const plans = await manager.listDRPlans('tenant-1');
      expect(plans).toHaveLength(2);
    });

    it('should record DR test result', async () => {
      const plan = await manager.createDRPlan({
        tenantId: 'tenant-1',
        name: 'Test Plan',
        rpoLevel: '15min',
        rtoLevel: '1hour',
        backupSchedules: [],
        runbooks: [],
      });

      const updated = await manager.recordDRTest(plan.id, {
        success: true,
        actualRtoMinutes: 45,
        notes: 'Successful failover test',
      });

      expect(updated.testResults).toHaveLength(1);
      expect(updated.testResults![0].success).toBe(true);
      expect(updated.lastTestedAt).toBeDefined();
    });
  });

  describe('Utility Methods', () => {
    it('should get RPO in minutes', () => {
      expect(manager.getRPOMinutes('1min')).toBe(1);
      expect(manager.getRPOMinutes('15min')).toBe(15);
      expect(manager.getRPOMinutes('1hour')).toBe(60);
      expect(manager.getRPOMinutes('24hours')).toBe(1440);
    });

    it('should get RTO in minutes', () => {
      expect(manager.getRTOMinutes('1min')).toBe(1);
      expect(manager.getRTOMinutes('15min')).toBe(15);
      expect(manager.getRTOMinutes('1hour')).toBe(60);
      expect(manager.getRTOMinutes('4hours')).toBe(240);
      expect(manager.getRTOMinutes('24hours')).toBe(1440);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default DR config', () => {
    expect(DEFAULT_DR_CONFIG.defaultRetentionDays).toBe(30);
    expect(DEFAULT_DR_CONFIG.maxConcurrentBackups).toBe(3);
    expect(DEFAULT_DR_CONFIG.healthCheckIntervalMs).toBe(30000);
  });
});
