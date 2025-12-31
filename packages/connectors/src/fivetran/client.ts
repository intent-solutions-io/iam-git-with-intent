import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type {
  FivetranApiResponse,
  FivetranListResponse,
  FivetranConnector,
  FivetranDestination,
  FivetranGroup,
  FivetranUser,
  FivetranSyncStatus,
  FivetranError
} from './types.js';
import { ConnectorError } from '../errors/index.js';

/**
 * Fivetran REST API Client
 *
 * Handles:
 * - Basic authentication (API key + secret)
 * - Rate limiting (429 responses)
 * - Error handling
 * - Pagination (cursor-based)
 *
 * @see https://fivetran.com/docs/rest-api
 */
export class FivetranClient {
  private client: AxiosInstance;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    apiSecret: string,
    baseUrl: string = 'https://api.fivetran.com/v1'
  ) {
    this.baseUrl = baseUrl;

    // Create Basic Auth header: base64(apiKey:apiSecret)
    const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      this.handleError.bind(this)
    );
  }

  /**
   * Handle API errors with proper retry logic for rate limits
   */
  private async handleError(error: AxiosError<FivetranError>): Promise<never> {
    if (!error.response) {
      throw new ConnectorError(
        `Network error: ${error.message}`,
        'fivetran',
        { code: error.code }
      );
    }

    const { status, data } = error.response;

    // Handle rate limiting (429)
    if (status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      // Handle both seconds and HTTP-date formats per RFC 7231
      const waitMs = (() => {
        if (!retryAfter) return 60000;
        const seconds = parseInt(retryAfter, 10);
        if (!Number.isNaN(seconds)) return seconds * 1000;
        const date = new Date(retryAfter).getTime();
        if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
        return 60000; // Fallback for invalid header value
      })();

      throw new ConnectorError(
        `Rate limit exceeded. Retry after ${waitMs}ms`,
        'fivetran',
        { code: 'RATE_LIMIT_EXCEEDED', retryAfter: waitMs }
      );
    }

    // Handle authentication errors (401, 403)
    if (status === 401 || status === 403) {
      throw new ConnectorError(
        `Authentication failed: ${data?.message || 'Invalid credentials'}`,
        'fivetran',
        { code: 'AUTH_FAILED', status }
      );
    }

    // Handle not found (404)
    if (status === 404) {
      throw new ConnectorError(
        `Resource not found: ${data?.message || 'Not found'}`,
        'fivetran',
        { code: 'NOT_FOUND', status }
      );
    }

    // Handle other errors
    throw new ConnectorError(
      `Fivetran API error: ${data?.message || error.message}`,
      'fivetran',
      {
        code: data?.code || 'UNKNOWN_ERROR',
        status,
        details: data?.details
      }
    );
  }

  // ============================================================================
  // User & Account Operations
  // ============================================================================

  /**
   * Get current user info (verifies authentication)
   */
  async getCurrentUser(): Promise<FivetranUser> {
    const { data } = await this.client.get<FivetranApiResponse<FivetranUser>>('/user');
    return data.data;
  }

  /**
   * List all users in the account
   */
  async listUsers(options?: { cursor?: string; limit?: number }): Promise<{
    items: FivetranUser[];
    nextCursor?: string;
  }> {
    const params: Record<string, any> = {};
    if (options?.cursor) params.cursor = options.cursor;
    if (options?.limit) params.limit = options.limit;

    const { data } = await this.client.get<FivetranListResponse<FivetranUser>>('/users', { params });

    return {
      items: data.data.items,
      nextCursor: data.data.next_cursor
    };
  }

  // ============================================================================
  // Group Operations
  // ============================================================================

  /**
   * List all groups
   */
  async listGroups(options?: { cursor?: string; limit?: number }): Promise<{
    items: FivetranGroup[];
    nextCursor?: string;
  }> {
    const params: Record<string, any> = {};
    if (options?.cursor) params.cursor = options.cursor;
    if (options?.limit) params.limit = options.limit;

    const { data } = await this.client.get<FivetranListResponse<FivetranGroup>>('/groups', { params });

    return {
      items: data.data.items,
      nextCursor: data.data.next_cursor
    };
  }

  /**
   * Get group details
   */
  async getGroup(groupId: string): Promise<FivetranGroup> {
    const { data } = await this.client.get<FivetranApiResponse<FivetranGroup>>(`/groups/${groupId}`);
    return data.data;
  }

  // ============================================================================
  // Connector Operations
  // ============================================================================

  /**
   * List all connectors in a group
   */
  async listConnectors(groupId: string, options?: { cursor?: string; limit?: number }): Promise<{
    items: FivetranConnector[];
    nextCursor?: string;
  }> {
    const params: Record<string, any> = {};
    if (options?.cursor) params.cursor = options.cursor;
    if (options?.limit) params.limit = options.limit;

    const { data } = await this.client.get<FivetranListResponse<FivetranConnector>>(
      `/groups/${groupId}/connectors`,
      { params }
    );

    return {
      items: data.data.items,
      nextCursor: data.data.next_cursor
    };
  }

  /**
   * Get connector details
   */
  async getConnector(connectorId: string): Promise<FivetranConnector> {
    const { data } = await this.client.get<FivetranApiResponse<FivetranConnector>>(
      `/connectors/${connectorId}`
    );
    return data.data;
  }

  /**
   * Trigger a sync for a connector
   */
  async triggerSync(connectorId: string, options?: { force?: boolean }): Promise<{
    message: string;
    connector_id: string;
  }> {
    const { data } = await this.client.post<FivetranApiResponse<{ message: string }>>(
      `/connectors/${connectorId}/sync`,
      { force: options?.force ?? false }
    );

    return {
      message: data.data.message,
      connector_id: connectorId
    };
  }

  /**
   * Pause a connector
   */
  async pauseConnector(connectorId: string): Promise<FivetranConnector> {
    const { data } = await this.client.patch<FivetranApiResponse<FivetranConnector>>(
      `/connectors/${connectorId}`,
      { paused: true }
    );
    return data.data;
  }

  /**
   * Resume a connector
   */
  async resumeConnector(connectorId: string): Promise<FivetranConnector> {
    const { data } = await this.client.patch<FivetranApiResponse<FivetranConnector>>(
      `/connectors/${connectorId}`,
      { paused: false }
    );
    return data.data;
  }

  /**
   * Get sync status for a connector
   */
  async getSyncStatus(connectorId: string): Promise<FivetranSyncStatus> {
    const connector = await this.getConnector(connectorId);

    return {
      connector_id: connector.id,
      status: this.determineConnectorStatus(connector),
      sync_state: connector.status.sync_state,
      last_sync_started_at: null, // Not directly available in v1 API
      last_sync_completed_at: connector.succeeded_at,
      last_sync_succeeded_at: connector.succeeded_at,
      last_sync_failed_at: connector.failed_at,
      is_historical_sync: connector.status.is_historical_sync,
      next_sync_scheduled_at: null // Would need to calculate from sync_frequency
    };
  }

  // ============================================================================
  // Destination Operations
  // ============================================================================

  /**
   * Get destination details for a group
   */
  async getDestination(groupId: string): Promise<FivetranDestination> {
    const { data } = await this.client.get<FivetranApiResponse<FivetranDestination>>(
      `/groups/${groupId}/destination`
    );
    return data.data;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Determine connector status from connector object
   */
  private determineConnectorStatus(connector: FivetranConnector): 'ACTIVE' | 'PAUSED' | 'BROKEN' | 'INCOMPLETE' | 'RESCHEDULED' {
    if (connector.paused) {
      return 'PAUSED';
    }

    switch (connector.status.setup_state) {
      case 'BROKEN':
        return 'BROKEN';
      case 'INCOMPLETE':
        return 'INCOMPLETE';
      default:
        // Connected
        if (connector.status.sync_state === 'rescheduled') {
          return 'RESCHEDULED';
        }
        return 'ACTIVE';
    }
  }
}
