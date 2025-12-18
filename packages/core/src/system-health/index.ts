/**
 * Phase 69: System Health + Polish
 *
 * System health monitoring and diagnostics:
 * - Health checks
 * - Dependency monitoring
 * - System status
 * - Diagnostics
 *
 * @module @gwi/core/system-health
 */

import { z } from 'zod';

// =============================================================================
// VERSION
// =============================================================================

export const SYSTEM_HEALTH_VERSION = '1.0.0';

// =============================================================================
// HEALTH STATUS
// =============================================================================

export const SystemHealthStatuses = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
} as const;

export type SystemHealthStatus = (typeof SystemHealthStatuses)[keyof typeof SystemHealthStatuses];

// =============================================================================
// COMPONENT TYPES
// =============================================================================

export const ComponentTypes = {
  DATABASE: 'database',
  CACHE: 'cache',
  QUEUE: 'queue',
  STORAGE: 'storage',
  API: 'api',
  SERVICE: 'service',
  EXTERNAL: 'external',
} as const;

export type ComponentType = (typeof ComponentTypes)[keyof typeof ComponentTypes];

// =============================================================================
// TYPES
// =============================================================================

export interface HealthCheck {
  /** Component name */
  name: string;
  /** Component type */
  type: ComponentType;
  /** Status */
  status: SystemHealthStatus;
  /** Response time (ms) */
  responseTimeMs?: number;
  /** Message */
  message?: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Last check */
  lastCheck: number;
}

export interface SystemHealthInfo {
  /** Overall status */
  status: SystemHealthStatus;
  /** System version */
  version: string;
  /** Uptime (seconds) */
  uptimeSeconds: number;
  /** Component health checks */
  components: HealthCheck[];
  /** Timestamp */
  timestamp: number;
}

export interface DependencyStatus {
  /** Dependency name */
  name: string;
  /** Type */
  type: ComponentType;
  /** Status */
  status: SystemHealthStatus;
  /** Version */
  version?: string;
  /** Endpoint */
  endpoint?: string;
  /** Last successful connection */
  lastSuccess?: number;
  /** Last failure */
  lastFailure?: number;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Configuration */
  config?: Record<string, unknown>;
}

export interface HealthSystemMetrics {
  /** CPU usage (0-100) */
  cpuUsage: number;
  /** Memory usage (0-100) */
  memoryUsage: number;
  /** Memory used (bytes) */
  memoryUsedBytes: number;
  /** Memory total (bytes) */
  memoryTotalBytes: number;
  /** Disk usage (0-100) */
  diskUsage: number;
  /** Active connections */
  activeConnections: number;
  /** Request rate (per second) */
  requestRate: number;
  /** Error rate (per second) */
  errorRate: number;
  /** Average response time (ms) */
  avgResponseTimeMs: number;
  /** Timestamp */
  timestamp: number;
}

export interface DiagnosticInfo {
  /** System info */
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    hostname: string;
    pid: number;
    uptime: number;
  };
  /** Environment */
  environment: {
    name: string;
    region?: string;
    deploymentId?: string;
    buildVersion?: string;
    buildTime?: string;
  };
  /** Runtime */
  runtime: {
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    cpuUsage: {
      user: number;
      system: number;
    };
    activeHandles: number;
    activeRequests: number;
  };
  /** Configuration */
  config: {
    logLevel: string;
    features: string[];
    limits: Record<string, number>;
  };
  /** Timestamp */
  timestamp: number;
}

export interface HealthCheckConfig {
  /** Component name */
  name: string;
  /** Type */
  type: ComponentType;
  /** Check function */
  check: () => Promise<{ status: SystemHealthStatus; message?: string; details?: Record<string, unknown> }>;
  /** Timeout (ms) */
  timeoutMs: number;
  /** Interval (ms) */
  intervalMs: number;
  /** Critical */
  critical: boolean;
}

export interface MaintenanceWindow {
  /** Window ID */
  id: string;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
  /** Status */
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  /** Affected components */
  affectedComponents: string[];
  /** Created at */
  createdAt: number;
  /** Created by */
  createdBy: string;
}

