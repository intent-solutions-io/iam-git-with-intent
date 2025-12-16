/**
 * Issue-to-Code CLI Command
 *
 * Phase 4: Command for the issue-to-code workflow.
 *
 * Takes a GitHub issue URL, triages it, generates code,
 * and writes artifacts to the sandbox workspace.
 *
 * @module @gwi/cli/commands/issue-to-code
 */

import chalk from 'chalk';
import ora from 'ora';
import { runIssueToCodeFromGithubUrl, parseGitHubIssueUrl } from '@gwi/engine';

/**
 * Options for the issue-to-code command
 */
export interface IssueToCodeCommandOptions {
  dryRun?: boolean;
  verbose?: boolean;
  json?: boolean;
  skipTriage?: boolean;
  complexity?: number;
}

/**
 * Execute the issue-to-code command
 */
export async function issueToCodeCommand(
  issueUrl: string | undefined,
  options: IssueToCodeCommandOptions
): Promise<void> {
  // Validate URL is provided
  if (!issueUrl) {
    console.error(chalk.red('Error:'), 'Issue URL is required');
    console.log();
    console.log('Usage: gwi issue-to-code <issue-url>');
    console.log();
    console.log('Examples:');
    console.log('  gwi issue-to-code https://github.com/owner/repo/issues/123');
    console.log('  gwi issue-to-code owner/repo#123');
    console.log('  gwi issue-to-code https://github.com/owner/repo/issues/123 --dry-run');
    process.exit(1);
  }

  // Validate URL format
  const parsed = parseGitHubIssueUrl(issueUrl);
  if (!parsed) {
    console.error(chalk.red('Error:'), 'Invalid GitHub issue URL');
    console.log();
    console.log('Supported formats:');
    console.log('  https://github.com/owner/repo/issues/123');
    console.log('  github.com/owner/repo/issues/123');
    console.log('  owner/repo#123');
    process.exit(1);
  }

  // Start the spinner
  const spinner = ora({
    text: `Analyzing issue #${parsed.issueNumber} in ${parsed.fullName}...`,
    color: 'cyan',
  });

  if (!options.json) {
    spinner.start();
  }

  try {
    // Prepare options
    const engineOptions: Parameters<typeof runIssueToCodeFromGithubUrl>[1] = {
      dryRun: options.dryRun,
    };

    if (options.skipTriage && options.complexity) {
      const complexity = Math.min(10, Math.max(1, options.complexity));
      engineOptions.skipTriage = complexity as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    }

    // Run the workflow
    const result = await runIssueToCodeFromGithubUrl(issueUrl, engineOptions);

    // Stop spinner
    if (!options.json) {
      if (result.success) {
        spinner.succeed(chalk.green('Issue-to-code workflow completed'));
      } else {
        spinner.fail(chalk.red('Issue-to-code workflow failed'));
      }
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log();

      if (result.success) {
        // Summary box
        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.cyan.bold('  Issue-to-Code Summary'));
        console.log(chalk.cyan('='.repeat(60)));
        console.log();

        console.log(chalk.gray('Issue:       '), chalk.white(`${parsed.fullName}#${parsed.issueNumber}`));
        console.log(chalk.gray('Run ID:      '), chalk.white(result.runId));
        console.log(chalk.gray('Complexity:  '), formatComplexity(result.complexity));
        console.log(chalk.gray('Confidence:  '), formatConfidence(result.confidence));
        console.log(chalk.gray('Files:       '), chalk.white(`${result.filesGenerated} generated`));
        console.log();

        // Triage summary
        console.log(chalk.yellow.bold('Triage Summary:'));
        console.log(chalk.gray(result.triageSummary));
        console.log();

        // Artifact paths
        console.log(chalk.green.bold('Artifacts:'));
        console.log(chalk.gray('Workspace:   '), chalk.white(result.workspaceDir));
        console.log(chalk.gray('Plan:        '), chalk.white(result.planPath));

        if (result.patchPaths.length > 0) {
          console.log(chalk.gray('Patches:'));
          for (const patchPath of result.patchPaths) {
            console.log(chalk.gray('  -'), chalk.white(patchPath));
          }
        }

        console.log();
        console.log(chalk.cyan('='.repeat(60)));
        console.log();

        // Next steps
        console.log(chalk.blue.bold('Next Steps:'));
        console.log(chalk.gray('  1. Review the plan:'), chalk.white(`cat ${result.planPath}`));
        if (result.patchPaths.length > 0) {
          console.log(chalk.gray('  2. Review patches:'), chalk.white(`cat ${result.patchPaths[0]}`));
        }
        console.log(chalk.gray('  3. Apply changes to your repository manually or via gwi apply'));
        console.log();

        if (options.dryRun) {
          console.log(chalk.yellow('Note:'), 'This was a dry run. No LLM calls were made.');
          console.log();
        }
      } else {
        // Error output
        console.log(chalk.red.bold('Error:'), result.error || 'Unknown error');
        console.log();
        console.log(chalk.gray('Run ID:'), result.runId);
        console.log();
      }
    }

    // Exit with appropriate code
    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    if (!options.json) {
      spinner.fail(chalk.red('Issue-to-code workflow failed'));
    }
    throw error;
  }
}

/**
 * Format complexity score with color
 */
function formatComplexity(complexity: number): string {
  if (complexity <= 3) {
    return chalk.green(`${complexity}/10 (Low)`);
  } else if (complexity <= 6) {
    return chalk.yellow(`${complexity}/10 (Medium)`);
  } else {
    return chalk.red(`${complexity}/10 (High)`);
  }
}

/**
 * Format confidence score with color
 */
function formatConfidence(confidence: number): string {
  if (confidence >= 80) {
    return chalk.green(`${confidence}%`);
  } else if (confidence >= 50) {
    return chalk.yellow(`${confidence}%`);
  } else {
    return chalk.red(`${confidence}%`);
  }
}
