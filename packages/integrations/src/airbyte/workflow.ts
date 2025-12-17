/**
 * Airbyte Sync Status Workflow
 *
 * Phase 4: End-to-end workflow using the Airbyte connector.
 *
 * Workflow: sync status → detect failure → create incident artifact → notify placeholder
 *
 * This workflow demonstrates:
 * - Using the connector SDK invokeTool() pipeline
 * - Creating workflow artifacts
 * - Handling sync failures with incident creation
 * - Placeholder for notifications (Slack/email)
 *
 * @module @gwi/integrations/airbyte/workflow
 */

import { z } from 'zod';
import {
  invokeTool,
  DefaultConnectorRegistry,
  type ConnectorRegistry,
} from '@gwi/core';
import { AirbyteConnector, type AirbyteConnectorConfig } from './connector.js';

// =============================================================================
// Workflow Input/Output Schemas
// =============================================================================

/**
 * Input for sync status check workflow
 */
export const SyncStatusWorkflowInput = z.object({
  runId: z.string().uuid().describe('Run ID for audit trail'),
  tenantId: z.string().describe('Tenant ID'),
  connectionId: z.string().uuid().describe('Airbyte connection ID to check'),
  createIncidentOnFailure: z.boolean().optional().default(true),
  notifyOnFailure: z.boolean().optional().default(true),
});

export type SyncStatusWorkflowInput = z.infer<typeof SyncStatusWorkflowInput>;

/**
 * Incident artifact created when sync fails
 */
export const IncidentArtifact = z.object({
  incidentId: z.string(),
  connectionId: z.string().uuid(),
  connectionName: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
  errorMessage: z.string().nullable(),
  lastJobId: z.string().nullable(),
  failedAt: z.string().datetime(),
  suggestedActions: z.array(z.string()),
});

export type IncidentArtifact = z.infer<typeof IncidentArtifact>;

/**
 * Notification placeholder (would be replaced with real Slack/email)
 */
export const NotificationPlaceholder = z.object({
  channel: z.enum(['slack', 'email', 'pagerduty']),
  sent: z.boolean(),
  message: z.string(),
  timestamp: z.string().datetime(),
});

export type NotificationPlaceholder = z.infer<typeof NotificationPlaceholder>;

/**
 * Output of sync status check workflow
 */
export const SyncStatusWorkflowOutput = z.object({
  success: z.boolean(),
  connectionId: z.string().uuid(),
  connectionName: z.string(),
  syncStatus: z.object({
    isHealthy: z.boolean(),
    lastJobStatus: z.string().nullable(),
    isRunning: z.boolean(),
    hasError: z.boolean(),
    errorMessage: z.string().nullable(),
    recordsSynced: z.number().nullable(),
    bytesSynced: z.number().nullable(),
  }),
  incident: IncidentArtifact.nullable(),
  notifications: z.array(NotificationPlaceholder),
  workflowDurationMs: z.number(),
});

export type SyncStatusWorkflowOutput = z.infer<typeof SyncStatusWorkflowOutput>;

// =============================================================================
// Workflow Implementation
// =============================================================================

/**
 * Workflow context for sync status check
 */
export interface SyncStatusWorkflowContext {
  registry?: ConnectorRegistry;
  airbyteConfig?: AirbyteConnectorConfig;
}

/**
 * Determine incident severity based on failure patterns
 */
function determineSeverity(
  errorMessage: string | null,
  consecutiveFailures: number
): 'low' | 'medium' | 'high' | 'critical' {
  if (consecutiveFailures >= 5) return 'critical';
  if (consecutiveFailures >= 3) return 'high';

  if (errorMessage) {
    const msg = errorMessage.toLowerCase();
    if (msg.includes('timeout') || msg.includes('connection refused')) {
      return 'high';
    }
    if (msg.includes('rate limit') || msg.includes('quota')) {
      return 'medium';
    }
    if (msg.includes('permission') || msg.includes('unauthorized')) {
      return 'critical';
    }
  }

  return 'medium';
}

/**
 * Generate suggested actions based on error type
 */
