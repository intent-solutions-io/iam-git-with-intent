/**
 * Health Check Utilities Tests
 *
 * B5: Add health check endpoints to all Cloud Run services
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ServiceHealthManager,
  createHealthRouter,
  createFirestoreCheck,
  createPubSubCheck,
  createPingCheck,
  getHealthManager,
  resetHealthManager,
  type ServiceHealthConfig,
  type HealthCheckFn,
} from '../index.js';

describe('ServiceHealthManager', () => {
  const baseConfig: ServiceHealthConfig = {
    serviceName: 'test-service',
    version: '1.0.0',
    env: 'test',
  };

  let manager: ServiceHealthManager;

  beforeEach(() => {
    manager = new ServiceHealthManager(baseConfig);
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('getLiveness', () => {
    it('should return healthy status', () => {
      const response = manager.getLiveness();

      expect(response.status).toBe('healthy');
      expect(response.service).toBe('test-service');
      expect(response.version).toBe('1.0.0');
      expect(response.env).toBe('test');
      expect(response.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(response.timestamp).toBeDefined();
    });

    it('should include metadata when provided', () => {
      const configWithMeta: ServiceHealthConfig = {
        ...baseConfig,
        metadata: { region: 'us-central1', instance: 'abc123' },
      };
      const managerWithMeta = new ServiceHealthManager(configWithMeta);

      const response = managerWithMeta.getLiveness();

      expect(response.metadata).toEqual({ region: 'us-central1', instance: 'abc123' });
      managerWithMeta.cleanup();
    });
  });

  describe('getReadiness', () => {
    it('should return healthy status with default components', async () => {
      const response = await manager.getReadiness();

      expect(response.status).toBe('healthy');
      // SystemHealthInfoService provides default components
      expect(response.components.length).toBeGreaterThan(0);
      expect(response.service).toBe('test-service');
    });

    it('should include custom storage check when configured', async () => {
      const storageCheck: HealthCheckFn = async () => ({
        healthy: true,
        message: 'Firestore connected',
        details: { latencyMs: 10 },
      });

      const configWithStorage: ServiceHealthConfig = {
        ...baseConfig,
        checks: { storage: storageCheck },
      };
      const managerWithStorage = new ServiceHealthManager(configWithStorage);

      const response = await managerWithStorage.getReadiness();

      // Should have default components plus our custom storage check
      const storageComponent = response.components.find(c => c.name === 'storage');
      expect(storageComponent).toBeDefined();
      expect(storageComponent?.status).toBe('healthy');
      managerWithStorage.cleanup();
    });

    it('should include queue check when configured', async () => {
      const queueCheck: HealthCheckFn = async () => ({
        healthy: true,
        message: 'Pub/Sub connected',
      });

      const configWithQueue: ServiceHealthConfig = {
        ...baseConfig,
        checks: { queue: queueCheck },
      };
      const managerWithQueue = new ServiceHealthManager(configWithQueue);

      const response = await managerWithQueue.getReadiness();

      const queueComponent = response.components.find(c => c.name === 'queue');
      expect(queueComponent).toBeDefined();
      expect(queueComponent?.status).toBe('healthy');
      managerWithQueue.cleanup();
    });
  });

  describe('getDeepHealth', () => {
    it('should include system metrics', async () => {
      const response = await manager.getDeepHealth();

      expect(response.metrics).toBeDefined();
      expect(response.metrics?.memoryUsageMB).toBeGreaterThan(0);
      expect(response.metrics?.heapUsedMB).toBeGreaterThan(0);
      expect(typeof response.metrics?.activeHandles).toBe('number');
    });

    it('should include DLQ metrics when provided', async () => {
      const dlqMetrics = {
        poisonCount: 5,
        dlqRoutedCount: 10,
        transientErrorCount: 100,
        permanentErrorCount: 3,
      };

      const response = await manager.getDeepHealth(dlqMetrics);

      expect(response.dlq).toEqual(dlqMetrics);
    });

    it('should include recovery status when provided', async () => {
      const recoveryStatus = {
        interruptedRuns: 2,
        lastRecoveryAt: new Date('2025-01-01T00:00:00Z'),
      };

      const response = await manager.getDeepHealth(undefined, recoveryStatus);

      expect(response.recovery).toBeDefined();
      expect(response.recovery?.interruptedRuns).toBe(2);
      expect(response.recovery?.lastRecoveryAt).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('recordRecovery', () => {
    it('should record recovery stats', () => {
      manager.recordRecovery(5);

      const stats = manager.getRecoveryStats();
      expect(stats.interruptedRuns).toBe(5);
      expect(stats.lastRecoveryAt).toBeInstanceOf(Date);
    });
  });
});

describe('Health Check Utilities', () => {
  describe('createFirestoreCheck', () => {
    it('should return unhealthy when Firestore is null', async () => {
      const check = createFirestoreCheck(() => null);
      const result = await check();

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Firestore not initialized');
    });

    it('should return healthy when Firestore responds', async () => {
      const mockFirestore = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({}),
          }),
        }),
      };

      const check = createFirestoreCheck(() => mockFirestore as unknown as FirebaseFirestore.Firestore);
      const result = await check();

      expect(result.healthy).toBe(true);
      expect(result.message).toBe('Firestore connected');
      expect(result.details?.latencyMs).toBeDefined();
    });

    it('should return unhealthy on error', async () => {
      const mockFirestore = {
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockRejectedValue(new Error('Connection failed')),
          }),
        }),
      };

      const check = createFirestoreCheck(() => mockFirestore as unknown as FirebaseFirestore.Firestore);
      const result = await check();

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Connection failed');
    });
  });

  describe('createPubSubCheck', () => {
    it('should return healthy when all topics are healthy', async () => {
      const getTopicStatus = async () => ({
        'worker-jobs': true,
        'run-lifecycle': true,
      });

      const check = createPubSubCheck(getTopicStatus);
      const result = await check();

      expect(result.healthy).toBe(true);
      expect(result.message).toBe('All Pub/Sub topics healthy');
    });

    it('should return unhealthy when some topics are unhealthy', async () => {
      const getTopicStatus = async () => ({
        'worker-jobs': true,
        'run-lifecycle': false,
      });

      const check = createPubSubCheck(getTopicStatus);
      const result = await check();

      expect(result.healthy).toBe(false);
      expect(result.message).toContain('run-lifecycle');
    });
  });

  describe('createPingCheck', () => {
    it('should return healthy on successful ping', async () => {
      const pingFn = async () => true;

      const check = createPingCheck(pingFn);
      const result = await check();

      expect(result.healthy).toBe(true);
      expect(result.message).toBe('Ping successful');
      expect(result.details?.latencyMs).toBeDefined();
    });

    it('should return unhealthy on failed ping', async () => {
      const pingFn = async () => false;

      const check = createPingCheck(pingFn);
      const result = await check();

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Ping failed');
    });

    it('should return unhealthy on error', async () => {
      const pingFn = async () => {
        throw new Error('Network error');
      };

      const check = createPingCheck(pingFn);
      const result = await check();

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Network error');
    });
  });
});

describe('createHealthRouter', () => {
  const config: ServiceHealthConfig = {
    serviceName: 'api',
    version: '1.0.0',
    env: 'dev',
  };

  it('should create router with health endpoints', () => {
    const router = createHealthRouter(config);

    expect(router).toBeDefined();
    // Router should have routes defined
    expect(router.stack.length).toBeGreaterThan(0);
  });

  it('should attach healthManager to router', () => {
    const router = createHealthRouter(config);

    expect((router as { healthManager: ServiceHealthManager }).healthManager).toBeInstanceOf(ServiceHealthManager);
  });
});

describe('Singleton Manager', () => {
  beforeEach(() => {
    resetHealthManager();
  });

  afterEach(() => {
    resetHealthManager();
  });

  it('should throw when getting manager without config', () => {
    expect(() => getHealthManager()).toThrow('Health manager not initialized');
  });

  it('should create manager with config', () => {
    const config: ServiceHealthConfig = {
      serviceName: 'test',
      version: '1.0.0',
      env: 'test',
    };

    const manager = getHealthManager(config);
    expect(manager).toBeInstanceOf(ServiceHealthManager);
  });

  it('should return same instance on subsequent calls', () => {
    const config: ServiceHealthConfig = {
      serviceName: 'test',
      version: '1.0.0',
      env: 'test',
    };

    const manager1 = getHealthManager(config);
    const manager2 = getHealthManager();

    expect(manager1).toBe(manager2);
  });
});
