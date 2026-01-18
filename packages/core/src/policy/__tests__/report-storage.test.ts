/**
 * Report Storage Tests
 *
 * Tests for D4.5: Report storage with versioning and tenant isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ReportStatus,
  StoredReportMetadata,
  StoredReport,
  ReportQueryOptions,
  ReportQueryResult,
  ReportVersionEntry,
  ReportStore,
  InMemoryReportStore,
  REPORT_COLLECTIONS,
  createInMemoryReportStore,
  getReportStore,
  setReportStore,
  resetReportStore,
  initializeInMemoryReportStore,
} from '../report-storage.js';
import type { ComplianceReportTemplate } from '../report-templates.js';
import type { SignedReport, ReportSignature } from '../report-signing.js';

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

const createMockSignature = (): ReportSignature => ({
  signatureId: 'sig-001',
  algorithm: 'RSA-SHA256',
  signature: 'mock-signature-base64',
  contentHash: 'mock-content-hash',
  signedAt: new Date('2024-02-01T10:00:00Z'),
  signer: {
    signerId: 'signer-001',
    name: 'John Doe',
    title: 'Compliance Officer',
    organization: 'Test Corp',
    email: 'john.doe@testcorp.com',
  },
  keyInfo: {
    keyId: 'key-001',
    algorithm: 'RSA-SHA256',
    publicKey: 'mock-public-key',
    fingerprint: 'mock-fingerprint',
    createdAt: new Date('2024-01-01'),
  },
});

const createMockSignedReport = (report?: ComplianceReportTemplate): SignedReport => ({
  report: report ?? createMockReport(),
  signature: createMockSignature(),
  content: JSON.stringify(report ?? createMockReport()),
  verified: true,
});

// =============================================================================
// Schema Tests
// =============================================================================

describe('ReportStatus', () => {
  it('should validate all status values', () => {
    const statuses = ['draft', 'pending_review', 'approved', 'published', 'archived', 'superseded'];
    for (const status of statuses) {
      expect(ReportStatus.parse(status)).toBe(status);
    }
  });

  it('should reject invalid status', () => {
    expect(() => ReportStatus.parse('invalid')).toThrow();
  });
});

describe('StoredReportMetadata', () => {
  it('should validate complete metadata', () => {
    const metadata = {
      reportId: 'rpt-001',
      tenantId: 'tenant-123',
      version: '1.0.0',
      framework: 'soc2_type2',
      title: 'Test Report',
      status: 'draft' as const,
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31'),
      organizationName: 'Test Corp',
      signed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user-001',
      tags: ['audit', 'security'],
    };

    const result = StoredReportMetadata.parse(metadata);
    expect(result.reportId).toBe('rpt-001');
    expect(result.status).toBe('draft');
    expect(result.tags).toEqual(['audit', 'security']);
  });

  it('should apply default for tags', () => {
    const metadata = {
      reportId: 'rpt-001',
      tenantId: 'tenant-123',
      version: '1.0.0',
      framework: 'soc2_type2',
      title: 'Test Report',
      status: 'draft' as const,
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31'),
      organizationName: 'Test Corp',
      signed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user-001',
    };

    const result = StoredReportMetadata.parse(metadata);
    expect(result.tags).toEqual([]);
  });
});

describe('ReportQueryOptions', () => {
  it('should apply defaults', () => {
    const options = { tenantId: 'tenant-123' };
    const result = ReportQueryOptions.parse(options);

    expect(result.tenantId).toBe('tenant-123');
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortDirection).toBe('desc');
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  it('should validate limit constraints', () => {
    expect(() => ReportQueryOptions.parse({ tenantId: 't', limit: 0 })).toThrow();
    expect(() => ReportQueryOptions.parse({ tenantId: 't', limit: 1001 })).toThrow();
    expect(ReportQueryOptions.parse({ tenantId: 't', limit: 500 }).limit).toBe(500);
  });

  it('should accept all filter options', () => {
    const options = {
      tenantId: 'tenant-123',
      status: 'approved' as const,
      statuses: ['approved', 'published'] as const,
      framework: 'soc2_type2',
      periodStartAfter: new Date('2024-01-01'),
      periodStartBefore: new Date('2024-12-31'),
      signed: true,
      tags: ['audit'],
      createdAfter: new Date('2024-01-01'),
      createdBefore: new Date('2024-12-31'),
      sortBy: 'title' as const,
      sortDirection: 'asc' as const,
    };

    const result = ReportQueryOptions.parse(options);
    expect(result.status).toBe('approved');
    expect(result.framework).toBe('soc2_type2');
    expect(result.signed).toBe(true);
  });
});

// =============================================================================
// InMemoryReportStore Tests
// =============================================================================

describe('InMemoryReportStore', () => {
  let store: InMemoryReportStore;

  beforeEach(() => {
    store = new InMemoryReportStore();
  });

  describe('save', () => {
    it('should save a new report', async () => {
      const report = createMockReport();

      const stored = await store.save('tenant-123', report, { createdBy: 'user-001' });

      expect(stored.metadata.reportId).toBe('rpt-test-001');
      expect(stored.metadata.tenantId).toBe('tenant-123');
      expect(stored.metadata.status).toBe('draft');
      expect(stored.metadata.signed).toBe(false);
      expect(stored.metadata.createdBy).toBe('user-001');
      expect(stored.report).toBe(report);
      expect(stored.contentJson).toBeDefined();
    });

    it('should save with custom status and tags', async () => {
      const report = createMockReport();

      const stored = await store.save('tenant-123', report, {
        status: 'pending_review',
        createdBy: 'user-001',
        tags: ['q1', 'security'],
        customMetadata: { priority: 'high' },
      });

      expect(stored.metadata.status).toBe('pending_review');
      expect(stored.metadata.tags).toEqual(['q1', 'security']);
      expect(stored.metadata.customMetadata).toEqual({ priority: 'high' });
    });

    it('should update existing report preserving creation data', async () => {
      const report = createMockReport();
      const stored1 = await store.save('tenant-123', report, { createdBy: 'user-001' });
      const originalCreatedAt = stored1.metadata.createdAt;

      // Wait a small amount to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const stored2 = await store.save('tenant-123', report, { createdBy: 'user-002' });

      expect(stored2.metadata.createdAt).toEqual(originalCreatedAt);
      expect(stored2.metadata.createdBy).toBe('user-001'); // Preserved
      expect(stored2.metadata.updatedBy).toBe('user-002');
      expect(stored2.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(originalCreatedAt.getTime());
    });

    it('should extract framework from object', async () => {
      const report = createMockReport();
      const stored = await store.save('tenant-123', report, { createdBy: 'user-001' });

      expect(stored.metadata.framework).toBe('soc2_type2');
    });
  });

  describe('saveSigned', () => {
    it('should save a signed report', async () => {
      const signedReport = createMockSignedReport();

      const stored = await store.saveSigned('tenant-123', signedReport, { createdBy: 'user-001' });

      expect(stored.metadata.signed).toBe(true);
      expect(stored.metadata.signerId).toBe('signer-001');
      expect(stored.metadata.signedAt).toEqual(new Date('2024-02-01T10:00:00Z'));
      expect(stored.metadata.status).toBe('approved'); // Default for signed
      expect(stored.signature).toBeDefined();
    });

    it('should save with custom status for signed report', async () => {
      const signedReport = createMockSignedReport();

      const stored = await store.saveSigned('tenant-123', signedReport, {
        status: 'published',
        createdBy: 'user-001',
      });

      expect(stored.metadata.status).toBe('published');
    });
  });

  describe('get', () => {
    it('should get existing report', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const retrieved = await store.get('tenant-123', 'rpt-test-001');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.metadata.reportId).toBe('rpt-test-001');
    });

    it('should return null for non-existent report', async () => {
      const retrieved = await store.get('tenant-123', 'non-existent');
      expect(retrieved).toBeNull();
    });

    it('should isolate tenants', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const retrieved = await store.get('tenant-999', 'rpt-test-001');
      expect(retrieved).toBeNull();
    });
  });

  describe('getMetadata', () => {
    it('should get only metadata', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const metadata = await store.getMetadata('tenant-123', 'rpt-test-001');

      expect(metadata).not.toBeNull();
      expect(metadata!.reportId).toBe('rpt-test-001');
    });

    it('should return null for non-existent report', async () => {
      const metadata = await store.getMetadata('tenant-123', 'non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing report', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const deleted = await store.delete('tenant-123', 'rpt-test-001');

      expect(deleted).toBe(true);
      const retrieved = await store.get('tenant-123', 'rpt-test-001');
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent report', async () => {
      const deleted = await store.delete('tenant-123', 'non-existent');
      expect(deleted).toBe(false);
    });

    it('should delete versions too', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const v2 = createMockReport({ version: '2.0.0' });
      await store.createVersion('tenant-123', 'rpt-test-001', v2, { createdBy: 'user-001' });

      await store.delete('tenant-123', 'rpt-test-001');

      const history = await store.getVersionHistory('tenant-123', 'rpt-test-001');
      expect(history).toHaveLength(0);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create multiple reports
      for (let i = 1; i <= 5; i++) {
        const report = createMockReport({
          reportId: `rpt-${i.toString().padStart(3, '0')}`,
          title: `Report ${i}`,
          framework: {
            name: i % 2 === 0 ? 'ISO 27001' : 'SOC 2',
            framework: i % 2 === 0 ? 'iso27001' : 'soc2_type2',
            version: '2022',
            description: 'Test',
          },
        });
        await store.save('tenant-123', report, {
          createdBy: 'user-001',
          status: i <= 2 ? 'draft' : i <= 4 ? 'approved' : 'published',
          tags: i <= 3 ? ['important'] : [],
        });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    });

    it('should list all tenant reports', async () => {
      const result = await store.list({ tenantId: 'tenant-123' });

      expect(result.totalCount).toBe(5);
      expect(result.reports).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      const result = await store.list({ tenantId: 'tenant-123', status: 'draft' });

      expect(result.totalCount).toBe(2);
      expect(result.reports.every(r => r.status === 'draft')).toBe(true);
    });

    it('should filter by multiple statuses', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        statuses: ['approved', 'published'],
      });

      expect(result.totalCount).toBe(3);
    });

    it('should filter by framework', async () => {
      const result = await store.list({ tenantId: 'tenant-123', framework: 'iso27001' });

      expect(result.totalCount).toBe(2);
    });

    it('should filter by tags', async () => {
      const result = await store.list({ tenantId: 'tenant-123', tags: ['important'] });

      expect(result.totalCount).toBe(3);
    });

    it('should paginate results', async () => {
      const result = await store.list({ tenantId: 'tenant-123', limit: 2, offset: 0 });

      expect(result.reports).toHaveLength(2);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(true);

      const result2 = await store.list({ tenantId: 'tenant-123', limit: 2, offset: 2 });
      expect(result2.reports).toHaveLength(2);
      expect(result2.hasMore).toBe(true);

      const result3 = await store.list({ tenantId: 'tenant-123', limit: 2, offset: 4 });
      expect(result3.reports).toHaveLength(1);
      expect(result3.hasMore).toBe(false);
    });

    it('should sort by title ascending', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        sortBy: 'title',
        sortDirection: 'asc',
      });

      expect(result.reports[0].title).toBe('Report 1');
      expect(result.reports[4].title).toBe('Report 5');
    });

    it('should return empty for non-existent tenant', async () => {
      const result = await store.list({ tenantId: 'tenant-999' });

      expect(result.totalCount).toBe(0);
      expect(result.reports).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by signed status', async () => {
      // Add a signed report
      const signedReport = createMockSignedReport(
        createMockReport({ reportId: 'rpt-signed' })
      );
      await store.saveSigned('tenant-123', signedReport, { createdBy: 'user-001' });

      const signedResult = await store.list({ tenantId: 'tenant-123', signed: true });
      expect(signedResult.totalCount).toBe(1);

      const unsignedResult = await store.list({ tenantId: 'tenant-123', signed: false });
      expect(unsignedResult.totalCount).toBe(5);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        const report = createMockReport({
          reportId: `rpt-${i.toString().padStart(3, '0')}`,
        });
        await store.save('tenant-123', report, {
          createdBy: 'user-001',
          status: i <= 2 ? 'draft' : 'approved',
        });
      }
    });

    it('should count all reports', async () => {
      const count = await store.count({ tenantId: 'tenant-123' });
      expect(count).toBe(5);
    });

    it('should count with filter', async () => {
      const count = await store.count({ tenantId: 'tenant-123', status: 'draft' });
      expect(count).toBe(2);
    });
  });

  describe('updateStatus', () => {
    it('should update status', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const updated = await store.updateStatus('tenant-123', 'rpt-test-001', 'approved', 'user-002');

      expect(updated).not.toBeNull();
      expect(updated!.metadata.status).toBe('approved');
      expect(updated!.metadata.updatedBy).toBe('user-002');
    });

    it('should return null for non-existent report', async () => {
      const updated = await store.updateStatus('tenant-123', 'non-existent', 'approved', 'user-001');
      expect(updated).toBeNull();
    });
  });

  describe('createVersion', () => {
    it('should create new version', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      const v2 = createMockReport({
        version: '2.0.0',
        title: 'Updated Report',
      });

      const stored = await store.createVersion('tenant-123', 'rpt-test-001', v2, {
        createdBy: 'user-002',
        changeDescription: 'Major update',
      });

      expect(stored.metadata.version).toBe('2.0.0');
      expect(stored.metadata.title).toBe('Updated Report');
    });

    it('should preserve status from previous version', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001', status: 'approved' });

      const v2 = createMockReport({ version: '2.0.0' });
      const stored = await store.createVersion('tenant-123', 'rpt-test-001', v2, {
        createdBy: 'user-002',
      });

      expect(stored.metadata.status).toBe('approved');
    });

    it('should create version for new report', async () => {
      const report = createMockReport();
      const stored = await store.createVersion('tenant-123', 'new-report', report, {
        createdBy: 'user-001',
      });

      expect(stored.metadata.status).toBe('draft');
    });
  });

  describe('getVersionHistory', () => {
    it('should return version history', async () => {
      const v1 = createMockReport({ version: '1.0.0' });
      await store.save('tenant-123', v1, { createdBy: 'user-001' });

      const v2 = createMockReport({ version: '2.0.0' });
      await store.createVersion('tenant-123', 'rpt-test-001', v2, { createdBy: 'user-001' });

      const v3 = createMockReport({ version: '3.0.0' });
      await store.createVersion('tenant-123', 'rpt-test-001', v3, { createdBy: 'user-001' });

      const history = await store.getVersionHistory('tenant-123', 'rpt-test-001');

      expect(history).toHaveLength(3);
      expect(history[0].version).toBe('1.0.0');
      expect(history[1].version).toBe('2.0.0');
      expect(history[2].version).toBe('3.0.0');
    });

    it('should return empty for non-existent report', async () => {
      const history = await store.getVersionHistory('tenant-123', 'non-existent');
      expect(history).toHaveLength(0);
    });
  });

  describe('getVersion', () => {
    beforeEach(async () => {
      const v1 = createMockReport({ version: '1.0.0', title: 'V1' });
      await store.save('tenant-123', v1, { createdBy: 'user-001' });

      const v2 = createMockReport({ version: '2.0.0', title: 'V2' });
      await store.createVersion('tenant-123', 'rpt-test-001', v2, { createdBy: 'user-001' });
    });

    it('should get current version', async () => {
      const stored = await store.getVersion('tenant-123', 'rpt-test-001', '2.0.0');

      expect(stored).not.toBeNull();
      expect(stored!.report.version).toBe('2.0.0');
      expect(stored!.report.title).toBe('V2');
    });

    it('should get historical version', async () => {
      const stored = await store.getVersion('tenant-123', 'rpt-test-001', '1.0.0');

      expect(stored).not.toBeNull();
      expect(stored!.report.version).toBe('1.0.0');
      expect(stored!.report.title).toBe('V1');
    });

    it('should return null for non-existent version', async () => {
      const stored = await store.getVersion('tenant-123', 'rpt-test-001', '9.9.9');
      expect(stored).toBeNull();
    });
  });

  describe('archiveOlderThan', () => {
    beforeEach(async () => {
      // Create reports with different ages
      const oldReport = createMockReport({ reportId: 'old-001' });
      await store.save('tenant-123', oldReport, { createdBy: 'user-001', status: 'draft' });

      // Override createdAt for old report
      const stored = await store.get('tenant-123', 'old-001');
      if (stored) {
        (stored.metadata as any).createdAt = new Date('2023-01-01');
      }

      const newReport = createMockReport({ reportId: 'new-001' });
      await store.save('tenant-123', newReport, { createdBy: 'user-001', status: 'draft' });
    });

    it('should archive old reports', async () => {
      const count = await store.archiveOlderThan('tenant-123', new Date('2024-01-01'));

      expect(count).toBe(1);
      const archived = await store.get('tenant-123', 'old-001');
      expect(archived!.metadata.status).toBe('archived');
    });

    it('should exclude specified statuses', async () => {
      // First make the old report approved
      await store.updateStatus('tenant-123', 'old-001', 'approved', 'user-001');

      const count = await store.archiveOlderThan('tenant-123', new Date('2024-01-01'), {
        excludeStatuses: ['approved'],
      });

      expect(count).toBe(0);
    });

    it('should not archive already archived reports', async () => {
      await store.updateStatus('tenant-123', 'old-001', 'archived', 'user-001');

      const count = await store.archiveOlderThan('tenant-123', new Date('2024-01-01'));

      expect(count).toBe(0);
    });
  });

  describe('getMany', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 3; i++) {
        const report = createMockReport({ reportId: `rpt-${i}` });
        await store.save('tenant-123', report, { createdBy: 'user-001' });
      }
    });

    it('should get multiple reports', async () => {
      const reports = await store.getMany('tenant-123', ['rpt-1', 'rpt-2', 'rpt-3']);

      expect(reports).toHaveLength(3);
    });

    it('should skip non-existent reports', async () => {
      const reports = await store.getMany('tenant-123', ['rpt-1', 'non-existent', 'rpt-3']);

      expect(reports).toHaveLength(2);
    });

    it('should return empty for empty input', async () => {
      const reports = await store.getMany('tenant-123', []);
      expect(reports).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });

      store.clear();

      expect(store.getTotalCount()).toBe(0);
      const retrieved = await store.get('tenant-123', 'rpt-test-001');
      expect(retrieved).toBeNull();
    });
  });

  describe('getTotalCount', () => {
    it('should return total count', async () => {
      expect(store.getTotalCount()).toBe(0);

      await store.save('tenant-123', createMockReport({ reportId: 'r1' }), { createdBy: 'u' });
      await store.save('tenant-456', createMockReport({ reportId: 'r2' }), { createdBy: 'u' });

      expect(store.getTotalCount()).toBe(2);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('createInMemoryReportStore', () => {
    it('should create InMemoryReportStore instance', () => {
      const store = createInMemoryReportStore();
      expect(store).toBeInstanceOf(InMemoryReportStore);
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton Management', () => {
  afterEach(() => {
    resetReportStore();
  });

  describe('getReportStore', () => {
    it('should throw if not initialized', () => {
      expect(() => getReportStore()).toThrow('Report store not initialized');
    });

    it('should return store after initialization', () => {
      const store = createInMemoryReportStore();
      setReportStore(store);

      expect(getReportStore()).toBe(store);
    });
  });

  describe('setReportStore', () => {
    it('should set global store', () => {
      const store = createInMemoryReportStore();
      setReportStore(store);

      expect(getReportStore()).toBe(store);
    });

    it('should allow replacing store', () => {
      const store1 = createInMemoryReportStore();
      const store2 = createInMemoryReportStore();

      setReportStore(store1);
      setReportStore(store2);

      expect(getReportStore()).toBe(store2);
    });
  });

  describe('resetReportStore', () => {
    it('should reset global store', () => {
      setReportStore(createInMemoryReportStore());
      resetReportStore();

      expect(() => getReportStore()).toThrow('Report store not initialized');
    });
  });

  describe('initializeInMemoryReportStore', () => {
    it('should initialize and set global store', () => {
      const store = initializeInMemoryReportStore();

      expect(store).toBeInstanceOf(InMemoryReportStore);
      expect(getReportStore()).toBe(store);
    });
  });
});

// =============================================================================
// Collection Constants Tests
// =============================================================================

describe('REPORT_COLLECTIONS', () => {
  it('should have correct collection names', () => {
    expect(REPORT_COLLECTIONS.reports).toBe('compliance_reports');
    expect(REPORT_COLLECTIONS.versions).toBe('compliance_report_versions');
  });
});

// =============================================================================
// Query Filter Tests
// =============================================================================

describe('Query Filters', () => {
  let store: InMemoryReportStore;

  beforeEach(() => {
    store = new InMemoryReportStore();
  });

  describe('period filters', () => {
    beforeEach(async () => {
      const reports = [
        createMockReport({
          reportId: 'jan',
          period: { start: new Date('2024-01-01'), end: new Date('2024-01-31'), type: 'period' },
        }),
        createMockReport({
          reportId: 'mar',
          period: { start: new Date('2024-03-01'), end: new Date('2024-03-31'), type: 'period' },
        }),
        createMockReport({
          reportId: 'jun',
          period: { start: new Date('2024-06-01'), end: new Date('2024-06-30'), type: 'period' },
        }),
      ];

      for (const report of reports) {
        await store.save('tenant-123', report, { createdBy: 'user-001' });
      }
    });

    it('should filter by periodStartAfter', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        periodStartAfter: new Date('2024-02-01'),
      });

      expect(result.totalCount).toBe(2);
      expect(result.reports.map(r => r.reportId).sort()).toEqual(['jun', 'mar']);
    });

    it('should filter by periodStartBefore', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        periodStartBefore: new Date('2024-04-01'),
      });

      expect(result.totalCount).toBe(2);
      expect(result.reports.map(r => r.reportId).sort()).toEqual(['jan', 'mar']);
    });

    it('should combine period filters', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        periodStartAfter: new Date('2024-02-01'),
        periodStartBefore: new Date('2024-04-01'),
      });

      expect(result.totalCount).toBe(1);
      expect(result.reports[0].reportId).toBe('mar');
    });
  });

  describe('created date filters', () => {
    beforeEach(async () => {
      const report = createMockReport();
      await store.save('tenant-123', report, { createdBy: 'user-001' });
    });

    it('should filter by createdAfter', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        createdAfter: new Date('2020-01-01'),
      });

      expect(result.totalCount).toBe(1);
    });

    it('should filter by createdBefore', async () => {
      const result = await store.list({
        tenantId: 'tenant-123',
        createdBefore: new Date('2020-01-01'),
      });

      expect(result.totalCount).toBe(0);
    });
  });
});
