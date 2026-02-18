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

// Code Quality Hook (Internal Agent Quality Gate)
export {
  CodeQualityHook,
  createCodeQualityHook,
  CodeQualityError,
  DEFAULT_CODE_QUALITY_CONFIG,
} from './code-quality-hook.js';
export type { CodeQualityConfig, QualityAssessment } from './code-quality-hook.js';

// Trace Analysis Hook (Harness Engineering Pattern 5: Trace Analysis Feedback Loop)
export {
  TraceAnalysisHook,
  createTraceAnalysisHook,
  DEFAULT_TRACE_ANALYSIS_CONFIG,
} from './trace-analysis-hook.js';
export type {
  TraceAnalysisConfig,
  TraceAnalysisResult,
  FailurePattern,
} from './trace-analysis-hook.js';

// Self-Test Hook (Harness Engineering Pattern 1: Build & Self-Verify)
export {
  SelfTestHook,
  createSelfTestHook,
  SelfTestError,
  DEFAULT_SELF_TEST_CONFIG,
} from './self-test-hook.js';
export type { SelfTestConfig, SelfTestValidation } from './self-test-hook.js';

// Environment Onboarding Hook (Harness Engineering Pattern 2: Context Engineering)
export {
  EnvironmentOnboardingHook,
  createEnvironmentOnboardingHook,
  DEFAULT_ENV_ONBOARDING_CONFIG,
} from './environment-onboarding-hook.js';
export type {
  EnvironmentOnboardingConfig,
  EnvironmentProfile,
} from './environment-onboarding-hook.js';

// Loop Detection Hook (Harness Engineering Pattern 3: Loop Detection)
export {
  LoopDetectionHook,
  createLoopDetectionHook,
  LoopDetectionError,
  DEFAULT_LOOP_DETECTION_CONFIG,
  calculateSimilarity,
} from './loop-detection-hook.js';
export type {
  LoopDetectionConfig,
  LoopDetectionResult,
} from './loop-detection-hook.js';

// Budget Management Hook (Harness Engineering Pattern 6: Time/Token Budgeting)
export {
  BudgetManagementHook,
  createBudgetManagementHook,
  BudgetExceededError,
  DEFAULT_BUDGET_CONFIG,
} from './budget-management-hook.js';
export type {
  BudgetManagementConfig,
  BudgetStatus,
} from './budget-management-hook.js';
