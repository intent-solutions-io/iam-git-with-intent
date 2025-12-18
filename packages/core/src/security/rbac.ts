/**
 * RBAC Enforcement Module
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Provides centralized RBAC enforcement with:
 * - Role hierarchy checking
 * - Permission matrix enforcement
 * - Middleware for Express/Hono
 * - Phase 23 telemetry integration for audit trails
 *
 * @module @gwi/core/security/rbac
 */

import {
  getCurrentContext,
  createLogger,
  type TelemetryContext,
} from '../telemetry/index.js';

// =============================================================================
// Role Definitions
// =============================================================================

/**
 * User roles within a tenant (ordered by privilege level)
 *
 * OWNER: Full access, can delete tenant, manage billing
 * ADMIN: Full operational access, can manage members
 * DEVELOPER: Can trigger runs, view logs, modify repo settings
 * VIEWER: Read-only access to runs and logs
 */
export type RBACRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

/**
 * Role hierarchy for permission checks
 * Higher number = more privileges
 */
export const RBAC_ROLE_HIERARCHY: Record<RBACRole, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Check if a role has at least the required privilege level
 */
export function hasMinimumRBACRole(userRole: RBACRole, requiredRole: RBACRole): boolean {
  return RBAC_ROLE_HIERARCHY[userRole] >= RBAC_ROLE_HIERARCHY[requiredRole];
}

// =============================================================================
// Permission Actions
// =============================================================================

/**
 * Actions that can be performed on resources
 */
export type RBACAction =
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
  // Workflow actions
  | 'workflow:read'
  | 'workflow:create'
  | 'workflow:update'
  | 'workflow:delete'
  // Candidate actions
  | 'candidate:read'
  | 'candidate:approve'
  | 'candidate:reject'
  | 'candidate:execute'
  // Connector actions
  | 'connector:read'
  | 'connector:install'
  | 'connector:uninstall'
  | 'connector:publish'
  | 'connector:update'
  // Registry actions
  | 'registry:read'
  | 'registry:publish'
  | 'registry:update'
  // Settings actions
  | 'settings:read'
  | 'settings:update'
  // Audit actions
  | 'audit:read';

/**
 * Permission matrix: which roles can perform which actions
 */
export const RBAC_PERMISSIONS: Record<RBACAction, RBACRole[]> = {
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
  // Workflows
  'workflow:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'workflow:create': ['DEVELOPER', 'ADMIN', 'OWNER'],
  'workflow:update': ['DEVELOPER', 'ADMIN', 'OWNER'],
  'workflow:delete': ['ADMIN', 'OWNER'],
  // Candidates
  'candidate:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'candidate:approve': ['DEVELOPER', 'ADMIN', 'OWNER'],
  'candidate:reject': ['DEVELOPER', 'ADMIN', 'OWNER'],
  'candidate:execute': ['ADMIN', 'OWNER'], // High-risk: actually pushes/merges
  // Connectors
  'connector:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'connector:install': ['ADMIN', 'OWNER'],
  'connector:uninstall': ['ADMIN', 'OWNER'],
  'connector:publish': ['ADMIN', 'OWNER'],
  'connector:update': ['ADMIN', 'OWNER'],
  // Registry
  'registry:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'registry:publish': ['ADMIN', 'OWNER'],
  'registry:update': ['ADMIN', 'OWNER'],
  // Settings
  'settings:read': ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'],
  'settings:update': ['ADMIN', 'OWNER'],
  // Audit
  'audit:read': ['ADMIN', 'OWNER'],
};

/**
 * Check if a role can perform an action
 */
export function canPerformRBAC(role: RBACRole, action: RBACAction): boolean {
  return RBAC_PERMISSIONS[action]?.includes(role) ?? false;
}

// =============================================================================
// RBAC Context
// =============================================================================

/**
 * RBAC context for request handling
 */
export interface RBACContext {
  /** User ID (Firebase Auth UID) */
  userId: string;
  /** User's email */
  email?: string;
  /** Current tenant ID */
  tenantId?: string;
  /** User's role in current tenant */
  role?: RBACRole;
  /** Is this a service account? */
  isServiceAccount: boolean;
  /** Telemetry context for correlation */
  telemetryContext?: TelemetryContext;
}

