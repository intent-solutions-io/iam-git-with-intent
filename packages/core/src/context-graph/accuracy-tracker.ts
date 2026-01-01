/**
 * Accuracy Tracker
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * Trust calibration: track when AI is right vs when humans override correctly.
 * Enables learning from past decisions and improving agent confidence over time.
 *
 * Key Metrics:
 * - Agent Accuracy: % of decisions not overridden
 * - Override Rate: % of decisions humans changed
 * - Correct Overrides: % of overrides that were right
 * - False Positives: AI flagged risk that wasn't
 * - False Negatives: AI missed risk that was real
 * - Learning Velocity: Improvement over time
 *
 * @module @gwi/core/context-graph/accuracy-tracker
 */

import type { AgentType, AgentDecisionTrace } from './decision-trace.js';

// =============================================================================
// Time Period Types
// =============================================================================

/**
 * Time period for aggregating metrics
 */
export type TimePeriod =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'all-time';

/**
 * Complexity band for grouping decisions
 */
export type ComplexityBand = 'low' | 'medium' | 'high';

// =============================================================================
// Accuracy Metrics
// =============================================================================

/**
 * Per-complexity-band metrics
 */
export interface ComplexityMetrics {
  /** Number of decisions in this band */
  decisions: number;
  /** Number of overrides in this band */
  overrides: number;
  /** Number of correct overrides (AI was wrong) */
  correctOverrides: number;
  /** Number of incorrect overrides (AI was right) */
  incorrectOverrides: number;
  /** Accuracy rate in this band */
  accuracy: number;
}

/**
 * Classification metrics for risk detection
 */
export interface ClassificationMetrics {
  /** True positives: AI flagged risk, risk was real */
  truePositives: number;
  /** True negatives: AI didn't flag, no risk */
  trueNegatives: number;
  /** False positives: AI flagged risk, but no risk */
  falsePositives: number;
  /** False negatives: AI didn't flag, but risk was real */
  falseNegatives: number;
  /** Precision: TP / (TP + FP) */
  precision: number;
  /** Recall: TP / (TP + FN) */
  recall: number;
  /** F1 score: 2 * (precision * recall) / (precision + recall) */
  f1Score: number;
}

/**
 * Aggregated accuracy metrics for an agent type
 */
export interface AccuracyMetrics {
  /** Agent type these metrics are for */
  agentType: AgentType;
  /** Time period (e.g., "2025-01", "2025-Q1") */
  period: string;
  /** Tenant ID */
  tenantId: string;

  // Core counts
  /** Total decisions made */
  totalDecisions: number;
  /** Decisions that humans overrode */
  humanOverrides: number;
  /** Overrides that were correct (AI was wrong) */
  correctOverrides: number;
  /** Overrides that were incorrect (AI was right) */
  incorrectOverrides: number;
  /** Decisions with no outcome recorded yet */
  pendingOutcomes: number;

  // Derived rates
  /** % of decisions not overridden */
  accuracy: number;
  /** % of decisions humans changed */
  overrideRate: number;
  /** % of overrides that were right */
  overrideCorrectness: number;

  // By complexity band
  byComplexity: {
    low: ComplexityMetrics;
    medium: ComplexityMetrics;
    high: ComplexityMetrics;
  };

  // Classification metrics (for risk detection)
  classification?: ClassificationMetrics;

  // Historical trend (last N periods)
  accuracyTrend: number[];

  // Metadata
  firstDecisionAt?: Date;
  lastDecisionAt?: Date;
  lastUpdatedAt: Date;
}

/**
 * Metrics summary across all agent types
 */
export interface AccuracySummary {
  /** Tenant ID */
  tenantId: string;
  /** Time period */
  period: string;
  /** Metrics by agent type */
  byAgent: Record<AgentType, AccuracyMetrics>;
  /** Overall accuracy across all agents */
  overallAccuracy: number;
  /** Total decisions across all agents */
  totalDecisions: number;
  /** Total overrides across all agents */
  totalOverrides: number;
  /** Last updated timestamp */
  lastUpdatedAt: Date;
}

// =============================================================================
// Decision Outcome Recording
// =============================================================================

/**
 * Outcome of a decision for accuracy tracking
 */
