/**
 * GitLab Connector Module
 *
 * Provides connectivity to GitLab for syncing projects, merge requests, and issues.
 *
 * @example
 * ```typescript
 * import { GitLabConnector } from '@gwi/connectors/gitlab';
 * import { ConsoleLogger, NoOpMetrics } from '@gwi/connectors/core';
 *
 * const connector = new GitLabConnector(
 *   new ConsoleLogger({ service: 'gitlab' }),
 *   new NoOpMetrics()
 * );
 *
 * await connector.authenticate({
 *   tenantId: 'my-tenant',
 *   auth: {
 *     type: 'bearer',
 *     token: process.env.GITLAB_TOKEN
 *   }
 * });
 *
 * // Sync merge requests
 * for await (const record of connector.sync({
 *   projects: ['group/project'],
 *   recordTypes: ['merge_request'],
 *   state: 'opened'
 * })) {
 *   console.log(record);
 * }
 * ```
 *
 * @module @gwi/connectors/gitlab
 */

export { GitLabConnector } from './gitlab-connector.js';
export {
  createGitLabConnectorFactory,
  registerGitLabConnector,
  type GitLabConnectorFactoryOptions
} from './factory.js';
export type {
  GitLabConnectorConfig,
  GitLabAuthConfig,
  GitLabTokenAuthConfig,
  GitLabOAuthConfig,
  GitLabRecordType,
  GitLabProject,
  GitLabMergeRequest,
  GitLabIssue,
  GitLabCommit,
  GitLabFileChange,
  GitLabWebhookEventType,
  GitLabWebhookPayload,
  GitLabSyncOptions
} from './types.js';
export {
  GitLabConnectorConfigSchema,
  GitLabAuthConfigSchema,
  GitLabTokenAuthConfigSchema,
  GitLabOAuthConfigSchema,
  GitLabSyncOptionsSchema,
  GITLAB_CONNECTOR_METADATA
} from './types.js';
