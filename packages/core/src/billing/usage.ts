/**
 * Usage Metering Module for Git With Intent
 *
 * Phase 22: Metering + Billing + Plan Limits
 *
 * Provides:
 * - Extended usage event types
 * - Usage aggregation utilities
 * - Metering store interface extensions
 *
 * @module @gwi/core/billing/usage
 */

import { type MeteredResource } from './entitlements.js';

// =============================================================================
// Extended Usage Event Types
// =============================================================================

/**
 * Extended usage event types for Phase 22 metering
 *
 * These extend the base UsageEventType from billing/index.ts
 */
export type ExtendedUsageEventType =
  // Run events
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  // Signal events
  | 'signal_ingested'
  | 'signal_processed'
  // Candidate events
  | 'candidate_generated'
  | 'candidate_accepted'
  | 'candidate_rejected'
  // PR events
  | 'pr_opened'
  | 'pr_merged'
  | 'pr_closed'
  // Connector events
  | 'connector_installed'
  | 'connector_uninstalled'
  | 'connector_invoked'
  // API events
  | 'api_call'
  | 'api_call_authenticated'
  | 'api_call_anonymous'
  // Token events
  | 'tokens_used'
  | 'tokens_input'
  | 'tokens_output'
  // Storage events
  | 'storage_allocated'
  | 'storage_released'
  // Notification events
  | 'notification_sent'
  | 'notification_delivered'
  | 'notification_failed'
  // Webhook events
  | 'webhook_received'
  | 'webhook_processed'
  | 'webhook_failed';

/**
 * Extended usage event with all metering fields
 */
export interface ExtendedUsageEvent {
  /** Unique event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Event type */
  type: ExtendedUsageEventType;

  /** Quantity (runs, tokens, bytes, etc.) */
  quantity: number;

  /** Unit of measurement */
  unit: UsageUnit;

  /** Related resource ID (run ID, PR ID, etc.) */
  resourceId?: string;

  /** Related resource type */
  resourceType?: string;

  /** Event timestamp */
  timestamp: Date;

  /** Date key for daily aggregation (YYYY-MM-DD) */
  dateKey: string;

  /** Period key for monthly aggregation (YYYY-MM) */
  periodKey: string;

  /** Whether this event has been invoiced */
  invoiced: boolean;

  /** Invoice ID if invoiced */
  invoiceId?: string;

  /** User who triggered the event (if applicable) */
  userId?: string;

  /** IP address (for audit) */
  ipAddress?: string;

  /** Additional metadata */
  metadata?: Record<string, string | number | boolean>;

  /** Event created at */
  createdAt: Date;
}

/**
 * Units of measurement for usage
 */
export type UsageUnit =
  | 'count' // Generic count (runs, PRs, etc.)
  | 'tokens' // LLM tokens
  | 'bytes' // Storage
  | 'milliseconds' // Time
  | 'requests'; // API requests

// =============================================================================
// Usage Aggregate Types
// =============================================================================

/**
 * Daily usage aggregate for a tenant
 */
export interface DailyUsageAggregate {
  /** Tenant ID */
  tenantId: string;

  /** Date key (YYYY-MM-DD) */
  dateKey: string;

  /** Counters by event type */
  counters: {
    // Runs
    runsStarted: number;
    runsCompleted: number;
    runsFailed: number;

    // Signals
    signalsIngested: number;
    signalsProcessed: number;

    // Candidates
    candidatesGenerated: number;
    candidatesAccepted: number;
    candidatesRejected: number;

    // PRs
    prsOpened: number;
    prsMerged: number;
    prsClosed: number;

    // API
    apiCalls: number;
    apiCallsAuthenticated: number;
    apiCallsAnonymous: number;

    // Tokens
    tokensUsed: number;
    tokensInput: number;
    tokensOutput: number;

    // Storage (high water mark for the day)
    storageBytesUsed: number;

    // Notifications
    notificationsSent: number;
    notificationsDelivered: number;
    notificationsFailed: number;

    // Webhooks
    webhooksReceived: number;
    webhooksProcessed: number;
    webhooksFailed: number;

    // Connectors
    connectorInvocations: number;
  };

  /** First event timestamp of the day */
  firstEventAt: Date;

  /** Last event timestamp of the day */
  lastEventAt: Date;

  /** When this aggregate was last updated */
  updatedAt: Date;
}

/**
 * Monthly usage aggregate for a tenant
 */
export interface MonthlyUsageAggregate {
  /** Tenant ID */
  tenantId: string;

  /** Period key (YYYY-MM) */
  periodKey: string;

  /** Counters by event type */
  counters: {
    // Runs
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;

    // Signals
    totalSignals: number;

    // Candidates
    totalCandidates: number;
    acceptedCandidates: number;

    // PRs
    totalPRsOpened: number;
    totalPRsMerged: number;

    // Connectors
    totalConnectorInstalls: number;
    totalConnectorUninstalls: number;
    totalConnectorInvocations: number;

    // API
    totalApiCalls: number;

    // Tokens
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;

    // Storage (peak for the month)
    peakStorageBytes: number;

    // Notifications
    totalNotifications: number;

    // Webhooks
    totalWebhooks: number;
  };

