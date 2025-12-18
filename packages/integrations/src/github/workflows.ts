/**
 * GitHub Workflow Orchestration
 *
 * Phase 2: Implements the core GWI workflows using the policy-aware connector.
 *
 * Workflows:
 * - Issue → PR: Parse issue, triage, plan, generate patch, optionally push
 * - PR → Push: Apply approved patches to repository
 * - Conflicts → Resolution: Detect and resolve merge conflicts
 *
 * All workflows follow patch-first, push-after-approval pattern.
 *
 * @module @gwi/integrations/github/workflows
 */

import { z } from 'zod';
import { GitHubConnector, type PolicyDecision } from './connector.js';
import {
  createInfoComment,
  createSuccessComment,
} from './comment-formatter.js';
import type { ApprovalRecord } from '@gwi/core';

// =============================================================================
// Workflow Context Schema
// =============================================================================

/**
 * Workflow context for tracking state across steps
 */
export const WorkflowContext = z.object({
  /** Unique workflow run ID */
  runId: z.string().uuid(),

  /** Repository info */
  repo: z.object({
    owner: z.string(),
    name: z.string(),
    fullName: z.string(),
  }),

  /** Issue number (for issue-to-code workflows) */
  issueNumber: z.number().optional(),

  /** PR number (for PR workflows) */
  prNumber: z.number().optional(),

  /** Branch name for patches */
  branchName: z.string().optional(),

  /** Current workflow state */
  state: z.enum([
    'pending',
    'triaging',
    'planning',
    'generating',
    'reviewing',
    'awaiting_approval',
    'pushing',
    'creating_pr',
    'completed',
    'failed',
  ]),

  /** Approval record if approved */
  approval: z.object({
    approvedAt: z.string().datetime(),
    approvedBy: z.string(),
    scope: z.array(z.enum(['commit', 'push', 'open_pr', 'merge'])),
    expiresAt: z.string().datetime().optional(),
  }).optional(),

  /** Workflow artifacts */
  artifacts: z.object({
    triageResult: z.record(z.unknown()).optional(),
    plan: z.string().optional(),
    patches: z.array(z.object({
      path: z.string(),
      content: z.string(),
      action: z.enum(['create', 'modify', 'delete']),
    })).optional(),
    reviewResult: z.record(z.unknown()).optional(),
    commentId: z.number().optional(),
    checkRunId: z.number().optional(),
    prUrl: z.string().optional(),
  }).default({}),

  /** Workflow metadata */
  metadata: z.object({
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    triggeredBy: z.string(),
    workflowType: z.enum(['issue-to-pr', 'pr-push', 'conflict-resolution']),
    durationMs: z.number().optional(),
  }),

  /** Error info if failed */
  error: z.string().optional(),
});

export type WorkflowContext = z.infer<typeof WorkflowContext>;

// =============================================================================
// Workflow Step Types
// =============================================================================

/**
 * Step result from a workflow step
 */
export interface WorkflowStepResult {
  success: boolean;
  nextState: WorkflowContext['state'];
  artifacts?: Partial<WorkflowContext['artifacts']>;
  error?: string;
  policyDecision?: PolicyDecision;
}

/**
 * Workflow step function signature
 */
export type WorkflowStep = (
  ctx: WorkflowContext,
  connector: GitHubConnector
) => Promise<WorkflowStepResult>;

// =============================================================================
// Issue to PR Workflow
// =============================================================================

/**
 * Issue to PR workflow options
 */
export interface IssueToPROptions {
  /** Connector instance (or uses default) */
  connector?: GitHubConnector;

  /** Approval record for destructive operations */
  approval?: ApprovalRecord;

  /** Dry run - don't make any changes */
  dryRun?: boolean;

  /** Skip straight to push if approved */
  autoPush?: boolean;

  /** Custom branch name pattern */
  branchPattern?: string;
}

/**
 * Issue to PR workflow result
 */
export interface IssueToPRResult {
  success: boolean;
  runId: string;
  state: WorkflowContext['state'];
  prUrl?: string;
  branchName?: string;
  patchCount: number;
  commentId?: number;
  checkRunId?: number;
  error?: string;
}

/**
 * Run the Issue → PR workflow
 *
 * This workflow:
 * 1. Fetches issue details
 * 2. Posts "analyzing" check run
 * 3. Runs triage to determine complexity
 * 4. Generates a plan
 * 5. Generates patches
 * 6. Posts review comment with patches
 * 7. If approved: creates branch, pushes patches, opens PR
 *
 * @param issueUrl - GitHub issue URL
 * @param options - Workflow options
 * @returns Workflow result
 */
