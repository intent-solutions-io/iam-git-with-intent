/**
 * gwi planner command
 *
 * Phase 26: LLM Planner Integration
 *
 * Generate a PatchPlan from an intent using LLM providers (Gemini/Claude).
 * Feature flag: GWI_PLANNER_ENABLED=1
 */

import chalk from 'chalk';
import {
  PlannerService,
  getPlannerService,
  getPlanGuard,
  type PlannerInput,
  type PatchPlan,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface PlannerCommandOptions {
  /** Provider to use (gemini/claude) */
  provider?: 'gemini' | 'claude';
  /** Specific model to use */
  model?: string;
  /** Output as JSON */
  json?: boolean;
  /** Save plan to file */
  output?: string;
  /** Skip PlanGuard validation */
  skipGuard?: boolean;
  /** Maximum risk level to allow */
  maxRisk?: 'low' | 'medium' | 'high' | 'critical';
  /** Verbose output */
  verbose?: boolean;
}

// =============================================================================
// Feature Gate
// =============================================================================

function checkFeatureEnabled(): boolean {
  if (!PlannerService.isEnabled()) {
    console.log();
    console.log(chalk.yellow('  LLM Planner is not enabled.'));
    console.log();
    console.log(chalk.dim('  To enable, set the feature flag:'));
    console.log(chalk.cyan('    export GWI_PLANNER_ENABLED=1'));
    console.log();
    console.log(chalk.dim('  Optional configuration:'));
    console.log(chalk.dim('    GWI_PLANNER_PROVIDER=gemini|claude'));
    console.log(chalk.dim('    GWI_PLANNER_MODEL=<model-name>'));
    console.log();
    return false;
  }
  return true;
}

// =============================================================================
// Generate Command
// =============================================================================

export async function plannerGenerateCommand(
  intent: string | undefined,
  options: PlannerCommandOptions
): Promise<void> {
  if (!checkFeatureEnabled()) {
    process.exit(1);
  }

  if (!intent) {
    console.log();
    console.log(chalk.red('  Error: Intent is required'));
    console.log();
    console.log(chalk.dim('  Usage:'));
    console.log(chalk.cyan('    gwi planner generate "Add user authentication to the API"'));
    console.log();
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold('  Generating PatchPlan...'));
  console.log();

  const provider = options.provider || PlannerService.getConfiguredProvider();
  const model = options.model || PlannerService.getConfiguredModel();

  if (options.verbose) {
    console.log(chalk.dim(`  Provider: ${provider}`));
    if (model) {
      console.log(chalk.dim(`  Model: ${model}`));
    }
    console.log();
  }

  try {
    const service = getPlannerService({
      provider,
      model,
    });

    const input: PlannerInput = {
      intent,
      sourceContext: {
        type: 'manual',
      },
    };

    const result = await service.plan(input);

    if (!result.success || !result.plan) {
      console.log(chalk.red('  Plan generation failed:'));
      console.log(chalk.red(`    ${result.error}`));
      console.log();
      process.exit(1);
    }

    // Run PlanGuard unless skipped
    if (!options.skipGuard) {
      console.log(chalk.dim('  Running PlanGuard checks...'));

      const guard = getPlanGuard({
        maxRiskLevel: options.maxRisk || 'high',
      });

      const guardResult = await guard.check(result.plan);

      if (!guardResult.allowed) {
        console.log();
        console.log(chalk.red('  PlanGuard blocked the plan:'));
        for (const violation of guardResult.violations) {
          console.log(chalk.red(`    - [${violation.category}] ${violation.message}`));
        }
        console.log();
        process.exit(1);
      }

      if (guardResult.warnings.length > 0) {
        console.log();
        console.log(chalk.yellow('  Warnings:'));
        for (const warning of guardResult.warnings) {
          console.log(chalk.yellow(`    - ${warning.message}`));
        }
      }

      console.log(chalk.green('  PlanGuard: PASSED'));
    }

    // Output
    if (options.json) {
      console.log(JSON.stringify(result.plan, null, 2));
    } else {
      printPlan(result.plan, options.verbose);
    }

    // Save to file
    if (options.output) {
      const fs = await import('node:fs');
      fs.writeFileSync(options.output, JSON.stringify(result.plan, null, 2));
      console.log();
      console.log(chalk.green(`  Plan saved to: ${options.output}`));
    }

    console.log();
    console.log(chalk.dim(`  Duration: ${result.durationMs}ms`));
    console.log(chalk.dim(`  Provider: ${result.provider}/${result.model}`));
    if (result.usedFallback) {
      console.log(chalk.yellow('  (Used fallback provider)'));
    }
    console.log();
  } catch (error) {
    console.log();
    console.log(chalk.red('  Error:'));
    console.log(chalk.red(`    ${(error as Error).message}`));
    console.log();
    process.exit(1);
  }
}

// =============================================================================
// Validate Command
// =============================================================================

export async function plannerValidateCommand(
  planFile: string | undefined,
  options: PlannerCommandOptions
): Promise<void> {
  if (!checkFeatureEnabled()) {
    process.exit(1);
  }

  if (!planFile) {
    console.log();
    console.log(chalk.red('  Error: Plan file path is required'));
    console.log();
    console.log(chalk.dim('  Usage:'));
    console.log(chalk.cyan('    gwi planner validate plan.json'));
    console.log();
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold('  Validating PatchPlan...'));
  console.log();

  try {
    const fs = await import('node:fs');

    if (!fs.existsSync(planFile)) {
      console.log(chalk.red(`  File not found: ${planFile}`));
      process.exit(1);
    }

    const content = fs.readFileSync(planFile, 'utf-8');
    const plan = JSON.parse(content) as PatchPlan;

    const guard = getPlanGuard({
      maxRiskLevel: options.maxRisk || 'high',
    });

    const result = await guard.check(plan);

    if (result.allowed) {
      console.log(chalk.green('  Validation: PASSED'));
      console.log();

      if (result.warnings.length > 0) {
        console.log(chalk.yellow('  Warnings:'));
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`    - ${warning.message}`));
        }
        console.log();
      }

      if (options.verbose) {
        console.log(chalk.dim(`  Duration: ${result.durationMs}ms`));
      }
    } else {
      console.log(chalk.red('  Validation: FAILED'));
      console.log();

      for (const violation of result.violations) {
        console.log(chalk.red(`  - [${violation.category}] ${violation.message}`));
        if (violation.file) {
          console.log(chalk.dim(`      File: ${violation.file}`));
        }
      }
      console.log();
      process.exit(1);
    }
  } catch (error) {
    console.log();
    console.log(chalk.red('  Error:'));
    console.log(chalk.red(`    ${(error as Error).message}`));
    console.log();
    process.exit(1);
  }
}

