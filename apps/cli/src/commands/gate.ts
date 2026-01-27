/**
 * Gate Command (Epic J - J3.4)
 *
 * Pre-commit review gate. Designed to be run automatically
 * via git hooks or manually before committing.
 *
 * Exit codes:
 *   0 - Approved to commit
 *   1 - Rejected or cancelled
 *   2 - Blocked (must fix before commit)
 *
 * Usage:
 *   gwi gate              Check staged changes with interactive approval
 *   gwi gate --strict     Block high-complexity changes
 *   gwi gate --no-interactive  Skip approval prompt (for CI/hooks)
 *
 * Git hook integration:
 *   Add to .git/hooks/pre-commit:
 *   #!/bin/sh
 *   gwi gate --no-interactive || exit 1
 */

import chalk from 'chalk';
import * as readline from 'node:readline';
import {
  readStagedChanges,
  getChangeSummary,
  isGitRepository,
  analyzeDiff,
  scoreLocalChanges,
  triageLocalChanges,
  explainChanges,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface GateOptions {
  /** Strict mode - block high complexity */
  strict?: boolean;
  /** Maximum allowed complexity (default: 8, strict: 5) */
  maxComplexity?: number;
  /** Block security-sensitive changes */
  blockSecurity?: boolean;
  /** JSON output */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Silent mode (only show errors) */
  silent?: boolean;
  /** No interactive mode (auto-pass/fail based on analysis) */
  noInteractive?: boolean;
  /** Working directory */
  cwd?: string;
}

export interface GateResult {
  status: 'approved' | 'rejected' | 'blocked';
  exitCode: 0 | 1 | 2;
  files: number;
  score: number;
  riskLevel: string;
  blockers: string[];
  warnings: string[];
  message: string;
  userApproved?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Prompt user for approval
 */
async function promptForApproval(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = chalk.bold('\n  Proceed with commit? (y/N): ');

    rl.question(question, (answer) => {
      rl.close();
      const approved = answer.trim().toLowerCase() === 'y';
      resolve(approved);
    });
  });
}

// =============================================================================
// Main Command
// =============================================================================

/**
 * Pre-commit gate with interactive approval
 */
