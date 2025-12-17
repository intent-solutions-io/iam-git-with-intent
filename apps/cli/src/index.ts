#!/usr/bin/env node

/**
 * Git With Intent CLI
 *
 * AI-powered DevOps automation platform.
 * Handles PRs, merge conflicts, and issue-to-PR workflows.
 *
 * Commands:
 *   gwi init               Initialize GWI in a repository
 *   gwi triage [pr-url]    Analyze PR complexity and routing
 *   gwi plan [pr-url]      Generate resolution plan
 *   gwi resolve <pr-url>   Full conflict resolution workflow
 *   gwi review [pr-url]    Review AI-generated resolutions
 *   gwi autopilot [pr-url] Fully automated resolution pipeline
 *   gwi diff [pr-url]      Analyze PR conflicts with AI
 *   gwi apply [pr-url]     Apply AI-generated resolutions
 *   gwi status             Show agent status
 *   gwi workflow <cmd>     Manage multi-agent workflows
 *   gwi config <cmd>       Manage CLI configuration
 *
 * Phase 14: Enhanced CLI with workflow management, configuration,
 * and improved developer experience.
 *
 * IMPORTANT: This CLI works without AgentFS or Beads.
 * It uses pluggable storage (SQLite by default).
 * Set GWI_STORAGE to change storage backend.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { triageCommand } from './commands/triage.js';
import { planCommand } from './commands/plan.js';
import { diffCommand } from './commands/diff.js';
import { applyCommand } from './commands/apply.js';
import { resolveCommand } from './commands/resolve.js';
import { reviewCommand } from './commands/review.js';
import { autopilotCommand } from './commands/autopilot.js';
import { statusCommand } from './commands/status.js';
import { initCommand } from './commands/init.js';
import { issueToCodeCommand } from './commands/issue-to-code.js';
import {
  workflowStartCommand,
  workflowListCommand,
  workflowStatusCommand,
  workflowApproveCommand,
  workflowRejectCommand,
} from './commands/workflow.js';
import {
  configShowCommand,
  configSetCommand,
  configGetCommand,
  configResetCommand,
  configListCommand,
} from './commands/config.js';
import {
  runStatusCommand,
  runListCommand,
  runApproveCommand,
} from './commands/run.js';
import { doctorCommand } from './commands/doctor.js';
import { diagnoseCommand } from './commands/diagnose.js';
import {
  connectorSearchCommand,
  connectorInfoCommand,
  connectorInstallCommand,
  connectorUninstallCommand,
  connectorListCommand,
  connectorAddKeyCommand,
  connectorListKeysCommand,
  connectorRemoveKeyCommand,
  connectorPublishCommand,
  connectorOutdatedCommand,
  connectorUpdateCommand,
} from './commands/connector.js';

const program = new Command();

program
  .name('gwi')
  .description('Git With Intent - AI-powered DevOps automation')
  .version('0.1.0');

// =============================================================================
// Primary Workflow Commands
// =============================================================================

// Triage command - first step, analyze complexity
program
  .command('triage [pr-url]')
  .description('Analyze PR complexity and determine resolution strategy')
  .option('-v, --verbose', 'Show detailed analysis')
  .option('--json', 'Output as JSON')
  .option('--no-save', 'Do not save triage results')
  .action(async (prUrl, options) => {
    try {
      await triageCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Plan command - generate resolution plan
program
  .command('plan [pr-url]')
  .description('Generate a resolution plan for PR conflicts')
  .option('-v, --verbose', 'Show detailed plan')
  .option('--json', 'Output as JSON')
  .option('--no-save', 'Do not save plan')
  .action(async (prUrl, options) => {
    try {
      await planCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Resolve command - full workflow with interactive approval
program
  .command('resolve <pr-url>')
  .description('Full AI-powered conflict resolution workflow')
  .option('-d, --dry-run', 'Analyze without making changes')
  .option('-v, --verbose', 'Show detailed output')
  .option('--no-approval', 'Skip human approval step')
  .action(async (prUrl, options) => {
    try {
      await resolveCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Review command - review resolutions before applying
program
  .command('review [pr-url]')
  .description('Review AI-generated resolutions')
  .option('-v, --verbose', 'Show detailed review with diffs')
  .option('--json', 'Output as JSON')
  .option('-f, --file <file>', 'Review specific file only')
  .option('--approve', 'Approve all resolutions')
  .option('--reject', 'Reject all resolutions')
  .action(async (prUrl, options) => {
    try {
      await reviewCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Autopilot command - fully automated pipeline
program
  .command('autopilot [pr-url]')
  .description('Fully automated resolution pipeline (triage -> plan -> resolve -> review)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .option('-d, --dry-run', 'Analyze without making changes')
  .option('--skip-review', 'Skip review step (not recommended)')
  .option('--max-complexity <n>', 'Maximum complexity to auto-resolve (default: 8)', parseInt)
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (prUrl, options) => {
    try {
      await autopilotCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Issue-to-code command - generate code from GitHub issue
program
  .command('issue-to-code <issue-url>')
  .description('Generate code from a GitHub issue (Phase 4)')
  .option('-d, --dry-run', 'Run without calling LLMs (creates mock artifacts)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .option('--skip-triage', 'Skip triage step')
  .option('--complexity <n>', 'Use specific complexity (1-10, requires --skip-triage)', parseInt)
  .action(async (issueUrl, options) => {
    try {
      await issueToCodeCommand(issueUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Project Setup Commands
// =============================================================================

// Init command - initialize GWI in a repository
program
  .command('init')
  .description('Initialize Git With Intent in the current repository')
  .option('-f, --force', 'Reinitialize even if already initialized')
  .option('--minimal', 'Create minimal configuration')
  .option('--tenant <id>', 'Set tenant ID')
  .option('--workflow <type>', 'Enable specific workflow (issue-to-code, pr-resolve, pr-review, all)')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Workflow Commands
// =============================================================================

const workflowCmd = program
  .command('workflow')
  .description('Manage multi-agent workflows');

workflowCmd
  .command('start <type>')
  .description('Start a new workflow (issue-to-code, pr-resolve, pr-review, test-gen, docs-update)')
  .option('--issue-url <url>', 'GitHub issue URL (for issue-to-code)')
  .option('--pr-url <url>', 'GitHub PR URL (for pr-resolve, pr-review)')
  .option('--branch <name>', 'Target branch')
  .option('--auto-merge', 'Auto-merge on success')
  .option('--wait', 'Wait for workflow completion')
  .option('--tenant <id>', 'Tenant ID')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (type, options) => {
    try {
      await workflowStartCommand(type, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

workflowCmd
  .command('list')
  .description('List recent workflows')
  .option('--tenant <id>', 'Tenant ID')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      await workflowListCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

workflowCmd
  .command('status <workflow-id>')
  .description('Get workflow status and details')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (workflowId, options) => {
    try {
      await workflowStatusCommand(workflowId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

workflowCmd
  .command('approve <workflow-id>')
  .description('Approve a workflow waiting for approval')
  .option('--comment <text>', 'Approval comment')
  .option('--json', 'Output as JSON')
  .action(async (workflowId, options) => {
    try {
      await workflowApproveCommand(workflowId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

workflowCmd
  .command('reject <workflow-id>')
  .description('Reject a workflow waiting for approval')
  .option('--reason <text>', 'Rejection reason')
  .option('--json', 'Output as JSON')
  .action(async (workflowId, options) => {
    try {
      await workflowRejectCommand(workflowId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Configuration Commands
// =============================================================================

const configCmd = program
  .command('config')
  .description('Manage CLI configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .option('-g, --global', 'Use global configuration')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await configShowCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .option('-g, --global', 'Use global configuration')
  .action(async (key, value, options) => {
    try {
      await configSetCommand(key, value, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .option('-g, --global', 'Use global configuration')
  .option('--json', 'Output as JSON')
  .action(async (key, options) => {
    try {
      await configGetCommand(key, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

configCmd
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-g, --global', 'Use global configuration')
  .action(async (options) => {
    try {
      await configResetCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

configCmd
  .command('list')
  .description('List all configuration keys')
  .option('-g, --global', 'Use global configuration')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await configListCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Run Commands
// =============================================================================

const runCmd = program
  .command('run')
  .description('Manage run artifacts and approvals');

runCmd
  .command('status <run-id>')
  .description('Show run status and details')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (runId, options) => {
    try {
      await runStatusCommand(runId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

runCmd
  .command('list')
  .description('List recent runs')
  .option('--json', 'Output as JSON')
  .option('-l, --limit <n>', 'Limit number of runs', parseInt)
  .action(async (options) => {
    try {
      await runListCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

runCmd
  .command('approve <run-id>')
  .description('Approve run for commit/push operations')
  .option('--scope <scopes...>', 'Approval scope (commit, push, open_pr, merge)')
  .option('-m, --comment <text>', 'Approval comment')
  .option('--json', 'Output as JSON')
  .action(async (runId, options) => {
    try {
      await runApproveCommand(runId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Operator Commands (Phase 8)
// =============================================================================

// Doctor command - environment health check
program
  .command('doctor')
  .description('Check environment health and configuration')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await doctorCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Diagnose command - debug a specific run
program
  .command('diagnose <run-id>')
  .description('Diagnose a specific run for troubleshooting')
  .option('-v, --verbose', 'Show detailed output including audit events')
  .option('-l, --limit <n>', 'Number of audit events to show', parseInt)
  .option('--json', 'Output as JSON')
  .action(async (runId, options) => {
    try {
      await diagnoseCommand(runId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Connector Commands (Phase 9)
// =============================================================================

const connectorCmd = program
  .command('connector')
  .description('Manage connectors from remote registries');

connectorCmd
  .command('search <query>')
  .description('Search for connectors in the registry')
  .option('--registry <url>', 'Custom registry URL')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .option('-l, --limit <n>', 'Max results', parseInt)
  .action(async (query, options) => {
    try {
      await connectorSearchCommand(query, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('info <connector-id>')
  .description('Get connector information')
  .option('--registry <url>', 'Custom registry URL')
  .option('--json', 'Output as JSON')
  .option('--all-versions', 'Show all versions')
  .action(async (connectorId, options) => {
    try {
      await connectorInfoCommand(connectorId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('install <spec>')
  .description('Install a connector (e.g., github@1.0.0)')
  .option('--registry <url>', 'Custom registry URL')
  .option('--skip-signature', 'Skip signature verification (not recommended)')
  .option('-f, --force', 'Force reinstall if already installed')
  .option('--json', 'Output as JSON')
  .action(async (spec, options) => {
    try {
      await connectorInstallCommand(spec, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('uninstall <spec>')
  .description('Uninstall a connector (e.g., github@1.0.0)')
  .option('--json', 'Output as JSON')
  .action(async (spec, options) => {
    try {
      await connectorUninstallCommand(spec, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('list')
  .description('List installed connectors')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      await connectorListCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('add-key <key-id> <public-key>')
  .description('Add a trusted signing key')
  .option('--description <text>', 'Key description')
  .option('--expires <date>', 'Expiration date (ISO format)')
  .option('--json', 'Output as JSON')
  .action(async (keyId, publicKey, options) => {
    try {
      await connectorAddKeyCommand(keyId, publicKey, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('list-keys')
  .description('List trusted signing keys')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await connectorListKeysCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

connectorCmd
  .command('remove-key <key-id>')
  .description('Remove a trusted signing key')
  .option('--json', 'Output as JSON')
  .action(async (keyId, options) => {
    try {
      await connectorRemoveKeyCommand(keyId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Phase 10: Publish command
connectorCmd
  .command('publish')
  .description('Publish a connector to a registry')
  .option('--registry <url>', 'Registry URL', 'http://localhost:3456')
  .option('--path <dir>', 'Connector directory', process.cwd())
  .option('--key <keyId>', 'Signing key ID (required)')
  .option('--dry-run', 'Show what would be published without uploading')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await connectorPublishCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Phase 10: Outdated command
connectorCmd
  .command('outdated')
  .description('Check for connector updates')
  .option('--registry <url>', 'Custom registry URL')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await connectorOutdatedCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Phase 10: Update command
connectorCmd
  .command('update <spec>')
  .description('Update a connector (e.g., github or github@2.0.0)')
  .option('--registry <url>', 'Custom registry URL')
  .option('--skip-signature', 'Skip signature verification (not recommended)')
  .option('--dry-run', 'Show what would be updated without installing')
  .option('--json', 'Output as JSON')
  .action(async (spec, options) => {
    try {
      await connectorUpdateCommand(spec, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Utility Commands
// =============================================================================

// Diff command - analyze conflicts
program
  .command('diff [pr-url]')
  .description('Analyze PR conflicts and show AI-powered diff')
  .option('-v, --verbose', 'Show detailed analysis')
  .option('--no-color', 'Disable colored output')
  .option('--json', 'Output as JSON')
  .action(async (prUrl, options) => {
    try {
      await diffCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Apply command - apply resolutions
program
  .command('apply [pr-url]')
  .description('Apply AI-generated conflict resolutions')
  .option('-f, --force', 'Apply without confirmation')
  .option('-d, --dry-run', 'Show what would be applied without making changes')
  .option('-o, --output <dir>', 'Output directory for resolved files')
  .option('--skip-review', 'Skip reviewer validation (not recommended)')
  .option('--json', 'Output as JSON')
  .action(async (prUrl, options) => {
    try {
      await applyCommand(prUrl, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show agent status and recent activity')
  .option('--agent <name>', 'Show status for a specific agent')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Help text
// =============================================================================

program.addHelpText('after', `
Examples:
  $ gwi init                                        # Initialize in repo
  $ gwi triage https://github.com/owner/repo/pull/123
  $ gwi issue-to-code https://github.com/owner/repo/issues/123
  $ gwi issue-to-code owner/repo#123 --dry-run
  $ gwi workflow list
  $ gwi config show

Issue-to-Code Workflow:
  gwi issue-to-code <issue-url>          Generate code from GitHub issue
  gwi issue-to-code <url> --dry-run      Run without LLM calls (testing)

  Output: Artifacts written to workspace/runs/<run-id>/
    - plan.md:        Change plan from LLM
    - patch-*.txt:    Proposed code changes

PR Resolution Workflow:
  1. gwi triage   - Analyze complexity (optional, autopilot includes this)
  2. gwi plan     - See what will happen (optional)
  3. gwi autopilot - Run full pipeline, or
     gwi resolve  - Run with interactive approval
  4. gwi review   - Review results (included in autopilot)
  5. gwi apply    - Apply resolutions to repo

Multi-Agent Workflows:
  gwi workflow start <type>     Start a workflow
  gwi workflow list             List workflows
  gwi workflow status <id>      Get workflow status
  gwi workflow approve <id>     Approve pending workflow
  gwi workflow reject <id>      Reject pending workflow

  Workflow types: issue-to-code, pr-resolve, pr-review, test-gen, docs-update

Configuration:
  gwi config show               Show current config
  gwi config set <key> <value>  Set a config value
  gwi config get <key>          Get a config value
  gwi config list               List all keys
  gwi config reset              Reset to defaults

Run Management:
  gwi run list                  List recent runs
  gwi run status <run-id>       Show run status and details
  gwi run approve <run-id>      Approve run for commit/push

Operator Tools:
  gwi doctor                    Check environment health
  gwi diagnose <run-id>         Debug a specific run

Environment:
  GWI_STORAGE    Storage backend (sqlite, turso, postgres, firestore, memory)
  GWI_DATA_DIR   Data directory (default: ~/.gwi)
  GWI_TENANT_ID  Default tenant ID for SaaS mode
  GITHUB_TOKEN   GitHub API token (or use gh auth)
`);

// Parse and execute
program.parse();
