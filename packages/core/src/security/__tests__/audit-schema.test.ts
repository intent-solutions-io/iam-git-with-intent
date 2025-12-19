/**
 * Audit Event Schema Tests
 *
 * Epic D Foundation: Policy Engine - D4.s1 Audit Event Schema
 *
 * Tests the Zod-based audit event schema for:
 * - Principal (who): userId, tenantId, serviceAccount
 * - Action (what): operation type, target resource
 * - Timestamp (when): ISO 8601
 * - Result: success/failure, error details
 * - Context: correlationId, requestId, sourceIP
 * - Evidence: link to run artifacts
 */

import { describe, it, expect } from 'vitest';
import {
  // Schemas - using direct imports from schema.js to avoid rename conflicts
  SecurityAuditEventSchema,
  CreateSecurityAuditEvent,
  AuditActor,
  AuditResource,
  AuditEventType,
  AuditOutcome,
  AuditEventCategory,
  AuditEvidence,
  AuditCorrelation,
  AuditError,
  AuditRequestSource,
  AuditEventQuery,

  // Functions
  generateAuditEventId,
  createAuditEvent,
  validateAuditEvent,
  safeParseAuditEvent,
  extractCategory,
  isHighRiskEventType,
  markHighRiskIfApplicable,
  fromLegacyEvent,
  toLegacyEvent,

  // Constants
  HIGH_RISK_EVENT_TYPES,
} from '../audit/schema.js';

// Re-export types for test convenience
type CreateAuditEventInput = CreateSecurityAuditEvent;

