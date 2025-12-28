/**
 * Retry Handler with Exponential Backoff
 *
 * Implements retry logic with exponential backoff and jitter for HTTP requests.
 * Based on production patterns from:
 * - 014-DR-DSGN-connector-abstraction.md (Layer 3: HTTP Transport)
 * - 011-DR-PATT-production-connector-patterns.md (Retry patterns)
 *
 * @module @gwi/core/connectors/utils
 */

import { z } from 'zod';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Retry options configuration
 */
export const RetryOptionsSchema = z.object({
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: z.number().int().min(1).default(3),

  /** Initial delay in milliseconds (default: 1000ms = 1s) */
  initialDelayMs: z.number().int().min(0).default(1000),

  /** Maximum delay in milliseconds (default: 60000ms = 60s) */
  maxDelayMs: z.number().int().min(0).default(60000),

  /** Backoff multiplier (default: 2 for exponential) */
  backoffMultiplier: z.number().min(1).default(2),

  /** Maximum jitter in milliseconds (default: 1000ms) */
  maxJitterMs: z.number().int().min(0).default(1000),

  /** Custom predicate to determine if error is retryable */
  retryableErrorPredicate: z.function().args(z.unknown()).returns(z.boolean()).optional(),
});

export type RetryOptions = z.infer<typeof RetryOptionsSchema>;

/**
 * Retry metrics for observability
 */
export interface RetryMetrics {
  /** Total number of attempts made */
  totalAttempts: number;

  /** Total delay accumulated (ms) */
  totalDelayMs: number;

  /** Whether the operation ultimately succeeded */
  succeeded: boolean;

  /** Error that caused final failure (if any) */
  finalError?: Error;

  /** Timestamp when retry started */
  startedAt: string;

  /** Timestamp when retry completed */
  completedAt?: string;
}

/**
 * HTTP-like error with status code
 */
export interface HttpError extends Error {
  statusCode?: number;
  response?: {
    status?: number;
    headers?: Record<string, string>;
  };
}

// =============================================================================
// Retry Handler Implementation
// =============================================================================

/**
 * Interface for retry handler
 */
export interface IRetryHandler {
  /**
   * Retry a function with exponential backoff
   *
   * @param fn - Function to retry
   * @param options - Retry configuration
   * @returns Promise resolving to function result
   * @throws Error if all retries exhausted
   */
  retry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;

  /**
   * Get retry metrics for the last operation
   */
  getMetrics(): RetryMetrics | null;
}

/**
 * Exponential backoff retry handler with jitter
 */
export class ExponentialBackoffRetryHandler implements IRetryHandler {
  private lastMetrics: RetryMetrics | null = null;
  private readonly defaultOptions: RetryOptions;

  constructor(defaultOptions?: Partial<RetryOptions>) {
    this.defaultOptions = RetryOptionsSchema.parse(defaultOptions ?? {});
  }

  /**
   * Default predicate for retryable errors
   * Retries on:
   * - 429 (Rate Limit)
   * - 500, 502, 503, 504 (Server errors)
   * Does NOT retry on:
   * - 4xx (except 429) - Client errors
   * - Network errors (ECONNREFUSED, etc.) - these are retried
   */
  private defaultRetryableErrorPredicate(error: unknown): boolean {
    // Handle HTTP errors
    if (this.isHttpError(error)) {
      const status = error.statusCode ?? error.response?.status;
      if (status === undefined) {
        // Network error without status code - retry
        return true;
      }

      // Retry on rate limits and server errors
      if (status === 429) return true;
      if (status >= 500 && status <= 599) return true;

      // Don't retry on client errors (except 429)
      if (status >= 400 && status < 500) return false;
    }

    // Retry on network errors
    if (error instanceof Error) {
      const networkErrors = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ENETUNREACH',
      ];
      return networkErrors.some((code) => error.message.includes(code));
    }

    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Type guard for HTTP errors
   */
  private isHttpError(error: unknown): error is HttpError {
    return (
      error instanceof Error &&
      ('statusCode' in error || ('response' in error && typeof error.response === 'object'))
    );
  }

  /**
   * Calculate delay for a given attempt with exponential backoff and jitter
   *
   * Formula: min(initialDelay * (backoffMultiplier ^ attempt) + jitter, maxDelay)
   *
   * @param attempt - Current attempt number (0-indexed)
   * @param options - Retry options
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number, options: RetryOptions): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier, maxJitterMs } = options;

    // Exponential backoff: initialDelay * (multiplier ^ attempt)
    const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);

    // Add random jitter to prevent thundering herd
    const jitter = Math.random() * maxJitterMs;

    // Cap at maxDelay
    return Math.min(exponentialDelay + jitter, maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract Retry-After header value in milliseconds
   *
   * Supports both seconds (integer) and HTTP date formats
   *
   * @param error - Error that may contain Retry-After header
   * @returns Delay in milliseconds, or null if header not found
   */
  private getRetryAfterMs(error: unknown): number | null {
    if (!this.isHttpError(error)) return null;

    const retryAfterHeader = error.response?.headers?.['retry-after'];
    if (!retryAfterHeader) return null;

    // Try parsing as seconds (integer)
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP date
    const date = new Date(retryAfterHeader);
    if (!isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      return Math.max(delayMs, 0);
    }

    return null;
  }

  /**
   * Retry a function with exponential backoff
   */
  async retry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T> {
    const mergedOptions = RetryOptionsSchema.parse({
      ...this.defaultOptions,
      ...options,
    });

    const retryPredicate =
      mergedOptions.retryableErrorPredicate ?? this.defaultRetryableErrorPredicate.bind(this);

    const metrics: RetryMetrics = {
      totalAttempts: 0,
      totalDelayMs: 0,
      succeeded: false,
      startedAt: new Date().toISOString(),
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < mergedOptions.maxAttempts; attempt++) {
      metrics.totalAttempts++;

      try {
        const result = await fn();
        metrics.succeeded = true;
        metrics.completedAt = new Date().toISOString();
        this.lastMetrics = metrics;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!retryPredicate(error)) {
          // Not retryable - fail immediately
          metrics.finalError = lastError;
          metrics.completedAt = new Date().toISOString();
          this.lastMetrics = metrics;
          throw error;
        }

        // Last attempt - don't sleep, just throw
        if (attempt === mergedOptions.maxAttempts - 1) {
          metrics.finalError = lastError;
          metrics.completedAt = new Date().toISOString();
          this.lastMetrics = metrics;
          throw error;
        }

        // Calculate delay (respect Retry-After header if present)
        const retryAfterMs = this.getRetryAfterMs(error);
        const delayMs = retryAfterMs ?? this.calculateDelay(attempt, mergedOptions);

        metrics.totalDelayMs += delayMs;

        // Sleep before retrying
        await this.sleep(delayMs);
      }
    }

    // Should never reach here, but TypeScript needs this
    metrics.finalError = lastError;
    metrics.completedAt = new Date().toISOString();
    this.lastMetrics = metrics;
    throw lastError ?? new Error('Max retries exceeded');
  }

  /**
   * Get metrics from the last retry operation
   */
  getMetrics(): RetryMetrics | null {
    return this.lastMetrics;
  }
}

/**
 * Create a retry handler with default options
 */
export function createRetryHandler(options?: Partial<RetryOptions>): IRetryHandler {
  return new ExponentialBackoffRetryHandler(options);
}
