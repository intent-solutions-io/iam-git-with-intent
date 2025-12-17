/**
 * Airbyte Connector Tests
 *
 * Phase 4: Tests for Airbyte connector and conformance.
 *
 * @module @gwi/integrations/airbyte/__tests__/connector.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AirbyteConnector,
  MockAirbyteClient,
  createAirbyteConnector,
} from '../connector.js';
import {
  runConformanceTests,
  assertConformance,
  invokeTool,
  DefaultConnectorRegistry,
} from '@gwi/core';

// =============================================================================
// Connector Creation Tests
// =============================================================================

describe('AirbyteConnector', () => {
  describe('creation', () => {
    it('should create connector with mock client', () => {
      const connector = createAirbyteConnector();

      expect(connector.id).toBe('airbyte');
      expect(connector.version).toBe('1.0.0');
      expect(connector.displayName).toBe('Airbyte');
    });

    it('should create connector with custom client', () => {
      const client = new MockAirbyteClient();
      const connector = createAirbyteConnector({ client });

      expect(connector.id).toBe('airbyte');
    });
  });

  describe('tools', () => {
    let connector: AirbyteConnector;

    beforeEach(() => {
      connector = createAirbyteConnector();
    });

    it('should expose 6 tools', () => {
      const tools = connector.tools();
      expect(tools).toHaveLength(6);
    });

    it('should have correct tool names', () => {
      const tools = connector.tools();
      const names = tools.map(t => t.name);

      expect(names).toContain('listConnections');
      expect(names).toContain('getConnection');
      expect(names).toContain('getSyncStatus');
      expect(names).toContain('listJobs');
      expect(names).toContain('triggerSync');
      expect(names).toContain('cancelJob');
    });

    it('should have 4 READ tools', () => {
      const tools = connector.tools();
      const readTools = tools.filter(t => t.policyClass === 'READ');
      expect(readTools).toHaveLength(4);
    });

    it('should have 2 DESTRUCTIVE tools', () => {
      const tools = connector.tools();
      const destructiveTools = tools.filter(t => t.policyClass === 'DESTRUCTIVE');
      expect(destructiveTools).toHaveLength(2);
    });

    it('should get tool by name', () => {
      const tool = connector.getTool('getSyncStatus');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('getSyncStatus');
      expect(tool?.policyClass).toBe('READ');
    });

    it('should return undefined for unknown tool', () => {
      const tool = connector.getTool('nonexistent');
      expect(tool).toBeUndefined();
    });
  });
});

// =============================================================================
// Conformance Tests
// =============================================================================

describe('Airbyte Connector Conformance', () => {
  let connector: AirbyteConnector;

  beforeEach(() => {
    connector = createAirbyteConnector();
  });

  it('should pass all conformance tests', async () => {
    const report = await runConformanceTests(connector);

    expect(report.passed).toBe(true);
    expect(report.failedTests).toBe(0);
    expect(report.connectorId).toBe('airbyte');
  });

  it('should pass assertConformance', async () => {
    await expect(assertConformance(connector)).resolves.not.toThrow();
  });

  it('should have valid metadata', async () => {
    const report = await runConformanceTests(connector);
    const metadataTest = report.results.find(r => r.name === 'connector_metadata');

    expect(metadataTest?.passed).toBe(true);
  });

  it('should have all tools with input schemas', async () => {
    const report = await runConformanceTests(connector);
    const schemaTest = report.results.find(r => r.name === 'tools_have_input_schemas');

    expect(schemaTest?.passed).toBe(true);
  });

  it('should have all tools with output schemas', async () => {
    const report = await runConformanceTests(connector);
    const schemaTest = report.results.find(r => r.name === 'tools_have_output_schemas');

    expect(schemaTest?.passed).toBe(true);
  });

  it('should have all tools with policy class', async () => {
    const report = await runConformanceTests(connector);
    const policyTest = report.results.find(r => r.name === 'tools_have_policy_class');

    expect(policyTest?.passed).toBe(true);
  });

  it('should have stable tool names', async () => {
    const report = await runConformanceTests(connector);
    const namesTest = report.results.find(r => r.name === 'tool_names_stable');

    expect(namesTest?.passed).toBe(true);
  });
});

// =============================================================================
// Invoke Pipeline Tests
// =============================================================================

describe('Airbyte invokeTool', () => {
  let registry: DefaultConnectorRegistry;

  beforeEach(() => {
    registry = new DefaultConnectorRegistry();
    registry.register(createAirbyteConnector());
  });

  describe('READ operations', () => {
    it('should list connections', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000001',
        tenantId: 'test-tenant',
        toolName: 'airbyte.listConnections',
        input: { workspaceId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      const output = result.output as { connections: unknown[]; totalCount: number };
      expect(output.connections).toBeInstanceOf(Array);
      expect(output.totalCount).toBeGreaterThan(0);
    });

    it('should get connection details', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000002',
        tenantId: 'test-tenant',
        toolName: 'airbyte.getConnection',
        input: { connectionId: '11111111-1111-1111-1111-111111111111' },
      });

      expect(result.success).toBe(true);

      const output = result.output as { name: string; status: string };
      expect(output.name).toBe('Postgres to Snowflake');
      expect(output.status).toBe('active');
    });

    it('should get sync status', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000003',
        tenantId: 'test-tenant',
        toolName: 'airbyte.getSyncStatus',
        input: { connectionId: '11111111-1111-1111-1111-111111111111' },
      });

      expect(result.success).toBe(true);

      const output = result.output as { hasError: boolean; lastJobStatus: string };
      expect(output.hasError).toBe(false);
      expect(output.lastJobStatus).toBe('succeeded');
    });

    it('should get failed sync status', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000004',
        tenantId: 'test-tenant',
        toolName: 'airbyte.getSyncStatus',
        input: { connectionId: '22222222-2222-2222-2222-222222222222' },
      });

      expect(result.success).toBe(true);

      const output = result.output as { hasError: boolean; lastJobStatus: string; errorMessage: string };
      expect(output.hasError).toBe(true);
      expect(output.lastJobStatus).toBe('failed');
      expect(output.errorMessage).toContain('Connection timeout');
    });

    it('should list jobs', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000005',
        tenantId: 'test-tenant',
        toolName: 'airbyte.listJobs',
        input: { connectionId: '11111111-1111-1111-1111-111111111111' },
      });

      expect(result.success).toBe(true);

      const output = result.output as { jobs: unknown[]; totalCount: number };
      expect(output.jobs).toBeInstanceOf(Array);
      expect(output.totalCount).toBeGreaterThan(0);
    });
  });

  describe('DESTRUCTIVE operations', () => {
    it('should block triggerSync without approval', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000006',
        tenantId: 'test-tenant',
        toolName: 'airbyte.triggerSync',
        input: { connectionId: '11111111-1111-1111-1111-111111111111' },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('POLICY_DENIED');
    });

    it('should block cancelJob without approval', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000007',
        tenantId: 'test-tenant',
        toolName: 'airbyte.cancelJob',
        input: { jobId: 'job-001' },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('POLICY_DENIED');
    });
  });

  describe('validation errors', () => {
    it('should reject invalid connectionId format', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000008',
        tenantId: 'test-tenant',
        toolName: 'airbyte.getConnection',
        input: { connectionId: 'not-a-uuid' },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required fields', async () => {
      const result = await invokeTool(registry, {
        runId: '00000000-0000-0000-0000-000000000009',
        tenantId: 'test-tenant',
        toolName: 'airbyte.listConnections',
        input: {},
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });
  });
});

// =============================================================================
// Mock Client Tests
// =============================================================================

describe('MockAirbyteClient', () => {
  let client: MockAirbyteClient;

  beforeEach(() => {
    client = new MockAirbyteClient();
  });

  it('should have default mock data', async () => {
    const connections = await client.listConnections('any-workspace');
    expect(connections.totalCount).toBe(2);
  });

  it('should allow adding custom connections', async () => {
    client.addConnection({
      connectionId: '33333333-3333-3333-3333-333333333333',
      name: 'Custom Connection',
      sourceId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      sourceName: 'Custom Source',
      destinationId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      destinationName: 'Custom Destination',
      status: 'active',
      scheduleType: 'manual',
      scheduleData: null,
      createdAt: new Date().toISOString(),
      lastSyncAt: null,
    });

    const connection = await client.getConnection('33333333-3333-3333-3333-333333333333');
    expect(connection.name).toBe('Custom Connection');
  });

  it('should throw for unknown connection', async () => {
    await expect(
      client.getConnection('99999999-9999-9999-9999-999999999999')
    ).rejects.toThrow('Connection not found');
  });

  it('should trigger sync and update status', async () => {
    const result = await client.triggerSync('11111111-1111-1111-1111-111111111111');
    expect(result.status).toBe('pending');

    const status = await client.getSyncStatus('11111111-1111-1111-1111-111111111111');
    expect(status.isRunning).toBe(true);
    expect(status.lastJobStatus).toBe('pending');
  });

  it('should cancel job and update status', async () => {
    // First trigger a sync
    const triggerResult = await client.triggerSync('11111111-1111-1111-1111-111111111111');

    // Then cancel it
    const cancelResult = await client.cancelJob(triggerResult.jobId);
    expect(cancelResult.status).toBe('cancelled');

    const status = await client.getSyncStatus('11111111-1111-1111-1111-111111111111');
    expect(status.isRunning).toBe(false);
    expect(status.lastJobStatus).toBe('cancelled');
  });
});
