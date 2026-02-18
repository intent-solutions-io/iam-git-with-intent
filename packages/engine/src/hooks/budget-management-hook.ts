/**
 * Budget Management Hook
 *
 * Harness Engineering Pattern 6: Time/Token Budgeting
 *
 * Tracks cumulative token usage and cost per run. Injects budget
 * warnings into context metadata when approaching limits. For autopilot
 * mode, triggers early verification when budget is nearly spent.
 *
 * @module @gwi/engine/hooks
 */

import { getLogger } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';

const logger = getLogger('budget-management-hook');

// =============================================================================
// Types
// =============================================================================

/**
 * Budget status for a run
 */
export interface BudgetStatus {
  /** Total input tokens consumed */
  totalInputTokens: number;
  /** Total output tokens consumed */
  totalOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Percentage of token budget consumed (0-100) */
  tokenBudgetPercent: number;
  /** Percentage of cost budget consumed (0-100) */
  costBudgetPercent: number;
  /** Number of steps completed */
  stepsCompleted: number;
  /** Total duration so far in ms */
  totalDurationMs: number;
  /** Budget warning level */
  warningLevel: 'none' | 'approaching' | 'critical' | 'exceeded';
}

/**
 * Configuration for budget management
 */
export interface BudgetManagementConfig {
  /** Maximum total tokens (input + output) per run. @default 500000 */
  maxTotalTokens: number;
  /** Maximum cost in USD per run. @default 5.0 */
  maxCostUsd: number;
  /** Warning threshold as percentage (0-100). @default 75 */
  warningThresholdPercent: number;
  /** Critical threshold as percentage (0-100). @default 90 */
  criticalThresholdPercent: number;
  /** Block on budget exceeded. @default false */
  enforceBlocking: boolean;
  /** Approximate cost per 1K input tokens in USD. @default 0.003 */
  costPer1kInputTokens: number;
  /** Approximate cost per 1K output tokens in USD. @default 0.015 */
  costPer1kOutputTokens: number;
  /** Callback when budget is exceeded */
  onBudgetExceeded?: (ctx: AgentRunContext, status: BudgetStatus) => Promise<void>;
}

/**
 * Default configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetManagementConfig = {
  maxTotalTokens: 500_000,
  maxCostUsd: 5.0,
  warningThresholdPercent: 75,
  criticalThresholdPercent: 90,
  enforceBlocking: false,
  costPer1kInputTokens: 0.003,
  costPer1kOutputTokens: 0.015,
};

// =============================================================================
// Error
// =============================================================================

/**
 * Error thrown when budget is exceeded in blocking mode
 */
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly budgetStatus: BudgetStatus,
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Budget Management Hook
 *
 * Accumulates token usage and cost across steps in a run.
 * Injects warning signals when approaching budget limits.
 */
export class BudgetManagementHook implements AgentHook {
  readonly name = 'budget-management';
  private config: BudgetManagementConfig;

  /** Map of runId → accumulated budget status */
  private runBudgets = new Map<string, {
    inputTokens: number;
    outputTokens: number;
    stepsCompleted: number;
    startTime: number;
  }>();

