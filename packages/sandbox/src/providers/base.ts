/**
 * Base Sandbox Provider
 *
 * Abstract base class for sandbox providers with common functionality.
 */

import type {
  Sandbox,
  SandboxConfig,
  SandboxProvider,
  SandboxType,
  SandboxFilters,
  SandboxInfo,
  SandboxEvent,
  SnapshotId,
  FileDiff,
  ProviderHealth,
} from '../types.js';

/**
 * Abstract base class for sandbox providers
 */
export abstract class BaseSandboxProvider implements SandboxProvider {
  /** Provider name */
  abstract readonly name: string;

  /** Provider type */
  abstract readonly type: SandboxType;

  /** Event listeners */
  protected eventListeners: Map<string, ((event: SandboxEvent) => void)[]> = new Map();

  /** Active sandboxes cache */
  protected sandboxes: Map<string, Sandbox> = new Map();

  /**
   * Create a new sandbox
   */
  abstract create(config: SandboxConfig): Promise<Sandbox>;

  /**
   * Get an existing sandbox by ID
   */
  async get(id: string): Promise<Sandbox | null> {
    return this.sandboxes.get(id) ?? null;
  }

  /**
   * List all sandboxes
   */
  async list(filters?: SandboxFilters): Promise<SandboxInfo[]> {
    let sandboxes = Array.from(this.sandboxes.values());

    if (filters?.status) {
      sandboxes = sandboxes.filter((s) => filters.status!.includes(s.status));
    }

    if (filters?.labels) {
      sandboxes = sandboxes.filter((s) => {
        const sandboxLabels = s.config.labels ?? {};
        return Object.entries(filters.labels!).every(
          ([key, value]) => sandboxLabels[key] === value
        );
      });
    }

    if (filters?.createdAfter) {
      sandboxes = sandboxes.filter((s) => s.createdAt > filters.createdAfter!);
    }

    if (filters?.createdBefore) {
      sandboxes = sandboxes.filter((s) => s.createdAt < filters.createdBefore!);
    }

    if (filters?.limit) {
      sandboxes = sandboxes.slice(0, filters.limit);
    }

    return sandboxes.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      createdAt: s.createdAt,
      labels: s.config.labels,
      baseImage: s.config.baseImage,
    }));
  }

  /**
   * Create a snapshot of a sandbox
   */
  async snapshot(sandboxId: string, name?: string): Promise<SnapshotId> {
    const sandbox = await this.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return sandbox.snapshot(name);
  }

  /**
   * Restore a sandbox to a snapshot
   */
  async restore(sandboxId: string, snapshotId: SnapshotId): Promise<void> {
    const sandbox = await this.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return sandbox.restore(snapshotId);
  }

  /**
   * Get diff since snapshot
   */
  async diff(sandboxId: string, since?: SnapshotId): Promise<FileDiff[]> {
    const sandbox = await this.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return sandbox.diff(since);
  }

  /**
   * Destroy a sandbox
   */
  async destroy(sandboxId: string): Promise<void> {
    const sandbox = await this.get(sandboxId);
    if (!sandbox) {
      return; // Already destroyed
    }
    await sandbox.destroy();
    this.sandboxes.delete(sandboxId);
    this.emitEvent({
      type: 'destroy',
      sandboxId,
      timestamp: Date.now(),
      details: {},
    });
  }

  /**
   * Cleanup stale/orphaned sandboxes
   */
  async cleanup(olderThanMs: number = 3600000): Promise<number> {
    const now = Date.now();
    const threshold = now - olderThanMs;
    let cleaned = 0;

    for (const [id, sandbox] of this.sandboxes) {
      if (sandbox.createdAt < threshold && sandbox.status !== 'running') {
        await this.destroy(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Check provider health
   */
  abstract healthCheck(): Promise<ProviderHealth>;

  /**
   * Generate a unique sandbox ID
   */
  protected generateSandboxId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `sbx-${this.type}-${timestamp}-${random}`;
  }

  /**
   * Register a sandbox in the cache
   */
  protected registerSandbox(sandbox: Sandbox): void {
    this.sandboxes.set(sandbox.id, sandbox);
  }

  /**
   * Emit a sandbox event
   */
  protected emitEvent(event: SandboxEvent): void {
    const listeners = this.eventListeners.get(event.type) ?? [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }

    // Also emit to 'all' listeners
    const allListeners = this.eventListeners.get('all') ?? [];
    for (const listener of allListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Add event listener
   */
  on(eventType: SandboxEvent['type'] | 'all', listener: (event: SandboxEvent) => void): void {
    const listeners = this.eventListeners.get(eventType) ?? [];
    listeners.push(listener);
    this.eventListeners.set(eventType, listeners);
  }

  /**
   * Remove event listener
   */
  off(eventType: SandboxEvent['type'] | 'all', listener: (event: SandboxEvent) => void): void {
    const listeners = this.eventListeners.get(eventType) ?? [];
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(eventType, listeners);
    }
  }
}

/**
 * Utility function to create a hash of content for checksums
 */
export function hashContent(content: string | Buffer): string {
  const crypto = globalThis.crypto;
  if (crypto && 'subtle' in crypto) {
    // Use async version, but return sync placeholder
    return `sha256-pending`;
  }
  // Fallback: simple checksum (not secure, just for identification)
  const data = typeof content === 'string' ? content : content.toString('utf8');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const chr = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `simple-${hash.toString(16)}`;
}

/**
 * Utility to compute file diff between two content strings
 */
export function computeFileDiff(
  oldContent: string | null,
  newContent: string | null,
  path: string,
  oldPath?: string
): FileDiff {
  if (oldContent === null && newContent !== null) {
    return {
      path,
      type: 'added',
      newContent,
      size: newContent.length,
    };
  }

  if (oldContent !== null && newContent === null) {
    return {
      path,
      type: 'deleted',
      oldContent,
    };
  }

  if (oldPath && oldPath !== path) {
    return {
      path,
      type: 'renamed',
      oldPath,
      oldContent,
      newContent,
      size: newContent?.length,
    };
  }

  return {
    path,
    type: 'modified',
    oldContent,
    newContent,
    size: newContent?.length,
  };
}
