/**
 * Resilient LLM Provider Wrapper — Scale & Ops Maturity (gwi-d1k)
 *
 * Wraps any LLMProvider with circuit breaker + retry using existing
 * infrastructure from packages/core/src/connectors/utils/.
 *
 * On 429/5xx: retries with exponential backoff (existing RetryHandler)
 * On consecutive failures: trips circuit (existing CircuitBreaker)
 * On circuit open: throws fast so selection policy picks fallback
 *
 * @module @gwi/core/llm/resilient-provider
 */

import type {
  LLMProvider,
  LLMProviderType,
  LLMJsonCompletionRequest,
  LLMJsonCompletionResponse,
  LLMTextCompletionRequest,
  LLMTextCompletionResponse,
} from './types.js';
import { getLLMCircuitBreaker, recordProviderFailure } from './provider-health.js';
import { ExponentialBackoffRetryHandler } from '../connectors/utils/retry-handler.js';

// =============================================================================
// Types
// =============================================================================

export interface ResilientProviderConfig {
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000) */
  initialDelayMs?: number;
  /** Max retry delay in ms (default: 30000) */
  maxDelayMs?: number;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Wrap an LLMProvider with circuit breaker + retry resilience.
 *
 * The circuit breaker is shared globally via provider-health.ts,
 * keyed by provider type. This means if the Anthropic provider
 * trips its circuit, ALL requests to Anthropic fail fast.
 */
export function wrapWithResilience(
  provider: LLMProvider,
  config?: ResilientProviderConfig,
): LLMProvider {
  const cb = getLLMCircuitBreaker();
  const retryHandler = new ExponentialBackoffRetryHandler({
    maxAttempts: config?.maxRetries ?? 3,
    initialDelayMs: config?.initialDelayMs ?? 1000,
    maxDelayMs: config?.maxDelayMs ?? 30000,
    backoffMultiplier: 2,
    maxJitterMs: 500,
  });

  const providerKey = provider.type;

  /**
   * Execute a provider call with retry + circuit breaker
   */
  async function resilientCall<T>(fn: () => Promise<T>): Promise<T> {
    return cb.execute(providerKey, () =>
      retryHandler.retry(fn, {
        retryableErrorPredicate: (error: unknown) => {
          if (error instanceof Error) {
            const msg = error.message;
            // Retry on rate limits and server errors
            if (msg.includes('429') || msg.includes('rate limit')) return true;
            if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
            if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) return true;
            // Check for statusCode property (HTTP errors from providers)
            const errWithStatus = error as { statusCode?: number; status?: number };
            const status = errWithStatus.statusCode ?? errWithStatus.status;
            if (status === 429) return true;
            if (status && status >= 500) return true;
          }
          return false;
        },
      }),
    ).catch((error) => {
      // Track failure for health reporting
      recordProviderFailure(providerKey as LLMProviderType);
      throw error;
    });
  }

  return {
    get type() {
      return provider.type;
    },
    get name() {
      return provider.name;
    },
    isAvailable(): boolean {
      return provider.isAvailable();
    },
    getModel(): string {
      return provider.getModel();
    },
    completeJson(request: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse> {
      return resilientCall(() => provider.completeJson(request));
    },
    completeText(request: LLMTextCompletionRequest): Promise<LLMTextCompletionResponse> {
      return resilientCall(() => provider.completeText(request));
    },
  };
}
