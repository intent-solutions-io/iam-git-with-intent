/**
 * Diagnose Command
 *
 * Phase 8: Operator-grade diagnostics for debugging specific runs.
 *
 * Shows:
 * - Run metadata (id, type, status, duration)
 * - Step progression and timing
 * - Last N audit events
 * - Error details and policy denial reasons
 * - Recommended next actions
 *
 * @module @gwi/cli/commands/diagnose
 */

import chalk from 'chalk';
import { getDefaultStoreFactory } from '@gwi/core';
import type { Run, RunStep } from '@gwi/core';

/**
 * Diagnose command options
 */
export interface DiagnoseOptions {
  json?: boolean;
  verbose?: boolean;
  limit?: number; // Number of audit events to show
}

/**
 * Diagnosis report
 */
interface DiagnoseReport {
  runId: string;
  found: boolean;
  run?: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string;
    durationMs?: number;
    currentStep?: string;
    error?: string;
    steps: {
      agent: string;
      status: string;
      durationMs?: number;
      error?: string;
    }[];
  };
  auditEvents?: {
    timestamp: string;
    event: string;
    agent?: string;
    data?: Record<string, unknown>;
  }[];
  recommendations: string[];
}

/**
 * Get recommended actions based on run state
 */
function getRecommendations(run: Run): string[] {
  const recommendations: string[] = [];

  switch (run.status) {
    case 'running':
      recommendations.push('Run is still in progress - wait for completion');
      if (run.currentStep) {
        recommendations.push(`Currently on step: ${run.currentStep}`);
      }
      break;

    case 'pending':
      recommendations.push('Run is pending - may need to trigger workflow start');
      break;

    case 'failed':
      if (run.error) {
        if (run.error.includes('rate limit') || run.error.includes('Rate limit')) {
          recommendations.push('Wait and retry - rate limit encountered');
        } else if (run.error.includes('token') || run.error.includes('API key')) {
          recommendations.push('Check API key configuration: gwi doctor');
        } else if (run.error.includes('policy') || run.error.includes('POLICY_DENIED')) {
          recommendations.push('Review policy configuration or request elevated permissions');
        } else if (run.error.includes('timeout') || run.error.includes('TIMEOUT')) {
          recommendations.push('Retry with smaller scope or increased timeout');
        } else {
          recommendations.push('Review error details and retry: gwi run retry <run-id>');
        }
      }
      recommendations.push('Check logs for more details: gwi run logs <run-id>');
      break;

    case 'completed':
      recommendations.push('Run completed successfully');
      const hasUncompletedSteps = run.steps.some((s) => s.status !== 'completed');
      if (hasUncompletedSteps) {
        recommendations.push('Some steps were skipped - review step details');
      }
      break;

    case 'cancelled':
      recommendations.push('Run was cancelled - restart if needed: gwi run restart <run-id>');
      break;

    default:
      recommendations.push('Unknown status - check run details manually');
  }

  return recommendations;
}

/**
 * Execute the diagnose command
 */
