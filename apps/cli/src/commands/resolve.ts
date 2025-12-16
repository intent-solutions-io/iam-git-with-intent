/**
 * Resolve Command
 *
 * [Task: git-with-intent-iat]
 *
 * Full pipeline for resolving merge conflicts:
 * 1. Fetch PR metadata from GitHub
 * 2. Triage - analyze complexity and route
 * 3. Resolve - generate conflict resolutions
 * 4. Review - validate resolutions
 * 5. Human approval (optional)
 * 6. Report results
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations/github';
import {
  createTriageAgent,
  createResolverAgent,
  createReviewerAgent,
  type TriageOutput,
  type ReviewerOutput,
} from '@gwi/agents';
import { createBeadsClient } from '@gwi/core/beads';
import type { PRMetadata, ResolutionResult } from '@gwi/core';

/**
 * Resolve command options
 */
export interface ResolveOptions {
  dryRun?: boolean;
  verbose?: boolean;
  approval?: boolean;
}

/**
 * Resolution pipeline result
 */
interface PipelineResult {
  file: string;
  triageComplexity: number;
  resolution?: ResolutionResult;
  review?: ReviewerOutput;
  status: 'resolved' | 'needs-review' | 'escalated' | 'failed';
}

/**
 * Execute the resolve command
 */
