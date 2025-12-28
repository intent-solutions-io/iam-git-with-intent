import { z } from 'zod';

/**
 * GitHub Connector Type Definitions
 *
 * @module @gwi/connectors/github
 */

// ============================================================================
// GitHub-Specific Configuration
// ============================================================================

/**
 * GitHub connector configuration
 */
export interface GitHubConnectorConfig {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Authentication configuration
   */
  auth: GitHubAuthConfig;

  /**
   * Optional API base URL (for GitHub Enterprise)
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds (default: 30000)
   */
  timeout?: number;

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Rate limit configuration
   */
  rateLimit?: {
    maxRequestsPerSecond: number;
    maxRequestsPerHour: number;
    maxConcurrentRequests: number;
  };
}

/**
 * GitHub authentication configuration
 */
export type GitHubAuthConfig =
  | GitHubTokenAuthConfig
  | GitHubOAuthConfig
  | GitHubAppConfig;

/**
 * Personal Access Token authentication (uses bearer type for framework compatibility)
 */
export interface GitHubTokenAuthConfig {
  type: 'bearer';
  token: string;
}

/**
 * OAuth 2.0 authentication (uses oauth2 type for framework compatibility)
 */
export interface GitHubOAuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

/**
 * GitHub App authentication
 */
export interface GitHubAppConfig {
  type: 'app';
  appId: string;
  privateKey: string;
  installationId: string;
}

// ============================================================================
// GitHub Record Types
// ============================================================================

/**
 * Record types that can be synced from GitHub
 */
export type GitHubRecordType =
  | 'repository'
  | 'pull_request'
  | 'issue'
  | 'commit'
  | 'branch'
  | 'release'
  | 'workflow_run'
  | 'check_run'
  | 'comment'
  | 'review'
  | 'user';

/**
 * Repository record
 */
export interface GitHubRepository {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  owner: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
  private: boolean;
  description: string | null;
  fork: boolean;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  visibility: 'public' | 'private' | 'internal';
  archived: boolean;
  disabled: boolean;
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pull request record
 */
export interface GitHubPullRequest {
  id: number;
  nodeId: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  locked: boolean;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  head: {
    ref: string;
    sha: string;
    repo: {
      fullName: string;
    } | null;
  };
  base: {
    ref: string;
    sha: string;
    repo: {
      fullName: string;
    };
  };
  user: {
    login: string;
    id: number;
  };
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    id: number;
  }>;
  requestedReviewers: Array<{
    login: string;
    id: number;
  }>;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  comments: number;
  reviewComments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  mergedBy: {
    login: string;
    id: number;
  } | null;
}

/**
 * Issue record
 */
export interface GitHubIssue {
  id: number;
  nodeId: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  stateReason: 'completed' | 'reopened' | 'not_planned' | null;
  locked: boolean;
  user: {
    login: string;
    id: number;
  };
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    id: number;
  }>;
  milestone: {
    id: number;
    number: number;
    title: string;
  } | null;
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/**
 * Commit record
 */
export interface GitHubCommit {
  sha: string;
  nodeId: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  parents: Array<{
    sha: string;
  }>;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
}

/**
 * File change record (for PR diffs)
 */
export interface GitHubFileChange {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
  contentsUrl: string;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * GitHub webhook event types
 */
export type GitHubWebhookEventType =
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issue_comment'
  | 'issues'
  | 'create'
  | 'delete'
  | 'check_run'
  | 'check_suite'
  | 'workflow_run'
  | 'workflow_job'
  | 'release'
  | 'deployment'
  | 'deployment_status';

/**
 * GitHub webhook payload
 */
export interface GitHubWebhookPayload {
  action?: string;
  sender: {
    login: string;
    id: number;
  };
  repository: {
    id: number;
    name: string;
    fullName: string;
    owner: {
      login: string;
      id: number;
    };
  };
  installation?: {
    id: number;
    nodeId: string;
  };
  // Event-specific payloads
  pull_request?: GitHubPullRequest;
  issue?: GitHubIssue;
  comment?: {
    id: number;
    body: string;
    user: {
      login: string;
      id: number;
    };
    createdAt: string;
  };
  ref?: string;
  refType?: 'branch' | 'tag';
  commits?: GitHubCommit[];
}

// ============================================================================
// Sync Options
// ============================================================================

/**
 * GitHub-specific sync options
 */
export interface GitHubSyncOptions {
  /**
   * Repositories to sync (owner/repo format)
   */
  repositories?: string[];

  /**
   * Record types to sync
   */
  recordTypes?: GitHubRecordType[];

  /**
   * Only sync PRs/issues with these states
   */
  state?: 'open' | 'closed' | 'all';

  /**
   * Only sync records updated after this date
   */
  since?: string;

  /**
   * Sort order
   */
  sort?: 'created' | 'updated' | 'popularity' | 'long-running';

  /**
   * Sort direction
   */
  direction?: 'asc' | 'desc';

  /**
   * Maximum records per resource type
   */
  limit?: number;

  /**
   * Include file diffs for PRs
   */
  includeFiles?: boolean;

  /**
   * Include commit history
   */
  includeCommits?: boolean;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const GitHubTokenAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1)
});

export const GitHubOAuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional()
});

export const GitHubAppConfigSchema = z.object({
  type: z.literal('app'),
  appId: z.string().min(1),
  privateKey: z.string().min(1),
  installationId: z.string().min(1)
});

export const GitHubAuthConfigSchema = z.discriminatedUnion('type', [
  GitHubTokenAuthConfigSchema,
  GitHubOAuthConfigSchema,
  GitHubAppConfigSchema
]);

export const GitHubConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: GitHubAuthConfigSchema,
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional(),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional()
});

export const GitHubSyncOptionsSchema = z.object({
  repositories: z.array(z.string()).optional(),
  recordTypes: z.array(z.enum([
    'repository', 'pull_request', 'issue', 'commit',
    'branch', 'release', 'workflow_run', 'check_run',
    'comment', 'review', 'user'
  ])).optional(),
  state: z.enum(['open', 'closed', 'all']).optional(),
  since: z.string().datetime().optional(),
  sort: z.enum(['created', 'updated', 'popularity', 'long-running']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  limit: z.number().positive().optional(),
  includeFiles: z.boolean().optional(),
  includeCommits: z.boolean().optional()
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const GITHUB_CONNECTOR_METADATA = {
  name: 'github',
  version: '1.0.0',
  displayName: 'GitHub',
  description: 'Connect to GitHub repositories, pull requests, and issues',
  recordTypes: [
    'repository',
    'pull_request',
    'issue',
    'commit',
    'branch',
    'release',
    'workflow_run',
    'check_run',
    'comment',
    'review',
    'user'
  ] as GitHubRecordType[],
  authMethods: ['bearer', 'oauth2'] as const,
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    requestsPerSecond: 83, // 5000/min for authenticated requests
    requestsPerHour: 5000
  },
  capabilities: [
    'sync',
    'webhook',
    'write_comments',
    'write_labels',
    'create_pr',
    'create_branch',
    'push_commits'
  ],
  documentationUrl: 'https://docs.github.com/en/rest'
} as const;
