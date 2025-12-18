/**
 * Approval Types
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Defines immutable approval records with cryptographic signatures.
 *
 * @module @gwi/core/approvals/types
 */

import { z } from 'zod';

// =============================================================================
// Approval Scopes (Extended)
// =============================================================================

/**
 * Approval scope - what actions are approved
 */
export const ApprovalScopeSchema = z.enum([
  'commit',       // Can commit changes
  'push',         // Can push to remote
  'open_pr',      // Can open/update PR
  'merge',        // Can merge PR
  'deploy',       // Can deploy to environment
]);

export type ApprovalScope = z.infer<typeof ApprovalScopeSchema>;

/**
 * All possible approval scopes
 */
export const ALL_APPROVAL_SCOPES: ApprovalScope[] = [
  'commit',
  'push',
  'open_pr',
  'merge',
  'deploy',
];

// =============================================================================
// Approval Command Types
// =============================================================================

/**
 * Approval command actions
 */
export const ApprovalCommandAction = z.enum([
  'approve',
  'deny',
  'revoke',
]);

export type ApprovalCommandAction = z.infer<typeof ApprovalCommandAction>;

/**
 * Source of approval command
 */
export const ApprovalCommandSource = z.enum([
  'pr_comment',
  'issue_comment',
  'review_comment',
  'cli',
  'api',
]);

export type ApprovalCommandSource = z.infer<typeof ApprovalCommandSource>;

/**
 * Target type for approval
 */
export const ApprovalTargetType = z.enum([
  'candidate',
  'run',
  'pr',
]);

export type ApprovalTargetType = z.infer<typeof ApprovalTargetType>;

/**
 * Parsed approval command
 */
export const ParsedApprovalCommand = z.object({
  /** Command action */
  action: ApprovalCommandAction,

  /** Target type */
  targetType: ApprovalTargetType,

  /** Target ID (candidateId, runId, or PR number) */
  targetId: z.string(),

  /** Scopes being approved/denied */
  scopes: z.array(ApprovalScopeSchema),

  /** Reason for denial (required for deny) */
  reason: z.string().optional(),

  /** Source of the command */
  source: ApprovalCommandSource,

  /** Raw command text */
  rawCommand: z.string(),
});

export type ParsedApprovalCommand = z.infer<typeof ParsedApprovalCommand>;

// =============================================================================
// Approver Identity
// =============================================================================

/**
 * Approver type
 */
export const ApproverType = z.enum([
  'user',
  'service',
  'org',
]);

export type ApproverType = z.infer<typeof ApproverType>;

/**
 * Approver identity
 */
export const ApproverIdentity = z.object({
  /** Approver type */
  type: ApproverType,

  /** Unique identifier (user ID, service account name) */
  id: z.string(),

  /** Display name */
  displayName: z.string().optional(),

  /** Email (if available) */
  email: z.string().email().optional(),

  /** GitHub username (if from GitHub) */
  githubUsername: z.string().optional(),

  /** Organization (if org-scoped) */
  organization: z.string().optional(),
});

export type ApproverIdentity = z.infer<typeof ApproverIdentity>;

// =============================================================================
// Signed Approval Object
// =============================================================================

/**
 * Approval decision
 */
export const ApprovalDecision = z.enum([
  'approved',
  'denied',
  'revoked',
]);

export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

/**
 * Signed approval record
 *
 * Immutable, append-only record of an approval decision.
 */
export const SignedApproval = z.object({
  /** Unique approval ID */
  approvalId: z.string().uuid(),

  /** Tenant ID for isolation */
  tenantId: z.string(),

  /** Approver identity */
  approver: ApproverIdentity,

  /** Approver's RBAC role at time of approval */
  approverRole: z.string(),

  /** Decision */
  decision: ApprovalDecision,

  /** Scopes approved (empty for deny/revoke) */
  scopesApproved: z.array(ApprovalScopeSchema),

  /** Target type */
  targetType: ApprovalTargetType,

  /** Target identifiers */
  target: z.object({
    candidateId: z.string().optional(),
    runId: z.string().optional(),
    prNumber: z.number().optional(),
    repo: z.string().optional(),
  }),

  /** Hash of the plan/intent being approved */
  intentHash: z.string(),

  /** Hash of the patch/diff being approved */
  patchHash: z.string().optional(),

  /** Source of approval command */
  source: ApprovalCommandSource,

  /** Reason (for deny/revoke) */
  reason: z.string().optional(),

  /** Comment */
  comment: z.string().optional(),

  /** Ed25519 signature of the approval payload */
  signature: z.string(),

  /** Public key used for signing (for verification) */
  signingKeyId: z.string(),

  // === Telemetry Correlation (Phase 23) ===

  /** Trace ID for distributed tracing */
  traceId: z.string().optional(),

  /** Request ID */
  requestId: z.string().optional(),

  /** Timestamp */
  createdAt: z.string().datetime(),

  /** Expiration (optional) */
  expiresAt: z.string().datetime().optional(),
});

export type SignedApproval = z.infer<typeof SignedApproval>;

/**
 * Input for creating a signed approval
 */
export type CreateSignedApproval = Omit<
  SignedApproval,
  'approvalId' | 'signature' | 'signingKeyId' | 'createdAt'
>;

// =============================================================================
// Approval Status
// =============================================================================

/**
 * Approval status for a target
 */
export const ApprovalStatus = z.object({
  /** Target ID */
  targetId: z.string(),

  /** Target type */
  targetType: ApprovalTargetType,

  /** Current status */
  status: z.enum(['pending', 'approved', 'denied', 'revoked', 'expired']),

  /** Active approvals */
  approvals: z.array(SignedApproval),

  /** Required approvals count */
  requiredApprovals: z.number(),

  /** Current approvals count */
  currentApprovals: z.number(),

  /** Missing scopes */
  missingScopes: z.array(ApprovalScopeSchema),

  /** Denial reasons (if denied) */
  denialReasons: z.array(z.string()).optional(),
});

export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

// =============================================================================
// Approval Events (for Audit)
// =============================================================================

/**
 * Approval audit event types
 */
export const ApprovalEventType = z.enum([
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'approval.revoked',
  'approval.expired',
  'approval.verified',
  'approval.rejected',
]);

export type ApprovalEventType = z.infer<typeof ApprovalEventType>;

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate approval ID
 */
export function generateApprovalId(): string {
  // Use crypto.randomUUID() for UUID v4
  return crypto.randomUUID();
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate approval scopes
 */
export function validateScopes(scopes: string[]): ApprovalScope[] {
  return scopes.filter((s): s is ApprovalScope =>
    ALL_APPROVAL_SCOPES.includes(s as ApprovalScope)
  );
}

/**
 * Check if scopes include required scope
 */
export function hasRequiredScope(
  approvedScopes: ApprovalScope[],
  requiredScope: ApprovalScope
): boolean {
  return approvedScopes.includes(requiredScope);
}

/**
 * Check if all required scopes are approved
 */
export function hasAllRequiredScopes(
  approvedScopes: ApprovalScope[],
  requiredScopes: ApprovalScope[]
): boolean {
  return requiredScopes.every((s) => approvedScopes.includes(s));
}
