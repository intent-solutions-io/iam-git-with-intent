/**
 * Production Excellence Module
 *
 * Phase 50: Production hardening, health checks, and operational readiness.
 * Provides comprehensive production readiness verification and monitoring.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Readiness status
 */
export type ReadinessStatus = 'ready' | 'not_ready' | 'initializing' | 'shutting_down';

/**
 * Check type
 */
export type CheckType = 'liveness' | 'readiness' | 'startup' | 'dependency';

/**
 * Health check result for production excellence
 */
export interface ProdHealthCheckResult {
  name: string;
  status: HealthStatus;
  type: CheckType;
  message?: string;
  latencyMs: number;
  lastChecked: Date;
  consecutiveFailures: number;
  details?: Record<string, unknown>;
}

/**
 * System health
 */
export interface SystemHealth {
  status: HealthStatus;
  readiness: ReadinessStatus;
  version: string;
  uptime: number;
  checks: ProdHealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
  timestamp: Date;
}

/**
 * Operational metric
 */
export interface OperationalMetric {
  name: string;
  value: number;
  unit: string;
  threshold?: {
    warning: number;
    critical: number;
  };
  status: 'normal' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
}

/**
 * Production readiness check
 */
export interface ReadinessCheck {
  category: string;
  name: string;
  description: string;
  required: boolean;
  passed: boolean;
  message: string;
  remediation?: string;
}

/**
 * Production readiness report
 */
export interface ReadinessReport {
  id: string;
  environment: string;
  version: string;
  timestamp: Date;
  overall: 'ready' | 'not_ready' | 'requires_review';
  score: number;
  checks: ReadinessCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    requiredPassed: number;
    requiredFailed: number;
  };
  blockers: ReadinessCheck[];
  recommendations: string[];
}

/**
 * Graceful shutdown handler
 */
export interface ShutdownHandler {
  name: string;
  priority: number;
  timeout: number;
  handler: () => Promise<void>;
}

/**
 * Feature flag
 */
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  percentage?: number;
  environments: string[];
  userGroups?: string[];
  startDate?: Date;
  endDate?: Date;
}

/**
 * Circuit state for production excellence
 */
export type ProdCircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker config for production excellence
 */
export interface ProdCircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

/**
 * Circuit breaker status
 */
export interface ProdCircuitBreakerStatus {
  name: string;
  state: ProdCircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  lastStateChange: Date;
}

// =============================================================================
// Readiness Categories
// =============================================================================

/**
 * Readiness check categories
 */
export const READINESS_CATEGORIES = {
  INFRASTRUCTURE: 'infrastructure',
  SECURITY: 'security',
  OBSERVABILITY: 'observability',
  RESILIENCE: 'resilience',
  DOCUMENTATION: 'documentation',
  COMPLIANCE: 'compliance',
  PERFORMANCE: 'performance',
  OPERATIONS: 'operations',
} as const;

/**
 * Default readiness checks
 */
