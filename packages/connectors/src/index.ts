// Core interfaces and types (primary exports)
export * from './interfaces/index.js';

// Base connector class
export { BaseConnector, ConsoleLogger, NoOpMetrics } from './core/base-connector.js';
export type { RetryOptions, SyncResult, ILogger, IMetrics } from './core/base-connector.js';

// Authentication strategies (re-export with explicit names to avoid conflicts)
export {
  BearerTokenAuth,
  OAuth2Auth,
  ServiceAccountAuth
} from './auth/index.js';
export type { IAuthStrategy, AuthState } from './auth/IAuthStrategy.js';

// Secret management
export * from './secrets/index.js';

// Observability (logging, metrics, health)
export { HealthCheckRunner, HealthCheckAPI } from './observability/health-check.js';
export { StructuredLogger } from './observability/ILogger.js';
export { PrometheusMetrics } from './observability/IMetrics.js';

// Error types
export * from './errors/index.js';

// Connector registry
export * from './registry/index.js';

// Connector implementations
export * from './github/index.js';
export * from './slack/index.js';
export * from './gitlab/index.js';
export * from './jira/index.js';
export * from './linear/index.js';
export * from './vertex-ai/index.js';
export * from './fivetran/index.js';
