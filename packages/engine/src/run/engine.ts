/**
 * Engine Implementation
 *
 * Creates and manages the Git With Intent execution engine.
 * This engine orchestrates multi-agent runs for PR resolution,
 * code review, and issue-to-code workflows.
 *
 * For Phase 5, this is a placeholder implementation that:
 * - Generates run IDs
 * - Stores runs in memory (or via provided stores)
 * - Integrates with the hook system
 * - Returns stub results
 *
 * Real agent orchestration and Vertex AI Agent Engine integration
 * will be added in subsequent phases.
 *
 * @module @gwi/engine/run
 */

import type {
  Engine,
  EngineConfig,
  EngineDependencies,
  RunRequest,
  RunResult,
  ValidatedRunRequest,
  EngineRunStatus,
} from './types.js';
import { buildDefaultHookRunner } from '../hooks/config.js';
import type { AgentHookRunner, AgentRunContext } from '../hooks/types.js';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_ENGINE_CONFIG: Required<EngineConfig> = {
  debug: false,
  maxConcurrentRuns: 10,
  runTimeoutMs: 300000, // 5 minutes
};

// =============================================================================
// In-Memory Run Storage (Temporary)
// =============================================================================

/**
 * TEMPORARY: In-memory storage for runs
 * Will be replaced with Firestore-backed TenantStore in a later phase.
 */
interface InMemoryRun {
  request: ValidatedRunRequest;
  result: RunResult;
  createdAt: Date;
}

const inMemoryRuns = new Map<string, InMemoryRun>();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `run-${timestamp}-${random}`;
}

/**
 * Parse repository URL into owner/name
 */
function parseRepoUrl(url: string): { owner: string; name: string; fullName: string } | null {
  // Handle GitHub URLs: https://github.com/owner/repo
  const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (githubMatch) {
    const owner = githubMatch[1];
    const name = githubMatch[2].replace(/\.git$/, '');
    return { owner, name, fullName: `${owner}/${name}` };
  }
  return null;
}

/**
 * Validate a run request
 */
