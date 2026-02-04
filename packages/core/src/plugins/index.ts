/**
 * Plugin System for Git With Intent
 *
 * Phase 14: Extensibility architecture for third-party integrations.
 *
 * Plugins can:
 * - Add new workflow types
 * - Register custom agents
 * - Provide storage backends
 * - Hook into workflow events
 * - Add CLI commands
 *
 * @module @gwi/core/plugins
 */

import { createLogger } from '../telemetry/index.js';

const logger = createLogger('plugins');

// =============================================================================
// Plugin Types
// =============================================================================

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Repository URL */
  repository?: string;
  /** Required GWI version (semver range) */
  gwiVersion?: string;
  /** Plugin dependencies */
  dependencies?: string[];
}

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  /** Called when plugin is loaded */
  onLoad?: () => Promise<void>;
  /** Called when plugin is unloaded */
  onUnload?: () => Promise<void>;
  /** Called before a workflow starts */
  beforeWorkflow?: (ctx: WorkflowContext) => Promise<void>;
  /** Called after a workflow completes */
  afterWorkflow?: (ctx: WorkflowContext, result: unknown) => Promise<void>;
  /** Called before an agent step */
  beforeStep?: (ctx: StepContext) => Promise<void>;
  /** Called after an agent step */
  afterStep?: (ctx: StepContext, result: unknown) => Promise<void>;
  /** Called on any error */
  onError?: (ctx: ErrorContext) => Promise<void>;
}

/**
 * Context passed to workflow hooks
 */
export interface WorkflowContext {
  workflowId: string;
  workflowType: string;
  tenantId?: string;
  input: unknown;
  metadata: Record<string, unknown>;
}

/**
 * Context passed to step hooks
 */
export interface StepContext extends WorkflowContext {
  stepId: string;
  agent: string;
  stepInput: unknown;
}

/**
 * Context passed to error hooks
 */
export interface ErrorContext {
  workflowId?: string;
  stepId?: string;
  agent?: string;
  error: Error;
  recoverable: boolean;
}

/**
 * Plugin contribution types
 */
export interface PluginContributions {
  /** Custom workflow types */
  workflows?: WorkflowContribution[];
  /** Custom agents */
  agents?: AgentContribution[];
  /** Custom storage backends */
  storage?: StorageContribution[];
  /** CLI command contributions */
  commands?: CommandContribution[];
  /** Event handlers */
  events?: EventContribution[];
}

/**
 * Workflow contribution
 */
export interface WorkflowContribution {
  /** Workflow type identifier */
  type: string;
  /** Workflow description */
  description: string;
  /** Agents to execute in order */
  agents: string[];
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  outputSchema?: Record<string, unknown>;
  /** Requires human approval */
  requiresApproval?: boolean;
}

/**
 * Agent contribution
 */
export interface AgentContribution {
  /** Agent identifier */
  name: string;
  /** Agent description */
  description: string;
  /** Agent capabilities */
  capabilities: string[];
  /** Factory function to create agent instance */
  factory: () => Promise<unknown>;
}

/**
 * Storage backend contribution
 */
export interface StorageContribution {
  /** Storage type identifier */
  type: string;
  /** Storage description */
  description: string;
  /** Factory to create store instances */
  factory: (config: Record<string, unknown>) => Promise<unknown>;
}

/**
 * CLI command contribution
 */
export interface CommandContribution {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Command options */
  options?: Array<{
    flag: string;
    description: string;
    defaultValue?: unknown;
  }>;
  /** Command handler */
  handler: (args: unknown, options: unknown) => Promise<void>;
}

/**
 * Event handler contribution
 */
export interface EventContribution {
  /** Event type to handle */
  event: string;
  /** Handler function */
  handler: (payload: unknown) => Promise<void>;
  /** Handler priority (lower = higher priority) */
  priority?: number;
}

/**
 * Complete plugin definition
 */
export interface Plugin {
  /** Plugin metadata */
  metadata: PluginMetadata;
  /** Plugin lifecycle hooks */
  hooks?: PluginHooks;
  /** Plugin contributions */
  contributions?: PluginContributions;
}

// =============================================================================
// Plugin Registry
// =============================================================================

/**
 * Plugin state
 */
interface PluginState {
  plugin: Plugin;
  loaded: boolean;
  loadedAt?: Date;
  error?: string;
}

/**
 * Plugin registry - manages all loaded plugins
 */
export class PluginRegistry {
  private plugins: Map<string, PluginState> = new Map();
  private workflows: Map<string, WorkflowContribution> = new Map();
  private agents: Map<string, AgentContribution> = new Map();
  private storage: Map<string, StorageContribution> = new Map();
  private commands: Map<string, CommandContribution> = new Map();
  private eventHandlers: Map<string, Array<{ handler: EventContribution; pluginName: string }>> = new Map();

