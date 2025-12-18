/**
 * Base Agent Class for Git With Intent
 *
 * All agents MUST extend this class. Provides:
 * - In-memory state management (production-ready)
 * - Simple audit logging
 * - A2A message handling
 * - Lifecycle management
 *
 * Agents are TRUE AGENTS - stateful, autonomous, collaborative.
 * NOT function wrappers.
 *
 * NOTE: State is in-memory and resets on restart. For persistence,
 * use the Storage interfaces (Firestore in production).
 */

import {
  type A2AMessage,
  type TaskRequestPayload,
  type TaskResponsePayload,
  type AgentCard,
  createTaskResponse,
} from '@gwi/core/a2a';
import { type ModelSelector, createModelSelector, type ChatOptions } from '@gwi/core/models';
import type { AgentId, ModelConfig } from '@gwi/core';

/**
 * Create SPIFFE agent ID
 */
function createAgentId(name: string): AgentId {
  return `spiffe://intent.solutions/agent/${name}`;
}

/**
 * Simple in-memory state store (no external dependencies)
 */
interface InMemoryState {
  kv: Map<string, unknown>;
  auditLog: AuditEntry[];
}

/**
 * Audit log entry
 */
interface AuditEntry {
  timestamp: number;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

/**
 * Simple audit logger (no state dependency)
 */
class SimpleAuditLogger {
  constructor(private readonly state: InMemoryState) {}

  /**
   * Record a tool call with automatic timing
   */
  async record<TInput, TOutput>(
    toolName: string,
    input: TInput,
    fn: () => Promise<TOutput>
  ): Promise<TOutput> {
    const startTime = Date.now();

    try {
      const output = await fn();
      const endTime = Date.now();

      this.state.auditLog.push({
        timestamp: startTime,
        toolName,
        input,
        output,
        durationMs: endTime - startTime,
      });

      // Keep audit log bounded
      if (this.state.auditLog.length > 1000) {
        this.state.auditLog = this.state.auditLog.slice(-1000);
      }

      return output;
    } catch (error) {
      const endTime = Date.now();

      this.state.auditLog.push({
        timestamp: startTime,
        toolName,
        input,
        output: { error: error instanceof Error ? error.message : String(error) },
        durationMs: endTime - startTime,
      });

      throw error;
    }
  }

  /**
   * Get recent audit entries
   */
  getRecent(limit = 10): AuditEntry[] {
    return this.state.auditLog.slice(-limit).reverse();
  }
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Agent name (used in SPIFFE ID) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Supported task types */
  capabilities: string[];
  /** Default model configuration */
  defaultModel: ModelConfig;
  /** Agent version */
  version?: string;
}

/**
 * Agent lifecycle status
 */
export type AgentStatus = 'initializing' | 'ready' | 'working' | 'error' | 'shutdown';

/**
 * Base class for all Git With Intent agents
 */
export abstract class BaseAgent {
  /** Agent SPIFFE ID */
  public readonly agentId: AgentId;

  /** Agent configuration */
  protected readonly config: AgentConfig;

  /** In-memory state (no external dependencies) */
  private _state: InMemoryState = { kv: new Map(), auditLog: [] };

  /** Audit logger for tool calls */
  protected audit!: SimpleAuditLogger;

  /** Model selector for LLM calls */
  protected models!: ModelSelector;

  /** Current agent status */
  protected status: AgentStatus = 'initializing';

  /** Error message if status is 'error' */
  protected error?: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.agentId = createAgentId(config.name);
  }

  /**
   * Initialize the agent - MUST be called before use
   */
  async initialize(): Promise<void> {
    try {
      // Create in-memory state and audit logger (no external deps)
      this._state = { kv: new Map(), auditLog: [] };
      this.audit = new SimpleAuditLogger(this._state);

      // Create model selector
      this.models = createModelSelector();

      // Agent-specific initialization
      await this.onInitialize();

      // Record initialization
      await this.audit.record('agent_initialize', { agentId: this.agentId }, async () => {
        this.status = 'ready';
        return { status: 'ready' };
      });
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Shutdown the agent gracefully
   */
  async shutdown(): Promise<void> {
    await this.audit.record('agent_shutdown', { agentId: this.agentId }, async () => {
      await this.onShutdown();
      this.status = 'shutdown';
      return { status: 'shutdown' };
    });
  }

  /**
   * Handle an incoming A2A message
   */
  async handleMessage(message: A2AMessage<TaskRequestPayload>): Promise<A2AMessage<TaskResponsePayload>> {
    const startTime = Date.now();

    try {
      this.status = 'working';

      // Record the message handling
      const result = await this.audit.record(
        'handle_message',
        { messageId: message.id, taskType: message.payload.taskType },
        async () => {
          return this.processTask(message.payload);
        }
      );

      this.status = 'ready';

      return createTaskResponse(
        this.agentId,
        message.from,
        message.id,
        true,
        result,
        { durationMs: Date.now() - startTime }
      );
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err.message : String(err);

      return createTaskResponse(
        this.agentId,
        message.from,
        message.id,
        false,
        null,
        {
          error: this.error,
          durationMs: Date.now() - startTime,
        }
      );
    }
  }

  /**
   * Get the agent card for service discovery
   */
  getAgentCard(): AgentCard {
    return {
      id: this.agentId,
      name: this.config.name,
      description: this.config.description,
      capabilities: this.config.capabilities,
      defaultModel: this.config.defaultModel,
      version: this.config.version ?? '0.1.0',
    };
  }

  /**
   * Get current agent status
   */
  getStatus(): { status: AgentStatus; error?: string } {
    return { status: this.status, error: this.error };
  }

  /**
   * Save state to in-memory store
   * NOTE: State is ephemeral and resets on restart.
   * For persistence, use Storage interfaces (Firestore).
   */
  protected async saveState<T>(key: string, value: T): Promise<void> {
    this._state.kv.set(`state:${key}`, value);
  }

  /**
   * Load state from in-memory store
   */
  protected async loadState<T>(key: string): Promise<T | null> {
    return (this._state.kv.get(`state:${key}`) as T) ?? null;
  }

  /**
   * Execute a chat completion with audit logging
   */
  protected async chat(options: ChatOptions): Promise<string> {
    const response = await this.audit.record(
      'llm_chat',
      {
        model: options.model?.model ?? 'default',
        messageCount: options.messages.length,
      },
      async () => {
        return this.models.chat(options);
      }
    );

    return response.content;
  }

  /**
   * Agent-specific initialization (override in subclass)
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Agent-specific shutdown (override in subclass)
   */
  protected abstract onShutdown(): Promise<void>;

  /**
   * Process a task request (override in subclass)
   */
  protected abstract processTask(payload: TaskRequestPayload): Promise<unknown>;
}
