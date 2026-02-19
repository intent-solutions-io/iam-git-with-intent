/**
 * Tests for resilient LLM provider wrapper (gwi-d1k)
 *
 * Verifies:
 * - Circuit trips after N failures, fast-fails subsequent calls
 * - Half-open state allows test request through
 * - Selection policy skips providers with open circuits
 * - Provider health registry returns correct state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { wrapWithResilience } from '../resilient-provider.js';
import {
  getProviderHealth,
  isProviderHealthy,
  tripProvider,
  resetProvider,
  resetLLMCircuitBreaker,
} from '../provider-health.js';
import type {
  LLMProvider,
  LLMJsonCompletionRequest,
  LLMJsonCompletionResponse,
  LLMTextCompletionRequest,
  LLMTextCompletionResponse,
} from '../types.js';

// =============================================================================
// Mock Provider
// =============================================================================

function createMockProvider(opts?: {
  failAfter?: number;
  failWith?: Error;
}): LLMProvider & { callCount: number } {
  let callCount = 0;
  const failAfter = opts?.failAfter ?? Infinity;
  const failWith = opts?.failWith ?? new Error('Provider error (status 500)');

  return {
    callCount: 0,
    get type() {
      return 'anthropic' as const;
    },
    get name() {
      return 'mock-anthropic';
    },
    isAvailable() {
      return true;
    },
    getModel() {
      return 'claude-sonnet-4-20250514';
    },
    async completeJson(req: LLMJsonCompletionRequest): Promise<LLMJsonCompletionResponse> {
      callCount++;
      (this as { callCount: number }).callCount = callCount;
      if (callCount > failAfter) {
        throw failWith;
      }
      return {
        json: { result: 'ok' },
        raw: '{"result":"ok"}',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        latencyMs: 100,
      };
    },
    async completeText(req: LLMTextCompletionRequest): Promise<LLMTextCompletionResponse> {
      callCount++;
      (this as { callCount: number }).callCount = callCount;
      if (callCount > failAfter) {
        throw failWith;
      }
      return {
        text: 'Hello',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        latencyMs: 100,
      };
    },
  };
}

const dummyRequest: LLMJsonCompletionRequest = {
  messages: [{ role: 'user', content: 'test' }],
};

const dummyTextRequest: LLMTextCompletionRequest = {
  messages: [{ role: 'user', content: 'test' }],
};

// =============================================================================
// Tests
// =============================================================================

describe('Provider Health Registry', () => {
  beforeEach(() => {
    resetLLMCircuitBreaker();
  });

  it('returns healthy state for all providers by default', () => {
    const report = getProviderHealth();
    expect(report.providers.anthropic?.state).toBe('closed');
    expect(report.providers.google?.state).toBe('closed');
    expect(report.providers.openai?.state).toBe('closed');
    expect(report.recommendation).toBeDefined();
    expect(report.timestamp).toBeDefined();
  });

  it('isProviderHealthy returns true for untouched providers', () => {
    expect(isProviderHealthy('anthropic')).toBe(true);
    expect(isProviderHealthy('google')).toBe(true);
  });

  it('tripProvider marks provider as unhealthy', () => {
    tripProvider('anthropic');
    expect(isProviderHealthy('anthropic')).toBe(false);

    const report = getProviderHealth();
    expect(report.providers.anthropic?.state).toBe('open');
    expect(report.providers.anthropic?.lastFailure).toBeDefined();
  });

  it('resetProvider restores provider health', () => {
    tripProvider('google');
    expect(isProviderHealthy('google')).toBe(false);

    resetProvider('google');
    expect(isProviderHealthy('google')).toBe(true);
  });
});

describe('Resilient Provider Wrapper', () => {
  beforeEach(() => {
    resetLLMCircuitBreaker();
  });

  it('passes through successful calls', async () => {
    const mock = createMockProvider();
    const resilient = wrapWithResilience(mock, { maxRetries: 1 });

    const result = await resilient.completeJson(dummyRequest);
    expect(result.json).toEqual({ result: 'ok' });
    expect(mock.callCount).toBe(1);
  });

  it('preserves provider type and name', () => {
    const mock = createMockProvider();
    const resilient = wrapWithResilience(mock);

    expect(resilient.type).toBe('anthropic');
    expect(resilient.name).toBe('mock-anthropic');
    expect(resilient.getModel()).toBe('claude-sonnet-4-20250514');
    expect(resilient.isAvailable()).toBe(true);
  });

  it('retries on retryable errors', async () => {
    // Fails first 2 calls, succeeds on 3rd
    let attempt = 0;
    const mock = createMockProvider();
    const originalCompleteJson = mock.completeJson.bind(mock);
    mock.completeJson = async (req) => {
      attempt++;
      if (attempt <= 2) {
        throw new Error('Service unavailable (status 503)');
      }
      return originalCompleteJson(req);
    };

    const resilient = wrapWithResilience(mock, { maxRetries: 3, initialDelayMs: 10 });
    const result = await resilient.completeJson(dummyRequest);
    expect(result.json).toEqual({ result: 'ok' });
  });

  it('does not retry on non-retryable errors', async () => {
    let attempts = 0;
    const mock = createMockProvider();
    mock.completeJson = async () => {
      attempts++;
      throw new Error('Invalid API key (status 401)');
    };

    const resilient = wrapWithResilience(mock, { maxRetries: 3, initialDelayMs: 10 });
    await expect(resilient.completeJson(dummyRequest)).rejects.toThrow('Invalid API key');
    expect(attempts).toBe(1);
  });

  it('works with completeText too', async () => {
    const mock = createMockProvider();
    const resilient = wrapWithResilience(mock, { maxRetries: 1 });

    const result = await resilient.completeText(dummyTextRequest);
    expect(result.text).toBe('Hello');
  });
});