export async function diagnoseCommand(runId: string, options: DiagnoseOptions): Promise<void> {
  const factory = getDefaultStoreFactory();
  const runStore = factory.createRunStore();
  const prStore = factory.createPRStore();

  // Try to find the run across all PRs
  let foundRun: Run | null = null;

  // Search through recent PRs to find the run
  const recentPRs = await prStore.listPRs({ limit: 50 });
  for (const pr of recentPRs) {
    const runs = await runStore.listRuns(pr.id, 100);
    const match = runs.find((r) => r.id === runId);
    if (match) {
      foundRun = match;
      break;
    }
  }

  // Build report
  const report: DiagnoseReport = {
    runId,
    found: !!foundRun,
    recommendations: [],
  };

  if (foundRun) {
    report.run = {
      id: foundRun.id,
      type: foundRun.type,
      status: foundRun.status,
      createdAt: foundRun.createdAt.toISOString(),
      completedAt: foundRun.completedAt?.toISOString(),
      durationMs: foundRun.durationMs,
      currentStep: foundRun.currentStep,
      error: foundRun.error,
      steps: foundRun.steps.map((s: RunStep) => ({
        agent: s.agent,
        status: s.status,
        durationMs: s.durationMs,
        error: s.error,
      })),
    };

    report.recommendations = getRecommendations(foundRun);

    // Simulate audit events from steps (in a real implementation, these would come from a separate audit store)
    report.auditEvents = foundRun.steps
      .filter((s: RunStep) => s.status !== 'pending')
      .map((s: RunStep) => ({
        timestamp: foundRun!.createdAt.toISOString(),
        event: `step:${s.status}`,
        agent: s.agent,
        data: s.output ? { hasOutput: true } : undefined,
      }));
  } else {
    report.recommendations = [
      'Run not found in recent history',
      'Check run ID is correct',
      'Run may have been pruned - check logs directly',
    ];
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.blue.bold('\n  Git With Intent - Diagnose\n'));
  console.log(chalk.dim(`  Run ID: ${runId}`));
  console.log();

  if (!foundRun) {
    console.log(chalk.red('  ✗ Run not found\n'));
    console.log(chalk.bold('  Recommendations:'));
    for (const rec of report.recommendations) {
      console.log(`    - ${rec}`);
    }
    console.log();
    process.exit(1);
  }

  // Run metadata
  console.log(chalk.bold('  Run Details:'));
  const statusIcon =
    foundRun.status === 'completed' ? chalk.green('✓') :
    foundRun.status === 'running' ? chalk.yellow('●') :
    foundRun.status === 'failed' ? chalk.red('✗') :
    chalk.dim('○');

  console.log(`    Status: ${statusIcon} ${foundRun.status}`);
  console.log(`    Type: ${foundRun.type}`);
  console.log(`    Created: ${foundRun.createdAt.toLocaleString()}`);

  if (foundRun.completedAt) {
    console.log(`    Completed: ${foundRun.completedAt.toLocaleString()}`);
  }
  if (foundRun.durationMs) {
    console.log(`    Duration: ${(foundRun.durationMs / 1000).toFixed(2)}s`);
  }
  if (foundRun.currentStep) {
    console.log(`    Current Step: ${foundRun.currentStep}`);
  }

  // Error details
  if (foundRun.error) {
    console.log();
    console.log(chalk.bold('  Error:'));
    console.log(chalk.red(`    ${foundRun.error}`));
  }

  // Steps
  if (foundRun.steps.length > 0) {
    console.log();
    console.log(chalk.bold('  Steps:'));
    for (const step of foundRun.steps) {
      const stepIcon =
        step.status === 'completed' ? chalk.green('✓') :
        step.status === 'running' ? chalk.yellow('●') :
        step.status === 'failed' ? chalk.red('✗') :
        chalk.dim('○');

      const duration = step.durationMs ? chalk.dim(` (${(step.durationMs / 1000).toFixed(2)}s)`) : '';
      console.log(`    ${stepIcon} ${step.agent}${duration}`);

      if (step.error && options.verbose) {
        console.log(chalk.red(`      Error: ${step.error}`));
      }
    }
  }

  // Audit events
  if (report.auditEvents && report.auditEvents.length > 0 && options.verbose) {
    console.log();
    console.log(chalk.bold('  Audit Events:'));
    const limit = options.limit || 10;
    for (const event of report.auditEvents.slice(0, limit)) {
      console.log(chalk.dim(`    ${event.timestamp} | ${event.event} | ${event.agent || '-'}`));
    }
    if (report.auditEvents.length > limit) {
      console.log(chalk.dim(`    ... and ${report.auditEvents.length - limit} more`));
    }
  }

  // Recommendations
  console.log();
  console.log(chalk.bold('  Recommendations:'));
  for (const rec of report.recommendations) {
    console.log(`    → ${rec}`);
  }

  console.log();
}
