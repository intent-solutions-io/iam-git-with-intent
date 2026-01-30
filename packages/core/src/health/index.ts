/**
 * Health Check Utilities for Cloud Run Services
 *
 * B5: Add health check endpoints to all Cloud Run services
 *
 * Provides standardized health check endpoints that integrate with:
 * - System health monitoring
 * - B3 Recovery Manager (run durability)
 * - B4 DLQ Handler (queue health)
 *
 * Usage:
 * ```typescript
 * import { createHealthRouter, ServiceHealthConfig } from '@gwi/core/health';
 *
 * const healthConfig: ServiceHealthConfig = {
 *   serviceName: 'api',
 *   version: '1.0.0',
 *   env: 'prod',
 *   checks: {
 *     storage: async () => checkFirestore(),
 *     queue: async () => checkPubSub(),
 *   },
 * };
 *
 * const healthRouter = createHealthRouter(healthConfig);
 * app.use(healthRouter);
 * ```
 *
 * @module @gwi/core/health
 */

import { Router, Request, Response } from 'express';
import {
  SystemHealthInfoService,
  createSystemHealthInfoService,
  SystemHealthStatus,
  ComponentType,
  HealthCheck,
} from '../system-health/index.js';
import { getLogger } from '../reliability/observability.js';

const logger = getLogger('health');

// =============================================================================
// Types
// =============================================================================

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<{
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}>;

/**
 * Service health configuration
 */
export interface ServiceHealthConfig {
  /** Service name (e.g., 'api', 'worker', 'gateway') */
  serviceName: string;
  /** Service version */
  version: string;
  /** Environment (dev, staging, prod) */
  env: string;
  /** Optional service-specific checks */
  checks?: {
    /** Storage/database check */
    storage?: HealthCheckFn;
    /** Queue/Pub/Sub check */
    queue?: HealthCheckFn;
    /** Cache check */
    cache?: HealthCheckFn;
    /** External API checks */
    external?: Record<string, HealthCheckFn>;
  };
  /** Optional metadata to include in health responses */
  metadata?: Record<string, unknown>;
}

/**
 * Standard health response
 */
export interface HealthResponse {
  /** Status: healthy, degraded, unhealthy */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Service name */
  service: string;
  /** Service version */
  version: string;
  /** Environment */
  env: string;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** ISO timestamp */
  timestamp: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Ready response with component checks
 */
export interface ReadyResponse extends HealthResponse {
  /** Component check results */
  components: {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTimeMs?: number;
    message?: string;
  }[];
}

/**
 * Deep health response with full diagnostics
 */
export interface DeepHealthResponse extends ReadyResponse {
  /** System metrics */
  metrics?: {
    memoryUsageMB: number;
    heapUsedMB: number;
    activeHandles: number;
  };
  /** DLQ metrics (if available) */
  dlq?: {
    poisonCount: number;
    dlqRoutedCount: number;
    transientErrorCount: number;
    permanentErrorCount: number;
  };
  /** Recovery status (if available) */
  recovery?: {
    interruptedRuns: number;
    lastRecoveryAt?: string;
  };
}

// =============================================================================
// Health Service
// =============================================================================

/**
 * Service health manager
 *
 * Manages health checks for a specific Cloud Run service.
 */
export class ServiceHealthManager {
  private config: ServiceHealthConfig;
  private healthService: SystemHealthInfoService;
  private startTime: number;
  private lastRecoveryTime?: Date;
  private interruptedRunsCount = 0;

  constructor(config: ServiceHealthConfig) {
    this.config = config;
    this.healthService = createSystemHealthInfoService();
    this.startTime = Date.now();

    // Register service-specific checks
    this.registerChecks();
  }

