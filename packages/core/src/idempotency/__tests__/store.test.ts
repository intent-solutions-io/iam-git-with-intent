/**
 * Idempotency Store Tests
 *
 * A4.s2: Test atomic check-and-set for idempotency keys
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createIdempotencyStore,
  hashIdempotencyKey,
  type IdempotencyStore,
} from '../store.js';
import { generateIdempotencyKey, hashRequestPayload } from '../key-scheme.js';

// =============================================================================
// Test Suite Factory
// =============================================================================

/**
 * Run tests against both in-memory and Firestore implementations
 */
function testIdempotencyStore(name: string, factory: () => IdempotencyStore) {
  describe(name, () => {
    let store: IdempotencyStore;

    beforeEach(() => {
      store = factory();
    });

    // -------------------------------------------------------------------------
    // Basic Operations
    // -------------------------------------------------------------------------

    describe('checkAndSet', () => {
      it('should create new record when key does not exist', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-123',
        });

        const result = await store.checkAndSet(key, 'tenant-1');

        expect(result.isNew).toBe(true);
        expect(result.record.key).toBe(key);
        expect(result.record.keyHash).toBe(hashIdempotencyKey(key));
        expect(result.record.tenantId).toBe('tenant-1');
        expect(result.record.status).toBe('pending');
        expect(result.record.createdAt).toBeInstanceOf(Date);
        expect(result.record.expiresAt).toBeInstanceOf(Date);
      });

      it('should return existing record when key already exists', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-456',
        });

        // First call creates
        const first = await store.checkAndSet(key, 'tenant-1');
        expect(first.isNew).toBe(true);

        // Second call returns existing
        const second = await store.checkAndSet(key, 'tenant-1');
        expect(second.isNew).toBe(false);
        expect(second.record.keyHash).toBe(first.record.keyHash);
        expect(second.record.createdAt).toEqual(first.record.createdAt);
      });

      it('should support custom TTL', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-789',
        });

        const ttlSeconds = 3600; // 1 hour
        const result = await store.checkAndSet(key, 'tenant-1', ttlSeconds);

        expect(result.isNew).toBe(true);

        const expectedExpiry = new Date(
          result.record.createdAt.getTime() + ttlSeconds * 1000
        );
        const actualExpiry = result.record.expiresAt;

        // Allow 1 second difference for test execution time
        expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
      });
    });

    // -------------------------------------------------------------------------
    // Payload Hash Validation
    // -------------------------------------------------------------------------

    describe('payload hash validation', () => {
      it('should accept same payload hash on duplicate request', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-payload-1',
        });

        const payload = { action: 'create_pr', data: { title: 'Test' } };
        const payloadHash = hashRequestPayload(payload);

        // First request with payload hash
        const first = await store.checkAndSet(key, 'tenant-1', undefined, payloadHash);
        expect(first.isNew).toBe(true);

        // Second request with same payload hash should succeed
        const second = await store.checkAndSet(key, 'tenant-1', undefined, payloadHash);
        expect(second.isNew).toBe(false);
      });

      it('should reject different payload hash for same key', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-payload-2',
        });

        const payload1 = { action: 'create_pr', data: { title: 'Test 1' } };
        const payload2 = { action: 'create_pr', data: { title: 'Test 2' } };

        const hash1 = hashRequestPayload(payload1);
        const hash2 = hashRequestPayload(payload2);

        // First request
        await store.checkAndSet(key, 'tenant-1', undefined, hash1);

        // Second request with different payload should throw
        await expect(
          store.checkAndSet(key, 'tenant-1', undefined, hash2)
        ).rejects.toThrow(/payload/i);
      });

      it('should allow requests without payload hash', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-no-hash',
        });

        // First request without hash
        const first = await store.checkAndSet(key, 'tenant-1');
        expect(first.isNew).toBe(true);

        // Second request without hash should succeed
        const second = await store.checkAndSet(key, 'tenant-1');
        expect(second.isNew).toBe(false);
      });
    });

    // -------------------------------------------------------------------------
    // Status Updates
    // -------------------------------------------------------------------------

    describe('complete', () => {
      it('should update status to completed and store runId', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-complete-1',
        });

        const { record } = await store.checkAndSet(key, 'tenant-1');

        await store.complete(record.keyHash, 'run-123', { success: true });

        const updated = await store.get(key);
        expect(updated).not.toBeNull();
        expect(updated!.status).toBe('completed');
        expect(updated!.runId).toBe('run-123');
        expect(updated!.result).toEqual({ success: true });
      });

      it('should throw error if record does not exist', async () => {
        await expect(
          store.complete('nonexistent-hash', 'run-456')
        ).rejects.toThrow(/not found/i);
      });
    });

    describe('fail', () => {
      it('should update status to failed and store error', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-fail-1',
        });

        const { record } = await store.checkAndSet(key, 'tenant-1');

        await store.fail(record.keyHash, 'Something went wrong');

        const updated = await store.get(key);
        expect(updated).not.toBeNull();
        expect(updated!.status).toBe('failed');
        expect(updated!.result).toEqual({ error: 'Something went wrong' });
      });

      it('should throw error if record does not exist', async () => {
        await expect(
          store.fail('nonexistent-hash', 'error')
        ).rejects.toThrow(/not found/i);
      });
    });

    // -------------------------------------------------------------------------
    // Query Operations
    // -------------------------------------------------------------------------

    describe('exists', () => {
      it('should return true if key exists', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-exists-1',
        });

        await store.checkAndSet(key, 'tenant-1');

        const exists = await store.exists(key);
        expect(exists).toBe(true);
      });

      it('should return false if key does not exist', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-nonexistent',
        });

        const exists = await store.exists(key);
        expect(exists).toBe(false);
      });
    });

    describe('get', () => {
      it('should return record if key exists', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-get-1',
        });

        const { record } = await store.checkAndSet(key, 'tenant-1');

        const fetched = await store.get(key);
        expect(fetched).not.toBeNull();
        expect(fetched!.keyHash).toBe(record.keyHash);
      });

      it('should return null if key does not exist', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-get-nonexistent',
        });

        const fetched = await store.get(key);
        expect(fetched).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // Concurrent Access
    // -------------------------------------------------------------------------

    describe('concurrent access', () => {
      it('should handle concurrent checkAndSet for same key', async () => {
        const key = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-concurrent-1',
        });

        // Simulate concurrent requests
        const [result1, result2, result3] = await Promise.all([
          store.checkAndSet(key, 'tenant-1'),
          store.checkAndSet(key, 'tenant-1'),
          store.checkAndSet(key, 'tenant-1'),
        ]);

        // Exactly one should be new
        const newCount = [result1, result2, result3].filter(r => r.isNew).length;
        expect(newCount).toBe(1);

        // All should have same keyHash
        expect(result1.record.keyHash).toBe(result2.record.keyHash);
        expect(result2.record.keyHash).toBe(result3.record.keyHash);
      });

      it('should handle concurrent checkAndSet for different keys', async () => {
        const keys = [
          generateIdempotencyKey({
            source: 'api',
            tenant: 'tenant-1',
            requestId: 'req-concurrent-2a',
          }),
          generateIdempotencyKey({
            source: 'api',
            tenant: 'tenant-1',
            requestId: 'req-concurrent-2b',
          }),
          generateIdempotencyKey({
            source: 'api',
            tenant: 'tenant-1',
            requestId: 'req-concurrent-2c',
          }),
        ];

        const results = await Promise.all(
          keys.map(key => store.checkAndSet(key, 'tenant-1'))
        );

        // All should be new
        expect(results.every(r => r.isNew)).toBe(true);

        // All should have different keyHashes
        const hashes = results.map(r => r.record.keyHash);
        expect(new Set(hashes).size).toBe(3);
      });
    });

    // -------------------------------------------------------------------------
    // Different Event Sources
    // -------------------------------------------------------------------------

    describe('event source isolation', () => {
      it('should handle GitHub webhook keys', async () => {
        const key = generateIdempotencyKey({
          source: 'github_webhook',
          tenant: 'org-123',
          deliveryId: '550e8400-e29b-41d4-a716-446655440000',
        });

        const result = await store.checkAndSet(key, 'org-123');
        expect(result.isNew).toBe(true);
        expect(result.record.key).toBe(key);
      });

      it('should handle Slack command keys', async () => {
        const key = generateIdempotencyKey({
          source: 'slack',
          tenant: 'team-T12345678',
          callbackId: 'callback-1234567890.123456',
        });

        const result = await store.checkAndSet(key, 'team-T12345678');
        expect(result.isNew).toBe(true);
        expect(result.record.key).toBe(key);
      });

      it('should handle scheduler keys', async () => {
        const key = generateIdempotencyKey({
          source: 'scheduler',
          tenant: 'org-456',
          scheduleId: 'daily-cleanup',
          timestamp: '2024-12-19T00:00:00Z',
        });

        const result = await store.checkAndSet(key, 'org-456');
        expect(result.isNew).toBe(true);
        expect(result.record.key).toBe(key);
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should isolate records by tenant', async () => {
        const key1 = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-1',
          requestId: 'req-shared',
        });

        const key2 = generateIdempotencyKey({
          source: 'api',
          tenant: 'tenant-2',
          requestId: 'req-shared',
        });

        const result1 = await store.checkAndSet(key1, 'tenant-1');
        const result2 = await store.checkAndSet(key2, 'tenant-2');

        // Both should be new (different keys due to tenant)
        expect(result1.isNew).toBe(true);
        expect(result2.isNew).toBe(true);

        // Should have different keyHashes
        expect(result1.record.keyHash).not.toBe(result2.record.keyHash);
      });
    });
  });
}

