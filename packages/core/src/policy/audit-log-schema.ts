/**
 * Immutable Audit Log Schema
 *
 * Epic D: Policy & Audit - Story D3: Immutable Audit Log
 * Task D3.1: Design audit log schema
 *
 * Append-only log structure with cryptographic chaining for tamper-evident
 * audit trails. Designed to support:
 * - Cryptographic integrity verification (D3.2)
 * - Policy violation detection (D5)
 * - Compliance reporting (D4)
 *
 * Fields: timestamp, actor, action, resource, outcome, context hash, prev hash
 *
 * @module @gwi/core/policy/audit-log-schema
 */

import { z } from 'zod';

// =============================================================================
// Cryptographic Types
// =============================================================================

/**
 * Supported hash algorithms for cryptographic chaining
 */
export const HashAlgorithm = z.enum(['sha256', 'sha384', 'sha512']);
export type HashAlgorithm = z.infer<typeof HashAlgorithm>;

/**
 * Hash value with algorithm metadata
 */
export const CryptoHash = z.object({
  /** Hash algorithm used */
  algorithm: HashAlgorithm,
  /** Hex-encoded hash value */
  value: z.string().regex(/^[a-f0-9]+$/, 'Hash must be hex-encoded'),
});
export type CryptoHash = z.infer<typeof CryptoHash>;

/**
 * SHA-256 hash (64 hex characters)
 */
export const SHA256Hash = z.string().length(64).regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash');
export type SHA256Hash = z.infer<typeof SHA256Hash>;

// =============================================================================
// Entry Identification
// =============================================================================

/**
 * Audit log entry ID format: alog-{timestamp}-{sequence}-{random}
 * - timestamp: Unix timestamp in milliseconds
 * - sequence: Monotonic sequence number within the log
 * - random: 6-character random suffix
 */
export const AuditLogEntryId = z.string().regex(
  /^alog-\d+-\d+-[a-z0-9]{6}$/,
  'Invalid audit log entry ID format'
);
export type AuditLogEntryId = z.infer<typeof AuditLogEntryId>;

/**
 * Audit log ID format: log-{tenantId}-{scope}-{random}
 */
export const AuditLogId = z.string().regex(
  /^log-[a-z0-9-]+-[a-z]+-[a-z0-9]{8}$/,
  'Invalid audit log ID format'
);
export type AuditLogId = z.infer<typeof AuditLogId>;

// =============================================================================
// Actor Schema
// =============================================================================

/**
 * Actor types for audit log entries
 */
export const AuditActorType = z.enum([
  'user',           // Human user
  'agent',          // AI agent (triage, coder, resolver, reviewer)
  'service',        // Service account
  'system',         // Internal system process
  'webhook',        // External webhook
  'scheduler',      // Scheduled job
  'api_key',        // API key access
]);
export type AuditActorType = z.infer<typeof AuditActorType>;

/**
 * Actor who performed the audited action
 */
export const AuditLogActor = z.object({
  /** Actor type */
  type: AuditActorType,

  /** Primary identifier (userId, serviceId, agentId, etc.) */
  id: z.string().min(1).max(200),

  /** Human-readable name or email */
  displayName: z.string().max(200).optional(),

  /** Email address (for user actors) */
  email: z.string().email().optional(),

  /** Agent type (for agent actors) */
  agentType: z.enum(['triage', 'coder', 'resolver', 'reviewer', 'orchestrator']).optional(),

  /** Source IP address */
  ip: z.string().ip().optional(),

  /** User agent string */
  userAgent: z.string().max(500).optional(),

  /** Acting on behalf of another actor (impersonation) */
  onBehalfOf: z.object({
    type: AuditActorType,
    id: z.string().min(1).max(200),
    reason: z.string().max(500).optional(),
  }).optional(),
});
export type AuditLogActor = z.infer<typeof AuditLogActor>;

// =============================================================================
// Action Schema
// =============================================================================

/**
 * Action categories for audit log entries
 */
