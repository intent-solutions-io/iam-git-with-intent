/**
 * GitHub Connector - Policy-Aware GitHub Operations
 *
 * Phase 2: Minimal policy-aware GitHub connector layer.
 *
 * All write operations are categorized by destructiveness level:
 * - Non-destructive: comments, labels, check-runs (no approval needed)
 * - Destructive: branch creation, commits, pushes, PR operations (approval required)
 *
 * @module @gwi/integrations/github/connector
 */

import { Octokit } from 'octokit';
import { z } from 'zod';
import type { ApprovalRecord } from '@gwi/core';

// =============================================================================
// Schemas for Tool Inputs
// =============================================================================

/**
 * Issue/PR comment schema
 */
export const CommentInput = z.object({
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.number(),
  body: z.string(),
});

export type CommentInput = z.infer<typeof CommentInput>;

/**
 * Check run schema
 */
export const CheckRunInput = z.object({
  owner: z.string(),
  repo: z.string(),
  name: z.string(),
  headSha: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z.enum(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required']).optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  text: z.string().optional(),
  detailsUrl: z.string().url().optional(),
});

export type CheckRunInput = z.infer<typeof CheckRunInput>;

/**
 * Label operation schema
 */
export const LabelInput = z.object({
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.number(),
  labels: z.array(z.string()),
  operation: z.enum(['add', 'remove', 'set']),
});

export type LabelInput = z.infer<typeof LabelInput>;

/**
 * Branch creation schema (destructive)
 */
export const CreateBranchInput = z.object({
  owner: z.string(),
  repo: z.string(),
  branchName: z.string(),
  fromRef: z.string(), // SHA or branch name
});

export type CreateBranchInput = z.infer<typeof CreateBranchInput>;

/**
 * Commit push schema (destructive)
 */
export const PushCommitInput = z.object({
  owner: z.string(),
  repo: z.string(),
  branch: z.string(),
  message: z.string(),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
    mode: z.enum(['100644', '100755', '120000']).default('100644'),
  })),
  parentSha: z.string().optional(),
});

export type PushCommitInput = z.infer<typeof PushCommitInput>;

/**
 * PR creation/update schema (destructive)
 */
export const PROperationInput = z.object({
  owner: z.string(),
  repo: z.string(),
  operation: z.enum(['create', 'update']),
  // For create
  title: z.string().optional(),
  body: z.string().optional(),
  headBranch: z.string().optional(),
  baseBranch: z.string().optional(),
  draft: z.boolean().optional(),
  // For update
  prNumber: z.number().optional(),
});

export type PROperationInput = z.infer<typeof PROperationInput>;

// =============================================================================
// Policy Gate Types
// =============================================================================

/**
 * Operation type classification
 */
export type OperationType = 'read' | 'non-destructive' | 'destructive';

/**
 * Policy decision result
 */
export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  operationType: OperationType;
}

/**
 * Policy gate interface
 */
export interface PolicyGate {
  /**
   * Check if an operation is allowed
   */
  check(operation: string, operationType: OperationType, approval?: ApprovalRecord): PolicyDecision;
}

/**
 * Default policy gate implementation
 */
export class DefaultPolicyGate implements PolicyGate {
  check(operation: string, operationType: OperationType, approval?: ApprovalRecord): PolicyDecision {
    if (operationType === 'read') {
      return {
        allowed: true,
        reason: 'Read operations are always allowed',
        requiresApproval: false,
        operationType,
      };
    }

    if (operationType === 'non-destructive') {
      return {
        allowed: true,
        reason: 'Non-destructive write operations are allowed without approval',
        requiresApproval: false,
        operationType,
      };
    }

    // Destructive operations require approval
    if (!approval) {
      return {
        allowed: false,
        reason: `Destructive operation '${operation}' requires approval`,
        requiresApproval: true,
        operationType,
      };
    }

    // Check if approval covers this operation
    const requiredScope = this.getRequiredScope(operation);
    if (!approval.scope.includes(requiredScope)) {
      return {
        allowed: false,
        reason: `Approval does not include required scope '${requiredScope}' for operation '${operation}'`,
        requiresApproval: true,
        operationType,
      };
    }

    return {
      allowed: true,
      reason: 'Operation approved',
      requiresApproval: false,
      operationType,
    };
  }

  private getRequiredScope(operation: string): 'commit' | 'push' | 'open_pr' | 'merge' {
    switch (operation) {
      case 'createBranch':
      case 'pushCommit':
        return 'push';
      case 'createPR':
      case 'updatePR':
        return 'open_pr';
      default:
        return 'commit';
    }
  }
}

// =============================================================================
// GitHub Connector
// =============================================================================

/**
 * GitHub connector configuration
 */
