/**
 * Audit Event Schema
 *
 * Epic D Foundation: Policy Engine - D4.s1 Audit Event Schema
 *
 * Comprehensive Zod schema for audit events supporting:
 * - Principal (who): userId, tenantId, serviceAccount, impersonation
 * - Action (what): operation type, target resource, scope
 * - Timestamp (when): ISO 8601 with timezone
 * - Result: success/failure, error details, outcome data
 * - Context: correlationId, requestId, sourceIP, userAgent
 * - Evidence: link to run artifacts, attestations
 *
 * @module @gwi/core/security/audit/schema
 */

import { z } from 'zod';

// =============================================================================
// Primitive Types
// =============================================================================

/**
 * ISO 8601 timestamp string or Date
 */
export const Timestamp = z.union([
  z.date(),
  z.string().datetime({ offset: true }),
]).transform((val) => (typeof val === 'string' ? new Date(val) : val));

/**
 * Non-empty string with max length
 */
export const NonEmptyString = (maxLength = 1000) =>
  z.string().min(1).max(maxLength);

/**
 * Audit event ID format: saud-{timestamp}-{random}
 */
export const AuditEventId = z.string().regex(
  /^saud-\d+-[a-z0-9]+$/,
  'Invalid audit event ID format'
);

/**
 * Tenant ID format
 */
export const TenantId = z.string().min(1).max(100);

/**
 * User/Actor ID format
 */
export const ActorId = z.string().min(1).max(200);

/**
 * IP address (v4 or v6)
 */
export const IPAddress = z.string().ip().optional();

/**
 * User agent string
 */
export const UserAgent = z.string().max(500).optional();

// =============================================================================
// Principal Schema (WHO)
// =============================================================================

/**
 * Actor types that can perform auditable actions
 */
export const ActorType = z.enum([
  'user',       // Human user
  'service',    // Service account / Cloud Run service
  'webhook',    // External webhook (GitHub, Stripe, etc.)
  'scheduler',  // Scheduled job / cron
  'system',     // Internal system operation
  'agent',      // AI agent
]);
export type ActorType = z.infer<typeof ActorType>;

/**
 * Actor performing the auditable action
 *
 * Answers: WHO performed this action?
 */
export const AuditActor = z.object({
  /** Actor type classification */
  type: ActorType,

  /** Primary identifier (userId, serviceId, etc.) */
  id: ActorId,

  /** Email address (for user actors) */
  email: z.string().email().optional(),

  /** Display name */
  displayName: z.string().max(200).optional(),

  /** Service account identifier (for service actors) */
  serviceAccountId: z.string().max(200).optional(),

  /** Impersonation: original actor if acting on behalf of another */
  impersonatedBy: z.object({
    type: ActorType,
    id: ActorId,
    reason: z.string().max(500).optional(),
  }).optional(),
});
export type AuditActor = z.infer<typeof AuditActor>;

/**
 * Request source information
 *
 * Captures where the request originated from
 */
export const AuditRequestSource = z.object({
  /** Client IP address */
  ip: IPAddress,

  /** User agent string */
  userAgent: UserAgent,

  /** Geographic location (if available) */
  geo: z.object({
    country: z.string().length(2).optional(), // ISO 3166-1 alpha-2
    region: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
  }).optional(),

  /** Request origin (for CORS) */
  origin: z.string().url().optional(),

  /** Forwarded-For header (for proxied requests) */
  forwardedFor: z.string().max(500).optional(),
});
export type AuditRequestSource = z.infer<typeof AuditRequestSource>;

// =============================================================================
// Action Schema (WHAT)
// =============================================================================

/**
 * Security audit event type categories
 */
export const AuditEventCategory = z.enum([
  'auth',         // Authentication events
  'rbac',         // Authorization/RBAC events
  'webhook',      // Webhook events
  'queue',        // Queue/job events
  'candidate',    // PR candidate lifecycle
  'git',          // Git operations (high-risk)
  'connector',    // Connector lifecycle
  'registry',     // Package registry
  'plan',         // Plan limit events
  'data',         // Data access events
  'secret',       // Secret access events
  'policy',       // Policy evaluation events
  'tenant',       // Tenant management
  'billing',      // Billing events
  'api',          // API access events
]);
export type AuditEventCategory = z.infer<typeof AuditEventCategory>;

