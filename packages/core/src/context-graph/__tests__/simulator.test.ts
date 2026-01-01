/**
 * Simulator Tests
 *
 * Phase 35: Context Graph - Tests for world model simulation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  type SimulationContext,
  type SimulationQuery,
  type SimulationResult,
  type WhatIfResult,
  type Precedent,
  Simulator,
  createSimulator,
  formatSimulationForCLI,
  formatWhatIfForCLI,
  getSimulator,
  resetSimulator,
} from '../simulator.js';

import {
  type AgentDecisionTrace,
  InMemoryDecisionTraceStore,
  generateTraceId,
} from '../decision-trace.js';

import {
  InMemoryContextGraphStore,
  createDecisionNode,
} from '../graph-store.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestTrace(
  action: string,
  outcome: 'success' | 'failure' | 'override',
  overrides?: Partial<AgentDecisionTrace>
): AgentDecisionTrace {
  return {
    id: generateTraceId(),
    runId: 'run-123',
    stepId: 'step-1',
    agentType: 'coder',
    timestamp: new Date(),
    tenantId: 'tenant-1',
    inputs: {
      prompt: `Test prompt for ${action}`,
      contextWindow: [],
      previousSteps: [],
      complexity: 5,
    },
    decision: {
      action,
      reasoning: `Test reasoning for ${action}`,
      confidence: 0.85,
      alternatives: [],
    },
    outcome: {
      result: outcome,
      actualOutcome: `${action} ${outcome}`,
    },
    ...overrides,
  };
}

// =============================================================================
// Simulator Tests
// =============================================================================

describe('Simulator', () => {
  let traceStore: InMemoryDecisionTraceStore;
  let graphStore: InMemoryContextGraphStore;
  let simulator: Simulator;

  beforeEach(() => {
    traceStore = new InMemoryDecisionTraceStore();
    graphStore = new InMemoryContextGraphStore();
    simulator = new Simulator({
      traceStore,
      graphStore,
      tenantId: 'tenant-1',
    });
  });

  describe('simulate', () => {
    it('should return result with no precedents when store is empty', async () => {
      const query: SimulationQuery = {
        action: 'merge PR without review',
        context: { complexity: 5 },
      };

      const result = await simulator.simulate(query);

      expect(result).toBeDefined();
      expect(result.query).toBe(query);
      expect(result.likelyStatus).toBe('uncertain');
      expect(result.precedents.length).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should find similar precedents by action', async () => {
      // Add some historical traces
      await traceStore.saveTrace(createTestTrace('merge PR', 'success'));
      await traceStore.saveTrace(createTestTrace('merge PR without tests', 'failure'));
      await traceStore.saveTrace(createTestTrace('create PR', 'success'));

      const query: SimulationQuery = {
        action: 'merge PR',
        context: {},
      };

      const result = await simulator.simulate(query);

      expect(result.precedents.length).toBeGreaterThan(0);
      // Should find the exact match first
      expect(result.precedents[0].action).toBe('merge PR');
    });

    it('should calculate confidence based on precedents', async () => {
      // Add several similar traces
      for (let i = 0; i < 5; i++) {
        await traceStore.saveTrace(createTestTrace('deploy to staging', 'success'));
      }

      const result = await simulator.simulate({
        action: 'deploy to staging',
        context: {},
      });

      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should predict likely outcome based on precedents', async () => {
      // Add multiple successful traces
      await traceStore.saveTrace(createTestTrace('run tests', 'success'));
      await traceStore.saveTrace(createTestTrace('run tests', 'success'));
      await traceStore.saveTrace(createTestTrace('run tests', 'success'));
      await traceStore.saveTrace(createTestTrace('run tests', 'failure'));

      const result = await simulator.simulate({
        action: 'run tests',
        context: {},
      });

      expect(result.likelyStatus).toBe('success');
    });

    it('should predict failure when most precedents failed', async () => {
      await traceStore.saveTrace(createTestTrace('force push to main', 'failure'));
      await traceStore.saveTrace(createTestTrace('force push to main', 'failure'));
      await traceStore.saveTrace(createTestTrace('force push to main', 'failure'));
      await traceStore.saveTrace(createTestTrace('force push to main', 'success'));

      const result = await simulator.simulate({
        action: 'force push to main',
        context: {},
      });

      expect(result.likelyStatus).toBe('failure');
      expect(result.riskLevel).toBeGreaterThan(0.5);
    });

    it('should generate recommendation', async () => {
      await traceStore.saveTrace(createTestTrace('deploy without tests', 'failure'));
      await traceStore.saveTrace(createTestTrace('deploy without tests', 'failure'));

      const result = await simulator.simulate({
        action: 'deploy without tests',
        context: {},
      });

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should extract factors', async () => {
      await traceStore.saveTrace(createTestTrace('build project', 'success'));

      const result = await simulator.simulate({
        action: 'build project',
        context: { complexity: 3 },
      });

      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.factors.some(f => f.includes('precedent'))).toBe(true);
    });

    it('should respect maxPrecedents option', async () => {
      // Add many traces
      for (let i = 0; i < 20; i++) {
        await traceStore.saveTrace(createTestTrace('lint code', 'success'));
      }

      const result = await simulator.simulate(
        { action: 'lint code', context: {} },
        { maxPrecedents: 5 }
      );

      expect(result.precedents.length).toBeLessThanOrEqual(5);
    });

    it('should respect minSimilarity threshold', async () => {
      await traceStore.saveTrace(createTestTrace('completely different action', 'success'));

      const result = await simulator.simulate(
        { action: 'merge PR', context: {} },
        { minSimilarity: 0.9 }
      );

      // Should not match the unrelated action
      expect(result.precedents.length).toBe(0);
    });

    it('should include timestamp', async () => {
      const result = await simulator.simulate({
        action: 'test action',
        context: {},
      });

      expect(result.simulatedAt).toBeInstanceOf(Date);
    });
  });

  describe('whatIf', () => {
    beforeEach(async () => {
      // Add various historical traces
      await traceStore.saveTrace(createTestTrace('merge PR with review', 'success'));
      await traceStore.saveTrace(createTestTrace('merge PR with review', 'success'));
      await traceStore.saveTrace(createTestTrace('merge PR without review', 'failure'));
      await traceStore.saveTrace(createTestTrace('merge PR without review', 'failure'));
    });

    it('should analyze multiple actions', async () => {
      const results = await simulator.whatIf(
        { complexity: 5 },
        ['merge PR with review', 'merge PR without review']
      );

      expect(results.length).toBe(2);
    });

    it('should calculate probabilities for outcomes', async () => {
      const results = await simulator.whatIf(
        {},
        ['merge PR with review']
      );

      expect(results[0].outcomes.length).toBeGreaterThan(0);
      // Probabilities should sum to approximately 1
      const totalProb = results[0].outcomes.reduce((sum, o) => sum + o.probability, 0);
      expect(totalProb).toBeCloseTo(1, 1);
    });

    it('should sort outcomes by probability', async () => {
      const results = await simulator.whatIf(
        {},
        ['merge PR with review']
      );

      for (let i = 1; i < results[0].outcomes.length; i++) {
        expect(results[0].outcomes[i - 1].probability).toBeGreaterThanOrEqual(
          results[0].outcomes[i].probability
        );
      }
    });

    it('should include recommendation for each action', async () => {
      const results = await simulator.whatIf(
        {},
        ['merge PR with review', 'merge PR without review']
      );

      expect(results[0].recommendation).toBeDefined();
      expect(results[1].recommendation).toBeDefined();
    });
  });

  describe('compareActions', () => {
    beforeEach(async () => {
      await traceStore.saveTrace(createTestTrace('quick merge', 'success'));
      await traceStore.saveTrace(createTestTrace('quick merge', 'success'));
      await traceStore.saveTrace(createTestTrace('thorough review', 'success'));
      await traceStore.saveTrace(createTestTrace('thorough review', 'success'));
      await traceStore.saveTrace(createTestTrace('thorough review', 'success'));
    });

    it('should compare two actions', async () => {
      const result = await simulator.compareActions(
        {},
        'quick merge',
        'thorough review'
      );

      expect(result.actionA).toBeDefined();
      expect(result.actionB).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(['A', 'B', 'either']).toContain(result.preferredAction);
    });

    it('should determine preferred action', async () => {
      // Add more successes for thorough review
      await traceStore.saveTrace(createTestTrace('thorough review', 'success'));
      await traceStore.saveTrace(createTestTrace('quick merge', 'failure'));

      const result = await simulator.compareActions(
        {},
        'quick merge',
        'thorough review'
      );

      // Should prefer thorough review due to better success rate
      expect(result.preferredAction).toBe('B');
      expect(result.recommendation).toContain('thorough review');
    });

    it('should indicate when actions are similar', async () => {
      // Both have same success rate
      const result = await simulator.compareActions(
        {},
        'quick merge',
        'quick merge' // Same action
      );

      expect(result.preferredAction).toBe('either');
    });
  });

  describe('getPattern', () => {
    beforeEach(async () => {
      await traceStore.saveTrace(createTestTrace('deploy', 'success'));
      await traceStore.saveTrace(createTestTrace('deploy', 'success'));
      await traceStore.saveTrace(createTestTrace('deploy', 'success'));
      await traceStore.saveTrace(createTestTrace('deploy', 'failure'));
    });

    it('should calculate success rate', async () => {
      const pattern = await simulator.getPattern('deploy');

      expect(pattern.successRate).toBeCloseTo(0.75, 1);
    });

    it('should count sample size', async () => {
      const pattern = await simulator.getPattern('deploy');

      expect(pattern.sampleSize).toBe(4);
    });

    it('should find common outcomes', async () => {
      await traceStore.saveTrace(createTestTrace('deploy', 'success', {
        outcome: { result: 'success', actualOutcome: 'Deployed to staging' },
      }));
      await traceStore.saveTrace(createTestTrace('deploy', 'success', {
        outcome: { result: 'success', actualOutcome: 'Deployed to staging' },
      }));

      const pattern = await simulator.getPattern('deploy');

      expect(pattern.commonOutcomes.length).toBeGreaterThan(0);
    });

    it('should return zeros for unknown action', async () => {
      const pattern = await simulator.getPattern('unknown action xyz');

      expect(pattern.successRate).toBe(0);
      expect(pattern.sampleSize).toBe(0);
      expect(pattern.commonOutcomes.length).toBe(0);
    });
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetSimulator();
  });

  describe('createSimulator', () => {
    it('should create a simulator with default stores', () => {
      const simulator = createSimulator('tenant-1');
      expect(simulator).toBeInstanceOf(Simulator);
    });

    it('should create a simulator with custom stores', () => {
      const traceStore = new InMemoryDecisionTraceStore();
      const graphStore = new InMemoryContextGraphStore();
      const simulator = createSimulator('tenant-1', { traceStore, graphStore });
      expect(simulator).toBeInstanceOf(Simulator);
    });

    it('should accept default options', () => {
      const simulator = createSimulator('tenant-1', {
        defaultOptions: {
          maxPrecedents: 20,
          minSimilarity: 0.7,
        },
      });
      expect(simulator).toBeInstanceOf(Simulator);
    });
  });

  describe('Singleton Store', () => {
    it('should return same instance for same tenant', () => {
      const s1 = getSimulator('tenant-1');
      const s2 = getSimulator('tenant-1');
      expect(s1).toBe(s2);
    });

    it('should return new instance for different tenant', () => {
      const s1 = getSimulator('tenant-1');
      const s2 = getSimulator('tenant-2');
      expect(s1).not.toBe(s2);
    });
  });
});

// =============================================================================
// Formatting Helpers Tests
// =============================================================================

describe('Formatting Helpers', () => {
  describe('formatSimulationForCLI', () => {
    it('should format simulation result', () => {
      const result: SimulationResult = {
        query: {
          action: 'merge PR without review',
          context: { complexity: 7 },
        },
        likelyOutcome: 'Build failure within 2 hours',
        confidence: 0.78,
        likelyStatus: 'failure',
        precedents: [
          {
            traceId: 'trace-1',
            similarity: 0.91,
            action: 'merge PR without review',
            outcome: 'Production incident',
            outcomeStatus: 'failure',
            ageMs: 86400000,
          },
          {
            traceId: 'trace-2',
            similarity: 0.85,
            action: 'merge without tests',
            outcome: 'Hotfix required',
            outcomeStatus: 'failure',
            ageMs: 172800000,
          },
        ],
        recommendation: 'Require review for complexity > 5',
        riskLevel: 0.7,
        factors: [
          'Based on 2 historical precedent(s)',
          'Similarity range: 85%-91%',
        ],
        simulatedAt: new Date('2025-01-01T10:00:00Z'),
      };

      const output = formatSimulationForCLI(result);

      expect(output).toContain('=== Simulation Result ===');
      expect(output).toContain('Action: merge PR without review');
      expect(output).toContain('PREDICTION:');
      expect(output).toContain('Likely outcome: Build failure within 2 hours');
      expect(output).toContain('Status: failure');
      expect(output).toContain('Confidence: 78%');
      expect(output).toContain('Risk level: 70%');
      expect(output).toContain('RECOMMENDATION:');
      expect(output).toContain('PRECEDENTS (2):');
      expect(output).toContain('[91%]');
      expect(output).toContain('FACTORS:');
    });

    it('should handle empty precedents', () => {
      const result: SimulationResult = {
        query: { action: 'unknown action', context: {} },
        likelyOutcome: 'No similar historical decisions found',
        confidence: 0,
        likelyStatus: 'uncertain',
        precedents: [],
        recommendation: 'Proceed with caution',
        riskLevel: 0.5,
        factors: [],
        simulatedAt: new Date(),
      };

      const output = formatSimulationForCLI(result);

      expect(output).not.toContain('PRECEDENTS');
      expect(output).not.toContain('FACTORS:');
    });

    it('should truncate precedents list', () => {
      const precedents: Precedent[] = Array.from({ length: 10 }, (_, i) => ({
        traceId: `trace-${i}`,
        similarity: 0.8,
        action: 'test action',
        outcome: 'success',
        outcomeStatus: 'success' as const,
        ageMs: 86400000,
      }));

      const result: SimulationResult = {
        query: { action: 'test', context: {} },
        likelyOutcome: 'Success',
        confidence: 0.8,
        likelyStatus: 'success',
        precedents,
        recommendation: 'OK',
        riskLevel: 0.2,
        factors: [],
        simulatedAt: new Date(),
      };

      const output = formatSimulationForCLI(result);

      expect(output).toContain('... and 5 more');
    });
  });

  describe('formatWhatIfForCLI', () => {
    it('should format what-if results', () => {
      const results: WhatIfResult[] = [
        {
          action: 'merge with review',
          outcomes: [
            { description: 'PR merged successfully', probability: 0.8, status: 'success' },
            { description: 'Minor issues found', probability: 0.2, status: 'neutral' },
          ],
          recommendation: 'Proceed with review',
          conditions: [
            { condition: 'Complexity below 5', effect: 'Higher success rate observed' },
          ],
        },
        {
          action: 'merge without review',
          outcomes: [
            { description: 'Build failure', probability: 0.6, status: 'failure' },
            { description: 'Success', probability: 0.4, status: 'success' },
          ],
          recommendation: 'Not recommended',
          conditions: [],
        },
      ];

      const output = formatWhatIfForCLI(results);

      expect(output).toContain('=== What-If Analysis ===');
      expect(output).toContain('ACTION: merge with review');
      expect(output).toContain('80%: PR merged successfully');
      expect(output).toContain('Recommendation: Proceed with review');
      expect(output).toContain('Conditions:');
      expect(output).toContain('ACTION: merge without review');
      expect(output).toContain('60%: Build failure');
    });

    it('should handle results without conditions', () => {
      const results: WhatIfResult[] = [
        {
          action: 'simple action',
          outcomes: [{ description: 'Success', probability: 1.0, status: 'success' }],
          recommendation: 'OK',
          conditions: [],
        },
      ];

      const output = formatWhatIfForCLI(results);

      expect(output).not.toContain('Conditions:');
    });
  });
});
