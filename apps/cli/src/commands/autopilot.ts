/**
 * gwi autopilot command
 *
 * Fully automated PR conflict resolution pipeline.
 *
 * NOTE: This command is being updated to use the new workflow system.
 * Phase 14: Redirect to workflow command pending full CLI refactor.
 */

import chalk from 'chalk';

export interface AutopilotOptions {
  verbose?: boolean;
  json?: boolean;
  dryRun?: boolean;
  skipReview?: boolean;
  maxComplexity?: number;
  yes?: boolean;
}

export async function autopilotCommand(
  prUrl: string | undefined,
  _options: AutopilotOptions
): Promise<void> {
  console.log();
  console.log(chalk.yellow('  The autopilot command is being migrated to the workflow system.'));
  console.log();
  console.log(chalk.bold('  Use the workflow command instead:'));
  console.log();

  if (prUrl) {
    console.log(chalk.cyan(`    gwi workflow start pr-resolve --pr-url ${prUrl}`));
  } else {
    console.log(chalk.cyan('    gwi workflow start pr-resolve --pr-url <url>'));
  }

  console.log();
  console.log(chalk.dim('  The workflow command provides:'));
  console.log(chalk.dim('    - Multi-agent orchestration (Triage → Resolver → Reviewer)'));
  console.log(chalk.dim('    - Status tracking and progress monitoring'));
  console.log(chalk.dim('    - Human-in-the-loop approval'));
  console.log();
  console.log(chalk.dim('  Other workflow types available:'));
  console.log(chalk.dim('    gwi workflow start issue-to-code --issue-url <url>'));
  console.log(chalk.dim('    gwi workflow start pr-review --pr-url <url>'));
  console.log();
}
