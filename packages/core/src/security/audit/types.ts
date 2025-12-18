/**
 * Audit Event Types
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Defines audit event types and structures for security-focused logging.
 * All events include Phase 23 telemetry correlation.
 *
 * @module @gwi/core/security/audit/types
 */

// =============================================================================
// Security Audit Event Types
// =============================================================================

/**
 * Security audit event types
 */
export type SecurityAuditEventType =
  // Authentication events
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.token.refresh'
  | 'auth.token.revoked'

  // RBAC events
  | 'rbac.check.allowed'
  | 'rbac.check.denied'
  | 'rbac.role.assigned'
  | 'rbac.role.changed'
  | 'rbac.role.removed'

  // Webhook events
  | 'webhook.received'
  | 'webhook.verify.success'
  | 'webhook.verify.failure'
  | 'webhook.processed'
  | 'webhook.failed'

  // Queue events
  | 'queue.job.enqueued'
  | 'queue.job.started'
  | 'queue.job.completed'
  | 'queue.job.failed'
  | 'queue.job.dlq'

  // Candidate events
  | 'candidate.generated'
  | 'candidate.awaiting_approval'
  | 'candidate.approved'
  | 'candidate.rejected'
  | 'candidate.executed'
  | 'candidate.expired'

  // Git operation events (high-risk)
  | 'git.branch.created'
  | 'git.push.executed'
  | 'git.pr.opened'
  | 'git.pr.merged'
  | 'git.pr.closed'

  // Connector events
  | 'connector.installed'
  | 'connector.uninstalled'
  | 'connector.updated'
  | 'connector.invoked'
  | 'connector.failed'

  // Registry events
  | 'registry.package.published'
  | 'registry.package.updated'
  | 'registry.signature.verified'
  | 'registry.signature.failed'

  // Plan limit events
  | 'plan.limit.checked'
  | 'plan.limit.exceeded'
  | 'plan.limit.warning'

  // Data access events
  | 'data.accessed'
  | 'data.exported'
  | 'data.deleted'

  // Secret events
  | 'secret.accessed'
  | 'secret.rotated';

// =============================================================================
// Audit Event Structure
// =============================================================================

/**
 * Actor who performed the action
 */
export interface SecurityAuditActor {
  /** Actor type */
  type: 'user' | 'service' | 'webhook' | 'scheduler' | 'system';
  /** User ID or service identifier */
  id: string;
  /** Email (if user) */
  email?: string;
  /** IP address (if available) */
  ip?: string;
  /** User agent (if available) */
  userAgent?: string;
}

/**
 * Outcome of the audited action
 */
export type AuditOutcome = 'success' | 'failure' | 'denied' | 'error';

/**
 * Security audit event
 */
export interface SecurityAuditEvent {
  /** Unique event ID */
  id: string;

  /** Event type */
  eventType: SecurityAuditEventType;

  /** Outcome of the action */
  outcome: AuditOutcome;

  /** Tenant ID (for tenant isolation) */
  tenantId: string;

  /** Actor who performed the action */
  actor: SecurityAuditActor;

  /** Resource being acted upon */
  resource?: {
    type: string;
    id: string;
    name?: string;
  };

  /** Additional event-specific data */
  data?: Record<string, unknown>;

  /** Error message if outcome is failure/error */
  error?: string;

  /** Timestamp of the event */
  timestamp: Date;

  // === Phase 23 Telemetry Correlation ===

  /** Trace ID for distributed tracing */
  traceId?: string;

  /** Span ID */
  spanId?: string;

  /** Request ID */
  requestId?: string;

  /** Run ID (if within a run context) */
  runId?: string;

  /** Work item ID (if within a job context) */
  workItemId?: string;

  /** Candidate ID (if candidate-related) */
  candidateId?: string;
}

/**
 * Create event input (without id, timestamp)
 */
export type CreateSecurityAuditEvent = Omit<SecurityAuditEvent, 'id' | 'timestamp'>;

// =============================================================================
// Event Builders
// =============================================================================

/**
 * Generate a unique audit event ID
 */
