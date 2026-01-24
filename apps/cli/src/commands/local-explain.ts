/**
 * Local Explain Command (Epic J)
 *
 * "What changed and why?" for local changes.
 * Provides human-readable summaries of changes.
 *
 * Usage:
 *   gwi explain .            Explain all local changes
 *   gwi explain --staged     Explain staged changes only
 *   gwi explain HEAD~1       Explain since specific commit
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  readStagedChanges,
  readAllChanges,
  readCommitChanges,
  getChangeSummary,
  isGitRepository,
  analyzeDiff,
  explainChanges,
  quickExplain,
  formatExplanation,
  type LocalChanges,
  type ExplainFormat,
  type ExplainVerbosity,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface LocalExplainOptions {
  /** Explain only staged changes */
  staged?: boolean;
  /** Include untracked files */
  untracked?: boolean;
  /** Output format */
  format?: 'text' | 'json' | 'markdown';
  /** Verbose output */
  verbose?: boolean;
  /** Brief output */
  brief?: boolean;
  /** Working directory */
  cwd?: string;
}

// =============================================================================
// Main Command
// =============================================================================

/**
 * Explain local changes
 */
export async function localExplainCommand(
  refOrPath: string | undefined,
  options: LocalExplainOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.format === 'json' });
  const cwd = options.cwd ?? process.cwd();

  try {
    // Verify git repository
    if (!isGitRepository(cwd)) {
      console.error(chalk.red('Error: Not a git repository'));
      process.exit(1);
    }

    // Quick check
    const summary = getChangeSummary(cwd);
    if (!summary.hasChanges && !refOrPath) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ status: 'clean', message: 'No changes to explain' }));
      } else {
        console.log(chalk.green('\n  No changes to explain.\n'));
      }
      return;
    }

    spinner.start('Analyzing changes...');

    // Determine what to analyze
    let changes: LocalChanges;

    if (refOrPath && refOrPath !== '.') {
      // Explain since specific commit
      changes = await readCommitChanges(refOrPath, {
        cwd,
        includeUntracked: options.untracked,
      });
    } else if (options.staged) {
      // Staged only
      changes = await readStagedChanges({ cwd });
    } else {
      // All uncommitted changes
      changes = await readAllChanges({
        cwd,
        includeUntracked: options.untracked ?? true,
      });
    }

    if (changes.files.length === 0) {
      spinner.succeed('No changes to explain');
      if (options.format !== 'json') {
        console.log(chalk.dim('\n  Tip: Make some changes or specify a commit ref.\n'));
      }
      return;
    }

    // Analyze and explain
    const analysis = await analyzeDiff(changes);
    const explanation = explainChanges(analysis);

    spinner.succeed(`Analyzed ${changes.files.length} file(s)`);

    // Output
    const format: ExplainFormat = options.format ?? 'text';
    const verbosity: ExplainVerbosity = options.brief ? 'brief' : options.verbose ? 'detailed' : 'normal';

    if (format === 'json') {
      console.log(JSON.stringify(explanation, null, 2));
    } else {
      console.log(formatExplanation(explanation, format, verbosity));
    }
  } catch (error) {
    spinner.fail('Explain failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Quick one-line explain
 */
export async function quickLocalExplainCommand(
  refOrPath: string | undefined,
  options: LocalExplainOptions
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  try {
    if (!isGitRepository(cwd)) {
      console.error(chalk.red('Error: Not a git repository'));
      process.exit(1);
    }

    let changes: LocalChanges;

    if (refOrPath && refOrPath !== '.') {
      changes = await readCommitChanges(refOrPath, { cwd });
    } else if (options.staged) {
      changes = await readStagedChanges({ cwd });
    } else {
      changes = await readAllChanges({ cwd, includeUntracked: true });
    }

    const summary = quickExplain(changes);
    console.log(summary);
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

export { localExplainCommand as explainLocalCommand };
