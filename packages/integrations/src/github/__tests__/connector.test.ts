/**
 * GitHub Connector Tests
 *
 * Tests for the policy-aware GitHub connector.
 * All tests use mocked Octokit responses - no network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitHubConnector,
  DefaultPolicyGate,
  CommentInput,
  CheckRunInput,
  LabelInput,
  CreateBranchInput,
  PushCommitInput,
  PROperationInput,
  type ApprovalRecord,
} from '../connector.js';

// Mock Octokit
vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: { id: 123 } }),
        addLabels: vi.fn().mockResolvedValue({ data: [{ name: 'bug' }] }),
        removeLabel: vi.fn().mockResolvedValue({}),
        setLabels: vi.fn().mockResolvedValue({ data: [{ name: 'feature' }] }),
        listLabelsOnIssue: vi.fn().mockResolvedValue({ data: [{ name: 'remaining' }] }),
      },
      checks: {
        create: vi.fn().mockResolvedValue({ data: { id: 456 } }),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: 'abc123def456' } },
        }),
        createRef: vi.fn().mockResolvedValue({
          data: { ref: 'refs/heads/new-branch' },
        }),
        createBlob: vi.fn().mockResolvedValue({ data: { sha: 'blob-sha-1' } }),
        getCommit: vi.fn().mockResolvedValue({
          data: { tree: { sha: 'tree-sha-1' } },
        }),
        createTree: vi.fn().mockResolvedValue({ data: { sha: 'new-tree-sha' } }),
        createCommit: vi.fn().mockResolvedValue({ data: { sha: 'new-commit-sha' } }),
        updateRef: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: { number: 42, html_url: 'https://github.com/test/repo/pull/42' },
        }),
        update: vi.fn().mockResolvedValue({
          data: { number: 42, html_url: 'https://github.com/test/repo/pull/42' },
        }),
      },
    },
  })),
}));

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Schema Validation', () => {
  describe('CommentInput', () => {
    it('should validate valid comment input', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        issueNumber: 1,
        body: 'Test comment',
      };
      expect(() => CommentInput.parse(input)).not.toThrow();
    });

    it('should reject invalid comment input', () => {
      const input = {
        owner: 'test',
        // missing repo
        issueNumber: 1,
        body: 'Test comment',
      };
      expect(() => CommentInput.parse(input)).toThrow();
    });
  });

  describe('CheckRunInput', () => {
    it('should validate valid check run input', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        name: 'GWI Analysis',
        headSha: 'abc123',
        status: 'completed' as const,
        conclusion: 'success' as const,
      };
      expect(() => CheckRunInput.parse(input)).not.toThrow();
    });

    it('should reject invalid status', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        name: 'GWI Analysis',
        headSha: 'abc123',
        status: 'invalid',
      };
      expect(() => CheckRunInput.parse(input)).toThrow();
    });
  });

  describe('LabelInput', () => {
    it('should validate label operations', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        issueNumber: 1,
        labels: ['bug', 'urgent'],
        operation: 'add' as const,
      };
      expect(() => LabelInput.parse(input)).not.toThrow();
    });
  });

  describe('CreateBranchInput', () => {
    it('should validate branch creation input', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        branchName: 'feature-123',
        fromRef: 'main',
      };
      expect(() => CreateBranchInput.parse(input)).not.toThrow();
    });
  });

  describe('PushCommitInput', () => {
    it('should validate push commit input', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        branch: 'feature-123',
        message: 'Add feature',
        files: [
          { path: 'src/index.ts', content: 'console.log("hello")', mode: '100644' as const },
        ],
      };
      expect(() => PushCommitInput.parse(input)).not.toThrow();
    });
  });

  describe('PROperationInput', () => {
    it('should validate PR create input', () => {
      const input = {
        owner: 'test',
        repo: 'repo',
        operation: 'create' as const,
        title: 'New Feature',
        headBranch: 'feature-123',
        baseBranch: 'main',
      };
      expect(() => PROperationInput.parse(input)).not.toThrow();
    });
  });
});

// =============================================================================
// Policy Gate Tests
// =============================================================================

describe('DefaultPolicyGate', () => {
  const gate = new DefaultPolicyGate();

  it('should allow read operations without approval', () => {
    const decision = gate.check('getIssue', 'read');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.operationType).toBe('read');
  });

  it('should allow non-destructive operations without approval', () => {
    const decision = gate.check('postComment', 'non-destructive');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.operationType).toBe('non-destructive');
  });

  it('should block destructive operations without approval', () => {
    const decision = gate.check('createBranch', 'destructive');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.operationType).toBe('destructive');
  });

  it('should allow destructive operations with valid approval', () => {
    const approval: ApprovalRecord = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      approvedBy: 'test-user',
      approvedAt: new Date().toISOString(),
      scope: ['push'],
      patchHash: 'hash123',
    };

    const decision = gate.check('createBranch', 'destructive', approval);
    expect(decision.allowed).toBe(true);
  });

  it('should block destructive operations with insufficient scope', () => {
    const approval: ApprovalRecord = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      approvedBy: 'test-user',
      approvedAt: new Date().toISOString(),
      scope: ['commit'], // Missing 'push' scope
      patchHash: 'hash123',
    };

    const decision = gate.check('createBranch', 'destructive', approval);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('does not include required scope');
  });
});

// =============================================================================
// Connector Tests
// =============================================================================

describe('GitHubConnector', () => {
  let connector: GitHubConnector;

  beforeEach(() => {
    // Set env var for token
    process.env.GITHUB_TOKEN = 'test-token';
    connector = new GitHubConnector();
  });

  describe('Non-destructive operations', () => {
    it('should post comment successfully', async () => {
      const result = await connector.postComment({
        owner: 'test',
        repo: 'repo',
        issueNumber: 1,
        body: 'Test comment',
      });

      expect(result.success).toBe(true);
      expect(result.data?.commentId).toBe(123);
      expect(result.policyDecision?.allowed).toBe(true);
    });

    it('should create check run successfully', async () => {
      const result = await connector.createCheckRun({
        owner: 'test',
        repo: 'repo',
        name: 'GWI Analysis',
        headSha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        title: 'Analysis Complete',
        summary: 'All checks passed',
      });

      expect(result.success).toBe(true);
      expect(result.data?.checkRunId).toBe(456);
    });

    it('should manage labels successfully', async () => {
      const result = await connector.manageLabels({
        owner: 'test',
        repo: 'repo',
        issueNumber: 1,
        labels: ['bug'],
        operation: 'add',
      });

      expect(result.success).toBe(true);
      expect(result.data?.labels).toContain('bug');
    });
  });

  describe('Destructive operations', () => {
    it('should block branch creation without approval', async () => {
      const result = await connector.createBranch({
        owner: 'test',
        repo: 'repo',
        branchName: 'feature-123',
        fromRef: 'main',
      });

      expect(result.success).toBe(false);
      expect(result.policyDecision?.requiresApproval).toBe(true);
      expect(result.error).toContain('requires approval');
    });

    it('should allow branch creation with approval', async () => {
      const approval: ApprovalRecord = {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
        scope: ['push'],
        patchHash: 'hash',
      };

      const result = await connector.createBranch(
        {
          owner: 'test',
          repo: 'repo',
          branchName: 'feature-123',
          fromRef: 'main',
        },
        approval
      );

      expect(result.success).toBe(true);
      expect(result.data?.ref).toBe('refs/heads/new-branch');
    });

    it('should block push without approval', async () => {
      const result = await connector.pushCommit({
        owner: 'test',
        repo: 'repo',
        branch: 'feature-123',
        message: 'Add feature',
        files: [{ path: 'test.ts', content: 'code', mode: '100644' }],
      });

      expect(result.success).toBe(false);
      expect(result.policyDecision?.requiresApproval).toBe(true);
    });

    it('should allow push with approval', async () => {
      const approval: ApprovalRecord = {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
        scope: ['push'],
        patchHash: 'hash',
      };

      const result = await connector.pushCommit(
        {
          owner: 'test',
          repo: 'repo',
          branch: 'feature-123',
          message: 'Add feature',
          files: [{ path: 'test.ts', content: 'code', mode: '100644' }],
        },
        approval
      );

      expect(result.success).toBe(true);
      expect(result.data?.sha).toBe('new-commit-sha');
    });

    it('should block PR creation without approval', async () => {
      const result = await connector.prOperation({
        owner: 'test',
        repo: 'repo',
        operation: 'create',
        title: 'New Feature',
        headBranch: 'feature-123',
        baseBranch: 'main',
      });

      expect(result.success).toBe(false);
      expect(result.policyDecision?.requiresApproval).toBe(true);
    });

    it('should allow PR creation with approval', async () => {
      const approval: ApprovalRecord = {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
        scope: ['open_pr'],
        patchHash: 'hash',
      };

      const result = await connector.prOperation(
        {
          owner: 'test',
          repo: 'repo',
          operation: 'create',
          title: 'New Feature',
          headBranch: 'feature-123',
          baseBranch: 'main',
        },
        approval
      );

      expect(result.success).toBe(true);
      expect(result.data?.prNumber).toBe(42);
      expect(result.data?.prUrl).toBe('https://github.com/test/repo/pull/42');
    });
  });
});