/**
 * All supported audit event types
 *
 * Format: {category}.{action}.{result}
 */
export const AuditEventType = z.enum([
  // Authentication events
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'auth.token.refresh',
  'auth.token.revoked',
  'auth.mfa.verified',
  'auth.mfa.failed',
  'auth.session.created',
  'auth.session.expired',

  // RBAC events
  'rbac.check.allowed',
  'rbac.check.denied',
  'rbac.role.assigned',
  'rbac.role.changed',
  'rbac.role.removed',
  'rbac.permission.granted',
  'rbac.permission.revoked',

  // Webhook events
  'webhook.received',
  'webhook.verify.success',
  'webhook.verify.failure',
  'webhook.processed',
  'webhook.failed',
  'webhook.replay.detected',

  // Queue events
  'queue.job.enqueued',
  'queue.job.started',
  'queue.job.completed',
  'queue.job.failed',
  'queue.job.retried',
  'queue.job.dlq',

  // Candidate events
  'candidate.generated',
  'candidate.awaiting_approval',
  'candidate.approved',
  'candidate.rejected',
  'candidate.executed',
  'candidate.expired',
  'candidate.rollback',

  // Git operation events (high-risk)
  'git.branch.created',
  'git.branch.deleted',
  'git.push.executed',
  'git.pr.opened',
  'git.pr.merged',
  'git.pr.closed',
  'git.force_push.attempted',
  'git.force_push.blocked',

  // Connector events
  'connector.installed',
  'connector.uninstalled',
  'connector.updated',
  'connector.invoked',
  'connector.failed',
  'connector.permission.granted',
  'connector.permission.revoked',

  // Registry events
  'registry.package.published',
  'registry.package.updated',
  'registry.package.deprecated',
  'registry.signature.verified',
  'registry.signature.failed',

  // Plan limit events
  'plan.limit.checked',
  'plan.limit.exceeded',
  'plan.limit.warning',
  'plan.upgraded',
  'plan.downgraded',

  // Data access events
  'data.accessed',
  'data.exported',
  'data.deleted',
  'data.modified',

  // Secret events
  'secret.accessed',
  'secret.rotated',
  'secret.created',
  'secret.deleted',
  'secret.exposure.detected',

  // Policy events
  'policy.evaluated',
  'policy.allow',
  'policy.deny',
  'policy.require_approval',
  'policy.updated',

  // Tenant events
  'tenant.created',
  'tenant.updated',
  'tenant.deleted',
  'tenant.suspended',
  'tenant.reactivated',

  // Billing events
  'billing.invoice.created',
  'billing.payment.succeeded',
  'billing.payment.failed',
  'billing.subscription.updated',

  // API events
  'api.key.created',
  'api.key.revoked',
  'api.rate_limit.exceeded',
  'api.request.success',
  'api.request.failure',
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

/**
 * Resource being acted upon
 */
export const AuditResource = z.object({
  /** Resource type */
  type: z.string().min(1).max(50),

  /** Resource ID */
  id: z.string().min(1).max(200),

  /** Human-readable name */
  name: z.string().max(500).optional(),

  /** Parent resource (for hierarchical resources) */
  parent: z.object({
    type: z.string().min(1).max(50),
    id: z.string().min(1).max(200),
  }).optional(),

  /** Resource attributes relevant to the action */
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type AuditResource = z.infer<typeof AuditResource>;

// =============================================================================
// Result Schema (RESULT)
// =============================================================================

/**
 * Outcome of the audited action
 */
export const AuditOutcome = z.enum([
  'success',    // Action completed successfully
  'failure',    // Action failed (error)
  'denied',     // Action denied (authorization)
  'blocked',    // Action blocked (policy)
  'partial',    // Partially completed
  'pending',    // Awaiting approval/completion
]);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

/**
 * Error details when outcome is failure/error
 */
export const AuditError = z.object({
  /** Error code */
  code: z.string().max(100).optional(),

  /** Error message (sanitized, no secrets) */
  message: z.string().max(2000),

  /** Error category */
  category: z.enum([
    'validation',
    'authentication',
    'authorization',
    'rate_limit',
    'quota',
    'external_service',
    'internal',
    'timeout',
    'conflict',
  ]).optional(),

  /** Stack trace (development only, never in production) */
  stack: z.string().max(5000).optional(),

  /** Retry possible? */
  retryable: z.boolean().optional(),
});
export type AuditError = z.infer<typeof AuditError>;

// =============================================================================
// Context Schema (CORRELATION)
// =============================================================================

/**
 * Correlation context for distributed tracing
 */
export const AuditCorrelation = z.object({
  /** OpenTelemetry trace ID */
  traceId: z.string().max(64).optional(),

  /** OpenTelemetry span ID */
  spanId: z.string().max(32).optional(),

  /** Request ID (gateway-assigned) */
  requestId: z.string().max(100).optional(),

  /** Parent request ID (for nested operations) */
  parentRequestId: z.string().max(100).optional(),

  /** Run ID (if within a run context) */
  runId: z.string().max(100).optional(),

  /** Work item ID (if within a job context) */
  workItemId: z.string().max(100).optional(),

  /** PR candidate ID (if candidate-related) */
  candidateId: z.string().max(100).optional(),

  /** Session ID (if within a user session) */
  sessionId: z.string().max(100).optional(),

  /** Causation ID (event that caused this event) */
  causationId: z.string().max(100).optional(),
});
export type AuditCorrelation = z.infer<typeof AuditCorrelation>;

// =============================================================================
// Evidence Schema (EVIDENCE LINKING)
// =============================================================================

/**
 * Evidence type for linking audit events to artifacts
 */
export const EvidenceType = z.enum([
  'artifact',       // Run artifact (GCS)
  'log',            // Log entry
  'snapshot',       // State snapshot
  'signature',      // Digital signature
  'attestation',    // Third-party attestation
  'screenshot',     // Visual evidence
  'diff',           // Code diff
  'approval',       // Approval record
  'policy_eval',    // Policy evaluation record
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

/**
 * Evidence link to external artifacts
 */
export const AuditEvidence = z.object({
  /** Evidence type */
  type: EvidenceType,

  /** Reference/path to evidence */
  ref: z.string().max(1000),

  /** Hash of evidence content (for integrity) */
  hash: z.string().max(128).optional(),

  /** Hash algorithm */
  hashAlgorithm: z.enum(['sha256', 'sha384', 'sha512']).optional(),

  /** When evidence was captured */
  capturedAt: Timestamp.optional(),

  /** Additional evidence metadata */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AuditEvidence = z.infer<typeof AuditEvidence>;

// =============================================================================
// Main Audit Event Schema
// =============================================================================

/**
 * Complete security audit event schema
 *
 * This schema captures the full audit trail for security-relevant events.
 * All events are append-only and immutable once created.
 *
 * Note: Named SecurityAuditEventSchema to avoid conflict with storage/interfaces AuditEvent
 */
export const SecurityAuditEventSchema = z.object({
  // === Identity ===

  /** Unique event ID (saud-{timestamp}-{random}) */
  id: AuditEventId,

  /** Schema version for future migrations */
  schemaVersion: z.literal('1.0.0').default('1.0.0'),

  // === Tenant Isolation ===

  /** Tenant ID (required for multi-tenant isolation) */
  tenantId: TenantId,

  // === WHAT: Action ===

  /** Event type (category.action.result format) */
  eventType: AuditEventType,

  /** Event category (derived from eventType) */
  category: AuditEventCategory.optional(),

  /** Target resource being acted upon */
  resource: AuditResource.optional(),

  /** Additional action-specific data */
  actionData: z.record(z.string(), z.unknown()).optional(),

  // === WHO: Principal ===

  /** Actor who performed the action */
  actor: AuditActor,

  /** Request source information */
  source: AuditRequestSource.optional(),

  // === WHEN: Timestamp ===

  /** When the event occurred (ISO 8601) */
  timestamp: Timestamp,

  /** Server-side event reception time (if different) */
  receivedAt: Timestamp.optional(),

  /** Duration of the action in milliseconds */
  durationMs: z.number().int().nonnegative().optional(),

  // === RESULT ===

  /** Outcome of the action */
  outcome: AuditOutcome,

  /** Error details (if outcome is failure/denied/blocked) */
  error: AuditError.optional(),

  /** Result data (action-specific output) */
  resultData: z.record(z.string(), z.unknown()).optional(),

  // === CONTEXT: Correlation ===

  /** Correlation IDs for distributed tracing */
  correlation: AuditCorrelation.optional(),

  // === EVIDENCE ===

  /** Links to supporting evidence/artifacts */
  evidence: z.array(AuditEvidence).max(20).optional(),

  // === METADATA ===

  /** Tags for categorization and filtering */
  tags: z.array(z.string().max(100)).max(50).optional(),

  /** Is this a high-risk action requiring special attention? */
  highRisk: z.boolean().optional(),

  /** Compliance frameworks this event relates to */
  compliance: z.array(z.enum([
    'soc2',
    'gdpr',
    'hipaa',
    'pci',
    'iso27001',
  ])).optional(),

  /** Environment (prod/staging/dev) */
  environment: z.enum(['production', 'staging', 'development']).optional(),
});

export type SecurityAuditEventSchema = z.infer<typeof SecurityAuditEventSchema>;

/**
 * Alias for backward compatibility and convenience
 */
export const AuditEventSchema = SecurityAuditEventSchema;
export type AuditEventSchema = SecurityAuditEventSchema;

// =============================================================================
// Create Event Input Schema
// =============================================================================

/**
 * Input schema for creating a new audit event
 *
 * Excludes auto-generated fields (id, timestamp, schemaVersion)
 */
export const CreateSecurityAuditEvent = SecurityAuditEventSchema.omit({
  id: true,
  timestamp: true,
  schemaVersion: true,
  receivedAt: true,
}).extend({
  /** Optional timestamp override (defaults to now) */
  timestamp: Timestamp.optional(),
});

export type CreateSecurityAuditEvent = z.infer<typeof CreateSecurityAuditEvent>;

/**
 * Alias for backward compatibility
 */
export const CreateAuditEventSchema = CreateSecurityAuditEvent;
export type CreateAuditEventSchema = CreateSecurityAuditEvent;

// =============================================================================
// Query Schema
// =============================================================================

/**
 * Query options for listing audit events
 */
export const AuditEventQuery = z.object({
  /** Filter by tenant ID (required for tenant isolation) */
  tenantId: TenantId,

  /** Filter by event types */
  eventTypes: z.array(AuditEventType).optional(),

  /** Filter by category */
  categories: z.array(AuditEventCategory).optional(),

  /** Filter by outcome */
  outcomes: z.array(AuditOutcome).optional(),

  /** Filter by actor ID */
  actorId: ActorId.optional(),

  /** Filter by actor type */
  actorType: ActorType.optional(),

  /** Filter by resource type */
  resourceType: z.string().optional(),

  /** Filter by resource ID */
  resourceId: z.string().optional(),

  /** Filter by correlation IDs */
  traceId: z.string().optional(),
  requestId: z.string().optional(),
  runId: z.string().optional(),
  candidateId: z.string().optional(),

  /** Time range filters */
  startTime: Timestamp.optional(),
  endTime: Timestamp.optional(),

  /** Filter by high-risk only */
  highRiskOnly: z.boolean().optional(),

  /** Filter by tags */
  tags: z.array(z.string()).optional(),

  /** Pagination */
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),

  /** Sort order */
  orderBy: z.enum(['asc', 'desc']).default('desc'),
});

export type AuditEventQuery = z.infer<typeof AuditEventQuery>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique audit event ID
 */
export function generateAuditEventId(): string {
  return `saud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract category from event type
 */
export function extractCategory(eventType: AuditEventType): AuditEventCategory {
  const category = eventType.split('.')[0] as AuditEventCategory;
  return AuditEventCategory.parse(category);
}

/**
 * Create a validated audit event
 */
export function createAuditEvent(input: CreateSecurityAuditEvent): SecurityAuditEventSchema {
  const id = generateAuditEventId();
  const timestamp = input.timestamp ?? new Date();
  const category = extractCategory(input.eventType);

  const event: SecurityAuditEventSchema = {
    ...input,
    id,
    schemaVersion: '1.0.0',
    timestamp,
    category,
    receivedAt: new Date(),
  };

  // Validate the complete event
  return SecurityAuditEventSchema.parse(event);
}

/**
 * Validate an existing audit event
 */
export function validateAuditEvent(event: unknown): SecurityAuditEventSchema {
  return SecurityAuditEventSchema.parse(event);
}

/**
 * Safe parse (returns result object instead of throwing)
 */
export function safeParseAuditEvent(event: unknown): z.SafeParseReturnType<unknown, SecurityAuditEventSchema> {
  return SecurityAuditEventSchema.safeParse(event);
}

// =============================================================================
// High-Risk Event Detection
// =============================================================================

/**
 * Event types that are considered high-risk
 */
export const HIGH_RISK_EVENT_TYPES: AuditEventType[] = [
  'git.force_push.attempted',
  'git.branch.deleted',
  'git.pr.merged',
  'secret.accessed',
  'secret.deleted',
  'secret.exposure.detected',
  'data.deleted',
  'data.exported',
  'tenant.deleted',
  'tenant.suspended',
  'rbac.role.changed',
  'rbac.role.removed',
  'connector.permission.granted',
  'policy.deny',
  'api.key.created',
  'api.key.revoked',
  'billing.subscription.updated',
];

/**
 * Check if an event type is high-risk
 */
export function isHighRiskEventType(eventType: AuditEventType): boolean {
  return HIGH_RISK_EVENT_TYPES.includes(eventType);
}

/**
 * Mark an event as high-risk if applicable
 */
export function markHighRiskIfApplicable(event: CreateSecurityAuditEvent): CreateSecurityAuditEvent {
  if (isHighRiskEventType(event.eventType)) {
    return { ...event, highRisk: true };
  }
  return event;
}

// =============================================================================
// Backward Compatibility Types
// =============================================================================

/**
 * Legacy SecurityAuditEvent type alias for backward compatibility
 *
 * Maps to the existing SecurityAuditEvent interface
 */
export type LegacySecurityAuditEvent = {
  id: string;
  eventType: AuditEventType;
  outcome: AuditOutcome;
  tenantId: string;
  actor: AuditActor;
  resource?: AuditResource;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: Date;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  runId?: string;
  workItemId?: string;
  candidateId?: string;
};

/**
 * Convert legacy event to new schema
 */
export function fromLegacyEvent(legacy: LegacySecurityAuditEvent): SecurityAuditEventSchema {
  return createAuditEvent({
    tenantId: legacy.tenantId,
    eventType: legacy.eventType,
    outcome: legacy.outcome,
    actor: legacy.actor,
    resource: legacy.resource,
    actionData: legacy.data,
    error: legacy.error ? { message: legacy.error } : undefined,
    correlation: {
      traceId: legacy.traceId,
      spanId: legacy.spanId,
      requestId: legacy.requestId,
      runId: legacy.runId,
      workItemId: legacy.workItemId,
      candidateId: legacy.candidateId,
    },
  });
}

/**
 * Convert new event to legacy format
 */
export function toLegacyEvent(event: SecurityAuditEventSchema): LegacySecurityAuditEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    outcome: event.outcome,
    tenantId: event.tenantId,
    actor: event.actor,
    resource: event.resource,
    data: event.actionData,
    error: event.error?.message,
    timestamp: event.timestamp,
    traceId: event.correlation?.traceId,
    spanId: event.correlation?.spanId,
    requestId: event.correlation?.requestId,
    runId: event.correlation?.runId,
    workItemId: event.correlation?.workItemId,
    candidateId: event.correlation?.candidateId,
  };
}