export const AuditActionCategory = z.enum([
  'policy',         // Policy evaluation, updates, violations
  'auth',           // Authentication and authorization
  'data',           // Data access and modification
  'git',            // Git operations (high-risk)
  'agent',          // Agent execution and decisions
  'approval',       // Approval workflows
  'config',         // Configuration changes
  'admin',          // Administrative actions
  'security',       // Security events
  'billing',        // Billing and subscription events
]);
export type AuditActionCategory = z.infer<typeof AuditActionCategory>;

/**
 * Action performed (what happened)
 */
export const AuditLogAction = z.object({
  /** Action category */
  category: AuditActionCategory,

  /** Specific action type (e.g., 'policy.evaluated', 'git.push.executed') */
  type: z.string().min(1).max(100).regex(
    /^[a-z]+(\.[a-z_]+)+$/,
    'Action type must be dot-separated lowercase (e.g., policy.rule.evaluated)'
  ),

  /** Human-readable action description */
  description: z.string().max(500).optional(),

  /** Whether this is a sensitive/high-risk action */
  sensitive: z.boolean().default(false),
});
export type AuditLogAction = z.infer<typeof AuditLogAction>;

// =============================================================================
// Resource Schema
// =============================================================================

/**
 * Resource types that can be acted upon
 */
export const AuditResourceType = z.enum([
  'policy',         // Policy document
  'policy_rule',    // Individual policy rule
  'repository',     // Git repository
  'branch',         // Git branch
  'pull_request',   // Pull request
  'commit',         // Git commit
  'run',            // GWI run
  'approval',       // Approval record
  'tenant',         // Tenant/organization
  'user',           // User account
  'agent',          // Agent instance
  'secret',         // Secret/credential
  'api_key',        // API key
  'config',         // Configuration
  'artifact',       // Run artifact
]);
export type AuditResourceType = z.infer<typeof AuditResourceType>;

/**
 * Resource being acted upon
 */