export interface Incident {
  /** Incident ID */
  id: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Severity */
  severity: 'critical' | 'major' | 'minor' | 'info';
  /** Status */
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  /** Affected components */
  affectedComponents: string[];
  /** Start time */
  startTime: number;
  /** Resolved time */
  resolvedTime?: number;
  /** Updates */
  updates: Array<{
    timestamp: number;
    message: string;
    status: Incident['status'];
  }>;
  /** Created at */
  createdAt: number;
}

// =============================================================================
// SYSTEM HEALTH SERVICE
// =============================================================================

/**
 * System health monitoring service
 */
export class SystemHealthInfoService {
  private healthChecks: Map<string, HealthCheckConfig> = new Map();
  private lastResults: Map<string, HealthCheck> = new Map();
  private dependencies: Map<string, DependencyStatus> = new Map();
  private maintenanceWindows: Map<string, MaintenanceWindow> = new Map();
  private incidents: Map<string, Incident> = new Map();
  private startTime: number = Date.now();
  private windowCounter = 0;
  private incidentCounter = 0;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.registerDefaultChecks();
  }

  // ---------------------------------------------------------------------------
  // Health Checks
  // ---------------------------------------------------------------------------

  /**
   * Register a health check
   */
  registerHealthCheck(config: HealthCheckConfig): void {
    this.healthChecks.set(config.name, config);
  }

  /**
   * Unregister a health check
   */
  unregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    this.stopHealthCheck(name);
  }

  /**
   * Start all health checks
   */
  startHealthChecks(): void {
    for (const [name, config] of this.healthChecks) {
      this.startHealthCheck(name, config);
    }
  }

  /**
   * Stop all health checks
   */
  stopHealthChecks(): void {
    for (const name of this.healthChecks.keys()) {
      this.stopHealthCheck(name);
    }
  }

  private startHealthCheck(name: string, config: HealthCheckConfig): void {
    // Run immediately
    this.runHealthCheck(name, config);

    // Schedule periodic checks
    const interval = setInterval(() => {
      this.runHealthCheck(name, config);
    }, config.intervalMs);

    this.checkIntervals.set(name, interval);
  }

  private stopHealthCheck(name: string): void {
    const interval = this.checkIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }
  }

  private async runHealthCheck(name: string, config: HealthCheckConfig): Promise<void> {
    const startTime = Date.now();
    let result: HealthCheck;

    try {
      const checkPromise = config.check();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), config.timeoutMs)
      );

      const checkResult = await Promise.race([checkPromise, timeoutPromise]);

      result = {
        name,
        type: config.type,
        status: checkResult.status,
        responseTimeMs: Date.now() - startTime,
        message: checkResult.message,
        details: checkResult.details,
        lastCheck: Date.now(),
      };
    } catch (error) {
      result = {
        name,
        type: config.type,
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: Date.now(),
      };
    }

    this.lastResults.set(name, result);
  }

  /**
   * Get overall system health
   */
  getSystemHealthInfo(): SystemHealthInfo {
    const components = Array.from(this.lastResults.values());
    const overallStatus = this.calculateOverallStatus(components);

    return {
      status: overallStatus,
      version: SYSTEM_HEALTH_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      components,
      timestamp: Date.now(),
    };
  }

  /**
   * Get individual component health
   */
  getComponentHealth(name: string): HealthCheck | undefined {
    return this.lastResults.get(name);
  }

  /**
   * Run all health checks immediately
   */
  async runAllHealthChecks(): Promise<SystemHealthInfo> {
    const promises: Promise<void>[] = [];

    for (const [name, config] of this.healthChecks) {
      promises.push(this.runHealthCheck(name, config));
    }

    await Promise.all(promises);
    return this.getSystemHealthInfo();
  }

  private calculateOverallStatus(components: HealthCheck[]): SystemHealthStatus {
    if (components.length === 0) return 'unknown';

    const criticalComponents = components.filter(c => {
      const config = this.healthChecks.get(c.name);
      return config?.critical ?? false;
    });

    const hasCriticalUnhealthy = criticalComponents.some(c => c.status === 'unhealthy');
    if (hasCriticalUnhealthy) return 'unhealthy';

    const hasAnyUnhealthy = components.some(c => c.status === 'unhealthy');
    const hasAnyDegraded = components.some(c => c.status === 'degraded');

    if (hasAnyUnhealthy) return 'degraded';
    if (hasAnyDegraded) return 'degraded';

    return 'healthy';
  }

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  /**
   * Register a dependency
   */
  registerDependency(
    params: Omit<DependencyStatus, 'status' | 'lastSuccess' | 'lastFailure' | 'consecutiveFailures'>
  ): DependencyStatus {
    const dependency: DependencyStatus = {
      ...params,
      status: 'unknown',
      consecutiveFailures: 0,
    };

    this.dependencies.set(params.name, dependency);
    return dependency;
  }

  /**
   * Update dependency status
   */
  updateDependencyStatus(
    name: string,
    success: boolean,
    _message?: string
  ): DependencyStatus | undefined {
    const dependency = this.dependencies.get(name);
    if (!dependency) return undefined;

    if (success) {
      dependency.status = 'healthy';
      dependency.lastSuccess = Date.now();
      dependency.consecutiveFailures = 0;
    } else {
      dependency.consecutiveFailures++;
      dependency.lastFailure = Date.now();
      dependency.status = dependency.consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';
    }

    return dependency;
  }

  /**
   * Get all dependencies
   */
  getDependencies(): DependencyStatus[] {
    return Array.from(this.dependencies.values());
  }

  /**
   * Get dependency by name
   */
  getDependency(name: string): DependencyStatus | undefined {
    return this.dependencies.get(name);
  }

  // ---------------------------------------------------------------------------
  // System Metrics
  // ---------------------------------------------------------------------------

  /**
   * Get system metrics
   */
  getHealthSystemMetrics(): HealthSystemMetrics {
    // Simulated metrics - in production would get real values
    return {
      cpuUsage: Math.random() * 30 + 10,
      memoryUsage: Math.random() * 40 + 30,
      memoryUsedBytes: Math.floor(Math.random() * 4 * 1024 * 1024 * 1024),
      memoryTotalBytes: 8 * 1024 * 1024 * 1024,
      diskUsage: Math.random() * 30 + 20,
      activeConnections: Math.floor(Math.random() * 100) + 50,
      requestRate: Math.random() * 500 + 100,
      errorRate: Math.random() * 5,
      avgResponseTimeMs: Math.random() * 100 + 50,
      timestamp: Date.now(),
    };
  }

  /**
   * Get diagnostic info
   */
  getDiagnosticInfo(): DiagnosticInfo {
    return {
      system: {
        platform: 'linux',
        arch: 'x64',
        nodeVersion: '20.0.0',
        hostname: 'gwi-server',
        pid: process.pid,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      },
      environment: {
        name: 'production',
        region: 'us-east-1',
        deploymentId: 'dep_abc123',
        buildVersion: '1.0.0',
        buildTime: new Date().toISOString(),
      },
      runtime: {
        memoryUsage: {
          heapUsed: Math.floor(Math.random() * 100 * 1024 * 1024),
          heapTotal: 256 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 300 * 1024 * 1024,
        },
        cpuUsage: {
          user: Math.random() * 1000000,
          system: Math.random() * 500000,
        },
        activeHandles: Math.floor(Math.random() * 50) + 10,
        activeRequests: Math.floor(Math.random() * 20) + 5,
      },
      config: {
        logLevel: 'info',
        features: ['forecasting', 'alerts', 'connectors', 'exports'],
        limits: {
          maxConnections: 100,
          maxRequestsPerSecond: 1000,
          maxFileSize: 100 * 1024 * 1024,
        },
      },
      timestamp: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Maintenance Windows
  // ---------------------------------------------------------------------------

  /**
   * Schedule maintenance window
   */
  scheduleMaintenanceWindow(
    params: Omit<MaintenanceWindow, 'id' | 'status' | 'createdAt'>
  ): MaintenanceWindow {
    const window: MaintenanceWindow = {
      ...params,
      id: `maint_${++this.windowCounter}`,
      status: 'scheduled',
      createdAt: Date.now(),
    };

    this.maintenanceWindows.set(window.id, window);
    return window;
  }

  /**
   * Get maintenance window
   */
  getMaintenanceWindow(windowId: string): MaintenanceWindow | undefined {
    return this.maintenanceWindows.get(windowId);
  }

  /**
   * List maintenance windows
   */
  listMaintenanceWindows(
    status?: MaintenanceWindow['status']
  ): MaintenanceWindow[] {
    const windows = Array.from(this.maintenanceWindows.values());
    return status ? windows.filter(w => w.status === status) : windows;
  }

  /**
   * Update maintenance window status
   */
  updateMaintenanceWindowStatus(
    windowId: string,
    status: MaintenanceWindow['status']
  ): MaintenanceWindow | undefined {
    const window = this.maintenanceWindows.get(windowId);
    if (!window) return undefined;

    window.status = status;
    return window;
  }

  /**
   * Check if in maintenance
   */
  isInMaintenance(): boolean {
    const now = Date.now();
    return Array.from(this.maintenanceWindows.values()).some(
      w => w.status === 'in_progress' || (w.status === 'scheduled' && w.startTime <= now && w.endTime >= now)
    );
  }

  // ---------------------------------------------------------------------------
  // Incidents
  // ---------------------------------------------------------------------------

  /**
   * Create incident
   */
  createIncident(
    params: Omit<Incident, 'id' | 'updates' | 'resolvedTime' | 'createdAt'>
  ): Incident {
    const incident: Incident = {
      ...params,
      id: `inc_${++this.incidentCounter}`,
      updates: [{
        timestamp: Date.now(),
        message: params.description,
        status: params.status,
      }],
      createdAt: Date.now(),
    };

    this.incidents.set(incident.id, incident);
    return incident;
  }

  /**
   * Get incident
   */
  getIncident(incidentId: string): Incident | undefined {
    return this.incidents.get(incidentId);
  }

  /**
   * List incidents
   */
  listIncidents(
    status?: Incident['status'],
    limit: number = 50
  ): Incident[] {
    let incidents = Array.from(this.incidents.values());

    if (status) {
      incidents = incidents.filter(i => i.status === status);
    }

    return incidents
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Update incident
   */
  updateIncident(
    incidentId: string,
    status: Incident['status'],
    message: string
  ): Incident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) return undefined;

    incident.status = status;
    incident.updates.push({
      timestamp: Date.now(),
      message,
      status,
    });

    if (status === 'resolved') {
      incident.resolvedTime = Date.now();
    }

    return incident;
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): Incident[] {
    return this.listIncidents().filter(
      i => i.status !== 'resolved'
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private registerDefaultChecks(): void {
    // Database check (simulated)
    this.registerHealthCheck({
      name: 'database',
      type: 'database',
      check: async () => ({ status: 'healthy', message: 'Database connected' }),
      timeoutMs: 5000,
      intervalMs: 30000,
      critical: true,
    });

    // Cache check (simulated)
    this.registerHealthCheck({
      name: 'cache',
      type: 'cache',
      check: async () => ({ status: 'healthy', message: 'Cache available' }),
      timeoutMs: 2000,
      intervalMs: 30000,
      critical: false,
    });

    // Queue check (simulated)
    this.registerHealthCheck({
      name: 'queue',
      type: 'queue',
      check: async () => ({ status: 'healthy', message: 'Queue connected' }),
      timeoutMs: 5000,
      intervalMs: 30000,
      critical: true,
    });

    // Storage check (simulated)
    this.registerHealthCheck({
      name: 'storage',
      type: 'storage',
      check: async () => ({ status: 'healthy', message: 'Storage accessible' }),
      timeoutMs: 5000,
      intervalMs: 60000,
      critical: true,
    });
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopHealthChecks();
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const HealthCheckSchema = z.object({
  name: z.string(),
  type: z.enum(['database', 'cache', 'queue', 'storage', 'api', 'service', 'external']),
  status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
  responseTimeMs: z.number().optional(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  lastCheck: z.number(),
});

export const SystemHealthInfoSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  components: z.array(HealthCheckSchema),
  timestamp: z.number(),
});

export const MaintenanceWindowSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.number(),
  endTime: z.number(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  affectedComponents: z.array(z.string()),
  createdAt: z.number(),
  createdBy: z.string(),
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a system health service
 */
export function createSystemHealthInfoService(): SystemHealthInfoService {
  return new SystemHealthInfoService();
}
