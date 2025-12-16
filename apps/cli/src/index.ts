#!/usr/bin/env node

/**
 * Git With Intent CLI
 *
 * AI-powered DevOps automation platform.
 * Handles PRs, merge conflicts, and issue-to-PR workflows.
 *
 * Commands:
 *   gwi triage [pr-url]    Analyze PR complexity and routing
 *   gwi plan [pr-url]      Generate resolution plan
 *   gwi resolve <pr-url>   Full conflict resolution workflow
 *   gwi review [pr-url]    Review AI-generated resolutions
 *   gwi autopilot [pr-url] Fully automated resolution pipeline
 *   gwi diff [pr-url]      Analyze PR conflicts with AI
 *   gwi apply [pr-url]     Apply AI-generated resolutions
 *   gwi status             Show agent status
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
  $ gwi triage https://github.com/owner/repo/pull/123
  $ gwi plan --verbose
  $ gwi autopilot --dry-run
  $ gwi resolve https://github.com/owner/repo/pull/123
  $ gwi review --approve
  $ gwi status

Workflow:
  1. gwi triage   - Analyze complexity (optional, autopilot includes this)
  2. gwi plan     - See what will happen (optional)
  3. gwi autopilot - Run full pipeline, or
     gwi resolve  - Run with interactive approval
  4. gwi review   - Review results (included in autopilot)
  5. gwi apply    - Apply resolutions to repo

Environment:
  GWI_STORAGE    Storage backend (sqlite, turso, postgres, firestore, memory)
  GWI_DATA_DIR   Data directory (default: ~/.gwi)
  GITHUB_TOKEN   GitHub API token (or use gh auth)
`);

// Parse and execute
program.parse();
