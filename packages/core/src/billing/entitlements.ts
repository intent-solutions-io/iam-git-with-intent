/**
 * Entitlements Module for Git With Intent
 *
 * Phase 22: Metering + Billing + Plan Limits
 *
 * Provides:
 * - Extended plan entitlements (daily/monthly limits)
 * - Entitlement checking functions
 * - Limit enforcement utilities
 *
 * @module @gwi/core/billing/entitlements
 */

import { PlanId, getPlanConfig, type PlanConfig } from '../security/index.js';

// =============================================================================
// Extended Plan Limits
// =============================================================================

/**
 * Extended limits for metering (beyond base PlanConfig.limits)
 *
 * These are the Phase 22 additions for granular usage tracking.
 */
export interface ExtendedPlanLimits {
  // Daily limits
  /** Max runs per day (prevents abuse spikes) */
  runsPerDay: number;
  /** Max signals ingested per day */
  signalsPerDay: number;
  /** Max candidates generated per day */
  candidatesPerDay: number;
  /** Max API calls per day */
  apiCallsPerDay: number;
  /** Max notifications per day */
  notificationsPerDay: number;

  // Monthly limits
  /** Max PRs opened per month */
  prsPerMonth: number;
  /** Max connector installs per month */
  connectorInstallsPerMonth: number;
  /** Max storage bytes */
  storageBytes: number;
  /** Max tokens consumed per month */
  tokensPerMonth: number;

  // Concurrent limits
  /** Max concurrent webhook connections */
  maxConcurrentWebhooks: number;
}

/**
 * Extended plan configurations with Phase 22 limits
 */
export const EXTENDED_PLAN_LIMITS: Record<PlanId, ExtendedPlanLimits> = {
  free: {
    // Daily limits (tight to prevent abuse)
    runsPerDay: 10,
    signalsPerDay: 100,
    candidatesPerDay: 50,
    apiCallsPerDay: 500,
    notificationsPerDay: 20,
    // Monthly limits
    prsPerMonth: 10,
    connectorInstallsPerMonth: 3,
    storageBytes: 100 * 1024 * 1024, // 100 MB
    tokensPerMonth: 500_000,
    // Concurrent
    maxConcurrentWebhooks: 1,
  },
  pro: {
    // Daily limits (generous for teams)
    runsPerDay: 100,
    signalsPerDay: 5000,
    candidatesPerDay: 1000,
    apiCallsPerDay: 10_000,
    notificationsPerDay: 500,
    // Monthly limits
    prsPerMonth: 200,
    connectorInstallsPerMonth: 20,
    storageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    tokensPerMonth: 10_000_000,
    // Concurrent
    maxConcurrentWebhooks: 10,
  },
  enterprise: {
    // Daily limits (high but not unlimited)
    runsPerDay: 1000,
    signalsPerDay: 100_000,
    candidatesPerDay: 20_000,
    apiCallsPerDay: 500_000,
    notificationsPerDay: 10_000,
    // Monthly limits
    prsPerMonth: 5000,
    connectorInstallsPerMonth: 100,
    storageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    tokensPerMonth: 500_000_000,
    // Concurrent
    maxConcurrentWebhooks: 100,
  },
};

// =============================================================================
// Entitlement Types
// =============================================================================

/**
 * Resource types that can be metered
 */
export type MeteredResource =
  // Daily resources
  | 'runs_daily'
  | 'signals_daily'
  | 'candidates_daily'
  | 'api_calls_daily'
  | 'notifications_daily'
  // Monthly resources
  | 'runs_monthly'
  | 'prs_monthly'
  | 'connector_installs_monthly'
  | 'tokens_monthly'
  // Static resources
  | 'repos'
  | 'members'
  | 'storage'
  | 'concurrent_runs'
  | 'concurrent_webhooks';

/**
 * Entitlement check result
 */
export interface EntitlementCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Current usage */
  currentUsage: number;
  /** Limit for this resource */
  limit: number;
  /** Resource type checked */
  resource: MeteredResource;
  /** Suggested action for user */
  suggestion?: string;
  /** HTTP status code to return */
  httpStatus?: 429 | 402;
}

/**
 * Usage snapshot for a tenant
 */
export interface TenantUsageSnapshot {
  tenantId: string;
  planId: PlanId;

