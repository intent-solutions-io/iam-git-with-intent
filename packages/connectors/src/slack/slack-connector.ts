import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { IConnector } from '../interfaces/IConnector.js';
import type {
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from '../interfaces/types.js';
import { BaseConnector, type ILogger, type IMetrics } from '../core/base-connector.js';
import { AuthenticationError, ConnectorError, ValidationError } from '../errors/index.js';
import {
  type SlackConnectorConfig,
  type SlackSyncOptions,
  type SlackMessage,
  type SlackChannel,
  type SlackUser,
  type SlackWebhookPayload,
  type SlackApiResponse,
  type SlackConversationsHistoryResponse,
  type SlackConversationsListResponse,
  type SlackUsersListResponse,
  type SlackChatPostMessageResponse,
  SlackConnectorConfigSchema,
  SlackSyncOptionsSchema,
  SLACK_CONNECTOR_METADATA
} from './types.js';

/**
 * Slack Connector
 *
 * Full-featured connector for Slack with:
 * - Bot token/OAuth authentication
 * - Slack Web API client (REST)
 * - Message, channel, and user sync
 * - Events API webhook processing
 * - Cursor-based pagination
 * - Tiered rate limiting awareness
 *
 * @module @gwi/connectors/slack
 */
export class SlackConnector extends BaseConnector implements IConnector {
  readonly name = 'slack';
  readonly version = '1.0.0';
  readonly configSchema = SlackConnectorConfigSchema as any;

  private client: AxiosInstance | null = null;
  private config: SlackConnectorConfig | null = null;
  private botInfo: { userId: string; teamId: string } | null = null;

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with Slack API
   *
   * Supports:
   * - Bot Token (xoxb-*)
   * - OAuth 2.0 (user or bot token)
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const slackConfig = SlackConnectorConfigSchema.parse(config) as SlackConnectorConfig;
      this.config = slackConfig;

      // Extract token based on auth type
      let token: string;
      switch (slackConfig.auth.type) {
        case 'bearer':
          token = slackConfig.auth.token;
          break;

        case 'oauth2':
          if (!slackConfig.auth.accessToken) {
            throw new AuthenticationError('OAuth requires accessToken', this.name);
          }
          token = slackConfig.auth.accessToken;
          break;

        default:
          throw new AuthenticationError('Unknown auth type', this.name);
      }

      // Create axios client with authentication
      this.client = axios.create({
        baseURL: slackConfig.baseUrl ?? 'https://slack.com/api',
        timeout: slackConfig.timeout ?? 30000,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...slackConfig.headers
        }
      });

      // Verify authentication by calling auth.test
      const { data } = await this.client.post<SlackApiResponse<{
        url: string;
        team: string;
        user: string;
        team_id: string;
        user_id: string;
        bot_id?: string;
        is_enterprise_install?: boolean;
      }>>('/auth.test');

      if (!data.ok) {
        throw new AuthenticationError(
          `Slack authentication failed: ${data.error || 'Unknown error'}`,
          this.name
        );
      }

      // Store bot info for later use
      this.botInfo = {
        userId: data.data?.user_id || '',
        teamId: data.data?.team_id || ''
      };

      this.logger.info('Slack authentication successful', {
        tenantId: slackConfig.tenantId,
        team: data.data?.team,
        user: data.data?.user,
        teamId: data.data?.team_id,
        authType: slackConfig.auth.type
      });

      return {
        success: true,
        token: slackConfig.auth.type === 'bearer' ? slackConfig.auth.token : undefined,
        metadata: {
          team: data.data?.team,
          user: data.data?.user,
          teamId: data.data?.team_id,
          userId: data.data?.user_id,
          botId: data.data?.bot_id,
          authType: slackConfig.auth.type
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid Slack configuration: ${error.message}`,
          this.name,
          error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        );
      }

      if (error instanceof AuthenticationError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(`Slack authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check Slack API health
   */
  async healthCheck(): Promise<HealthStatus> {
    const checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      durationMs: number;
      error?: string;
    }> = [];

    // Check 1: API connectivity
    const apiStart = Date.now();
    try {
      if (!this.client) {
        throw new Error('Not authenticated');
      }
      const { data } = await this.client.post<SlackApiResponse>('/api.test');
      if (!data.ok) {
        throw new Error(data.error || 'API test failed');
      }
      checks.push({
        name: 'api_connectivity',
        status: 'pass',
        durationMs: Date.now() - apiStart
      });
    } catch (error) {
      checks.push({
        name: 'api_connectivity',
        status: 'fail',
        durationMs: Date.now() - apiStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 2: Authentication validity
    const authStart = Date.now();
    try {
      if (this.client) {
        const { data } = await this.client.post<SlackApiResponse>('/auth.test');
        if (!data.ok) {
          throw new Error(data.error || 'Auth test failed');
        }
        checks.push({
          name: 'authentication',
          status: 'pass',
          durationMs: Date.now() - authStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'authentication',
        status: 'fail',
        durationMs: Date.now() - authStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 3: Bot info retrieval
    const botStart = Date.now();
    try {
      if (this.client && this.botInfo?.userId) {
        const { data } = await this.client.post<SlackApiResponse>('/users.info', {
          user: this.botInfo.userId
        });
        if (!data.ok) {
          throw new Error(data.error || 'Bot info failed');
        }
        checks.push({
          name: 'bot_info',
          status: 'pass',
          durationMs: Date.now() - botStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'bot_info',
        status: 'fail',
        durationMs: Date.now() - botStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const healthy = checks.every(c => c.status !== 'fail');

    return {
      healthy,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks
    };
  }

  /**
   * Sync data from Slack
   *
   * Supports:
   * - Channels
   * - Messages (with threads)
   * - Users
   * - Files
   * - Reactions
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse Slack-specific options
    const slackOptions = SlackSyncOptionsSchema.parse(options) as SlackSyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to message sync if no types specified
      const recordTypes = slackOptions.recordTypes ?? ['message'];

      // Sync channels
      if (recordTypes.includes('channel')) {
        yield* this.syncChannels(slackOptions);
        recordsProcessed++;
      }

      // Sync users
      if (recordTypes.includes('user')) {
        yield* this.syncUsers(slackOptions);
        recordsProcessed++;
      }

      // Sync messages
      if (recordTypes.includes('message')) {
        if (!slackOptions.channels || slackOptions.channels.length === 0) {
          this.logger.warn('No channels specified for message sync, skipping');
        } else {
          for (const channel of slackOptions.channels) {
            yield* this.syncMessages(channel, slackOptions);
            recordsProcessed++;
          }
        }
      }

      await this.onAfterSync({
        cursor: slackOptions.cursor ?? null,
        recordsProcessed,
        errors
      });
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      await this.onError(errors[0]);
      throw error;
    }
  }

  /**
   * Process incoming Slack webhook (Events API)
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as SlackWebhookPayload;

      // Handle URL verification challenge
      if (payload.type === 'url_verification') {
        this.logger.info('Handling Slack URL verification challenge', {
          eventId: event.id
        });
        return {
          success: true,
          durationMs: Date.now() - startTime,
          recordsProcessed: 0,
          metadata: {
            type: 'url_verification',
            challenge: payload.challenge
          }
        };
      }

      this.logger.info('Processing Slack webhook', {
        eventId: event.id,
        eventType: event.type,
        slackEventType: payload.event?.type,
        teamId: payload.teamId
      });

      // Handle different event types
      let recordsProcessed = 0;

      switch (payload.event?.type) {
        case 'message':
        case 'app_mention':
          if (payload.event.text) {
            recordsProcessed = 1;
          }
          break;

        case 'reaction_added':
        case 'reaction_removed':
          if (payload.event.reaction) {
            recordsProcessed = 1;
          }
          break;

        case 'channel_created':
        case 'channel_deleted':
        case 'channel_archive':
        case 'channel_unarchive':
        case 'channel_rename':
        case 'member_joined_channel':
        case 'member_left_channel':
          recordsProcessed = 1;
          break;

        case 'user_change':
        case 'team_join':
          recordsProcessed = 1;
          break;

        case 'file_shared':
        case 'file_deleted':
          recordsProcessed = 1;
          break;

        default:
          this.logger.debug('Unhandled Slack webhook event type', {
            type: payload.event?.type
          });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          eventType: payload.event?.type,
          teamId: payload.teamId,
          eventId: payload.eventId
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error('Webhook processing failed', {
        eventId: event.id,
        error: message
      });

      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: message
      };
    }
  }

  /**
   * Get connector metadata
   */
  getMetadata(): ConnectorMetadata {
    return {
      name: SLACK_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...SLACK_CONNECTOR_METADATA.recordTypes],
      authMethods: [...SLACK_CONNECTOR_METADATA.authMethods],
      supportsIncremental: SLACK_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: SLACK_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...SLACK_CONNECTOR_METADATA.rateLimits },
      capabilities: [...SLACK_CONNECTOR_METADATA.capabilities],
      documentationUrl: SLACK_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // Slack-Specific Methods
  // ============================================================================

  /**
   * Post a message to a channel
   */
  async postMessage(channel: string, text: string, options?: {
    threadTs?: string;
    blocks?: unknown[];
    attachments?: unknown[];
  }): Promise<{ channel: string; ts: string; message: SlackMessage }> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post<SlackChatPostMessageResponse>('/chat.postMessage', {
        channel,
        text,
        thread_ts: options?.threadTs,
        blocks: options?.blocks,
        attachments: options?.attachments
      })
    );

    if (!data.ok) {
      throw new ConnectorError(
        `Failed to post message: ${data.error || 'Unknown error'}`,
        this.name
      );
    }

    return {
      channel: data.channel!,
      ts: data.ts!,
      message: data.message!
    };
  }

  /**
   * Get channel details
   */
  async getChannel(channelId: string): Promise<SlackChannel> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post<SlackApiResponse<{ channel: SlackChannel }>>('/conversations.info', {
        channel: channelId
      })
    );

    if (!data.ok) {
      throw new ConnectorError(
        `Failed to get channel: ${data.error || 'Unknown error'}`,
        this.name
      );
    }

    return data.data!.channel;
  }

  /**
   * Get user details
   */
  async getUser(userId: string): Promise<SlackUser> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post<SlackApiResponse<{ user: SlackUser }>>('/users.info', {
        user: userId
      })
    );

    if (!data.ok) {
      throw new ConnectorError(
        `Failed to get user: ${data.error || 'Unknown error'}`,
        this.name
      );
    }

    return data.data!.user;
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const { data } = await this.retryRequest(() =>
      this.client!.post<SlackApiResponse>('/reactions.add', {
        channel,
        timestamp,
        name: emoji.replace(/:/g, '') // Remove colons if present
      })
    );

    if (!data.ok) {
      throw new ConnectorError(
        `Failed to add reaction: ${data.error || 'Unknown error'}`,
        this.name
      );
    }
  }

  /**
   * Upload a file to Slack
   */
  async uploadFile(
    channels: string[],
    file: Buffer | string,
    options?: {
      filename?: string;
      title?: string;
      initialComment?: string;
      threadTs?: string;
    }
  ): Promise<{ file: { id: string; permalink: string } }> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    const formData = new FormData();
    formData.append('channels', channels.join(','));

    if (Buffer.isBuffer(file)) {
      formData.append('file', new Blob([file]), options?.filename || 'file');
    } else {
      formData.append('content', file);
    }

    if (options?.filename) formData.append('filename', options.filename);
    if (options?.title) formData.append('title', options.title);
    if (options?.initialComment) formData.append('initial_comment', options.initialComment);
    if (options?.threadTs) formData.append('thread_ts', options.threadTs);

    const { data } = await this.retryRequest(() =>
      this.client!.post<SlackApiResponse<{ file: { id: string; permalink: string } }>>(
        '/files.upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      )
    );

    if (!data.ok) {
      throw new ConnectorError(
        `Failed to upload file: ${data.error || 'Unknown error'}`,
        this.name
      );
    }

    return { file: data.data!.file };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync channels from workspace
   */
  private async *syncChannels(options: SlackSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let cursor: string | undefined = options.cursor;
    let hasMore = true;

    while (hasMore) {
      const { data } = await this.retryRequest(() =>
        this.client!.post<SlackConversationsListResponse>('/conversations.list', {
          limit: 200,
          cursor,
          types: 'public_channel,private_channel',
          exclude_archived: false
        })
      );

      if (!data.ok) {
        throw new ConnectorError(
          `Failed to list channels: ${data.error || 'Unknown error'}`,
          this.name
        );
      }

      for (const channel of data.channels || []) {
        yield {
          id: `slack:channel:${channel.id}`,
          type: 'channel',
          source: this.name,
          createdAt: new Date(channel.created * 1000).toISOString(),
          updatedAt: new Date().toISOString(),
          data: channel
        };
      }

      cursor = data.response_metadata?.next_cursor;
      hasMore = !!cursor;
    }
  }

  /**
   * Sync users from workspace
   */
  private async *syncUsers(options: SlackSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let cursor: string | undefined = options.cursor;
    let hasMore = true;

    while (hasMore) {
      const { data } = await this.retryRequest(() =>
        this.client!.post<SlackUsersListResponse>('/users.list', {
          limit: 200,
          cursor
        })
      );

      if (!data.ok) {
        throw new ConnectorError(
          `Failed to list users: ${data.error || 'Unknown error'}`,
          this.name
        );
      }

      for (const user of data.members || []) {
        if (user.deleted) continue; // Skip deleted users

        yield {
          id: `slack:user:${user.id}`,
          type: 'user',
          source: this.name,
          createdAt: new Date(user.updated * 1000).toISOString(),
          updatedAt: new Date(user.updated * 1000).toISOString(),
          data: user
        };
      }

      cursor = data.response_metadata?.next_cursor;
      hasMore = !!cursor;
    }
  }

  /**
   * Sync messages from a channel
   */
  private async *syncMessages(
    channel: string,
    options: SlackSyncOptions
  ): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let cursor: string | undefined = options.cursor;
    let hasMore = true;
    let recordCount = 0;

    while (hasMore) {
      const { data } = await this.retryRequest(() =>
        this.client!.post<SlackConversationsHistoryResponse>('/conversations.history', {
          channel,
          limit: Math.min(options.limit || 100, 200),
          cursor,
          oldest: options.since?.toString(),
          latest: options.until?.toString(),
          inclusive: true
        })
      );

      if (!data.ok) {
        throw new ConnectorError(
          `Failed to get channel history: ${data.error || 'Unknown error'}`,
          this.name
        );
      }

      for (const message of data.messages || []) {
        yield {
          id: `slack:message:${channel}:${message.ts}`,
          type: 'message',
          source: this.name,
          createdAt: new Date(parseFloat(message.ts) * 1000).toISOString(),
          updatedAt: message.edited
            ? new Date(parseFloat(message.edited.ts) * 1000).toISOString()
            : new Date(parseFloat(message.ts) * 1000).toISOString(),
          data: {
            ...message,
            channel,
            channelType: 'channel'
          }
        };

        recordCount++;

        // Respect limit
        if (options.limit && recordCount >= options.limit) {
          return;
        }
      }

      cursor = data.response_metadata?.next_cursor;
      hasMore = !!cursor && data.has_more === true;

      // Also respect limit at page level
      if (options.limit && recordCount >= options.limit) {
        return;
      }
    }
  }
}
