/**
 * Security Types and Utilities for Git With Intent
 *
 * Phase 11: Production-ready security model with:
 * - Role-based access control (RBAC)
 * - Tenant scoping and isolation
 * - Plan-based feature gates
 * - Auth context management
 *
 * @module @gwi/core/security
 */

// =============================================================================
// Role Model
// =============================================================================

/**
 * User roles within a tenant (ordered by privilege level)
 *
 * OWNER: Full access, can delete tenant, manage billing
 * ADMIN: Full operational access, can manage members
 * DEVELOPER: Can trigger runs, view logs, modify repo settings
 * VIEWER: Read-only access to runs and logs
 */
export type Role = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

/**
 * Role hierarchy for permission checks
 * Higher number = more privileges
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Check if a role has at least the required privilege level
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// =============================================================================
// Permission Actions
// =============================================================================

/**
 * Actions that can be performed on resources
 */
export type Action =
  // Tenant actions
  | 'tenant:read'
  | 'tenant:update'
  | 'tenant:delete'
  | 'tenant:billing'
  // Member actions
  | 'member:invite'
  | 'member:remove'
  | 'member:update_role'
  // Repo actions
  | 'repo:read'
  | 'repo:connect'
  | 'repo:disconnect'
  | 'repo:settings'
  // Run actions
  | 'run:read'
  | 'run:create'
  | 'run:cancel'
  // Settings actions
  | 'settings:read'
  | 'settings:update';

/**
 * Permission matrix: which roles can perform which actions
 */
export const PERMISSIONS: Record<Action, Role[]> = {
  // Tenant
  'tenant:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'tenant:update': ['ADMIN', 'OWNER'],
  'tenant:delete': ['OWNER'],
  'tenant:billing': ['OWNER'],
  // Members
  'member:invite': ['ADMIN', 'OWNER'],
  'member:remove': ['ADMIN', 'OWNER'],
  'member:update_role': ['OWNER'],
  // Repos
  'repo:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'repo:connect': ['ADMIN', 'OWNER'],
  'repo:disconnect': ['ADMIN', 'OWNER'],
  'repo:settings': ['DEVELOPER', 'ADMIN', 'OWNER'],
  // Runs
  'run:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'run:create': ['DEVELOPER', 'ADMIN', 'OWNER'],
  'run:cancel': ['DEVELOPER', 'ADMIN', 'OWNER'],
  // Settings
  'settings:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'settings:update': ['ADMIN', 'OWNER'],
};

/**
 * Check if a role can perform an action
 */
export function canPerform(role: Role, action: Action): boolean {
  return PERMISSIONS[action]?.includes(role) ?? false;
}

// =============================================================================
// Auth Context
// =============================================================================

/**
 * Authenticated request context
 */
export interface AuthContext {
  /** Firebase Auth UID */
  userId: string;

  /** User's email (from Firebase Auth) */
  email?: string;

  /** User's display name */
  displayName?: string;

  /** Current tenant ID (if in tenant context) */
  tenantId?: string;

  /** User's role in the current tenant */
  role?: Role;

  /** Is this a service account (Cloud Run)? */
  isServiceAccount: boolean;

  /** Token expiration time */
  expiresAt?: Date;
}

/**
 * Create an unauthenticated context
 */
export function createAnonymousContext(): AuthContext {
  return {
    userId: 'anonymous',
    isServiceAccount: false,
  };
}

/**
 * Create a service account context (for Cloud Run services)
 */
export function createServiceAccountContext(serviceId: string): AuthContext {
  return {
    userId: serviceId,
    isServiceAccount: true,
  };
}

// =============================================================================
// Plan and Billing Types
// =============================================================================

/**
 * Available plan tiers
 */
export type PlanId = 'free' | 'pro' | 'enterprise';

/**
 * Plan configuration with limits and features
 */
export interface PlanConfig {
  id: PlanId;
  name: string;
  description: string;

  /** Resource limits */
  limits: {
    /** Max runs per month */
    maxMonthlyRuns: number;
    /** Max connected repos */
    maxRepos: number;
    /** Max team members */
    maxMembers: number;
    /** Max concurrent runs */
    maxConcurrentRuns: number;
  };

  /** Enabled features */
  features: PlanFeature[];

  /** Price in cents per month (0 = free) */
  priceMonthly: number;
}

