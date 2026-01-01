/**
 * Simulator
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * World model simulation: Answer "If we do X now, what likely happens?"
 * using precedent matching against historical decision traces.
 *
 * Once enough traces accumulate, the context graph encodes how decisions
 * unfold, enabling simulation of proposed actions.
 *
 * Key capabilities:
 * - Find similar past decisions and their outcomes
 * - What-if analysis for proposed changes
 * - Confidence-weighted predictions based on precedent matching
 *
 * @module @gwi/core/context-graph/simulator
 */

import type { AgentType, DecisionTraceStore } from './decision-trace.js';
import { getDecisionTraceStore } from './decision-trace.js';
import type { ContextGraphStore } from './graph-store.js';
import { getContextGraphStore } from './graph-store.js';

// =============================================================================
// Simulation Query Types
// =============================================================================

/**
 * Context for a simulation query
 */
export interface SimulationContext {
  /** Repository being acted upon */
  repo?: string;
  /** Complexity of the proposed action (1-10) */
  complexity?: number;
  /** Who is proposing the action */
  author?: string;
  /** Time of proposed action */
  time?: Date;
  /** Agent type that would handle this */
  agentType?: AgentType;
  /** Additional context as key-value pairs */
  metadata?: Record<string, unknown>;
}

/**
 * A simulation query: "What happens if we do X?"
 */
export interface SimulationQuery {
  /** Description of the proposed action */
  action: string;
  /** Context for the simulation */
  context: SimulationContext;
  /** Optional embedding for semantic matching */
  embedding?: number[];
}

// =============================================================================
// Simulation Result Types
// =============================================================================

/**
 * A historical precedent that matches the query
 */
export interface Precedent {
  /** Trace ID of the historical decision */
  traceId: string;
  /** How similar this precedent is (0-1) */
  similarity: number;
  /** What action was taken */
  action: string;
  /** What the outcome was */
  outcome: string;
  /** Status of the outcome */
  outcomeStatus: 'success' | 'failure' | 'neutral';
  /** Time since this precedent occurred */
  ageMs: number;
  /** Context that was present */
  context?: SimulationContext;
}

/**
 * Result of a simulation query
 */
export interface SimulationResult {
  /** The query that was simulated */
  query: SimulationQuery;
  /** Most likely outcome */
  likelyOutcome: string;
  /** Confidence in the prediction (0-1) */
  confidence: number;
  /** Status of likely outcome */
  likelyStatus: 'success' | 'failure' | 'neutral' | 'uncertain';
  /** Similar historical decisions */
  precedents: Precedent[];
  /** Recommendation based on precedents */
  recommendation: string;
  /** Risk level (0-1) */
  riskLevel: number;
  /** Factors that influenced the prediction */
  factors: string[];
  /** When this simulation was run */
  simulatedAt: Date;
}

/**
 * What-if analysis result
 */
export interface WhatIfResult {
  /** The proposed action */
  action: string;
  /** Possible outcomes with probabilities */
  outcomes: Array<{
    description: string;
    probability: number;
    status: 'success' | 'failure' | 'neutral';
  }>;
  /** Overall recommendation */
  recommendation: string;
  /** Conditions that would change the outcome */
  conditions: Array<{
    condition: string;
    effect: string;
  }>;
}

// =============================================================================
// Simulator Options
// =============================================================================

/**
 * Options for simulation queries
 */
export interface SimulatorOptions {
  /** Maximum number of precedents to consider */
  maxPrecedents?: number;
  /** Minimum similarity threshold for precedents */
  minSimilarity?: number;
  /** How much to weight recent precedents vs older ones */
  recencyBias?: number;
  /** Minimum number of precedents needed for confident prediction */
  minPrecedentsForConfidence?: number;
}

// =============================================================================
// Simulator Service
// =============================================================================

