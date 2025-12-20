/**
 * Tests for LocalSignedUrlGenerator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalSignedUrlGenerator } from '../local-signed-url-generator.js';
import type { ArtifactAccessRequest, ArtifactReference, TenantValidationResult } from '../types.js';
import { TenantAccessDeniedError, ArtifactNotFoundError } from '../types.js';
import type { TenantValidator, ArtifactAuditLogger, ArtifactExistenceChecker } from '../interfaces.js';

// =============================================================================
// Test Helpers
// =============================================================================

const createArtifactRef = (overrides?: Partial<ArtifactReference>): ArtifactReference => ({
  tenantId: 'tenant-1',
  repoId: 'repo-1',
  runId: '550e8400-e29b-41d4-a716-446655440000',
  artifactName: 'triage.json',
  ...overrides,
});

const createAccessRequest = (overrides?: Partial<ArtifactAccessRequest>): ArtifactAccessRequest => ({
  artifact: createArtifactRef(),
  action: 'read',
  userId: 'user-1',
  source: 'test',
  ...overrides,
});

// Mock validator that rejects specific tenant-run combinations
class MockTenantValidator implements TenantValidator {
  private deniedPairs: Set<string>;

  constructor(deniedPairs: Array<{ tenantId: string; runId: string }> = []) {
    this.deniedPairs = new Set(deniedPairs.map((p) => `${p.tenantId}:${p.runId}`));
  }

  async validateRunOwnership(tenantId: string, runId: string): Promise<TenantValidationResult> {
    const key = `${tenantId}:${runId}`;
    if (this.deniedPairs.has(key)) {
      return {
        valid: false,
        tenantId,
        runId,
        error: `Access denied for ${tenantId}:${runId}`,
      };
    }
    return { valid: true, tenantId, runId };
  }

  async validateRunOwnershipBatch(tenantId: string, runIds: string[]): Promise<Map<string, TenantValidationResult>> {
    const results = new Map<string, TenantValidationResult>();
    for (const runId of runIds) {
      results.set(runId, await this.validateRunOwnership(tenantId, runId));
    }
    return results;
  }
}

// Mock existence checker
class MockExistenceChecker implements ArtifactExistenceChecker {
  private existingArtifacts: Set<string>;

  constructor(existingArtifacts: ArtifactReference[] = []) {
    this.existingArtifacts = new Set(
      existingArtifacts.map((a) => `${a.tenantId}/${a.repoId}/${a.runId}/${a.artifactName}`)
    );
  }

  async artifactExists(artifact: ArtifactReference): Promise<boolean> {
    const key = `${artifact.tenantId}/${artifact.repoId}/${artifact.runId}/${artifact.artifactName}`;
    return this.existingArtifacts.has(key);
  }

  async artifactExistsBatch(artifacts: ArtifactReference[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const artifact of artifacts) {
      const key = `${artifact.tenantId}/${artifact.repoId}/${artifact.runId}/${artifact.artifactName}`;
      results.set(key, this.existingArtifacts.has(key));
    }
    return results;
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('LocalSignedUrlGenerator', () => {
  describe('file mode', () => {
    it('should generate file:// URL', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'file' });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toContain('file://');
      expect(result.url).toContain('tenant-1/repo-1');
      expect(result.url).toContain('triage.json');
      expect(result.backend).toBe('local');
      expect(result.action).toBe('read');
    });

    it('should use custom base path', async () => {
      const generator = new LocalSignedUrlGenerator({
        mode: 'file',
        basePath: '/custom/path',
      });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toContain('file:///custom/path');
    });
  });

  describe('http mode', () => {
    it('should generate http:// URL with expiry param', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'http' });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toContain('http://localhost:3000/artifacts');
      expect(result.url).toContain('expires=');
      expect(result.url).toContain('action=read');
      expect(result.backend).toBe('local');
    });

    it('should use custom base URL', async () => {
      const generator = new LocalSignedUrlGenerator({
        mode: 'http',
        baseUrl: 'http://example.com:8080',
      });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toContain('http://example.com:8080/artifacts');
    });

    it('should include write action in URL', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'http' });
      const request = createAccessRequest({ action: 'write' });

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toContain('action=write');
      expect(result.action).toBe('write');
    });
  });

  describe('mock mode', () => {
    it('should generate mock:// URL', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toContain('mock://');
      expect(result.url).toContain('expires=');
      expect(result.backend).toBe('local');
    });
  });

  describe('expiry configuration', () => {
    it('should use default expiry (15 minutes)', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const request = createAccessRequest();

      const beforeTimestamp = Date.now() + 15 * 60 * 1000;
      const result = await generator.generateSignedUrl(request);
      const afterTimestamp = Date.now() + 15 * 60 * 1000;

      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(beforeTimestamp - 1000);
      expect(expiresAt).toBeLessThanOrEqual(afterTimestamp + 1000);
    });

    it('should use custom expiry from config', async () => {
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        urlConfig: { expiryMinutes: 30 },
      });
      const request = createAccessRequest();

      const beforeTimestamp = Date.now() + 30 * 60 * 1000;
      const result = await generator.generateSignedUrl(request);
      const afterTimestamp = Date.now() + 30 * 60 * 1000;

      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(beforeTimestamp - 1000);
      expect(expiresAt).toBeLessThanOrEqual(afterTimestamp + 1000);
    });

    it('should use custom expiry from request', async () => {
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        urlConfig: { expiryMinutes: 15 },
      });
      const request = createAccessRequest({ expiryMinutes: 60 });

      const beforeTimestamp = Date.now() + 60 * 60 * 1000;
      const result = await generator.generateSignedUrl(request);
      const afterTimestamp = Date.now() + 60 * 60 * 1000;

      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(beforeTimestamp - 1000);
      expect(expiresAt).toBeLessThanOrEqual(afterTimestamp + 1000);
    });
  });

  describe('tenant validation', () => {
    it('should validate tenant ownership', async () => {
      const validator = new MockTenantValidator();
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        tenantValidator: validator,
      });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toBeTruthy();
      expect(result.artifact.tenantId).toBe('tenant-1');
    });

    it('should reject access when tenant validation fails', async () => {
      const validator = new MockTenantValidator([
        { tenantId: 'tenant-1', runId: '550e8400-e29b-41d4-a716-446655440000' },
      ]);
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        tenantValidator: validator,
      });
      const request = createAccessRequest();

      await expect(generator.generateSignedUrl(request)).rejects.toThrow(TenantAccessDeniedError);
    });

    it('should validate tenant access without generating URL', async () => {
      const validator = new MockTenantValidator();
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        tenantValidator: validator,
      });

      const result = await generator.validateTenantAccess('tenant-1', '550e8400-e29b-41d4-a716-446655440000');

      expect(result.valid).toBe(true);
      expect(result.tenantId).toBe('tenant-1');
    });
  });

  describe('artifact existence checking', () => {
    it('should not check existence by default', async () => {
      const existenceChecker = new MockExistenceChecker([]);
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        existenceChecker,
        checkExistence: false,
      });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toBeTruthy();
    });

    it('should check existence when enabled', async () => {
      const artifact = createArtifactRef();
      const existenceChecker = new MockExistenceChecker([artifact]);
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        existenceChecker,
        checkExistence: true,
      });
      const request = createAccessRequest({ artifact });

      const result = await generator.generateSignedUrl(request);

      expect(result.url).toBeTruthy();
    });

    it('should reject when artifact does not exist and checking is enabled', async () => {
      const existenceChecker = new MockExistenceChecker([]);
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        existenceChecker,
        checkExistence: true,
      });
      const request = createAccessRequest();

      await expect(generator.generateSignedUrl(request)).rejects.toThrow(ArtifactNotFoundError);
    });
  });

  describe('audit logging', () => {
    it('should log access request', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result.auditEventId).toBeTruthy();
    });

    it('should include user and source in audit log', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const logger = generator.getAuditLogger();
      const request = createAccessRequest({
        userId: 'user-123',
        source: 'ui',
      });

      await generator.generateSignedUrl(request);

      const events = await logger.queryAccessEvents('550e8400-e29b-41d4-a716-446655440000');
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('user-123');
      expect(events[0].source).toBe('ui');
      expect(events[0].action).toBe('read');
    });

    it('should log multiple access requests in batch', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const logger = generator.getAuditLogger();

      const requests = [
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'triage.json' }) }),
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'plan.json' }) }),
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'patch.diff' }) }),
      ];

      await generator.generateSignedUrlBatch(requests);

      const events = await logger.queryAccessEvents('550e8400-e29b-41d4-a716-446655440000');
      expect(events).toHaveLength(3);
    });
  });

  describe('batch operations', () => {
    it('should generate signed URLs for multiple artifacts', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });

      const requests = [
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'triage.json' }) }),
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'plan.json' }) }),
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'patch.diff' }) }),
      ];

      const results = await generator.generateSignedUrlBatch(requests);

      expect(results).toHaveLength(3);
      expect(results[0].artifact.artifactName).toBe('triage.json');
      expect(results[1].artifact.artifactName).toBe('plan.json');
      expect(results[2].artifact.artifactName).toBe('patch.diff');
      results.forEach((result) => {
        expect(result.url).toBeTruthy();
        expect(result.backend).toBe('local');
      });
    });

    it('should validate tenant for all artifacts in batch', async () => {
      const validator = new MockTenantValidator([
        { tenantId: 'tenant-1', runId: '550e8400-e29b-41d4-a716-446655440000' },
      ]);
      const generator = new LocalSignedUrlGenerator({
        mode: 'mock',
        tenantValidator: validator,
      });

      const requests = [
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'triage.json' }) }),
        createAccessRequest({ artifact: createArtifactRef({ artifactName: 'plan.json' }) }),
      ];

      await expect(generator.generateSignedUrlBatch(requests)).rejects.toThrow(TenantAccessDeniedError);
    });
  });

  describe('result structure', () => {
    it('should return complete SignedUrlResult', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const request = createAccessRequest();

      const result = await generator.generateSignedUrl(request);

      expect(result).toMatchObject({
        url: expect.any(String),
        expiresAt: expect.any(String),
        artifact: {
          tenantId: 'tenant-1',
          repoId: 'repo-1',
          runId: '550e8400-e29b-41d4-a716-446655440000',
          artifactName: 'triage.json',
        },
        action: 'read',
        backend: 'local',
        auditEventId: expect.any(String),
      });
    });

    it('should include artifact reference in result', async () => {
      const generator = new LocalSignedUrlGenerator({ mode: 'mock' });
      const artifact = createArtifactRef({ artifactName: 'custom.json' });
      const request = createAccessRequest({ artifact });

      const result = await generator.generateSignedUrl(request);

      expect(result.artifact).toEqual(artifact);
    });
  });
});
