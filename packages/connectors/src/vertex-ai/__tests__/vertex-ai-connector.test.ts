import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VertexAIConnector } from '../vertex-ai-connector.js';
import { VERTEX_AI_CONNECTOR_METADATA } from '../types.js';
import type { SyncOptions, WebhookEvent } from '../../interfaces/types.js';
import { ConsoleLogger, NoOpMetrics } from '../../core/base-connector.js';

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({
    getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token-123' })
  })),
  JWT: vi.fn().mockImplementation(() => ({
    getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token-123' })
  })),
  OAuth2Client: vi.fn().mockImplementation(() => ({
    setCredentials: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token-123' })
  }))
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({
        data: {
          models: [],
          endpoints: [],
          nextPageToken: null
        }
      }),
      post: vi.fn().mockResolvedValue({
        data: {
          predictions: [],
          deployedModelId: 'deployed-123'
        }
      }),
      interceptors: {
        response: {
          use: vi.fn()
        }
      }
    })
  }
}));

// TODO(gwi-64f): Vitest 4 mock constructor pattern broken — re-enable after mock migration
describe.skip('VertexAIConnector', () => {
  let connector: VertexAIConnector;
  let logger: ConsoleLogger;
  let metrics: NoOpMetrics;

  beforeEach(() => {
    logger = new ConsoleLogger({ test: true });
    metrics = new NoOpMetrics();
    connector = new VertexAIConnector(logger, metrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should return correct connector name', () => {
      expect(connector.name).toBe('vertex-ai');
    });

    it('should return correct version', () => {
      expect(connector.version).toBe('1.0.0');
    });

    it('should return full metadata', () => {
      const metadata = connector.getMetadata();
      expect(metadata.name).toBe('vertex-ai');
      expect(metadata.recordTypes).toContain('prediction');
      expect(metadata.recordTypes).toContain('embedding');
      expect(metadata.recordTypes).toContain('model');
      expect(metadata.recordTypes).toContain('endpoint');
      expect(metadata.authMethods).toContain('service_account');
      expect(metadata.authMethods).toContain('oauth2');
      expect(metadata.supportsWebhooks).toBe(true);
      expect(metadata.supportsIncremental).toBe(true);
      expect(metadata.capabilities).toContain('predict');
      expect(metadata.capabilities).toContain('embed');
      expect(metadata.capabilities).toContain('stream_predict');
    });
  });

  describe('authenticate', () => {
    it('should authenticate with service account', async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'service_account' as const,
          serviceAccountEmail: 'test@test-project.iam.gserviceaccount.com',
          privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
          projectId: 'test-project'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.token).toBe('test-token-123');
      expect(result.metadata?.projectId).toBe('test-project');
      expect(result.metadata?.location).toBe('us-central1');
      expect(result.metadata?.authType).toBe('service_account');
    });

    it('should authenticate with OAuth2', async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'oauth2' as const,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback',
          accessToken: 'access-token-123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.authType).toBe('oauth2');
    });

    it('should authenticate with ADC', async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.authType).toBe('adc');
    });

    it('should throw on invalid configuration', async () => {
      const config = {
        tenantId: '',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'service_account' as const,
          serviceAccountEmail: 'invalid-email',
          privateKey: '',
          projectId: 'test-project'
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      await connector.authenticate(config);

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('vertex-ai');
      expect(health.checks).toHaveLength(3);
      expect(health.checks[0].name).toBe('api_connectivity');
      expect(health.checks[1].name).toBe('authentication');
      expect(health.checks[2].name).toBe('project_access');
    });

    it('should return unhealthy status when not authenticated', async () => {
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks.some(c => c.status === 'fail')).toBe(true);
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      await connector.authenticate(config);
    });

    it('should sync models by default', async () => {
      const options: SyncOptions = {};
      const records: any[] = [];

      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      // Empty in mock, but should not throw
      expect(records).toBeDefined();
    });

    it('should sync endpoints when requested', async () => {
      const options: SyncOptions = {
        types: ['endpoint']
      };

      const records: any[] = [];

      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records).toBeDefined();
    });

    it('should respect limit option', async () => {
      const options: SyncOptions = {
        limit: 5
      };

      const records: any[] = [];

      for await (const record of connector.sync(options)) {
        records.push(record);
      }

      expect(records.length).toBeLessThanOrEqual(5);
    });

    it('should throw when not authenticated', async () => {
      const unauthConnector = new VertexAIConnector();
      const options: SyncOptions = {};

      await expect(async () => {
        for await (const _ of unauthConnector.sync(options)) {
          // Should not reach here
        }
      }).rejects.toThrow('Not authenticated');
    });
  });

  describe('predict', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      await connector.authenticate(config);
    });

    it('should make predictions', async () => {
      const request = {
        endpoint: 'projects/test-project/locations/us-central1/endpoints/123',
        instances: [
          { prompt: 'Hello, world!' }
        ]
      };

      const response = await connector.predict(request);

      expect(response).toBeDefined();
      expect(response.predictions).toBeDefined();
    });

    it('should throw when not authenticated', async () => {
      const unauthConnector = new VertexAIConnector();

      const request = {
        endpoint: 'projects/test-project/locations/us-central1/endpoints/123',
        instances: [{ prompt: 'Test' }]
      };

      await expect(unauthConnector.predict(request)).rejects.toThrow('Not authenticated');
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      await connector.authenticate(config);
    });

    it('should generate embeddings', async () => {
      const request = {
        model: 'text-embedding-004',
        instances: [
          { content: 'Hello, world!' }
        ]
      };

      const response = await connector.embed(request);

      expect(response).toBeDefined();
      expect(response.predictions).toBeDefined();
    });

    it('should validate embedding request', async () => {
      const request = {
        model: '',
        instances: []
      };

      await expect(connector.embed(request)).rejects.toThrow();
    });
  });

  describe('processWebhook', () => {
    it('should process model.created webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-123',
        source: 'vertex-ai',
        type: 'model.created',
        timestamp: new Date().toISOString(),
        payload: {
          eventType: 'model.created',
          timestamp: new Date().toISOString(),
          resourceName: 'projects/test/locations/us-central1/models/123',
          resourceType: 'model',
          projectId: 'test-project',
          location: 'us-central1',
          model: {
            name: 'projects/test/locations/us-central1/models/123',
            displayName: 'Test Model',
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString()
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.eventType).toBe('model.created');
    });

    it('should process endpoint.updated webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-456',
        source: 'vertex-ai',
        type: 'endpoint.updated',
        timestamp: new Date().toISOString(),
        payload: {
          eventType: 'endpoint.updated',
          timestamp: new Date().toISOString(),
          resourceName: 'projects/test/locations/us-central1/endpoints/123',
          resourceType: 'endpoint',
          projectId: 'test-project',
          location: 'us-central1',
          endpoint: {
            name: 'projects/test/locations/us-central1/endpoints/123',
            displayName: 'Test Endpoint',
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString()
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });

    it('should handle batch_prediction.completed webhook', async () => {
      const event: WebhookEvent = {
        id: 'webhook-789',
        source: 'vertex-ai',
        type: 'batch_prediction.completed',
        timestamp: new Date().toISOString(),
        payload: {
          eventType: 'batch_prediction.completed',
          timestamp: new Date().toISOString(),
          resourceName: 'projects/test/locations/us-central1/batchPredictionJobs/123',
          resourceType: 'batchPredictionJob',
          projectId: 'test-project',
          location: 'us-central1',
          batchPrediction: {
            name: 'projects/test/locations/us-central1/batchPredictionJobs/123',
            displayName: 'Test Batch Job',
            model: 'projects/test/locations/us-central1/models/123',
            inputConfig: {
              instancesFormat: 'jsonl',
              gcsSource: { uris: ['gs://bucket/input.jsonl'] }
            },
            outputConfig: {
              predictionsFormat: 'jsonl',
              gcsDestination: { outputUriPrefix: 'gs://bucket/output/' }
            },
            state: 'JOB_STATE_SUCCEEDED',
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString()
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });

    it('should return success false on error', async () => {
      const event: WebhookEvent = {
        id: 'webhook-error',
        source: 'vertex-ai',
        type: 'unknown',
        timestamp: new Date().toISOString(),
        payload: null as any, // Invalid payload
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getModel', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      await connector.authenticate(config);
    });

    it('should throw when not authenticated', async () => {
      const unauthConnector = new VertexAIConnector();

      await expect(
        unauthConnector.getModel('projects/test/locations/us-central1/models/123')
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('listEndpoints', () => {
    beforeEach(async () => {
      const config = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        location: 'us-central1',
        auth: {
          type: 'adc' as const,
          projectId: 'test-project'
        }
      };

      await connector.authenticate(config);
    });

    it('should list endpoints', async () => {
      const endpoints = await connector.listEndpoints();

      expect(endpoints).toBeDefined();
      expect(Array.isArray(endpoints)).toBe(true);
    });

    it('should throw when not authenticated', async () => {
      const unauthConnector = new VertexAIConnector();

      await expect(unauthConnector.listEndpoints()).rejects.toThrow('Not authenticated');
    });
  });
});