/**
 * RBAC check result
 */
export interface RBACCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole?: RBACRole;
  userRole?: RBACRole;
  action?: RBACAction;
}

// =============================================================================
// RBAC Enforcement Functions
// =============================================================================

const logger = createLogger('rbac');

/**
 * Check if context has required role
 */
export function requireRole(
  ctx: RBACContext,
  requiredRole: RBACRole
): RBACCheckResult {
  // Service accounts have full permissions
  if (ctx.isServiceAccount) {
    return { allowed: true };
  }

  if (!ctx.role) {
    logger.warn('RBAC check failed: no role in context', {
      eventName: 'rbac.denied',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      requiredRole,
      reason: 'no_role',
      traceId: ctx.telemetryContext?.traceId,
      requestId: ctx.telemetryContext?.requestId,
    });
    return {
      allowed: false,
      reason: 'User has no role in this tenant',
      requiredRole,
    };
  }

  const hasRole = hasMinimumRBACRole(ctx.role, requiredRole);

  if (!hasRole) {
    logger.warn('RBAC check failed: insufficient role', {
      eventName: 'rbac.denied',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      userRole: ctx.role,
      requiredRole,
      reason: 'insufficient_role',
      traceId: ctx.telemetryContext?.traceId,
      requestId: ctx.telemetryContext?.requestId,
    });
  }

  return {
    allowed: hasRole,
    reason: hasRole ? undefined : `Requires ${requiredRole} role or higher`,
    requiredRole,
    userRole: ctx.role,
  };
}

/**
 * Check if context can perform action
 */
export function requirePermission(
  ctx: RBACContext,
  action: RBACAction
): RBACCheckResult {
  // Service accounts have full permissions
  if (ctx.isServiceAccount) {
    return { allowed: true, action };
  }

  if (!ctx.role) {
    logger.warn('RBAC permission check failed: no role', {
      eventName: 'rbac.denied',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action,
      reason: 'no_role',
      traceId: ctx.telemetryContext?.traceId,
      requestId: ctx.telemetryContext?.requestId,
    });
    return {
      allowed: false,
      reason: 'User has no role in this tenant',
      action,
    };
  }

  const canDo = canPerformRBAC(ctx.role, action);

  if (!canDo) {
    const allowedRoles = RBAC_PERMISSIONS[action];
    logger.warn('RBAC permission check failed', {
      eventName: 'rbac.denied',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      userRole: ctx.role,
      action,
      allowedRoles,
      reason: 'forbidden',
      traceId: ctx.telemetryContext?.traceId,
      requestId: ctx.telemetryContext?.requestId,
    });
  }

  return {
    allowed: canDo,
    reason: canDo ? undefined : `Action '${action}' not permitted for ${ctx.role} role`,
    userRole: ctx.role,
    action,
  };
}

/**
 * Check if context has tenant access
 */
export function requireTenant(
  ctx: RBACContext,
  tenantId: string
): RBACCheckResult {
  if (ctx.isServiceAccount) {
    return { allowed: true };
  }

  if (!ctx.tenantId) {
    return {
      allowed: false,
      reason: 'No tenant context',
    };
  }

  if (ctx.tenantId !== tenantId) {
    logger.warn('RBAC tenant check failed: wrong tenant', {
      eventName: 'rbac.denied',
      userId: ctx.userId,
      contextTenantId: ctx.tenantId,
      requestedTenantId: tenantId,
      reason: 'wrong_tenant',
      traceId: ctx.telemetryContext?.traceId,
      requestId: ctx.telemetryContext?.requestId,
    });
    return {
      allowed: false,
      reason: 'Access denied for this tenant',
    };
  }

  return { allowed: true };
}

/**
 * Combined check: tenant + permission
 */
export function requireTenantPermission(
  ctx: RBACContext,
  tenantId: string,
  action: RBACAction
): RBACCheckResult {
  const tenantCheck = requireTenant(ctx, tenantId);
  if (!tenantCheck.allowed) {
    return tenantCheck;
  }

  return requirePermission(ctx, action);
}

