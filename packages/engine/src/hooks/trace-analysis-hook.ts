/**
 * Trace Analysis Hook
 *
 * Harness Engineering Pattern 5: Trace Analysis Feedback Loop
 *
 * Analyzes completed run traces to identify failure patterns,
 * categorize errors by agent/step, and generate improvement signals.
 * Reads from DecisionTraceStore to mine historical decision data.
 *
 * @module @gwi/engine/hooks
 */

import { getLogger } from '@gwi/core';
import type {
  DecisionTraceStore,
  AgentDecisionTrace,
  AgentType,
} from '@gwi/core';
import { getDecisionTraceStore } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';

const logger = getLogger('trace-analysis-hook');

// =============================================================================
// Types
// =============================================================================

/**
 * A detected failure pattern from trace analysis
 */
export interface FailurePattern {
  /** Agent type that failed */
  agentType: AgentType;
  /** Category of failure (e.g., 'timeout', 'low_confidence', 'repeated_error') */
  category: string;
  /** Number of occurrences */
  count: number;
  /** Representative error messages */
  samples: string[];
  /** Suggested mitigation */
  suggestion: string;
}

/**
 * Result of analyzing a run's traces
 */
export interface TraceAnalysisResult {
  runId: string;
  totalTraces: number;
  failedTraces: number;
  patterns: FailurePattern[];
  agentFailureRates: Record<string, { total: number; failed: number; rate: number }>;
  avgDurationMs: number;
  totalTokens: { input: number; output: number };
}

/**
 * Configuration for trace analysis
 */
export interface TraceAnalysisConfig {
  /** Minimum failure count to report a pattern. @default 2 */
  minPatternCount: number;
  /** Whether to log analysis results. @default true */
  logResults: boolean;
  /** Callback when analysis completes */
  onAnalysis?: (result: TraceAnalysisResult) => Promise<void>;
}

/**
 * Default configuration
 */
