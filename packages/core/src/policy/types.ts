/**
 * Policy Engine Types
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Defines types for the deterministic policy evaluation engine.
 *
 * @module @gwi/core/policy/types
 */

import { z } from 'zod';
import type { SignedApproval, ApprovalScope } from '../approvals/types.js';
import type { RBACRole } from '../security/rbac.js';

// =============================================================================
// Policy Decision
// =============================================================================

/**
 * Policy evaluation decision
 */
export const PolicyDecision = z.enum([
  'ALLOW',
  'DENY',
  'REQUIRE_MORE_APPROVALS',
]);

export type PolicyDecision = z.infer<typeof PolicyDecision>;

// =============================================================================
// Action Types
// =============================================================================

/**
 * Actions that can be governed by policy
 */
export const PolicyAction = z.enum([
  // Git operations
  'git.commit',
  'git.push',
  'git.branch.create',
  'git.branch.delete',

  // PR operations
  'pr.create',
  'pr.update',
  'pr.merge',
  'pr.close',

  // Deployment
  'deploy.staging',
  'deploy.production',

  // Admin operations
  'tenant.delete',
  'member.remove',
  'billing.update',

  // Candidate operations
  'candidate.execute',
  'candidate.approve',
  'candidate.reject',

  // Connector operations (Phase 29)
  'connector.install',
  'connector.uninstall',
  'connector.upgrade',
]);

export type PolicyAction = z.infer<typeof PolicyAction>;

// =============================================================================
// Policy Context
// =============================================================================

/**
 * Actor performing the action
 */
export interface PolicyActor {
  /** Actor ID */
  id: string;
  /** Actor type */
  type: 'user' | 'service' | 'webhook';
  /** RBAC role */
  role: RBACRole;
  /** Email (if user) */
  email?: string;
  /** Organization membership */
  organizations?: string[];
}

/**
 * Resource being acted upon
 */
export interface PolicyResource {
  /** Resource type */
  type: 'candidate' | 'run' | 'pr' | 'repo' | 'tenant' | 'connector';
  /** Resource ID */
  id: string;
  /** Repository (owner/name) */
  repo?: string;
  /** Is protected branch? */
  isProtectedBranch?: boolean;
  /** Is production deployment? */
  isProduction?: boolean;
  /** Connector capabilities (Phase 29) */
  capabilities?: string[];
  /** Is verified connector? (Phase 29) */
  isVerified?: boolean;
}

/**
 * Environmental context
 */
export interface PolicyEnvironment {
  /** Current time */
  timestamp: Date;
  /** Day of week (0=Sunday) */
  dayOfWeek: number;
  /** Hour of day (0-23) */
  hour: number;
  /** Timezone */
  timezone: string;
  /** Is business hours? (computed) */
  isBusinessHours: boolean;
}

/**
 * Full policy evaluation context
 */
export interface PolicyContext {
  /** Tenant ID */
  tenantId: string;

  /** Action being performed */
  action: PolicyAction;

  /** Actor performing the action */
  actor: PolicyActor;

  /** Resource being acted upon */
  resource: PolicyResource;

  /** Environmental context */
  environment: PolicyEnvironment;

  /** Existing approvals for this resource */
  approvals: SignedApproval[];

  /** Required scopes for this action */
  requiredScopes: ApprovalScope[];

  /** Plan/intent document (if available) */
  plan?: {
    hash: string;
    content?: string;
  };

  /** Patch content (if available) */
  patch?: {
    hash: string;
    content?: string;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

// =============================================================================
// Policy Result
// =============================================================================

/**
 * Detailed reason for policy decision
 */
export interface PolicyReason {
  /** Policy that triggered this reason */
  policyId: string;
  /** Human-readable message */
  message: string;
  /** Required condition that wasn't met */
  requirement?: string;
  /** What would satisfy this requirement */
  resolution?: string;
}

/**
 * Policy evaluation result
 */
export interface PolicyResult {
  /** Decision */
  decision: PolicyDecision;

  /** Reasons for decision */
  reasons: PolicyReason[];

  /** Policies that were evaluated */
  policiesEvaluated: string[];

  /** Missing requirements (for REQUIRE_MORE_APPROVALS) */
  missingRequirements?: {
    /** Additional approvals needed */
    approvalsNeeded: number;
    /** Missing scopes */
    missingScopes: ApprovalScope[];
    /** Required roles for approval */
    requiredRoles?: RBACRole[];
  };

  /** Evaluation timestamp */
  evaluatedAt: Date;

  /** Evaluation duration (ms) */
  durationMs: number;
}

// =============================================================================
// Policy Definition
// =============================================================================

/**
 * Policy priority (higher = evaluated first)
 */
export type PolicyPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Policy condition function
 */
export type PolicyCondition = (context: PolicyContext) => boolean;

/**
 * Policy definition
 */
export interface Policy {
  /** Unique policy ID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Priority */
  priority: PolicyPriority;

  /** Actions this policy applies to */
  actions: PolicyAction[] | '*';

  /** Condition that triggers this policy */
  condition: PolicyCondition;

  /** Evaluate the policy */
  evaluate: (context: PolicyContext) => PolicyDecision;

  /** Message when denied */
  denyMessage: (context: PolicyContext) => string;

  /** Resolution message */
  resolutionMessage?: (context: PolicyContext) => string;

  /** Is this policy enabled? */
  enabled: boolean;
}

// =============================================================================
// Policy Set
// =============================================================================

/**
 * Collection of policies
 */
export interface PolicySet {
  /** Policy set ID */
  id: string;
  /** Name */
  name: string;
  /** Description */
  description: string;
  /** Policies in this set */
  policies: Policy[];
  /** Is enabled? */
  enabled: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create environment context from date
 */
export function createEnvironmentContext(
  date: Date = new Date(),
  timezone: string = 'America/Chicago'
): PolicyEnvironment {
  const dayOfWeek = date.getDay();
  const hour = date.getHours();

  // Business hours: Monday-Friday, 9am-5pm
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWorkingHours = hour >= 9 && hour < 17;
  const isBusinessHours = isWeekday && isWorkingHours;

  return {
    timestamp: date,
    dayOfWeek,
    hour,
    timezone,
    isBusinessHours,
  };
}

/**
 * Priority order for sorting
 */
export const PRIORITY_ORDER: Record<PolicyPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};
