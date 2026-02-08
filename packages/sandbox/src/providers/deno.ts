/**
 * Deno Sandbox Provider
 *
 * Implements sandbox execution using Deno subprocess isolates.
 * Provides lightweight TypeScript/JavaScript execution with permission controls.
 *
 * Benefits:
 * - Native TypeScript execution
 * - Fine-grained permission model (--allow-net, --allow-read, etc.)
 * - Fast startup times
 * - Web-standard APIs
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxType,
  SnapshotId,
  Snapshot,
  ExecResult,
  ExecuteOptions,
  LogOptions,
  SandboxStats,
  FileDiff,
  Artifact,
  ProviderHealth,
} from '../types.js';
import { createSnapshotId } from '../types.js';
import { BaseSandboxProvider } from './base.js';

/**
 * Deno sandbox metadata
 */
interface DenoMetadata {
  sandboxId: string;
  createdAt: number;
  workDir: string;
  permissions: DenoPermissions;
  snapshots: Map<SnapshotId, DenoSnapshot>;
  initialFileState: Map<string, string>;
  executionLog: string[];
}

/**
 * Deno permissions configuration
 */
interface DenoPermissions {
  allowNet?: boolean | string[];
  allowRead?: boolean | string[];
  allowWrite?: boolean | string[];
  allowEnv?: boolean | string[];
  allowRun?: boolean | string[];
  allowFfi?: boolean;
  allowAll?: boolean;
}

/**
 * Deno snapshot with file system state
 */
interface DenoSnapshot extends Snapshot {
  files: Map<string, Buffer>;
}

/**
 * Execute Deno command
 */
async function execDeno(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdin?: string;
    timeoutMs?: number;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const timeout = options.timeoutMs ?? 60000;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const childProcess = spawn('deno', args, {
      cwd: options.cwd,
      env: options.env ? { ...globalThis.process.env, ...options.env } : globalThis.process.env,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      childProcess.kill('SIGKILL');
    }, timeout);

    if (options.stdin) {
      childProcess.stdin.write(options.stdin);
      childProcess.stdin.end();
    }

    childProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        timedOut,
      });
    });
  });
}

/**
 * Deno Sandbox implementation
 */
export class DenoSandbox implements Sandbox {
  readonly id: string;
  readonly type: SandboxType = 'deno-isolate';
  readonly createdAt: number;
  readonly config: SandboxConfig;

  private _status: SandboxStatus = 'creating';
  private metadata: DenoMetadata;