export const DEFAULT_TRACE_ANALYSIS_CONFIG: TraceAnalysisConfig = {
  minPatternCount: 2,
  logResults: true,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Trace Analysis Hook
 *
 * Runs on onRunEnd to analyze all decision traces from the completed run.
 * Identifies failure patterns, calculates agent failure rates, and generates
 * improvement suggestions that can feed back into prompt tuning or hook config.
 */
export class TraceAnalysisHook implements AgentHook {
  readonly name = 'trace-analysis';
  private config: TraceAnalysisConfig;
  private store: DecisionTraceStore;

  constructor(config?: Partial<TraceAnalysisConfig>, store?: DecisionTraceStore) {
    this.config = { ...DEFAULT_TRACE_ANALYSIS_CONFIG, ...config };
    this.store = store ?? getDecisionTraceStore();
  }

  /**
   * Required by interface — no-op for this hook
   */
  async onAfterStep(_ctx: AgentRunContext): Promise<void> {
    // Trace analysis happens at run end, not per step
  }

  /**
   * Analyze all traces when a run completes
   */
  async onRunEnd(ctx: AgentRunContext, success: boolean): Promise<void> {
    try {
      // Use tenant-scoped query when tenantId is available (multi-tenant safety)
      const traces = ctx.tenantId
        ? await this.store.listTraces({ runId: ctx.runId, tenantId: ctx.tenantId })
        : await this.store.getTracesForRun(ctx.runId);

      if (traces.length === 0) {
        logger.debug('No traces found for run, skipping analysis', { runId: ctx.runId });
        return;
      }

      const result = this.analyzeTraces(ctx.runId, traces);

      // Attach to context metadata for downstream consumption
      if (ctx.metadata) {
        ctx.metadata.traceAnalysis = result;
      }

      if (this.config.logResults) {
        const level = success ? 'info' : 'warn';
        logger[level]('Trace analysis complete', {
          runId: ctx.runId,
          totalTraces: result.totalTraces,
          failedTraces: result.failedTraces,
          patternCount: result.patterns.length,
          avgDurationMs: Math.round(result.avgDurationMs),
        });

        for (const pattern of result.patterns) {
          logger.warn('Failure pattern detected', {
            runId: ctx.runId,
            agent: pattern.agentType,
            category: pattern.category,
            count: pattern.count,
            suggestion: pattern.suggestion,
          });
        }
      }

      await this.config.onAnalysis?.(result);
    } catch (error) {
      logger.error('Trace analysis failed', {
        runId: ctx.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return process.env.GWI_TRACE_ANALYSIS_ENABLED !== 'false';
  }

  /**
   * Analyze traces for a run and detect patterns
   */
  analyzeTraces(runId: string, traces: AgentDecisionTrace[]): TraceAnalysisResult {
    const failedTraces = traces.filter(
      (t) => t.outcome?.result === 'failure'
    );

    // Calculate agent failure rates
    const agentStats = new Map<string, { total: number; failed: number }>();
    for (const trace of traces) {
      const stats = agentStats.get(trace.agentType) ?? { total: 0, failed: 0 };
      stats.total++;
      if (trace.outcome?.result === 'failure') {
        stats.failed++;
      }
      agentStats.set(trace.agentType, stats);
    }

    const agentFailureRates: Record<string, { total: number; failed: number; rate: number }> = {};
    for (const [agent, stats] of agentStats) {
      agentFailureRates[agent] = {
        ...stats,
        rate: stats.total > 0 ? stats.failed / stats.total : 0,
      };
    }

    // Detect failure patterns
    const patterns = this.detectPatterns(failedTraces);

    // Aggregate timing
    const durations = traces
      .map((t) => t.metadata?.durationMs)
      .filter((d): d is number => d !== undefined);
    const avgDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Aggregate tokens
    const totalTokens = { input: 0, output: 0 };
    for (const trace of traces) {
      if (trace.metadata?.tokensUsed) {
        totalTokens.input += trace.metadata.tokensUsed.input;
        totalTokens.output += trace.metadata.tokensUsed.output;
      }
    }

    return {
      runId,
      totalTraces: traces.length,
      failedTraces: failedTraces.length,
      patterns,
      agentFailureRates,
      avgDurationMs,
      totalTokens,
    };
  }

  /**
   * Detect failure patterns from failed traces
   */
  private detectPatterns(failedTraces: AgentDecisionTrace[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];

    // Group failures by agent type
    const byAgent = new Map<AgentType, AgentDecisionTrace[]>();
    for (const trace of failedTraces) {
      const existing = byAgent.get(trace.agentType) ?? [];
      existing.push(trace);
      byAgent.set(trace.agentType, existing);
    }

    for (const [agentType, agentTraces] of byAgent) {
      // Pattern: Repeated failures from same agent
      if (agentTraces.length >= this.config.minPatternCount) {
        patterns.push({
          agentType,
          category: 'repeated_failure',
          count: agentTraces.length,
          samples: agentTraces
            .slice(0, 3)
            .map((t) => t.decision.reasoning.slice(0, 200)),
          suggestion: `${agentType} agent failed ${agentTraces.length} times. Review prompt, model selection, or input quality.`,
        });
      }

      // Pattern: Low confidence decisions that failed
      const lowConfidence = agentTraces.filter(
        (t) => t.decision.confidence < 0.5
      );
      if (lowConfidence.length >= this.config.minPatternCount) {
        patterns.push({
          agentType,
          category: 'low_confidence_failure',
          count: lowConfidence.length,
          samples: lowConfidence
            .slice(0, 3)
            .map((t) => `confidence=${t.decision.confidence}: ${t.decision.reasoning.slice(0, 150)}`),
          suggestion: `${agentType} made ${lowConfidence.length} low-confidence decisions that failed. Consider escalating to a more capable model earlier.`,
        });
      }

      // Pattern: Slow failures (timeout-like)
      const slowFailures = agentTraces.filter(
        (t) => t.metadata?.durationMs && t.metadata.durationMs > 30000
      );
      if (slowFailures.length >= this.config.minPatternCount) {
        patterns.push({
          agentType,
          category: 'slow_failure',
          count: slowFailures.length,
          samples: slowFailures
            .slice(0, 3)
            .map((t) => `${t.metadata?.durationMs}ms: ${t.decision.action}`),
          suggestion: `${agentType} had ${slowFailures.length} slow failures (>30s). May indicate timeout issues or overly complex inputs.`,
        });
      }
    }

    return patterns;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a trace analysis hook
 */
export function createTraceAnalysisHook(
  config?: Partial<TraceAnalysisConfig>,
  store?: DecisionTraceStore,
): TraceAnalysisHook {
  return new TraceAnalysisHook(config, store);
}
