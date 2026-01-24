/**
 * Local Triage Command (Epic J)
 *
 * Score local commit complexity without requiring a PR.
 * Quick analysis of changes for pre-commit review.
 *
 * Usage:
 *   gwi triage --diff          Score staged changes
 *   gwi triage --diff HEAD~1   Score since specific commit
 *   gwi triage --diff HEAD~3   Score last 3 commits
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  readStagedChanges,
  readAllChanges,
  readCommitChanges,
  getChangeSummary,
  isGitRepository,
  scoreLocalChanges,
  triageLocalChanges,
  type LocalChanges,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface LocalTriageOptions {
  /** Include all uncommitted changes */
  all?: boolean;
  /** Include untracked files */
  untracked?: boolean;
  /** JSON output */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Working directory */
  cwd?: string;
  /** Maximum complexity threshold */
  maxComplexity?: number;
}

export interface LocalTriageResult {
  branch: string;
  commit: string;
  type: string;
  files: number;
  additions: number;
  deletions: number;
  score: number;
  riskLevel: string;
  route: 'ready' | 'review' | 'split';
  reasons: string[];
  readyForCommit: boolean;
  recommendation: string;
}

// =============================================================================
// Main Command
// =============================================================================

/**
 * Triage local changes
 */
export async function localTriageCommand(
  ref: string | undefined,
  options: LocalTriageOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });
  const cwd = options.cwd ?? process.cwd();

  try {
    // Verify git repository
    if (!isGitRepository(cwd)) {
      console.error(chalk.red('Error: Not a git repository'));
      process.exit(1);
    }

    // Quick check
    const summary = getChangeSummary(cwd);
    if (!summary.hasChanges && !ref) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'clean', message: 'No changes to triage' }));
      } else {
        console.log(chalk.green('\n  No changes to triage.\n'));
      }
      return;
    }

    spinner.start('Analyzing changes...');

    // Read changes
    let changes: LocalChanges;

    if (ref) {
      changes = await readCommitChanges(ref, {
        cwd,
        includeUntracked: options.untracked,
      });
    } else if (options.all) {
      changes = await readAllChanges({
        cwd,
        includeUntracked: options.untracked,
      });
    } else {
      changes = await readStagedChanges({ cwd });

      // Fall back to all if no staged
      if (changes.files.length === 0) {
        changes = await readAllChanges({
          cwd,
          includeUntracked: options.untracked,
        });
      }
    }

    if (changes.files.length === 0) {
      spinner.succeed('No changes to triage');
      return;
    }

    // Score the changes
    const scoreResult = scoreLocalChanges(changes);
    const triage = triageLocalChanges(scoreResult, {
      maxComplexity: options.maxComplexity ?? 8,
    });

    spinner.succeed(`Triaged ${changes.files.length} file(s)`);

    // Determine route recommendation
    const route: 'ready' | 'review' | 'split' =
      scoreResult.score <= 3 ? 'ready' :
      scoreResult.score <= 7 ? 'review' : 'split';

    const recommendation =
      route === 'ready' ? 'Simple changes - ready for commit' :
      route === 'review' ? 'Consider peer review before committing' :
      'Consider splitting into smaller commits';

    const result: LocalTriageResult = {
      branch: changes.branch,
      commit: changes.headCommit.substring(0, 7),
      type: changes.type,
      files: changes.files.length,
      additions: changes.totalAdditions,
      deletions: changes.totalDeletions,
      score: scoreResult.score,
      riskLevel: scoreResult.riskLevel,
      route,
      reasons: scoreResult.reasons,
      readyForCommit: triage.readyForCommit,
      recommendation,
    };

    // Output
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTriageResult(result, options);
    }

    // Exit with error if not ready
    if (!triage.readyForCommit && triage.blockers.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Triage failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Output
// =============================================================================

function printTriageResult(result: LocalTriageResult, options: LocalTriageOptions): void {
  console.log();

  // Header
  console.log(chalk.bold('  Local Change Triage'));
  console.log(chalk.dim(`  ${result.branch} @ ${result.commit} (${result.type})`));
  console.log();

  // Score
  const scoreColor = result.score <= 3 ? chalk.green :
    result.score <= 6 ? chalk.yellow : chalk.red;
  const routeColor = result.route === 'ready' ? chalk.green :
    result.route === 'review' ? chalk.yellow : chalk.red;

  console.log(chalk.bold('  Analysis:'));
  console.log(`    Files:       ${result.files}`);
  console.log(`    Lines:       ${chalk.green(`+${result.additions}`)} ${chalk.red(`-${result.deletions}`)}`);
  console.log(`    Complexity:  ${scoreColor(`${result.score}/10`)}`);
  console.log(`    Risk:        ${result.riskLevel.toUpperCase()}`);
  console.log(`    Route:       ${routeColor(formatRoute(result.route))}`);
  console.log();

  // Reasons (if verbose)
  if (options.verbose && result.reasons.length > 0) {
    console.log(chalk.bold('  Factors:'));
    for (const reason of result.reasons) {
      console.log(`    - ${formatReason(reason)}`);
    }
    console.log();
  }

  // Recommendation
  console.log(chalk.bold('  Recommendation:'));
  console.log(`    ${result.recommendation}`);
  console.log();

  // Status
  if (result.readyForCommit) {
    console.log(chalk.green('  ✓ Ready for commit'));
  } else {
    console.log(chalk.yellow('  ⚠ Review recommended before commit'));
  }
  console.log();

  // Next steps
  console.log(chalk.dim('  Next steps:'));
  if (result.route === 'ready') {
    console.log(chalk.dim('    git commit -m "your message"'));
  } else if (result.route === 'review') {
    console.log(chalk.dim('    gwi review --local -v         # Detailed review'));
    console.log(chalk.dim('    git commit -m "your message"  # Then commit'));
  } else {
    console.log(chalk.dim('    git add -p                    # Stage changes selectively'));
    console.log(chalk.dim('    gwi triage --diff             # Re-triage smaller set'));
  }
  console.log();
}

function formatRoute(route: string): string {
  switch (route) {
    case 'ready': return 'Ready (simple)';
    case 'review': return 'Review (moderate)';
    case 'split': return 'Split (complex)';
    default: return route;
  }
}

function formatReason(reason: string): string {
  const labels: Record<string, string> = {
    small_change: 'Small change set',
    medium_change: 'Medium change set',
    large_change: 'Large change set',
    many_files: 'Many files affected',
    scattered_changes: 'Scattered changes across files',
    high_churn: 'High churn (refactoring)',
    api_change: 'API changes detected',
    security_sensitive: 'Security-sensitive files',
    config_change: 'Configuration changes',
    infra_change: 'Infrastructure changes',
    dependency_change: 'Dependency updates',
    test_only: 'Test-only changes',
    docs_only: 'Documentation-only changes',
    types_only: 'Type definitions only',
  };
  return labels[reason] ?? reason;
}

export { localTriageCommand as triageLocalCommand };
