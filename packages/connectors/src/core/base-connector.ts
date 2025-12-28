import type { IConnector } from '../interfaces/IConnector.js';
import type {
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from '../interfaces/types.js';
import { ConnectorError } from '../errors/index.js';

/**
 * Retry options for BaseConnector.retryRequest
 */
export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: (error: any) => boolean;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: (error: any) => {
    // Retry on network errors and 5xx status codes
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      (error.statusCode >= 500 && error.statusCode < 600)
    );
  }
};

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  child(context: Record<string, any>): ILogger;
}

/**
 * Metrics interface for dependency injection
 */
export interface IMetrics {
  increment(name: string, value?: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Simple console logger implementation
 */
export class ConsoleLogger implements ILogger {
  constructor(private context: Record<string, any> = {}) {}

  private log(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({
      level,
      message,
      timestamp,
      ...this.context,
      ...meta
    }));
  }

  debug(message: string, meta?: any): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: any): void {
    this.log('error', message, meta);
  }

  child(context: Record<string, any>): ILogger {
    return new ConsoleLogger({ ...this.context, ...context });
  }
}

/**
 * Simple no-op metrics implementation
 */
export class NoOpMetrics implements IMetrics {
  increment(): void {}
  gauge(): void {}
  histogram(): void {}
}

/**
 * Sync result returned by lifecycle hooks
 */
export interface SyncResult {
  cursor: string | null;
  recordsProcessed: number;
  errors: Error[];
  metadata?: Record<string, any>;
}

/**
 * BaseConnector provides shared utilities and enforces lifecycle for all connectors.
 *
 * Responsibilities:
 * 1. Lifecycle management (onBeforeSync, onAfterSync, onError)
 * 2. Error handling with standardized wrapping
 * 3. Retry logic with exponential backoff and jitter
 * 4. Rate limiting awareness
 * 5. Structured logging with context
 * 6. Metrics instrumentation
 *
 * Connectors extending BaseConnector must implement:
 * - authenticate()
 * - healthCheck()
 * - sync()
 * - processWebhook()
 */
export abstract class BaseConnector implements IConnector {
  // Abstract properties (must be defined by subclass)
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly configSchema: any;

  // Dependencies (injected via constructor)
  protected logger: ILogger;
  protected metrics: IMetrics;

  constructor(
    logger?: ILogger,
    metrics?: IMetrics
  ) {
    this.logger = logger || new ConsoleLogger({ connector: 'BaseConnector' });
    this.metrics = metrics || new NoOpMetrics();
  }

  // Abstract methods (must be implemented by subclass)
  abstract authenticate(config: ConnectorConfig): Promise<AuthResult>;
  abstract healthCheck(): Promise<HealthStatus>;
  abstract sync(options: SyncOptions): AsyncIterator<ConnectorRecord>;
  abstract processWebhook(event: WebhookEvent): Promise<WebhookResult>;
  abstract getMetadata(): ConnectorMetadata;

  // ============================================================================
  // Lifecycle Hooks (optional to override)
  // ============================================================================

  /**
   * Called before sync starts.
   * Default: Log sync start.
   */
  protected async onBeforeSync(options: SyncOptions): Promise<void> {
    this.logger.info('Starting sync', { options });
  }

  /**
   * Called after sync completes successfully.
   * Default: Log sync completion.
   */
  protected async onAfterSync(result: SyncResult): Promise<void> {
    this.logger.info('Sync completed', {
      recordsProcessed: result.recordsProcessed,
      cursor: result.cursor,
      errors: result.errors.length
    });

    this.metrics.increment('connector.sync.completed_total', 1, {
      connector: this.name
    });

    this.metrics.gauge('connector.sync.records_processed', result.recordsProcessed, {
      connector: this.name
    });
  }

  /**
   * Called when an error occurs during sync.
   * Default: Log error and record metric.
   */
  protected async onError(error: Error, context?: any): Promise<void> {
    this.logger.error('Connector error', {
      error: error.message,
      stack: error.stack,
      context
    });

    this.metrics.increment('connector.errors_total', 1, {
      connector: this.name,
      error_type: error.constructor.name
    });
  }