export const DEFAULT_READINESS_CHECKS: Omit<ReadinessCheck, 'passed' | 'message'>[] = [
  // Infrastructure
  { category: READINESS_CATEGORIES.INFRASTRUCTURE, name: 'Database Connection', description: 'Database is accessible', required: true },
  { category: READINESS_CATEGORIES.INFRASTRUCTURE, name: 'Cache Connection', description: 'Cache service is accessible', required: false },
  { category: READINESS_CATEGORIES.INFRASTRUCTURE, name: 'Queue Connection', description: 'Message queue is accessible', required: true },
  { category: READINESS_CATEGORIES.INFRASTRUCTURE, name: 'Storage Access', description: 'Object storage is accessible', required: true },

  // Security
  { category: READINESS_CATEGORIES.SECURITY, name: 'TLS Enabled', description: 'TLS/HTTPS is enabled', required: true },
  { category: READINESS_CATEGORIES.SECURITY, name: 'Secrets Management', description: 'Secrets are properly managed', required: true },
  { category: READINESS_CATEGORIES.SECURITY, name: 'Authentication', description: 'Authentication is configured', required: true },
  { category: READINESS_CATEGORIES.SECURITY, name: 'Authorization', description: 'Authorization rules are in place', required: true },

  // Observability
  { category: READINESS_CATEGORIES.OBSERVABILITY, name: 'Logging', description: 'Structured logging is enabled', required: true },
  { category: READINESS_CATEGORIES.OBSERVABILITY, name: 'Metrics', description: 'Metrics collection is enabled', required: true },
  { category: READINESS_CATEGORIES.OBSERVABILITY, name: 'Tracing', description: 'Distributed tracing is enabled', required: false },
  { category: READINESS_CATEGORIES.OBSERVABILITY, name: 'Alerting', description: 'Alerts are configured', required: true },

  // Resilience
  { category: READINESS_CATEGORIES.RESILIENCE, name: 'Health Checks', description: 'Health endpoints are available', required: true },
  { category: READINESS_CATEGORIES.RESILIENCE, name: 'Retry Logic', description: 'Retry policies are configured', required: true },
  { category: READINESS_CATEGORIES.RESILIENCE, name: 'Circuit Breakers', description: 'Circuit breakers are in place', required: true },
  { category: READINESS_CATEGORIES.RESILIENCE, name: 'Graceful Shutdown', description: 'Graceful shutdown is implemented', required: true },

  // Documentation
  { category: READINESS_CATEGORIES.DOCUMENTATION, name: 'API Documentation', description: 'API docs are available', required: false },
  { category: READINESS_CATEGORIES.DOCUMENTATION, name: 'Runbooks', description: 'Operational runbooks exist', required: true },
  { category: READINESS_CATEGORIES.DOCUMENTATION, name: 'Architecture Docs', description: 'Architecture is documented', required: false },

  // Compliance
  { category: READINESS_CATEGORIES.COMPLIANCE, name: 'Data Retention', description: 'Data retention policy is configured', required: true },
  { category: READINESS_CATEGORIES.COMPLIANCE, name: 'Audit Logging', description: 'Audit logs are enabled', required: true },
  { category: READINESS_CATEGORIES.COMPLIANCE, name: 'Privacy Controls', description: 'Privacy controls are in place', required: true },

  // Performance
  { category: READINESS_CATEGORIES.PERFORMANCE, name: 'Load Testing', description: 'Load testing completed', required: true },
  { category: READINESS_CATEGORIES.PERFORMANCE, name: 'Caching', description: 'Caching strategy implemented', required: false },
  { category: READINESS_CATEGORIES.PERFORMANCE, name: 'Rate Limiting', description: 'Rate limiting is configured', required: true },

  // Operations
  { category: READINESS_CATEGORIES.OPERATIONS, name: 'Deployment Pipeline', description: 'CI/CD pipeline is configured', required: true },
  { category: READINESS_CATEGORIES.OPERATIONS, name: 'Rollback Plan', description: 'Rollback procedure exists', required: true },
  { category: READINESS_CATEGORIES.OPERATIONS, name: 'Backup Strategy', description: 'Backups are configured', required: true },
];

// =============================================================================
// Production Excellence Manager
// =============================================================================

/**
 * Configuration for Production Excellence Manager
 */
export interface ProductionConfig {
  environment: string;
  version: string;
  healthCheckInterval: number;
  shutdownTimeout: number;
  enableFeatureFlags: boolean;
}

/**
 * Default production config
 */
export const DEFAULT_PRODUCTION_CONFIG: ProductionConfig = {
  environment: 'production',
  version: '1.0.0',
  healthCheckInterval: 30000,
  shutdownTimeout: 30000,
  enableFeatureFlags: true,
};

/**
 * Production Excellence Manager
 */
export class ProductionExcellenceManager {
  private config: ProductionConfig;
  private healthChecks = new Map<string, () => Promise<Omit<ProdHealthCheckResult, 'name' | 'type' | 'lastChecked'>>>();
  private healthResults = new Map<string, ProdHealthCheckResult>();
  private shutdownHandlers: ShutdownHandler[] = [];
  private featureFlags = new Map<string, FeatureFlag>();
  private circuitBreakers = new Map<string, ProdCircuitBreakerStatus>();
  private startTime = Date.now();
  private readinessState: ReadinessStatus = 'initializing';
  private reportCounter = 0;

  constructor(config: ProductionConfig = DEFAULT_PRODUCTION_CONFIG) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Health Checks
  // -------------------------------------------------------------------------

