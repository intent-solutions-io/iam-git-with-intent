import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConnectorRegistry,
  InMemoryTenantConfigStore,
  type ConnectorFactory
} from '../connector-registry.js';
import { BaseConnector, ConsoleLogger, NoOpMetrics } from '../../core/base-connector.js';
import type {
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from '../../interfaces/types.js';
import { ConnectorConfigSchema } from '../../interfaces/types.js';

class TestConnector extends BaseConnector {
  readonly name = 'test';
  readonly version = '1.0.0';
  readonly configSchema = ConnectorConfigSchema;

  constructor(
    private config: ConnectorConfig,
    logger?: any,
    metrics?: any
  ) {
    super(logger, metrics);
  }

  async authenticate(_config: ConnectorConfig): Promise<AuthResult> {
    return { success: true, token: 'test-token' };
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks: [
        { name: 'api_reachable', status: 'pass', durationMs: 50 }
      ]
    };
  }

  async *sync(_options: SyncOptions): AsyncIterator<ConnectorRecord> {
    yield {
      id: '1',
      type: 'test',
      source: this.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: { test: true }
    };
  }

  async processWebhook(_event: WebhookEvent): Promise<WebhookResult> {
    return {
      success: true,
      durationMs: 100
    };
  }

  getMetadata(): ConnectorMetadata {
    return {
      name: this.name,
      version: this.version,
      recordTypes: ['test'],
      authMethods: ['bearer'],
      supportsIncremental: false,
      supportsWebhooks: false,
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerHour: 1000
      },
      capabilities: ['sync']
    };
  }
}

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;
  let tenantStore: InMemoryTenantConfigStore;

  beforeEach(() => {
    tenantStore = new InMemoryTenantConfigStore();
    registry = new ConnectorRegistry(
      tenantStore,
      new ConsoleLogger(),
      new NoOpMetrics()
    );
  });

  describe('register', () => {
    it('should register a connector', () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);

      registry.register('test', factory);

      expect(registry.has('test')).toBe(true);
      expect(registry.list()).toContain('test');
    });

    it('should throw if connector already registered', () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);

      registry.register('test', factory);

      expect(() => registry.register('test', factory)).toThrow(
        'Connector test already registered'
      );
    });
  });

  describe('unregister', () => {
    it('should unregister a connector', () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);

      registry.register('test', factory);
      expect(registry.has('test')).toBe(true);

      registry.unregister('test');
      expect(registry.has('test')).toBe(false);
    });
  });

  describe('get', () => {
    it('should create and cache connector instance', async () => {
      const factorySpy = vi.fn((config: ConnectorConfig) => new TestConnector(config));

      registry.register('test', factorySpy);

      const connector1 = await registry.get('test', {
        skipHealthCheck: true,
        config: {
          tenantId: 'tenant-123',
          auth: { type: 'bearer', token: 'test' }
        }
      });

      const connector2 = await registry.get('test', {
        skipHealthCheck: true,
        config: {
          tenantId: 'tenant-123',
          auth: { type: 'bearer', token: 'test' }
        }
      });

      expect(connector1).toBe(connector2);
      expect(factorySpy).toHaveBeenCalledTimes(1);
    });

    it('should throw if connector not registered', async () => {
      await expect(
        registry.get('nonexistent')
      ).rejects.toThrow('Connector nonexistent not registered');
    });

    it('should load tenant-specific config', async () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);
      registry.register('test', factory);

      await tenantStore.setConfig('tenant-123', 'test', {
        tenantId: 'tenant-123',
        auth: { type: 'bearer', token: 'tenant-token' }
      });

      const connector = await registry.get('test', {
        tenantId: 'tenant-123',
        skipHealthCheck: true
      });

      expect(connector).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should perform health check', async () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);
      registry.register('test', factory);

      const status = await registry.healthCheck('test', {
        skipHealthCheck: true,
        config: {
          tenantId: 'tenant-123',
          auth: { type: 'bearer', token: 'test' }
        }
      });

      expect(status.healthy).toBe(true);
      expect(status.connector).toBe('test');
      expect(status.checks.length).toBeGreaterThan(0);
    });

    it('should cache health check results', async () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);
      registry.register('test', factory);

      const healthCheckSpy = vi.spyOn(TestConnector.prototype, 'healthCheck');

      await registry.healthCheck('test', {
        skipHealthCheck: true,
        config: {
          tenantId: 'tenant-123',
          auth: { type: 'bearer', token: 'test' }
        }
      });

      await registry.healthCheck('test', {
        skipHealthCheck: true,
        config: {
          tenantId: 'tenant-123',
          auth: { type: 'bearer', token: 'test' }
        }
      });

      expect(healthCheckSpy).toHaveBeenCalledTimes(1);

      healthCheckSpy.mockRestore();
    });
  });

  describe('healthCheckAll', () => {
    it('should health check all connectors', async () => {
      const factory1: ConnectorFactory = (config) => new TestConnector(config);
      const factory2: ConnectorFactory = (config) => new TestConnector(config);

      registry.register('test1', factory1);
      registry.register('test2', factory2);

      const health = await registry.healthCheckAll();

      expect(health.size).toBe(2);
      expect(health.has('test1')).toBe(true);
      expect(health.has('test2')).toBe(true);
    });
  });

  describe('getHealthy', () => {
    it('should return only healthy connectors', async () => {
      const healthyFactory: ConnectorFactory = (config) => new TestConnector(config);

      class UnhealthyConnector extends TestConnector {
        async healthCheck(): Promise<HealthStatus> {
          return {
            healthy: false,
            timestamp: new Date().toISOString(),
            connector: 'unhealthy',
            checks: [],
            error: 'Unhealthy'
          };
        }
      }

      const unhealthyFactory: ConnectorFactory = (config) => new UnhealthyConnector(config);

      registry.register('healthy', healthyFactory);
      registry.register('unhealthy', unhealthyFactory);

      const healthy = await registry.getHealthy();

      expect(healthy).toContain('healthy');
      expect(healthy).not.toContain('unhealthy');
    });
  });

  describe('getMetadata', () => {
    it('should return connector metadata', async () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);
      registry.register('test', factory);

      const metadata = await registry.getMetadata('test');

      expect(metadata.name).toBe('test');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.recordTypes).toEqual(['test']);
    });

    it('should cache metadata', async () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);
      registry.register('test', factory);

      const metadata1 = await registry.getMetadata('test');
      const metadata2 = await registry.getMetadata('test');

      expect(metadata1).toBe(metadata2);
    });
  });

  describe('isCompatible', () => {
    it('should check version compatibility', async () => {
      const factory: ConnectorFactory = (config) => new TestConnector(config);
      registry.register('test', factory);

      const compatible = await registry.isCompatible('test');

      expect(typeof compatible).toBe('boolean');
    });
  });
});

