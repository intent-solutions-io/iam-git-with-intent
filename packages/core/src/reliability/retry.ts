/**
 * Retry and Backoff Utilities
 *
 * Phase 30: Reliability & Scaling
 *
 * Provides:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Retry decorator/wrapper
 * - Integration with GwiError taxonomy
 *
 * @module @gwi/core/reliability/retry
 */

import { GwiError, RetryableError, isRetryable } from './errors.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('retry');

// =============================================================================
// Retry Configuration
// =============================================================================

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;

  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs: number;

  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs: number;

  /** Backoff multiplier (default: 2.0) */
  backoffMultiplier: number;

  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitterFactor: number;

  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;

  /** Callback before each retry attempt */
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;

  /** Timeout for entire retry operation in ms (default: none) */
  timeoutMs?: number;

  /** Abort signal to cancel retries */
  signal?: AbortSignal;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2.0,
  jitterFactor: 0.1,
};

/**
 * Preset retry configurations for common use cases
 */
export const RETRY_PRESETS = {
  /** Fast retry for simple operations */
  fast: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2.0,
    jitterFactor: 0.1,
  } as RetryConfig,

  /** Standard retry for API calls */
  standard: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2.0,
    jitterFactor: 0.1,
  } as RetryConfig,

  /** Patient retry for critical operations */
  patient: {
    maxAttempts: 5,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2.0,
    jitterFactor: 0.2,
  } as RetryConfig,

  /** Aggressive retry for high-availability */
  aggressive: {
    maxAttempts: 10,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.3,
  } as RetryConfig,
} as const;

// =============================================================================
// Retry Result
// =============================================================================

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;

  /** The result if successful */
  result?: T;

  /** The final error if all retries failed */
  error?: Error;

  /** Number of attempts made */
  attempts: number;

  /** Total time spent in ms */
  totalTimeMs: number;

  /** Errors from each failed attempt */
  attemptErrors: Array<{
    attempt: number;
    error: Error;
    delayMs: number;
  }>;
}

// =============================================================================
// Backoff Calculation
// =============================================================================

/**
 * Calculate delay for a given retry attempt with exponential backoff and jitter
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter: delay * (1 - jitter + random * 2 * jitter)
  // This gives us a range of [delay * (1 - jitter), delay * (1 + jitter)]
  const jitter = config.jitterFactor * (2 * Math.random() - 1);
  const jitteredDelay = cappedDelay * (1 + jitter);

  return Math.round(jitteredDelay);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Retry aborted'));
      });
    }
  });
}

// =============================================================================
// Retry Functions
// =============================================================================

/**
 * Execute an async function with retry logic
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration (partial, merged with defaults)
 * @returns Promise that resolves with the function result or rejects with final error
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 5 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();

  const shouldRetry = fullConfig.isRetryable ?? isRetryable;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    // Check timeout
    if (fullConfig.timeoutMs && Date.now() - startTime > fullConfig.timeoutMs) {
      throw new RetryableError('Retry timeout exceeded', 'TIMEOUT', {
        context: {
          attempts: attempt,
          timeoutMs: fullConfig.timeoutMs,
          elapsedMs: Date.now() - startTime,
        },
      });
    }

    // Check abort signal
    if (fullConfig.signal?.aborted) {
      throw new Error('Retry aborted');
    }

    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt >= fullConfig.maxAttempts - 1;
      const errorRetryable = shouldRetry(error);

      // Log the error
      logger.warn('Retry attempt failed', {
        attempt: attempt + 1,
        maxAttempts: fullConfig.maxAttempts,
        retryable: errorRetryable,
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't retry if not retryable or last attempt
      if (!errorRetryable || isLastAttempt) {
        throw error;
      }

      // Calculate delay
      const delayMs = calculateBackoff(attempt, fullConfig);

      // Call retry callback if provided
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt + 1, error, delayMs);
      }

      // Wait before next attempt
      await sleep(delayMs, fullConfig.signal);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('Retry exhausted');
}

/**
 * Execute an async function with retry logic and return detailed result
 *
 * Unlike `retry()`, this function never throws and returns a result object
 * with success/failure information and attempt history.
 *
 * @example
 * ```typescript
 * const result = await retryWithResult(
 *   () => fetch('https://api.example.com/data'),
 *   RETRY_PRESETS.patient
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.result);
 * } else {
 *   console.log('Failed after', result.attempts, 'attempts');
 *   console.log('Errors:', result.attemptErrors);
 * }
 * ```
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();
  const attemptErrors: RetryResult<T>['attemptErrors'] = [];

  const shouldRetry = fullConfig.isRetryable ?? isRetryable;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    // Check timeout
    if (fullConfig.timeoutMs && Date.now() - startTime > fullConfig.timeoutMs) {
      return {
        success: false,
        error: new RetryableError('Retry timeout exceeded', 'TIMEOUT'),
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
        attemptErrors,
      };
    }

    // Check abort signal
    if (fullConfig.signal?.aborted) {
      return {
        success: false,
        error: new Error('Retry aborted'),
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
        attemptErrors,
      };
    }

    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
        attemptErrors,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const delayMs = calculateBackoff(attempt, fullConfig);

      attemptErrors.push({
        attempt: attempt + 1,
        error: err,
        delayMs,
      });

      const isLastAttempt = attempt >= fullConfig.maxAttempts - 1;
      const errorRetryable = shouldRetry(error);

      // Don't retry if not retryable or last attempt
      if (!errorRetryable || isLastAttempt) {
        return {
          success: false,
          error: err,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
          attemptErrors,
        };
      }

      // Call retry callback if provided
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt + 1, error, delayMs);
      }

      // Wait before next attempt
      try {
        await sleep(delayMs, fullConfig.signal);
      } catch {
        // Aborted during sleep
        return {
          success: false,
          error: new Error('Retry aborted'),
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
          attemptErrors,
        };
      }
    }
  }

  // Should never reach here
  return {
    success: false,
    error: new Error('Retry exhausted'),
    attempts: fullConfig.maxAttempts,
    totalTimeMs: Date.now() - startTime,
    attemptErrors,
  };
}

// =============================================================================
// Circuit Breaker
// =============================================================================

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;

  /** Time to wait before testing circuit in ms (default: 30000) */
  resetTimeoutMs: number;

  /** Number of successes needed to close circuit from half-open (default: 2) */
  successThreshold: number;

  /** Time window for failure counting in ms (default: 60000) */
  failureWindowMs: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  failureWindowMs: 60000,
};

