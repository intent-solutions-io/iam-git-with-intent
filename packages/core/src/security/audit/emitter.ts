/**
 * Security Audit Event Emitter
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Central utility for emitting security audit events.
 * Automatically attaches Phase 23 telemetry context.
 *
 * @module @gwi/core/security/audit/emitter
 */

import { getCurrentContext, createLogger } from '../../telemetry/index.js';
import { getSecurityAuditStore } from './firestore-store.js';
import {
  type SecurityAuditEvent,
  type SecurityAuditActor,
  type AuditOutcome,
  type CreateSecurityAuditEvent,
} from './types.js';

const logger = createLogger('audit-emitter');

// =============================================================================
// Context Extraction
// =============================================================================

/**
 * Extract telemetry context fields for audit event
 */
function extractTelemetryContext(): Pick<
  SecurityAuditEvent,
  'traceId' | 'spanId' | 'requestId' | 'runId' | 'workItemId' | 'candidateId'
> {
  const ctx = getCurrentContext();

  if (!ctx) {
    return {};
  }

  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    requestId: ctx.requestId,
    runId: ctx.runId,
    workItemId: ctx.workItemId,
    candidateId: ctx.candidateId,
  };
}

// =============================================================================
// Emitter Function
// =============================================================================

/**
 * Emit a security audit event
 *
 * Automatically attaches Phase 23 telemetry context for correlation.
 *
 * @example
 * ```typescript
 * import { emitAuditEvent } from '@gwi/core';
 *
 * await emitAuditEvent({
 *   eventType: 'candidate.executed',
 *   outcome: 'success',
 *   tenantId: 'tenant-123',
 *   actor: { type: 'user', id: 'user-456' },
 *   resource: { type: 'candidate', id: 'cand-789' },
 * });
 * ```
 */
export async function emitAuditEvent(
  event: Omit<CreateSecurityAuditEvent, 'traceId' | 'spanId' | 'requestId' | 'runId' | 'workItemId' | 'candidateId'> &
    Partial<Pick<CreateSecurityAuditEvent, 'traceId' | 'spanId' | 'requestId' | 'runId' | 'workItemId' | 'candidateId'>>
): Promise<SecurityAuditEvent> {
  const store = getSecurityAuditStore();
  const telemetryFields = extractTelemetryContext();

  // Merge provided fields with context (explicit fields take precedence)
  const fullEvent: CreateSecurityAuditEvent = {
    ...event,
    traceId: event.traceId ?? telemetryFields.traceId,
    spanId: event.spanId ?? telemetryFields.spanId,
    requestId: event.requestId ?? telemetryFields.requestId,
    runId: event.runId ?? telemetryFields.runId,
    workItemId: event.workItemId ?? telemetryFields.workItemId,
    candidateId: event.candidateId ?? telemetryFields.candidateId,
  };

  try {
    const created = await store.createEvent(fullEvent);

    // Log for observability
    logger.debug('Security audit event emitted', {
      eventName: `audit.${event.eventType}`,
      auditEventId: created.id,
      auditEventType: event.eventType,
      outcome: event.outcome,
      tenantId: event.tenantId,
      actorId: event.actor.id,
      resourceType: event.resource?.type,
      resourceId: event.resource?.id,
      traceId: fullEvent.traceId,
      requestId: fullEvent.requestId,
    });

    return created;
  } catch (error) {
    // Log error but don't fail the operation
    logger.error('Failed to emit security audit event', error, {
      eventType: event.eventType,
      tenantId: event.tenantId,
      traceId: fullEvent.traceId,
    });

    // Return a synthetic event for consistency
    return {
      ...fullEvent,
      id: `saud-failed-${Date.now()}`,
      timestamp: new Date(),
    };
  }
}

// =============================================================================
// Convenience Emitters
// =============================================================================

/**
 * Emit RBAC check event
 */
export async function emitRBACEvent(
  tenantId: string,
  actor: SecurityAuditActor,
  action: string,
  allowed: boolean,
  options?: {
    userRole?: string;
    requiredRole?: string;
    resourceId?: string;
  }
): Promise<SecurityAuditEvent> {
  return emitAuditEvent({
    eventType: allowed ? 'rbac.check.allowed' : 'rbac.check.denied',
    outcome: allowed ? 'success' : 'denied',
    tenantId,
    actor,
    resource: options?.resourceId
      ? { type: 'action', id: action, name: options.resourceId }
      : undefined,
    data: {
      action,
      userRole: options?.userRole,
      requiredRole: options?.requiredRole,
    },
  });
}

/**
 * Emit webhook verification event
 */
export async function emitWebhookVerifyEvent(
  tenantId: string,
  success: boolean,
  webhookType: string,
  options?: {
    deliveryId?: string;
    error?: string;
  }
): Promise<SecurityAuditEvent> {
  return emitAuditEvent({
    eventType: success ? 'webhook.verify.success' : 'webhook.verify.failure',
    outcome: success ? 'success' : 'failure',
    tenantId,
    actor: {
      type: 'webhook',
      id: webhookType,
    },
    data: {
      webhookType,
      deliveryId: options?.deliveryId,
    },
    error: options?.error,
  });
}

/**
 * Emit queue job event
 */
export async function emitQueueJobEvent(
  eventType: 'queue.job.enqueued' | 'queue.job.started' | 'queue.job.completed' | 'queue.job.failed' | 'queue.job.dlq',
  tenantId: string,
  actor: SecurityAuditActor,
  jobId: string,
  jobType: string,
  options?: {
    error?: string;
    dlqReason?: string;
    durationMs?: number;
  }
): Promise<SecurityAuditEvent> {
  const outcome: AuditOutcome =
    eventType === 'queue.job.failed' || eventType === 'queue.job.dlq' ? 'failure' : 'success';

  return emitAuditEvent({
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
      dlqReason: options?.dlqReason,
      durationMs: options?.durationMs,
    },
    error: options?.error,
  });
}