  private registerChecks(): void {
    const { checks } = this.config;

    // Storage check
    if (checks?.storage) {
      this.healthService.registerHealthCheck({
        name: 'storage',
        type: 'storage' as ComponentType,
        check: async () => {
          const result = await checks.storage!();
          return {
            status: result.healthy ? ('healthy' as SystemHealthStatus) : ('unhealthy' as SystemHealthStatus),
            message: result.message,
            details: result.details,
          };
        },
        timeoutMs: 5000,
        intervalMs: 30000,
        critical: true,
      });
    }

    // Queue check
    if (checks?.queue) {
      this.healthService.registerHealthCheck({
        name: 'queue',
        type: 'queue' as ComponentType,
        check: async () => {
          const result = await checks.queue!();
          return {
            status: result.healthy ? ('healthy' as SystemHealthStatus) : ('unhealthy' as SystemHealthStatus),
            message: result.message,
            details: result.details,
          };
        },
        timeoutMs: 5000,
        intervalMs: 30000,
        critical: true,
      });
    }

    // Cache check
    if (checks?.cache) {
      this.healthService.registerHealthCheck({
        name: 'cache',
        type: 'cache' as ComponentType,
        check: async () => {
          const result = await checks.cache!();
          return {
            status: result.healthy ? ('healthy' as SystemHealthStatus) : ('degraded' as SystemHealthStatus),
            message: result.message,
            details: result.details,
          };
        },
        timeoutMs: 2000,
        intervalMs: 30000,
        critical: false,
      });
    }

    // External checks
    if (checks?.external) {
      for (const [name, checkFn] of Object.entries(checks.external)) {
        this.healthService.registerHealthCheck({
          name: `external:${name}`,
          type: 'external' as ComponentType,
          check: async () => {
            const result = await checkFn();
            return {
              status: result.healthy ? ('healthy' as SystemHealthStatus) : ('degraded' as SystemHealthStatus),
              message: result.message,
              details: result.details,
            };
          },
          timeoutMs: 10000,
          intervalMs: 60000,
          critical: false,
        });
      }
    }
  }

  /**
   * Start background health checks
   */
  startChecks(): void {
    this.healthService.startHealthChecks();
    logger.info('Health checks started', { service: this.config.serviceName });
  }

  /**
   * Stop background health checks
   */
  stopChecks(): void {
    this.healthService.stopHealthChecks();
    logger.info('Health checks stopped', { service: this.config.serviceName });
  }

  /**
   * Get liveness status (is the process running?)
   */
  getLiveness(): HealthResponse {
    return {
      status: 'healthy',
      service: this.config.serviceName,
      version: this.config.version,
      env: this.config.env,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      metadata: this.config.metadata,
    };
  }

  /**
   * Get readiness status (can we serve traffic?)
   */
  async getReadiness(): Promise<ReadyResponse> {
    const systemHealth = await this.healthService.runAllHealthChecks();

    const components = systemHealth.components.map((c: HealthCheck) => ({
      name: c.name,
      status: c.status as 'healthy' | 'degraded' | 'unhealthy',
      responseTimeMs: c.responseTimeMs,
      message: c.message,
    }));

    return {
      status: systemHealth.status as 'healthy' | 'degraded' | 'unhealthy',
      service: this.config.serviceName,
      version: this.config.version,
      env: this.config.env,
      uptimeSeconds: systemHealth.uptimeSeconds,
      timestamp: new Date().toISOString(),
      components,
      metadata: this.config.metadata,
    };
  }

