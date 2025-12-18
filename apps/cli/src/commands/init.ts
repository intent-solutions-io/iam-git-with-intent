/**
 * gwi init command
 *
 * Initialize Git With Intent in a repository.
 * Phase 14: CLI DX improvements.
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export interface InitOptions {
  force?: boolean;
  minimal?: boolean;
  tenant?: string;
  workflow?: 'issue-to-code' | 'pr-resolve' | 'pr-review' | 'all';
}

/**
 * GWI project configuration
 */
interface GWIProjectConfig {
  version: string;
  tenantId?: string;
  workflows: {
    enabled: string[];
    defaults: {
      autoApprove: boolean;
      maxComplexity: number;
      riskMode: string;
    };
  };
  github?: {
    owner: string;
    repo: string;
    defaultBranch: string;
  };
  labels: {
    triaged: string;
    inProgress: string;
    resolved: string;
    needsReview: string;
  };
}

/**
 * Initialize GWI in the current repository
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const spinner = ora();

  try {
    const cwd = process.cwd();
    const gwiDir = join(cwd, '.gwi');
    const configPath = join(gwiDir, 'config.json');

    // Check if already initialized
    if (existsSync(gwiDir) && !options.force) {
      console.error(chalk.yellow('\n  Git With Intent is already initialized in this repository.'));
      console.error(chalk.dim('  Use --force to reinitialize.\n'));
      process.exit(1);
    }

    spinner.start('Initializing Git With Intent...');

    // Check if we're in a git repository
    const isGitRepo = existsSync(join(cwd, '.git'));
    if (!isGitRepo) {
      spinner.warn('Not a git repository. Some features may be limited.');
    }

    // Detect GitHub info if available
    let githubInfo: { owner: string; repo: string; defaultBranch: string } | undefined;

    if (isGitRepo) {
      try {
        const remoteUrl = execSync('git remote get-url origin 2>/dev/null', {
          encoding: 'utf-8',
        }).trim();

        // Parse GitHub URL
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (match) {
          const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo "refs/heads/main"', {
            encoding: 'utf-8',
          }).trim().replace('refs/remotes/origin/', '').replace('refs/heads/', '');

          githubInfo = {
            owner: match[1],
            repo: match[2],
            defaultBranch,
          };
        }
      } catch {
        // Git commands failed, continue without GitHub info
      }
    }

    // Create .gwi directory
    if (!existsSync(gwiDir)) {
      mkdirSync(gwiDir, { recursive: true });
    }

    // Determine enabled workflows
    let enabledWorkflows: string[];
    if (options.workflow === 'all') {
      enabledWorkflows = ['issue-to-code', 'pr-resolve', 'pr-review', 'test-gen', 'docs-update'];
    } else if (options.workflow) {
      enabledWorkflows = [options.workflow];
    } else if (options.minimal) {
      enabledWorkflows = ['pr-review'];
    } else {
      enabledWorkflows = ['issue-to-code', 'pr-resolve', 'pr-review'];
    }

    // Create configuration
    const config: GWIProjectConfig = {
      version: '1.0.0',
      tenantId: options.tenant,
      workflows: {
        enabled: enabledWorkflows,
        defaults: {
          autoApprove: false,
          maxComplexity: 8,
          riskMode: 'suggest_patch',
        },
      },
      github: githubInfo,
      labels: {
        triaged: 'gwi:triaged',
        inProgress: 'gwi:in-progress',
        resolved: 'gwi:resolved',
        needsReview: 'gwi:needs-review',
      },
    };

    // Write config file
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create .gitignore for .gwi if not minimal
    if (!options.minimal) {
      const gitignorePath = join(gwiDir, '.gitignore');
      writeFileSync(gitignorePath, `# GWI local data
data.db
data.db-*
*.log
cache/
`);
    }

    // Create workflow templates if not minimal
    if (!options.minimal) {
      const workflowsDir = join(gwiDir, 'workflows');
      if (!existsSync(workflowsDir)) {
        mkdirSync(workflowsDir, { recursive: true });
      }

      // Create example workflow config
      const workflowExample = {
        name: 'custom-workflow',
        description: 'Example custom workflow configuration',
        steps: ['triage', 'coder', 'reviewer'],
        triggers: {
          labels: ['gwi:auto'],
          branches: ['main', 'develop'],
        },
        options: {
          autoApprove: false,
          maxComplexity: 7,
        },
      };

      writeFileSync(
        join(workflowsDir, 'example.json'),
        JSON.stringify(workflowExample, null, 2)
      );
    }

    spinner.succeed('Git With Intent initialized');

    // Print summary
    console.log();
    console.log(chalk.bold('  Initialization Complete'));
    console.log();

    if (githubInfo) {
      console.log(chalk.dim(`  Repository: ${githubInfo.owner}/${githubInfo.repo}`));
      console.log(chalk.dim(`  Default branch: ${githubInfo.defaultBranch}`));
      console.log();
    }

    console.log(chalk.bold('  Enabled workflows:'));
    for (const wf of enabledWorkflows) {
      console.log(`    ${chalk.green('✓')} ${formatWorkflowName(wf)}`);
    }
    console.log();

    console.log(chalk.bold('  Created files:'));
    console.log(chalk.dim('    .gwi/config.json'));
    if (!options.minimal) {
      console.log(chalk.dim('    .gwi/.gitignore'));
      console.log(chalk.dim('    .gwi/workflows/example.json'));
    }
    console.log();

    console.log(chalk.bold('  Next steps:'));
    console.log(chalk.dim('    1. Configure your tenant ID (if using SaaS):'));
    console.log(chalk.dim('       gwi config set api.tenantId <your-tenant-id>'));
    console.log();
    console.log(chalk.dim('    2. Test with a PR:'));
    console.log(chalk.dim('       gwi triage <pr-url>'));
    console.log();
    console.log(chalk.dim('    3. Or start a workflow:'));
    console.log(chalk.dim('       gwi workflow start issue-to-code --issue-url <url>'));
    console.log();

    // Add to .gitignore if not already present
    if (isGitRepo) {
      try {
        const rootGitignore = join(cwd, '.gitignore');
        if (existsSync(rootGitignore)) {
          const content = require('fs').readFileSync(rootGitignore, 'utf-8');
          if (!content.includes('.gwi/data.db')) {
            console.log(chalk.dim('  Tip: Add .gwi/data.db to your .gitignore'));
          }
        }
      } catch {
        // Ignore errors
      }
    }
  } catch (error) {
    spinner.fail('Initialization failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

function formatWorkflowName(workflow: string): string {
  const names: Record<string, string> = {
    'issue-to-code': 'Issue to Code',
    'pr-resolve': 'PR Conflict Resolution',
    'pr-review': 'PR Review',
    'test-gen': 'Test Generation',
    'docs-update': 'Documentation Update',
  };
  return names[workflow] ?? workflow;
}
