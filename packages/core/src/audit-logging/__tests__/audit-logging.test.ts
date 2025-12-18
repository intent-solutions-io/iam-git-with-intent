/**
 * Tests for Phase 63: Audit Logging
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuditLogger,
  createAuditLogger,
  InMemoryAuditStorage,
  createInMemoryAuditStorage,
  AuditEventTypes,
  AuditEventCategories,
  type AuditLogEvent,
  type AuditLogActor,
  type AuditLogResource,
  type RetentionPolicy,
} from '../index.js';

describe('Audit Logging', () => {
  describe('AuditLogger', () => {
    let logger: AuditLogger;
    let storage: InMemoryAuditStorage;

    beforeEach(() => {
      storage = createInMemoryAuditStorage();
      logger = createAuditLogger({
        serviceName: 'test-service',
        environment: 'development',
        storage,
        batchSize: 1, // Flush immediately for testing
        flushIntervalMs: 0,
      });
    });

    afterEach(async () => {
      await logger.stop();
    });

    it('should log audit event', async () => {
      const actor: AuditLogActor = {
        type: 'user',
        id: 'user-123',
        name: 'Test User',
        ip: '192.168.1.1',
      };

      const event = await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      expect(event.id).toBeDefined();
      expect(event.id).toMatch(/^aud_/);
      expect(event.type).toBe('data.read');
      expect(event.category).toBe('data');
      expect(event.tenantId).toBe('tenant-123');
      expect(event.actor.id).toBe('user-123');
    });

    it('should log event with resource', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };
      const resource: AuditLogResource = {
        type: 'dataset',
        id: 'ds-456',
        name: 'Sales Data',
        parent: { type: 'tenant', id: 'tenant-123' },
      };

      const event = await logger.log({
        type: AuditEventTypes.DATA_UPDATE,
        tenantId: 'tenant-123',
        actor,
        resource,
        details: { fields: ['revenue', 'quantity'] },
        outcome: { status: 'success', durationMs: 150 },
      });

      expect(event.resource).toBeDefined();
      expect(event.resource?.type).toBe('dataset');
      expect(event.resource?.id).toBe('ds-456');
      expect(event.details.fields).toContain('revenue');
    });

    it('should log login success', async () => {
      const actor: AuditLogActor = {
        type: 'user',
        id: 'user-123',
        ip: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      const event = await logger.logLogin('tenant-123', actor, true, {
        method: 'password',
      });

      expect(event.type).toBe(AuditEventTypes.LOGIN_SUCCESS);
      expect(event.outcome.status).toBe('success');
    });

    it('should log login failure', async () => {
      const actor: AuditLogActor = {
        type: 'user',
        id: 'unknown',
        ip: '10.0.0.1',
      };

      const event = await logger.logLogin('tenant-123', actor, false, {
        reason: 'Invalid password',
      });

      expect(event.type).toBe(AuditEventTypes.LOGIN_FAILURE);
      expect(event.outcome.status).toBe('failure');
      expect(event.outcome.errorCode).toBe('AUTH_FAILED');
    });

    it('should log data access', async () => {
      const actor: AuditLogActor = { type: 'service', id: 'api-service' };
      const resource: AuditLogResource = { type: 'forecast', id: 'fc-789' };

      const event = await logger.logDataAccess(
        'tenant-123',
        actor,
        'create',
        resource,
        true,
        { model: 'timegpt' }
      );

      expect(event.type).toBe(AuditEventTypes.DATA_CREATE);
      expect(event.actor.type).toBe('service');
      expect(event.resource?.id).toBe('fc-789');
    });

    it('should log security event', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'attacker', ip: '1.2.3.4' };

      const event = await logger.logSecurityEvent(
        'tenant-123',
        actor,
        'brute_force',
        { attempts: 10, timeWindow: '5m' }
      );

      expect(event.type).toBe(AuditEventTypes.BRUTE_FORCE_DETECTED);
      expect(event.category).toBe('security');
      expect(event.outcome.status).toBe('failure');
    });

    it('should include chain integrity hash', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      const event1 = await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      const event2 = await logger.log({
        type: AuditEventTypes.DATA_UPDATE,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      expect(event1.hash).toBeDefined();
      expect(event2.hash).toBeDefined();
      expect(event2.previousHash).toBe(event1.hash);
    });

    it('should query events', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.DATA_CREATE,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.LOGIN_SUCCESS,
        tenantId: 'tenant-456',
        actor,
        outcome: { status: 'success' },
      });

      await logger.flush();

      const result = await logger.query({
        tenantId: 'tenant-123',
      });

      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should query by event types', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.LOGIN_SUCCESS,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.flush();

      const result = await logger.query({
        types: [AuditEventTypes.DATA_READ],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('data.read');
    });

    it('should query by categories', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.LOGIN_SUCCESS,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.flush();

      const result = await logger.query({
        categories: ['auth'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].category).toBe('auth');
    });

    it('should get event by ID', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      const created = await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.flush();

      const retrieved = await logger.getEvent(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should generate compliance report', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.DATA_CREATE,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.DATA_DELETE,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'failure', errorCode: 'PERMISSION_DENIED' },
      });

      await logger.flush();

      const report = await logger.generateReport({
        type: 'activity_summary',
        tenantId: 'tenant-123',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() + 1000).toISOString(),
        format: 'json',
      });

      expect(report.id).toBeDefined();
      expect(report.summary.totalEvents).toBe(3);
      expect(report.summary.successCount).toBe(2);
      expect(report.summary.failureCount).toBe(1);
      expect(report.summary.eventsByCategory.data).toBe(3);
    });

    it('should generate grouped report', async () => {
      const actor: AuditLogActor = { type: 'user', id: 'user-123' };

      await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.log({
        type: AuditEventTypes.DATA_READ,
        tenantId: 'tenant-123',
        actor,
        outcome: { status: 'success' },
      });

      await logger.flush();

      const report = await logger.generateReport({
        type: 'activity_summary',
        tenantId: 'tenant-123',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() + 1000).toISOString(),
        format: 'json',
        groupBy: 'type',
      });

      expect(report.data).toBeDefined();
      const data = report.data as Record<string, AuditLogEvent[]>;
      expect(data['data.read']).toHaveLength(2);
    });
  });

  describe('InMemoryAuditStorage', () => {
    let storage: InMemoryAuditStorage;

    beforeEach(() => {
      storage = createInMemoryAuditStorage();
    });

    it('should write and query events', async () => {
      const now = new Date().toISOString();
      const events: AuditLogEvent[] = [
        {
          id: 'aud_1',
          type: 'data.read',
          category: 'data',
          timestamp: now,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: {
            requestId: 'req-1',
            environment: 'development',
          },
          outcome: { status: 'success' },
        },
        {
          id: 'aud_2',
          type: 'auth.login.success',
          category: 'auth',
          timestamp: now,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-2' },
          details: {},
          context: {
            requestId: 'req-2',
            environment: 'development',
          },
          outcome: { status: 'success' },
        },
      ];

      await storage.write(events);

      const result = await storage.query({ tenantId: 'tenant-123' });
      expect(result.events).toHaveLength(2);
    });

    it('should filter by outcome status', async () => {
      const now = new Date().toISOString();
      const events: AuditLogEvent[] = [
        {
          id: 'aud_1',
          type: 'data.read',
          category: 'data',
          timestamp: now,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-1', environment: 'development' },
          outcome: { status: 'success' },
        },
        {
          id: 'aud_2',
          type: 'data.read',
          category: 'data',
          timestamp: now,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-2', environment: 'development' },
          outcome: { status: 'failure' },
        },
      ];

      await storage.write(events);

      const result = await storage.query({ outcomeStatus: 'failure' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('aud_2');
    });

    it('should search in details', async () => {
      const now = new Date().toISOString();
      const events: AuditLogEvent[] = [
        {
          id: 'aud_1',
          type: 'data.read',
          category: 'data',
          timestamp: now,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: { query: 'SELECT * FROM users' },
          context: { requestId: 'req-1', environment: 'development' },
          outcome: { status: 'success' },
        },
        {
          id: 'aud_2',
          type: 'data.read',
          category: 'data',
          timestamp: now,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: { query: 'SELECT * FROM orders' },
          context: { requestId: 'req-2', environment: 'development' },
          outcome: { status: 'success' },
        },
      ];

      await storage.write(events);

      const result = await storage.query({ searchText: 'orders' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('aud_2');
    });

    it('should paginate results', async () => {
      const now = new Date().toISOString();
      const events: AuditLogEvent[] = Array.from({ length: 25 }, (_, i) => ({
        id: `aud_${i}`,
        type: 'data.read',
        category: 'data' as const,
        timestamp: now,
        tenantId: 'tenant-123',
        actor: { type: 'user' as const, id: 'user-1' },
        details: {},
        context: { requestId: `req-${i}`, environment: 'development' as const },
        outcome: { status: 'success' as const },
      }));

      await storage.write(events);

      const page1 = await storage.query({ limit: 10, offset: 0 });
      expect(page1.events).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.hasMore).toBe(true);

      const page2 = await storage.query({ limit: 10, offset: 10 });
      expect(page2.events).toHaveLength(10);
      expect(page2.hasMore).toBe(true);

      const page3 = await storage.query({ limit: 10, offset: 20 });
      expect(page3.events).toHaveLength(5);
      expect(page3.hasMore).toBe(false);
    });

    it('should verify chain integrity', async () => {
      const events: AuditLogEvent[] = [
        {
          id: 'aud_1',
          type: 'data.read',
          category: 'data',
          timestamp: new Date().toISOString(),
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-1', environment: 'development' },
          outcome: { status: 'success' },
          hash: 'hash1',
        },
        {
          id: 'aud_2',
          type: 'data.read',
          category: 'data',
          timestamp: new Date().toISOString(),
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-2', environment: 'development' },
          outcome: { status: 'success' },
          previousHash: 'hash1',
          hash: 'hash2',
        },
      ];

      await storage.write(events);

      const result = await storage.verifyChain('tenant-123', 'aud_1', 'aud_2');
      expect(result.valid).toBe(true);
      expect(result.eventsVerified).toBe(2);
    });

    it('should detect broken chain', async () => {
      const events: AuditLogEvent[] = [
        {
          id: 'aud_1',
          type: 'data.read',
          category: 'data',
          timestamp: new Date().toISOString(),
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-1', environment: 'development' },
          outcome: { status: 'success' },
          hash: 'hash1',
        },
        {
          id: 'aud_2',
          type: 'data.read',
          category: 'data',
          timestamp: new Date().toISOString(),
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-2', environment: 'development' },
          outcome: { status: 'success' },
          previousHash: 'wrong_hash',
          hash: 'hash2',
        },
      ];

      await storage.write(events);

      const result = await storage.verifyChain('tenant-123', 'aud_1', 'aud_2');
      expect(result.valid).toBe(false);
      expect(result.firstInvalidId).toBe('aud_2');
    });

    it('should apply retention policy', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
      const recentDate = new Date().toISOString();

      const events: AuditLogEvent[] = [
        {
          id: 'aud_old',
          type: 'data.read',
          category: 'data',
          timestamp: oldDate,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-1', environment: 'development' },
          outcome: { status: 'success' },
        },
        {
          id: 'aud_recent',
          type: 'data.read',
          category: 'data',
          timestamp: recentDate,
          tenantId: 'tenant-123',
          actor: { type: 'user', id: 'user-1' },
          details: {},
          context: { requestId: 'req-2', environment: 'development' },
          outcome: { status: 'success' },
        },
      ];

      await storage.write(events);

      const policy: RetentionPolicy = {
        id: 'policy-1',
        name: 'Data retention',
        categories: ['data'],
        retentionDays: 90,
        archiveBeforeDelete: false,
        enabled: true,
        createdAt: recentDate,
        updatedAt: recentDate,
      };

      const result = await storage.applyRetention(policy);
      expect(result.eventsDeleted).toBe(1);

      const remaining = await storage.query({});
      expect(remaining.events).toHaveLength(1);
      expect(remaining.events[0].id).toBe('aud_recent');
    });
  });

  describe('Event Categories', () => {
    it('should have all event categories', () => {
      expect(AuditEventCategories.AUTH).toBe('auth');
      expect(AuditEventCategories.DATA).toBe('data');
      expect(AuditEventCategories.CONFIG).toBe('config');
      expect(AuditEventCategories.ADMIN).toBe('admin');
      expect(AuditEventCategories.API).toBe('api');
      expect(AuditEventCategories.SECURITY).toBe('security');
      expect(AuditEventCategories.BILLING).toBe('billing');
      expect(AuditEventCategories.SYSTEM).toBe('system');
    });
  });

  describe('Event Types', () => {
    it('should have auth event types', () => {
      expect(AuditEventTypes.LOGIN_SUCCESS).toBe('auth.login.success');
      expect(AuditEventTypes.LOGIN_FAILURE).toBe('auth.login.failure');
      expect(AuditEventTypes.LOGOUT).toBe('auth.logout');
    });

    it('should have data event types', () => {
      expect(AuditEventTypes.DATA_READ).toBe('data.read');
      expect(AuditEventTypes.DATA_CREATE).toBe('data.create');
      expect(AuditEventTypes.DATA_UPDATE).toBe('data.update');
      expect(AuditEventTypes.DATA_DELETE).toBe('data.delete');
    });

    it('should have security event types', () => {
      expect(AuditEventTypes.SUSPICIOUS_ACTIVITY).toBe('security.suspicious');
      expect(AuditEventTypes.ACCESS_DENIED).toBe('security.access.denied');
      expect(AuditEventTypes.BRUTE_FORCE_DETECTED).toBe('security.bruteforce');
    });
  });
});
