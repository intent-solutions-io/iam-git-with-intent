/**
 * gwi portfolio audit command
 *
 * EPIC 024.7: Portfolio audit capability for multi-repo SWE audits.
 *
 * Runs architectural drift detection and code quality audits across
 * multiple repositories in a portfolio, aggregating results into
 * a unified report.
 *
 * Usage:
 *   gwi portfolio audit --repos repos.yaml
 *   gwi portfolio audit --repo git@github.com:org/repo1.git --repo git@github.com:org/repo2.git
 *   gwi portfolio audit --config portfolio.yaml
 *
 * @module @gwi/cli/commands/portfolio-audit
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import {
  type IssueCategory,
} from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

/** Audit issue severity (local to portfolio audit, maps to drift gate output) */
type AuditSeverity = 'error' | 'warning';

interface PortfolioConfig {
  /** Portfolio name */
  name: string;
  /** Description */
  description?: string;
  /** Repository list */
  repos: RepoConfig[];
  /** Output directory */
  outputDir?: string;
  /** Max parallel audits */
  concurrency?: number;
  /** Severity threshold for failure ('error' = only errors fail, 'warning' = warnings also fail) */
  failOnSeverity?: AuditSeverity;
}

interface RepoConfig {
  /** Repository URL or local path */
  url: string;
  /** Display name */
  name?: string;
  /** Branch to audit (default: default branch) */
  branch?: string;
  /** Subdirectory to audit */
  subdir?: string;
  /** Categories to check */
  categories?: IssueCategory[];
  /** Skip this repo */
  skip?: boolean;
  /** Tags for filtering */
  tags?: string[];
}

interface RepoAuditResult {
  /** Repository config */
  repo: RepoConfig;
  /** Success status */
  success: boolean;
  /** Issues found */
  issues: AuditIssue[];
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
  /** Files scanned */
  filesScanned: number;
  /** Commit SHA audited */
  commitSha?: string;
}

interface AuditIssue {
  /** Rule that was violated */
  rule: string;
  /** Severity level */
  severity: AuditSeverity;
  /** File path (relative to repo) */
  file: string;
  /** Line number */
  line?: number;
  /** Issue message */
  message: string;
  /** Match text */
  match?: string;
}

interface PortfolioAuditReport {
  /** Report ID */
  id: string;
  /** Portfolio name */
  portfolioName: string;
  /** Timestamp */
  timestamp: string;
  /** Total repos */
  totalRepos: number;
  /** Successful audits */
  successfulAudits: number;
  /** Failed audits */
  failedAudits: number;
  /** Total issues */
  totalIssues: number;
  /** Issues by severity */
  issuesBySeverity: {
    error: number;
    warning: number;
  };
  /** Issues by rule */
  issuesByRule: Record<string, number>;
  /** Repo results */
  repoResults: RepoAuditResult[];
  /** Duration */
  totalDurationMs: number;
  /** Overall pass/fail */
  passed: boolean;
}

// =============================================================================
// Command Options
// =============================================================================

