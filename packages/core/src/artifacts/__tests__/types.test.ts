/**
 * Tests for artifact access types and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  SignedUrlConfigSchema,
  ArtifactReferenceSchema,
  ArtifactAccessRequestSchema,
  SignedUrlResultSchema,
  ArtifactAccessAuditEventSchema,
  ArtifactAccessError,
  TenantAccessDeniedError,
  ArtifactNotFoundError,
  InvalidConfigurationError,
} from '../types.js';

describe('Artifact Access Types', () => {
  describe('SignedUrlConfigSchema', () => {
    it('should accept valid config', () => {
      const config = {
        expiryMinutes: 15,
        bucketName: 'my-bucket',
        projectId: 'my-project',
      };

      const result = SignedUrlConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it('should use default expiry', () => {
      const config = {};

      const result = SignedUrlConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiryMinutes).toBe(15);
      }
    });

    it('should reject expiry < 1', () => {
      const config = { expiryMinutes: 0 };

      const result = SignedUrlConfigSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should reject expiry > 1440', () => {
      const config = { expiryMinutes: 1441 };

      const result = SignedUrlConfigSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const config = {
        expiryMinutes: 30,
      };

      const result = SignedUrlConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
    });
  });

  describe('ArtifactReferenceSchema', () => {
    it('should accept valid artifact reference', () => {
      const ref = {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        runId: '550e8400-e29b-41d4-a716-446655440000',
        artifactName: 'triage.json',
      };

      const result = ArtifactReferenceSchema.safeParse(ref);

      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const ref = {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        runId: 'not-a-uuid',
        artifactName: 'triage.json',
      };

      const result = ArtifactReferenceSchema.safeParse(ref);

      expect(result.success).toBe(false);
    });

    it('should reject empty strings', () => {
      const ref = {
        tenantId: '',
        repoId: 'repo-1',
        runId: '550e8400-e29b-41d4-a716-446655440000',
        artifactName: 'triage.json',
      };

      const result = ArtifactReferenceSchema.safeParse(ref);

      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const ref = {
        tenantId: 'tenant-1',
        repoId: 'repo-1',
      };

      const result = ArtifactReferenceSchema.safeParse(ref);

      expect(result.success).toBe(false);
    });
  });

  describe('ArtifactAccessRequestSchema', () => {
    const validArtifact = {
      tenantId: 'tenant-1',
      repoId: 'repo-1',
      runId: '550e8400-e29b-41d4-a716-446655440000',
      artifactName: 'triage.json',
    };

    it('should accept valid request', () => {
      const request = {
        artifact: validArtifact,
        action: 'read' as const,
        userId: 'user-1',
        source: 'ui',
      };

      const result = ArtifactAccessRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
    });

    it('should default action to read', () => {
      const request = {
        artifact: validArtifact,
      };

      const result = ArtifactAccessRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('read');
      }
    });

    it('should accept write action', () => {
      const request = {
        artifact: validArtifact,
        action: 'write' as const,
      };

      const result = ArtifactAccessRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe('write');
      }
    });

    it('should accept optional fields', () => {
      const request = {
        artifact: validArtifact,
        action: 'read' as const,
        expiryMinutes: 30,
      };

      const result = ArtifactAccessRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiryMinutes).toBe(30);
      }
    });

    it('should reject invalid action', () => {
      const request = {
        artifact: validArtifact,
        action: 'delete',
      };

      const result = ArtifactAccessRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
    });
  });

  describe('SignedUrlResultSchema', () => {
    const validArtifact = {
      tenantId: 'tenant-1',
      repoId: 'repo-1',
      runId: '550e8400-e29b-41d4-a716-446655440000',
      artifactName: 'triage.json',
    };

    it('should accept valid result', () => {
      const result = {
        url: 'https://storage.googleapis.com/bucket/path',
        expiresAt: new Date().toISOString(),
        artifact: validArtifact,
        action: 'read' as const,
        backend: 'gcs' as const,
        auditEventId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const parseResult = SignedUrlResultSchema.safeParse(result);

      expect(parseResult.success).toBe(true);
    });

    it('should accept local backend', () => {
      const result = {
        url: 'file://.gwi/runs/path',
        expiresAt: new Date().toISOString(),
        artifact: validArtifact,
        action: 'read' as const,
        backend: 'local' as const,
      };

      const parseResult = SignedUrlResultSchema.safeParse(result);

      expect(parseResult.success).toBe(true);
    });

    it('should accept mock backend', () => {
      const result = {
        url: 'mock://path',
        expiresAt: new Date().toISOString(),
        artifact: validArtifact,
        action: 'read' as const,
        backend: 'mock' as const,
      };

      const parseResult = SignedUrlResultSchema.safeParse(result);

      expect(parseResult.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = {
        url: 'not-a-url',
        expiresAt: new Date().toISOString(),
        artifact: validArtifact,
        action: 'read' as const,
        backend: 'gcs' as const,
      };

      const parseResult = SignedUrlResultSchema.safeParse(result);

      expect(parseResult.success).toBe(false);
    });

    it('should reject invalid backend', () => {
      const result = {
        url: 'https://example.com',
        expiresAt: new Date().toISOString(),
        artifact: validArtifact,
        action: 'read' as const,
        backend: 's3',
      };

      const parseResult = SignedUrlResultSchema.safeParse(result);

      expect(parseResult.success).toBe(false);
    });
  });

  describe('ArtifactAccessAuditEventSchema', () => {
    it('should accept valid audit event', () => {
      const event = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp: new Date().toISOString(),
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        runId: '550e8400-e29b-41d4-a716-446655440000',
        artifactName: 'triage.json',
        action: 'read' as const,
        userId: 'user-1',
        source: 'ui',
        expiresAt: new Date().toISOString(),
        tenantValidated: true,
        metadata: {
          custom: 'value',
        },
      };

      const result = ArtifactAccessAuditEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });

    it('should accept minimal audit event', () => {
      const event = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp: new Date().toISOString(),
        tenantId: 'tenant-1',
        repoId: 'repo-1',
        runId: '550e8400-e29b-41d4-a716-446655440000',
        artifactName: 'triage.json',
        action: 'read' as const,
        expiresAt: new Date().toISOString(),
        tenantValidated: true,
      };

      const result = ArtifactAccessAuditEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });
  });

  describe('Error Classes', () => {
    describe('ArtifactAccessError', () => {
      it('should create error with code', () => {
        const error = new ArtifactAccessError('Test error', 'TEST_CODE');

        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_CODE');
        expect(error.name).toBe('ArtifactAccessError');
      });

      it('should include artifact reference', () => {
        const artifact = {
          tenantId: 'tenant-1',
          repoId: 'repo-1',
          runId: '550e8400-e29b-41d4-a716-446655440000',
          artifactName: 'triage.json',
        };
        const error = new ArtifactAccessError('Test error', 'TEST_CODE', artifact);

        expect(error.artifact).toEqual(artifact);
      });
    });

    describe('TenantAccessDeniedError', () => {
      it('should create error with correct code', () => {
        const error = new TenantAccessDeniedError('Access denied');

        expect(error.message).toBe('Access denied');
        expect(error.code).toBe('TENANT_ACCESS_DENIED');
        expect(error.name).toBe('TenantAccessDeniedError');
      });

      it('should be instanceof ArtifactAccessError', () => {
        const error = new TenantAccessDeniedError('Access denied');

        expect(error).toBeInstanceOf(ArtifactAccessError);
      });
    });

    describe('ArtifactNotFoundError', () => {
      it('should create error with correct code', () => {
        const error = new ArtifactNotFoundError('Not found');

        expect(error.message).toBe('Not found');
        expect(error.code).toBe('ARTIFACT_NOT_FOUND');
        expect(error.name).toBe('ArtifactNotFoundError');
      });

      it('should be instanceof ArtifactAccessError', () => {
        const error = new ArtifactNotFoundError('Not found');

        expect(error).toBeInstanceOf(ArtifactAccessError);
      });
    });

    describe('InvalidConfigurationError', () => {
      it('should create error with correct code', () => {
        const error = new InvalidConfigurationError('Invalid config');

        expect(error.message).toBe('Invalid config');
        expect(error.code).toBe('INVALID_CONFIGURATION');
        expect(error.name).toBe('InvalidConfigurationError');
      });

      it('should be instanceof ArtifactAccessError', () => {
        const error = new InvalidConfigurationError('Invalid config');

        expect(error).toBeInstanceOf(ArtifactAccessError);
      });
    });
  });
});