export interface DecisionOutcomeRecord {
  /** Trace ID this outcome is for */
  traceId: string;
  /** Was the AI decision overridden by a human? */
  wasOverridden: boolean;
  /** If overridden, was the override correct? */
  overrideCorrect?: boolean;
  /** Actual outcome of the decision */
  actualOutcome?: 'success' | 'failure' | 'neutral';
  /** For risk detection: was there actually a risk? */
  actualRisk?: boolean;
  /** Human feedback if provided */
  feedback?: {
    rating?: number; // 1-5
    notes?: string;
  };
  /** When this outcome was recorded */
  recordedAt: Date;
  /** Who recorded this outcome */
  recordedBy?: string;
}

// =============================================================================
// Accuracy Tracker Store Interface
// =============================================================================

/**
 * Filter for querying accuracy metrics
 */
export interface AccuracyFilter {
  tenantId?: string;
  agentType?: AgentType;
  period?: string;
  fromPeriod?: string;
  toPeriod?: string;
}

/**
 * Store interface for accuracy metrics
 */
export interface AccuracyTrackerStore {
  /**
   * Record a decision outcome
   */
  recordOutcome(outcome: DecisionOutcomeRecord): Promise<void>;

  /**
   * Get metrics for a specific agent type and period
   */
  getMetrics(
    tenantId: string,
    agentType: AgentType,
    period: string
  ): Promise<AccuracyMetrics | null>;

  /**
   * Get summary across all agents for a period
   */
  getSummary(tenantId: string, period: string): Promise<AccuracySummary | null>;

  /**
   * Get accuracy trend over multiple periods
   */
  getTrend(
    tenantId: string,
    agentType: AgentType,
    periods: number
  ): Promise<number[]>;

  /**
   * Recalculate metrics from decision traces
   */
  recalculateMetrics(
    tenantId: string,
    period: string,
    traces: AgentDecisionTrace[]
  ): Promise<void>;

  /**
   * Save computed metrics
   */
  saveMetrics(metrics: AccuracyMetrics): Promise<void>;

  /**
   * List all metrics matching a filter
   */
  listMetrics(filter: AccuracyFilter): Promise<AccuracyMetrics[]>;
}

// =============================================================================
// In-Memory Store Implementation
// =============================================================================

/**
 * In-memory accuracy tracker store for development and testing
 */
export class InMemoryAccuracyTrackerStore implements AccuracyTrackerStore {
  private metrics = new Map<string, AccuracyMetrics>();
  private outcomes = new Map<string, DecisionOutcomeRecord>();

  private getKey(tenantId: string, agentType: AgentType, period: string): string {
    return `${tenantId}:${agentType}:${period}`;
  }

  async recordOutcome(outcome: DecisionOutcomeRecord): Promise<void> {
    this.outcomes.set(outcome.traceId, outcome);
  }

  async getMetrics(
    tenantId: string,
    agentType: AgentType,
    period: string
  ): Promise<AccuracyMetrics | null> {
    const key = this.getKey(tenantId, agentType, period);
    return this.metrics.get(key) ?? null;
  }

  async getSummary(
    tenantId: string,
    period: string
  ): Promise<AccuracySummary | null> {
    const agentTypes: AgentType[] = ['triage', 'coder', 'resolver', 'reviewer'];
    const byAgent: Partial<Record<AgentType, AccuracyMetrics>> = {};

    let totalDecisions = 0;
    let totalOverrides = 0;
    let totalCorrect = 0;

    for (const agentType of agentTypes) {
      const metrics = await this.getMetrics(tenantId, agentType, period);
      if (metrics) {
        byAgent[agentType] = metrics;
        totalDecisions += metrics.totalDecisions;
        totalOverrides += metrics.humanOverrides;
        totalCorrect += metrics.totalDecisions - metrics.humanOverrides + metrics.incorrectOverrides;
      }
    }

    if (Object.keys(byAgent).length === 0) {
      return null;
    }

    return {
      tenantId,
      period,
      byAgent: byAgent as Record<AgentType, AccuracyMetrics>,
      overallAccuracy: totalDecisions > 0 ? totalCorrect / totalDecisions : 0,
      totalDecisions,
      totalOverrides,
      lastUpdatedAt: new Date(),
    };
  }

