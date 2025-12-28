import { z } from 'zod';

/**
 * Slack Connector Type Definitions
 *
 * @module @gwi/connectors/slack
 */

// ============================================================================
// Slack-Specific Configuration
// ============================================================================

/**
 * Slack connector configuration
 */
export interface SlackConnectorConfig {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Authentication configuration
   */
  auth: SlackAuthConfig;

  /**
   * Optional API base URL (for Slack Enterprise Grid)
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
    maxRequestsPerMinute: number;
    maxConcurrentRequests: number;
  };
}

/**
 * Slack authentication configuration
 */
export type SlackAuthConfig =
  | SlackBotTokenAuthConfig
  | SlackOAuthConfig;

/**
 * Bot Token authentication (uses bearer type for framework compatibility)
 */
export interface SlackBotTokenAuthConfig {
  type: 'bearer';
  token: string; // xoxb-* token
}

/**
 * OAuth 2.0 authentication (uses oauth2 type for framework compatibility)
 */
export interface SlackOAuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string; // xoxp-* or xoxb-* token
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
  teamId?: string;
}

// ============================================================================
// Slack Record Types
// ============================================================================

/**
 * Record types that can be synced from Slack
 */
export type SlackRecordType =
  | 'message'
  | 'channel'
  | 'user'
  | 'reaction'
  | 'file'
  | 'thread'
  | 'workspace'
  | 'team';

/**
 * Slack workspace record
 */
export interface SlackWorkspace {
  id: string;
  name: string;
  domain: string;
  emailDomain?: string;
  icon?: {
    image_34?: string;
    image_44?: string;
    image_68?: string;
    image_88?: string;
    image_102?: string;
    image_132?: string;
    image_230?: string;
  };
  enterpriseId?: string;
  enterpriseName?: string;
}

/**
 * Slack channel record
 */
export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isGroup: boolean;
  isIm: boolean;
  isMpim: boolean;
  isPrivate: boolean;
  created: number;
  isArchived: boolean;
  isGeneral: boolean;
  unlinked: number;
  nameNormalized: string;
  isShared: boolean;
  isOrgShared: boolean;
  isPendingExtShared: boolean;
  isExtShared: boolean;
  contextTeamId?: string;
  creator?: string;
  topic?: {
    value: string;
    creator: string;
    lastSet: number;
  };
  purpose?: {
    value: string;
    creator: string;
    lastSet: number;
  };
  numMembers?: number;
  locale?: string;
}

/**
 * Slack user record
 */
export interface SlackUser {
  id: string;
  teamId: string;
  name: string;
  deleted: boolean;
  color?: string;
  realName?: string;
  tz?: string;
  tzLabel?: string;
  tzOffset?: number;
  profile: {
    email?: string;
    displayName?: string;
    displayNameNormalized?: string;
    realName?: string;
    realNameNormalized?: string;
    phone?: string;
    title?: string;
    statusText?: string;
    statusEmoji?: string;
    statusExpiration?: number;
    avatarHash?: string;
    image24?: string;
    image32?: string;
    image48?: string;
    image72?: string;
    image192?: string;
    image512?: string;
    team?: string;
  };
  isAdmin?: boolean;
  isOwner?: boolean;
  isPrimaryOwner?: boolean;
  isRestricted?: boolean;
  isUltraRestricted?: boolean;
  isBot?: boolean;
  isAppUser?: boolean;
  updated: number;
  isEmailConfirmed?: boolean;
}

/**
 * Slack message record
 */
export interface SlackMessage {
  type: 'message';
  subtype?: string;
  user?: string;
  text: string;
  ts: string;
  channel?: string;
  channelType?: string;
  threadTs?: string;
  replyCount?: number;
  replyUsersCount?: number;
  latestReply?: string;
  replies?: Array<{
    user: string;
    ts: string;
  }>;
  edited?: {
    user: string;
    ts: string;
  };
  reactions?: Array<{
    name: string;
    users: string[];
    count: number;
  }>;
  files?: SlackFile[];
  attachments?: Array<{
    id?: number;
    fallback?: string;
    text?: string;
    pretext?: string;
    title?: string;
    title_link?: string;
    color?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
  }>;
  blocks?: unknown[];
  botId?: string;
  botProfile?: {
    id: string;
    name: string;
    appId: string;
  };
  metadata?: {
    eventType: string;
    eventPayload: Record<string, unknown>;
  };
}

/**
 * Slack file record
 */
export interface SlackFile {
  id: string;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  prettyType: string;
  user: string;
  editable: boolean;
  size: number;
  mode: string;
  isExternal: boolean;
  externalType: string;
  isPublic: boolean;
  publicUrlShared: boolean;
  displayAsBot: boolean;
  username: string;
  urlPrivate: string;
  urlPrivateDownload: string;
  permalink: string;
  permalinkPublic?: string;
  commentsCount?: number;
  isStarred?: boolean;
  channels?: string[];
  groups?: string[];
  ims?: string[];
  initialComment?: {
    id: string;
    created: number;
    timestamp: number;
    user: string;
    comment: string;
  };
  numStars?: number;
  hasRichPreview?: boolean;
}

