/**
 * Risk Enforcement Hook Tests
 *
 * Tests the RiskEnforcementHook's onBeforeStep blocking behavior
 * and onAfterStep audit logging.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  RiskEnforcementHook,
  RiskEnforcementError,
} from '../risk-enforcement-hook.js';
import type { AgentRunContext } from '../types.js';

function makeCtx(overrides?: Partial<AgentRunContext>): AgentRunContext {
  return {
    runId: 'test-run-1',
    runType: 'autopilot',
    stepId: 'step-1',
    agentRole: 'CODER',
    stepStatus: 'pending',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe('RiskEnforcementHook', () => {
  describe('onBeforeStep', () => {
    it('should block operations exceeding risk tier', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R1' });
      const ctx = makeCtx({
        metadata: { operation: 'write_file' }, // Requires R2
      });

      await expect(hook.onBeforeStep(ctx)).rejects.toThrow(RiskEnforcementError);
    });

    it('should allow operations within risk tier', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R2' });
      const ctx = makeCtx({
        metadata: { operation: 'write_file' }, // Requires R2
      });

      await expect(hook.onBeforeStep(ctx)).resolves.toBeUndefined();
    });

    it('should allow read operations at any tier', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R0' });
      const ctx = makeCtx({
        metadata: { operation: 'read_file' }, // Requires R0
      });

      await expect(hook.onBeforeStep(ctx)).resolves.toBeUndefined();
    });

    it('should skip when no operation in metadata', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R0' });
      const ctx = makeCtx({ metadata: {} });

      await expect(hook.onBeforeStep(ctx)).resolves.toBeUndefined();
    });

    it('should call onBlocked callback when blocking', async () => {
      const onBlocked = vi.fn();
      const hook = new RiskEnforcementHook({
        maxRiskTier: 'R1',
        onBlocked,
      });
      const ctx = makeCtx({
        metadata: { operation: 'open_pr' }, // Requires R2
      });

      await expect(hook.onBeforeStep(ctx)).rejects.toThrow(RiskEnforcementError);
      expect(onBlocked).toHaveBeenCalledOnce();
      expect(onBlocked).toHaveBeenCalledWith(ctx, expect.stringContaining('open_pr'));
    });

    it('should call onAllowed callback when allowing', async () => {
      const onAllowed = vi.fn();
      const hook = new RiskEnforcementHook({
        maxRiskTier: 'R2',
        onAllowed,
      });
      const ctx = makeCtx({
        metadata: { operation: 'write_file' },
      });

      await expect(hook.onBeforeStep(ctx)).resolves.toBeUndefined();
      expect(onAllowed).toHaveBeenCalledOnce();
    });

    it('should warn but not throw when enforceBlocking is false', async () => {
      const hook = new RiskEnforcementHook({
        maxRiskTier: 'R0',
        enforceBlocking: false,
      });
      const ctx = makeCtx({
        metadata: { operation: 'merge_pr' }, // Requires R4
      });

      await expect(hook.onBeforeStep(ctx)).resolves.toBeUndefined();
    });

    it('should NOT call onAllowed when operation exceeds tier (warn-only)', async () => {
      const onAllowed = vi.fn();
      const hook = new RiskEnforcementHook({
        maxRiskTier: 'R0',
        enforceBlocking: false,
        onAllowed,
      });
      const ctx = makeCtx({
        metadata: { operation: 'write_file' }, // Requires R2, exceeds R0
      });

      await hook.onBeforeStep(ctx);
      expect(onAllowed).not.toHaveBeenCalled();
    });

    it('should block R4 operations when max tier is R2', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R2' });
      const ctx = makeCtx({
        metadata: { operation: 'push_to_main' }, // Requires R4
      });

      await expect(hook.onBeforeStep(ctx)).rejects.toThrow(RiskEnforcementError);
    });

    it('should include operation in RiskEnforcementError', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R1' });
      const ctx = makeCtx({
        metadata: { operation: 'deploy_service' }, // Requires R3
      });

      try {
        await hook.onBeforeStep(ctx);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RiskEnforcementError);
        const riskErr = err as RiskEnforcementError;
        expect(riskErr.operation).toBe('deploy_service');
        expect(riskErr.requiredTier).toBe('R3');
        expect(riskErr.allowedTier).toBe('R1');
      }
    });
  });

  describe('onAfterStep', () => {
    it('should not throw for any operation (audit only)', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R0' });
      const ctx = makeCtx({
        metadata: { operation: 'push_to_main' }, // Would exceed R0
      });

      // onAfterStep is audit-only — never throws
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });
  });

  describe('onRunStart', () => {
    it('should block agent role exceeding risk tier', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R0' });
      const ctx = makeCtx({ agentRole: 'CODER' }); // CODER requires R2

      await expect(hook.onRunStart(ctx)).rejects.toThrow(RiskEnforcementError);
    });

    it('should allow agent role within risk tier', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R2' });
      const ctx = makeCtx({ agentRole: 'CODER' }); // CODER requires R2

      await expect(hook.onRunStart(ctx)).resolves.toBeUndefined();
    });

    it('should allow read-only roles at R0', async () => {
      const hook = new RiskEnforcementHook({ maxRiskTier: 'R0' });
      const ctx = makeCtx({ agentRole: 'TRIAGE' }); // TRIAGE requires R0

      await expect(hook.onRunStart(ctx)).resolves.toBeUndefined();
    });
  });

  describe('AgentHookRunner.beforeStep integration', () => {
    it('should propagate RiskEnforcementError through runner', async () => {
      // Import runner dynamically to test integration
      const { AgentHookRunner } = await import('../runner.js');

      const runner = new AgentHookRunner();
      runner.register(new RiskEnforcementHook({ maxRiskTier: 'R1' }));

      const ctx = makeCtx({
        metadata: { operation: 'write_file' }, // Requires R2
      });

      await expect(runner.beforeStep(ctx)).rejects.toThrow(RiskEnforcementError);
    });

    it('should allow operations through runner when within tier', async () => {
      const { AgentHookRunner } = await import('../runner.js');

      const runner = new AgentHookRunner();
      runner.register(new RiskEnforcementHook({ maxRiskTier: 'R4' }));

      const ctx = makeCtx({
        metadata: { operation: 'push_to_main' }, // Requires R4
      });

      const result = await runner.beforeStep(ctx);
      expect(result.successfulHooks).toBe(1);
      expect(result.failedHooks).toBe(0);
    });
  });
});
