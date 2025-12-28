import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckRunner, HealthCheckAPI } from '../health-check.js';
import { IAuthStrategy, AuthState, AuthConfig, AuthResult } from '../../auth/IAuthStrategy.js';
import { IMetrics } from '../IMetrics.js';
import { ILogger } from '../ILogger.js';

describe('HealthCheckRunner', () => {
  let mockAuth: IAuthStrategy;
  let mockMetrics: IMetrics;
  let mockLogger: ILogger;

  beforeEach(() => {
    // Create mock auth strategy
    mockAuth = {
      name: 'bearer',
      authenticate: vi.fn(),
      refreshIfNeeded: vi.fn(),
      getHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer test-token' }),
      isExpired: vi.fn().mockReturnValue(false),
      revoke: vi.fn(),
      getState: vi.fn().mockReturnValue({ strategy: 'bearer', token: 'test-token' }),
      setState: vi.fn()
    };

    // Create mock metrics
    mockMetrics = {
      increment: vi.fn(),
      gauge: vi.fn(),
      histogram: vi.fn(),
      getRegistry: vi.fn()
    };

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn()
    };
  });

  describe('runChecks', () => {
    it('should return healthy status when all checks pass', async () => {
      const runner = new HealthCheckRunner({
        connector: 'github',
        auth: mockAuth,
        metrics: mockMetrics,
        logger: mockLogger
      });

      const result = await runner.runChecks();

      expect(result.healthy).toBe(true);
      expect(result.connector).toBe('github');
      expect(result.checks).toHaveLength(3); // auth, connection_pool, response_time
      expect(result.checks.every(c => c.status === 'pass')).toBe(true);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'connector_health_checks_total',
        1,
        { connector: 'github', status: 'healthy' }
      );
    });

    it('should return unhealthy status when auth check fails', async () => {
      vi.mocked(mockAuth.isExpired).mockReturnValue(true);

      const runner = new HealthCheckRunner({
        connector: 'github',
        auth: mockAuth,
        metrics: mockMetrics,
        logger: mockLogger
      });

      const result = await runner.runChecks();

      expect(result.healthy).toBe(false);
      const authCheck = result.checks.find(c => c.name === 'auth_valid');
      expect(authCheck?.status).toBe('fail');
      expect(authCheck?.error).toContain('expired');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'connector_health_checks_total',
        1,
        { connector: 'github', status: 'unhealthy' }
      );
    });

    it('should handle auth errors gracefully', async () => {
      vi.mocked(mockAuth.getHeaders).mockImplementation(() => {
        throw new Error('Not authenticated');
      });

      const runner = new HealthCheckRunner({
        connector: 'github',
        auth: mockAuth,
        metrics: mockMetrics,
        logger: mockLogger
      });

      const result = await runner.runChecks();

      expect(result.healthy).toBe(false);
      const authCheck = result.checks.find(c => c.name === 'auth_valid');
      expect(authCheck?.status).toBe('fail');
      expect(authCheck?.error).toContain('Not authenticated');
    });

    it('should run custom checks', async () => {
      const customCheck = vi.fn().mockResolvedValue({
        name: 'custom_check',
        status: 'pass',
        duration_ms: 10
      });

      const runner = new HealthCheckRunner({
        connector: 'github',
        auth: mockAuth,
        customChecks: [customCheck]
      });

      const result = await runner.runChecks();

      expect(result.checks).toHaveLength(4); // 3 standard + 1 custom
      expect(customCheck).toHaveBeenCalled();
      const customCheckResult = result.checks.find(c => c.name === 'custom_check');
      expect(customCheckResult?.status).toBe('pass');
    });

    it('should record metrics for health check duration', async () => {
      const runner = new HealthCheckRunner({
        connector: 'github',
        auth: mockAuth,
        metrics: mockMetrics
      });

      await runner.runChecks();

      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'connector_health_check_duration_ms',
        expect.any(Number),
        { connector: 'github' }
      );
    });

    it('should work without auth strategy', async () => {
      const runner = new HealthCheckRunner({
        connector: 'github'
      });

      const result = await runner.runChecks();

      expect(result.healthy).toBe(true);
      expect(result.checks).toHaveLength(2); // connection_pool, response_time only
    });

    it('should include metadata in health status', async () => {
      const runner = new HealthCheckRunner({
        connector: 'github',
        auth: mockAuth
      });

      const result = await runner.runChecks();

      expect(result.metadata).toEqual({
        total_checks: 3,
        passed_checks: 3,
        failed_checks: 0
      });
    });
  });
});

describe('HealthCheckAPI', () => {
  let api: HealthCheckAPI;
  let mockAuth: IAuthStrategy;

  beforeEach(() => {
    api = new HealthCheckAPI();

    mockAuth = {
      name: 'bearer',
      authenticate: vi.fn(),
      refreshIfNeeded: vi.fn(),
      getHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer test-token' }),
      isExpired: vi.fn().mockReturnValue(false),
      revoke: vi.fn(),
      getState: vi.fn().mockReturnValue({ strategy: 'bearer', token: 'test-token' }),
      setState: vi.fn()
    };
  });

  describe('registerConnector', () => {
    it('should register connector for health checks', () => {
      api.registerConnector('github', {
        connector: 'github',
        auth: mockAuth
      });

      expect(api).toBeDefined();
    });
  });

  describe('getConnectorHealth', () => {
    it('should return health status for registered connector', async () => {
      api.registerConnector('github', {
        connector: 'github',
        auth: mockAuth
      });

      const result = await api.getConnectorHealth('github');

      expect(result).not.toBeNull();
      expect(result?.connector).toBe('github');
      expect(result?.healthy).toBe(true);
    });

    it('should return null for unregistered connector', async () => {
      const result = await api.getConnectorHealth('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getOverallHealth', () => {
    it('should return overall health for all connectors', async () => {
      api.registerConnector('github', {
        connector: 'github',
        auth: mockAuth
      });

      api.registerConnector('gitlab', {
        connector: 'gitlab',
        auth: mockAuth
      });

      const result = await api.getOverallHealth();

      expect(result.healthy).toBe(true);
      expect(result.connectors).toHaveProperty('github');
      expect(result.connectors).toHaveProperty('gitlab');
      expect(result.connectors.github.healthy).toBe(true);
      expect(result.connectors.gitlab.healthy).toBe(true);
    });

    it('should return unhealthy if any connector is unhealthy', async () => {
      const unhealthyAuth = {
        ...mockAuth,
        isExpired: vi.fn().mockReturnValue(true)
      };

      api.registerConnector('github', {
        connector: 'github',
        auth: mockAuth
      });

      api.registerConnector('gitlab', {
        connector: 'gitlab',
        auth: unhealthyAuth
      });

      const result = await api.getOverallHealth();

      expect(result.healthy).toBe(false);
      expect(result.connectors.github.healthy).toBe(true);
      expect(result.connectors.gitlab.healthy).toBe(false);
    });
  });
});