  /** Number of active days */
  activeDays: number;

  /** When this aggregate was created */
  createdAt: Date;

  /** When this aggregate was last updated */
  updatedAt: Date;
}

// =============================================================================
// Usage Event Factory Functions
// =============================================================================

/**
 * Create a usage event with defaults
 */
export function createUsageEvent(
  tenantId: string,
  type: ExtendedUsageEventType,
  quantity: number,
  options?: {
    unit?: UsageUnit;
    resourceId?: string;
    resourceType?: string;
    userId?: string;
    ipAddress?: string;
    metadata?: Record<string, string | number | boolean>;
  }
): Omit<ExtendedUsageEvent, 'id'> {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0];
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Infer unit from event type
  let unit: UsageUnit = options?.unit ?? 'count';
  if (type.startsWith('tokens_')) unit = 'tokens';
  if (type.startsWith('storage_')) unit = 'bytes';
  if (type.startsWith('api_')) unit = 'requests';

  return {
    tenantId,
    type,
    quantity,
    unit,
    resourceId: options?.resourceId,
    resourceType: options?.resourceType,
    timestamp: now,
    dateKey,
    periodKey,
    invoiced: false,
    userId: options?.userId,
    ipAddress: options?.ipAddress,
    metadata: options?.metadata,
    createdAt: now,
  };
}

/**
 * Create a run started event
 */
export function createRunStartedEvent(
  tenantId: string,
  runId: string,
  userId?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'run_started', 1, {
    resourceId: runId,
    resourceType: 'run',
    userId,
  });
}

/**
 * Create a run completed event
 */
export function createRunCompletedEvent(
  tenantId: string,
  runId: string,
  durationMs: number,
  userId?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'run_completed', 1, {
    resourceId: runId,
    resourceType: 'run',
    userId,
    metadata: { durationMs },
  });
}

/**
 * Create a tokens used event
 */
export function createTokensUsedEvent(
  tenantId: string,
  inputTokens: number,
  outputTokens: number,
  runId?: string,
  modelId?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'tokens_used', inputTokens + outputTokens, {
    unit: 'tokens',
    resourceId: runId,
    resourceType: 'run',
    metadata: {
      inputTokens,
      outputTokens,
      ...(modelId && { modelId }),
    },
  });
}

/**
 * Create an API call event
 */
export function createApiCallEvent(
  tenantId: string,
  endpoint: string,
  authenticated: boolean,
  userId?: string,
  ipAddress?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(
    tenantId,
    authenticated ? 'api_call_authenticated' : 'api_call_anonymous',
    1,
    {
      unit: 'requests',
      userId,
      ipAddress,
      metadata: { endpoint },
    }
  );
}

/**
 * Create a signal ingested event
 */
export function createSignalIngestedEvent(
  tenantId: string,
  signalType: string,
  sourceId?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'signal_ingested', 1, {
    resourceId: sourceId,
    resourceType: 'signal',
    metadata: { signalType },
  });
}

/**
 * Create a candidate generated event
 */
export function createCandidateGeneratedEvent(
  tenantId: string,
  runId: string,
  candidateType: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'candidate_generated', 1, {
    resourceId: runId,
    resourceType: 'candidate',
    metadata: { candidateType },
  });
}

/**
 * Create a PR opened event
 */
export function createPROpenedEvent(
  tenantId: string,
  prUrl: string,
  runId?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'pr_opened', 1, {
    resourceId: runId,
    resourceType: 'pr',
    metadata: { prUrl },
  });
}

/**
 * Create a notification sent event
 */
export function createNotificationSentEvent(
  tenantId: string,
  channel: 'email' | 'slack' | 'webhook',
  userId?: string
): Omit<ExtendedUsageEvent, 'id'> {
  return createUsageEvent(tenantId, 'notification_sent', 1, {
    userId,
    metadata: { channel },
  });
}

// =============================================================================
// Aggregate Update Functions
// =============================================================================

/**
 * Create an empty daily aggregate
 */
export function createEmptyDailyAggregate(tenantId: string, dateKey: string): DailyUsageAggregate {
  const now = new Date();
  return {
    tenantId,
    dateKey,
    counters: {
      runsStarted: 0,
      runsCompleted: 0,
      runsFailed: 0,
      signalsIngested: 0,
      signalsProcessed: 0,
      candidatesGenerated: 0,
      candidatesAccepted: 0,
      candidatesRejected: 0,
      prsOpened: 0,
      prsMerged: 0,
      prsClosed: 0,
      apiCalls: 0,
      apiCallsAuthenticated: 0,
      apiCallsAnonymous: 0,
      tokensUsed: 0,
      tokensInput: 0,
      tokensOutput: 0,
      storageBytesUsed: 0,
      notificationsSent: 0,
      notificationsDelivered: 0,
      notificationsFailed: 0,
      webhooksReceived: 0,
      webhooksProcessed: 0,
      webhooksFailed: 0,
      connectorInvocations: 0,
    },
    firstEventAt: now,
    lastEventAt: now,
    updatedAt: now,
  };
}

