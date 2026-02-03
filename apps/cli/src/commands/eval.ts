/**
 * Evaluation Command (EPIC 003)
 *
 * Run rubric-based evaluation of agentic workflow outputs.
 * Supports golden task regression testing and ad-hoc evaluation.
 *
 * Usage:
 *   gwi eval run                    Run all golden tasks
 *   gwi eval run --workflow pr-review   Run specific workflow tests
 *   gwi eval run --tag smoke        Run tests with specific tag
 *   gwi eval list                   List available rubrics
 *   gwi eval validate <rubric>      Validate a rubric file
 */

import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  loadRubric,
  discoverRubrics,
  validateRubric,
  createGoldenRunner,
  createMockGenerator,
  type GoldenSuiteResult,
  type GoldenTaskResult,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

export interface EvalRunOptions {
  /** Filter by workflow type */
  workflow?: string;
  /** Filter by tags */
  tag?: string[];
  /** Rubrics directory */
  rubricsDir?: string;
  /** Golden tasks directory */
  tasksDir?: string;
  /** Verbose output */
  verbose?: boolean;
  /** Fail fast on first failure */
  failFast?: boolean;
  /** JSON output */
  json?: boolean;
  /** CI mode (exit code reflects pass/fail) */
  ci?: boolean;
}

export interface EvalListOptions {
  /** Rubrics directory */
  rubricsDir?: string;
  /** JSON output */
  json?: boolean;
}

export interface EvalValidateOptions {
  /** JSON output */
  json?: boolean;
}

// =============================================================================
// Default Paths
// =============================================================================

function getDefaultRubricsDir(): string {
  return path.join(process.cwd(), 'rubrics');
}

function getDefaultTasksDir(): string {
  return path.join(process.cwd(), 'test', 'goldens', 'evaluation');
}

// =============================================================================
// Run Command
// =============================================================================

/**
 * Run golden task evaluation
 */
export async function evalRunCommand(options: EvalRunOptions): Promise<void> {
  const spinner = ora({ isSilent: options.json });
  const rubricsDir = options.rubricsDir ?? getDefaultRubricsDir();
  const tasksDir = options.tasksDir ?? getDefaultTasksDir();

  try {
    spinner.start('Discovering golden tasks...');

    // Create runner with mock generator for now
    // In production, this would use actual agent output
    const runner = createGoldenRunner({
      rubricsDir,
      tasksDir,
      outputGenerator: createMockGenerator({}),
      workflowFilter: options.workflow,
      tagFilter: options.tag,
      verbose: options.verbose,
      failFast: options.failFast,
    });

    // Discover task files
    const taskFiles = runner.discoverTaskFiles();

    if (taskFiles.length === 0) {
      spinner.warn('No golden task files found');
      if (options.json) {
        console.log(JSON.stringify({
          status: 'no_tasks',
          message: `No golden tasks found in ${tasksDir}`,
          searchedDir: tasksDir,
        }));
      } else {
        console.log();
        console.log(chalk.yellow(`  No golden task files (*.golden.yaml) found in:`));
        console.log(chalk.dim(`    ${tasksDir}`));
        console.log();
        console.log(chalk.dim('  Create golden tasks using the format:'));
        console.log(chalk.dim('    test/goldens/evaluation/my-workflow.golden.yaml'));
        console.log();
      }
      return;
    }

    spinner.text = `Running ${taskFiles.length} golden task file(s)...`;

    // Run the suite
    const result = await runner.runSuite('Golden Tasks');

    spinner.succeed(`Completed: ${result.passedTasks}/${result.totalTasks} passed`);

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printSuiteResult(result, options);
    }

    // Exit with error code in CI mode
    if (options.ci && !result.overallPassed) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Evaluation failed');
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
    process.exit(1);
  }
}

// =============================================================================
// List Command
// =============================================================================

/**
 * List available rubrics
 */