/**
 * Context Graph Simulator
 *
 * Uses historical decision traces to simulate the likely outcome
 * of proposed actions. The more traces accumulated, the better
 * the predictions become.
 */
export class Simulator {
  private traceStore: DecisionTraceStore;
  private graphStore: ContextGraphStore;
  private tenantId: string;
  private defaultOptions: SimulatorOptions;

  constructor(options: {
    traceStore?: DecisionTraceStore;
    graphStore?: ContextGraphStore;
    tenantId: string;
    defaultOptions?: SimulatorOptions;
  }) {
    this.traceStore = options.traceStore ?? getDecisionTraceStore();
    this.graphStore = options.graphStore ?? getContextGraphStore();
    this.tenantId = options.tenantId;
    this.defaultOptions = {
      maxPrecedents: 10,
      minSimilarity: 0.5,
      recencyBias: 0.3, // 30% weight to recency
      minPrecedentsForConfidence: 3,
      ...options.defaultOptions,
    };
  }

  /**
   * Simulate the likely outcome of a proposed action
   */
  async simulate(
    query: SimulationQuery,
    options?: SimulatorOptions
  ): Promise<SimulationResult> {
    const opts = { ...this.defaultOptions, ...options };

    // Find similar historical decisions
    const precedents = await this.findPrecedents(query, opts);

    // Analyze precedents to determine likely outcome
    const analysis = this.analyzePrecedents(precedents, opts);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      query,
      analysis,
      precedents
    );

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(analysis, precedents);

    // Extract influencing factors
    const factors = this.extractFactors(precedents, query.context);

