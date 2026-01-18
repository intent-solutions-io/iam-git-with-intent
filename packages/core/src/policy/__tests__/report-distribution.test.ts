/**
 * Report Distribution Tests
 *
 * Tests for D4.6: Report distribution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Types and schemas
  DistributionChannel,
  ReportFormat,
  DistributionStatus,
  EmailRecipient,
  EmailDistributionConfig,
  WebhookDistributionConfig,
  DownloadLinkConfig,
  SlackDistributionConfig,
  S3UploadConfig,
  DistributionConfig,
  DistributionRequest,
  DistributionAttempt,
  DistributionRecord,
  DownloadAccessRecord,
  DistributionResult,
  // Utility functions
  generateDistributionId,
  generateDistributionRequestId,
  generateDownloadToken,
  generateWebhookSignature,
  hashDownloadPassword,
  verifyDownloadPassword,
  calculateLinkExpiration,
  isLinkExpired,
  isDownloadLimitReached,
  formatReportContent,
  buildEmailBody,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_SLACK_TEMPLATE,
  // Classes
  InMemoryDistributionStore,
  ReportDistributionService,
  // Factory functions
  createDistributionService,
  createDistributionServiceWithStore,
  createDistributionRequest,
  // Singleton
  getDistributionService,
  setDistributionService,
  resetDistributionService,
  initializeDistributionService,
  // Interfaces
  type DistributionStore,
  type DistributionChannelHandler,
} from '../report-distribution.js';
import type { ComplianceReportTemplate } from '../report-templates.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockReport = (overrides?: Partial<ComplianceReportTemplate>): ComplianceReportTemplate => ({
  reportId: 'rpt-test-001',
  version: '1.0.0',
  framework: {
    name: 'SOC 2 Type II',
    framework: 'soc2_type2',
    version: '2017',
    description: 'SOC 2 Type II compliance assessment',
  },
  tenantId: 'tenant-123',
  title: 'Test SOC 2 Report',
  description: 'Test compliance report',
  scope: 'All production systems',
  period: {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31'),
    type: 'period',
  },
  summary: {
    totalControls: 5,
    byStatus: {
      compliant: 3,
      partiallyCompliant: 1,
      nonCompliant: 0,
      notApplicable: 0,
      notEvaluated: 1,
      compensating: 0,
    },
    complianceRate: 80,
    totalEvidence: 10,
    verifiedEvidence: 8,
    openRemediations: 1,
    criticalFindings: 0,
  },
  organizationName: 'Test Corp',
  controls: [
    {
      controlId: 'CC6.1',
      title: 'Logical Access Security',
      description: 'Access controls are in place',
      category: 'Security',
      priority: 'high',
      status: 'compliant',
      evidence: [],
      remediation: [],
      attestations: [],
      notes: [],
      tags: [],
    },
  ],
  systemsInScope: ['API', 'Database'],
  exclusions: [],
  attestations: [],
  generatedAt: new Date('2024-02-01'),
  generatedBy: 'test-system',
  ...overrides,
});

const createMockEmailHandler = (): DistributionChannelHandler => ({
  channel: 'email',
  distribute: vi.fn().mockResolvedValue({
    success: true,
    deliveredTo: ['test@example.com'],
    response: { messageId: 'msg-123' },
  }),
});

const createMockWebhookHandler = (): DistributionChannelHandler => ({
  channel: 'webhook',
  distribute: vi.fn().mockResolvedValue({
    success: true,
    deliveredTo: ['https://webhook.example.com'],
    response: { statusCode: 200 },
  }),
});

// =============================================================================
// Schema Tests
// =============================================================================

describe('DistributionChannel', () => {
  it('should validate all channel types', () => {
    const channels = ['email', 'webhook', 'download_link', 'slack', 's3_upload'];
    for (const channel of channels) {
      expect(DistributionChannel.parse(channel)).toBe(channel);
    }
  });

  it('should reject invalid channel', () => {
    expect(() => DistributionChannel.parse('invalid')).toThrow();
  });
});

describe('ReportFormat', () => {
  it('should validate all format types', () => {
    const formats = ['json', 'markdown', 'pdf', 'html'];
    for (const format of formats) {
      expect(ReportFormat.parse(format)).toBe(format);
    }
  });
});

describe('DistributionStatus', () => {
  it('should validate all status types', () => {
    const statuses = ['pending', 'in_progress', 'delivered', 'failed', 'expired', 'revoked'];
    for (const status of statuses) {
      expect(DistributionStatus.parse(status)).toBe(status);
    }
  });
});

describe('EmailRecipient', () => {
  it('should validate email recipient', () => {
    const recipient = EmailRecipient.parse({
      email: 'test@example.com',
      name: 'Test User',
      type: 'to',
    });
    expect(recipient.email).toBe('test@example.com');
    expect(recipient.name).toBe('Test User');
    expect(recipient.type).toBe('to');
  });

  it('should apply default type', () => {
    const recipient = EmailRecipient.parse({ email: 'test@example.com' });
    expect(recipient.type).toBe('to');
  });

  it('should reject invalid email', () => {
    expect(() => EmailRecipient.parse({ email: 'invalid' })).toThrow();
  });
});

describe('EmailDistributionConfig', () => {
  it('should validate email config', () => {
    const config = EmailDistributionConfig.parse({
      channel: 'email',
      recipients: [{ email: 'test@example.com' }],
      subject: 'Compliance Report',
    });
    expect(config.channel).toBe('email');
    expect(config.recipients).toHaveLength(1);
    expect(config.attachReport).toBe(true);
    expect(config.attachmentFormat).toBe('pdf');
  });

  it('should require at least one recipient', () => {
    expect(() => EmailDistributionConfig.parse({
      channel: 'email',
      recipients: [],
      subject: 'Test',
    })).toThrow();
  });
});

describe('WebhookDistributionConfig', () => {
  it('should validate webhook config', () => {
    const config = WebhookDistributionConfig.parse({
      channel: 'webhook',
      url: 'https://webhook.example.com/endpoint',
    });
    expect(config.channel).toBe('webhook');
    expect(config.method).toBe('POST');
    expect(config.includeContent).toBe(true);
    expect(config.format).toBe('json');
  });

  it('should accept retry configuration', () => {
    const config = WebhookDistributionConfig.parse({
      channel: 'webhook',
      url: 'https://webhook.example.com',
      retry: { maxAttempts: 5, backoffMs: 2000 },
    });
    expect(config.retry?.maxAttempts).toBe(5);
    expect(config.retry?.backoffMs).toBe(2000);
  });
});

describe('DownloadLinkConfig', () => {
  it('should validate download link config', () => {
    const config = DownloadLinkConfig.parse({
      channel: 'download_link',
    });
    expect(config.channel).toBe('download_link');
    expect(config.expiresInSeconds).toBe(604800); // 7 days
    expect(config.maxDownloads).toBe(0);
    expect(config.requireAuth).toBe(false);
    expect(config.format).toBe('pdf');
  });

  it('should accept custom expiration', () => {
    const config = DownloadLinkConfig.parse({
      channel: 'download_link',
      expiresInSeconds: 3600,
      maxDownloads: 10,
      requireAuth: true,
      allowedUserIds: ['user-1', 'user-2'],
    });
    expect(config.expiresInSeconds).toBe(3600);
    expect(config.maxDownloads).toBe(10);
    expect(config.allowedUserIds).toHaveLength(2);
  });
});

describe('DistributionConfig discriminated union', () => {
  it('should discriminate email config', () => {
    const config = DistributionConfig.parse({
      channel: 'email',
      recipients: [{ email: 'test@example.com' }],
      subject: 'Test',
    });
    expect(config.channel).toBe('email');
  });

  it('should discriminate webhook config', () => {
    const config = DistributionConfig.parse({
      channel: 'webhook',
      url: 'https://example.com',
    });
    expect(config.channel).toBe('webhook');
  });

  it('should discriminate download_link config', () => {
    const config = DistributionConfig.parse({
      channel: 'download_link',
    });
    expect(config.channel).toBe('download_link');
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('generateDistributionId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateDistributionId();
    const id2 = generateDistributionId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^dist-[a-z0-9]+-[a-f0-9]+$/);
  });
});

describe('generateDistributionRequestId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateDistributionRequestId();
    const id2 = generateDistributionRequestId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^req-[a-z0-9]+-[a-f0-9]+$/);
  });
});

describe('generateDownloadToken', () => {
  it('should generate URL-safe tokens', () => {
    const token = generateDownloadToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(20);
  });

  it('should generate unique tokens', () => {
    const token1 = generateDownloadToken();
    const token2 = generateDownloadToken();
    expect(token1).not.toBe(token2);
  });
});

describe('generateWebhookSignature', () => {
  it('should generate consistent signatures', () => {
    const payload = '{"test": "data"}';
    const secret = 'my-secret';
    const sig1 = generateWebhookSignature(payload, secret);
    const sig2 = generateWebhookSignature(payload, secret);
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^sha256=[a-f0-9]+$/);
  });

  it('should produce different signatures for different payloads', () => {
    const secret = 'my-secret';
    const sig1 = generateWebhookSignature('payload1', secret);
    const sig2 = generateWebhookSignature('payload2', secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe('password hashing', () => {
  it('should hash and verify passwords', () => {
    const password = 'secure-password-123';
    const hash = hashDownloadPassword(password);
    expect(verifyDownloadPassword(password, hash)).toBe(true);
    expect(verifyDownloadPassword('wrong-password', hash)).toBe(false);
  });
});

describe('calculateLinkExpiration', () => {
  it('should calculate future expiration', () => {
    const before = Date.now();
    const expiration = calculateLinkExpiration(3600); // 1 hour
    const after = Date.now();

    expect(expiration.getTime()).toBeGreaterThanOrEqual(before + 3600000);
    expect(expiration.getTime()).toBeLessThanOrEqual(after + 3600000);
  });
});

describe('isLinkExpired', () => {
  it('should detect expired links', () => {
    const pastDate = new Date(Date.now() - 1000);
    expect(isLinkExpired(pastDate)).toBe(true);
  });

  it('should detect non-expired links', () => {
    const futureDate = new Date(Date.now() + 3600000);
    expect(isLinkExpired(futureDate)).toBe(false);
  });
});

describe('isDownloadLimitReached', () => {
  it('should detect when limit is reached', () => {
    expect(isDownloadLimitReached(10, 10)).toBe(true);
    expect(isDownloadLimitReached(11, 10)).toBe(true);
  });

  it('should detect when limit is not reached', () => {
    expect(isDownloadLimitReached(5, 10)).toBe(false);
  });

  it('should handle unlimited downloads', () => {
    expect(isDownloadLimitReached(1000, 0)).toBe(false);
  });
});

describe('formatReportContent', () => {
  it('should format as JSON', () => {
    const report = createMockReport();
    const content = formatReportContent(report, 'json');
    expect(content).toContain('"reportId"');
    expect(content).toContain('rpt-test-001');
  });

  it('should format as markdown', () => {
    const report = createMockReport();
    const content = formatReportContent(report, 'markdown');
    expect(content).toContain('#');
    expect(content).toContain('Test SOC 2 Report');
  });

  it('should format as HTML', () => {
    const report = createMockReport();
    const content = formatReportContent(report, 'html');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<html>');
  });
});

describe('buildEmailBody', () => {
  it('should replace template variables', () => {
    const report = createMockReport();
    const body = buildEmailBody(DEFAULT_EMAIL_TEMPLATE, report, 'Custom message here');

    expect(body).toContain('Test Corp');
    expect(body).toContain('Test SOC 2 Report');
    expect(body).toContain('SOC 2 Type II');
    expect(body).toContain('2024-01-01');
    expect(body).toContain('Custom message here');
  });
});

// =============================================================================
// InMemoryDistributionStore Tests
// =============================================================================

describe('InMemoryDistributionStore', () => {
  let store: InMemoryDistributionStore;

  beforeEach(() => {
    store = new InMemoryDistributionStore();
  });

  describe('save and get', () => {
    it('should save and retrieve distribution', async () => {
      const record: DistributionRecord = {
        distributionId: 'dist-001',
        requestId: 'req-001',
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'email',
        config: {
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf',
        },
        status: 'pending',
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: [],
      };

      await store.save(record);
      const retrieved = await store.get('tenant-123', 'dist-001');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.distributionId).toBe('dist-001');
    });

    it('should return null for non-existent distribution', async () => {
      const retrieved = await store.get('tenant-123', 'non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getByReport', () => {
    it('should get all distributions for a report', async () => {
      const baseRecord = {
        requestId: 'req-001',
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'email' as const,
        config: {
          channel: 'email' as const,
          recipients: [{ email: 'test@example.com', type: 'to' as const }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf' as const,
        },
        status: 'delivered' as const,
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: ['test@example.com'],
      };

      await store.save({ ...baseRecord, distributionId: 'dist-001' });
      await store.save({ ...baseRecord, distributionId: 'dist-002' });
      await store.save({ ...baseRecord, distributionId: 'dist-003', reportId: 'rpt-002' });

      const distributions = await store.getByReport('tenant-123', 'rpt-001');
      expect(distributions).toHaveLength(2);
    });
  });

  describe('getByRequest', () => {
    it('should get all distributions for a request', async () => {
      const baseRecord = {
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'email' as const,
        config: {
          channel: 'email' as const,
          recipients: [{ email: 'test@example.com', type: 'to' as const }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf' as const,
        },
        status: 'delivered' as const,
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: [],
      };

      await store.save({ ...baseRecord, distributionId: 'dist-001', requestId: 'req-001' });
      await store.save({ ...baseRecord, distributionId: 'dist-002', requestId: 'req-001' });
      await store.save({ ...baseRecord, distributionId: 'dist-003', requestId: 'req-002' });

      const distributions = await store.getByRequest('tenant-123', 'req-001');
      expect(distributions).toHaveLength(2);
    });
  });

  describe('updateStatus', () => {
    it('should update distribution status', async () => {
      const record: DistributionRecord = {
        distributionId: 'dist-001',
        requestId: 'req-001',
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'email',
        config: {
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf',
        },
        status: 'pending',
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: [],
      };

      await store.save(record);
      const updated = await store.updateStatus('tenant-123', 'dist-001', 'delivered', {
        deliveredTo: ['test@example.com'],
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('delivered');
      expect(updated!.deliveredTo).toContain('test@example.com');
      expect(updated!.completedAt).toBeDefined();
    });

    it('should return null for non-existent distribution', async () => {
      const updated = await store.updateStatus('tenant-123', 'non-existent', 'delivered');
      expect(updated).toBeNull();
    });
  });

  describe('addAttempt', () => {
    it('should add attempt to distribution', async () => {
      const record: DistributionRecord = {
        distributionId: 'dist-001',
        requestId: 'req-001',
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'webhook',
        config: {
          channel: 'webhook',
          url: 'https://example.com',
          method: 'POST',
          includeContent: true,
          format: 'json',
        },
        status: 'in_progress',
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: [],
      };

      await store.save(record);

      const attempt: DistributionAttempt = {
        attemptNumber: 1,
        attemptedAt: new Date(),
        success: false,
        error: 'Connection timeout',
        durationMs: 5000,
      };

      const updated = await store.addAttempt('tenant-123', 'dist-001', attempt);

      expect(updated).not.toBeNull();
      expect(updated!.attempts).toHaveLength(1);
      expect(updated!.attempts[0].error).toBe('Connection timeout');
    });
  });

  describe('download link operations', () => {
    let downloadRecord: DistributionRecord;

    beforeEach(async () => {
      downloadRecord = {
        distributionId: 'dist-dl-001',
        requestId: 'req-001',
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'download_link',
        config: {
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 10,
          requireAuth: false,
          format: 'pdf',
          notifyOnDownload: false,
        },
        status: 'delivered',
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: ['https://example.com/download/token123'],
        downloadLink: {
          token: 'token123',
          url: 'https://example.com/download/token123',
          expiresAt: new Date(Date.now() + 3600000),
          downloadCount: 0,
          maxDownloads: 10,
        },
      };

      await store.save(downloadRecord);
    });

    it('should get distribution by download token', async () => {
      const found = await store.getByDownloadToken('token123');
      expect(found).not.toBeNull();
      expect(found!.distributionId).toBe('dist-dl-001');
    });

    it('should return null for non-existent token', async () => {
      const found = await store.getByDownloadToken('invalid-token');
      expect(found).toBeNull();
    });

    it('should increment download count', async () => {
      const count1 = await store.incrementDownloadCount('tenant-123', 'dist-dl-001');
      expect(count1).toBe(1);

      const count2 = await store.incrementDownloadCount('tenant-123', 'dist-dl-001');
      expect(count2).toBe(2);
    });

    it('should record download access', async () => {
      const access: DownloadAccessRecord = {
        accessId: 'acc-001',
        distributionId: 'dist-dl-001',
        token: 'token123',
        accessedAt: new Date(),
        userId: 'user-001',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: true,
      };

      await store.recordDownloadAccess(access);
      const history = await store.getDownloadAccessHistory('dist-dl-001');

      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe('user-001');
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      await store.save({
        distributionId: 'dist-001',
        requestId: 'req-001',
        tenantId: 'tenant-123',
        reportId: 'rpt-001',
        reportVersion: '1.0.0',
        channel: 'email',
        config: {
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf',
        },
        status: 'pending',
        attempts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredTo: [],
      });

      store.clear();

      const retrieved = await store.get('tenant-123', 'dist-001');
      expect(retrieved).toBeNull();
    });
  });
});

// =============================================================================
// ReportDistributionService Tests
// =============================================================================

describe('ReportDistributionService', () => {
  let service: ReportDistributionService;
  let store: InMemoryDistributionStore;

  beforeEach(() => {
    store = new InMemoryDistributionStore();
    service = createDistributionServiceWithStore(
      { downloadBaseUrl: 'https://example.com' },
      store
    );
  });

  describe('distribute', () => {
    it('should distribute to email channel without handler (simulated)', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Compliance Report',
          attachReport: true,
          attachmentFormat: 'pdf',
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(1);
      expect(result.summary.delivered).toBe(1);
      expect(result.distributions[0].status).toBe('delivered');
    });

    it('should distribute to webhook channel with handler', async () => {
      const handler = createMockWebhookHandler();
      service.registerHandler(handler);

      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'webhook',
          url: 'https://webhook.example.com',
          method: 'POST',
          includeContent: true,
          format: 'json',
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);

      expect(result.success).toBe(true);
      expect(handler.distribute).toHaveBeenCalled();
    });

    it('should create download link', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 10,
          requireAuth: false,
          format: 'pdf',
          notifyOnDownload: false,
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);

      expect(result.success).toBe(true);
      expect(result.distributions[0].downloadLink).toBeDefined();
      expect(result.distributions[0].downloadLink!.url).toContain('https://example.com/download/');
      expect(result.distributions[0].downloadLink!.maxDownloads).toBe(10);
    });

    it('should handle multiple distributions', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [
          {
            channel: 'email',
            recipients: [{ email: 'test@example.com', type: 'to' }],
            subject: 'Report',
            attachReport: true,
            attachmentFormat: 'pdf',
          },
          {
            channel: 'download_link',
            expiresInSeconds: 3600,
            maxDownloads: 5,
            requireAuth: false,
            format: 'pdf',
            notifyOnDownload: false,
          },
        ],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);

      expect(result.summary.total).toBe(2);
      expect(result.summary.delivered).toBe(2);
    });

    it('should skip scheduled distributions', async () => {
      const report = createMockReport();
      const futureDate = new Date(Date.now() + 3600000);
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Report',
          attachReport: true,
          attachmentFormat: 'pdf',
        }],
        { requestedBy: 'user-001', scheduledAt: futureDate }
      );

      const result = await service.distribute(request, report);

      expect(result.summary.pending).toBe(1);
      expect(result.distributions[0].status).toBe('pending');
    });

    it('should handle handler errors gracefully', async () => {
      const handler: DistributionChannelHandler = {
        channel: 'webhook',
        distribute: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      service.registerHandler(handler);

      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'webhook',
          url: 'https://webhook.example.com',
          method: 'POST',
          includeContent: true,
          format: 'json',
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);

      expect(result.success).toBe(false);
      expect(result.summary.failed).toBe(1);
      // Handler errors are tracked as attempts, not as top-level errors
      expect(result.distributions[0].status).toBe('failed');
      expect(result.distributions[0].attempts).toHaveLength(1);
      expect(result.distributions[0].attempts[0].success).toBe(false);
      expect(result.distributions[0].attempts[0].error).toContain('Connection failed');
    });
  });

  describe('processDownload', () => {
    let downloadDistribution: DistributionRecord;

    beforeEach(async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 2,
          requireAuth: false,
          format: 'pdf',
          notifyOnDownload: false,
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);
      downloadDistribution = result.distributions[0];
    });

    it('should process valid download', async () => {
      const token = downloadDistribution.downloadLink!.token;
      const result = await service.processDownload(token);

      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();
      expect(result.record!.downloadLink!.downloadCount).toBe(1);
    });

    it('should reject invalid token', async () => {
      const result = await service.processDownload('invalid-token');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('not_found');
    });

    it('should enforce download limit', async () => {
      const token = downloadDistribution.downloadLink!.token;

      // Use up the limit (max 2)
      await service.processDownload(token);
      await service.processDownload(token);

      const result = await service.processDownload(token);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('limit_reached');
    });

    it('should record access attempts', async () => {
      const token = downloadDistribution.downloadLink!.token;

      await service.processDownload(token, {
        userId: 'user-001',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser',
      });

      const history = await service.getDownloadAccessHistory(downloadDistribution.distributionId);
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe('user-001');
    });
  });

  describe('processDownload with authentication', () => {
    it('should require authentication when configured', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 10,
          requireAuth: true,
          allowedUserIds: ['user-001', 'user-002'],
          format: 'pdf',
          notifyOnDownload: false,
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);
      const token = result.distributions[0].downloadLink!.token;

      // Without user ID
      const noAuthResult = await service.processDownload(token);
      expect(noAuthResult.success).toBe(false);
      expect(noAuthResult.errorCode).toBe('auth_required');

      // With unauthorized user
      const wrongUserResult = await service.processDownload(token, { userId: 'user-999' });
      expect(wrongUserResult.success).toBe(false);
      expect(wrongUserResult.errorCode).toBe('auth_required');

      // With authorized user
      const authResult = await service.processDownload(token, { userId: 'user-001' });
      expect(authResult.success).toBe(true);
    });
  });

  describe('processDownload with password', () => {
    it('should require password when configured', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 10,
          requireAuth: false,
          password: 'secret123',
          format: 'pdf',
          notifyOnDownload: false,
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);
      const token = result.distributions[0].downloadLink!.token;

      // Without password
      const noPassResult = await service.processDownload(token);
      expect(noPassResult.success).toBe(false);
      expect(noPassResult.errorCode).toBe('invalid_password');

      // With wrong password
      const wrongPassResult = await service.processDownload(token, { password: 'wrong' });
      expect(wrongPassResult.success).toBe(false);
      expect(wrongPassResult.errorCode).toBe('invalid_password');

      // With correct password
      const correctResult = await service.processDownload(token, { password: 'secret123' });
      expect(correctResult.success).toBe(true);
    });
  });

  describe('revokeDownloadLink', () => {
    it('should revoke download link', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 10,
          requireAuth: false,
          format: 'pdf',
          notifyOnDownload: false,
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);
      const distribution = result.distributions[0];
      const token = distribution.downloadLink!.token;

      const revoked = await service.revokeDownloadLink('tenant-123', distribution.distributionId);
      expect(revoked).toBe(true);

      const downloadResult = await service.processDownload(token);
      expect(downloadResult.success).toBe(false);
      expect(downloadResult.errorCode).toBe('revoked');
    });

    it('should return false for non-download distributions', async () => {
      const report = createMockReport();
      const request = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf',
        }],
        { requestedBy: 'user-001' }
      );

      const result = await service.distribute(request, report);
      const distribution = result.distributions[0];

      const revoked = await service.revokeDownloadLink('tenant-123', distribution.distributionId);
      expect(revoked).toBe(false);
    });
  });

  describe('getDistributionHistory', () => {
    it('should get distribution history', async () => {
      const report = createMockReport();
      const request1 = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Test 1',
          attachReport: true,
          attachmentFormat: 'pdf',
        }],
        { requestedBy: 'user-001' }
      );
      const request2 = createDistributionRequest(
        'tenant-123',
        report.reportId,
        [{
          channel: 'download_link',
          expiresInSeconds: 3600,
          maxDownloads: 10,
          requireAuth: false,
          format: 'pdf',
          notifyOnDownload: false,
        }],
        { requestedBy: 'user-001' }
      );

      await service.distribute(request1, report);
      await service.distribute(request2, report);

      const history = await service.getDistributionHistory('tenant-123', report.reportId);
      expect(history).toHaveLength(2);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('createDistributionService', () => {
    it('should create service with in-memory store', () => {
      const service = createDistributionService({
        downloadBaseUrl: 'https://example.com',
      });
      expect(service).toBeInstanceOf(ReportDistributionService);
    });
  });

  describe('createDistributionRequest', () => {
    it('should create valid request', () => {
      const request = createDistributionRequest(
        'tenant-123',
        'rpt-001',
        [{
          channel: 'email',
          recipients: [{ email: 'test@example.com', type: 'to' }],
          subject: 'Test',
          attachReport: true,
          attachmentFormat: 'pdf',
        }],
        {
          reportVersion: '2.0.0',
          requestedBy: 'user-001',
          customMessage: 'Please review',
        }
      );

      expect(request.tenantId).toBe('tenant-123');
      expect(request.reportId).toBe('rpt-001');
      expect(request.reportVersion).toBe('2.0.0');
      expect(request.requestedBy).toBe('user-001');
      expect(request.customMessage).toBe('Please review');
      expect(request.requestId).toMatch(/^req-/);
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton Management', () => {
  afterEach(() => {
    resetDistributionService();
  });

  describe('getDistributionService', () => {
    it('should throw if not initialized', () => {
      expect(() => getDistributionService()).toThrow('Distribution service not initialized');
    });

    it('should return service after initialization', () => {
      initializeDistributionService({ downloadBaseUrl: 'https://example.com' });
      const service = getDistributionService();
      expect(service).toBeInstanceOf(ReportDistributionService);
    });
  });

  describe('setDistributionService', () => {
    it('should set global service', () => {
      const service = createDistributionService({ downloadBaseUrl: 'https://example.com' });
      setDistributionService(service);
      expect(getDistributionService()).toBe(service);
    });
  });

  describe('resetDistributionService', () => {
    it('should reset global service', () => {
      initializeDistributionService({ downloadBaseUrl: 'https://example.com' });
      resetDistributionService();
      expect(() => getDistributionService()).toThrow();
    });
  });
});

// =============================================================================
// Template Tests
// =============================================================================

describe('Templates', () => {
  describe('DEFAULT_EMAIL_TEMPLATE', () => {
    it('should contain placeholders', () => {
      expect(DEFAULT_EMAIL_TEMPLATE).toContain('{{organizationName}}');
      expect(DEFAULT_EMAIL_TEMPLATE).toContain('{{reportTitle}}');
      expect(DEFAULT_EMAIL_TEMPLATE).toContain('{{framework}}');
      expect(DEFAULT_EMAIL_TEMPLATE).toContain('{{periodStart}}');
      expect(DEFAULT_EMAIL_TEMPLATE).toContain('{{periodEnd}}');
      expect(DEFAULT_EMAIL_TEMPLATE).toContain('{{customMessage}}');
    });
  });

  describe('DEFAULT_SLACK_TEMPLATE', () => {
    it('should contain placeholders', () => {
      expect(DEFAULT_SLACK_TEMPLATE).toContain('{{reportTitle}}');
      expect(DEFAULT_SLACK_TEMPLATE).toContain('{{organizationName}}');
      expect(DEFAULT_SLACK_TEMPLATE).toContain(':page_facing_up:');
    });
  });
});
