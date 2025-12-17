/**
 * Run Index
 *
 * Abstraction for indexing and retrieving run metadata.
 * Provides pluggable backends for local filesystem and AgentFS.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { RUN_BUNDLES_BASE, listRuns as listRunBundles } from './artifact-writer.js';
import { loadRunContext } from './run-context.js';
import type { RunContext, RunState } from './types.js';

// =============================================================================
// Run Index Entry Schema
// =============================================================================

/**
 * Minimal run metadata for indexing
 */
export const RunIndexEntry = z.object({
  runId: z.string().uuid(),
  repo: z.object({
    owner: z.string(),
    name: z.string(),
    fullName: z.string(),
  }),
  state: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  initiator: z.string(),
  prUrl: z.string().url().optional(),
  issueUrl: z.string().url().optional(),
});

export type RunIndexEntry = z.infer<typeof RunIndexEntry>;

// =============================================================================
// Run Index Interface
// =============================================================================

/**
 * Filter options for listing runs
 */
export interface RunIndexFilter {
  repo?: string;      // Filter by fullName (owner/name)
  state?: RunState;   // Filter by state
  initiator?: string; // Filter by initiator
  limit?: number;     // Max results
  offset?: number;    // Pagination offset
}

/**
 * Run index store interface
 */
export interface RunIndexStore {
  /**
   * Add or update a run in the index
   */
  putRun(runId: string, metadata: RunIndexEntry): Promise<void>;

  /**
   * Get a run from the index
   */
  getRun(runId: string): Promise<RunIndexEntry | null>;

  /**
   * List runs with optional filtering
   */
  listRuns(filter?: RunIndexFilter): Promise<RunIndexEntry[]>;

  /**
   * Remove a run from the index
   */
  deleteRun(runId: string): Promise<void>;

  /**
   * Sync index from run bundles (rebuild index from .gwi/runs/)
   */
  syncFromBundles(basePath?: string): Promise<number>;
}

// =============================================================================
// Local Filesystem Run Index
// =============================================================================

const INDEX_FILE = '.gwi/runs/index.json';

/**
 * Local filesystem-based run index
 *
 * Stores index in .gwi/runs/index.json
 */
