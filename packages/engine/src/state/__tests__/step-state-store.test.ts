/**
 * Step State Store Interface Contract Tests
 *
 * C2: Tests that validate the StepStateStore contract.
 * These tests run against all implementations (Memory, Firestore).
 *
 * @module @gwi/engine/state
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StepStateStore } from '../step-state-store.js';
import { OptimisticLockError } from '../step-state-store.js';
import { MemoryStepStateStore } from '../memory-step-state.js';
import type { StepInput, StepOutput } from '../../step-contract/types.js';

// =============================================================================
// Test Data Helpers
// =============================================================================

/**
 * Create a valid StepInput for testing
 */
function createTestStepInput(overrides: Partial<StepInput> = {}): StepInput {
  return {
    runId: '550e8400-e29b-41d4-a716-446655440000',
    stepId: 'step-1',
    tenantId: 'tenant-1',
    repo: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      defaultBranch: 'main',
    },
    stepType: 'triage',
    riskMode: 'comment_only',
    capabilitiesMode: 'comment-only',
    queuedAt: new Date().toISOString(),
    attemptNumber: 0,
    maxAttempts: 3,
    ...overrides,
  };
}

/**
 * Create a valid StepOutput for testing
 */
function createTestStepOutput(overrides: Partial<StepOutput> = {}): StepOutput {
  return {
    runId: '550e8400-e29b-41d4-a716-446655440000',
    stepId: 'step-1',
    resultCode: 'ok',
    summary: 'Test completed successfully',
    timing: {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 100,
    },
    requiresApproval: false,
    ...overrides,
  };
}

/**
 * Run contract tests against a store implementation
 */
