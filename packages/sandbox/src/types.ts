/**
 * Sandbox Execution Layer Types
 *
 * Core types for the sandbox execution system that enables AI agents
 * to safely execute infrastructure/code changes in isolated environments.
 *
 * Inspired by fluid.sh's KVM sandbox approach with approval gates.
 */

import { z } from 'zod';

/**
 * Sandbox provider types
 */
export type SandboxType = 'docker' | 'kvm' | 'deno-isolate';

/**
 * Sandbox status
 */
export type SandboxStatus = 'creating' | 'running' | 'paused' | 'stopped' | 'error' | 'destroyed';

/**
 * File diff representing a change in the sandbox
 */
export interface FileDiff {
  /** File path relative to sandbox root */
  path: string;
  /** Type of change */
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Original path (for renames) */
  oldPath?: string;
  /** Original content (null for new files) */
  oldContent?: string | null;
  /** New content (null for deleted files) */
  newContent?: string | null;
  /** Binary file indicator */
  isBinary?: boolean;
  /** File mode (permissions) */
  mode?: string;
  /** File size in bytes */
  size?: number;
}

/**
 * Snapshot identifier
 */
export type SnapshotId = string & { readonly __brand: 'SnapshotId' };

/**
 * Create a snapshot ID
 */
export function createSnapshotId(id: string): SnapshotId {
  return id as SnapshotId;
}

/**
 * Snapshot metadata
 */
export interface Snapshot {
  /** Unique snapshot ID */
  id: SnapshotId;
  /** Sandbox ID this snapshot belongs to */
  sandboxId: string;
  /** Human-readable name */
  name?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Snapshot size in bytes */
  sizeBytes?: number;
  /** Parent snapshot (for incremental) */
  parentId?: SnapshotId;
  /** Metadata tags */
  tags?: Record<string, string>;
}

/**
 * Command execution result
 */
export interface ExecResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Whether the command timed out */
  timedOut?: boolean;
  /** Signal that terminated the process (if any) */
  signal?: string;
}

/**
 * Artifact produced by sandbox execution
 */
export interface Artifact {
  /** Artifact name/path */
  name: string;
  /** Artifact type */
  type: 'file' | 'directory' | 'archive' | 'log';
  /** Content or path to content */
  content: string | Buffer;
  /** MIME type */
  mimeType?: string;
  /** Size in bytes */
  sizeBytes?: number;
  /** Checksum (SHA256) */
  checksum?: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Resource limits for sandbox
 */
export interface ResourceLimits {
  /** CPU cores (fractional allowed) */
  cpuCores?: number;
  /** Memory limit in MB */
  memoryMb?: number;
  /** Disk space limit in MB */
  diskMb?: number;
  /** Network bandwidth limit in Mbps */
  networkMbps?: number;
  /** Process limit */
  maxProcesses?: number;
  /** Open file descriptor limit */
  maxOpenFiles?: number;
}

/**
 * Network configuration for sandbox
 */
export interface NetworkConfig {
  /** Enable networking */
  enabled: boolean;
  /** Network mode */
  mode?: 'bridge' | 'host' | 'none' | 'custom';
  /** Allowed outbound hosts/IPs */
  allowedHosts?: string[];
  /** Blocked hosts/IPs */
  blockedHosts?: string[];
  /** Port mappings (host:container) */
  portMappings?: Record<number, number>;
  /** DNS servers */
  dnsServers?: string[];
}

/**
 * Mount configuration
 */
export interface MountConfig {
  /** Host path */
  hostPath: string;
  /** Container path */
  containerPath: string;
  /** Read-only mount */
  readonly?: boolean;
}

/**
 * Environment variable configuration
 */
export interface EnvConfig {
  [key: string]: string;
}

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Sandbox type */
  type: SandboxType;
  /** Base image (Docker image name or KVM template) */
  baseImage: string;
  /** Working directory inside sandbox */
  workDir?: string;
  /** Resource limits */
  resources?: ResourceLimits;
  /** Network configuration */
  network?: NetworkConfig;
  /** Volume/directory mounts */
  mounts?: MountConfig[];
  /** Environment variables */
  env?: EnvConfig;
  /** Timeout for operations (ms) */
  timeoutMs?: number;
  /** Enable root access (KVM only) */
  enableRoot?: boolean;
  /** Labels/tags for identification */
  labels?: Record<string, string>;
  /** Auto-destroy after timeout (ms) */
  autoDestroyAfterMs?: number;
}

