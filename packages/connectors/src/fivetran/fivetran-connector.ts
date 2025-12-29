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
import { FivetranClient } from './client.js';
import {
  type FivetranConnectorConfig,
  type FivetranSyncOptions,
  type FivetranWebhookPayload,
  FivetranConnectorConfigSchema,
  FivetranSyncOptionsSchema,
  FIVETRAN_CONNECTOR_METADATA
} from './types.js';

/**
 * Fivetran Connector
 *
 * Enterprise data pipeline integration with:
 * - REST API v1 client
 * - Basic Auth (API key + secret)
 * - Connector management (list, get, trigger sync, pause/resume)
 * - Sync status tracking
 * - Group and destination management
 * - Rate limiting handling (429 responses)
 * - Webhook processing
 *
 * @module @gwi/connectors/fivetran
 */
export class FivetranConnector extends BaseConnector implements IConnector {
  readonly name = 'fivetran';
  readonly version = '1.0.0';
  readonly configSchema = FivetranConnectorConfigSchema as any;

  private client: FivetranClient | null = null;
  private config: FivetranConnectorConfig | null = null;

  constructor(logger?: ILogger, metrics?: IMetrics) {
    super(logger, metrics);
  }

  // ============================================================================
  // IConnector Implementation
  // ============================================================================

