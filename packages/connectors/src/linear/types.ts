import { z } from 'zod';

/**
 * Linear Connector Type Definitions
 *
 * @module @gwi/connectors/linear
 */

// ============================================================================
// Linear-Specific Configuration
// ============================================================================

/**
 * Linear connector configuration
 */
export interface LinearConnectorConfig {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Authentication configuration
   */
  auth: LinearAuthConfig;

  /**
   * Optional API base URL (default: https://api.linear.app/graphql)
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
 * Linear authentication configuration
 */
export type LinearAuthConfig =
  | LinearApiKeyAuthConfig
  | LinearOAuthConfig;

/**
 * API Key authentication (uses bearer type for framework compatibility)
 */
export interface LinearApiKeyAuthConfig {
  type: 'bearer';
  token: string;
}

/**
 * OAuth 2.0 authentication
 */
export interface LinearOAuthConfig {
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
// Linear Record Types
// ============================================================================

/**
 * Record types that can be synced from Linear
 */
export type LinearRecordType =
  | 'issue'
  | 'project'
  | 'team'
  | 'cycle'
  | 'label'
  | 'user'
  | 'comment'
  | 'workflow_state';

/**
 * Issue record
 */
export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description: string | null;
  priority: number; // 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  priorityLabel: string;
  state: {
    id: string;
    name: string;
    type: string; // backlog, unstarted, started, completed, canceled
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  assignee: {
    id: string;
    name: string;
    email: string;
  } | null;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  labels: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  project: {
    id: string;
    name: string;
  } | null;
  cycle: {
    id: string;
    name: string;
    number: number;
  } | null;
  estimate: number | null;
  url: string;
  branchName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  archivedAt: string | null;
  dueDate: string | null;
  startedAt: string | null;
  parentId: string | null;
  subIssueIds: string[];
  commentCount: number;
  attachmentCount: number;
}

/**
 * Project record
 */
export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  slugId: string;
  state: 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  lead: {
    id: string;
    name: string;
    email: string;
  } | null;
  teams: Array<{
    id: string;
    name: string;
    key: string;
  }>;
  targetDate: string | null;
  startDate: string | null;
  url: string;
  progress: number; // 0-1
  issueCount: number;
  completedIssueCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  archivedAt: string | null;
}

/**
 * Team record
 */
export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description: string | null;
  private: boolean;
  issueCount: number;
  cyclesEnabled: boolean;
  triageEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/**
 * Cycle record
 */
export interface LinearCycle {
  id: string;
  name: string;
  number: number;
  team: {
    id: string;
    name: string;
    key: string;
  };
  startsAt: string;
  endsAt: string;
  progress: number; // 0-1
  issueCount: number;
  completedIssueCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
}

/**
 * Comment record
 */
export interface LinearComment {
  id: string;
  body: string;
  issue: {
    id: string;
    identifier: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Linear webhook event types
 */
export type LinearWebhookEventType =
  | 'Issue'
  | 'Project'
  | 'Comment'
  | 'IssueLabel'
  | 'Cycle';

/**
 * Linear webhook actions
 */
export type LinearWebhookAction =
  | 'create'
  | 'update'
  | 'remove';

/**
 * Linear webhook payload
 */
export interface LinearWebhookPayload {
  action: LinearWebhookAction;
  type: LinearWebhookEventType;
  data: Record<string, any>;
  createdAt: string;
  url: string;
  webhookId: string;
  organizationId: string;
}

// ============================================================================
// Sync Options
// ============================================================================

/**
 * Linear-specific sync options
 */
export interface LinearSyncOptions {
  /**
   * Team keys to sync (e.g., ['ENG', 'PRODUCT'])
   */
  teams?: string[];

  /**
   * Record types to sync
   */
  recordTypes?: LinearRecordType[];

  /**
   * Only sync issues in these states
   */
  states?: string[];

  /**
   * Only sync records updated after this date
   */
  since?: string;

  /**
   * Maximum records per resource type
   */
  limit?: number;

  /**
   * Include comments for issues
   */
  includeComments?: boolean;

  /**
   * Include sub-issues
   */
  includeSubIssues?: boolean;

  /**
   * Filter by project IDs
   */
  projectIds?: string[];

  /**
   * Filter by cycle IDs
   */
  cycleIds?: string[];

  /**
   * Filter by assignee IDs
   */
  assigneeIds?: string[];

  /**
   * Filter by label IDs
   */
  labelIds?: string[];
}

// ============================================================================
// GraphQL Query Fragments
// ============================================================================

/**
 * Common GraphQL fragments used in queries
 */
export const LINEAR_FRAGMENTS = {
  user: `
    fragment UserFragment on User {
      id
      name
      email
    }
  `,
  team: `
    fragment TeamFragment on Team {
      id
      name
      key
    }
  `,
  label: `
    fragment LabelFragment on IssueLabel {
      id
      name
      color
    }
  `,
  state: `
    fragment StateFragment on WorkflowState {
      id
      name
      type
    }
  `,
  project: `
    fragment ProjectFragment on Project {
      id
      name
    }
  `,
  cycle: `
    fragment CycleFragment on Cycle {
      id
      name
      number
    }
  `
};

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const LinearApiKeyAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1)
});

export const LinearOAuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional()
});

export const LinearAuthConfigSchema = z.discriminatedUnion('type', [
  LinearApiKeyAuthConfigSchema,
  LinearOAuthConfigSchema
]);

export const LinearConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: LinearAuthConfigSchema,
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional(),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional()
});

export const LinearSyncOptionsSchema = z.object({
  teams: z.array(z.string()).optional(),
  recordTypes: z.array(z.enum([
    'issue', 'project', 'team', 'cycle',
    'label', 'user', 'comment', 'workflow_state'
  ])).optional(),
  states: z.array(z.string()).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().positive().optional(),
  includeComments: z.boolean().optional(),
  includeSubIssues: z.boolean().optional(),
  projectIds: z.array(z.string()).optional(),
  cycleIds: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional()
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const LINEAR_CONNECTOR_METADATA = {
  name: 'linear',
  version: '1.0.0',
  displayName: 'Linear',
  description: 'Connect to Linear issues, projects, and teams',
  recordTypes: [
    'issue',
    'project',
    'team',
    'cycle',
    'label',
    'user',
    'comment',
    'workflow_state'
  ] as LinearRecordType[],
  authMethods: ['bearer', 'oauth2'] as const,
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    requestsPerSecond: 10,
    requestsPerHour: 6000
  },
  capabilities: [
    'sync',
    'webhook',
    'create_issue',
    'update_issue',
    'write_comments',
    'write_labels'
  ],
  documentationUrl: 'https://developers.linear.app/docs'
} as const;