export interface PortfolioAuditOptions {
  /** Portfolio config file (YAML) */
  config?: string;
  /** Individual repo URLs */
  repo?: string[];
  /** Output directory */
  output?: string;
  /** Output as JSON */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Max parallel audits */
  concurrency?: number;
  /** Fail on warning (default: fail on error only) */
  failOnWarning?: boolean;
  /** Keep cloned repos (don't cleanup) */
  keepRepos?: boolean;
  /** Filter by tags */
  tags?: string[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse portfolio config from YAML file
 */
function parsePortfolioConfig(configPath: string): PortfolioConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const config = parseYaml(content);

  if (!config.repos || !Array.isArray(config.repos)) {
    throw new Error('Config must contain a "repos" array');
  }

  return {
    name: config.name || basename(configPath, '.yaml'),
    description: config.description,
    repos: config.repos,
    outputDir: config.outputDir,
    concurrency: config.concurrency || 4,
    failOnSeverity: config.failOnSeverity || 'error',
  };
}

/**
 * Create portfolio config from CLI options
 */
function createConfigFromOptions(options: PortfolioAuditOptions): PortfolioConfig {
  const repos: RepoConfig[] = (options.repo || []).map((url) => ({
    url,
    name: basename(url, '.git').replace(/[^a-zA-Z0-9-]/g, '-'),
  }));

  return {
    name: 'CLI Portfolio',
    repos,
    outputDir: options.output,
    concurrency: options.concurrency || 4,
    failOnSeverity: options.failOnWarning ? 'warning' : 'error',
  };
}

/**
 * Clone or fetch repository
 */
async function prepareRepo(
  repo: RepoConfig,
  workDir: string,
  verbose: boolean
): Promise<{ path: string; commitSha: string }> {
  const isLocal = !repo.url.includes('://') && !repo.url.startsWith('git@');
  const localPath = isLocal ? resolve(repo.url) : null;

  if (localPath && existsSync(localPath)) {
    // Use existing local path
    if (verbose) {
      console.log(chalk.dim(`  Using local path: ${localPath}`));
    }

    const commitSha = await runGitCommand(localPath, ['rev-parse', 'HEAD']);
    return { path: localPath, commitSha: commitSha.trim() };
  }

  // Clone repository
  const repoName = repo.name || basename(repo.url, '.git');
  const clonePath = join(workDir, repoName);

  if (verbose) {
    console.log(chalk.dim(`  Cloning: ${repo.url}`));
  }

  const branch = repo.branch ? ['--branch', repo.branch] : [];
  await runGitCommand(workDir, ['clone', '--depth', '1', ...branch, repo.url, repoName]);

  const commitSha = await runGitCommand(clonePath, ['rev-parse', 'HEAD']);
  return { path: clonePath, commitSha: commitSha.trim() };
}

/**
 * Run git command and return output
 */
function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Git command failed: ${stderr || stdout}`));
      }
    });
  });
}

/**
 * Run drift gate on a repository
 */
async function runDriftGate(
  repoPath: string,
  verbose: boolean
): Promise<{ issues: AuditIssue[]; filesScanned: number }> {
  const issues: AuditIssue[] = [];
  let filesScanned = 0;

  // Import the drift gate logic dynamically
  // For now, we'll run it as a subprocess since it's a standalone script
  return new Promise((resolve) => {
    const driftGatePath = join(process.cwd(), 'scripts/arv/drift-gate.ts');

    // Check if drift gate exists
    if (!existsSync(driftGatePath)) {
      // Fallback: run basic checks inline
      resolve(runBasicAudit(repoPath, verbose));
      return;
    }

    const proc = spawn('npx', ['tsx', driftGatePath], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let _stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data) => {
      _stderr += data.toString();
    });

    proc.on('close', () => {
      // Parse drift gate output
      const lines = stdout.split('\n');

      for (const line of lines) {
        // Count files (rough estimate from output)
        if (line.includes('Checking')) {
          filesScanned++;
        }

        // Parse issues
        const issueMatch = line.match(/^\s+([^:]+):(\d+)?$/);
        if (issueMatch) {
          const nextLine = lines[lines.indexOf(line) + 1];
          const ruleMatch = nextLine?.match(/\[(\w+)\]\s+(.+)/);

          if (ruleMatch) {
            issues.push({
              rule: ruleMatch[1],
              severity: line.includes('❌') ? 'error' : 'warning',
              file: issueMatch[1].trim(),
              line: issueMatch[2] ? parseInt(issueMatch[2], 10) : undefined,
              message: ruleMatch[2],
            });
          }
        }
      }

      resolve({ issues, filesScanned });
    });
  });
}

/**
 * Basic audit when drift gate is not available
 */
async function runBasicAudit(
  repoPath: string,
  _verbose: boolean
): Promise<{ issues: AuditIssue[]; filesScanned: number }> {
  const issues: AuditIssue[] = [];
  let filesScanned = 0;

  // Check for common issues
  const checks = [
    {
      file: 'package.json',
      check: (content: string) => {
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['langchain']) {
          return { rule: 'R1', message: 'Forbidden dependency: langchain' };
        }
        if (deps['crewai']) {
          return { rule: 'R1', message: 'Forbidden dependency: crewai' };
        }
        return null;
      },
    },
    {
      file: '.env',
      check: () => ({ rule: 'R3', message: '.env file should not be committed' }),
    },
  ];

  for (const check of checks) {
    const filePath = join(repoPath, check.file);
    if (existsSync(filePath)) {
      filesScanned++;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const result = check.check(content);
        if (result) {
          issues.push({
            rule: result.rule,
            severity: 'warning',
            file: check.file,
            message: result.message,
          });
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return { issues, filesScanned };
}

/**
 * Audit a single repository
 */
async function auditRepo(
  repo: RepoConfig,
  workDir: string,
  verbose: boolean
): Promise<RepoAuditResult> {
  const startTime = Date.now();

  if (repo.skip) {
    return {
      repo,
      success: true,
      issues: [],
      durationMs: 0,
      filesScanned: 0,
    };
  }

  try {
    // Prepare repo (clone or use local)
    const { path: repoPath, commitSha } = await prepareRepo(repo, workDir, verbose);

    // Run drift gate audit
    const auditPath = repo.subdir ? join(repoPath, repo.subdir) : repoPath;
    const { issues, filesScanned } = await runDriftGate(auditPath, verbose);

    return {
      repo,
      success: true,
      issues,
      durationMs: Date.now() - startTime,
      filesScanned,
      commitSha,
    };
  } catch (error) {
    return {
      repo,
      success: false,
      issues: [],
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
      filesScanned: 0,
    };
  }
}

/**
 * Generate portfolio audit report
 */
function generateReport(
  config: PortfolioConfig,
  results: RepoAuditResult[]
): PortfolioAuditReport {
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const errorCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.severity === 'error').length,
    0
  );
  const warningCount = totalIssues - errorCount;

  const issuesByRule: Record<string, number> = {};
  for (const result of results) {
    for (const issue of result.issues) {
      issuesByRule[issue.rule] = (issuesByRule[issue.rule] || 0) + 1;
    }
  }

  const failThreshold = config.failOnSeverity || 'error';
  const passed =
    failThreshold === 'error' ? errorCount === 0 : totalIssues === 0;

  return {
    id: randomUUID(),
    portfolioName: config.name,
    timestamp: new Date().toISOString(),
    totalRepos: results.length,
    successfulAudits: results.filter((r) => r.success).length,
    failedAudits: results.filter((r) => !r.success).length,
    totalIssues,
    issuesBySeverity: {
      error: errorCount,
      warning: warningCount,
    },
    issuesByRule,
    repoResults: results,
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    passed,
  };
}

/**
 * Format report for terminal output
 */
function formatReport(report: PortfolioAuditReport, verbose: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold('  Portfolio Audit Report'));
  lines.push(chalk.dim('  ' + '─'.repeat(56)));
  lines.push('');

  // Summary
  lines.push(chalk.bold('  Summary:'));
  lines.push(`    Portfolio: ${report.portfolioName}`);
  lines.push(`    Timestamp: ${report.timestamp}`);
  lines.push(`    Total Repos: ${report.totalRepos}`);
  lines.push(
    `    Successful: ${chalk.green(String(report.successfulAudits))}` +
      (report.failedAudits > 0
        ? `, Failed: ${chalk.red(String(report.failedAudits))}`
        : '')
  );
  lines.push('');

  // Issues summary
  lines.push(chalk.bold('  Issues:'));
  lines.push(
    `    Total: ${report.totalIssues} (${chalk.red(String(report.issuesBySeverity.error) + ' errors')}, ${chalk.yellow(String(report.issuesBySeverity.warning) + ' warnings')})`
  );
  lines.push('');

  // Issues by rule
  if (Object.keys(report.issuesByRule).length > 0) {
    lines.push(chalk.bold('  By Rule:'));
    for (const [rule, count] of Object.entries(report.issuesByRule).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`    ${rule}: ${count}`);
    }
    lines.push('');
  }

  // Repo details
  lines.push(chalk.bold('  Repository Results:'));
  for (const result of report.repoResults) {
    const repoName = result.repo.name || basename(result.repo.url, '.git');
    const status = result.success
      ? result.issues.filter((i) => i.severity === 'error').length > 0
        ? chalk.red('✗')
        : result.issues.length > 0
          ? chalk.yellow('⚠')
          : chalk.green('✓')
      : chalk.red('✗');

    const issueCount = result.success
      ? `${result.issues.length} issues`
      : result.error || 'failed';

    lines.push(`    ${status} ${repoName.padEnd(30)} ${issueCount} (${result.durationMs}ms)`);

    // Verbose: show individual issues
    if (verbose && result.issues.length > 0) {
      for (const issue of result.issues.slice(0, 5)) {
        const icon = issue.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
        lines.push(`       ${icon} [${issue.rule}] ${issue.file}: ${issue.message}`);
      }
      if (result.issues.length > 5) {
        lines.push(chalk.dim(`       ... and ${result.issues.length - 5} more`));
      }
    }
  }
  lines.push('');

  // Result
  const resultIcon = report.passed ? chalk.green('✓') : chalk.red('✗');
  const resultText = report.passed
    ? chalk.green('PORTFOLIO AUDIT PASSED')
    : chalk.red('PORTFOLIO AUDIT FAILED');
  lines.push(chalk.dim('  ' + '─'.repeat(56)));
  lines.push(`  ${resultIcon} ${resultText}`);
  lines.push(`    Duration: ${report.totalDurationMs}ms`);
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Commands
// =============================================================================

/**
 * gwi portfolio audit - Run portfolio-wide audit
 */
export async function portfolioAuditCommand(
  options: PortfolioAuditOptions
): Promise<void> {
  // Get portfolio config
  let config: PortfolioConfig;

  if (options.config) {
    config = parsePortfolioConfig(options.config);
  } else if (options.repo && options.repo.length > 0) {
    config = createConfigFromOptions(options);
  } else {
    console.error(chalk.red('  Error: Must provide --config or --repo options'));
    console.log('');
    console.log('  Examples:');
    console.log('    gwi portfolio audit --config portfolio.yaml');
    console.log('    gwi portfolio audit --repo https://github.com/org/repo1');
    console.log('');
    process.exit(1);
  }

  // Filter by tags if provided
  if (options.tags && options.tags.length > 0) {
    config.repos = config.repos.filter(
      (r) => r.tags && r.tags.some((t) => options.tags!.includes(t))
    );
  }

  if (config.repos.length === 0) {
    console.error(chalk.red('  Error: No repositories to audit'));
    process.exit(1);
  }

  // Create work directory
  const workDir = join(tmpdir(), `gwi-portfolio-${randomUUID().slice(0, 8)}`);
  mkdirSync(workDir, { recursive: true });

  if (options.verbose) {
    console.log(chalk.dim(`  Work directory: ${workDir}`));
  }

  console.log('');
  console.log(chalk.bold(`  Auditing ${config.repos.length} repositories...`));
  console.log('');

  try {
    // Run audits
    const results: RepoAuditResult[] = [];
    const concurrency = options.concurrency || config.concurrency || 4;

    // Process repos in batches for concurrency control
    for (let i = 0; i < config.repos.length; i += concurrency) {
      const batch = config.repos.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (repo) => {
          const repoName = repo.name || basename(repo.url, '.git');
          console.log(chalk.dim(`  → Auditing: ${repoName}`));
          return auditRepo(repo, workDir, options.verbose || false);
        })
      );
      results.push(...batchResults);
    }

    // Generate report
    const report = generateReport(config, results);

    // Output
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report, options.verbose || false));
    }

    // Save report to file if output directory specified
    const outputDir = options.output || config.outputDir;
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      const reportPath = join(
        outputDir,
        `portfolio-audit-${new Date().toISOString().split('T')[0]}.json`
      );
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(chalk.dim(`  Report saved to: ${reportPath}`));
      console.log('');
    }

    // Exit with appropriate code
    if (!report.passed) {
      process.exit(1);
    }
  } finally {
    // Cleanup
    if (!options.keepRepos) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * gwi portfolio init - Initialize portfolio config
 */
export async function portfolioInitCommand(options: {
  output?: string;
}): Promise<void> {
  const outputPath = options.output || 'portfolio.yaml';

  const template = `# GWI Portfolio Configuration
# Run with: gwi portfolio audit --config ${outputPath}

name: My Portfolio
description: Portfolio of repositories to audit

# Severity level that causes failure (error or warning)
failOnSeverity: error

# Maximum parallel audits
concurrency: 4

# Output directory for reports
outputDir: ./portfolio-reports

# Repositories to audit
repos:
  - url: https://github.com/org/repo1
    name: repo1
    # branch: main
    # subdir: packages/core
    # tags: [frontend, critical]

