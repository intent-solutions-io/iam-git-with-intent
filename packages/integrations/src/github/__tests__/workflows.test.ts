/**
 * Workflow Orchestration Tests
 *
 * Tests for the Issue→PR, PR→Push, and Conflict Resolution workflows.
 * All tests use mocked connectors - no network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkflowContext,
  runIssueToPR,
  runPRPush,
  runConflictResolution,
} from '../workflows.js';
import { GitHubConnector as _GitHubConnector } from '../connector.js';

// Mock the GitHubConnector
vi.mock('../connector.js', () => ({
  GitHubConnector: vi.fn().mockImplementation(() => ({
    postComment: vi.fn().mockResolvedValue({
      success: true,
      data: { commentId: 123 },
    }),
    createCheckRun: vi.fn().mockResolvedValue({
      success: true,
      data: { checkRunId: 456 },
    }),
    createBranch: vi.fn().mockResolvedValue({
      success: true,
      data: { ref: 'refs/heads/gwi/issue-1' },
    }),
    pushCommit: vi.fn().mockResolvedValue({
      success: true,
      data: { sha: 'abc123' },
    }),
    prOperation: vi.fn().mockResolvedValue({
      success: true,
      data: { prNumber: 42, prUrl: 'https://github.com/test/repo/pull/42' },
    }),
  })),
}));

// =============================================================================
// WorkflowContext Schema Tests
// =============================================================================

describe('WorkflowContext Schema', () => {
  it('should validate minimal workflow context', () => {
    const ctx = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      repo: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
      },
      state: 'pending' as const,
      metadata: {
        startedAt: new Date().toISOString(),
        triggeredBy: 'test-user',
        workflowType: 'issue-to-pr' as const,
      },
    };

    expect(() => WorkflowContext.parse(ctx)).not.toThrow();
  });

  it('should validate full workflow context with approval', () => {
    const ctx = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      repo: {
        owner: 'test',
        name: 'repo',
        fullName: 'test/repo',
      },
      issueNumber: 1,
      branchName: 'gwi/issue-1',
      state: 'completed' as const,
      approval: {
        approvedAt: new Date().toISOString(),
        approvedBy: 'reviewer',
        scope: ['push' as const, 'open_pr' as const],
      },
      artifacts: {
        plan: '# Plan',
        patches: [{ path: 'src/index.ts', content: 'code', action: 'create' as const }],
        prUrl: 'https://github.com/test/repo/pull/1',
      },
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        triggeredBy: 'test-user',
        workflowType: 'issue-to-pr' as const,
        durationMs: 5000,
      },
    };

    expect(() => WorkflowContext.parse(ctx)).not.toThrow();
  });

  it('should reject invalid state', () => {
    const ctx = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
      state: 'invalid-state',
      metadata: {
        startedAt: new Date().toISOString(),
        triggeredBy: 'test',
        workflowType: 'issue-to-pr',
      },
    };

    expect(() => WorkflowContext.parse(ctx)).toThrow();
  });
});

// =============================================================================
// Issue to PR Workflow Tests
// =============================================================================

// TODO(gwi-64f): Vitest 4 mock constructor pattern broken — re-enable after mock migration
describe.skip('runIssueToPR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail with invalid issue URL', async () => {
    const result = await runIssueToPR('invalid-url');

    expect(result.success).toBe(false);
    expect(result.state).toBe('failed');
    expect(result.error).toContain('Invalid issue URL');
  });

  it('should parse full GitHub issue URL', async () => {
    const result = await runIssueToPR(
      'https://github.com/test/repo/issues/123'
    );

    expect(result.runId).toBeDefined();
    expect(result.patchCount).toBeGreaterThan(0);
    // Without approval, should await approval
    expect(result.state).toBe('awaiting_approval');
  });

  it('should parse shorthand issue URL', async () => {
    const result = await runIssueToPR('test/repo#123');

    expect(result.runId).toBeDefined();
    expect(result.state).toBe('awaiting_approval');
  });

  it('should complete workflow with dry run', async () => {
    const result = await runIssueToPR(
      'https://github.com/test/repo/issues/1',
      { dryRun: true }
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe('awaiting_approval');
    expect(result.patchCount).toBeGreaterThan(0);
    expect(result.branchName).toContain('gwi/issue-1');
  });

  it('should use custom branch pattern', async () => {
    const result = await runIssueToPR(
      'https://github.com/test/repo/issues/42',
      { dryRun: true, branchPattern: 'feature/issue-{issue}' }
    );

    expect(result.branchName).toBe('feature/issue-42');
  });

  it('should create PR with approval and autoPush', async () => {
    const approval = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      approvedBy: 'reviewer',
      approvedAt: new Date().toISOString(),
      scope: ['push' as const, 'open_pr' as const],
      patchHash: 'hash',
    };

    const result = await runIssueToPR(
      'https://github.com/test/repo/issues/1',
      { approval, autoPush: true }
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe('completed');
    expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');
    expect(result.commentId).toBe(123);
  });
});

// =============================================================================
// PR Push Workflow Tests
// =============================================================================

// TODO(gwi-64f): Vitest 4 mock constructor pattern broken
describe.skip('runPRPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail with invalid PR URL', async () => {
    const result = await runPRPush('invalid-url', {
      approval: {
        runId: 'test',
        approver: 'user',
        timestamp: new Date().toISOString(),
        scope: ['push'],
        contentHash: 'hash',
      },
      patches: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid PR URL');
  });

  it('should push patches successfully', async () => {
    const result = await runPRPush(
      'https://github.com/test/repo/pull/42',
      {
        approval: {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          approvedBy: 'user',
          approvedAt: new Date().toISOString(),
          scope: ['push'],
          patchHash: 'hash',
        },
        patches: [
          { path: 'src/fix.ts', content: 'fixed code', action: 'modify' },
        ],
        commitMessage: 'fix: apply resolution',
      }
    );

    expect(result.success).toBe(true);
    expect(result.sha).toBe('abc123');
  });
});

// =============================================================================
// Conflict Resolution Workflow Tests
// =============================================================================

// TODO(gwi-64f): Vitest 4 mock constructor pattern broken
describe.skip('runConflictResolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail with invalid PR URL', async () => {
    const result = await runConflictResolution('invalid-url');

    expect(result.success).toBe(false);
    expect(result.state).toBe('failed');
    expect(result.error).toContain('Invalid PR URL');
  });

  it('should analyze conflicts successfully', async () => {
    const result = await runConflictResolution(
      'https://github.com/test/repo/pull/42'
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe('analyzed');
    expect(result.conflictsFound).toBeGreaterThan(0);
    expect(result.resolutions).toBeDefined();
    expect(result.resolutions?.length).toBeGreaterThan(0);
    expect(result.commentId).toBe(123);
  });

  it('should resolve conflicts with approval and autoResolve', async () => {
    const result = await runConflictResolution(
      'https://github.com/test/repo/pull/42',
      {
        approval: {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          approvedBy: 'user',
          approvedAt: new Date().toISOString(),
          scope: ['push'],
          patchHash: 'hash',
        },
        autoResolve: true,
      }
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe('resolved');
    expect(result.conflictsResolved).toBe(result.conflictsFound);
  });

  it('should await approval without autoResolve', async () => {
    const result = await runConflictResolution(
      'https://github.com/test/repo/pull/42',
      {
        approval: {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          approvedBy: 'user',
          approvedAt: new Date().toISOString(),
          scope: ['push'],
          patchHash: 'hash',
        },
        autoResolve: false,
      }
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe('awaiting_approval');
    expect(result.conflictsResolved).toBe(0);
  });

  it('should include resolution strategies', async () => {
    const result = await runConflictResolution(
      'https://github.com/test/repo/pull/42'
    );

    expect(result.resolutions).toBeDefined();
    for (const resolution of result.resolutions!) {
      expect(resolution.file).toBeDefined();
      expect(['ours', 'theirs', 'merged', 'manual']).toContain(resolution.strategy);
      expect(resolution.confidence).toBeGreaterThanOrEqual(0);
      expect(resolution.confidence).toBeLessThanOrEqual(100);
    }
  });
});
