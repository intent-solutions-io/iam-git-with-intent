/**
 * Local Review Command (Epic J)
 *
 * Review local git changes without requiring a PR.
 * Works with staged, unstaged, and commit-based diffs.
 *
 * Usage:
 *   gwi review --local           Review staged changes
 *   gwi review --local --all     Review all uncommitted changes
 *   gwi review --local HEAD~1    Review since specific commit
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  // Change reader
  readStagedChanges,
  readUnstagedChanges,
  readAllChanges,
  readCommitChanges,
  getChangeSummary,
  isGitRepository,
  // Diff analyzer
  analyzeDiff,
  // Explainer
  explainChanges,
  formatExplanationMarkdown,
  // Scorer
  scoreLocalChanges,
  triageLocalChanges,
  type LocalChanges,
  type DiffAnalysis,
  type LocalScoreResult,
  type LocalTriageResult,
} from '@gwi/core';
import { createReviewerAgent, type LocalDiffReviewInput } from '@gwi/agents';

// =============================================================================
// Types
// =============================================================================

export interface LocalReviewOptions {
  /** Review all uncommitted changes (staged + unstaged) */
  all?: boolean;
  /** Include untracked files */
  untracked?: boolean;
  /** Output format */
  format?: 'text' | 'json' | 'markdown';
  /** Verbosity level */
  verbose?: boolean;
  /** Brief output */
  brief?: boolean;
  /** Show only score without details */
  scoreOnly?: boolean;
  /** Maximum complexity threshold (fails if exceeded) */
  maxComplexity?: number;
  /** Block security-sensitive changes */
  blockSecurity?: boolean;
  /** Working directory */
  cwd?: string;
  /** Use AI-powered review (ReviewerAgent) */
  ai?: boolean;
}

export interface LocalReviewResult {
  changes: LocalChanges;
  analysis: DiffAnalysis;
  score: LocalScoreResult;
  triage: LocalTriageResult;
  aiReview?: {
    approved: boolean;
    confidence: number;
    securityIssues: string[];
    suggestions: string[];
    syntaxValid: boolean;
  };
}

// =============================================================================
// AI Review Helper
// =============================================================================

/**
 * Perform AI-powered review using ReviewerAgent
 */
async function performAIReview(changes: LocalChanges): Promise<LocalReviewResult['aiReview']> {
  const reviewer = createReviewerAgent();
  await reviewer.initialize();

  try {
    const input: LocalDiffReviewInput = {
      diff: changes.combinedDiff,
      files: changes.files.map(f => ({
        path: f.path,
        status: f.status as 'added' | 'modified' | 'deleted' | 'renamed',
        additions: f.additions,
        deletions: f.deletions,
      })),
      context: {
        branch: changes.branch,
        commitRef: changes.ref,
      },
      workflowType: 'local-review',
    };

    const result = await reviewer.reviewLocalDiff(input);

    return {
      approved: result.review.approved,
      confidence: result.review.confidence,
      securityIssues: result.review.securityIssues,
      suggestions: result.review.suggestions,
      syntaxValid: result.review.syntaxValid,
    };
  } finally {
    await reviewer.shutdown();
  }
}

// =============================================================================
// Main Command
// =============================================================================

/**
 * Review local changes
 */