  // Daily counters (reset at midnight UTC)
  daily: {
    runs: number;
    signals: number;
    candidates: number;
    apiCalls: number;
    notifications: number;
    date: string; // YYYY-MM-DD
  };

  // Monthly counters (reset on billing cycle)
  monthly: {
    runs: number;
    prs: number;
    connectorInstalls: number;
    tokens: number;
    period: string; // YYYY-MM
  };

  // Static counters
  static: {
    repos: number;
    members: number;
    storageBytes: number;
  };

  // Concurrent counters
  concurrent: {
    runs: number;
    webhooks: number;
  };

  // Metadata
  lastUpdated: Date;
}

// =============================================================================
// Entitlement Check Functions
// =============================================================================

/**
 * Get extended limits for a plan
 */
export function getExtendedLimits(planId: PlanId): ExtendedPlanLimits {
  return EXTENDED_PLAN_LIMITS[planId] ?? EXTENDED_PLAN_LIMITS.free;
}

/**
 * Get combined limits (base + extended)
 */
export function getCombinedLimits(planId: PlanId): PlanConfig['limits'] & ExtendedPlanLimits {
  const base = getPlanConfig(planId);
  const extended = getExtendedLimits(planId);
  return {
    ...base.limits,
    ...extended,
  };
}

/**
 * Check entitlement for a specific resource
 */
export function checkEntitlement(
  resource: MeteredResource,
  currentUsage: number,
  planId: PlanId
): EntitlementCheckResult {
  const baseLimits = getPlanConfig(planId).limits;
  const extendedLimits = getExtendedLimits(planId);
  const planName = getPlanConfig(planId).name;

  // Map resource to limit
  let limit: number;
  let friendlyName: string;

  switch (resource) {
    // Daily resources
    case 'runs_daily':
      limit = extendedLimits.runsPerDay;
      friendlyName = 'daily runs';
      break;
    case 'signals_daily':
      limit = extendedLimits.signalsPerDay;
      friendlyName = 'daily signals';
      break;
    case 'candidates_daily':
      limit = extendedLimits.candidatesPerDay;
      friendlyName = 'daily candidates';
      break;
    case 'api_calls_daily':
      limit = extendedLimits.apiCallsPerDay;
      friendlyName = 'daily API calls';
      break;
    case 'notifications_daily':
      limit = extendedLimits.notificationsPerDay;
      friendlyName = 'daily notifications';
      break;

    // Monthly resources
    case 'runs_monthly':
      limit = baseLimits.maxMonthlyRuns;
      friendlyName = 'monthly runs';
      break;
    case 'prs_monthly':
      limit = extendedLimits.prsPerMonth;
      friendlyName = 'monthly PRs';
      break;
    case 'connector_installs_monthly':
      limit = extendedLimits.connectorInstallsPerMonth;
      friendlyName = 'monthly connector installs';
      break;
    case 'tokens_monthly':
      limit = extendedLimits.tokensPerMonth;
      friendlyName = 'monthly tokens';
      break;

    // Static resources
    case 'repos':
      limit = baseLimits.maxRepos;
      friendlyName = 'repositories';
      break;
    case 'members':
      limit = baseLimits.maxMembers;
      friendlyName = 'team members';
      break;
    case 'storage':
      limit = extendedLimits.storageBytes;
      friendlyName = 'storage';
      break;

    // Concurrent resources
    case 'concurrent_runs':
      limit = baseLimits.maxConcurrentRuns;
      friendlyName = 'concurrent runs';
      break;
    case 'concurrent_webhooks':
      limit = extendedLimits.maxConcurrentWebhooks;
      friendlyName = 'concurrent webhooks';
      break;

    default:
      // Unknown resource - allow by default but log
      return {
        allowed: true,
        currentUsage,
        limit: Infinity,
        resource,
      };
  }

  // Check if over limit
  if (currentUsage >= limit) {
    const isDaily = resource.endsWith('_daily');
    const isMonthly = resource.endsWith('_monthly');

    return {
      allowed: false,
      reason: `${friendlyName} limit reached (${limit} on ${planName} plan)`,
      currentUsage,
      limit,
      resource,
      suggestion: isDaily
        ? 'Limit resets at midnight UTC. Upgrade your plan for higher limits.'
        : isMonthly
          ? 'Limit resets at the start of your billing cycle. Upgrade for higher limits.'
          : 'Upgrade your plan for higher limits.',
      httpStatus: 429,
    };
  }

  return {
    allowed: true,
    currentUsage,
    limit,
    resource,
  };
}

