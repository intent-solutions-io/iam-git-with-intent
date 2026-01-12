/**
 * Cryptographic Chaining Tests
 *
 * Tests for D3.2: Implement cryptographic chaining
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Hash functions
  sha256,
  sha384,
  sha512,
  computeHash,
  toCanonicalJson,
  computeContentHash,
  computeContextHash,

  // Chain builder
  createChainState,
  buildChainLink,
  advanceChainState,
  AuditChainBuilder,

  // Chain verification
  verifyEntryContentHash,
  verifyChainLink,
  verifyChain,

  // Merkle tree
  MerkleTree,
  buildMerkleTree,
  verifyMerkleProof,

  // Batch operations
  createBatch,
  verifyBatch,

  // Schemas
  ChainStateSchema,
  MerkleProofSchema,

  // Types
  type ChainState,
  type MerkleProof,
} from '../crypto-chain.js';

import {
  type ImmutableAuditLogEntry,
  type CreateAuditLogEntry,
  type AuditLogEntryId,
  type SHA256Hash,
} from '../audit-log-schema.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestInput(overrides?: Partial<CreateAuditLogEntry>): CreateAuditLogEntry {
  return {
    actor: {
      type: 'user',
      id: 'user-123',
      displayName: 'Test User',
    },
    action: {
      category: 'policy',
      type: 'policy.rule.evaluated',
      sensitive: false,
    },
    outcome: {
      status: 'success',
      durationMs: 10,
    },
    context: {
      tenantId: 'tenant-123',
      orgId: 'org-456',
      environment: 'production',
    },
    tags: ['test'],
    highRisk: false,
    compliance: [],
    details: { testKey: 'testValue' },
    ...overrides,
  };
}

function createMockEntry(sequence: number, prevHash: SHA256Hash | null): ImmutableAuditLogEntry {
  const builder = new AuditChainBuilder();
  if (sequence > 0 && prevHash) {
    builder.initializeFrom(sequence, prevHash);
  }
  // Adjust to get correct sequence
  for (let i = 0; i < sequence; i++) {
    builder.buildEntry(createTestInput());
  }
  return builder.buildEntry(createTestInput());
}

// =============================================================================
// Hash Function Tests
// =============================================================================

describe('Hash Functions', () => {
  describe('sha256', () => {
    it('should compute correct SHA-256 hash', () => {
      const hash = sha256('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
      expect(hash.length).toBe(64);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256('hello');
      const hash2 = sha256('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash for same input', () => {
      const hash1 = sha256('test data');
      const hash2 = sha256('test data');
      expect(hash1).toBe(hash2);
    });
  });

  describe('sha384', () => {
    it('should compute correct SHA-384 hash', () => {
      const hash = sha384('hello');
      expect(hash.length).toBe(96);
    });
  });

  describe('sha512', () => {
    it('should compute correct SHA-512 hash', () => {
      const hash = sha512('hello');
      expect(hash.length).toBe(128);
    });
  });

  describe('computeHash', () => {
    it('should use sha256 by default', () => {
      const hash = computeHash('test');
      expect(hash).toBe(sha256('test'));
    });

    it('should support all algorithms', () => {
      expect(computeHash('test', 'sha256').length).toBe(64);
      expect(computeHash('test', 'sha384').length).toBe(96);
      expect(computeHash('test', 'sha512').length).toBe(128);
    });

    it('should throw for unsupported algorithm', () => {
      expect(() => computeHash('test', 'md5' as any)).toThrow('Unsupported hash algorithm');
    });
  });
});

// =============================================================================
// Canonical JSON Tests
// =============================================================================

describe('toCanonicalJson', () => {
  it('should sort object keys alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const json = toCanonicalJson(obj);
    expect(json).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should handle nested objects', () => {
    const obj = { b: { d: 1, c: 2 }, a: 3 };
    const json = toCanonicalJson(obj);
    expect(json).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('should preserve arrays in order', () => {
    const obj = { arr: [3, 1, 2] };
    const json = toCanonicalJson(obj);
    expect(json).toBe('{"arr":[3,1,2]}');
  });

  it('should produce deterministic output', () => {
    const obj1 = { b: 1, a: 2 };
    const obj2 = { a: 2, b: 1 };
    expect(toCanonicalJson(obj1)).toBe(toCanonicalJson(obj2));
  });

  it('should handle null and undefined', () => {
    const obj = { a: null, b: undefined };
    const json = toCanonicalJson(obj);
    expect(json).toBe('{"a":null}');
  });
});

// =============================================================================
// Content Hash Tests
// =============================================================================

describe('computeContentHash', () => {
  it('should compute hash from entry content', () => {
    const builder = new AuditChainBuilder();
    const entry = builder.buildEntry(createTestInput());

    // Remove chain and contextHash for comparison
    const partialEntry = { ...entry };
    delete (partialEntry as any).chain;
    delete (partialEntry as any).contextHash;
    delete (partialEntry as any).receivedAt;

    const hash = computeContentHash(partialEntry);
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it('should produce different hashes for different content', () => {
    const builder = new AuditChainBuilder();
    const entry1 = builder.buildEntry(createTestInput({ details: { key: 'value1' } }));
    const entry2 = builder.buildEntry(createTestInput({ details: { key: 'value2' } }));

    expect(entry1.chain.contentHash).not.toBe(entry2.chain.contentHash);
  });

  it('should produce same hash for equivalent content', () => {
    const builder1 = new AuditChainBuilder();
    const builder2 = new AuditChainBuilder();

    // Use same timestamp for deterministic comparison
    const timestamp = '2024-01-01T00:00:00.000Z';
    const entry1 = builder1.buildEntry(createTestInput({ timestamp }));
    const entry2 = builder2.buildEntry(createTestInput({ timestamp }));

    // IDs will differ, but content hash calculation excludes chain
    // So we compare the hash computation directly
    const partialEntry1 = { ...entry1 };
    delete (partialEntry1 as any).chain;
    delete (partialEntry1 as any).contextHash;
    delete (partialEntry1 as any).receivedAt;
    (partialEntry1 as any).id = 'normalized-id';

    const partialEntry2 = { ...entry2 };
    delete (partialEntry2 as any).chain;
    delete (partialEntry2 as any).contextHash;
    delete (partialEntry2 as any).receivedAt;
    (partialEntry2 as any).id = 'normalized-id';

    expect(computeContentHash(partialEntry1)).toBe(computeContentHash(partialEntry2));
  });
});

// =============================================================================
// Context Hash Tests
// =============================================================================

describe('computeContextHash', () => {
  it('should compute hash from context fields', () => {
    const context = {
      tenantId: 'tenant-123',
      orgId: 'org-456',
      environment: 'production' as const,
    };

    const result = computeContextHash(context);
    expect(result.algorithm).toBe('sha256');
    expect(result.value.length).toBe(64);
    expect(result.fields).toContain('tenantId');
    expect(result.fields).toContain('orgId');
  });

  it('should only include defined fields', () => {
    const context = {
      tenantId: 'tenant-123',
    };

    const result = computeContextHash(context);
    expect(result.fields).toEqual(['tenantId']);
  });
});

// =============================================================================
// Chain State Tests
// =============================================================================

describe('Chain State', () => {
  describe('createChainState', () => {
    it('should create initial state', () => {
      const state = createChainState();
      expect(state.sequence).toBe(0);
      expect(state.lastHash).toBeNull();
      expect(state.algorithm).toBe('sha256');
    });

    it('should accept custom algorithm', () => {
      const state = createChainState('sha512');
      expect(state.algorithm).toBe('sha512');
    });
  });

  describe('buildChainLink', () => {
    it('should build first chain link with null prevHash', () => {
      const state = createChainState();
      const contentHash = sha256('test') as SHA256Hash;
      const link = buildChainLink(state, contentHash);

      expect(link.sequence).toBe(0);
      expect(link.prevHash).toBeNull();
      expect(link.contentHash).toBe(contentHash);
      expect(link.algorithm).toBe('sha256');
      expect(link.computedAt).toBeDefined();
    });

    it('should include prevHash for subsequent links', () => {
      let state = createChainState();
      const hash1 = sha256('first') as SHA256Hash;
      state = advanceChainState(state, hash1);

      const hash2 = sha256('second') as SHA256Hash;
      const link = buildChainLink(state, hash2);

      expect(link.sequence).toBe(1);
      expect(link.prevHash).toBe(hash1);
    });
  });

  describe('advanceChainState', () => {
    it('should increment sequence and update lastHash', () => {
      let state = createChainState();
      const hash = sha256('test') as SHA256Hash;

      state = advanceChainState(state, hash);
      expect(state.sequence).toBe(1);
      expect(state.lastHash).toBe(hash);

      const hash2 = sha256('test2') as SHA256Hash;
      state = advanceChainState(state, hash2);
      expect(state.sequence).toBe(2);
      expect(state.lastHash).toBe(hash2);
    });
  });
});

// =============================================================================
// AuditChainBuilder Tests
// =============================================================================

describe('AuditChainBuilder', () => {
  let builder: AuditChainBuilder;

  beforeEach(() => {
    builder = new AuditChainBuilder();
  });

  describe('buildEntry', () => {
    it('should build entry with chain link', () => {
      const input = createTestInput();
      const entry = builder.buildEntry(input);

      expect(entry.id).toMatch(/^alog-\d+-0-[a-f0-9]{6}$/);
      expect(entry.schemaVersion).toBe('1.0');
      expect(entry.chain.sequence).toBe(0);
      expect(entry.chain.prevHash).toBeNull();
      expect(entry.chain.contentHash.length).toBe(64);
      expect(entry.contextHash).toBeDefined();
    });

    it('should link entries via prevHash', () => {
      const entry1 = builder.buildEntry(createTestInput());
      const entry2 = builder.buildEntry(createTestInput());
      const entry3 = builder.buildEntry(createTestInput());

      expect(entry1.chain.sequence).toBe(0);
      expect(entry2.chain.sequence).toBe(1);
      expect(entry3.chain.sequence).toBe(2);

      expect(entry1.chain.prevHash).toBeNull();
      expect(entry2.chain.prevHash).toBe(entry1.chain.contentHash);
      expect(entry3.chain.prevHash).toBe(entry2.chain.contentHash);
    });

    it('should use provided timestamp', () => {
      const timestamp = '2024-06-15T12:00:00.000Z';
      const entry = builder.buildEntry(createTestInput({ timestamp }));
      expect(entry.timestamp).toBe(timestamp);
    });
  });

  describe('buildEntries', () => {
    it('should build multiple entries with correct chain', () => {
      const inputs = [
        createTestInput({ details: { index: 0 } }),
        createTestInput({ details: { index: 1 } }),
        createTestInput({ details: { index: 2 } }),
      ];

      const entries = builder.buildEntries(inputs);

      expect(entries.length).toBe(3);
      expect(entries[0].chain.prevHash).toBeNull();
      expect(entries[1].chain.prevHash).toBe(entries[0].chain.contentHash);
      expect(entries[2].chain.prevHash).toBe(entries[1].chain.contentHash);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      builder.buildEntry(createTestInput());
      const state = builder.getState();

      expect(state.sequence).toBe(1);
      expect(state.lastHash).not.toBeNull();
    });
  });

  describe('initializeFrom', () => {
    it('should initialize from existing state', () => {
      const prevHash = sha256('previous') as SHA256Hash;
      builder.initializeFrom(100, prevHash);

      const entry = builder.buildEntry(createTestInput());
      expect(entry.chain.sequence).toBe(100);
      expect(entry.chain.prevHash).toBe(prevHash);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      builder.buildEntry(createTestInput());
      builder.buildEntry(createTestInput());

      builder.reset();

      expect(builder.getSequence()).toBe(0);
      expect(builder.getLastHash()).toBeNull();
    });
  });
});

// =============================================================================
// Chain Verification Tests
// =============================================================================

describe('Chain Verification', () => {
  describe('verifyEntryContentHash', () => {
    it('should verify valid entry', () => {
      const builder = new AuditChainBuilder();
      const entry = builder.buildEntry(createTestInput());

      const result = verifyEntryContentHash(entry);
      expect(result.contentHashValid).toBe(true);
      expect(result.expectedContentHash).toBe(result.actualContentHash);
    });

    it('should detect tampered content', () => {
      const builder = new AuditChainBuilder();
      const entry = builder.buildEntry(createTestInput());

      // Tamper with entry
      (entry as any).details = { tampered: true };

      const result = verifyEntryContentHash(entry);
      expect(result.contentHashValid).toBe(false);
      expect(result.error).toBe('Content hash mismatch');
    });
  });

  describe('verifyChainLink', () => {
    it('should verify first entry with null prevHash', () => {
      const builder = new AuditChainBuilder();
      const entry = builder.buildEntry(createTestInput());

      expect(verifyChainLink(entry, null)).toBe(true);
    });

    it('should verify chain between entries', () => {
      const builder = new AuditChainBuilder();
      const entry1 = builder.buildEntry(createTestInput());
      const entry2 = builder.buildEntry(createTestInput());

      expect(verifyChainLink(entry2, entry1)).toBe(true);
    });

    it('should detect broken chain', () => {
      const builder1 = new AuditChainBuilder();
      const entry1 = builder1.buildEntry(createTestInput());

      const builder2 = new AuditChainBuilder();
      const entry2 = builder2.buildEntry(createTestInput());

      // entry2 was built with different chain, so link should be broken
      expect(verifyChainLink(entry2, entry1)).toBe(false);
    });
  });

  describe('verifyChain', () => {
    it('should verify valid chain', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      const result = verifyChain(entries);
      expect(result.valid).toBe(true);
      expect(result.entriesVerified).toBe(3);
      expect(result.details.length).toBe(3);
    });

    it('should verify empty chain', () => {
      const result = verifyChain([]);
      expect(result.valid).toBe(true);
      expect(result.entriesVerified).toBe(0);
    });

    it('should detect sequence gap', () => {
      const builder = new AuditChainBuilder();
      const entry1 = builder.buildEntry(createTestInput());
      builder.buildEntry(createTestInput()); // Skip this one
      const entry3 = builder.buildEntry(createTestInput());

      const result = verifyChain([entry1, entry3]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Sequence mismatch');
    });

    it('should detect tampered entry in chain', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      // Tamper with middle entry
      (entries[1] as any).details = { tampered: true };

      const result = verifyChain(entries);
      expect(result.valid).toBe(false);
      expect(result.firstInvalidSequence).toBe(1);
    });

    it('should verify chain with custom start sequence', () => {
      const builder = new AuditChainBuilder();
      builder.initializeFrom(100, sha256('prev') as SHA256Hash);
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
      ]);

      const result = verifyChain(entries, {
        startSequence: 100,
        expectedFirstPrevHash: sha256('prev') as SHA256Hash,
      });
      expect(result.valid).toBe(true);
    });

    it('should return duration', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([createTestInput()]);

      const result = verifyChain(entries);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// Merkle Tree Tests
// =============================================================================

describe('MerkleTree', () => {
  describe('build', () => {
    it('should build tree from entries', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      const tree = new MerkleTree();
      tree.build(entries);

      expect(tree.getRootHash()).not.toBeNull();
      expect(tree.getRootHash()?.length).toBe(64);
      expect(tree.getLeaves().length).toBe(4);
    });

    it('should handle single entry', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([createTestInput()]);

      const tree = new MerkleTree();
      tree.build(entries);

      expect(tree.getRootHash()).toBe(entries[0].chain.contentHash);
    });

    it('should handle empty entries', () => {
      const tree = new MerkleTree();
      tree.build([]);

      expect(tree.getRootHash()).toBeNull();
      expect(tree.getLeaves().length).toBe(0);
    });

    it('should handle odd number of entries', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      const tree = new MerkleTree();
      tree.build(entries);

      expect(tree.getRootHash()).not.toBeNull();
    });
  });

  describe('getProof', () => {
    it('should generate valid proof', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      const tree = new MerkleTree();
      tree.build(entries);

      const proof = tree.getProof(entries[1].id);
      expect(proof).not.toBeNull();
      expect(proof?.entryId).toBe(entries[1].id);
      expect(proof?.leafHash).toBe(entries[1].chain.contentHash);
      expect(proof?.rootHash).toBe(tree.getRootHash());
    });

    it('should return null for non-existent entry', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([createTestInput()]);

      const tree = new MerkleTree();
      tree.build(entries);

      const proof = tree.getProof('non-existent-id');
      expect(proof).toBeNull();
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proof', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      const tree = new MerkleTree();
      tree.build(entries);

      for (const entry of entries) {
        const proof = tree.getProof(entry.id);
        expect(proof).not.toBeNull();
        expect(tree.verifyProof(proof!)).toBe(true);
      }
    });

    it('should reject tampered proof', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
      ]);

      const tree = new MerkleTree();
      tree.build(entries);

      const proof = tree.getProof(entries[0].id)!;
      proof.leafHash = sha256('tampered');

      expect(tree.verifyProof(proof)).toBe(false);
    });
  });

  describe('getDepth', () => {
    it('should return correct depth', () => {
      const builder = new AuditChainBuilder();

      // 1 entry = depth 1
      let entries = builder.buildEntries([createTestInput()]);
      let tree = new MerkleTree();
      tree.build(entries);
      expect(tree.getDepth()).toBe(1);

      // 2 entries = depth 2
      builder.reset();
      entries = builder.buildEntries([createTestInput(), createTestInput()]);
      tree = new MerkleTree();
      tree.build(entries);
      expect(tree.getDepth()).toBe(2);

      // 4 entries = depth 3
      builder.reset();
      entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);
      tree = new MerkleTree();
      tree.build(entries);
      expect(tree.getDepth()).toBe(3);
    });
  });
});

// =============================================================================
// Batch Operations Tests
// =============================================================================

describe('Batch Operations', () => {
  describe('createBatch', () => {
    it('should create batch with Merkle root', () => {
      const builder = new AuditChainBuilder();
      const inputs = [
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ];

      const result = createBatch(builder, inputs);

      expect(result.entries.length).toBe(3);
      expect(result.merkleRoot.length).toBe(64);
      expect(result.startSequence).toBe(0);
      expect(result.endSequence).toBe(2);
      expect(result.createdAt).toBeDefined();
    });

    it('should handle empty batch', () => {
      const builder = new AuditChainBuilder();
      const result = createBatch(builder, []);

      expect(result.entries.length).toBe(0);
      expect(result.merkleRoot).toBe('');
    });
  });

  describe('verifyBatch', () => {
    it('should verify valid batch', () => {
      const builder = new AuditChainBuilder();
      const batch = createBatch(builder, [
        createTestInput(),
        createTestInput(),
        createTestInput(),
      ]);

      const result = verifyBatch(batch.entries, batch.merkleRoot);

      expect(result.chainValid).toBe(true);
      expect(result.merkleValid).toBe(true);
    });

    it('should detect invalid Merkle root', () => {
      const builder = new AuditChainBuilder();
      const batch = createBatch(builder, [createTestInput()]);

      const result = verifyBatch(batch.entries, sha256('wrong'));

      expect(result.chainValid).toBe(true);
      expect(result.merkleValid).toBe(false);
    });

    it('should detect tampered entry', () => {
      const builder = new AuditChainBuilder();
      const batch = createBatch(builder, [
        createTestInput(),
        createTestInput(),
      ]);

      (batch.entries[0] as any).details = { tampered: true };

      const result = verifyBatch(batch.entries, batch.merkleRoot);

      expect(result.chainValid).toBe(false);
      expect(result.merkleValid).toBe(false);
    });
  });
});

// =============================================================================
// Schema Tests
// =============================================================================

describe('Schemas', () => {
  describe('ChainStateSchema', () => {
    it('should validate valid chain state', () => {
      const state: ChainState = {
        sequence: 10,
        lastHash: 'a'.repeat(64) as SHA256Hash,
        algorithm: 'sha256',
      };

      const result = ChainStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('should accept null lastHash', () => {
      const state = {
        sequence: 0,
        lastHash: null,
        algorithm: 'sha256',
      };

      const result = ChainStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });
  });

  describe('MerkleProofSchema', () => {
    it('should validate valid proof', () => {
      const proof: MerkleProof = {
        entryId: 'entry-123',
        leafHash: 'a'.repeat(64),
        siblings: [
          { hash: 'b'.repeat(64), position: 'right' },
          { hash: 'c'.repeat(64), position: 'left' },
        ],
        rootHash: 'd'.repeat(64),
      };

      const result = MerkleProofSchema.safeParse(proof);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('Helper Functions', () => {
  describe('buildMerkleTree', () => {
    it('should build tree from entries', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([createTestInput()]);

      const tree = buildMerkleTree(entries);
      expect(tree.getRootHash()).not.toBeNull();
    });
  });

  describe('verifyMerkleProof', () => {
    it('should verify proof', () => {
      const builder = new AuditChainBuilder();
      const entries = builder.buildEntries([
        createTestInput(),
        createTestInput(),
      ]);

      const tree = buildMerkleTree(entries);
      const proof = tree.getProof(entries[0].id)!;

      expect(verifyMerkleProof(proof)).toBe(true);
    });
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('Performance', () => {
  it('should build chain of 1000 entries efficiently', () => {
    const builder = new AuditChainBuilder();
    const inputs = Array.from({ length: 1000 }, (_, i) =>
      createTestInput({ details: { index: i } })
    );

    const start = Date.now();
    const entries = builder.buildEntries(inputs);
    const duration = Date.now() - start;

    expect(entries.length).toBe(1000);
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });

  it('should verify chain of 1000 entries efficiently', () => {
    const builder = new AuditChainBuilder();
    const entries = builder.buildEntries(
      Array.from({ length: 1000 }, (_, i) =>
        createTestInput({ details: { index: i } })
      )
    );

    const start = Date.now();
    const result = verifyChain(entries);
    const duration = Date.now() - start;

    expect(result.valid).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  it('should build Merkle tree for 1000 entries efficiently', () => {
    const builder = new AuditChainBuilder();
    const entries = builder.buildEntries(
      Array.from({ length: 1000 }, (_, i) =>
        createTestInput({ details: { index: i } })
      )
    );

    const start = Date.now();
    const tree = buildMerkleTree(entries);
    const duration = Date.now() - start;

    expect(tree.getRootHash()).not.toBeNull();
    expect(duration).toBeLessThan(1000); // Should be very fast
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle entries with special characters in details', () => {
    const builder = new AuditChainBuilder();
    const entry = builder.buildEntry(createTestInput({
      details: {
        message: 'Test with "quotes" and \'apostrophes\'',
        unicode: '日本語テスト 🎉',
        newlines: 'line1\nline2\r\nline3',
      },
    }));

    const result = verifyEntryContentHash(entry);
    expect(result.contentHashValid).toBe(true);
  });

  it('should handle very long chains', () => {
    const builder = new AuditChainBuilder();

    // Build chain in smaller batches
    for (let i = 0; i < 10; i++) {
      builder.buildEntry(createTestInput());
    }

    expect(builder.getSequence()).toBe(10);
    expect(builder.getLastHash()).not.toBeNull();
  });

  it('should handle rebuilding from saved state', () => {
    const builder1 = new AuditChainBuilder();
    builder1.buildEntry(createTestInput());
    builder1.buildEntry(createTestInput());

    const state = builder1.getState();

    // Simulate saving and restoring
    const builder2 = new AuditChainBuilder();
    builder2.initializeFrom(state.sequence, state.lastHash);

    const entry = builder2.buildEntry(createTestInput());
    expect(entry.chain.sequence).toBe(2);
    expect(entry.chain.prevHash).toBe(state.lastHash);
  });
});