export async function localReviewCommand(
  ref: string | undefined,
  options: LocalReviewOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.format === 'json' });
  const cwd = options.cwd ?? process.cwd();

  try {
    // Verify we're in a git repository
    if (!isGitRepository(cwd)) {
      console.error(chalk.red('Error: Not a git repository'));
      process.exit(1);
    }

    // Quick check for changes
    const summary = getChangeSummary(cwd);
    if (!summary.hasChanges && !ref) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ status: 'clean', message: 'No changes to review' }));
      } else {
        console.log(chalk.green('\n  No changes to review.\n'));
      }
      return;
    }

    spinner.start('Reading local changes...');

    // Read changes based on options
    let changes: LocalChanges;

    if (ref) {
      // Review since specific commit
      changes = await readCommitChanges(ref, {
        cwd,
        includeUntracked: options.untracked,
      });
    } else if (options.all) {
      // Review all uncommitted changes
      changes = await readAllChanges({
        cwd,
        includeUntracked: options.untracked,
      });
    } else {
      // Default: review staged changes
      changes = await readStagedChanges({ cwd });

      // If no staged changes, show unstaged
      if (changes.files.length === 0) {
        const unstaged = await readUnstagedChanges({
          cwd,
          includeUntracked: options.untracked,
        });
        if (unstaged.files.length > 0) {
          spinner.info('No staged changes. Reviewing unstaged changes instead.');
          changes = unstaged;
        }
      }
    }

    if (changes.files.length === 0) {
      spinner.succeed('No changes to review');
      if (options.format !== 'json') {
        console.log(chalk.dim('\n  Tip: Stage changes with `git add` or use --all for all changes.\n'));
      }
      return;
    }

    spinner.text = `Analyzing ${changes.files.length} file(s)...`;

    // Analyze the changes
    const analysis = await analyzeDiff(changes);
    const score = scoreLocalChanges(changes);
    const triage = triageLocalChanges(score, {
      maxComplexity: options.maxComplexity,
      blockSecurityChanges: options.blockSecurity,
    });

    spinner.succeed(`Analyzed ${changes.files.length} file(s)`);

    // Optional AI-powered review
    let aiReview: LocalReviewResult['aiReview'] | undefined;
    if (options.ai) {
      try {
        spinner.start('Running AI review...');
        aiReview = await performAIReview(changes);
        spinner.succeed('AI review complete');
      } catch (error) {
        spinner.warn('AI review failed');
        if (options.verbose) {
          console.error(chalk.yellow(`AI review error: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    }

    // Output results
    const result: LocalReviewResult = { changes, analysis, score, triage, aiReview };

    if (options.format === 'json') {
      outputJson(result);
    } else if (options.format === 'markdown') {
      outputMarkdown(result, options);
    } else {
      outputText(result, options);
    }

    // Exit with error if triage failed
    if (!triage.readyForCommit && triage.blockers.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Review failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Output Formatters
// =============================================================================

function outputJson(result: LocalReviewResult): void {
  console.log(JSON.stringify({
    branch: result.changes.branch,
    commit: result.changes.headCommit.substring(0, 7),
    type: result.changes.type,
    files: result.changes.files.length,
    additions: result.changes.totalAdditions,
    deletions: result.changes.totalDeletions,
    score: result.score.score,
    riskLevel: result.score.riskLevel,
    reasons: result.score.reasons,
    readyForCommit: result.triage.readyForCommit,
    blockers: result.triage.blockers,
    warnings: result.triage.warnings,
    recommendations: result.triage.recommendations,
    fileAnalysis: result.analysis.files.map(f => ({
      path: f.path,
      category: f.category,
      risk: f.riskLevel,
      complexity: f.complexity,
      additions: f.additions,
      deletions: f.deletions,
      suggestions: f.suggestions,
    })),
    aiReview: result.aiReview,
  }, null, 2));
}

function outputMarkdown(result: LocalReviewResult, options: LocalReviewOptions): void {
  const explanation = explainChanges(result.analysis);
  const verbosity = options.brief ? 'brief' : options.verbose ? 'detailed' : 'normal';
  console.log(formatExplanationMarkdown(explanation, verbosity));
}

function outputText(result: LocalReviewResult, options: LocalReviewOptions): void {
  const { changes, analysis, score, triage } = result;

  console.log();

  // Header
  const typeLabel = changes.type === 'staged' ? 'Staged' :
    changes.type === 'unstaged' ? 'Unstaged' :
    changes.type === 'all' ? 'All' : 'Commit';
  console.log(chalk.bold(`  ${typeLabel} Changes Review`));
  console.log(chalk.dim(`  Branch: ${changes.branch} @ ${changes.headCommit.substring(0, 7)}`));
  console.log();

  // Quick score
  const scoreColor = score.score <= 3 ? chalk.green :
    score.score <= 6 ? chalk.yellow : chalk.red;
  const riskColor = score.riskLevel === 'low' ? chalk.green :
    score.riskLevel === 'medium' ? chalk.yellow :
    score.riskLevel === 'high' ? chalk.red : chalk.red.bold;

  console.log(chalk.bold('  Summary:'));
  console.log(`    Files:       ${changes.files.length}`);
  console.log(`    Lines:       ${chalk.green(`+${changes.totalAdditions}`)} ${chalk.red(`-${changes.totalDeletions}`)}`);
  console.log(`    Complexity:  ${scoreColor(`${score.score}/10`)}`);
  console.log(`    Risk:        ${riskColor(score.riskLevel.toUpperCase())}`);
  console.log();

  // Score-only mode
  if (options.scoreOnly) {
    if (triage.readyForCommit) {
      console.log(chalk.green('  ✓ Ready for commit'));
    } else {
      console.log(chalk.red('  ✗ Not ready for commit'));
      for (const blocker of triage.blockers) {
        console.log(chalk.red(`    - ${blocker}`));
      }
    }
    console.log();
    return;
  }

  // Brief mode
  if (options.brief) {
    console.log(`  ${score.summary}`);
    console.log();
    return;
  }

  // Files
  console.log(chalk.bold('  Files:'));
  const maxFiles = options.verbose ? analysis.files.length : 10;
  for (let i = 0; i < Math.min(maxFiles, analysis.files.length); i++) {
    const file = analysis.files[i];
    const riskIcon = file.riskLevel === 'low' ? chalk.green('●') :
      file.riskLevel === 'medium' ? chalk.yellow('●') :
      file.riskLevel === 'high' ? chalk.red('●') : chalk.red.bold('●');
    const categoryLabel = chalk.dim(`[${file.category}]`);

    console.log(`    ${riskIcon} ${file.path} ${categoryLabel}`);

    if (options.verbose && file.suggestions.length > 0) {
      for (const suggestion of file.suggestions) {
        console.log(chalk.dim(`      → ${suggestion}`));
      }
    }
  }
  if (analysis.files.length > maxFiles) {
    console.log(chalk.dim(`    ... and ${analysis.files.length - maxFiles} more`));
  }
  console.log();

  // Patterns
  const significantPatterns = analysis.patterns.filter(p => p.severity !== 'info');
  if (significantPatterns.length > 0) {
    console.log(chalk.bold('  Patterns:'));
    for (const pattern of significantPatterns) {
      const icon = pattern.severity === 'error' ? chalk.red('!') : chalk.yellow('*');
      console.log(`    ${icon} ${pattern.description}`);
    }
    console.log();
  }

  // Blockers
  if (triage.blockers.length > 0) {
    console.log(chalk.red.bold('  Blockers:'));
    for (const blocker of triage.blockers) {
      console.log(chalk.red(`    ✗ ${blocker}`));
    }
    console.log();
  }

  // Warnings
  if (triage.warnings.length > 0) {
    console.log(chalk.yellow.bold('  Warnings:'));
    for (const warning of triage.warnings) {
      console.log(chalk.yellow(`    ⚠ ${warning}`));
    }
    console.log();
  }

  // Recommendations
  if (options.verbose && triage.recommendations.length > 0) {
    console.log(chalk.bold('  Recommendations:'));
    for (const rec of triage.recommendations) {
      console.log(`    - ${rec}`);
    }
    console.log();
  }

  // AI Review (if available)
  if (result.aiReview) {
    console.log(chalk.bold('  AI Review:'));
    const aiApprovalIcon = result.aiReview.approved ? chalk.green('✓') : chalk.red('✗');
    const aiConfidenceColor = result.aiReview.confidence >= 80 ? chalk.green :
      result.aiReview.confidence >= 60 ? chalk.yellow : chalk.red;
    console.log(`    ${aiApprovalIcon} ${result.aiReview.approved ? 'Approved' : 'Not approved'} (confidence: ${aiConfidenceColor(`${result.aiReview.confidence}%`)})`);

    if (result.aiReview.securityIssues.length > 0) {
      console.log(chalk.red.bold('    Security Issues:'));
      for (const issue of result.aiReview.securityIssues) {
        console.log(chalk.red(`      - ${issue}`));
      }
    }

    if (result.aiReview.suggestions.length > 0 && options.verbose) {
      console.log(chalk.bold('    AI Suggestions:'));
      for (const suggestion of result.aiReview.suggestions.slice(0, 5)) {
        console.log(`      - ${suggestion}`);
      }
      if (result.aiReview.suggestions.length > 5) {
        console.log(chalk.dim(`      ... and ${result.aiReview.suggestions.length - 5} more`));
      }
    }
    console.log();
  }

  // Status
  if (triage.readyForCommit && (!result.aiReview || result.aiReview.approved)) {
    console.log(chalk.green('  ✓ Ready for commit'));
  } else {
    console.log(chalk.red('  ✗ Not ready for commit'));
  }
  console.log();

  // Next steps
  if (!options.brief) {
    console.log(chalk.dim('  Next steps:'));
    if (changes.type === 'staged') {
      console.log(chalk.dim('    git commit -m "your message"'));
    } else if (changes.type === 'unstaged') {
      console.log(chalk.dim('    git add <files>                  # Stage changes'));
      console.log(chalk.dim('    gwi review --local               # Review staged'));
    } else {
      console.log(chalk.dim('    gwi gate                         # Pre-commit gate'));
    }
    console.log();
  }
}

// =============================================================================
// Export for use in main review command
// =============================================================================

export { localReviewCommand as reviewLocalCommand };
