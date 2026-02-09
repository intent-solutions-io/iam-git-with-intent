/**
 * Runtime Detection Utility
 *
 * Provides cross-runtime support for Node.js, Deno, and Bun.
 * Enables GWI to run on different JavaScript runtimes with runtime-specific
 * APIs abstracted behind a common interface.
 */

import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';

/**
 * Supported JavaScript runtimes
 */
export type Runtime = 'node' | 'deno' | 'bun';

/**
 * Detect the current JavaScript runtime
 */
export function detectRuntime(): Runtime {
  // Check for Deno
  // @ts-expect-error - Deno is not defined in Node.js
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Bun
  // @ts-expect-error - Bun is not defined in Node.js
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Default to Node.js
  return 'node';
}

/**
 * Check if running in a specific runtime
 */
export function isRuntime(runtime: Runtime): boolean {
  return detectRuntime() === runtime;
}

/**
 * Check if running in Node.js
 */
export function isNode(): boolean {
  return isRuntime('node');
}

/**
 * Check if running in Deno
 */
export function isDeno(): boolean {
  return isRuntime('deno');
}

/**
 * Check if running in Bun
 */
export function isBun(): boolean {
  return isRuntime('bun');
}

/**
 * Runtime information
 */
export interface RuntimeInfo {
  /** Runtime name */
  runtime: Runtime;
  /** Runtime version */
  version: string;
  /** Platform (linux, darwin, win32) */
  platform: string;
  /** Architecture (x64, arm64) */
  arch: string;
  /** Whether TypeScript is natively supported */
  nativeTypeScript: boolean;
  /** Whether permissions API is available */
  hasPermissions: boolean;
}

/**
 * Get detailed runtime information
 */
export function getRuntimeInfo(): RuntimeInfo {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error - Deno is not defined in Node.js
      const denoVersion = Deno?.version?.deno ?? 'unknown';
      return {
        runtime: 'deno',
        version: denoVersion,
        // @ts-expect-error Runtime-specific API
        platform: Deno?.build?.os ?? process.platform,
        // @ts-expect-error Runtime-specific API
        arch: Deno?.build?.arch ?? process.arch,
        nativeTypeScript: true,
        hasPermissions: true,
      };

    case 'bun':
      // @ts-expect-error - Bun is not defined in Node.js
      const bunVersion = Bun?.version ?? 'unknown';
      return {
        runtime: 'bun',
        version: bunVersion,
        platform: process.platform,
        arch: process.arch,
        nativeTypeScript: true,
        hasPermissions: false,
      };

    default:
      return {
        runtime: 'node',
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        nativeTypeScript: false,
        hasPermissions: false,
      };
  }
}

/**
 * Process spawn result
 */
export interface SpawnResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the process was killed */
  killed: boolean;
  /** Signal that killed the process */
  signal?: string;
}

/**
 * Spawn options
 */
export interface CrossSpawnOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Standard input */
  stdin?: string;
  /** Run detached */
  detached?: boolean;
}

/**
 * Cross-runtime process spawn
 *
 * Spawns a child process using the appropriate runtime API.
 */
export async function crossSpawn(
  command: string,
  args: string[],
  options: CrossSpawnOptions = {}
): Promise<SpawnResult> {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      return spawnDeno(command, args, options);
    case 'bun':
      return spawnBun(command, args, options);
    default:
      return spawnNode(command, args, options);
  }
}

/**
 * Spawn process in Node.js
 */
async function spawnNode(
  command: string,
  args: string[],
  options: CrossSpawnOptions
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      detached: options.detached,
    };

    const child = nodeSpawn(command, args, spawnOptions);

    // Set up timeout
    let timeoutId: NodeJS.Timeout | undefined;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
      }, options.timeout);
    }

    // Write stdin if provided
    if (options.stdin && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    // Collect output
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        killed,
        signal: signal ?? undefined,
      });
    });

    child.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        exitCode: -1,
        stdout,
        stderr: err.message,
        killed: false,
      });
    });
  });
}

/**
 * Spawn process in Deno
 */
