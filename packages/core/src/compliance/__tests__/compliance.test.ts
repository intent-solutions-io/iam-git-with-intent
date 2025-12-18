/**
 * Compliance & Audit Tests
 *
 * Phase 41: Tests for compliance controls and audit logging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryComplianceAuditStore,
  ComplianceManager,
  ComplianceAuditLogger,
  createComplianceManager,
  createComplianceAuditLogger,
  SOC2_CONTROLS,
  GDPR_CONTROLS,
  auditEventsToCsv,
  auditEventsToNdjson,
  ComplianceAuditEvent,
} from '../index.js';

// =============================================================================
// InMemoryComplianceAuditStore Tests
// =============================================================================

describe('InMemoryComplianceAuditStore', () => {
  let store: InMemoryComplianceAuditStore;

  beforeEach(() => {
    store = new InMemoryComplianceAuditStore();
  });

  describe('record()', () => {
    it('should record audit event', async () => {
      const event = await store.record({
        type: 'auth.login',
        tenantId: 'tenant-1',
        actor: { type: 'user', id: 'user-1', name: 'Test User' },
      });

      expect(event.id).toMatch(/^audit_/);
      expect(event.type).toBe('auth.login');
      expect(event.timestamp).toBeDefined();
    });

    it('should record event with target and details', async () => {
      const event = await store.record({
        type: 'run.create',
        tenantId: 'tenant-1',
        actor: { type: 'user', id: 'user-1' },
        target: { type: 'run', id: 'run-1', name: 'Test Run' },
        details: { issueNumber: 42, repoUrl: 'https://github.com/test/repo' },
      });

      expect(event.target).toEqual({ type: 'run', id: 'run-1', name: 'Test Run' });
      expect(event.details).toEqual({ issueNumber: 42, repoUrl: 'https://github.com/test/repo' });
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      await store.record({
        type: 'auth.login',
        tenantId: 'tenant-1',
        actor: { type: 'user', id: 'user-1' },
      });
      await store.record({
        type: 'auth.logout',
        tenantId: 'tenant-1',
        actor: { type: 'user', id: 'user-1' },
      });
      await store.record({
        type: 'run.create',
        tenantId: 'tenant-1',
        actor: { type: 'user', id: 'user-2' },
      });
      await store.record({
        type: 'auth.login',
        tenantId: 'tenant-2',
        actor: { type: 'user', id: 'user-3' },
      });
    });

    it('should query events by tenant', async () => {
      const { events, total } = await store.query('tenant-1', {});

      expect(total).toBe(3);
      expect(events).toHaveLength(3);
      expect(events.every(e => e.tenantId === 'tenant-1')).toBe(true);
    });

    it('should filter by event type', async () => {
      const { events, total } = await store.query('tenant-1', {
        eventTypes: ['auth.login'],
      });

      expect(total).toBe(1);
      expect(events[0].type).toBe('auth.login');
    });

    it('should paginate results', async () => {
      const page1 = await store.query('tenant-1', { limit: 2, offset: 0 });
      const page2 = await store.query('tenant-1', { limit: 2, offset: 2 });

      expect(page1.events).toHaveLength(2);
      expect(page2.events).toHaveLength(1);
      expect(page1.total).toBe(3);
    });

    it('should sort by timestamp descending', async () => {
      const { events } = await store.query('tenant-1', {});

      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          events[i].timestamp.getTime()
        );
      }
    });
  });

  describe('export()', () => {
    it('should create export', async () => {
      await store.record({
        type: 'auth.login',
        tenantId: 'tenant-1',
        actor: { type: 'user', id: 'user-1' },
      });

      const result = await store.export({
        tenantId: 'tenant-1',
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(),
        format: 'json',
        includeDetails: true,
      });

      expect(result.status).toBe('completed');
      expect(result.totalEvents).toBe(1);
      expect(result.downloadUrl).toBeDefined();
    });
  });
});

// =============================================================================
// ComplianceManager Tests
// =============================================================================

describe('ComplianceManager', () => {
  let manager: ComplianceManager;

  beforeEach(() => {
    manager = createComplianceManager('tenant-1');
  });

  describe('getControls()', () => {
    it('should return all controls', () => {
      const controls = manager.getControls();

      expect(controls.length).toBe(SOC2_CONTROLS.length + GDPR_CONTROLS.length);
    });

    it('should filter by framework', () => {
      const soc2Controls = manager.getControls('SOC2');
      const gdprControls = manager.getControls('GDPR');

      expect(soc2Controls.length).toBe(SOC2_CONTROLS.length);
      expect(gdprControls.length).toBe(GDPR_CONTROLS.length);
    });
  });

  describe('updateControl()', () => {
    it('should update control status', () => {
      const updated = manager.updateControl('CC1.1', {
        status: 'implemented',
        implementation: 'Security policy documented and reviewed annually.',
        owner: 'security-team',
      });

      expect(updated.status).toBe('implemented');
      expect(updated.implementation).toBe('Security policy documented and reviewed annually.');
      expect(updated.owner).toBe('security-team');
      expect(updated.lastReviewed).toBeDefined();
    });

    it('should throw for non-existent control', () => {
      expect(() => manager.updateControl('INVALID', { status: 'implemented' })).toThrow();
    });
  });

  describe('generateReport()', () => {
    it('should generate SOC2 report', () => {
      manager.updateControl('CC1.1', { status: 'implemented' });
      manager.updateControl('CC2.1', { status: 'implemented' });
      manager.updateControl('CC3.1', { status: 'partial' });

      const report = manager.generateReport('SOC2');

      expect(report.framework).toBe('SOC2');
      expect(report.summary.total).toBe(SOC2_CONTROLS.length);
      expect(report.summary.implemented).toBe(2);
      expect(report.summary.partial).toBe(1);
      expect(report.summary.complianceScore).toBeGreaterThan(0);
    });

    it('should calculate compliance score correctly', () => {
      // Mark all as implemented
      for (const control of SOC2_CONTROLS) {
        manager.updateControl(control.id, { status: 'implemented' });
      }

      const report = manager.generateReport('SOC2');
      expect(report.summary.complianceScore).toBe(100);
    });

    it('should handle N/A controls in score', () => {
      for (const control of SOC2_CONTROLS) {
        manager.updateControl(control.id, { status: 'not_applicable' });
      }

      const report = manager.generateReport('SOC2');
      expect(report.summary.complianceScore).toBe(0);
      expect(report.summary.notApplicable).toBe(SOC2_CONTROLS.length);
    });
  });

  describe('reportToMarkdown()', () => {
    it('should generate markdown report', () => {
      manager.updateControl('CC1.1', { status: 'implemented', owner: 'security-team' });

      const report = manager.generateReport('SOC2');
      const markdown = manager.reportToMarkdown(report);

      expect(markdown).toContain('# SOC2 Compliance Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Controls');
      expect(markdown).toContain('CC1.1');
      expect(markdown).toContain('security-team');
    });
  });
});

// =============================================================================
// ComplianceAuditLogger Tests
// =============================================================================

describe('ComplianceAuditLogger', () => {
  let logger: ComplianceAuditLogger;

  beforeEach(() => {
    logger = createComplianceAuditLogger('tenant-1');
  });

  describe('log()', () => {
    it('should log audit event', async () => {
      const event = await logger.log(
        'auth.login',
        { type: 'user', id: 'user-1', name: 'Test User' },
        undefined,
        undefined,
        { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' }
      );

      expect(event.type).toBe('auth.login');
      expect(event.ipAddress).toBe('192.168.1.1');
      expect(event.userAgent).toBe('Mozilla/5.0');
    });

    it('should log event with target', async () => {
      const event = await logger.log(
        'run.create',
        { type: 'user', id: 'user-1' },
        { type: 'run', id: 'run-1' },
        { issueNumber: 42 }
      );

      expect(event.target?.id).toBe('run-1');
      expect(event.details?.issueNumber).toBe(42);
    });
  });

  describe('query()', () => {
    it('should query events', async () => {
      await logger.log('auth.login', { type: 'user', id: 'user-1' });
      await logger.log('auth.logout', { type: 'user', id: 'user-1' });

      const { events, total } = await logger.query({});

      expect(total).toBe(2);
      expect(events).toHaveLength(2);
    });
  });

  describe('export()', () => {
    it('should export audit log', async () => {
      await logger.log('auth.login', { type: 'user', id: 'user-1' });

      const result = await logger.export(
        new Date(Date.now() - 86400000),
        new Date(),
        'json'
      );

      expect(result.status).toBe('completed');
      expect(result.totalEvents).toBe(1);
    });
  });
});

// =============================================================================
// Export Utilities Tests
// =============================================================================

describe('Export Utilities', () => {
  const sampleEvents: ComplianceAuditEvent[] = [
    {
      id: 'audit_1',
      type: 'auth.login',
      tenantId: 'tenant-1',
      actor: { type: 'user', id: 'user-1' },
      timestamp: new Date('2025-01-01T00:00:00Z'),
      ipAddress: '192.168.1.1',
    },
    {
      id: 'audit_2',
      type: 'run.create',
      tenantId: 'tenant-1',
      actor: { type: 'api_key', id: 'key-1' },
      target: { type: 'run', id: 'run-1' },
      timestamp: new Date('2025-01-01T01:00:00Z'),
    },
  ];

  describe('auditEventsToCsv()', () => {
    it('should convert events to CSV', () => {
      const csv = auditEventsToCsv(sampleEvents);

      expect(csv).toContain('id,type,timestamp');
      expect(csv).toContain('audit_1');
      expect(csv).toContain('auth.login');
      expect(csv).toContain('192.168.1.1');
    });

    it('should handle empty target', () => {
      const csv = auditEventsToCsv([sampleEvents[0]]);

      expect(csv).not.toContain('run');
    });
  });

  describe('auditEventsToNdjson()', () => {
    it('should convert events to NDJSON', () => {
      const ndjson = auditEventsToNdjson(sampleEvents);
      const lines = ndjson.split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).id).toBe('audit_1');
      expect(JSON.parse(lines[1]).id).toBe('audit_2');
    });
  });
});

// =============================================================================
// Default Controls Tests
// =============================================================================

describe('Default Controls', () => {
  it('should have SOC2 controls', () => {
    expect(SOC2_CONTROLS.length).toBeGreaterThan(0);
    expect(SOC2_CONTROLS.every(c => c.framework === 'SOC2')).toBe(true);
    expect(SOC2_CONTROLS.every(c => c.id && c.name && c.description)).toBe(true);
  });

  it('should have GDPR controls', () => {
    expect(GDPR_CONTROLS.length).toBeGreaterThan(0);
    expect(GDPR_CONTROLS.every(c => c.framework === 'GDPR')).toBe(true);
    expect(GDPR_CONTROLS.every(c => c.id && c.name && c.description)).toBe(true);
  });
});
