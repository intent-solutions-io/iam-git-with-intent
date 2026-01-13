/**
 * Policy Violation Schema
 *
 * Epic D: Policy & Audit - Story D5: Violation Detection
 * Task D5.1: Define violation types
 *
 * Categorizes policy violations with severity levels for:
 * - Policy enforcement (denied actions)
 * - Approval workflow bypasses
 * - Rate/quota limit violations
 * - Anomaly detection alerts
 *
 * @module @gwi/core/policy/violation-schema
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';

// =============================================================================
// Violation Types
// =============================================================================

/**
 * Types of policy violations that can be detected
 *
 * - policy-denied: Action blocked by an active policy rule
 * - approval-bypassed: Required approval was skipped or circumvented
 * - limit-exceeded: Rate limit, quota, or resource limit exceeded
 * - anomaly-detected: Unusual pattern detected by anomaly detection
 */
export const ViolationType = z.enum([
  'policy-denied',
  'approval-bypassed',
  'limit-exceeded',
  'anomaly-detected',
]);
export type ViolationType = z.infer<typeof ViolationType>;

/**
 * Human-readable descriptions for violation types
 */
export const VIOLATION_TYPE_DESCRIPTIONS: Record<ViolationType, string> = {
  'policy-denied': 'Action was blocked by an active policy rule',
  'approval-bypassed': 'Required approval workflow was skipped or circumvented',
  'limit-exceeded': 'Rate limit, quota, or resource limit was exceeded',
  'anomaly-detected': 'Unusual or suspicious pattern was detected',
};

// =============================================================================
// Severity Levels
// =============================================================================

/**
 * Severity levels for violations
 *
 * - critical: Immediate action required, potential security breach
 * - high: Urgent attention needed, significant policy breach
 * - medium: Should be addressed soon, moderate risk
 * - low: Informational, minor policy deviation
 */
export const ViolationSeverity = z.enum(['critical', 'high', 'medium', 'low']);
export type ViolationSeverity = z.infer<typeof ViolationSeverity>;

/**
 * Numeric weights for severity levels (for sorting and aggregation)
 */
export const SEVERITY_WEIGHTS: Record<ViolationSeverity, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

/**
 * Default severity for each violation type
 */
export const DEFAULT_VIOLATION_SEVERITY: Record<ViolationType, ViolationSeverity> = {
  'policy-denied': 'high',
  'approval-bypassed': 'critical',
  'limit-exceeded': 'medium',
  'anomaly-detected': 'high',
};

// =============================================================================
// Violation Status
// =============================================================================

/**
 * Status of a violation in the workflow
 *
 * - detected: Violation has been detected but not yet reviewed
 * - acknowledged: Violation has been seen by an operator
 * - investigating: Violation is under investigation
 * - resolved: Violation has been addressed
 * - dismissed: Violation was reviewed and dismissed (false positive, etc.)
 * - escalated: Violation has been escalated to higher authority
 */
export const ViolationStatus = z.enum([
  'detected',
  'acknowledged',
  'investigating',
  'resolved',
  'dismissed',
  'escalated',
]);
export type ViolationStatus = z.infer<typeof ViolationStatus>;

// =============================================================================
// Violation Source
// =============================================================================

/**
 * Source/origin of the violation detection
 */
export const ViolationSource = z.enum([
  'policy-engine',     // Detected by policy evaluation engine
  'approval-gate',     // Detected by approval workflow gate
  'rate-limiter',      // Detected by rate limiting system
  'quota-manager',     // Detected by quota management
  'anomaly-detector',  // Detected by anomaly detection system
  'audit-scanner',     // Detected by audit log scanning
  'external',          // Reported by external system
  'manual',            // Manually reported by operator
]);
export type ViolationSource = z.infer<typeof ViolationSource>;

// =============================================================================
// Violation ID
// =============================================================================

/**
 * Violation ID format: viol-{timestamp}-{type-prefix}-{random}
 * - timestamp: Unix timestamp in milliseconds
 * - type-prefix: First 2 chars of violation type
 * - random: 6-character random suffix
 */
export const ViolationId = z.string().regex(
  /^viol-\d+-[a-z]{2}-[a-z0-9]{6}$/,
  'Invalid violation ID format'
);
export type ViolationId = z.infer<typeof ViolationId>;

/**
 * Generate a new violation ID
 */
export function generateViolationId(type: ViolationType): ViolationId {
  const timestamp = Date.now();
  const typePrefix = type.substring(0, 2);
  const random = randomBytes(3).toString('hex');
  return `viol-${timestamp}-${typePrefix}-${random}` as ViolationId;
}