  async getTrend(
    tenantId: string,
    agentType: AgentType,
    periods: number
  ): Promise<number[]> {
    // Get all metrics for this agent type
    const allMetrics: AccuracyMetrics[] = [];
    for (const metrics of this.metrics.values()) {
      if (metrics.tenantId === tenantId && metrics.agentType === agentType) {
        allMetrics.push(metrics);
      }
    }

    // Sort by period (descending - newest first)
    allMetrics.sort((a, b) => b.period.localeCompare(a.period));

    // Take first N periods (most recent)
    return allMetrics.slice(0, periods).map(m => m.accuracy);
  }

  async recalculateMetrics(
    tenantId: string,
    period: string,
    traces: AgentDecisionTrace[]
  ): Promise<void> {
    // Group traces by agent type
    const byAgent = new Map<AgentType, AgentDecisionTrace[]>();
    for (const trace of traces) {
      const existing = byAgent.get(trace.agentType) ?? [];
      existing.push(trace);
      byAgent.set(trace.agentType, existing);
    }

    // Calculate metrics for each agent type
    for (const [agentType, agentTraces] of byAgent) {
      const metrics = this.calculateMetrics(tenantId, agentType, period, agentTraces);
      await this.saveMetrics(metrics);
    }
  }

  async saveMetrics(metrics: AccuracyMetrics): Promise<void> {
    const key = this.getKey(metrics.tenantId, metrics.agentType, metrics.period);
    this.metrics.set(key, { ...metrics });
  }

  async listMetrics(filter: AccuracyFilter): Promise<AccuracyMetrics[]> {
    let results = Array.from(this.metrics.values());

    if (filter.tenantId) {
      results = results.filter(m => m.tenantId === filter.tenantId);
    }
    if (filter.agentType) {
      results = results.filter(m => m.agentType === filter.agentType);
    }
    if (filter.period) {
      results = results.filter(m => m.period === filter.period);
    }
    if (filter.fromPeriod) {
      results = results.filter(m => m.period >= filter.fromPeriod!);
    }
    if (filter.toPeriod) {
      results = results.filter(m => m.period <= filter.toPeriod!);
    }

    return results;
  }

  /**
   * Calculate metrics from traces
   */
  private calculateMetrics(
    tenantId: string,
    agentType: AgentType,
    period: string,
    traces: AgentDecisionTrace[]
  ): AccuracyMetrics {
    const byComplexity = {
      low: { decisions: 0, overrides: 0, correctOverrides: 0, incorrectOverrides: 0, accuracy: 0 },
      medium: { decisions: 0, overrides: 0, correctOverrides: 0, incorrectOverrides: 0, accuracy: 0 },
      high: { decisions: 0, overrides: 0, correctOverrides: 0, incorrectOverrides: 0, accuracy: 0 },
    };

    let totalDecisions = 0;
    let humanOverrides = 0;
    let correctOverrides = 0;
    let incorrectOverrides = 0;
    let pendingOutcomes = 0;

    let firstDecisionAt: Date | undefined;
    let lastDecisionAt: Date | undefined;

    for (const trace of traces) {
      totalDecisions++;

      // Track first/last decision
      if (!firstDecisionAt || trace.timestamp < firstDecisionAt) {
        firstDecisionAt = trace.timestamp;
      }
      if (!lastDecisionAt || trace.timestamp > lastDecisionAt) {
        lastDecisionAt = trace.timestamp;
      }

      // Determine complexity band from inputs
      const complexity = trace.inputs.complexity ?? 5;
      const band: ComplexityBand = complexity <= 3 ? 'low' : complexity <= 7 ? 'medium' : 'high';
      byComplexity[band].decisions++;

      // Check outcome
      const outcome = this.outcomes.get(trace.id);
      if (!outcome) {
        pendingOutcomes++;
        continue;
      }

      if (outcome.wasOverridden) {
        humanOverrides++;
        byComplexity[band].overrides++;

        if (outcome.overrideCorrect === true) {
          correctOverrides++;
          byComplexity[band].correctOverrides++;
        } else if (outcome.overrideCorrect === false) {
          incorrectOverrides++;
          byComplexity[band].incorrectOverrides++;
        }
      }
    }

    // Calculate derived rates
    const accuracy = totalDecisions > 0
      ? (totalDecisions - humanOverrides + incorrectOverrides) / totalDecisions
      : 0;
    const overrideRate = totalDecisions > 0
      ? humanOverrides / totalDecisions
      : 0;
    const overrideCorrectness = humanOverrides > 0
      ? correctOverrides / humanOverrides
      : 0;

    // Calculate per-band accuracy
    for (const band of ['low', 'medium', 'high'] as ComplexityBand[]) {
      const b = byComplexity[band];
      b.accuracy = b.decisions > 0
        ? (b.decisions - b.overrides + b.incorrectOverrides) / b.decisions
        : 0;
    }

    return {
      agentType,
      period,
      tenantId,
      totalDecisions,
      humanOverrides,
      correctOverrides,
      incorrectOverrides,
      pendingOutcomes,
      accuracy,
      overrideRate,
      overrideCorrectness,
      byComplexity,
      accuracyTrend: [], // Will be populated by getTrend
      firstDecisionAt,
      lastDecisionAt,
      lastUpdatedAt: new Date(),
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.metrics.clear();
    this.outcomes.clear();
  }

  /**
   * Get outcome by trace ID (for testing)
   */
  getOutcome(traceId: string): DecisionOutcomeRecord | undefined {
    return this.outcomes.get(traceId);
  }
}

// =============================================================================
// Accuracy Tracker Service
// =============================================================================

/**
 * Accuracy Tracker Service
 *
 * Tracks AI agent accuracy over time, enabling trust calibration
 * and learning from past decisions.
 */
export class AccuracyTracker {
  private store: AccuracyTrackerStore;
  private tenantId: string;