/**
 * Create an empty monthly aggregate
 */
export function createEmptyMonthlyAggregate(
  tenantId: string,
  periodKey: string
): MonthlyUsageAggregate {
  const now = new Date();
  return {
    tenantId,
    periodKey,
    counters: {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalSignals: 0,
      totalCandidates: 0,
      acceptedCandidates: 0,
      totalPRsOpened: 0,
      totalPRsMerged: 0,
      totalConnectorInstalls: 0,
      totalConnectorUninstalls: 0,
      totalConnectorInvocations: 0,
      totalApiCalls: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      peakStorageBytes: 0,
      totalNotifications: 0,
      totalWebhooks: 0,
    },
    activeDays: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update daily aggregate with a new event
 */
export function updateDailyAggregate(
  aggregate: DailyUsageAggregate,
  event: ExtendedUsageEvent
): DailyUsageAggregate {
  const updated = { ...aggregate };
  updated.lastEventAt = event.timestamp;
  updated.updatedAt = new Date();

  switch (event.type) {
    case 'run_started':
      updated.counters.runsStarted += event.quantity;
      break;
    case 'run_completed':
      updated.counters.runsCompleted += event.quantity;
      break;
    case 'run_failed':
      updated.counters.runsFailed += event.quantity;
      break;
    case 'signal_ingested':
      updated.counters.signalsIngested += event.quantity;
      break;
    case 'signal_processed':
      updated.counters.signalsProcessed += event.quantity;
      break;
    case 'candidate_generated':
      updated.counters.candidatesGenerated += event.quantity;
      break;
    case 'candidate_accepted':
      updated.counters.candidatesAccepted += event.quantity;
      break;
    case 'candidate_rejected':
      updated.counters.candidatesRejected += event.quantity;
      break;
    case 'pr_opened':
      updated.counters.prsOpened += event.quantity;
      break;
    case 'pr_merged':
      updated.counters.prsMerged += event.quantity;
      break;
    case 'pr_closed':
      updated.counters.prsClosed += event.quantity;
      break;
    case 'api_call':
      updated.counters.apiCalls += event.quantity;
      break;
    case 'api_call_authenticated':
      updated.counters.apiCalls += event.quantity;
      updated.counters.apiCallsAuthenticated += event.quantity;
      break;
    case 'api_call_anonymous':
      updated.counters.apiCalls += event.quantity;
      updated.counters.apiCallsAnonymous += event.quantity;
      break;
    case 'tokens_used':
      updated.counters.tokensUsed += event.quantity;
      if (event.metadata?.inputTokens) {
        updated.counters.tokensInput += Number(event.metadata.inputTokens);
      }
      if (event.metadata?.outputTokens) {
        updated.counters.tokensOutput += Number(event.metadata.outputTokens);
      }
      break;
    case 'tokens_input':
      updated.counters.tokensInput += event.quantity;
      updated.counters.tokensUsed += event.quantity;
      break;
    case 'tokens_output':
      updated.counters.tokensOutput += event.quantity;
      updated.counters.tokensUsed += event.quantity;
      break;
    case 'storage_allocated':
      updated.counters.storageBytesUsed = Math.max(
        updated.counters.storageBytesUsed,
        event.quantity
      );
      break;
    case 'notification_sent':
      updated.counters.notificationsSent += event.quantity;
      break;
    case 'notification_delivered':
      updated.counters.notificationsDelivered += event.quantity;
      break;
    case 'notification_failed':
      updated.counters.notificationsFailed += event.quantity;
      break;
    case 'webhook_received':
      updated.counters.webhooksReceived += event.quantity;
      break;
    case 'webhook_processed':
      updated.counters.webhooksProcessed += event.quantity;
      break;
    case 'webhook_failed':
      updated.counters.webhooksFailed += event.quantity;
      break;
    case 'connector_invoked':
      updated.counters.connectorInvocations += event.quantity;
      break;
  }

  return updated;
}

/**
 * Map metered resource to daily aggregate counter
 */
export function getAggregateCounterForResource(
  aggregate: DailyUsageAggregate,
  resource: MeteredResource
): number {
  switch (resource) {
    case 'runs_daily':
      return aggregate.counters.runsStarted;
    case 'signals_daily':
      return aggregate.counters.signalsIngested;
    case 'candidates_daily':
      return aggregate.counters.candidatesGenerated;
    case 'api_calls_daily':
      return aggregate.counters.apiCalls;
    case 'notifications_daily':
      return aggregate.counters.notificationsSent;
    default:
      return 0;
  }
}