function validateRunRequest(request: RunRequest): ValidatedRunRequest {
  // Validate tenant ID
  if (!request.tenantId || request.tenantId.trim() === '') {
    throw new Error('tenantId is required');
  }

  // Validate repo URL
  if (!request.repoUrl || request.repoUrl.trim() === '') {
    throw new Error('repoUrl is required');
  }

  const repo = parseRepoUrl(request.repoUrl);
  if (!repo) {
    throw new Error(`Invalid repository URL: ${request.repoUrl}`);
  }

  // Validate run type specific requirements
  if (['RESOLVE', 'REVIEW'].includes(request.runType) && !request.prNumber) {
    throw new Error(`prNumber is required for ${request.runType} runs`);
  }

  return {
    ...request,
    runId: generateRunId(),
    repo,
    validatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Engine Implementation
// =============================================================================

/**
 * Create an engine instance
 *
 * @param config - Engine configuration
 * @param deps - Dependencies (stores, etc.)
 * @returns Engine instance
 */
export async function createEngine(
  config?: EngineConfig,
  deps?: EngineDependencies
): Promise<Engine> {
  const cfg = { ...DEFAULT_ENGINE_CONFIG, ...config };

  // Build hook runner (will load AgentFS/Beads hooks if enabled)
  let hookRunner: AgentHookRunner | null = null;
  try {
    hookRunner = await buildDefaultHookRunner();
  } catch (error) {
    console.warn('[Engine] Failed to build hook runner, continuing without hooks:', error);
  }

  /**
   * Log to hooks if available
   */
  async function logToHooks(
    request: ValidatedRunRequest,
    status: EngineRunStatus,
    agentRole: 'FOREMAN' | 'TRIAGE' | 'PLANNER' | 'CODER' | 'VALIDATOR' | 'REVIEWER' = 'FOREMAN'
  ): Promise<void> {
    if (!hookRunner) return;

    const ctx: AgentRunContext = {
      tenantId: request.tenantId,
      runId: request.runId,
      runType: request.runType as any, // Hook system uses same uppercase types
      stepId: `${request.runId}-${status}`,
      agentRole,
      stepStatus: status === 'started' ? 'running' : status === 'completed' ? 'completed' : 'pending',
      timestamp: new Date().toISOString(),
      inputSummary: `${request.runType} run for ${request.repo.fullName}`,
      outputSummary: `Status: ${status}`,
      metadata: {
        trigger: request.trigger,
        prNumber: request.prNumber,
        issueNumber: request.issueNumber,
      },
    };

    try {
      await hookRunner.afterStep(ctx);
    } catch (error) {
      // Hooks should never crash the engine
      if (cfg.debug) {
        console.warn('[Engine] Hook execution failed:', error);
      }
    }
  }

  return {
    async startRun(request: RunRequest): Promise<RunResult> {
      // Validate request
      const validatedRequest = validateRunRequest(request);
      const { runId, tenantId, runType, repo } = validatedRequest;

      if (cfg.debug) {
        console.log(`[Engine] Starting run ${runId} for ${repo.fullName}`);
      }

      // Create initial result
      const result: RunResult = {
        runId,
        status: 'started',
        currentStep: 'initializing',
        completedSteps: 0,
        totalSteps: getExpectedSteps(runType),
        startedAt: new Date().toISOString(),
      };

      // Store in memory (TEMPORARY: will use TenantStore later)
      inMemoryRuns.set(`${tenantId}:${runId}`, {
        request: validatedRequest,
        result,
        createdAt: new Date(),
      });

      // Log to hooks
      await logToHooks(validatedRequest, 'started');

      // TODO: In future phases, this is where we would:
      // 1. Call Vertex AI Agent Engine with the foreman
      // 2. Start the agent pipeline
      // 3. Update status as agents complete

      return result;
    },

    async getRun(tenantId: string, runId: string): Promise<RunResult | null> {
      const key = `${tenantId}:${runId}`;
      const stored = inMemoryRuns.get(key);
      return stored?.result ?? null;
    },

    async cancelRun(tenantId: string, runId: string): Promise<boolean> {
      const key = `${tenantId}:${runId}`;
      const stored = inMemoryRuns.get(key);

      if (!stored) {
        return false;
      }

      if (['completed', 'failed', 'cancelled'].includes(stored.result.status)) {
        return false;
      }

      stored.result.status = 'cancelled';
      stored.result.completedAt = new Date().toISOString();

      if (cfg.debug) {
        console.log(`[Engine] Cancelled run ${runId}`);
      }

      return true;
    },

    async listRuns(tenantId: string, limit = 20): Promise<RunResult[]> {
      const results: RunResult[] = [];

      for (const [key, stored] of inMemoryRuns) {
        if (key.startsWith(`${tenantId}:`)) {
          results.push(stored.result);
        }
      }

      // Sort by startedAt descending
      results.sort((a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );

      return results.slice(0, limit);
    },
  };
}

/**
 * Get expected number of steps for a run type
 */
function getExpectedSteps(runType: string): number {
  switch (runType) {
    case 'TRIAGE':
      return 1;
    case 'PLAN':
      return 2; // triage + plan
    case 'RESOLVE':
      return 4; // triage + plan + code + validate
    case 'REVIEW':
      return 2; // triage + review
    case 'AUTOPILOT':
      return 5; // triage + plan + code + validate + review
    default:
      return 1;
  }
}

// =============================================================================
// Singleton Engine (for simple usage)
// =============================================================================

let defaultEngine: Engine | null = null;

/**
 * Get or create the default engine instance
 *
 * For simple usage when you don't need custom configuration.
 */
export async function getDefaultEngine(): Promise<Engine> {
  if (!defaultEngine) {
    defaultEngine = await createEngine();
  }
  return defaultEngine;
}