  constructor(options: {
    store?: AccuracyTrackerStore;
    tenantId: string;
  }) {
    this.store = options.store ?? new InMemoryAccuracyTrackerStore();
    this.tenantId = options.tenantId;
  }

  /**
   * Record the outcome of a decision
   */
  async recordOutcome(
    traceId: string,
    outcome: Omit<DecisionOutcomeRecord, 'traceId' | 'recordedAt'>
  ): Promise<void> {
    await this.store.recordOutcome({
      ...outcome,
      traceId,
      recordedAt: new Date(),
    });
  }

  /**
   * Get accuracy metrics for an agent type
   */
  async getMetrics(
    agentType: AgentType,
    period?: string
  ): Promise<AccuracyMetrics | null> {
    const p = period ?? this.getCurrentPeriod();
    return this.store.getMetrics(this.tenantId, agentType, p);
  }

  /**
   * Get summary across all agents
   */
  async getSummary(period?: string): Promise<AccuracySummary | null> {
    const p = period ?? this.getCurrentPeriod();
    return this.store.getSummary(this.tenantId, p);
  }

  /**
   * Get accuracy trend over time
   */
  async getTrend(agentType: AgentType, periods = 12): Promise<number[]> {
    return this.store.getTrend(this.tenantId, agentType, periods);
  }

  /**
   * Recalculate metrics from decision traces
   */
  async recalculate(
    traces: AgentDecisionTrace[],
    period?: string
  ): Promise<void> {
    const p = period ?? this.getCurrentPeriod();
    await this.store.recalculateMetrics(this.tenantId, p, traces);
  }

  /**
   * Get learning velocity - how fast accuracy is improving
   */
  async getLearningVelocity(agentType: AgentType, periods = 6): Promise<number> {
    const trend = await this.getTrend(agentType, periods);
    if (trend.length < 2) return 0;

    // Reverse to ascending order (oldest first) for correct slope calculation
    const ascending = [...trend].reverse();

    // Calculate slope of accuracy trend
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < ascending.length; i++) {
      sumX += i;
      sumY += ascending[i];
      sumXY += i * ascending[i];
      sumX2 += i * i;
    }

    const n = ascending.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return slope;
  }