  constructor(id: string, config: SandboxConfig, metadata: DenoMetadata) {
    this.id = id;
    this.config = config;
    this.createdAt = metadata.createdAt;
    this.metadata = metadata;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  /**
   * Initialize the sandbox
   */
  async initialize(): Promise<void> {
    // Create working directory
    await fs.mkdir(this.metadata.workDir, { recursive: true });

    // Write initial files if any in config
    if (this.config.mounts) {
      for (const mount of this.config.mounts) {
        const sourceStat = await fs.stat(mount.hostPath).catch(() => null);
        if (sourceStat?.isFile()) {
          const content = await fs.readFile(mount.hostPath);
          const destPath = join(this.metadata.workDir, mount.containerPath);
          await fs.mkdir(dirname(destPath), { recursive: true });
          await fs.writeFile(destPath, content);
        } else if (sourceStat?.isDirectory()) {
          // Copy directory
          await this.copyDirectory(mount.hostPath, join(this.metadata.workDir, mount.containerPath));
        }
      }
    }

    // Capture initial state
    await this.captureFileState(this.metadata.initialFileState);

    this._status = 'running';

    // Auto-destroy timer
    if (this.config.autoDestroyAfterMs) {
      setTimeout(() => {
        this.destroy().catch(() => {});
      }, this.config.autoDestroyAfterMs);
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Capture current file state
   */
  private async captureFileState(state: Map<string, string>): Promise<void> {
    const files = await this.listFilesRecursive(this.metadata.workDir);
    for (const file of files) {
      try {
        const content = await fs.readFile(file);
        const hash = createHash('sha256').update(content).digest('hex');
        state.set(file, hash);
      } catch {
        // Skip unreadable files
      }
    }
  }

  /**
   * List files recursively
   */
  private async listFilesRecursive(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFilesRecursive(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Build Deno permission flags
   */
  private buildPermissionFlags(): string[] {
    const flags: string[] = [];
    const perms = this.metadata.permissions;

    if (perms.allowAll) {
      flags.push('-A');
      return flags;
    }

    if (perms.allowNet === true) {
      flags.push('--allow-net');
    } else if (Array.isArray(perms.allowNet)) {
      flags.push(`--allow-net=${perms.allowNet.join(',')}`);
    }

    if (perms.allowRead === true) {
      flags.push('--allow-read');
    } else if (Array.isArray(perms.allowRead)) {
      flags.push(`--allow-read=${perms.allowRead.join(',')}`);
    }

    if (perms.allowWrite === true) {
      flags.push('--allow-write');
    } else if (Array.isArray(perms.allowWrite)) {
      flags.push(`--allow-write=${perms.allowWrite.join(',')}`);
    }

    if (perms.allowEnv === true) {
      flags.push('--allow-env');
    } else if (Array.isArray(perms.allowEnv)) {
      flags.push(`--allow-env=${perms.allowEnv.join(',')}`);
    }

    if (perms.allowRun === true) {
      flags.push('--allow-run');
    } else if (Array.isArray(perms.allowRun)) {
      flags.push(`--allow-run=${perms.allowRun.join(',')}`);
    }

    if (perms.allowFfi) {
      flags.push('--allow-ffi');
    }

    return flags;
  }

  /**
   * Execute TypeScript/JavaScript code
   */
  async execute(command: string, options?: ExecuteOptions): Promise<ExecResult> {
    if (this._status !== 'running') {
      throw new Error(`Cannot execute in sandbox with status: ${this._status}`);
    }

    const startTime = Date.now();

    // Determine if this is code or a shell command
    const isCode = command.includes('Deno.') || command.includes('import ') ||
                   command.includes('const ') || command.includes('let ') ||
                   command.includes('function ') || command.includes('=>');

    if (isCode) {
      // Execute as Deno eval
      const permFlags = this.buildPermissionFlags();
      const result = await execDeno(
        ['eval', ...permFlags, command],
        {
          cwd: options?.cwd ?? this.metadata.workDir,
          env: { ...this.config.env, ...options?.env },
          stdin: options?.stdin,
          timeoutMs: options?.timeoutMs ?? this.config.timeoutMs ?? 300000,
        }
      );

      this.metadata.executionLog.push(`[${new Date().toISOString()}] deno eval: ${command.slice(0, 100)}`);

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startTime,
        timedOut: result.timedOut,
      };
    } else {
      // Execute as shell command via Deno run
      const shellScript = `
        const p = new Deno.Command("sh", {
          args: ["-c", ${JSON.stringify(command)}],
          cwd: ${JSON.stringify(options?.cwd ?? this.metadata.workDir)},
          stdout: "piped",
          stderr: "piped",
          stdin: ${options?.stdin ? '"piped"' : '"null"'},
        });
        const child = p.spawn();
        ${options?.stdin ? `
        const writer = child.stdin.getWriter();
        await writer.write(new TextEncoder().encode(${JSON.stringify(options.stdin)}));
        await writer.close();
        ` : ''}
        const output = await child.output();
        const stdout = new TextDecoder().decode(output.stdout);
        const stderr = new TextDecoder().decode(output.stderr);
        console.log(JSON.stringify({ code: output.code, stdout, stderr }));
      `;

      const result = await execDeno(
        ['eval', '--allow-run', '--allow-read', '--allow-write', shellScript],
        {
          cwd: this.metadata.workDir,
          env: { ...this.config.env, ...options?.env },
          timeoutMs: options?.timeoutMs ?? this.config.timeoutMs ?? 300000,
        }
      );

      this.metadata.executionLog.push(`[${new Date().toISOString()}] shell: ${command.slice(0, 100)}`);

      if (result.timedOut) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Command timed out',
          durationMs: Date.now() - startTime,
          timedOut: true,
        };
      }

      try {
        const parsed = JSON.parse(result.stdout);
        return {
          exitCode: parsed.code,
          stdout: parsed.stdout,
          stderr: parsed.stderr,
          durationMs: Date.now() - startTime,
        };
      } catch {
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: Date.now() - startTime,
        };
      }
    }
  }

  /**
   * Execute multiple commands
   */
  async executeMany(commands: string[], options?: ExecuteOptions): Promise<ExecResult[]> {
    const results: ExecResult[] = [];
    for (const cmd of commands) {
      const result = await this.execute(cmd, options);
      results.push(result);
      if (result.exitCode !== 0) {
        break;
      }
    }
    return results;
  }

  /**
   * Write a file
   */
  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  /**
   * Read a file
   */
  async readFile(path: string): Promise<string> {
    const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Read binary file
   */
  async readFileBuffer(path: string): Promise<Buffer> {
    const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
    return fs.readFile(fullPath);
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files
   */
  async listFiles(path: string, recursive = false): Promise<string[]> {
    const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
    if (recursive) {
      return this.listFilesRecursive(fullPath);
    }
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => join(fullPath, e.name));
  }

  /**
   * Delete file
   */
  async deleteFile(path: string, recursive = false): Promise<void> {
    const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
    if (recursive) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }
  }

  /**
   * Copy files in
   */
  async copyIn(localPath: string, sandboxPath: string): Promise<void> {
    const destPath = sandboxPath.startsWith('/')
      ? sandboxPath
      : join(this.metadata.workDir, sandboxPath);
    await fs.mkdir(dirname(destPath), { recursive: true });
    await fs.copyFile(localPath, destPath);
  }

  /**
   * Copy files out
   */
  async copyOut(sandboxPath: string, localPath: string): Promise<void> {
    const srcPath = sandboxPath.startsWith('/')
      ? sandboxPath
      : join(this.metadata.workDir, sandboxPath);
    await fs.mkdir(dirname(localPath), { recursive: true });
    await fs.copyFile(srcPath, localPath);
  }

  /**
   * Create snapshot (copy all files)
   */
  async snapshot(name?: string): Promise<SnapshotId> {
    const timestamp = Date.now();
    const snapshotId = createSnapshotId(
      `snap-${this.id}-${timestamp}-${randomBytes(4).toString('hex')}`
    );

    const files = new Map<string, Buffer>();
    const allFiles = await this.listFilesRecursive(this.metadata.workDir);

    for (const file of allFiles) {
      const content = await fs.readFile(file);
      const relativePath = file.replace(this.metadata.workDir, '');
      files.set(relativePath, content);
    }

    const snapshot: DenoSnapshot = {
      id: snapshotId,
      sandboxId: this.id,
      name,
      createdAt: timestamp,
      files,
    };

    this.metadata.snapshots.set(snapshotId, snapshot);
    return snapshotId;
  }

  /**
   * Restore to snapshot
   */
  async restore(snapshotId: SnapshotId): Promise<void> {
    const snapshot = this.metadata.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Clear current directory
    await fs.rm(this.metadata.workDir, { recursive: true, force: true });
    await fs.mkdir(this.metadata.workDir, { recursive: true });

    // Restore files
    for (const [relativePath, content] of snapshot.files) {
      const fullPath = join(this.metadata.workDir, relativePath);
      await fs.mkdir(dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }

  /**
   * Get diff since snapshot
   */
  async diff(since?: SnapshotId): Promise<FileDiff[]> {
    const currentState = new Map<string, string>();
    await this.captureFileState(currentState);

    const baseState = since
      ? await this.getSnapshotFileState(since)
      : this.metadata.initialFileState;

    const diffs: FileDiff[] = [];

    for (const [path, hash] of currentState) {
      const relativePath = path.replace(this.metadata.workDir, '');
      const baseHash = baseState.get(path);

      if (!baseHash) {
        const content = await fs.readFile(path, 'utf-8').catch(() => null);
        diffs.push({ path: relativePath, type: 'added', newContent: content });
      } else if (baseHash !== hash) {
        const content = await fs.readFile(path, 'utf-8').catch(() => null);
        diffs.push({ path: relativePath, type: 'modified', newContent: content });
      }
    }

    for (const [path] of baseState) {
      if (!currentState.has(path)) {
        const relativePath = path.replace(this.metadata.workDir, '');
        diffs.push({ path: relativePath, type: 'deleted' });
      }
    }

    return diffs;
  }

  /**
   * Get file state from snapshot
   */
  private async getSnapshotFileState(snapshotId: SnapshotId): Promise<Map<string, string>> {
    const snapshot = this.metadata.snapshots.get(snapshotId);
    if (!snapshot) {
      return this.metadata.initialFileState;
    }

    const state = new Map<string, string>();
    for (const [relativePath, content] of snapshot.files) {
      const fullPath = join(this.metadata.workDir, relativePath);
      const hash = createHash('sha256').update(content).digest('hex');
      state.set(fullPath, hash);
    }
    return state;
  }

  /**
   * List snapshots
   */
  async listSnapshots(): Promise<Snapshot[]> {
    return Array.from(this.metadata.snapshots.values());
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(snapshotId: SnapshotId): Promise<void> {
    this.metadata.snapshots.delete(snapshotId);
  }

  /**
   * Export artifacts
   */
  async exportArtifacts(paths?: string[]): Promise<Artifact[]> {
    const targetPaths = paths ?? [this.metadata.workDir];
    const artifacts: Artifact[] = [];

    for (const path of targetPaths) {
      const fullPath = path.startsWith('/') ? path : join(this.metadata.workDir, path);
      const files = await this.listFilesRecursive(fullPath);

      for (const file of files) {
        try {
          const content = await fs.readFile(file);
          artifacts.push({
            name: file.replace(this.metadata.workDir, ''),
            type: 'file',
            content,
            sizeBytes: content.length,
            checksum: createHash('sha256').update(content).digest('hex'),
            createdAt: Date.now(),
          });
        } catch {
          // Skip
        }
      }
    }

    return artifacts;
  }

  /**
   * Pause (no-op for Deno isolate)
   */
  async pause(): Promise<void> {
    this._status = 'paused';
  }

  /**
   * Resume
   */
  async resume(): Promise<void> {
    this._status = 'running';
  }

  /**
   * Destroy sandbox
   */
  async destroy(): Promise<void> {
    try {
      await fs.rm(this.metadata.workDir, { recursive: true, force: true });
    } finally {
      this._status = 'destroyed';
    }
  }

  /**
   * Get execution logs
   */
  async getLogs(options?: LogOptions): Promise<string> {
    const lines = options?.lines ?? 100;
    return this.metadata.executionLog.slice(-lines).join('\n');
  }

  /**
   * Get stats (limited for Deno isolate)
   */
  async getStats(): Promise<SandboxStats> {
    // Get workspace size
    let diskMb = 0;
    const files = await this.listFilesRecursive(this.metadata.workDir);
    for (const file of files) {
      const stat = await fs.stat(file).catch(() => null);
      if (stat) {
        diskMb += stat.size / (1024 * 1024);
      }
    }

    return {
      cpuPercent: 0, // Not tracked for isolates
      memoryMb: 0,
      memoryLimitMb: 0,
      diskMb: Math.round(diskMb * 100) / 100,
      networkRxBytes: 0,
      networkTxBytes: 0,
      processCount: 0,
      uptimeSeconds: (Date.now() - this.createdAt) / 1000,
    };
  }
}

/**
 * Deno Sandbox Provider
 */
export class DenoSandboxProvider extends BaseSandboxProvider {
  readonly name = 'deno';
  readonly type: SandboxType = 'deno-isolate';

  private basePath: string;

  constructor(basePath?: string) {
    super();
    this.basePath = basePath ?? join(tmpdir(), 'gwi-deno-sandboxes');
  }

  /**
   * Create Deno sandbox
   */
  async create(config: SandboxConfig): Promise<Sandbox> {
    if (config.type !== 'deno-isolate') {
      throw new Error(`Deno provider cannot create ${config.type} sandbox`);
    }

    const sandboxId = this.generateSandboxId();
    const workDir = join(this.basePath, sandboxId);

    // Parse permissions from config
    const permissions: DenoPermissions = {
      allowRead: config.network?.enabled !== false,
      allowWrite: true, // Allow writes to sandbox dir
      allowNet: config.network?.enabled !== false
        ? config.network?.allowedHosts ?? true
        : false,
      allowEnv: true,
      allowRun: config.enableRoot ?? false,
    };

    const metadata: DenoMetadata = {
      sandboxId,
      createdAt: Date.now(),
      workDir,
      permissions,
      snapshots: new Map(),
      initialFileState: new Map(),
      executionLog: [],
    };

    const sandbox = new DenoSandbox(sandboxId, config, metadata);
    await sandbox.initialize();

    this.registerSandbox(sandbox);
    this.emitEvent({
      type: 'create',
      sandboxId,
      timestamp: Date.now(),
      details: { workDir },
    });

    return sandbox;
  }

  /**
   * Check Deno availability
   */
  async healthCheck(): Promise<ProviderHealth> {
    try {
      const result = await execDeno(['--version'], { timeoutMs: 5000 });

      if (result.exitCode !== 0) {
        throw new Error(result.stderr);
      }

      const versionMatch = result.stdout.match(/deno (\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      return {
        healthy: true,
        message: `Deno ${version} available`,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'Deno not available',
        checkedAt: Date.now(),
      };
    }
  }
}
