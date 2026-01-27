/**
 * gwi review command
 *
 * Review code changes before committing or merging.
 *
 * Modes:
 *   --local : Review local git changes (staged/unstaged)
 *   [pr-url]: Review PR (redirects to workflow system)
 */

import chalk from 'chalk';
import { localReviewCommand, type LocalReviewOptions } from './local-review.js';

export interface ReviewOptions extends LocalReviewOptions {
  verbose?: boolean;
  json?: boolean;
  file?: string;
  approve?: boolean;
  reject?: boolean;
  /** Local review mode (Epic J) */
  local?: boolean;
  /** Markdown output */
  markdown?: boolean;
  /** Use AI-powered review */
  ai?: boolean;
}

export async function reviewCommand(
  prUrlOrRef: string | undefined,
  options: ReviewOptions
): Promise<void> {
  // Route to local review if --local flag is set
  if (options.local) {
    await localReviewCommand(prUrlOrRef, {
      all: options.all,
      untracked: options.untracked,
      format: options.json ? 'json' : options.markdown ? 'markdown' : 'text',
      verbose: options.verbose,
      brief: options.brief,
      scoreOnly: options.scoreOnly,
      maxComplexity: options.maxComplexity,
      blockSecurity: options.blockSecurity,
      cwd: options.cwd,
      ai: options.ai,
    });
    return;
  }

  // Original behavior: redirect to workflow system for PR review
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
    console.log(chalk.bold('  Use the workflow command for PR reviews:'));
    console.log();
    if (prUrlOrRef) {
      console.log(chalk.cyan(`    gwi workflow start pr-review --pr-url ${prUrlOrRef}`));
    } else {
      console.log(chalk.cyan('    gwi workflow start pr-review --pr-url <url>'));
    }
    console.log();
    console.log(chalk.bold('  Or use local review for uncommitted changes:'));
    console.log(chalk.cyan('    gwi review --local           # Review staged changes'));
    console.log(chalk.cyan('    gwi review --local --all     # Review all uncommitted'));
    console.log(chalk.cyan('    gwi review --local HEAD~1    # Review since commit'));
  }

  console.log();
  console.log(chalk.dim('  To check pending approvals:'));
  console.log(chalk.cyan('    gwi workflow list'));
  console.log();
}