// =============================================================================
// Express Middleware
// =============================================================================

/**
 * Express request with RBAC context
 */
export interface RBACRequest {
  rbacContext?: RBACContext;
  context?: {
    userId?: string;
    email?: string;
    tenantId?: string;
    role?: string;
    isServiceAccount?: boolean;
  };
}

/**
 * Create Express middleware that requires a minimum role
 */
export function expressRequireRole(requiredRole: RBACRole) {
  return (
    req: RBACRequest,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void
  ) => {
    const ctx = extractRBACContext(req);
    const result = requireRole(ctx, requiredRole);

    if (!result.allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: result.reason,
        requiredRole: result.requiredRole,
        userRole: result.userRole,
      });
    }

    req.rbacContext = ctx;
    next();
  };
}

/**
 * Create Express middleware that requires a specific permission
 */
export function expressRequirePermission(action: RBACAction) {
  return (
    req: RBACRequest,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void
  ) => {
    const ctx = extractRBACContext(req);
    const result = requirePermission(ctx, action);

    if (!result.allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: result.reason,
        action: result.action,
        userRole: result.userRole,
      });
    }

    req.rbacContext = ctx;
    next();
  };
}

/**
 * Create Express middleware that requires authentication
 */
export function expressRequireAuth() {
  return (
    req: RBACRequest,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void
  ) => {
    const ctx = extractRBACContext(req);

    if (!ctx.userId || ctx.userId === 'anonymous') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    req.rbacContext = ctx;
    next();
  };
}

/**
 * Extract RBAC context from Express request
 */
function extractRBACContext(req: RBACRequest): RBACContext {
  const telemetryCtx = getCurrentContext();

  return {
    userId: req.context?.userId || 'anonymous',
    email: req.context?.email,
    tenantId: req.context?.tenantId,
    role: req.context?.role as RBACRole | undefined,
    isServiceAccount: req.context?.isServiceAccount || false,
    telemetryContext: telemetryCtx,
  };
}

// =============================================================================
// High-Risk Action Enforcement
// =============================================================================

/**
 * High-risk actions that require additional logging/approval
 */
export const HIGH_RISK_ACTIONS: RBACAction[] = [
  'tenant:delete',
  'tenant:billing',
  'member:update_role',
  'candidate:execute',
  'connector:publish',
  'registry:publish',
];

/**
 * Check if an action is high-risk
 */
export function isHighRiskAction(action: RBACAction): boolean {
  return HIGH_RISK_ACTIONS.includes(action);
}

/**
 * Enforce high-risk action with enhanced logging
 */
export function enforceHighRiskAction(
  ctx: RBACContext,
  action: RBACAction,
  resourceId: string
): RBACCheckResult {
  const result = requirePermission(ctx, action);

  // Log all high-risk action attempts (allowed or not)
  const logLevel = result.allowed ? 'info' : 'warn';
  logger[logLevel](`High-risk action: ${action}`, {
    eventName: result.allowed ? 'rbac.high_risk.allowed' : 'rbac.high_risk.denied',
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    userRole: ctx.role,
    action,
    resourceId,
    allowed: result.allowed,
    traceId: ctx.telemetryContext?.traceId,
    requestId: ctx.telemetryContext?.requestId,
  });

  return result;
}

// =============================================================================
// RBAC Event Types for Audit
// =============================================================================

/**
 * RBAC-related audit event types
 */
export type RBACAuditEventType =
  | 'rbac.check.allowed'
  | 'rbac.check.denied'
  | 'rbac.high_risk.allowed'
  | 'rbac.high_risk.denied'
  | 'rbac.role.changed'
  | 'rbac.permission.granted'
  | 'rbac.permission.revoked';

/**
 * RBAC audit event data
 */
export interface RBACAuditEventData {
  userId: string;
  tenantId?: string;
  action?: RBACAction;
  userRole?: RBACRole;
  requiredRole?: RBACRole;
  resourceId?: string;
  allowed: boolean;
  reason?: string;
}
