/**
 * Agent Hook System Types
 *
 * These types define the contract for the hook system that runs after each
 * agent step, message, or run. Hooks can be used for:
 * - Custom logging or telemetry
 * - Future extensibility
 *
 * @module @gwi/engine/hooks
 */

import type { RunType, StepStatus } from '@gwi/core';

// =============================================================================
// Agent Role Types
// =============================================================================

/**
 * Agent roles in the Git With Intent pipeline
 */
export type AgentRole =
  | 'FOREMAN'    // Orchestrator/coordinator
  | 'TRIAGE'     // Complexity analysis
  | 'PLANNER'    // Change plan generation
  | 'CODER'      // Code modification
  | 'VALIDATOR'  // Test/lint validation
  | 'REVIEWER';  // Review summary generation

// =============================================================================
// Hook Context Types
// =============================================================================

/**
 * Context passed to hooks after each agent step
 *
 * This provides all the information needed for hooks to:
 * - Record audit trails
 * - Create task/issue tracking
 * - Log metrics and telemetry
 */
export interface AgentRunContext {
  /**
   * Tenant ID for multi-tenant SaaS (optional for CLI)
   */
  tenantId?: string;

  /**
   * Unique identifier for this run
   */
  runId: string;

  /**
   * Type of run being executed
   */
  runType: RunType;

  /**
   * Unique identifier for this step within the run
   */
  stepId: string;

  /**
   * Role of the agent executing this step
   */
  agentRole: AgentRole;

  /**
   * Current status of the step
   */
  stepStatus: StepStatus;

  /**
   * ISO 8601 timestamp of when this context was created
   */
  timestamp: string;

  /**
   * Summary of the input provided to the agent (for audit)
   * Should NOT contain sensitive data
   */
  inputSummary?: string;

  /**
   * Summary of the output produced by the agent (for audit)
   * Should NOT contain sensitive data
   */
  outputSummary?: string;

  /**
   * Duration of the step in milliseconds (if completed)
   */
  durationMs?: number;

  /**
   * Token usage for this step (if available)
   */
  tokensUsed?: {
    input: number;
    output: number;
  };

  /**
   * Additional metadata for extensibility
   */
  metadata?: Record<string, unknown>;
}

/**
 * Extended context with PR/issue information
 */
export interface AgentRunContextWithPR extends AgentRunContext {
  /**
   * GitHub PR URL being processed
   */
  prUrl?: string;

  /**
   * GitHub repository in owner/repo format
   */
  repository?: string;

  /**
   * PR number
   */
  prNumber?: number;

  /**
   * Issue number (for issue-to-code workflows)
   */
  issueNumber?: number;
}

// =============================================================================
// Hook Interface
// =============================================================================

/**
 * Interface for agent lifecycle hooks
 *
 * Hooks are called after each agent step completes. They should:
 * - Execute quickly (async but non-blocking to main flow)
 * - Handle errors gracefully (never crash the main pipeline)
 * - Be idempotent when possible
 */
export interface AgentHook {
  /**
   * Unique name for this hook (for logging/debugging)
   */
  name: string;

  /**
   * Called after an agent step completes (success or failure)
   *
   * @param ctx - The context of the completed step
   * @returns Promise that resolves when hook processing is complete
   * @throws Should NOT throw - errors should be caught and logged internally
   */
  onAfterStep(ctx: AgentRunContext): Promise<void>;

  /**
   * Optional: Called when a run starts
   *
   * @param ctx - Initial context for the run
   */
  onRunStart?(ctx: AgentRunContext): Promise<void>;

  /**
   * Optional: Called when a run completes (success or failure)
   *
   * @param ctx - Final context for the run
   * @param success - Whether the run completed successfully
   */
  onRunEnd?(ctx: AgentRunContext, success: boolean): Promise<void>;

  /**
   * Optional: Check if this hook is enabled/available
   *
   * @returns true if the hook should be active
   */
  isEnabled?(): Promise<boolean>;
}

// =============================================================================
// Hook Configuration
// =============================================================================

/**
 * Configuration for the hook system
 */
export interface HookConfig {
  /**
   * Enable custom hooks from plugins
   * @default true
   */
  enableCustomHooks: boolean;

  /**
   * Timeout for individual hook execution in ms
   * @default 5000
   */
  hookTimeoutMs: number;

  /**
   * Whether to run hooks in parallel (faster) or series (safer)
   * @default true
   */
  parallelExecution: boolean;

  /**
   * Log hook execution for debugging
   * @default false
   */
  debug: boolean;
}

/**
 * Default hook configuration
 */
export const DEFAULT_HOOK_CONFIG: HookConfig = {
  enableCustomHooks: true,
  hookTimeoutMs: 5000,
  parallelExecution: true,
  debug: false,
};

// =============================================================================
// Hook Runner Interface
// =============================================================================

/**
 * Interface for the hook runner that manages multiple hooks
 */
export interface AgentHookRunner {
  /**
   * Register a hook with the runner
   */
  registerHook(hook: AgentHook): void;

  /**
   * Called after an agent step completes
   */
  afterStep(ctx: AgentRunContext): Promise<void>;

  /**
   * Called when a run starts
   */
  runStart?(ctx: AgentRunContext): Promise<void>;

  /**
   * Called when a run ends
   */
  runEnd?(ctx: AgentRunContext, success: boolean): Promise<void>;
}
