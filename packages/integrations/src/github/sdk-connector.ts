/**
 * GitHub SDK Connector
 *
 * Phase 3: SDK-compliant GitHub connector that wraps existing operations.
 * Exposes GitHub tools through the unified connector SDK interface.
 *
 * This connector:
 * - Implements the Connector interface from @gwi/core
 * - Exposes all GitHub operations as ToolSpecs
 * - Integrates with the unified invokeTool() pipeline
 * - Passes conformance tests
 *
 * @module @gwi/integrations/github/sdk-connector
 */

import { z } from 'zod';
import { Octokit } from 'octokit';
import {
  type Connector,
  type ToolSpec,
  type ToolContext,
  type ToolPolicyClass,
} from '@gwi/core';

// =============================================================================
// Tool Input/Output Schemas
// =============================================================================

// Comment schemas
const PostCommentInput = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  issueNumber: z.number().describe('Issue or PR number'),
  body: z.string().describe('Comment body (markdown)'),
});

const PostCommentOutput = z.object({
  commentId: z.number(),
  htmlUrl: z.string(),
});

// Check run schemas
const CreateCheckRunInput = z.object({
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

const CreateCheckRunOutput = z.object({
  checkRunId: z.number(),
  htmlUrl: z.string(),
});

// Label schemas
const ManageLabelsInput = z.object({
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.number(),
  labels: z.array(z.string()),
  operation: z.enum(['add', 'remove', 'set']),
});

const ManageLabelsOutput = z.object({
  labels: z.array(z.string()),
});

// Branch creation schemas
const CreateBranchInput = z.object({
  owner: z.string(),
  repo: z.string(),
  branchName: z.string(),
  fromRef: z.string().describe('SHA or branch name to create from'),
});

const CreateBranchOutput = z.object({
  ref: z.string(),
  sha: z.string(),
});

// Push commit schemas
const PushCommitInput = z.object({
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

const PushCommitOutput = z.object({
  sha: z.string(),
  htmlUrl: z.string(),
});

// PR schemas
const CreatePullRequestInput = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  body: z.string().optional(),
  headBranch: z.string(),
  baseBranch: z.string(),
  draft: z.boolean().optional(),
});

const CreatePullRequestOutput = z.object({
  prNumber: z.number(),
  htmlUrl: z.string(),
});

const UpdatePullRequestInput = z.object({
  owner: z.string(),
  repo: z.string(),
  prNumber: z.number(),
  title: z.string().optional(),
  body: z.string().optional(),
});

const UpdatePullRequestOutput = z.object({
  prNumber: z.number(),
  htmlUrl: z.string(),
});

// Read schemas
const GetIssueInput = z.object({
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.number(),
});

const GetIssueOutput = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  htmlUrl: z.string(),
});

const GetPullRequestInput = z.object({
  owner: z.string(),
  repo: z.string(),
  prNumber: z.number(),
});

const GetPullRequestOutput = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  headRef: z.string(),
  baseRef: z.string(),
  mergeable: z.boolean().nullable(),
  htmlUrl: z.string(),
});

// =============================================================================
// GitHub SDK Connector Implementation
// =============================================================================

/**
 * GitHub SDK Connector configuration
 */
export interface GitHubSDKConnectorConfig {
  token?: string;
}

/**
 * SDK-compliant GitHub connector
 *
 * Implements the Connector interface from @gwi/core.
 */
export class GitHubSDKConnector implements Connector {
  readonly id = 'github';
  readonly version = '1.0.0';
  readonly displayName = 'GitHub';

  private octokit: Octokit;
  private _tools: ToolSpec[];

  constructor(config?: GitHubSDKConnectorConfig) {
    const token = config?.token ?? process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token required. Set GITHUB_TOKEN env var or pass token in config.');
    }