  /**
   * Called when rate limit is encountered.
   * Default: Wait for retry-after duration.
   */
  protected async onRateLimit(retryAfterMs: number): Promise<void> {
    this.logger.warn('Rate limited, waiting', { waitMs: retryAfterMs });

    this.metrics.increment('connector.rate_limit_total', 1, {
      connector: this.name
    });

    await this.sleep(retryAfterMs);
  }

  // ============================================================================
  // Shared Utilities
  // ============================================================================

  /**
   * Retry a request with exponential backoff and jitter.
   *
   * @param fn - Function to retry
   * @param options - Retry options (optional)
   * @returns Result of successful request
   * @throws {Error} If max retries exceeded
   */
  protected async retryRequest<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let attempt = 0;
    let lastError: any;

    while (attempt < opts.maxAttempts) {
      try {
        const result = await fn();

        // Record success metric
        if (attempt > 0) {
          this.metrics.increment('connector.retry.success_total', 1, {
            connector: this.name,
            attempts: attempt.toString()
          });
        }

        return result;
      } catch (error: any) {
        lastError = error;
        attempt++;

        // Check if error is retryable
        const isRetryable = opts.retryableErrors?.(error) ?? true;
        if (!isRetryable || attempt >= opts.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = Math.min(
          opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
          opts.maxDelayMs
        );
        const jitter = Math.random() * 1000; // 0-1000ms jitter
        const delayMs = baseDelay + jitter;

        this.logger.warn('Request failed, retrying', {
          attempt,
          maxAttempts: opts.maxAttempts,
          delayMs,
          error: error.message
        });

        // Record retry metric
        this.metrics.increment('connector.retry.attempts_total', 1, {
          connector: this.name,
          attempt: attempt.toString()
        });

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    // Max retries exceeded
    this.metrics.increment('connector.retry.exhausted_total', 1, {
      connector: this.name
    });

    throw new Error(
      `Max retries exceeded (${opts.maxAttempts}): ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Check if response indicates rate limiting and extract retry-after duration.
   *
   * @param response - HTTP response object
   * @returns Retry-after duration in milliseconds, or null if not rate limited
   */
  protected checkRateLimit(response: any): number | null {
    // Check for 429 status code
    if (response.status === 429 || response.statusCode === 429) {
      // Try to extract retry-after header
      const retryAfter =
        response.headers?.['retry-after'] ||
        response.headers?.['Retry-After'] ||
        response.headers?.['x-ratelimit-reset'];

      if (retryAfter) {
        // Parse retry-after (can be seconds or timestamp)
        const parsed = parseInt(retryAfter);
        if (parsed > 1000000000) {
          // Timestamp (Unix epoch)
          return Math.max(0, parsed * 1000 - Date.now());
        } else {
          // Seconds
          return parsed * 1000;
        }
      }

      // Default to 60 seconds if no header
      return 60000;
    }

    return null;
  }

  /**
   * Handle error with standardized wrapping and logging.
   *
   * @param error - Error to handle
   * @param context - Additional context
   * @throws {ConnectorError} Always throws wrapped error
   */
  protected handleError(error: any, context?: any): never {
    // Wrap unknown errors
    if (!(error instanceof ConnectorError)) {
      error = new ConnectorError(
        error.message || 'Unknown error',
        this.name,
        { originalError: error, ...context }
      );
    }

    // Call lifecycle hook
    void this.onError(error, context);

    // Re-throw
    throw error;
  }

  /**
   * Log a message with connector context.
   *
   * @param level - Log level
   * @param message - Log message
   * @param meta - Additional metadata
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void {
    this.logger[level](message, meta);
  }

  /**
   * Record a metric.
   *
   * @param name - Metric name
   * @param value - Metric value
   * @param labels - Metric labels
   */
  protected recordMetric(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    this.metrics.histogram(name, value, {
      connector: this.name,
      ...labels
    });
  }

  /**
   * Sleep for a specified duration.
   *
   * @param ms - Duration in milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