// =============================================================================
// Violation Context
// =============================================================================

/**
 * Actor who triggered the violation
 */
export const ViolationActor = z.object({
  /** Actor type */
  type: z.enum(['user', 'agent', 'system', 'service', 'unknown']),
  /** Actor identifier */
  id: z.string().min(1),
  /** Display name (optional) */
  name: z.string().optional(),
  /** Email (optional) */
  email: z.string().email().optional(),
  /** IP address (optional) */
  ipAddress: z.string().optional(),
  /** User agent (optional) */
  userAgent: z.string().optional(),
});
export type ViolationActor = z.infer<typeof ViolationActor>;

/**
 * Resource involved in the violation
 */
export const ViolationResource = z.object({
  /** Resource type */
  type: z.string().min(1),
  /** Resource identifier */
  id: z.string().min(1),
  /** Display name (optional) */
  name: z.string().optional(),
  /** Parent resource (optional) */
  parent: z.object({
    type: z.string(),
    id: z.string(),
  }).optional(),
  /** Additional attributes */
  attributes: z.record(z.unknown()).optional(),
});
export type ViolationResource = z.infer<typeof ViolationResource>;

/**
 * Action that caused the violation
 */
export const ViolationAction = z.object({
  /** Action type/name */
  type: z.string().min(1),
  /** Action category */
  category: z.string().optional(),
  /** Action description */
  description: z.string().optional(),
  /** Request ID associated with the action */
  requestId: z.string().optional(),
});
export type ViolationAction = z.infer<typeof ViolationAction>;

// =============================================================================
// Policy Denied Details
// =============================================================================

/**
 * Details specific to policy-denied violations
 */
export const PolicyDeniedDetails = z.object({
  /** ID of the policy that denied the action */
  policyId: z.string().min(1),
  /** Name of the policy */
  policyName: z.string().optional(),
  /** ID of the specific rule that triggered */
  ruleId: z.string().min(1),
  /** Rule description */
  ruleDescription: z.string().optional(),
  /** Conditions that matched */
  matchedConditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    expected: z.unknown(),
    actual: z.unknown(),
  })).optional(),
  /** Effect applied (deny, block, etc.) */
  effect: z.string(),
});
export type PolicyDeniedDetails = z.infer<typeof PolicyDeniedDetails>;

// =============================================================================
// Approval Bypassed Details
// =============================================================================

/**
 * Details specific to approval-bypassed violations
 */
export const ApprovalBypassedDetails = z.object({
  /** ID of the approval workflow bypassed */
  workflowId: z.string().min(1),
  /** Name of the workflow */
  workflowName: z.string().optional(),
  /** Required approvers that were bypassed */
  requiredApprovers: z.array(z.string()).optional(),
  /** Approval level required */
  requiredLevel: z.string().optional(),
  /** How the bypass occurred */
  bypassMethod: z.enum([
    'skip',           // Approval step was skipped
    'force',          // Forced through without approval
    'expired',        // Approval request expired
    'revoked',        // Previous approval was revoked
    'insufficient',   // Insufficient approvers
    'unauthorized',   // Unauthorized approver
    'other',
  ]),
  /** Time window for approval (if applicable) */
  approvalWindow: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }).optional(),
});
export type ApprovalBypassedDetails = z.infer<typeof ApprovalBypassedDetails>;

// =============================================================================
// Limit Exceeded Details
// =============================================================================

/**
 * Details specific to limit-exceeded violations
 */
export const LimitExceededDetails = z.object({
  /** Type of limit exceeded */
  limitType: z.enum([
    'rate',           // Requests per time window
    'quota',          // Resource allocation quota
    'concurrency',    // Concurrent operation limit
    'size',           // Size/volume limit
    'count',          // Item count limit
    'cost',           // Cost/budget limit
    'other',
  ]),
  /** Name of the specific limit */
  limitName: z.string().min(1),
  /** The limit value */
  limit: z.number(),
  /** The actual value that exceeded the limit */
  actual: z.number(),
  /** Unit of measurement */
  unit: z.string().optional(),
  /** Time window for rate limits */
  window: z.object({
    duration: z.number(),
    unit: z.enum(['second', 'minute', 'hour', 'day', 'week', 'month']),
  }).optional(),
  /** Percentage over limit */
  percentOver: z.number().optional(),
  /** Reset time (when limit resets) */
  resetAt: z.coerce.date().optional(),
});
export type LimitExceededDetails = z.infer<typeof LimitExceededDetails>;

