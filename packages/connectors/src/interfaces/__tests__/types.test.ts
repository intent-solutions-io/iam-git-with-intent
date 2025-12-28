import { describe, it, expect } from 'vitest';
import {
  ConnectorConfigSchema,
  AuthResultSchema,
  HealthStatusSchema,
  SyncOptionsSchema,
  ConnectorRecordSchema,
  WebhookEventSchema,
  WebhookResultSchema,
  ConnectorMetadataSchema
} from '../types.js';

describe('Type Schemas', () => {
  describe('ConnectorConfigSchema', () => {
    it('should validate bearer auth config', () => {
      const config = {
        tenantId: 'tenant-123',
        auth: {
          type: 'bearer',
          token: 'abc123'
        }
      };

      expect(() => ConnectorConfigSchema.parse(config)).not.toThrow();
    });

    it('should validate oauth2 auth config', () => {
      const config = {
        tenantId: 'tenant-123',
        auth: {
          type: 'oauth2',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback'
        }
      };

      expect(() => ConnectorConfigSchema.parse(config)).not.toThrow();
    });

    it('should validate service account auth config', () => {
      const config = {
        tenantId: 'tenant-123',
        auth: {
          type: 'service_account',
          serviceAccountEmail: 'test@example.com',
          privateKey: 'private-key',
          projectId: 'project-id'
        }
      };

      expect(() => ConnectorConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject invalid config', () => {
      const config = {
        tenantId: '',
        auth: { type: 'invalid' }
      };

      expect(() => ConnectorConfigSchema.parse(config)).toThrow();
    });
  });

  describe('AuthResultSchema', () => {
    it('should validate successful auth result', () => {
      const result = {
        success: true,
        token: 'abc123',
        expiresAt: new Date().toISOString()
      };

      expect(() => AuthResultSchema.parse(result)).not.toThrow();
    });

    it('should validate failed auth result', () => {
      const result = {
        success: false,
        error: 'Authentication failed'
      };

      expect(() => AuthResultSchema.parse(result)).not.toThrow();
    });
  });

  describe('HealthStatusSchema', () => {
    it('should validate healthy status', () => {
      const status = {
        healthy: true,
        timestamp: new Date().toISOString(),
        connector: 'github',
        checks: [
          {
            name: 'api_reachable',
            status: 'pass' as const,
            durationMs: 100
          }
        ]
      };

      expect(() => HealthStatusSchema.parse(status)).not.toThrow();
    });

    it('should validate unhealthy status', () => {
      const status = {
        healthy: false,
        timestamp: new Date().toISOString(),
        connector: 'github',
        checks: [],
        error: 'Connection failed'
      };

      expect(() => HealthStatusSchema.parse(status)).not.toThrow();
    });
  });

  describe('SyncOptionsSchema', () => {
    it('should validate sync options with incremental', () => {
      const options = {
        incremental: {
          cursorField: 'updated_at',
          startCursor: '2025-01-01T00:00:00Z'
        }
      };

      expect(() => SyncOptionsSchema.parse(options)).not.toThrow();
    });

    it('should validate sync options with resources', () => {
      const options = {
        resources: [
          { type: 'repository', id: 'owner/repo' }
        ],
        types: ['pull_request']
      };

      expect(() => SyncOptionsSchema.parse(options)).not.toThrow();
    });
  });

  describe('ConnectorRecordSchema', () => {
    it('should validate connector record', () => {
      const record = {
        id: '1',
        type: 'pull_request',
        source: 'github',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: { number: 1, title: 'Test PR' }
      };

      expect(() => ConnectorRecordSchema.parse(record)).not.toThrow();
    });
  });

  describe('WebhookEventSchema', () => {
    it('should validate webhook event', () => {
      const event = {
        id: 'event-123',
        source: 'github',
        type: 'pull_request.opened',
        timestamp: new Date().toISOString(),
        payload: { action: 'opened' },
        signature: 'sha256=abc123',
        headers: { 'x-github-event': 'pull_request' }
      };

      expect(() => WebhookEventSchema.parse(event)).not.toThrow();
    });
  });

  describe('WebhookResultSchema', () => {
    it('should validate webhook result', () => {
      const result = {
        success: true,
        durationMs: 100,
        recordsProcessed: 1
      };

      expect(() => WebhookResultSchema.parse(result)).not.toThrow();
    });
  });

  describe('ConnectorMetadataSchema', () => {
    it('should validate connector metadata', () => {
      const metadata = {
        name: 'github',
        version: '1.0.0',
        recordTypes: ['pull_request', 'issue'],
        authMethods: ['bearer' as const, 'oauth2' as const],
        supportsIncremental: true,
        supportsWebhooks: true,
        rateLimits: {
          requestsPerSecond: 10,
          requestsPerHour: 1000
        },
        capabilities: ['sync', 'webhooks']
      };

      expect(() => ConnectorMetadataSchema.parse(metadata)).not.toThrow();
    });
  });
});
