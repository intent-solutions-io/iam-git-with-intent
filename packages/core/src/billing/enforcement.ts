/**
 * Plan Limit Enforcement Module
 *
 * Phase 22: Metering + Billing + Plan Limits
 *
 * Provides middleware and utilities for enforcing plan limits across
 * API endpoints and worker handlers.
 *
 * Error responses:
 * - 429 Too Many Requests: Daily/rate limits exceeded (retry later)
 * - 402 Payment Required: Monthly/plan limits exceeded (upgrade required)
 *
 * @module @gwi/core/billing/enforcement
 */

import {
  type MeteredResource,
  type TenantUsageSnapshot,
  checkEntitlement,
  checkUsageWarning,
  createEmptyUsageSnapshot,
  needsDailyReset,
  needsMonthlyReset,
  resetDailyCounters,
  resetMonthlyCounters,
} from './entitlements.js';
import { type PlanId, getPlanConfig } from '../security/index.js';

// =============================================================================
// Enforcement Types
// =============================================================================

/**
 * Enforcement context for a request
 */
export interface EnforcementContext {
  tenantId: string;
  planId: PlanId;
  userId?: string;
  requestId?: string;
}

/**
 * Enforcement result
 */
export interface EnforcementResult {
  allowed: boolean;
  resource: MeteredResource;
  currentUsage: number;
  limit: number;
  reason?: string;
  suggestion?: string;
  /** HTTP status code to return if not allowed */
  httpStatus: 200 | 402 | 429;
  /** Headers to add to the response */
  headers?: Record<string, string>;
  /** Warning if approaching limit */
  warning?: {
    threshold: 80 | 90 | 95;
    message: string;
  };
}

/**
 * Pre-flight enforcement check result (for multiple resources)
 */
export interface PreflightCheckResult {
  allowed: boolean;
  results: EnforcementResult[];
  /** First blocking result (if any) */
  blockingResult?: EnforcementResult;
}

// =============================================================================
// Error Response Builders
// =============================================================================

/**
 * Build a 429 Too Many Requests response body
 */
export function build429Response(result: EnforcementResult): {
  status: 429;
  body: Record<string, unknown>;
  headers: Record<string, string>;
} {
  return {
    status: 429,
    body: {
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
      resource: result.resource,
      message: result.reason,
      suggestion: result.suggestion,
      usage: {
        current: result.currentUsage,
        limit: result.limit,
      },
    },
    headers: {
      'Retry-After': '3600', // 1 hour default, adjust based on resource
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': getResetTimestamp(result.resource),
    },
  };
}

/**
 * Build a 402 Payment Required response body
 */
export function build402Response(result: EnforcementResult, planId: PlanId): {
  status: 402;
  body: Record<string, unknown>;
  headers: Record<string, string>;
} {
  const config = getPlanConfig(planId);
  const upgradePlan = getUpgradeSuggestion(planId);

  return {
    status: 402,
    body: {
      error: 'Payment Required',
      code: 'PLAN_LIMIT_EXCEEDED',
      resource: result.resource,
      message: result.reason,
      suggestion: result.suggestion,
      usage: {
        current: result.currentUsage,
        limit: result.limit,
      },
      currentPlan: {
        id: planId,
        name: config.name,
      },
      upgradeTo: upgradePlan
        ? {
            id: upgradePlan.id,
            name: upgradePlan.name,
            newLimit: getResourceLimit(result.resource, upgradePlan.id),
          }
        : null,
    },
    headers: {
      'X-Plan-Limit': String(result.limit),
      'X-Plan-Usage': String(result.currentUsage),
    },
  };
}

/**
 * Get the upgrade suggestion for a plan
 */
function getUpgradeSuggestion(
  planId: PlanId
): { id: PlanId; name: string; priceMonthly: number } | null {
  switch (planId) {
    case 'free':
      return getPlanConfig('pro');
    case 'pro':
      return getPlanConfig('enterprise');
    case 'enterprise':
      return null; // Already at highest tier
    default:
      return getPlanConfig('pro');
  }
}

/**
 * Get the limit for a resource on a plan
 */
function getResourceLimit(resource: MeteredResource, planId: PlanId): number {
  const result = checkEntitlement(resource, 0, planId);
  return result.limit;
}

/**
 * Get the reset timestamp for a resource (Unix timestamp)
 */
function getResetTimestamp(resource: MeteredResource): string {
  const now = new Date();

  if (resource.endsWith('_daily')) {
    // Reset at midnight UTC
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return String(Math.floor(tomorrow.getTime() / 1000));
  }

  if (resource.endsWith('_monthly')) {
    // Reset at start of next month
    const nextMonth = new Date(now);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
    nextMonth.setUTCHours(0, 0, 0, 0);
    return String(Math.floor(nextMonth.getTime() / 1000));
  }

  // Default: 1 hour from now
  return String(Math.floor((now.getTime() + 3600000) / 1000));
}

// =============================================================================
// Enforcement Functions
// =============================================================================

/**
 * Check if an action is allowed and return enforcement result
 */
