/**
 * gwi infra command
 *
 * Infrastructure automation with sandbox execution.
 * Inspired by fluid.sh's approach to safe production access.
 *
 * Commands:
 *   gwi infra plan <description>   Plan infrastructure changes
 *   gwi infra execute <plan-id>    Execute a plan in sandbox
 *   gwi infra sandbox list         List active sandboxes
 *   gwi infra sandbox create       Create a new sandbox
 *   gwi infra diff <sandbox-id>    View changes in sandbox
 *   gwi infra snapshot <sandbox-id> Create a snapshot
 *   gwi infra restore <sandbox-id> <snapshot-id>  Restore to snapshot
 *   gwi infra export <sandbox-id>  Export to Terraform
 *   gwi infra approve <run-id>     Approve for production deployment
 *   gwi infra status               Show infra agent status
 */

import chalk from 'chalk';
import ora from 'ora';
import { createInfraAgent, type InfraInput, type InfraTaskType } from '@gwi/agents/infra';

/**
 * Common options for infra commands
 */
export interface InfraOptions {
  verbose?: boolean;
  json?: boolean;
}

/**
 * Options for infra plan command
 */
export interface InfraPlanOptions extends InfraOptions {
  taskType?: string;
  environment?: string;
  baseImage?: string;
  requiresRoot?: boolean;
  timeout?: number;
}

/**
 * Options for sandbox create command
 */
export interface SandboxCreateOptions extends InfraOptions {
  type?: string;
  baseImage?: string;
  memory?: number;
  cpu?: number;
  enableRoot?: boolean;
}

/**
 * Options for export command
 */
export interface ExportOptions extends InfraOptions {
  format?: string;
  provider?: string;
  prefix?: string;
  output?: string;
}

/**
 * gwi infra plan - Plan infrastructure changes
 */
