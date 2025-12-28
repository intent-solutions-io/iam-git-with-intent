/**
 * Logger interface for structured logging
 */
export interface ILogger {
  /**
   * Log debug message
   */
  debug(message: string, meta?: Record<string, any>): void;

  /**
   * Log info message
   */
  info(message: string, meta?: Record<string, any>): void;

  /**
   * Log warning message
   */
  warn(message: string, meta?: Record<string, any>): void;

  /**
   * Log error message
   */
  error(message: string, meta?: Record<string, any>): void;

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): ILogger;
}

/**
 * Structured logger implementation
 */
export class StructuredLogger implements ILogger {
  constructor(private readonly context: Record<string, any> = {}) {}

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }

  child(context: Record<string, any>): ILogger {
    return new StructuredLogger({ ...this.context, ...context });
  }

  private log(level: string, message: string, meta?: Record<string, any>): void {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...meta
    };

    // In production, this would send to Cloud Logging
    // For now, just log to console
    console.log(JSON.stringify(logEntry));
  }
}
