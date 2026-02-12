import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FivetranConnector } from '../fivetran-connector.js';
import { FivetranClient } from '../client.js';
import type {
  FivetranConnector as FivetranConnectorType,
  FivetranGroup,
  FivetranDestination,
  FivetranUser,
  FivetranConnectorConfig
} from '../types.js';
import type { ConnectorRecord } from '../../interfaces/types.js';
import { ConnectorError, AuthenticationError } from '../../errors/index.js';

// Mock the FivetranClient
vi.mock('../client.js', () => {
  return {
    FivetranClient: vi.fn()
  };
});

// TODO(gwi-64f): Fivetran connector deprioritized — re-enable when connector ships
describe.skip('FivetranConnector', () => {
  let connector: FivetranConnector;
  let mockClient: any;

  const mockConfig: FivetranConnectorConfig = {
    tenantId: 'test-tenant',
    auth: {
      type: 'basic',
      apiKey: 'test-key',
      apiSecret: 'test-secret'
    }
  };

  const mockUser: FivetranUser = {
    id: 'user-123',
    email: 'test@example.com',
    given_name: 'Test',
    family_name: 'User',
    verified: true,
    invited: false,
    picture: null,
    phone: null,
    role: 'Account Administrator',
    logged_in_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z'
  };

  const mockGroup: FivetranGroup = {
    id: 'group-123',
    name: 'Test Group',
    created_at: '2024-01-01T00:00:00Z'
  };

  const mockConnector: FivetranConnectorType = {
    id: 'connector-123',
    group_id: 'group-123',
    service: 'postgres',
    service_version: 1,
    schema: 'test_schema',
    connected_by: 'user-123',
    created_at: '2024-01-01T00:00:00Z',
    succeeded_at: '2024-01-02T00:00:00Z',
    failed_at: null,
    sync_frequency: 360,
    schedule_type: 'auto',
    status: {
      setup_state: 'CONNECTED',
      sync_state: 'scheduled',
      update_state: 'on_schedule',
      is_historical_sync: false,
      tasks: [],
      warnings: []
    },
    config: {},
    paused: false,
    pause_after_trial: false,
    daily_sync_time: '00:00',
    succeeded_at_utc: '2024-01-02T00:00:00Z',
    failed_at_utc: null
  };

  const mockDestination: FivetranDestination = {
    id: 'dest-123',
    group_id: 'group-123',
    service: 'bigquery',
    region: 'US',
    time_zone_offset: '-8',
    setup_status: 'CONNECTED',
    config: {}
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock client instance
    mockClient = {
      getCurrentUser: vi.fn(),
      listUsers: vi.fn(),
      listGroups: vi.fn(),
      getGroup: vi.fn(),
      listConnectors: vi.fn(),
      getConnector: vi.fn(),
      triggerSync: vi.fn(),
      pauseConnector: vi.fn(),
      resumeConnector: vi.fn(),
      getSyncStatus: vi.fn(),
      getDestination: vi.fn()
    };

    // Mock the FivetranClient constructor
    (FivetranClient as any).mockImplementation(() => mockClient);

    // Create connector instance
    connector = new FivetranConnector();
  });

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('authenticate', () => {
    it('should authenticate successfully with valid credentials', async () => {
      mockClient.getCurrentUser.mockResolvedValue(mockUser);

      const result = await connector.authenticate(mockConfig);

      expect(result.success).toBe(true);
      expect(result.metadata?.userId).toBe(mockUser.id);
      expect(result.metadata?.email).toBe(mockUser.email);
      expect(FivetranClient).toHaveBeenCalledWith(
        mockConfig.auth.apiKey,
        mockConfig.auth.apiSecret,
        undefined
      );
    });

    it('should throw ValidationError for invalid config', async () => {
      const invalidConfig = {
        tenantId: '',
        auth: {
          type: 'basic',
          apiKey: '',
          apiSecret: ''
        }
      };

      await expect(connector.authenticate(invalidConfig as any)).rejects.toThrow();
    });

    it('should throw AuthenticationError when API key is invalid', async () => {
      const authError = new ConnectorError('Authentication failed', 'fivetran', {
        code: 'AUTH_FAILED',
        status: 401
      });
      mockClient.getCurrentUser.mockRejectedValue(authError);

      await expect(connector.authenticate(mockConfig)).rejects.toThrow(AuthenticationError);
    });

    it('should use custom baseUrl if provided', async () => {
      mockClient.getCurrentUser.mockResolvedValue(mockUser);

      const configWithBaseUrl = {
        ...mockConfig,
        baseUrl: 'https://custom-api.fivetran.com/v1'
      };

      await connector.authenticate(configWithBaseUrl);

      expect(FivetranClient).toHaveBeenCalledWith(
        mockConfig.auth.apiKey,
        mockConfig.auth.apiSecret,
        configWithBaseUrl.baseUrl
      );
    });
  });

  // ============================================================================
  // Health Check Tests
  // ============================================================================

  describe('healthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      mockClient.getCurrentUser.mockResolvedValue(mockUser);
      mockClient.listGroups.mockResolvedValue({
        items: [mockGroup],
        nextCursor: undefined
      });

      await connector.authenticate(mockConfig);
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('fivetran');
      expect(health.checks).toHaveLength(2);
      expect(health.checks[0].name).toBe('api_connectivity');
      expect(health.checks[0].status).toBe('pass');
      expect(health.checks[1].name).toBe('groups_access');
      expect(health.checks[1].status).toBe('pass');
    });

    it('should return unhealthy when not authenticated', async () => {
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks[0].status).toBe('fail');
      expect(health.checks[0].error).toContain('Not authenticated');
    });

    it('should mark groups_access as warn if it fails', async () => {
      mockClient.getCurrentUser.mockResolvedValue(mockUser);
      mockClient.listGroups.mockRejectedValue(new Error('Permission denied'));

      await connector.authenticate(mockConfig);
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true); // Still healthy overall
      expect(health.checks[1].status).toBe('warn');
    });
  });

  // ============================================================================
  // Sync Tests
  // ============================================================================

  describe('sync', () => {
    beforeEach(async () => {
      mockClient.getCurrentUser.mockResolvedValue(mockUser);
      await connector.authenticate(mockConfig);
    });

    it('should sync groups', async () => {
      mockClient.listGroups.mockResolvedValue({
        items: [mockGroup],
        nextCursor: undefined
      });

      const records: ConnectorRecord[] = [];
      for await (const record of connector.sync({ recordTypes: ['group'] })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(`fivetran:group:${mockGroup.id}`);
      expect(records[0].type).toBe('group');
      expect(records[0].source).toBe('fivetran');
      expect(records[0].data).toEqual(mockGroup);
    });

    it('should sync connectors for all groups', async () => {
      mockClient.listGroups.mockResolvedValue({
        items: [mockGroup],
        nextCursor: undefined
      });
      mockClient.listConnectors.mockResolvedValue({
        items: [mockConnector],
        nextCursor: undefined
      });

      const records: ConnectorRecord[] = [];
      for await (const record of connector.sync({ recordTypes: ['connector'] })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(`fivetran:connector:${mockConnector.id}`);
      expect(records[0].type).toBe('connector');
      expect(records[0].data).toEqual(mockConnector);
      expect(mockClient.listConnectors).toHaveBeenCalledWith(mockGroup.id, expect.any(Object));
    });

    it('should sync destinations', async () => {
      mockClient.listGroups.mockResolvedValue({
        items: [mockGroup],
        nextCursor: undefined
      });
      mockClient.getDestination.mockResolvedValue(mockDestination);

      const records: ConnectorRecord[] = [];
      for await (const record of connector.sync({ recordTypes: ['destination'] })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(`fivetran:destination:${mockDestination.id}`);
      expect(records[0].type).toBe('destination');
      expect(records[0].data).toEqual(mockDestination);
    });

    it('should sync users', async () => {
      mockClient.listUsers.mockResolvedValue({
        items: [mockUser],
        nextCursor: undefined
      });

      const records: ConnectorRecord[] = [];
      for await (const record of connector.sync({ recordTypes: ['user'] })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(`fivetran:user:${mockUser.id}`);
      expect(records[0].type).toBe('user');
      expect(records[0].data).toEqual(mockUser);
    });

    it('should respect pagination with cursor', async () => {
      mockClient.listGroups
        .mockResolvedValueOnce({
          items: [mockGroup],
          nextCursor: 'cursor-1'
        })
        .mockResolvedValueOnce({
          items: [{ ...mockGroup, id: 'group-456', name: 'Group 2' }],
          nextCursor: undefined
        });

      const records: ConnectorRecord[] = [];
      for await (const record of connector.sync({ recordTypes: ['group'] })) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(mockClient.listGroups).toHaveBeenCalledTimes(2);
    });

    it('should respect limit option', async () => {
      mockClient.listGroups.mockResolvedValue({
        items: [mockGroup, { ...mockGroup, id: 'group-456' }],
        nextCursor: undefined
      });

      const records: ConnectorRecord[] = [];
      for await (const record of connector.sync({ recordTypes: ['group'], limit: 1 })) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
    });

    it('should throw error when not authenticated', async () => {
      const unauthConnector = new FivetranConnector();

      await expect(async () => {
        for await (const _ of unauthConnector.sync({})) {
          // Should throw before yielding
        }
      }).rejects.toThrow(ConnectorError);
    });
  });

  // ============================================================================
  // Webhook Tests
  // ============================================================================

  describe('processWebhook', () => {
    it('should process sync_start webhook', async () => {
      const webhookEvent = {
        id: 'webhook-123',
        source: 'fivetran',
        type: 'sync_start',
        timestamp: '2024-01-01T00:00:00Z',
        payload: {
          event: 'sync_start',
          created: '2024-01-01T00:00:00Z',
          data: {
            connector_id: 'connector-123',
            group_id: 'group-123'
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(webhookEvent);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.fivetranEvent).toBe('sync_start');
      expect(result.metadata?.connectorId).toBe('connector-123');
    });

    it('should process connector_created webhook', async () => {
      const webhookEvent = {
        id: 'webhook-123',
        source: 'fivetran',
        type: 'connector_created',
        timestamp: '2024-01-01T00:00:00Z',
        payload: {
          event: 'connector_created',
          created: '2024-01-01T00:00:00Z',
          data: {
            connector_id: 'connector-123'
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(webhookEvent);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });

    it('should handle unknown webhook events', async () => {
      const webhookEvent = {
        id: 'webhook-123',
        source: 'fivetran',
        type: 'unknown_event',
        timestamp: '2024-01-01T00:00:00Z',
        payload: {
          event: 'unknown_event',
          created: '2024-01-01T00:00:00Z',
          data: {}
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(webhookEvent);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
    });

    it('should handle webhook processing errors', async () => {
      const invalidEvent = {
        id: 'webhook-123',
        source: 'fivetran',
        type: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        payload: null as any, // Invalid payload
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(invalidEvent);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // Metadata Tests
  // ============================================================================

  describe('getMetadata', () => {
    it('should return connector metadata', () => {
      const metadata = connector.getMetadata();

      expect(metadata.name).toBe('fivetran');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.recordTypes).toContain('connector');
      expect(metadata.recordTypes).toContain('destination');
      expect(metadata.recordTypes).toContain('group');
      expect(metadata.recordTypes).toContain('user');
      expect(metadata.authMethods).toContain('bearer');
      expect(metadata.supportsIncremental).toBe(true);
      expect(metadata.supportsWebhooks).toBe(true);
      expect(metadata.capabilities).toContain('connector_management');
      expect(metadata.capabilities).toContain('sync_trigger');
      expect(metadata.documentationUrl).toContain('fivetran.com');
    });
  });

  // ============================================================================
  // Fivetran-Specific Method Tests
  // ============================================================================

  describe('Fivetran-specific methods', () => {
    beforeEach(async () => {
      mockClient.getCurrentUser.mockResolvedValue(mockUser);
      await connector.authenticate(mockConfig);
    });

    it('should trigger sync', async () => {
      mockClient.triggerSync.mockResolvedValue({
        message: 'Sync triggered',
        connector_id: 'connector-123'
      });

      const result = await connector.triggerSync('connector-123');

      expect(result.message).toBe('Sync triggered');
      expect(result.connector_id).toBe('connector-123');
      expect(mockClient.triggerSync).toHaveBeenCalledWith('connector-123', {});
    });

    it('should trigger force sync', async () => {
      mockClient.triggerSync.mockResolvedValue({
        message: 'Force sync triggered',
        connector_id: 'connector-123'
      });

      await connector.triggerSync('connector-123', true);

      expect(mockClient.triggerSync).toHaveBeenCalledWith('connector-123', { force: true });
    });

    it('should get sync status', async () => {
      const mockStatus = {
        connector_id: 'connector-123',
        status: 'ACTIVE' as const,
        sync_state: 'scheduled' as const,
        last_sync_started_at: null,
        last_sync_completed_at: '2024-01-02T00:00:00Z',
        last_sync_succeeded_at: '2024-01-02T00:00:00Z',
        last_sync_failed_at: null,
        is_historical_sync: false,
        next_sync_scheduled_at: null
      };
      mockClient.getSyncStatus.mockResolvedValue(mockStatus);

      const status = await connector.getSyncStatus('connector-123');

      expect(status.connector_id).toBe('connector-123');
      expect(status.status).toBe('ACTIVE');
    });

    it('should pause connector', async () => {
      mockClient.pauseConnector.mockResolvedValue({
        ...mockConnector,
        paused: true
      });

      const result = await connector.pauseConnector('connector-123');

      expect(result.paused).toBe(true);
      expect(mockClient.pauseConnector).toHaveBeenCalledWith('connector-123');
    });

    it('should resume connector', async () => {
      mockClient.resumeConnector.mockResolvedValue({
        ...mockConnector,
        paused: false
      });

      const result = await connector.resumeConnector('connector-123');

      expect(result.paused).toBe(false);
      expect(mockClient.resumeConnector).toHaveBeenCalledWith('connector-123');
    });

    it('should throw when calling methods without authentication', async () => {
      const unauthConnector = new FivetranConnector();

      await expect(unauthConnector.triggerSync('connector-123')).rejects.toThrow(ConnectorError);
      await expect(unauthConnector.getSyncStatus('connector-123')).rejects.toThrow(ConnectorError);
      await expect(unauthConnector.pauseConnector('connector-123')).rejects.toThrow(ConnectorError);
      await expect(unauthConnector.resumeConnector('connector-123')).rejects.toThrow(ConnectorError);
    });
  });
});
