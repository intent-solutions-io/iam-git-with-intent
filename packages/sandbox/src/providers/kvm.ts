/**
 * KVM Sandbox Provider
 *
 * Implements sandbox execution using KVM virtual machines via libvirt.
 * Provides full VM lifecycle with qcow2 snapshots and SSH control.
 *
 * Inspired by fluid.sh's approach to giving AI agents safe production access.
 */

import { Client as SSHClient, type ConnectConfig as SSHConfig } from 'ssh2';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
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
 * KVM VM metadata
 */
interface VMMetadata {
  sandboxId: string;
  createdAt: number;
  domainName: string;
  diskPath: string;
  baseDiskPath: string;
  sshConfig: SSHConfig;
  snapshots: Map<SnapshotId, Snapshot>;
  initialFileState: Map<string, string>;
}

/**
 * KVM configuration options
 */
export interface KVMProviderConfig {
  /** libvirt connection URI (default: qemu:///system) */
  libvirtUri?: string;
  /** Path to VM images */
  imagePath?: string;
  /** SSH key path for VM access */
  sshKeyPath?: string;
  /** Default SSH user */
  sshUser?: string;
  /** VM network bridge */
  networkBridge?: string;
  /** Base port for SSH forwarding */
  baseSshPort?: number;
}

/**
 * Execute virsh command
 */
async function virsh(
  uri: string,
  args: string[],
  timeoutMs = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const process = spawn('virsh', ['-c', uri, ...args]);
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      process.kill('SIGKILL');
    }, timeoutMs);

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: killed ? -1 : (exitCode ?? -1),
      });
    });
  });
}

/**
 * Execute qemu-img command
 */
async function qemuImg(
  args: string[],
  timeoutMs = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const process = spawn('qemu-img', args);
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      process.kill('SIGKILL');
    }, timeoutMs);

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: killed ? -1 : (exitCode ?? -1),
      });
    });
  });
}

/**
 * KVM Sandbox implementation
 */
export class KVMSandbox implements Sandbox {
  readonly id: string;
  readonly type: SandboxType = 'kvm';
  readonly createdAt: number;
  readonly config: SandboxConfig;

  private _status: SandboxStatus = 'creating';
  private providerConfig: KVMProviderConfig;
  private metadata: VMMetadata;
  private sshClient: SSHClient | null = null;

