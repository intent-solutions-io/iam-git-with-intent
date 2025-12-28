import { z } from 'zod';
import type {
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from './types.js';

/**
 * IConnector defines the contract all data source connectors must implement.
 *
 * Connectors are responsible for:
 * - Authenticating with external APIs
 * - Fetching data via pull (API polling)
 * - Processing incoming webhooks (push)
 * - Health monitoring
 * - Error handling and retries
 */
export interface IConnector {
  /**
   * Unique identifier for this connector type.
   * Examples: 'github', 'gitlab', 'linear', 'jira', 'slack'
   */
  readonly name: string;

  /**
   * Version of the connector implementation.
   * Used for compatibility tracking and debugging.
   */
  readonly version: string;

  /**
   * Configuration schema for this connector.
   * Defines required/optional fields for authentication and sync options.
   */
  readonly configSchema: z.ZodSchema<ConnectorConfig>;

  /**
   * Authenticate with the external API.
   *
   * @param config - Connector-specific configuration (tokens, credentials, etc.)
   * @throws {AuthenticationError} If authentication fails
   * @returns Promise resolving to authentication result
   */
  authenticate(config: ConnectorConfig): Promise<AuthResult>;

  /**
   * Check connector health and connectivity.
   *
   * @returns Promise resolving to health status
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Sync data from the external source.
   *
   * Returns an async iterator to support streaming large datasets
   * without loading everything into memory.
   *
   * @param options - Sync options (incremental cursor, date ranges, filters)
   * @yields Records from the external source
   * @throws {ConnectorError} If sync fails
   */
  sync(options: SyncOptions): AsyncIterator<ConnectorRecord>;

  /**
   * Process an incoming webhook event.
   *
   * @param event - Webhook event payload
   * @returns Promise resolving to processing result
   * @throws {ValidationError} If webhook signature is invalid
   */
  processWebhook(event: WebhookEvent): Promise<WebhookResult>;

  /**
   * Get metadata about this connector.
   *
   * @returns Connector metadata (supported features, rate limits, etc.)
   */
  getMetadata(): ConnectorMetadata;
}
