/**
 * Provider Health Registry — Scale & Ops Maturity (gwi-d1k)
 *
 * Agent-first: Singleton health registry tracks per-provider circuit state.
 * Agents query `getProviderHealth()` before requesting runs to check which
 * LLM providers are healthy. Agents can also force-trip a circuit if they
 * detect quality degradation.
 *
 * @module @gwi/core/llm/provider-health
 */

import {
  CircuitBreaker,
  CircuitBreakerState,
  type CircuitBreakerMetrics,
  type ICircuitBreaker,
} from '../connectors/utils/circuit-breaker.js';
import type { LLMProviderType } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Health status for a single provider
 */
export interface ProviderHealthStatus {
  state: 'closed' | 'half_open' | 'open';
  failureRate: number;
  lastFailure: string | null;
  totalRequests: number;
  circuitOpenCount: number;
}

/**
 * Full health report across all providers
 */
export interface ProviderHealthReport {
  providers: Partial<Record<LLMProviderType, ProviderHealthStatus>>;
  recommendation: LLMProviderType | null;
  timestamp: string;
}

// =============================================================================
// Registry Singleton
// =============================================================================

/** Global circuit breaker instance shared across all providers */
let globalCircuitBreaker: ICircuitBreaker | null = null;

/** Track last failure timestamps per provider */
const lastFailureMap = new Map<string, string>();

/**
 * Get or create the global circuit breaker for LLM providers
 */
export function getLLMCircuitBreaker(): ICircuitBreaker {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new CircuitBreaker({
      failureThresholdPercentage: 50,
      minimumRequests: 5,
      resetTimeoutMs: 60_000,
      successThreshold: 3,
      windowMs: 60_000,
    });
  }
  return globalCircuitBreaker;
}

/**
 * Record a failure for a provider (updates lastFailure tracking)
 */
export function recordProviderFailure(providerType: LLMProviderType): void {
  lastFailureMap.set(providerType, new Date().toISOString());
}

/**
 * Map CircuitBreakerState enum to lowercase string for API responses
 */
function mapState(state: CircuitBreakerState): 'closed' | 'half_open' | 'open' {
  switch (state) {
    case CircuitBreakerState.CLOSED:
      return 'closed';
    case CircuitBreakerState.HALF_OPEN:
      return 'half_open';
    case CircuitBreakerState.OPEN:
      return 'open';
  }
}

/**
 * Build health status for a single provider from circuit breaker metrics
 */
function buildProviderStatus(
  cb: ICircuitBreaker,
  providerType: LLMProviderType,
): ProviderHealthStatus {
  const state = cb.getState(providerType);
  const metrics: CircuitBreakerMetrics | null = cb.getMetrics(providerType);

  return {
    state: mapState(state),
    failureRate: metrics ? Math.round(metrics.failureRate * 100) / 100 : 0,
    lastFailure: lastFailureMap.get(providerType) ?? null,
    totalRequests: metrics?.totalRequests ?? 0,
    circuitOpenCount: metrics?.circuitOpenCount ?? 0,
  };
}

/**
 * Get health report for all known providers
 *
 * Agent-queryable: returns circuit breaker state per LLM provider
 * with a recommendation for which provider to use.
 */
export function getProviderHealth(): ProviderHealthReport {
  const cb = getLLMCircuitBreaker();
  const providerTypes: LLMProviderType[] = ['anthropic', 'google', 'openai', 'vertex', 'openai_compat'];

  const providers: Partial<Record<LLMProviderType, ProviderHealthStatus>> = {};
  let bestProvider: LLMProviderType | null = null;
  let bestScore = -1;

  for (const pt of providerTypes) {
    const status = buildProviderStatus(cb, pt);
    providers[pt] = status;

    // Score: closed = 100, half_open = 50, open = 0, minus failure rate
    const stateScore = status.state === 'closed' ? 100 : status.state === 'half_open' ? 50 : 0;
    const score = stateScore - status.failureRate;

    if (score > bestScore) {
      bestScore = score;
      bestProvider = pt;
    }
  }

  return {
    providers,
    recommendation: bestProvider,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a specific provider is healthy (circuit not OPEN)
 */
export function isProviderHealthy(providerType: LLMProviderType): boolean {
  const cb = getLLMCircuitBreaker();
  const state = cb.getState(providerType);
  return state !== CircuitBreakerState.OPEN;
}

/**
 * Force-trip a provider's circuit breaker (agent-operable)
 *
 * Use when quality degradation is detected even if requests
 * are technically succeeding.
 */
export function tripProvider(providerType: LLMProviderType): void {
  const cb = getLLMCircuitBreaker();
  cb.open(providerType);
  lastFailureMap.set(providerType, new Date().toISOString());
}

/**
 * Force-close a provider's circuit breaker (agent-operable)
 */
export function resetProvider(providerType: LLMProviderType): void {
  const cb = getLLMCircuitBreaker();
  cb.close(providerType);
}

/**
 * Reset the global circuit breaker (for testing)
 */
export function resetLLMCircuitBreaker(): void {
  globalCircuitBreaker = null;
  lastFailureMap.clear();
}
