/**
 * Base Agent Class for Git With Intent
 *
 * All agents MUST extend this class. Provides:
 * - AgentFS state management
 * - Audit logging for all tool calls
 * - A2A message handling
 * - Lifecycle management
 *
 * Agents are TRUE AGENTS - stateful, autonomous, collaborative.
 * NOT function wrappers.
 */

import {
  type AgentFSInstance,
  AuditLogger,
  openAgentFS,
  createAgentId,
} from '@gwi/core/agentfs';
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

  /** AgentFS instance for state management */
  protected agentfs!: AgentFSInstance;

  /** Audit logger for tool calls */
  protected audit!: AuditLogger;

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
      // Open AgentFS
      this.agentfs = await openAgentFS({ id: this.config.name });

      // Create audit logger
      this.audit = new AuditLogger(this.agentfs);

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
   * Save state to AgentFS
   */
  protected async saveState<T>(key: string, value: T): Promise<void> {
    await this.agentfs.kv.set(`state:${key}`, value);
  }

  /**
   * Load state from AgentFS
   */
  protected async loadState<T>(key: string): Promise<T | null> {
    return this.agentfs.kv.get<T>(`state:${key}`);
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
