#!/usr/bin/env node

/**
 * Git With Intent CLI
 *
 * AI-powered DevOps automation platform.
 * Handles PRs, merge conflicts, and issue-to-PR workflows.
 *
 * Usage:
 *   gwi diff [pr-url]       Analyze PR conflicts with AI
 *   gwi apply [pr-url]      Apply AI-generated resolutions
 *   gwi resolve <pr-url>    Full conflict resolution workflow
 *   gwi status              Show agent status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { diffCommand } from './commands/diff.js';
import { applyCommand } from './commands/apply.js';
import { resolveCommand } from './commands/resolve.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('gwi')
  .description('Git With Intent - AI-powered DevOps automation')
  .version('0.1.0');

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

// Resolve command - full workflow
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

// Parse and execute
program.parse();
