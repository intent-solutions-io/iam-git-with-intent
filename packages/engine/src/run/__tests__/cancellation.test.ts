/**
 * Tests for Run Cancellation Semantics (A2.s4)
 *
 * Tests cover:
 * - CancellationToken cooperative cancellation
 * - CompensationRegistry for rollback
 * - CancellationContext for run-level handling
 *
 * @module @gwi/engine/run/__tests__/cancellation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CancellationToken,
  CancellationTokenSource,
  CancelledError,
  isCancelledError,
  CompensationRegistry,
  createCancellationContext,
  createStepCheckpoint,
  type CancellationReason,
} from '../cancellation.js';

describe('CancellationToken', () => {
  describe('basic functionality', () => {
    it('should start uncancelled', () => {
      const token = new CancellationToken();
      expect(token.isCancelled).toBe(false);
      expect(token.reason).toBeUndefined();
    });

    it('should track cancellation with reason', () => {
      const token = new CancellationToken();
      const reason: CancellationReason = {
        initiator: 'user',
        reason: 'User requested cancellation',
        userId: 'user-123',
        requestedAt: new Date(),
      };

      token.cancel(reason);

      expect(token.isCancelled).toBe(true);
      expect(token.reason).toEqual(reason);
    });

    it('should only cancel once', () => {
      const token = new CancellationToken();
      const firstReason: CancellationReason = {
        initiator: 'user',
        reason: 'First cancellation',
        requestedAt: new Date(),
      };
      const secondReason: CancellationReason = {
        initiator: 'system',
        reason: 'Second cancellation',
        requestedAt: new Date(),
      };

      token.cancel(firstReason);
      token.cancel(secondReason);

      expect(token.reason?.reason).toBe('First cancellation');
    });
  });

  describe('throwIfCancelled', () => {
    it('should not throw when not cancelled', () => {
      const token = new CancellationToken();
      expect(() => token.throwIfCancelled()).not.toThrow();
    });

    it('should throw CancelledError when cancelled', () => {
      const token = new CancellationToken();
      const reason: CancellationReason = {
        initiator: 'timeout',
        reason: 'Operation timed out',
        requestedAt: new Date(),
      };

      token.cancel(reason);

      expect(() => token.throwIfCancelled()).toThrow(CancelledError);
    });

    it('should include reason in thrown error', () => {
      const token = new CancellationToken();
      const reason: CancellationReason = {
        initiator: 'policy',
        reason: 'Policy violation',
        requestedAt: new Date(),
      };

      token.cancel(reason);

      try {
        token.throwIfCancelled();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CancelledError);
        expect((error as CancelledError).reason).toEqual(reason);
      }
    });
  });

  describe('onCancelled callback', () => {
    it('should call callback when cancelled', () => {
      const token = new CancellationToken();
      const callback = vi.fn();
      const reason: CancellationReason = {
        initiator: 'user',
        reason: 'Test',
        requestedAt: new Date(),
      };

      token.onCancelled(callback);
      token.cancel(reason);

      expect(callback).toHaveBeenCalledWith(reason);
    });

    it('should allow unsubscribing from callback', () => {
      const token = new CancellationToken();
      const callback = vi.fn();
      const reason: CancellationReason = {
        initiator: 'user',
        reason: 'Test',
        requestedAt: new Date(),
      };

      const unsubscribe = token.onCancelled(callback);
      unsubscribe();
      token.cancel(reason);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('whenCancelled', () => {
    it('should resolve immediately if already cancelled', async () => {
      const token = new CancellationToken();
      const reason: CancellationReason = {
        initiator: 'user',
        reason: 'Already cancelled',
        requestedAt: new Date(),
      };

      token.cancel(reason);
      const result = await token.whenCancelled();

      expect(result).toEqual(reason);
    });

    it('should resolve when cancelled later', async () => {
      const token = new CancellationToken();
      const reason: CancellationReason = {
        initiator: 'system',
        reason: 'Cancelled later',
        requestedAt: new Date(),
      };

      const promise = token.whenCancelled();
      setTimeout(() => token.cancel(reason), 10);
      const result = await promise;

      expect(result).toEqual(reason);
    });
  });

  describe('createChild', () => {
    it('should inherit cancellation from parent', () => {
      const parent = new CancellationToken();
      const child = parent.createChild();
      const reason: CancellationReason = {
        initiator: 'user',
        reason: 'Parent cancelled',
        requestedAt: new Date(),
      };

      parent.cancel(reason);

      expect(child.isCancelled).toBe(true);
      expect(child.reason).toEqual(reason);
    });

    it('should be cancelled if parent already cancelled', () => {
      const parent = new CancellationToken();
      const reason: CancellationReason = {
        initiator: 'user',
        reason: 'Already cancelled',
        requestedAt: new Date(),
      };

      parent.cancel(reason);
      const child = parent.createChild();

      expect(child.isCancelled).toBe(true);
    });
  });
});

describe('CancellationTokenSource', () => {
  it('should create and manage a token', () => {
    const source = new CancellationTokenSource();
    const token = source.getToken();

    expect(token.isCancelled).toBe(false);
    expect(source.isCancelled).toBe(false);
  });

  it('should cancel through source', () => {
    const source = new CancellationTokenSource();
    const token = source.getToken();
    const reason: CancellationReason = {
      initiator: 'user',
      reason: 'Source cancellation',
      requestedAt: new Date(),
    };

    source.cancel(reason);

    expect(token.isCancelled).toBe(true);
    expect(source.isCancelled).toBe(true);
  });

  it('should throw after disposal', () => {
    const source = new CancellationTokenSource();
    source.dispose();

    expect(() =>
      source.cancel({
        initiator: 'user',
        reason: 'After disposal',
        requestedAt: new Date(),
      })
    ).toThrow('disposed');
  });
});

describe('isCancelledError', () => {
  it('should identify CancelledError', () => {
    const error = new CancelledError({
      initiator: 'user',
      reason: 'Test',
      requestedAt: new Date(),
    });

    expect(isCancelledError(error)).toBe(true);
  });

  it('should return false for other errors', () => {
    const error = new Error('Regular error');
    expect(isCancelledError(error)).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isCancelledError('string')).toBe(false);
    expect(isCancelledError(null)).toBe(false);
    expect(isCancelledError(undefined)).toBe(false);
  });
});

describe('CompensationRegistry', () => {
  describe('registration', () => {
    it('should register compensation actions', () => {
      const registry = new CompensationRegistry();

      registry.register({
        id: 'action-1',
        description: 'First action',
        execute: async () => {},
        priority: 1,
        critical: false,
      });

      expect(registry.hasCompensations()).toBe(true);
      expect(registry.getActions()).toHaveLength(1);
    });

    it('should not allow registration after execution', async () => {
      const registry = new CompensationRegistry();

      registry.register({
        id: 'action-1',
        description: 'First action',
        execute: async () => {},
        priority: 1,
        critical: false,
      });

      await registry.executeCompensations();

      expect(() =>
        registry.register({
          id: 'action-2',
          description: 'Second action',
          execute: async () => {},
          priority: 1,
          critical: false,
        })
      ).toThrow('executed');
    });
  });

  describe('execution', () => {
    it('should execute actions in reverse priority order', async () => {
      const registry = new CompensationRegistry();
      const executionOrder: string[] = [];

      registry.register({
        id: 'low-priority',
        description: 'Low priority',
        execute: async () => { executionOrder.push('low'); },
        priority: 1,
        critical: false,
      });

      registry.register({
        id: 'high-priority',
        description: 'High priority',
        execute: async () => { executionOrder.push('high'); },
        priority: 10,
        critical: false,
      });

      registry.register({
        id: 'medium-priority',
        description: 'Medium priority',
        execute: async () => { executionOrder.push('medium'); },
        priority: 5,
        critical: false,
      });

      await registry.executeCompensations();

      expect(executionOrder).toEqual(['high', 'medium', 'low']);
    });

    it('should handle action failures gracefully', async () => {
      const registry = new CompensationRegistry();

      registry.register({
        id: 'failing-action',
        description: 'Fails on purpose',
        execute: async () => { throw new Error('Intentional failure'); },
        priority: 2,
        critical: false,
      });

      registry.register({
        id: 'succeeding-action',
        description: 'Succeeds',
        execute: async () => {},
        priority: 1,
        critical: false,
      });

      const summary = await registry.executeCompensations();

      expect(summary.total).toBe(2);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.rollbackComplete).toBe(true); // Non-critical failure
    });

    it('should track critical failures', async () => {
      const registry = new CompensationRegistry();

      registry.register({
        id: 'critical-failure',
        description: 'Critical fails',
        execute: async () => { throw new Error('Critical failure'); },
        priority: 1,
        critical: true,
      });

      const summary = await registry.executeCompensations();

      expect(summary.criticalFailures).toBe(1);
      expect(summary.rollbackComplete).toBe(false);
    });

    it('should provide detailed results', async () => {
      const registry = new CompensationRegistry();

      registry.register({
        id: 'action-1',
        description: 'Succeeds',
        execute: async () => {},
        priority: 1,
        critical: false,
      });

      const summary = await registry.executeCompensations();

      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].actionId).toBe('action-1');
      expect(summary.results[0].success).toBe(true);
      expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should only execute once', async () => {
      const registry = new CompensationRegistry();
      const executeCount = vi.fn();

      registry.register({
        id: 'action-1',
        description: 'Count executions',
        execute: executeCount,
        priority: 1,
        critical: false,
      });

      await registry.executeCompensations();

      await expect(registry.executeCompensations()).rejects.toThrow('already');
      expect(executeCount).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all actions', () => {
      const registry = new CompensationRegistry();

      registry.register({
        id: 'action-1',
        description: 'First',
        execute: async () => {},
        priority: 1,
        critical: false,
      });

      registry.clear();

      expect(registry.hasCompensations()).toBe(false);
    });
  });
});

describe('createCancellationContext', () => {
  it('should create context with token and registry', () => {
    const ctx = createCancellationContext('run-123', 'tenant-456');

    expect(ctx.token).toBeInstanceOf(CancellationToken);
    expect(ctx.compensations).toBeInstanceOf(CompensationRegistry);
    expect(ctx.runId).toBe('run-123');
    expect(ctx.tenantId).toBe('tenant-456');
  });
});

describe('createStepCheckpoint', () => {
  it('should not throw when not cancelled', async () => {
    const ctx = createCancellationContext('run-123', 'tenant-456');
    const checkpoint = createStepCheckpoint(ctx, 'test-step');

    await expect(checkpoint({ name: 'before-work' })).resolves.not.toThrow();
  });

  it('should throw CancelledError when cancelled', async () => {
    const ctx = createCancellationContext('run-123', 'tenant-456');
    const checkpoint = createStepCheckpoint(ctx, 'test-step');

    ctx.token.cancel({
      initiator: 'user',
      reason: 'Test cancellation',
      requestedAt: new Date(),
    });

    await expect(checkpoint({ name: 'after-cancel' })).rejects.toThrow(CancelledError);
  });
});

describe('Integration: Cancellation with Compensation', () => {
  it('should execute compensations on cancellation', async () => {
    const ctx = createCancellationContext('run-123', 'tenant-456');
    const compensationExecuted = vi.fn();

    // Simulate work with compensation registration
    const simulateWork = async () => {
      // Register cleanup action
      ctx.compensations.register({
        id: 'cleanup-temp-files',
        description: 'Clean up temporary files',
        execute: compensationExecuted,
        priority: 1,
        critical: false,
      });

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check cancellation (this would be at a phase boundary)
      ctx.token.throwIfCancelled();
    };

    // Start work and cancel after a delay
    const workPromise = simulateWork();
    setTimeout(() => {
      ctx.token.cancel({
        initiator: 'user',
        reason: 'User cancelled',
        requestedAt: new Date(),
      });
    }, 5);

    // Work should be cancelled
    await expect(workPromise).rejects.toThrow(CancelledError);

    // Execute compensations
    const summary = await ctx.compensations.executeCompensations();

    expect(summary.total).toBe(1);
    expect(compensationExecuted).toHaveBeenCalled();
  });

  it('should handle complex compensation chains', async () => {
    const ctx = createCancellationContext('run-123', 'tenant-456');
    const actions: string[] = [];

    // Register compensations in order of work
    ctx.compensations.register({
      id: 'step-1-cleanup',
      description: 'Cleanup step 1',
      execute: async () => { actions.push('step-1-cleanup'); },
      priority: 1,
      critical: false,
    });

    ctx.compensations.register({
      id: 'step-2-cleanup',
      description: 'Cleanup step 2',
      execute: async () => { actions.push('step-2-cleanup'); },
      priority: 2,
      critical: false,
    });

    ctx.compensations.register({
      id: 'step-3-cleanup',
      description: 'Cleanup step 3 (critical)',
      execute: async () => { actions.push('step-3-cleanup'); },
      priority: 3,
      critical: true,
    });

    const summary = await ctx.compensations.executeCompensations();

    // Should execute in reverse priority order (LIFO-like behavior)
    expect(actions).toEqual(['step-3-cleanup', 'step-2-cleanup', 'step-1-cleanup']);
    expect(summary.rollbackComplete).toBe(true);
  });
});
