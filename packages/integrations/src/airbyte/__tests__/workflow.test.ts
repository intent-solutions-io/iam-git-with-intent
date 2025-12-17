/**
 * Airbyte Workflow Tests
 *
 * Phase 4: Tests for Airbyte sync status workflow.
 *
 * @module @gwi/integrations/airbyte/__tests__/workflow.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runSyncStatusWorkflow,
  SyncStatusWorkflowTemplate,
  type SyncStatusWorkflowInput,
} from '../workflow.js';
import { AirbyteConnector, MockAirbyteClient } from '../connector.js';
import { DefaultConnectorRegistry } from '@gwi/core';

// =============================================================================
// Workflow Tests
// =============================================================================

describe('runSyncStatusWorkflow', () => {
  let registry: DefaultConnectorRegistry;
  let mockClient: MockAirbyteClient;

  beforeEach(() => {
    mockClient = new MockAirbyteClient();
    registry = new DefaultConnectorRegistry();
    registry.register(new AirbyteConnector({ client: mockClient }));
  });

  describe('healthy connection', () => {
    it('should return success for healthy connection', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000001',
        tenantId: 'test-tenant',
        connectionId: '11111111-1111-1111-1111-111111111111',
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.success).toBe(true);
      expect(result.connectionName).toBe('Postgres to Snowflake');
      expect(result.syncStatus.isHealthy).toBe(true);
      expect(result.syncStatus.hasError).toBe(false);
      expect(result.incident).toBeNull();
      expect(result.notifications).toHaveLength(0);
    });

    it('should include sync metrics', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000002',
        tenantId: 'test-tenant',
        connectionId: '11111111-1111-1111-1111-111111111111',
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.syncStatus.recordsSynced).toBe(15000);
      expect(result.syncStatus.bytesSynced).toBe(5242880);
      expect(result.syncStatus.lastJobStatus).toBe('succeeded');
    });
  });

  describe('failed connection', () => {
    it('should create incident for failed connection', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000003',
        tenantId: 'test-tenant',
        connectionId: '22222222-2222-2222-2222-222222222222',
        createIncidentOnFailure: true,
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.success).toBe(true);
      expect(result.syncStatus.isHealthy).toBe(false);
      expect(result.syncStatus.hasError).toBe(true);
      expect(result.incident).not.toBeNull();
      expect(result.incident?.severity).toBe('high'); // timeout errors are high
      expect(result.incident?.connectionName).toBe('Stripe to BigQuery');
    });

    it('should include error message in incident', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000004',
        tenantId: 'test-tenant',
        connectionId: '22222222-2222-2222-2222-222222222222',
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.incident?.errorMessage).toContain('Connection timeout');
      expect(result.incident?.suggestedActions).toContain(
        'Check network connectivity to source/destination'
      );
    });

    it('should create notifications for failed connection', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000005',
        tenantId: 'test-tenant',
        connectionId: '22222222-2222-2222-2222-222222222222',
        notifyOnFailure: true,
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.notifications.length).toBeGreaterThan(0);

      const slackNotif = result.notifications.find(n => n.channel === 'slack');
      expect(slackNotif).toBeDefined();
      expect(slackNotif?.message).toContain('HIGH');

      const pagerdutyNotif = result.notifications.find(n => n.channel === 'pagerduty');
      expect(pagerdutyNotif).toBeDefined(); // High severity triggers PagerDuty
    });
  });

  describe('options', () => {
    it('should skip incident creation when disabled', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000006',
        tenantId: 'test-tenant',
        connectionId: '22222222-2222-2222-2222-222222222222',
        createIncidentOnFailure: false,
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.syncStatus.isHealthy).toBe(false);
      expect(result.incident).toBeNull();
    });

    it('should skip notifications when disabled', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000007',
        tenantId: 'test-tenant',
        connectionId: '22222222-2222-2222-2222-222222222222',
        notifyOnFailure: false,
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.notifications).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle unknown connection', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000008',
        tenantId: 'test-tenant',
        connectionId: '99999999-9999-9999-9999-999999999999',
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.success).toBe(false);
      expect(result.syncStatus.hasError).toBe(true);
      expect(result.syncStatus.errorMessage).toContain('Connection not found');
    });

    it('should track workflow duration', async () => {
      const input: SyncStatusWorkflowInput = {
        runId: '00000000-0000-0000-0000-000000000009',
        tenantId: 'test-tenant',
        connectionId: '11111111-1111-1111-1111-111111111111',
      };

      const result = await runSyncStatusWorkflow(input, { registry });

      expect(result.workflowDurationMs).toBeDefined();
      expect(result.workflowDurationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// Workflow Template Tests
// =============================================================================

describe('SyncStatusWorkflowTemplate', () => {
  it('should have correct metadata', () => {
    expect(SyncStatusWorkflowTemplate.id).toBe('airbyte.sync-status-check');
    expect(SyncStatusWorkflowTemplate.version).toBe('1.0.0');
    expect(SyncStatusWorkflowTemplate.connectors).toContain('airbyte');
  });

  it('should define workflow steps', () => {
    expect(SyncStatusWorkflowTemplate.steps).toHaveLength(4);
    expect(SyncStatusWorkflowTemplate.steps[0].name).toBe('getConnection');
    expect(SyncStatusWorkflowTemplate.steps[1].name).toBe('getSyncStatus');
    expect(SyncStatusWorkflowTemplate.steps[2].name).toBe('createIncident');
    expect(SyncStatusWorkflowTemplate.steps[3].name).toBe('notify');
  });

  it('should have execute function', () => {
    expect(SyncStatusWorkflowTemplate.execute).toBe(runSyncStatusWorkflow);
  });

  it('should have input schema', () => {
    const validInput = {
      runId: '00000000-0000-0000-0000-000000000010',
      tenantId: 'test',
      connectionId: '11111111-1111-1111-1111-111111111111',
    };

    const result = SyncStatusWorkflowTemplate.inputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject invalid input', () => {
    const invalidInput = {
      runId: 'not-a-uuid',
      tenantId: 'test',
      connectionId: '11111111-1111-1111-1111-111111111111',
    };

    const result = SyncStatusWorkflowTemplate.inputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Incident Severity Tests
// =============================================================================

describe('Incident severity determination', () => {
  let registry: DefaultConnectorRegistry;
  let mockClient: MockAirbyteClient;

  beforeEach(() => {
    mockClient = new MockAirbyteClient();
    registry = new DefaultConnectorRegistry();
    registry.register(new AirbyteConnector({ client: mockClient }));
  });

  it('should assign high severity for timeout errors', async () => {
    mockClient.setSyncStatus('11111111-1111-1111-1111-111111111111', {
      connectionId: '11111111-1111-1111-1111-111111111111',
      lastJobId: 'job-test',
      lastJobStatus: 'failed',
      lastJobType: 'sync',
      lastSyncStartedAt: new Date().toISOString(),
      lastSyncCompletedAt: new Date().toISOString(),
      recordsSynced: null,
      bytesSynced: null,
      isRunning: false,
      hasError: true,
      errorMessage: 'Connection timeout after 30 seconds',
    });

    const result = await runSyncStatusWorkflow({
      runId: '00000000-0000-0000-0000-000000000011',
      tenantId: 'test',
      connectionId: '11111111-1111-1111-1111-111111111111',
    }, { registry });

    expect(result.incident?.severity).toBe('high');
  });

  it('should assign medium severity for rate limit errors', async () => {
    mockClient.setSyncStatus('11111111-1111-1111-1111-111111111111', {
      connectionId: '11111111-1111-1111-1111-111111111111',
      lastJobId: 'job-test',
      lastJobStatus: 'failed',
      lastJobType: 'sync',
      lastSyncStartedAt: new Date().toISOString(),
      lastSyncCompletedAt: new Date().toISOString(),
      recordsSynced: null,
      bytesSynced: null,
      isRunning: false,
      hasError: true,
      errorMessage: 'Rate limit exceeded',
    });

    const result = await runSyncStatusWorkflow({
      runId: '00000000-0000-0000-0000-000000000012',
      tenantId: 'test',
      connectionId: '11111111-1111-1111-1111-111111111111',
    }, { registry });

    expect(result.incident?.severity).toBe('medium');
  });

  it('should assign critical severity for permission errors', async () => {
    mockClient.setSyncStatus('11111111-1111-1111-1111-111111111111', {
      connectionId: '11111111-1111-1111-1111-111111111111',
      lastJobId: 'job-test',
      lastJobStatus: 'failed',
      lastJobType: 'sync',
      lastSyncStartedAt: new Date().toISOString(),
      lastSyncCompletedAt: new Date().toISOString(),
      recordsSynced: null,
      bytesSynced: null,
      isRunning: false,
      hasError: true,
      errorMessage: 'Permission denied: unauthorized access',
    });

    const result = await runSyncStatusWorkflow({
      runId: '00000000-0000-0000-0000-000000000013',
      tenantId: 'test',
      connectionId: '11111111-1111-1111-1111-111111111111',
    }, { registry });

    expect(result.incident?.severity).toBe('critical');
  });
});
