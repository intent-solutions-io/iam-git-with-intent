/**
 * Explainer Tests
 *
 * Phase 35: Context Graph - Tests for "Why did AI do that?" explanations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  type DecisionExplanation,
  type RunExplanation,
  type ExplainerOptions,
  Explainer,
  createExplainer,
  formatExplanationForCLI,
  formatRunExplanationForCLI,
  getExplainer,
  resetExplainer,
} from '../explainer.js';

import {
  type AgentDecisionTrace,
  InMemoryDecisionTraceStore,
  createDecisionTrace,
  generateTraceId,
} from '../decision-trace.js';

import {
  InMemoryContextGraphStore,
  createDecisionNode,
  createCausalEdge,
} from '../graph-store.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestTrace(
  runId: string,
  agentType: 'triage' | 'coder' | 'resolver' | 'reviewer',
  overrides?: Partial<AgentDecisionTrace>
): AgentDecisionTrace {
  return {
    id: generateTraceId(),
    runId,
    stepId: `${agentType}-step`,
    agentType,
    timestamp: new Date(),
    tenantId: 'tenant-1',
    inputs: {
      prompt: `Test prompt for ${agentType}`,
      contextWindow: ['src/utils.ts', 'Issue #42: Add dark mode toggle'],
      previousSteps: ['Previous step completed'],
    },
    decision: {
      action: 'generate_code',
      reasoning: 'Used ThemeContext pattern because existing codebase uses React Context for global state',
      confidence: 0.87,
      alternatives: [
        'CSS-only approach (rejected: user wants manual toggle)',
        'Styled-components theming (rejected: codebase uses CSS modules)',
      ],
    },
    ...overrides,
  };
}

// =============================================================================
// Explainer Tests
// =============================================================================

describe('Explainer', () => {
  let traceStore: InMemoryDecisionTraceStore;
  let graphStore: InMemoryContextGraphStore;
  let explainer: Explainer;

  beforeEach(() => {
    traceStore = new InMemoryDecisionTraceStore();
    graphStore = new InMemoryContextGraphStore();
    explainer = new Explainer({
      traceStore,
      graphStore,
      tenantId: 'tenant-1',
    });
  });

  describe('explainDecision', () => {
    it('should explain a single decision by trace ID', async () => {
      const trace = createTestTrace('run-123', 'coder');
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation).toBeDefined();
      expect(explanation?.traceId).toBe(trace.id);
      expect(explanation?.runId).toBe('run-123');
      expect(explanation?.agentType).toBe('coder');
      expect(explanation?.reasoning.action).toBe('generate_code');
      expect(explanation?.reasoning.confidence).toBe(0.87);
    });

    it('should return null for non-existent trace', async () => {
      const explanation = await explainer.explainDecision('non-existent');
      expect(explanation).toBeNull();
    });

    it('should extract documents from context window', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        inputs: {
          prompt: 'Test',
          contextWindow: [
            'src/utils.ts content here',
            'Issue #42: Add dark mode',
            'PR #43 review comments',
          ],
          previousSteps: [],
        },
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation?.inputs.documents.length).toBe(3);
      expect(explanation?.inputs.documents.some(d => d.type === 'issue')).toBe(true);
      expect(explanation?.inputs.documents.some(d => d.type === 'pr')).toBe(true);
    });

    it('should extract previous steps', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        inputs: {
          prompt: 'Test',
          contextWindow: [],
          previousSteps: ['Triage completed', 'Code generated'],
        },
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation?.inputs.previousSteps.length).toBe(2);
      expect(explanation?.inputs.previousSteps[0].type).toBe('previous-step');
    });

    it('should parse alternatives', async () => {
      const trace = createTestTrace('run-123', 'coder');
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation?.alternatives.length).toBe(2);
      expect(explanation?.alternatives[0].action).toBe('CSS-only approach');
      expect(explanation?.alternatives[0].rejectionReason).toContain('manual toggle');
    });

    it('should include outcome when present', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        outcome: {
          result: 'success',
          actualOutcome: 'PR #43 created successfully at https://github.com/owner/repo/pull/43',
        },
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation?.outcome).toBeDefined();
      expect(explanation?.outcome?.status).toBe('success');
      expect(explanation?.outcome?.description).toContain('PR #43');
    });

    it('should include override information', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        outcome: {
          result: 'override',
          humanOverride: {
            userId: 'user-456',
            reason: 'Used different implementation approach',
            timestamp: new Date(),
          },
        },
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation?.override).toBeDefined();
      expect(explanation?.override?.user).toBe('user-456');
      expect(explanation?.override?.reason).toBe('Used different implementation approach');
    });

    it('should extract key factors from reasoning', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        decision: {
          action: 'generate_code',
          reasoning: 'Used ThemeContext because React Context is already used. Since the codebase has CSS modules, avoided styled-components.',
          confidence: 0.85,
          alternatives: [],
        },
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id);

      expect(explanation?.reasoning.keyFactors.length).toBeGreaterThan(0);
    });

    it('should respect maxContentLength option', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        inputs: {
          prompt: 'A'.repeat(1000),
          contextWindow: [],
          previousSteps: [],
        },
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainDecision(trace.id, {
        maxContentLength: 100,
      });

      expect(explanation?.inputs.prompt.length).toBeLessThanOrEqual(100);
      expect(explanation?.inputs.prompt.endsWith('...')).toBe(true);
    });
  });

  describe('explainStep', () => {
    it('should explain a step by runId and stepId', async () => {
      const trace = createTestTrace('run-123', 'coder', {
        stepId: 'coder-step-1',
      });
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainStep('run-123', 'coder-step-1');

      expect(explanation).toBeDefined();
      expect(explanation?.stepId).toBe('coder-step-1');
    });

    it('should return null for non-existent step', async () => {
      const trace = createTestTrace('run-123', 'coder');
      await traceStore.saveTrace(trace);

      const explanation = await explainer.explainStep('run-123', 'non-existent-step');

      expect(explanation).toBeNull();
    });
  });

  describe('explainRun', () => {
    beforeEach(async () => {
      // Create a multi-step run
      const trace1 = createTestTrace('run-123', 'triage', {
        id: 'trace-1',
        stepId: 'step-1',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        decision: { action: 'triage', reasoning: 'Analyzed issue', confidence: 0.9, alternatives: [] },
        outcome: { result: 'success', actualOutcome: 'Issue triaged' },
      });
      const trace2 = createTestTrace('run-123', 'coder', {
        id: 'trace-2',
        stepId: 'step-2',
        timestamp: new Date('2025-01-01T10:01:00Z'),
        decision: { action: 'generate_code', reasoning: 'Generated solution', confidence: 0.85, alternatives: [] },
        outcome: { result: 'success', actualOutcome: 'PR created' },
      });
      const trace3 = createTestTrace('run-123', 'reviewer', {
        id: 'trace-3',
        stepId: 'step-3',
        timestamp: new Date('2025-01-01T10:02:00Z'),
        decision: { action: 'approve', reasoning: 'Code looks good', confidence: 0.92, alternatives: [] },
        outcome: { result: 'success', actualOutcome: 'Approved' },
      });

      await traceStore.saveTrace(trace1);
      await traceStore.saveTrace(trace2);
      await traceStore.saveTrace(trace3);
    });

    it('should explain a full run', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation).toBeDefined();
      expect(explanation?.runId).toBe('run-123');
      expect(explanation?.decisions.length).toBe(3);
    });

    it('should sort decisions by timestamp', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation?.decisions[0].agentType).toBe('triage');
      expect(explanation?.decisions[1].agentType).toBe('coder');
      expect(explanation?.decisions[2].agentType).toBe('reviewer');
    });

    it('should link decisions together', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation?.decisions[0].links.previousStep).toBeUndefined();
      expect(explanation?.decisions[0].links.nextStep).toBe('trace-2');
      expect(explanation?.decisions[1].links.previousStep).toBe('trace-1');
      expect(explanation?.decisions[1].links.nextStep).toBe('trace-3');
      expect(explanation?.decisions[2].links.previousStep).toBe('trace-2');
      expect(explanation?.decisions[2].links.nextStep).toBeUndefined();
    });

    it('should build timeline', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation?.timeline.length).toBeGreaterThan(0);
      expect(explanation?.timeline[0].actor).toBe('ai');
    });

    it('should calculate stats', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation?.stats.totalDecisions).toBe(3);
      expect(explanation?.stats.averageConfidence).toBeGreaterThan(0);
      expect(explanation?.stats.durationMs).toBeGreaterThan(0);
    });

    it('should determine run status', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation?.outcome.status).toBe('success');
    });

    it('should infer run type', async () => {
      const explanation = await explainer.explainRun('run-123');

      // Has coder and reviewer, so should be code-generation
      expect(explanation?.runType).toBe('code-generation');
    });

    it('should generate summary', async () => {
      const explanation = await explainer.explainRun('run-123');

      expect(explanation?.summary).toContain('3 decision(s)');
    });

    it('should return null for non-existent run', async () => {
      const explanation = await explainer.explainRun('non-existent');
      expect(explanation).toBeNull();
    });

    it('should track human overrides in stats', async () => {
      await traceStore.saveTrace(createTestTrace('run-456', 'coder', {
        id: 'trace-override',
        outcome: {
          result: 'override',
          humanOverride: {
            userId: 'user-1',
            reason: 'Different approach',
            timestamp: new Date(),
          },
        },
      }));

      const explanation = await explainer.explainRun('run-456');

      expect(explanation?.stats.humanOverrides).toBe(1);
    });
  });

  describe('explainTrajectory', () => {
    beforeEach(async () => {
      // Create a trajectory: node1 -> node2 -> node3
      const node1 = createDecisionNode('tenant-1', 'trace-1', {
        action: 'triage',
        agentType: 'triage',
      });
      node1.id = 'n1';
      const node2 = createDecisionNode('tenant-1', 'trace-2', {
        action: 'generate_code',
        agentType: 'coder',
      });
      node2.id = 'n2';
      const node3 = createDecisionNode('tenant-1', 'trace-3', {
        action: 'review',
        agentType: 'reviewer',
      });
      node3.id = 'n3';

      await graphStore.addNode(node1);
      await graphStore.addNode(node2);
      await graphStore.addNode(node3);
      await graphStore.addEdge(createCausalEdge('tenant-1', 'n1', 'n2'));
      await graphStore.addEdge(createCausalEdge('tenant-1', 'n2', 'n3'));
    });

    it('should return trajectory steps', async () => {
      const steps = await explainer.explainTrajectory('n3');

      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('decision');
    });

    it('should return empty for non-existent node', async () => {
      const steps = await explainer.explainTrajectory('non-existent');
      expect(steps.length).toBe(0);
    });
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetExplainer();
  });

  describe('createExplainer', () => {
    it('should create an explainer with default stores', () => {
      const explainer = createExplainer('tenant-1');
      expect(explainer).toBeInstanceOf(Explainer);
    });

    it('should create an explainer with custom stores', () => {
      const traceStore = new InMemoryDecisionTraceStore();
      const graphStore = new InMemoryContextGraphStore();
      const explainer = createExplainer('tenant-1', { traceStore, graphStore });
      expect(explainer).toBeInstanceOf(Explainer);
    });
  });

  describe('Singleton Store', () => {
    it('should return same instance for same tenant', () => {
      const e1 = getExplainer('tenant-1');
      const e2 = getExplainer('tenant-1');
      expect(e1).toBe(e2);
    });

    it('should return new instance for different tenant', () => {
      const e1 = getExplainer('tenant-1');
      const e2 = getExplainer('tenant-2');
      expect(e1).not.toBe(e2);
    });
  });
});

// =============================================================================
// Formatting Helpers Tests
// =============================================================================

describe('Formatting Helpers', () => {
  describe('formatExplanationForCLI', () => {
    it('should format a decision explanation', () => {
      const explanation: DecisionExplanation = {
        traceId: 'trace-123',
        runId: 'run-456',
        stepId: 'step-1',
        agentType: 'coder',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        inputs: {
          prompt: 'Generate a dark mode toggle',
          documents: [
            { type: 'file', description: 'Code context' },
            { type: 'issue', description: 'Issue #42' },
          ],
          previousSteps: [
            { type: 'previous-step', description: 'Step 1 output' },
          ],
        },
        reasoning: {
          action: 'generate_code',
          explanation: 'Used ThemeContext pattern',
          confidence: 0.87,
          keyFactors: ['React Context already used', 'CSS modules in codebase'],
        },
        alternatives: [
          { action: 'CSS-only approach', rejectionReason: 'user wants manual toggle' },
        ],
        outcome: {
          status: 'success',
          description: 'PR #43 created',
          artifacts: ['https://github.com/owner/repo/pull/43'],
        },
        links: {},
      };

      const output = formatExplanationForCLI(explanation);

      expect(output).toContain('Run: run-456');
      expect(output).toContain('Step: step-1');
      expect(output).toContain('Agent: coder');
      expect(output).toContain('INPUTS:');
      expect(output).toContain('REASONING:');
      expect(output).toContain('Action: generate_code');
      expect(output).toContain('Confidence: 87%');
      expect(output).toContain('ALTERNATIVES CONSIDERED:');
      expect(output).toContain('CSS-only approach');
      expect(output).toContain('OUTCOME:');
      expect(output).toContain('Status: success');
    });

    it('should include override section when present', () => {
      const explanation: DecisionExplanation = {
        traceId: 'trace-123',
        runId: 'run-456',
        agentType: 'coder',
        timestamp: new Date(),
        inputs: {
          prompt: 'Test',
          documents: [],
          previousSteps: [],
        },
        reasoning: {
          action: 'generate',
          explanation: 'Test',
          confidence: 0.8,
          keyFactors: [],
        },
        alternatives: [],
        override: {
          user: 'john-doe',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          reason: 'Different approach needed',
          changes: [],
        },
        links: {},
      };

      const output = formatExplanationForCLI(explanation);

      expect(output).toContain('HUMAN OVERRIDE:');
      expect(output).toContain('By: john-doe');
      expect(output).toContain('Reason: Different approach needed');
    });
  });

  describe('formatRunExplanationForCLI', () => {
    it('should format a run explanation', () => {
      const explanation: RunExplanation = {
        runId: 'run-123',
        runType: 'code-generation',
        tenantId: 'tenant-1',
        summary: 'Run involved 3 decisions by triage, coder, reviewer agents.',
        decisions: [],
        outcome: {
          status: 'success',
          description: 'PR #43 merged',
          artifacts: ['https://github.com/owner/repo/pull/43'],
        },
        timeline: [
          { timestamp: new Date('2025-01-01T10:00:00Z'), event: 'triage started', actor: 'ai' },
          { timestamp: new Date('2025-01-01T10:01:00Z'), event: 'code generated', actor: 'ai' },
          { timestamp: new Date('2025-01-01T10:05:00Z'), event: 'approved by user', actor: 'human' },
        ],
        stats: {
          totalDecisions: 3,
          humanOverrides: 0,
          averageConfidence: 0.88,
          durationMs: 300000,
        },
      };

      const output = formatRunExplanationForCLI(explanation);

      expect(output).toContain('=== Run run-123 ===');
      expect(output).toContain('Type: code-generation');
      expect(output).toContain('Status: success');
      expect(output).toContain('STATISTICS:');
      expect(output).toContain('Decisions: 3');
      expect(output).toContain('Avg Confidence: 88%');
      expect(output).toContain('TIMELINE:');
      expect(output).toContain('OUTCOME:');
    });
  });
});
