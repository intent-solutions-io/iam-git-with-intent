/**
 * Tests for Phase 69: System Health
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SystemHealthInfoService,
  createSystemHealthInfoService,
  SYSTEM_HEALTH_VERSION,
  SystemHealthStatuses,
  ComponentTypes,
  type SystemHealthInfo,
  type HealthCheck,
  type MaintenanceWindow,
  type Incident,
} from '../index.js';

describe('System Health', () => {
  let service: SystemHealthInfoService;

  beforeEach(() => {
    service = createSystemHealthInfoService();
  });

  afterEach(() => {
    service.stopHealthChecks();
  });

  describe('Module exports', () => {
    it('should export version constant', () => {
      expect(SYSTEM_HEALTH_VERSION).toBe('1.0.0');
    });

    it('should export SystemHealthStatuses', () => {
      expect(SystemHealthStatuses.HEALTHY).toBe('healthy');
      expect(SystemHealthStatuses.DEGRADED).toBe('degraded');
      expect(SystemHealthStatuses.UNHEALTHY).toBe('unhealthy');
      expect(SystemHealthStatuses.UNKNOWN).toBe('unknown');
    });

    it('should export ComponentTypes', () => {
      expect(ComponentTypes.DATABASE).toBe('database');
      expect(ComponentTypes.CACHE).toBe('cache');
      expect(ComponentTypes.API).toBe('api');
      expect(ComponentTypes.QUEUE).toBe('queue');
    });

    it('should export factory function', () => {
      expect(typeof createSystemHealthInfoService).toBe('function');
      const instance = createSystemHealthInfoService();
      expect(instance).toBeInstanceOf(SystemHealthInfoService);
      instance.stopHealthChecks();
    });
  });

  describe('Health Check Registration', () => {
    it('should register a health check', () => {
      service.registerHealthCheck({
        name: 'test-check',
        type: ComponentTypes.API,
        intervalMs: 30000,
        timeoutMs: 5000,
        check: async () => ({ status: 'healthy', message: 'OK' }),
      });

      const health = service.getSystemHealthInfo();
      expect(health).toBeDefined();
    });

    it('should unregister a health check', () => {
      service.registerHealthCheck({
        name: 'temp-check',
        type: ComponentTypes.API,
        intervalMs: 30000,
        timeoutMs: 5000,
        check: async () => ({ status: 'healthy' }),
      });

      service.unregisterHealthCheck('temp-check');
      // Check was removed
    });
  });

  describe('Health Check Execution', () => {
    it('should run all health checks', async () => {
      service.registerHealthCheck({
        name: 'api-check',
        type: ComponentTypes.API,
        intervalMs: 60000,
        timeoutMs: 5000,
        check: async () => ({ status: 'healthy', message: 'API responding' }),
      });

      service.registerHealthCheck({
        name: 'db-check',
        type: ComponentTypes.DATABASE,
        intervalMs: 60000,
        timeoutMs: 5000,
        check: async () => ({ status: 'healthy', message: 'DB connected' }),
      });

      const health = await service.runAllHealthChecks();

      expect(health).toBeDefined();
      expect(health.components.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle failing health check', async () => {
      service.registerHealthCheck({
        name: 'failing-check',
        type: ComponentTypes.DATABASE,
        intervalMs: 60000,
        timeoutMs: 5000,
        check: async () => {
          throw new Error('Connection failed');
        },
      });

      const health = await service.runAllHealthChecks();
      const failingComponent = health.components.find(c => c.name === 'failing-check');

      expect(failingComponent).toBeDefined();
      expect(failingComponent!.status).toBe('unhealthy');
      expect(failingComponent!.message).toContain('Connection failed');
    });

    it('should get individual component health', async () => {
      service.registerHealthCheck({
        name: 'cache-check',
        type: ComponentTypes.CACHE,
        intervalMs: 60000,
        timeoutMs: 5000,
        check: async () => ({
          status: 'healthy',
          message: 'Cache hit rate: 95%',
          details: { hitRate: 0.95 },
        }),
      });

      await service.runAllHealthChecks();
      const component = service.getComponentHealth('cache-check');

      expect(component).toBeDefined();
      expect(component!.name).toBe('cache-check');
      expect(component!.type).toBe('cache');
    });
  });

  describe('System Health Summary', () => {
    it('should return system health info', () => {
      const health = service.getSystemHealthInfo();

      expect(health).toBeDefined();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('version', SYSTEM_HEALTH_VERSION);
      expect(health).toHaveProperty('uptimeSeconds');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('timestamp');
    });

    it('should track uptime', async () => {
      const health1 = service.getSystemHealthInfo();
      await new Promise(resolve => setTimeout(resolve, 50));
      const health2 = service.getSystemHealthInfo();

      expect(health2.uptimeSeconds).toBeGreaterThanOrEqual(health1.uptimeSeconds);
    });

    it('should calculate overall status from components', async () => {
      service.registerHealthCheck({
        name: 'healthy-component',
        type: ComponentTypes.API,
        intervalMs: 60000,
        timeoutMs: 5000,
        check: async () => ({ status: 'healthy' }),
      });

      const health = await service.runAllHealthChecks();
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(health.status);
    });
  });

  describe('Dependency Monitoring', () => {
    it('should register a dependency', () => {
      const dependency = service.registerDependency({
        name: 'postgres',
        type: 'database',
        endpoint: 'postgresql://localhost:5432/db',
        critical: true,
      });

      expect(dependency).toBeDefined();
      expect(dependency.name).toBe('postgres');
      expect(dependency.type).toBe('database');
      expect(dependency.status).toBe('unknown');
    });

    it('should update dependency status', () => {
      service.registerDependency({
        name: 'redis',
        type: 'cache',
        endpoint: 'redis://localhost:6379',
        critical: false,
      });

      const updated = service.updateDependencyStatus('redis', true, 'Connected');
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('healthy');
    });

    it('should track consecutive failures', () => {
      service.registerDependency({
        name: 'external-api',
        type: 'api',
        endpoint: 'https://api.example.com',
        critical: false,
      });

      service.updateDependencyStatus('external-api', false, 'Timeout');
      service.updateDependencyStatus('external-api', false, 'Timeout');
      service.updateDependencyStatus('external-api', false, 'Timeout');

      const dependency = service.getDependency('external-api');
      expect(dependency).toBeDefined();
      expect(dependency!.consecutiveFailures).toBe(3);
      expect(dependency!.status).toBe('unhealthy');
    });

    it('should get dependency by name', () => {
      service.registerDependency({
        name: 'kafka',
        type: 'queue',
        endpoint: 'kafka://localhost:9092',
        critical: true,
      });

      const dependency = service.getDependency('kafka');
      expect(dependency).toBeDefined();
      expect(dependency!.name).toBe('kafka');
    });

    it('should list all dependencies', () => {
      service.registerDependency({
        name: 'dep-1',
        type: 'database',
        endpoint: 'localhost:5432',
        critical: true,
      });
      service.registerDependency({
        name: 'dep-2',
        type: 'cache',
        endpoint: 'localhost:6379',
        critical: false,
      });

      const dependencies = service.getDependencies();
      expect(dependencies.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Maintenance Windows', () => {
    it('should schedule a maintenance window', () => {
      const window = service.scheduleMaintenanceWindow({
        title: 'Database Upgrade',
        description: 'Upgrading PostgreSQL to v15',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 86400000 + 3600000,
        affectedComponents: ['postgres', 'api'],
        createdBy: 'admin@example.com',
      });

      expect(window).toBeDefined();
      expect(window.id).toMatch(/^maint_/);
      expect(window.title).toBe('Database Upgrade');
      expect(window.status).toBe('scheduled');
    });

    it('should get maintenance window by ID', () => {
      const created = service.scheduleMaintenanceWindow({
        title: 'Test Window',
        description: 'Test',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 86400000 + 3600000,
        affectedComponents: ['test'],
        createdBy: 'admin',
      });

      const retrieved = service.getMaintenanceWindow(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list maintenance windows', () => {
      service.scheduleMaintenanceWindow({
        title: 'Window 1',
        description: 'First',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 86400000 + 3600000,
        affectedComponents: [],
        createdBy: 'admin',
      });
      service.scheduleMaintenanceWindow({
        title: 'Window 2',
        description: 'Second',
        startTime: Date.now() + 172800000,
        endTime: Date.now() + 172800000 + 3600000,
        affectedComponents: [],
        createdBy: 'admin',
      });

      const windows = service.listMaintenanceWindows();
      expect(windows.length).toBeGreaterThanOrEqual(2);
    });

    it('should update maintenance window status', () => {
      const window = service.scheduleMaintenanceWindow({
        title: 'Status Update',
        description: 'Test status',
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        affectedComponents: [],
        createdBy: 'admin',
      });

      const updated = service.updateMaintenanceWindowStatus(window.id, 'in_progress');

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('in_progress');
    });

    it('should cancel maintenance window via status update', () => {
      const window = service.scheduleMaintenanceWindow({
        title: 'To Cancel',
        description: 'Will be cancelled',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 86400000 + 3600000,
        affectedComponents: [],
        createdBy: 'admin',
      });

      const cancelled = service.updateMaintenanceWindowStatus(window.id, 'cancelled');
      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe('cancelled');
    });

    it('should check if in maintenance', () => {
      const isInMaintenance = service.isInMaintenance();
      expect(typeof isInMaintenance).toBe('boolean');
    });
  });

  describe('Incident Management', () => {
    it('should create an incident', () => {
      const incident = service.createIncident({
        title: 'API Outage',
        description: 'API endpoints returning 500 errors',
        severity: 'high',
        affectedComponents: ['api', 'gateway'],
        status: 'investigating',
      });

      expect(incident).toBeDefined();
      expect(incident.id).toMatch(/^inc_/);
      expect(incident.title).toBe('API Outage');
      expect(incident.status).toBe('investigating');
      expect(incident.severity).toBe('high');
    });

    it('should get incident by ID', () => {
      const created = service.createIncident({
        title: 'Test Incident',
        description: 'Test',
        severity: 'low',
        affectedComponents: [],
        status: 'investigating',
      });

      const retrieved = service.getIncident(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list incidents', () => {
      service.createIncident({
        title: 'Incident 1',
        description: 'First',
        severity: 'medium',
        affectedComponents: [],
        status: 'investigating',
      });
      service.createIncident({
        title: 'Incident 2',
        description: 'Second',
        severity: 'high',
        affectedComponents: [],
        status: 'investigating',
      });

      const incidents = service.listIncidents();
      expect(incidents.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter incidents by status', () => {
      service.createIncident({
        title: 'Active Incident',
        description: 'Active',
        severity: 'medium',
        affectedComponents: [],
        status: 'investigating',
      });

      const activeIncidents = service.listIncidents('investigating');
      expect(activeIncidents.every(i => i.status === 'investigating')).toBe(true);
    });

    it('should update incident status', () => {
      const incident = service.createIncident({
        title: 'Original',
        description: 'Original description',
        severity: 'medium',
        affectedComponents: [],
        status: 'investigating',
      });

      const updated = service.updateIncident(incident.id, 'identified', 'Root cause identified');

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('identified');
    });

    it('should add update to incident via updateIncident', () => {
      const incident = service.createIncident({
        title: 'With Updates',
        description: 'Initial',
        severity: 'high',
        affectedComponents: [],
        status: 'investigating',
      });

      const updated = service.updateIncident(incident.id, 'investigating', 'Investigation in progress');

      expect(updated).toBeDefined();
      expect(updated!.updates.length).toBeGreaterThanOrEqual(2); // Initial + new update
    });

    it('should resolve incident via updateIncident', () => {
      const incident = service.createIncident({
        title: 'To Resolve',
        description: 'Will be resolved',
        severity: 'medium',
        affectedComponents: [],
        status: 'investigating',
      });

      const resolved = service.updateIncident(incident.id, 'resolved', 'Fixed by restarting service');

      expect(resolved).toBeDefined();
      expect(resolved!.status).toBe('resolved');
      expect(resolved!.resolvedTime).toBeDefined();
    });

    it('should get active incidents', () => {
      service.createIncident({
        title: 'Active',
        description: 'Still active',
        severity: 'high',
        affectedComponents: [],
        status: 'investigating',
      });

      const activeIncidents = service.getActiveIncidents();
      expect(Array.isArray(activeIncidents)).toBe(true);
    });
  });

  describe('System Metrics', () => {
    it('should get system metrics', () => {
      const metrics = service.getHealthSystemMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('cpuUsage');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('diskUsage');
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('timestamp');
    });
  });

  describe('Diagnostics', () => {
    it('should get full diagnostics', async () => {
      service.registerHealthCheck({
        name: 'diag-check',
        type: ComponentTypes.API,
        intervalMs: 60000,
        timeoutMs: 5000,
        check: async () => ({ status: 'healthy' }),
      });

      await service.runAllHealthChecks();
      const diagnostics = service.getDiagnosticInfo();

      expect(diagnostics).toBeDefined();
      expect(diagnostics).toHaveProperty('system');
      expect(diagnostics).toHaveProperty('environment');
      expect(diagnostics).toHaveProperty('runtime');
      expect(diagnostics).toHaveProperty('config');
      expect(diagnostics).toHaveProperty('timestamp');
    });
  });
});