/**
 * Sandbox instance interface
 */
export interface Sandbox {
  /** Unique sandbox ID */
  readonly id: string;
  /** Sandbox type */
  readonly type: SandboxType;
  /** Current status */
  readonly status: SandboxStatus;
  /** Creation timestamp */
  readonly createdAt: number;
  /** Configuration used to create this sandbox */
  readonly config: SandboxConfig;

  /**
   * Execute a command in the sandbox
   */
  execute(command: string, options?: ExecuteOptions): Promise<ExecResult>;

  /**
   * Execute multiple commands sequentially
   */
  executeMany(commands: string[], options?: ExecuteOptions): Promise<ExecResult[]>;

  /**
   * Write a file to the sandbox
   */
  writeFile(path: string, content: string | Buffer): Promise<void>;

  /**
   * Read a file from the sandbox
   */
  readFile(path: string): Promise<string>;

  /**
   * Read a binary file from the sandbox
   */
  readFileBuffer(path: string): Promise<Buffer>;

  /**
   * Check if a file exists
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * List files in a directory
   */
  listFiles(path: string, recursive?: boolean): Promise<string[]>;

  /**
   * Delete a file or directory
   */
  deleteFile(path: string, recursive?: boolean): Promise<void>;

  /**
   * Copy files into the sandbox
   */
  copyIn(localPath: string, sandboxPath: string): Promise<void>;

  /**
   * Copy files out of the sandbox
   */
  copyOut(sandboxPath: string, localPath: string): Promise<void>;

  /**
   * Create a snapshot of current state
   */
  snapshot(name?: string): Promise<SnapshotId>;

  /**
   * Restore to a previous snapshot
   */
  restore(snapshotId: SnapshotId): Promise<void>;

  /**
   * Get diff since a snapshot (or since creation)
   */
  diff(since?: SnapshotId): Promise<FileDiff[]>;

  /**
   * List all snapshots
   */
  listSnapshots(): Promise<Snapshot[]>;

  /**
   * Delete a snapshot
   */
  deleteSnapshot(snapshotId: SnapshotId): Promise<void>;

  /**
   * Export artifacts from sandbox
   */
  exportArtifacts(paths?: string[]): Promise<Artifact[]>;

  /**
   * Pause the sandbox
   */
  pause(): Promise<void>;

  /**
   * Resume a paused sandbox
   */
  resume(): Promise<void>;

  /**
   * Destroy the sandbox and cleanup resources
   */
  destroy(): Promise<void>;

  /**
   * Get sandbox logs
   */
  getLogs(options?: LogOptions): Promise<string>;

  /**
   * Get resource usage statistics
   */
  getStats(): Promise<SandboxStats>;
}

/**
 * Execute options
 */
export interface ExecuteOptions {
  /** Working directory for command */
  cwd?: string;
  /** Environment variables */
  env?: EnvConfig;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Run as specific user */
  user?: string;
  /** Capture output in real-time */
  stream?: boolean;
  /** Stdin input */
  stdin?: string;
}

/**
 * Log options
 */
export interface LogOptions {
  /** Number of lines to retrieve */
  lines?: number;
  /** Follow logs (stream) */
  follow?: boolean;
  /** Include timestamps */
  timestamps?: boolean;
  /** Since timestamp */
  since?: number;
}

/**
 * Sandbox resource statistics
 */
export interface SandboxStats {
  /** CPU usage percentage */
  cpuPercent: number;
  /** Memory usage in MB */
  memoryMb: number;
  /** Memory limit in MB */
  memoryLimitMb: number;
  /** Disk usage in MB */
  diskMb: number;
  /** Network bytes received */
  networkRxBytes: number;
  /** Network bytes transmitted */
  networkTxBytes: number;
  /** Number of processes */
  processCount: number;
  /** Uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Sandbox provider interface
 */
export interface SandboxProvider {
  /** Provider name */
  readonly name: string;
  /** Provider type */
  readonly type: SandboxType;

  /**
   * Create a new sandbox
   */
  create(config: SandboxConfig): Promise<Sandbox>;

  /**
   * Get an existing sandbox by ID
   */
  get(id: string): Promise<Sandbox | null>;

  /**
   * List all sandboxes
   */
  list(filters?: SandboxFilters): Promise<SandboxInfo[]>;

