/**
 * Hook Configuration
 *
 * Reads hook configuration from environment variables and creates
 * the default hook runner with appropriate hooks registered.
 *
 * Environment Variables:
 * - GWI_HOOK_DEBUG: Enable debug logging for hooks
 * - GWI_HOOK_TIMEOUT_MS: Timeout for hook execution (default: 5000)
 * - GWI_HOOK_PARALLEL: Run hooks in parallel (default: true)
 * - GWI_DECISION_TRACE_ENABLED: Enable decision trace hook (default: false)
 * - GWI_RISK_ENFORCEMENT_ENABLED: Enable risk enforcement hook (default: true)
 * - GWI_CODE_QUALITY_HOOK_ENABLED: Enable code quality hook (default: true)
 * - GWI_TRACE_ANALYSIS_ENABLED: Enable trace analysis hook (default: true)
 * - GWI_SELF_TEST_HOOK_ENABLED: Enable self-test validation hook (default: true)
 * - GWI_ENVIRONMENT_ONBOARDING_ENABLED: Enable environment onboarding hook (default: true)
 * - GWI_LOOP_DETECTION_ENABLED: Enable loop detection hook (default: true)
 * - GWI_BUDGET_MANAGEMENT_ENABLED: Enable budget management hook (default: true)
 *
 * @module @gwi/engine/hooks
 */

import { getLogger } from '@gwi/core';
import type { HookConfig, AgentHook } from './types.js';
import { DEFAULT_HOOK_CONFIG } from './types.js';
import { AgentHookRunner } from './runner.js';
import { DecisionTraceHook } from './decision-trace-hook.js';
import { CodeQualityHook } from './code-quality-hook.js';
import { RiskEnforcementHook } from './risk-enforcement-hook.js';
import { TraceAnalysisHook } from './trace-analysis-hook.js';
import { SelfTestHook } from './self-test-hook.js';
import { EnvironmentOnboardingHook } from './environment-onboarding-hook.js';
import { LoopDetectionHook } from './loop-detection-hook.js';
import { BudgetManagementHook } from './budget-management-hook.js';

const logger = getLogger('hooks');

/**
 * Read hook configuration from environment variables
 */
export function readHookConfigFromEnv(): HookConfig {
  return {
    enableCustomHooks: process.env.GWI_CUSTOM_HOOKS_ENABLED !== 'false',
    hookTimeoutMs: parseInt(process.env.GWI_HOOK_TIMEOUT_MS || '', 10) || DEFAULT_HOOK_CONFIG.hookTimeoutMs,
    parallelExecution: process.env.GWI_HOOK_PARALLEL !== 'false',
    debug: process.env.GWI_HOOK_DEBUG === 'true',
  };
}

/**
 * Build the default hook runner with all configured hooks
 *
 * This function:
 * 1. Reads configuration from environment
 * 2. Registers decision trace hook if enabled
 * 3. Returns a ready-to-use runner
 *
 * Usage:
 * ```typescript
 * const runner = await buildDefaultHookRunner();
 * // Runner is now configured based on environment
 * ```
 */
export async function buildDefaultHookRunner(): Promise<AgentHookRunner> {
  const config = readHookConfigFromEnv();
  const runner = new AgentHookRunner(config);

  // Register decision trace hook if enabled (Phase 35: Context Graph)
  if (process.env.GWI_DECISION_TRACE_ENABLED === 'true') {
    const decisionTraceHook = new DecisionTraceHook();
    runner.register(decisionTraceHook);

    if (config.debug) {
      logger.debug('Decision trace hook registered');
    }
  }

  // Register risk enforcement hook (enabled by default, opt-out via env)
  if (process.env.GWI_RISK_ENFORCEMENT_ENABLED !== 'false') {
    const riskHook = new RiskEnforcementHook();
    runner.register(riskHook);

    if (config.debug) {
      logger.debug('Risk enforcement hook registered');
    }
  }

  // Register code quality hook (enabled by default, opt-out via env)
  if (process.env.GWI_CODE_QUALITY_HOOK_ENABLED !== 'false') {
    const codeQualityHook = new CodeQualityHook();
    runner.register(codeQualityHook);

    if (config.debug) {
      logger.debug('Code quality hook registered');
    }
  }

  // Register harness engineering hooks (all default ON, opt-out via env)
  const harnessHooks: Array<{ envVar: string; create: () => AgentHook; label: string }> = [
    { envVar: 'GWI_TRACE_ANALYSIS_ENABLED', create: () => new TraceAnalysisHook(), label: 'Trace analysis' },
    { envVar: 'GWI_SELF_TEST_HOOK_ENABLED', create: () => new SelfTestHook(), label: 'Self-test' },
    { envVar: 'GWI_ENVIRONMENT_ONBOARDING_ENABLED', create: () => new EnvironmentOnboardingHook(), label: 'Environment onboarding' },
    { envVar: 'GWI_LOOP_DETECTION_ENABLED', create: () => new LoopDetectionHook(), label: 'Loop detection' },
    { envVar: 'GWI_BUDGET_MANAGEMENT_ENABLED', create: () => new BudgetManagementHook(), label: 'Budget management' },
  ];

  for (const { envVar, create, label } of harnessHooks) {
    if (process.env[envVar] !== 'false') {
      runner.register(create());
      if (config.debug) {
        logger.debug(`${label} hook registered`);
      }
    }
  }

  return runner;
}

/**
 * Build a hook runner with specific hooks (for testing or custom configurations)
 */
export function buildHookRunner(
  config: Partial<HookConfig>,
  hooks: AgentHook[]
): AgentHookRunner {
  const runner = new AgentHookRunner(config);

  for (const hook of hooks) {
    runner.register(hook);
  }

  return runner;
}
