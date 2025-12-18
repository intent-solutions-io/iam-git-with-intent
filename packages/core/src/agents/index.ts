/**
 * Agent Module - Phase 18/19
 *
 * Provides pluggable agent adapters for executing PR candidates.
 * Follows the same pattern as storage and queue modules.
 *
 * @module @gwi/core/agents
 */

import { getLogger } from '../reliability/observability.js';
import { createStubAdapter as createStub } from './stub-adapter.js';
import { createGitHubAdapter as createGitHub } from './github-adapter.js';

// Re-export types
export {
  AgentStepClass,
  STEP_CLASS_SCOPES,
  ImplementationStep,
  ImplementationPlan,
  StepExecutionResult,
  ExecutionResult,
  type PlanInput,
  type ExecuteInput,
  type AgentAdapter,
  type AgentCapabilities,
} from './types.js';

// Re-export stub adapter
export {
  StubAgentAdapter,
  createStubAdapter,
  type StubAgentAdapterConfig,
} from './stub-adapter.js';

// Re-export GitHub adapter (Phase 19)
export {
  GitHubAgentAdapter,
  createGitHubAdapter,
  type GitHubAgentAdapterConfig,
} from './github-adapter.js';

// Re-export Intent Receipt formatting
export {
  formatIntentReceiptAsComment,
  formatMinimalIntentReceipt,
  formatPlanReviewComment,
  formatSuccessComment,
  formatFailureComment,
  type FormattedIntentReceipt,
  type IntentReceiptData,
} from './intent-receipt.js';

const logger = getLogger('agents');

// =============================================================================
// Agent Adapter Registry
// =============================================================================

/**
 * Registry for agent adapters
 */
export interface AgentAdapterRegistry {
  /** Get an adapter by name */
  get(name: string): import('./types.js').AgentAdapter | undefined;
  /** Register an adapter */
  register(adapter: import('./types.js').AgentAdapter): void;
  /** List all registered adapter names */
  list(): string[];
  /** Get the default adapter */
  getDefault(): import('./types.js').AgentAdapter;
  /** Set the default adapter name */
  setDefault(name: string): void;
}

// Internal state
let agentRegistry: AgentAdapterRegistry | null = null;
let defaultAdapterName = 'stub';

/**
 * Create and initialize the agent adapter registry
 */
function createRegistry(): AgentAdapterRegistry {
  const adapters = new Map<string, import('./types.js').AgentAdapter>();

  // Register stub adapter by default
  const stubAdapter = createStub();
  adapters.set('stub', stubAdapter);

  // Register GitHub adapter (Phase 19)
  const githubAdapter = createGitHub();
  adapters.set('github', githubAdapter);

  return {
    get(name: string) {
      return adapters.get(name);
    },

    register(adapter) {
      adapters.set(adapter.name, adapter);
      logger.info('Registered agent adapter', {
        name: adapter.name,
        version: adapter.version,
      });
    },

    list() {
      return Array.from(adapters.keys());
    },

    getDefault() {
      const adapter = adapters.get(defaultAdapterName);
      if (!adapter) {
        // Fall back to stub if default not found
        const fallback = adapters.get('stub');
        if (!fallback) {
          throw new Error(`No agent adapters registered`);
        }
        logger.warn('Default adapter not found, falling back to stub', {
          requested: defaultAdapterName,
        });
        return fallback;
      }
      return adapter;
    },

    setDefault(name: string) {
      if (!adapters.has(name)) {
        throw new Error(`Adapter not found: ${name}`);
      }
      defaultAdapterName = name;
      logger.info('Set default agent adapter', { name });
    },
  };
}

/**
 * Get the agent adapter registry (singleton)
 */
export function getAgentRegistry(): AgentAdapterRegistry {
  if (!agentRegistry) {
    agentRegistry = createRegistry();
    logger.info('Agent registry initialized', {
      adapters: agentRegistry.list(),
      default: defaultAdapterName,
    });
  }
  return agentRegistry;
}

/**
 * Reset the registry (for testing)
 */
export function resetAgentRegistry(): void {
  agentRegistry = null;
  defaultAdapterName = 'stub';
}

/**
 * Set a custom registry (for testing)
 */
export function setAgentRegistry(registry: AgentAdapterRegistry): void {
  agentRegistry = registry;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the default agent adapter
 *
 * Uses environment variable GWI_AGENT_ADAPTER to select:
 * - 'stub' (default): StubAgentAdapter for dev/tests
 * - 'github': GitHubAgentAdapter for real PR creation (Phase 19)
 * - 'vertex': VertexAgentAdapter (future)
 * - 'external': ExternalAgentAdapter (future)
 */
export function getAgentAdapter(): import('./types.js').AgentAdapter {
  const registry = getAgentRegistry();

  // Check environment for adapter override
  const envAdapter = process.env.GWI_AGENT_ADAPTER;
  if (envAdapter && envAdapter !== defaultAdapterName) {
    const adapter = registry.get(envAdapter);
    if (adapter) {
      return adapter;
    }
    logger.warn('Requested adapter not found, using default', {
      requested: envAdapter,
      using: defaultAdapterName,
    });
  }

  return registry.getDefault();
}

/**
 * Register an agent adapter
 */
export function registerAgentAdapter(
  adapter: import('./types.js').AgentAdapter
): void {
  const registry = getAgentRegistry();
  registry.register(adapter);
}

/**
 * Plan a candidate using the default adapter
 */
export async function planCandidate(
  input: import('./types.js').PlanInput
): Promise<import('./types.js').ImplementationPlan> {
  const adapter = getAgentAdapter();
  logger.info('Planning candidate', {
    adapter: adapter.name,
    workItemId: input.workItem.id,
    tenantId: input.tenantId,
  });
  return adapter.planCandidate(input);
}

/**
 * Execute a plan using the default adapter
 */
export async function executePlan(
  input: import('./types.js').ExecuteInput
): Promise<import('./types.js').ExecutionResult> {
  const adapter = getAgentAdapter();
  logger.info('Executing plan', {
    adapter: adapter.name,
    planId: input.plan.id,
    candidateId: input.plan.candidateId,
    tenantId: input.tenantId,
    dryRun: input.dryRun,
  });
  return adapter.executePlan(input);
}

/**
 * Health check the default adapter
 */
export async function healthCheckAgent(): Promise<{
  healthy: boolean;
  adapter: string;
  message?: string;
}> {
  const adapter = getAgentAdapter();
  const result = await adapter.healthCheck();
  return {
    healthy: result.healthy,
    adapter: adapter.name,
    message: result.message,
  };
}
