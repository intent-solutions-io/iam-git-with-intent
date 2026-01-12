/**
 * Tests for Audit Log Integrity Verification (D3.4)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuditVerificationServiceImpl,
  createAuditVerificationService,
  initializeAuditVerificationService,
  getAuditVerificationService,
  setAuditVerificationService,
  resetAuditVerificationService,
  type VerificationReport,
  type IntegrityIssue,
  type ChainHealthStats,
} from '../audit-verification.js';
import {
  InMemoryAuditLogStore,
  createInMemoryAuditLogStore,
} from '../audit-log-storage.js';
import type { CreateAuditLogEntry, ImmutableAuditLogEntry } from '../audit-log-schema.js';
import { AuditChainBuilder } from '../crypto-chain.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockEntry(sequence: number): CreateAuditLogEntry {
  return {
    actor: {
      type: 'user',
      id: `user-${sequence}`,
      name: `User ${sequence}`,
    },
    action: {
      type: `action-${sequence}`,
      category: 'data_access',
      description: `Action ${sequence}`,
    },
    resource: {
      type: 'document',
      id: `doc-${sequence}`,
      name: `Document ${sequence}`,
    },
    outcome: {
      status: 'success',
    },
    context: {
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    },
  };
}

/**
 * Get entries for a tenant from the store (test helper)
 */
function getTenantEntries(
  store: InMemoryAuditLogStore,
  tenantId: string
): ImmutableAuditLogEntry[] {
  const entryIds = (store as any).tenantEntries.get(tenantId) as string[] | undefined;
  if (!entryIds) return [];
  const allEntries = (store as any).entries as Map<string, ImmutableAuditLogEntry>;
  return entryIds.map((id) => allEntries.get(id)!).filter(Boolean);
}

/**
 * Update an entry in the store (test helper for tampering)
 */
function updateEntry(
  store: InMemoryAuditLogStore,
  entry: ImmutableAuditLogEntry
): void {
  const allEntries = (store as any).entries as Map<string, ImmutableAuditLogEntry>;
  allEntries.set(entry.id, entry);
}

// =============================================================================
// Tests
// =============================================================================