  /**
   * Create a snapshot of a sandbox
   */
  snapshot(sandboxId: string, name?: string): Promise<SnapshotId>;

  /**
   * Restore a sandbox to a snapshot
   */
  restore(sandboxId: string, snapshotId: SnapshotId): Promise<void>;

  /**
   * Get diff since snapshot
   */
  diff(sandboxId: string, since?: SnapshotId): Promise<FileDiff[]>;

  /**
   * Destroy a sandbox
   */
  destroy(sandboxId: string): Promise<void>;

  /**
   * Cleanup stale/orphaned sandboxes
   */
  cleanup(olderThanMs?: number): Promise<number>;

  /**
   * Check provider health
   */
  healthCheck(): Promise<ProviderHealth>;
}

/**
 * Sandbox filters for listing
 */
export interface SandboxFilters {
  /** Filter by status */
  status?: SandboxStatus[];
  /** Filter by labels */
  labels?: Record<string, string>;
  /** Created after timestamp */
  createdAfter?: number;
  /** Created before timestamp */
  createdBefore?: number;
  /** Limit results */
  limit?: number;
}

/**
 * Sandbox info (lightweight)
 */
export interface SandboxInfo {
  id: string;
  type: SandboxType;
  status: SandboxStatus;
  createdAt: number;
  labels?: Record<string, string>;
  baseImage: string;
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  /** Provider is healthy */
  healthy: boolean;
  /** Status message */
  message: string;
  /** Available resources */
  resources?: {
    availableCpuCores?: number;
    availableMemoryMb?: number;
    availableDiskMb?: number;
    runningContainers?: number;
    maxContainers?: number;
  };
  /** Last check timestamp */
  checkedAt: number;
}

/**
 * Sandbox execution event for audit trail
 */
export interface SandboxEvent {
  /** Event type */
  type: 'create' | 'execute' | 'snapshot' | 'restore' | 'destroy' | 'error';
  /** Sandbox ID */
  sandboxId: string;
  /** Timestamp */
  timestamp: number;
  /** Event details */
  details: Record<string, unknown>;
  /** Duration in ms (for operations) */
  durationMs?: number;
  /** Error message (if error) */
  error?: string;
}

// Zod schemas for validation

export const SandboxTypeSchema = z.enum(['docker', 'kvm', 'deno-isolate']);

export const SandboxStatusSchema = z.enum([
  'creating',
  'running',
  'paused',
  'stopped',
  'error',
  'destroyed',
]);

export const ResourceLimitsSchema = z.object({
  cpuCores: z.number().positive().optional(),
  memoryMb: z.number().positive().optional(),
  diskMb: z.number().positive().optional(),
  networkMbps: z.number().positive().optional(),
  maxProcesses: z.number().positive().optional(),
  maxOpenFiles: z.number().positive().optional(),
});

export const NetworkConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['bridge', 'host', 'none', 'custom']).optional(),
  allowedHosts: z.array(z.string()).optional(),
  blockedHosts: z.array(z.string()).optional(),
  // Port mappings: host port (string key) -> container port (number value)
  // Keys are strings because JavaScript object keys are always strings
  portMappings: z.record(z.string(), z.number()).optional(),
  dnsServers: z.array(z.string()).optional(),
});

export const MountConfigSchema = z.object({
  hostPath: z.string(),
  containerPath: z.string(),
  readonly: z.boolean().optional(),
});

export const SandboxConfigSchema = z.object({
  type: SandboxTypeSchema,
  baseImage: z.string().min(1),
  workDir: z.string().optional(),
  resources: ResourceLimitsSchema.optional(),
  network: NetworkConfigSchema.optional(),
  mounts: z.array(MountConfigSchema).optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().positive().optional(),
  enableRoot: z.boolean().optional(),
  labels: z.record(z.string()).optional(),
  autoDestroyAfterMs: z.number().positive().optional(),
});

export const FileDiffSchema = z.object({
  path: z.string(),
  type: z.enum(['added', 'modified', 'deleted', 'renamed']),
  oldPath: z.string().optional(),
  oldContent: z.string().nullable().optional(),
  newContent: z.string().nullable().optional(),
  isBinary: z.boolean().optional(),
  mode: z.string().optional(),
  size: z.number().optional(),
});

export const ExecResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
  timedOut: z.boolean().optional(),
  signal: z.string().optional(),
});