  /**
   * Check if an agent type is calibrated (consistent accuracy)
   */
  async isCalibrated(
    agentType: AgentType,
    minAccuracy = 0.8,
    maxVariance = 0.1
  ): Promise<boolean> {
    const trend = await this.getTrend(agentType, 6);
    if (trend.length < 3) return false;

    // Check minimum accuracy
    const avgAccuracy = trend.reduce((a, b) => a + b, 0) / trend.length;
    if (avgAccuracy < minAccuracy) return false;

    // Check variance
    const variance = trend.reduce((sum, val) =>
      sum + Math.pow(val - avgAccuracy, 2), 0
    ) / trend.length;

    return variance <= maxVariance;
  }

  /**
   * Get recommendations for improving accuracy
   */
  async getRecommendations(agentType: AgentType): Promise<string[]> {
    const metrics = await this.getMetrics(agentType);
    if (!metrics) return [];

    const recommendations: string[] = [];

    // Check overall accuracy
    if (metrics.accuracy < 0.7) {
      recommendations.push(
        `Overall accuracy is low (${(metrics.accuracy * 100).toFixed(1)}%). ` +
        'Consider reviewing agent prompts and context.'
      );
    }

    // Check if overrides are often incorrect
    if (metrics.overrideCorrectness < 0.5 && metrics.humanOverrides > 5) {
      recommendations.push(
        `Human overrides are often incorrect (${(metrics.overrideCorrectness * 100).toFixed(1)}% correct). ` +
        'AI may be performing better than perceived.'
      );
    }

    // Check complexity-specific issues
    if (metrics.byComplexity.high.accuracy < 0.5) {
      recommendations.push(
        'High-complexity decisions have low accuracy. ' +
        'Consider breaking down complex issues or adding more context.'
      );
    }

    if (metrics.byComplexity.low.overrides > metrics.byComplexity.low.decisions * 0.3) {
      recommendations.push(
        'High override rate on low-complexity issues. ' +
        'Agent may be overcomplicating simple tasks.'
      );
    }

    // Check pending outcomes
    if (metrics.pendingOutcomes > metrics.totalDecisions * 0.5) {
      recommendations.push(
        `Many decisions (${metrics.pendingOutcomes}) have no recorded outcome. ` +
        'Recording outcomes improves accuracy tracking.'
      );
    }

    return recommendations;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get current period string (YYYY-MM)
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an accuracy tracker for a tenant
 */
export function createAccuracyTracker(
  tenantId: string,
  store?: AccuracyTrackerStore
): AccuracyTracker {
  return new AccuracyTracker({ tenantId, store });
}

/**
 * Format a period from a date
 */
export function formatPeriod(date: Date, granularity: TimePeriod = 'month'): string {
  // Use UTC to avoid timezone issues
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  switch (granularity) {
    case 'day':
      return `${year}-${String(month).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    case 'week':
      // ISO week number
      const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
      const days = Math.floor((date.getTime() - firstDayOfYear.getTime()) / 86400000);
      const week = Math.ceil((days + firstDayOfYear.getUTCDay() + 1) / 7);
      return `${year}-W${String(week).padStart(2, '0')}`;
    case 'month':
      return `${year}-${String(month).padStart(2, '0')}`;
    case 'quarter':
      const quarter = Math.ceil(month / 3);
      return `${year}-Q${quarter}`;
    case 'year':
      return `${year}`;
    case 'all-time':
      return 'all';
    default:
      return `${year}-${String(month).padStart(2, '0')}`;
  }
}

/**
 * Get complexity band from a complexity score
 */
export function getComplexityBand(complexity: number): ComplexityBand {
  if (complexity <= 3) return 'low';
  if (complexity <= 7) return 'medium';
  return 'high';
}

// =============================================================================
// Singleton Store Instance
// =============================================================================

let trackerStoreInstance: AccuracyTrackerStore | null = null;

/**
 * Get or create the global accuracy tracker store
 */
export function getAccuracyTrackerStore(): AccuracyTrackerStore {
  if (!trackerStoreInstance) {
    trackerStoreInstance = new InMemoryAccuracyTrackerStore();
  }
  return trackerStoreInstance;
}

/**
 * Set the accuracy tracker store (for dependency injection)
 */
export function setAccuracyTrackerStore(store: AccuracyTrackerStore): void {
  trackerStoreInstance = store;
}

/**
 * Reset the accuracy tracker store (for testing)
 */
export function resetAccuracyTrackerStore(): void {
  trackerStoreInstance = null;
}
