/**
 * gwi review command
 *
 * Review AI-generated resolutions before applying them.
 *
 * NOTE: This command is being updated to use the new workflow system.
 * Phase 14: Redirect to workflow command pending full CLI refactor.
 */

import chalk from 'chalk';

export interface ReviewOptions {
  verbose?: boolean;
  json?: boolean;
  file?: string;
  approve?: boolean;
  reject?: boolean;
}

export async function reviewCommand(
  prUrl: string | undefined,
  options: ReviewOptions
): Promise<void> {
  console.log();
  console.log(chalk.yellow('  The review command is being migrated to the workflow system.'));
  console.log();

  // If approve/reject flags are set, show workflow approve/reject
  if (options.approve || options.reject) {
    console.log(chalk.bold('  Use workflow approve/reject instead:'));
    console.log();
    console.log(chalk.dim('  Approve a workflow:'));
    console.log(chalk.cyan('    gwi workflow approve <workflow-id>'));
    console.log();
    console.log(chalk.dim('  Reject a workflow:'));
    console.log(chalk.cyan('    gwi workflow reject <workflow-id> --reason "reason"'));
  } else {
    console.log(chalk.bold('  Use the workflow command for reviews:'));
    console.log();
    if (prUrl) {
      console.log(chalk.cyan(`    gwi workflow start pr-review --pr-url ${prUrl}`));
    } else {
      console.log(chalk.cyan('    gwi workflow start pr-review --pr-url <url>'));
    }
  }

  console.log();
  console.log(chalk.dim('  To check pending approvals:'));
  console.log(chalk.cyan('    gwi workflow list'));
  console.log();
}
