/**
 * Trace Analysis Hook Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { TraceAnalysisHook } from '../trace-analysis-hook.js';
import type { AgentRunContext } from '../types.js';
import type { AgentDecisionTrace, DecisionTraceStore } from '@gwi/core';

function makeCtx(overrides?: Partial<AgentRunContext>): AgentRunContext {
  return {
    runId: 'test-run-1',
    runType: 'autopilot',
    stepId: 'step-1',
    agentRole: 'FOREMAN',
    stepStatus: 'completed',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makeTrace(overrides?: Partial<AgentDecisionTrace>): AgentDecisionTrace {
  return {
    id: `trace-${Math.random().toString(36).slice(2)}`,
    runId: 'test-run-1',
    stepId: 'step-1',
    agentType: 'coder',
    timestamp: new Date(),
    tenantId: 'test-tenant',
    inputs: {
      prompt: 'Test input',
      contextWindow: [],
      previousSteps: [],
    },
    decision: {
      action: 'generate_code',
      reasoning: 'Generated code based on input',
      confidence: 0.8,
      alternatives: [],
    },
    outcome: {
      result: 'success',
      determinedAt: new Date(),
    },
    metadata: {
      durationMs: 5000,
      tokensUsed: { input: 1000, output: 500 },
    },
    ...overrides,
  };
}

function makeMockStore(traces: AgentDecisionTrace[]): DecisionTraceStore {
  return {
    saveTrace: vi.fn(),
    getTrace: vi.fn(),
    listTraces: vi.fn(),
    getTracesForRun: vi.fn().mockResolvedValue(traces),
    updateOutcome: vi.fn(),
    addFeedback: vi.fn(),
    findSimilar: vi.fn().mockResolvedValue([]),
    getOverriddenTraces: vi.fn().mockResolvedValue([]),
    deleteTrace: vi.fn(),
  };
}

describe('TraceAnalysisHook', () => {
  let hook: TraceAnalysisHook;
  let store: DecisionTraceStore;

  describe('onAfterStep', () => {
    it('should be a no-op', async () => {
      store = makeMockStore([]);
      hook = new TraceAnalysisHook({}, store);
      const ctx = makeCtx();
      await expect(hook.onAfterStep(ctx)).resolves.toBeUndefined();
    });
  });

  describe('onRunEnd', () => {
    it('should analyze traces on run end', async () => {
      const traces = [
        makeTrace(),
        makeTrace({ agentType: 'reviewer' }),
      ];
      store = makeMockStore(traces);
      hook = new TraceAnalysisHook({ logResults: false }, store);

      const ctx = makeCtx();
      await hook.onRunEnd(ctx, true);

      expect(store.getTracesForRun).toHaveBeenCalledWith('test-run-1');
      expect(ctx.metadata?.traceAnalysis).toBeDefined();
      const analysis = ctx.metadata!.traceAnalysis as any;
      expect(analysis.totalTraces).toBe(2);
      expect(analysis.failedTraces).toBe(0);
    });

    it('should detect repeated failures', async () => {
      const traces = [
        makeTrace({ agentType: 'coder', outcome: { result: 'failure', determinedAt: new Date() } }),
        makeTrace({ agentType: 'coder', outcome: { result: 'failure', determinedAt: new Date() } }),
        makeTrace({ agentType: 'coder', outcome: { result: 'failure', determinedAt: new Date() } }),
      ];
      store = makeMockStore(traces);
      hook = new TraceAnalysisHook({ logResults: false }, store);

      const ctx = makeCtx();
      await hook.onRunEnd(ctx, false);

      const analysis = ctx.metadata!.traceAnalysis as any;
      expect(analysis.failedTraces).toBe(3);
      expect(analysis.patterns.length).toBeGreaterThan(0);
      expect(analysis.patterns[0].category).toBe('repeated_failure');
      expect(analysis.patterns[0].agentType).toBe('coder');
    });

    it('should detect low confidence failures', async () => {
      const traces = [
        makeTrace({
          agentType: 'coder',
          decision: { action: 'generate_code', reasoning: 'Unsure', confidence: 0.2, alternatives: [] },
          outcome: { result: 'failure', determinedAt: new Date() },
        }),
        makeTrace({
          agentType: 'coder',
          decision: { action: 'generate_code', reasoning: 'Not confident', confidence: 0.3, alternatives: [] },
          outcome: { result: 'failure', determinedAt: new Date() },
        }),
      ];
      store = makeMockStore(traces);
      hook = new TraceAnalysisHook({ logResults: false }, store);

      const ctx = makeCtx();
      await hook.onRunEnd(ctx, false);

      const analysis = ctx.metadata!.traceAnalysis as any;
      const lowConfPattern = analysis.patterns.find((p: any) => p.category === 'low_confidence_failure');
      expect(lowConfPattern).toBeDefined();
      expect(lowConfPattern.count).toBe(2);
    });

    it('should skip analysis when no traces exist', async () => {
      store = makeMockStore([]);
      hook = new TraceAnalysisHook({ logResults: false }, store);

      const ctx = makeCtx();
      await hook.onRunEnd(ctx, true);

      expect(ctx.metadata?.traceAnalysis).toBeUndefined();
    });

    it('should call onAnalysis callback', async () => {
      const onAnalysis = vi.fn();
      const traces = [makeTrace()];
      store = makeMockStore(traces);
      hook = new TraceAnalysisHook({ logResults: false, onAnalysis }, store);

      await hook.onRunEnd(makeCtx(), true);

      expect(onAnalysis).toHaveBeenCalledOnce();
      expect(onAnalysis).toHaveBeenCalledWith(expect.objectContaining({ totalTraces: 1 }));
    });

    it('should handle store errors gracefully', async () => {
      store = makeMockStore([]);
      (store.getTracesForRun as any).mockRejectedValue(new Error('Store unavailable'));
      hook = new TraceAnalysisHook({ logResults: false }, store);

      const ctx = makeCtx();
      await expect(hook.onRunEnd(ctx, true)).resolves.toBeUndefined();
    });
  });

  describe('analyzeTraces', () => {
    it('should calculate agent failure rates', () => {
      store = makeMockStore([]);
      hook = new TraceAnalysisHook({}, store);

      const traces = [
        makeTrace({ agentType: 'coder', outcome: { result: 'success', determinedAt: new Date() } }),
        makeTrace({ agentType: 'coder', outcome: { result: 'failure', determinedAt: new Date() } }),
        makeTrace({ agentType: 'reviewer', outcome: { result: 'success', determinedAt: new Date() } }),
      ];

      const result = hook.analyzeTraces('run-1', traces);
      expect(result.agentFailureRates.coder).toEqual({ total: 2, failed: 1, rate: 0.5 });
      expect(result.agentFailureRates.reviewer).toEqual({ total: 1, failed: 0, rate: 0 });
    });

    it('should aggregate token usage', () => {
      store = makeMockStore([]);
      hook = new TraceAnalysisHook({}, store);

      const traces = [
        makeTrace({ metadata: { durationMs: 1000, tokensUsed: { input: 100, output: 50 } } }),
        makeTrace({ metadata: { durationMs: 2000, tokensUsed: { input: 200, output: 100 } } }),
      ];

      const result = hook.analyzeTraces('run-1', traces);
      expect(result.totalTokens).toEqual({ input: 300, output: 150 });
      expect(result.avgDurationMs).toBe(1500);
    });
  });

  describe('isEnabled', () => {
    it('should be enabled by default', async () => {
      store = makeMockStore([]);
      hook = new TraceAnalysisHook({}, store);
      expect(await hook.isEnabled()).toBe(true);
    });

    it('should be disabled when env var is false', async () => {
      const orig = process.env.GWI_TRACE_ANALYSIS_ENABLED;
      process.env.GWI_TRACE_ANALYSIS_ENABLED = 'false';
      try {
        store = makeMockStore([]);
        hook = new TraceAnalysisHook({}, store);
        expect(await hook.isEnabled()).toBe(false);
      } finally {
        if (orig === undefined) delete process.env.GWI_TRACE_ANALYSIS_ENABLED;
        else process.env.GWI_TRACE_ANALYSIS_ENABLED = orig;
      }
    });
  });
});