  /**
   * Get deep health status (full diagnostics)
   */
  async getDeepHealth(
    dlqMetrics?: { poisonCount: number; dlqRoutedCount: number; transientErrorCount: number; permanentErrorCount: number },
    recoveryStatus?: { interruptedRuns: number; lastRecoveryAt?: Date }
  ): Promise<DeepHealthResponse> {
    const readiness = await this.getReadiness();
    const memUsage = process.memoryUsage();

    const response: DeepHealthResponse = {
      ...readiness,
      metrics: {
        memoryUsageMB: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        activeHandles: (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.()?.length ?? 0,
      },
    };

    // Add DLQ metrics if provided
    if (dlqMetrics) {
      response.dlq = dlqMetrics;
    }

    // Add recovery status if provided
    if (recoveryStatus) {
      response.recovery = {
        interruptedRuns: recoveryStatus.interruptedRuns,
        lastRecoveryAt: recoveryStatus.lastRecoveryAt?.toISOString(),
      };
    }

    return response;
  }

  /**
   * Record recovery event (for B3 integration)
   */
  recordRecovery(interruptedRuns: number): void {
    this.interruptedRunsCount = interruptedRuns;
    this.lastRecoveryTime = new Date();
  }

  /**
   * Get recovery stats
   */
  getRecoveryStats(): { interruptedRuns: number; lastRecoveryAt?: Date } {
    return {
      interruptedRuns: this.interruptedRunsCount,
      lastRecoveryAt: this.lastRecoveryTime,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.healthService.cleanup();
  }
}

// =============================================================================
// Express Router Factory
// =============================================================================

/**
 * Create Express router with health endpoints
 *
 * Endpoints:
 * - GET /health - Liveness probe
 * - GET /health/ready - Readiness probe
 * - GET /health/deep - Deep health check (requires auth in prod)
 */
export function createHealthRouter(config: ServiceHealthConfig): Router {
  const router = Router();
  const healthManager = new ServiceHealthManager(config);

  // Store manager for later access
  (router as Router & { healthManager: ServiceHealthManager }).healthManager = healthManager;

  /**
   * GET /health - Liveness probe
   *
   * Always returns 200 if the process is running.
   * Used by Cloud Run to determine if the container is alive.
   */
  router.get('/health', (_req: Request, res: Response) => {
    const response = healthManager.getLiveness();
    res.json(response);
  });

  /**
   * GET /health/ready - Readiness probe
   *
   * Returns 200 if all critical dependencies are healthy.
   * Returns 503 if any critical dependency is unhealthy.
   * Used by Cloud Run startup probe.
   */
  router.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      const response = await healthManager.getReadiness();
      const statusCode = response.status === 'unhealthy' ? 503 : 200;
      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Readiness check failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        service: config.serviceName,
        version: config.version,
        env: config.env,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /health/deep - Deep health check
   *
   * Returns comprehensive health information including:
   * - All component checks
   * - System metrics
   * - DLQ metrics (if available)
   * - Recovery status (if available)
   *
   * This endpoint should be protected in production.
   */
  router.get('/health/deep', async (req: Request, res: Response) => {
    try {
      // Get DLQ metrics from request context if available
      const dlqMetrics = (req as Request & { dlqMetrics?: DeepHealthResponse['dlq'] }).dlqMetrics;
      const recoveryStats = healthManager.getRecoveryStats();

      const response = await healthManager.getDeepHealth(dlqMetrics, recoveryStats);
      const statusCode = response.status === 'unhealthy' ? 503 : 200;
      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Deep health check failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        service: config.serviceName,
        version: config.version,
        env: config.env,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a Firestore health check function
 */
export function createFirestoreCheck(
  getFirestore: () => FirebaseFirestore.Firestore | null
): HealthCheckFn {
  return async () => {
    try {
      const firestore = getFirestore();
      if (!firestore) {
        return { healthy: false, message: 'Firestore not initialized' };
      }

      // Try to read a test document
      const startTime = Date.now();
      await firestore.collection('_health').doc('ping').get();
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        message: 'Firestore connected',
        details: { latencyMs },
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Firestore check failed',
      };
    }
  };
}

/**
 * Create a Pub/Sub health check function
 */
export function createPubSubCheck(
  getTopicStatus: () => Promise<Record<string, boolean>>
): HealthCheckFn {
  return async () => {
    try {
      const topicStatus = await getTopicStatus();
      const allHealthy = Object.values(topicStatus).every(Boolean);
      const unhealthyTopics = Object.entries(topicStatus)
        .filter(([, healthy]) => !healthy)
        .map(([name]) => name);

      if (allHealthy) {
        return {
          healthy: true,
          message: 'All Pub/Sub topics healthy',
          details: { topics: topicStatus },
        };
      } else {
        return {
          healthy: false,
          message: `Unhealthy topics: ${unhealthyTopics.join(', ')}`,
          details: { topics: topicStatus },
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Pub/Sub check failed',
      };
    }
  };
}

/**
 * Create a simple ping health check
 */
export function createPingCheck(
  pingFn: () => Promise<boolean>
): HealthCheckFn {
  return async () => {
    try {
      const startTime = Date.now();
      const result = await pingFn();
      const latencyMs = Date.now() - startTime;

      return {
        healthy: result,
        message: result ? 'Ping successful' : 'Ping failed',
        details: { latencyMs },
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Ping failed',
      };
    }
  };
}

// =============================================================================
// Singleton Manager
// =============================================================================

let defaultManager: ServiceHealthManager | null = null;

/**
 * Get or create the default health manager
 */
export function getHealthManager(config?: ServiceHealthConfig): ServiceHealthManager {
  if (!defaultManager && config) {
    defaultManager = new ServiceHealthManager(config);
  }
  if (!defaultManager) {
    throw new Error('Health manager not initialized. Call with config first.');
  }
  return defaultManager;
}

/**
 * Reset the default health manager (for testing)
 */
export function resetHealthManager(): void {
  if (defaultManager) {
    defaultManager.cleanup();
    defaultManager = null;
  }
}

// =============================================================================
// Exports
// =============================================================================

export { ServiceHealthManager as default };