/**
 * Emit candidate lifecycle event
 */
export async function emitCandidateEvent(
  eventType:
    | 'candidate.generated'
    | 'candidate.awaiting_approval'
    | 'candidate.approved'
    | 'candidate.rejected'
    | 'candidate.executed'
    | 'candidate.expired',
  tenantId: string,
  actor: SecurityAuditActor,
  candidateId: string,
  options?: {
    prNumber?: number;
    branch?: string;
    error?: string;
  }
): Promise<SecurityAuditEvent> {
  const outcome: AuditOutcome =
    eventType === 'candidate.rejected' || eventType === 'candidate.expired' ? 'failure' : 'success';

  return emitAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'candidate',
      id: candidateId,
    },
    candidateId,
    data: {
      prNumber: options?.prNumber,
      branch: options?.branch,
    },
    error: options?.error,
  });
}

/**
 * Emit git operation event (high-risk)
 */
export async function emitGitOperationEvent(
  eventType:
    | 'git.branch.created'
    | 'git.push.executed'
    | 'git.pr.opened'
    | 'git.pr.merged'
    | 'git.pr.closed',
  tenantId: string,
  actor: SecurityAuditActor,
  repo: string,
  options?: {
    branch?: string;
    prNumber?: number;
    commitSha?: string;
    candidateId?: string;
  }
): Promise<SecurityAuditEvent> {
  return emitAuditEvent({
    eventType,
    outcome: 'success',
    tenantId,
    actor,
    resource: {
      type: 'repository',
      id: repo,
      name: repo,
    },
    candidateId: options?.candidateId,
    data: {
      branch: options?.branch,
      prNumber: options?.prNumber,
      commitSha: options?.commitSha,
    },
  });
}

/**
 * Emit connector event
 */
export async function emitConnectorEvent(
  eventType:
    | 'connector.installed'
    | 'connector.uninstalled'
    | 'connector.updated'
    | 'connector.invoked'
    | 'connector.failed',
  tenantId: string,
  actor: SecurityAuditActor,
  connectorId: string,
  options?: {
    version?: string;
    tool?: string;
    error?: string;
    durationMs?: number;
  }
): Promise<SecurityAuditEvent> {
  const outcome: AuditOutcome = eventType === 'connector.failed' ? 'failure' : 'success';

  return emitAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'connector',
      id: connectorId,
    },
    data: {
      version: options?.version,
      tool: options?.tool,
      durationMs: options?.durationMs,
    },
    error: options?.error,
  });
}

/**
 * Emit registry event
 */
export async function emitRegistryEvent(
  eventType:
    | 'registry.package.published'
    | 'registry.package.updated'
    | 'registry.signature.verified'
    | 'registry.signature.failed',
  tenantId: string,
  actor: SecurityAuditActor,
  packageId: string,
  options?: {
    version?: string;
    error?: string;
  }
): Promise<SecurityAuditEvent> {
  const outcome: AuditOutcome = eventType === 'registry.signature.failed' ? 'failure' : 'success';

  return emitAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    resource: {
      type: 'package',
      id: packageId,
    },
    data: {
      version: options?.version,
    },
    error: options?.error,
  });
}

/**
 * Emit plan limit event
 */
export async function emitPlanLimitEvent(
  eventType: 'plan.limit.checked' | 'plan.limit.exceeded' | 'plan.limit.warning',
  tenantId: string,
  actor: SecurityAuditActor,
  resource: string,
  current: number,
  limit: number,
  options?: {
    plan?: string;
  }
): Promise<SecurityAuditEvent> {
  const outcome: AuditOutcome = eventType === 'plan.limit.exceeded' ? 'denied' : 'success';

  return emitAuditEvent({
    eventType,
    outcome,
    tenantId,
    actor,
    data: {
      resource,
      current,
      limit,
      plan: options?.plan,
      utilization: limit > 0 ? Math.round((current / limit) * 100) : 0,
    },
  });
}

// =============================================================================
// A10: Auth Failure Events
// =============================================================================

/**
 * Emit authentication failure event
 */
export async function emitAuthFailureEvent(
  reason: string,
  options?: {
    ip?: string;
    userAgent?: string;
    path?: string;
    method?: string;
    userId?: string;
    tenantId?: string;
  }
): Promise<SecurityAuditEvent> {
  return emitAuditEvent({
    eventType: 'auth.login.failure',
    outcome: 'failure',
    tenantId: options?.tenantId ?? 'unknown',
    actor: {
      type: 'user',
      id: options?.userId ?? 'anonymous',
      ip: options?.ip,
      userAgent: options?.userAgent,
    },
    data: {
      reason,
      path: options?.path,
      method: options?.method,
    },
    error: reason,
  });
}

/**
 * Emit authorization denied event (tenant access)
 */
export async function emitAuthzDeniedEvent(
  tenantId: string,
  userId: string,
  reason: string,
  options?: {
    ip?: string;
    userAgent?: string;
    path?: string;
    method?: string;
    requiredRole?: string;
    userRole?: string;
  }
): Promise<SecurityAuditEvent> {
  return emitAuditEvent({
    eventType: 'rbac.check.denied',
    outcome: 'denied',
    tenantId,
    actor: {
      type: 'user',
      id: userId,
      ip: options?.ip,
      userAgent: options?.userAgent,
    },
    data: {
      reason,
      path: options?.path,
      method: options?.method,
      requiredRole: options?.requiredRole,
      userRole: options?.userRole,
    },
    error: reason,
  });
}