export async function resolveCommand(prUrl: string, options: ResolveOptions): Promise<void> {
  const spinner = ora();

  console.log(chalk.blue.bold('\n  Git With Intent - Merge Conflict Resolver\n'));

  // Initialize clients
  const github = createGitHubClient();
  const beads = createBeadsClient();

  // Check Beads
  if (!(await beads.isInitialized())) {
    spinner.info('Beads not initialized. Run: bd init --quiet');
  }

  // Initialize agents
  spinner.start('Initializing agents...');
  const triageAgent = createTriageAgent();
  const resolverAgent = createResolverAgent();
  const reviewerAgent = createReviewerAgent();

  await Promise.all([
    triageAgent.initialize(),
    resolverAgent.initialize(),
    reviewerAgent.initialize(),
  ]);
  spinner.succeed('Agents initialized');

  // Step 1: Fetch PR
  spinner.start('Fetching PR details...');
  let pr: PRMetadata;
  try {
    pr = await github.getPR(prUrl);
    spinner.succeed(`Fetched PR #${pr.number}: ${pr.title}`);
  } catch (error) {
    spinner.fail('Failed to fetch PR');
    await shutdownAgents(triageAgent, resolverAgent, reviewerAgent);
    throw error;
  }

  // Check for conflicts
  if (pr.conflicts.length === 0) {
    console.log(chalk.green('\n  No conflicts detected! PR is ready to merge.\n'));
    await shutdownAgents(triageAgent, resolverAgent, reviewerAgent);
    return;
  }

  console.log(chalk.yellow(`\n  Found ${pr.conflicts.length} file(s) with conflicts:\n`));
  for (const conflict of pr.conflicts) {
    console.log(`    ${chalk.dim('•')} ${conflict.file}`);
  }
  console.log();

  // Step 2: Triage
  spinner.start('Analyzing conflicts...');
  let triageResult: TriageOutput;
  try {
    triageResult = await triageAgent.triage(pr);
    spinner.succeed('Analysis complete');
  } catch (error) {
    spinner.fail('Triage failed');
    await shutdownAgents(triageAgent, resolverAgent, reviewerAgent);
    throw error;
  }

  printTriageResults(triageResult);

  // Handle human-required routing
  if (triageResult.routeDecision === 'human-required') {
    console.log(chalk.yellow('\n  This PR requires human expertise to resolve.\n'));
    console.log(chalk.dim('  Reason: ' + triageResult.explanation));

    if (await beads.isInitialized()) {
      const issue = await beads.createIssue({
        title: `Manual resolution required: ${pr.title}`,
        type: 'task',
        priority: 2,
        description: `PR ${prUrl} requires manual resolution.\n\nReason: ${triageResult.explanation}`,
      });
      console.log(chalk.dim(`\n  Created Beads issue: ${issue.id}`));
    }

    await shutdownAgents(triageAgent, resolverAgent, reviewerAgent);
    return;
  }

  if (options.dryRun) {
    console.log(chalk.blue('\n  Dry run complete. Skipping resolution.\n'));
    await shutdownAgents(triageAgent, resolverAgent, reviewerAgent);
    return;
  }

  // Step 3 & 4: Resolve and Review each conflict
  const results: PipelineResult[] = [];

  for (const conflict of pr.conflicts) {
    const fileComplexity = triageResult.fileComplexities.find(
      (f) => f.file === conflict.file
    );
    const complexity = fileComplexity?.complexity ?? 5;

    spinner.start(`Resolving ${conflict.file}...`);

    try {
      // Resolve
      const resolverOutput = await resolverAgent.resolve(pr, conflict, complexity as any);

      if (resolverOutput.resolution.confidence < 50) {
        spinner.warn(`${conflict.file} - low confidence, needs review`);
        results.push({
          file: conflict.file,
          triageComplexity: complexity,
          resolution: resolverOutput.resolution,
          status: 'needs-review',
        });
        continue;
      }

      spinner.text = `Reviewing ${conflict.file}...`;

      // Review
      const reviewerOutput = await reviewerAgent.review(
        resolverOutput.resolution,
        conflict
      );

      if (reviewerOutput.shouldEscalate) {
        spinner.warn(`${conflict.file} - ${reviewerOutput.escalationReason}`);
        results.push({
          file: conflict.file,
          triageComplexity: complexity,
          resolution: resolverOutput.resolution,
          review: reviewerOutput,
          status: 'escalated',
        });
      } else if (reviewerOutput.review.approved) {
        spinner.succeed(`${conflict.file} - resolved (${resolverOutput.resolution.strategy})`);
        results.push({
          file: conflict.file,
          triageComplexity: complexity,
          resolution: resolverOutput.resolution,
          review: reviewerOutput,
          status: 'resolved',
        });
      } else {
        spinner.warn(`${conflict.file} - review failed`);
        results.push({
          file: conflict.file,
          triageComplexity: complexity,
          resolution: resolverOutput.resolution,
          review: reviewerOutput,
          status: 'needs-review',
        });
      }
    } catch (error) {
      spinner.fail(`${conflict.file} - failed`);
      results.push({
        file: conflict.file,
        triageComplexity: complexity,
        status: 'failed',
      });
      if (options.verbose) {
        console.error(chalk.dim(`  Error: ${error}`));
      }
    }
  }

  // Print summary
  printSummary(results, options);

  // Handle approval flow
  const resolved = results.filter((r) => r.status === 'resolved');
  const needsReview = results.filter((r) => r.status !== 'resolved');

  if (resolved.length > 0 && options.approval !== false) {
    console.log(chalk.bold('\n  Human Approval Required\n'));
    console.log(chalk.dim('  Review the resolutions above, then:'));
    console.log(chalk.dim(`    • Apply: gwi apply ${pr.number}`));
    console.log(chalk.dim(`    • Reject: gwi reject ${pr.number}`));
    console.log(chalk.dim(`    • View diff: gwi diff ${pr.number}\n`));
  }

  // Create Beads issue for unresolved files
  if (needsReview.length > 0 && (await beads.isInitialized())) {
    const issue = await beads.createIssue({
      title: `Review required: ${needsReview.length} files in PR #${pr.number}`,
      type: 'task',
      priority: 1,
      description: `Files needing manual review:\n${needsReview.map((r) => `- ${r.file}: ${r.status}`).join('\n')}`,
    });
    console.log(chalk.dim(`  Created Beads issue for review: ${issue.id}\n`));
  }

  // Cleanup
  await shutdownAgents(triageAgent, resolverAgent, reviewerAgent);
}