  constructor(config?: Partial<BudgetManagementConfig>) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
  }

  /**
   * Initialize budget tracking on run start (idempotent per runId)
   */
  async onRunStart(ctx: AgentRunContext): Promise<void> {
    // Guard: autopilot calls runStart multiple times per runId
    if (this.runBudgets.has(ctx.runId)) return;

    this.runBudgets.set(ctx.runId, {
      inputTokens: 0,
      outputTokens: 0,
      stepsCompleted: 0,
      startTime: Date.now(),
    });
  }

  /**
   * Check budget before step and inject warnings
   */
  async onBeforeStep(ctx: AgentRunContext): Promise<void> {
    const budget = this.runBudgets.get(ctx.runId);
    if (!budget) return;

    const status = this.calculateStatus(budget);

    // Inject budget status into metadata
    if (ctx.metadata) {
      ctx.metadata.budgetStatus = status;

      if (status.warningLevel === 'approaching') {
        ctx.metadata.budgetWarning =
          `Budget ${status.tokenBudgetPercent.toFixed(0)}% consumed. ` +
          `Prioritize completing current work and verifying output.`;
      } else if (status.warningLevel === 'critical') {
        ctx.metadata.budgetWarning =
          `Budget ${status.tokenBudgetPercent.toFixed(0)}% consumed (CRITICAL). ` +
          `Wrap up immediately. Skip non-essential work. Verify and finalize.`;
      }
    }

    // Block if exceeded and enforcement is on
    if (status.warningLevel === 'exceeded' && this.config.enforceBlocking) {
      await this.config.onBudgetExceeded?.(ctx, status);
      throw new BudgetExceededError(
        `Run budget exceeded: ${status.tokenBudgetPercent.toFixed(0)}% tokens, $${status.estimatedCostUsd.toFixed(4)} cost`,
        status,
      );
    }
  }

  /**
   * Accumulate usage after each step
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    const budget = this.runBudgets.get(ctx.runId);
    if (!budget) return;

    // Accumulate token usage
    if (ctx.tokensUsed) {
      budget.inputTokens += ctx.tokensUsed.input;
      budget.outputTokens += ctx.tokensUsed.output;
    }
    budget.stepsCompleted++;

    const status = this.calculateStatus(budget);

    // Attach status to metadata
    if (ctx.metadata) {
      ctx.metadata.budgetStatus = status;
    }

    if (status.warningLevel !== 'none') {
      logger.warn('Budget warning', {
        runId: ctx.runId,
        level: status.warningLevel,
        tokenPercent: status.tokenBudgetPercent.toFixed(1),
        costUsd: status.estimatedCostUsd.toFixed(4),
        stepsCompleted: status.stepsCompleted,
      });
    }
  }

  /**
   * Clean up on run end
   */
  async onRunEnd(ctx: AgentRunContext, _success: boolean): Promise<void> {
    const budget = this.runBudgets.get(ctx.runId);
    if (budget) {
      const status = this.calculateStatus(budget);
      logger.info('Run budget summary', {
        runId: ctx.runId,
        totalInputTokens: status.totalInputTokens,
        totalOutputTokens: status.totalOutputTokens,
        estimatedCostUsd: status.estimatedCostUsd.toFixed(4),
        stepsCompleted: status.stepsCompleted,
        durationMs: status.totalDurationMs,
      });
    }
    this.runBudgets.delete(ctx.runId);
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return process.env.GWI_BUDGET_MANAGEMENT_ENABLED !== 'false';
  }

  /**
   * Calculate current budget status
   */
  private calculateStatus(budget: {
    inputTokens: number;
    outputTokens: number;
    stepsCompleted: number;
    startTime: number;
  }): BudgetStatus {
    const totalTokens = budget.inputTokens + budget.outputTokens;
    const estimatedCostUsd =
      (budget.inputTokens / 1000) * this.config.costPer1kInputTokens +
      (budget.outputTokens / 1000) * this.config.costPer1kOutputTokens;

    const tokenBudgetPercent = (totalTokens / this.config.maxTotalTokens) * 100;
    const costBudgetPercent = (estimatedCostUsd / this.config.maxCostUsd) * 100;

    const maxPercent = Math.max(tokenBudgetPercent, costBudgetPercent);

    let warningLevel: BudgetStatus['warningLevel'] = 'none';
    if (maxPercent >= 100) {
      warningLevel = 'exceeded';
    } else if (maxPercent >= this.config.criticalThresholdPercent) {
      warningLevel = 'critical';
    } else if (maxPercent >= this.config.warningThresholdPercent) {
      warningLevel = 'approaching';
    }

    return {
      totalInputTokens: budget.inputTokens,
      totalOutputTokens: budget.outputTokens,
      estimatedCostUsd,
      tokenBudgetPercent,
      costBudgetPercent,
      stepsCompleted: budget.stepsCompleted,
      totalDurationMs: Date.now() - budget.startTime,
      warningLevel,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a budget management hook
 */
export function createBudgetManagementHook(
  config?: Partial<BudgetManagementConfig>,
): BudgetManagementHook {
  return new BudgetManagementHook(config);
}
