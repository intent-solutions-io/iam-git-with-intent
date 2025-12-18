/**
 * Status Command
 *
 * Shows agent status and recent activity.
 *
 * Phase 14: Updated to match current storage interfaces.
 */

import chalk from 'chalk';
import { getDefaultStoreFactory } from '@gwi/core';
import type { PRStore, RunStore, PRMetadata, Run, RunStep } from '@gwi/core';

/**
 * Status command options
 */
export interface StatusOptions {
  agent?: string;
  json?: boolean;
}

/**
 * Known agents
 */
const AGENTS = ['triage', 'planner', 'coder', 'resolver', 'reviewer'];

/**
 * Execute the status command
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const factory = getDefaultStoreFactory();
  const runStore = factory.createRunStore();
  const prStore = factory.createPRStore();

  if (options.json) {
    const status = await getStatusJson(runStore, prStore, options.agent);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(chalk.blue.bold('\n  Git With Intent - Status\n'));

  // Show storage info
  console.log(chalk.dim('  Storage: SQLite (default)'));
  console.log();

  // Show recent PRs
  const recentPRs = await prStore.listPRs({ limit: 5 });
  if (recentPRs.length > 0) {
    console.log(chalk.bold('  Recent PRs:'));
    console.log();
    for (const pr of recentPRs) {
      const statusIcon = pr.state === 'merged' ? chalk.green('✓') :
        pr.state === 'open' ? chalk.yellow('●') :
        pr.state === 'closed' ? chalk.dim('○') : chalk.dim('○');
      const conflictText = pr.hasConflicts ? chalk.red('has conflicts') : chalk.green('no conflicts');
      console.log(`    ${statusIcon} PR #${pr.number}: ${pr.title}`);
      console.log(chalk.dim(`      ${pr.owner}/${pr.repo} | ${conflictText} | ${pr.state}`));
    }
    console.log();
  } else {
    console.log(chalk.dim('  No recent PRs tracked.\n'));
  }

  // Show recent runs - RunStore.listRuns needs a prId, so we list from PRs
  let hasRuns = false;
  for (const pr of recentPRs.slice(0, 3)) {
    const runs = await runStore.listRuns(pr.id, 2);
    if (runs.length > 0) {
      if (!hasRuns) {
        console.log(chalk.bold('  Recent Runs:'));
        console.log();
        hasRuns = true;
      }
      for (const run of runs) {
        const statusIcon = run.status === 'completed' ? chalk.green('✓') :
          run.status === 'running' ? chalk.yellow('●') :
          run.status === 'failed' ? chalk.red('✗') : chalk.dim('○');
        const duration = run.durationMs
          ? `${Math.round(run.durationMs / 1000)}s`
          : 'running...';
        console.log(`    ${statusIcon} ${run.type} | ${pr.owner}/${pr.repo}#${pr.number} | ${duration}`);
      }
    }
  }
  if (!hasRuns) {
    console.log(chalk.dim('  No recent runs.\n'));
  } else {
    console.log();
  }

  // Show agent activity (from runs)
  const agentsToCheck = options.agent ? [options.agent] : AGENTS;

  console.log(chalk.bold('  Agent Activity:'));
  console.log();

  // Collect all runs to check agent activity
  const allRuns: Run[] = [];
  for (const pr of recentPRs) {
    const runs = await runStore.listRuns(pr.id, 10);
    allRuns.push(...runs);
  }

  for (const agentName of agentsToCheck) {
    let activityCount = 0;
    let lastActive: Date | null = null;

    for (const run of allRuns) {
      const hasAgentStep = run.steps.some((s: RunStep) =>
        s.agent.toLowerCase() === agentName.toLowerCase()
      );
      if (hasAgentStep) {
        activityCount++;
        const runDate = run.createdAt;
        if (!lastActive || runDate > lastActive) {
          lastActive = runDate;
        }
      }
    }

    if (activityCount > 0 && lastActive) {
      console.log(`    ${chalk.green('●')} ${agentName}`);
      console.log(chalk.dim(`      Last active: ${lastActive.toLocaleString()}`));
      console.log(chalk.dim(`      Recent runs: ${activityCount}`));
    } else {
      console.log(`    ${chalk.dim('○')} ${agentName} ${chalk.dim('(no activity)')}`);
    }
  }

  console.log();

  // Optional: Check for internal tools (AgentFS/Beads) if available
  if (process.env.GWI_USE_AGENTFS === 'true') {
    console.log(chalk.dim('  [Internal] AgentFS enabled'));
  }
  if (process.env.GWI_USE_BEADS === 'true') {
    console.log(chalk.dim('  [Internal] Beads enabled'));
  }
}

/**
 * Get status as JSON object
 */
async function getStatusJson(
  runStore: RunStore,
  prStore: PRStore,
  agentFilter?: string
): Promise<object> {
  const recentPRs = await prStore.listPRs({ limit: 10 });

  // Collect runs from PRs
  const allRuns: Run[] = [];
  for (const pr of recentPRs) {
    const runs = await runStore.listRuns(pr.id, 5);
    allRuns.push(...runs);
  }

  const agents = (agentFilter ? [agentFilter] : AGENTS).map(name => {
    const agentRuns = allRuns.filter((run: Run) =>
      run.steps.some((s: RunStep) => s.agent.toLowerCase() === name.toLowerCase())
    );
    return {
      name,
      activityCount: agentRuns.length,
      lastActive: agentRuns[0]?.createdAt ?? null,
    };
  });

  return {
    storage: process.env.GWI_STORAGE ?? 'sqlite',
    prs: recentPRs.map((pr: PRMetadata) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      repo: `${pr.owner}/${pr.repo}`,
      state: pr.state,
      hasConflicts: pr.hasConflicts,
    })),
    runs: allRuns.slice(0, 10).map((run: Run) => ({
      id: run.id,
      prId: run.prId,
      type: run.type,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    })),
    agents,
  };
}
