/**
 * Firestore Step State Store Tests
 *
 * C2: Tests specific to Firestore implementation.
 * Includes emulator-based integration tests.
 *
 * @module @gwi/engine/state
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FirestoreStepStateStore } from '../firestore-step-state.js';
import { testStepStateStore } from './step-state-store.test.js';
import type { StepOutput } from '../../step-contract/types.js';

/**
 * Check if Firestore emulator is configured
 */
function isFirestoreEmulatorConfigured(): boolean {
  return !!(
    process.env.GWI_FIRESTORE_EMULATOR_HOST ||
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GCP_PROJECT_ID === 'test-project'
  );
}

const SKIP_MESSAGE = 'Firestore emulator not configured. Set GWI_FIRESTORE_EMULATOR_HOST to run these tests.';

describe.skipIf(!isFirestoreEmulatorConfigured())('FirestoreStepStateStore', () => {
  let store: FirestoreStepStateStore;

  beforeAll(() => {
    // Ensure we're using emulator
    if (!process.env.GWI_FIRESTORE_EMULATOR_HOST && !process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.GWI_FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    }
    if (!process.env.GCP_PROJECT_ID) {
      process.env.GCP_PROJECT_ID = 'test-project';
    }
  });

  beforeEach(async () => {
    store = new FirestoreStepStateStore();
  });

  afterAll(async () => {
    if (store) {
      await store.close();
    }
  });

  describe('Firestore-specific behavior', () => {
    it('should use composite document ID (runId_stepId)', async () => {
      await store.initializeStep('run-123', 'step-456');

      // Verify by fetching with different runId/stepId combo
      const notFound = await store.getStepState('run-123', 'step-999');
      expect(notFound).toBeNull();

      const found = await store.getStepState('run-123', 'step-456');
      expect(found).not.toBeNull();
    });

    it('should handle Timestamp conversion correctly', async () => {
      const step = await store.initializeStep('run-1', 'step-1');

      // Dates should be proper Date objects, not Firestore Timestamps
      expect(step.createdAt).toBeInstanceOf(Date);
      expect(step.updatedAt).toBeInstanceOf(Date);

      // After retrieval
      const retrieved = await store.getStepState('run-1', 'step-1');
      expect(retrieved?.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.updatedAt).toBeInstanceOf(Date);
    });

    it('should preserve complex objects in input/output', async () => {
      const input = {
        runId: 'run-1',
        stepId: 'step-1',
        tenantId: 'tenant-1',
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        stepType: 'triage' as const,
        riskMode: 'comment_only' as const,
        capabilitiesMode: 'comment-only' as const,
        queuedAt: new Date().toISOString(),
      };

      await store.initializeStep('run-1', 'step-1', input as any);

      const retrieved = await store.getStepState('run-1', 'step-1');
      expect(retrieved?.input).toEqual(input);
    });

    it('should handle transaction-based optimistic locking', async () => {
      const step = await store.initializeStep('run-1', 'step-1');

      // First update succeeds
      const updated1 = await store.updateStepState('run-1', 'step-1', step.version, {
        status: 'running',
      });

      expect(updated1.version).toBe(2);

      // Second update with stale version fails
      await expect(
        store.updateStepState('run-1', 'step-1', step.version, { status: 'completed' })
      ).rejects.toThrow('Optimistic lock failed');
    });

    it('should use FieldValue.increment for atomic version bumps', async () => {
      await store.initializeStep('run-1', 'step-1');

      // Multiple concurrent status updates (no version check)
      await Promise.all([
        store.updateStepStatus('run-1', 'step-1', 'running'),
        store.updateStepStatus('run-1', 'step-1', 'blocked'),
      ]);

      // Final state should have version > 1
      const final = await store.getStepState('run-1', 'step-1');
      expect(final?.version).toBeGreaterThan(1);
    });
  });

  describe('Query performance', () => {
    it('should efficiently query steps by runId', async () => {
      // Create multiple steps
      for (let i = 1; i <= 10; i++) {
        await store.initializeStep('run-perf', `step-${i}`);
      }

      const start = Date.now();
      const steps = await store.getRunSteps('run-perf');
      const duration = Date.now() - start;

      expect(steps).toHaveLength(10);
      expect(duration).toBeLessThan(500); // Should be < 500ms
    });

    it('should efficiently filter pending steps', async () => {
      // Mix of pending, running, completed, failed
      await store.initializeStep('run-query', 'step-1');
      await store.initializeStep('run-query', 'step-2');
      await store.markStepStarted('run-query', 'step-1');
      await store.markStepCompleted('run-query', 'step-1', {
        runId: 'run-query',
        stepId: 'step-1',
        resultCode: 'ok',
        summary: 'Done',
      } as StepOutput);

      const start = Date.now();
      const pending = await store.getNextPendingSteps('run-query');
      const duration = Date.now() - start;

      expect(pending).toHaveLength(1);
      expect(pending[0].stepId).toBe('step-2');
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Batch operations', () => {
    it('should efficiently delete all run steps', async () => {
      // Create multiple steps
      for (let i = 1; i <= 20; i++) {
        await store.initializeStep('run-batch', `step-${i}`);
      }

      const start = Date.now();
      await store.deleteRunSteps('run-batch');
      const duration = Date.now() - start;

      const remaining = await store.getRunSteps('run-batch');
      expect(remaining).toHaveLength(0);
      expect(duration).toBeLessThan(2000); // Batch delete should be fast
    });
  });

  describe('Error handling', () => {
    it('should throw meaningful error for missing step', async () => {
      await expect(
        store.updateStepState('nonexistent', 'step-1', 1, { status: 'running' })
      ).rejects.toThrow('not found');
    });

    it('should preserve error context in failed steps', async () => {
      await store.initializeStep('run-1', 'step-1');
      await store.markStepStarted('run-1', 'step-1');

      const failed = await store.markStepFailed('run-1', 'step-1', {
        message: 'API call failed',
        code: 'API_ERROR',
        retryable: true,
        context: {
          statusCode: 503,
          endpoint: '/api/data',
          requestId: 'req-123',
        },
      });

      expect(failed.error?.context).toEqual({
        statusCode: 503,
        endpoint: '/api/data',
        requestId: 'req-123',
      });

      // Verify persistence
      const retrieved = await store.getStepState('run-1', 'step-1');
      expect(retrieved?.error?.context).toEqual(failed.error?.context);
    });
  });
});

// Run contract tests against Firestore implementation
if (isFirestoreEmulatorConfigured()) {
  testStepStateStore(
    'FirestoreStepStateStore',
    async () => {
      // Ensure emulator is configured
      if (!process.env.GWI_FIRESTORE_EMULATOR_HOST && !process.env.FIRESTORE_EMULATOR_HOST) {
        process.env.GWI_FIRESTORE_EMULATOR_HOST = 'localhost:8080';
      }
      if (!process.env.GCP_PROJECT_ID) {
        process.env.GCP_PROJECT_ID = 'test-project';
      }
      return new FirestoreStepStateStore();
    },
    async (store) => {
      // Cleanup: delete all test data
      const allSteps = await store.listSteps({});
      for (const step of allSteps) {
        await store.deleteStep(step.runId, step.stepId);
      }
    }
  );
} else {
  describe.skip('FirestoreStepStateStore Contract Tests', () => {
    it(SKIP_MESSAGE, () => {});
  });
}
