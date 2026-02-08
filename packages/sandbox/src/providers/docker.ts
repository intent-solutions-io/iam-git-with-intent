/**
 * Docker Sandbox Provider
 *
 * Implements sandbox execution using Docker containers.
 * Provides container lifecycle, exec, snapshot (commit), and diff capabilities.
 */

import Docker from 'dockerode';
import { createHash } from 'node:crypto';
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
 * Docker container info extended with our metadata
 */
interface ContainerMetadata {
  sandboxId: string;
  createdAt: number;
  baseImage: string;
  workDir: string;
  snapshots: Map<SnapshotId, Snapshot>;
  initialFileState: Map<string, string>;
}

/**
 * Docker Sandbox implementation
 */
export class DockerSandbox implements Sandbox {
  readonly id: string;
  readonly type: SandboxType = 'docker';
  readonly createdAt: number;
  readonly config: SandboxConfig;

  private _status: SandboxStatus = 'creating';
  private docker: Docker;
  private container: Docker.Container | null = null;
  private metadata: ContainerMetadata;

  constructor(
    id: string,
    config: SandboxConfig,
    docker: Docker,
    metadata: ContainerMetadata
  ) {
    this.id = id;
    this.config = config;
    this.docker = docker;
    this.createdAt = metadata.createdAt;
    this.metadata = metadata;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  /**
   * Initialize the container
   */
  async initialize(): Promise<void> {
    const createOptions: Docker.ContainerCreateOptions = {
      Image: this.config.baseImage,
      Tty: true,
      OpenStdin: true,
      WorkingDir: this.config.workDir ?? '/workspace',
      Labels: {
        'gwi.sandbox.id': this.id,
        'gwi.sandbox.type': 'docker',
        'gwi.sandbox.created': this.createdAt.toString(),
        ...this.config.labels,
      },
      Env: this.config.env
        ? Object.entries(this.config.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      HostConfig: {
        Memory: this.config.resources?.memoryMb
          ? this.config.resources.memoryMb * 1024 * 1024
          : undefined,
        NanoCpus: this.config.resources?.cpuCores
          ? this.config.resources.cpuCores * 1e9
          : undefined,
        NetworkMode: this.config.network?.enabled === false ? 'none' : 'bridge',
        Binds: this.config.mounts?.map(
          (m) => `${m.hostPath}:${m.containerPath}${m.readonly ? ':ro' : ''}`
        ),
        PidsLimit: this.config.resources?.maxProcesses,
      },
    };

    const container = await this.docker.createContainer(createOptions);
    this.container = container;

    // Start the container
    await container.start();
    this._status = 'running';

    // Capture initial file state for diffing
    await this.captureInitialState();

    // Set up auto-destroy if configured
    if (this.config.autoDestroyAfterMs) {
      setTimeout(() => {
        this.destroy().catch(() => {});
      }, this.config.autoDestroyAfterMs);
    }
  }

  /**
   * Capture initial file state for diffing
   */
  private async captureInitialState(): Promise<void> {
    try {
      const result = await this.execute(
        'find /workspace -type f -exec sha256sum {} \\; 2>/dev/null || true'
      );
      if (result.exitCode === 0 && result.stdout) {
        const lines = result.stdout.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const [hash, path] = line.split(/\s+/, 2);
          if (hash && path) {
            this.metadata.initialFileState.set(path, hash);
          }
        }
      }
    } catch {
      // Ignore errors capturing initial state
    }
  }

  /**
   * Execute a command in the container
   */
  async execute(command: string, options?: ExecuteOptions): Promise<ExecResult> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    if (this._status !== 'running') {
      throw new Error(`Cannot execute in sandbox with status: ${this._status}`);
    }

    const startTime = Date.now();
    const workDir = options?.cwd ?? this.config.workDir ?? '/workspace';

    const execOptions: Docker.ExecCreateOptions = {
      Cmd: ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: !!options?.stdin,
      WorkingDir: workDir,
      Env: options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      User: options?.user,
    };

    const exec = await this.container.exec(execOptions);
    const stream = await exec.start({
      hijack: true,
      stdin: !!options?.stdin,
    });

    // Collect output
    let stdout = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = options?.timeoutMs ?? this.config.timeoutMs ?? 300000;
      const timeoutId = setTimeout(() => {
        stream.destroy();
        resolve({
          exitCode: -1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut: true,
        });
      }, timeout);

      // Docker multiplexes stdout/stderr in the stream
      // We need to demultiplex it
      // Docker.modem.demuxStream expects WritableStream-like objects
      // We use simple objects with write methods since we only need basic functionality
      const stdoutCollector = {
        write: (chunk: Buffer): boolean => {
          stdout += chunk.toString();
          return true;
        },
      };
      const stderrCollector = {
        write: (chunk: Buffer): boolean => {
          stderr += chunk.toString();
          return true;
        },
      };
      this.docker.modem.demuxStream(stream, stdoutCollector as any, stderrCollector as any);

      // Write stdin if provided
      if (options?.stdin) {
        stream.write(options.stdin);
        stream.end();
      }

      stream.on('end', async () => {
        clearTimeout(timeoutId);
        try {
          const inspect = await exec.inspect();
          resolve({
            exitCode: inspect.ExitCode ?? -1,
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
          });
        } catch (err) {
          reject(err);
        }
      });

      stream.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  /**
   * Execute multiple commands sequentially
   */
  async executeMany(commands: string[], options?: ExecuteOptions): Promise<ExecResult[]> {
    const results: ExecResult[] = [];
    for (const cmd of commands) {
      const result = await this.execute(cmd, options);
      results.push(result);
      if (result.exitCode !== 0) {
        break; // Stop on first failure
      }
    }
    return results;
  }

  /**
   * Write a file to the container
   */
  async writeFile(path: string, content: string | Buffer): Promise<void> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    const data = typeof content === 'string' ? Buffer.from(content) : content;
    const base64 = data.toString('base64');

    // Use echo with base64 to handle binary safely
    const result = await this.execute(`echo '${base64}' | base64 -d > ${path}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file ${path}: ${result.stderr}`);
    }
  }

  /**
   * Read a file from the container
   */
  async readFile(path: string): Promise<string> {
    const result = await this.execute(`cat ${path}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }
    return result.stdout;
  }

  /**
   * Read a binary file from the container
   */
  async readFileBuffer(path: string): Promise<Buffer> {
    const result = await this.execute(`cat ${path} | base64`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }
    return Buffer.from(result.stdout.trim(), 'base64');
  }

  /**
   * Check if a file exists
   */
  async fileExists(path: string): Promise<boolean> {
    const result = await this.execute(`test -e ${path} && echo "yes" || echo "no"`);
    return result.stdout.trim() === 'yes';
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string, recursive = false): Promise<string[]> {
    const cmd = recursive
      ? `find ${path} -type f 2>/dev/null`
      : `ls -1 ${path} 2>/dev/null`;
    const result = await this.execute(cmd);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Delete a file or directory
   */
  async deleteFile(path: string, recursive = false): Promise<void> {
    const cmd = recursive ? `rm -rf ${path}` : `rm -f ${path}`;
    const result = await this.execute(cmd);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to delete ${path}: ${result.stderr}`);
    }
  }

  /**
   * Copy files into the container
   */
  async copyIn(localPath: string, sandboxPath: string): Promise<void> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }
    // Read file content and write to sandbox
    const fs = await import('node:fs');
    const content = fs.readFileSync(localPath);
    await this.writeFile(sandboxPath, content);
  }

  /**
   * Copy files out of the container
   */
  async copyOut(sandboxPath: string, localPath: string): Promise<void> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    const fs = await import('node:fs');
    const content = await this.readFileBuffer(sandboxPath);
    fs.writeFileSync(localPath, content);
  }

  /**
   * Create a snapshot (docker commit)
   */
  async snapshot(name?: string): Promise<SnapshotId> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    const timestamp = Date.now();
    const snapshotId = createSnapshotId(
      `snap-${this.id}-${timestamp}-${Math.random().toString(36).slice(2, 6)}`
    );

    // Docker commit
    const image = await this.container.commit({
      repo: `gwi-sandbox-snapshot`,
      tag: snapshotId,
      comment: name ?? `Snapshot at ${new Date(timestamp).toISOString()}`,
    });

    // Record snapshot metadata
    const snapshot: Snapshot = {
      id: snapshotId,
      sandboxId: this.id,
      name,
      createdAt: timestamp,
      tags: { imageId: image.Id },
    };

    this.metadata.snapshots.set(snapshotId, snapshot);

    return snapshotId;
  }

  /**
   * Restore to a snapshot
   */
  async restore(snapshotId: SnapshotId): Promise<void> {
    const snapshot = this.metadata.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Stop current container
    if (this.container && this._status === 'running') {
      await this.container.stop();
    }

    // Remove current container
    if (this.container) {
      await this.container.remove();
    }

    // Create new container from snapshot image
    const createOptions: Docker.ContainerCreateOptions = {
      Image: `gwi-sandbox-snapshot:${snapshotId}`,
      Tty: true,
      OpenStdin: true,
      WorkingDir: this.metadata.workDir,
      Labels: {
        'gwi.sandbox.id': this.id,
        'gwi.sandbox.type': 'docker',
        'gwi.sandbox.restored-from': snapshotId,
      },
    };

    const container = await this.docker.createContainer(createOptions);
    this.container = container;

    await container.start();
    this._status = 'running';
  }

  /**
   * Get diff since snapshot (or since creation)
   */
  async diff(since?: SnapshotId): Promise<FileDiff[]> {
    // Get current file state
    const currentState = new Map<string, string>();
    const result = await this.execute(
      'find /workspace -type f -exec sha256sum {} \\; 2>/dev/null || true'
    );
    if (result.exitCode === 0 && result.stdout) {
      const lines = result.stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [hash, path] = line.split(/\s+/, 2);
        if (hash && path) {
          currentState.set(path, hash);
        }
      }
    }

    // Compare with initial state or snapshot
    const baseState = since
      ? await this.getSnapshotFileState(since)
      : this.metadata.initialFileState;

    const diffs: FileDiff[] = [];

    // Find added and modified files
    for (const [path, hash] of currentState) {
      const baseHash = baseState.get(path);
      if (!baseHash) {
        // Added
        const content = await this.readFile(path).catch(() => null);
        diffs.push({
          path,
          type: 'added',
          newContent: content,
        });
      } else if (baseHash !== hash) {
        // Modified
        const content = await this.readFile(path).catch(() => null);
        diffs.push({
          path,
          type: 'modified',
          newContent: content,
        });
      }
    }

    // Find deleted files
    for (const [path] of baseState) {
      if (!currentState.has(path)) {
        diffs.push({
          path,
          type: 'deleted',
          oldContent: null, // We don't have access to old content
        });
      }
    }

    return diffs;
  }

  /**
   * Get file state from a snapshot (would need to run container from snapshot)
   */
  private async getSnapshotFileState(_snapshotId: SnapshotId): Promise<Map<string, string>> {
    // For simplicity, we'll use initial state as baseline
    // A full implementation would start a temp container from the snapshot
    return this.metadata.initialFileState;
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<Snapshot[]> {
    return Array.from(this.metadata.snapshots.values());
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: SnapshotId): Promise<void> {
    const snapshot = this.metadata.snapshots.get(snapshotId);
    if (!snapshot) {
      return;
    }

    try {
      const image = this.docker.getImage(`gwi-sandbox-snapshot:${snapshotId}`);
      await image.remove();
    } catch {
      // Image may already be removed
    }

    this.metadata.snapshots.delete(snapshotId);
  }

  /**
   * Export artifacts from sandbox
   */
  async exportArtifacts(paths?: string[]): Promise<Artifact[]> {
    const targetPaths = paths ?? ['/workspace'];
    const artifacts: Artifact[] = [];

    for (const path of targetPaths) {
      const files = await this.listFiles(path, true);
      for (const file of files) {
        try {
          const content = await this.readFileBuffer(file);
          artifacts.push({
            name: file,
            type: 'file',
            content,
            sizeBytes: content.length,
            checksum: createHash('sha256').update(content).digest('hex'),
            createdAt: Date.now(),
          });
        } catch {
          // Skip files we can't read
        }
      }
    }

    return artifacts;
  }

  /**
   * Pause the container
   */
  async pause(): Promise<void> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }
    await this.container.pause();
    this._status = 'paused';
  }

  /**
   * Resume a paused container
   */
  async resume(): Promise<void> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }
    await this.container.unpause();
    this._status = 'running';
  }

  /**
   * Destroy the sandbox
   */
  async destroy(): Promise<void> {
    if (!this.container) {
      return;
    }

    try {
      // Stop if running
      if (this._status === 'running' || this._status === 'paused') {
        await this.container.stop({ t: 5 }).catch(() => {});
      }

      // Remove container
      await this.container.remove({ force: true });

      // Clean up snapshots
      for (const snapshotId of this.metadata.snapshots.keys()) {
        await this.deleteSnapshot(snapshotId);
      }
    } finally {
      this._status = 'destroyed';
      this.container = null;
    }
  }

  /**
   * Get container logs
   */
  async getLogs(options?: LogOptions): Promise<string> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    const stream = await this.container.logs({
      stdout: true,
      stderr: true,
      tail: options?.lines ?? 100,
      timestamps: options?.timestamps,
      since: options?.since ? Math.floor(options.since / 1000) : undefined,
    });

    return stream.toString();
  }

  /**
   * Get resource usage statistics
   */
  async getStats(): Promise<SandboxStats> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    const stats = await this.container.stats({ stream: false });

    // Calculate CPU percentage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent =
      systemDelta > 0
        ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100
        : 0;

    // Memory
    const memoryMb = stats.memory_stats.usage / (1024 * 1024);
    const memoryLimitMb = stats.memory_stats.limit / (1024 * 1024);

    // Network
    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      for (const net of Object.values(stats.networks)) {
        networkRx += (net as { rx_bytes: number }).rx_bytes;
        networkTx += (net as { tx_bytes: number }).tx_bytes;
      }
    }

    // Get process count
    const topResult = await this.execute('ps aux | wc -l');
    const processCount = parseInt(topResult.stdout.trim()) - 1 || 1;

    return {
      cpuPercent,
      memoryMb,
      memoryLimitMb,
      diskMb: 0, // Would need to inspect container for this
      networkRxBytes: networkRx,
      networkTxBytes: networkTx,
      processCount,
      uptimeSeconds: (Date.now() - this.createdAt) / 1000,
    };
  }
}