    return {
      query,
      likelyOutcome: analysis.likelyOutcome,
      confidence: analysis.confidence,
      likelyStatus: analysis.likelyStatus,
      precedents,
      recommendation,
      riskLevel,
      factors,
      simulatedAt: new Date(),
    };
  }

  /**
   * Run a what-if analysis for multiple scenarios
   */
  async whatIf(
    baseContext: SimulationContext,
    proposedActions: string[]
  ): Promise<WhatIfResult[]> {
    const results: WhatIfResult[] = [];

    for (const action of proposedActions) {
      const simulation = await this.simulate({
        action,
        context: baseContext,
      });

      // Group precedent outcomes
      const outcomeGroups = new Map<string, { count: number; status: 'success' | 'failure' | 'neutral' }>();
      for (const precedent of simulation.precedents) {
        const key = `${precedent.outcomeStatus}:${precedent.outcome}`;
        const existing = outcomeGroups.get(key) ?? { count: 0, status: precedent.outcomeStatus };
        existing.count++;
        outcomeGroups.set(key, existing);
      }

      // Calculate probabilities
      const total = simulation.precedents.length || 1;
      const outcomes = Array.from(outcomeGroups.entries()).map(([key, data]) => ({
        description: key.split(':')[1] ?? 'Unknown',
        probability: data.count / total,
        status: data.status,
      }));

      // Sort by probability
      outcomes.sort((a, b) => b.probability - a.probability);

      // Identify conditions that would change outcome
      const conditions = this.identifyConditions(simulation);

      results.push({
        action,
        outcomes,
        recommendation: simulation.recommendation,
        conditions,
      });
    }

    return results;
  }

  /**
   * Compare two potential actions
   */
  async compareActions(
    context: SimulationContext,
    actionA: string,
    actionB: string
  ): Promise<{
    actionA: SimulationResult;
    actionB: SimulationResult;
    recommendation: string;
    preferredAction: 'A' | 'B' | 'either';
  }> {
    const [resultA, resultB] = await Promise.all([
      this.simulate({ action: actionA, context }),
      this.simulate({ action: actionB, context }),
    ]);

    let preferredAction: 'A' | 'B' | 'either';
    let recommendation: string;

    const scoreDiff = this.calculateScore(resultA) - this.calculateScore(resultB);

    if (Math.abs(scoreDiff) < 0.1) {
      preferredAction = 'either';
      recommendation = 'Both actions have similar expected outcomes. Choose based on other factors.';
    } else if (scoreDiff > 0) {
      preferredAction = 'A';
      recommendation = `"${actionA}" is preferred. ${resultA.recommendation}`;
    } else {
      preferredAction = 'B';
      recommendation = `"${actionB}" is preferred. ${resultB.recommendation}`;
    }

    return {
      actionA: resultA,
      actionB: resultB,
      recommendation,
      preferredAction,
    };
  }

  /**
   * Get the historical pattern for an action
   */
  async getPattern(
    action: string,
    options?: SimulatorOptions
  ): Promise<{
    successRate: number;
    commonOutcomes: string[];
    averageLatency: number;
    sampleSize: number;
  }> {
    const opts = { ...this.defaultOptions, ...options };

    const precedents = await this.findPrecedents(
      { action, context: {} },
      { ...opts, maxPrecedents: 100, minSimilarity: 0.7 }
    );

    if (precedents.length === 0) {
      return {
        successRate: 0,
        commonOutcomes: [],
        averageLatency: 0,
        sampleSize: 0,
      };
    }

    const successCount = precedents.filter(p => p.outcomeStatus === 'success').length;
    const successRate = successCount / precedents.length;

    // Count outcome frequencies
    const outcomeCounts = new Map<string, number>();
    for (const p of precedents) {
      outcomeCounts.set(p.outcome, (outcomeCounts.get(p.outcome) ?? 0) + 1);
    }

    const commonOutcomes = Array.from(outcomeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([outcome]) => outcome);

    // Average latency (not available in current data model)
    const averageLatency = 0;

    return {
      successRate,
      commonOutcomes,
      averageLatency,
      sampleSize: precedents.length,
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Find similar historical decisions
   */
  private async findPrecedents(
    query: SimulationQuery,
    options: SimulatorOptions
  ): Promise<Precedent[]> {
    const now = Date.now();
    const precedents: Precedent[] = [];

    // Try embedding-based search first
    if (query.embedding) {
      const embeddingResults = await this.graphStore.findPrecedents(
        query.embedding,
        options.maxPrecedents ?? 10,
        { type: 'decision', tenantId: this.tenantId }
      );

      for (const result of embeddingResults) {
        if (result.similarity >= (options.minSimilarity ?? 0.5)) {
          const data = result.node.data as Record<string, unknown>;
          precedents.push({
            traceId: (data.traceId as string) ?? result.node.id,
            similarity: result.similarity,
            action: (data.action as string) ?? 'unknown',
            outcome: (data.outcome as string) ?? 'unknown',
            outcomeStatus: this.parseOutcomeStatus(data.outcomeResult as string),
            ageMs: now - result.node.timestamp.getTime(),
            context: data.context as SimulationContext,
          });
        }
      }
    }

    // Fall back to text-based matching
    if (precedents.length < (options.minPrecedentsForConfidence ?? 3)) {
      const traces = await this.traceStore.listTraces({
        tenantId: this.tenantId,
        agentType: query.context.agentType,
        limit: 100,
      });

      for (const trace of traces) {
        // Calculate text similarity
        const similarity = this.textSimilarity(query.action, trace.decision.action);

        if (similarity >= (options.minSimilarity ?? 0.5)) {
          // Check if we already have this from embedding search
          if (!precedents.some(p => p.traceId === trace.id)) {
            precedents.push({
              traceId: trace.id,
              similarity,
              action: trace.decision.action,
              outcome: trace.outcome?.actualOutcome ?? trace.outcome?.result ?? 'pending',
              outcomeStatus: this.parseOutcomeStatus(trace.outcome?.result),
              ageMs: now - trace.timestamp.getTime(),
              context: {
                agentType: trace.agentType,
                complexity: trace.inputs.complexity,
              },
            });
          }
        }
      }
    }

    // Sort by similarity (weighted by recency)
    const recencyBias = options.recencyBias ?? 0.3;
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days

    precedents.sort((a, b) => {
      const recencyA = 1 - Math.min(a.ageMs / maxAge, 1);
      const recencyB = 1 - Math.min(b.ageMs / maxAge, 1);
      const scoreA = a.similarity * (1 - recencyBias) + recencyA * recencyBias;
      const scoreB = b.similarity * (1 - recencyBias) + recencyB * recencyBias;
      return scoreB - scoreA;
    });

    return precedents.slice(0, options.maxPrecedents ?? 10);
  }

  /**
   * Analyze precedents to determine likely outcome
   */
  private analyzePrecedents(
    precedents: Precedent[],
    options: SimulatorOptions
  ): {
    likelyOutcome: string;
    confidence: number;
    likelyStatus: 'success' | 'failure' | 'neutral' | 'uncertain';
  } {
    if (precedents.length === 0) {
      return {
        likelyOutcome: 'No similar historical decisions found',
        confidence: 0,
        likelyStatus: 'uncertain',
      };
    }

    // Weight outcomes by similarity
    const outcomeWeights = new Map<string, { weight: number; status: 'success' | 'failure' | 'neutral' }>();

    for (const p of precedents) {
      const key = `${p.outcomeStatus}:${p.outcome}`;
      const existing = outcomeWeights.get(key) ?? { weight: 0, status: p.outcomeStatus };
      existing.weight += p.similarity;
      outcomeWeights.set(key, existing);
    }

    // Find highest weighted outcome
    let bestOutcome = '';
    let bestWeight = 0;
    let bestStatus: 'success' | 'failure' | 'neutral' = 'neutral';

    for (const [key, data] of outcomeWeights) {
      if (data.weight > bestWeight) {
        bestWeight = data.weight;
        bestOutcome = key.split(':')[1] ?? 'Unknown';
        bestStatus = data.status;
      }
    }

    // Calculate confidence based on:
    // - Number of precedents
    // - Agreement between precedents
    // - Average similarity
    const avgSimilarity = precedents.reduce((sum, p) => sum + p.similarity, 0) / precedents.length;
    const totalWeight = Array.from(outcomeWeights.values()).reduce((sum, v) => sum + v.weight, 0);
    const agreement = bestWeight / (totalWeight || 1);

    const precedentCountFactor = Math.min(precedents.length / (options.minPrecedentsForConfidence ?? 3), 1);
    const confidence = avgSimilarity * 0.3 + agreement * 0.4 + precedentCountFactor * 0.3;

    return {
      likelyOutcome: bestOutcome,
      confidence: Math.min(confidence, 1),
      likelyStatus: bestStatus,
    };
  }

  /**
   * Generate a recommendation based on analysis
   */
  private generateRecommendation(
    _query: SimulationQuery,
    analysis: { likelyOutcome: string; confidence: number; likelyStatus: 'success' | 'failure' | 'neutral' | 'uncertain' },
    precedents: Precedent[]
  ): string {
    if (precedents.length === 0) {
      return 'No historical precedents found. Proceed with caution and monitor closely.';
    }

    if (analysis.confidence < 0.3) {
      return 'Limited precedent data. Consider gathering more context before proceeding.';
    }

    if (analysis.likelyStatus === 'failure') {
      const successPrecedents = precedents.filter(p => p.outcomeStatus === 'success');
      if (successPrecedents.length > 0) {
        return `Likely to fail based on precedents. However, ${successPrecedents.length} similar actions succeeded under different conditions.`;
      }
      return 'Historical precedents suggest this action is likely to fail. Consider alternatives.';
    }

    if (analysis.likelyStatus === 'success') {
      if (analysis.confidence > 0.7) {
        return 'Strong precedent support for this action. Proceed with normal caution.';
      }
      return 'Precedents suggest success is likely, but confidence is moderate. Monitor closely.';
    }

    return 'Mixed precedent outcomes. Review the precedent details before proceeding.';
  }

  /**
   * Calculate risk level from analysis
   */
  private calculateRiskLevel(
    analysis: { likelyStatus: 'success' | 'failure' | 'neutral' | 'uncertain'; confidence: number },
    precedents: Precedent[]
  ): number {
    if (precedents.length === 0) {
      return 0.5; // Unknown risk
    }

    const failureCount = precedents.filter(p => p.outcomeStatus === 'failure').length;
    const failureRate = failureCount / precedents.length;

    // Adjust by confidence
    if (analysis.confidence < 0.3) {
      return 0.5 + (failureRate - 0.5) * 0.3; // Compress toward 0.5 for low confidence
    }

    return failureRate;
  }

  /**
   * Extract factors that influenced the prediction
   */
  private extractFactors(
    precedents: Precedent[],
    queryContext: SimulationContext
  ): string[] {
    const factors: string[] = [];

    // Sample size
    factors.push(`Based on ${precedents.length} historical precedent(s)`);

    // Similarity range
    if (precedents.length > 0) {
      const minSim = Math.min(...precedents.map(p => p.similarity));
      const maxSim = Math.max(...precedents.map(p => p.similarity));
      factors.push(`Similarity range: ${(minSim * 100).toFixed(0)}%-${(maxSim * 100).toFixed(0)}%`);
    }

    // Complexity match
    if (queryContext.complexity) {
      const matchingComplexity = precedents.filter(
        p => p.context?.complexity && Math.abs((p.context.complexity as number) - queryContext.complexity!) <= 2
      ).length;
      if (matchingComplexity > 0) {
        factors.push(`${matchingComplexity} precedent(s) had similar complexity`);
      }
    }

    // Recency
    const recentCount = precedents.filter(p => p.ageMs < 7 * 24 * 60 * 60 * 1000).length;
    if (recentCount > 0) {
      factors.push(`${recentCount} precedent(s) from the last 7 days`);
    }

    return factors;
  }

  /**
   * Identify conditions that would change the outcome
   */
  private identifyConditions(simulation: SimulationResult): WhatIfResult['conditions'] {
    const conditions: WhatIfResult['conditions'] = [];

    // Find precedents with different outcomes
    const successPrecedents = simulation.precedents.filter(p => p.outcomeStatus === 'success');
    const failurePrecedents = simulation.precedents.filter(p => p.outcomeStatus === 'failure');

    if (successPrecedents.length > 0 && failurePrecedents.length > 0) {
      // Compare contexts to find differentiating factors
      const successAvgComplexity = this.avgComplexity(successPrecedents);
      const failureAvgComplexity = this.avgComplexity(failurePrecedents);

      if (Math.abs(successAvgComplexity - failureAvgComplexity) > 2) {
        conditions.push({
          condition: `Complexity ${successAvgComplexity < failureAvgComplexity ? 'below' : 'above'} ${Math.min(successAvgComplexity, failureAvgComplexity).toFixed(0)}`,
          effect: `Higher ${successAvgComplexity < failureAvgComplexity ? 'success' : 'failure'} rate observed`,
        });
      }
    }

    // Check for review-dependent outcomes
    const reviewedSuccesses = simulation.precedents.filter(
      p => p.outcomeStatus === 'success' && p.action.includes('review')
    );
    if (reviewedSuccesses.length > simulation.precedents.length * 0.3) {
      conditions.push({
        condition: 'Include code review',
        effect: 'Increases success rate based on precedents',
      });
    }

    return conditions;
  }

  /**
   * Calculate overall score for comparison
   */
  private calculateScore(result: SimulationResult): number {
    const statusScore = {
      success: 1,
      neutral: 0.5,
      uncertain: 0.3,
      failure: 0,
    }[result.likelyStatus];

    return (
      statusScore * 0.5 +
      result.confidence * 0.3 +
      (1 - result.riskLevel) * 0.2
    );
  }

  /**
   * Calculate average complexity from precedents
   */
  private avgComplexity(precedents: Precedent[]): number {
    const complexities = precedents
      .filter(p => p.context?.complexity)
      .map(p => p.context!.complexity as number);

    if (complexities.length === 0) return 5; // Default mid-range
    return complexities.reduce((a, b) => a + b, 0) / complexities.length;
  }

  /**
   * Parse outcome status string
   */
  private parseOutcomeStatus(result?: string): 'success' | 'failure' | 'neutral' {
    if (!result) return 'neutral';
    if (result === 'success') return 'success';
    if (result === 'failure') return 'failure';
    return 'neutral';
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private textSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a simulator for a tenant
 */
export function createSimulator(
  tenantId: string,
  options?: {
    traceStore?: DecisionTraceStore;
    graphStore?: ContextGraphStore;
    defaultOptions?: SimulatorOptions;
  }
): Simulator {
  return new Simulator({
    tenantId,
    ...options,
  });
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * Format a simulation result for CLI output
 */
export function formatSimulationForCLI(result: SimulationResult): string {
  const lines: string[] = [];

  lines.push('=== Simulation Result ===');
  lines.push(`Action: ${result.query.action}`);
  lines.push('');

  lines.push('PREDICTION:');
  lines.push(`  Likely outcome: ${result.likelyOutcome}`);
  lines.push(`  Status: ${result.likelyStatus}`);
  lines.push(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  lines.push(`  Risk level: ${(result.riskLevel * 100).toFixed(0)}%`);
  lines.push('');

  lines.push('RECOMMENDATION:');
  lines.push(`  ${result.recommendation}`);
  lines.push('');

  if (result.precedents.length > 0) {
    lines.push(`PRECEDENTS (${result.precedents.length}):`);
    for (const p of result.precedents.slice(0, 5)) {
      const sim = (p.similarity * 100).toFixed(0);
      const status = p.outcomeStatus === 'success' ? '✓' : p.outcomeStatus === 'failure' ? '✗' : '○';
      lines.push(`  ${status} [${sim}%] ${p.action} → ${p.outcome}`);
    }
    if (result.precedents.length > 5) {
      lines.push(`  ... and ${result.precedents.length - 5} more`);
    }
    lines.push('');
  }

  if (result.factors.length > 0) {
    lines.push('FACTORS:');
    for (const factor of result.factors) {
      lines.push(`  - ${factor}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format what-if results for CLI output
 */
export function formatWhatIfForCLI(results: WhatIfResult[]): string {
  const lines: string[] = [];

  lines.push('=== What-If Analysis ===');
  lines.push('');

  for (const result of results) {
    lines.push(`ACTION: ${result.action}`);
    lines.push('  Possible outcomes:');
    for (const outcome of result.outcomes.slice(0, 3)) {
      const prob = (outcome.probability * 100).toFixed(0);
      const status = outcome.status === 'success' ? '✓' : outcome.status === 'failure' ? '✗' : '○';
      lines.push(`    ${status} ${prob}%: ${outcome.description}`);
    }
    lines.push(`  Recommendation: ${result.recommendation}`);

    if (result.conditions.length > 0) {
      lines.push('  Conditions:');
      for (const cond of result.conditions) {
        lines.push(`    • If ${cond.condition} → ${cond.effect}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Singleton Store Instance
// =============================================================================

let simulatorInstance: Simulator | null = null;

/**
 * Get or create a global simulator instance
 */
export function getSimulator(tenantId: string): Simulator {
  if (!simulatorInstance || (simulatorInstance as unknown as { tenantId: string }).tenantId !== tenantId) {
    simulatorInstance = createSimulator(tenantId);
  }
  return simulatorInstance;
}

/**
 * Reset the simulator instance (for testing)
 */
export function resetSimulator(): void {
  simulatorInstance = null;
}
