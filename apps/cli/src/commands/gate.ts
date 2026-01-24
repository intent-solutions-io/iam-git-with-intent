/**
 * Gate Command (Epic J - J3.4)
 *
 * Pre-commit review gate. Designed to be run automatically
 * via git hooks or manually before committing.
 *
 * Exit codes:
 *   0 - Ready to commit
 *   1 - Review needed
 *   2 - Blocked (must fix before commit)
 *
 * Usage:
 *   gwi gate              Check staged changes
 *   gwi gate --strict     Block high-complexity changes
 *   gwi gate --auto-fix   Attempt to fix obvious issues
 *
 * Git hook integration:
 *   Add to .git/hooks/pre-commit:
 *   #!/bin/sh
 *   gwi gate || exit 1
 */

import chalk from 'chalk';
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
  /** Working directory */
  cwd?: string;
}

export interface GateResult {
  status: 'pass' | 'warn' | 'fail';
  exitCode: 0 | 1 | 2;
  files: number;
  score: number;
  riskLevel: string;
  blockers: string[];
  warnings: string[];
  message: string;
}

// =============================================================================
// Main Command
// =============================================================================

/**
 * Pre-commit gate
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
          status: 'pass',
          exitCode: 0,
          files: 0,
          score: 0,
          riskLevel: 'low',
          blockers: [],
          warnings: [],
          message: 'No staged changes',
        }, options);
      }
      return;
    }

    // Read staged changes
    const changes = await readStagedChanges({ cwd });

    if (changes.files.length === 0) {
      outputResult({
        status: 'pass',
        exitCode: 0,
        files: 0,
        score: 0,
        riskLevel: 'low',
        blockers: [],
        warnings: [],
        message: 'No staged changes',
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

    // Determine gate result
    let status: 'pass' | 'warn' | 'fail';
    let exitCode: 0 | 1 | 2;
    let message: string;

    if (triage.blockers.length > 0) {
      status = 'fail';
      exitCode = 2;
      message = `Blocked: ${triage.blockers[0]}`;
    } else if (triage.warnings.length > 0 || !triage.readyForCommit) {
      status = 'warn';
      exitCode = options.strict ? 1 : 0;
      message = triage.warnings[0] ?? 'Review recommended before commit';
    } else {
      status = 'pass';
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
    };

    outputResult(result, options);

    // Show explanation on failure if verbose
    if (options.verbose && status !== 'pass') {
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

    process.exit(exitCode);
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

  if (options.silent && result.status === 'pass') {
    return;
  }

  const icon = result.status === 'pass' ? chalk.green('✓') :
    result.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
  const statusText = result.status === 'pass' ? chalk.green('PASS') :
    result.status === 'warn' ? chalk.yellow('WARN') : chalk.red('FAIL');

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

  // Help text on failure
  if (result.status === 'fail') {
    console.log(chalk.dim('  Run `gwi review --local -v` for detailed analysis'));
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