function generateSuggestedActions(errorMessage: string | null): string[] {
  const actions: string[] = [];

  if (!errorMessage) {
    actions.push('Review job logs for detailed error information');
    actions.push('Check Airbyte connection configuration');
    return actions;
  }

  const msg = errorMessage.toLowerCase();

  if (msg.includes('timeout') || msg.includes('connection refused')) {
    actions.push('Check network connectivity to source/destination');
    actions.push('Verify firewall rules allow Airbyte traffic');
    actions.push('Check if source/destination service is healthy');
  }

  if (msg.includes('rate limit') || msg.includes('quota')) {
    actions.push('Review API rate limits for the source connector');
    actions.push('Consider adjusting sync schedule to reduce frequency');
    actions.push('Check if quota increases are available');
  }

  if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('authentication')) {
    actions.push('Verify credentials are still valid');
    actions.push('Check if API keys need rotation');
    actions.push('Review permission scopes for the connection');
  }

  if (msg.includes('schema') || msg.includes('type mismatch')) {
    actions.push('Review source schema changes');
    actions.push('Consider running a reset to resync schema');
    actions.push('Check destination compatibility');
  }

  if (actions.length === 0) {
    actions.push('Review Airbyte job logs for detailed error');
    actions.push('Check Airbyte connector documentation');
    actions.push('Consider reaching out to Airbyte support');
  }

  return actions;
}

/**
 * Create incident artifact from sync failure
 */
function createIncident(
  connectionId: string,
  connectionName: string,
  errorMessage: string | null,
  lastJobId: string | null
): IncidentArtifact {
  const severity = determineSeverity(errorMessage, 1);
  const suggestedActions = generateSuggestedActions(errorMessage);

  return {
    incidentId: `INC-${Date.now()}-${connectionId.slice(0, 8)}`,
    connectionId,
    connectionName,
    severity,
    title: `Airbyte Sync Failure: ${connectionName}`,
    description: `The Airbyte connection "${connectionName}" has failed to sync. ${
      errorMessage ? `Error: ${errorMessage}` : 'No error message available.'
    }`,
    errorMessage,
    lastJobId,
    failedAt: new Date().toISOString(),
    suggestedActions,
  };
}

/**
 * Create notification placeholder
 *
 * In a real implementation, this would send to Slack/email/PagerDuty.
 * For Phase 4, we create a placeholder to show the notification pattern.
 */