/**
 * Check multiple entitlements at once
 */
export function checkMultipleEntitlements(
  checks: Array<{ resource: MeteredResource; currentUsage: number }>,
  planId: PlanId
): { allAllowed: boolean; results: EntitlementCheckResult[] } {
  const results = checks.map(({ resource, currentUsage }) =>
    checkEntitlement(resource, currentUsage, planId)
  );

  return {
    allAllowed: results.every((r) => r.allowed),
    results,
  };
}

/**
 * Get remaining quota for a resource
 */
export function getRemainingQuota(
  resource: MeteredResource,
  currentUsage: number,
  planId: PlanId
): { remaining: number; percentUsed: number } {
  const check = checkEntitlement(resource, currentUsage, planId);
  const remaining = Math.max(0, check.limit - currentUsage);
  const percentUsed = check.limit > 0 ? Math.round((currentUsage / check.limit) * 100) : 100;

  return { remaining, percentUsed };
}

/**
 * Check if tenant should receive a usage warning
 * Returns warning thresholds: 80%, 90%, 95%
 */
export function checkUsageWarning(
  resource: MeteredResource,
  currentUsage: number,
  planId: PlanId
): { shouldWarn: boolean; threshold?: 80 | 90 | 95; message?: string } {
  const { percentUsed } = getRemainingQuota(resource, currentUsage, planId);
  const check = checkEntitlement(resource, currentUsage, planId);

  if (percentUsed >= 95) {
    return {
      shouldWarn: true,
      threshold: 95,
      message: `You've used 95% of your ${resource.replace('_', ' ')} quota (${currentUsage}/${check.limit})`,
    };
  }
  if (percentUsed >= 90) {
    return {
      shouldWarn: true,
      threshold: 90,
      message: `You've used 90% of your ${resource.replace('_', ' ')} quota (${currentUsage}/${check.limit})`,
    };
  }
  if (percentUsed >= 80) {
    return {
      shouldWarn: true,
      threshold: 80,
      message: `You've used 80% of your ${resource.replace('_', ' ')} quota (${currentUsage}/${check.limit})`,
    };
  }

  return { shouldWarn: false };
}

// =============================================================================
// Usage Snapshot Helpers
// =============================================================================

/**
 * Create an empty usage snapshot for a new tenant
 */
export function createEmptyUsageSnapshot(tenantId: string, planId: PlanId): TenantUsageSnapshot {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    tenantId,
    planId,
    daily: {
      runs: 0,
      signals: 0,
      candidates: 0,
      apiCalls: 0,
      notifications: 0,
      date: today,
    },
    monthly: {
      runs: 0,
      prs: 0,
      connectorInstalls: 0,
      tokens: 0,
      period: month,
    },
    static: {
      repos: 0,
      members: 0,
      storageBytes: 0,
    },
    concurrent: {
      runs: 0,
      webhooks: 0,
    },
    lastUpdated: now,
  };
}

/**
 * Check if daily counters need reset (new day)
 */
export function needsDailyReset(snapshot: TenantUsageSnapshot): boolean {
  const today = new Date().toISOString().split('T')[0];
  return snapshot.daily.date !== today;
}

/**
 * Check if monthly counters need reset (new month)
 */
export function needsMonthlyReset(snapshot: TenantUsageSnapshot): boolean {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return snapshot.monthly.period !== currentMonth;
}

/**
 * Reset daily counters
 */
export function resetDailyCounters(snapshot: TenantUsageSnapshot): TenantUsageSnapshot {
  const today = new Date().toISOString().split('T')[0];
  return {
    ...snapshot,
    daily: {
      runs: 0,
      signals: 0,
      candidates: 0,
      apiCalls: 0,
      notifications: 0,
      date: today,
    },
    lastUpdated: new Date(),
  };
}

/**
 * Reset monthly counters
 */
export function resetMonthlyCounters(snapshot: TenantUsageSnapshot): TenantUsageSnapshot {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    ...snapshot,
    monthly: {
      runs: 0,
      prs: 0,
      connectorInstalls: 0,
      tokens: 0,
      period: currentMonth,
    },
    lastUpdated: new Date(),
  };
}
