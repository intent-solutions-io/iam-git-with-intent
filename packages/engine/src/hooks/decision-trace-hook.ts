/**
 * Decision Trace Hook
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * This hook captures agent decisions and stores them in the Context Graph
 * for auditing, learning, and "why did this happen?" queries.
 *
 * @module @gwi/engine/hooks/decision-trace-hook
 */

import { getLogger } from '@gwi/core';
import type { AgentHook, AgentRunContext, AgentRole } from './types.js';
import {
  type AgentType,
  type AgentDecisionTrace,
  type DecisionTraceStore,
  getDecisionTraceStore,
  generateTraceId,
} from '@gwi/core';

const logger = getLogger('decision-trace-hook');

// =============================================================================
// Role to Agent Type Mapping
// =============================================================================

/**
 * Map hook AgentRole to context graph AgentType
 */
function roleToAgentType(role: AgentRole): AgentType {
  const mapping: Record<AgentRole, AgentType> = {
    FOREMAN: 'orchestrator',
    TRIAGE: 'triage',
    PLANNER: 'planner',
    CODER: 'coder',
    VALIDATOR: 'analyzer',
    REVIEWER: 'reviewer',
  };
  return mapping[role] ?? 'analyzer';
}

// =============================================================================
// Decision Trace Hook Implementation
// =============================================================================

/**
 * Hook that captures agent decisions for the Context Graph
 *
 * This hook listens to agent step completions and creates decision traces
 * that can be queried later for auditing and learning.
 *
 * Usage:
 * ```typescript
 * const hookRunner = getHookRunner();
 * hookRunner.registerHook(new DecisionTraceHook());
 * ```
 */
export class DecisionTraceHook implements AgentHook {
  readonly name = 'decision-trace';
  private store: DecisionTraceStore;
  private enabled: boolean;

  // Track run-level context for richer traces
  private runContexts = new Map<string, {
    startTime: Date;
    previousSteps: string[];
    metadata?: Record<string, unknown>;
  }>();

  constructor(options?: {
    store?: DecisionTraceStore;
    enabled?: boolean;
  }) {
    this.store = options?.store ?? getDecisionTraceStore();
    this.enabled = options?.enabled ?? true;
  }

  /**
   * Check if hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }

  /**
   * Enable or disable the hook
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Called when a run starts
   */
  async onRunStart(ctx: AgentRunContext): Promise<void> {
    if (!this.enabled) return;

    // Initialize run context tracking
    this.runContexts.set(ctx.runId, {
      startTime: new Date(),
      previousSteps: [],
      metadata: ctx.metadata,
    });
  }

  /**
   * Called after each agent step completes
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    if (!this.enabled) return;

    try {
      const runContext = this.runContexts.get(ctx.runId);

      // Create decision trace
      const trace: AgentDecisionTrace = {
        id: generateTraceId(),
        runId: ctx.runId,
        stepId: ctx.stepId,
        agentType: roleToAgentType(ctx.agentRole),
        timestamp: new Date(ctx.timestamp),
        tenantId: ctx.tenantId ?? 'unknown',

        // What the agent saw
        inputs: {
          prompt: ctx.inputSummary ?? 'Input not captured',
          contextWindow: [], // Could be enhanced with actual file list
          previousSteps: runContext?.previousSteps ?? [],
        },

        // What the agent decided
        decision: {
          action: this.inferActionFromRole(ctx.agentRole, ctx.stepStatus),
          reasoning: ctx.outputSummary ?? 'Output not captured',
          confidence: this.estimateConfidence(ctx),
          alternatives: [], // Could be enhanced with actual alternatives
        },

        // Initial outcome based on step status
        outcome: {
          result: ctx.stepStatus === 'completed' ? 'success' : 'failure',
          determinedAt: new Date(),
        },

        // Metadata
        metadata: {
          durationMs: ctx.durationMs,
          tokensUsed: ctx.tokensUsed,
          ...ctx.metadata,
        },
      };

      // Save trace
      await this.store.saveTrace(trace);

      // Update run context with this step
      if (runContext) {
        runContext.previousSteps.push(
          `${ctx.agentRole}: ${ctx.outputSummary?.slice(0, 100) ?? 'completed'}`
        );
      }

    } catch (error) {
      // Hooks should never crash the main pipeline
      logger.error('Error saving trace', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Called when a run ends
   */
  async onRunEnd(ctx: AgentRunContext, _success: boolean): Promise<void> {
    if (!this.enabled) return;

    // Clean up run context
    this.runContexts.delete(ctx.runId);

    // Could optionally update all traces for this run with final outcome
  }

  /**
   * Infer action from agent role and status
   */
  private inferActionFromRole(role: AgentRole, status: string): string {
    const actions: Record<AgentRole, string> = {
      FOREMAN: 'orchestrate',
      TRIAGE: 'analyze_complexity',
      PLANNER: 'generate_plan',
      CODER: 'generate_code',
      VALIDATOR: 'validate',
      REVIEWER: 'review',
    };

    const action = actions[role] ?? 'unknown';
    return status === 'completed' ? action : `${action}_failed`;
  }

  /**
   * Estimate confidence based on context
   */
  private estimateConfidence(ctx: AgentRunContext): number {
    // Base confidence
    let confidence = 0.7;

    // Adjust based on status
    if (ctx.stepStatus === 'completed') {
      confidence += 0.1;
    } else if (ctx.stepStatus === 'failed') {
      confidence -= 0.2;
    }

    // Adjust based on duration (faster might mean simpler/more confident)
    if (ctx.durationMs && ctx.durationMs < 5000) {
      confidence += 0.05;
    }

    // Clamp to valid range
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get all traces for a run (for debugging/inspection)
   */
  async getTracesForRun(runId: string): Promise<AgentDecisionTrace[]> {
    return this.store.getTracesForRun(runId);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create and register a decision trace hook
 */
export function createDecisionTraceHook(options?: {
  store?: DecisionTraceStore;
  enabled?: boolean;
}): DecisionTraceHook {
  return new DecisionTraceHook(options);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalDecisionTraceHook: DecisionTraceHook | null = null;

/**
 * Get or create the global decision trace hook
 */
export function getDecisionTraceHook(): DecisionTraceHook {
  if (!globalDecisionTraceHook) {
    globalDecisionTraceHook = new DecisionTraceHook();
  }
  return globalDecisionTraceHook;
}

/**
 * Reset the global decision trace hook (for testing)
 */
export function resetDecisionTraceHook(): void {
  globalDecisionTraceHook = null;
}