  /**
   * Authenticate with Fivetran API
   *
   * Uses Basic Auth with API key and secret
   */
  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    try {
      // Validate configuration
      const fivetranConfig = FivetranConnectorConfigSchema.parse(config) as FivetranConnectorConfig;
      this.config = fivetranConfig;

      // Create Fivetran client
      this.client = new FivetranClient(
        fivetranConfig.auth.apiKey,
        fivetranConfig.auth.apiSecret,
        fivetranConfig.baseUrl
      );

      // Verify authentication by fetching current user
      const currentUser = await this.client.getCurrentUser();

      this.logger.info('Fivetran authentication successful', {
        tenantId: fivetranConfig.tenantId,
        userId: currentUser.id,
        email: currentUser.email,
        role: currentUser.role
      });

      return {
        success: true,
        metadata: {
          userId: currentUser.id,
          email: currentUser.email,
          role: currentUser.role,
          verified: currentUser.verified
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid Fivetran configuration: ${error.message}`,
          this.name,
          error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        );
      }

      if (error instanceof ConnectorError) {
        // Re-throw connector errors (includes auth failures from client)
        if (error.context?.code === 'AUTH_FAILED') {
          throw new AuthenticationError(error.message, this.name);
        }
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(`Fivetran authentication failed: ${message}`, this.name);
    }
  }

  /**
   * Check Fivetran API health
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
      await this.client.getCurrentUser();
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

    // Check 2: List groups (verifies read permissions)
    const groupsStart = Date.now();
    try {
      if (this.client) {
        await this.client.listGroups({ limit: 1 });
        checks.push({
          name: 'groups_access',
          status: 'pass',
          durationMs: Date.now() - groupsStart
        });
      }
    } catch (error) {
      checks.push({
        name: 'groups_access',
        status: 'warn',
        durationMs: Date.now() - groupsStart,
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
   * Sync data from Fivetran
   *
   * Supports:
   * - Connectors
   * - Destinations
   * - Groups
   * - Users
   */
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    if (!this.client || !this.config) {
      throw new ConnectorError('Not authenticated. Call authenticate() first.', this.name);
    }

    // Parse Fivetran-specific options
    const fivetranOptions = FivetranSyncOptionsSchema.parse(options) as FivetranSyncOptions;

    await this.onBeforeSync(options);

    let recordsProcessed = 0;
    const errors: Error[] = [];

    try {
      // Default to all record types if not specified
      const recordTypes = fivetranOptions.recordTypes ?? ['connector', 'destination', 'group', 'user'];

      // Sync groups
      if (recordTypes.includes('group')) {
        for await (const record of this.syncGroups(fivetranOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      // Sync connectors
      if (recordTypes.includes('connector')) {
        for await (const record of this.syncConnectors(fivetranOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      // Sync destinations
      if (recordTypes.includes('destination')) {
        for await (const record of this.syncDestinations(fivetranOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      // Sync users
      if (recordTypes.includes('user')) {
        for await (const record of this.syncUsers(fivetranOptions)) {
          yield record;
          recordsProcessed++;
        }
      }

      await this.onAfterSync({
        cursor: null,
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
   * Process incoming Fivetran webhook
   */
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    try {
      // Parse payload
      const payload = event.payload as FivetranWebhookPayload;

      this.logger.info('Processing Fivetran webhook', {
        eventId: event.id,
        eventType: event.type,
        fivetranEvent: payload.event,
        connectorId: payload.data.connector_id,
        groupId: payload.data.group_id
      });

      // Handle different event types
      let recordsProcessed = 0;

      switch (payload.event) {
        case 'sync_start':
        case 'sync_end':
        case 'sync_error':
          if (payload.data.connector_id) {
            recordsProcessed = 1;
          }
          break;

        case 'connector_created':
        case 'connector_modified':
        case 'connector_deleted':
          if (payload.data.connector_id) {
            recordsProcessed = 1;
          }
          break;

        case 'destination_modified':
          if (payload.data.destination_id) {
            recordsProcessed = 1;
          }
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: payload.event });
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed,
        metadata: {
          fivetranEvent: payload.event,
          connectorId: payload.data.connector_id,
          groupId: payload.data.group_id
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
      name: FIVETRAN_CONNECTOR_METADATA.name,
      version: this.version,
      recordTypes: [...FIVETRAN_CONNECTOR_METADATA.recordTypes],
      authMethods: [...FIVETRAN_CONNECTOR_METADATA.authMethods],
      supportsIncremental: FIVETRAN_CONNECTOR_METADATA.supportsIncremental,
      supportsWebhooks: FIVETRAN_CONNECTOR_METADATA.supportsWebhooks,
      rateLimits: { ...FIVETRAN_CONNECTOR_METADATA.rateLimits },
      capabilities: [...FIVETRAN_CONNECTOR_METADATA.capabilities],
      documentationUrl: FIVETRAN_CONNECTOR_METADATA.documentationUrl
    };
  }

  // ============================================================================
  // Fivetran-Specific Public Methods
  // ============================================================================

  /**
   * Trigger a sync for a connector
   */
  async triggerSync(connectorId: string, force?: boolean): Promise<{ message: string; connector_id: string }> {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    return this.client.triggerSync(connectorId, { force });
  }

  /**
   * Get sync status for a connector
   */
  async getSyncStatus(connectorId: string) {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    return this.client.getSyncStatus(connectorId);
  }

  /**
   * Pause a connector
   */
  async pauseConnector(connectorId: string) {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    return this.client.pauseConnector(connectorId);
  }

  /**
   * Resume a connector
   */
  async resumeConnector(connectorId: string) {
    if (!this.client) {
      throw new ConnectorError('Not authenticated', this.name);
    }

    return this.client.resumeConnector(connectorId);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Sync groups from Fivetran
   */
  private async *syncGroups(options: FivetranSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let cursor = options.cursor;
    let totalFetched = 0;

    while (true) {
      const result = await this.client.listGroups({ cursor, limit: 100 });

      for (const group of result.items) {
        yield {
          id: `fivetran:group:${group.id}`,
          type: 'group',
          source: this.name,
          createdAt: group.created_at,
          updatedAt: group.created_at,
          data: group
        };

        totalFetched++;

        // Respect limit if set
        if (options.limit && totalFetched >= options.limit) {
          return;
        }
      }

      // Check for more pages
      if (!result.nextCursor) {
        break;
      }

      cursor = result.nextCursor;
    }
  }

  /**
   * Sync connectors from Fivetran
   */
  private async *syncConnectors(options: FivetranSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    // First, get all groups
    const groups: string[] = [];
    if (options.groupId) {
      groups.push(options.groupId);
    } else {
      // Fetch all groups
      for await (const record of this.syncGroups({})) {
        groups.push(record.data.id);
      }
    }

    let totalFetched = 0;

    // Then, fetch connectors for each group
    for (const groupId of groups) {
      let cursor = options.cursor;

      while (true) {
        const result = await this.client.listConnectors(groupId, { cursor, limit: 100 });

        for (const connector of result.items) {
          // Filter by connector IDs if specified
          if (options.connectorIds && !options.connectorIds.includes(connector.id)) {
            continue;
          }

          yield {
            id: `fivetran:connector:${connector.id}`,
            type: 'connector',
            source: this.name,
            createdAt: connector.created_at,
            updatedAt: connector.succeeded_at || connector.failed_at || connector.created_at,
            data: connector
          };

          totalFetched++;

          // Respect limit if set
          if (options.limit && totalFetched >= options.limit) {
            return;
          }
        }

        // Check for more pages
        if (!result.nextCursor) {
          break;
        }

        cursor = result.nextCursor;
      }
    }
  }

  /**
   * Sync destinations from Fivetran
   */
  private async *syncDestinations(options: FivetranSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    // First, get all groups
    const groups: string[] = [];
    if (options.groupId) {
      groups.push(options.groupId);
    } else {
      // Fetch all groups
      for await (const record of this.syncGroups({})) {
        groups.push(record.data.id);
      }
    }

    let totalFetched = 0;

    // Then, fetch destination for each group
    for (const groupId of groups) {
      try {
        const destination = await this.client.getDestination(groupId);

        yield {
          id: `fivetran:destination:${destination.id}`,
          type: 'destination',
          source: this.name,
          createdAt: new Date().toISOString(), // Not available in API
          updatedAt: new Date().toISOString(),
          data: destination
        };

        totalFetched++;

        // Respect limit if set
        if (options.limit && totalFetched >= options.limit) {
          return;
        }
      } catch (error) {
        // Groups might not have destinations yet
        this.logger.debug('Failed to fetch destination for group', {
          groupId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Sync users from Fivetran
   */
  private async *syncUsers(options: FivetranSyncOptions): AsyncGenerator<ConnectorRecord> {
    if (!this.client) return;

    let cursor = options.cursor;
    let totalFetched = 0;

    while (true) {
      const result = await this.client.listUsers({ cursor, limit: 100 });

      for (const user of result.items) {
        yield {
          id: `fivetran:user:${user.id}`,
          type: 'user',
          source: this.name,
          createdAt: user.created_at,
          updatedAt: user.logged_in_at || user.created_at,
          data: user
        };

        totalFetched++;

        // Respect limit if set
        if (options.limit && totalFetched >= options.limit) {
          return;
        }
      }

      // Check for more pages
      if (!result.nextCursor) {
        break;
      }

      cursor = result.nextCursor;
    }
  }
}