// =============================================================================
// Run Tests
// =============================================================================

// Test in-memory implementation
testIdempotencyStore('InMemoryIdempotencyStore', () => createIdempotencyStore('memory'));

// Test Firestore implementation (requires emulator or real Firestore)
// Skip if not configured
const hasFirestore = process.env.GCP_PROJECT_ID || process.env.FIRESTORE_EMULATOR_HOST;

if (hasFirestore) {
  testIdempotencyStore('FirestoreIdempotencyStore', () => createIdempotencyStore('firestore'));
} else {
  describe.skip('FirestoreIdempotencyStore', () => {
    it('requires GCP_PROJECT_ID or FIRESTORE_EMULATOR_HOST', () => {});
  });
}

// =============================================================================
// Hash Function Tests
// =============================================================================

describe('hashIdempotencyKey', () => {
  it('should produce consistent hashes', () => {
    const key = 'api:tenant-1:req-123';
    const hash1 = hashIdempotencyKey(key);
    const hash2 = hashIdempotencyKey(key);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different keys', () => {
    const key1 = 'api:tenant-1:req-123';
    const key2 = 'api:tenant-1:req-456';

    const hash1 = hashIdempotencyKey(key1);
    const hash2 = hashIdempotencyKey(key2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce hex-encoded SHA-256 hash', () => {
    const key = 'api:tenant-1:req-test';
    const hash = hashIdempotencyKey(key);

    // SHA-256 produces 64 hex characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
