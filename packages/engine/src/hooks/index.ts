/**
 * Agent Hook System
 *
 * This module provides a hook system for the Git With Intent agent pipeline.
 * Hooks can be registered to run after each agent step, enabling:
 * - Custom telemetry
 * - Extensible behavior
 *
 * @module @gwi/engine/hooks
 *
 * @example
 * ```typescript
 * import { buildDefaultHookRunner, AgentRunContext } from '@gwi/engine/hooks';
 *
 * // Build runner with configured hooks (from env vars)
 * const runner = await buildDefaultHookRunner();
 *
 * // After each agent step:
 * const ctx: AgentRunContext = {
 *   runId: 'run-123',
 *   runType: 'RESOLVE',
 *   stepId: 'step-456',
 *   agentRole: 'CODER',
 *   stepStatus: 'completed',
 *   timestamp: new Date().toISOString(),
 * };
 *
 * await runner.afterStep(ctx);
 * ```
 */

// Types
export type {
  AgentRole,
  AgentRunContext,
  AgentRunContextWithPR,
  AgentHook,
  HookConfig,
} from './types.js';

export {
  DEFAULT_HOOK_CONFIG,
} from './types.js';

// Runner
export { AgentHookRunner } from './runner.js';
export type { HookRunResult } from './runner.js';

// Configuration
export {
  readHookConfigFromEnv,
  buildDefaultHookRunner,
  buildHookRunner,
} from './config.js';

// Decision Trace Hook (Phase 35: Context Graph)
export {
  DecisionTraceHook,
  createDecisionTraceHook,
  getDecisionTraceHook,
  resetDecisionTraceHook,
} from './decision-trace-hook.js';

// Risk Enforcement Hook (EPIC 025: Regulated Domain Controls)
export {
  RiskEnforcementHook,
  createRiskEnforcementHook,
  getOperationRiskTier,
  getRoleRiskTier,
  RiskEnforcementError,
} from './risk-enforcement-hook.js';
export type { RiskEnforcementConfig } from './risk-enforcement-hook.js';
