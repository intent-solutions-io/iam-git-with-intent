/**
 * AgentFS Hook Implementation
 *
 * INTERNAL USE ONLY - This hook is for Intent Solutions' internal development.
 * External users of Git With Intent do not need this.
 *
 * This hook audits agent activity to AgentFS, recording:
 * - Tool calls (each agent step) via agent.tools.record()
 * - State changes (run status) via agent.kv.set()
 * - Metadata for replay/debugging
 *
 * AgentFS provides three core interfaces:
 * - Filesystem: POSIX-like file operations
 * - Key-Value: State and context storage
 * - Tool Calls: Auditing tool invocations
 *
 * Reference: https://github.com/tursodatabase/agentfs
 *
 * @internal
 */

import type { AgentHook, AgentRunContext, AgentFSConfig } from '../../packages/engine/src/hooks/index.js';
import { execSync } from 'child_process';

/**
 * AgentFS SDK interface (when available)
 * Based on: https://github.com/tursodatabase/agentfs
 */
interface AgentFSInstance {
  kv: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
  };
  tools: {
    record(
      name: string,
      startedAt: number,  // Unix timestamp in seconds
      endedAt: number,    // Unix timestamp in seconds
      input: unknown,
      output: unknown
    ): Promise<void>;
  };
  fs?: {
    writeFile(path: string, data: Buffer | string): Promise<void>;
    readdir(path: string): Promise<string[]>;
  };
}

/**
 * AgentFS tool call record
 */
interface ToolCallRecord {
  name: string;
  startedAt: number;  // Unix timestamp in seconds
  endedAt: number;    // Unix timestamp in seconds
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

/**
 * AgentFS Hook - Records agent activity to AgentFS for auditing
 *
 * Uses the AgentFS SDK when available, falls back to CLI.
 *
 * @internal - For Intent Solutions internal use only
 */
export class AgentFSHook implements AgentHook {
  readonly name = 'agentfs-audit';

  private config: AgentFSConfig;
  private agentfs: AgentFSInstance | null = null;
  private initialized = false;
  private useSdk = false;

  constructor(config: AgentFSConfig) {
    this.config = config;
  }

  /**
   * Try to initialize the AgentFS SDK
   */
  private async initSdk(): Promise<boolean> {
    if (this.initialized) {
      return this.useSdk;
    }

    try {
      // Try to import the SDK dynamically
      const { AgentFS } = await import('agentfs-sdk');
      this.agentfs = await AgentFS.open({ id: this.config.agentId });
      this.useSdk = true;
      this.initialized = true;
      return true;
    } catch {
      // SDK not available, will use CLI fallback
      this.initialized = true;
      return false;
    }
  }

