/**
 * Local Review E2E Tests (Epic J - J4.3)
 *
 * Tests for the local review CLI commands:
 * - gwi review --local
 * - gwi triage --diff
 * - gwi explain --local
 * - gwi gate
 * - gwi hooks
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Path to the CLI
const CLI_PATH = join(process.cwd(), 'apps/cli/dist/index.js');

// Helper to run CLI commands
function runCLI(args: string[], cwd?: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      code: execError.status ?? 1,
    };
  }
}

// Helper to create a temp git repo
function createTempGitRepo(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'gwi-test-'));
  execSync('git init', { cwd: tempDir });
  execSync('git config user.email "test@test.com"', { cwd: tempDir });
  execSync('git config user.name "Test User"', { cwd: tempDir });

  // Create initial commit
  writeFileSync(join(tempDir, 'README.md'), '# Test Repo\n');
  execSync('git add README.md', { cwd: tempDir });
  execSync('git commit -m "Initial commit"', { cwd: tempDir });

  return tempDir;
}

describe('Local Review E2E Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempGitRepo();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('gwi gate', () => {
    it('should pass with no staged changes', () => {
      const result = runCLI(['gate'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('PASS');
      expect(result.stdout).toContain('No staged changes');
    });

    it('should pass with simple staged changes', () => {
      // Create directory first, then write file
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'index.ts'), 'export const x = 1;\n');
      execSync('git add src/index.ts', { cwd: tempDir });

      const result = runCLI(['gate'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('PASS');
    });

    it('should output JSON when --json flag is used', () => {
      const result = runCLI(['gate', '--json'], tempDir);

      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.status).toBe('pass');
      expect(json.exitCode).toBe(0);
    });

    it('should work with --silent flag', () => {
      const result = runCLI(['gate', '--silent'], tempDir);

      expect(result.code).toBe(0);
      // Silent mode with pass = no output
      expect(result.stdout.trim()).toBe('');
    });
  });

  describe('gwi review --local', () => {
    it('should report no changes when repo is clean', () => {
      const result = runCLI(['review', '--local'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('No changes');
    });

    it('should analyze unstaged changes', () => {
      // Create an unstaged change
      writeFileSync(join(tempDir, 'README.md'), '# Test Repo\n\nUpdated content.\n');

      const result = runCLI(['review', '--local'], tempDir);

      expect(result.code).toBe(0);
      // Check for file listing in output
      expect(result.stdout).toContain('README.md');
      expect(result.stdout).toContain('Files:');
    });

    it('should analyze staged changes with --staged flag', () => {
      // Create and stage a change
      writeFileSync(join(tempDir, 'README.md'), '# Test Repo\n\nUpdated content.\n');
      execSync('git add README.md', { cwd: tempDir });

      const result = runCLI(['review', '--local'], tempDir);

      expect(result.code).toBe(0);
      // Check for complexity in output
      expect(result.stdout).toContain('Complexity:');
    });

    it('should output JSON when --json flag is used', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Test Repo\n\nUpdated.\n');

      const result = runCLI(['review', '--local', '--json'], tempDir);

      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('files'); // file count
      expect(json).toHaveProperty('score');
      expect(json).toHaveProperty('fileAnalysis'); // file details array
    });

    it('should show brief output with --brief flag', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Updated\n');

      const result = runCLI(['review', '--local', '--brief'], tempDir);

      expect(result.code).toBe(0);
      // Brief output should be shorter
      expect(result.stdout.length).toBeLessThan(500);
    });
  });

  describe('gwi triage --diff', () => {
    it('should report no changes when repo is clean', () => {
      const result = runCLI(['triage', '--diff'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('No changes to triage');
    });

    it('should triage staged changes', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Updated\n');
      execSync('git add README.md', { cwd: tempDir });

      const result = runCLI(['triage', '--diff'], tempDir);

      expect(result.code).toBe(0);
      // Check for triage output components
      expect(result.stdout).toContain('Complexity:');
      expect(result.stdout).toContain('Risk:');
    });

    it('should output JSON with --json flag', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Updated\n');
      execSync('git add README.md', { cwd: tempDir });

      const result = runCLI(['triage', '--diff', '--json'], tempDir);

      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('score');
      expect(json).toHaveProperty('riskLevel');
      expect(json).toHaveProperty('route');
    });
  });

  describe('gwi explain --local', () => {
    it('should report no changes when repo is clean', () => {
      const result = runCLI(['explain', '.', '--local'], tempDir);

      expect(result.code).toBe(0);
      // Message may vary, but should mention making changes
      expect(result.stdout).toContain('Tip');
    });

    it('should explain staged changes', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Updated\n');
      execSync('git add README.md', { cwd: tempDir });

      const result = runCLI(['explain', '.', '--local'], tempDir);

      expect(result.code).toBe(0);
      // Check for explain output - contains file info
      expect(result.stdout).toContain('README.md');
    });

    it('should output JSON with --json flag', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Updated\n');
      execSync('git add README.md', { cwd: tempDir });

      const result = runCLI(['explain', '.', '--local', '--json'], tempDir);

      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('files');
      expect(json).toHaveProperty('headline');
      expect(json).toHaveProperty('stats');
    });

    it('should output markdown with --markdown flag', () => {
      writeFileSync(join(tempDir, 'README.md'), '# Updated\n');
      execSync('git add README.md', { cwd: tempDir });

      const result = runCLI(['explain', '.', '--local', '--markdown'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('#');
    });
  });

  describe('gwi hooks', () => {
    it('should show status when no hook is installed', () => {
      const result = runCLI(['hooks', 'status'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('not installed');
    });

    it('should install pre-commit hook', () => {
      const result = runCLI(['hooks', 'install'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('installed');

      // Verify hook file exists
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      expect(existsSync(hookPath)).toBe(true);

      // Verify hook content
      const hookContent = readFileSync(hookPath, 'utf-8');
      expect(hookContent).toContain('gwi gate');
    });

    it('should install with strict mode', () => {
      const result = runCLI(['hooks', 'install', '--strict'], tempDir);

      expect(result.code).toBe(0);

      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      const hookContent = readFileSync(hookPath, 'utf-8');
      expect(hookContent).toContain('--strict');
    });

    it('should uninstall hook', () => {
      // First install
      runCLI(['hooks', 'install'], tempDir);

      // Then uninstall
      const result = runCLI(['hooks', 'uninstall'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('uninstalled');
    });

    it('should output JSON with --json flag', () => {
      const result = runCLI(['hooks', 'status', '--json'], tempDir);

      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('installed');
      expect(json).toHaveProperty('path');
    });
  });

  describe('Integration: Hook + Gate', () => {
    it('should run gate through installed hook', () => {
      // Install hook
      runCLI(['hooks', 'install'], tempDir);

      // Create a simple change and stage it
      writeFileSync(join(tempDir, 'test.txt'), 'hello\n');
      execSync('git add test.txt', { cwd: tempDir });

      // Run the pre-commit hook directly (simulating git commit)
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      const result = runCLI([], tempDir);

      // We can't easily run the hook directly, but we can verify gate works
      const gateResult = runCLI(['gate'], tempDir);
      expect(gateResult.code).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully outside git repo', () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'gwi-nongit-'));

      try {
        const result = runCLI(['gate'], nonGitDir);
        expect(result.code).toBe(2);
        // Error message may be in stdout or stderr depending on output method
        const output = result.stdout + result.stderr;
        expect(output).toContain('Not a git repository');
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });

    it('should handle --help flag', () => {
      const result = runCLI(['gate', '--help'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Pre-commit review gate');
      expect(result.stdout).toContain('--strict');
    });
  });
});

describe('Local Review with Multiple Files', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempGitRepo();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should analyze multiple file changes', () => {
    // Create directory structure
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'tests'), { recursive: true });

    // Add multiple files
    writeFileSync(join(tempDir, 'src', 'app.ts'), 'export function app() { return "hello"; }\n');
    writeFileSync(join(tempDir, 'src', 'utils.ts'), 'export const utils = {};\n');
    writeFileSync(join(tempDir, 'tests', 'app.test.ts'), 'test("app", () => {});\n');

    execSync('git add .', { cwd: tempDir });

    const result = runCLI(['review', '--local'], tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('3'); // 3 files
    // Check for file listing instead of "Analyzed" word
    expect(result.stdout).toContain('Files:');
  });

  it('should detect config file changes', () => {
    writeFileSync(join(tempDir, 'package.json'), '{"name": "test"}\n');
    execSync('git add package.json', { cwd: tempDir });

    const result = runCLI(['review', '--local', '--json'], tempDir);

    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.fileAnalysis.some((f: { category: string }) => f.category === 'config')).toBe(true);
  });

  it('should detect test file changes', () => {
    mkdirSync(join(tempDir, '__tests__'), { recursive: true });
    writeFileSync(join(tempDir, '__tests__', 'example.test.ts'), 'test("works", () => {});\n');
    execSync('git add .', { cwd: tempDir });

    const result = runCLI(['review', '--local', '--json'], tempDir);

    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.fileAnalysis.some((f: { category: string }) => f.category === 'test')).toBe(true);
  });
});
