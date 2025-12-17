#!/usr/bin/env npx tsx
/**
 * Smoke Test
 *
 * Ensures minimal runtime surface boots correctly.
 * Does NOT call external networks.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function runCommand(
  name: string,
  command: string,
  args: string[],
  timeout = 10000
): Promise<TestResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: process.cwd(),
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - start;
      resolve({
        name,
        passed: code === 0,
        message: code === 0 ? 'OK' : stderr || stdout || `Exit code ${code}`,
        duration,
      });
    });

    proc.on('error', (err) => {
      const duration = Date.now() - start;
      resolve({
        name,
        passed: false,
        message: err.message,
        duration,
      });
    });
  });
}

async function checkFileExists(name: string, path: string): Promise<TestResult> {
  const start = Date.now();
  const fullPath = join(process.cwd(), path);
  const exists = existsSync(fullPath);
  const duration = Date.now() - start;

  return {
    name,
    passed: exists,
    message: exists ? 'Found' : `Not found: ${path}`,
    duration,
  };
}

async function checkImport(name: string, modulePath: string): Promise<TestResult> {
  const start = Date.now();

  try {
    await import(modulePath);
    const duration = Date.now() - start;
    return {
      name,
      passed: true,
      message: 'Import successful',
      duration,
    };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      name,
      passed: false,
      message: err instanceof Error ? err.message : String(err),
      duration,
    };
  }
}

async function main(): Promise<void> {
  console.log('🚀 Running smoke tests...\n');

  // Check required files exist
  results.push(await checkFileExists('CLI dist exists', 'apps/cli/dist/index.js'));
  results.push(await checkFileExists('Core dist exists', 'packages/core/dist/index.js'));
  results.push(await checkFileExists('Engine dist exists', 'packages/engine/dist/index.js'));
  results.push(await checkFileExists('Agents dist exists', 'packages/agents/dist/index.js'));

  // Check CLI help command
  results.push(
    await runCommand('CLI --help', 'node', ['apps/cli/dist/index.js', '--help'])
  );

  // Check module imports (if dist exists)
  if (existsSync(join(process.cwd(), 'packages/core/dist/index.js'))) {
    results.push(
      await checkImport('@gwi/core import', join(process.cwd(), 'packages/core/dist/index.js'))
    );
  }

  // Print results
  console.log('Results:\n');
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const time = `(${result.duration}ms)`;
    console.log(`  ${icon} ${result.name} ${time}`);
    if (!result.passed) {
      console.log(`     ${result.message}`);
    }

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Passed: ${passed}, Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Smoke tests FAILED');
    process.exit(1);
  }

  console.log('\n✅ Smoke tests PASSED');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
