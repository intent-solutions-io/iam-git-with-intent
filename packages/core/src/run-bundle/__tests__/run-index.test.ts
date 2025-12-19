/**
 * Run Index Tests
 *
 * Tests for the run index abstraction.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

import {
  LocalFsRunIndexStore,
  getRunIndexStore,
  contextToIndexEntry,
  type RunIndexEntry,
} from '../run-index.js';
import { createRun } from '../run-context.js';

// =============================================================================
// Test Helpers
// =============================================================================

let testBaseDir: string;

beforeEach(async () => {
  testBaseDir = join(tmpdir(), `gwi-index-test-${randomUUID()}`);
  await fs.mkdir(testBaseDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(testBaseDir, { recursive: true, force: true });
});

function createTestEntry(overrides?: Partial<RunIndexEntry>): RunIndexEntry {
  return {
    runId: randomUUID(),
    repo: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
    },
    state: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    initiator: 'test-user',
    ...overrides,
  };
}

// =============================================================================
// LocalFsRunIndexStore Tests
// =============================================================================

describe('LocalFsRunIndexStore', () => {
  describe('putRun / getRun', () => {
    it('should store and retrieve a run entry', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);
      const entry = createTestEntry();

      await store.putRun(entry.runId, entry);
      const retrieved = await store.getRun(entry.runId);

      expect(retrieved).toEqual(entry);
    });

    it('should return null for non-existent run', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);
      const result = await store.getRun('nonexistent');
      expect(result).toBeNull();
    });

    it('should update existing entry', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);
      const entry = createTestEntry();

      await store.putRun(entry.runId, entry);

      const updated = { ...entry, state: 'triaged' };
      await store.putRun(entry.runId, updated);

      const retrieved = await store.getRun(entry.runId);
      expect(retrieved?.state).toBe('triaged');
    });
  });

  describe('listRuns', () => {
    it('should list all runs', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);

      const entry1 = createTestEntry();
      const entry2 = createTestEntry();

      await store.putRun(entry1.runId, entry1);
      await store.putRun(entry2.runId, entry2);

      const runs = await store.listRuns();

      expect(runs.length).toBe(2);
      expect(runs.map(r => r.runId)).toContain(entry1.runId);
      expect(runs.map(r => r.runId)).toContain(entry2.runId);
    });

    it('should filter by repo', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);

      const entry1 = createTestEntry({ repo: { owner: 'a', name: 'b', fullName: 'a/b' } });
      const entry2 = createTestEntry({ repo: { owner: 'x', name: 'y', fullName: 'x/y' } });

      await store.putRun(entry1.runId, entry1);
      await store.putRun(entry2.runId, entry2);

      const runs = await store.listRuns({ repo: 'a/b' });

      expect(runs.length).toBe(1);
      expect(runs[0].runId).toBe(entry1.runId);
    });

    it('should filter by state', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);

      const entry1 = createTestEntry({ state: 'queued' });
      const entry2 = createTestEntry({ state: 'done' });

      await store.putRun(entry1.runId, entry1);
      await store.putRun(entry2.runId, entry2);

      const runs = await store.listRuns({ state: 'done' });

      expect(runs.length).toBe(1);
      expect(runs[0].runId).toBe(entry2.runId);
    });

    it('should respect limit and offset', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);

      // Create entries with sequential timestamps
      const entries = [];
      for (let i = 0; i < 5; i++) {
        const entry = createTestEntry({
          updatedAt: new Date(Date.now() + i * 1000).toISOString(),
        });
        entries.push(entry);
        await store.putRun(entry.runId, entry);
      }

      // Get first 2 (should be newest first)
      const first2 = await store.listRuns({ limit: 2 });
      expect(first2.length).toBe(2);

      // Get with offset
      const withOffset = await store.listRuns({ limit: 2, offset: 2 });
      expect(withOffset.length).toBe(2);
      expect(withOffset[0].runId).not.toBe(first2[0].runId);
    });
  });

  describe('deleteRun', () => {
    it('should delete a run entry', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);
      const entry = createTestEntry();

      await store.putRun(entry.runId, entry);
      await store.deleteRun(entry.runId);

      const result = await store.getRun(entry.runId);
      expect(result).toBeNull();
    });

    it('should not throw for non-existent run', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);
      await expect(store.deleteRun('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('syncFromBundles', () => {
    it('should sync index from existing run bundles', async () => {
      const store = new LocalFsRunIndexStore(testBaseDir);

      // Create some run bundles directly
      const context1 = await createRun({
        repo: { owner: 'sync', name: 'test1', fullName: 'sync/test1' },
        initiator: 'sync-user',
      }, testBaseDir);

      const context2 = await createRun({
        repo: { owner: 'sync', name: 'test2', fullName: 'sync/test2' },
        initiator: 'sync-user',
      }, testBaseDir);

      // Sync
      const synced = await store.syncFromBundles(testBaseDir);

      expect(synced).toBe(2);

      // Verify index contains synced runs
      const runs = await store.listRuns();
      expect(runs.length).toBe(2);
      expect(runs.map(r => r.runId)).toContain(context1.runId);
      expect(runs.map(r => r.runId)).toContain(context2.runId);
    });
  });

  describe('persistence', () => {
    it('should persist index across instances', async () => {
      const store1 = new LocalFsRunIndexStore(testBaseDir);
      const entry = createTestEntry();

      await store1.putRun(entry.runId, entry);

      // Create new instance
      const store2 = new LocalFsRunIndexStore(testBaseDir);
      const retrieved = await store2.getRun(entry.runId);

      expect(retrieved).toEqual(entry);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('getRunIndexStore', () => {
  it('should return LocalFsRunIndexStore (only supported runtime backend)', () => {
    const store = getRunIndexStore(testBaseDir);
    expect(store).toBeInstanceOf(LocalFsRunIndexStore);
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('contextToIndexEntry', () => {
  it('should convert RunContext to RunIndexEntry', async () => {
    const context = await createRun({
      repo: { owner: 'convert', name: 'test', fullName: 'convert/test' },
      initiator: 'convert-user',
      prUrl: 'https://github.com/convert/test/pull/1',
    }, testBaseDir);

    const entry = contextToIndexEntry(context);

    expect(entry.runId).toBe(context.runId);
    expect(entry.repo).toEqual(context.repo);
    expect(entry.state).toBe(context.state);
    expect(entry.createdAt).toBe(context.createdAt);
    expect(entry.updatedAt).toBe(context.updatedAt);
    expect(entry.initiator).toBe(context.initiator);
    expect(entry.prUrl).toBe(context.prUrl);
  });
});