// =============================================================================
// Anomaly Detected Details
// =============================================================================

/**
 * Details specific to anomaly-detected violations
 */
export const AnomalyDetectedDetails = z.object({
  /** Type of anomaly detected */
  anomalyType: z.enum([
    'behavioral',       // Unusual user/system behavior
    'temporal',         // Unusual timing pattern
    'volumetric',       // Unusual volume/frequency
    'geographic',       // Unusual location
    'sequential',       // Unusual sequence of actions
    'statistical',      // Statistical outlier
    'signature',        // Known bad pattern match
    'other',
  ]),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Anomaly score/severity (0-100) */
  score: z.number().min(0).max(100),
  /** Baseline value (what was expected) */
  baseline: z.unknown().optional(),
  /** Observed value */
  observed: z.unknown().optional(),
  /** Detection model/algorithm used */
  detectionModel: z.string().optional(),
  /** Contributing factors */
  factors: z.array(z.object({
    name: z.string(),
    weight: z.number(),
    value: z.unknown(),
  })).optional(),
  /** Related historical events */
  relatedEvents: z.array(z.string()).optional(),
});
export type AnomalyDetectedDetails = z.infer<typeof AnomalyDetectedDetails>;

// =============================================================================
// Unified Violation Details
// =============================================================================

/**
 * Union of all violation detail types
 */
export const ViolationDetails = z.discriminatedUnion('violationType', [
  z.object({
    violationType: z.literal('policy-denied'),
    ...PolicyDeniedDetails.shape,
  }),
  z.object({
    violationType: z.literal('approval-bypassed'),
    ...ApprovalBypassedDetails.shape,
  }),
  z.object({
    violationType: z.literal('limit-exceeded'),
    ...LimitExceededDetails.shape,
  }),
  z.object({
    violationType: z.literal('anomaly-detected'),
    ...AnomalyDetectedDetails.shape,
  }),
]);
export type ViolationDetails = z.infer<typeof ViolationDetails>;

// =============================================================================
// Main Violation Schema
// =============================================================================

/**
 * Complete violation record
 */
export const Violation = z.object({
  /** Unique violation identifier */
  id: ViolationId,

  /** Tenant this violation belongs to */
  tenantId: z.string().min(1),

  /** Type of violation */
  type: ViolationType,

  /** Severity level */
  severity: ViolationSeverity,

  /** Current status */
  status: ViolationStatus,

  /** Source that detected the violation */
  source: ViolationSource,

  /** When the violation was detected */
  detectedAt: z.coerce.date(),

  /** Actor who triggered the violation */
  actor: ViolationActor,

  /** Resource involved */
  resource: ViolationResource,

  /** Action that caused the violation */
  action: ViolationAction,

  /** Human-readable summary */
  summary: z.string().min(1).max(500),

  /** Detailed description */
  description: z.string().optional(),

  /** Type-specific details */
  details: ViolationDetails,

  /** Related audit log entry IDs */
  auditLogEntries: z.array(z.string()).optional(),

  /** Tags for categorization */
  tags: z.array(z.string()).max(20).optional(),

  /** Metadata */
  metadata: z.object({
    /** Schema version */
    schemaVersion: z.literal('1.0'),
    /** When the record was created */
    createdAt: z.coerce.date(),
    /** When the record was last updated */
    updatedAt: z.coerce.date(),
    /** Who last updated the record */
    updatedBy: z.string().optional(),
    /** Resolution notes (if resolved/dismissed) */
    resolutionNotes: z.string().optional(),
    /** Escalation target (if escalated) */
    escalatedTo: z.string().optional(),
  }),
});
export type Violation = z.infer<typeof Violation>;

// =============================================================================
// Input Schema (for creating violations)
// =============================================================================

/**
 * Input for creating a new violation
 */
export const CreateViolationInput = z.object({
  /** Tenant ID */
  tenantId: z.string().min(1),

  /** Type of violation */
  type: ViolationType,

  /** Severity (optional, uses default for type if not provided) */
  severity: ViolationSeverity.optional(),

  /** Source that detected the violation */
  source: ViolationSource,

  /** Actor who triggered the violation */
  actor: ViolationActor,

  /** Resource involved */
  resource: ViolationResource,

  /** Action that caused the violation */
  action: ViolationAction,

  /** Human-readable summary */
  summary: z.string().min(1).max(500),

  /** Detailed description */
  description: z.string().optional(),

  /** Type-specific details */
  details: ViolationDetails,

  /** Related audit log entry IDs */
  auditLogEntries: z.array(z.string()).optional(),

  /** Tags for categorization */
  tags: z.array(z.string()).max(20).optional(),
});
export type CreateViolationInput = z.infer<typeof CreateViolationInput>;

