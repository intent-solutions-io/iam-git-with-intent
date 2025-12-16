/**
 * Status Command
 *
 * Shows agent status and recent activity from AgentFS.
 */

import chalk from 'chalk';
import { openAgentFS } from '@gwi/core/agentfs';
import { createBeadsClient } from '@gwi/core/beads';

/**
 * Status command options
 */
export interface StatusOptions {
  agent?: string;
}

/**
 * Known agents
 */
const AGENTS = ['triage', 'resolver', 'reviewer', 'coder', 'test', 'docs'];

/**
 * Execute the status command
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  console.log(chalk.blue.bold('\n  Git With Intent - Status\n'));

  // Show Beads status
  const beads = createBeadsClient();
  if (await beads.isInitialized()) {
    console.log(chalk.green('  Beads: ') + chalk.dim('Initialized'));

    try {
      const readyIssues = await beads.getReadyIssues();
      console.log(chalk.dim(`    Ready issues: ${readyIssues.length}`));

      if (readyIssues.length > 0) {
        console.log(chalk.dim('\n    Next ready work:'));
        for (const issue of readyIssues.slice(0, 3)) {
          console.log(chalk.dim(`      • [${issue.id}] ${issue.title}`));
        }
      }
    } catch {
      console.log(chalk.dim('    (Could not fetch issues)'));
    }
  } else {
    console.log(chalk.yellow('  Beads: ') + chalk.dim('Not initialized'));
    console.log(chalk.dim('    Run: bd init --quiet'));
  }

  console.log();

  // Show agent status
  const agentsToCheck = options.agent ? [options.agent] : AGENTS;

  console.log(chalk.bold('  Agents:'));
  console.log();

  for (const agentName of agentsToCheck) {
    try {
      const agentfs = await openAgentFS({ id: agentName });

      // Get recent tool calls
      const recentCalls = await agentfs.tools.list(5);

      if (recentCalls.length > 0) {
        const lastCall = recentCalls[0];
        const lastActive = new Date(lastCall.startedAt * 1000).toLocaleString();

        console.log(`    ${chalk.green('●')} ${agentName}`);
        console.log(chalk.dim(`      Last active: ${lastActive}`));
        console.log(chalk.dim(`      Recent calls: ${recentCalls.length}`));
      } else {
        console.log(`    ${chalk.dim('○')} ${agentName} ${chalk.dim('(no activity)')}`);
      }
    } catch {
      console.log(`    ${chalk.dim('○')} ${agentName} ${chalk.dim('(not initialized)')}`);
    }
  }

  console.log();
}
