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
 * Uses pluggable storage (SQLite by default).
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
  automationShowCommand,
  automationLabelsAddCommand,
  automationLabelsRemoveCommand,
  automationCommandsAddCommand,
  automationKeywordsAddCommand,
  automationApprovalModeCommand,
  automationSmartThresholdCommand,
  automationMaxRunsCommand,
  automationEnableCommand,
  automationDisableCommand,
} from './commands/automation.js';
import {
  runStatusCommand,
  runListCommand,
  runApproveCommand,
} from './commands/run.js';
import {
  approvalApproveCommand,
  approvalDenyCommand,
  approvalRevokeCommand,
  approvalListCommand,
  approvalCheckCommand,
} from './commands/approval.js';
import {
  plannerGenerateCommand,
  plannerValidateCommand,
  plannerStatusCommand,
} from './commands/planner.js';
import { registerForensicsCommands } from './commands/forensics.js';
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
import {
  explainCommand,
} from './commands/explain.js';
import { gateCommand } from './commands/gate.js';
import {
  hooksInstallCommand,
  hooksUninstallCommand,
  hooksStatusCommand,
} from './commands/hooks.js';
import {
  simulateCommand,
  simulateCompareCommand,
  simulateWhatIfCommand,
  simulatePatternCommand,
} from './commands/simulate.js';
import {
  policyTestCommand,
  policyListCommand,
  policyValidateCommand,
} from './commands/policy.js';
import {
  auditVerifyCommand,
  auditHealthCommand,
  auditIsValidCommand,
  auditExportCommand,
  auditFormatsCommand,
} from './commands/audit.js';
import { registerPortfolioCommands } from './commands/portfolio-audit.js';

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
  .command('triage [pr-url-or-ref]')
  .description('Analyze PR or local change complexity')
  .option('-v, --verbose', 'Show detailed analysis')
  .option('--json', 'Output as JSON')
  .option('--no-save', 'Do not save triage results')
  // Local diff triage options (Epic J)
  .option('-d, --diff', 'Triage local changes instead of PR')
  .option('-a, --all', 'Include all uncommitted changes (with --diff)')
  .option('-u, --untracked', 'Include untracked files (with --diff)')
  .option('--max-complexity <n>', 'Fail if complexity exceeds threshold', parseInt)
  .action(async (prUrlOrRef, options) => {
    try {
      await triageCommand(prUrlOrRef, options);
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

// Review command - review resolutions or local changes
program
  .command('review [pr-url-or-ref]')
  .description('Review AI-generated resolutions or local changes')
  .option('-v, --verbose', 'Show detailed review with diffs')
  .option('--json', 'Output as JSON')
  .option('-f, --file <file>', 'Review specific file only')
  .option('--approve', 'Approve all resolutions')
  .option('--reject', 'Reject all resolutions')
  // Local review options (Epic J)
  .option('-l, --local', 'Review local git changes (staged by default)')
  .option('-a, --all', 'Review all uncommitted changes (with --local)')
  .option('-u, --untracked', 'Include untracked files (with --local)')
  .option('--markdown', 'Output as markdown (with --local)')
  .option('-b, --brief', 'Brief output (with --local)')
  .option('--score-only', 'Show only score without details (with --local)')
  .option('--max-complexity <n>', 'Fail if complexity exceeds threshold (with --local)', parseInt)
  .option('--block-security', 'Block security-sensitive changes (with --local)')
  .action(async (prUrlOrRef, options) => {
    try {
      await reviewCommand(prUrlOrRef, options);
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

// Gate command - pre-commit review gate (Epic J)
program
  .command('gate')
  .description('Pre-commit review gate with interactive approval')
  .option('--strict', 'Block on high complexity (threshold: 5)')
  .option('--max-complexity <n>', 'Maximum allowed complexity (default: 8)', parseInt)
  .option('--block-security', 'Block security-sensitive changes')
  .option('--no-interactive', 'Skip approval prompt (for CI/hooks)')
  .option('-v, --verbose', 'Show detailed output on failure')
  .option('--json', 'Output as JSON')
  .option('-q, --silent', 'Silent mode (only show errors)')
  .action(async (options) => {
    try {
      await gateCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(2);
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
  // Git hooks (Epic J)
  .option('--hooks', 'Install pre-commit hook for local review')
  .option('--strict', 'Use strict mode for pre-commit hook (with --hooks)')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Hooks Commands (Epic J - J4.2)
// =============================================================================

const hooksCmd = program
  .command('hooks')
  .description('Manage git hooks for local review (Epic J)');

hooksCmd
  .command('install')
  .description('Install pre-commit hook')
  .option('--strict', 'Use strict mode (block on warnings)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await hooksInstallCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

hooksCmd
  .command('uninstall')
  .description('Remove pre-commit hook')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await hooksUninstallCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

hooksCmd
  .command('status')
  .description('Check hook status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await hooksStatusCommand(options);
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
// Automation Configuration Commands (Phase 35)
// =============================================================================

const automationCmd = configCmd
  .command('automation')
  .description('Manage issue-to-code automation triggers');

automationCmd
  .command('show')
  .description('Show current automation configuration')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await automationShowCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Labels subcommand
const labelsCmd = automationCmd
  .command('labels')
  .description('Manage trigger labels');

labelsCmd
  .command('add <labels...>')
  .description('Add trigger labels')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (labels, options) => {
    try {
      await automationLabelsAddCommand(labels, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

labelsCmd
  .command('remove <labels...>')
  .description('Remove trigger labels')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (labels, options) => {
    try {
      await automationLabelsRemoveCommand(labels, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Commands (comment commands) subcommand
const commandsCmd = automationCmd
  .command('commands')
  .description('Manage comment commands (e.g., /gwi generate)');

commandsCmd
  .command('add <commands...>')
  .description('Add comment commands')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (commands, options) => {
    try {
      await automationCommandsAddCommand(commands, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Keywords subcommand
const keywordsCmd = automationCmd
  .command('keywords')
  .description('Manage trigger keywords');

keywordsCmd
  .command('title <keywords...>')
  .description('Add title keywords')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (keywords, options) => {
    try {
      await automationKeywordsAddCommand('title', keywords, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

keywordsCmd
  .command('body <keywords...>')
  .description('Add body keywords')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (keywords, options) => {
    try {
      await automationKeywordsAddCommand('body', keywords, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Approval mode commands
automationCmd
  .command('approval-mode <mode>')
  .description('Set approval mode (always, never, smart)')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (mode, options) => {
    try {
      await automationApprovalModeCommand(mode, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

automationCmd
  .command('smart-threshold <threshold>')
  .description('Set smart mode complexity threshold (1-10)')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (threshold, options) => {
    try {
      await automationSmartThresholdCommand(parseInt(threshold, 10), options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

automationCmd
  .command('max-runs-per-day <count>')
  .description('Set maximum auto runs per day')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (count, options) => {
    try {
      await automationMaxRunsCommand(parseInt(count, 10), options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

automationCmd
  .command('enable')
  .description('Enable automation for this repository')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await automationEnableCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

automationCmd
  .command('disable')
  .description('Disable automation for this repository')
  .option('--tenant <id>', 'Tenant ID')
  .option('--repo <name>', 'Repository (owner/repo)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await automationDisableCommand(options);
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
// Explain Command (Phase 35 - Context Graph)
// =============================================================================

program
  .command('explain [run-id-or-ref] [step-id]')
  .description('Explain AI decisions or local changes')
  .option('--trace <trace-id>', 'Explain by trace ID instead of run/step')
  .option('--tenant <id>', 'Tenant ID')
  .option('--level <level>', 'Detail level (brief, standard, detailed, debug)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  // Local explain options (Epic J)
  .option('-l, --local', 'Explain local git changes (Epic J)')
  .option('-s, --staged', 'Explain staged changes only (with --local)')
  .option('-u, --untracked', 'Include untracked files (with --local)')
  .option('--markdown', 'Output as markdown (with --local)')
  .option('-b, --brief', 'Brief output (with --local)')
  .action(async (runIdOrRef, stepId, options) => {
    try {
      await explainCommand(runIdOrRef, stepId, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Simulate Command (Phase 35 - Context Graph)
// =============================================================================

const simulateCmd = program
  .command('simulate')
  .description('World model simulation - "What happens if we do X?" (Phase 35)');

simulateCmd
  .command('action <action>')
  .description('Simulate a single action and predict outcome')
  .option('--tenant <id>', 'Tenant ID')
  .option('--complexity <n>', 'Complexity context (1-10)', parseInt)
  .option('--repo <name>', 'Repository context (owner/repo)')
  .option('--author <name>', 'Author context')
  .option('--agent-type <type>', 'Agent type (triage, coder, resolver, reviewer)')
  .option('--max-precedents <n>', 'Max precedents to consider', parseInt)
  .option('--min-similarity <n>', 'Min similarity threshold (0-1)', parseFloat)
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (action, options) => {
    try {
      await simulateCommand(action, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

simulateCmd
  .command('compare <actionA> <actionB>')
  .description('Compare two actions and recommend the better choice')
  .option('--tenant <id>', 'Tenant ID')
  .option('--complexity <n>', 'Complexity context (1-10)', parseInt)
  .option('--repo <name>', 'Repository context (owner/repo)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (actionA, actionB, options) => {
    try {
      await simulateCompareCommand(actionA, actionB, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

simulateCmd
  .command('what-if <actions...>')
  .description('Analyze multiple scenarios and their likely outcomes')
  .option('--tenant <id>', 'Tenant ID')
  .option('--complexity <n>', 'Complexity context (1-10)', parseInt)
  .option('--repo <name>', 'Repository context (owner/repo)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (actions, options) => {
    try {
      await simulateWhatIfCommand(actions, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

simulateCmd
  .command('pattern <action>')
  .description('Get historical success pattern for an action type')
  .option('--tenant <id>', 'Tenant ID')
  .option('--min-similarity <n>', 'Min similarity threshold (0-1)', parseFloat)
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (action, options) => {
    try {
      await simulatePatternCommand(action, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Approval Commands (Phase 25)
// =============================================================================

const approvalCmd = program
  .command('approval')
  .description('Manage approvals with policy-as-code enforcement (Phase 25)');

approvalCmd
  .command('approve <target>')
  .description('Approve a candidate/run/PR for execution')
  .option('--scopes <scopes...>', 'Approval scopes (commit, push, open_pr, merge, deploy)')
  .option('-m, --comment <text>', 'Approval comment')
  .option('--tenant <id>', 'Tenant ID')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (target, options) => {
    try {
      await approvalApproveCommand(target, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

approvalCmd
  .command('deny <target>')
  .description('Deny a candidate/run/PR')
  .requiredOption('--reason <text>', 'Denial reason (required)')
  .option('--tenant <id>', 'Tenant ID')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (target, options) => {
    try {
      await approvalDenyCommand(target, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

approvalCmd
  .command('revoke <target>')
  .description('Revoke existing approval for a target')
  .option('--tenant <id>', 'Tenant ID')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (target, options) => {
    try {
      await approvalRevokeCommand(target, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

approvalCmd
  .command('list <target>')
  .description('List approvals for a target')
  .option('--tenant <id>', 'Tenant ID')
  .option('-l, --limit <n>', 'Limit number of results', parseInt)
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (target, options) => {
    try {
      await approvalListCommand(target, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

approvalCmd
  .command('check <target>')
  .description('Check policy for a target')
  .option('--action <action>', 'Action to check (e.g., candidate.execute)')
  .option('--scopes <scopes...>', 'Required scopes to check')
  .option('--tenant <id>', 'Tenant ID')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (target, options) => {
    try {
      await approvalCheckCommand(target, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Policy Commands (Epic D - D2.5: Dry-Run Mode)
// =============================================================================

const policyCmd = program
  .command('policy')
  .description('Manage and test policies (Epic D - Policy Engine)');

policyCmd
  .command('test')
  .description('Dry-run policy evaluation - test policies without enforcement')
  .option('-p, --policy <file>', 'Policy file (JSON)')
  .option('--actor <id>', 'Actor ID (default: cli-user)')
  .option('--actor-type <type>', 'Actor type: human or agent (default: human)')
  .option('--action <name>', 'Action name (default: pr.merge)')
  .option('--resource <type>', 'Resource type (default: pull_request)')
  .option('-c, --complexity <n>', 'Complexity score (1-10)', parseInt)
  .option('-b, --branch <name>', 'Branch name')
  .option('-f, --files <files...>', 'File paths')
  .option('-l, --labels <labels...>', 'Labels')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      await policyTestCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

policyCmd
  .command('list')
  .description('List loaded policies')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await policyListCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

policyCmd
  .command('validate <policy-file>')
  .description('Validate a policy file')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (policyFile, options) => {
    try {
      await policyValidateCommand(policyFile, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Audit Commands (Epic D - D3.4: Integrity Verification)
// =============================================================================

const auditCmd = program
  .command('audit')
  .description('Audit log management and integrity verification (Epic D)');

auditCmd
  .command('verify')
  .description('Verify audit log chain integrity - detect tampering, gaps, and chain breaks')
  .option('-t, --tenant <id>', 'Tenant ID (default: default)')
  .option('--start-sequence <n>', 'Start sequence for partial verification', parseInt)
  .option('--end-sequence <n>', 'End sequence for partial verification', parseInt)
  .option('--max-entries <n>', 'Maximum entries to verify', parseInt)
  .option('--verify-timestamps', 'Also verify timestamps are monotonically increasing')
  .option('--include-details', 'Include entry-level verification details')
  .option('--stop-on-first-error', 'Stop verification on first issue found')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      await auditVerifyCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

auditCmd
  .command('health')
  .description('Quick health check of audit log (no full verification)')
  .option('-t, --tenant <id>', 'Tenant ID (default: default)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await auditHealthCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

auditCmd
  .command('is-valid')
  .description('Check if audit log is valid (exits 0 if valid, 1 if invalid, 2 on error)')
  .option('-t, --tenant <id>', 'Tenant ID (default: default)')
  .option('-q, --quiet', 'Suppress output (exit code only)')
  .action(async (options) => {
    try {
      await auditIsValidCommand(options);
    } catch (error) {
      if (!options.quiet) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      }
      process.exit(2);
    }
  });

auditCmd
  .command('export')
  .description('Export audit logs in various formats (JSON, CSV, SIEM)')
  .option('-t, --tenant <id>', 'Tenant ID (default: default)')
  .option('-f, --format <format>', 'Export format: json, json-lines, csv, cef, syslog (default: json)')
  .option('--start <date>', 'Start date filter (ISO 8601)')
  .option('--end <date>', 'End date filter (ISO 8601)')
  .option('--start-sequence <n>', 'Start sequence number', parseInt)
  .option('--end-sequence <n>', 'End sequence number', parseInt)
  .option('--actor <id>', 'Filter by actor ID')
  .option('--category <cat>', 'Filter by action category')
  .option('--resource-type <type>', 'Filter by resource type')
  .option('--high-risk', 'Only export high-risk entries')
  .option('-n, --limit <n>', 'Maximum entries to export', parseInt)
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('--include-chain', 'Include cryptographic chain data')
  .option('--no-metadata', 'Exclude export metadata')
  .option('--pretty', 'Pretty print JSON output')
  .option('--sign', 'Sign the export for attestation')
  .option('--key-file <file>', 'Private key file for signing (PEM format)')
  .option('--key-id <id>', 'Key identifier for signature')
  .action(async (options) => {
    try {
      await auditExportCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

auditCmd
  .command('formats')
  .description('List supported export formats')
  .action(() => {
    auditFormatsCommand();
  });

// =============================================================================
// Planner Commands (Phase 26)
// =============================================================================

const plannerCmd = program
  .command('planner')
  .description('LLM Planner integration (Phase 26 - requires GWI_PLANNER_ENABLED=1)');

plannerCmd
  .command('generate <intent>')
  .description('Generate a PatchPlan from an intent using LLM')
  .option('-p, --provider <provider>', 'Provider (gemini/claude)')
  .option('-m, --model <model>', 'Specific model to use')
  .option('--json', 'Output as JSON')
  .option('-o, --output <file>', 'Save plan to file')
  .option('--skip-guard', 'Skip PlanGuard validation')
  .option('--max-risk <level>', 'Maximum risk level (low/medium/high/critical)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (intent, options) => {
    try {
      await plannerGenerateCommand(intent, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

plannerCmd
  .command('validate <plan-file>')
  .description('Validate a PatchPlan JSON file')
  .option('--max-risk <level>', 'Maximum risk level (low/medium/high/critical)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (planFile, options) => {
    try {
      await plannerValidateCommand(planFile, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

plannerCmd
  .command('status')
  .description('Show LLM Planner status and configuration')
  .action(async () => {
    try {
      await plannerStatusCommand();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// =============================================================================
// Forensics Commands (Phase 27)
// =============================================================================

registerForensicsCommands(program);

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

Automation (Phase 35 - Customizable Issue-to-Code Triggers):
  gwi config automation show                  Show automation config for repo
  gwi config automation labels add <labels>   Add trigger labels
  gwi config automation labels remove <labels> Remove trigger labels
  gwi config automation commands add <cmds>   Add comment commands (e.g., /gwi generate)
  gwi config automation keywords title <kw>   Add title keywords
  gwi config automation keywords body <kw>    Add body keywords
  gwi config automation approval-mode <mode>  Set mode (always, never, smart)
  gwi config automation smart-threshold <n>   Set complexity threshold for smart mode
  gwi config automation max-runs-per-day <n>  Set rate limit
  gwi config automation enable                Enable automation
  gwi config automation disable               Disable automation

  Approval modes:
    always  - Require approval for all issue-to-code runs
    never   - Full YOLO mode, create PR immediately
    smart   - Auto-approve if complexity < threshold, else require approval

Run Management:
  gwi run list                  List recent runs
  gwi run status <run-id>       Show run status and details
  gwi run approve <run-id>      Approve run for commit/push

Context Graph (Phase 35 - "Why did AI do that?"):
  gwi explain <run-id>          Explain all decisions in a run
  gwi explain <run-id> <step>   Explain specific step
  gwi explain --trace <id>      Explain by trace ID

World Model Simulation (Phase 35 - "What if we do X?"):
  gwi simulate action "action"  Predict outcome of an action
  gwi simulate compare A B      Compare two actions
  gwi simulate what-if A B C    Analyze multiple scenarios
  gwi simulate pattern "action" Get historical success pattern

Approvals (Phase 25 - Policy-as-Code):
  gwi approval approve <target> Approve with Ed25519 signed approval
  gwi approval deny <target>    Deny with reason (--reason required)
  gwi approval revoke <target>  Revoke existing approval
  gwi approval list <target>    List approvals for target
  gwi approval check <target>   Check policy evaluation

  Target formats: run-<id>, candidate-<id>, pr-<number>, or <uuid>

Policy Testing (Epic D - D2.5: Dry-Run Mode):
  gwi policy test --policy <file>  Dry-run policy evaluation
  gwi policy validate <file>       Validate a policy file
  gwi policy list                  List loaded policies

  Examples:
    gwi policy test --policy my-policy.json --complexity 8
    gwi policy test -p policy.json --branch main --labels security
    gwi policy validate ./policies/require-review.json

Audit Log Verification & Export (Epic D - D3.4/D3.5):
  gwi audit verify                 Verify audit log chain integrity
  gwi audit health                 Quick health check
  gwi audit is-valid               Boolean check (for CI/scripts)
  gwi audit export                 Export logs (JSON, CSV, SIEM)
  gwi audit formats                List supported export formats

  Examples:
    gwi audit verify --tenant my-org --verbose
    gwi audit verify --verify-timestamps --json
    gwi audit verify --start-sequence 100 --end-sequence 200
    gwi audit health --tenant my-org
    gwi audit is-valid --quiet && echo "Chain OK"
    gwi audit export --format csv --output audit.csv
    gwi audit export --format cef --high-risk --output siem.cef
    gwi audit export --start 2024-01-01 --end 2024-12-31 --pretty

  Export formats:
    json        Full JSON with metadata (default)
    json-lines  Newline-delimited JSON (NDJSON)
    csv         Comma-separated values
    cef         Common Event Format (SIEM)
    syslog      RFC 5424 syslog format

  Issue types detected (verify):
    critical: content_hash_mismatch, chain_link_broken
    high:     sequence_gap, sequence_duplicate, first_entry_invalid
    medium:   timestamp_regression
    low:      algorithm_mismatch

LLM Planner (Phase 26 - requires GWI_PLANNER_ENABLED=1):
  gwi planner generate <intent> Generate PatchPlan from intent
  gwi planner validate <file>   Validate a PatchPlan JSON
  gwi planner status            Show planner configuration

Forensics (Phase 27 - requires GWI_FORENSICS_ENABLED=1):
  gwi forensics status          Show forensics status
  gwi forensics validate <file> Validate a ForensicBundle
  gwi forensics replay <file>   Replay a bundle deterministically
  gwi forensics timeline <file> Show event timeline
  gwi forensics dlq list        List DLQ items
  gwi forensics dlq replay <id> Replay from DLQ

Local Dev Review (Epic J - Pre-PR Analysis):
  gwi review --local            Review staged changes
  gwi review --local -a         Review all uncommitted changes
  gwi review --local HEAD~1     Review since specific commit
  gwi triage --diff             Score staged change complexity
  gwi triage --diff HEAD~3      Score last 3 commits
  gwi explain . --local         Explain local changes ("What changed?")
  gwi explain --staged --local  Explain staged changes only
  gwi gate                      Pre-commit gate (for git hooks)
  gwi gate --strict             Strict mode (block complexity > 5)

  Git hooks management:
    gwi hooks install           Install pre-commit hook
    gwi hooks install --strict  Install with strict mode
    gwi hooks uninstall         Remove pre-commit hook
    gwi hooks status            Check hook status

  Quick setup:
    gwi init --hooks            Initialize and install hooks
    gwi init --hooks --strict   Initialize with strict mode

  Exit codes (gate):
    0 - Ready to commit
    1 - Review recommended (--strict mode)
    2 - Blocked (must fix before commit)

Operator Tools:
  gwi doctor                    Check environment health
  gwi diagnose <run-id>         Debug a specific run

Environment:
  GWI_STORAGE    Storage backend (sqlite, turso, postgres, firestore, memory)
  GWI_DATA_DIR   Data directory (default: ~/.gwi)
  GWI_TENANT_ID  Default tenant ID for SaaS mode
  GITHUB_TOKEN   GitHub API token (or use gh auth)
`);

// =============================================================================
// Portfolio Commands (EPIC 024.7)
// =============================================================================

registerPortfolioCommands(program);

// Parse and execute
program.parse();