  constructor(
    id: string,
    config: SandboxConfig,
    providerConfig: KVMProviderConfig,
    metadata: VMMetadata
  ) {
    this.id = id;
    this.config = config;
    this.providerConfig = providerConfig;
    this.createdAt = metadata.createdAt;
    this.metadata = metadata;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  /**
   * Initialize the VM
   */
  async initialize(): Promise<void> {
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';

    // Create overlay disk from base image
    const baseDisk = this.metadata.baseDiskPath;
    const overlayDisk = this.metadata.diskPath;

    const createResult = await qemuImg([
      'create',
      '-f',
      'qcow2',
      '-F',
      'qcow2',
      '-b',
      baseDisk,
      overlayDisk,
    ]);

    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create overlay disk: ${createResult.stderr}`);
    }

    // Generate domain XML
    const domainXml = this.generateDomainXml();

    // Define the domain by piping XML to virsh
    const defineProcess = spawn('virsh', ['-c', uri, 'define', '/dev/stdin']);
    defineProcess.stdin.write(domainXml);
    defineProcess.stdin.end();

    await new Promise<void>((resolve, reject) => {
      defineProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Failed to define VM domain'));
        }
      });
    });

    // Start the VM
    const startResult = await virsh(uri, ['start', this.metadata.domainName]);
    if (startResult.exitCode !== 0) {
      throw new Error(`Failed to start VM: ${startResult.stderr}`);
    }

    this._status = 'running';

    // Wait for SSH to become available
    await this.waitForSsh();

    // Capture initial file state
    await this.captureInitialState();

    // Set up auto-destroy if configured
    if (this.config.autoDestroyAfterMs) {
      setTimeout(() => {
        this.destroy().catch(() => {});
      }, this.config.autoDestroyAfterMs);
    }
  }

  /**
   * Generate libvirt domain XML
   */
  private generateDomainXml(): string {
    const memory = this.config.resources?.memoryMb ?? 2048;
    const cpus = this.config.resources?.cpuCores ?? 2;
    const bridge = this.providerConfig.networkBridge ?? 'virbr0';

    return `
<domain type='kvm'>
  <name>${this.metadata.domainName}</name>
  <memory unit='MiB'>${memory}</memory>
  <vcpu>${cpus}</vcpu>
  <os>
    <type arch='x86_64'>hvm</type>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-passthrough'/>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='${this.metadata.diskPath}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='bridge'>
      <source bridge='${bridge}'/>
      <model type='virtio'/>
    </interface>
    <serial type='pty'>
      <target port='0'/>
    </serial>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
  </devices>
  <metadata>
    <gwi:sandbox xmlns:gwi="http://intent.solutions/gwi">
      <gwi:id>${this.id}</gwi:id>
      <gwi:created>${this.createdAt}</gwi:created>
    </gwi:sandbox>
  </metadata>
</domain>
    `.trim();
  }

  /**
   * Wait for SSH to become available
   */
  private async waitForSsh(maxAttempts = 60, delayMs = 2000): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.connectSsh();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new Error('SSH connection timeout');
  }

  /**
   * Connect SSH client
   */
  private async connectSsh(): Promise<void> {
    if (this.sshClient) {
      return;
    }

    const client = new SSHClient();

    await new Promise<void>((resolve, reject) => {
      client.on('ready', () => {
        this.sshClient = client;
        resolve();
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.connect(this.metadata.sshConfig);
    });
  }

  /**
   * Capture initial file state
   */
  private async captureInitialState(): Promise<void> {
    try {
      const workDir = this.config.workDir ?? '/home';
      const result = await this.execute(
        `find ${workDir} -type f -exec sha256sum {} \\; 2>/dev/null || true`
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
      // Ignore errors
    }
  }

  /**
   * Execute a command via SSH
   */
  async execute(command: string, options?: ExecuteOptions): Promise<ExecResult> {
    if (!this.sshClient) {
      throw new Error('SSH not connected');
    }

    if (this._status !== 'running') {
      throw new Error(`Cannot execute in sandbox with status: ${this._status}`);
    }

    const startTime = Date.now();
    const workDir = options?.cwd ?? this.config.workDir ?? '/home';

    // Build command with cd and env
    let fullCommand = `cd ${workDir} && `;
    if (options?.env) {
      const envStr = Object.entries(options.env)
        .map(([k, v]) => `${k}='${v}'`)
        .join(' ');
      fullCommand += `${envStr} `;
    }
    fullCommand += command;

    // Use sudo if root access is enabled
    if (this.config.enableRoot && options?.user !== 'root') {
      fullCommand = `sudo sh -c '${fullCommand.replace(/'/g, "'\\''")}'`;
    }

    return new Promise((resolve, reject) => {
      const timeout = options?.timeoutMs ?? this.config.timeoutMs ?? 300000;
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        this.sshClient?.end();
      }, timeout);

      this.sshClient!.exec(fullCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(err);
          return;
        }

        if (options?.stdin) {
          stream.write(options.stdin);
          stream.end();
        }

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number, signal: string) => {
          clearTimeout(timeoutId);
          resolve({
            exitCode: code,
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
            timedOut,
            signal: signal || undefined,
          });
        });
      });
    });
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
   * Write a file via SSH
   */
  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const data = typeof content === 'string' ? content : content.toString('base64');
    const isBase64 = typeof content !== 'string';

    const cmd = isBase64
      ? `echo '${data}' | base64 -d > ${path}`
      : `cat > ${path} << 'GWISANDBOXEOF'\n${data}\nGWISANDBOXEOF`;

    const result = await this.execute(cmd);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file ${path}: ${result.stderr}`);
    }
  }

  /**
   * Read a file via SSH
   */
  async readFile(path: string): Promise<string> {
    const result = await this.execute(`cat ${path}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }
    return result.stdout;
  }

  /**
   * Read binary file
   */
  async readFileBuffer(path: string): Promise<Buffer> {
    const result = await this.execute(`cat ${path} | base64`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }
    return Buffer.from(result.stdout.trim(), 'base64');
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    const result = await this.execute(`test -e ${path} && echo yes || echo no`);
    return result.stdout.trim() === 'yes';
  }

  /**
   * List files
   */
  async listFiles(path: string, recursive = false): Promise<string[]> {
    const cmd = recursive
      ? `find ${path} -type f 2>/dev/null`
      : `ls -1 ${path} 2>/dev/null`;
    const result = await this.execute(cmd);
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Delete file
   */
  async deleteFile(path: string, recursive = false): Promise<void> {
    const cmd = recursive ? `rm -rf ${path}` : `rm -f ${path}`;
    await this.execute(cmd);
  }

  /**
   * Copy files into VM
   */
  async copyIn(localPath: string, sandboxPath: string): Promise<void> {
    const fs = await import('node:fs');
    const content = fs.readFileSync(localPath);
    await this.writeFile(sandboxPath, content);
  }

  /**
   * Copy files out of VM
   */
  async copyOut(sandboxPath: string, localPath: string): Promise<void> {
    const fs = await import('node:fs');
    const content = await this.readFileBuffer(sandboxPath);
    fs.writeFileSync(localPath, content);
  }

  /**
   * Create qcow2 snapshot
   */
  async snapshot(name?: string): Promise<SnapshotId> {
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';
    const timestamp = Date.now();
    const snapshotId = createSnapshotId(
      `snap-${this.id}-${timestamp}-${randomBytes(4).toString('hex')}`
    );

    // Create snapshot via virsh
    const snapshotDescription = name ?? `Snapshot at ${new Date(timestamp).toISOString()}`;
    const result = await virsh(uri, [
      'snapshot-create-as',
      this.metadata.domainName,
      snapshotId,
      '--description',
      snapshotDescription,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create snapshot: ${result.stderr}`);
    }

    const snapshot: Snapshot = {
      id: snapshotId,
      sandboxId: this.id,
      name,
      createdAt: timestamp,
    };

    this.metadata.snapshots.set(snapshotId, snapshot);
    return snapshotId;
  }

  /**
   * Restore to snapshot
   */
  async restore(snapshotId: SnapshotId): Promise<void> {
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';

    const result = await virsh(uri, [
      'snapshot-revert',
      this.metadata.domainName,
      snapshotId,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to restore snapshot: ${result.stderr}`);
    }

    // Reconnect SSH after restore
    this.sshClient?.end();
    this.sshClient = null;
    await this.waitForSsh();
  }

  /**
   * Get diff since snapshot
   */
  async diff(_since?: SnapshotId): Promise<FileDiff[]> {
    const workDir = this.config.workDir ?? '/home';
    const currentState = new Map<string, string>();

    const result = await this.execute(
      `find ${workDir} -type f -exec sha256sum {} \\; 2>/dev/null || true`
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

    const baseState = this.metadata.initialFileState;
    const diffs: FileDiff[] = [];

    for (const [path, hash] of currentState) {
      const baseHash = baseState.get(path);
      if (!baseHash) {
        const content = await this.readFile(path).catch(() => null);
        diffs.push({ path, type: 'added', newContent: content });
      } else if (baseHash !== hash) {
        const content = await this.readFile(path).catch(() => null);
        diffs.push({ path, type: 'modified', newContent: content });
      }
    }

    for (const [path] of baseState) {
      if (!currentState.has(path)) {
        diffs.push({ path, type: 'deleted' });
      }
    }

    return diffs;
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
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';

    await virsh(uri, ['snapshot-delete', this.metadata.domainName, snapshotId]);
    this.metadata.snapshots.delete(snapshotId);
  }

  /**
   * Export artifacts
   */
  async exportArtifacts(paths?: string[]): Promise<Artifact[]> {
    const workDir = this.config.workDir ?? '/home';
    const targetPaths = paths ?? [workDir];
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
          // Skip
        }
      }
    }

    return artifacts;
  }

  /**
   * Pause VM
   */
  async pause(): Promise<void> {
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';
    const result = await virsh(uri, ['suspend', this.metadata.domainName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to pause VM: ${result.stderr}`);
    }
    this._status = 'paused';
  }

  /**
   * Resume VM
   */
  async resume(): Promise<void> {
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';
    const result = await virsh(uri, ['resume', this.metadata.domainName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to resume VM: ${result.stderr}`);
    }
    this._status = 'running';
    await this.waitForSsh(30, 1000);
  }

  /**
   * Destroy VM
   */
  async destroy(): Promise<void> {
    const uri = this.providerConfig.libvirtUri ?? 'qemu:///system';

    try {
      // Close SSH
      this.sshClient?.end();
      this.sshClient = null;

      // Destroy domain
      await virsh(uri, ['destroy', this.metadata.domainName]);

      // Undefine domain
      await virsh(uri, ['undefine', this.metadata.domainName, '--snapshots-metadata']);

      // Remove overlay disk
      const fs = await import('node:fs');
      if (fs.existsSync(this.metadata.diskPath)) {
        fs.unlinkSync(this.metadata.diskPath);
      }
    } finally {
      this._status = 'destroyed';
    }
  }

  /**
   * Get logs (dmesg or journalctl)
   */
  async getLogs(options?: LogOptions): Promise<string> {
    const lines = options?.lines ?? 100;
    const cmd = options?.timestamps
      ? `journalctl -n ${lines} -o short-precise 2>/dev/null || dmesg | tail -n ${lines}`
      : `journalctl -n ${lines} 2>/dev/null || dmesg | tail -n ${lines}`;

    const result = await this.execute(cmd);
    return result.stdout;
  }

  /**
   * Get VM stats
   */
  async getStats(): Promise<SandboxStats> {
    // Get CPU and memory from /proc
    const cpuResult = await this.execute(
      "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"
    );
    const memResult = await this.execute("free -m | awk 'NR==2{print $3, $2}'");
    const diskResult = await this.execute("df -m / | awk 'NR==2{print $3}'");
    const netResult = await this.execute(
      "cat /proc/net/dev | awk 'NR>2{rx+=$2;tx+=$10}END{print rx,tx}'"
    );
    const procResult = await this.execute('ps aux | wc -l');

    const cpuPercent = parseFloat(cpuResult.stdout.trim()) || 0;
    const [memUsed, memTotal] = memResult.stdout.trim().split(/\s+/).map(Number);
    const diskMb = parseInt(diskResult.stdout.trim()) || 0;
    const [rxBytes, txBytes] = netResult.stdout.trim().split(/\s+/).map(Number);
    const processCount = parseInt(procResult.stdout.trim()) - 1 || 1;

    return {
      cpuPercent,
      memoryMb: memUsed || 0,
      memoryLimitMb: memTotal || this.config.resources?.memoryMb || 2048,
      diskMb,
      networkRxBytes: rxBytes || 0,
      networkTxBytes: txBytes || 0,
      processCount,
      uptimeSeconds: (Date.now() - this.createdAt) / 1000,
    };
  }
}

