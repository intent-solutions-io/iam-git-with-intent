import { z } from 'zod';

/**
 * GitLab Connector Type Definitions
 *
 * @module @gwi/connectors/gitlab
 */

// ============================================================================
// GitLab-Specific Configuration
// ============================================================================

/**
 * GitLab connector configuration
 */
export interface GitLabConnectorConfig {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Authentication configuration
   */
  auth: GitLabAuthConfig;

  /**
   * Optional API base URL (for self-hosted GitLab)
   * Default: https://gitlab.com/api/v4
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
 * GitLab authentication configuration
 */
export type GitLabAuthConfig =
  | GitLabTokenAuthConfig
  | GitLabOAuthConfig;

/**
 * Personal Access Token authentication
 */
export interface GitLabTokenAuthConfig {
  type: 'bearer';
  token: string;
}

/**
 * OAuth 2.0 authentication
 */
export interface GitLabOAuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

// ============================================================================
// GitLab Record Types
// ============================================================================

/**
 * Record types that can be synced from GitLab
 */
export type GitLabRecordType =
  | 'project'
  | 'merge_request'
  | 'issue'
  | 'commit'
  | 'branch'
  | 'release'
  | 'pipeline'
  | 'job'
  | 'comment'
  | 'user';

/**
 * Project record
 */
export interface GitLabProject {
  id: number;
  name: string;
  nameWithNamespace: string;
  path: string;
  pathWithNamespace: string;
  description: string | null;
  visibility: 'private' | 'internal' | 'public';
  archived: boolean;
  defaultBranch: string;
  emptyRepo: boolean;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: 'user' | 'group';
  };
  owner: {
    id: number;
    username: string;
    name: string;
  } | null;
  forkedFromProject: {
    id: number;
    name: string;
    pathWithNamespace: string;
  } | null;
  topics: string[];
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Merge request record
 */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'locked' | 'merged';
  mergedBy: {
    id: number;
    username: string;
    name: string;
  } | null;
  mergedAt: string | null;
  closedBy: {
    id: number;
    username: string;
    name: string;
  } | null;
  closedAt: string | null;
  targetBranch: string;
  sourceBranch: string;
  author: {
    id: number;
    username: string;
    name: string;
  };
  assignees: Array<{
    id: number;
    username: string;
    name: string;
  }>;
  reviewers: Array<{
    id: number;
    username: string;
    name: string;
  }>;
  labels: string[];
  milestone: {
    id: number;
    iid: number;
    title: string;
  } | null;
  draft: boolean;
  workInProgress: boolean;
  mergeWhenPipelineSucceeds: boolean;
  mergeStatus: 'can_be_merged' | 'cannot_be_merged' | 'unchecked' | 'checking' | 'cannot_be_merged_recheck';
  sha: string;
  mergeCommitSha: string | null;
  squashCommitSha: string | null;
  diffRefs: {
    baseSha: string;
    headSha: string;
    startSha: string;
  };
  userNotesCount: number;
  changesCount: string;
  shouldRemoveSourceBranch: boolean | null;
  forceRemoveSourceBranch: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Issue record
 */
export interface GitLabIssue {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed';
  type: 'issue' | 'incident' | 'test_case';
  author: {
    id: number;
    username: string;
    name: string;
  };
  assignees: Array<{
    id: number;
    username: string;
    name: string;
  }>;
  labels: string[];
  milestone: {
    id: number;
    iid: number;
    title: string;
  } | null;
  dueDate: string | null;
  confidential: boolean;
  discussionLocked: boolean;
  userNotesCount: number;
  weight: number | null;
  epicIid: number | null;
  closedBy: {
    id: number;
    username: string;
    name: string;
  } | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Commit record
 */
export interface GitLabCommit {
  id: string;
  shortId: string;
  title: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredDate: string;
  committerName: string;
  committerEmail: string;
  committedDate: string;
  parentIds: string[];
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

/**
 * File change record (for MR diffs)
 */
export interface GitLabFileChange {
  oldPath: string;
  newPath: string;
  aMode: string;
  bMode: string;
  newFile: boolean;
  renamedFile: boolean;
  deletedFile: boolean;
  diff: string;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * GitLab webhook event types
 */
export type GitLabWebhookEventType =
  | 'push'
  | 'merge_request'
  | 'issue'
  | 'note'
  | 'pipeline'
  | 'job'
  | 'tag_push'
  | 'release'
  | 'wiki_page'
  | 'deployment';

/**
 * GitLab webhook payload
 */
export interface GitLabWebhookPayload {
  object_kind: string;
  event_type?: string;
  user: {
    id: number;
    username: string;
    name: string;
    email: string;
  };
  project: {
    id: number;
    name: string;
    path_with_namespace: string;
    namespace: string;
  };
  // Event-specific payloads
  object_attributes?: {
    id: number;
    iid?: number;
    title?: string;
    description?: string;
    state?: string;
    action?: string;
    target_branch?: string;
    source_branch?: string;
    created_at?: string;
    updated_at?: string;
  };
  merge_request?: GitLabMergeRequest;
  issue?: GitLabIssue;
  commit?: GitLabCommit;
  commits?: GitLabCommit[];
  ref?: string;
  before?: string;
  after?: string;
}

// ============================================================================
// Sync Options
// ============================================================================

/**
 * GitLab-specific sync options
 */
export interface GitLabSyncOptions {
  /**
   * Projects to sync (group/project or numeric ID)
   */
  projects?: string[];

