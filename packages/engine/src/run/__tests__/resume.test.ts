/**
 * Tests for Run Resume Semantics (A2.s5)
 *
 * Tests cover:
 * - Checkpoint creation and persistence
 * - Resume point discovery
 * - Resume validation (canResume)
 * - Resume execution with state recovery
 * - Idempotent step replay
 *
 * @module @gwi/engine/run/__tests__/resume
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Run, RunStep, StepCheckpoint } from '@gwi/core';
import {
  createCheckpoint,
  InMemoryCheckpointStore,
  createResumeContext,
  shouldSkipStep,
  isResumePoint,
  type CheckpointStore,
} from '../checkpoint.js';
import {
  findResumePoint,
  canResume,
  resumeRun,
  canReplayStep,
  recoverState,
} from '../resume.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: 'step-1',
    runId: 'run-123',
    agent: 'test-agent',
    status: 'completed',
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 100,
    ...overrides,
  };
}

function createTestRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-123',
    prId: 'pr-1',
    prUrl: 'https://github.com/org/repo/pull/1',
    type: 'triage',
    status: 'running',
    steps: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// Checkpoint Creation Tests
// =============================================================================

describe('createCheckpoint', () => {
  it('should create checkpoint from completed step', () => {
    const step = createTestStep({
      id: 'step-1',
      agent: 'triage',
      status: 'completed',
      input: { prUrl: 'test' },
      output: { result: 'success' },
      tokensUsed: { input: 100, output: 50 },
      durationMs: 150,
    });

    const checkpoint = createCheckpoint({ step });

    expect(checkpoint.stepId).toBe('step-1');
    expect(checkpoint.agent).toBe('triage');
    expect(checkpoint.status).toBe('completed');
    expect(checkpoint.input).toEqual({ prUrl: 'test' });
    expect(checkpoint.output).toEqual({ result: 'success' });
    expect(checkpoint.resumable).toBe(true); // default
    expect(checkpoint.idempotent).toBe(false); // default
    expect(checkpoint.tokensUsed).toEqual({ input: 100, output: 50 });
    expect(checkpoint.durationMs).toBe(150);
  });

  it('should support custom resumable and idempotent flags', () => {
    const step = createTestStep();

    const checkpoint = createCheckpoint({
      step,
      resumable: false,
      idempotent: true,
    });

    expect(checkpoint.resumable).toBe(false);
    expect(checkpoint.idempotent).toBe(true);
  });

  it('should capture error for failed steps', () => {
    const step = createTestStep({
      status: 'failed',
      error: 'Test error',
    });

    const checkpoint = createCheckpoint({ step });

    expect(checkpoint.status).toBe('failed');
    expect(checkpoint.error).toBe('Test error');
  });
});

// =============================================================================
// InMemoryCheckpointStore Tests
// =============================================================================

describe('InMemoryCheckpointStore', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should save and retrieve checkpoints', async () => {
    const checkpoint: StepCheckpoint = {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    };

    await store.saveCheckpoint('run-123', checkpoint);

    const checkpoints = await store.getCheckpoints('run-123');
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toEqual(checkpoint);
  });

  it('should maintain checkpoint order', async () => {
    const checkpoint1: StepCheckpoint = {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 1000),
      resumable: true,
      idempotent: false,
    };

    const checkpoint2: StepCheckpoint = {
      stepId: 'step-2',
      agent: 'planner',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    };

    await store.saveCheckpoint('run-123', checkpoint1);
    await store.saveCheckpoint('run-123', checkpoint2);

    const checkpoints = await store.getCheckpoints('run-123');
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0].stepId).toBe('step-1');
    expect(checkpoints[1].stepId).toBe('step-2');
  });

  it('should get latest successful checkpoint', async () => {
    const checkpoint1: StepCheckpoint = {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 2000),
      resumable: true,
      idempotent: false,
    };

    const checkpoint2: StepCheckpoint = {
      stepId: 'step-2',
      agent: 'planner',
      status: 'failed',
      timestamp: new Date(Date.now() - 1000),
      resumable: true,
      idempotent: false,
    };

    const checkpoint3: StepCheckpoint = {
      stepId: 'step-3',
      agent: 'coder',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    };

    await store.saveCheckpoint('run-123', checkpoint1);
    await store.saveCheckpoint('run-123', checkpoint2);
    await store.saveCheckpoint('run-123', checkpoint3);

    const latest = await store.getLatestCheckpoint('run-123');
    expect(latest?.stepId).toBe('step-3');
  });

  it('should return null if no successful checkpoints', async () => {
    const checkpoint: StepCheckpoint = {
      stepId: 'step-1',
      agent: 'triage',
      status: 'failed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    };

    await store.saveCheckpoint('run-123', checkpoint);

    const latest = await store.getLatestCheckpoint('run-123');
    expect(latest).toBeNull();
  });

  it('should clear checkpoints', async () => {
    const checkpoint: StepCheckpoint = {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    };

    await store.saveCheckpoint('run-123', checkpoint);
    await store.clearCheckpoints('run-123');

    const checkpoints = await store.getCheckpoints('run-123');
    expect(checkpoints).toHaveLength(0);
  });

  it('should check if run has checkpoints', async () => {
    expect(await store.hasCheckpoints('run-123')).toBe(false);

    const checkpoint: StepCheckpoint = {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    };

    await store.saveCheckpoint('run-123', checkpoint);
    expect(await store.hasCheckpoints('run-123')).toBe(true);
  });
});

// =============================================================================
// Resume Context Tests
// =============================================================================

describe('createResumeContext', () => {
  it('should create context from checkpoints', () => {
    const checkpoints: StepCheckpoint[] = [
      {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(Date.now() - 2000),
        resumable: true,
        idempotent: false,
      },
      {
        stepId: 'step-2',
        agent: 'planner',
        status: 'completed',
        timestamp: new Date(Date.now() - 1000),
        resumable: true,
        idempotent: false,
        output: { plan: 'test-plan' },
      },
    ];

    const ctx = createResumeContext({
      runId: 'run-123',
      mode: 'from_checkpoint',
      checkpoints,
    });

    expect(ctx.runId).toBe('run-123');
    expect(ctx.mode).toBe('from_checkpoint');
    expect(ctx.resumeCheckpoint?.stepId).toBe('step-2');
    expect(ctx.carryForwardState).toEqual({ plan: 'test-plan' });
    expect(ctx.resumeCount).toBe(1);
  });

  it('should build skip set correctly', () => {
    const checkpoints: StepCheckpoint[] = [
      {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(Date.now() - 2000),
        resumable: true,
        idempotent: false,
      },
      {
        stepId: 'step-2',
        agent: 'planner',
        status: 'completed',
        timestamp: new Date(Date.now() - 1000),
        resumable: true,
        idempotent: false,
      },
    ];

    const ctx = createResumeContext({
      runId: 'run-123',
      mode: 'from_checkpoint',
      checkpoints,
    });

    expect(shouldSkipStep(ctx, 'step-1')).toBe(true);
    expect(shouldSkipStep(ctx, 'step-2')).toBe(true);
    expect(shouldSkipStep(ctx, 'step-3')).toBe(false);
  });

  it('should identify resume point', () => {
    const checkpoints: StepCheckpoint[] = [
      {
        stepId: 'step-1',
        agent: 'triage',
        status: 'completed',
        timestamp: new Date(Date.now() - 1000),
        resumable: true,
        idempotent: false,
      },
      {
        stepId: 'step-2',
        agent: 'planner',
        status: 'completed',
        timestamp: new Date(),
        resumable: true,
        idempotent: false,
      },
    ];

    const ctx = createResumeContext({
      runId: 'run-123',
      mode: 'from_checkpoint',
      checkpoints,
    });

    expect(isResumePoint(ctx, 'step-1')).toBe(false);
    expect(isResumePoint(ctx, 'step-2')).toBe(true);
    expect(isResumePoint(ctx, 'step-3')).toBe(false);
  });

  it('should handle from_start mode', () => {
    const ctx = createResumeContext({
      runId: 'run-123',
      mode: 'from_start',
    });

    expect(ctx.mode).toBe('from_start');
    expect(ctx.resumeCheckpoint).toBeUndefined();
    expect(ctx.skipStepIds.size).toBe(0);
  });

  it('should increment resume count', () => {
    const ctx = createResumeContext({
      runId: 'run-123',
      mode: 'from_checkpoint',
      resumeCount: 2,
    });

    expect(ctx.resumeCount).toBe(3);
  });
});

// =============================================================================
// findResumePoint Tests
// =============================================================================

describe('findResumePoint', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should find last successful checkpoint', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 1000),
      resumable: true,
      idempotent: false,
    });

    await store.saveCheckpoint('run-123', {
      stepId: 'step-2',
      agent: 'planner',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await findResumePoint('run-123', store);

    expect(result.found).toBe(true);
    expect(result.checkpoint?.stepId).toBe('step-2');
    expect(result.checkpointIndex).toBe(1);
  });

  it('should return not found if no checkpoints', async () => {
    const result = await findResumePoint('run-123', store);

    expect(result.found).toBe(false);
    expect(result.reason).toContain('No checkpoints');
  });

  it('should skip non-resumable checkpoints', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 1000),
      resumable: true,
      idempotent: false,
    });

    await store.saveCheckpoint('run-123', {
      stepId: 'step-2',
      agent: 'planner',
      status: 'completed',
      timestamp: new Date(),
      resumable: false, // Not resumable
      idempotent: false,
    });

    const result = await findResumePoint('run-123', store);

    expect(result.found).toBe(true);
    expect(result.checkpoint?.stepId).toBe('step-1'); // Falls back to step-1
  });

  it('should skip failed checkpoints', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 1000),
      resumable: true,
      idempotent: false,
    });

    await store.saveCheckpoint('run-123', {
      stepId: 'step-2',
      agent: 'planner',
      status: 'failed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await findResumePoint('run-123', store);

    expect(result.found).toBe(true);
    expect(result.checkpoint?.stepId).toBe('step-1');
  });
});

// =============================================================================
// canResume Tests
// =============================================================================

describe('canResume', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should allow resume for failed run with checkpoints', async () => {
    const run = createTestRun({ status: 'failed' });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await canResume(run, store);

    expect(result.canResume).toBe(true);
    expect(result.resumePoint?.found).toBe(true);
  });

  it('should block resume if run not found', async () => {
    const result = await canResume(null, store);

    expect(result.canResume).toBe(false);
    expect(result.blocker).toBe('run_not_found');
  });

  it('should block resume if run already completed', async () => {
    const run = createTestRun({ status: 'completed' });

    const result = await canResume(run, store);

    expect(result.canResume).toBe(false);
    expect(result.blocker).toBe('run_completed');
  });

  it('should block resume if run cancelled', async () => {
    const run = createTestRun({ status: 'cancelled' });

    const result = await canResume(run, store);

    expect(result.canResume).toBe(false);
    expect(result.blocker).toBe('run_cancelled');
  });

  it('should block resume if no checkpoints', async () => {
    const run = createTestRun({ status: 'failed' });

    const result = await canResume(run, store);

    expect(result.canResume).toBe(false);
    expect(result.blocker).toBe('no_checkpoints');
  });

  it('should block resume if no resumable checkpoint', async () => {
    const run = createTestRun({ status: 'failed' });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'failed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await canResume(run, store);

    expect(result.canResume).toBe(false);
    expect(result.blocker).toBe('no_resumable_checkpoint');
  });
});

// =============================================================================
// resumeRun Tests
// =============================================================================

describe('resumeRun', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should create resume context for valid run', async () => {
    const run = createTestRun({ status: 'failed' });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
      output: { result: 'success' },
    });

    const result = await resumeRun({ run, store });

    expect(result.success).toBe(true);
    expect(result.context?.runId).toBe(run.id);
    expect(result.context?.mode).toBe('from_checkpoint');
    expect(result.context?.resumeCheckpoint?.stepId).toBe('step-1');
    expect(result.context?.carryForwardState).toEqual({ result: 'success' });
  });

  it('should fail if run cannot be resumed', async () => {
    const run = createTestRun({ status: 'completed' });

    const result = await resumeRun({ run, store });

    expect(result.success).toBe(false);
    expect(result.blocker).toBe('run_completed');
  });

  it('should support force resume', async () => {
    const run = createTestRun({ status: 'completed' });

    const result = await resumeRun({ run, store, force: true });

    expect(result.success).toBe(true);
    expect(result.context?.runId).toBe(run.id);
  });

  it('should support custom resume mode', async () => {
    const run = createTestRun({ status: 'failed' });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await resumeRun({ run, store, mode: 'replay_step' });

    expect(result.success).toBe(true);
    expect(result.context?.mode).toBe('replay_step');
  });

  it('should increment resume count', async () => {
    const run = createTestRun({ status: 'failed', resumeCount: 1 });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await resumeRun({ run, store });

    expect(result.success).toBe(true);
    expect(result.context?.resumeCount).toBe(2);
  });
});

// =============================================================================
// canReplayStep Tests
// =============================================================================

describe('canReplayStep', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should allow replay of idempotent step', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: true, // Idempotent
    });

    const result = await canReplayStep({
      runId: 'run-123',
      stepId: 'step-1',
      store,
    });

    expect(result.canReplay).toBe(true);
    expect(result.checkpoint?.stepId).toBe('step-1');
  });

  it('should block replay if no checkpoint', async () => {
    const result = await canReplayStep({
      runId: 'run-123',
      stepId: 'step-1',
      store,
    });

    expect(result.canReplay).toBe(false);
    expect(result.reason).toContain('No checkpoint');
  });

  it('should block replay if not idempotent', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false, // Not idempotent
    });

    const result = await canReplayStep({
      runId: 'run-123',
      stepId: 'step-1',
      store,
    });

    expect(result.canReplay).toBe(false);
    expect(result.reason).toContain('not marked as idempotent');
  });

  it('should block replay if step failed', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'failed',
      timestamp: new Date(),
      resumable: true,
      idempotent: true,
    });

    const result = await canReplayStep({
      runId: 'run-123',
      stepId: 'step-1',
      store,
    });

    expect(result.canReplay).toBe(false);
    expect(result.reason).toContain('did not complete successfully');
  });
});

// =============================================================================
// recoverState Tests
// =============================================================================

describe('recoverState', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should recover state from latest checkpoint', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
      output: { data: 'test-data' },
    });

    const result = await recoverState({
      runId: 'run-123',
      store,
      strategy: 'carry_forward',
    });

    expect(result.success).toBe(true);
    expect(result.state).toEqual({ data: 'test-data' });
  });

  it('should fail if no checkpoint', async () => {
    const result = await recoverState({
      runId: 'run-123',
      store,
      strategy: 'carry_forward',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No checkpoint');
  });

  it('should return error for unimplemented strategies', async () => {
    await store.saveCheckpoint('run-123', {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(),
      resumable: true,
      idempotent: false,
    });

    const result = await recoverState({
      runId: 'run-123',
      store,
      strategy: 'rebuild',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration: Complete Resume Flow', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should handle complete resume workflow', async () => {
    // 1. Simulate a run with multiple steps
    const run = createTestRun({ status: 'failed' });

    // Save checkpoints for completed steps
    await store.saveCheckpoint(run.id, {
      stepId: 'step-1',
      agent: 'triage',
      status: 'completed',
      timestamp: new Date(Date.now() - 3000),
      resumable: true,
      idempotent: false,
      output: { triageResult: 'high-priority' },
    });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-2',
      agent: 'planner',
      status: 'completed',
      timestamp: new Date(Date.now() - 2000),
      resumable: true,
      idempotent: false,
      output: { plan: 'test-plan' },
    });

    await store.saveCheckpoint(run.id, {
      stepId: 'step-3',
      agent: 'coder',
      status: 'failed',
      timestamp: new Date(Date.now() - 1000),
      resumable: true,
      idempotent: false,
      error: 'API timeout',
    });

    // 2. Check if run can be resumed
    const validation = await canResume(run, store);
    expect(validation.canResume).toBe(true);

    // 3. Find resume point
    const resumePoint = await findResumePoint(run.id, store);
    expect(resumePoint.found).toBe(true);
    expect(resumePoint.checkpoint?.stepId).toBe('step-2'); // Last successful

    // 4. Create resume context
    const resumeResult = await resumeRun({ run, store });
    expect(resumeResult.success).toBe(true);

    const ctx = resumeResult.context!;
    expect(ctx.resumeCheckpoint?.stepId).toBe('step-2');

    // 5. Check which steps should be skipped
    expect(shouldSkipStep(ctx, 'step-1')).toBe(true);
    expect(shouldSkipStep(ctx, 'step-2')).toBe(true);
    expect(shouldSkipStep(ctx, 'step-3')).toBe(false); // Failed, retry
    expect(shouldSkipStep(ctx, 'step-4')).toBe(false); // Not started

    // 6. Recover state from checkpoint
    const stateRecovery = await recoverState({
      runId: run.id,
      store,
      strategy: 'carry_forward',
    });
    expect(stateRecovery.success).toBe(true);
    expect(stateRecovery.state).toEqual({ plan: 'test-plan' });
  });
});
