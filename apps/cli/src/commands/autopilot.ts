/**
 * gwi autopilot command
 *
 * Fully automated PR conflict resolution pipeline.
 * Runs: triage -> plan -> resolve -> review -> apply
 *
 * IMPORTANT: This command works without AgentFS or Beads.
 * Uses pluggable storage (SQLite by default).
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations';
import {
  createTriageAgent,
  createPlannerAgent,
  createResolverAgent,
  createReviewerAgent,
} from '@gwi/agents';
import { getDefaultStoreFactory } from '@gwi/core/storage';
import type { PRMetadata, ConflictInfo, ResolutionResult, Run, RunStep } from '@gwi/core';

export interface AutopilotOptions {
  verbose?: boolean;
  json?: boolean;
  dryRun?: boolean;
  skipReview?: boolean;
  maxComplexity?: number;
  yes?: boolean;
}

export interface AutopilotResult {
  prId: string;
  prNumber: number;
  title: string;
  status: 'success' | 'partial' | 'failed' | 'aborted';
  resolvedFiles: string[];
  failedFiles: string[];
  escalatedFiles: string[];
  totalTimeSec: number;
  run: Run;
}

export async function autopilotCommand(
  prUrlArg: string | undefined,
  options: AutopilotOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });
  const startTime = Date.now();

  // Storage setup
  const factory = getDefaultStoreFactory();
  const prStore = factory.createPRStore();
  const runStore = factory.createRunStore();

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

    if (!options.json) {
      console.log(chalk.blue.bold('\n  Git With Intent - Autopilot Mode\n'));
      if (options.dryRun) {
        console.log(chalk.yellow('  [DRY RUN] No changes will be made\n'));
      }
    }

    spinner.start('Fetching PR details...');

    // Get PR metadata
    const github = createGitHubClient();
    const pr = await github.getPRLegacy(prUrl);

    spinner.succeed(`Found PR #${pr.number}: ${pr.title}`);

    // Check for conflicts
    if (pr.conflicts.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          prNumber: pr.number,
          message: 'No conflicts. PR is ready to merge.',
        }));
      } else {
        console.log(chalk.green('\n  No conflicts detected. PR is ready to merge.\n'));
      }
      return;
    }

    // Create run record
    const run: Run = {
      id: `run-${Date.now()}`,
      prId: pr.id,
      command: 'autopilot',
      status: 'running',
      startedAt: startTime,
      steps: [],
    };

    await runStore.saveRun(run);

    // Initialize agents
    spinner.start('Initializing agents...');
    const triageAgent = createTriageAgent();
    const plannerAgent = createPlannerAgent();
    const resolverAgent = createResolverAgent();
    const reviewerAgent = createReviewerAgent();

    await Promise.all([
      triageAgent.initialize(),
      plannerAgent.initialize(),
      resolverAgent.initialize(),
      reviewerAgent.initialize(),
    ]);

    spinner.succeed('Agents ready');

    // Step 1: Triage
    spinner.start('Step 1/4: Triaging conflicts...');
    const triageStep = createStep('triage', 'TriageAgent');

    const complexities: Map<string, number> = new Map();
    let maxComplexity = 0;

    for (const conflict of pr.conflicts) {
      const complexity = await assessComplexity(conflict);
      complexities.set(conflict.file, complexity);
      maxComplexity = Math.max(maxComplexity, complexity);
    }

    triageStep.status = 'completed';
    triageStep.completedAt = Date.now();
    triageStep.output = { complexities: Object.fromEntries(complexities), maxComplexity };
    run.steps.push(triageStep);

    spinner.succeed(`Step 1/4: Triage complete (max complexity: ${maxComplexity}/10)`);

    // Check complexity threshold
    const threshold = options.maxComplexity ?? 8;
    if (maxComplexity > threshold && !options.yes) {
      spinner.warn(`High complexity detected (${maxComplexity}/10 > ${threshold}). Use --yes to override.`);
      run.status = 'aborted';
      run.completedAt = Date.now();
      await runStore.saveRun(run);

      if (options.json) {
        console.log(JSON.stringify({ status: 'aborted', reason: 'complexity_threshold' }));
      }
      return;
    }

    // Step 2: Plan
    spinner.start('Step 2/4: Generating resolution plan...');
    const planStep = createStep('plan', 'PlannerAgent');

    const plan = await generatePlan(pr.conflicts, complexities);

    planStep.status = 'completed';
    planStep.completedAt = Date.now();
    planStep.output = { plan };
    run.steps.push(planStep);

    spinner.succeed(`Step 2/4: Plan ready (${plan.length} files)`);

    // Step 3: Resolve
    spinner.start('Step 3/4: Resolving conflicts...');
    const resolveStep = createStep('resolve', 'ResolverAgent');

    const resolutions: ResolutionResult[] = [];
    const resolved: string[] = [];
    const failed: string[] = [];
    const escalated: string[] = [];

    for (const conflict of pr.conflicts) {
      const complexity = complexities.get(conflict.file) ?? 5;

      if (complexity > 8) {
        escalated.push(conflict.file);
        continue;
      }

      try {
        const resolution = await resolverAgent.resolve(pr, conflict, complexity as any);

        if (resolution.resolution.confidence >= 50) {
          resolutions.push(resolution.resolution);
          resolved.push(conflict.file);
        } else {
          escalated.push(conflict.file);
        }
      } catch (error) {
        failed.push(conflict.file);
        if (options.verbose) {
          console.error(chalk.dim(`  Error resolving ${conflict.file}: ${error}`));
        }
      }
    }

    resolveStep.status = 'completed';
    resolveStep.completedAt = Date.now();
    resolveStep.output = { resolved: resolved.length, failed: failed.length, escalated: escalated.length };
    run.steps.push(resolveStep);

    spinner.succeed(`Step 3/4: Resolved ${resolved.length}/${pr.conflicts.length} files`);

    // Step 4: Review (unless skipped)
    let reviewPassed = true;
    if (!options.skipReview && resolutions.length > 0) {
      spinner.start('Step 4/4: Reviewing resolutions...');
      const reviewStep = createStep('review', 'ReviewerAgent');

      let approved = 0;
      let rejected = 0;

      for (const resolution of resolutions) {
        const conflict = pr.conflicts.find(c => c.file === resolution.file);
        if (!conflict) continue;

        const review = await reviewerAgent.review(resolution, conflict);

        if (review.review.approved && !review.shouldEscalate) {
          approved++;
        } else {
          rejected++;
          // Move from resolved to escalated
          const idx = resolved.indexOf(resolution.file);
          if (idx >= 0) {
            resolved.splice(idx, 1);
            escalated.push(resolution.file);
          }
        }
      }

      reviewPassed = rejected === 0;
      reviewStep.status = 'completed';
      reviewStep.completedAt = Date.now();
      reviewStep.output = { approved, rejected };
      run.steps.push(reviewStep);

      const reviewColor = reviewPassed ? chalk.green : chalk.yellow;
      spinner.succeed(`Step 4/4: Review ${reviewColor(`${approved} approved`)}, ${rejected} need attention`);
    } else if (options.skipReview) {
      spinner.info('Step 4/4: Review skipped (--skip-review)');
    }

    // Shutdown agents
    await Promise.all([
      triageAgent.shutdown(),
      plannerAgent.shutdown(),
      resolverAgent.shutdown(),
      reviewerAgent.shutdown(),
    ]);

    // Determine final status
    const totalTimeSec = Math.round((Date.now() - startTime) / 1000);
    const status: AutopilotResult['status'] =
      resolved.length === pr.conflicts.length ? 'success' :
      resolved.length > 0 ? 'partial' :
      failed.length > 0 ? 'failed' : 'aborted';

    run.status = status === 'success' || status === 'partial' ? 'completed' : 'failed';
    run.completedAt = Date.now();
    run.result = { status, resolved, failed, escalated };

    // Save final state
    await runStore.saveRun(run);
    await prStore.savePR({
      ...pr,
      status: status === 'success' ? 'resolved' : status === 'partial' ? 'in_progress' : 'failed',
      metadata: {
        resolutions,
        autopilotResult: { status, resolved, failed, escalated },
        completedAt: Date.now(),
      },
    });

    const result: AutopilotResult = {
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title,
      status,
      resolvedFiles: resolved,
      failedFiles: failed,
      escalatedFiles: escalated,
      totalTimeSec,
      run,
    };

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printAutopilotResult(result, options);
    }

    // Apply if not dry run and all resolved
    if (!options.dryRun && status === 'success') {
      console.log(chalk.dim('\n  Run `gwi apply` to apply these resolutions.\n'));
    }

  } catch (error) {
    spinner.fail('Autopilot failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

function createStep(name: string, agent: string): RunStep {
  return {
    name,
    agent,
    status: 'running',
    startedAt: Date.now(),
  };
}

async function assessComplexity(conflict: ConflictInfo): Promise<number> {
  // Quick complexity assessment
  const lines = conflict.conflictMarkers.split('\n');
  let complexity = conflict.complexity;

  // Adjust based on size
  if (lines.length > 100) complexity = Math.min(10, complexity + 2);
  else if (lines.length > 50) complexity = Math.min(10, complexity + 1);

  // Check for complex patterns
  const content = conflict.conflictMarkers.toLowerCase();
  if (content.includes('class ') && content.includes('extends')) complexity = Math.min(10, complexity + 1);
  if (content.includes('async') && content.includes('await')) complexity = Math.min(10, complexity + 1);
  if (content.match(/\{[\s\S]*\{[\s\S]*\{/)) complexity = Math.min(10, complexity + 1); // Nested blocks

  return complexity;
}

async function generatePlan(
  conflicts: ConflictInfo[],
  complexities: Map<string, number>
): Promise<{ file: string; complexity: number; strategy: string }[]> {
  return conflicts.map(c => ({
    file: c.file,
    complexity: complexities.get(c.file) ?? 5,
    strategy: (complexities.get(c.file) ?? 5) <= 3 ? 'auto-merge' : 'ai-resolve',
  }));
}

function printAutopilotResult(result: AutopilotResult, options: AutopilotOptions): void {
  console.log();

  // Status banner
  const statusColor = result.status === 'success' ? chalk.green :
    result.status === 'partial' ? chalk.yellow : chalk.red;
  const statusIcon = result.status === 'success' ? '✓' :
    result.status === 'partial' ? '!' : '✗';

  console.log(statusColor.bold(`  ${statusIcon} Autopilot ${result.status.toUpperCase()}`));
  console.log();

  // Summary
  console.log(chalk.bold('  Summary:'));
  console.log(`    PR #${result.prNumber}: ${result.title}`);
  console.log(`    Time: ${result.totalTimeSec}s`);
  console.log();

  // File breakdown
  const total = result.resolvedFiles.length + result.failedFiles.length + result.escalatedFiles.length;
  console.log(`    ${chalk.green(result.resolvedFiles.length)} resolved / ${total} total`);

  if (result.resolvedFiles.length > 0) {
    console.log(chalk.green('\n  Resolved:'));
    for (const file of result.resolvedFiles) {
      console.log(chalk.green(`    ✓ ${file}`));
    }
  }

  if (result.escalatedFiles.length > 0) {
    console.log(chalk.yellow('\n  Escalated (needs human review):'));
    for (const file of result.escalatedFiles) {
      console.log(chalk.yellow(`    ↑ ${file}`));
    }
  }

  if (result.failedFiles.length > 0) {
    console.log(chalk.red('\n  Failed:'));
    for (const file of result.failedFiles) {
      console.log(chalk.red(`    ✗ ${file}`));
    }
  }

  // Pipeline steps
  if (options.verbose) {
    console.log(chalk.bold('\n  Pipeline Steps:'));
    for (const step of result.run.steps) {
      const stepIcon = step.status === 'completed' ? chalk.green('✓') : chalk.red('✗');
      const duration = step.completedAt
        ? `${Math.round((step.completedAt - step.startedAt) / 1000)}s`
        : 'running';
      console.log(`    ${stepIcon} ${step.name} (${step.agent}) - ${duration}`);
    }
  }

  // Next steps
  console.log(chalk.dim('\n  Next steps:'));
  if (result.status === 'success') {
    console.log(chalk.dim(`    gwi apply ${result.prNumber}      # Apply all resolutions`));
  } else if (result.status === 'partial') {
    console.log(chalk.dim(`    gwi review ${result.prNumber}     # Review resolved files`));
    console.log(chalk.dim(`    gwi apply ${result.prNumber}      # Apply resolved files only`));
    console.log(chalk.dim(`    Resolve escalated files manually`));
  } else {
    console.log(chalk.dim(`    gwi resolve ${result.prNumber}    # Try interactive resolution`));
    console.log(chalk.dim(`    Check errors and retry, or resolve manually`));
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