export function testStepStateStore(
  name: string,
  createStore: () => Promise<StepStateStore>,
  cleanupStore?: (store: StepStateStore) => Promise<void>
) {
  describe(`${name} - StepStateStore Contract`, () => {
    let store: StepStateStore;

    beforeEach(async () => {
      store = await createStore();
    });

    afterEach(async () => {
      if (cleanupStore) {
        await cleanupStore(store);
      }
      await store.close();
    });

    describe('initializeStep', () => {
      it('should create a new step with pending status', async () => {
        const step = await store.initializeStep('run-1', 'step-1');

        expect(step.runId).toBe('run-1');
        expect(step.stepId).toBe('step-1');
        expect(step.status).toBe('pending');
        expect(step.attempts).toBe(0);
        expect(step.maxAttempts).toBe(3);
        expect(step.version).toBe(1);
        expect(step.createdAt).toBeInstanceOf(Date);
        expect(step.updatedAt).toBeInstanceOf(Date);
      });

      it('should store step input if provided', async () => {
        const input = createTestStepInput({
          runId: '550e8400-e29b-41d4-a716-446655440001',
          stepId: 'step-1',
          tenantId: 'tenant-1',
        });

        const step = await store.initializeStep('run-1', 'step-1', input);

        expect(step.input).toEqual(input);
      });

      it('should use custom maxAttempts if provided', async () => {
        const step = await store.initializeStep('run-1', 'step-1', undefined, 5);

        expect(step.maxAttempts).toBe(5);
      });
    });

    describe('getStepState', () => {
      it('should return step state if exists', async () => {
        await store.initializeStep('run-1', 'step-1');

        const step = await store.getStepState('run-1', 'step-1');

        expect(step).not.toBeNull();
        expect(step?.stepId).toBe('step-1');
      });

      it('should return null if step does not exist', async () => {
        const step = await store.getStepState('run-1', 'nonexistent');

        expect(step).toBeNull();
      });
    });

    describe('updateStepState', () => {
      it('should update step state with version check', async () => {
        const initial = await store.initializeStep('run-1', 'step-1');

        const updated = await store.updateStepState('run-1', 'step-1', 1, {
          status: 'running',
        });

        expect(updated.status).toBe('running');
        expect(updated.version).toBe(2);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime());
      });

      it('should throw OptimisticLockError on version mismatch', async () => {
        await store.initializeStep('run-1', 'step-1');

        // First update succeeds
        await store.updateStepState('run-1', 'step-1', 1, { status: 'running' });

        // Second update with stale version fails
        await expect(
          store.updateStepState('run-1', 'step-1', 1, { status: 'completed' })
        ).rejects.toThrow(OptimisticLockError);
      });

      it('should update multiple fields atomically', async () => {
        await store.initializeStep('run-1', 'step-1');

        const output = createTestStepOutput({
          runId: '550e8400-e29b-41d4-a716-446655440001',
          stepId: 'step-1',
          summary: 'Success',
        });

        const updated = await store.updateStepState('run-1', 'step-1', 1, {
          status: 'completed',
          output,
          completedAt: new Date(),
        });

        expect(updated.status).toBe('completed');
        expect(updated.output).toEqual(output);
        expect(updated.completedAt).toBeInstanceOf(Date);
      });
    });

    describe('updateStepStatus', () => {
      it('should update status atomically', async () => {
        await store.initializeStep('run-1', 'step-1');

        const updated = await store.updateStepStatus('run-1', 'step-1', 'running');

        expect(updated.status).toBe('running');
        expect(updated.version).toBe(2);
      });

      it('should work without explicit version check', async () => {
        await store.initializeStep('run-1', 'step-1');

        // Multiple sequential updates should all succeed
        await store.updateStepStatus('run-1', 'step-1', 'running');
        await store.updateStepStatus('run-1', 'step-1', 'blocked');
        const final = await store.updateStepStatus('run-1', 'step-1', 'completed');

        expect(final.status).toBe('completed');
        expect(final.version).toBe(4);
      });
    });

    describe('markStepStarted', () => {
      it('should increment attempts and set status to running', async () => {
        await store.initializeStep('run-1', 'step-1');

        const started = await store.markStepStarted('run-1', 'step-1');

        expect(started.status).toBe('running');
        expect(started.attempts).toBe(1);
        expect(started.startedAt).toBeInstanceOf(Date);
        expect(started.lastAttemptAt).toBeInstanceOf(Date);
      });

      it('should increment attempts on retry', async () => {
        await store.initializeStep('run-1', 'step-1');

        await store.markStepStarted('run-1', 'step-1');
        await store.markStepFailed('run-1', 'step-1', {
          message: 'Temporary error',
          retryable: true,
        });

        const retry = await store.markStepStarted('run-1', 'step-1');

        expect(retry.attempts).toBe(2);
        expect(retry.lastAttemptAt?.getTime()).toBeGreaterThan(
          retry.startedAt!.getTime()
        );
      });

      it('should preserve startedAt on retry', async () => {
        await store.initializeStep('run-1', 'step-1');

        const first = await store.markStepStarted('run-1', 'step-1');
        await store.markStepFailed('run-1', 'step-1', {
          message: 'Error',
          retryable: true,
        });

        const retry = await store.markStepStarted('run-1', 'step-1');

        expect(retry.startedAt).toEqual(first.startedAt);
      });
    });

    describe('markStepCompleted', () => {
      it('should set status to completed with output', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.markStepStarted('run-1', 'step-1');

        const output = createTestStepOutput({
          runId: '550e8400-e29b-41d4-a716-446655440001',
          stepId: 'step-1',
          summary: 'Task completed successfully',
        });

        const completed = await store.markStepCompleted(
          'run-1',
          'step-1',
          output
        );

        expect(completed.status).toBe('completed');
        expect(completed.output).toEqual(output);
        expect(completed.completedAt).toBeInstanceOf(Date);
      });
    });

    describe('markStepFailed', () => {
      it('should set status to failed with error', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.markStepStarted('run-1', 'step-1');

        const failed = await store.markStepFailed('run-1', 'step-1', {
          message: 'Network timeout',
          code: 'TIMEOUT',
          retryable: true,
          context: { url: 'https://api.example.com' },
        });

        expect(failed.status).toBe('failed');
        expect(failed.error?.message).toBe('Network timeout');
        expect(failed.error?.code).toBe('TIMEOUT');
        expect(failed.error?.retryable).toBe(true);
        expect(failed.error?.context).toEqual({ url: 'https://api.example.com' });
        expect(failed.completedAt).toBeInstanceOf(Date);
      });

      it('should default retryable to false', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.markStepStarted('run-1', 'step-1');

        const failed = await store.markStepFailed('run-1', 'step-1', {
          message: 'Fatal error',
        });

        expect(failed.error?.retryable).toBe(false);
      });
    });

    describe('getRunSteps', () => {
      it('should return all steps for a run ordered by creation', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-3');
        await store.initializeStep('run-1', 'step-2');
        await store.initializeStep('run-2', 'step-1');

        const steps = await store.getRunSteps('run-1');

        expect(steps).toHaveLength(3);
        expect(steps.map((s) => s.stepId)).toEqual(['step-1', 'step-3', 'step-2']);
      });

      it('should return empty array for run with no steps', async () => {
        const steps = await store.getRunSteps('nonexistent');

        expect(steps).toEqual([]);
      });
    });

    describe('getNextPendingSteps', () => {
      it('should return pending steps', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');

        const pending = await store.getNextPendingSteps('run-1');

        expect(pending).toHaveLength(2);
        expect(pending.every((s) => s.status === 'pending')).toBe(true);
      });

      it('should include failed steps with retries remaining', async () => {
        await store.initializeStep('run-1', 'step-1', undefined, 3);
        await store.markStepStarted('run-1', 'step-1');
        await store.markStepFailed('run-1', 'step-1', {
          message: 'Error',
          retryable: true,
        });

        const pending = await store.getNextPendingSteps('run-1');

        expect(pending).toHaveLength(1);
        expect(pending[0].stepId).toBe('step-1');
        expect(pending[0].status).toBe('failed');
        expect(pending[0].attempts).toBe(1);
      });

      it('should exclude failed steps with no retries remaining', async () => {
        await store.initializeStep('run-1', 'step-1', undefined, 1);
        await store.markStepStarted('run-1', 'step-1');
        await store.markStepFailed('run-1', 'step-1', {
          message: 'Error',
          retryable: true,
        });

        const pending = await store.getNextPendingSteps('run-1');

        expect(pending).toHaveLength(0);
      });

      it('should exclude completed steps', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.markStepStarted('run-1', 'step-1');
        await store.markStepCompleted('run-1', 'step-1', createTestStepOutput({
          runId: '550e8400-e29b-41d4-a716-446655440001',
          stepId: 'step-1',
          summary: 'Done',
        }));

        const pending = await store.getNextPendingSteps('run-1');

        expect(pending).toHaveLength(0);
      });

      it('should respect limit parameter', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');
        await store.initializeStep('run-1', 'step-3');

        const pending = await store.getNextPendingSteps('run-1', 2);

        expect(pending).toHaveLength(2);
      });
    });

    describe('listSteps', () => {
      it('should filter by runId', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-2', 'step-1');

        const steps = await store.listSteps({ runId: 'run-1' });

        expect(steps).toHaveLength(1);
        expect(steps[0].runId).toBe('run-1');
      });

      it('should filter by status', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');
        await store.markStepStarted('run-1', 'step-1');

        const steps = await store.listSteps({ runId: 'run-1', status: 'running' });

        expect(steps).toHaveLength(1);
        expect(steps[0].stepId).toBe('step-1');
      });

      it('should filter by multiple statuses', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');
        await store.markStepStarted('run-1', 'step-2');

        const steps = await store.listSteps({
          runId: 'run-1',
          status: ['pending', 'running'],
        });

        expect(steps).toHaveLength(2);
      });

      it('should filter executable steps', async () => {
        await store.initializeStep('run-1', 'step-1'); // pending
        await store.initializeStep('run-1', 'step-2', undefined, 3);
        await store.markStepStarted('run-1', 'step-2');
        await store.markStepFailed('run-1', 'step-2', {
          message: 'Error',
          retryable: true,
        }); // failed, retryable

        await store.initializeStep('run-1', 'step-3', undefined, 1);
        await store.markStepStarted('run-1', 'step-3');
        await store.markStepFailed('run-1', 'step-3', {
          message: 'Error',
          retryable: true,
        }); // failed, no retries

        const steps = await store.listSteps({ runId: 'run-1', executable: true });

        expect(steps).toHaveLength(2);
        expect(steps.map((s) => s.stepId).sort()).toEqual(['step-1', 'step-2']);
      });

      it('should apply limit and offset', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');
        await store.initializeStep('run-1', 'step-3');
        await store.initializeStep('run-1', 'step-4');

        const page1 = await store.listSteps({ runId: 'run-1', limit: 2 });
        expect(page1).toHaveLength(2);
        expect(page1.map((s) => s.stepId)).toEqual(['step-1', 'step-2']);

        const page2 = await store.listSteps({ runId: 'run-1', limit: 2, offset: 2 });
        expect(page2).toHaveLength(2);
        expect(page2.map((s) => s.stepId)).toEqual(['step-3', 'step-4']);
      });
    });

    describe('deleteRunSteps', () => {
      it('should delete all steps for a run', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');
        await store.initializeStep('run-2', 'step-1');

        await store.deleteRunSteps('run-1');

        const run1Steps = await store.getRunSteps('run-1');
        const run2Steps = await store.getRunSteps('run-2');

        expect(run1Steps).toHaveLength(0);
        expect(run2Steps).toHaveLength(1);
      });
    });

    describe('deleteStep', () => {
      it('should delete a specific step', async () => {
        await store.initializeStep('run-1', 'step-1');
        await store.initializeStep('run-1', 'step-2');

        await store.deleteStep('run-1', 'step-1');

        const step1 = await store.getStepState('run-1', 'step-1');
        const step2 = await store.getStepState('run-1', 'step-2');

        expect(step1).toBeNull();
        expect(step2).not.toBeNull();
      });
    });

    describe('concurrent updates', () => {
      it('should handle concurrent status updates safely', async () => {
        await store.initializeStep('run-1', 'step-1');

        // Simulate concurrent updates (both should succeed with atomic updates)
        const [result1, result2] = await Promise.all([
          store.updateStepStatus('run-1', 'step-1', 'running'),
          store.updateStepStatus('run-1', 'step-1', 'blocked'),
        ]);

        // Both should succeed (no version check in updateStepStatus)
        expect(result1.status).toBe('running');
        expect(result2.status).toBe('blocked');

        // Final state should be one of them
        const final = await store.getStepState('run-1', 'step-1');
        expect(['running', 'blocked']).toContain(final?.status);
      });

      it('should prevent concurrent updateStepState with different versions', async () => {
        const initial = await store.initializeStep('run-1', 'step-1');

        // Try concurrent updates with same version
        const updates = Promise.all([
          store.updateStepState('run-1', 'step-1', initial.version, {
            status: 'running',
          }),
          store.updateStepState('run-1', 'step-1', initial.version, {
            status: 'blocked',
          }),
        ]);

        // One should succeed, one should fail with OptimisticLockError
        await expect(updates).rejects.toThrow(OptimisticLockError);
      });
    });
  });
}

// Run tests against MemoryStepStateStore
testStepStateStore('MemoryStepStateStore', async () => new MemoryStepStateStore());
