/**
 * Tests for Immutable Audit Log Storage (D3.3)
 *
 * Tests append-only storage, chain integrity, and query operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryAuditLogStore,
  type ImmutableAuditLogStore,
  type AuditLogQueryOptions,
  createInMemoryAuditLogStore,
  getImmutableAuditLogStore,
  setImmutableAuditLogStore,
  resetImmutableAuditLogStore,
} from '../audit-log-storage.js';
import type { CreateAuditLogEntry } from '../audit-log-schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestInput(overrides?: Partial<CreateAuditLogEntry>): CreateAuditLogEntry {
  return {
    actor: {
      type: 'user',
      id: 'user-123',
      name: 'Test User',
    },
    action: {
      category: 'data',
      name: 'create',
      description: 'Created a resource',
    },
    resource: {
      type: 'document',
      id: 'doc-456',
      name: 'Test Document',
    },
    outcome: {
      status: 'success',
    },
    context: {
      tenantId: 'tenant-1',
      sessionId: 'session-abc',
      requestId: 'req-xyz',
      timestamp: new Date(),
    },
    ...overrides,
  };
}

// =============================================================================
// InMemoryAuditLogStore Tests
// =============================================================================

describe('InMemoryAuditLogStore', () => {
  let store: InMemoryAuditLogStore;

  beforeEach(() => {
    store = new InMemoryAuditLogStore();
  });

  afterEach(() => {
    store.clear();
  });

  describe('append', () => {
    it('should append a single entry', async () => {
      const input = createTestInput();
      const entry = await store.append('tenant-1', input);

      expect(entry.id).toMatch(/^alog-/);
      expect(entry.actor.id).toBe('user-123');
      expect(entry.chain.sequence).toBe(0);
      expect(entry.chain.prevHash).toBeNull();
      expect(entry.chain.contentHash).toBeTruthy();
    });

    it('should chain entries with prevHash', async () => {
      const entry1 = await store.append('tenant-1', createTestInput());
      const entry2 = await store.append('tenant-1', createTestInput());
      const entry3 = await store.append('tenant-1', createTestInput());

      expect(entry1.chain.sequence).toBe(0);
      expect(entry2.chain.sequence).toBe(1);
      expect(entry3.chain.sequence).toBe(2);

      expect(entry1.chain.prevHash).toBeNull();
      expect(entry2.chain.prevHash).toBe(entry1.chain.contentHash);
      expect(entry3.chain.prevHash).toBe(entry2.chain.contentHash);
    });

    it('should maintain separate chains per tenant', async () => {
      const entryA1 = await store.append('tenant-a', createTestInput());
      const entryB1 = await store.append('tenant-b', createTestInput());
      const entryA2 = await store.append('tenant-a', createTestInput());

      expect(entryA1.chain.sequence).toBe(0);
      expect(entryB1.chain.sequence).toBe(0);
      expect(entryA2.chain.sequence).toBe(1);

      // tenant-a chain
      expect(entryA1.chain.prevHash).toBeNull();
      expect(entryA2.chain.prevHash).toBe(entryA1.chain.contentHash);

      // tenant-b chain is separate
      expect(entryB1.chain.prevHash).toBeNull();
    });

    it('should store entry with all fields', async () => {
      const input = createTestInput({
        details: { custom: 'data' },
        highRisk: true,
      });

      const entry = await store.append('tenant-1', input);

      expect(entry.actor.type).toBe('user');
      expect(entry.action.category).toBe('data');
      expect(entry.resource.type).toBe('document');
      expect(entry.outcome.status).toBe('success');
      expect(entry.details).toEqual({ custom: 'data' });
      expect(entry.highRisk).toBe(true);
    });
  });

  describe('appendBatch', () => {
    it('should append multiple entries atomically', async () => {
      const inputs = [
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ];

      const batch = await store.appendBatch('tenant-1', inputs);

      expect(batch.entries).toHaveLength(3);
      expect(batch.merkleRoot).toBeTruthy();
      expect(batch.startSequence).toBe(0);
      expect(batch.endSequence).toBe(2);
    });

    it('should chain batch entries correctly', async () => {
      const batch = await store.appendBatch('tenant-1', [
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      expect(batch.entries[0].chain.sequence).toBe(0);
      expect(batch.entries[1].chain.sequence).toBe(1);
      expect(batch.entries[2].chain.sequence).toBe(2);

      expect(batch.entries[0].chain.prevHash).toBeNull();
      expect(batch.entries[1].chain.prevHash).toBe(batch.entries[0].chain.contentHash);
      expect(batch.entries[2].chain.prevHash).toBe(batch.entries[1].chain.contentHash);
    });

    it('should continue chain after batch', async () => {
      const batch = await store.appendBatch('tenant-1', [
        createTestInput(),
        createTestInput(),
      ]);

      const nextEntry = await store.append('tenant-1', createTestInput());

      expect(nextEntry.chain.sequence).toBe(2);
      expect(nextEntry.chain.prevHash).toBe(batch.entries[1].chain.contentHash);
    });

    it('should reject empty batch', async () => {
      await expect(store.appendBatch('tenant-1', [])).rejects.toThrow(
        'Cannot create empty batch'
      );
    });
  });

  describe('getEntry', () => {
    it('should retrieve entry by ID', async () => {
      const created = await store.append('tenant-1', createTestInput());
      const retrieved = await store.getEntry(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.chain.sequence).toBe(created.chain.sequence);
    });

    it('should return null for non-existent entry', async () => {
      const retrieved = await store.getEntry('alog-nonexistent' as any);
      expect(retrieved).toBeNull();
    });
  });

  describe('getEntryBySequence', () => {
    it('should retrieve entry by sequence', async () => {
      await store.append('tenant-1', createTestInput());
      const entry2 = await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());

      const retrieved = await store.getEntryBySequence('tenant-1', 1);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(entry2.id);
    });

    it('should return null for non-existent sequence', async () => {
      await store.append('tenant-1', createTestInput());
      const retrieved = await store.getEntryBySequence('tenant-1', 99);
      expect(retrieved).toBeNull();
    });

    it('should scope by tenant', async () => {
      await store.append('tenant-a', createTestInput());
      await store.append('tenant-b', createTestInput());

      const retrievedA = await store.getEntryBySequence('tenant-a', 0);
      const retrievedB = await store.getEntryBySequence('tenant-b', 0);

      expect(retrievedA).not.toBeNull();
      expect(retrievedB).not.toBeNull();
      expect(retrievedA!.id).not.toBe(retrievedB!.id);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Create test data
      await store.append('tenant-1', createTestInput({
        actor: { type: 'user', id: 'user-1', name: 'User 1' },
        action: { category: 'data', name: 'create', description: 'Create' },
        outcome: { status: 'success' },
      }));

      await store.append('tenant-1', createTestInput({
        actor: { type: 'agent', id: 'agent-1', name: 'Agent 1' },
        action: { category: 'security', name: 'authenticate', description: 'Auth' },
        outcome: { status: 'failure' },
        highRisk: true,
      }));

      await store.append('tenant-1', createTestInput({
        actor: { type: 'user', id: 'user-2', name: 'User 2' },
        action: { category: 'data', name: 'delete', description: 'Delete' },
        outcome: { status: 'success' },
        highRisk: true,
      }));

      await store.append('tenant-2', createTestInput({
        actor: { type: 'user', id: 'user-3', name: 'User 3' },
      }));
    });

    it('should filter by tenantId', async () => {
      const result = await store.query({ tenantId: 'tenant-1' });
      expect(result.entries).toHaveLength(3);
      expect(result.totalCount).toBe(3);
    });

    it('should filter by actorType', async () => {
      const result = await store.query({ tenantId: 'tenant-1', actorType: 'agent' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].actor.id).toBe('agent-1');
    });

    it('should filter by actionCategory', async () => {
      const result = await store.query({ tenantId: 'tenant-1', actionCategory: 'data' });
      expect(result.entries).toHaveLength(2);
    });

    it('should filter by outcomeStatus', async () => {
      const result = await store.query({ tenantId: 'tenant-1', outcomeStatus: 'failure' });
      expect(result.entries).toHaveLength(1);
    });

    it('should filter by highRiskOnly', async () => {
      const result = await store.query({ tenantId: 'tenant-1', highRiskOnly: true });
      expect(result.entries).toHaveLength(2);
    });

    it('should apply pagination', async () => {
      const page1 = await store.query({ tenantId: 'tenant-1', limit: 2 });
      const page2 = await store.query({ tenantId: 'tenant-1', limit: 2, offset: 2 });

      expect(page1.entries).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page2.entries).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it('should sort by sequence ascending', async () => {
      const result = await store.query({ tenantId: 'tenant-1', sortOrder: 'asc' });
      expect(result.entries[0].chain.sequence).toBe(0);
      expect(result.entries[1].chain.sequence).toBe(1);
      expect(result.entries[2].chain.sequence).toBe(2);
    });

    it('should sort by sequence descending by default', async () => {
      const result = await store.query({ tenantId: 'tenant-1' });
      expect(result.entries[0].chain.sequence).toBe(2);
      expect(result.entries[1].chain.sequence).toBe(1);
      expect(result.entries[2].chain.sequence).toBe(0);
    });

    it('should include query metadata', async () => {
      const result = await store.query({ tenantId: 'tenant-1' });
      expect(result.metadata.query.tenantId).toBe('tenant-1');
      expect(result.metadata.executedAt).toBeInstanceOf(Date);
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getChainSegment', () => {
    it('should return entries in sequence range', async () => {
      for (let i = 0; i < 5; i++) {
        await store.append('tenant-1', createTestInput());
      }

      const segment = await store.getChainSegment('tenant-1', 1, 3);

      expect(segment).toHaveLength(3);
      expect(segment[0].chain.sequence).toBe(1);
      expect(segment[1].chain.sequence).toBe(2);
      expect(segment[2].chain.sequence).toBe(3);
    });

    it('should return empty for non-existent range', async () => {
      await store.append('tenant-1', createTestInput());
      const segment = await store.getChainSegment('tenant-1', 10, 20);
      expect(segment).toHaveLength(0);
    });
  });

  describe('getLatestEntry', () => {
    it('should return the latest entry', async () => {
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());
      const last = await store.append('tenant-1', createTestInput());

      const latest = await store.getLatestEntry('tenant-1');

      expect(latest).not.toBeNull();
      expect(latest!.id).toBe(last.id);
      expect(latest!.chain.sequence).toBe(2);
    });

    it('should return null for empty tenant', async () => {
      const latest = await store.getLatestEntry('tenant-empty');
      expect(latest).toBeNull();
    });
  });

  describe('getChainState', () => {
    it('should return chain state after appending', async () => {
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());

      const state = await store.getChainState('tenant-1');

      expect(state).not.toBeNull();
      expect(state!.tenantId).toBe('tenant-1');
      expect(state!.chainState.sequence).toBe(2);
      expect(state!.chainState.lastHash).toBeTruthy();
      expect(state!.lastEntryId).toBeTruthy();
    });

    it('should return null for tenant without entries', async () => {
      const state = await store.getChainState('tenant-empty');
      expect(state).toBeNull();
    });
  });

  describe('countEntries', () => {
    it('should count entries for tenant', async () => {
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-2', createTestInput());

      const count1 = await store.countEntries('tenant-1');
      const count2 = await store.countEntries('tenant-2');

      expect(count1).toBe(2);
      expect(count2).toBe(1);
    });

    it('should filter by high risk', async () => {
      await store.append('tenant-1', createTestInput({ highRisk: false }));
      await store.append('tenant-1', createTestInput({ highRisk: true }));
      await store.append('tenant-1', createTestInput({ highRisk: true }));

      const count = await store.countEntries('tenant-1', { highRiskOnly: true });
      expect(count).toBe(2);
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should verify intact chain', async () => {
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());

      const result = await store.verifyChainIntegrity('tenant-1');

      expect(result.valid).toBe(true);
      expect(result.entriesVerified).toBe(3);
    });

    it('should return valid for empty tenant', async () => {
      const result = await store.verifyChainIntegrity('tenant-empty');
      expect(result.valid).toBe(true);
      expect(result.entriesVerified).toBe(0);
    });

    it('should verify partial range', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append('tenant-1', createTestInput());
      }

      const result = await store.verifyChainIntegrity('tenant-1', {
        startSequence: 3,
        endSequence: 7,
      });

      expect(result.valid).toBe(true);
      expect(result.entriesVerified).toBe(5);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for tenant', async () => {
      const first = await store.append('tenant-1', createTestInput());
      await store.append('tenant-1', createTestInput());
      const last = await store.append('tenant-1', createTestInput());

      const metadata = await store.getMetadata('tenant-1');

      expect(metadata).not.toBeNull();
      expect(metadata!.tenantId).toBe('tenant-1');
      expect(metadata!.entryCount).toBe(3);
      expect(metadata!.firstEntryId).toBe(first.id);
      expect(metadata!.lastEntryId).toBe(last.id);
      expect(metadata!.lastSequence).toBe(2);
    });

    it('should return null for empty tenant', async () => {
      const metadata = await store.getMetadata('tenant-empty');
      expect(metadata).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      await store.append('tenant-1', createTestInput());
      await store.append('tenant-2', createTestInput());

      expect(store.size()).toBe(2);

      store.clear();

      expect(store.size()).toBe(0);
      expect(await store.getLatestEntry('tenant-1')).toBeNull();
    });
  });
});

// =============================================================================
// Singleton Tests
// =============================================================================

describe('Singleton Management', () => {
  afterEach(() => {
    resetImmutableAuditLogStore();
  });

  it('should return in-memory store by default', () => {
    const store = getImmutableAuditLogStore();
    expect(store).toBeInstanceOf(InMemoryAuditLogStore);
  });

  it('should return same instance on subsequent calls', () => {
    const store1 = getImmutableAuditLogStore();
    const store2 = getImmutableAuditLogStore();
    expect(store1).toBe(store2);
  });

  it('should allow setting custom store', () => {
    const customStore = createInMemoryAuditLogStore();
    setImmutableAuditLogStore(customStore);

    const retrieved = getImmutableAuditLogStore();
    expect(retrieved).toBe(customStore);
  });

  it('should reset singleton', () => {
    const store1 = getImmutableAuditLogStore();
    resetImmutableAuditLogStore();
    const store2 = getImmutableAuditLogStore();

    expect(store1).not.toBe(store2);
  });
});

// =============================================================================
// Chain Integrity Tests (End-to-End)
// =============================================================================

describe('Chain Integrity E2E', () => {
  let store: InMemoryAuditLogStore;

  beforeEach(() => {
    store = new InMemoryAuditLogStore();
  });

  afterEach(() => {
    store.clear();
  });

  it('should maintain chain integrity across many entries', async () => {
    // Append 100 entries
    for (let i = 0; i < 100; i++) {
      await store.append('tenant-1', createTestInput({
        details: { index: i },
      }));
    }

    // Verify full chain
    const result = await store.verifyChainIntegrity('tenant-1');
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(100);

    // Verify metadata
    const metadata = await store.getMetadata('tenant-1');
    expect(metadata!.entryCount).toBe(100);
    expect(metadata!.lastSequence).toBe(99);
  });

  it('should maintain chain integrity across batches', async () => {
    // Append batches
    await store.appendBatch('tenant-1', [
      createTestInput(),
      createTestInput(),
      createTestInput(),
    ]);

    await store.append('tenant-1', createTestInput());

    await store.appendBatch('tenant-1', [
      createTestInput(),
      createTestInput(),
    ]);

    // Total: 6 entries (3 + 1 + 2)
    const result = await store.verifyChainIntegrity('tenant-1');
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(6);
  });

  it('should maintain separate valid chains per tenant', async () => {
    // Create interleaved entries across tenants
    await store.append('tenant-a', createTestInput());
    await store.append('tenant-b', createTestInput());
    await store.append('tenant-a', createTestInput());
    await store.append('tenant-c', createTestInput());
    await store.append('tenant-b', createTestInput());
    await store.append('tenant-a', createTestInput());

    // Verify each tenant's chain
    const resultA = await store.verifyChainIntegrity('tenant-a');
    const resultB = await store.verifyChainIntegrity('tenant-b');
    const resultC = await store.verifyChainIntegrity('tenant-c');

    expect(resultA.valid).toBe(true);
    expect(resultA.entriesVerified).toBe(3);

    expect(resultB.valid).toBe(true);
    expect(resultB.entriesVerified).toBe(2);

    expect(resultC.valid).toBe(true);
    expect(resultC.entriesVerified).toBe(1);
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('Performance', () => {
  let store: InMemoryAuditLogStore;

  beforeEach(() => {
    store = new InMemoryAuditLogStore();
  });

  afterEach(() => {
    store.clear();
  });

  it('should append 1000 entries efficiently', async () => {
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      await store.append('tenant-1', createTestInput());
    }

    const duration = performance.now() - startTime;

    // Should complete in under 1 second
    expect(duration).toBeLessThan(1000);
    expect(store.size()).toBe(1000);
  });

  it('should query efficiently with filters', async () => {
    // Create 500 entries
    for (let i = 0; i < 500; i++) {
      await store.append('tenant-1', createTestInput({
        highRisk: i % 10 === 0,
        actor: {
          type: i % 2 === 0 ? 'user' : 'agent',
          id: `actor-${i % 5}`,
          name: `Actor ${i % 5}`,
        },
      }));
    }

    const startTime = performance.now();

    const result = await store.query({
      tenantId: 'tenant-1',
      actorType: 'user',
      highRiskOnly: true,
      limit: 50,
    });

    const duration = performance.now() - startTime;

    // Should complete in under 100ms
    expect(duration).toBeLessThan(100);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('should verify chain efficiently', async () => {
    // Create 500 entries
    for (let i = 0; i < 500; i++) {
      await store.append('tenant-1', createTestInput());
    }

    const startTime = performance.now();
    const result = await store.verifyChainIntegrity('tenant-1');
    const duration = performance.now() - startTime;

    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(500);
    // Should complete in under 500ms
    expect(duration).toBeLessThan(500);
  });
});