  /**
   * Check if AgentFS is available and configured
   */
  async isEnabled(): Promise<boolean> {
    if (!this.config.agentId) {
      return false;
    }

    // Try SDK first
    if (await this.initSdk()) {
      return true;
    }

    // Check if agentfs CLI is available
    try {
      execSync('which agentfs', { stdio: 'pipe' });
      return true;
    } catch {
      // CLI not found, check for db file
      const dbPath = this.getDbPath();
      if (dbPath) {
        try {
          const fs = await import('fs');
          return fs.existsSync(dbPath);
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Called after each agent step completes
   *
   * Records tool call using AgentFS tools.record() API:
   * - name: tool identifier
   * - startedAt/endedAt: Unix timestamps in seconds
   * - input/output: JSON-serializable objects
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    if (!await this.isEnabled()) {
      return;
    }

    // Convert to Unix timestamps in seconds (AgentFS requirement)
    const endedAt = Date.now() / 1000;
    const startedAt = endedAt - ((ctx.durationMs || 0) / 1000);

    const record: ToolCallRecord = {
      name: `gwi:${ctx.agentRole.toLowerCase()}:step`,
      startedAt,
      endedAt,
      input: {
        runId: ctx.runId,
        stepId: ctx.stepId,
        runType: ctx.runType,
        agentRole: ctx.agentRole,
        ...(ctx.inputSummary && { inputSummary: ctx.inputSummary }),
        ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      },
      output: {
        status: ctx.stepStatus,
        ...(ctx.outputSummary && { outputSummary: ctx.outputSummary }),
        ...(ctx.durationMs && { durationMs: ctx.durationMs }),
        ...(ctx.tokensUsed && { tokensUsed: ctx.tokensUsed }),
      },
    };

    await this.recordToolCall(record);

    // Store step metadata in KV for later querying
    await this.setKV(`steps:${ctx.runId}:${ctx.stepId}`, {
      ...ctx,
      recordedAt: new Date().toISOString(),
    });
  }

  /**
   * Called when a run starts
   */
  async onRunStart(ctx: AgentRunContext): Promise<void> {
    if (!await this.isEnabled()) {
      return;
    }

    const now = Date.now() / 1000;

    await this.recordToolCall({
      name: `gwi:run:start`,
      startedAt: now,
      endedAt: now,
      input: {
        runId: ctx.runId,
        runType: ctx.runType,
        ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      },
      output: {
        started: true,
      },
    });

    await this.setKV(`runs:${ctx.runId}:meta`, {
      runId: ctx.runId,
      runType: ctx.runType,
      tenantId: ctx.tenantId,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Called when a run completes
   */
  async onRunEnd(ctx: AgentRunContext, success: boolean): Promise<void> {
    if (!await this.isEnabled()) {
      return;
    }

    const now = Date.now() / 1000;

    await this.recordToolCall({
      name: `gwi:run:${success ? 'complete' : 'fail'}`,
      startedAt: now,
      endedAt: now,
      input: {
        runId: ctx.runId,
        runType: ctx.runType,
      },
      output: {
        success,
        ...(ctx.outputSummary && { summary: ctx.outputSummary }),
        ...(ctx.durationMs && { totalDurationMs: ctx.durationMs }),
      },
    });

    // Update run metadata
    const existing = await this.getKV(`runs:${ctx.runId}:meta`);
    await this.setKV(`runs:${ctx.runId}:meta`, {
      ...(existing || {}),
      completedAt: new Date().toISOString(),
      success,
      totalDurationMs: ctx.durationMs,
    });
  }

  /**
   * Get the AgentFS database path
   */
  private getDbPath(): string | null {
    if (this.dbPath) {
      return this.dbPath;
    }

    // Check config
    if (this.config.dbPath) {
      this.dbPath = this.config.dbPath;
      return this.dbPath;
    }

    // Check environment
    const envPath = process.env.AGENTFS_DB_PATH;
    if (envPath) {
      this.dbPath = envPath;
      return this.dbPath;
    }

    // Default location
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      this.dbPath = `${homeDir}/.agentfs/${this.config.agentId}.db`;
      return this.dbPath;
    }

    return null;
  }

  /**
   * Record a tool call using AgentFS SDK or CLI
   *
   * Uses SDK when available:
   *   agent.tools.record(name, startedAt, endedAt, input, output)
   *
   * Falls back to CLI:
   *   agentfs toolcall <name> <started_at> <ended_at> <input> <output>
   */
  private async recordToolCall(record: ToolCallRecord): Promise<void> {
    try {
      // Try SDK first
      if (this.useSdk && this.agentfs) {
        await this.agentfs.tools.record(
          record.name,
          record.startedAt,
          record.endedAt,
          record.input,
          record.output
        );
        return;
      }

      // Fall back to CLI
      const inputJson = JSON.stringify(record.input);
      const outputJson = JSON.stringify(record.output);

      // agentfs toolcall <name> <started_at> <ended_at> <input> <output>
      const cmd = `agentfs toolcall "${record.name}" ${record.startedAt} ${record.endedAt} '${inputJson}' '${outputJson}'`;

      await this.runAgentFSCommand(cmd);
    } catch (error) {
      // Log but don't throw - hooks should never crash the main pipeline
      console.warn(`[AgentFSHook] Failed to record tool call: ${error}`);
    }
  }

  /**
   * Set a KV value using AgentFS
   *
   * Uses SDK: agent.kv.set(key, value)
   * Falls back to CLI: agentfs kv set <key> <value>
   */
  private async setKV(key: string, value: unknown): Promise<void> {
    try {
      // Try SDK first
      if (this.useSdk && this.agentfs) {
        await this.agentfs.kv.set(key, value);
        return;
      }

      // Fall back to CLI
      const valueJson = JSON.stringify(value);
      const cmd = `agentfs kv set "${key}" '${valueJson}'`;
      await this.runAgentFSCommand(cmd);
    } catch (error) {
      console.warn(`[AgentFSHook] Failed to set KV ${key}: ${error}`);
    }
  }

  /**
   * Get a KV value from AgentFS
   *
   * Uses SDK: agent.kv.get(key)
   * Falls back to CLI: agentfs kv get <key>
   */
  private async getKV(key: string): Promise<unknown | null> {
    try {
      // Try SDK first
      if (this.useSdk && this.agentfs) {
        return await this.agentfs.kv.get(key);
      }

      // Fall back to CLI
      const cmd = `agentfs kv get "${key}"`;
      const result = await this.runAgentFSCommand(cmd);
      return result ? JSON.parse(result) : null;
    } catch {
      return null;
    }
  }

  /**
   * Run an AgentFS CLI command
   */
  private runAgentFSCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        AGENTFS_AGENT_ID: this.config.agentId,
      };

      if (this.config.tursoUrl) {
        env.TURSO_URL = this.config.tursoUrl;
      }
      if (this.config.tursoAuthToken) {
        env.TURSO_AUTH_TOKEN = this.config.tursoAuthToken;
      }

      try {
        const output = execSync(cmd, {
          env,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });
        resolve(output.trim());
      } catch (error) {
        reject(error);
      }
    });
  }
}

/**
 * Create an AgentFS hook from environment configuration
 *
 * @internal
 */
export function createAgentFSHook(config?: Partial<AgentFSConfig>): AgentFSHook | null {
  const agentId = config?.agentId || process.env.GWI_AGENTFS_ID || process.env.AGENTFS_AGENT_ID;

  if (!agentId) {
    return null;
  }

  return new AgentFSHook({
    agentId,
    tursoUrl: config?.tursoUrl || process.env.TURSO_URL,
    tursoAuthToken: config?.tursoAuthToken || process.env.TURSO_AUTH_TOKEN,
    dbPath: config?.dbPath || process.env.AGENTFS_DB_PATH,
  });
}