export function generateAuditEventId(): string {
  return `saud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a security audit event
 */
export function createSecurityAuditEvent(
  input: CreateSecurityAuditEvent
): SecurityAuditEvent {
  return {
    ...input,
    id: generateAuditEventId(),
    timestamp: new Date(),
  };
}

// =============================================================================
// Common Event Factories
// =============================================================================

/**
 * Create RBAC check event
 */
export function createRBACCheckEvent(
  tenantId: string,
  actor: SecurityAuditActor,
  action: string,
  allowed: boolean,
  context?: {
    traceId?: string;
    requestId?: string;
    userRole?: string;
    requiredRole?: string;
  }
): SecurityAuditEvent {
  return createSecurityAuditEvent({
    eventType: allowed ? 'rbac.check.allowed' : 'rbac.check.denied',
    outcome: allowed ? 'success' : 'denied',
    tenantId,
    actor,
    data: {
      action,
      userRole: context?.userRole,
      requiredRole: context?.requiredRole,
    },
    traceId: context?.traceId,
    requestId: context?.requestId,
  });
}

/**
 * Create webhook verification event
 */
export function createWebhookVerifyEvent(
  tenantId: string,
  success: boolean,
  webhookType: string,
  deliveryId?: string,
  context?: {
    traceId?: string;
    requestId?: string;
    error?: string;
  }
): SecurityAuditEvent {
  return createSecurityAuditEvent({
    eventType: success ? 'webhook.verify.success' : 'webhook.verify.failure',
    outcome: success ? 'success' : 'failure',
    tenantId,
    actor: {
      type: 'webhook',
      id: webhookType,
    },
    data: {
      webhookType,
      deliveryId,
    },
    error: context?.error,
    traceId: context?.traceId,
    requestId: context?.requestId,
  });
}

/**
 * Create queue job event
 */
export function createQueueJobEvent(
  eventType: 'queue.job.enqueued' | 'queue.job.started' | 'queue.job.completed' | 'queue.job.failed' | 'queue.job.dlq',
  tenantId: string,
  actor: SecurityAuditActor,
  jobId: string,
  jobType: string,
  context?: {
    traceId?: string;
    requestId?: string;
    workItemId?: string;
    runId?: string;
    error?: string;
    dlqReason?: string;
  }
): SecurityAuditEvent {
  const outcome: AuditOutcome = eventType === 'queue.job.failed' || eventType === 'queue.job.dlq'
    ? 'failure'
    : 'success';

  return createSecurityAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'job',
      id: jobId,
      name: jobType,
    },
    data: {
      jobType,
      dlqReason: context?.dlqReason,
    },
    error: context?.error,
    traceId: context?.traceId,
    requestId: context?.requestId,
    workItemId: context?.workItemId,
    runId: context?.runId,
  });
}

/**
 * Create candidate event
 */
export function createCandidateEvent(
  eventType: 'candidate.generated' | 'candidate.awaiting_approval' | 'candidate.approved' | 'candidate.rejected' | 'candidate.executed' | 'candidate.expired',
  tenantId: string,
  actor: SecurityAuditActor,
  candidateId: string,
  context?: {
    traceId?: string;
    requestId?: string;
    runId?: string;
    prNumber?: number;
    error?: string;
  }
): SecurityAuditEvent {
  const outcome: AuditOutcome =
    eventType === 'candidate.rejected' || eventType === 'candidate.expired' ? 'failure' : 'success';

  return createSecurityAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'candidate',
      id: candidateId,
    },
    data: {
      prNumber: context?.prNumber,
    },
    error: context?.error,
    traceId: context?.traceId,
    requestId: context?.requestId,
    runId: context?.runId,
    candidateId,
  });
}

/**
 * Create git operation event
 */
export function createGitOperationEvent(
  eventType: 'git.branch.created' | 'git.push.executed' | 'git.pr.opened' | 'git.pr.merged' | 'git.pr.closed',
  tenantId: string,
  actor: SecurityAuditActor,
  repo: string,
  context?: {
    traceId?: string;
    requestId?: string;
    runId?: string;
    candidateId?: string;
    branch?: string;
    prNumber?: number;
    commitSha?: string;
  }
): SecurityAuditEvent {
  return createSecurityAuditEvent({
    eventType,
    outcome: 'success',
    tenantId,
    actor,
    resource: {
      type: 'repository',
      id: repo,
      name: repo,
    },
    data: {
      branch: context?.branch,
      prNumber: context?.prNumber,
      commitSha: context?.commitSha,
    },
    traceId: context?.traceId,
    requestId: context?.requestId,
    runId: context?.runId,
    candidateId: context?.candidateId,
  });
}

/**
 * Create connector event
 */
export function createConnectorEvent(
  eventType: 'connector.installed' | 'connector.uninstalled' | 'connector.updated' | 'connector.invoked' | 'connector.failed',
  tenantId: string,
  actor: SecurityAuditActor,
  connectorId: string,
  context?: {
    traceId?: string;
    requestId?: string;
    version?: string;
    tool?: string;
    error?: string;
  }
): SecurityAuditEvent {
  const outcome: AuditOutcome = eventType === 'connector.failed' ? 'failure' : 'success';

  return createSecurityAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'connector',
      id: connectorId,
    },
    data: {
      version: context?.version,
      tool: context?.tool,
    },
    error: context?.error,
    traceId: context?.traceId,
    requestId: context?.requestId,
  });
}

/**
 * Create registry event
 */
export function createRegistryEvent(
  eventType: 'registry.package.published' | 'registry.package.updated' | 'registry.signature.verified' | 'registry.signature.failed',
  tenantId: string,
  actor: SecurityAuditActor,
  packageId: string,
  context?: {
    traceId?: string;
    requestId?: string;
    version?: string;
    error?: string;
  }
): SecurityAuditEvent {
  const outcome: AuditOutcome = eventType === 'registry.signature.failed' ? 'failure' : 'success';

  return createSecurityAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'package',
      id: packageId,
    },
    data: {
      version: context?.version,
    },
    error: context?.error,
    traceId: context?.traceId,
    requestId: context?.requestId,
  });
}

/**
 * Create plan limit event
 */
export function createPlanLimitEvent(
  eventType: 'plan.limit.checked' | 'plan.limit.exceeded' | 'plan.limit.warning',
  tenantId: string,
  actor: SecurityAuditActor,
  resource: string,
  current: number,
  limit: number,
  context?: {
    traceId?: string;
    requestId?: string;
    plan?: string;
  }
): SecurityAuditEvent {
  const outcome: AuditOutcome = eventType === 'plan.limit.exceeded' ? 'denied' : 'success';

  return createSecurityAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    data: {
      resource,
      current,
      limit,
      plan: context?.plan,
      utilization: limit > 0 ? (current / limit) * 100 : 0,
    },
    traceId: context?.traceId,
    requestId: context?.requestId,
  });
}