export interface GitHubConnectorConfig {
  token?: string;
  policyGate?: PolicyGate;
}

/**
 * Operation result
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  policyDecision?: PolicyDecision;
}

/**
 * Policy-aware GitHub connector
 *
 * All destructive operations are gated through the policy gate.
 */
export class GitHubConnector {
  private octokit: Octokit;
  private policyGate: PolicyGate;

  constructor(config?: GitHubConnectorConfig) {
    const token = config?.token ?? process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token required. Set GITHUB_TOKEN env var.');
    }

    this.octokit = new Octokit({ auth: token });
    this.policyGate = config?.policyGate ?? new DefaultPolicyGate();
  }

  // =========================================================================
  // Non-Destructive Operations (no approval needed)
  // =========================================================================

  /**
   * Post a comment on an issue or PR
   */
  async postComment(input: CommentInput): Promise<OperationResult<{ commentId: number }>> {
    const validated = CommentInput.parse(input);
    const decision = this.policyGate.check('postComment', 'non-destructive');

    if (!decision.allowed) {
      return { success: false, error: decision.reason, policyDecision: decision };
    }

    try {
      const { data } = await this.octokit.rest.issues.createComment({
        owner: validated.owner,
        repo: validated.repo,
        issue_number: validated.issueNumber,
        body: validated.body,
      });

      return { success: true, data: { commentId: data.id }, policyDecision: decision };
    } catch (error) {
      return { success: false, error: String(error), policyDecision: decision };
    }
  }

  /**
   * Create or update a check run
   */
  async createCheckRun(input: CheckRunInput): Promise<OperationResult<{ checkRunId: number }>> {
    const validated = CheckRunInput.parse(input);
    const decision = this.policyGate.check('createCheckRun', 'non-destructive');

    if (!decision.allowed) {
      return { success: false, error: decision.reason, policyDecision: decision };
    }

    try {
      const { data } = await this.octokit.rest.checks.create({
        owner: validated.owner,
        repo: validated.repo,
        name: validated.name,
        head_sha: validated.headSha,
        status: validated.status,
        conclusion: validated.conclusion,
        output: validated.title ? {
          title: validated.title,
          summary: validated.summary ?? '',
          text: validated.text,
        } : undefined,
        details_url: validated.detailsUrl,
      });

      return { success: true, data: { checkRunId: data.id }, policyDecision: decision };
    } catch (error) {
      return { success: false, error: String(error), policyDecision: decision };
    }
  }

  /**
   * Add, remove, or set labels on an issue or PR
   */
  async manageLabels(input: LabelInput): Promise<OperationResult<{ labels: string[] }>> {
    const validated = LabelInput.parse(input);
    const decision = this.policyGate.check('manageLabels', 'non-destructive');

    if (!decision.allowed) {
      return { success: false, error: decision.reason, policyDecision: decision };
    }

    try {
      let result: string[] = [];

      switch (validated.operation) {
        case 'add': {
          const { data } = await this.octokit.rest.issues.addLabels({
            owner: validated.owner,
            repo: validated.repo,
            issue_number: validated.issueNumber,
            labels: validated.labels,
          });
          result = data.map(l => l.name);
          break;
        }
        case 'remove': {
          for (const label of validated.labels) {
            try {
              await this.octokit.rest.issues.removeLabel({
                owner: validated.owner,
                repo: validated.repo,
                issue_number: validated.issueNumber,
                name: label,
              });
            } catch {
              // Label might not exist, continue
            }
          }
          const { data } = await this.octokit.rest.issues.listLabelsOnIssue({
            owner: validated.owner,
            repo: validated.repo,
            issue_number: validated.issueNumber,
          });
          result = data.map(l => l.name);
          break;
        }
        case 'set': {
          const { data } = await this.octokit.rest.issues.setLabels({
            owner: validated.owner,
            repo: validated.repo,
            issue_number: validated.issueNumber,
            labels: validated.labels,
          });
          result = data.map(l => l.name);
          break;
        }
      }

      return { success: true, data: { labels: result }, policyDecision: decision };
    } catch (error) {
      return { success: false, error: String(error), policyDecision: decision };
    }
  }

  // =========================================================================
  // Destructive Operations (approval required)
  // =========================================================================

  /**
   * Create a new branch
   */
  async createBranch(input: CreateBranchInput, approval?: ApprovalRecord): Promise<OperationResult<{ ref: string }>> {
    const validated = CreateBranchInput.parse(input);
    const decision = this.policyGate.check('createBranch', 'destructive', approval);

    if (!decision.allowed) {
      return { success: false, error: decision.reason, policyDecision: decision };
    }

    try {
      // Get the SHA of the source ref
      let sha = validated.fromRef;
      if (!sha.match(/^[a-f0-9]{40}$/i)) {
        const { data } = await this.octokit.rest.git.getRef({
          owner: validated.owner,
          repo: validated.repo,
          ref: `heads/${validated.fromRef}`,
        });
        sha = data.object.sha;
      }

      // Create the new branch
      const { data } = await this.octokit.rest.git.createRef({
        owner: validated.owner,
        repo: validated.repo,
        ref: `refs/heads/${validated.branchName}`,
        sha,
      });

      return { success: true, data: { ref: data.ref }, policyDecision: decision };
    } catch (error) {
      return { success: false, error: String(error), policyDecision: decision };
    }
  }

  /**
   * Push a commit with file changes
   */
  async pushCommit(input: PushCommitInput, approval?: ApprovalRecord): Promise<OperationResult<{ sha: string }>> {
    const validated = PushCommitInput.parse(input);
    const decision = this.policyGate.check('pushCommit', 'destructive', approval);

    if (!decision.allowed) {
      return { success: false, error: decision.reason, policyDecision: decision };
    }

    try {
      // Get current branch SHA if not provided
      let parentSha = validated.parentSha;
      if (!parentSha) {
        const { data: ref } = await this.octokit.rest.git.getRef({
          owner: validated.owner,
          repo: validated.repo,
          ref: `heads/${validated.branch}`,
        });
        parentSha = ref.object.sha;
      }

      // Create blobs for each file
      const blobs = await Promise.all(
        validated.files.map(async (file) => {
          const { data } = await this.octokit.rest.git.createBlob({
            owner: validated.owner,
            repo: validated.repo,
            content: Buffer.from(file.content).toString('base64'),
            encoding: 'base64',
          });
          return {
            path: file.path,
            mode: file.mode,
            type: 'blob' as const,
            sha: data.sha,
          };
        })
      );

      // Get the base tree
      const { data: parentCommit } = await this.octokit.rest.git.getCommit({
        owner: validated.owner,
        repo: validated.repo,
        commit_sha: parentSha,
      });

      // Create new tree
      const { data: tree } = await this.octokit.rest.git.createTree({
        owner: validated.owner,
        repo: validated.repo,
        base_tree: parentCommit.tree.sha,
        tree: blobs,
      });

      // Create commit
      const { data: commit } = await this.octokit.rest.git.createCommit({
        owner: validated.owner,
        repo: validated.repo,
        message: validated.message,
        tree: tree.sha,
        parents: [parentSha],
      });

      // Update branch reference
      await this.octokit.rest.git.updateRef({
        owner: validated.owner,
        repo: validated.repo,
        ref: `heads/${validated.branch}`,
        sha: commit.sha,
      });

      return { success: true, data: { sha: commit.sha }, policyDecision: decision };
    } catch (error) {
      return { success: false, error: String(error), policyDecision: decision };
    }
  }

  /**
   * Create or update a pull request
   */
  async prOperation(input: PROperationInput, approval?: ApprovalRecord): Promise<OperationResult<{ prNumber: number; prUrl: string }>> {
    const validated = PROperationInput.parse(input);
    const decision = this.policyGate.check(
      validated.operation === 'create' ? 'createPR' : 'updatePR',
      'destructive',
      approval
    );

    if (!decision.allowed) {
      return { success: false, error: decision.reason, policyDecision: decision };
    }

    try {
      if (validated.operation === 'create') {
        if (!validated.title || !validated.headBranch || !validated.baseBranch) {
          return { success: false, error: 'title, headBranch, and baseBranch required for create', policyDecision: decision };
        }

        const { data } = await this.octokit.rest.pulls.create({
          owner: validated.owner,
          repo: validated.repo,
          title: validated.title,
          body: validated.body ?? '',
          head: validated.headBranch,
          base: validated.baseBranch,
          draft: validated.draft ?? false,
        });

        return { success: true, data: { prNumber: data.number, prUrl: data.html_url }, policyDecision: decision };
      } else {
        if (!validated.prNumber) {
          return { success: false, error: 'prNumber required for update', policyDecision: decision };
        }

        const { data } = await this.octokit.rest.pulls.update({
          owner: validated.owner,
          repo: validated.repo,
          pull_number: validated.prNumber,
          title: validated.title,
          body: validated.body,
        });

        return { success: true, data: { prNumber: data.number, prUrl: data.html_url }, policyDecision: decision };
      }
    } catch (error) {
      return { success: false, error: String(error), policyDecision: decision };
    }
  }
}

/**
 * Create a GitHub connector instance
 */
export function createGitHubConnector(config?: GitHubConnectorConfig): GitHubConnector {
  return new GitHubConnector(config);
}
