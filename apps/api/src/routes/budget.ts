/**
 * Budget API Route — Scale & Ops Maturity (gwi-keq)
 *
 * Agent-first: Agents query budget status to make cost-aware decisions
 * (e.g., switch to cheaper models when budget is 80% consumed).
 *
 * GET /tenants/:tenantId/budget — Returns current spend vs limit with
 * an agent-actionable recommendation field.
 *
 * @module @gwi/api/routes/budget
 */

import { Router } from 'express';
import {
  expressRequireAuth,
  expressRequirePermission,
  type RBACRequest,
} from '@gwi/core';
import { createLogger } from '@gwi/core';

const logger = createLogger('budget-routes');

/**
 * Determine agent-actionable recommendation based on budget usage
 */
function getRecommendation(percentUsed: number): 'normal' | 'conserve' | 'stop' {
  if (percentUsed >= 95) return 'stop';
  if (percentUsed >= 80) return 'conserve';
  return 'normal';
}

/**
 * Plan tier run limits (matches tenant plan limits)
 */
const PLAN_RUN_LIMITS: Record<string, number> = {
  free: 50,
  team: 500,
  pro: 2000,
  enterprise: 10000,
};

const PLAN_BUDGET_CENTS: Record<string, number> = {
  free: 0,
  team: 5000,       // $50
  pro: 20000,       // $200
  enterprise: 100000, // $1000
};

/**
 * Create budget API routes
 */
export function createBudgetRoutes(): Router {
  const router = Router();

  /**
   * GET /tenants/:tenantId/budget
   *
   * Returns current budget status with agent-actionable recommendation.
   * Agents use this to decide whether to use cheaper models or stop.
   */
  router.get(
    '/tenants/:tenantId/budget',
    expressRequireAuth(),
    expressRequirePermission('tenant:read'),
    async (req: RBACRequest, res) => {
      const { tenantId } = req.params;

      try {
        const { getTenantStore, getMeteringService, isMeteringEnabled } = await import('@gwi/core');

        const tenantStore = getTenantStore();
        const tenant = await tenantStore.getTenant(tenantId);

        if (!tenant) {
          return res.status(404).json({ error: 'Tenant not found' });
        }

        const plan = tenant.plan || 'free';
        const runsLimit = tenant.planLimits?.runsPerMonth ?? PLAN_RUN_LIMITS[plan] ?? 50;
        const budgetLimitCents = PLAN_BUDGET_CENTS[plan] ?? 0;

        // Get current period key (YYYY-MM)
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Get runs used this month
        let runsUsed = tenant.runsThisMonth ?? 0;
        let estimatedCostCents = 0;

        // If metering is enabled, use actual usage data
        if (isMeteringEnabled()) {
          try {
            const meteringService = getMeteringService();
            meteringService.setTenantPlan(tenantId, plan);
            const status = await meteringService.getPlanUsageStatus(tenantId);
            runsUsed = status.plan.run_limit - status.runs_remaining;
            // Rough cost estimate: $0.10 per run average
            estimatedCostCents = runsUsed * 10;
          } catch {
            // Fall back to tenant.runsThisMonth
            estimatedCostCents = runsUsed * 10;
          }
        } else {
          estimatedCostCents = runsUsed * 10;
        }

        const percentUsed = budgetLimitCents > 0
          ? Math.min(100, Math.round((estimatedCostCents / budgetLimitCents) * 100))
          : (runsLimit > 0 ? Math.min(100, Math.round((runsUsed / runsLimit) * 100)) : 0);

        const recommendation = getRecommendation(percentUsed);

        logger.info('Budget status queried', {
          eventName: 'budget.query',
          tenantId,
          plan,
          percentUsed,
          recommendation,
        });

        res.json({
          tenantId,
          plan,
          period,
          runsUsed,
          runsLimit,
          estimatedCostCents,
          budgetLimitCents,
          percentUsed,
          recommendation,
        });
      } catch (error) {
        logger.error('Failed to get budget status', {
          eventName: 'budget.error',
          tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({
          error: 'Failed to get budget status',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  return router;
}
