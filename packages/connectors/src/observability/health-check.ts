import { IAuthStrategy } from '../auth/IAuthStrategy.js';
import { IMetrics } from './IMetrics.js';
import { ILogger } from './ILogger.js';

/**
 * Health check status
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  duration_ms: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Aggregated health status
 */
export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  connector: string;
  checks: HealthCheck[];
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  connector: string;
  auth?: IAuthStrategy;
  metrics?: IMetrics;
  logger?: ILogger;
  customChecks?: Array<() => Promise<HealthCheck>>;
}

/**
 * Health check runner
 *
 * Implements Layer 6 (Observability) from connector abstraction design
 *
 * Features:
 * - Authentication validation
 * - Connection pool health
 * - Response time tracking
 * - Aggregated health status
 * - Prometheus metrics integration
 */
export class HealthCheckRunner {
  constructor(
    private readonly config: HealthCheckConfig
  ) {}

  /**
   * Run all health checks
   *
   * @returns Aggregated health status
   */
  async runChecks(): Promise<HealthStatus> {
    const startTime = Date.now();
    const checks: HealthCheck[] = [];

    try {
      // Check 1: Authentication validation
      if (this.config.auth) {
        checks.push(await this.checkAuth());
      }

      // Check 2: Connection pool health (simulated)
      checks.push(await this.checkConnectionPool());

      // Check 3: Response time check
      checks.push(await this.checkResponseTime());

      // Check 4: Custom checks
      if (this.config.customChecks) {
        for (const customCheck of this.config.customChecks) {
          checks.push(await customCheck());
        }
      }

      const healthy = checks.every(c => c.status === 'pass');

      // Record metrics
      if (this.config.metrics) {
        this.config.metrics.increment('connector_health_checks_total', 1, {
          connector: this.config.connector,
          status: healthy ? 'healthy' : 'unhealthy'
        });

        const duration = Date.now() - startTime;
        this.config.metrics.histogram('connector_health_check_duration_ms', duration, {
          connector: this.config.connector
        });
      }

      return {
        healthy,
        timestamp: new Date().toISOString(),
        connector: this.config.connector,
        checks,
        metadata: {
          total_checks: checks.length,
          passed_checks: checks.filter(c => c.status === 'pass').length,
          failed_checks: checks.filter(c => c.status === 'fail').length
        }
      };
    } catch (error) {
      const healthStatus: HealthStatus = {
        healthy: false,
        timestamp: new Date().toISOString(),
        connector: this.config.connector,
        checks,
        error: error instanceof Error ? error.message : String(error)
      };

      if (this.config.logger) {
        this.config.logger.error('Health check failed', {
          connector: this.config.connector,
          error: healthStatus.error
        });
      }

      return healthStatus;
    }
  }

  /**
   * Check authentication validity
   */
  private async checkAuth(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      if (!this.config.auth) {
        throw new Error('No auth strategy configured');
      }

      // Check if token is expired
      const isExpired = this.config.auth.isExpired();

      if (isExpired) {
        return {
          name: 'auth_valid',
          status: 'fail',
          duration_ms: Date.now() - startTime,
          error: 'Authentication token expired'
        };
      }

      // Try to get headers (validates token exists)
      const headers = this.config.auth.getHeaders();

      if (!headers.Authorization) {
        return {
          name: 'auth_valid',
          status: 'fail',
          duration_ms: Date.now() - startTime,
          error: 'No authorization header available'
        };
      }

      return {
        name: 'auth_valid',
        status: 'pass',
        duration_ms: Date.now() - startTime,
        metadata: {
          strategy: this.config.auth.name
        }
      };
    } catch (error) {
      return {
        name: 'auth_valid',
        status: 'fail',
        duration_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check connection pool health
   *
   * In a real implementation, this would check:
   * - Active connections
   * - Pool size
   * - Connection errors
   */
  private async checkConnectionPool(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Simulated connection pool check
      // In production, this would query the HTTP client's connection pool
      const activeConnections = 0;
      const maxConnections = 10;

      return {
        name: 'connection_pool_healthy',
        status: 'pass',
        duration_ms: Date.now() - startTime,
        metadata: {
          active_connections: activeConnections,
          max_connections: maxConnections,
          utilization_percent: (activeConnections / maxConnections) * 100
        }
      };
    } catch (error) {
      return {
        name: 'connection_pool_healthy',
        status: 'fail',
        duration_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check response time
   *
   * Validates that the connector can respond within acceptable timeframes
   */
  private async checkResponseTime(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Simulated response time check
      // In production, this would make a lightweight API call
      await new Promise(resolve => setTimeout(resolve, 10));

      const duration = Date.now() - startTime;
      const threshold = 1000; // 1 second threshold

      return {
        name: 'response_time_acceptable',
        status: duration < threshold ? 'pass' : 'fail',
        duration_ms: duration,
        metadata: {
          response_time_ms: duration,
          threshold_ms: threshold
        }
      };
    } catch (error) {
      return {
        name: 'response_time_acceptable',
        status: 'fail',
        duration_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Health check HTTP API endpoints
 *
 * GET /health - Overall system health
 * GET /health/:connector - Specific connector health
 */
export class HealthCheckAPI {
  private runners: Map<string, HealthCheckRunner>;

  constructor() {
    this.runners = new Map();
  }

  /**
   * Register a connector for health checks
   */
  registerConnector(connector: string, config: HealthCheckConfig): void {
    this.runners.set(connector, new HealthCheckRunner(config));
  }

  /**
   * Get health status for all connectors
   */
  async getOverallHealth(): Promise<{
    healthy: boolean;
    timestamp: string;
    connectors: Record<string, HealthStatus>;
  }> {
    const results: Record<string, HealthStatus> = {};

    for (const [connector, runner] of this.runners.entries()) {
      results[connector] = await runner.runChecks();
    }

    const allHealthy = Object.values(results).every(r => r.healthy);

    return {
      healthy: allHealthy,
      timestamp: new Date().toISOString(),
      connectors: results
    };
  }

  /**
   * Get health status for a specific connector
   */
  async getConnectorHealth(connector: string): Promise<HealthStatus | null> {
    const runner = this.runners.get(connector);

    if (!runner) {
      return null;
    }

    return await runner.runChecks();
  }
}
