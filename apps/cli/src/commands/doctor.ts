/**
 * Doctor Command
 *
 * Phase 8: Operator-grade diagnostics for environment health check.
 *
 * Checks:
 * - Node.js and npm versions
 * - Repository and storage paths
 * - Environment variable presence (never prints secrets)
 * - Installed connectors from local registry
 * - ARV last known status
 *
 * @module @gwi/cli/commands/doctor
 */

import chalk from 'chalk';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

/**
 * Doctor command options
 */
export interface DoctorOptions {
  json?: boolean;
  verbose?: boolean;
}

/**
 * Health check result
 */
interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  value?: string;
  message?: string;
}

/**
 * Doctor report
 */
interface DoctorReport {
  timestamp: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    ok: number;
    warn: number;
    error: number;
  };
}

/**
 * Execute the doctor command
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const checks: HealthCheck[] = [];

  // 1. Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  checks.push({
    name: 'Node.js version',
    status: nodeMajor >= 18 ? 'ok' : nodeMajor >= 16 ? 'warn' : 'error',
    value: nodeVersion,
    message: nodeMajor < 18 ? 'Node.js 18+ recommended' : undefined,
  });

  // 2. npm version
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    checks.push({
      name: 'npm version',
      status: 'ok',
      value: npmVersion,
    });
  } catch {
    checks.push({
      name: 'npm version',
      status: 'error',
      message: 'npm not found',
    });
  }

  // 3. Repository root
  const cwd = process.cwd();
  const isGitRepo = existsSync(join(cwd, '.git'));
  checks.push({
    name: 'Repository root',
    status: isGitRepo ? 'ok' : 'warn',
    value: cwd,
    message: !isGitRepo ? 'Not a git repository' : undefined,
  });

  // 4. GWI data directory
  const gwiDataDir = process.env.GWI_DATA_DIR || join(homedir(), '.gwi');
  const gwiDataExists = existsSync(gwiDataDir);
  checks.push({
    name: 'GWI data directory',
    status: gwiDataExists ? 'ok' : 'warn',
    value: gwiDataDir,
    message: !gwiDataExists ? 'Will be created on first use' : undefined,
  });

  // 5. Connectors registry path
  const connectorsPath = join(cwd, 'connectors');
  const connectorsExist = existsSync(connectorsPath);
  let installedConnectors: string[] = [];

  if (connectorsExist) {
    try {
      installedConnectors = readdirSync(connectorsPath).filter(
        (dir) => dir.includes('@') && existsSync(join(connectorsPath, dir, 'connector.manifest.json'))
      );
    } catch {
      // Ignore errors
    }
  }

  checks.push({
    name: 'Connectors registry',
    status: connectorsExist ? 'ok' : 'warn',
    value: connectorsPath,
    message: connectorsExist
      ? `${installedConnectors.length} connector(s) installed`
      : 'No connectors directory',
  });

  // 6. Environment variables (only show set/unset, never print values)
  const envVars = [
    { name: 'ANTHROPIC_API_KEY', required: false },
    { name: 'GOOGLE_AI_API_KEY', required: false },
    { name: 'GITHUB_TOKEN', required: true },
    { name: 'GWI_STORE_BACKEND', required: false },
    { name: 'GCP_PROJECT_ID', required: false },
    { name: 'STRIPE_SECRET_KEY', required: false },
  ];

  for (const envVar of envVars) {
    const isSet = !!process.env[envVar.name];
    checks.push({
      name: `ENV: ${envVar.name}`,
      status: isSet ? 'ok' : envVar.required ? 'error' : 'warn',
      value: isSet ? 'set' : 'unset',
      message: !isSet && envVar.required ? 'Required variable not set' : undefined,
    });
  }

  // 7. AI provider check (at least one must be set)
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGoogleAI = !!process.env.GOOGLE_AI_API_KEY;
  checks.push({
    name: 'AI provider',
    status: hasAnthropic || hasGoogleAI ? 'ok' : 'error',
    value: hasAnthropic && hasGoogleAI ? 'both' : hasAnthropic ? 'anthropic' : hasGoogleAI ? 'google' : 'none',
    message: !hasAnthropic && !hasGoogleAI ? 'Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY' : undefined,
  });

  // 8. ARV last known status
  const arvStatusPath = join(gwiDataDir, 'arv-last-status.json');
  if (existsSync(arvStatusPath)) {
    try {
      const arvStatus = JSON.parse(readFileSync(arvStatusPath, 'utf-8'));
      checks.push({
        name: 'ARV last status',
        status: arvStatus.passed ? 'ok' : 'error',
        value: arvStatus.passed ? 'passed' : 'failed',
        message: arvStatus.timestamp ? `Last run: ${arvStatus.timestamp}` : undefined,
      });
    } catch {
      checks.push({
        name: 'ARV last status',
        status: 'warn',
        message: 'Status file corrupted, run npm run arv',
      });
    }
  } else {
    checks.push({
      name: 'ARV last status',
      status: 'warn',
      message: 'No status recorded, run npm run arv',
    });
  }

  // Build report
  const report: DoctorReport = {
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      error: checks.filter((c) => c.status === 'error').length,
    },
  };

  // Output
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.blue.bold('\n  Git With Intent - Doctor\n'));

  for (const check of checks) {
    const icon =
      check.status === 'ok' ? chalk.green('✓') :
      check.status === 'warn' ? chalk.yellow('!') :
      chalk.red('✗');

    const value = check.value ? chalk.dim(` (${check.value})`) : '';
    console.log(`  ${icon} ${check.name}${value}`);

    if (check.message && (options.verbose || check.status !== 'ok')) {
      console.log(chalk.dim(`    ${check.message}`));
    }
  }

  // Installed connectors detail
  if (installedConnectors.length > 0 && options.verbose) {
    console.log(chalk.bold('\n  Installed Connectors:'));
    for (const connector of installedConnectors) {
      console.log(chalk.dim(`    - ${connector}`));
    }
  }

  // Summary
  console.log();
  console.log(chalk.bold('  Summary:'));
  console.log(`    ${chalk.green(report.summary.ok)} ok, ${chalk.yellow(report.summary.warn)} warnings, ${chalk.red(report.summary.error)} errors`);

  if (report.summary.error > 0) {
    console.log(chalk.red('\n  ✗ Environment has issues that need to be resolved\n'));
    process.exit(1);
  } else if (report.summary.warn > 0) {
    console.log(chalk.yellow('\n  ! Environment is functional but has warnings\n'));
  } else {
    console.log(chalk.green('\n  ✓ Environment is healthy\n'));
  }
}
