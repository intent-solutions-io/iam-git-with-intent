/**
 * Structured Logger Module
 *
 * Phase 23: Production Observability
 *
 * Provides structured JSON logging with:
 * - Automatic telemetry context injection
 * - Secret/token redaction
 * - Cloud Logging compatible format
 * - Consistent field names
 *
 * @module @gwi/core/telemetry/logger
 */

import { getCurrentContext, type TelemetryContext, type Severity } from './context.js';

// =============================================================================
// Logger Configuration
// =============================================================================

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Service name for identification */
  serviceName: string;
  /** Minimum severity to log */
  minSeverity?: Severity;
  /** Whether to pretty print (for development) */
  prettyPrint?: boolean;
  /** Additional default fields */
  defaultFields?: Record<string, unknown>;
  /** Custom redaction patterns */
  redactionPatterns?: RegExp[];
}

/**
 * Default redaction patterns for sensitive data
 */
const DEFAULT_REDACTION_PATTERNS: RegExp[] = [
  // API keys and tokens
  /sk-[a-zA-Z0-9-_]{20,}/g,          // Anthropic API keys
  /ghp_[a-zA-Z0-9]{36}/g,            // GitHub personal access tokens
  /gho_[a-zA-Z0-9]{36}/g,            // GitHub OAuth tokens
  /github_pat_[a-zA-Z0-9_]{22,}/g,   // GitHub fine-grained PATs
  /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, // Bearer tokens
  /Authorization:\s*[^\s,;]+/gi,      // Authorization headers

  // Secrets
  /password['":\s]*[=:]\s*['"]?[^'"\s,}{]+['"]?/gi,
  /secret['":\s]*[=:]\s*['"]?[^'"\s,}{]+['"]?/gi,
  /api[_-]?key['":\s]*[=:]\s*['"]?[^'"\s,}{]+['"]?/gi,

  // Webhook secrets
  /whsec_[a-zA-Z0-9]{24,}/g,         // Stripe webhook secrets

  // Private keys
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
];

/**
 * Severity level ordering (higher = more severe)
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  DEBUG: 0,
  INFO: 1,
  NOTICE: 2,
  WARNING: 3,
  ERROR: 4,
  CRITICAL: 5,
  ALERT: 6,
  EMERGENCY: 7,
};

// =============================================================================
// Log Entry Types
// =============================================================================

/**
 * Structured log entry
 */
export interface LogEntry {
  // Required fields
  severity: Severity;
  message: string;
  timestamp: string;

  // Service identification
  'logging.googleapis.com/labels'?: {
    service: string;
    version?: string;
    environment?: string;
  };

  // Trace correlation (Cloud Trace format)
  'logging.googleapis.com/trace'?: string;
  'logging.googleapis.com/spanId'?: string;
  'logging.googleapis.com/trace_sampled'?: boolean;

  // HTTP request info
  httpRequest?: {
    requestMethod?: string;
    requestUrl?: string;
    userAgent?: string;
    latency?: string;
    status?: number;
  };

  // Context fields
  tenantId?: string;
  runId?: string;
  workItemId?: string;
  candidateId?: string;
  requestId?: string;
  eventName?: string;

  // Actor
  actor?: {
    type: string;
    id?: string;
  };

  // Error details
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };

  // Additional data
  [key: string]: unknown;
}

// =============================================================================
// Logger Class
// =============================================================================

/**
 * Structured logger with telemetry context integration
 */
export class Logger {
  private config: Required<LoggerConfig>;
  private redactionPatterns: RegExp[];

  constructor(config: LoggerConfig) {
    this.config = {
      serviceName: config.serviceName,
      minSeverity: config.minSeverity ?? 'DEBUG',
      prettyPrint: config.prettyPrint ?? (process.env.NODE_ENV === 'development'),
      defaultFields: config.defaultFields ?? {},
      redactionPatterns: config.redactionPatterns ?? [],
    };
    this.redactionPatterns = [...DEFAULT_REDACTION_PATTERNS, ...this.config.redactionPatterns];
  }

  // ===========================================================================
  // Log Methods
  // ===========================================================================

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO', message, data);
  }

  notice(message: string, data?: Record<string, unknown>): void {
    this.log('NOTICE', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARNING', message, data);
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData = this.formatError(error);
    this.log('ERROR', message, { ...data, ...errorData });
  }

  critical(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData = this.formatError(error);
    this.log('CRITICAL', message, { ...data, ...errorData });
  }

  // ===========================================================================
  // Specialized Logging Methods
  // ===========================================================================

  /**
   * Log request start
   */
  requestStart(method: string, path: string, data?: Record<string, unknown>): void {
    this.info('Request started', {
      eventName: 'request.start',
      httpMethod: method,
      httpPath: path,
      ...data,
    });
  }

  /**
   * Log request end
   */
  requestEnd(
    method: string,
    path: string,
    status: number,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    const severity: Severity = status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO';
    this.log(severity, 'Request completed', {
      eventName: 'request.end',
      httpMethod: method,
      httpPath: path,
      httpStatus: status,
      durationMs,
      httpRequest: {
        requestMethod: method,
        requestUrl: path,
        status,
        latency: `${durationMs / 1000}s`,
      },
      ...data,
    });
  }

  /**
   * Log job processing start
   */
  jobStart(jobType: string, jobId: string, data?: Record<string, unknown>): void {
    this.info('Job started', {
      eventName: 'job.start',
      jobType,
      jobId,
      ...data,
    });
  }

  /**
   * Log job processing end
   */
  jobEnd(
    jobType: string,
    jobId: string,
    success: boolean,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    const severity: Severity = success ? 'INFO' : 'ERROR';
    this.log(severity, `Job ${success ? 'completed' : 'failed'}`, {
      eventName: success ? 'job.success' : 'job.failure',
      jobType,
      jobId,
      durationMs,
      ...data,
    });
  }

  /**
   * Log connector invocation
   */
  connectorInvoke(
    connectorId: string,
    toolName: string,
    durationMs: number,
    success: boolean,
    data?: Record<string, unknown>
  ): void {
    const severity: Severity = success ? 'INFO' : 'WARNING';
    this.log(severity, `Connector tool ${success ? 'succeeded' : 'failed'}`, {
      eventName: success ? 'connector.success' : 'connector.failure',
      connectorId,
      toolName,
      durationMs,
      ...data,
    });
  }

  /**
   * Log webhook event
   */
  webhookReceived(eventType: string, deliveryId: string, data?: Record<string, unknown>): void {
    this.info('Webhook received', {
      eventName: 'webhook.received',
      webhookEventType: eventType,
      webhookDeliveryId: deliveryId,
      ...data,
    });
  }

  /**
   * Log webhook verification
   */
  webhookVerify(success: boolean, data?: Record<string, unknown>): void {
    const severity: Severity = success ? 'DEBUG' : 'WARNING';
    this.log(severity, `Webhook signature ${success ? 'valid' : 'invalid'}`, {
      eventName: success ? 'webhook.verify.success' : 'webhook.verify.failure',
      ...data,
    });
  }

  /**
   * Log plan limit enforcement
   */
  planLimitEnforced(
    resource: string,
    allowed: boolean,
    current: number,
    limit: number,
    data?: Record<string, unknown>
  ): void {
    const severity: Severity = allowed ? 'DEBUG' : 'WARNING';
    this.log(severity, `Plan limit ${allowed ? 'check passed' : 'exceeded'}`, {
      eventName: allowed ? 'plan.limit.ok' : 'plan.limit.exceeded',
      resource,
      limitCurrent: current,
      limitMax: limit,
      limitAllowed: allowed,
      ...data,
    });
  }

  /**
   * Log queue publish
   */
  queuePublish(topic: string, messageId: string, data?: Record<string, unknown>): void {
    this.debug('Message published to queue', {
      eventName: 'queue.publish',
      queueTopic: topic,
      messageId,
      ...data,
    });
  }

  /**
   * Log DLQ delivery
   */
  dlqDelivery(topic: string, reason: string, data?: Record<string, unknown>): void {
    this.warn('Message sent to DLQ', {
      eventName: 'dlq.delivery',
      queueTopic: topic,
      dlqReason: reason,
      ...data,
    });
  }

  // ===========================================================================
  // Core Logging
  // ===========================================================================

  private log(severity: Severity, message: string, data?: Record<string, unknown>): void {
    // Check minimum severity
    if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[this.config.minSeverity]) {
      return;
    }

    // Get telemetry context
    const ctx = getCurrentContext();

    // Build log entry
    const entry = this.buildLogEntry(severity, message, ctx, data);

    // Redact sensitive data
    const redacted = this.redact(entry);

    // Output
    this.output(redacted);
  }

  private buildLogEntry(
    severity: Severity,
    message: string,
    ctx: TelemetryContext | undefined,
    data?: Record<string, unknown>
  ): LogEntry {
    const projectId = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;

    const entry: LogEntry = {
      severity,
      message,
      timestamp: new Date().toISOString(),

      // Service labels
      'logging.googleapis.com/labels': {
        service: this.config.serviceName,
        version: ctx?.serviceVersion || process.env.APP_VERSION,
        environment: ctx?.environment || process.env.DEPLOYMENT_ENV,
      },

      // Default fields
      ...this.config.defaultFields,
    };

    // Add trace correlation if context exists
    if (ctx) {
      if (projectId) {
        entry['logging.googleapis.com/trace'] = `projects/${projectId}/traces/${ctx.traceId}`;
      }
      entry['logging.googleapis.com/spanId'] = ctx.spanId;
      entry['logging.googleapis.com/trace_sampled'] = true;

      // Add context fields
      if (ctx.tenantId) entry.tenantId = ctx.tenantId;
      if (ctx.runId) entry.runId = ctx.runId;
      if (ctx.workItemId) entry.workItemId = ctx.workItemId;
      if (ctx.candidateId) entry.candidateId = ctx.candidateId;
      if (ctx.requestId) entry.requestId = ctx.requestId;
      if (ctx.eventName) entry.eventName = ctx.eventName;
      if (ctx.actor) entry.actor = { type: ctx.actor.type, id: ctx.actor.id };
    }

    // Merge additional data
    if (data) {
      Object.assign(entry, data);
    }

    return entry;
  }

  private formatError(error: Error | unknown): Record<string, unknown> {
    if (!error) return {};

    if (error instanceof Error) {
      return {
        error: {
          message: error.message,
          stack: error.stack,
          code: (error as NodeJS.ErrnoException).code,
        },
      };
    }

    return {
      error: {
        message: String(error),
      },
    };
  }

  private redact(entry: LogEntry): LogEntry {
    const json = JSON.stringify(entry);
    let redacted = json;

    for (const pattern of this.redactionPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return JSON.parse(redacted);
  }

  private output(entry: LogEntry): void {
    const output = this.config.prettyPrint
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    // Use appropriate console method based on severity
    switch (entry.severity) {
      case 'ERROR':
      case 'CRITICAL':
      case 'ALERT':
      case 'EMERGENCY':
        console.error(output);
        break;
      case 'WARNING':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  // ===========================================================================
  // Child Logger
  // ===========================================================================

  /**
   * Create a child logger with additional default fields
   */
  child(additionalFields: Record<string, unknown>): Logger {
    return new Logger({
      ...this.config,
      defaultFields: {
        ...this.config.defaultFields,
        ...additionalFields,
      },
    });
  }
}

// =============================================================================
// Singleton Logger
// =============================================================================

let defaultLogger: Logger | null = null;

/**
 * Get the default logger instance
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({
      serviceName: process.env.APP_NAME || 'gwi',
      minSeverity: (process.env.LOG_LEVEL as Severity) || 'INFO',
      prettyPrint: process.env.NODE_ENV === 'development',
    });
  }
  return defaultLogger;
}

/**
 * Set a custom default logger
 */
export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * Create a logger for a specific service
 */
export function createLogger(serviceName: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({
    serviceName,
    ...config,
  });
}

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Log at debug level using default logger
 */
export function debug(message: string, data?: Record<string, unknown>): void {
  getLogger().debug(message, data);
}

/**
 * Log at info level using default logger
 */
export function info(message: string, data?: Record<string, unknown>): void {
  getLogger().info(message, data);
}

/**
 * Log at warning level using default logger
 */
export function warn(message: string, data?: Record<string, unknown>): void {
  getLogger().warn(message, data);
}

/**
 * Log at error level using default logger
 */
export function error(message: string, err?: Error | unknown, data?: Record<string, unknown>): void {
  getLogger().error(message, err, data);
}