/**
 * Circuit breaker for preventing cascading failures
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Circuit tripped, requests fail immediately
 * - half-open: Testing if service recovered
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('api-service');
 *
 * async function callApi() {
 *   return breaker.execute(async () => {
 *     return await fetch('https://api.example.com/data');
 *   });
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number[] = [];
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(
    public readonly name: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successCount: number;
    lastFailureTime: number;
  } {
    this.cleanupOldFailures();
    return {
      state: this.getState(),
      failures: this.failures.length,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState();

    if (this.state === 'open') {
      throw new GwiError(`Circuit breaker ${this.name} is open`, {
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
        retryAfterMs: this.config.resetTimeoutMs,
        context: {
          circuitBreaker: this.name,
          state: this.state,
        },
      });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Manually trip the circuit breaker
   */
  trip(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    logger.warn('Circuit breaker tripped manually', {
      name: this.name,
    });
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.successCount = 0;
    logger.info('Circuit breaker reset manually', {
      name: this.name,
    });
  }

  private updateState(): void {
    const now = Date.now();

    if (this.state === 'open') {
      // Check if enough time has passed to try again
      if (now - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
        logger.info('Circuit breaker transitioning to half-open', {
          name: this.name,
        });
      }
    }
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter(time => time > cutoff);
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = [];
        logger.info('Circuit breaker closed after recovery', {
          name: this.name,
        });
      }
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failures.push(now);

    this.cleanupOldFailures();

    if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.state = 'open';
      logger.warn('Circuit breaker re-opened from half-open', {
        name: this.name,
      });
    } else if (this.failures.length >= this.config.failureThreshold) {
      this.state = 'open';
      logger.warn('Circuit breaker opened due to failures', {
        name: this.name,
        failures: this.failures.length,
        threshold: this.config.failureThreshold,
      });
    }
  }
}

// =============================================================================
// Retry with Circuit Breaker
// =============================================================================

/**
 * Combined retry with circuit breaker for resilient operations
 *
 * @example
 * ```typescript
 * const resilient = new ResilientExecutor('api-service');
 *
 * const result = await resilient.execute(
 *   () => fetch('https://api.example.com/data'),
 *   RETRY_PRESETS.standard
 * );
 * ```
 */
export class ResilientExecutor {
  private circuitBreaker: CircuitBreaker;

  constructor(
    name: string,
    circuitConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.circuitBreaker = new CircuitBreaker(name, circuitConfig);
  }

  /**
   * Execute with both retry and circuit breaker
   */
  async execute<T>(
    fn: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return retry(fn, retryConfig);
    });
  }

  /**
   * Execute with result (never throws)
   */
  async executeWithResult<T>(
    fn: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>
  ): Promise<RetryResult<T>> {
    try {
      const result = await this.execute(fn, retryConfig);
      return {
        success: true,
        result,
        attempts: 1,
        totalTimeMs: 0,
        attemptErrors: [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: retryConfig?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
        totalTimeMs: 0,
        attemptErrors: [],
      };
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.circuitBreaker.reset();
  }
}

// =============================================================================
// Global Registry
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, config);
    circuitBreakers.set(name, breaker);
  }
  return breaker;
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear();
}