function createNotificationPlaceholder(
  channel: 'slack' | 'email' | 'pagerduty',
  incident: IncidentArtifact
): NotificationPlaceholder {
  const channelMessages = {
    slack: `[${incident.severity.toUpperCase()}] ${incident.title}\n${incident.description}\nActions: ${incident.suggestedActions.slice(0, 2).join(', ')}`,
    email: `Subject: [Airbyte Alert] ${incident.title}\n\n${incident.description}\n\nSeverity: ${incident.severity}\nSuggested Actions:\n${incident.suggestedActions.map(a => `- ${a}`).join('\n')}`,
    pagerduty: `[${incident.severity.toUpperCase()}] ${incident.connectionName} sync failed: ${incident.errorMessage ?? 'Unknown error'}`,
  };

  return {
    channel,
    sent: false, // Would be true after real API call
    message: channelMessages[channel],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run the sync status check workflow
 *
 * This workflow:
 * 1. Gets the connection details
 * 2. Checks the sync status
 * 3. If failed, creates an incident artifact
 * 4. Creates notification placeholders (Slack/email)
 * 5. Returns comprehensive status
 *
 * @param input - Workflow input
 * @param ctx - Optional workflow context
 * @returns Workflow output with status, incident, and notifications
 */
export async function runSyncStatusWorkflow(
  input: SyncStatusWorkflowInput,
  ctx?: SyncStatusWorkflowContext
): Promise<SyncStatusWorkflowOutput> {
  const startTime = Date.now();
  const validated = SyncStatusWorkflowInput.parse(input);

  // Set up registry with Airbyte connector
  const registry = ctx?.registry ?? new DefaultConnectorRegistry();
  if (!ctx?.registry) {
    const connector = new AirbyteConnector(ctx?.airbyteConfig);
    registry.register(connector);
  }

  // Step 1: Get connection details
  const connectionResult = await invokeTool(registry, {
    runId: validated.runId,
    tenantId: validated.tenantId,
    toolName: 'airbyte.getConnection',
    input: { connectionId: validated.connectionId },
  });

  if (!connectionResult.success) {
    return {
      success: false,
      connectionId: validated.connectionId,
      connectionName: 'Unknown',
      syncStatus: {
        isHealthy: false,
        lastJobStatus: null,
        isRunning: false,
        hasError: true,
        errorMessage: connectionResult.error ?? 'Failed to get connection',
        recordsSynced: null,
        bytesSynced: null,
      },
      incident: null,
      notifications: [],
      workflowDurationMs: Date.now() - startTime,
    };
  }

  const connection = connectionResult.output as {
    connectionId: string;
    name: string;
  };

  // Step 2: Get sync status
  const statusResult = await invokeTool(registry, {
    runId: validated.runId,
    tenantId: validated.tenantId,
    toolName: 'airbyte.getSyncStatus',
    input: { connectionId: validated.connectionId },
  });

  if (!statusResult.success) {
    return {
      success: false,
      connectionId: validated.connectionId,
      connectionName: connection.name,
      syncStatus: {
        isHealthy: false,
        lastJobStatus: null,
        isRunning: false,
        hasError: true,
        errorMessage: statusResult.error ?? 'Failed to get sync status',
        recordsSynced: null,
        bytesSynced: null,
      },
      incident: null,
      notifications: [],
      workflowDurationMs: Date.now() - startTime,
    };
  }

  const syncStatus = statusResult.output as {
    lastJobStatus: string | null;
    isRunning: boolean;
    hasError: boolean;
    errorMessage: string | null;
    recordsSynced: number | null;
    bytesSynced: number | null;
    lastJobId: string | null;
  };

  const isHealthy = !syncStatus.hasError && syncStatus.lastJobStatus !== 'failed';

  // Step 3: Create incident if failed and requested
  let incident: IncidentArtifact | null = null;
  const notifications: NotificationPlaceholder[] = [];

  if (!isHealthy && validated.createIncidentOnFailure) {
    incident = createIncident(
      validated.connectionId,
      connection.name,
      syncStatus.errorMessage,
      syncStatus.lastJobId
    );

    // Step 4: Create notification placeholders if requested
    if (validated.notifyOnFailure) {
      notifications.push(createNotificationPlaceholder('slack', incident));

      if (incident.severity === 'critical' || incident.severity === 'high') {
        notifications.push(createNotificationPlaceholder('pagerduty', incident));
      }

      notifications.push(createNotificationPlaceholder('email', incident));
    }
  }

  return {
    success: true,
    connectionId: validated.connectionId,
    connectionName: connection.name,
    syncStatus: {
      isHealthy,
      lastJobStatus: syncStatus.lastJobStatus,
      isRunning: syncStatus.isRunning,
      hasError: syncStatus.hasError,
      errorMessage: syncStatus.errorMessage,
      recordsSynced: syncStatus.recordsSynced,
      bytesSynced: syncStatus.bytesSynced,
    },
    incident,
    notifications,
    workflowDurationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Workflow Template Definition
// =============================================================================

/**
 * Workflow template metadata
 *
 * This can be used by a workflow registry to discover and execute workflows.
 */
export const SyncStatusWorkflowTemplate = {
  id: 'airbyte.sync-status-check',
  name: 'Airbyte Sync Status Check',
  description: 'Check Airbyte connection sync status, detect failures, and create incident artifacts',
  version: '1.0.0',
  inputSchema: SyncStatusWorkflowInput,
  outputSchema: SyncStatusWorkflowOutput,
  connectors: ['airbyte'],
  steps: [
    { name: 'getConnection', tool: 'airbyte.getConnection', description: 'Get connection details' },
    { name: 'getSyncStatus', tool: 'airbyte.getSyncStatus', description: 'Check sync status' },
    { name: 'createIncident', description: 'Create incident artifact if failed' },
    { name: 'notify', description: 'Send notifications (placeholder)' },
  ],
  execute: runSyncStatusWorkflow,
};
