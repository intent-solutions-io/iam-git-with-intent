#!/usr/bin/env npx tsx
/**
 * ARV Runner - Agent Readiness Verification
 *
 * Runs all ARV checks in sequence.
 * Exit code 0 = all passed, non-zero = failures
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CheckResult {
  name: string;
  passed: boolean;
  duration: number;
  output: string;
}

async function runCheck(name: string, command: string, args: string[]): Promise<CheckResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let output = '';

    proc.stdout?.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - start;
      resolve({
        name,
        passed: code === 0,
        duration,
        output,
      });
    });

    proc.on('error', (err) => {
      const duration = Date.now() - start;
      resolve({
        name,
        passed: false,
        duration,
        output: err.message,
      });
    });
  });
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ARV - Agent Readiness Verification               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const checks: { name: string; command: string; args: string[] }[] = [
    {
      name: 'No Internal Tools in Runtime',
      command: 'bash',
      args: [join(__dirname, '..', 'ci', 'check_no_internal_tools.sh')],
    },
    {
      name: 'Forbidden Patterns',
      command: 'npx',
      args: ['tsx', join(__dirname, 'forbidden-patterns.ts')],
    },
    {
      name: 'Contract Tests',
      command: 'npx',
      args: ['vitest', 'run', 'test/contracts/', '--reporter=verbose'],
    },
    {
      name: 'Golden Tests',
      command: 'npx',
      args: ['vitest', 'run', 'test/goldens/', '--reporter=verbose'],
    },
    {
      name: 'Smoke Tests',
      command: 'npx',
      args: ['tsx', join(__dirname, 'smoke-test.ts')],
    },
    {
      name: 'Connector Supply Chain',
      command: 'npx',
      args: ['tsx', join(__dirname, 'connector-supply-chain.ts')],
    },
    {
      name: 'Reliability Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'reliability-gate.ts')],
    },
    {
      name: 'Docs Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'docs-gate.ts')],
    },
    {
      name: 'Merge Resolver Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'merge-resolver-gate.ts')],
    },
    {
      name: 'Registry Integration Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'registry-gate.ts')],
    },
    {
      name: 'Metering Integration Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'metering-gate.ts')],
    },
    {
      name: 'Observability Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'observability-gate.ts')],
    },
    {
      name: 'Security Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'security-gate.ts')],
    },
    {
      name: 'Approval Policy Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'approval-policy-gate.ts')],
    },
    {
      name: 'Planner Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'planner-gate.ts')],
    },
    {
      name: 'Marketplace Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'marketplace-gate.ts')],
    },
    {
      name: 'OpenAPI Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'openapi-gate.ts')],
    },
    {
      name: 'Identity Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'identity-gate.ts')],
    },
    {
      name: 'GA Readiness Gate',
      command: 'npx',
      args: ['tsx', join(__dirname, 'ga-readiness-gate.ts')],
    },
  ];

  const results: CheckResult[] = [];

  for (const check of checks) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`▶ Running: ${check.name}`);
    console.log('─'.repeat(60));

    const result = await runCheck(check.name, check.command, check.args);
    results.push(result);

    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`\n${status} (${result.duration}ms)`);
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`  ${icon} ${result.name.padEnd(25)} (${result.duration}ms)`);
  }

  console.log('─'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ ARV FAILED - Fix issues before committing');
    process.exit(1);
  }

  console.log('\n✅ ARV PASSED - Ready to commit');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
