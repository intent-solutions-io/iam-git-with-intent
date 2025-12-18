/**
 * Phase 53: Airbyte Integration Tests
 *
 * Tests for Airbyte connector runner, config validation,
 * state management, DLQ handling, and conversion to canonical format.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIRBYTE_CONTRACT_VERSION,
  AirbyteErrorCodes,
  AirbyteRunner,
  AirbyteConnectionConfigSchema,
  validateAirbyteConfig,
  createAirbyteConnection,
  createAirbyteRunnerConfig,
  convertAirbyteToCanonical,
  type AirbyteConnectionConfig,
  type AirbyteRunnerConfig,
  type AirbyteSyncJob,
  type AirbyteDLQRecord,
} from '../index.js';
import type { MappingRule, NormalizationContext } from '../../prediction-connectors/index.js';

describe('Airbyte Integration', () => {
  describe('Contract Version', () => {
    it('should have stable contract version', () => {
      expect(AIRBYTE_CONTRACT_VERSION).toBe('1.0.0');
    });
  });

  describe('Error Codes', () => {
    it('should define config error codes (1xxx)', () => {
      expect(AirbyteErrorCodes.INVALID_CONFIG).toBe('AB_1001');
      expect(AirbyteErrorCodes.MISSING_SOURCE_ID).toBe('AB_1002');
      expect(AirbyteErrorCodes.MISSING_DESTINATION_ID).toBe('AB_1003');
      expect(AirbyteErrorCodes.INVALID_SYNC_MODE).toBe('AB_1004');
    });

    it('should define connection error codes (2xxx)', () => {
      expect(AirbyteErrorCodes.CONNECTION_FAILED).toBe('AB_2001');
      expect(AirbyteErrorCodes.AUTH_FAILED).toBe('AB_2002');
      expect(AirbyteErrorCodes.TIMEOUT).toBe('AB_2003');
      expect(AirbyteErrorCodes.SOURCE_UNAVAILABLE).toBe('AB_2004');
    });

    it('should define sync error codes (3xxx)', () => {
      expect(AirbyteErrorCodes.SYNC_FAILED).toBe('AB_3001');
      expect(AirbyteErrorCodes.SYNC_CANCELLED).toBe('AB_3002');
      expect(AirbyteErrorCodes.PARTIAL_SYNC).toBe('AB_3003');
      expect(AirbyteErrorCodes.SCHEMA_MISMATCH).toBe('AB_3004');
    });

    it('should define data error codes (4xxx)', () => {
      expect(AirbyteErrorCodes.RECORD_INVALID).toBe('AB_4001');
      expect(AirbyteErrorCodes.TRANSFORMATION_FAILED).toBe('AB_4002');
      expect(AirbyteErrorCodes.DLQ_WRITE_FAILED).toBe('AB_4003');
      expect(AirbyteErrorCodes.DEDUP_FAILED).toBe('AB_4004');
    });

    it('should define secret error codes (5xxx)', () => {
      expect(AirbyteErrorCodes.SECRET_NOT_FOUND).toBe('AB_5001');
      expect(AirbyteErrorCodes.SECRET_ACCESS_DENIED).toBe('AB_5002');
      expect(AirbyteErrorCodes.SECRET_EXPIRED).toBe('AB_5003');
      expect(AirbyteErrorCodes.SECRET_ROTATION_FAILED).toBe('AB_5004');
    });
  });

  describe('Config Validation', () => {
    const validConfig: AirbyteConnectionConfig = {
      id: 'conn_1',
      name: 'Test Connection',
      source: {
        connectorName: 'source-postgres',
        connectorVersion: '1.0.0',
        connectionConfig: {
          host: 'localhost',
          port: 5432,
          database: 'test',
        },
      },
      destination: {
        type: 'gwi-canonical',
        tenantId: 'tenant_1',
        mappingRuleId: 'rule_1',
      },
      schedule: {
        type: 'manual',
        timezone: 'UTC',
        enabled: false,
      },
      syncModes: {
        metrics: 'incremental_append',
      },
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        multiplier: 2,
        jitter: true,
        dlqErrors: ['AB_4001', 'AB_4002'],
      },
      stateType: 'per_stream',
    };

    it('should validate a valid config', () => {
      const result = validateAirbyteConfig(validConfig);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validConfig);
    });

    it('should reject config without id', () => {
      const config = { ...validConfig, id: '' };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject config without name', () => {
      const config = { ...validConfig, name: '' };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject config with invalid schedule type', () => {
      const config = {
        ...validConfig,
        schedule: { ...validConfig.schedule, type: 'invalid' as any },
      };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject config with invalid sync mode', () => {
      const config = {
        ...validConfig,
        syncModes: { metrics: 'invalid_mode' as any },
      };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(false);
    });

    it('should accept config with cron schedule', () => {
      const config = {
        ...validConfig,
        schedule: {
          type: 'cron' as const,
          cronExpression: '0 * * * *',
          timezone: 'America/New_York',
          enabled: true,
        },
      };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(true);
    });

    it('should accept config with interval schedule', () => {
      const config = {
        ...validConfig,
        schedule: {
          type: 'interval' as const,
          intervalMinutes: 30,
          timezone: 'UTC',
          enabled: true,
        },
      };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(true);
    });

    it('should validate CDC enabled flag', () => {
      const config = { ...validConfig, cdcEnabled: true };
      const result = validateAirbyteConfig(config);
      expect(result.success).toBe(true);
      expect(result.data?.cdcEnabled).toBe(true);
    });
  });

  describe('Factory Functions', () => {
    it('should create connection with defaults', () => {
      const conn = createAirbyteConnection({
        id: 'conn_test',
        name: 'Test',
        source: {
          connectorName: 'source-postgres',
          connectorVersion: '1.0.0',
          connectionConfig: {},
        },
        destination: {
          type: 'gwi-canonical',
          tenantId: 'tenant_1',
          mappingRuleId: 'rule_1',
        },
      });

      expect(conn.id).toBe('conn_test');
      expect(conn.schedule.type).toBe('manual');
      expect(conn.schedule.enabled).toBe(false);
      expect(conn.retry.maxAttempts).toBe(3);
      expect(conn.retry.jitter).toBe(true);
      expect(conn.stateType).toBe('per_stream');
    });

    it('should allow overriding defaults', () => {
      const conn = createAirbyteConnection({
        id: 'conn_test',
        name: 'Test',
        source: {
          connectorName: 'source-postgres',
          connectorVersion: '1.0.0',
          connectionConfig: {},
        },
        destination: {
          type: 'gwi-canonical',
          tenantId: 'tenant_1',
          mappingRuleId: 'rule_1',
        },
        stateType: 'global',
        cdcEnabled: true,
      });

      expect(conn.stateType).toBe('global');
      expect(conn.cdcEnabled).toBe(true);
    });

    it('should create runner config with defaults', () => {
      const config = createAirbyteRunnerConfig();
      expect(config.mode).toBe('local');
      expect(config.timeoutMs).toBe(3600000);
      expect(config.secretProvider).toBe('env');
      expect(config.auditEnabled).toBe(true);
    });

    it('should allow overriding runner config', () => {
      const config = createAirbyteRunnerConfig({
        mode: 'kubernetes',
        gcpProject: 'my-project',
        secretProvider: 'gcp',
      });
      expect(config.mode).toBe('kubernetes');
      expect(config.gcpProject).toBe('my-project');
      expect(config.secretProvider).toBe('gcp');
    });
  });

  describe('AirbyteRunner', () => {
    let runner: AirbyteRunner;
    let connection: AirbyteConnectionConfig;

    beforeEach(() => {
      runner = new AirbyteRunner(createAirbyteRunnerConfig());
      connection = createAirbyteConnection({
        id: 'conn_1',
        name: 'Test Connection',
        source: {
          connectorName: 'source-postgres',
          connectorVersion: '1.0.0',
          connectionConfig: { host: 'localhost' },
        },
        destination: {
          type: 'gwi-canonical',
          tenantId: 'tenant_1',
          mappingRuleId: 'rule_1',
        },
        syncModes: { metrics: 'incremental_append' },
      });
    });

    describe('Connection Management', () => {
      it('should register a connection', () => {
        runner.registerConnection(connection);
        expect(runner.getConnection('conn_1')).toEqual(connection);
      });

      it('should list connections', () => {
        runner.registerConnection(connection);
        const conns = runner.listConnections();
        expect(conns).toHaveLength(1);
        expect(conns[0].id).toBe('conn_1');
      });

      it('should return undefined for unknown connection', () => {
        expect(runner.getConnection('unknown')).toBeUndefined();
      });

      it('should initialize state on connection registration', () => {
        runner.registerConnection(connection);
        const state = runner.getState('conn_1');
        expect(state).toBeDefined();
        expect(state?.connectionId).toBe('conn_1');
        expect(state?.version).toBe(1);
      });
    });

    describe('Sync Operations', () => {
      it('should run a sync job', async () => {
        runner.registerConnection(connection);
        const job = await runner.runSync('conn_1');

        expect(job.id).toMatch(/^airbyte_job_\d+$/);
        expect(job.connectionId).toBe('conn_1');
        expect(job.status).toMatch(/^(succeeded|partial)$/);
        expect(job.triggeredBy).toBe('manual');
        expect(job.attempt).toBe(1);
        expect(job.startedAt).toBeGreaterThan(0);
        expect(job.completedAt).toBeGreaterThan(job.startedAt);
      });

      it('should include stats in successful job', async () => {
        runner.registerConnection(connection);
        const job = await runner.runSync('conn_1');

        expect(job.stats).toBeDefined();
        expect(job.stats?.recordsRead).toBe(100);
        expect(job.stats?.recordsWritten).toBe(98);
        expect(job.stats?.recordsSkipped).toBe(1);
        expect(job.stats?.recordsDLQ).toBe(1);
        expect(job.stats?.streamsSynced).toContain('metrics');
      });

      it('should support custom triggered by', async () => {
        runner.registerConnection(connection);
        const job = await runner.runSync('conn_1', { triggeredBy: 'schedule' });
        expect(job.triggeredBy).toBe('schedule');
      });

      it('should generate correlation ID', async () => {
        runner.registerConnection(connection);
        const job = await runner.runSync('conn_1');
        expect(job.correlationId).toMatch(/^corr_\d+_\w+$/);
      });

      it('should accept custom correlation ID', async () => {
        runner.registerConnection(connection);
        const job = await runner.runSync('conn_1', { correlationId: 'my_corr_123' });
        expect(job.correlationId).toBe('my_corr_123');
      });

      it('should throw for unknown connection', async () => {
        await expect(runner.runSync('unknown')).rejects.toThrow('Connection unknown not found');
      });

      it('should update state after sync', async () => {
        runner.registerConnection(connection);
        await runner.runSync('conn_1');

        const state = runner.getState('conn_1');
        expect(state?.version).toBe(2);
        expect(state?.streamStates.metrics).toBeDefined();
        expect(state?.streamStates.metrics.lastSyncAt).toBeGreaterThan(0);
      });

      it('should include final state in job', async () => {
        runner.registerConnection(connection);
        const job = await runner.runSync('conn_1');

        expect(job.finalState).toBeDefined();
        expect(job.finalState?.version).toBe(2);
      });
    });

    describe('State Management', () => {
      it('should reset all state', () => {
        runner.registerConnection(connection);

        // Simulate sync to add stream states
        const state = runner.getState('conn_1')!;
        state.streamStates.metrics = {
          streamName: 'metrics',
          lastSyncAt: Date.now(),
          recordsSynced: 100,
        };
        state.streamStates.events = {
          streamName: 'events',
          lastSyncAt: Date.now(),
          recordsSynced: 50,
        };

        runner.resetState('conn_1');

        const newState = runner.getState('conn_1');
        expect(Object.keys(newState?.streamStates || {})).toHaveLength(0);
        expect(newState?.version).toBeGreaterThan(1);
      });

      it('should reset specific streams', () => {
        runner.registerConnection(connection);

        const state = runner.getState('conn_1')!;
        state.streamStates.metrics = {
          streamName: 'metrics',
          lastSyncAt: Date.now(),
        };
        state.streamStates.events = {
          streamName: 'events',
          lastSyncAt: Date.now(),
        };

        runner.resetState('conn_1', ['metrics']);

        const newState = runner.getState('conn_1');
        expect(newState?.streamStates.metrics).toBeUndefined();
        expect(newState?.streamStates.events).toBeDefined();
      });

      it('should handle reset for unknown connection', () => {
        // Should not throw
        runner.resetState('unknown');
      });
    });

    describe('DLQ Operations', () => {
      it('should write to DLQ', () => {
        runner.registerConnection(connection);
        const record = { id: 1, value: 'invalid' };
        const dlq = runner.writeToDLQ(
          'conn_1',
          'job_1',
          'metrics',
          record,
          { code: AirbyteErrorCodes.RECORD_INVALID, message: 'Invalid value' }
        );

        expect(dlq.id).toMatch(/^dlq_\d+$/);
        expect(dlq.connectionId).toBe('conn_1');
        expect(dlq.jobId).toBe('job_1');
        expect(dlq.streamName).toBe('metrics');
        expect(dlq.originalRecord).toEqual(record);
        expect(dlq.errorCode).toBe('AB_4001');
        expect(dlq.errorMessage).toBe('Invalid value');
        expect(dlq.retryCount).toBe(0);
        expect(dlq.reviewed).toBe(false);
      });

      it('should generate unique DLQ IDs', () => {
        runner.registerConnection(connection);
        const dlq1 = runner.writeToDLQ('conn_1', 'job_1', 'metrics', {}, {
          code: AirbyteErrorCodes.RECORD_INVALID,
          message: 'Error 1',
        });
        const dlq2 = runner.writeToDLQ('conn_1', 'job_1', 'metrics', {}, {
          code: AirbyteErrorCodes.RECORD_INVALID,
          message: 'Error 2',
        });

        expect(dlq1.id).not.toBe(dlq2.id);
      });
    });

    describe('Connection Testing', () => {
      it('should test a connection successfully', async () => {
        runner.registerConnection(connection);
        const result = await runner.testConnection('conn_1');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Connection successful');
        expect(result.latencyMs).toBeGreaterThan(0);
      });

      it('should fail for unknown connection', async () => {
        const result = await runner.testConnection('unknown');
        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
        expect(result.latencyMs).toBe(0);
      });
    });

    describe('Schema Discovery', () => {
      it('should discover schema', async () => {
        runner.registerConnection(connection);
        const catalog = await runner.discoverSchema('conn_1');

        expect(catalog.streams).toHaveLength(1);
        expect(catalog.streams[0].name).toBe('metrics');
        expect(catalog.streams[0].supportedSyncModes).toContain('incremental_append');
        expect(catalog.streams[0].sourceDefinedCursor).toBe(true);
      });

      it('should throw for unknown connection', async () => {
        await expect(runner.discoverSchema('unknown')).rejects.toThrow('not found');
      });
    });
  });

  describe('Canonical Conversion', () => {
    const mappingRule: MappingRule = {
      id: 'rule_1',
      name: 'Test Rule',
      sourceStream: 'metrics',
      timestampMapping: {
        sourcePath: 'ts',
        format: 'iso8601',
      },
      valueMapping: {
        sourcePath: 'value',
        type: 'number',
      },
      labelMappings: [],
      filters: [],
      transforms: [],
    };

    const context: NormalizationContext = {
      connectorId: 'conn_1',
      tenantId: 'tenant_1',
      batchId: 'batch_1',
      ingestedAt: Date.now(),
    };

    it('should convert valid records to canonical points', () => {
      const records = [
        { ts: '2024-01-01T00:00:00Z', value: 100 },
        { ts: '2024-01-01T01:00:00Z', value: 200 },
      ];

      const result = convertAirbyteToCanonical(records, mappingRule, context);

      expect(result.points).toHaveLength(2);
      expect(result.dlqRecords).toHaveLength(0);
      expect(result.points[0].timestamp).toBe(new Date('2024-01-01T00:00:00Z').getTime());
      expect(result.points[0].value).toBe(100);
    });

    it('should handle unix_seconds timestamp format', () => {
      const rule: MappingRule = {
        ...mappingRule,
        timestampMapping: { sourcePath: 'ts', format: 'unix_seconds' },
      };
      const records = [{ ts: 1704067200, value: 100 }]; // 2024-01-01T00:00:00Z

      const result = convertAirbyteToCanonical(records, rule, context);

      expect(result.points).toHaveLength(1);
      expect(result.points[0].timestamp).toBe(1704067200000);
    });

    it('should handle unix_ms timestamp format', () => {
      const rule: MappingRule = {
        ...mappingRule,
        timestampMapping: { sourcePath: 'ts', format: 'unix_ms' },
      };
      const records = [{ ts: 1704067200000, value: 100 }];

      const result = convertAirbyteToCanonical(records, rule, context);

      expect(result.points).toHaveLength(1);
      expect(result.points[0].timestamp).toBe(1704067200000);
    });

    it('should convert string values to numbers', () => {
      const records = [{ ts: '2024-01-01T00:00:00Z', value: '123.45' }];

      const result = convertAirbyteToCanonical(records, mappingRule, context);

      expect(result.points[0].value).toBe(123.45);
    });

    it('should add processing metadata', () => {
      const records = [{ ts: '2024-01-01T00:00:00Z', value: 100 }];

      const result = convertAirbyteToCanonical(records, mappingRule, context);

      expect(result.points[0].processingMetadata?.sourceConnectorId).toBe('conn_1');
      expect(result.points[0].processingMetadata?.batchId).toBe('batch_1');
    });

    it('should send non-object records to DLQ', () => {
      const records = ['string', 123, null];

      const result = convertAirbyteToCanonical(records, mappingRule, context);

      expect(result.points).toHaveLength(0);
      expect(result.dlqRecords).toHaveLength(3);
    });

    it('should send invalid timestamps to DLQ', () => {
      const records = [{ ts: 'invalid-date', value: 100 }];

      const result = convertAirbyteToCanonical(records, mappingRule, context);

      expect(result.points).toHaveLength(0);
      expect(result.dlqRecords).toHaveLength(1);
      expect(result.dlqRecords[0].error).toContain('Invalid timestamp');
    });

    it('should handle nested source paths', () => {
      const rule: MappingRule = {
        ...mappingRule,
        timestampMapping: { sourcePath: 'data.timestamp', format: 'iso8601' },
        valueMapping: { sourcePath: 'data.metrics.value', type: 'number' },
      };
      const records = [
        {
          data: {
            timestamp: '2024-01-01T00:00:00Z',
            metrics: { value: 42 },
          },
        },
      ];

      const result = convertAirbyteToCanonical(records, rule, context);

      expect(result.points).toHaveLength(1);
      expect(result.points[0].value).toBe(42);
    });

    it('should handle missing nested paths gracefully', () => {
      const rule: MappingRule = {
        ...mappingRule,
        timestampMapping: { sourcePath: 'missing.path', format: 'iso8601' },
      };
      const records = [{ ts: '2024-01-01T00:00:00Z', value: 100 }];

      const result = convertAirbyteToCanonical(records, rule, context);

      expect(result.points).toHaveLength(0);
      expect(result.dlqRecords).toHaveLength(1);
    });

    it('should handle null values', () => {
      const records = [{ ts: '2024-01-01T00:00:00Z', value: null }];

      const result = convertAirbyteToCanonical(records, mappingRule, context);

      expect(result.points).toHaveLength(1);
      expect(result.points[0].value).toBeNull();
    });
  });

  describe('Golden Fixtures', () => {
    const goldenConnection: AirbyteConnectionConfig = {
      id: 'golden_conn_1',
      name: 'Golden Test Connection',
      source: {
        connectorName: 'source-postgres',
        connectorVersion: '2.0.0',
        connectionConfig: {
          host: 'db.example.com',
          port: 5432,
          database: 'production',
        },
        catalog: {
          streams: [
            {
              name: 'metrics',
              namespace: 'public',
              jsonSchema: { type: 'object' },
              supportedSyncModes: ['incremental_append'],
            },
          ],
        },
      },
      destination: {
        type: 'gwi-canonical',
        tenantId: 'tenant_golden',
        workspaceId: 'ws_1',
        mappingRuleId: 'rule_golden',
      },
      schedule: {
        type: 'interval',
        intervalMinutes: 15,
        timezone: 'America/New_York',
        enabled: true,
      },
      syncModes: {
        metrics: 'incremental_append',
        events: 'full_refresh_overwrite',
      },
      cursorFields: {
        metrics: 'updated_at',
      },
      primaryKeys: {
        events: ['id'],
      },
      retry: {
        maxAttempts: 5,
        initialDelayMs: 500,
        maxDelayMs: 30000,
        multiplier: 1.5,
        jitter: true,
        dlqErrors: ['AB_4001', 'AB_4002', 'AB_4004'],
      },
      stateType: 'per_stream',
      cdcEnabled: true,
      properties: {
        ssl: true,
        poolSize: 10,
      },
    };

    it('should validate golden connection config', () => {
      const result = validateAirbyteConfig(goldenConnection);
      expect(result.success).toBe(true);
    });

    it('should preserve all fields through validation', () => {
      const result = validateAirbyteConfig(goldenConnection);
      expect(result.data).toEqual(goldenConnection);
    });

    it('should maintain stable error code values', () => {
      // Error codes must remain stable for backwards compatibility
      const expectedCodes = {
        INVALID_CONFIG: 'AB_1001',
        CONNECTION_FAILED: 'AB_2001',
        SYNC_FAILED: 'AB_3001',
        RECORD_INVALID: 'AB_4001',
        SECRET_NOT_FOUND: 'AB_5001',
      };

      Object.entries(expectedCodes).forEach(([key, expected]) => {
        expect(AirbyteErrorCodes[key as keyof typeof AirbyteErrorCodes]).toBe(expected);
      });
    });
  });
});
