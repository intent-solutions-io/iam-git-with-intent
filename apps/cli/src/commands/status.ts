/**
 * Status Command
 *
 * Shows agent status and recent activity.
 *
 * IMPORTANT: This command works without AgentFS or Beads.
 * It uses the pluggable storage interface (SQLite by default).
 */

import chalk from 'chalk';
import { getDefaultStoreFactory } from '@gwi/core/storage';

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
const AGENTS = ['triage', 'planner', 'coder', 'validator', 'reviewer'];

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
      const statusIcon = pr.status === 'resolved' ? chalk.green('✓') :
        pr.status === 'in_progress' ? chalk.yellow('●') :
        pr.status === 'failed' ? chalk.red('✗') : chalk.dim('○');
      console.log(`    ${statusIcon} PR #${pr.number}: ${pr.title}`);
      console.log(chalk.dim(`      ${pr.repository} | ${pr.conflicts.length} conflict(s) | ${pr.status}`));
    }
    console.log();
  } else {
    console.log(chalk.dim('  No recent PRs tracked.\n'));
  }

  // Show recent runs
  const recentRuns = await runStore.listRuns({ limit: 5 });
  if (recentRuns.length > 0) {
    console.log(chalk.bold('  Recent Runs:'));
    console.log();
    for (const run of recentRuns) {
      const statusIcon = run.status === 'completed' ? chalk.green('✓') :
        run.status === 'running' ? chalk.yellow('●') :
        run.status === 'failed' ? chalk.red('✗') : chalk.dim('○');
      const duration = run.completedAt
        ? `${Math.round((run.completedAt - run.startedAt) / 1000)}s`
        : 'running...';
      console.log(`    ${statusIcon} ${run.prId} | ${run.command} | ${duration}`);
    }
    console.log();
  }

  // Show agent activity (from runs)
  const agentsToCheck = options.agent ? [options.agent] : AGENTS;

  console.log(chalk.bold('  Agent Activity:'));
  console.log();

  for (const agentName of agentsToCheck) {
    // Count runs that involved this agent (by checking steps)
    const runs = await runStore.listRuns({ limit: 20 });
    let activityCount = 0;
    let lastActive: Date | null = null;

    for (const run of runs) {
      const hasAgentStep = run.steps.some(s =>
        s.agent.toLowerCase() === agentName.toLowerCase()
      );
      if (hasAgentStep) {
        activityCount++;
        const runDate = new Date(run.startedAt);
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
  runStore: ReturnType<ReturnType<typeof getDefaultStoreFactory>['createRunStore']>,
  prStore: ReturnType<ReturnType<typeof getDefaultStoreFactory>['createPRStore']>,
  agentFilter?: string
): Promise<object> {
  const recentPRs = await prStore.listPRs({ limit: 10 });
  const recentRuns = await runStore.listRuns({ limit: 10 });

  const agents = (agentFilter ? [agentFilter] : AGENTS).map(name => {
    const agentRuns = recentRuns.filter(run =>
      run.steps.some(s => s.agent.toLowerCase() === name.toLowerCase())
    );
    return {
      name,
      activityCount: agentRuns.length,
      lastActive: agentRuns[0]?.startedAt ?? null,
    };
  });

  return {
    storage: process.env.GWI_STORAGE ?? 'sqlite',
    prs: recentPRs.map(pr => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      repository: pr.repository,
      status: pr.status,
      conflictCount: pr.conflicts.length,
    })),
    runs: recentRuns.map(run => ({
      id: run.id,
      prId: run.prId,
      command: run.command,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    })),
    agents,
  };
}