export async function gateCommand(options: GateOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const maxComplexity = options.maxComplexity ?? (options.strict ? 5 : 8);

  try {
    // Verify git repository
    if (!isGitRepository(cwd)) {
      outputError('Not a git repository', options);
      process.exit(2);
    }

    // Quick check for staged changes
    const summary = getChangeSummary(cwd);
    if (summary.staged === 0) {
      if (!options.silent) {
        outputResult({
          status: 'approved',
          exitCode: 0,
          files: 0,
          score: 0,
          riskLevel: 'low',
          blockers: [],
          warnings: [],
          message: 'No staged changes',
          userApproved: true,
        }, options);
      }
      return;
    }

    // Read staged changes
    const changes = await readStagedChanges({ cwd });

    if (changes.files.length === 0) {
      outputResult({
        status: 'approved',
        exitCode: 0,
        files: 0,
        score: 0,
        riskLevel: 'low',
        blockers: [],
        warnings: [],
        message: 'No staged changes',
        userApproved: true,
      }, options);
      return;
    }

    // Analyze
    const analysis = await analyzeDiff(changes);
    const score = scoreLocalChanges(changes);
    const triage = triageLocalChanges(score, {
      maxComplexity,
      blockSecurityChanges: options.blockSecurity,
    });

    // Determine initial gate status
    let status: 'approved' | 'rejected' | 'blocked';
    let exitCode: 0 | 1 | 2;
    let message: string;

    // Hard blockers - cannot proceed
    if (triage.blockers.length > 0) {
      status = 'blocked';
      exitCode = 2;
      message = `Blocked: ${triage.blockers[0]}`;
    } else if (triage.warnings.length > 0 || !triage.readyForCommit) {
      // Warnings - needs review
      status = 'rejected';
      exitCode = 1;
      message = triage.warnings[0] ?? 'Review recommended before commit';
    } else {
      // No issues - ready to proceed
      status = 'approved';
      exitCode = 0;
      message = 'Ready for commit';
    }

    const result: GateResult = {
      status,
      exitCode,
      files: changes.files.length,
      score: score.score,
      riskLevel: score.riskLevel,
      blockers: triage.blockers,
      warnings: triage.warnings,
      message,
      userApproved: false,
    };

    // Show analysis
    outputResult(result, options);

    // Show detailed explanation if verbose
    if (options.verbose && status !== 'approved') {
      const explanation = explainChanges(analysis);
      console.log();
      console.log(chalk.bold('  Details:'));
      for (const file of explanation.files.slice(0, 5)) {
        const riskIcon = file.risk === 'low' ? chalk.green('●') :
          file.risk === 'medium' ? chalk.yellow('●') : chalk.red('●');
        console.log(`    ${riskIcon} ${file.path}`);
      }
      if (explanation.files.length > 5) {
        console.log(chalk.dim(`    ... and ${explanation.files.length - 5} more`));
      }
      console.log();
    }

    // Interactive approval gate
    if (status === 'blocked') {
      // Hard blockers - cannot approve
      console.log(chalk.red.bold('  Cannot proceed - blockers must be fixed first\n'));
      process.exit(2);
    }

    // Non-interactive mode - exit based on analysis
    if (options.noInteractive || options.json) {
      process.exit(exitCode);
    }

    // Interactive approval
    const approved = await promptForApproval();
    result.userApproved = approved;

    if (approved) {
      result.status = 'approved';
      result.exitCode = 0;
      result.message = 'Approved by user';
      console.log(chalk.green('\n  ✓ Approved - proceeding with commit\n'));
      process.exit(0);
    } else {
      result.status = 'rejected';
      result.exitCode = 1;
      result.message = 'Rejected by user';
      console.log(chalk.yellow('\n  ✗ Rejected - commit cancelled\n'));
      process.exit(1);
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), options);
    process.exit(2);
  }
}

// =============================================================================
// Output
// =============================================================================

function outputResult(result: GateResult, options: GateOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.silent && result.status === 'approved') {
    return;
  }

  const icon = result.status === 'approved' ? chalk.green('✓') :
    result.status === 'rejected' ? chalk.yellow('⚠') : chalk.red('✗');
  const statusText = result.status === 'approved' ? chalk.green('READY') :
    result.status === 'rejected' ? chalk.yellow('REVIEW') : chalk.red('BLOCKED');

  console.log();
  console.log(`  ${icon} Gate: ${statusText}`);
  console.log();

  if (result.files > 0) {
    const scoreColor = result.score <= 3 ? chalk.green :
      result.score <= 6 ? chalk.yellow : chalk.red;
    console.log(`    Files:      ${result.files}`);
    console.log(`    Complexity: ${scoreColor(`${result.score}/10`)}`);
    console.log(`    Risk:       ${result.riskLevel}`);
    console.log();
  }

  if (result.blockers.length > 0) {
    console.log(chalk.red.bold('  Blockers:'));
    for (const blocker of result.blockers) {
      console.log(chalk.red(`    ✗ ${blocker}`));
    }
    console.log();
  }

  if (result.warnings.length > 0 && !options.silent) {
    console.log(chalk.yellow.bold('  Warnings:'));
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`    ⚠ ${warning}`));
    }
    console.log();
  }

  console.log(`  ${result.message}`);
  console.log();

  // Help text on non-approved status
  if (result.status === 'blocked') {
    console.log(chalk.dim('  Fix blockers before committing'));
    console.log(chalk.dim('  Run `gwi review --local -v` for detailed analysis'));
    console.log();
  } else if (result.status === 'rejected' && options.noInteractive) {
    console.log(chalk.dim('  Run `gwi gate` without --no-interactive for approval prompt'));
    console.log();
  }
}

function outputError(message: string, options: GateOptions): void {
  if (options.json) {
    console.log(JSON.stringify({
      status: 'error',
      exitCode: 2,
      message,
    }, null, 2));
    return;
  }

  console.error(chalk.red(`\n  ✗ Gate error: ${message}\n`));
}