describe('Audit Event Schema - D4.s1', () => {
  // ==========================================================================
  // Event ID Generation
  // ==========================================================================

  describe('generateAuditEventId', () => {
    it('generates valid event IDs', () => {
      const id = generateAuditEventId();
      expect(id).toMatch(/^saud-\d+-[a-z0-9]+$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateAuditEventId());
      }
      expect(ids.size).toBe(100);
    });
  });

  // ==========================================================================
  // Principal Schema (WHO)
  // ==========================================================================

  describe('AuditActor (Principal - WHO)', () => {
    it('validates user actor', () => {
      const actor = AuditActor.parse({
        type: 'user',
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
      });

      expect(actor.type).toBe('user');
      expect(actor.id).toBe('user-123');
      expect(actor.email).toBe('user@example.com');
    });

    it('validates service actor', () => {
      const actor = AuditActor.parse({
        type: 'service',
        id: 'cloud-run-gateway',
        serviceAccountId: 'gateway@project.iam.gserviceaccount.com',
      });

      expect(actor.type).toBe('service');
      expect(actor.serviceAccountId).toBeDefined();
    });

    it('validates webhook actor', () => {
      const actor = AuditActor.parse({
        type: 'webhook',
        id: 'github-webhook',
      });

      expect(actor.type).toBe('webhook');
    });

    it('validates impersonation', () => {
      const actor = AuditActor.parse({
        type: 'user',
        id: 'user-123',
        impersonatedBy: {
          type: 'service',
          id: 'admin-service',
          reason: 'Support ticket #12345',
        },
      });

      expect(actor.impersonatedBy).toBeDefined();
      expect(actor.impersonatedBy?.type).toBe('service');
      expect(actor.impersonatedBy?.reason).toContain('Support ticket');
    });

    it('rejects invalid email', () => {
      const result = AuditActor.safeParse({
        type: 'user',
        id: 'user-123',
        email: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty actor ID', () => {
      const result = AuditActor.safeParse({
        type: 'user',
        id: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('AuditRequestSource', () => {
    it('validates complete request source', () => {
      const source = AuditRequestSource.parse({
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (compatible; GWI/1.0)',
        geo: {
          country: 'US',
          region: 'Texas',
          city: 'Austin',
        },
        origin: 'https://app.example.com',
      });

      expect(source.ip).toBe('192.168.1.1');
      expect(source.geo?.country).toBe('US');
    });

    it('validates IPv6 address', () => {
      const source = AuditRequestSource.parse({
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      });

      expect(source.ip).toBeDefined();
    });

    it('allows undefined IP', () => {
      const source = AuditRequestSource.parse({
        userAgent: 'Test Agent',
      });

      expect(source.ip).toBeUndefined();
    });
  });

  // ==========================================================================
  // Action Schema (WHAT)
  // ==========================================================================

  describe('AuditEventType (Action - WHAT)', () => {
    it('validates all event type categories', () => {
      const categories = [
        'auth.login.success',
        'rbac.check.allowed',
        'webhook.received',
        'queue.job.enqueued',
        'candidate.generated',
        'git.push.executed',
        'connector.installed',
        'registry.package.published',
        'plan.limit.checked',
        'data.accessed',
        'secret.accessed',
        'policy.evaluated',
        'tenant.created',
        'billing.invoice.created',
        'api.key.created',
      ];

      for (const eventType of categories) {
        expect(() => AuditEventType.parse(eventType)).not.toThrow();
      }
    });

    it('rejects invalid event types', () => {
      const result = AuditEventType.safeParse('invalid.event.type');
      expect(result.success).toBe(false);
    });
  });

  describe('AuditEventCategory', () => {
    it('extracts category from event type', () => {
      expect(extractCategory('auth.login.success')).toBe('auth');
      expect(extractCategory('git.push.executed')).toBe('git');
      expect(extractCategory('candidate.approved')).toBe('candidate');
    });
  });

  describe('AuditResource', () => {
    it('validates resource with parent', () => {
      const resource = AuditResource.parse({
        type: 'candidate',
        id: 'cand-123',
        name: 'Feature PR Candidate',
        parent: {
          type: 'run',
          id: 'run-456',
        },
        attributes: {
          prNumber: 42,
          branch: 'feature/test',
        },
      });

      expect(resource.parent?.type).toBe('run');
      expect(resource.attributes?.prNumber).toBe(42);
    });
  });

  // ==========================================================================
  // Result Schema
  // ==========================================================================

  describe('AuditOutcome', () => {
    it('validates all outcome types', () => {
      const outcomes = ['success', 'failure', 'denied', 'blocked', 'partial', 'pending'];
      for (const outcome of outcomes) {
        expect(() => AuditOutcome.parse(outcome)).not.toThrow();
      }
    });
  });

  describe('AuditError', () => {
    it('validates error with all fields', () => {
      const error = AuditError.parse({
        code: 'AUTH_FAILED',
        message: 'Invalid credentials provided',
        category: 'authentication',
        retryable: true,
      });

      expect(error.code).toBe('AUTH_FAILED');
      expect(error.category).toBe('authentication');
      expect(error.retryable).toBe(true);
    });

    it('validates minimal error', () => {
      const error = AuditError.parse({
        message: 'Something went wrong',
      });

      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBeUndefined();
    });
  });

  // ==========================================================================
  // Context Schema (CORRELATION)
  // ==========================================================================

  describe('AuditCorrelation', () => {
    it('validates complete correlation context', () => {
      const correlation = AuditCorrelation.parse({
        traceId: 'trace-abc123',
        spanId: 'span-xyz789',
        requestId: 'req-123',
        runId: 'run-456',
        workItemId: 'wi-789',
        candidateId: 'cand-012',
        sessionId: 'sess-345',
        causationId: 'cause-678',
      });

      expect(correlation.traceId).toBe('trace-abc123');
      expect(correlation.runId).toBe('run-456');
    });
  });

  // ==========================================================================
  // Evidence Schema
  // ==========================================================================

  describe('AuditEvidence', () => {
    it('validates artifact evidence with hash', () => {
      const evidence = AuditEvidence.parse({
        type: 'artifact',
        ref: 'gs://gwi-artifacts/runs/run-123/output.json',
        hash: 'abc123def456',
        hashAlgorithm: 'sha256',
        capturedAt: new Date(),
        metadata: {
          size: 1024,
          contentType: 'application/json',
        },
      });

      expect(evidence.type).toBe('artifact');
      expect(evidence.hashAlgorithm).toBe('sha256');
    });

    it('validates approval evidence', () => {
      const evidence = AuditEvidence.parse({
        type: 'approval',
        ref: 'approvals/appr-123',
      });

      expect(evidence.type).toBe('approval');
    });
  });

  // ==========================================================================
  // Complete Event Schema
  // ==========================================================================

  describe('SecurityAuditEventSchema (Complete Schema)', () => {
    it('validates complete audit event', () => {
      const event = SecurityAuditEventSchema.parse({
        id: generateAuditEventId(),
        schemaVersion: '1.0.0',
        tenantId: 'tenant-123',
        eventType: 'candidate.approved',
        category: 'candidate',
        actor: {
          type: 'user',
          id: 'user-456',
          email: 'approver@example.com',
        },
        resource: {
          type: 'candidate',
          id: 'cand-789',
        },
        timestamp: new Date(),
        outcome: 'success',
        correlation: {
          runId: 'run-123',
          requestId: 'req-456',
        },
        evidence: [
          {
            type: 'approval',
            ref: 'approvals/appr-123',
          },
        ],
        highRisk: false,
        tags: ['pr-workflow', 'approval'],
      });

      expect(event.tenantId).toBe('tenant-123');
      expect(event.eventType).toBe('candidate.approved');
      expect(event.evidence?.length).toBe(1);
    });

    it('validates event with error details', () => {
      const event = SecurityAuditEventSchema.parse({
        id: generateAuditEventId(),
        schemaVersion: '1.0.0',
        tenantId: 'tenant-123',
        eventType: 'auth.login.failure',
        actor: {
          type: 'user',
          id: 'unknown',
        },
        source: {
          ip: '192.168.1.100',
          userAgent: 'curl/7.68.0',
        },
        timestamp: new Date(),
        outcome: 'failure',
        error: {
          code: 'INVALID_TOKEN',
          message: 'The provided token is invalid or expired',
          category: 'authentication',
          retryable: false,
        },
      });

      expect(event.outcome).toBe('failure');
      expect(event.error?.code).toBe('INVALID_TOKEN');
    });
  });

  // ==========================================================================
  // Factory Functions
  // ==========================================================================

  describe('createAuditEvent', () => {
    it('creates event with auto-generated fields', () => {
      const event = createAuditEvent({
        tenantId: 'tenant-123',
        eventType: 'auth.login.success',
        actor: {
          type: 'user',
          id: 'user-456',
        },
        outcome: 'success',
      });

      expect(event.id).toMatch(/^saud-\d+-[a-z0-9]+$/);
      expect(event.schemaVersion).toBe('1.0.0');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.category).toBe('auth');
    });

    it('uses provided timestamp', () => {
      const customTime = new Date('2024-01-15T10:30:00Z');
      const event = createAuditEvent({
        tenantId: 'tenant-123',
        eventType: 'auth.login.success',
        actor: {
          type: 'user',
          id: 'user-456',
        },
        outcome: 'success',
        timestamp: customTime,
      });

      expect(event.timestamp.getTime()).toBe(customTime.getTime());
    });
  });

  describe('safeParseAuditEvent', () => {
    it('returns success for valid event', () => {
      const result = safeParseAuditEvent({
        id: generateAuditEventId(),
        schemaVersion: '1.0.0',
        tenantId: 'tenant-123',
        eventType: 'auth.login.success',
        actor: { type: 'user', id: 'user-123' },
        timestamp: new Date(),
        outcome: 'success',
      });

      expect(result.success).toBe(true);
    });

    it('returns error for invalid event', () => {
      const result = safeParseAuditEvent({
        id: 'invalid-id',
        tenantId: '',
      });

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // High-Risk Detection
  // ==========================================================================

  describe('High-Risk Event Detection', () => {
    it('identifies high-risk event types', () => {
      expect(isHighRiskEventType('git.force_push.attempted')).toBe(true);
      expect(isHighRiskEventType('secret.accessed')).toBe(true);
      expect(isHighRiskEventType('tenant.deleted')).toBe(true);
      expect(isHighRiskEventType('data.deleted')).toBe(true);
    });

    it('identifies non-high-risk event types', () => {
      expect(isHighRiskEventType('auth.login.success')).toBe(false);
      expect(isHighRiskEventType('queue.job.completed')).toBe(false);
    });

    it('marks high-risk events automatically', () => {
      const input: CreateSecurityAuditEvent = {
        tenantId: 'tenant-123',
        eventType: 'secret.accessed',
        actor: { type: 'user', id: 'user-123' },
        outcome: 'success',
      };

      const marked = markHighRiskIfApplicable(input);
      expect(marked.highRisk).toBe(true);
    });

    it('does not mark non-high-risk events', () => {
      const input: CreateSecurityAuditEvent = {
        tenantId: 'tenant-123',
        eventType: 'auth.login.success',
        actor: { type: 'user', id: 'user-123' },
        outcome: 'success',
      };

      const marked = markHighRiskIfApplicable(input);
      expect(marked.highRisk).toBeUndefined();
    });
  });

  // ==========================================================================
  // Query Schema
  // ==========================================================================

  describe('AuditEventQuery', () => {
    it('validates query with all filters', () => {
      const query = AuditEventQuery.parse({
        tenantId: 'tenant-123',
        eventTypes: ['auth.login.success', 'auth.login.failure'],
        categories: ['auth'],
        outcomes: ['success', 'failure'],
        actorId: 'user-456',
        actorType: 'user',
        resourceType: 'candidate',
        traceId: 'trace-789',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-12-31'),
        highRiskOnly: true,
        tags: ['security'],
        limit: 50,
        offset: 0,
        orderBy: 'desc',
      });

      expect(query.tenantId).toBe('tenant-123');
      expect(query.eventTypes).toHaveLength(2);
      expect(query.limit).toBe(50);
    });

    it('applies defaults', () => {
      const query = AuditEventQuery.parse({
        tenantId: 'tenant-123',
      });

      expect(query.limit).toBe(100);
      expect(query.offset).toBe(0);
      expect(query.orderBy).toBe('desc');
    });
  });

  // ==========================================================================
  // Backward Compatibility
  // ==========================================================================

  describe('Legacy Event Conversion', () => {
    it('converts legacy event to new schema', () => {
      const legacy = {
        id: 'saud-123-abc',
        eventType: 'auth.login.success' as const,
        outcome: 'success' as const,
        tenantId: 'tenant-123',
        actor: {
          type: 'user' as const,
          id: 'user-456',
        },
        timestamp: new Date(),
        traceId: 'trace-789',
        requestId: 'req-012',
        data: {
          loginMethod: 'oauth',
        },
      };

      const newEvent = fromLegacyEvent(legacy);

      expect(newEvent.correlation?.traceId).toBe('trace-789');
      expect(newEvent.actionData?.loginMethod).toBe('oauth');
      expect(newEvent.schemaVersion).toBe('1.0.0');
    });

    it('converts new event to legacy format', () => {
      const event = createAuditEvent({
        tenantId: 'tenant-123',
        eventType: 'auth.login.success',
        actor: {
          type: 'user',
          id: 'user-456',
        },
        outcome: 'success',
        correlation: {
          traceId: 'trace-789',
          runId: 'run-012',
        },
        actionData: {
          method: 'sso',
        },
      });

      const legacy = toLegacyEvent(event);

      expect(legacy.traceId).toBe('trace-789');
      expect(legacy.runId).toBe('run-012');
      expect(legacy.data?.method).toBe('sso');
    });
  });

  // ==========================================================================
  // Tenant Isolation
  // ==========================================================================

  describe('Tenant Isolation', () => {
    it('requires tenantId on all events', () => {
      const result = safeParseAuditEvent({
        id: generateAuditEventId(),
        schemaVersion: '1.0.0',
        eventType: 'auth.login.success',
        actor: { type: 'user', id: 'user-123' },
        timestamp: new Date(),
        outcome: 'success',
        // tenantId missing
      });

      expect(result.success).toBe(false);
    });

    it('requires tenantId on queries', () => {
      const result = AuditEventQuery.safeParse({
        eventTypes: ['auth.login.success'],
        // tenantId missing
      });

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Evidence Linking
  // ==========================================================================

  describe('Evidence Linking', () => {
    it('supports multiple evidence types', () => {
      const event = createAuditEvent({
        tenantId: 'tenant-123',
        eventType: 'candidate.executed',
        actor: { type: 'service', id: 'executor' },
        outcome: 'success',
        evidence: [
          {
            type: 'artifact',
            ref: 'gs://bucket/runs/run-123/output.json',
            hash: 'sha256-abc123',
            hashAlgorithm: 'sha256',
          },
          {
            type: 'approval',
            ref: 'approvals/appr-456',
          },
          {
            type: 'diff',
            ref: 'diffs/diff-789',
          },
        ],
      });

      expect(event.evidence).toHaveLength(3);
      expect(event.evidence?.[0].type).toBe('artifact');
      expect(event.evidence?.[0].hash).toBe('sha256-abc123');
    });

    it('limits evidence entries', () => {
      const manyEvidence = Array.from({ length: 25 }, (_, i) => ({
        type: 'log' as const,
        ref: `logs/entry-${i}`,
      }));

      const result = CreateSecurityAuditEvent.safeParse({
        tenantId: 'tenant-123',
        eventType: 'auth.login.success',
        actor: { type: 'user', id: 'user-123' },
        outcome: 'success',
        evidence: manyEvidence,
      });

      expect(result.success).toBe(false); // Max 20 evidence entries
    });
  });
});
