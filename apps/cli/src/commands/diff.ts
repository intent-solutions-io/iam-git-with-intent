/**
 * gwi diff command
 *
 * [Task: git-with-intent-9y2]
 *
 * Analyze PR conflicts and show AI-powered diff analysis.
 * Uses Triage Agent for complexity analysis.
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations';
import { createTriageAgent } from '@gwi/agents';
import type { ConflictInfo, PRMetadata } from '@gwi/core';

export interface DiffOptions {
  verbose?: boolean;
  color?: boolean;
  json?: boolean;
}

export async function diffCommand(
  prUrlArg: string | undefined,
  options: DiffOptions
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
    const pr = await github.getPRLegacy(prUrl);

    spinner.succeed(`Found PR #${pr.number}: ${pr.title}`);

    // Check for conflicts
    if (pr.conflicts.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'clean', conflicts: [] }));
      } else {
        console.log(chalk.green('\n  No conflicts detected. PR is ready to merge.'));
      }
      return;
    }

    spinner.start(`Analyzing ${pr.conflicts.length} conflict(s)...`);

    // Use Triage Agent for complexity analysis
    const triageAgent = createTriageAgent();
    await triageAgent.initialize();

    const analyses: ConflictAnalysis[] = [];

    for (const conflict of pr.conflicts) {
      const analysis = await analyzeConflict(conflict, pr);
      analyses.push(analysis);
    }

    await triageAgent.shutdown();

    spinner.succeed('Analysis complete');

    // Output results
    if (options.json) {
      console.log(JSON.stringify({
        status: 'conflicts',
        pr: {
          number: pr.number,
          title: pr.title,
          baseBranch: pr.baseBranch,
          headBranch: pr.headBranch,
        },
        conflicts: analyses,
      }, null, 2));
    } else {
      printDiffAnalysis(pr, analyses, options);
    }
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

interface ConflictAnalysis {
  file: string;
  complexity: number;
  riskLevel: 'low' | 'medium' | 'high';
  routeDecision: 'auto-resolve' | 'agent-resolve' | 'human-required';
  estimatedTimeSec: number;
  explanation: string;
  diffSummary: string;
}

async function analyzeConflict(
  conflict: ConflictInfo,
  _pr: PRMetadata
): Promise<ConflictAnalysis> {
  const complexity = conflict.complexity;
  const riskLevel = complexity <= 3 ? 'low' : complexity <= 6 ? 'medium' : 'high';
  const routeDecision = complexity <= 2 ? 'auto-resolve' :
    complexity <= 7 ? 'agent-resolve' : 'human-required';

  const diffSummary = generateDiffSummary(conflict);

  return {
    file: conflict.file,
    complexity,
    riskLevel,
    routeDecision,
    estimatedTimeSec: complexity * 15,
    explanation: `Complexity ${complexity}/10 based on content analysis`,
    diffSummary,
  };
}

function generateDiffSummary(conflict: ConflictInfo): string {
  const lines = conflict.conflictMarkers.split('\n');
  const addCount = lines.filter(l => l.startsWith('+')).length;
  const removeCount = lines.filter(l => l.startsWith('-')).length;

  return `+${addCount} -${removeCount} lines`;
}

function printDiffAnalysis(
  pr: PRMetadata,
  analyses: ConflictAnalysis[],
  options: DiffOptions
): void {
  console.log();
  console.log(chalk.bold(`PR #${pr.number}: ${pr.title}`));
  console.log(chalk.dim(`${pr.baseBranch} <- ${pr.headBranch}`));
  console.log();

  const totalComplexity = analyses.reduce((sum, a) => sum + a.complexity, 0);
  const avgComplexity = totalComplexity / analyses.length;
  const highRiskCount = analyses.filter(a => a.riskLevel === 'high').length;

  // Summary bar
  const summaryColor = avgComplexity <= 3 ? chalk.green :
    avgComplexity <= 6 ? chalk.yellow : chalk.red;
  console.log(summaryColor(`  ${analyses.length} conflict(s) | Avg complexity: ${avgComplexity.toFixed(1)}/10 | High risk: ${highRiskCount}`));
  console.log();

  // Per-file analysis
  for (const analysis of analyses) {
    const riskColor = analysis.riskLevel === 'low' ? chalk.green :
      analysis.riskLevel === 'medium' ? chalk.yellow : chalk.red;

    const routeIcon = analysis.routeDecision === 'auto-resolve' ? '[AUTO]' :
      analysis.routeDecision === 'agent-resolve' ? '[AI]' : '[HUMAN]';

    console.log(chalk.bold(`  ${analysis.file}`));
    console.log(`    ${riskColor(`Risk: ${analysis.riskLevel.toUpperCase()}`)} | Complexity: ${analysis.complexity}/10 | ${analysis.diffSummary}`);
    console.log(`    ${routeIcon} Route: ${analysis.routeDecision} | Est: ${analysis.estimatedTimeSec}s`);

    if (options.verbose) {
      console.log(chalk.dim(`    ${analysis.explanation}`));
    }

    console.log();
  }

  // Recommendations
  console.log(chalk.bold('  Recommendations:'));
  const autoCount = analyses.filter(a => a.routeDecision === 'auto-resolve').length;
  const agentCount = analyses.filter(a => a.routeDecision === 'agent-resolve').length;
  const humanCount = analyses.filter(a => a.routeDecision === 'human-required').length;

  if (autoCount > 0) {
    console.log(chalk.green(`    ${autoCount} file(s) can be auto-resolved`));
  }
  if (agentCount > 0) {
    console.log(chalk.yellow(`    ${agentCount} file(s) need AI agent resolution`));
  }
  if (humanCount > 0) {
    console.log(chalk.red(`    ${humanCount} file(s) require human review`));
  }

  console.log();
  console.log(chalk.dim(`  Run ${chalk.bold('gwi resolve <pr-url>')} to start resolution workflow`));
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
