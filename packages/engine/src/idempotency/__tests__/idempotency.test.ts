/**
 * Idempotency Layer Tests
 *
 * A4.s4: Replay safety tests for duplicate webhook events.
 *
 * Tests:
 * - Key generation for all sources
 * - Check-and-set behavior
 * - Duplicate detection
 * - Processing lock handling
 * - TTL cleanup
 * - Metrics collection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateIdempotencyKey,
  parseIdempotencyKey,
  hashRequestPayload,
  type GitHubIdempotencyKey,
  type ApiIdempotencyKey,
  type SlackIdempotencyKey,
  type SchedulerIdempotencyKey,
} from '../types.js';
import { InMemoryIdempotencyStore } from '../store.js';
import { IdempotencyMetricCollector } from '../metrics.js';
import {
  IdempotencyService,
  IdempotencyProcessingError,
} from '../service.js';

// =============================================================================
// Key Generation Tests
// =============================================================================

describe('generateIdempotencyKey', () => {
  it('should generate GitHub webhook key', () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };
    const key = generateIdempotencyKey(input);
    expect(key).toBe('github:550e8400-e29b-41d4-a716-446655440000');
  });

  it('should generate API key', () => {
    const input: ApiIdempotencyKey = {
      source: 'api',
      clientId: 'cli-abc123',
      requestId: 'req-xyz789',
    };
    const key = generateIdempotencyKey(input);
    expect(key).toBe('api:cli-abc123:req-xyz789');
  });

  it('should generate Slack key', () => {
    const input: SlackIdempotencyKey = {
      source: 'slack',
      teamId: 'T12345678',
      triggerId: '1234567890.123456',
    };
    const key = generateIdempotencyKey(input);
    expect(key).toBe('slack:T12345678:1234567890.123456');
  });

  it('should generate Scheduler key', () => {
    const input: SchedulerIdempotencyKey = {
      source: 'scheduler',
      scheduleId: 'daily-cleanup',
      executionTime: '2024-12-19T00:00:00Z',
    };
    const key = generateIdempotencyKey(input);
    expect(key).toBe('scheduler:daily-cleanup:2024-12-19T00:00:00Z');
  });
});

describe('parseIdempotencyKey', () => {
  it('should parse GitHub key', () => {
    const result = parseIdempotencyKey('github:550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual({
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('should parse API key', () => {
    const result = parseIdempotencyKey('api:cli-abc123:req-xyz789');
    expect(result).toEqual({
      source: 'api',
      clientId: 'cli-abc123',
      requestId: 'req-xyz789',
    });
  });

  it('should parse Slack key', () => {
    const result = parseIdempotencyKey('slack:T12345678:1234567890.123456');
    expect(result).toEqual({
      source: 'slack',
      teamId: 'T12345678',
      triggerId: '1234567890.123456',
    });
  });

  it('should return null for invalid keys', () => {
    expect(parseIdempotencyKey('')).toBeNull();
    expect(parseIdempotencyKey('invalid')).toBeNull();
    expect(parseIdempotencyKey('unknown:abc:xyz')).toBeNull();
    expect(parseIdempotencyKey('github:not-a-uuid')).toBeNull();
  });
});

describe('hashRequestPayload', () => {
  it('should generate consistent hashes', () => {
    const payload = { action: 'opened', number: 42 };
    const hash1 = hashRequestPayload(payload);
    const hash2 = hashRequestPayload(payload);
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different payloads', () => {
    const payload1 = { action: 'opened', number: 42 };
    const payload2 = { action: 'closed', number: 42 };
    expect(hashRequestPayload(payload1)).not.toBe(hashRequestPayload(payload2));
  });

  it('should be order-independent', () => {
    const payload1 = { a: 1, b: 2 };
    const payload2 = { b: 2, a: 1 };
    expect(hashRequestPayload(payload1)).toBe(hashRequestPayload(payload2));
  });
});

// =============================================================================
// InMemoryIdempotencyStore Tests
// =============================================================================

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  describe('checkAndSet', () => {
    it('should return new for first request', async () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await store.checkAndSet(input, 'tenant-123', { test: true });

      expect(result.status).toBe('new');
      expect(result.key).toBe('github:550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return processing for concurrent request', async () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      // First request starts processing
      await store.checkAndSet(input, 'tenant-123', { test: true });

      // Second request should see it as processing
      const result = await store.checkAndSet(input, 'tenant-123', { test: true });

      expect(result.status).toBe('processing');
    });

    it('should return duplicate for completed request', async () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      // First request
      await store.checkAndSet(input, 'tenant-123', { test: true });
      await store.markCompleted(
        'github:550e8400-e29b-41d4-a716-446655440000',
        'run-123',
        { status: 'started' }
      );

      // Duplicate request
      const result = await store.checkAndSet(input, 'tenant-123', { test: true });

      expect(result.status).toBe('duplicate');
      if (result.status === 'duplicate') {
        expect(result.record.runId).toBe('run-123');
        expect(result.record.response).toEqual({ status: 'started' });
      }
    });
  });

  describe('markCompleted', () => {
    it('should update record status', async () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      await store.checkAndSet(input, 'tenant-123', { test: true });
      await store.markCompleted(
        'github:550e8400-e29b-41d4-a716-446655440000',
        'run-123',
        { result: 'success' }
      );

      const record = await store.getRecord('github:550e8400-e29b-41d4-a716-446655440000');
      expect(record?.status).toBe('completed');
      expect(record?.runId).toBe('run-123');
      expect(record?.response).toEqual({ result: 'success' });
    });
  });

  describe('markFailed', () => {
    it('should update record with error', async () => {
      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      await store.checkAndSet(input, 'tenant-123', { test: true });
      await store.markFailed(
        'github:550e8400-e29b-41d4-a716-446655440000',
        'Something went wrong'
      );

      const record = await store.getRecord('github:550e8400-e29b-41d4-a716-446655440000');
      expect(record?.status).toBe('failed');
      expect(record?.error).toBe('Something went wrong');
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired records', async () => {
      // Create a store with very short TTL
      const shortTtlStore = new InMemoryIdempotencyStore({
        completedTtlMs: 10,
        failedTtlMs: 10,
      });

      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      await shortTtlStore.checkAndSet(input, 'tenant-123', { test: true });
      await shortTtlStore.markCompleted(
        'github:550e8400-e29b-41d4-a716-446655440000',
        'run-123',
        {}
      );

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      const deleted = await shortTtlStore.cleanupExpired();
      expect(deleted).toBe(1);

      const record = await shortTtlStore.getRecord(
        'github:550e8400-e29b-41d4-a716-446655440000'
      );
      expect(record).toBeNull();
    });
  });

  describe('lock expiration and recovery', () => {
    it('should recover from expired lock', async () => {
      // Create a store with very short lock timeout
      const shortLockStore = new InMemoryIdempotencyStore({
        lockTimeoutMs: 10,
        maxAttempts: 3,
      });

      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      // First request starts but doesn't complete
      await shortLockStore.checkAndSet(input, 'tenant-123', { test: true });

      // Wait for lock to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Second request should be able to take over
      const result = await shortLockStore.checkAndSet(input, 'tenant-123', { test: true });
      expect(result.status).toBe('new');

      const record = await shortLockStore.getRecord(
        'github:550e8400-e29b-41d4-a716-446655440000'
      );
      expect(record?.attempts).toBe(2);
    });

    it('should fail after max attempts', async () => {
      const shortLockStore = new InMemoryIdempotencyStore({
        lockTimeoutMs: 1,
        maxAttempts: 2,
      });

      const input: GitHubIdempotencyKey = {
        source: 'github_webhook',
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      };

      // First attempt
      await shortLockStore.checkAndSet(input, 'tenant-123', { test: true });
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Second attempt
      await shortLockStore.checkAndSet(input, 'tenant-123', { test: true });
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Third attempt should fail
      const result = await shortLockStore.checkAndSet(input, 'tenant-123', { test: true });
      expect(result.status).toBe('duplicate');
      if (result.status === 'duplicate') {
        expect(result.record.status).toBe('failed');
        expect(result.record.error).toContain('Max processing attempts');
      }
    });
  });
});

// =============================================================================
// Metrics Tests
// =============================================================================

describe('IdempotencyMetricCollector', () => {
  let collector: IdempotencyMetricCollector;

  beforeEach(() => {
    collector = new IdempotencyMetricCollector();
  });

  it('should track checks', () => {
    collector.recordCheck('github_webhook', 'new');
    collector.recordCheck('github_webhook', 'duplicate');
    collector.recordCheck('api', 'new');

    const metrics = collector.getMetrics();
    expect(metrics.checksTotal).toBe(3);
    expect(metrics.newRequests).toBe(2);
    expect(metrics.duplicatesSkipped).toBe(1);
  });

  it('should track by source', () => {
    collector.recordCheck('github_webhook', 'new');
    collector.recordCheck('github_webhook', 'duplicate');
    collector.recordCheck('api', 'new');
    collector.recordCheck('slack', 'duplicate');

    const metrics = collector.getMetrics();
    expect(metrics.bySource.github_webhook.checks).toBe(2);
    expect(metrics.bySource.github_webhook.duplicates).toBe(1);
    expect(metrics.bySource.api.checks).toBe(1);
    expect(metrics.bySource.slack.duplicates).toBe(1);
  });

  it('should track completed and failed', () => {
    collector.recordCompleted();
    collector.recordCompleted();
    collector.recordFailed();

    const metrics = collector.getMetrics();
    expect(metrics.completedTotal).toBe(2);
    expect(metrics.failedTotal).toBe(1);
  });

  it('should export Prometheus format', () => {
    collector.recordCheck('github_webhook', 'new');
    collector.recordCheck('github_webhook', 'duplicate');

    const prometheus = collector.toPrometheusFormat();
    expect(prometheus).toContain('gwi_idempotency_checks_total');
    expect(prometheus).toContain('gwi_idempotency_duplicates_skipped_total');
    expect(prometheus).toContain('source="github_webhook"');
  });

  it('should reset metrics', () => {
    collector.recordCheck('github_webhook', 'new');
    collector.reset();

    const metrics = collector.getMetrics();
    expect(metrics.checksTotal).toBe(0);
  });
});

// =============================================================================
// Service Tests (Replay Safety)
// =============================================================================

describe('IdempotencyService - Replay Safety', () => {
  let store: InMemoryIdempotencyStore;
  let service: IdempotencyService;
  let handlerCalls: number;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    service = new IdempotencyService(store);
    handlerCalls = 0;
  });

  it('should process new request', async () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    const result = await service.process(
      input,
      'tenant-123',
      { action: 'opened' },
      async () => {
        handlerCalls++;
        return { runId: 'run-123', response: { status: 'started' } };
      }
    );

    expect(result.processed).toBe(true);
    expect(result.runId).toBe('run-123');
    expect(result.result).toEqual({ status: 'started' });
    expect(handlerCalls).toBe(1);
  });

  it('should skip duplicate GitHub webhook', async () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    // First request
    await service.process(
      input,
      'tenant-123',
      { action: 'opened' },
      async () => {
        handlerCalls++;
        return { runId: 'run-123', response: { status: 'started' } };
      }
    );

    // Duplicate request (e.g., GitHub retry)
    const result = await service.process(
      input,
      'tenant-123',
      { action: 'opened' },
      async () => {
        handlerCalls++;
        return { runId: 'run-456', response: { status: 'started' } };
      }
    );

    expect(result.processed).toBe(false);
    expect(result.runId).toBe('run-123'); // Original run ID
    expect(handlerCalls).toBe(1); // Handler called only once
  });

  it('should skip duplicate API request', async () => {
    const input: ApiIdempotencyKey = {
      source: 'api',
      clientId: 'cli-abc123',
      requestId: 'req-unique-1',
    };

    // First request
    await service.process(
      input,
      'tenant-123',
      { command: 'triage' },
      async () => {
        handlerCalls++;
        return { runId: 'run-123', response: { status: 'running' } };
      }
    );

    // Client retry with same request ID
    const result = await service.process(
      input,
      'tenant-123',
      { command: 'triage' },
      async () => {
        handlerCalls++;
        return { runId: 'run-456', response: { status: 'running' } };
      }
    );

    expect(result.processed).toBe(false);
    expect(handlerCalls).toBe(1);
  });

  it('should throw for concurrent processing without wait', async () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    // Simulate slow handler
    const slowHandler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { runId: 'run-123', response: {} };
    };

    // Start first request (don't await)
    const firstRequest = service.process(
      input,
      'tenant-123',
      { action: 'opened' },
      slowHandler
    );

    // Try concurrent request
    await expect(
      service.process(
        input,
        'tenant-123',
        { action: 'opened' },
        async () => ({ response: {} })
      )
    ).rejects.toThrow(IdempotencyProcessingError);

    // Clean up
    await firstRequest;
  });

  it('should handle handler failure', async () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    // First request fails
    await expect(
      service.process(
        input,
        'tenant-123',
        { action: 'opened' },
        async () => {
          throw new Error('Handler failed');
        }
      )
    ).rejects.toThrow('Handler failed');

    // Check record is marked as failed
    const record = await store.getRecord(
      'github:550e8400-e29b-41d4-a716-446655440000'
    );
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe('Handler failed');
  });

  it('should allow new requests with different delivery IDs', async () => {
    const input1: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440001',
    };
    const input2: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440002',
    };

    await service.process(
      input1,
      'tenant-123',
      { action: 'opened' },
      async () => {
        handlerCalls++;
        return { runId: 'run-1', response: {} };
      }
    );

    await service.process(
      input2,
      'tenant-123',
      { action: 'opened' },
      async () => {
        handlerCalls++;
        return { runId: 'run-2', response: {} };
      }
    );

    expect(handlerCalls).toBe(2);
  });

  it('should handle Slack slash command replay', async () => {
    const input: SlackIdempotencyKey = {
      source: 'slack',
      teamId: 'T12345678',
      triggerId: '1234567890.123456',
    };

    // First request
    await service.process(
      input,
      'tenant-123',
      { command: '/gwi triage' },
      async () => {
        handlerCalls++;
        return { response: { text: 'Triage started' } };
      }
    );

    // User double-clicks the slash command
    const result = await service.process(
      input,
      'tenant-123',
      { command: '/gwi triage' },
      async () => {
        handlerCalls++;
        return { response: { text: 'Triage started' } };
      }
    );

    expect(result.processed).toBe(false);
    expect(handlerCalls).toBe(1);
  });

  it('should handle scheduler event replay', async () => {
    const input: SchedulerIdempotencyKey = {
      source: 'scheduler',
      scheduleId: 'daily-cleanup',
      executionTime: '2024-12-19T00:00:00Z',
    };

    // First execution
    await service.process(
      input,
      'tenant-123',
      { schedule: 'daily-cleanup' },
      async () => {
        handlerCalls++;
        return { response: { cleaned: 42 } };
      }
    );

    // Cloud Scheduler retry (e.g., after network hiccup)
    const result = await service.process(
      input,
      'tenant-123',
      { schedule: 'daily-cleanup' },
      async () => {
        handlerCalls++;
        return { response: { cleaned: 0 } };
      }
    );

    expect(result.processed).toBe(false);
    expect(result.result).toEqual({ cleaned: 42 }); // Cached result
    expect(handlerCalls).toBe(1);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('IdempotencyService - getStatus', () => {
  let store: InMemoryIdempotencyStore;
  let service: IdempotencyService;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    service = new IdempotencyService(store);
  });

  it('should return not found for unknown key', async () => {
    const status = await service.getStatus('unknown:key');
    expect(status.found).toBe(false);
  });

  it('should return processing status', async () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    // Start but don't complete
    await store.checkAndSet(input, 'tenant-123', {});

    const status = await service.getStatus(
      'github:550e8400-e29b-41d4-a716-446655440000'
    );
    expect(status.found).toBe(true);
    expect(status.status).toBe('processing');
  });

  it('should return completed status with response', async () => {
    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    await service.process(
      input,
      'tenant-123',
      {},
      async () => ({ runId: 'run-123', response: { done: true } })
    );

    const status = await service.getStatus(
      'github:550e8400-e29b-41d4-a716-446655440000'
    );
    expect(status.found).toBe(true);
    expect(status.status).toBe('completed');
    expect(status.runId).toBe('run-123');
    expect(status.response).toEqual({ done: true });
  });
});

describe('IdempotencyService - cleanup', () => {
  it('should clean up expired records', async () => {
    const store = new InMemoryIdempotencyStore({
      completedTtlMs: 10,
    });
    const service = new IdempotencyService(store);

    const input: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
    };

    await service.process(
      input,
      'tenant-123',
      {},
      async () => ({ response: {} })
    );

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 20));

    const deleted = await service.cleanup();
    expect(deleted).toBe(1);
  });
});