  /**
   * Record types to sync
   */
  recordTypes?: GitLabRecordType[];

  /**
   * Only sync MRs/issues with these states
   */
  state?: 'opened' | 'closed' | 'locked' | 'merged' | 'all';

  /**
   * Only sync records updated after this date
   */
  updatedAfter?: string;

  /**
   * Only sync records created after this date
   */
  createdAfter?: string;

  /**
   * Sort order
   */
  orderBy?: 'created_at' | 'updated_at';

  /**
   * Sort direction
   */
  sort?: 'asc' | 'desc';

  /**
   * Maximum records per resource type
   */
  limit?: number;

  /**
   * Include file changes for MRs
   */
  includeChanges?: boolean;

  /**
   * Include commit details
   */
  includeCommits?: boolean;

  /**
   * Scope for filtering (e.g., 'created_by_me', 'assigned_to_me', 'all')
   */
  scope?: string;

  /**
   * Labels to filter by
   */
  labels?: string[];
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const GitLabTokenAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1)
});

export const GitLabOAuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional()
});

export const GitLabAuthConfigSchema = z.discriminatedUnion('type', [
  GitLabTokenAuthConfigSchema,
  GitLabOAuthConfigSchema
]);

export const GitLabConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: GitLabAuthConfigSchema,
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional(),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional()
});

export const GitLabSyncOptionsSchema = z.object({
  projects: z.array(z.string()).optional(),
  recordTypes: z.array(z.enum([
    'project', 'merge_request', 'issue', 'commit',
    'branch', 'release', 'pipeline', 'job',
    'comment', 'user'
  ])).optional(),
  state: z.enum(['opened', 'closed', 'locked', 'merged', 'all']).optional(),
  updatedAfter: z.string().datetime().optional(),
  createdAfter: z.string().datetime().optional(),
  orderBy: z.enum(['created_at', 'updated_at']).optional(),
  sort: z.enum(['asc', 'desc']).optional(),
  limit: z.number().positive().optional(),
  includeChanges: z.boolean().optional(),
  includeCommits: z.boolean().optional(),
  scope: z.string().optional(),
  labels: z.array(z.string()).optional()
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const GITLAB_CONNECTOR_METADATA = {
  name: 'gitlab',
  version: '1.0.0',
  displayName: 'GitLab',
  description: 'Connect to GitLab projects, merge requests, and issues',
  recordTypes: [
    'project',
    'merge_request',
    'issue',
    'commit',
    'branch',
    'release',
    'pipeline',
    'job',
    'comment',
    'user'
  ] as GitLabRecordType[],
  authMethods: ['bearer', 'oauth2'] as const,
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    requestsPerSecond: 10, // GitLab default rate limit
    requestsPerHour: 36000 // 10 req/s * 3600s
  },
  capabilities: [
    'sync',
    'webhook',
    'write_comments',
    'write_labels',
    'create_mr',
    'create_branch',
    'push_commits'
  ],
  documentationUrl: 'https://docs.gitlab.com/ee/api/'
} as const;
