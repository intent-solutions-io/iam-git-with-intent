/**
 * Linear Connector Module
 *
 * @module @gwi/connectors/linear
 */

export { LinearConnector } from './linear-connector.js';
export {
  // Types
  type LinearConnectorConfig,
  type LinearAuthConfig,
  type LinearApiKeyAuthConfig,
  type LinearOAuthConfig,
  type LinearRecordType,
  type LinearIssue,
  type LinearProject,
  type LinearTeam,
  type LinearCycle,
  type LinearComment,
  type LinearWebhookEventType,
  type LinearWebhookAction,
  type LinearWebhookPayload,
  type LinearSyncOptions,
  // Schemas
  LinearConnectorConfigSchema,
  LinearAuthConfigSchema,
  LinearApiKeyAuthConfigSchema,
  LinearOAuthConfigSchema,
  LinearSyncOptionsSchema,
  // Metadata
  LINEAR_CONNECTOR_METADATA,
  LINEAR_FRAGMENTS
} from './types.js';

// Factory functions for registry integration
export {
  createLinearConnectorFactory,
  registerLinearConnector,
  type LinearConnectorFactoryOptions
} from './factory.js';
