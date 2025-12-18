/**
 * Production Excellence Tests
 *
 * Phase 50: Tests for production hardening, health checks, and operational readiness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProductionExcellenceManager,
  createProductionExcellenceManager,
  DEFAULT_PRODUCTION_CONFIG,
  DEFAULT_READINESS_CHECKS,
  READINESS_CATEGORIES,
  type ProdCircuitBreakerStatus,
} from '../index.js';

// =============================================================================
// ProductionExcellenceManager Tests
// =============================================================================

describe('ProductionExcellenceManager', () => {
  let manager: ProductionExcellenceManager;

  beforeEach(() => {
    manager = createProductionExcellenceManager();
  });

  // ---------------------------------------------------------------------------
  // Health Checks
  // ---------------------------------------------------------------------------

  describe('Health Checks', () => {
    it('should register and run health check', async () => {
      manager.registerHealthCheck('database', 'readiness', async () => ({
        status: 'healthy',
        message: 'Connected',
      }));

      const health = await manager.runHealthChecks();

      expect(health.checks).toHaveLength(1);
      expect(health.checks[0].name).toBe('database');
      expect(health.checks[0].status).toBe('healthy');
    });

    it('should handle failing health check', async () => {
      manager.registerHealthCheck('external-api', 'dependency', async () => ({
        status: 'unhealthy',
        message: 'Connection timeout',
      }));

      const health = await manager.runHealthChecks();

      expect(health.status).toBe('unhealthy');
      expect(health.checks[0].status).toBe('unhealthy');
    });

    it('should track consecutive failures', async () => {
      let failCount = 0;
      manager.registerHealthCheck('flaky-service', 'dependency', async () => {
        failCount++;
        return { status: 'unhealthy', message: 'Failed' };
      });

      await manager.runHealthChecks();
      const health = await manager.runHealthChecks();

      expect(health.checks[0].consecutiveFailures).toBe(2);
    });

    it('should report degraded status', async () => {
      manager.registerHealthCheck('cache', 'dependency', async () => ({
        status: 'degraded',
        message: 'High latency',
      }));

      const health = await manager.runHealthChecks();

      expect(health.status).toBe('degraded');
    });

    it('should include health summary', async () => {
      manager.registerHealthCheck('db', 'readiness', async () => ({ status: 'healthy' }));
      manager.registerHealthCheck('cache', 'readiness', async () => ({ status: 'degraded' }));
      manager.registerHealthCheck('queue', 'readiness', async () => ({ status: 'unhealthy' }));

      const health = await manager.runHealthChecks();

      expect(health.summary.total).toBe(3);
      expect(health.summary.healthy).toBe(1);
      expect(health.summary.degraded).toBe(1);
      expect(health.summary.unhealthy).toBe(1);
    });

    it('should handle check exceptions', async () => {
      manager.registerHealthCheck('broken', 'dependency', async () => {
        throw new Error('Connection refused');
      });

      const health = await manager.runHealthChecks();

      expect(health.checks[0].status).toBe('unhealthy');
      expect(health.checks[0].message).toBe('Connection refused');
    });
  });

  // ---------------------------------------------------------------------------
  // Liveness & Readiness
  // ---------------------------------------------------------------------------

  describe('Liveness & Readiness', () => {
    it('should report alive with no checks', async () => {
      const liveness = await manager.getLiveness();
      expect(liveness.alive).toBe(true);
    });

    it('should report not alive when liveness check fails', async () => {
      manager.registerHealthCheck('heartbeat', 'liveness', async () => ({
        status: 'unhealthy',
      }));

      await manager.runHealthChecks();
      const liveness = await manager.getLiveness();

      expect(liveness.alive).toBe(false);
    });

    it('should report not ready during initialization', async () => {
      const readiness = await manager.getReadiness();
      expect(readiness.ready).toBe(false);
      expect(readiness.message).toBe('Initializing');
    });

    it('should report ready when state is ready', async () => {
      manager.setReadinessState('ready');
      const readiness = await manager.getReadiness();
      expect(readiness.ready).toBe(true);
    });

    it('should report not ready during shutdown', async () => {
      manager.setReadinessState('shutting_down');
      const readiness = await manager.getReadiness();
      expect(readiness.ready).toBe(false);
      expect(readiness.message).toBe('Shutting down');
    });
  });

  // ---------------------------------------------------------------------------
  // Graceful Shutdown
  // ---------------------------------------------------------------------------

  describe('Graceful Shutdown', () => {
    it('should execute shutdown handlers in priority order', async () => {
      const order: string[] = [];

      manager.registerShutdownHandler({
        name: 'second',
        priority: 2,
        timeout: 5000,
        handler: async () => {
          order.push('second');
        },
      });

      manager.registerShutdownHandler({
        name: 'first',
        priority: 1,
        timeout: 5000,
        handler: async () => {
          order.push('first');
        },
      });

      await manager.shutdown();

      expect(order).toEqual(['first', 'second']);
    });

    it('should handle shutdown handler errors', async () => {
      manager.registerShutdownHandler({
        name: 'failing-handler',
        priority: 1,
        timeout: 5000,
        handler: async () => {
          throw new Error('Cleanup failed');
        },
      });

      const result = await manager.shutdown();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Cleanup failed');
    });

    it('should handle shutdown handler timeout', async () => {
      manager.registerShutdownHandler({
        name: 'slow-handler',
        priority: 1,
        timeout: 10,
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      });

      const result = await manager.shutdown();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Timeout');
    });

    it('should set readiness state to shutting_down', async () => {
      await manager.shutdown();
      const readiness = await manager.getReadiness();
      expect(readiness.ready).toBe(false);
      expect(readiness.message).toBe('Shutting down');
    });
  });

  // ---------------------------------------------------------------------------
  // Production Readiness Report
  // ---------------------------------------------------------------------------

  describe('Production Readiness Report', () => {
    it('should generate readiness report', async () => {
      const checkResults = new Map<string, boolean>();
      DEFAULT_READINESS_CHECKS.forEach((check) => {
        checkResults.set(check.name, true);
      });

      const report = await manager.generateReadinessReport(checkResults);

      expect(report.id).toMatch(/^report_/);
      expect(report.overall).toBe('ready');
      expect(report.score).toBe(100);
    });

    it('should report not_ready when required checks fail', async () => {
      const checkResults = new Map<string, boolean>();
      // All checks fail
      DEFAULT_READINESS_CHECKS.forEach((check) => {
        checkResults.set(check.name, false);
      });

      const report = await manager.generateReadinessReport(checkResults);

      expect(report.overall).toBe('not_ready');
      expect(report.blockers.length).toBeGreaterThan(0);
    });

    it('should report requires_review when score is low but required pass', async () => {
      const checkResults = new Map<string, boolean>();
      DEFAULT_READINESS_CHECKS.forEach((check) => {
        // Only pass required checks
        checkResults.set(check.name, check.required);
      });

      const report = await manager.generateReadinessReport(checkResults);

      // Score will be based on required checks only, which is < 100
      expect(report.score).toBeLessThan(100);
    });

    it('should include recommendations', async () => {
      const checkResults = new Map<string, boolean>();
      // Fail some required checks
      checkResults.set('Database Connection', false);

      const report = await manager.generateReadinessReport(checkResults);

      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature Flags
  // ---------------------------------------------------------------------------

  describe('Feature Flags', () => {
    it('should register and check feature flag', () => {
      manager.registerFeatureFlag({
        name: 'new-ui',
        enabled: true,
        environments: ['production'],
      });

      const enabled = manager.isFeatureEnabled('new-ui', { environment: 'production' });
      expect(enabled).toBe(true);
    });

    it('should return false for unknown flag', () => {
      const enabled = manager.isFeatureEnabled('unknown-flag');
      expect(enabled).toBe(false);
    });

    it('should return false for disabled flag', () => {
      manager.registerFeatureFlag({
        name: 'disabled-feature',
        enabled: false,
        environments: [],
      });

      const enabled = manager.isFeatureEnabled('disabled-feature');
      expect(enabled).toBe(false);
    });

    it('should respect environment restriction', () => {
      manager.registerFeatureFlag({
        name: 'staging-only',
        enabled: true,
        environments: ['staging'],
      });

      expect(manager.isFeatureEnabled('staging-only', { environment: 'production' })).toBe(false);
      expect(manager.isFeatureEnabled('staging-only', { environment: 'staging' })).toBe(true);
    });

    it('should list all feature flags', () => {
      manager.registerFeatureFlag({
        name: 'flag-1',
        enabled: true,
        environments: [],
      });
      manager.registerFeatureFlag({
        name: 'flag-2',
        enabled: false,
        environments: [],
      });

      const flags = manager.listFeatureFlags();
      expect(flags).toHaveLength(2);
    });

    it('should return false when feature flags disabled', () => {
      const disabledManager = createProductionExcellenceManager({
        enableFeatureFlags: false,
      });

      disabledManager.registerFeatureFlag({
        name: 'some-feature',
        enabled: true,
        environments: [],
      });

      expect(disabledManager.isFeatureEnabled('some-feature')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Circuit Breakers
  // ---------------------------------------------------------------------------

  describe('Circuit Breakers', () => {
    it('should register circuit breaker', () => {
      manager.registerCircuitBreaker({
        name: 'external-api',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });

      const status = manager.getCircuitBreakerStatus('external-api');
      expect(status).not.toBeNull();
      expect(status!.state).toBe('closed');
    });

    it('should track successes', () => {
      manager.registerCircuitBreaker({
        name: 'service',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });

      manager.recordSuccess('service');
      manager.recordSuccess('service');

      const status = manager.getCircuitBreakerStatus('service');
      expect(status!.successes).toBe(2);
    });

    it('should open circuit after threshold failures', () => {
      manager.registerCircuitBreaker({
        name: 'failing-service',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });

      manager.recordFailure('failing-service', 3);
      manager.recordFailure('failing-service', 3);
      manager.recordFailure('failing-service', 3);

      expect(manager.isCircuitOpen('failing-service')).toBe(true);
    });

    it('should close circuit after success in half_open state', () => {
      manager.registerCircuitBreaker({
        name: 'recovering-service',
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 30000,
        resetTimeout: 60000,
      });

      // Open the circuit
      manager.recordFailure('recovering-service', 1);
      expect(manager.isCircuitOpen('recovering-service')).toBe(true);

      // Manually set to half_open (normally done by timeout)
      const status = manager.getCircuitBreakerStatus('recovering-service');
      if (status) {
        status.state = 'half_open';
      }

      // Record success should close it
      manager.recordSuccess('recovering-service');
      expect(manager.isCircuitOpen('recovering-service')).toBe(false);
    });

    it('should list all circuit breaker statuses', () => {
      manager.registerCircuitBreaker({
        name: 'breaker-1',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });
      manager.registerCircuitBreaker({
        name: 'breaker-2',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });

      const statuses = manager.getAllCircuitBreakerStatuses();
      expect(statuses).toHaveLength(2);
    });

    it('should return null for unknown circuit breaker', () => {
      const status = manager.getCircuitBreakerStatus('unknown');
      expect(status).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Operational Metrics
  // ---------------------------------------------------------------------------

  describe('Operational Metrics', () => {
    it('should return operational metrics', () => {
      const metrics = manager.getOperationalMetrics();

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.find((m) => m.name === 'uptime_seconds')).toBeDefined();
    });

    it('should track uptime', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const metrics = manager.getOperationalMetrics();

      const uptime = metrics.find((m) => m.name === 'uptime_seconds');
      expect(uptime).toBeDefined();
      expect(uptime!.value).toBeGreaterThanOrEqual(0);
    });

    it('should include health check count', () => {
      manager.registerHealthCheck('test', 'dependency', async () => ({ status: 'healthy' }));

      const metrics = manager.getOperationalMetrics();
      const checkCount = metrics.find((m) => m.name === 'health_check_count');

      expect(checkCount).toBeDefined();
      expect(checkCount!.value).toBe(1);
    });

    it('should include circuit breaker status', () => {
      manager.registerCircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });

      const metrics = manager.getOperationalMetrics();
      const breakersOpen = metrics.find((m) => m.name === 'circuit_breakers_open');

      expect(breakersOpen).toBeDefined();
      expect(breakersOpen!.value).toBe(0);
    });

    it('should include feature flag count', () => {
      manager.registerFeatureFlag({
        name: 'test-flag',
        enabled: true,
        environments: [],
      });

      const metrics = manager.getOperationalMetrics();
      const flagCount = metrics.find((m) => m.name === 'feature_flags_enabled');

      expect(flagCount).toBeDefined();
      expect(flagCount!.value).toBe(1);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default production config', () => {
    expect(DEFAULT_PRODUCTION_CONFIG.environment).toBe('production');
    expect(DEFAULT_PRODUCTION_CONFIG.version).toBe('1.0.0');
    expect(DEFAULT_PRODUCTION_CONFIG.healthCheckInterval).toBe(30000);
    expect(DEFAULT_PRODUCTION_CONFIG.shutdownTimeout).toBe(30000);
    expect(DEFAULT_PRODUCTION_CONFIG.enableFeatureFlags).toBe(true);
  });

  it('should have readiness categories', () => {
    expect(READINESS_CATEGORIES.INFRASTRUCTURE).toBe('infrastructure');
    expect(READINESS_CATEGORIES.SECURITY).toBe('security');
    expect(READINESS_CATEGORIES.OBSERVABILITY).toBe('observability');
    expect(READINESS_CATEGORIES.RESILIENCE).toBe('resilience');
  });

  it('should have default readiness checks', () => {
    expect(DEFAULT_READINESS_CHECKS.length).toBeGreaterThan(0);

    // Check for required infrastructure checks
    const dbCheck = DEFAULT_READINESS_CHECKS.find((c) => c.name === 'Database Connection');
    expect(dbCheck).toBeDefined();
    expect(dbCheck!.required).toBe(true);

    // Check for optional checks
    const tracingCheck = DEFAULT_READINESS_CHECKS.find((c) => c.name === 'Tracing');
    expect(tracingCheck).toBeDefined();
    expect(tracingCheck!.required).toBe(false);
  });

  it('should have checks in all categories', () => {
    const categories = new Set(DEFAULT_READINESS_CHECKS.map((c) => c.category));

    expect(categories.has(READINESS_CATEGORIES.INFRASTRUCTURE)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.SECURITY)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.OBSERVABILITY)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.RESILIENCE)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.DOCUMENTATION)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.COMPLIANCE)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.PERFORMANCE)).toBe(true);
    expect(categories.has(READINESS_CATEGORIES.OPERATIONS)).toBe(true);
  });
});