/**
 * Shutdown all agents
 */
async function shutdownAgents(...agents: Array<{ shutdown: () => Promise<void> }>) {
  await Promise.all(agents.map((a) => a.shutdown()));
}

/**
 * Print triage results
 */
function printTriageResults(result: TriageOutput): void {
  const complexityColor = getComplexityColor(result.overallComplexity);
  const riskColor = getRiskColor(result.riskLevel);

  console.log(chalk.bold('\n  Triage Results:'));
  console.log();
  console.log(`    Complexity:    ${complexityColor(result.overallComplexity + '/10')}`);
  console.log(`    Risk Level:    ${riskColor(result.riskLevel)}`);
  console.log(`    Route:         ${formatRoute(result.routeDecision)}`);
  console.log(`    Est. Time:     ${formatTime(result.estimatedTimeSec)}`);
  console.log();

  if (result.fileComplexities.length > 0) {
    console.log(chalk.bold('  Per-File Analysis:'));
    console.log();
    for (const file of result.fileComplexities) {
      const color = getComplexityColor(file.complexity);
      console.log(`    ${color('●')} ${file.file}`);
      console.log(chalk.dim(`      Complexity: ${file.complexity}/10 - ${file.reason}`));
    }
    console.log();
  }
}

/**
 * Print resolution summary
 */
function printSummary(results: PipelineResult[], options: ResolveOptions): void {
  const resolved = results.filter((r) => r.status === 'resolved');
  const needsReview = results.filter((r) => r.status === 'needs-review');
  const escalated = results.filter((r) => r.status === 'escalated');
  const failed = results.filter((r) => r.status === 'failed');

  console.log(chalk.bold('\n  Resolution Summary:\n'));

  console.log(`    ${chalk.green('✓')} Resolved:     ${resolved.length}`);
  console.log(`    ${chalk.yellow('!')} Needs Review: ${needsReview.length}`);
  console.log(`    ${chalk.red('↑')} Escalated:    ${escalated.length}`);
  console.log(`    ${chalk.red('✗')} Failed:       ${failed.length}`);
  console.log();

  // Calculate overall confidence
  const avgConfidence =
    results
      .filter((r) => r.resolution)
      .reduce((sum, r) => sum + (r.resolution?.confidence ?? 0), 0) /
    Math.max(results.filter((r) => r.resolution).length, 1);

  console.log(`    Overall Confidence: ${Math.round(avgConfidence)}%`);
  console.log();

  // Show details for escalated/needs-review
  if (options.verbose && (escalated.length > 0 || needsReview.length > 0)) {
    console.log(chalk.bold('  Files Requiring Attention:\n'));

    for (const result of [...escalated, ...needsReview]) {
      console.log(`    ${chalk.yellow(result.file)}`);
      if (result.review?.escalationReason) {
        console.log(chalk.dim(`      Reason: ${result.review.escalationReason}`));
      }
      if (result.review?.review.securityIssues.length) {
        console.log(chalk.red(`      Security: ${result.review.review.securityIssues.join(', ')}`));
      }
      if (result.resolution?.explanation) {
        console.log(chalk.dim(`      Resolution: ${result.resolution.explanation.slice(0, 80)}...`));
      }
    }
    console.log();
  }
}

function getComplexityColor(complexity: number): (text: string) => string {
  if (complexity <= 3) return chalk.green;
  if (complexity <= 6) return chalk.yellow;
  return chalk.red;
}

function getRiskColor(risk: string): (text: string) => string {
  switch (risk) {
    case 'low': return chalk.green;
    case 'medium': return chalk.yellow;
    case 'high': return chalk.red;
    default: return chalk.white;
  }
}

function formatRoute(route: string): string {
  switch (route) {
    case 'auto-resolve': return chalk.green('Auto-resolve (simple)');
    case 'agent-resolve': return chalk.yellow('Agent-resolve (with approval)');
    case 'human-required': return chalk.red('Human required');
    default: return route;
  }
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