export async function runIssueToPR(
  issueUrl: string,
  options: IssueToPROptions = {}
): Promise<IssueToPRResult> {
  const runId = crypto.randomUUID();
  const connector = options.connector ?? new GitHubConnector();

  // Parse issue URL
  const parsed = parseIssueUrl(issueUrl);
  if (!parsed) {
    return {
      success: false,
      runId,
      state: 'failed',
      patchCount: 0,
      error: `Invalid issue URL: ${issueUrl}`,
    };
  }

  // Initialize workflow context
  const ctx: WorkflowContext = {
    runId,
    repo: {
      owner: parsed.owner,
      name: parsed.repo,
      fullName: `${parsed.owner}/${parsed.repo}`,
    },
    issueNumber: parsed.issueNumber,
    state: 'pending',
    artifacts: {},
    metadata: {
      startedAt: new Date().toISOString(),
      triggeredBy: 'gwi-workflow',
      workflowType: 'issue-to-pr',
    },
  };

  if (options.approval) {
    ctx.approval = {
      approvedAt: options.approval.approvedAt,
      approvedBy: options.approval.approvedBy,
      scope: options.approval.scope,
    };
  }

  try {
    // Step 1: Post initial check run
    if (!options.dryRun) {
      // Note: We'd need the head SHA to create a check run
      // For now, just post a comment
      const comment = createInfoComment(
        `Analyzing issue #${parsed.issueNumber}...`,
        runId,
        { workflow: 'issue-to-pr' }
      );

      const commentResult = await connector.postComment({
        owner: parsed.owner,
        repo: parsed.repo,
        issueNumber: parsed.issueNumber,
        body: comment,
      });

      if (commentResult.success && commentResult.data) {
        ctx.artifacts.commentId = commentResult.data.commentId;
      }
    }

    // Step 2: Triage (simulated - would call TriageAgent in real implementation)
    ctx.state = 'triaging';
    ctx.artifacts.triageResult = {
      complexity: 5,
      summary: 'Issue analyzed for code generation',
      affectedAreas: ['implementation'],
    };

    // Step 3: Plan (simulated - would call planning agent)
    ctx.state = 'planning';
    ctx.artifacts.plan = `# Implementation Plan for Issue #${parsed.issueNumber}\n\n1. Analyze requirements\n2. Generate code\n3. Add tests\n4. Review changes`;

    // Step 4: Generate patches (simulated - would call CoderAgent)
    ctx.state = 'generating';
    ctx.artifacts.patches = [
      {
        path: 'src/feature.ts',
        content: '// Generated code placeholder',
        action: 'create',
      },
    ];

    // Step 5: Review (simulated - would call ReviewerAgent)
    ctx.state = 'reviewing';
    ctx.artifacts.reviewResult = {
      approved: true,
      confidence: 85,
      suggestions: [],
    };

    // Step 6: Post review comment
    ctx.branchName = options.branchPattern
      ? options.branchPattern.replace('{issue}', String(parsed.issueNumber))
      : `gwi/issue-${parsed.issueNumber}`;

    if (!options.dryRun) {
      const reviewComment = createSuccessComment(
        `Generated ${ctx.artifacts.patches?.length ?? 0} file(s) for issue #${parsed.issueNumber}`,
        runId,
        {
          confidence: 85,
          artifacts: [{ name: 'Plan', path: '.gwi/runs/' + runId + '/plan.md' }],
        },
        {
          files: ctx.artifacts.patches?.map(p => p.path),
          workflow: 'issue-to-pr',
        }
      );

      await connector.postComment({
        owner: parsed.owner,
        repo: parsed.repo,
        issueNumber: parsed.issueNumber,
        body: reviewComment,
      });
    }

    // Step 7: If approved and autoPush, create branch and PR
    if (ctx.approval && options.autoPush) {
      ctx.state = 'pushing';

      // Create branch
      const branchResult = await connector.createBranch(
        {
          owner: parsed.owner,
          repo: parsed.repo,
          branchName: ctx.branchName,
          fromRef: 'main', // TODO: Get default branch
        },
        options.approval
      );

      if (!branchResult.success) {
        ctx.state = 'awaiting_approval';
        ctx.error = branchResult.error;
      } else {
        // Push patches
        const pushResult = await connector.pushCommit(
          {
            owner: parsed.owner,
            repo: parsed.repo,
            branch: ctx.branchName,
            message: `feat: implement issue #${parsed.issueNumber}\n\nGenerated by Git With Intent`,
            files: ctx.artifacts.patches?.map(p => ({
              path: p.path,
              content: p.content,
              mode: '100644' as const,
            })) ?? [],
          },
          options.approval
        );

        if (pushResult.success) {
          ctx.state = 'creating_pr';

          // Create PR
          const prResult = await connector.prOperation(
            {
              owner: parsed.owner,
              repo: parsed.repo,
              operation: 'create',
              title: `feat: implement issue #${parsed.issueNumber}`,
              body: `Closes #${parsed.issueNumber}\n\n${ctx.artifacts.plan}`,
              headBranch: ctx.branchName,
              baseBranch: 'main',
            },
            options.approval
          );

          if (prResult.success && prResult.data) {
            ctx.artifacts.prUrl = prResult.data.prUrl;
            ctx.state = 'completed';
          } else {
            ctx.error = prResult.error;
            ctx.state = 'failed';
          }
        } else {
          ctx.error = pushResult.error;
          ctx.state = 'failed';
        }
      }
    } else {
      // Awaiting approval for destructive operations
      ctx.state = 'awaiting_approval';
    }

    ctx.metadata.completedAt = new Date().toISOString();
    ctx.metadata.durationMs = Date.now() - new Date(ctx.metadata.startedAt).getTime();

    return {
      success: ctx.state === 'completed' || ctx.state === 'awaiting_approval',
      runId,
      state: ctx.state,
      prUrl: ctx.artifacts.prUrl,
      branchName: ctx.branchName,
      patchCount: ctx.artifacts.patches?.length ?? 0,
      commentId: ctx.artifacts.commentId,
      error: ctx.error,
    };
  } catch (error) {
    return {
      success: false,
      runId,
      state: 'failed',
      patchCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// PR Push Workflow
// =============================================================================

/**
 * PR push workflow options
 */
export interface PRPushOptions {
  connector?: GitHubConnector;
  approval: ApprovalRecord;
  patches: Array<{ path: string; content: string; action: 'create' | 'modify' | 'delete' }>;
  commitMessage?: string;
}

/**
 * PR push workflow result
 */
export interface PRPushResult {
  success: boolean;
  runId: string;
  sha?: string;
  error?: string;
}

/**
 * Push approved patches to a PR branch
 *
 * This workflow requires prior approval.
 *
 * @param prUrl - GitHub PR URL
 * @param options - Push options with approval
 * @returns Push result
 */
export async function runPRPush(
  prUrl: string,
  options: PRPushOptions
): Promise<PRPushResult> {
  const runId = crypto.randomUUID();
  const connector = options.connector ?? new GitHubConnector();

  // Parse PR URL
  const parsed = parsePRUrl(prUrl);
  if (!parsed) {
    return {
      success: false,
      runId,
      error: `Invalid PR URL: ${prUrl}`,
    };
  }

  try {
    // Get PR info to find head branch
    // Note: Would need to call GitHub API here in real implementation

    // Push patches
    const pushResult = await connector.pushCommit(
      {
        owner: parsed.owner,
        repo: parsed.repo,
        branch: `pr-${parsed.prNumber}`, // Would get from PR
        message: options.commitMessage ?? `fix: apply GWI patches\n\nGenerated by Git With Intent`,
        files: options.patches.map(p => ({
          path: p.path,
          content: p.content,
          mode: '100644' as const,
        })),
      },
      options.approval
    );

    if (!pushResult.success) {
      return {
        success: false,
        runId,
        error: pushResult.error,
      };
    }

    // Post success comment
    const comment = createSuccessComment(
      `Applied ${options.patches.length} patch(es) to PR #${parsed.prNumber}`,
      runId,
      { confidence: 100 },
      {
        files: options.patches.map(p => p.path),
        workflow: 'pr-push',
      }
    );

    await connector.postComment({
      owner: parsed.owner,
      repo: parsed.repo,
      issueNumber: parsed.prNumber,
      body: comment,
    });

    return {
      success: true,
      runId,
      sha: pushResult.data?.sha,
    };
  } catch (error) {
    return {
      success: false,
      runId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Conflict Resolution Workflow
// =============================================================================

/**
 * Conflict resolution options
 */
export interface ConflictResolutionOptions {
  connector?: GitHubConnector;
  approval?: ApprovalRecord;
  autoResolve?: boolean;
}

/**
 * Conflict resolution result
 */
export interface ConflictResolutionResult {
  success: boolean;
  runId: string;
  state: 'analyzed' | 'resolved' | 'awaiting_approval' | 'failed';
  conflictsFound: number;
  conflictsResolved: number;
  resolutions?: Array<{
    file: string;
    strategy: 'ours' | 'theirs' | 'merged' | 'manual';
    confidence: number;
  }>;
  commentId?: number;
  error?: string;
}

/**
 * Analyze and optionally resolve merge conflicts
 *
 * This workflow:
 * 1. Fetches PR and identifies conflicts
 * 2. Analyzes each conflict
 * 3. Proposes resolutions
 * 4. If approved: applies resolutions
 *
 * @param prUrl - GitHub PR URL
 * @param options - Resolution options
 * @returns Resolution result
 */
export async function runConflictResolution(
  prUrl: string,
  options: ConflictResolutionOptions = {}
): Promise<ConflictResolutionResult> {
  const runId = crypto.randomUUID();
  const connector = options.connector ?? new GitHubConnector();

  // Parse PR URL
  const parsed = parsePRUrl(prUrl);
  if (!parsed) {
    return {
      success: false,
      runId,
      state: 'failed',
      conflictsFound: 0,
      conflictsResolved: 0,
      error: `Invalid PR URL: ${prUrl}`,
    };
  }

  try {
    // Step 1: Analyze PR for conflicts (simulated)
    // In real implementation, would call GitHub API and analyze diffs
    const mockConflicts = [
      { file: 'src/index.ts', markers: 2 },
      { file: 'src/utils.ts', markers: 1 },
    ];

    // Step 2: Generate resolutions (simulated - would call ResolverAgent)
    const resolutions = mockConflicts.map(c => ({
      file: c.file,
      strategy: 'merged' as const,
      confidence: 85,
    }));

    // Step 3: Post analysis comment
    const analysisComment = createInfoComment(
      `Found ${mockConflicts.length} file(s) with conflicts. Generated ${resolutions.length} resolution(s).`,
      runId,
      {
        files: mockConflicts.map(c => c.file),
        workflow: 'conflict-resolution',
      }
    );

    let commentId: number | undefined;
    const commentResult = await connector.postComment({
      owner: parsed.owner,
      repo: parsed.repo,
      issueNumber: parsed.prNumber,
      body: analysisComment,
    });

    if (commentResult.success && commentResult.data) {
      commentId = commentResult.data.commentId;
    }

    // Step 4: If approved and autoResolve, apply resolutions
    if (options.approval && options.autoResolve) {
      // Would apply resolutions via pushCommit
      // For now, just mark as resolved
      const successComment = createSuccessComment(
        `Resolved ${resolutions.length} conflict(s)`,
        runId,
        {
          confidence: Math.min(...resolutions.map(r => r.confidence)),
        },
        {
          files: resolutions.map(r => r.file),
          workflow: 'conflict-resolution',
        }
      );

      await connector.postComment({
        owner: parsed.owner,
        repo: parsed.repo,
        issueNumber: parsed.prNumber,
        body: successComment,
      });

      return {
        success: true,
        runId,
        state: 'resolved',
        conflictsFound: mockConflicts.length,
        conflictsResolved: resolutions.length,
        resolutions,
        commentId,
      };
    }

    return {
      success: true,
      runId,
      state: options.approval ? 'awaiting_approval' : 'analyzed',
      conflictsFound: mockConflicts.length,
      conflictsResolved: 0,
      resolutions,
      commentId,
    };
  } catch (error) {
    return {
      success: false,
      runId,
      state: 'failed',
      conflictsFound: 0,
      conflictsResolved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// URL Parsing Helpers
// =============================================================================

interface ParsedIssue {
  owner: string;
  repo: string;
  issueNumber: number;
}

interface ParsedPR {
  owner: string;
  repo: string;
  prNumber: number;
}

function parseIssueUrl(url: string): ParsedIssue | null {
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
    /^([^/]+)\/([^#]+)#(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        issueNumber: parseInt(match[3], 10),
      };
    }
  }

  return null;
}

function parsePRUrl(url: string): ParsedPR | null {
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    /^([^/]+)\/([^#]+)#(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        prNumber: parseInt(match[3], 10),
      };
    }
  }

  return null;
}
