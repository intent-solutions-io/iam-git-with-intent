/**
 * GitHub Connector Module
 *
 * @module @gwi/connectors/github
 */

export { GitHubConnector } from './github-connector.js';
export {
  // Types
  type GitHubConnectorConfig,
  type GitHubAuthConfig,
  type GitHubTokenAuthConfig,
  type GitHubOAuthConfig,
  type GitHubAppConfig,
  type GitHubRecordType,
  type GitHubRepository,
  type GitHubPullRequest,
  type GitHubIssue,
  type GitHubCommit,
  type GitHubFileChange,
  type GitHubWebhookEventType,
  type GitHubWebhookPayload,
  type GitHubSyncOptions,
  // Schemas
  GitHubConnectorConfigSchema,
  GitHubAuthConfigSchema,
  GitHubTokenAuthConfigSchema,
  GitHubOAuthConfigSchema,
  GitHubAppConfigSchema,
  GitHubSyncOptionsSchema,
  // Metadata
  GITHUB_CONNECTOR_METADATA
} from './types.js';

// Factory functions for registry integration
export {
  createGitHubConnectorFactory,
  registerGitHubConnector,
  type GitHubConnectorFactoryOptions
} from './factory.js';
