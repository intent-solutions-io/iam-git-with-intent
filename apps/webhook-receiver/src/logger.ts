/**
 * Structured Logger for Webhook Receiver
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Outputs JSON-structured logs for Cloud Logging integration.
 *
 * @module @gwi/webhook-receiver/logger
 */

import type { ILogger } from './types.js';

/**
 * Log severity levels for Cloud Logging
 */
type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

/**
 * Create a structured log entry
 */
function createLogEntry(
  severity: Severity,
  message: string,
  context?: Record<string, unknown>
): string {
  const entry = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    service: 'webhook-receiver',
    ...context,
  };

  return JSON.stringify(entry);
}

/**
 * Structured logger for webhook receiver
 *
 * Outputs JSON-formatted logs compatible with Cloud Logging.
 */
export class StructuredLogger implements ILogger {
  private readonly context: Record<string, unknown>;

  constructor(context?: Record<string, unknown>) {
    this.context = context || {};
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...context,
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.log(createLogEntry('INFO', message, {
      ...this.context,
      ...context,
    }));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(createLogEntry('WARNING', message, {
      ...this.context,
      ...context,
    }));
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(createLogEntry('ERROR', message, {
      ...this.context,
      ...context,
    }));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    // Only log debug in non-production
    if (process.env.DEPLOYMENT_ENV !== 'prod') {
      console.log(createLogEntry('DEBUG', message, {
        ...this.context,
        ...context,
      }));
    }
  }
}

/**
 * Create a logger instance
 */
export function createLogger(context?: Record<string, unknown>): StructuredLogger {
  return new StructuredLogger({
    version: '0.1.0',
    ...context,
  });
}