export class LocalFsRunIndexStore implements RunIndexStore {
  private basePath: string;
  private index: Map<string, RunIndexEntry>;
  private loaded: boolean = false;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
    this.index = new Map();
  }

  private getIndexPath(): string {
    return join(this.basePath, INDEX_FILE);
  }

  private async loadIndex(): Promise<void> {
    if (this.loaded) return;

    try {
      const content = await fs.readFile(this.getIndexPath(), 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        for (const entry of data) {
          try {
            const validated = RunIndexEntry.parse(entry);
            this.index.set(validated.runId, validated);
          } catch {
            // Skip invalid entries
          }
        }
      }
    } catch {
      // Index doesn't exist yet
    }

    this.loaded = true;
  }

  private async saveIndex(): Promise<void> {
    const entries = Array.from(this.index.values());
    const indexPath = this.getIndexPath();
    await fs.mkdir(join(this.basePath, RUN_BUNDLES_BASE), { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  async putRun(runId: string, metadata: RunIndexEntry): Promise<void> {
    await this.loadIndex();
    const validated = RunIndexEntry.parse(metadata);
    this.index.set(runId, validated);
    await this.saveIndex();
  }

  async getRun(runId: string): Promise<RunIndexEntry | null> {
    await this.loadIndex();
    return this.index.get(runId) ?? null;
  }

  async listRuns(filter?: RunIndexFilter): Promise<RunIndexEntry[]> {
    await this.loadIndex();

    let entries = Array.from(this.index.values());

    // Apply filters
    if (filter?.repo) {
      entries = entries.filter(e => e.repo.fullName === filter.repo);
    }
    if (filter?.state) {
      entries = entries.filter(e => e.state === filter.state);
    }
    if (filter?.initiator) {
      entries = entries.filter(e => e.initiator === filter.initiator);
    }

    // Sort by updatedAt descending
    entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // Apply pagination
    if (filter?.offset) {
      entries = entries.slice(filter.offset);
    }
    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  async deleteRun(runId: string): Promise<void> {
    await this.loadIndex();
    this.index.delete(runId);
    await this.saveIndex();
  }

  async syncFromBundles(basePath?: string): Promise<number> {
    const bp = basePath ?? this.basePath;
    const runIds = await listRunBundles(bp);

    let synced = 0;
    for (const runId of runIds) {
      const context = await loadRunContext(runId, bp);
      if (context) {
        const entry: RunIndexEntry = {
          runId: context.runId,
          repo: context.repo,
          state: context.state,
          createdAt: context.createdAt,
          updatedAt: context.updatedAt,
          initiator: context.initiator,
          prUrl: context.prUrl,
          issueUrl: context.issueUrl,
        };
        this.index.set(runId, entry);
        synced++;
      }
    }

    if (synced > 0) {
      await this.saveIndex();
    }

    return synced;
  }
}

// =============================================================================
// AgentFS Run Index (Minimal Integration)
// =============================================================================

/**
 * AgentFS-backed run index
 *
 * Uses AgentFS CLI for metadata storage.
 * Falls back to LocalFsRunIndexStore if AgentFS is not available.
 */
export class AgentFsRunIndexStore implements RunIndexStore {
  private _agentId: string;
  private fallback: LocalFsRunIndexStore;
  private agentFsAvailable: boolean | null = null;

  constructor(agentId: string = 'gwi', basePath: string = process.cwd()) {
    this._agentId = agentId;
    this.fallback = new LocalFsRunIndexStore(basePath);
  }

  get agentId(): string {
    return this._agentId;
  }

  private async checkAgentFs(): Promise<boolean> {
    if (this.agentFsAvailable !== null) {
      return this.agentFsAvailable;
    }

    try {
      // Check if agentfs CLI is available
      const { execSync } = await import('child_process');
      execSync('agentfs --help', { stdio: 'ignore' });
      this.agentFsAvailable = true;
    } catch {
      this.agentFsAvailable = false;
    }

    return this.agentFsAvailable;
  }

  async putRun(runId: string, metadata: RunIndexEntry): Promise<void> {
    const available = await this.checkAgentFs();
    if (!available) {
      return this.fallback.putRun(runId, metadata);
    }

    // For now, use fallback with AgentFS indexing as future enhancement
    // AgentFS stores the run bundle itself; the index can be local
    return this.fallback.putRun(runId, metadata);
  }

  async getRun(runId: string): Promise<RunIndexEntry | null> {
    return this.fallback.getRun(runId);
  }

  async listRuns(filter?: RunIndexFilter): Promise<RunIndexEntry[]> {
    return this.fallback.listRuns(filter);
  }

  async deleteRun(runId: string): Promise<void> {
    return this.fallback.deleteRun(runId);
  }

  async syncFromBundles(basePath?: string): Promise<number> {
    return this.fallback.syncFromBundles(basePath);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let defaultStore: RunIndexStore | null = null;

/**
 * Get the configured run index store
 *
 * Uses environment variables:
 * - GWI_RUN_INDEX=local|agentfs (default: local)
 * - GWI_AGENTFS_ID=gwi (for agentfs backend)
 */
export function getRunIndexStore(basePath?: string): RunIndexStore {
  if (defaultStore && !basePath) {
    return defaultStore;
  }

  const indexType = process.env.GWI_RUN_INDEX ?? 'local';
  const agentId = process.env.GWI_AGENTFS_ID ?? 'gwi';
  const bp = basePath ?? process.cwd();

  let store: RunIndexStore;
  switch (indexType) {
    case 'agentfs':
      store = new AgentFsRunIndexStore(agentId, bp);
      break;
    case 'local':
    default:
      store = new LocalFsRunIndexStore(bp);
  }

  if (!basePath) {
    defaultStore = store;
  }

  return store;
}

/**
 * Create index entry from RunContext
 */
export function contextToIndexEntry(context: RunContext): RunIndexEntry {
  return {
    runId: context.runId,
    repo: context.repo,
    state: context.state,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
    initiator: context.initiator,
    prUrl: context.prUrl,
    issueUrl: context.issueUrl,
  };
}
