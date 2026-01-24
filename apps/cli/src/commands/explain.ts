/**
 * Explain Command
 *
 * Two modes:
 * 1. AI Decision Trace (Phase 35): "Why did AI do that?"
 * 2. Local Changes (Epic J): "What changed and why?"
 *
 * Usage:
 *   gwi explain <run-id>            Explain AI run
 *   gwi explain <run-id> <step-id>  Explain specific step
 *   gwi explain --trace <trace-id>  Explain by trace ID
 *   gwi explain . --local           Explain local changes (Epic J)
 *   gwi explain HEAD~1 --local      Explain since commit
 */

import chalk from 'chalk';
import {
  createExplainer,
  formatExplanationForCLI,
  formatRunExplanationForCLI,
} from '@gwi/core';
import { localExplainCommand, type LocalExplainOptions } from './local-explain.js';

// =============================================================================
// Types
// =============================================================================

export interface ExplainOptions extends LocalExplainOptions {
  json?: boolean;
  verbose?: boolean;
  trace?: string;
  tenant?: string;
  level?: 'brief' | 'standard' | 'detailed' | 'debug';
  /** Local mode - explain local changes (Epic J) */
  local?: boolean;
  /** Markdown output */
  markdown?: boolean;
}

// =============================================================================
// Explain Run Command
// =============================================================================

/**
 * Explain an entire run
 */
export async function explainRunCommand(
  runId: string,
  options: ExplainOptions
): Promise<void> {
  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const explainer = createExplainer(tenantId);

  const explanation = await explainer.explainRun(runId, {
    level: options.level ?? (options.verbose ? 'detailed' : 'standard'),
  });

  if (!explanation) {
    console.error(chalk.red(`No decision traces found for run: ${runId}`));
    console.log(chalk.dim('This run may not have recorded decision traces.'));
    console.log(chalk.dim('Enable with: GWI_DECISION_TRACE_ENABLED=true'));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(formatRunExplanationForCLI(explanation));
  console.log();

  // Show how to get more details
  if (explanation.decisions.length > 0 && !options.verbose) {
    console.log(chalk.dim('  For step details: gwi explain ' + runId + ' <step-id>'));
    console.log(chalk.dim('  Steps: ' + explanation.decisions.map(d => d.stepId ?? d.traceId.slice(0, 8)).join(', ')));
  }
}

// =============================================================================
// Explain Step Command
// =============================================================================

/**
 * Explain a specific step in a run
 */
export async function explainStepCommand(
  runId: string,
  stepId: string,
  options: ExplainOptions
): Promise<void> {
  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const explainer = createExplainer(tenantId);

  const explanation = await explainer.explainStep(runId, stepId, {
    level: options.level ?? (options.verbose ? 'detailed' : 'standard'),
    resolveEntities: options.verbose,
  });

  if (!explanation) {
    console.error(chalk.red(`Step not found: ${stepId} in run ${runId}`));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(formatExplanationForCLI(explanation));
  console.log();

  // Navigation hints
  if (explanation.links.previousStep) {
    console.log(chalk.dim(`  Previous: gwi explain ${runId} --trace ${explanation.links.previousStep}`));
  }
  if (explanation.links.nextStep) {
    console.log(chalk.dim(`  Next: gwi explain ${runId} --trace ${explanation.links.nextStep}`));
  }
}

// =============================================================================
// Explain Trace Command
// =============================================================================

/**
 * Explain by trace ID
 */
export async function explainTraceCommand(
  traceId: string,
  options: ExplainOptions
): Promise<void> {
  const tenantId = options.tenant ?? process.env.GWI_TENANT_ID ?? 'default';
  const explainer = createExplainer(tenantId);

  const explanation = await explainer.explainDecision(traceId, {
    level: options.level ?? (options.verbose ? 'detailed' : 'standard'),
    resolveEntities: options.verbose,
  });

  if (!explanation) {
    console.error(chalk.red(`Decision trace not found: ${traceId}`));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  // Pretty print
  console.log();
  console.log(formatExplanationForCLI(explanation));
  console.log();
}

// =============================================================================
// Main Command Handler
// =============================================================================

/**
 * Main explain command - routes to appropriate handler
 */
export async function explainCommand(
  runIdOrTraceId: string,
  stepId: string | undefined,
  options: ExplainOptions
): Promise<void> {
  // Route to local explain if --local flag is set (Epic J)
  if (options.local) {
    await localExplainCommand(runIdOrTraceId, {
      staged: options.staged,
      untracked: options.untracked,
      format: options.json ? 'json' : options.markdown ? 'markdown' : 'text',
      verbose: options.verbose,
      brief: options.brief,
    });
    return;
  }

  // If --trace is provided, use trace mode
  if (options.trace) {
    await explainTraceCommand(options.trace, options);
    return;
  }

  // If stepId is provided, explain specific step
  if (stepId) {
    await explainStepCommand(runIdOrTraceId, stepId, options);
    return;
  }

  // Otherwise, explain entire run
  await explainRunCommand(runIdOrTraceId, options);
}