export async function infraPlanCommand(
  description: string,
  options: InfraPlanOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  const agent = createInfraAgent();

  try {
    spinner.start('Initializing infrastructure agent...');
    await agent.initialize();

    spinner.text = 'Planning infrastructure changes...';

    const input: InfraInput = {
      description,
      taskType: (options.taskType as InfraTaskType) ?? 'setup',
      environment: (options.environment as 'development' | 'staging' | 'production') ?? 'development',
      baseImage: options.baseImage ?? 'ubuntu:22.04',
      requiresRoot: options.requiresRoot,
      timeoutMs: options.timeout ? options.timeout * 1000 : undefined,
    };

    const result = await agent.executeInfraTask(input);

    spinner.succeed('Infrastructure plan generated');

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Display plan
    console.log();
    console.log(chalk.bold('Infrastructure Plan'));
    console.log(chalk.dim(`ID: ${result.result.plan.id}`));
    console.log(chalk.dim(`Sandbox: ${result.result.sandboxId}`));
    console.log();

    console.log(chalk.bold('Steps:'));
    for (const step of result.result.plan.steps) {
      const statusIcon = chalk.green('[PLANNED]');
      console.log(`  ${statusIcon} ${step.index}. ${step.description}`);
      if (options.verbose) {
        console.log(chalk.dim(`     Command: ${step.command}`));
        if (step.rollbackCommand) {
          console.log(chalk.dim(`     Rollback: ${step.rollbackCommand}`));
        }
      }
    }
    console.log();

    console.log(chalk.bold('Estimated:'));
    console.log(`  Duration: ${result.result.plan.estimatedDurationSec}s`);
    console.log(`  Resources: ${result.result.plan.resourcesRequired.cpuCores} CPU, ${result.result.plan.resourcesRequired.memoryMb}MB RAM`);
    console.log(`  Confidence: ${result.result.plan.confidence}%`);
    console.log();

    if (result.result.plan.risks.length > 0) {
      console.log(chalk.yellow.bold('Risks:'));
      for (const risk of result.result.plan.risks) {
        console.log(chalk.yellow(`  - ${risk}`));
      }
      console.log();
    }

    if (result.result.diffs.length > 0) {
      console.log(chalk.bold('Changes:'));
      for (const diff of result.result.diffs) {
        const icon = diff.type === 'added' ? chalk.green('+') :
                    diff.type === 'deleted' ? chalk.red('-') :
                    chalk.yellow('~');
        console.log(`  ${icon} ${diff.path}`);
      }
      console.log();
    }

    if (result.result.iac) {
      console.log(chalk.bold('IaC Generated:'));
      console.log(`  Format: ${result.result.iac.format}`);
      console.log(`  Resources: ${result.result.iac.summary.resourceCount}`);
      console.log(`  Files: ${result.result.iac.files.map(f => f.path).join(', ')}`);
      console.log();
    }

    if (result.result.awaitingApproval) {
      console.log(chalk.yellow.bold('Awaiting Approval'));
      console.log(`  Run: ${chalk.cyan(`gwi infra approve ${result.result.sandboxId}`)}`);
    } else if (result.result.success) {
      console.log(chalk.green.bold('Ready for deployment'));
    } else {
      console.log(chalk.red.bold('Plan failed'));
      if (result.result.error) {
        console.log(chalk.red(`  Error: ${result.result.error}`));
      }
    }

  } catch (error) {
    spinner.fail('Infrastructure planning failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  } finally {
    await agent.shutdown();
  }
}

/**
 * gwi infra status - Show infrastructure agent status
 */
export async function infraStatusCommand(options: InfraOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });
  const agent = createInfraAgent();

  try {
    spinner.start('Getting infrastructure agent status...');
    await agent.initialize();

    const status = agent.getStatus();
    const stats = await agent.getStats();
    const card = agent.getAgentCard();

    spinner.succeed('Status retrieved');

    if (options.json) {
      console.log(JSON.stringify({ status, stats, card }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Infrastructure Agent'));
    console.log(chalk.dim(`ID: ${card.id}`));
    console.log(chalk.dim(`Version: ${card.version}`));
    console.log();

    console.log(chalk.bold('Status:'));
    const statusColor = status.status === 'ready' ? chalk.green :
                       status.status === 'error' ? chalk.red : chalk.yellow;
    console.log(`  State: ${statusColor(status.status.toUpperCase())}`);
    if (status.error) {
      console.log(chalk.red(`  Error: ${status.error}`));
    }
    console.log();

    console.log(chalk.bold('Capabilities:'));
    for (const cap of card.capabilities) {
      console.log(`  - ${cap}`);
    }
    console.log();

    console.log(chalk.bold('Statistics:'));
    console.log(`  Total executions: ${stats.total}`);
    console.log(`  Successful: ${stats.successful}`);
    console.log(`  Success rate: ${stats.total > 0 ? ((stats.successful / stats.total) * 100).toFixed(1) : 0}%`);
    console.log(`  Avg steps per task: ${stats.avgStepsPerTask.toFixed(1)}`);
    console.log();

    if (Object.keys(stats.byTaskType).length > 0) {
      console.log(chalk.bold('By Task Type:'));
      for (const [type, count] of Object.entries(stats.byTaskType)) {
        console.log(`  ${type}: ${count}`);
      }
    }

  } catch (error) {
    spinner.fail('Failed to get status');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  } finally {
    await agent.shutdown();
  }
}

/**
 * gwi infra sandbox list - List active sandboxes
 */
export async function infraSandboxListCommand(options: InfraOptions): Promise<void> {
  // This would use @gwi/sandbox in production
  // For now, show placeholder
  if (options.json) {
    console.log(JSON.stringify({ sandboxes: [], message: 'Sandbox provider not yet integrated' }, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('Active Sandboxes'));
  console.log(chalk.dim('No sandboxes currently active'));
  console.log();
  console.log(chalk.dim('Note: Sandbox execution requires @gwi/sandbox package integration'));
  console.log(chalk.dim('Use: gwi infra sandbox create --type docker --base-image ubuntu:22.04'));
}

/**
 * gwi infra sandbox create - Create a new sandbox
 */
export async function infraSandboxCreateCommand(options: SandboxCreateOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start('Creating sandbox...');

    // Placeholder - would use @gwi/sandbox
    const sandboxId = `sbx-${options.type ?? 'docker'}-${Date.now()}`;

    spinner.succeed(`Sandbox created: ${sandboxId}`);

    if (options.json) {
      console.log(JSON.stringify({
        id: sandboxId,
        type: options.type ?? 'docker',
        baseImage: options.baseImage ?? 'ubuntu:22.04',
        status: 'simulated',
        message: 'Sandbox provider not yet integrated',
      }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Sandbox Created'));
    console.log(`  ID: ${chalk.cyan(sandboxId)}`);
    console.log(`  Type: ${options.type ?? 'docker'}`);
    console.log(`  Base Image: ${options.baseImage ?? 'ubuntu:22.04'}`);
    console.log(`  Memory: ${options.memory ?? 1024}MB`);
    console.log(`  CPU: ${options.cpu ?? 2} cores`);
    console.log(`  Root Access: ${options.enableRoot ?? false}`);
    console.log();
    console.log(chalk.dim('Note: This is a simulated sandbox. Full execution requires @gwi/sandbox.'));

  } catch (error) {
    spinner.fail('Failed to create sandbox');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * gwi infra diff - View changes in sandbox
 */
export async function infraDiffCommand(sandboxId: string, options: InfraOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Getting diff for sandbox ${sandboxId}...`);

    // Placeholder
    spinner.succeed('Diff retrieved');

    if (options.json) {
      console.log(JSON.stringify({
        sandboxId,
        diffs: [],
        message: 'Sandbox provider not yet integrated',
      }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold(`Sandbox Diff: ${sandboxId}`));
    console.log(chalk.dim('No changes detected (simulated)'));
    console.log();
    console.log(chalk.dim('Note: Full diff requires @gwi/sandbox integration.'));

  } catch (error) {
    spinner.fail('Failed to get diff');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * gwi infra snapshot - Create a snapshot
 */
export async function infraSnapshotCommand(sandboxId: string, options: InfraOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Creating snapshot for sandbox ${sandboxId}...`);

    const snapshotId = `snap-${sandboxId}-${Date.now()}`;
    spinner.succeed(`Snapshot created: ${snapshotId}`);

    if (options.json) {
      console.log(JSON.stringify({ sandboxId, snapshotId, status: 'simulated' }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Snapshot Created'));
    console.log(`  Sandbox: ${sandboxId}`);
    console.log(`  Snapshot: ${chalk.cyan(snapshotId)}`);
    console.log();
    console.log(chalk.dim('Restore with: gwi infra restore ' + sandboxId + ' ' + snapshotId));

  } catch (error) {
    spinner.fail('Failed to create snapshot');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * gwi infra restore - Restore to snapshot
 */
export async function infraRestoreCommand(
  sandboxId: string,
  snapshotId: string,
  options: InfraOptions
): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Restoring sandbox ${sandboxId} to snapshot ${snapshotId}...`);

    spinner.succeed('Sandbox restored');

    if (options.json) {
      console.log(JSON.stringify({ sandboxId, snapshotId, status: 'simulated' }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Sandbox Restored'));
    console.log(`  Sandbox: ${sandboxId}`);
    console.log(`  Restored to: ${snapshotId}`);

  } catch (error) {
    spinner.fail('Failed to restore snapshot');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * gwi infra export - Export to Terraform
 */
export async function infraExportCommand(sandboxId: string, options: ExportOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Exporting sandbox ${sandboxId} to ${options.format ?? 'terraform'}...`);

    // Generate sample Terraform
    const mainTf = `# Generated by GWI Infrastructure Agent
# Sandbox: ${sandboxId}
# Generated at: ${new Date().toISOString()}

terraform {
  required_version = ">= 1.0"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

# No resources to export (simulated sandbox)
`;

    spinner.succeed('Export complete');

    if (options.json) {
      console.log(JSON.stringify({
        sandboxId,
        format: options.format ?? 'terraform',
        files: [{ path: 'main.tf', content: mainTf }],
      }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Terraform Export'));
    console.log();
    console.log(mainTf);
    console.log();

    if (options.output) {
      console.log(chalk.dim(`Output would be written to: ${options.output}`));
    }

  } catch (error) {
    spinner.fail('Failed to export');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * gwi infra approve - Approve for production deployment
 */
export async function infraApproveCommand(runId: string, options: InfraOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });

  try {
    spinner.start(`Approving infrastructure changes for ${runId}...`);

    // In production, this would:
    // 1. Validate the approval token
    // 2. Apply Terraform/changes to production
    // 3. Return deployment result

    spinner.succeed('Approved for deployment');

    if (options.json) {
      console.log(JSON.stringify({
        runId,
        approved: true,
        deployedAt: new Date().toISOString(),
        status: 'simulated',
      }, null, 2));
      return;
    }

    console.log();
    console.log(chalk.green.bold('Infrastructure Changes Approved'));
    console.log(`  Run ID: ${runId}`);
    console.log(`  Status: ${chalk.yellow('Simulated')}`);
    console.log();
    console.log(chalk.dim('Note: Production deployment requires full @gwi/sandbox integration.'));

  } catch (error) {
    spinner.fail('Failed to approve');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
