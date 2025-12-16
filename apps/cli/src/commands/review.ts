/**
 * gwi review command
 *
 * Review AI-generated resolutions before applying them.
 * Shows diffs, confidence scores, and allows approval/rejection.
 *
 * IMPORTANT: This command works without AgentFS or Beads.
 * Uses pluggable storage (SQLite by default).
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations';
import { createReviewerAgent } from '@gwi/agents';
import { getDefaultStoreFactory } from '@gwi/core/storage';
import type { PRMetadata, ResolutionResult } from '@gwi/core';

export interface ReviewOptions {
  verbose?: boolean;
  json?: boolean;
  file?: string;
  approve?: boolean;
  reject?: boolean;
}

export interface ReviewResult {
  prId: string;
  prNumber: number;
  title: string;
  files: FileReview[];
  overallApproved: boolean;
  summary: ReviewSummary;
}

interface FileReview {
  file: string;
  approved: boolean;
  confidence: number;
  issues: string[];
  securityConcerns: string[];
  suggestions: string[];
  diff: string;
}

interface ReviewSummary {
  totalFiles: number;
  approvedFiles: number;
  rejectedFiles: number;
  totalIssues: number;
  securityIssues: number;
}

export async function reviewCommand(
  prUrlArg: string | undefined,
  options: ReviewOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    // Resolve PR URL
    let prUrl = prUrlArg;
    if (!prUrl) {
      prUrl = await getCurrentBranchPR() ?? undefined;
      if (!prUrl) {
        console.error(chalk.red('Error: No PR URL provided and no PR found for current branch'));
        process.exit(1);
      }
    }

    spinner.start('Fetching PR and resolution data...');

    // Get PR metadata
    const github = createGitHubClient();
    const pr = await github.getPR(prUrl);

    // Get stored resolutions
    const factory = getDefaultStoreFactory();
    const prStore = factory.createPRStore();
    const storedPR = await prStore.getPRByUrl(prUrl);

    if (!storedPR?.metadata?.resolutions) {
      spinner.fail('No resolutions found for this PR');
      console.log(chalk.yellow('\n  Run `gwi resolve` first to generate resolutions.\n'));
      return;
    }

    spinner.succeed(`Found PR #${pr.number} with ${storedPR.metadata.resolutions.length} resolution(s)`);

    // Handle quick approve/reject
    if (options.approve || options.reject) {
      await handleQuickDecision(storedPR, options, prStore);
      return;
    }

    spinner.start('Reviewing resolutions...');

    // Initialize reviewer agent
    const reviewerAgent = createReviewerAgent();
    await reviewerAgent.initialize();

    const fileReviews: FileReview[] = [];
    let totalIssues = 0;
    let securityIssues = 0;

    // Filter by file if specified
    const resolutionsToReview = options.file
      ? storedPR.metadata.resolutions.filter((r: ResolutionResult) =>
          r.file.includes(options.file!))
      : storedPR.metadata.resolutions;

    for (const resolution of resolutionsToReview) {
      const conflict = pr.conflicts.find(c => c.file === resolution.file);
      if (!conflict) continue;

      const reviewResult = await reviewerAgent.review(resolution, conflict);

      const issues = reviewResult.review.issues ?? [];
      const security = reviewResult.review.securityIssues ?? [];

      totalIssues += issues.length;
      securityIssues += security.length;

      fileReviews.push({
        file: resolution.file,
        approved: reviewResult.review.approved && !reviewResult.shouldEscalate,
        confidence: resolution.confidence,
        issues,
        securityConcerns: security,
        suggestions: reviewResult.review.suggestions ?? [],
        diff: generateDiffPreview(resolution),
      });
    }

    await reviewerAgent.shutdown();
    spinner.succeed('Review complete');

    const approvedCount = fileReviews.filter(f => f.approved).length;
    const result: ReviewResult = {
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title,
      files: fileReviews,
      overallApproved: approvedCount === fileReviews.length && securityIssues === 0,
      summary: {
        totalFiles: fileReviews.length,
        approvedFiles: approvedCount,
        rejectedFiles: fileReviews.length - approvedCount,
        totalIssues,
        securityIssues,
      },
    };

    // Update stored PR with review
    await prStore.savePR({
      ...storedPR,
      status: result.overallApproved ? 'reviewed' : 'needs-attention',
      metadata: {
        ...storedPR.metadata,
        review: result,
        reviewedAt: Date.now(),
      },
    });

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printReviewResult(result, options);
    }
  } catch (error) {
    spinner.fail('Review failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function handleQuickDecision(
  storedPR: PRMetadata,
  options: ReviewOptions,
  prStore: ReturnType<ReturnType<typeof getDefaultStoreFactory>['createPRStore']>
): Promise<void> {
  const decision = options.approve ? 'approved' : 'rejected';

  await prStore.savePR({
    ...storedPR,
    status: options.approve ? 'approved' : 'rejected',
    metadata: {
      ...storedPR.metadata,
      decision,
      decidedAt: Date.now(),
    },
  });

  if (options.json) {
    console.log(JSON.stringify({ prNumber: storedPR.number, decision }));
  } else {
    const color = options.approve ? chalk.green : chalk.red;
    console.log(color(`\n  PR #${storedPR.number} ${decision}\n`));

    if (options.approve) {
      console.log(chalk.dim(`  Run: gwi apply ${storedPR.number}`));
    }
  }
}

function generateDiffPreview(resolution: ResolutionResult): string {
  // Generate a compact diff preview
  const lines = resolution.resolvedContent.split('\n');
  const preview = lines.slice(0, 10);

  if (lines.length > 10) {
    preview.push(`... (${lines.length - 10} more lines)`);
  }

  return preview.map(line => {
    if (line.startsWith('+')) return chalk.green(line);
    if (line.startsWith('-')) return chalk.red(line);
    return line;
  }).join('\n');
}

function printReviewResult(result: ReviewResult, options: ReviewOptions): void {
  console.log();
  console.log(chalk.bold(`Review: PR #${result.prNumber}`));
  console.log(chalk.dim(result.title));
  console.log();

  // Summary
  const { summary } = result;
  const statusColor = result.overallApproved ? chalk.green : chalk.yellow;
  const statusText = result.overallApproved ? 'APPROVED' : 'NEEDS ATTENTION';

  console.log(chalk.bold('  Summary:'));
  console.log(`    Status: ${statusColor(statusText)}`);
  console.log(`    Files: ${chalk.green(summary.approvedFiles)} approved / ${chalk.red(summary.rejectedFiles)} rejected`);
  if (summary.totalIssues > 0) {
    console.log(`    Issues: ${chalk.yellow(summary.totalIssues)}`);
  }
  if (summary.securityIssues > 0) {
    console.log(`    Security: ${chalk.red(`${summary.securityIssues} concern(s)`)}`);
  }
  console.log();

  // Per-file reviews
  console.log(chalk.bold('  File Reviews:'));
  console.log();

  for (const file of result.files) {
    const statusIcon = file.approved ? chalk.green('✓') : chalk.red('✗');
    const confColor = file.confidence >= 80 ? chalk.green :
      file.confidence >= 60 ? chalk.yellow : chalk.red;

    console.log(`  ${statusIcon} ${file.file}`);
    console.log(`    Confidence: ${confColor(`${file.confidence}%`)} | Status: ${file.approved ? 'Approved' : 'Needs Review'}`);

    // Issues
    if (file.issues.length > 0) {
      console.log(chalk.yellow('    Issues:'));
      for (const issue of file.issues) {
        console.log(chalk.yellow(`      • ${issue}`));
      }
    }

    // Security concerns
    if (file.securityConcerns.length > 0) {
      console.log(chalk.red('    Security:'));
      for (const concern of file.securityConcerns) {
        console.log(chalk.red(`      ⚠️  ${concern}`));
      }
    }

    // Suggestions
    if (options.verbose && file.suggestions.length > 0) {
      console.log(chalk.dim('    Suggestions:'));
      for (const suggestion of file.suggestions) {
        console.log(chalk.dim(`      → ${suggestion}`));
      }
    }

    // Diff preview
    if (options.verbose) {
      console.log(chalk.dim('    Preview:'));
      console.log(chalk.dim('    ```'));
      for (const line of file.diff.split('\n').slice(0, 5)) {
        console.log(chalk.dim(`    ${line}`));
      }
      console.log(chalk.dim('    ```'));
    }

    console.log();
  }

  // Next steps
  console.log(chalk.dim('  Next steps:'));
  if (result.overallApproved) {
    console.log(chalk.dim(`    gwi apply ${result.prNumber}          # Apply resolutions`));
  } else {
    console.log(chalk.dim(`    gwi review ${result.prNumber} --approve  # Force approve`));
    console.log(chalk.dim(`    gwi resolve ${result.prNumber}           # Re-run resolution`));
    console.log(chalk.dim(`    Address issues manually before applying`));
  }
  console.log();
}

async function getCurrentBranchPR(): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');

    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    if (!branch) return null;

    try {
      const prUrl = execSync(`gh pr view ${branch} --json url -q .url 2>/dev/null`, {
        encoding: 'utf-8',
      }).trim();
      return prUrl || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