    this.octokit = new Octokit({ auth: token });
    this._tools = this.buildTools();
  }

  tools(): ToolSpec[] {
    return this._tools;
  }

  getTool(name: string): ToolSpec | undefined {
    return this._tools.find(t => t.name === name);
  }

  async healthcheck(): Promise<boolean> {
    try {
      await this.octokit.rest.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Tool Definitions
  // ===========================================================================

  private buildTools(): ToolSpec[] {
    const octokit = this.octokit;

    // Helper to create a tool spec with proper typing
    const tool = <TIn extends z.ZodTypeAny, TOut extends z.ZodTypeAny>(
      spec: {
        name: string;
        description: string;
        inputSchema: TIn;
        outputSchema: TOut;
        policyClass: ToolPolicyClass;
        invoke: (ctx: ToolContext, input: z.infer<TIn>) => Promise<z.infer<TOut>>;
      }
    ): ToolSpec => spec as ToolSpec;

    return [
      // READ operations
      tool({
        name: 'getIssue',
        description: 'Get issue details from a GitHub repository',
        inputSchema: GetIssueInput,
        outputSchema: GetIssueOutput,
        policyClass: 'READ',
        invoke: async (_ctx, input) => {
          const { data } = await octokit.rest.issues.get({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
          });
          return {
            number: data.number,
            title: data.title,
            body: data.body ?? null,
            state: data.state,
            labels: data.labels.map(l => typeof l === 'string' ? l : l.name ?? ''),
            assignees: data.assignees?.map(a => a.login) ?? [],
            htmlUrl: data.html_url,
          };
        },
      }),

      tool({
        name: 'getPullRequest',
        description: 'Get pull request details from a GitHub repository',
        inputSchema: GetPullRequestInput,
        outputSchema: GetPullRequestOutput,
        policyClass: 'READ',
        invoke: async (_ctx, input) => {
          const { data } = await octokit.rest.pulls.get({
            owner: input.owner,
            repo: input.repo,
            pull_number: input.prNumber,
          });
          return {
            number: data.number,
            title: data.title,
            body: data.body ?? null,
            state: data.state,
            headRef: data.head.ref,
            baseRef: data.base.ref,
            mergeable: data.mergeable ?? null,
            htmlUrl: data.html_url,
          };
        },
      }),

      // WRITE_NON_DESTRUCTIVE operations
      tool({
        name: 'postComment',
        description: 'Post a comment on a GitHub issue or pull request',
        inputSchema: PostCommentInput,
        outputSchema: PostCommentOutput,
        policyClass: 'WRITE_NON_DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          const { data } = await octokit.rest.issues.createComment({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            body: input.body,
          });
          return {
            commentId: data.id,
            htmlUrl: data.html_url,
          };
        },
      }),

      tool({
        name: 'createCheckRun',
        description: 'Create or update a GitHub check run for CI/CD status',
        inputSchema: CreateCheckRunInput,
        outputSchema: CreateCheckRunOutput,
        policyClass: 'WRITE_NON_DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          const { data } = await octokit.rest.checks.create({
            owner: input.owner,
            repo: input.repo,
            name: input.name,
            head_sha: input.headSha,
            status: input.status,
            conclusion: input.conclusion,
            output: input.title ? {
              title: input.title,
              summary: input.summary ?? '',
              text: input.text,
            } : undefined,
            details_url: input.detailsUrl,
          });
          return {
            checkRunId: data.id,
            htmlUrl: data.html_url ?? '',
          };
        },
      }),

      tool({
        name: 'manageLabels',
        description: 'Add, remove, or set labels on a GitHub issue or pull request',
        inputSchema: ManageLabelsInput,
        outputSchema: ManageLabelsOutput,
        policyClass: 'WRITE_NON_DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          let result: string[] = [];
          switch (input.operation) {
            case 'add': {
              const { data } = await octokit.rest.issues.addLabels({
                owner: input.owner,
                repo: input.repo,
                issue_number: input.issueNumber,
                labels: input.labels,
              });
              result = data.map(l => l.name);
              break;
            }
            case 'remove': {
              for (const label of input.labels) {
                try {
                  await octokit.rest.issues.removeLabel({
                    owner: input.owner,
                    repo: input.repo,
                    issue_number: input.issueNumber,
                    name: label,
                  });
                } catch {
                  // Label might not exist, continue
                }
              }
              const { data } = await octokit.rest.issues.listLabelsOnIssue({
                owner: input.owner,
                repo: input.repo,
                issue_number: input.issueNumber,
              });
              result = data.map(l => l.name);
              break;
            }
            case 'set': {
              const { data } = await octokit.rest.issues.setLabels({
                owner: input.owner,
                repo: input.repo,
                issue_number: input.issueNumber,
                labels: input.labels,
              });
              result = data.map(l => l.name);
              break;
            }
          }
          return { labels: result };
        },
      }),

      // DESTRUCTIVE operations
      tool({
        name: 'createBranch',
        description: 'Create a new branch in a GitHub repository (requires approval)',
        inputSchema: CreateBranchInput,
        outputSchema: CreateBranchOutput,
        policyClass: 'DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          let sha = input.fromRef;
          if (!sha.match(/^[a-f0-9]{40}$/i)) {
            const { data } = await octokit.rest.git.getRef({
              owner: input.owner,
              repo: input.repo,
              ref: `heads/${input.fromRef}`,
            });
            sha = data.object.sha;
          }
          const { data } = await octokit.rest.git.createRef({
            owner: input.owner,
            repo: input.repo,
            ref: `refs/heads/${input.branchName}`,
            sha,
          });
          return {
            ref: data.ref,
            sha: data.object.sha,
          };
        },
      }),

      tool({
        name: 'pushCommit',
        description: 'Push a commit with file changes to a GitHub branch (requires approval)',
        inputSchema: PushCommitInput,
        outputSchema: PushCommitOutput,
        policyClass: 'DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          let parentSha = input.parentSha;
          if (!parentSha) {
            const { data: ref } = await octokit.rest.git.getRef({
              owner: input.owner,
              repo: input.repo,
              ref: `heads/${input.branch}`,
            });
            parentSha = ref.object.sha;
          }
          const blobs = await Promise.all(
            input.files.map(async (file) => {
              const { data } = await octokit.rest.git.createBlob({
                owner: input.owner,
                repo: input.repo,
                content: Buffer.from(file.content).toString('base64'),
                encoding: 'base64',
              });
              return {
                path: file.path,
                mode: file.mode as '100644' | '100755' | '120000',
                type: 'blob' as const,
                sha: data.sha,
              };
            })
          );
          const { data: parentCommit } = await octokit.rest.git.getCommit({
            owner: input.owner,
            repo: input.repo,
            commit_sha: parentSha,
          });
          const { data: tree } = await octokit.rest.git.createTree({
            owner: input.owner,
            repo: input.repo,
            base_tree: parentCommit.tree.sha,
            tree: blobs,
          });
          const { data: commit } = await octokit.rest.git.createCommit({
            owner: input.owner,
            repo: input.repo,
            message: input.message,
            tree: tree.sha,
            parents: [parentSha],
          });
          await octokit.rest.git.updateRef({
            owner: input.owner,
            repo: input.repo,
            ref: `heads/${input.branch}`,
            sha: commit.sha,
          });
          return {
            sha: commit.sha,
            htmlUrl: commit.html_url,
          };
        },
      }),

      tool({
        name: 'createPullRequest',
        description: 'Create a new pull request in a GitHub repository (requires approval)',
        inputSchema: CreatePullRequestInput,
        outputSchema: CreatePullRequestOutput,
        policyClass: 'DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          const { data } = await octokit.rest.pulls.create({
            owner: input.owner,
            repo: input.repo,
            title: input.title,
            body: input.body ?? '',
            head: input.headBranch,
            base: input.baseBranch,
            draft: input.draft ?? false,
          });
          return {
            prNumber: data.number,
            htmlUrl: data.html_url,
          };
        },
      }),

      tool({
        name: 'updatePullRequest',
        description: 'Update an existing pull request in a GitHub repository (requires approval)',
        inputSchema: UpdatePullRequestInput,
        outputSchema: UpdatePullRequestOutput,
        policyClass: 'DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          const { data } = await octokit.rest.pulls.update({
            owner: input.owner,
            repo: input.repo,
            pull_number: input.prNumber,
            title: input.title,
            body: input.body,
          });
          return {
            prNumber: data.number,
            htmlUrl: data.html_url,
          };
        },
      }),
    ];
  }
}

/**
 * Create a GitHub SDK connector instance
 */
export function createGitHubSDKConnector(config?: GitHubSDKConnectorConfig): GitHubSDKConnector {
  return new GitHubSDKConnector(config);
}

// Export schemas for external use
export {
  PostCommentInput,
  PostCommentOutput,
  CreateCheckRunInput,
  CreateCheckRunOutput,
  ManageLabelsInput,
  ManageLabelsOutput,
  CreateBranchInput,
  CreateBranchOutput,
  PushCommitInput,
  PushCommitOutput,
  CreatePullRequestInput,
  CreatePullRequestOutput,
  UpdatePullRequestInput,
  UpdatePullRequestOutput,
  GetIssueInput,
  GetIssueOutput,
  GetPullRequestInput,
  GetPullRequestOutput,
};