export const AuditLogResource = z.object({
  /** Resource type */
  type: AuditResourceType,

  /** Resource identifier */
  id: z.string().min(1).max(500),

  /** Human-readable name */
  name: z.string().max(500).optional(),

  /** Parent resource (for hierarchical resources) */
  parent: z.object({
    type: AuditResourceType,
    id: z.string().min(1).max(500),
  }).optional(),

  /** Additional resource attributes */
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type AuditLogResource = z.infer<typeof AuditLogResource>;

// =============================================================================
// Outcome Schema
// =============================================================================

/**
 * Outcome status of the audited action
 */
export const AuditOutcomeStatus = z.enum([
  'success',        // Action completed successfully
  'failure',        // Action failed (error)
  'denied',         // Action denied by policy/RBAC
  'blocked',        // Action blocked by guard/gate
  'pending',        // Action awaiting approval
  'partial',        // Partially completed
  'skipped',        // Action skipped (condition not met)
]);
export type AuditOutcomeStatus = z.infer<typeof AuditOutcomeStatus>;

/**
 * Outcome of the audited action
 */
export const AuditLogOutcome = z.object({
  /** Outcome status */
  status: AuditOutcomeStatus,

  /** Error code (if status is failure/denied/blocked) */
  errorCode: z.string().max(100).optional(),

  /** Error message (sanitized, no secrets) */
  errorMessage: z.string().max(2000).optional(),

  /** Duration of the action in milliseconds */
  durationMs: z.number().int().nonnegative().optional(),

  /** Additional outcome data */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type AuditLogOutcome = z.infer<typeof AuditLogOutcome>;

// =============================================================================
// Context Schema
// =============================================================================

/**
 * Correlation context for tracing and linking related events
 */
export const AuditLogContext = z.object({
  /** Tenant ID (required for multi-tenant isolation) */
  tenantId: z.string().min(1).max(100),

  /** Organization ID */
  orgId: z.string().max(100).optional(),

  /** Repository ID */
  repoId: z.string().max(200).optional(),

  /** OpenTelemetry trace ID */
  traceId: z.string().max(64).optional(),

  /** OpenTelemetry span ID */
  spanId: z.string().max(32).optional(),

  /** Request ID (gateway-assigned) */
  requestId: z.string().max(100).optional(),

  /** Run ID (if within a run context) */
  runId: z.string().max(100).optional(),

  /** Candidate ID (if PR-related) */
  candidateId: z.string().max(100).optional(),

  /** Session ID (if within user session) */
  sessionId: z.string().max(100).optional(),

  /** Causation ID (event that caused this event) */
  causationId: z.string().max(100).optional(),

  /** Environment */
  environment: z.enum(['production', 'staging', 'development']).optional(),

  /** Service name that generated this entry */
  service: z.string().max(100).optional(),
});
export type AuditLogContext = z.infer<typeof AuditLogContext>;

/**
 * Hash of the context for integrity verification
 * Computed from canonical JSON of relevant context fields
 */
export const ContextHash = z.object({
  /** Hash algorithm */
  algorithm: HashAlgorithm,
  /** Hash of context (tenant + org + repo + run + trace) */
  value: z.string().regex(/^[a-f0-9]+$/),
  /** Fields included in hash computation */
  fields: z.array(z.string()),
});
export type ContextHash = z.infer<typeof ContextHash>;

// =============================================================================
// Chain Integrity Schema
// =============================================================================

/**
 * Chain link for cryptographic integrity
 */
export const AuditChainLink = z.object({
  /** Sequence number within the log (monotonically increasing) */
  sequence: z.number().int().nonnegative(),

  /** Hash of the previous entry (null for first entry) */
  prevHash: SHA256Hash.nullable(),

  /** Hash of this entry's content (excluding chain fields) */
  contentHash: SHA256Hash,

  /** Hash algorithm used */
  algorithm: HashAlgorithm.default('sha256'),

  /** Timestamp when hash was computed (ISO 8601) */
  computedAt: z.string().datetime({ offset: true }),
});
export type AuditChainLink = z.infer<typeof AuditChainLink>;

// =============================================================================
// Main Audit Log Entry Schema
// =============================================================================

/**
 * Immutable Audit Log Entry
 *
 * Represents a single append-only entry in the audit log.
 * Once written, entries CANNOT be modified or deleted.
 *
 * Designed for:
 * - Tamper-evident logging via cryptographic chaining
 * - Efficient query and verification
 * - Compliance and forensic analysis
 */
export const ImmutableAuditLogEntry = z.object({
  // === Identity ===

  /** Unique entry ID */
  id: AuditLogEntryId,

  /** Schema version for future migrations */
  schemaVersion: z.literal('1.0').default('1.0'),

  // === Timestamp (WHEN) ===

  /** When the event occurred (ISO 8601 with timezone) */
  timestamp: z.string().datetime({ offset: true }),

  /** Server-side reception time (if different from timestamp) */
  receivedAt: z.string().datetime({ offset: true }).optional(),

  // === Actor (WHO) ===

  /** Actor who performed the action */
  actor: AuditLogActor,

  // === Action (WHAT) ===

  /** Action performed */
  action: AuditLogAction,

  // === Resource (ON WHAT) ===

  /** Resource being acted upon */
  resource: AuditLogResource.optional(),

  // === Outcome (RESULT) ===

  /** Outcome of the action */
  outcome: AuditLogOutcome,

  // === Context (WHERE/WHY) ===

  /** Correlation and context information */
  context: AuditLogContext,

  /** Hash of the context for integrity */
  contextHash: ContextHash.optional(),

  // === Chain Integrity (VERIFICATION) ===

  /** Cryptographic chain link */
  chain: AuditChainLink,

  // === Metadata ===

  /** Tags for categorization and filtering */
  tags: z.array(z.string().max(100)).max(50).default([]),

  /** Is this a high-risk/sensitive action? */
  highRisk: z.boolean().default(false),

  /** Compliance frameworks this entry relates to */
  compliance: z.array(z.enum([
    'soc2',
    'gdpr',
    'hipaa',
    'pci',
    'iso27001',
    'fedramp',
  ])).default([]),

  /** Additional entry-specific data (action details) */
  details: z.record(z.string(), z.unknown()).default({}),
});

export type ImmutableAuditLogEntry = z.infer<typeof ImmutableAuditLogEntry>;

// =============================================================================
// Create Entry Input Schema
// =============================================================================

/**
 * Input for creating a new audit log entry
 *
 * Excludes auto-generated fields:
 * - id: Generated by the system
 * - timestamp: Defaults to now
 * - receivedAt: Set by the server
 * - chain: Computed during append
 * - contextHash: Computed from context
 * - schemaVersion: Always current version
 */
export const CreateAuditLogEntry = ImmutableAuditLogEntry.omit({
  id: true,
  schemaVersion: true,
  receivedAt: true,
  chain: true,
  contextHash: true,
}).extend({
  /** Optional timestamp override (defaults to now) */
  timestamp: z.string().datetime({ offset: true }).optional(),
});

export type CreateAuditLogEntry = z.infer<typeof CreateAuditLogEntry>;

// =============================================================================
// Query Schema
// =============================================================================

/**
 * Query options for searching audit log entries
 */
export const AuditLogQuery = z.object({
  /** Filter by tenant ID (required for isolation) */
  tenantId: z.string().min(1),

  /** Filter by action categories */
  categories: z.array(AuditActionCategory).optional(),

  /** Filter by action types */
  actionTypes: z.array(z.string()).optional(),

  /** Filter by outcome status */
  outcomes: z.array(AuditOutcomeStatus).optional(),

  /** Filter by actor ID */
  actorId: z.string().optional(),

  /** Filter by actor type */
  actorType: AuditActorType.optional(),

  /** Filter by resource type */
  resourceType: AuditResourceType.optional(),

  /** Filter by resource ID */
  resourceId: z.string().optional(),

  /** Filter by correlation IDs */
  traceId: z.string().optional(),
  runId: z.string().optional(),
  requestId: z.string().optional(),

  /** Time range filters */
  startTime: z.string().datetime({ offset: true }).optional(),
  endTime: z.string().datetime({ offset: true }).optional(),

  /** Filter by sequence range */
  startSequence: z.number().int().nonnegative().optional(),
  endSequence: z.number().int().nonnegative().optional(),

  /** Filter by high-risk only */
  highRiskOnly: z.boolean().optional(),

  /** Filter by tags */
  tags: z.array(z.string()).optional(),

  /** Full-text search in details */
  searchText: z.string().optional(),

  /** Pagination */
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),

  /** Sort order */
  orderBy: z.enum(['asc', 'desc']).default('desc'),

  /** Include chain verification in results */
  includeChainVerification: z.boolean().default(false),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuery>;

/**
 * Query result with pagination info
 */
export const AuditLogQueryResult = z.object({
  /** Matching entries */
  entries: z.array(ImmutableAuditLogEntry),

  /** Total count of matching entries */
  total: z.number().int().nonnegative(),

  /** Whether more results exist */
  hasMore: z.boolean(),

  /** Query execution time in milliseconds */
  queryTimeMs: z.number().nonnegative(),

  /** Chain verification result (if requested) */
  chainVerification: z.object({
    valid: z.boolean(),
    entriesVerified: z.number().int().nonnegative(),
    firstInvalidSequence: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
  }).optional(),
});

export type AuditLogQueryResult = z.infer<typeof AuditLogQueryResult>;

// =============================================================================
// Audit Log Metadata
// =============================================================================

/**
 * Metadata for an audit log instance
 */
export const AuditLogMetadata = z.object({
  /** Log ID */
  id: AuditLogId,

  /** Tenant ID */
  tenantId: z.string().min(1).max(100),

  /** Scope (org-level, repo-level, etc.) */
  scope: z.enum(['tenant', 'org', 'repo']),

  /** Scope ID (org ID or repo ID) */
  scopeId: z.string().max(200).optional(),

  /** When the log was created */
  createdAt: z.string().datetime({ offset: true }),

  /** Latest entry sequence number */
  latestSequence: z.number().int().nonnegative(),

  /** Latest entry timestamp */
  latestTimestamp: z.string().datetime({ offset: true }).optional(),

  /** Hash of the latest entry (head of chain) */
  headHash: SHA256Hash.optional(),

  /** Total entry count */
  entryCount: z.number().int().nonnegative(),

  /** Whether the log has been sealed (no more writes) */
  sealed: z.boolean().default(false),

  /** When the log was sealed */
  sealedAt: z.string().datetime({ offset: true }).optional(),

  /** Reason for sealing */
  sealReason: z.string().max(500).optional(),
});

export type AuditLogMetadata = z.infer<typeof AuditLogMetadata>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique audit log entry ID
 */
export function generateAuditLogEntryId(sequence: number): AuditLogEntryId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `alog-${timestamp}-${sequence}-${random}` as AuditLogEntryId;
}

/**
 * Generate a unique audit log ID
 */
export function generateAuditLogId(tenantId: string, scope: string): AuditLogId {
  const random = Math.random().toString(36).slice(2, 10);
  return `log-${tenantId.toLowerCase()}-${scope.toLowerCase()}-${random}` as AuditLogId;
}

/**
 * Create an audit action object
 */
export function createAuditAction(
  category: AuditActionCategory,
  type: string,
  options?: {
    description?: string;
    sensitive?: boolean;
  }
): AuditLogAction {
  return AuditLogAction.parse({
    category,
    type,
    description: options?.description,
    sensitive: options?.sensitive ?? false,
  });
}

/**
 * Create an audit actor object
 */
export function createAuditActor(
  type: AuditActorType,
  id: string,
  options?: Partial<Omit<AuditLogActor, 'type' | 'id'>>
): AuditLogActor {
  return AuditLogActor.parse({
    type,
    id,
    ...options,
  });
}

/**
 * Create an audit resource object
 */
export function createAuditResource(
  type: AuditResourceType,
  id: string,
  options?: Partial<Omit<AuditLogResource, 'type' | 'id'>>
): AuditLogResource {
  return AuditLogResource.parse({
    type,
    id,
    ...options,
  });
}

/**
 * Create an audit context object
 */
export function createAuditContext(
  tenantId: string,
  options?: Partial<Omit<AuditLogContext, 'tenantId'>>
): AuditLogContext {
  return AuditLogContext.parse({
    tenantId,
    ...options,
  });
}

/**
 * Create an audit outcome object
 */
export function createAuditOutcome(
  status: AuditOutcomeStatus,
  options?: Partial<Omit<AuditLogOutcome, 'status'>>
): AuditLogOutcome {
  return AuditLogOutcome.parse({
    status,
    ...options,
  });
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate an audit log entry
 */
export function validateAuditLogEntry(entry: unknown): ImmutableAuditLogEntry {
  return ImmutableAuditLogEntry.parse(entry);
}

/**
 * Safe parse an audit log entry
 */
export function safeParseAuditLogEntry(entry: unknown): z.SafeParseReturnType<unknown, ImmutableAuditLogEntry> {
  return ImmutableAuditLogEntry.safeParse(entry);
}

/**
 * Validate a create entry input
 */
export function validateCreateAuditLogEntry(input: unknown): CreateAuditLogEntry {
  return CreateAuditLogEntry.parse(input);
}

// =============================================================================
// High-Risk Action Detection
// =============================================================================

/**
 * Action types that are considered high-risk
 */
export const HIGH_RISK_ACTIONS: readonly string[] = [
  'git.push.force',
  'git.branch.delete',
  'git.push.main',
  'policy.rule.delete',
  'policy.document.delete',
  'secret.access',
  'secret.delete',
  'secret.rotate',
  'data.export',
  'data.delete.bulk',
  'admin.user.delete',
  'admin.role.revoke',
  'approval.bypass',
  'config.security.update',
  'agent.execute.destructive',
] as const;

/**
 * Check if an action type is high-risk
 */
export function isHighRiskAction(actionType: string): boolean {
  return HIGH_RISK_ACTIONS.some(
    pattern => actionType === pattern || actionType.startsWith(pattern + '.')
  );
}

/**
 * Mark an entry input as high-risk if applicable
 */
export function markHighRiskIfApplicable(input: CreateAuditLogEntry): CreateAuditLogEntry {
  if (input.action.sensitive || isHighRiskAction(input.action.type)) {
    return { ...input, highRisk: true };
  }
  return input;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = '1.0' as const;

/**
 * Default hash algorithm
 */
export const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';

/**
 * Maximum entries per query
 */
export const MAX_QUERY_LIMIT = 1000;

/**
 * Fields included in context hash computation
 */
export const CONTEXT_HASH_FIELDS = [
  'tenantId',
  'orgId',
  'repoId',
  'runId',
  'traceId',
] as const;