/**
 * Slack reaction record
 */
export interface SlackReaction {
  name: string;
  users: string[];
  count: number;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * Slack webhook event types (Events API)
 */
export type SlackWebhookEventType =
  | 'message'
  | 'app_mention'
  | 'channel_created'
  | 'channel_deleted'
  | 'channel_archive'
  | 'channel_unarchive'
  | 'channel_rename'
  | 'member_joined_channel'
  | 'member_left_channel'
  | 'reaction_added'
  | 'reaction_removed'
  | 'user_change'
  | 'team_join'
  | 'file_shared'
  | 'file_deleted'
  | 'url_verification'; // Challenge for webhook setup

/**
 * Slack webhook payload (Events API format)
 */
export interface SlackWebhookPayload {
  type: string;
  token?: string;
  teamId?: string;
  apiAppId?: string;
  event?: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    item?: {
      type: string;
      channel: string;
      ts: string;
    };
    reaction?: string;
    [key: string]: unknown;
  };
  eventId?: string;
  eventTime?: number;
  challenge?: string; // For url_verification
  authedUsers?: string[];
  eventContext?: string;
}

// ============================================================================
// Sync Options
// ============================================================================

/**
 * Slack-specific sync options
 */
export interface SlackSyncOptions {
  /**
   * Channels to sync (channel IDs or names)
   */
  channels?: string[];

  /**
   * Record types to sync
   */
  recordTypes?: SlackRecordType[];

  /**
   * Only sync messages after this timestamp (Unix timestamp in seconds)
   */
  since?: number;

  /**
   * Only sync messages before this timestamp (Unix timestamp in seconds)
   */
  until?: number;

  /**
   * Maximum records per channel
   */
  limit?: number;

  /**
   * Include thread replies
   */
  includeThreads?: boolean;

  /**
   * Include file metadata
   */
  includeFiles?: boolean;

  /**
   * Include reactions
   */
  includeReactions?: boolean;

  /**
   * Cursor for pagination (from previous sync)
   */
  cursor?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard Slack API response wrapper
 */
export interface SlackApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  warning?: string;
  response_metadata?: {
    next_cursor?: string;
    messages?: string[];
    warnings?: string[];
  };
  data?: T;
}

/**
 * Slack conversations.history response
 */
export interface SlackConversationsHistoryResponse extends SlackApiResponse {
  messages?: SlackMessage[];
  has_more?: boolean;
  pin_count?: number;
  channel_actions_ts?: string | null;
  channel_actions_count?: number;
}

/**
 * Slack conversations.list response
 */
export interface SlackConversationsListResponse extends SlackApiResponse {
  channels?: SlackChannel[];
}

/**
 * Slack users.list response
 */
export interface SlackUsersListResponse extends SlackApiResponse {
  members?: SlackUser[];
}

/**
 * Slack chat.postMessage response
 */
export interface SlackChatPostMessageResponse extends SlackApiResponse {
  channel?: string;
  ts?: string;
  message?: SlackMessage;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const SlackBotTokenAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1).regex(/^xoxb-/, 'Bot token must start with xoxb-')
});

export const SlackOAuthConfigSchema = z.object({
  type: z.literal('oauth2'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional(),
  teamId: z.string().optional()
});

export const SlackAuthConfigSchema = z.discriminatedUnion('type', [
  SlackBotTokenAuthConfigSchema,
  SlackOAuthConfigSchema
]);

export const SlackConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: SlackAuthConfigSchema,
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional(),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerMinute: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional()
});

export const SlackSyncOptionsSchema = z.object({
  channels: z.array(z.string()).optional(),
  recordTypes: z.array(z.enum([
    'message', 'channel', 'user', 'reaction',
    'file', 'thread', 'workspace', 'team'
  ])).optional(),
  since: z.number().positive().optional(),
  until: z.number().positive().optional(),
  limit: z.number().positive().optional(),
  includeThreads: z.boolean().optional(),
  includeFiles: z.boolean().optional(),
  includeReactions: z.boolean().optional(),
  cursor: z.string().optional()
});

// ============================================================================
// Connector Metadata
// ============================================================================

export const SLACK_CONNECTOR_METADATA = {
  name: 'slack',
  version: '1.0.0',
  displayName: 'Slack',
  description: 'Connect to Slack workspaces, channels, and messages',
  recordTypes: [
    'message',
    'channel',
    'user',
    'reaction',
    'file',
    'thread',
    'workspace',
    'team'
  ] as SlackRecordType[],
  authMethods: ['bearer', 'oauth2'] as const,
  supportsIncremental: true,
  supportsWebhooks: true,
  rateLimits: {
    // Slack uses tiered rate limits (Tier 1-4)
    // Most methods are Tier 3: 50+ requests/minute
    requestsPerSecond: 1, // Conservative default
    requestsPerHour: 3000 // 50 requests/min * 60 min
  },
  capabilities: [
    'sync',
    'webhook',
    'post_message',
    'add_reaction',
    'upload_file',
    'get_channel',
    'get_user',
    'search_messages'
  ],
  documentationUrl: 'https://api.slack.com/docs'
} as const;
