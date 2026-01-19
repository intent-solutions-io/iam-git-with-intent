/**
 * Tests for Audit Log Export Service (D3.5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import {
  AuditLogExportServiceImpl,
  createAuditLogExportService,
  initializeAuditLogExportService,
  getAuditLogExportService,
  setAuditLogExportService,
  resetAuditLogExportService,
  verifyExportSignature,
  type ExportFormat,
  type ExportOptions,
} from '../audit-log-export.js';
import {
  InMemoryAuditLogStore,
  createInMemoryAuditLogStore,
} from '../audit-log-storage.js';
import type { CreateAuditLogEntry } from '../audit-log-schema.js';

describe('AuditLogExportService', () => {
  let store: InMemoryAuditLogStore;
  let service: AuditLogExportServiceImpl;

  // Generate test key pair for signing
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  /**
   * Create a mock audit log entry
   */
  function createMockEntry(index: number, options?: Partial<CreateAuditLogEntry>): CreateAuditLogEntry {
    return {
      actor: {
        type: 'user',
        id: `user-${index}`,
        name: `User ${index}`,
      },
      action: {
        type: `action-${index}`,
        category: index % 2 === 0 ? 'data_access' : 'admin',
        description: `Action ${index} description`,
      },
      resource: {
        type: 'document',
        id: `doc-${index}`,
        name: `Document ${index}`,
      },
      outcome: {
        status: index % 3 === 0 ? 'failure' : 'success',
        message: index % 3 === 0 ? 'Operation failed' : undefined,
      },
      context: {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
      highRisk: index % 5 === 0,
      ...options,
    };
  }

  beforeEach(() => {
    store = createInMemoryAuditLogStore();
    service = new AuditLogExportServiceImpl(store);
    resetAuditLogExportService();
  });

  describe('getSupportedFormats', () => {
    it('should return all supported formats', () => {
      const formats = service.getSupportedFormats();

      expect(formats).toContain('json');
      expect(formats).toContain('json-lines');
      expect(formats).toContain('csv');
      expect(formats).toContain('cef');
      expect(formats).toContain('syslog');
      expect(formats).toHaveLength(5);
    });
  });

  describe('JSON Export', () => {
    it('should export empty result for empty tenant', async () => {
      const result = await service.export({
        format: 'json',
        tenantId: 'empty-tenant',
      });

      expect(result.content).toBeDefined();
      expect(result.metadata.entryCount).toBe(0);
      expect(result.contentType).toBe('application/json');
      expect(result.filename).toContain('.json');

      const parsed = JSON.parse(result.content);
      expect(parsed.entries).toEqual([]);
    });

    it('should export entries as JSON', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));
      await store.append(tenantId, createMockEntry(2));

      const result = await service.export({
        format: 'json',
        tenantId,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries).toHaveLength(3);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.entryCount).toBe(3);
    });

    it('should export with pretty print', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        prettyPrint: true,
      });

      // Pretty printed JSON has newlines and indentation
      expect(result.content).toContain('\n');
      expect(result.content).toContain('  ');
    });

    it('should include chain data when requested', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        includeChainData: true,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries[0].chain).toBeDefined();
      expect(parsed.entries[0].chain.sequence).toBe(0);
      expect(parsed.entries[0].chain.contentHash).toBeDefined();
    });

    it('should exclude chain data by default', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        includeChainData: false,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries[0].chain).toBeUndefined();
    });

    it('should exclude metadata when requested', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        includeMetadata: false,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.metadata).toBeUndefined();
    });
  });

  describe('JSON Lines Export', () => {
    it('should export as newline-delimited JSON', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const result = await service.export({
        format: 'json-lines',
        tenantId,
      });

      const lines = result.content.split('\n');
      expect(lines.length).toBe(3); // metadata + 2 entries

      // First line should be metadata
      const metadata = JSON.parse(lines[0]);
      expect(metadata._type).toBe('metadata');

      // Subsequent lines should be entries
      const entry1 = JSON.parse(lines[1]);
      expect(entry1.actor).toBeDefined();

      expect(result.contentType).toBe('application/x-ndjson');
      expect(result.filename).toContain('.jsonl');
    });
  });

  describe('CSV Export', () => {
    it('should export as CSV with headers', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const result = await service.export({
        format: 'csv',
        tenantId,
      });

      const lines = result.content.split('\n');
      expect(lines.length).toBe(3); // header + 2 data rows

      // Check header
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('actor_id');
      expect(lines[0]).toContain('action_type');

      // Check data row
      expect(lines[1]).toContain('user-0');
      expect(lines[1]).toContain('action-0');

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toContain('.csv');
    });

    it('should use custom delimiter', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'csv',
        tenantId,
        csvDelimiter: ';',
      });

      const lines = result.content.split('\n');
      expect(lines[0]).toContain(';');
      expect(lines[0]).not.toContain(',');
    });

    it('should escape special characters in CSV', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0, {
        action: {
          type: 'test',
          category: 'admin',
          description: 'Action with "quotes" and, commas',
        },
      }));

      const result = await service.export({
        format: 'csv',
        tenantId,
      });

      // Values with quotes/commas should be quoted
      expect(result.content).toContain('"Action with ""quotes"" and, commas"');
    });
  });

  describe('CEF Export', () => {
    it('should export as CEF format', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const result = await service.export({
        format: 'cef',
        tenantId,
      });

      const lines = result.content.split('\n');
      expect(lines.length).toBe(2);

      // Check CEF format
      expect(lines[0]).toMatch(/^CEF:0\|/);
      expect(lines[0]).toContain('|GWI|AuditLog|');
      expect(lines[0]).toContain('act=');
      expect(lines[0]).toContain('src=');
      expect(lines[0]).toContain('outcome=');

      expect(result.contentType).toBe('text/plain');
      expect(result.filename).toContain('.cef');
    });

    it('should use custom device info', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'cef',
        tenantId,
        deviceVendor: 'MyCompany',
        deviceProduct: 'MyProduct',
        deviceVersion: '2.0',
      });

      expect(result.content).toContain('|MyCompany|MyProduct|2.0|');
    });

    it('should set higher severity for high-risk entries', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(5)); // index 5 = high risk

      const result = await service.export({
        format: 'cef',
        tenantId,
      });

      // Severity should be 8 for high risk
      expect(result.content).toMatch(/\|8\|/);
    });
  });

  describe('Syslog Export', () => {
    it('should export as RFC 5424 syslog format', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const result = await service.export({
        format: 'syslog',
        tenantId,
      });

      const lines = result.content.split('\n');
      expect(lines.length).toBe(2);

      // Check syslog format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME ...
      expect(lines[0]).toMatch(/^<\d+>1 /);
      expect(lines[0]).toContain('gwi-audit');
      expect(lines[0]).toContain('[audit@gwi');

      expect(result.contentType).toBe('text/plain');
      expect(result.filename).toContain('.log');
    });

    it('should include structured data', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'syslog',
        tenantId,
      });

      expect(result.content).toContain('entryId="');
      expect(result.content).toContain('actor="user-0"');
      expect(result.content).toContain('action="action-0"');
    });
  });

  describe('Filtering', () => {
    it('should filter by date range', async () => {
      const tenantId = 'test-tenant';

      // Create entries first
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));
      await store.append(tenantId, createMockEntry(2));

      // Set time window AFTER creating entries so they fall within range
      const now = new Date(Date.now() + 1000); // 1 second in future to ensure entries are included
      const twoHoursAgo = new Date(now.getTime() - 7200000);

      // Filter by time (all entries are recent, so all should be included)
      const result = await service.export({
        format: 'json',
        tenantId,
        startTime: twoHoursAgo,
        endTime: now,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries.length).toBeGreaterThan(0);
      expect(parsed.metadata.filters.startTime).toBeDefined();
      expect(parsed.metadata.filters.endTime).toBeDefined();
    });

    it('should filter by actor ID', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const result = await service.export({
        format: 'json',
        tenantId,
        actorId: 'user-0',
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries.length).toBe(1);
      expect(parsed.entries[0].actor.id).toBe('user-0');
    });

    it('should filter by action category', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0)); // data_access
      await store.append(tenantId, createMockEntry(1)); // admin
      await store.append(tenantId, createMockEntry(2)); // data_access

      const result = await service.export({
        format: 'json',
        tenantId,
        actionCategory: 'data_access',
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries.length).toBe(2);
      for (const entry of parsed.entries) {
        expect(entry.action.category).toBe('data_access');
      }
    });

    it('should filter by high risk only', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0)); // high risk (5 % 5 === 0)
      await store.append(tenantId, createMockEntry(1)); // not high risk
      await store.append(tenantId, createMockEntry(5)); // high risk

      const result = await service.export({
        format: 'json',
        tenantId,
        highRiskOnly: true,
      });

      const parsed = JSON.parse(result.content);
      for (const entry of parsed.entries) {
        expect(entry.highRisk).toBe(true);
      }
    });

    it('should respect limit', async () => {
      const tenantId = 'test-tenant';
      for (let i = 0; i < 10; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const result = await service.export({
        format: 'json',
        tenantId,
        limit: 5,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.entries.length).toBe(5);
    });
  });

  describe('Export Signing', () => {
    it('should sign export when requested', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        sign: true,
        privateKey: privateKey as string,
        keyId: 'test-key-1',
      });

      expect(result.signature).toBeDefined();
      expect(result.signature?.algorithm).toBe('RSA-SHA256');
      expect(result.signature?.keyId).toBe('test-key-1');
      expect(result.signature?.contentHash).toBeDefined();
      expect(result.signature?.signature).toBeDefined();
    });

    it('should verify valid signature', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        sign: true,
        privateKey: privateKey as string,
        keyId: 'test-key-1',
      });

      const isValid = service.verifySignature(
        result.content,
        result.signature!,
        publicKey as string
      );

      expect(isValid).toBe(true);
    });

    it('should detect tampered content', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        sign: true,
        privateKey: privateKey as string,
        keyId: 'test-key-1',
      });

      // Tamper with content
      const tamperedContent = result.content.replace('user-0', 'hacker');

      const isValid = service.verifySignature(
        tamperedContent,
        result.signature!,
        publicKey as string
      );

      expect(isValid).toBe(false);
    });

    it('should not sign when not requested', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
      });

      expect(result.signature).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    it('should include correct metadata', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const result = await service.export({
        format: 'json',
        tenantId,
      });

      expect(result.metadata.exportedAt).toBeInstanceOf(Date);
      expect(result.metadata.format).toBe('json');
      expect(result.metadata.tenantId).toBe(tenantId);
      expect(result.metadata.entryCount).toBe(2);
      expect(result.metadata.sequenceRange.start).toBe(0);
      expect(result.metadata.sequenceRange.end).toBe(1);
      expect(result.metadata.exportVersion).toBe('1.0');
      expect(result.metadata.schemaVersion).toBe('1.0');
    });

    it('should include filter information in metadata', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        actorId: 'user-0',
        highRiskOnly: true,
      });

      expect(result.metadata.filters.actorId).toBe('user-0');
      expect(result.metadata.filters.highRiskOnly).toBe(true);
    });
  });

  describe('Content Info', () => {
    const formats: Array<{ format: ExportFormat; contentType: string; ext: string }> = [
      { format: 'json', contentType: 'application/json', ext: '.json' },
      { format: 'json-lines', contentType: 'application/x-ndjson', ext: '.jsonl' },
      { format: 'csv', contentType: 'text/csv', ext: '.csv' },
      { format: 'cef', contentType: 'text/plain', ext: '.cef' },
      { format: 'syslog', contentType: 'text/plain', ext: '.log' },
    ];

    for (const { format, contentType, ext } of formats) {
      it(`should return correct content info for ${format}`, async () => {
        const tenantId = 'test-tenant';

        const result = await service.export({
          format,
          tenantId,
        });

        expect(result.contentType).toBe(contentType);
        expect(result.filename).toContain(ext);
        expect(result.filename).toContain(tenantId);
      });
    }
  });

  describe('Factory and Singleton Functions', () => {
    it('should create service with factory function', () => {
      const service = createAuditLogExportService(store);
      expect(service).toBeInstanceOf(AuditLogExportServiceImpl);
    });

    it('should initialize and get singleton service', () => {
      const service = initializeAuditLogExportService(store);
      const retrieved = getAuditLogExportService();
      expect(retrieved).toBe(service);
    });

    it('should throw when getting uninitialized singleton', () => {
      expect(() => getAuditLogExportService()).toThrow(
        'AuditLogExportService not initialized'
      );
    });

    it('should set and get custom service', () => {
      const customService = createAuditLogExportService(store);
      setAuditLogExportService(customService);
      expect(getAuditLogExportService()).toBe(customService);
    });

    it('should reset singleton service', () => {
      initializeAuditLogExportService(store);
      resetAuditLogExportService();
      expect(() => getAuditLogExportService()).toThrow();
    });
  });

  describe('verifyExportSignature standalone function', () => {
    it('should verify signatures independently', async () => {
      const tenantId = 'test-tenant';
      await store.append(tenantId, createMockEntry(0));

      const result = await service.export({
        format: 'json',
        tenantId,
        sign: true,
        privateKey: privateKey as string,
        keyId: 'test-key-1',
      });

      const isValid = verifyExportSignature(
        result.content,
        result.signature!,
        publicKey as string
      );

      expect(isValid).toBe(true);
    });
  });
});