// =============================================================================
// Status Command
// =============================================================================

export async function plannerStatusCommand(): Promise<void> {
  console.log();
  console.log(chalk.bold('  LLM Planner Status'));
  console.log();

  const enabled = PlannerService.isEnabled();
  const statusIcon = enabled ? chalk.green('✓') : chalk.red('✗');
  console.log(`  ${statusIcon} Feature enabled: ${enabled}`);

  if (enabled) {
    const provider = PlannerService.getConfiguredProvider();
    const model = PlannerService.getConfiguredModel();

    console.log(chalk.dim(`    Provider: ${provider}`));
    if (model) {
      console.log(chalk.dim(`    Model: ${model}`));
    }

    // Check API key availability
    const hasGeminiKey = !!process.env.GOOGLE_AI_API_KEY;
    const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;

    console.log();
    console.log('  API Keys:');
    console.log(
      `    ${hasGeminiKey ? chalk.green('✓') : chalk.red('✗')} GOOGLE_AI_API_KEY`
    );
    console.log(
      `    ${hasClaudeKey ? chalk.green('✓') : chalk.red('✗')} ANTHROPIC_API_KEY`
    );
  }

  console.log();
  console.log(chalk.dim('  Configuration:'));
  console.log(chalk.dim('    GWI_PLANNER_ENABLED=1       Enable planner'));
  console.log(chalk.dim('    GWI_PLANNER_PROVIDER=gemini Provider (gemini/claude)'));
  console.log(chalk.dim('    GWI_PLANNER_MODEL=<name>    Specific model'));
  console.log();
}

// =============================================================================
// Helper: Print Plan
// =============================================================================

function printPlan(plan: PatchPlan, verbose?: boolean): void {
  console.log();
  console.log(chalk.bold('  Plan Summary'));
  console.log(chalk.dim(`  ID: ${plan.plan_id}`));
  console.log();
  console.log(`  ${chalk.cyan('Intent:')} ${plan.intent_summary}`);
  console.log();

  // Risk
  const riskColor =
    plan.risk.overall === 'critical'
      ? chalk.red
      : plan.risk.overall === 'high'
        ? chalk.yellow
        : chalk.green;
  console.log(`  ${chalk.cyan('Risk:')} ${riskColor(plan.risk.overall.toUpperCase())}`);

  // Files
  console.log();
  console.log(chalk.cyan(`  Files (${plan.files.length}):`));
  for (const file of plan.files.slice(0, 10)) {
    const actionIcon =
      file.action === 'create'
        ? chalk.green('+')
        : file.action === 'delete'
          ? chalk.red('-')
          : chalk.yellow('~');
    console.log(`    ${actionIcon} ${file.path}`);
    if (verbose) {
      console.log(chalk.dim(`        ${file.reason}`));
    }
  }
  if (plan.files.length > 10) {
    console.log(chalk.dim(`    ... and ${plan.files.length - 10} more`));
  }

  // Steps
  console.log();
  console.log(chalk.cyan(`  Steps (${plan.steps.length}):`));
  for (const step of plan.steps.slice(0, 5)) {
    console.log(`    ${step.order}. ${step.name}`);
    if (verbose) {
      console.log(chalk.dim(`        ${step.description}`));
    }
  }
  if (plan.steps.length > 5) {
    console.log(chalk.dim(`    ... and ${plan.steps.length - 5} more`));
  }

  // Tests
  console.log();
  console.log(chalk.cyan(`  Tests (${plan.tests.length}):`));
  for (const test of plan.tests.slice(0, 3)) {
    console.log(`    - ${test.name} (${test.type})`);
  }
  if (plan.tests.length > 3) {
    console.log(chalk.dim(`    ... and ${plan.tests.length - 3} more`));
  }

  // Acceptance criteria
  console.log();
  console.log(chalk.cyan('  Acceptance Criteria:'));
  for (const criterion of plan.acceptance_criteria.slice(0, 3)) {
    console.log(`    - ${criterion}`);
  }
  if (plan.acceptance_criteria.length > 3) {
    console.log(chalk.dim(`    ... and ${plan.acceptance_criteria.length - 3} more`));
  }
}
