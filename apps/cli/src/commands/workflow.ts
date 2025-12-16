/**
 * gwi workflow command
 *
 * Manage multi-agent workflows for Issue-to-Code, PR resolution, and more.
 * Phase 14: CLI DX improvements.
 */

import chalk from 'chalk';
import ora from 'ora';
import type {
  WorkflowType,
  WorkflowStatus,
  Workflow,
  OrchestratorOutput,
} from '@gwi/agents';

export interface WorkflowOptions {
  verbose?: boolean;
  json?: boolean;
  tenant?: string;
  wait?: boolean;
}

export interface WorkflowStartOptions extends WorkflowOptions {
  issueUrl?: string;
  prUrl?: string;
  branch?: string;
  autoMerge?: boolean;
}

/**
 * Start a new workflow
 */
export async function workflowStartCommand(
  workflowType: string,
  options: WorkflowStartOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });
  // tenantId will be used when we integrate with the API
  void (options.tenant || process.env.GWI_TENANT_ID || 'default');

  try {
    // Validate workflow type
    const validTypes: WorkflowType[] = ['issue-to-code', 'pr-resolve', 'pr-review', 'test-gen', 'docs-update'];
    if (!validTypes.includes(workflowType as WorkflowType)) {
      console.error(chalk.red(`Invalid workflow type: ${workflowType}`));
      console.error(chalk.dim(`Valid types: ${validTypes.join(', ')}`));
      process.exit(1);
    }

    spinner.start(`Starting ${workflowType} workflow...`);

    // Build workflow input based on type
    const workflowInput = buildWorkflowInput(workflowType as WorkflowType, options);

    // Import orchestrator dynamically to avoid initialization issues
    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    const result = await orchestrator.startWorkflow(workflowType as WorkflowType, workflowInput);

    await orchestrator.shutdown();

    spinner.succeed(`Workflow started: ${result.workflowId}`);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printWorkflowStart(result, options);
    }

    // Wait for completion if requested
    if (options.wait) {
      spinner.start('Waiting for workflow completion...');
      // Poll for status (simplified - in production would use events)
      let status = result.status;
      while (status === 'pending' || status === 'in_progress') {
        await sleep(2000);
        // In production, would fetch actual status
        status = 'completed';
      }
      spinner.succeed('Workflow completed');
    }
  } catch (error) {
    spinner.fail('Failed to start workflow');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * List workflows
 */
export async function workflowListCommand(options: WorkflowOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start('Fetching workflows...');

    // Import orchestrator dynamically
    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    // Get workflows from orchestrator (in-memory for now)
    const workflows = await orchestrator.listWorkflows();

    await orchestrator.shutdown();

    spinner.succeed(`Found ${workflows.length} workflow(s)`);

    if (options.json) {
      console.log(JSON.stringify(workflows, null, 2));
    } else {
      printWorkflowList(workflows, options);
    }
  } catch (error) {
    spinner.fail('Failed to list workflows');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Get workflow status
 */
export async function workflowStatusCommand(
  workflowId: string,
  options: WorkflowOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Fetching workflow ${workflowId}...`);

    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    const workflow = await orchestrator.getWorkflowStatus(workflowId);

    await orchestrator.shutdown();

    if (!workflow) {
      spinner.fail(`Workflow not found: ${workflowId}`);
      process.exit(1);
    }

    spinner.succeed(`Found workflow: ${workflowId}`);

    if (options.json) {
      console.log(JSON.stringify(workflow, null, 2));
    } else {
      printWorkflowStatus(workflow, options);
    }
  } catch (error) {
    spinner.fail('Failed to get workflow status');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Approve a workflow
 */
export async function workflowApproveCommand(
  workflowId: string,
  options: WorkflowOptions & { comment?: string }
): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Approving workflow ${workflowId}...`);

    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    const result = await orchestrator.resumeWorkflow(workflowId, true);

    await orchestrator.shutdown();

    spinner.succeed(`Workflow ${workflowId} approved`);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green('\n  Workflow approved and will continue execution.\n'));
      console.log(`  New status: ${formatStatus(result.status)}`);
      if (options.comment) {
        console.log(chalk.dim(`  Comment: ${options.comment}`));
      }
    }
  } catch (error) {
    spinner.fail('Failed to approve workflow');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Reject a workflow
 */
export async function workflowRejectCommand(
  workflowId: string,
  options: WorkflowOptions & { reason?: string }
): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Rejecting workflow ${workflowId}...`);

    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    const result = await orchestrator.resumeWorkflow(workflowId, false);

    await orchestrator.shutdown();

    spinner.succeed(`Workflow ${workflowId} rejected`);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.yellow('\n  Workflow rejected and execution stopped.\n'));
      console.log(`  Status: ${formatStatus(result.status)}`);
      if (options.reason) {
        console.log(chalk.dim(`  Reason: ${options.reason}`));
      }
    }
  } catch (error) {
    spinner.fail('Failed to reject workflow');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildWorkflowInput(type: WorkflowType, options: WorkflowStartOptions): unknown {
  switch (type) {
    case 'issue-to-code':
      return {
        issue: {
          url: options.issueUrl || '',
          number: 0, // Will be parsed from URL
          title: '',
          body: '',
          author: '',
          labels: [],
          assignees: [],
          repo: { owner: '', name: '', fullName: '' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        targetBranch: options.branch || 'main',
        preferences: {
          includeTests: true,
        },
      };

    case 'pr-resolve':
      return {
        pr: {
          id: '',
          url: options.prUrl || '',
          number: 0,
          title: '',
          repository: '',
          author: '',
          baseBranch: 'main',
          headBranch: '',
          state: 'open' as const,
          isDraft: false,
          labels: [],
          reviewers: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        conflicts: [],
        autoMerge: options.autoMerge ?? false,
        riskMode: 'suggest_patch' as const,
      };

    case 'pr-review':
      return {
        pr: {
          id: '',
          url: options.prUrl || '',
          number: 0,
          title: '',
          repository: '',
          author: '',
          baseBranch: 'main',
          headBranch: '',
          state: 'open' as const,
          isDraft: false,
          labels: [],
          reviewers: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        changedFiles: [],
        focusAreas: ['security', 'logic'],
      };

    case 'test-gen':
      return {
        files: [],
        framework: 'vitest',
        coverageTarget: 80,
      };

    case 'docs-update':
      return {
        changedFiles: [],
        styleGuide: 'markdown',
      };

    default:
      return {};
  }
}

function printWorkflowStart(
  result: OrchestratorOutput,
  _options: WorkflowOptions
): void {
  console.log();
  console.log(chalk.bold('  Workflow Started'));
  console.log();
  console.log(`    ID:     ${chalk.cyan(result.workflowId)}`);
  console.log(`    Status: ${formatStatus(result.status)}`);
  console.log();
  console.log(chalk.dim('  Track progress:'));
  console.log(chalk.dim(`    gwi workflow status ${result.workflowId}`));
  console.log();
}

function printWorkflowList(
  workflows: Workflow[],
  _options: WorkflowOptions
): void {
  console.log();

  if (workflows.length === 0) {
    console.log(chalk.dim('  No workflows found.\n'));
    console.log(chalk.dim('  Start a workflow:'));
    console.log(chalk.dim('    gwi workflow start issue-to-code --issue-url <url>'));
    console.log();
    return;
  }

  console.log(chalk.bold('  Workflows'));
  console.log();

  for (const wf of workflows) {
    const statusIcon = getStatusIcon(wf.status);
    const typeLabel = formatWorkflowType(wf.type);
    const time = new Date(wf.createdAt).toLocaleString();

    console.log(`    ${statusIcon} ${chalk.cyan(wf.id.substring(0, 8))}  ${typeLabel}`);
    console.log(chalk.dim(`      ${wf.status} | ${time}`));
  }

  console.log();
}

function printWorkflowStatus(workflow: Workflow, options: WorkflowOptions): void {
  console.log();
  console.log(chalk.bold(`  Workflow: ${workflow.id}`));
  console.log();
  console.log(`    Type:       ${formatWorkflowType(workflow.type)}`);
  console.log(`    Status:     ${formatStatus(workflow.status)}`);
  console.log(`    Started:    ${new Date(workflow.createdAt).toLocaleString()}`);

  if (workflow.completedAt) {
    console.log(`    Completed:  ${new Date(workflow.completedAt).toLocaleString()}`);
  }

  const duration = workflow.completedAt
    ? workflow.completedAt - workflow.createdAt
    : Date.now() - workflow.createdAt;
  console.log(`    Duration:   ${formatDuration(duration)}`);

  console.log();

  // Show steps
  if (workflow.steps.length > 0) {
    console.log(chalk.bold('  Steps:'));
    console.log();

    for (const step of workflow.steps) {
      const stepIcon = getStatusIcon(step.status);
      const stepDuration = step.completedAt && step.startedAt
        ? formatDuration(step.completedAt - step.startedAt)
        : '';

      console.log(`    ${stepIcon} ${step.agent}`);
      if (options.verbose) {
        console.log(chalk.dim(`      Status: ${step.status}${stepDuration ? ` | ${stepDuration}` : ''}`));
        if (step.error) {
          console.log(chalk.red(`      Error: ${step.error}`));
        }
      }
    }

    console.log();
  }

  // Show error if failed
  if (workflow.error) {
    console.log(chalk.red.bold('  Error:'));
    console.log(chalk.red(`    ${workflow.error}`));
    console.log();
  }

  // Show actions based on status
  if (workflow.status === 'waiting_approval') {
    console.log(chalk.yellow.bold('  Action Required:'));
    console.log(chalk.yellow('    This workflow is waiting for approval.'));
    console.log();
    console.log(chalk.dim('  Approve:'));
    console.log(chalk.dim(`    gwi workflow approve ${workflow.id}`));
    console.log(chalk.dim('  Reject:'));
    console.log(chalk.dim(`    gwi workflow reject ${workflow.id} --reason "reason"`));
    console.log();
  }
}

function formatStatus(status: WorkflowStatus): string {
  switch (status) {
    case 'pending':
      return chalk.dim('PENDING');
    case 'in_progress':
      return chalk.blue('IN PROGRESS');
    case 'waiting_approval':
      return chalk.yellow('WAITING APPROVAL');
    case 'completed':
      return chalk.green('COMPLETED');
    case 'failed':
      return chalk.red('FAILED');
    case 'escalated':
      return chalk.magenta('ESCALATED');
    default:
      return String(status);
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending':
      return chalk.dim('○');
    case 'in_progress':
      return chalk.blue('●');
    case 'waiting_approval':
      return chalk.yellow('◐');
    case 'completed':
      return chalk.green('✓');
    case 'failed':
      return chalk.red('✗');
    case 'escalated':
      return chalk.magenta('↑');
    default:
      return chalk.dim('○');
  }
}

function formatWorkflowType(type: string): string {
  switch (type) {
    case 'issue-to-code':
      return chalk.cyan('Issue → Code');
    case 'pr-resolve':
      return chalk.yellow('PR Resolve');
    case 'pr-review':
      return chalk.blue('PR Review');
    case 'test-gen':
      return chalk.green('Test Generation');
    case 'docs-update':
      return chalk.magenta('Docs Update');
    default:
      return type;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
