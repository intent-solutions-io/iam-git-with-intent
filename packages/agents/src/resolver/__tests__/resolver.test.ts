/**
 * Resolver Agent Tests
 *
 * Tests for ResolverAgent conflict resolution functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResolverAgent } from '../index.js';
import type { PRMetadata, ConflictInfo, ComplexityScore } from '@gwi/core';

// Mock AgentFS
vi.mock('@gwi/core/agentfs', () => ({
  openAgentFS: vi.fn(() => Promise.resolve({
    kv: {
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
      list: vi.fn(() => Promise.resolve([])),
    },
    fs: {
      writeFile: vi.fn(() => Promise.resolve()),
      readFile: vi.fn(() => Promise.resolve(Buffer.from(''))),
      readdir: vi.fn(() => Promise.resolve([])),
      mkdir: vi.fn(() => Promise.resolve()),
      unlink: vi.fn(() => Promise.resolve()),
      exists: vi.fn(() => Promise.resolve(false)),
    },
    tools: {
      record: vi.fn(() => Promise.resolve()),
      list: vi.fn(() => Promise.resolve([])),
    },
  })),
  createAgentId: vi.fn((name: string) => `spiffe://intent.solutions/agent/${name}`),
  AuditLogger: vi.fn().mockImplementation(() => ({
    record: vi.fn(async <T>(_name: string, _input: unknown, fn: () => Promise<T>) => fn()),
    getRecent: vi.fn(() => Promise.resolve([])),
  })),
}));

// Track which model was called
let lastModelUsed = '';

// Mock model selector with realistic resolution responses
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn((options: { model: { model: string } }) => {
      lastModelUsed = options.model.model;
      return Promise.resolve({
        content: JSON.stringify({
          resolvedContent: '// Resolved content\nfunction merged() { return true; }',
          explanation: 'Merged both changes as they were compatible additions',
          confidence: 85,
          strategy: 'merge-both',
        }),
        model: options.model.model,
        tokensUsed: { input: 500, output: 200 },
        finishReason: 'stop',
      });
    }),
  })),
  MODELS: {
    anthropic: {
      haiku: 'claude-3-haiku-20240307',
      sonnet: 'claude-sonnet-4-20250514',
      opus: 'claude-opus-4-20250514',
    },
    google: {
      flash: 'gemini-2.0-flash-exp',
      pro: 'gemini-1.5-pro',
    },
  },
}));

describe('ResolverAgent', () => {
  let resolver: ResolverAgent;

  const createMockPR = (): PRMetadata => ({
    id: 'gh-test-repo-1',
    url: 'https://github.com/test/repo/pull/1',
    owner: 'test',
    repo: 'repo',
    number: 1,
    title: 'Test PR with conflicts',
    body: 'This PR has merge conflicts',
    baseBranch: 'main',
    headBranch: 'feature/test',
    author: 'test-user',
    state: 'open',
    mergeable: false,
    mergeableState: 'dirty',
    hasConflicts: true,
    filesChanged: 2,
    additions: 50,
    deletions: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    fetchedAt: new Date(),
  });

  const createMockConflict = (): ConflictInfo => ({
    file: 'src/utils/helper.ts',
    baseContent: 'function helper() { return "base"; }',
    oursContent: 'function helper() { return "ours"; }',
    theirsContent: 'function helper() { return "theirs"; }',
    conflictMarkers: `<<<<<<< HEAD
function helper() { return "ours"; }
=======
function helper() { return "theirs"; }
>>>>>>> main`,
    complexity: 5 as ComplexityScore,
  });

  beforeEach(async () => {
    resolver = new ResolverAgent();
    await resolver.initialize();
    lastModelUsed = '';
  });

  afterEach(async () => {
    await resolver.shutdown();
  });

  describe('resolve', () => {
    it('should resolve a conflict and return resolution result', async () => {
      const pr = createMockPR();
      const conflict = createMockConflict();
      const complexity = 5 as ComplexityScore;

      const result = await resolver.resolve(pr, conflict, complexity);

      expect(result.resolution).toBeDefined();
      expect(result.resolution.file).toBe('src/utils/helper.ts');
      expect(result.resolution.resolvedContent).toContain('merged');
      expect(result.resolution.confidence).toBe(85);
      expect(result.resolution.strategy).toBe('merge-both');
      expect(result.resolution.explanation).toContain('compatible');
    });

    it('should use Sonnet for low complexity (<=4)', async () => {
      const pr = createMockPR();
      const conflict = createMockConflict();
      const complexity = 3 as ComplexityScore;

      await resolver.resolve(pr, conflict, complexity);

      expect(lastModelUsed).toBe('claude-sonnet-4-20250514');
    });

    it('should use Opus for high complexity (>4)', async () => {
      const pr = createMockPR();
      const conflict = createMockConflict();
      const complexity = 7 as ComplexityScore;

      await resolver.resolve(pr, conflict, complexity);

      expect(lastModelUsed).toBe('claude-opus-4-20250514');
    });

    it('should use Sonnet for complexity exactly 4', async () => {
      const pr = createMockPR();
      const conflict = createMockConflict();
      const complexity = 4 as ComplexityScore;

      await resolver.resolve(pr, conflict, complexity);

      expect(lastModelUsed).toBe('claude-sonnet-4-20250514');
    });

    it('should use Opus for complexity 5', async () => {
      const pr = createMockPR();
      const conflict = createMockConflict();
      const complexity = 5 as ComplexityScore;

      await resolver.resolve(pr, conflict, complexity);

      expect(lastModelUsed).toBe('claude-opus-4-20250514');
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', async () => {
      const stats = await resolver.getStats();

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.byStrategy).toEqual({});
    });

    it('should track resolutions after resolve calls', async () => {
      const pr = createMockPR();
      const conflict = createMockConflict();

      await resolver.resolve(pr, conflict, 5 as ComplexityScore);
      await resolver.resolve(pr, conflict, 3 as ComplexityScore);

      const stats = await resolver.getStats();

      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(2); // confidence 85 >= 70
      expect(stats.byStrategy['merge-both']).toBe(2);
    });
  });
});

describe('ResolverAgent response parsing', () => {
  let resolver: ResolverAgent;

  beforeEach(async () => {
    resolver = new ResolverAgent();
    await resolver.initialize();
  });

  afterEach(async () => {
    await resolver.shutdown();
  });

  it('should handle invalid JSON response gracefully', async () => {
    // Override mock for this specific test
    const { createModelSelector } = await import('@gwi/core/models');
    vi.mocked(createModelSelector).mockImplementationOnce(() => ({
      chat: vi.fn().mockResolvedValueOnce({
        content: 'This is not valid JSON at all',
        model: 'test-model',
        tokensUsed: { input: 100, output: 50 },
        finishReason: 'stop',
      }),
    }));

    // Re-initialize to pick up new mock
    const freshResolver = new ResolverAgent();
    await freshResolver.initialize();

    const pr: PRMetadata = {
      id: 'gh-test-repo-1',
      url: 'https://github.com/test/repo/pull/1',
      owner: 'test',
      repo: 'repo',
      number: 1,
      title: 'Test PR',
      body: '',
      baseBranch: 'main',
      headBranch: 'feature',
      author: 'user',
      state: 'open',
      mergeable: false,
      mergeableState: 'dirty',
      hasConflicts: true,
      filesChanged: 1,
      additions: 10,
      deletions: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      fetchedAt: new Date(),
    };

    const conflict: ConflictInfo = {
      file: 'test.ts',
      baseContent: '',
      oursContent: '',
      theirsContent: '',
      conflictMarkers: '',
      complexity: 3 as ComplexityScore,
    };

    const result = await freshResolver.resolve(pr, conflict, 3 as ComplexityScore);

    // Should return low-confidence fallback
    expect(result.resolution.confidence).toBe(0);
    expect(result.resolution.strategy).toBe('custom');
    expect(result.resolution.explanation).toContain('Human review required');

    await freshResolver.shutdown();
  });
});
