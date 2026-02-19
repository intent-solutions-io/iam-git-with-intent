/**
 * Rate Limit Quota API Route — Scale & Ops Maturity (gwi-5a6)
 *
 * Agent-first: Per-agent rate limits with metering. Agents authenticate,
 * get rate-limited based on their tier. Agents can query their own rate
 * limit status and remaining quota via this endpoint.
 *
 * GET /tenants/:tenantId/quota — Returns rate limit status per action
 * with agent-actionable recommendation.
 *
 * Distinct from /quotas (resource quotas) — this is about rate limiting.
 *
 * @module @gwi/api/routes/quota
 */

import { Router } from 'express';
import {
  expressRequireAuth,
  expressRequirePermission,
  type RBACRequest,
} from '@gwi/core';
import {
  getRateLimiter,
  DEFAULT_RATE_LIMITS,
  type RateLimitResult,
} from '@gwi/core';
import { createLogger } from '@gwi/core';

const logger = createLogger('quota-routes');

/**
 * Agent-queryable rate limit status for a single action
 */
interface ActionQuotaStatus {
  limit: number;
  remaining: number;
  resetsAt: string;
}

/**
 * Determine agent-actionable recommendation
 */
function getRecommendation(
  statuses: Record<string, ActionQuotaStatus>,
): 'normal' | 'throttle' {
  for (const status of Object.values(statuses)) {
    if (status.remaining <= 0) return 'throttle';
    const percentUsed = ((status.limit - status.remaining) / status.limit) * 100;
    if (percentUsed >= 80) return 'throttle';
  }
  return 'normal';
}

/**
 * Create rate limit quota API routes
 */
export function createQuotaRateLimitRoutes(): Router {
  const router = Router();

  /**
   * GET /tenants/:tenantId/quota
   *
   * Returns current rate limit status per action for the tenant.
   * Agent-actionable: includes recommendation field.
   */
  router.get(
    '/tenants/:tenantId/quota',
    expressRequireAuth(),
    expressRequirePermission('tenant:read'),
    async (req: RBACRequest, res) => {
      const { tenantId } = req.params;

      try {
        const { getTenantStore } = await import('@gwi/core');
        const tenantStore = getTenantStore();
        const tenant = await tenantStore.getTenant(tenantId);

        if (!tenant) {
          return res.status(404).json({ error: 'Tenant not found' });
        }

        const limiter = getRateLimiter();
        const plan = tenant.plan || 'free';

        // Check key actions
        const actions = ['run:create', 'api:read', 'signal:create', 'candidate:generate', 'api:write'];
        const limits: Record<string, ActionQuotaStatus> = {};

        for (const action of actions) {
          const config = DEFAULT_RATE_LIMITS[action];
          if (!config) continue;

          const status: RateLimitResult = await limiter.status(tenantId, action);
          const resetTime = new Date(Date.now() + status.resetInMs);

          limits[action] = {
            limit: status.limit,
            remaining: status.remaining,
            resetsAt: resetTime.toISOString(),
          };
        }

        const recommendation = getRecommendation(limits);

        logger.info('Rate limit quota queried', {
          eventName: 'quota.ratelimit.query',
          tenantId,
          plan,
          recommendation,
        });

        res.json({
          limits,
          plan,
          recommendation,
        });
      } catch (error) {
        logger.error('Failed to get rate limit quota', {
          eventName: 'quota.ratelimit.error',
          tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({
          error: 'Failed to get rate limit quota',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  return router;
}