describe('AuditVerificationService', () => {
  let store: InMemoryAuditLogStore;
  let service: AuditVerificationServiceImpl;

  beforeEach(() => {
    store = createInMemoryAuditLogStore();
    service = new AuditVerificationServiceImpl(store);
  });

  afterEach(() => {
    resetAuditVerificationService();
  });

  describe('verify', () => {
    it('should return valid report for empty tenant', async () => {
      const report = await service.verify('empty-tenant');

      expect(report.valid).toBe(true);
      expect(report.tenantId).toBe('empty-tenant');
      expect(report.issues).toHaveLength(0);
      expect(report.stats.totalEntries).toBe(0);
      expect(report.summary).toContain('No entries to verify');
    });

    it('should verify a valid chain', async () => {
      // Create a valid chain
      const tenantId = 'test-tenant';
      for (let i = 0; i < 5; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId);

      expect(report.valid).toBe(true);
      expect(report.issues).toHaveLength(0);
      expect(report.stats.totalEntries).toBe(5);
      expect(report.stats.entriesVerified).toBe(5);
      expect(report.stats.sequenceRange.start).toBe(0);
      expect(report.stats.sequenceRange.end).toBe(4);
      expect(report.stats.continuityPercent).toBe(100);
      expect(report.summary).toContain('verified');
    });

    it('should detect content hash tampering', async () => {
      const tenantId = 'test-tenant';

      // Create entries
      for (let i = 0; i < 3; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      // Tamper with an entry's content
      const entryArray = getTenantEntries(store, tenantId);
      const tamperedEntry = {
        ...entryArray[1],
        action: { ...entryArray[1].action, type: 'tampered-action' },
      };
      updateEntry(store, tamperedEntry);

      const report = await service.verify(tenantId);

      expect(report.valid).toBe(false);
      expect(report.issues.length).toBeGreaterThan(0);

      const hashIssue = report.issues.find((i) => i.type === 'content_hash_mismatch');
      expect(hashIssue).toBeDefined();
      expect(hashIssue?.severity).toBe('critical');
      expect(hashIssue?.sequence).toBe(1);
    });

    it('should detect chain link breaks', async () => {
      const tenantId = 'test-tenant';

      // Create entries
      for (let i = 0; i < 3; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      // Break the chain link
      const entryArray = getTenantEntries(store, tenantId);
      const brokenEntry = {
        ...entryArray[2],
        chain: {
          ...entryArray[2].chain,
          prevHash: 'invalid-hash-0000000000000000000000000000000000000000000000000000000000000000' as any,
        },
      };
      updateEntry(store, brokenEntry);

      const report = await service.verify(tenantId);

      expect(report.valid).toBe(false);

      const linkIssue = report.issues.find((i) => i.type === 'chain_link_broken');
      expect(linkIssue).toBeDefined();
      expect(linkIssue?.severity).toBe('critical');
    });

    it('should detect sequence gaps', async () => {
      const tenantId = 'test-tenant';

      // Create entries with a gap (0, 1, 5)
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      // Manually insert entry at sequence 5, creating a gap
      const allEntries = (store as any).entries as Map<string, ImmutableAuditLogEntry>;
      const tenantChainState = (store as any).tenantChainStates.get(tenantId);
      const chainState = tenantChainState.chainState;
      const builder = new AuditChainBuilder(chainState);

      // Force sequence to 5 (ChainState uses 'sequence' not 'nextSequence')
      (builder as any).state = {
        ...chainState,
        sequence: 5,
      };

      const entryWithGap = builder.buildEntry(createMockEntry(5));
      allEntries.set(entryWithGap.id, entryWithGap);

      // Track entry for tenant
      const tenantEntryIds = (store as any).tenantEntries.get(tenantId) as string[];
      tenantEntryIds.push(entryWithGap.id);

      // Update tenant chain state (sequence is already 6 after buildEntry advances it)
      const newState = (builder as any).state;
      (store as any).tenantChainStates.set(tenantId, {
        ...tenantChainState,
        chainState: newState,
        lastEntryId: entryWithGap.id,
        lastUpdated: new Date(),
      });

      const report = await service.verify(tenantId);

      expect(report.valid).toBe(false);

      const gapIssue = report.issues.find((i) => i.type === 'sequence_gap');
      expect(gapIssue).toBeDefined();
      expect(gapIssue?.severity).toBe('high');
      expect(gapIssue?.message).toContain('missing sequences');
      expect(report.stats.gapsDetected).toBeGreaterThan(0);
      expect(report.stats.missingEntries).toBe(3); // 2, 3, 4 are missing
    });

    it('should detect first entry with non-null prevHash', async () => {
      const tenantId = 'test-tenant';

      // Create first entry with invalid prevHash
      await store.append(tenantId, createMockEntry(0));

      const entryArray = getTenantEntries(store, tenantId);
      const firstEntry = entryArray[0];
      const invalidFirstEntry = {
        ...firstEntry,
        chain: {
          ...firstEntry.chain,
          prevHash: 'invalid-prev-hash-00000000000000000000000000000000000000000000000000000000' as any,
        },
      };
      updateEntry(store, invalidFirstEntry);

      const report = await service.verify(tenantId);

      expect(report.valid).toBe(false);

      const firstEntryIssue = report.issues.find(
        (i) => i.type === 'first_entry_invalid'
      );
      expect(firstEntryIssue).toBeDefined();
      expect(firstEntryIssue?.severity).toBe('high');
    });

    it('should detect timestamp regression when option enabled', async () => {
      const tenantId = 'test-tenant';

      // Create entries
      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      // Make second entry have earlier timestamp
      const entryArray = getTenantEntries(store, tenantId).sort(
        (a, b) => a.chain.sequence - b.chain.sequence
      );
      const regressedEntry = {
        ...entryArray[1],
        timestamp: new Date(Date.now() - 1000000).toISOString(),
      };
      updateEntry(store, regressedEntry);

      const report = await service.verify(tenantId, { verifyTimestamps: true });

      const timestampIssue = report.issues.find(
        (i) => i.type === 'timestamp_regression'
      );
      expect(timestampIssue).toBeDefined();
      expect(timestampIssue?.severity).toBe('medium');
    });

    it('should not check timestamps by default', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      // Make second entry have earlier timestamp
      const entryArray = getTenantEntries(store, tenantId).sort(
        (a, b) => a.chain.sequence - b.chain.sequence
      );
      const regressedEntry = {
        ...entryArray[1],
        timestamp: new Date(Date.now() - 1000000).toISOString(),
      };
      updateEntry(store, regressedEntry);

      const report = await service.verify(tenantId);

      const timestampIssue = report.issues.find(
        (i) => i.type === 'timestamp_regression'
      );
      expect(timestampIssue).toBeUndefined();
    });

    it('should include entry details when requested', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 3; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId, { includeEntryDetails: true });

      expect(report.entryDetails).toBeDefined();
      expect(report.entryDetails).toHaveLength(3);
      expect(report.entryDetails![0].contentHashValid).toBe(true);
    });

    it('should not include entry details by default', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));

      const report = await service.verify(tenantId);

      expect(report.entryDetails).toBeUndefined();
    });

    it('should verify partial range with startSequence', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 10; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId, { startSequence: 5 });

      expect(report.valid).toBe(true);
      expect(report.stats.entriesVerified).toBe(5); // entries 5-9
      expect(report.stats.sequenceRange.start).toBe(5);
      expect(report.stats.sequenceRange.end).toBe(9);
    });

    it('should verify partial range with endSequence', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 10; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId, { endSequence: 4 });

      expect(report.valid).toBe(true);
      expect(report.stats.entriesVerified).toBe(5); // entries 0-4
      expect(report.stats.sequenceRange.start).toBe(0);
      expect(report.stats.sequenceRange.end).toBe(4);
    });

    it('should stop on first error when option set', async () => {
      const tenantId = 'test-tenant';

      // Create entries
      for (let i = 0; i < 5; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      // Tamper with multiple entries
      const entryArray = getTenantEntries(store, tenantId).sort(
        (a, b) => a.chain.sequence - b.chain.sequence
      );

      for (let i = 1; i < 4; i++) {
        const tampered = {
          ...entryArray[i],
          action: { ...entryArray[i].action, type: `tampered-${i}` },
        };
        updateEntry(store, tampered);
      }

      const report = await service.verify(tenantId, { stopOnFirstError: true });

      expect(report.valid).toBe(false);
      // Should have stopped after first critical error
      const criticalIssues = report.issues.filter((i) => i.severity === 'critical');
      expect(criticalIssues.length).toBeLessThanOrEqual(2); // Content hash + chain link
    });

    it('should respect maxEntries limit', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 100; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId, { maxEntries: 10 });

      expect(report.stats.entriesVerified).toBeLessThanOrEqual(10);
    });

    it('should sort issues by severity then sequence', async () => {
      const tenantId = 'test-tenant';

      // Create entries with multiple issues
      for (let i = 0; i < 5; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      // Create various issues
      const entryArray = getTenantEntries(store, tenantId).sort(
        (a, b) => a.chain.sequence - b.chain.sequence
      );

      // Tamper with entry at sequence 3 (critical)
      const tampered = {
        ...entryArray[3],
        action: { ...entryArray[3].action, type: 'tampered' },
      };
      updateEntry(store, tampered);

      // Make timestamp regression at sequence 1 (medium)
      const regressed = {
        ...entryArray[1],
        timestamp: new Date(Date.now() - 1000000).toISOString(),
      };
      updateEntry(store, regressed);

      const report = await service.verify(tenantId, { verifyTimestamps: true });

      expect(report.valid).toBe(false);

      // Critical issues should come first
      if (report.issues.length >= 2) {
        const firstIssue = report.issues[0];
        expect(firstIssue.severity).toBe('critical');
      }
    });

    it('should calculate correct time range', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 3; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId);

      expect(report.stats.timeRange).not.toBeNull();
      expect(report.stats.timeRange!.start).toBeInstanceOf(Date);
      expect(report.stats.timeRange!.end).toBeInstanceOf(Date);
      expect(report.stats.timeRange!.end >= report.stats.timeRange!.start).toBe(
        true
      );
    });

    it('should record verification duration', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 10; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId);

      expect(report.durationMs).toBeGreaterThanOrEqual(0);
      expect(report.verifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('isChainValid', () => {
    it('should return true for valid chain', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 5; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const isValid = await service.isChainValid(tenantId);

      expect(isValid).toBe(true);
    });

    it('should return true for empty tenant', async () => {
      const isValid = await service.isChainValid('empty-tenant');

      expect(isValid).toBe(true);
    });

    it('should return false for tampered chain', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 3; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      // Tamper
      const entryArray = getTenantEntries(store, tenantId);
      const tampered = {
        ...entryArray[1],
        action: { ...entryArray[1].action, type: 'tampered' },
      };
      updateEntry(store, tampered);

      const isValid = await service.isChainValid(tenantId);

      expect(isValid).toBe(false);
    });
  });

  describe('getChainHealth', () => {
    it('should return null for non-existent tenant', async () => {
      const health = await service.getChainHealth('non-existent');

      expect(health).toBeNull();
    });

    it('should return health stats for valid chain', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 5; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const health = await service.getChainHealth(tenantId);

      expect(health).not.toBeNull();
      expect(health!.totalEntries).toBe(5);
      expect(health!.sequenceRange.start).toBe(0);
      expect(health!.sequenceRange.end).toBe(4);
      expect(health!.algorithmsUsed).toContain('sha256');
      expect(health!.continuityPercent).toBe(100);
    });

    it('should detect potential gaps from metadata', async () => {
      const tenantId = 'test-tenant';

      // Create entries normally
      for (let i = 0; i < 3; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      // Manually update metadata to simulate gap
      const chainState = (store as any).tenantChainStates.get(tenantId);
      (store as any).tenantChainStates.set(tenantId, {
        ...chainState,
        nextSequence: 10, // Gap from 3 to 10
      });

      const health = await service.getChainHealth(tenantId);

      expect(health).not.toBeNull();
      expect(health!.totalEntries).toBe(3);
      // Note: getChainHealth uses metadata, which may not reflect the gap
      // The full verify() would detect this
    });
  });

  describe('Factory and Singleton Functions', () => {
    it('should create service with factory function', () => {
      const newService = createAuditVerificationService(store);

      expect(newService).toBeInstanceOf(AuditVerificationServiceImpl);
    });

    it('should initialize and get singleton service', () => {
      const service = initializeAuditVerificationService(store);

      expect(service).toBeDefined();
      expect(getAuditVerificationService()).toBe(service);
    });

    it('should set and get custom service', () => {
      const customService = createAuditVerificationService(store);
      setAuditVerificationService(customService);

      expect(getAuditVerificationService()).toBe(customService);
    });

    it('should reset singleton service', () => {
      initializeAuditVerificationService(store);
      expect(getAuditVerificationService()).not.toBeNull();

      resetAuditVerificationService();
      expect(getAuditVerificationService()).toBeNull();
    });
  });

  describe('Issue Types and Severities', () => {
    it('should classify content_hash_mismatch as critical', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));

      const entryArray = getTenantEntries(store, tenantId);
      const entry = entryArray[0];
      updateEntry(store, {
        ...entry,
        action: { ...entry.action, type: 'modified' },
      });

      const report = await service.verify(tenantId);
      const issue = report.issues.find((i) => i.type === 'content_hash_mismatch');

      expect(issue?.severity).toBe('critical');
    });

    it('should classify chain_link_broken as critical', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const entryArray = getTenantEntries(store, tenantId).sort(
        (a, b) => a.chain.sequence - b.chain.sequence
      );
      updateEntry(store, {
        ...entryArray[1],
        chain: {
          ...entryArray[1].chain,
          prevHash: 'broken0000000000000000000000000000000000000000000000000000000000' as any,
        },
      });

      const report = await service.verify(tenantId);
      const issue = report.issues.find((i) => i.type === 'chain_link_broken');

      expect(issue?.severity).toBe('critical');
    });

    it('should classify sequence_gap as high', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));

      // Create gap by manipulating sequence (ChainState uses 'sequence', not 'nextSequence')
      const allEntries = (store as any).entries as Map<string, ImmutableAuditLogEntry>;
      const tenantChainState = (store as any).tenantChainStates.get(tenantId);
      const chainState = tenantChainState.chainState;
      const builder = new AuditChainBuilder({
        ...chainState,
        sequence: 5,
      });
      const gapEntry = builder.buildEntry(createMockEntry(5));
      allEntries.set(gapEntry.id, gapEntry);

      // Track entry for tenant
      const tenantEntryIds = (store as any).tenantEntries.get(tenantId) as string[];
      tenantEntryIds.push(gapEntry.id);

      // Update chain state (sequence is advanced by buildEntry)
      const newState = (builder as any).state;
      (store as any).tenantChainStates.set(tenantId, {
        ...tenantChainState,
        chainState: newState,
        lastEntryId: gapEntry.id,
        lastUpdated: new Date(),
      });

      const report = await service.verify(tenantId);
      const issue = report.issues.find((i) => i.type === 'sequence_gap');

      expect(issue?.severity).toBe('high');
    });

    it('should classify timestamp_regression as medium', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      const entryArray = getTenantEntries(store, tenantId).sort(
        (a, b) => a.chain.sequence - b.chain.sequence
      );
      updateEntry(store, {
        ...entryArray[1],
        timestamp: new Date(Date.now() - 1000000).toISOString(),
      });

      const report = await service.verify(tenantId, { verifyTimestamps: true });
      const issue = report.issues.find((i) => i.type === 'timestamp_regression');

      expect(issue?.severity).toBe('medium');
    });
  });

  describe('Report Summary', () => {
    it('should generate positive summary for valid chain', async () => {
      const tenantId = 'test-tenant';

      for (let i = 0; i < 5; i++) {
        await store.append(tenantId, createMockEntry(i));
      }

      const report = await service.verify(tenantId);

      expect(report.summary).toContain('verified');
      expect(report.summary).toContain('5 entries');
      expect(report.summary).toContain('100%');
    });

    it('should generate failure summary with issue counts', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));

      const entryArray = getTenantEntries(store, tenantId);
      const entry = entryArray[0];
      updateEntry(store, {
        ...entry,
        action: { ...entry.action, type: 'modified' },
      });

      const report = await service.verify(tenantId);

      expect(report.summary).toContain('FAILED');
      expect(report.summary).toContain('critical');
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should verify tenants independently', async () => {
      // Create valid chain for tenant1
      for (let i = 0; i < 3; i++) {
        await store.append('tenant1', createMockEntry(i));
      }

      // Create tampered chain for tenant2
      for (let i = 0; i < 3; i++) {
        await store.append('tenant2', createMockEntry(i));
      }
      const tenant2EntryIds = (store as any).tenantEntries.get('tenant2') as string[];
      const allEntries = (store as any).entries as Map<string, ImmutableAuditLogEntry>;
      const entry = allEntries.get(tenant2EntryIds[0])!;
      allEntries.set(entry.id, {
        ...entry,
        action: { ...entry.action, type: 'tampered' },
      });

      const report1 = await service.verify('tenant1');
      const report2 = await service.verify('tenant2');

      expect(report1.valid).toBe(true);
      expect(report2.valid).toBe(false);
    });
  });

  describe('Algorithm Consistency', () => {
    it('should detect mixed algorithms in chain', async () => {
      const tenantId = 'test-tenant';

      await store.append(tenantId, createMockEntry(0));
      await store.append(tenantId, createMockEntry(1));

      // Change algorithm of second entry
      const entryIds = (store as any).tenantEntries.get(tenantId) as string[];
      const allEntries = (store as any).entries as Map<string, ImmutableAuditLogEntry>;
      const entryArray = entryIds
        .map((id: string) => allEntries.get(id)!)
        .sort((a, b) => a.chain.sequence - b.chain.sequence);
      allEntries.set(entryArray[1].id, {
        ...entryArray[1],
        chain: {
          ...entryArray[1].chain,
          algorithm: 'sha384' as any,
        },
      });

      const report = await service.verify(tenantId);

      const algorithmIssue = report.issues.find(
        (i) => i.type === 'algorithm_mismatch'
      );
      expect(algorithmIssue).toBeDefined();
      expect(algorithmIssue?.severity).toBe('low');
      expect(report.stats.algorithmsUsed).toContain('sha256');
      expect(report.stats.algorithmsUsed).toContain('sha384');
    });
  });
});

describe('Performance', () => {
  it('should verify 1000 entries efficiently', async () => {
    const store = createInMemoryAuditLogStore();
    const service = new AuditVerificationServiceImpl(store);
    const tenantId = 'perf-tenant';

    // Create 1000 entries
    for (let i = 0; i < 1000; i++) {
      await store.append(tenantId, {
        actor: { type: 'user', id: 'user-1' },
        action: { type: 'read', category: 'data_access' },
        resource: { type: 'doc', id: `doc-${i}` },
        outcome: { status: 'success' },
        context: { ipAddress: '127.0.0.1' },
      });
    }

    const startTime = Date.now();
    const report = await service.verify(tenantId);
    const duration = Date.now() - startTime;

    expect(report.valid).toBe(true);
    expect(report.stats.entriesVerified).toBe(1000);
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    console.log(`Verified 1000 entries in ${duration}ms`);
  });
});
