/**
 * Jira Cloud Connector
 *
 * @module @gwi/connectors/jira
 */

// Main connector implementation
export { JiraConnector } from './jira-connector.js';

// Factory functions
export {
  createJiraConnectorFactory,
  registerJiraConnector,
  type JiraConnectorFactoryOptions
} from './factory.js';

// Type definitions
export type {
  JiraConnectorConfig,
  JiraAuthConfig,
  JiraBasicAuthConfig,
  JiraApiTokenConfig,
  JiraOAuthConfig,
  JiraRecordType,
  JiraIssue,
  JiraProject,
  JiraSprint,
  JiraBoard,
  JiraUser,
  JiraComment,
  JiraAttachment,
  JiraWorklog,
  JiraTransition,
  JiraWebhookEventType,
  JiraWebhookPayload,
  JiraSyncOptions
} from './types.js';

// Zod schemas
export {
  JiraBasicAuthConfigSchema,
  JiraApiTokenAuthConfigSchema,
  JiraOAuthConfigSchema,
  JiraAuthConfigSchema,
  JiraConnectorConfigSchema,
  JiraSyncOptionsSchema,
  JIRA_CONNECTOR_METADATA
} from './types.js';