export function enforceLimit(
  resource: MeteredResource,
  currentUsage: number,
  planId: PlanId
): EnforcementResult {
  const check = checkEntitlement(resource, currentUsage, planId);
  const warning = checkUsageWarning(resource, currentUsage, planId);

  let httpStatus: 200 | 402 | 429 = 200;
  if (!check.allowed) {
    // Daily limits get 429, monthly limits get 402
    httpStatus = resource.endsWith('_daily') ? 429 : 402;
  }

  // Build rate limit headers
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(check.limit),
    'X-RateLimit-Remaining': String(Math.max(0, check.limit - currentUsage)),
  };

  if (!check.allowed) {
    headers['X-RateLimit-Reset'] = getResetTimestamp(resource);
  }

  return {
    allowed: check.allowed,
    resource,
    currentUsage,
    limit: check.limit,
    reason: check.reason,
    suggestion: check.suggestion,
    httpStatus,
    headers,
    warning: warning.shouldWarn
      ? {
          threshold: warning.threshold!,
          message: warning.message!,
        }
      : undefined,
  };
}

/**
 * Check multiple resources at once (preflight check)
 */
export function preflightCheck(
  checks: Array<{ resource: MeteredResource; currentUsage: number }>,
  planId: PlanId
): PreflightCheckResult {
  const results = checks.map(({ resource, currentUsage }) =>
    enforceLimit(resource, currentUsage, planId)
  );

  const blockingResult = results.find((r) => !r.allowed);

  return {
    allowed: !blockingResult,
    results,
    blockingResult,
  };
}

/**
 * Enforce a run creation request
 */
export function enforceRunCreation(
  snapshot: TenantUsageSnapshot,
  planId: PlanId
): PreflightCheckResult {
  return preflightCheck(
    [
      { resource: 'runs_daily', currentUsage: snapshot.daily.runs },
      { resource: 'runs_monthly', currentUsage: snapshot.monthly.runs },
      { resource: 'concurrent_runs', currentUsage: snapshot.concurrent.runs },
    ],
    planId
  );
}

/**
 * Enforce an API call
 */
export function enforceApiCall(
  snapshot: TenantUsageSnapshot,
  planId: PlanId
): EnforcementResult {
  return enforceLimit('api_calls_daily', snapshot.daily.apiCalls, planId);
}

/**
 * Enforce signal ingestion
 */
export function enforceSignalIngestion(
  snapshot: TenantUsageSnapshot,
  planId: PlanId
): EnforcementResult {
  return enforceLimit('signals_daily', snapshot.daily.signals, planId);
}

/**
 * Enforce candidate generation
 */
export function enforceCandidateGeneration(
  snapshot: TenantUsageSnapshot,
  planId: PlanId
): EnforcementResult {
  return enforceLimit('candidates_daily', snapshot.daily.candidates, planId);
}

/**
 * Enforce PR creation
 */
export function enforcePRCreation(
  snapshot: TenantUsageSnapshot,
  planId: PlanId
): EnforcementResult {
  return enforceLimit('prs_monthly', snapshot.monthly.prs, planId);
}

/**
 * Enforce notification sending
 */
export function enforceNotification(
  snapshot: TenantUsageSnapshot,
  planId: PlanId
): EnforcementResult {
  return enforceLimit('notifications_daily', snapshot.daily.notifications, planId);
}

/**
 * Enforce token usage
 */
export function enforceTokenUsage(
  snapshot: TenantUsageSnapshot,
  tokensToUse: number,
  planId: PlanId
): EnforcementResult {
  // Check if adding these tokens would exceed the limit
  return enforceLimit('tokens_monthly', snapshot.monthly.tokens + tokensToUse, planId);
}

// =============================================================================
// Snapshot Management
// =============================================================================

/**
 * Ensure snapshot is fresh (handles daily/monthly resets)
 */
export function ensureFreshSnapshot(snapshot: TenantUsageSnapshot): TenantUsageSnapshot {
  let fresh = snapshot;

  if (needsDailyReset(snapshot)) {
    fresh = resetDailyCounters(fresh);
  }

  if (needsMonthlyReset(fresh)) {
    fresh = resetMonthlyCounters(fresh);
  }

  return fresh;
}

/**
 * Get or create a snapshot for a tenant
 */
export function getOrCreateSnapshot(
  existingSnapshot: TenantUsageSnapshot | null,
  tenantId: string,
  planId: PlanId
): TenantUsageSnapshot {
  if (existingSnapshot) {
    return ensureFreshSnapshot(existingSnapshot);
  }
  return createEmptyUsageSnapshot(tenantId, planId);
}

// =============================================================================
// Express Middleware Helpers
// =============================================================================

/**
 * Build error response for Express
 */
export function buildExpressErrorResponse(
  result: EnforcementResult,
  planId: PlanId
): { status: number; body: Record<string, unknown>; headers: Record<string, string> } {
  if (result.httpStatus === 429) {
    return build429Response(result);
  }
  return build402Response(result, planId);
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  headers: Record<string, string>,
  result: EnforcementResult
): Record<string, string> {
  return {
    ...headers,
    ...result.headers,
  };
}

// =============================================================================
// Logging and Metrics
// =============================================================================

/**
 * Create an enforcement log entry (for audit/debugging)
 */
export function createEnforcementLog(
  context: EnforcementContext,
  result: EnforcementResult
): Record<string, unknown> {
  return {
    type: 'enforcement_check',
    timestamp: new Date().toISOString(),
    tenantId: context.tenantId,
    planId: context.planId,
    userId: context.userId,
    requestId: context.requestId,
    resource: result.resource,
    allowed: result.allowed,
    currentUsage: result.currentUsage,
    limit: result.limit,
    httpStatus: result.httpStatus,
    reason: result.reason,
    warning: result.warning,
  };
}

/**
 * Check if enforcement result should be logged
 */
export function shouldLogEnforcement(result: EnforcementResult): boolean {
  // Log denials and warnings
  return !result.allowed || result.warning !== undefined;
}
