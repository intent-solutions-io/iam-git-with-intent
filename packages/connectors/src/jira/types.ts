import { z } from 'zod';

/**
 * Jira Cloud Connector Type Definitions
 *
 * @module @gwi/connectors/jira
 */

// ============================================================================
// Jira-Specific Configuration
// ============================================================================

/**
 * Jira connector configuration
 */
export interface JiraConnectorConfig {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Authentication configuration
   */
  auth: JiraAuthConfig;

  /**
   * Jira Cloud domain (e.g., 'acme' for acme.atlassian.net)
   */
  domain: string;

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
 * Jira authentication configuration
 */
export type JiraAuthConfig =
  | JiraBasicAuthConfig
  | JiraOAuthConfig
  | JiraApiTokenConfig;

/**
 * Basic authentication (email + password - not recommended)
 */
export interface JiraBasicAuthConfig {
  type: 'basic';
  email: string;
  password: string;
}

/**
 * API token authentication (email + API token - recommended)
 */
export interface JiraApiTokenConfig {
  type: 'api_token';
  email: string;
  apiToken: string;
}

/**
 * OAuth 2.0 authentication (3LO)
 */
export interface JiraOAuthConfig {
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
// Jira Record Types
// ============================================================================

/**
 * Record types that can be synced from Jira
 */
export type JiraRecordType =
  | 'issue'
  | 'project'
  | 'sprint'
  | 'board'
  | 'user'
  | 'comment'
  | 'attachment'
  | 'worklog'
  | 'transition';

/**
 * Jira issue record
 */
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description: string | null;
    status: {
      id: string;
      name: string;
      statusCategory: {
        id: number;
        key: string;
        name: string;
      };
    };
    issuetype: {
      id: string;
      name: string;
      subtask: boolean;
      iconUrl: string;
    };
    project: {
      id: string;
      key: string;
      name: string;
      self: string;
    };
    priority: {
      id: string;
      name: string;
      iconUrl: string;
    } | null;
    assignee: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
      active: boolean;
    } | null;
    reporter: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
      active: boolean;
    };
    creator: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
      active: boolean;
    };
    labels: string[];
    components: Array<{
      id: string;
      name: string;
      description?: string;
    }>;
    versions: Array<{
      id: string;
      name: string;
      released: boolean;
    }>;
    fixVersions: Array<{
      id: string;
      name: string;
      released: boolean;
    }>;
    resolution: {
      id: string;
      name: string;
      description: string;
    } | null;
    created: string;
    updated: string;
    resolutiondate: string | null;
    duedate: string | null;
    parent?: {
      id: string;
      key: string;
    };
    subtasks: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        issuetype: { name: string };
      };
    }>;
    comment?: {
      total: number;
      comments: JiraComment[];
    };
    attachment?: JiraAttachment[];
    worklog?: {
      total: number;
      worklogs: JiraWorklog[];
    };
  };
}

/**
 * Jira project record
 */
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
  lead: {
    accountId: string;
    displayName: string;
  };
  projectTypeKey: string;
  projectCategory?: {
    id: string;
    name: string;
    description: string;
  };
  simplified: boolean;
  style: 'classic' | 'next-gen';
  isPrivate: boolean;
  properties: Record<string, any>;
  self: string;
  url: string;
}

/**
 * Jira sprint record (Agile/Scrum)
 */
export interface JiraSprint {
  id: number;
  self: string;
  state: 'future' | 'active' | 'closed';
  name: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  originBoardId: number;
  goal?: string;
}

/**
 * Jira board record (Agile)
 */
export interface JiraBoard {
  id: number;
  self: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
  location: {
    projectId: number;
    displayName: string;
    projectName: string;
    projectKey: string;
    projectTypeKey: string;
  };
}

/**
 * Jira user record
 */
export interface JiraUser {
  accountId: string;
  accountType: 'atlassian' | 'app' | 'customer';
  displayName: string;
  emailAddress?: string;
  active: boolean;
  timeZone?: string;
  locale?: string;
  avatarUrls: {
    '16x16': string;
    '24x24': string;
    '32x32': string;
    '48x48': string;
  };
}

/**
 * Jira comment record
 */
export interface JiraComment {
  id: string;
  self: string;
  author: {
    accountId: string;
    displayName: string;
  };
  body: string;
  updateAuthor: {
    accountId: string;
    displayName: string;
  };
  created: string;
  updated: string;
  visibility?: {
    type: 'group' | 'role';
    value: string;
  };
}

/**
 * Jira attachment record
 */
export interface JiraAttachment {
  id: string;
  self: string;
  filename: string;
  author: {
    accountId: string;
    displayName: string;
  };
  created: string;
  size: number;
  mimeType: string;
  content: string;
  thumbnail?: string;
}

