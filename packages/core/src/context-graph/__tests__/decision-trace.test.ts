/**
 * Decision Trace Tests
 *
 * Phase 35: Context Graph - Tests for agent decision capture.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  type AgentType,
  type AgentDecisionTrace,
  type DecisionTraceFilter,
  InMemoryDecisionTraceStore,
  DecisionTraceBuilder,
  createDecisionTrace,
  generateTraceId,
  getDecisionTraceStore,
  setDecisionTraceStore,
  resetDecisionTraceStore,
} from '../decision-trace.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestTrace(overrides?: Partial<AgentDecisionTrace>): AgentDecisionTrace {
  return {
    id: generateTraceId(),
    runId: 'run-123',
    stepId: 'step-1',
    agentType: 'coder',
    timestamp: new Date(),
    tenantId: 'tenant-1',
    inputs: {
      prompt: 'Generate a function to sort an array',
      contextWindow: ['src/utils.ts', 'tests/utils.test.ts'],
      previousSteps: ['Triage completed with complexity 3'],
    },
    decision: {
      action: 'generate_code',
      reasoning: 'Used quicksort because existing codebase uses similar pattern',
      confidence: 0.87,
      alternatives: ['merge sort - rejected: slower for small arrays'],
    },
    ...overrides,
  };
}

// =============================================================================
// InMemoryDecisionTraceStore Tests
// =============================================================================

describe('InMemoryDecisionTraceStore', () => {
  let store: InMemoryDecisionTraceStore;

  beforeEach(() => {
    store = new InMemoryDecisionTraceStore();
  });

  describe('saveTrace', () => {
    it('should save a trace', async () => {
      const trace = createTestTrace();
      await store.saveTrace(trace);

      const retrieved = await store.getTrace(trace.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(trace.id);
      expect(retrieved?.runId).toBe(trace.runId);
    });

    it('should save multiple traces', async () => {
      const trace1 = createTestTrace({ id: 'trace-1' });
      const trace2 = createTestTrace({ id: 'trace-2' });

      await store.saveTrace(trace1);
      await store.saveTrace(trace2);

      expect(await store.getTrace('trace-1')).toBeDefined();
      expect(await store.getTrace('trace-2')).toBeDefined();
    });
  });

  describe('getTrace', () => {
    it('should return null for non-existent trace', async () => {
      const result = await store.getTrace('non-existent');
      expect(result).toBeNull();
    });

    it('should return the correct trace', async () => {
      const trace = createTestTrace({ agentType: 'resolver' });
      await store.saveTrace(trace);

      const retrieved = await store.getTrace(trace.id);
      expect(retrieved?.agentType).toBe('resolver');
    });
  });

  describe('listTraces', () => {
    beforeEach(async () => {
      // Create traces for different runs and tenants
      await store.saveTrace(createTestTrace({ id: 't1', runId: 'run-1', tenantId: 'tenant-a', agentType: 'triage' }));
      await store.saveTrace(createTestTrace({ id: 't2', runId: 'run-1', tenantId: 'tenant-a', agentType: 'coder' }));
      await store.saveTrace(createTestTrace({ id: 't3', runId: 'run-2', tenantId: 'tenant-a', agentType: 'reviewer' }));
      await store.saveTrace(createTestTrace({ id: 't4', runId: 'run-3', tenantId: 'tenant-b', agentType: 'coder' }));
    });

    it('should list all traces without filter', async () => {
      const traces = await store.listTraces({});
      expect(traces.length).toBe(4);
    });

    it('should filter by runId', async () => {
      const traces = await store.listTraces({ runId: 'run-1' });
      expect(traces.length).toBe(2);
      expect(traces.every(t => t.runId === 'run-1')).toBe(true);
    });

    it('should filter by tenantId', async () => {
      const traces = await store.listTraces({ tenantId: 'tenant-a' });
      expect(traces.length).toBe(3);
      expect(traces.every(t => t.tenantId === 'tenant-a')).toBe(true);
    });

    it('should filter by agentType', async () => {
      const traces = await store.listTraces({ agentType: 'coder' });
      expect(traces.length).toBe(2);
      expect(traces.every(t => t.agentType === 'coder')).toBe(true);
    });

    it('should combine filters', async () => {
      const traces = await store.listTraces({
        tenantId: 'tenant-a',
        agentType: 'coder',
      });
      expect(traces.length).toBe(1);
      expect(traces[0].id).toBe('t2');
    });

    it('should respect limit', async () => {
      const traces = await store.listTraces({ limit: 2 });
      expect(traces.length).toBe(2);
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const traces = await store.listTraces({
        fromTimestamp: yesterday,
        toTimestamp: tomorrow,
      });
      expect(traces.length).toBe(4);
    });
  });

  describe('updateOutcome', () => {
    it('should update trace outcome', async () => {
      const trace = createTestTrace();
      await store.saveTrace(trace);

      await store.updateOutcome(trace.id, {
        result: 'success',
        actualOutcome: 'PR created successfully',
      });

      const updated = await store.getTrace(trace.id);
      expect(updated?.outcome?.result).toBe('success');
      expect(updated?.outcome?.actualOutcome).toBe('PR created successfully');
    });

    it('should add human override to outcome', async () => {
      const trace = createTestTrace();
      await store.saveTrace(trace);

      await store.updateOutcome(trace.id, {
        result: 'override',
        humanOverride: {
          userId: 'user-123',
          reason: 'Used different algorithm',
          timestamp: new Date(),
        },
      });

      const updated = await store.getTrace(trace.id);
      expect(updated?.outcome?.result).toBe('override');
      expect(updated?.outcome?.humanOverride?.userId).toBe('user-123');
    });
  });

  describe('addFeedback', () => {
    it('should add feedback to trace', async () => {
      const trace = createTestTrace();
      await store.saveTrace(trace);

      await store.addFeedback(trace.id, {
        wasCorrect: true,
        humanRating: 5,
        notes: 'Excellent solution',
        providedAt: new Date(),
      });

      const updated = await store.getTrace(trace.id);
      expect(updated?.feedback?.wasCorrect).toBe(true);
      expect(updated?.feedback?.humanRating).toBe(5);
    });
  });

  describe('deleteTrace', () => {
    it('should delete a trace', async () => {
      const trace = createTestTrace();
      await store.saveTrace(trace);

      await store.deleteTrace(trace.id);

      const result = await store.getTrace(trace.id);
      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// DecisionTraceBuilder Tests
// =============================================================================

describe('DecisionTraceBuilder', () => {
  it('should build a complete trace', () => {
    const trace = new DecisionTraceBuilder('run-123', 'coder', 'tenant-1')
      .withStepId('step-1')
      .withInputs({
        prompt: 'Generate code',
        contextWindow: ['file1.ts'],
        previousSteps: ['triage done'],
      })
      .withDecision({
        action: 'generate',
        reasoning: 'Best approach',
        confidence: 0.9,
        alternatives: ['alt1'],
      })
      .build();

    expect(trace.runId).toBe('run-123');
    expect(trace.agentType).toBe('coder');
    expect(trace.tenantId).toBe('tenant-1');
    expect(trace.stepId).toBe('step-1');
    expect(trace.inputs.prompt).toBe('Generate code');
    expect(trace.decision.confidence).toBe(0.9);
    expect(trace.id).toMatch(/^trace_/);
    expect(trace.timestamp).toBeInstanceOf(Date);
  });

  it('should build with outcome', () => {
    const trace = new DecisionTraceBuilder('run-1', 'triage', 'tenant-1')
      .withInputs({ prompt: 'Test', contextWindow: [], previousSteps: [] })
      .withDecision({ action: 'analyze', reasoning: 'R', confidence: 0.8, alternatives: [] })
      .withOutcome({ result: 'success', actualOutcome: 'Done' })
      .build();

    expect(trace.outcome?.result).toBe('success');
  });

  it('should build with embedding', () => {
    const embedding = [0.1, 0.2, 0.3];
    const trace = new DecisionTraceBuilder('run-1', 'coder', 'tenant-1')
      .withInputs({ prompt: 'Test', contextWindow: [], previousSteps: [] })
      .withDecision({ action: 'code', reasoning: 'R', confidence: 0.8, alternatives: [] })
      .withEmbedding(embedding)
      .build();

    expect(trace.embedding).toEqual(embedding);
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetDecisionTraceStore();
  });

  describe('generateTraceId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();

      expect(id1).toMatch(/^trace_/);
      expect(id2).toMatch(/^trace_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createDecisionTrace', () => {
    it('should create a valid trace', () => {
      const trace = createDecisionTrace('run-1', 'resolver', 'tenant-1', {
        prompt: 'Resolve conflict',
        contextWindow: ['file.ts'],
        previousSteps: [],
      }, {
        action: 'resolve',
        reasoning: 'Standard approach',
        confidence: 0.75,
        alternatives: [],
      });

      expect(trace.runId).toBe('run-1');
      expect(trace.agentType).toBe('resolver');
      expect(trace.tenantId).toBe('tenant-1');
      expect(trace.decision.action).toBe('resolve');
    });
  });

  describe('Singleton Store', () => {
    it('should return same instance', () => {
      const store1 = getDecisionTraceStore();
      const store2 = getDecisionTraceStore();

      expect(store1).toBe(store2);
    });

    it('should allow setting custom store', () => {
      const customStore = new InMemoryDecisionTraceStore();
      setDecisionTraceStore(customStore);

      expect(getDecisionTraceStore()).toBe(customStore);
    });

    it('should reset store', () => {
      const store1 = getDecisionTraceStore();
      resetDecisionTraceStore();
      const store2 = getDecisionTraceStore();

      expect(store1).not.toBe(store2);
    });
  });
});
