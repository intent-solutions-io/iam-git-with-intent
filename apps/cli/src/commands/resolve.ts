/**
 * gwi resolve command
 *
 * Full pipeline for resolving merge conflicts with interactive approval.
 *
 * NOTE: This command is being updated to use the new workflow system.
 * Phase 14: Redirect to workflow command pending full CLI refactor.
 */

import chalk from 'chalk';

export interface ResolveOptions {
  dryRun?: boolean;
  verbose?: boolean;
  approval?: boolean;
}

export async function resolveCommand(
  prUrl: string,
  _options: ResolveOptions
): Promise<void> {
  console.log();
  console.log(chalk.yellow('  The resolve command is being migrated to the workflow system.'));
  console.log();
  console.log(chalk.bold('  Use the workflow command instead:'));
  console.log();
  console.log(chalk.cyan(`    gwi workflow start pr-resolve --pr-url ${prUrl}`));
  console.log();
  console.log(chalk.dim('  The workflow command provides:'));
  console.log(chalk.dim('    - Triage → Resolver → Reviewer pipeline'));
  console.log(chalk.dim('    - Status tracking with `gwi workflow status <id>`'));
  console.log(chalk.dim('    - Human approval with `gwi workflow approve <id>`'));
  console.log();
  console.log(chalk.dim('  To check workflow status:'));
  console.log(chalk.cyan('    gwi workflow list'));
  console.log();
}