  /**
   * Register a health check
   */
  registerHealthCheck(
    name: string,
    type: CheckType,
    check: () => Promise<{ status: HealthStatus; message?: string; details?: Record<string, unknown> }>
  ): void {
    this.healthChecks.set(name, async () => {
      const startTime = Date.now();
      const result = await check();
      return {
        ...result,
        latencyMs: Date.now() - startTime,
        consecutiveFailures: 0,
      };
    });

    this.healthResults.set(name, {
      name,
      type,
      status: 'unknown',
      latencyMs: 0,
      lastChecked: new Date(0),
      consecutiveFailures: 0,
    });
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<SystemHealth> {
    const results: ProdHealthCheckResult[] = [];

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check();
        const previous = this.healthResults.get(name);
        const healthResult: ProdHealthCheckResult = {
          name,
          type: previous?.type || 'dependency',
          ...result,
          lastChecked: new Date(),
          consecutiveFailures: result.status === 'unhealthy'
            ? (previous?.consecutiveFailures || 0) + 1
            : 0,
        };
        this.healthResults.set(name, healthResult);
        results.push(healthResult);
      } catch (err) {
        const previous = this.healthResults.get(name);
        const errorResult: ProdHealthCheckResult = {
          name,
          type: previous?.type || 'dependency',
          status: 'unhealthy',
          message: err instanceof Error ? err.message : 'Check failed',
          latencyMs: 0,
          lastChecked: new Date(),
          consecutiveFailures: (previous?.consecutiveFailures || 0) + 1,
        };
        this.healthResults.set(name, errorResult);
        results.push(errorResult);
      }
    }

    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      degraded: results.filter((r) => r.status === 'degraded').length,
      unhealthy: results.filter((r) => r.status === 'unhealthy').length,
    };

    const overallStatus: HealthStatus =
      summary.unhealthy > 0 ? 'unhealthy' : summary.degraded > 0 ? 'degraded' : 'healthy';

    return {
      status: overallStatus,
      readiness: this.readinessState,
      version: this.config.version,
      uptime: Date.now() - this.startTime,
      checks: results,
      summary,
      timestamp: new Date(),
    };
  }

  /**
   * Get liveness status (is the app alive?)
   */
  async getLiveness(): Promise<{ alive: boolean; message?: string }> {
    const livenessChecks = Array.from(this.healthResults.values()).filter(
      (r) => r.type === 'liveness'
    );

    if (livenessChecks.length === 0) {
      return { alive: true, message: 'No liveness checks configured' };
    }

    const failed = livenessChecks.filter((r) => r.status === 'unhealthy');
    return {
      alive: failed.length === 0,
      message: failed.length > 0 ? `Failed: ${failed.map((f) => f.name).join(', ')}` : undefined,
    };
  }

  /**
   * Get readiness status (is the app ready to serve traffic?)
   */
  async getReadiness(): Promise<{ ready: boolean; message?: string }> {
    if (this.readinessState === 'shutting_down') {
      return { ready: false, message: 'Shutting down' };
    }

    if (this.readinessState === 'initializing') {
      return { ready: false, message: 'Initializing' };
    }

    const readinessChecks = Array.from(this.healthResults.values()).filter(
      (r) => r.type === 'readiness'
    );

    if (readinessChecks.length === 0) {
      return { ready: true, message: 'No readiness checks configured' };
    }

    const failed = readinessChecks.filter((r) => r.status === 'unhealthy');
    return {
      ready: failed.length === 0,
      message: failed.length > 0 ? `Failed: ${failed.map((f) => f.name).join(', ')}` : undefined,
    };
  }

  /**
   * Set readiness state
   */
  setReadinessState(state: ReadinessStatus): void {
    this.readinessState = state;
  }

  // -------------------------------------------------------------------------
  // Graceful Shutdown
  // -------------------------------------------------------------------------

  /**
   * Register shutdown handler
   */
  registerShutdownHandler(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler);
    this.shutdownHandlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown(): Promise<{ success: boolean; errors: string[] }> {
    this.readinessState = 'shutting_down';
    const errors: string[] = [];

    for (const handler of this.shutdownHandlers) {
      try {
        await Promise.race([
          handler.handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), handler.timeout)
          ),
        ]);
      } catch (err) {
        errors.push(`${handler.name}: ${err instanceof Error ? err.message : 'Failed'}`);
      }
    }

    return { success: errors.length === 0, errors };
  }

  // -------------------------------------------------------------------------
  // Production Readiness
  // -------------------------------------------------------------------------

  /**
   * Generate production readiness report
   */
  async generateReadinessReport(
    checkResults: Map<string, boolean>
  ): Promise<ReadinessReport> {
    const checks: ReadinessCheck[] = DEFAULT_READINESS_CHECKS.map((check) => {
      const passed = checkResults.get(check.name) ?? false;
      return {
        ...check,
        passed,
        message: passed ? 'Passed' : 'Failed',
        remediation: passed ? undefined : `Configure ${check.name.toLowerCase()}`,
      };
    });

    const passed = checks.filter((c) => c.passed);
    const failed = checks.filter((c) => !c.passed);
    const requiredPassed = checks.filter((c) => c.required && c.passed);
    const requiredFailed = checks.filter((c) => c.required && !c.passed);

    const score = Math.round((passed.length / checks.length) * 100);

    let overall: ReadinessReport['overall'];
    if (requiredFailed.length === 0 && score >= 80) {
      overall = 'ready';
    } else if (requiredFailed.length === 0) {
      overall = 'requires_review';
    } else {
      overall = 'not_ready';
    }

    const recommendations: string[] = [];
    if (requiredFailed.length > 0) {
      recommendations.push(`Fix ${requiredFailed.length} required checks before deployment`);
    }
    if (score < 80) {
      recommendations.push('Consider addressing optional checks to improve readiness score');
    }

    return {
      id: `report_${++this.reportCounter}`,
      environment: this.config.environment,
      version: this.config.version,
      timestamp: new Date(),
      overall,
      score,
      checks,
      summary: {
        total: checks.length,
        passed: passed.length,
        failed: failed.length,
        requiredPassed: requiredPassed.length,
        requiredFailed: requiredFailed.length,
      },
      blockers: requiredFailed,
      recommendations,
    };
  }

  // -------------------------------------------------------------------------
  // Feature Flags
  // -------------------------------------------------------------------------

  /**
   * Register feature flag
   */
  registerFeatureFlag(flag: FeatureFlag): void {
    this.featureFlags.set(flag.name, flag);
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(name: string, context?: { userId?: string; environment?: string }): boolean {
    if (!this.config.enableFeatureFlags) return false;

    const flag = this.featureFlags.get(name);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check environment
    if (
      flag.environments.length > 0 &&
      context?.environment &&
      !flag.environments.includes(context.environment)
    ) {
      return false;
    }

    // Check date range
    const now = new Date();
    if (flag.startDate && now < flag.startDate) return false;
    if (flag.endDate && now > flag.endDate) return false;

    // Check percentage rollout
    if (flag.percentage !== undefined && flag.percentage < 100) {
      if (!context?.userId) return false;
      const hash = this.hashString(context.userId + name);
      return hash % 100 < flag.percentage;
    }

    return true;
  }

  /**
   * List all feature flags
   */
  listFeatureFlags(): FeatureFlag[] {
    return Array.from(this.featureFlags.values());
  }

  // -------------------------------------------------------------------------
  // Circuit Breakers
  // -------------------------------------------------------------------------

  /**
   * Register circuit breaker
   */
  registerCircuitBreaker(config: ProdCircuitBreakerConfig): void {
    this.circuitBreakers.set(config.name, {
      name: config.name,
      state: 'closed',
      failures: 0,
      successes: 0,
      lastStateChange: new Date(),
    });
  }

  /**
   * Record circuit breaker success
   */
  recordSuccess(name: string): void {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) return;

    breaker.successes++;
    breaker.lastSuccess = new Date();

    if (breaker.state === 'half_open') {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.lastStateChange = new Date();
    }
  }

  /**
   * Record circuit breaker failure
   */
  recordFailure(name: string, threshold: number): void {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= threshold && breaker.state === 'closed') {
      breaker.state = 'open';
      breaker.lastStateChange = new Date();
    }
  }

  /**
   * Check if circuit is open
   */
  isCircuitOpen(name: string): boolean {
    const breaker = this.circuitBreakers.get(name);
    return breaker?.state === 'open';
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(name: string): ProdCircuitBreakerStatus | null {
    return this.circuitBreakers.get(name) || null;
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllCircuitBreakerStatuses(): ProdCircuitBreakerStatus[] {
    return Array.from(this.circuitBreakers.values());
  }

  // -------------------------------------------------------------------------
  // Operational Metrics
  // -------------------------------------------------------------------------

  /**
   * Get operational metrics
   */
  getOperationalMetrics(): OperationalMetric[] {
    const health = Array.from(this.healthResults.values());
    const breakers = this.getAllCircuitBreakerStatuses();

    return [
      {
        name: 'uptime_seconds',
        value: Math.floor((Date.now() - this.startTime) / 1000),
        unit: 'seconds',
        status: 'normal',
        trend: 'up',
      },
      {
        name: 'health_check_count',
        value: health.length,
        unit: 'checks',
        status: 'normal',
      },
      {
        name: 'healthy_services',
        value: health.filter((h) => h.status === 'healthy').length,
        unit: 'services',
        threshold: { warning: health.length - 1, critical: health.length - 2 },
        status: health.every((h) => h.status === 'healthy') ? 'normal' : 'warning',
      },
      {
        name: 'circuit_breakers_open',
        value: breakers.filter((b) => b.state === 'open').length,
        unit: 'circuits',
        threshold: { warning: 1, critical: 2 },
        status: breakers.some((b) => b.state === 'open') ? 'warning' : 'normal',
      },
      {
        name: 'feature_flags_enabled',
        value: this.listFeatureFlags().filter((f) => f.enabled).length,
        unit: 'flags',
        status: 'normal',
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Production Excellence Manager
 */
export function createProductionExcellenceManager(
  config: Partial<ProductionConfig> = {}
): ProductionExcellenceManager {
  return new ProductionExcellenceManager({ ...DEFAULT_PRODUCTION_CONFIG, ...config });
}
