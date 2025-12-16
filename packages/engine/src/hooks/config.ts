/**
 * Hook Configuration
 *
 * Reads hook configuration from environment variables and creates
 * the default hook runner with appropriate hooks registered.
 *
 * Environment Variables:
 * - GWI_AGENTFS_ENABLED: Enable AgentFS audit hook (internal)
 * - GWI_BEADS_ENABLED: Enable Beads task tracking hook (internal)
 * - GWI_HOOK_DEBUG: Enable debug logging for hooks
 * - GWI_HOOK_TIMEOUT_MS: Timeout for hook execution (default: 5000)
 * - GWI_HOOK_PARALLEL: Run hooks in parallel (default: true)
 *
 * @module @gwi/engine/hooks
 */

import type { HookConfig, BeadsHookConfig, AgentHook } from './types.js';
import { DEFAULT_HOOK_CONFIG, DEFAULT_BEADS_HOOK_CONFIG } from './types.js';
import { AgentHookRunner } from './runner.js';

/**
 * Read hook configuration from environment variables
 */
export function readHookConfigFromEnv(): HookConfig {
  return {
    enableAgentFs: process.env.GWI_AGENTFS_ENABLED === 'true',
    enableBeads: process.env.GWI_BEADS_ENABLED === 'true',
    enableCustomHooks: process.env.GWI_CUSTOM_HOOKS_ENABLED !== 'false',
    hookTimeoutMs: parseInt(process.env.GWI_HOOK_TIMEOUT_MS || '', 10) || DEFAULT_HOOK_CONFIG.hookTimeoutMs,
    parallelExecution: process.env.GWI_HOOK_PARALLEL !== 'false',
    debug: process.env.GWI_HOOK_DEBUG === 'true',
  };
}

/**
 * Read Beads-specific configuration from environment
 */
export function readBeadsConfigFromEnv(): BeadsHookConfig {
  const runTypes = process.env.GWI_BEADS_RUN_TYPES;
  const createIssueForRunTypes = runTypes
    ? (runTypes.split(',').map((s) => s.trim().toUpperCase()) as BeadsHookConfig['createIssueForRunTypes'])
    : DEFAULT_BEADS_HOOK_CONFIG.createIssueForRunTypes;

  return {
    createIssueForRunTypes,
    minComplexityForIssue:
      parseInt(process.env.GWI_BEADS_MIN_COMPLEXITY || '', 10) ||
      DEFAULT_BEADS_HOOK_CONFIG.minComplexityForIssue,
    createOnPartialSuccess:
      process.env.GWI_BEADS_CREATE_ON_PARTIAL !== 'false',
    createOnDeferral:
      process.env.GWI_BEADS_CREATE_ON_DEFERRAL !== 'false',
    updateExistingIssues:
      process.env.GWI_BEADS_UPDATE_EXISTING !== 'false',
  };
}

/**
 * AgentFS configuration from environment
 */
export interface AgentFSConfig {
  /**
   * AgentFS agent identifier
   */
  agentId: string;

  /**
   * Turso database URL (optional, uses local file if not set)
   */
  tursoUrl?: string;

  /**
   * Turso auth token
   */
  tursoAuthToken?: string;

  /**
   * Local database path (if not using Turso)
   */
  dbPath?: string;
}

/**
 * Read AgentFS configuration from environment
 */
export function readAgentFSConfigFromEnv(): AgentFSConfig | null {
  const agentId = process.env.GWI_AGENTFS_ID || process.env.AGENTFS_AGENT_ID;

  if (!agentId) {
    return null;
  }

  return {
    agentId,
    tursoUrl: process.env.TURSO_URL || process.env.GWI_AGENTFS_TURSO_URL,
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN || process.env.GWI_AGENTFS_TURSO_TOKEN,
    dbPath: process.env.AGENTFS_DB_PATH || process.env.GWI_AGENTFS_DB_PATH,
  };
}

/**
 * Build the default hook runner with all configured hooks
 *
 * This function:
 * 1. Reads configuration from environment
 * 2. Dynamically imports internal hooks when enabled
 * 3. Registers all enabled hooks
 * 4. Returns a ready-to-use runner
 *
 * Usage:
 * ```typescript
 * const runner = await buildDefaultHookRunner();
 * // Runner is now configured based on environment
 * ```
 */
export async function buildDefaultHookRunner(): Promise<AgentHookRunner> {
  const config = readHookConfigFromEnv();
  const runner = new AgentHookRunner(config);

  // Register AgentFS hook if enabled
  // Note: AgentFS and Beads hooks are internal tools in /internal/
  // They are NOT compiled with the engine package and require separate setup
  if (config.enableAgentFs) {
    const agentfsConfig = readAgentFSConfigFromEnv();

    if (agentfsConfig) {
      try {
        // Dynamic import to avoid hard dependency
        // The internal hooks must be compiled separately via scripts
        // This import path assumes the hook is available at runtime
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AgentFSHook } = require('@gwi/internal-agentfs-hook');
        const hook = new AgentFSHook(agentfsConfig);
        runner.register(hook);
      } catch {
        // Expected when internal tools are not installed
        if (config.debug) {
          console.log(
            '[HookConfig] AgentFS hook not available (internal tool). ' +
            'This is normal in production.'
          );
        }
      }
    } else {
      console.warn(
        '[HookConfig] GWI_AGENTFS_ENABLED=true but GWI_AGENTFS_ID not set. ' +
        'Set GWI_AGENTFS_ID to enable AgentFS auditing.'
      );
    }
  }

  // Register Beads hook if enabled
  if (config.enableBeads) {
    try {
      // Dynamic import to avoid hard dependency
      // The internal hooks must be compiled separately via scripts
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BeadsHook } = require('@gwi/internal-beads-hook');
      const beadsConfig = readBeadsConfigFromEnv();
      const hook = new BeadsHook(beadsConfig);
      runner.register(hook);
    } catch {
      // Expected when internal tools are not installed
      if (config.debug) {
        console.log(
          '[HookConfig] Beads hook not available (internal tool). ' +
          'This is normal in production.'
        );
      }
    }
  }

  return runner;
}

/**
 * Build a hook runner with specific hooks (for testing or custom configurations)
 */
export function buildHookRunner(
  config: Partial<HookConfig>,
  hooks: AgentHook[]
): AgentHookRunner {
  const runner = new AgentHookRunner(config);

  for (const hook of hooks) {
    runner.register(hook);
  }

  return runner;
}

/**
 * Check if any internal hooks are configured
 *
 * Useful for logging/debugging to show which internal tools are active
 */
export function getInternalHookStatus(): {
  agentFs: { enabled: boolean; configured: boolean };
  beads: { enabled: boolean };
} {
  const config = readHookConfigFromEnv();
  const agentfsConfig = readAgentFSConfigFromEnv();

  return {
    agentFs: {
      enabled: config.enableAgentFs,
      configured: agentfsConfig !== null,
    },
    beads: {
      enabled: config.enableBeads,
    },
  };
}
