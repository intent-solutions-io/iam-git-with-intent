/**
 * gwi plan command
 *
 * Generate a resolution plan for PR conflicts.
 * Shows what the AI agents will do before execution.
 *
 * IMPORTANT: This command works without AgentFS or Beads.
 * Uses pluggable storage (SQLite by default).
 */

import chalk from 'chalk';
import ora from 'ora';
import { createGitHubClient } from '@gwi/integrations';
import { createTriageAgent } from '@gwi/agents';
import { getDefaultStoreFactory } from '@gwi/core/storage';
import type { PRMetadata, ConflictInfo } from '@gwi/core';

export interface PlanOptions {
  verbose?: boolean;
  json?: boolean;
  save?: boolean;
}

export interface ResolutionPlan {
  prId: string;
  prNumber: number;
  title: string;
  steps: PlanStep[];
  estimatedTimeSec: number;
  requiresApproval: boolean;
  warnings: string[];
}

interface PlanStep {
  order: number;
  file: string;
  action: 'auto-merge' | 'ai-resolve' | 'human-review';
  agent?: string;
  strategy?: string;
  confidence?: number;
  estimatedTimeSec: number;
  reason: string;
}

export async function planCommand(
  prUrlArg: string | undefined,
  options: PlanOptions
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
      const result = {
        status: 'clean',
        prNumber: pr.number,
        message: 'No conflicts to resolve. PR is ready to merge.',
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('\n  No conflicts to resolve. PR is ready to merge.\n'));
      }
      return;
    }

    spinner.start('Analyzing conflicts and generating plan...');

    // Initialize triage agent for complexity analysis
    const triageAgent = createTriageAgent();
    await triageAgent.initialize();

    // Generate plan steps
    const steps: PlanStep[] = [];
    const warnings: string[] = [];
    let totalTime = 0;

    for (let i = 0; i < pr.conflicts.length; i++) {
      const conflict = pr.conflicts[i];
      const step = await generateStepForConflict(conflict, i + 1, pr);
      steps.push(step);
      totalTime += step.estimatedTimeSec;

      if (step.action === 'human-review') {
        warnings.push(`${conflict.file} requires manual review`);
      }
    }

    await triageAgent.shutdown();

    spinner.succeed('Plan generated');

    // Calculate if approval is needed
    const hasAgentSteps = steps.some(s => s.action === 'ai-resolve');
    const hasHumanSteps = steps.some(s => s.action === 'human-review');
    const requiresApproval = hasAgentSteps || hasHumanSteps;

    const plan: ResolutionPlan = {
      prId: pr.id,
      prNumber: pr.number,
      title: pr.title,
      steps,
      estimatedTimeSec: totalTime,
      requiresApproval,
      warnings,
    };

    // Save plan to storage
    if (options.save !== false) {
      const factory = getDefaultStoreFactory();
      const prStore = factory.createPRStore();
      await prStore.savePR({
        ...pr,
        status: 'planned',
        metadata: {
          plan,
          plannedAt: Date.now(),
        },
      });
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      printPlan(plan, options);
    }
  } catch (error) {
    spinner.fail('Planning failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function generateStepForConflict(
  conflict: ConflictInfo,
  order: number,
  _pr: PRMetadata
): Promise<PlanStep> {
  const complexity = conflict.complexity;

  // Determine action based on complexity
  if (complexity <= 2) {
    return {
      order,
      file: conflict.file,
      action: 'auto-merge',
      strategy: 'three-way-merge',
      confidence: 95,
      estimatedTimeSec: 5,
      reason: 'Simple conflict with clear resolution',
    };
  }

  if (complexity <= 7) {
    // AI can handle this
    const strategy = determineStrategy(conflict);
    return {
      order,
      file: conflict.file,
      action: 'ai-resolve',
      agent: strategy.agent,
      strategy: strategy.name,
      confidence: strategy.confidence,
      estimatedTimeSec: complexity * 15,
      reason: strategy.reason,
    };
  }

  // Too complex for AI
  return {
    order,
    file: conflict.file,
    action: 'human-review',
    estimatedTimeSec: complexity * 30,
    reason: 'High complexity - semantic understanding required',
  };
}

function determineStrategy(conflict: ConflictInfo): {
  agent: string;
  name: string;
  confidence: number;
  reason: string;
} {
  const content = conflict.conflictMarkers.toLowerCase();

  // Check for specific patterns
  if (content.includes('import') || content.includes('require')) {
    return {
      agent: 'CoderAgent',
      name: 'import-merge',
      confidence: 85,
      reason: 'Import statement conflicts detected',
    };
  }

  if (content.includes('interface') || content.includes('type ')) {
    return {
      agent: 'CoderAgent',
      name: 'type-merge',
      confidence: 75,
      reason: 'Type definition conflicts detected',
    };
  }

  if (content.includes('function') || content.includes('=>')) {
    return {
      agent: 'CoderAgent',
      name: 'function-merge',
      confidence: 70,
      reason: 'Function implementation conflicts detected',
    };
  }

  if (content.includes('test') || content.includes('describe') || content.includes('it(')) {
    return {
      agent: 'CoderAgent',
      name: 'test-merge',
      confidence: 80,
      reason: 'Test file conflicts detected',
    };
  }

  // Default strategy
  return {
    agent: 'CoderAgent',
    name: 'semantic-merge',
    confidence: 65,
    reason: 'General code conflicts requiring semantic analysis',
  };
}

function printPlan(plan: ResolutionPlan, options: PlanOptions): void {
  console.log();
  console.log(chalk.bold(`Resolution Plan for PR #${plan.prNumber}`));
  console.log(chalk.dim(plan.title));
  console.log();

  // Summary
  const autoSteps = plan.steps.filter(s => s.action === 'auto-merge').length;
  const aiSteps = plan.steps.filter(s => s.action === 'ai-resolve').length;
  const humanSteps = plan.steps.filter(s => s.action === 'human-review').length;

  console.log(chalk.bold('  Summary:'));
  console.log(`    ${chalk.green(autoSteps)} auto-merge | ${chalk.yellow(aiSteps)} AI-resolve | ${chalk.red(humanSteps)} human-review`);
  console.log(`    Estimated time: ${formatTime(plan.estimatedTimeSec)}`);
  console.log(`    Requires approval: ${plan.requiresApproval ? chalk.yellow('Yes') : chalk.green('No')}`);
  console.log();

  // Warnings
  if (plan.warnings.length > 0) {
    console.log(chalk.yellow.bold('  Warnings:'));
    for (const warning of plan.warnings) {
      console.log(chalk.yellow(`    ⚠️  ${warning}`));
    }
    console.log();
  }

  // Steps
  console.log(chalk.bold('  Resolution Steps:'));
  console.log();

  for (const step of plan.steps) {
    const actionColor = step.action === 'auto-merge' ? chalk.green :
      step.action === 'ai-resolve' ? chalk.yellow : chalk.red;
    const actionIcon = step.action === 'auto-merge' ? '⚡' :
      step.action === 'ai-resolve' ? '🤖' : '👤';

    console.log(`  ${chalk.dim(`${step.order}.`)} ${step.file}`);
    console.log(`     ${actionIcon} ${actionColor(formatAction(step.action))}`);

    if (step.strategy) {
      console.log(chalk.dim(`     Strategy: ${step.strategy}`));
    }
    if (step.agent) {
      console.log(chalk.dim(`     Agent: ${step.agent}`));
    }
    if (step.confidence !== undefined) {
      const confColor = step.confidence >= 80 ? chalk.green :
        step.confidence >= 60 ? chalk.yellow : chalk.red;
      console.log(chalk.dim(`     Confidence: ${confColor(`${step.confidence}%`)}`));
    }

    if (options.verbose) {
      console.log(chalk.dim(`     Reason: ${step.reason}`));
      console.log(chalk.dim(`     Est. time: ${formatTime(step.estimatedTimeSec)}`));
    }

    console.log();
  }

  // Next steps
  console.log(chalk.dim('  Next steps:'));
  if (humanSteps === 0) {
    console.log(chalk.dim(`    gwi autopilot ${plan.prNumber}    # Execute this plan`));
  } else {
    console.log(chalk.dim(`    gwi resolve ${plan.prNumber}       # Execute with interactive review`));
    console.log(chalk.dim(`    Review high-risk files manually before proceeding`));
  }
  console.log();
}

function formatAction(action: string): string {
  switch (action) {
    case 'auto-merge': return 'Auto-merge';
    case 'ai-resolve': return 'AI Resolution';
    case 'human-review': return 'Human Review Required';
    default: return action;
  }
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
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
