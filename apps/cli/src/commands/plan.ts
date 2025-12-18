/**
 * gwi plan command
 *
 * Generate a resolution plan for PR conflicts.
 *
 * NOTE: This command is being updated to use the new workflow system.
 * Phase 14: Redirect to triage command pending full CLI refactor.
 */

import chalk from 'chalk';

export interface PlanOptions {
  verbose?: boolean;
  json?: boolean;
  save?: boolean;
}

export async function planCommand(
  prUrl: string | undefined,
  _options: PlanOptions
): Promise<void> {
  console.log();
  console.log(chalk.yellow('  The plan command is being integrated into the workflow system.'));
  console.log();
  console.log(chalk.bold('  Current alternatives:'));
  console.log();

  if (prUrl) {
    console.log(chalk.dim('  Analyze PR complexity:'));
    console.log(chalk.cyan(`    gwi triage ${prUrl}`));
    console.log();
    console.log(chalk.dim('  Start a resolution workflow:'));
    console.log(chalk.cyan(`    gwi workflow start pr-resolve --pr-url ${prUrl}`));
  } else {
    console.log(chalk.dim('  Analyze PR complexity:'));
    console.log(chalk.cyan('    gwi triage <pr-url>'));
    console.log();
    console.log(chalk.dim('  Start a resolution workflow:'));
    console.log(chalk.cyan('    gwi workflow start pr-resolve --pr-url <url>'));
  }

  console.log();
  console.log(chalk.dim('  The triage command shows:'));
  console.log(chalk.dim('    - Complexity analysis per file'));
  console.log(chalk.dim('    - Risk assessment'));
  console.log(chalk.dim('    - Recommended resolution strategy'));
  console.log();
}