// =============================================================================
// Query Schema
// =============================================================================

/**
 * Options for querying violations
 */
export const ViolationQuery = z.object({
  /** Tenant ID (required) */
  tenantId: z.string().min(1),

  /** Filter by violation types */
  types: z.array(ViolationType).optional(),

  /** Filter by severity levels */
  severities: z.array(ViolationSeverity).optional(),

  /** Filter by statuses */
  statuses: z.array(ViolationStatus).optional(),

  /** Filter by sources */
  sources: z.array(ViolationSource).optional(),

  /** Filter by actor ID */
  actorId: z.string().optional(),

  /** Filter by resource type */
  resourceType: z.string().optional(),

  /** Filter by resource ID */
  resourceId: z.string().optional(),

  /** Start time (inclusive) */
  startTime: z.coerce.date().optional(),

  /** End time (exclusive) */
  endTime: z.coerce.date().optional(),

  /** Filter by tags (any match) */
  tags: z.array(z.string()).optional(),

  /** Maximum results */
  limit: z.number().int().min(1).max(1000).default(100),

  /** Offset for pagination */
  offset: z.number().int().min(0).default(0),

  /** Sort field */
  sortBy: z.enum(['detectedAt', 'severity', 'status', 'type']).default('detectedAt'),

  /** Sort order */
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ViolationQuery = z.infer<typeof ViolationQuery>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new violation from input
 */
export function createViolation(input: CreateViolationInput): Violation {
  const now = new Date();
  const severity = input.severity ?? DEFAULT_VIOLATION_SEVERITY[input.type];

  return {
    id: generateViolationId(input.type),
    tenantId: input.tenantId,
    type: input.type,
    severity,
    status: 'detected',
    source: input.source,
    detectedAt: now,
    actor: input.actor,
    resource: input.resource,
    action: input.action,
    summary: input.summary,
    description: input.description,
    details: input.details,
    auditLogEntries: input.auditLogEntries,
    tags: input.tags,
    metadata: {
      schemaVersion: '1.0',
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Create a policy-denied violation
 */
export function createPolicyDeniedViolation(
  tenantId: string,
  actor: ViolationActor,
  resource: ViolationResource,
  action: ViolationAction,
  policyDetails: Omit<PolicyDeniedDetails, never>,
  options?: {
    severity?: ViolationSeverity;
    description?: string;
    auditLogEntries?: string[];
    tags?: string[];
  }
): Violation {
  return createViolation({
    tenantId,
    type: 'policy-denied',
    severity: options?.severity,
    source: 'policy-engine',
    actor,
    resource,
    action,
    summary: `Action denied by policy: ${policyDetails.policyName ?? policyDetails.policyId}`,
    description: options?.description,
    details: {
      violationType: 'policy-denied',
      ...policyDetails,
    },
    auditLogEntries: options?.auditLogEntries,
    tags: options?.tags,
  });
}

/**
 * Create an approval-bypassed violation
 */
export function createApprovalBypassedViolation(
  tenantId: string,
  actor: ViolationActor,
  resource: ViolationResource,
  action: ViolationAction,
  approvalDetails: Omit<ApprovalBypassedDetails, never>,
  options?: {
    severity?: ViolationSeverity;
    description?: string;
    auditLogEntries?: string[];
    tags?: string[];
  }
): Violation {
  return createViolation({
    tenantId,
    type: 'approval-bypassed',
    severity: options?.severity,
    source: 'approval-gate',
    actor,
    resource,
    action,
    summary: `Approval bypassed: ${approvalDetails.workflowName ?? approvalDetails.workflowId} (${approvalDetails.bypassMethod})`,
    description: options?.description,
    details: {
      violationType: 'approval-bypassed',
      ...approvalDetails,
    },
    auditLogEntries: options?.auditLogEntries,
    tags: options?.tags,
  });
}

/**
 * Create a limit-exceeded violation
 */
export function createLimitExceededViolation(
  tenantId: string,
  actor: ViolationActor,
  resource: ViolationResource,
  action: ViolationAction,
  limitDetails: Omit<LimitExceededDetails, never>,
  options?: {
    severity?: ViolationSeverity;
    description?: string;
    auditLogEntries?: string[];
    tags?: string[];
  }
): Violation {
  const percentOver = limitDetails.percentOver ??
    Math.round(((limitDetails.actual - limitDetails.limit) / limitDetails.limit) * 100);

  return createViolation({
    tenantId,
    type: 'limit-exceeded',
    severity: options?.severity,
    source: limitDetails.limitType === 'rate' ? 'rate-limiter' : 'quota-manager',
    actor,
    resource,
    action,
    summary: `${limitDetails.limitType} limit exceeded: ${limitDetails.actual}/${limitDetails.limit} ${limitDetails.unit ?? ''} (${percentOver}% over)`.trim(),
    description: options?.description,
    details: {
      violationType: 'limit-exceeded',
      ...limitDetails,
      percentOver,
    },
    auditLogEntries: options?.auditLogEntries,
    tags: options?.tags,
  });
}

/**
 * Create an anomaly-detected violation
 */
export function createAnomalyDetectedViolation(
  tenantId: string,
  actor: ViolationActor,
  resource: ViolationResource,
  action: ViolationAction,
  anomalyDetails: Omit<AnomalyDetectedDetails, never>,
  options?: {
    severity?: ViolationSeverity;
    description?: string;
    auditLogEntries?: string[];
    tags?: string[];
  }
): Violation {
  return createViolation({
    tenantId,
    type: 'anomaly-detected',
    severity: options?.severity,
    source: 'anomaly-detector',
    actor,
    resource,
    action,
    summary: `${anomalyDetails.anomalyType} anomaly detected (confidence: ${Math.round(anomalyDetails.confidence * 100)}%, score: ${anomalyDetails.score})`,
    description: options?.description,
    details: {
      violationType: 'anomaly-detected',
      ...anomalyDetails,
    },
    auditLogEntries: options?.auditLogEntries,
    tags: options?.tags,
  });
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a violation object
 */
export function validateViolation(data: unknown): Violation {
  return Violation.parse(data);
}

/**
 * Safe parse a violation (returns result object)
 */
export function safeParseViolation(data: unknown): z.SafeParseReturnType<unknown, Violation> {
  return Violation.safeParse(data);
}

/**
 * Validate create violation input
 */
export function validateCreateViolationInput(data: unknown): CreateViolationInput {
  return CreateViolationInput.parse(data);
}

/**
 * Validate violation query
 */
export function validateViolationQuery(data: unknown): ViolationQuery {
  return ViolationQuery.parse(data);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a valid violation type
 */
export function isViolationType(value: unknown): value is ViolationType {
  return ViolationType.safeParse(value).success;
}

/**
 * Check if a value is a valid violation severity
 */
export function isViolationSeverity(value: unknown): value is ViolationSeverity {
  return ViolationSeverity.safeParse(value).success;
}

/**
 * Check if a value is a valid violation status
 */
export function isViolationStatus(value: unknown): value is ViolationStatus {
  return ViolationStatus.safeParse(value).success;
}

/**
 * Check if a value is a valid violation
 */
export function isViolation(value: unknown): value is Violation {
  return Violation.safeParse(value).success;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the numeric weight for a severity level
 */
export function getSeverityWeight(severity: ViolationSeverity): number {
  return SEVERITY_WEIGHTS[severity];
}

/**
 * Compare two violations by severity (for sorting)
 */
export function compareBySeverity(a: Violation, b: Violation): number {
  return getSeverityWeight(b.severity) - getSeverityWeight(a.severity);
}

/**
 * Get the description for a violation type
 */
export function getViolationTypeDescription(type: ViolationType): string {
  return VIOLATION_TYPE_DESCRIPTIONS[type];
}

/**
 * Calculate aggregate severity for multiple violations
 */
export function calculateAggregateSeverity(violations: Violation[]): ViolationSeverity {
  if (violations.length === 0) return 'low';

  const maxWeight = Math.max(...violations.map((v) => getSeverityWeight(v.severity)));

  if (maxWeight >= SEVERITY_WEIGHTS.critical) return 'critical';
  if (maxWeight >= SEVERITY_WEIGHTS.high) return 'high';
  if (maxWeight >= SEVERITY_WEIGHTS.medium) return 'medium';
  return 'low';
}

// =============================================================================
// Constants
// =============================================================================

/** Current schema version */
export const VIOLATION_SCHEMA_VERSION = '1.0';

/** All violation types */
export const ALL_VIOLATION_TYPES = ViolationType.options;

/** All severity levels */
export const ALL_SEVERITY_LEVELS = ViolationSeverity.options;

/** All violation statuses */
export const ALL_VIOLATION_STATUSES = ViolationStatus.options;

/** All violation sources */
export const ALL_VIOLATION_SOURCES = ViolationSource.options;