/**
 * Feature flags that can be enabled per plan
 */
export type PlanFeature =
  | 'multi-model'           // Use Claude Opus for complex resolutions
  | 'priority-queue'        // Priority run queue
  | 'advanced-analytics'    // Detailed run analytics
  | 'custom-webhooks'       // Custom webhook integrations
  | 'sso'                   // SSO/SAML authentication
  | 'audit-logs'            // Full audit logging
  | 'api-access'            // API access for integrations
  | 'auto-push'             // Auto-push resolved changes
  | 'support-priority';     // Priority support

/**
 * Default plan configurations
 */
export const PLAN_CONFIGS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out Git With Intent',
    limits: {
      maxMonthlyRuns: 50,
      maxRepos: 3,
      maxMembers: 3,
      maxConcurrentRuns: 1,
    },
    features: ['api-access'],
    priceMonthly: 0,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For professional teams',
    limits: {
      maxMonthlyRuns: 500,
      maxRepos: 20,
      maxMembers: 15,
      maxConcurrentRuns: 5,
    },
    features: [
      'multi-model',
      'advanced-analytics',
      'custom-webhooks',
      'api-access',
      'auto-push',
      'audit-logs',
    ],
    priceMonthly: 4900, // $49/month
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom needs',
    limits: {
      maxMonthlyRuns: 10000,
      maxRepos: 200,
      maxMembers: 100,
      maxConcurrentRuns: 20,
    },
    features: [
      'multi-model',
      'priority-queue',
      'advanced-analytics',
      'custom-webhooks',
      'sso',
      'audit-logs',
      'api-access',
      'auto-push',
      'support-priority',
    ],
    priceMonthly: 29900, // $299/month
  },
};

/**
 * Get plan config by ID
 */
export function getPlanConfig(planId: PlanId): PlanConfig {
  return PLAN_CONFIGS[planId] ?? PLAN_CONFIGS.free;
}

/**
 * Check if a plan has a specific feature
 */
export function planHasFeature(planId: PlanId, feature: PlanFeature): boolean {
  const config = getPlanConfig(planId);
  return config.features.includes(feature);
}

// =============================================================================
// Plan Limit Enforcement
// =============================================================================

/**
 * Plan limit check result
 */
export interface PlanLimitCheck {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
}

/**
 * Check if a tenant can create a new run
 */
export function checkRunLimit(
  runsThisMonth: number,
  planId: PlanId
): PlanLimitCheck {
  const config = getPlanConfig(planId);
  const limit = config.limits.maxMonthlyRuns;

  if (runsThisMonth >= limit) {
    return {
      allowed: false,
      reason: `Monthly run limit reached (${limit} runs/month on ${config.name} plan)`,
      currentUsage: runsThisMonth,
      limit,
    };
  }

  return {
    allowed: true,
    currentUsage: runsThisMonth,
    limit,
  };
}

/**
 * Check if a tenant can connect more repos
 */
export function checkRepoLimit(
  currentRepos: number,
  planId: PlanId
): PlanLimitCheck {
  const config = getPlanConfig(planId);
  const limit = config.limits.maxRepos;

  if (currentRepos >= limit) {
    return {
      allowed: false,
      reason: `Repository limit reached (${limit} repos on ${config.name} plan)`,
      currentUsage: currentRepos,
      limit,
    };
  }

  return {
    allowed: true,
    currentUsage: currentRepos,
    limit,
  };
}

/**
 * Check if a tenant can add more members
 */
export function checkMemberLimit(
  currentMembers: number,
  planId: PlanId
): PlanLimitCheck {
  const config = getPlanConfig(planId);
  const limit = config.limits.maxMembers;

  if (currentMembers >= limit) {
    return {
      allowed: false,
      reason: `Member limit reached (${limit} members on ${config.name} plan)`,
      currentUsage: currentMembers,
      limit,
    };
  }

  return {
    allowed: true,
    currentUsage: currentMembers,
    limit,
  };
}

// =============================================================================
// Tenant Membership
// =============================================================================

/**
 * Enhanced membership type with role
 */