describe('InMemoryTenantConfigStore', () => {
  let store: InMemoryTenantConfigStore;

  beforeEach(() => {
    store = new InMemoryTenantConfigStore();
  });

  describe('setConfig / getConfig', () => {
    it('should store and retrieve config', async () => {
      const config: ConnectorConfig = {
        tenantId: 'tenant-123',
        auth: { type: 'bearer', token: 'test' }
      };

      await store.setConfig('tenant-123', 'github', config);

      const retrieved = await store.getConfig('tenant-123', 'github');

      expect(retrieved).toEqual(config);
    });

    it('should throw if config not found', async () => {
      await expect(
        store.getConfig('tenant-123', 'github')
      ).rejects.toThrow('No configurations for tenant tenant-123');
    });
  });

  describe('deleteConfig', () => {
    it('should delete config', async () => {
      const config: ConnectorConfig = {
        tenantId: 'tenant-123',
        auth: { type: 'bearer', token: 'test' }
      };

      await store.setConfig('tenant-123', 'github', config);
      await store.deleteConfig('tenant-123', 'github');

      await expect(
        store.getConfig('tenant-123', 'github')
      ).rejects.toThrow();
    });
  });

  describe('listConnectors', () => {
    it('should list connectors for tenant', async () => {
      const config: ConnectorConfig = {
        tenantId: 'tenant-123',
        auth: { type: 'bearer', token: 'test' }
      };

      await store.setConfig('tenant-123', 'github', config);
      await store.setConfig('tenant-123', 'gitlab', config);

      const connectors = await store.listConnectors('tenant-123');

      expect(connectors).toContain('github');
      expect(connectors).toContain('gitlab');
      expect(connectors.length).toBe(2);
    });

    it('should return empty array for tenant with no configs', async () => {
      const connectors = await store.listConnectors('tenant-999');

      expect(connectors).toEqual([]);
    });
  });
});
