/**
 * @gwi/sandbox - Sandbox Execution Layer for Git With Intent
 *
 * Provides isolated execution environments for AI agents to safely
 * execute infrastructure and code changes before production deployment.
 *
 * Inspired by fluid.sh's approach to safe production access.
 *
 * Features:
 * - Docker containers for code execution and testing
 * - KVM VMs for full infrastructure changes with root access
 * - Deno isolates for lightweight TypeScript execution
 * - Snapshot/restore for rollback capability
 * - Diff generation for change tracking
 * - IaC export (Terraform/OpenTofu) for production deployment
 * - Full audit trail of all operations
 *
 * @example
 * ```typescript
 * import { createSandbox, TerraformExporter } from '@gwi/sandbox';
 *
 * // Create a Docker sandbox
 * const sandbox = await createSandbox({
 *   type: 'docker',
 *   baseImage: 'node:20-alpine',
 * });
 *
 * // Execute commands
 * await sandbox.execute('npm install');
 * await sandbox.execute('npm test');
 *
 * // Get changes
 * const diffs = await sandbox.diff();
 *
 * // Export to Terraform
 * const exporter = new TerraformExporter();
 * const result = await exporter.export(diffs, { provider: 'gcp' });
 *
 * // Cleanup
 * await sandbox.destroy();
 * ```
 */

// Types
export * from './types.js';

// Providers
export {
  BaseSandboxProvider,
  hashContent,
  computeFileDiff,
  DockerSandboxProvider,
  DockerSandbox,
  KVMSandboxProvider,
  KVMSandbox,
  DenoSandboxProvider,
  DenoSandbox,
} from './providers/index.js';

// Export layer
export {
  IaCExporter,
  TerraformExporter,
  type ExportOptions,
  type ExportResult,
} from './export/index.js';

// Re-export provider types
export type {
  Sandbox,
  SandboxProvider,
  SandboxConfig,
  SandboxType,
  SandboxStatus,
  SandboxInfo,
  SandboxFilters,
  ProviderHealth,
} from './providers/index.js';

// Factory functions
import type { SandboxConfig, Sandbox, SandboxProvider } from './types.js';
import { DockerSandboxProvider } from './providers/docker.js';
import { KVMSandboxProvider, type KVMProviderConfig } from './providers/kvm.js';
import { DenoSandboxProvider } from './providers/deno.js';

/**
 * Provider registry
 */
const providers: Map<string, SandboxProvider> = new Map();

/**
 * Get or create a provider instance
 */
export function getProvider(
  type: 'docker' | 'kvm' | 'deno-isolate',
  config?: KVMProviderConfig
): SandboxProvider {
  const key = type;
  let provider = providers.get(key);

  if (!provider) {
    switch (type) {
      case 'docker':
        provider = new DockerSandboxProvider();
        break;
      case 'kvm':
        provider = new KVMSandboxProvider(config);
        break;
      case 'deno-isolate':
        provider = new DenoSandboxProvider();
        break;
      default:
        throw new Error(`Unknown sandbox type: ${type}`);
    }
    providers.set(key, provider);
  }

  return provider;
}

/**
 * Create a sandbox with the appropriate provider
 */
export async function createSandbox(config: SandboxConfig): Promise<Sandbox> {
  const provider = getProvider(config.type);
  return provider.create(config);
}

/**
 * Get an existing sandbox by ID
 */
export async function getSandbox(
  sandboxId: string,
  type: 'docker' | 'kvm' | 'deno-isolate'
): Promise<Sandbox | null> {
  const provider = getProvider(type);
  return provider.get(sandboxId);
}

/**
 * Check health of all providers
 */
export async function checkAllProviders(): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  const types: ('docker' | 'kvm' | 'deno-isolate')[] = ['docker', 'kvm', 'deno-isolate'];

  for (const type of types) {
    try {
      const provider = getProvider(type);
      const health = await provider.healthCheck();
      results.set(type, health.healthy);
    } catch {
      results.set(type, false);
    }
  }

  return results;
}

/**
 * Cleanup all stale sandboxes
 */
export async function cleanupAllProviders(olderThanMs?: number): Promise<number> {
  let total = 0;

  for (const provider of providers.values()) {
    total += await provider.cleanup(olderThanMs);
  }

  return total;
}

/**
 * Sandbox execution context for agents
 */
export interface SandboxExecutionContext {
  /** Sandbox instance */
  sandbox: Sandbox;
  /** Initial snapshot ID */
  initialSnapshot: string;
  /** Changes since start */
  changes: import('./types.js').FileDiff[];
  /** Execution log */
  executionLog: string[];
  /** Start time */
  startedAt: number;
}

/**
 * Create execution context for an agent
 */
export async function createExecutionContext(
  config: SandboxConfig
): Promise<SandboxExecutionContext> {
  const sandbox = await createSandbox(config);
  const initialSnapshot = await sandbox.snapshot('initial');

  return {
    sandbox,
    initialSnapshot,
    changes: [],
    executionLog: [],
    startedAt: Date.now(),
  };
}

/**
 * Finalize execution context and get results
 */
export async function finalizeExecutionContext(
  context: SandboxExecutionContext,
  options?: { keepSandbox?: boolean }
): Promise<{
  changes: import('./types.js').FileDiff[];
  artifacts: import('./types.js').Artifact[];
  durationMs: number;
}> {
  const changes = await context.sandbox.diff(context.initialSnapshot as import('./types.js').SnapshotId);
  const artifacts = await context.sandbox.exportArtifacts();
  const durationMs = Date.now() - context.startedAt;

  if (!options?.keepSandbox) {
    await context.sandbox.destroy();
  }

  return { changes, artifacts, durationMs };
}