/**
 * Jira worklog record
 */
export interface JiraWorklog {
  id: string;
  self: string;
  author: {
    accountId: string;
    displayName: string;
  };
  updateAuthor: {
    accountId: string;
    displayName: string;
  };
  comment?: string;
  created: string;
  updated: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
}

/**
 * Jira issue transition
 */
export interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory: {
      id: number;
      key: string;
      name: string;
    };
  };
  hasScreen: boolean;
  isGlobal: boolean;
  isInitial: boolean;
  isConditional: boolean;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Jira webhook event types
 */
export type JiraWebhookEventType =
  | 'jira:issue_created'
  | 'jira:issue_updated'
  | 'jira:issue_deleted'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'worklog_created'
  | 'worklog_updated'
  | 'worklog_deleted'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'sprint_created'
  | 'sprint_updated'
  | 'sprint_closed'
  | 'sprint_deleted'
  | 'sprint_started';

/**
 * Jira webhook payload
 */
export interface JiraWebhookPayload {
  timestamp: number;
  webhookEvent: JiraWebhookEventType;
  user: {
    accountId: string;
    displayName: string;
    emailAddress?: string;
  };
  issue?: JiraIssue;
  comment?: JiraComment;
  worklog?: JiraWorklog;
  changelog?: {
    id: string;
    items: Array<{
      field: string;
      fieldtype: string;
      from: string | null;
      fromString: string | null;
      to: string | null;
      toString: string | null;
    }>;
  };
  issue_event_type_name?: string;
}

// ============================================================================
// Sync Options
// ============================================================================

/**
 * Jira-specific sync options
 */
export interface JiraSyncOptions {
  /**
   * Projects to sync (project keys)
   */
  projects?: string[];

  /**
   * Record types to sync
   */
  recordTypes?: JiraRecordType[];

  /**
   * JQL query to filter issues
   */
  jql?: string;

  /**
   * Only sync issues updated after this date
   */
  since?: string;

  /**
   * Maximum records per resource type
   */
  limit?: number;

  /**
   * Include comments in issue sync
   */
  includeComments?: boolean;

  /**
   * Include attachments in issue sync
   */
  includeAttachments?: boolean;

  /**
   * Include worklogs in issue sync
   */
  includeWorklogs?: boolean;

  /**
   * Fields to expand (e.g., 'changelog', 'renderedFields')
   */
  expand?: string[];

  /**
   * Specific fields to retrieve
   */
  fields?: string[];
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const JiraBasicAuthConfigSchema = z.object({
  type: z.literal('basic'),
  email: z.string().email(),
  password: z.string().min(1)
});

export const JiraApiTokenAuthConfigSchema = z.object({
  type: z.literal('api_token'),
  email: z.string().email(),
  apiToken: z.string().min(1)
});

export const JiraOAuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional()
});

export const JiraAuthConfigSchema = z.discriminatedUnion('type', [
  JiraBasicAuthConfigSchema,
  JiraApiTokenAuthConfigSchema,
  JiraOAuthConfigSchema
]);

export const JiraConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: JiraAuthConfigSchema,
  domain: z.string().min(1),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional(),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional()
});

export const JiraSyncOptionsSchema = z.object({
  projects: z.array(z.string()).optional(),
  recordTypes: z.array(z.enum([
    'issue', 'project', 'sprint', 'board',
    'user', 'comment', 'attachment', 'worklog', 'transition'
  ])).optional(),
  jql: z.string().optional(),
  since: z.string().datetime().optional(),
  limit: z.number().positive().optional(),
  includeComments: z.boolean().optional(),
  includeAttachments: z.boolean().optional(),
  includeWorklogs: z.boolean().optional(),
  expand: z.array(z.string()).optional(),
  fields: z.array(z.string()).optional()
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const JIRA_CONNECTOR_METADATA = {
  name: 'jira',
  version: '1.0.0',
  displayName: 'Jira Cloud',
  description: 'Connect to Jira Cloud projects, issues, and sprints',
  recordTypes: [
    'issue',
    'project',
    'sprint',
    'board',
    'user',
    'comment',
    'attachment',
    'worklog',
    'transition'
  ] as JiraRecordType[],
  authMethods: ['bearer', 'oauth2'] as const,
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    requestsPerSecond: 10, // Conservative default
    requestsPerHour: 5000 // Varies by plan
  },
  capabilities: [
    'sync',
    'webhook',
    'write_comments',
    'create_issues',
    'update_issues',
    'transition_issues',
    'add_attachments',
    'log_work'
  ],
  documentationUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/'
} as const;
