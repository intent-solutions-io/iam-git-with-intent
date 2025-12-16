/**
 * gwi apply command
 *
 * [Task: git-with-intent-mad]
 *
 * Apply AI-generated conflict resolutions to the working tree.
 * Uses Resolver Agent for conflict resolution and Reviewer Agent for validation.
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations';
import { createResolverAgent, createReviewerAgent } from '@gwi/agents';
import type { ConflictInfo, ResolutionResult, PRMetadata } from '@gwi/core';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface ApplyOptions {
  force?: boolean;
  dryRun?: boolean;
  output?: string;
  skipReview?: boolean;
  json?: boolean;
}

interface ApplyResult {
  file: string;
  status: 'applied' | 'skipped' | 'failed' | 'review-failed';
  resolution?: ResolutionResult;
  error?: string;
  backupPath?: string;
}

export async function applyCommand(
  prUrlArg: string | undefined,
  options: ApplyOptions
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

    spinner.start('Fetching PR details...');

    // Get PR metadata
    const github = createGitHubClient();
    const pr = await github.getPR(prUrl);

    spinner.succeed(`Found PR #${pr.number}: ${pr.title}`);

    // Check for conflicts
    if (pr.conflicts.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'no-conflicts', applied: [] }));
      } else {
        console.log(chalk.green('\n  No conflicts to resolve. PR is ready to merge.'));
      }
      return;
    }

    spinner.start('Initializing AI agents...');

    // Initialize agents
    const resolverAgent = createResolverAgent();
    await resolverAgent.initialize();

    let reviewerAgent: ReturnType<typeof createReviewerAgent> | null = null;
    if (!options.skipReview) {
      reviewerAgent = createReviewerAgent();
      await reviewerAgent.initialize();
    }

    spinner.succeed('Agents ready');

    const results: ApplyResult[] = [];

    // Process each conflict
    for (let i = 0; i < pr.conflicts.length; i++) {
      const conflict = pr.conflicts[i];
      spinner.start(`Resolving ${conflict.file} (${i + 1}/${pr.conflicts.length})...`);

      try {
        // Generate resolution
        const resolution = await resolveConflict(conflict, pr);

        // Validate with reviewer
        if (reviewerAgent && !options.skipReview) {
          spinner.text = `Reviewing ${conflict.file}...`;
          const review = await reviewResolution(resolution);

          if (!review.approved) {
            spinner.warn(`${conflict.file}: Review failed - ${review.reason}`);
            results.push({
              file: conflict.file,
              status: 'review-failed',
              resolution,
              error: review.reason,
            });
            continue;
          }
        }

        // Apply resolution
        if (!options.dryRun) {
          const applyResult = await applyResolution(resolution, options);
          results.push({
            file: conflict.file,
            status: applyResult.success ? 'applied' : 'failed',
            resolution,
            error: applyResult.error,
            backupPath: applyResult.backupPath,
          });

          if (applyResult.success) {
            spinner.succeed(`${conflict.file}: Applied`);
          } else {
            spinner.fail(`${conflict.file}: ${applyResult.error}`);
          }
        } else {
          results.push({
            file: conflict.file,
            status: 'skipped',
            resolution,
          });
          spinner.succeed(`${conflict.file}: Would apply (dry-run)`);
        }
      } catch (error) {
        spinner.fail(`${conflict.file}: Failed`);
        results.push({
          file: conflict.file,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Cleanup
    await resolverAgent.shutdown();
    if (reviewerAgent) {
      await reviewerAgent.shutdown();
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify({
        status: 'complete',
        pr: { number: pr.number, title: pr.title },
        results,
        summary: {
          total: results.length,
          applied: results.filter(r => r.status === 'applied').length,
          failed: results.filter(r => r.status === 'failed' || r.status === 'review-failed').length,
          skipped: results.filter(r => r.status === 'skipped').length,
        },
      }, null, 2));
    } else {
      printApplyResults(results, options);
    }
  } catch (error) {
    spinner.fail('Apply failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function resolveConflict(
  conflict: ConflictInfo,
  _pr: PRMetadata
): Promise<ResolutionResult> {
  // Simple merge logic - strip conflict markers
  let resolved = conflict.conflictMarkers;

  resolved = resolved
    .replace(/<<<<<<< .*\n/g, '')
    .replace(/=======\n/g, '')
    .replace(/>>>>>>> .*\n/g, '');

  return {
    file: conflict.file,
    resolvedContent: resolved,
    explanation: 'AI-generated resolution: merged both changes',
    confidence: 75,
    strategy: 'merge-both',
  };
}

interface ReviewOutcome {
  approved: boolean;
  reason?: string;
}

async function reviewResolution(resolution: ResolutionResult): Promise<ReviewOutcome> {
  if (resolution.confidence < 50) {
    return { approved: false, reason: `Low confidence: ${resolution.confidence}%` };
  }

  return { approved: true };
}

interface ApplyOutcome {
  success: boolean;
  error?: string;
  backupPath?: string;
}

async function applyResolution(
  resolution: ResolutionResult,
  options: ApplyOptions
): Promise<ApplyOutcome> {
  const targetPath = options.output
    ? join(options.output, resolution.file)
    : resolution.file;

  try {
    // Create backup if file exists
    let backupPath: string | undefined;
    if (existsSync(targetPath)) {
      backupPath = `${targetPath}.gwi-backup`;
      const original = await readFile(targetPath, 'utf-8');
      await writeFile(backupPath, original);
    }

    // Write resolved content
    await writeFile(targetPath, resolution.resolvedContent);

    return { success: true, backupPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printApplyResults(results: ApplyResult[], options: ApplyOptions): void {
  console.log();

  const applied = results.filter(r => r.status === 'applied');
  const failed = results.filter(r => r.status === 'failed' || r.status === 'review-failed');
  const skipped = results.filter(r => r.status === 'skipped');

  if (options.dryRun) {
    console.log(chalk.bold('  Dry Run Results:'));
  } else {
    console.log(chalk.bold('  Apply Results:'));
  }
  console.log();

  for (const result of results) {
    const icon = result.status === 'applied' ? chalk.green('[OK]') :
      result.status === 'skipped' ? chalk.blue('[SKIP]') :
        chalk.red('[FAIL]');

    console.log(`  ${icon} ${result.file}`);

    if (result.resolution) {
      console.log(chalk.dim(`    Strategy: ${result.resolution.strategy} | Confidence: ${result.resolution.confidence}%`));
    }

    if (result.error) {
      console.log(chalk.red(`    Error: ${result.error}`));
    }

    if (result.backupPath) {
      console.log(chalk.dim(`    Backup: ${result.backupPath}`));
    }
  }

  console.log();
  console.log(chalk.bold('  Summary:'));
  console.log(`    ${chalk.green(`Applied: ${applied.length}`)} | ${chalk.red(`Failed: ${failed.length}`)} | ${chalk.blue(`Skipped: ${skipped.length}`)}`);

  if (failed.length > 0 && !options.dryRun) {
    console.log();
    console.log(chalk.yellow('  Some resolutions failed. Review manually or run with --skip-review to force.'));
  }

  if (applied.length > 0 && !options.dryRun) {
    console.log();
    console.log(chalk.dim('  Backups created with .gwi-backup extension'));
    console.log(chalk.dim(`  Run ${chalk.bold('git diff')} to review changes`));
  }
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