/**
 * KVM Sandbox Provider
 */
export class KVMSandboxProvider extends BaseSandboxProvider {
  readonly name = 'kvm';
  readonly type: SandboxType = 'kvm';

  private config: KVMProviderConfig;
  private nextSshPort: number;

  constructor(config: KVMProviderConfig = {}) {
    super();
    this.config = config;
    this.nextSshPort = config.baseSshPort ?? 2200;
  }

  /**
   * Create KVM sandbox
   */
  async create(config: SandboxConfig): Promise<Sandbox> {
    if (config.type !== 'kvm') {
      throw new Error(`KVM provider cannot create ${config.type} sandbox`);
    }

    const sandboxId = this.generateSandboxId();
    const imagePath = this.config.imagePath ?? '/var/lib/libvirt/images';
    const domainName = `gwi-sandbox-${sandboxId}`;
    const sshPort = this.nextSshPort++;

    // Determine base disk from config.baseImage
    const baseDiskPath = config.baseImage.startsWith('/')
      ? config.baseImage
      : `${imagePath}/${config.baseImage}.qcow2`;

    const diskPath = `${imagePath}/overlay-${sandboxId}.qcow2`;

    const sshConfig: SSHConfig = {
      host: '127.0.0.1',
      port: sshPort,
      username: this.config.sshUser ?? 'root',
      privateKey: this.config.sshKeyPath
        ? (await import('node:fs')).readFileSync(this.config.sshKeyPath)
        : undefined,
    };

    const metadata: VMMetadata = {
      sandboxId,
      createdAt: Date.now(),
      domainName,
      diskPath,
      baseDiskPath,
      sshConfig,
      snapshots: new Map(),
      initialFileState: new Map(),
    };

    const sandbox = new KVMSandbox(sandboxId, config, this.config, metadata);
    await sandbox.initialize();

    this.registerSandbox(sandbox);
    this.emitEvent({
      type: 'create',
      sandboxId,
      timestamp: Date.now(),
      details: { domainName, baseImage: config.baseImage },
    });

    return sandbox;
  }

  /**
   * Check libvirt/KVM health
   */
  async healthCheck(): Promise<ProviderHealth> {
    const uri = this.config.libvirtUri ?? 'qemu:///system';

    try {
      const result = await virsh(uri, ['version']);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr);
      }

      const listResult = await virsh(uri, ['list', '--all']);
      const runningVms = listResult.stdout
        .split('\n')
        .filter((l) => l.includes('running')).length;

      return {
        healthy: true,
        message: 'KVM/libvirt available',
        resources: {
          runningContainers: runningVms,
        },
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'KVM not available',
        checkedAt: Date.now(),
      };
    }
  }
}