/**
 * Docker Sandbox Provider
 */
export class DockerSandboxProvider extends BaseSandboxProvider {
  readonly name = 'docker';
  readonly type: SandboxType = 'docker';

  private docker: Docker;

  constructor(options?: Docker.DockerOptions) {
    super();
    this.docker = new Docker(options);
  }

  /**
   * Create a new Docker sandbox
   */
  async create(config: SandboxConfig): Promise<Sandbox> {
    if (config.type !== 'docker') {
      throw new Error(`Docker provider cannot create ${config.type} sandbox`);
    }

    const sandboxId = this.generateSandboxId();
    const metadata: ContainerMetadata = {
      sandboxId,
      createdAt: Date.now(),
      baseImage: config.baseImage,
      workDir: config.workDir ?? '/workspace',
      snapshots: new Map(),
      initialFileState: new Map(),
    };

    const sandbox = new DockerSandbox(sandboxId, config, this.docker, metadata);
    await sandbox.initialize();

    this.registerSandbox(sandbox);
    this.emitEvent({
      type: 'create',
      sandboxId,
      timestamp: Date.now(),
      details: { baseImage: config.baseImage },
    });

    return sandbox;
  }

  /**
   * Check Docker health
   */
  async healthCheck(): Promise<ProviderHealth> {
    try {
      const info = await this.docker.info();
      const containers = await this.docker.listContainers({ all: true });

      return {
        healthy: true,
        message: `Docker ${info.ServerVersion} running`,
        resources: {
          availableCpuCores: info.NCPU,
          availableMemoryMb: Math.floor(info.MemTotal / (1024 * 1024)),
          runningContainers: containers.filter((c) => c.State === 'running').length,
          maxContainers: info.NCPU * 10, // Rough estimate
        },
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'Docker not available',
        checkedAt: Date.now(),
      };
    }
  }

  /**
   * Pull an image if not present
   */
  async pullImage(imageName: string): Promise<void> {
    const images = await this.docker.listImages({
      filters: { reference: [imageName] },
    });

    if (images.length === 0) {
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }
          this.docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    }
  }
}
