/**
 * Budget Management Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetManagementHook, BudgetExceededError } from '../budget-management-hook.js';
import type { AgentRunContext } from '../types.js';

function makeCtx(overrides?: Partial<AgentRunContext>): AgentRunContext {
  return {
    runId: 'test-run-1',
    runType: 'autopilot',
    stepId: 'step-1',
    agentRole: 'CODER',
    stepStatus: 'completed',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe('BudgetManagementHook', () => {
  let hook: BudgetManagementHook;

  beforeEach(() => {
    hook = new BudgetManagementHook();
  });

  describe('budget tracking', () => {
    it('should track token usage across steps', async () => {
      const ctx = makeCtx();
      await hook.onRunStart(ctx);

      // Step 1: 1000 input, 500 output
      const step1 = makeCtx({
        stepId: 'step-1',
        tokensUsed: { input: 1000, output: 500 },
      });
      await hook.onAfterStep(step1);

      const status1 = step1.metadata?.budgetStatus as any;
      expect(status1.totalInputTokens).toBe(1000);
      expect(status1.totalOutputTokens).toBe(500);
      expect(status1.stepsCompleted).toBe(1);

      // Step 2: 2000 input, 1000 output
      const step2 = makeCtx({
        stepId: 'step-2',
        tokensUsed: { input: 2000, output: 1000 },
      });
      await hook.onAfterStep(step2);

      const status2 = step2.metadata?.budgetStatus as any;
      expect(status2.totalInputTokens).toBe(3000);
      expect(status2.totalOutputTokens).toBe(1500);
      expect(status2.stepsCompleted).toBe(2);
    });

    it('should calculate cost estimate', async () => {
      const ctx = makeCtx();
      await hook.onRunStart(ctx);

      const step = makeCtx({
        tokensUsed: { input: 10000, output: 5000 },
      });
      await hook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      // 10K input * $0.003/1K = $0.03
      // 5K output * $0.015/1K = $0.075
      // Total = $0.105
      expect(status.estimatedCostUsd).toBeCloseTo(0.105, 3);
    });
  });

  describe('warning levels', () => {
    it('should show no warning under threshold', async () => {
      const ctx = makeCtx();
      await hook.onRunStart(ctx);

      const step = makeCtx({ tokensUsed: { input: 1000, output: 500 } });
      await hook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      expect(status.warningLevel).toBe('none');
    });

    it('should show approaching warning at 75%', async () => {
      const smallBudgetHook = new BudgetManagementHook({ maxTotalTokens: 1000 });
      const ctx = makeCtx();
      await smallBudgetHook.onRunStart(ctx);

      const step = makeCtx({ tokensUsed: { input: 400, output: 400 } });
      await smallBudgetHook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      expect(status.warningLevel).toBe('approaching');
    });

    it('should show critical warning at 90%', async () => {
      const smallBudgetHook = new BudgetManagementHook({ maxTotalTokens: 1000 });
      const ctx = makeCtx();
      await smallBudgetHook.onRunStart(ctx);

      const step = makeCtx({ tokensUsed: { input: 500, output: 450 } });
      await smallBudgetHook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      expect(status.warningLevel).toBe('critical');
    });

    it('should show exceeded at 100%', async () => {
      const smallBudgetHook = new BudgetManagementHook({ maxTotalTokens: 1000 });
      const ctx = makeCtx();
      await smallBudgetHook.onRunStart(ctx);

      const step = makeCtx({ tokensUsed: { input: 600, output: 500 } });
      await smallBudgetHook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      expect(status.warningLevel).toBe('exceeded');
    });
  });

  describe('budget warnings in context', () => {
    it('should inject budget warning before step when approaching', async () => {
      const smallBudgetHook = new BudgetManagementHook({ maxTotalTokens: 1000 });
      const ctx = makeCtx();
      await smallBudgetHook.onRunStart(ctx);

      // Consume 80% of budget
      const step1 = makeCtx({ tokensUsed: { input: 400, output: 400 } });
      await smallBudgetHook.onAfterStep(step1);

      // Check warning before next step
      const step2 = makeCtx({ stepId: 'step-2' });
      await smallBudgetHook.onBeforeStep(step2);

      expect(step2.metadata?.budgetWarning).toBeTruthy();
      expect(step2.metadata?.budgetWarning).toContain('consumed');
    });

    it('should inject critical warning', async () => {
      const smallBudgetHook = new BudgetManagementHook({ maxTotalTokens: 1000 });
      const ctx = makeCtx();
      await smallBudgetHook.onRunStart(ctx);

      // Consume 95% of budget
      const step1 = makeCtx({ tokensUsed: { input: 500, output: 450 } });
      await smallBudgetHook.onAfterStep(step1);

      const step2 = makeCtx({ stepId: 'step-2' });
      await smallBudgetHook.onBeforeStep(step2);

      expect(step2.metadata?.budgetWarning).toContain('CRITICAL');
    });
  });

  describe('blocking mode', () => {
    it('should throw BudgetExceededError when budget exceeded', async () => {
      const blockingHook = new BudgetManagementHook({
        maxTotalTokens: 1000,
        enforceBlocking: true,
      });

      const ctx = makeCtx();
      await blockingHook.onRunStart(ctx);

      // Exceed budget
      const step1 = makeCtx({ tokensUsed: { input: 600, output: 500 } });
      await blockingHook.onAfterStep(step1);

      // Next step should be blocked
      const step2 = makeCtx({ stepId: 'step-2' });
      await expect(blockingHook.onBeforeStep(step2)).rejects.toThrow(BudgetExceededError);
    });

    it('should call onBudgetExceeded callback', async () => {
      const onExceeded = vi.fn();
      const blockingHook = new BudgetManagementHook({
        maxTotalTokens: 1000,
        enforceBlocking: true,
        onBudgetExceeded: onExceeded,
      });

      const ctx = makeCtx();
      await blockingHook.onRunStart(ctx);

      const step1 = makeCtx({ tokensUsed: { input: 600, output: 500 } });
      await blockingHook.onAfterStep(step1);

      const step2 = makeCtx({ stepId: 'step-2' });
      await expect(blockingHook.onBeforeStep(step2)).rejects.toThrow();
      expect(onExceeded).toHaveBeenCalledOnce();
    });

    it('should not throw when under budget', async () => {
      const blockingHook = new BudgetManagementHook({
        maxTotalTokens: 1000000,
        enforceBlocking: true,
      });

      const ctx = makeCtx();
      await blockingHook.onRunStart(ctx);

      const step1 = makeCtx({ tokensUsed: { input: 100, output: 50 } });
      await blockingHook.onAfterStep(step1);

      const step2 = makeCtx({ stepId: 'step-2' });
      await expect(blockingHook.onBeforeStep(step2)).resolves.toBeUndefined();
    });
  });

  describe('cost-based budget', () => {
    it('should trigger on cost exceeding budget', async () => {
      const costHook = new BudgetManagementHook({
        maxTotalTokens: 10_000_000, // Very high token limit
        maxCostUsd: 0.01,           // Very low cost limit
        costPer1kInputTokens: 0.003,
        costPer1kOutputTokens: 0.015,
      });

      const ctx = makeCtx();
      await costHook.onRunStart(ctx);

      // 10K output tokens * $0.015/1K = $0.15 (far exceeds $0.01)
      const step = makeCtx({ tokensUsed: { input: 1000, output: 10000 } });
      await costHook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      expect(status.warningLevel).toBe('exceeded');
    });
  });

  describe('onRunEnd', () => {
    it('should clean up and not error for unknown runs', async () => {
      await expect(hook.onRunEnd(makeCtx({ runId: 'unknown' }), true))
        .resolves.toBeUndefined();
    });

    it('should clean up tracking data', async () => {
      const ctx = makeCtx();
      await hook.onRunStart(ctx);

      const step = makeCtx({ tokensUsed: { input: 100, output: 50 } });
      await hook.onAfterStep(step);

      await hook.onRunEnd(ctx, true);

      // After cleanup, before-step should not have budget info
      const lateStep = makeCtx({ stepId: 'step-late' });
      await hook.onBeforeStep(lateStep);
      expect(lateStep.metadata?.budgetStatus).toBeUndefined();
    });
  });

  describe('no tokens used', () => {
    it('should handle steps without token info', async () => {
      const ctx = makeCtx();
      await hook.onRunStart(ctx);

      const step = makeCtx(); // No tokensUsed
      await hook.onAfterStep(step);

      const status = step.metadata?.budgetStatus as any;
      expect(status.totalInputTokens).toBe(0);
      expect(status.totalOutputTokens).toBe(0);
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', async () => {
      expect(await hook.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is false', async () => {
      const orig = process.env.GWI_BUDGET_MANAGEMENT_ENABLED;
      process.env.GWI_BUDGET_MANAGEMENT_ENABLED = 'false';
      try {
        expect(await hook.isEnabled()).toBe(false);
      } finally {
        if (orig === undefined) delete process.env.GWI_BUDGET_MANAGEMENT_ENABLED;
        else process.env.GWI_BUDGET_MANAGEMENT_ENABLED = orig;
      }
    });
  });
});