export async function evalListCommand(options: EvalListOptions): Promise<void> {
  const rubricsDir = options.rubricsDir ?? getDefaultRubricsDir();

  try {
    const rubrics = discoverRubrics(rubricsDir);

    if (rubrics.size === 0) {
      if (options.json) {
        console.log(JSON.stringify({ rubrics: [], directory: rubricsDir }));
      } else {
        console.log();
        console.log(chalk.yellow(`  No rubrics found in ${rubricsDir}`));
        console.log();
      }
      return;
    }

    if (options.json) {
      const rubricList = Array.from(rubrics.entries()).map(([name, rubric]) => ({
        name,
        version: rubric.version,
        workflow: rubric.workflow,
        dimensions: rubric.dimensions.length,
        passingScore: rubric.passingScore,
      }));
      console.log(JSON.stringify({ rubrics: rubricList, directory: rubricsDir }));
    } else {
      console.log();
      console.log(chalk.bold('  Available Rubrics'));
      console.log(chalk.dim(`  Directory: ${rubricsDir}`));
      console.log();

      for (const [name, rubric] of rubrics) {
        console.log(`  ${chalk.cyan(name)} ${chalk.dim(`v${rubric.version}`)}`);
        if (rubric.description) {
          console.log(`    ${chalk.dim(rubric.description)}`);
        }
        console.log(`    Dimensions: ${rubric.dimensions.length}, Passing: ${rubric.passingScore}%`);
        console.log();
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// =============================================================================
// Validate Command
// =============================================================================

/**
 * Validate a rubric file
 */
export async function evalValidateCommand(
  rubricPath: string,
  options: EvalValidateOptions
): Promise<void> {
  try {
    // Load and parse
    const rubric = loadRubric(rubricPath);

    // Validate
    const validation = validateRubric(rubric);

    if (options.json) {
      console.log(JSON.stringify({
        valid: validation.valid,
        rubric: {
          name: rubric.name,
          version: rubric.version,
          dimensions: rubric.dimensions.length,
        },
        errors: validation.errors,
      }));
    } else {
      console.log();
      if (validation.valid) {
        console.log(chalk.green(`  ✓ ${rubric.name} v${rubric.version} is valid`));
        console.log();
        console.log(chalk.dim(`    Dimensions: ${rubric.dimensions.length}`));
        console.log(chalk.dim(`    Passing Score: ${rubric.passingScore}%`));

        // Show dimension breakdown
        console.log();
        console.log(chalk.bold('    Dimensions:'));
        for (const dim of rubric.dimensions) {
          console.log(`      ${dim.name} (weight: ${(dim.weight * 100).toFixed(0)}%)`);
          console.log(chalk.dim(`        ${dim.criteria.length} criteria`));
        }
      } else {
        console.log(chalk.red(`  ✗ ${rubric.name} has validation errors:`));
        for (const error of validation.errors) {
          console.log(chalk.red(`    - ${error}`));
        }
      }
      console.log();
    }

    if (!validation.valid) {
      process.exit(1);
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      }));
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
    process.exit(1);
  }
}

// =============================================================================
// Output Helpers
// =============================================================================

function printSuiteResult(result: GoldenSuiteResult, options: EvalRunOptions): void {
  console.log();
  console.log(chalk.bold('  Golden Tasks Evaluation'));
  console.log(chalk.dim(`  ${result.suiteName}`));
  console.log();

  // Summary stats
  const passColor = result.overallPassed ? chalk.green : chalk.red;
  console.log(chalk.bold('  Summary:'));
  console.log(`    Total:    ${result.totalTasks}`);
  console.log(`    Passed:   ${chalk.green(result.passedTasks.toString())}`);
  console.log(`    Failed:   ${chalk.red(result.failedTasks.toString())}`);
  console.log(`    Skipped:  ${chalk.dim(result.skippedTasks.toString())}`);
  console.log(`    Duration: ${chalk.dim(`${result.durationMs}ms`)}`);
  console.log();

  // Individual results
  if (options.verbose || result.failedTasks > 0) {
    console.log(chalk.bold('  Results:'));
    for (const task of result.tasks) {
      printTaskResult(task, options);
    }
    console.log();
  }

  // Overall status
  if (result.overallPassed) {
    console.log(passColor(`  ✓ ${result.summary}`));
  } else {
    console.log(passColor(`  ✗ ${result.summary}`));
  }
  console.log();
}

function printTaskResult(task: GoldenTaskResult, options: EvalRunOptions): void {
  const icon = task.passed ? chalk.green('✓') : chalk.red('✗');
  const score = task.passed ? chalk.green(`${task.score.toFixed(1)}`) : chalk.red(`${task.score.toFixed(1)}`);

  console.log(`    ${icon} ${task.taskName} ${chalk.dim(`(${score}/100)`)}`);

  if (options.verbose || !task.passed) {
    console.log(chalk.dim(`      Workflow: ${task.workflow}`));
    console.log(chalk.dim(`      Duration: ${task.durationMs}ms`));

    if (task.error) {
      console.log(chalk.red(`      Error: ${task.error}`));
    }

    // Show dimension scores
    if (task.evaluation.dimensions.length > 0) {
      for (const dim of task.evaluation.dimensions) {
        const dimIcon = dim.score >= 70 ? chalk.green('•') : chalk.yellow('•');
        console.log(chalk.dim(`      ${dimIcon} ${dim.dimensionName}: ${dim.score.toFixed(0)}%`));
      }
    }

    // Show weaknesses
    if (task.evaluation.weaknesses.length > 0) {
      console.log(chalk.yellow('      Weaknesses:'));
      for (const weakness of task.evaluation.weaknesses.slice(0, 3)) {
        console.log(chalk.yellow(`        - ${weakness}`));
      }
    }
  }
}

export {
  evalRunCommand as runCommand,
  evalListCommand as listCommand,
  evalValidateCommand as validateCommand,
};
