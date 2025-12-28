/**
 * Slack Connector Module
 *
 * @module @gwi/connectors/slack
 */

export { SlackConnector } from './slack-connector.js';
export {
  // Types
  type SlackConnectorConfig,
  type SlackAuthConfig,
  type SlackBotTokenAuthConfig,
  type SlackOAuthConfig,
  type SlackRecordType,
  type SlackWorkspace,
  type SlackChannel,
  type SlackUser,
  type SlackMessage,
  type SlackFile,
  type SlackReaction,
  type SlackWebhookEventType,
  type SlackWebhookPayload,
  type SlackSyncOptions,
  type SlackApiResponse,
  type SlackConversationsHistoryResponse,
  type SlackConversationsListResponse,
  type SlackUsersListResponse,
  type SlackChatPostMessageResponse,
  // Schemas
  SlackConnectorConfigSchema,
  SlackAuthConfigSchema,
  SlackBotTokenAuthConfigSchema,
  SlackOAuthConfigSchema,
  SlackSyncOptionsSchema,
  // Metadata
  SLACK_CONNECTOR_METADATA
} from './types.js';

// Factory functions for registry integration
export {
  createSlackConnectorFactory,
  registerSlackConnector,
  type SlackConnectorFactoryOptions
} from './factory.js';
