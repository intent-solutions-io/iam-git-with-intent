/**
 * AgentFS Integration for Git With Intent
 *
 * Wraps the agentfs-sdk to provide typed, consistent state management
 * for all agents. Every agent MUST use this for state - no in-memory storage.
 *
 * @see https://github.com/tursodatabase/agentfs
 */

import type { AgentId } from '../types.js';

/**
 * AgentFS interface - matches agentfs-sdk API
 * We define this interface to allow mocking and to work when SDK isn't installed
 */
export interface AgentFSInstance {
  kv: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
  };
  fs: {
    writeFile(path: string, content: string | Buffer): Promise<void>;
    readFile(path: string): Promise<Buffer>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;
    unlink(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
  };
  tools: {
    record(
      toolName: string,
      startedAt: number,
      endedAt: number,
      input: unknown,
      output: unknown
    ): Promise<void>;
    list(limit?: number): Promise<ToolCall[]>;
  };
}

/**
 * Tool call audit record
 */
export interface ToolCall {
  id: number;
  toolName: string;
  startedAt: number;
  endedAt: number;
  input: unknown;
  output: unknown;
  durationMs: number;
}

/**
 * Options for opening an AgentFS instance
 */
export interface AgentFSOptions {
  id: string;
  directory?: string; // Defaults to .agentfs/
}

/**
 * State wrapper that provides typed access to AgentFS KV store
 */
export class AgentState<T extends Record<string, unknown>> {
  constructor(
    private readonly agentfs: AgentFSInstance,
    private readonly namespace: string
  ) {}

  /**
   * Get a value from the state store
   */
  async get<K extends keyof T>(key: K): Promise<T[K] | null> {
    const fullKey = `${this.namespace}:${String(key)}`;
    const value = await this.agentfs.kv.get<T[K]>(fullKey);
    return value;
  }

  /**
   * Set a value in the state store
   */
  async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
    const fullKey = `${this.namespace}:${String(key)}`;
    await this.agentfs.kv.set(fullKey, value);
  }

  /**
   * Get all state as an object
   */
  async getAll(): Promise<Partial<T>> {
    const keys = await this.agentfs.kv.list(`${this.namespace}:`);
    const result: Partial<T> = {};

    for (const fullKey of keys) {
      const key = fullKey.replace(`${this.namespace}:`, '') as keyof T;
      const value = await this.agentfs.kv.get<T[typeof key]>(fullKey);
      if (value !== null) {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Audit logger that wraps tool calls with automatic recording
 */
export class AuditLogger {
  constructor(private readonly agentfs: AgentFSInstance) {}

  /**
   * Record a tool call with automatic timing
   */
  async record<TInput, TOutput>(
    toolName: string,
    input: TInput,
    fn: () => Promise<TOutput>
  ): Promise<TOutput> {
    const startedAt = Date.now() / 1000;

    try {
      const output = await fn();
      const endedAt = Date.now() / 1000;

      await this.agentfs.tools.record(toolName, startedAt, endedAt, input, output);

      return output;
    } catch (error) {
      const endedAt = Date.now() / 1000;

      await this.agentfs.tools.record(toolName, startedAt, endedAt, input, {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get recent tool calls for debugging
   */
  async getRecent(limit = 10): Promise<ToolCall[]> {
    return this.agentfs.tools.list(limit);
  }
}

/**
 * Open an AgentFS instance
 *
 * This is a wrapper that will use the real SDK when available,
 * or fall back to a mock implementation for testing
 */
export async function openAgentFS(options: AgentFSOptions): Promise<AgentFSInstance> {
  // For now, use the mock implementation
  // When agentfs-sdk is installed, this can be updated to use the real SDK:
  //   const { AgentFS } = await import('agentfs-sdk');
  //   return await AgentFS.open(options);
  console.warn(
    `[AgentFS] Using in-memory mock for agent: ${options.id} (install agentfs-sdk for persistence)`
  );
  return createMockAgentFS(options.id);
}

/**
 * Create a mock AgentFS instance for testing
 */
export function createMockAgentFS(_agentId: string): AgentFSInstance {
  const kvStore = new Map<string, unknown>();
  const fsStore = new Map<string, Buffer>();
  const toolCalls: ToolCall[] = [];
  let toolCallId = 0;

  return {
    kv: {
      async get<T>(key: string): Promise<T | null> {
        return (kvStore.get(key) as T) ?? null;
      },
      async set<T>(key: string, value: T): Promise<void> {
        kvStore.set(key, value);
      },
      async delete(key: string): Promise<void> {
        kvStore.delete(key);
      },
      async list(prefix?: string): Promise<string[]> {
        const keys = Array.from(kvStore.keys());
        if (prefix) {
          return keys.filter((k) => k.startsWith(prefix));
        }
        return keys;
      },
    },
    fs: {
      async writeFile(path: string, content: string | Buffer): Promise<void> {
        fsStore.set(path, Buffer.isBuffer(content) ? content : Buffer.from(content));
      },
      async readFile(path: string): Promise<Buffer> {
        const content = fsStore.get(path);
        if (!content) {
          throw new Error(`File not found: ${path}`);
        }
        return content;
      },
      async readdir(path: string): Promise<string[]> {
        const prefix = path.endsWith('/') ? path : `${path}/`;
        return Array.from(fsStore.keys())
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length).split('/')[0])
          .filter((v, i, a) => a.indexOf(v) === i);
      },
      async mkdir(_path: string): Promise<void> {
        // No-op for mock
      },
      async unlink(path: string): Promise<void> {
        fsStore.delete(path);
      },
      async exists(path: string): Promise<boolean> {
        return fsStore.has(path);
      },
    },
    tools: {
      async record(
        toolName: string,
        startedAt: number,
        endedAt: number,
        input: unknown,
        output: unknown
      ): Promise<void> {
        toolCalls.push({
          id: ++toolCallId,
          toolName,
          startedAt,
          endedAt,
          input,
          output,
          durationMs: (endedAt - startedAt) * 1000,
        });
      },
      async list(limit = 10): Promise<ToolCall[]> {
        return toolCalls.slice(-limit).reverse();
      },
    },
  };
}

/**
 * Extract agent name from SPIFFE ID
 */
export function getAgentNameFromId(agentId: AgentId): string {
  return agentId.replace('spiffe://intent.solutions/agent/', '');
}

/**
 * Create SPIFFE agent ID
 */
export function createAgentId(name: string): AgentId {
  return `spiffe://intent.solutions/agent/${name}`;
}
