/**
 * Idempotency Service
 *
 * High-level API for idempotency checking in request handlers.
 * Integrates store and metrics into a single service.
 *
 * @module @gwi/engine/idempotency
 */

import type {
  IdempotencyKeyInput,
  IdempotencyCheckResult,
  IdempotencyConfig,
} from './types.js';
import { DEFAULT_IDEMPOTENCY_CONFIG } from './types.js';
import type { IdempotencyStore } from './store.js';
import { getIdempotencyStore } from './store.js';
import { getIdempotencyMetrics } from './metrics.js';

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Result of processing a request through the idempotency service
 */
export interface IdempotencyProcessResult<T> {
  /** Whether the request was actually processed (vs. deduplicated) */
  processed: boolean;

  /** The result (from processing or cache) */
  result: T;

  /** The run ID if one was created */
  runId?: string;

  /** The idempotency key used */
  key: string;
}

/**
 * Options for processing a request
 */
export interface ProcessOptions {
  /** Whether to wait for processing requests (default: false) */
  waitForProcessing?: boolean;

  /** Maximum wait time in ms (default: 30000) */
  waitTimeoutMs?: number;

  /** Poll interval when waiting (default: 1000) */
  pollIntervalMs?: number;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Idempotency service for request deduplication
 *
 * Usage:
 * ```typescript
 * const service = getIdempotencyService();
 *
 * const result = await service.process(
 *   { source: 'github_webhook', deliveryId: 'abc123' },
 *   'tenant-123',
 *   webhookPayload,
 *   async () => {
 *     // Process the request
 *     const runId = await startRun(webhookPayload);
 *     return { runId, status: 'started' };
 *   }
 * );
 *
 * if (result.processed) {
 *   console.log('New request processed');
 * } else {
 *   console.log('Duplicate request, returning cached result');
 * }
 * ```
 */
export class IdempotencyService {
  private store: IdempotencyStore;
  // Config is stored for future use (e.g., custom timeouts)
  private readonly _config: IdempotencyConfig;

  constructor(
    store?: IdempotencyStore,
    config?: Partial<IdempotencyConfig>
  ) {
    this.store = store ?? getIdempotencyStore();
    this._config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
  }

  /**
   * Get the current configuration
   */
  get config(): IdempotencyConfig {
    return this._config;
  }

  /**
   * Process a request with idempotency guarantees
   *
   * @param input - Idempotency key components
   * @param tenantId - Tenant making the request
   * @param payload - Request payload
   * @param handler - Function to process the request if not a duplicate
   * @param options - Processing options
   * @returns Result with processed flag and response
   */
  async process<T>(
    input: IdempotencyKeyInput,
    tenantId: string,
    payload: unknown,
    handler: () => Promise<{ runId?: string; response: T }>,
    options: ProcessOptions = {}
  ): Promise<IdempotencyProcessResult<T>> {
    const metrics = getIdempotencyMetrics();

    // Check if request is new or duplicate
    const checkResult = await this.store.checkAndSet(input, tenantId, payload);
    metrics.recordCheck(input.source, checkResult.status);

    switch (checkResult.status) {
      case 'new':
        // Process the request
        try {
          const { runId, response } = await handler();
          await this.store.markCompleted(checkResult.key, runId, response);
          metrics.recordCompleted();
          return {
            processed: true,
            result: response,
            runId,
            key: checkResult.key,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await this.store.markFailed(checkResult.key, errorMessage);
          metrics.recordFailed();
          throw error;
        }

      case 'duplicate':
        // Return cached result
        return {
          processed: false,
          result: checkResult.record.response as T,
          runId: checkResult.record.runId,
          key: checkResult.key,
        };

      case 'processing':
        // Request is being processed by another instance
        if (options.waitForProcessing) {
          return this.waitForCompletion<T>(
            checkResult.key,
            options.waitTimeoutMs ?? 30000,
            options.pollIntervalMs ?? 1000
          );
        }

        // Return 202 Accepted equivalent
        throw new IdempotencyProcessingError(
          `Request ${checkResult.key} is being processed`,
          checkResult.key,
          checkResult.record.runId
        );
    }
  }

  /**
   * Check if a request is a duplicate without processing
   */
  async check(
    input: IdempotencyKeyInput,
    tenantId: string,
    payload: unknown
  ): Promise<IdempotencyCheckResult> {
    return this.store.checkAndSet(input, tenantId, payload);
  }

  /**
   * Get the status of a previous request
   */
  async getStatus(key: string): Promise<{
    found: boolean;
    status?: 'processing' | 'completed' | 'failed';
    runId?: string;
    response?: unknown;
    error?: string;
  }> {
    const record = await this.store.getRecord(key);

    if (!record) {
      return { found: false };
    }

    return {
      found: true,
      status: record.status,
      runId: record.runId,
      response: record.response,
      error: record.error,
    };
  }

  /**
   * Run TTL cleanup
   *
   * Should be called periodically (e.g., via Cloud Scheduler).
   *
   * @returns Number of records cleaned up
   */
  async cleanup(): Promise<number> {
    const metrics = getIdempotencyMetrics();
    const count = await this.store.cleanupExpired();
    metrics.recordTtlCleanup(count);
    return count;
  }

  /**
   * Wait for a processing request to complete
   */
  private async waitForCompletion<T>(
    key: string,
    timeoutMs: number,
    pollIntervalMs: number
  ): Promise<IdempotencyProcessResult<T>> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const record = await this.store.getRecord(key);

      if (!record) {
        throw new Error(`Idempotency record ${key} disappeared during wait`);
      }

      if (record.status === 'completed') {
        return {
          processed: false,
          result: record.response as T,
          runId: record.runId,
          key,
        };
      }

      if (record.status === 'failed') {
        throw new Error(`Request ${key} failed: ${record.error}`);
      }

      // Still processing, wait and retry
      await sleep(pollIntervalMs);
    }

    throw new IdempotencyTimeoutError(
      `Timeout waiting for request ${key} to complete`,
      key
    );
  }
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when a request is already being processed
 */
export class IdempotencyProcessingError extends Error {
  constructor(
    message: string,
    public readonly key: string,
    public readonly runId?: string
  ) {
    super(message);
    this.name = 'IdempotencyProcessingError';
  }
}

/**
 * Error thrown when waiting for a request times out
 */
export class IdempotencyTimeoutError extends Error {
  constructor(message: string, public readonly key: string) {
    super(message);
    this.name = 'IdempotencyTimeoutError';
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Singleton
// =============================================================================

let defaultService: IdempotencyService | null = null;

/**
 * Get the default idempotency service
 */
export function getIdempotencyService(): IdempotencyService {
  if (!defaultService) {
    defaultService = new IdempotencyService();
  }
  return defaultService;
}

/**
 * Set a custom idempotency service (for testing)
 */
export function setIdempotencyService(service: IdempotencyService): void {
  defaultService = service;
}

/**
 * Reset the default service (for testing)
 */
export function resetIdempotencyService(): void {
  defaultService = null;
}