export interface TenantMembership {
  userId: string;
  tenantId: string;
  role: Role;
  invitedBy?: string;
  invitedAt?: Date;
  acceptedAt?: Date;
  status: 'active' | 'pending' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Rejection Reasons (for state logging)
// =============================================================================

/**
 * Standard rejection reasons for audit logging
 */
export type RejectionReason =
  | 'PLAN_LIMIT_RUNS'
  | 'PLAN_LIMIT_REPOS'
  | 'PLAN_LIMIT_MEMBERS'
  | 'PLAN_FEATURE_DISABLED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TENANT_SUSPENDED'
  | 'TENANT_NOT_FOUND'
  | 'INVALID_REQUEST';

/**
 * Create a rejection event for logging
 */
export function createRejectionEvent(
  tenantId: string,
  reason: RejectionReason,
  details?: string
): {
  type: 'run_rejected';
  tenantId: string;
  reason: RejectionReason;
  details?: string;
  timestamp: string;
} {
  return {
    type: 'run_rejected',
    tenantId,
    reason,
    details,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Beta Program (Phase 12)
// =============================================================================

/**
 * Beta access modes
 */
export type BetaAccessMode = 'open' | 'invite_only' | 'closed';

/**
 * Beta program configuration
 */
export interface BetaConfig {
  /** Whether beta signup is enabled */
  enabled: boolean;
  /** Access mode for beta signups */
  accessMode: BetaAccessMode;
  /** List of valid beta invite codes (when accessMode is 'invite_only') */
  validInviteCodes?: string[];
  /** Features enabled for beta users */
  betaFeatures: BetaFeature[];
  /** Max beta users allowed (0 = unlimited) */
  maxBetaUsers: number;
  /** Beta period end date */
  betaEndsAt?: Date;
}

/**
 * Beta-only features
 */
export type BetaFeature =
  | 'early-access'           // Access to beta features before GA
  | 'extended-limits'        // Higher limits during beta
  | 'direct-support'         // Direct access to support channel
  | 'feedback-priority';     // Prioritized feedback handling

/**
 * Default beta configuration
 */
export const DEFAULT_BETA_CONFIG: BetaConfig = {
  enabled: true,
  accessMode: 'invite_only',
  validInviteCodes: ['GWIBETA2025', 'EARLYBIRD', 'FOUNDER50'],
  betaFeatures: ['early-access', 'extended-limits', 'direct-support', 'feedback-priority'],
  maxBetaUsers: 500,
};

/**
 * Validate a beta invite code
 */
export function validateBetaInviteCode(
  code: string,
  config: BetaConfig = DEFAULT_BETA_CONFIG
): { valid: boolean; reason?: string } {
  if (!config.enabled) {
    return { valid: false, reason: 'Beta program is not active' };
  }

  if (config.accessMode === 'open') {
    return { valid: true };
  }

  if (config.accessMode === 'closed') {
    return { valid: false, reason: 'Beta program is closed' };
  }

  // invite_only mode
  if (!config.validInviteCodes?.length) {
    return { valid: false, reason: 'No invite codes configured' };
  }

  const normalizedCode = code.trim().toUpperCase();
  const isValid = config.validInviteCodes.some(
    c => c.toUpperCase() === normalizedCode
  );

  if (!isValid) {
    return { valid: false, reason: 'Invalid invite code' };
  }

  return { valid: true };
}

/**
 * Check if beta signup is allowed
 */
export function canSignupForBeta(
  currentBetaUsers: number,
  config: BetaConfig = DEFAULT_BETA_CONFIG
): { allowed: boolean; reason?: string } {
  if (!config.enabled) {
    return { allowed: false, reason: 'Beta program is not active' };
  }

  if (config.accessMode === 'closed') {
    return { allowed: false, reason: 'Beta program is closed to new signups' };
  }

  if (config.maxBetaUsers > 0 && currentBetaUsers >= config.maxBetaUsers) {
    return { allowed: false, reason: 'Beta is full. Join the waitlist.' };
  }

  if (config.betaEndsAt && new Date() > config.betaEndsAt) {
    return { allowed: false, reason: 'Beta period has ended' };
  }

  return { allowed: true };
}

/**
 * Tenant beta status
 */
export interface TenantBetaStatus {
  /** Whether tenant is a beta participant */
  isBeta: boolean;
  /** When beta access was granted */
  betaGrantedAt?: Date;
  /** Invite code used (for tracking) */
  inviteCode?: string;
  /** Beta features enabled for this tenant */
  betaFeatures: BetaFeature[];
}
