/**
 * Governance & Compliance Reports Tests
 *
 * Epic E: RBAC & Governance
 *
 * @module @gwi/core/governance/__tests__/reports
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditQueryService,
  ComplianceService,
  type AnomalyDetectionResult,
} from '../index.js';
import {
  InMemorySecurityAuditStore,
  type CreateSecurityAuditEvent,
} from '../../security/audit/index.js';
import {
  QuotaManager,
  InMemoryQuotaStore,
  InMemoryUsageStore,
} from '../../quotas/index.js';

// =============================================================================
// Test Setup
// =============================================================================

function createTestAuditStore() {
  return new InMemorySecurityAuditStore();
}

function createTestQuotaManager() {
  return new QuotaManager(new InMemoryQuotaStore(), new InMemoryUsageStore());
}

async function seedAuditEvents(
  store: InMemorySecurityAuditStore,
  tenantId: string,
  count: number = 10
) {
  const events: CreateSecurityAuditEvent[] = [];

  for (let i = 0; i < count; i++) {
    const event: CreateSecurityAuditEvent = {
      eventType: i % 3 === 0 ? 'rbac.check.allowed' : 'rbac.check.denied',
      outcome: i % 3 === 0 ? 'success' : 'denied',
      tenantId,
      actor: {
        type: 'user',
        id: `user-${i % 3}`,
        email: `user${i % 3}@example.com`,
        ip: '192.168.1.1',
      },
      resource: {
        type: 'run',
        id: `run-${i}`,
        name: `Test Run ${i}`,
      },
      data: {
        action: i % 2 === 0 ? 'run:create' : 'run:read',
        userRole: 'DEVELOPER',
        requiredRole: 'DEVELOPER',
      },
      traceId: `trace-${i}`,
      requestId: `req-${i}`,
    };

    await store.createEvent(event);
    events.push(event);
  }

  return events;
}

// =============================================================================
// Audit Query Service Tests
// =============================================================================

describe('AuditQueryService', () => {
  let store: InMemorySecurityAuditStore;
  let service: AuditQueryService;
  const testTenantId = 'tenant-test-123';

  beforeEach(async () => {
    store = createTestAuditStore();
    service = new AuditQueryService(store);
    await seedAuditEvents(store, testTenantId, 20);
  });

  describe('queryAuditTrail', () => {
    it('should query all events for tenant', async () => {
      const result = await service.queryAuditTrail({
        tenantId: testTenantId,
        limit: 100,
      });

      expect(result.events.length).toBe(20);
      expect(result.total).toBe(20);
      expect(result.filtered).toBe(20);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by outcome', async () => {
      const result = await service.queryAuditTrail({
        tenantId: testTenantId,
        outcome: 'success',
        limit: 100,
      });

      expect(result.events.every((e) => e.outcome === 'success')).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should filter by user ID', async () => {
      const result = await service.queryAuditTrail({
        tenantId: testTenantId,
        userId: 'user-0',
        limit: 100,
      });

      expect(result.events.every((e) => e.actor.id === 'user-0')).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should filter by resource type', async () => {
      const result = await service.queryAuditTrail({
        tenantId: testTenantId,
        resourceType: 'run',
        limit: 100,
      });

      expect(result.events.every((e) => e.resource?.type === 'run')).toBe(true);
      expect(result.events.length).toBe(20);
    });

    it('should paginate results', async () => {
      const page1 = await service.queryAuditTrail({
        tenantId: testTenantId,
        limit: 10,
        offset: 0,
      });

      expect(page1.events.length).toBe(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextOffset).toBe(10);

      const page2 = await service.queryAuditTrail({
        tenantId: testTenantId,
        limit: 10,
        offset: 10,
      });

      expect(page2.events.length).toBe(10);
      expect(page2.hasMore).toBe(false);
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await service.queryAuditTrail({
        tenantId: testTenantId,
        startDate: oneDayAgo,
        endDate: now,
        limit: 100,
      });

      expect(result.events.length).toBe(20); // All recent events
    });

    it('should throw error if tenantId is missing', async () => {
      await expect(
        service.queryAuditTrail({ limit: 10 } as any)
      ).rejects.toThrow('tenantId is required');
    });
  });

  describe('getAuditSummary', () => {
    it('should generate summary statistics', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const summary = await service.getAuditSummary(testTenantId, oneDayAgo, now);

      expect(summary.totalEvents).toBe(20);
      expect(summary.byOutcome).toBeDefined();
      expect(summary.byEventType).toBeDefined();
      expect(summary.byActor).toBeDefined();
      expect(summary.topEvents.length).toBeGreaterThan(0);
      expect(summary.topActors.length).toBeGreaterThan(0);
      expect(summary.failureRate).toBeGreaterThanOrEqual(0);
      expect(summary.denialRate).toBeGreaterThan(0);
    });

    it('should calculate failure rate correctly', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const summary = await service.getAuditSummary(testTenantId, oneDayAgo, now);

      const totalEvents = summary.totalEvents;
      const deniedEvents = summary.byOutcome.denied || 0;
      const expectedDenialRate = (deniedEvents / totalEvents) * 100;

      expect(summary.denialRate).toBeCloseTo(expectedDenialRate, 1);
    });
  });

  describe('getUserActivity', () => {
    it('should fetch activity for specific user', async () => {
      const events = await service.getUserActivity('user-0', testTenantId);

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.actor.id === 'user-0')).toBe(true);
      expect(events.every((e) => e.tenantId === testTenantId)).toBe(true);
    });

    it('should limit results', async () => {
      const events = await service.getUserActivity('user-0', testTenantId, {
        limit: 3,
      });

      expect(events.length).toBeLessThanOrEqual(3);
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const events = await service.getUserActivity('user-0', testTenantId, {
        startDate: twoDaysAgo,
        endDate: now,
      });

      expect(events.every((e) => e.timestamp >= twoDaysAgo)).toBe(true);
      expect(events.every((e) => e.timestamp <= now)).toBe(true);
    });
  });

  describe('getResourceHistory', () => {
    it('should fetch history for specific resource', async () => {
      const events = await service.getResourceHistory('run-5', testTenantId);

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.resource?.id === 'run-5')).toBe(true);
    });

    it('should filter by resource type', async () => {
      const events = await service.getResourceHistory('run-5', testTenantId, {
        resourceType: 'run',
      });

      expect(events.every((e) => e.resource?.type === 'run')).toBe(true);
    });
  });

  describe('detectAnomalies', () => {
    beforeEach(async () => {
      // Seed additional events for anomaly detection
      const anomalyStore = createTestAuditStore();
      service = new AuditQueryService(anomalyStore);

      // Create high failure rate for user-anomaly
      for (let i = 0; i < 20; i++) {
        await anomalyStore.createEvent({
          eventType: 'rbac.check.denied',
          outcome: 'failure',
          tenantId: testTenantId,
          actor: {
            type: 'user',
            id: 'user-anomaly',
            email: 'anomaly@example.com',
          },
        });
      }

      // Create normal events
      for (let i = 0; i < 5; i++) {
        await anomalyStore.createEvent({
          eventType: 'rbac.check.allowed',
          outcome: 'success',
          tenantId: testTenantId,
          actor: {
            type: 'user',
            id: 'user-normal',
            email: 'normal@example.com',
          },
        });
      }
    });

    it('should detect high failure rates', async () => {
      const result = await service.detectAnomalies(testTenantId, {
        lookbackDays: 7,
        minThreshold: 5,
      });

      expect(result.totalAnomalies).toBeGreaterThan(0);
      const highFailureAnomaly = result.anomalies.find(
        (a) => a.type === 'high_failure_rate'
      );
      expect(highFailureAnomaly).toBeDefined();
      expect(highFailureAnomaly?.actorId).toBe('user-anomaly');
    });

    it('should detect repeated access denials', async () => {
      // Create multiple denied events
      const denialStore = createTestAuditStore();
      service = new AuditQueryService(denialStore);

      for (let i = 0; i < 10; i++) {
        await denialStore.createEvent({
          eventType: 'rbac.check.denied',
          outcome: 'denied',
          tenantId: testTenantId,
          actor: {
            type: 'user',
            id: 'user-denied',
            email: 'denied@example.com',
          },
        });
      }

      const result = await service.detectAnomalies(testTenantId, {
        lookbackDays: 7,
        minThreshold: 5,
      });

      const denialAnomaly = result.anomalies.find(
        (a) => a.type === 'repeated_access_denials'
      );
      expect(denialAnomaly).toBeDefined();
      expect(denialAnomaly?.actorId).toBe('user-denied');
    });

    it('should group anomalies by type and severity', async () => {
      const result = await service.detectAnomalies(testTenantId);

      expect(result.byType).toBeDefined();
      expect(result.bySeverity).toBeDefined();
      expect(result.period.start).toBeInstanceOf(Date);
      expect(result.period.end).toBeInstanceOf(Date);
    });
  });
});

// =============================================================================
// Compliance Service Tests
// =============================================================================

describe('ComplianceService', () => {
  let store: InMemorySecurityAuditStore;
  let quotaManager: QuotaManager;
  let service: ComplianceService;
  const testTenantId = 'tenant-test-456';

  beforeEach(async () => {
    store = createTestAuditStore();
    quotaManager = createTestQuotaManager();
    service = new ComplianceService(store, quotaManager);

    // Seed test data
    await seedAuditEvents(store, testTenantId, 15);

    // Initialize quotas
    await quotaManager.initializeDefaultQuotas();
  });

  describe('generateAccessReport', () => {
    it('should generate access report for a period', async () => {
      const report = await service.generateAccessReport(testTenantId, 'week');

      expect(report.reportType).toBe('access');
      expect(report.tenantId).toBe(testTenantId);
      expect(report.summary.totalEvents).toBe(15);
      expect(report.summary.uniqueUsers).toBeGreaterThan(0);
      expect(report.accessLog.length).toBe(15);
      expect(report.period.type).toBe('week');
    });

    it('should support custom date range', async () => {
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = new Date();

      const report = await service.generateAccessReport(testTenantId, 'custom', {
        start,
        end,
      });

      expect(report.period.start).toEqual(start);
      expect(report.period.end).toEqual(end);
    });

    it('should include IP addresses in access log', async () => {
      const report = await service.generateAccessReport(testTenantId, 'day');

      const entriesWithIp = report.accessLog.filter((e) => e.ipAddress);
      expect(entriesWithIp.length).toBeGreaterThan(0);
    });
  });

  describe('generateRBACComplianceReport', () => {
    beforeEach(async () => {
      // Add RBAC-specific events
      await store.createEvent({
        eventType: 'rbac.role.assigned',
        outcome: 'success',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'admin-user',
          email: 'admin@example.com',
        },
        data: {
          targetUserId: 'new-user',
          role: 'DEVELOPER',
        },
      });

      // Add denied events
      for (let i = 0; i < 5; i++) {
        await store.createEvent({
          eventType: 'rbac.check.denied',
          outcome: 'denied',
          tenantId: testTenantId,
          actor: {
            type: 'user',
            id: 'restricted-user',
            email: 'restricted@example.com',
          },
          data: {
            action: 'tenant:delete',
          },
          error: 'Insufficient permissions',
        });
      }
    });

    it('should generate RBAC compliance report', async () => {
      const report = await service.generateRBACComplianceReport(testTenantId, 'month');

      expect(report.reportType).toBe('rbac');
      expect(report.summary.deniedAttempts).toBeGreaterThan(0);
      expect(report.summary.denialRate).toBeGreaterThan(0);
      expect(report.roleAssignments.length).toBeGreaterThan(0);
      expect(report.deniedAccess.length).toBeGreaterThan(0);
    });

    it('should calculate denial rate correctly', async () => {
      const report = await service.generateRBACComplianceReport(testTenantId, 'month');

      const total = report.summary.totalPermissionChecks;
      const denied = report.summary.deniedAttempts;
      const expectedRate = total > 0 ? (denied / total) * 100 : 0;

      expect(report.summary.denialRate).toBeCloseTo(expectedRate, 1);
    });

    it('should track permission usage stats', async () => {
      const report = await service.generateRBACComplianceReport(testTenantId, 'month');

      expect(report.permissionUsage.length).toBeGreaterThan(0);
      for (const perm of report.permissionUsage) {
        expect(perm.totalAttempts).toBe(perm.allowed + perm.denied);
      }
    });
  });

  describe('generateQuotaComplianceReport', () => {
    beforeEach(async () => {
      // Record some usage
      await quotaManager.recordUsage(testTenantId, 'runs', 50);
      await quotaManager.recordUsage(testTenantId, 'api_calls', 5000);

      // Create quota violation event
      await store.createEvent({
        eventType: 'plan.limit.exceeded',
        outcome: 'denied',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'heavy-user',
          email: 'heavy@example.com',
        },
        data: {
          resource: 'runs',
          limit: 1000,
          current: 1050,
        },
      });
    });

    it('should generate quota compliance report', async () => {
      const report = await service.generateQuotaComplianceReport(testTenantId, 'month');

      expect(report.reportType).toBe('quota');
      expect(report.summary.totalQuotas).toBeGreaterThan(0);
      expect(report.quotaUsage.length).toBeGreaterThan(0);
      expect(report.violations.length).toBeGreaterThan(0);
    });

    it('should categorize quota status correctly', async () => {
      const report = await service.generateQuotaComplianceReport(testTenantId, 'month');

      for (const usage of report.quotaUsage) {
        if (usage.percentUsed >= 100) {
          expect(usage.status).toBe('exceeded');
        } else if (usage.percentUsed >= 80) {
          expect(usage.status).toBe('warning');
        } else {
          expect(usage.status).toBe('ok');
        }
      }
    });

    it('should calculate average utilization', async () => {
      const report = await service.generateQuotaComplianceReport(testTenantId, 'month');

      const totalUtilization = report.quotaUsage.reduce(
        (sum, q) => sum + q.percentUsed,
        0
      );
      const expectedAverage =
        report.quotaUsage.length > 0 ? totalUtilization / report.quotaUsage.length : 0;

      expect(report.summary.averageUtilization).toBeCloseTo(expectedAverage, 1);
    });
  });

  describe('generateSecretAccessReport', () => {
    beforeEach(async () => {
      // Add secret access events
      await store.createEvent({
        eventType: 'secret.accessed',
        outcome: 'success',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'dev-user',
          email: 'dev@example.com',
        },
        resource: {
          type: 'secret',
          id: 'secret-github-token',
        },
      });

      await store.createEvent({
        eventType: 'secret.rotated',
        outcome: 'success',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'admin-user',
          email: 'admin@example.com',
        },
        resource: {
          type: 'secret',
          id: 'secret-api-key',
        },
      });
    });

    it('should generate secret access report', async () => {
      const report = await service.generateSecretAccessReport(testTenantId, 'month');

      expect(report.reportType).toBe('secret');
      expect(report.summary.totalSecretAccess).toBeGreaterThan(0);
      expect(report.secretAccess.length).toBeGreaterThan(0);
      expect(report.rotationSchedule.length).toBeGreaterThan(0);
    });

    it('should track unique secrets accessed', async () => {
      const report = await service.generateSecretAccessReport(testTenantId, 'month');

      const uniqueSecrets = new Set(report.secretAccess.map((s) => s.secretId));
      expect(report.summary.uniqueSecretsAccessed).toBe(uniqueSecrets.size);
    });

    it('should determine rotation status', async () => {
      const report = await service.generateSecretAccessReport(testTenantId, 'month');

      for (const rotation of report.rotationSchedule) {
        expect(['current', 'due', 'overdue']).toContain(rotation.status);
      }
    });
  });

  describe('generateHighRiskActionsReport', () => {
    beforeEach(async () => {
      // Add high-risk events
      await store.createEvent({
        eventType: 'git.push.executed',
        outcome: 'success',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'dev-user',
          email: 'dev@example.com',
        },
        resource: {
          type: 'repository',
          id: 'repo-main',
        },
      });

      await store.createEvent({
        eventType: 'candidate.executed',
        outcome: 'failure',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'admin-user',
          email: 'admin@example.com',
        },
      });
    });

    it('should generate high-risk actions report', async () => {
      const report = await service.generateHighRiskActionsReport(testTenantId, 'week');

      expect(report.reportType).toBe('high_risk');
      expect(report.summary.totalHighRiskActions).toBeGreaterThan(0);
      expect(report.actions.length).toBeGreaterThan(0);
    });

    it('should flag failed actions for review', async () => {
      const report = await service.generateHighRiskActionsReport(testTenantId, 'week');

      const failedAction = report.actions.find((a) => a.outcome === 'failure');
      expect(failedAction?.requiresReview).toBe(true);
    });

    it('should group actions by type and user', async () => {
      const report = await service.generateHighRiskActionsReport(testTenantId, 'week');

      expect(Object.keys(report.summary.byActionType).length).toBeGreaterThan(0);
      expect(Object.keys(report.summary.byUser).length).toBeGreaterThan(0);
    });
  });

  describe('exportToCSV', () => {
    it('should export access report to CSV', async () => {
      const report = await service.generateAccessReport(testTenantId, 'week');
      const csv = service.exportToCSV(report);

      expect(csv).toContain('Timestamp');
      expect(csv).toContain('User ID');
      expect(csv).toContain('Action');
      expect(csv.split('\n').length).toBeGreaterThan(1);
    });

    it('should export RBAC report to CSV', async () => {
      const report = await service.generateRBACComplianceReport(testTenantId, 'month');
      const csv = service.exportToCSV(report);

      expect(csv).toContain('Denied Access');
      expect(csv.split('\n').length).toBeGreaterThan(1);
    });

    it('should escape CSV special characters', async () => {
      // Create event with CSV-special characters
      await store.createEvent({
        eventType: 'rbac.check.allowed',
        outcome: 'success',
        tenantId: testTenantId,
        actor: {
          type: 'user',
          id: 'user-with,comma',
          email: 'test"quote@example.com',
        },
      });

      const report = await service.generateAccessReport(testTenantId, 'day');
      const csv = service.exportToCSV(report);

      // Should have quoted values with special chars
      expect(csv).toContain('"');
    });

    it('should throw error for unsupported report type', () => {
      const invalidReport = {
        reportId: 'test',
        reportType: 'invalid',
        tenantId: testTenantId,
        generatedAt: new Date(),
        period: {
          start: new Date(),
          end: new Date(),
          type: 'day' as const,
        },
      };

      expect(() => service.exportToCSV(invalidReport as any)).toThrow(
        'Unsupported report type'
      );
    });
  });
});