  /**
   * Register a plugin
   */
  async register(plugin: Plugin): Promise<void> {
    const { name, version } = plugin.metadata;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin '${name}' is already registered`);
    }

    // Validate dependencies
    if (plugin.metadata.dependencies) {
      for (const dep of plugin.metadata.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin '${name}' requires '${dep}' which is not loaded`);
        }
      }
    }

    // Store plugin state
    this.plugins.set(name, {
      plugin,
      loaded: false,
    });

    // Register contributions
    if (plugin.contributions) {
      this.registerContributions(name, plugin.contributions);
    }

    logger.info('Plugin registered', { name, version });
  }

  /**
   * Load a registered plugin
   */
  async load(name: string): Promise<void> {
    const state = this.plugins.get(name);
    if (!state) {
      throw new Error(`Plugin '${name}' is not registered`);
    }

    if (state.loaded) {
      return;
    }

    try {
      // Call onLoad hook
      if (state.plugin.hooks?.onLoad) {
        await state.plugin.hooks.onLoad();
      }

      state.loaded = true;
      state.loadedAt = new Date();
      logger.info('Plugin loaded', { name });
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  async unload(name: string): Promise<void> {
    const state = this.plugins.get(name);
    if (!state) {
      throw new Error(`Plugin '${name}' is not registered`);
    }

    if (!state.loaded) {
      return;
    }

    try {
      // Call onUnload hook
      if (state.plugin.hooks?.onUnload) {
        await state.plugin.hooks.onUnload();
      }

      // Remove contributions
      this.unregisterContributions(name);

      state.loaded = false;
      logger.info('Plugin unloaded', { name });
    } catch (error) {
      logger.error('Error unloading plugin', { name, error });
      throw error;
    }
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter(s => s.loaded)
      .map(s => s.plugin);
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  /**
   * Check if plugin is loaded
   */
  isLoaded(name: string): boolean {
    return this.plugins.get(name)?.loaded ?? false;
  }

  /**
   * Get all registered workflows (including from plugins)
   */
  getWorkflows(): Map<string, WorkflowContribution> {
    return new Map(this.workflows);
  }

  /**
   * Get workflow by type
   */
  getWorkflow(type: string): WorkflowContribution | undefined {
    return this.workflows.get(type);
  }

  /**
   * Get all registered agents (including from plugins)
   */
  getAgents(): Map<string, AgentContribution> {
    return new Map(this.agents);
  }

  /**
   * Get agent by name
   */
  getAgent(name: string): AgentContribution | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all registered CLI commands
   */
  getCommands(): Map<string, CommandContribution> {
    return new Map(this.commands);
  }

  /**
   * Get all registered storage backends
   */
  getStorageBackends(): Map<string, StorageContribution> {
    return new Map(this.storage);
  }

  /**
   * Execute workflow hooks for all loaded plugins
   */
  async executeWorkflowHooks(
    hookName: 'beforeWorkflow' | 'afterWorkflow',
    ctx: WorkflowContext,
    result?: unknown
  ): Promise<void> {
    for (const state of this.plugins.values()) {
      if (!state.loaded) continue;
      const hook = state.plugin.hooks?.[hookName];
      if (hook) {
        try {
          if (hookName === 'afterWorkflow') {
            await (hook as (ctx: WorkflowContext, result: unknown) => Promise<void>)(ctx, result);
          } else {
            await (hook as (ctx: WorkflowContext) => Promise<void>)(ctx);
          }
        } catch (error) {
          logger.error('Plugin hook failed', { pluginName: state.plugin.metadata.name, hookName, error });
        }
      }
    }
  }

  /**
   * Execute step hooks for all loaded plugins
   */
  async executeStepHooks(
    hookName: 'beforeStep' | 'afterStep',
    ctx: StepContext,
    result?: unknown
  ): Promise<void> {
    for (const state of this.plugins.values()) {
      if (!state.loaded) continue;
      const hook = state.plugin.hooks?.[hookName];
      if (hook) {
        try {
          if (hookName === 'afterStep') {
            await (hook as (ctx: StepContext, result: unknown) => Promise<void>)(ctx, result);
          } else {
            await (hook as (ctx: StepContext) => Promise<void>)(ctx);
          }
        } catch (error) {
          logger.error('Plugin hook failed', { pluginName: state.plugin.metadata.name, hookName, error });
        }
      }
    }
  }

  /**
   * Execute error hooks for all loaded plugins
   */
  async executeErrorHooks(ctx: ErrorContext): Promise<void> {
    for (const state of this.plugins.values()) {
      if (!state.loaded) continue;
      const hook = state.plugin.hooks?.onError;
      if (hook) {
        try {
          await hook(ctx);
        } catch (error) {
          logger.error('Plugin onError hook failed', { pluginName: state.plugin.metadata.name, error });
        }
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  async emit(event: string, payload: unknown): Promise<void> {
    const handlers = this.eventHandlers.get(event) || [];

    // Sort by priority
    handlers.sort((a, b) => (a.handler.priority ?? 100) - (b.handler.priority ?? 100));

    for (const { handler, pluginName } of handlers) {
      try {
        await handler.handler(payload);
      } catch (error) {
        logger.error('Event handler failed', { pluginName, error });
      }
    }
  }

  /**
   * Register plugin contributions
   */
  private registerContributions(pluginName: string, contributions: PluginContributions): void {
    // Register workflows
    if (contributions.workflows) {
      for (const workflow of contributions.workflows) {
        if (this.workflows.has(workflow.type)) {
          logger.warn('Workflow conflict with existing workflow', { workflowType: workflow.type, pluginName });
          continue;
        }
        this.workflows.set(workflow.type, workflow);
      }
    }

    // Register agents
    if (contributions.agents) {
      for (const agent of contributions.agents) {
        if (this.agents.has(agent.name)) {
          logger.warn('Agent conflict with existing agent', { agentName: agent.name, pluginName });
          continue;
        }
        this.agents.set(agent.name, agent);
      }
    }

    // Register storage backends
    if (contributions.storage) {
      for (const storageBackend of contributions.storage) {
        if (this.storage.has(storageBackend.type)) {
          logger.warn('Storage conflict with existing backend', { storageType: storageBackend.type, pluginName });
          continue;
        }
        this.storage.set(storageBackend.type, storageBackend);
      }
    }

    // Register commands
    if (contributions.commands) {
      for (const command of contributions.commands) {
        if (this.commands.has(command.name)) {
          logger.warn('Command conflict with existing command', { commandName: command.name, pluginName });
          continue;
        }
        this.commands.set(command.name, command);
      }
    }

    // Register event handlers
    if (contributions.events) {
      for (const eventHandler of contributions.events) {
        if (!this.eventHandlers.has(eventHandler.event)) {
          this.eventHandlers.set(eventHandler.event, []);
        }
        this.eventHandlers.get(eventHandler.event)!.push({
          handler: eventHandler,
          pluginName,
        });
      }
    }
  }

  /**
   * Unregister plugin contributions
   */
  private unregisterContributions(pluginName: string): void {
    const state = this.plugins.get(pluginName);
    if (!state?.plugin.contributions) return;

    const contributions = state.plugin.contributions;

    // Unregister workflows
    if (contributions.workflows) {
      for (const workflow of contributions.workflows) {
        this.workflows.delete(workflow.type);
      }
    }

    // Unregister agents
    if (contributions.agents) {
      for (const agent of contributions.agents) {
        this.agents.delete(agent.name);
      }
    }

    // Unregister storage
    if (contributions.storage) {
      for (const storageBackend of contributions.storage) {
        this.storage.delete(storageBackend.type);
      }
    }

    // Unregister commands
    if (contributions.commands) {
      for (const command of contributions.commands) {
        this.commands.delete(command.name);
      }
    }

    // Unregister event handlers
    if (contributions.events) {
      for (const eventHandler of contributions.events) {
        const handlers = this.eventHandlers.get(eventHandler.event);
        if (handlers) {
          const index = handlers.findIndex(h => h.pluginName === pluginName);
          if (index >= 0) {
            handlers.splice(index, 1);
          }
        }
      }
    }
  }
}

// =============================================================================
// Global Registry Instance
// =============================================================================

let globalRegistry: PluginRegistry | null = null;

/**
 * Get the global plugin registry
 */
export function getPluginRegistry(): PluginRegistry {
  if (!globalRegistry) {
    globalRegistry = new PluginRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global plugin registry (for testing)
 */
export function resetPluginRegistry(): void {
  globalRegistry = null;
}

// =============================================================================
// Plugin Helpers
// =============================================================================

/**
 * Define a plugin with type safety
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/**
 * Load plugins from a directory
 */
export async function loadPluginsFromDirectory(dir: string): Promise<void> {
  const registry = getPluginRegistry();
  const { readdir } = await import('fs/promises');
  const { join } = await import('path');

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dir, entry.name, 'index.js');
        try {
          const pluginModule = await import(pluginPath);
          const plugin = pluginModule.default || pluginModule;
          await registry.register(plugin);
          await registry.load(plugin.metadata.name);
        } catch (error) {
          logger.error('Failed to load plugin', { pluginPath, error });
        }
      }
    }
  } catch (error) {
    logger.error('Failed to read plugins directory', { dir, error });
  }
}