async function spawnDeno(
  command: string,
  args: string[],
  options: CrossSpawnOptions
): Promise<SpawnResult> {
  // @ts-expect-error - Deno is not defined in Node.js
  if (typeof Deno === 'undefined') {
    throw new Error('Not running in Deno');
  }

  try {
    // @ts-expect-error - Deno.Command is Deno-specific
    const cmd = new Deno.Command(command, {
      args,
      cwd: options.cwd,
      env: options.env,
      stdin: options.stdin ? 'piped' : 'null',
      stdout: 'piped',
      stderr: 'piped',
    });

    // @ts-expect-error Runtime-specific API
    const child = cmd.spawn();

    // Write stdin if provided
    if (options.stdin) {
      // @ts-expect-error Runtime-specific API
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(options.stdin));
      await writer.close();
    }

    // Set up timeout
    let timeoutId: number | undefined;
    let killed = false;

    if (options.timeout) {
      // @ts-expect-error Runtime-specific API
      timeoutId = setTimeout(() => {
        killed = true;
        // @ts-expect-error Runtime-specific API
        child.kill('SIGKILL');
      }, options.timeout);
    }

    // @ts-expect-error Runtime-specific API
    const output = await child.output();

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return {
      // @ts-expect-error Runtime-specific API
      exitCode: output.code,
      // @ts-expect-error Runtime-specific API
      stdout: new TextDecoder().decode(output.stdout),
      // @ts-expect-error Runtime-specific API
      stderr: new TextDecoder().decode(output.stderr),
      killed,
    };
  } catch (err) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      killed: false,
    };
  }
}

/**
 * Spawn process in Bun
 */
async function spawnBun(
  command: string,
  args: string[],
  options: CrossSpawnOptions
): Promise<SpawnResult> {
  // @ts-expect-error - Bun is not defined in Node.js
  if (typeof Bun === 'undefined') {
    throw new Error('Not running in Bun');
  }

  try {
    // @ts-expect-error - Bun.spawn is Bun-specific
    const proc = Bun.spawn([command, ...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdin: options.stdin ? new Response(options.stdin).body : undefined,
    });

    // Set up timeout
    let timeoutId: number | undefined;
    let killed = false;

    if (options.timeout) {
      // @ts-expect-error Runtime-specific API
      timeoutId = setTimeout(() => {
        killed = true;
        // @ts-expect-error Runtime-specific API
        proc.kill('SIGKILL');
      }, options.timeout);
    }

    // @ts-expect-error Runtime-specific API
    const exitCode = await proc.exited;
    // @ts-expect-error Runtime-specific API
    const stdout = await new Response(proc.stdout).text();
    // @ts-expect-error Runtime-specific API
    const stderr = await new Response(proc.stderr).text();

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return {
      exitCode,
      stdout,
      stderr,
      killed,
    };
  } catch (err) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      killed: false,
    };
  }
}

/**
 * Read a file cross-runtime
 */
export async function readFile(path: string): Promise<string> {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error Runtime-specific API
      return Deno.readTextFile(path);

    case 'bun':
      // @ts-expect-error Runtime-specific API
      return Bun.file(path).text();

    default:
      const fs = await import('node:fs/promises');
      return fs.readFile(path, 'utf-8');
  }
}

/**
 * Write a file cross-runtime
 */
export async function writeFile(path: string, content: string): Promise<void> {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error Runtime-specific API
      await Deno.writeTextFile(path, content);
      break;

    case 'bun':
      // @ts-expect-error Runtime-specific API
      await Bun.write(path, content);
      break;

    default:
      const fs = await import('node:fs/promises');
      await fs.writeFile(path, content, 'utf-8');
      break;
  }
}

/**
 * Check if a file exists cross-runtime
 */
export async function fileExists(path: string): Promise<boolean> {
  const runtime = detectRuntime();

  try {
    switch (runtime) {
      case 'deno':
        // @ts-expect-error Runtime-specific API
        await Deno.stat(path);
        return true;

      case 'bun':
        // @ts-expect-error Runtime-specific API
        return Bun.file(path).exists();

      default:
        const fs = await import('node:fs/promises');
        await fs.access(path);
        return true;
    }
  } catch {
    return false;
  }
}

/**
 * Get environment variable cross-runtime
 */
export function getEnv(key: string): string | undefined {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error Runtime-specific API
      return Deno.env.get(key);

    default:
      return process.env[key];
  }
}

/**
 * Set environment variable cross-runtime
 */
export function setEnv(key: string, value: string): void {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error Runtime-specific API
      Deno.env.set(key, value);
      break;

    default:
      process.env[key] = value;
      break;
  }
}

/**
 * Exit the process cross-runtime
 */
export function exit(code: number): never {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error - Deno.exit always throws/terminates, so no break needed
      Deno.exit(code);
      // Note: Deno.exit never returns, but TypeScript doesn't know that
      throw new Error('Unreachable');

    default:
      process.exit(code);
  }
}
