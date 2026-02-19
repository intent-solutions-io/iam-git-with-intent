/**
 * Tests for Step Store (gwi-o06: Run Steps → Subcollection)
 *
 * Verifies InMemoryStepStore contract:
 * - Write step to store, read it back
 * - Pagination works with cursor
 * - Status updates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStepStore } from '../inmemory.js';
import type { RunStep } from '../interfaces.js';

function makeStep(runId: string, id: string, agent: string): RunStep {
  return {
    id,
    runId,
    agent,
    status: 'pending',
    startedAt: new Date(),
  };
}

describe('InMemoryStepStore', () => {
  let store: InMemoryStepStore;

  beforeEach(() => {
    store = new InMemoryStepStore();
  });

  it('adds and retrieves a step', async () => {
    const step = makeStep('run-1', 'step-1', 'triage');
    await store.addStep('run-1', step);

    const retrieved = await store.getStep('run-1', 'step-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('step-1');
    expect(retrieved!.agent).toBe('triage');
    expect(retrieved!.status).toBe('pending');
  });

  it('returns null for non-existent step', async () => {
    const step = await store.getStep('run-1', 'no-such-step');
    expect(step).toBeNull();
  });

  it('returns null for non-existent run', async () => {
    const step = await store.getStep('no-such-run', 'step-1');
    expect(step).toBeNull();
  });

  it('lists all steps for a run', async () => {
    await store.addStep('run-1', makeStep('run-1', 'step-1', 'triage'));
    await store.addStep('run-1', makeStep('run-1', 'step-2', 'coder'));
    await store.addStep('run-1', makeStep('run-1', 'step-3', 'reviewer'));

    const result = await store.listSteps('run-1');
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('respects pagination limit', async () => {
    await store.addStep('run-1', makeStep('run-1', 'step-1', 'triage'));
    await store.addStep('run-1', makeStep('run-1', 'step-2', 'coder'));
    await store.addStep('run-1', makeStep('run-1', 'step-3', 'reviewer'));

    const page1 = await store.listSteps('run-1', { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).toBeDefined();

    const page2 = await store.listSteps('run-1', { limit: 2, cursor: page1.cursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it('returns empty for non-existent run', async () => {
    const result = await store.listSteps('no-such-run');
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('updates step status', async () => {
    await store.addStep('run-1', makeStep('run-1', 'step-1', 'triage'));

    await store.updateStepStatus('run-1', 'step-1', 'completed', {
      output: { score: 5 },
      completedAt: new Date(),
      durationMs: 1200,
    });

    const step = await store.getStep('run-1', 'step-1');
    expect(step!.status).toBe('completed');
    expect(step!.output).toEqual({ score: 5 });
    expect(step!.durationMs).toBe(1200);
  });

  it('throws on update for non-existent run', async () => {
    await expect(
      store.updateStepStatus('no-run', 'step-1', 'completed'),
    ).rejects.toThrow('Run not found');
  });

  it('throws on update for non-existent step', async () => {
    await store.addStep('run-1', makeStep('run-1', 'step-1', 'triage'));
    await expect(
      store.updateStepStatus('run-1', 'no-step', 'completed'),
    ).rejects.toThrow('Step not found');
  });

  it('isolates steps between runs', async () => {
    await store.addStep('run-1', makeStep('run-1', 'step-1', 'triage'));
    await store.addStep('run-2', makeStep('run-2', 'step-1', 'coder'));

    const r1Steps = await store.listSteps('run-1');
    const r2Steps = await store.listSteps('run-2');

    expect(r1Steps.items).toHaveLength(1);
    expect(r1Steps.items[0].agent).toBe('triage');
    expect(r2Steps.items).toHaveLength(1);
    expect(r2Steps.items[0].agent).toBe('coder');
  });
});