  - url: https://github.com/org/repo2
    name: repo2
    tags: [backend]

  # Local paths work too
  # - url: ../local-repo
  #   name: local-repo

  # Skip specific repos
  # - url: https://github.com/org/archived
  #   skip: true
`;

  if (existsSync(outputPath)) {
    console.error(chalk.red(`  Error: ${outputPath} already exists`));
    process.exit(1);
  }

  writeFileSync(outputPath, template);
  console.log('');
  console.log(chalk.green(`  Created: ${outputPath}`));
  console.log('');
  console.log('  Next steps:');
  console.log(`    1. Edit ${outputPath} with your repositories`);
  console.log(`    2. Run: gwi portfolio audit --config ${outputPath}`);
  console.log('');
}

// =============================================================================
// Register Commands
// =============================================================================

export function registerPortfolioCommands(program: Command): void {
  const portfolio = program
    .command('portfolio')
    .description('Multi-repo portfolio management');

  portfolio
    .command('audit')
    .description('Run SWE audit across multiple repositories')
    .option('-c, --config <file>', 'Portfolio config file (YAML)')
    .option('-r, --repo <url>', 'Repository URL (can specify multiple)', (v, arr: string[]) => [...arr, v], [])
    .option('-o, --output <dir>', 'Output directory for reports')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .option('--concurrency <n>', 'Max parallel audits', parseInt)
    .option('--fail-on-warning', 'Fail on warnings (default: errors only)')
    .option('--keep-repos', 'Keep cloned repositories after audit')
    .option('--tags <tags>', 'Filter repos by tags (comma-separated)', (v) => v.split(','))
    .action(portfolioAuditCommand);

  portfolio
    .command('init')
    .description('Initialize portfolio config file')
    .option('-o, --output <file>', 'Output file path', 'portfolio.yaml')
    .action(portfolioInitCommand);
}
