/**
 * Engine Implementation
 *
 * Creates and manages the Git With Intent execution engine.
 * This engine orchestrates multi-agent runs for PR resolution,
 * code review, and issue-to-code workflows.
 *
 * Phase 7 updates:
 * - Uses TenantStore from @gwi/core for persistent storage
 * - Supports Firestore backend via GWI_STORE_BACKEND=firestore
 * - Falls back to in-memory storage for development
 *
 * Phase 13 updates:
 * - Integrated with OrchestratorAgent for real workflow execution
 * - Maps run types to workflow types
 * - Executes actual agent pipelines
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
  EngineRunType,
} from './types.js';
import { buildDefaultHookRunner } from '../hooks/config.js';
import { AgentHookRunner } from '../hooks/runner.js';
import type { AgentRunContext } from '../hooks/types.js';
import type { TenantStore, SaaSRun, WorkflowType } from '@gwi/core';
import { getTenantStore, getStoreBackend } from '@gwi/core';
import { OrchestratorAgent } from '@gwi/agents';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_ENGINE_CONFIG: Required<EngineConfig> = {
  debug: false,
  maxConcurrentRuns: 10,
  runTimeoutMs: 300000, // 5 minutes
};

// =============================================================================
// In-Memory Run Storage (Fallback)
// =============================================================================

/**
 * In-memory fallback storage for runs when TenantStore operations fail.
 * Primary storage is TenantStore (Firestore or in-memory based on env).
 */
interface InMemoryRun {
  request: ValidatedRunRequest;
  result: RunResult;
  createdAt: Date;
}

const fallbackRuns = new Map<string, InMemoryRun>();

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

  // Get store backend info for logging
  const storeBackend = getStoreBackend();
  if (cfg.debug) {
    console.log(`[Engine] Using ${storeBackend} store backend`);
  }

  // Get TenantStore from deps or environment-based singleton
  const tenantStore: TenantStore = deps?.tenantStore ?? getTenantStore();

  // Build hook runner (will load AgentFS/Beads hooks if enabled)
  let hookRunner: AgentHookRunner | null = null;
  try {
    hookRunner = await buildDefaultHookRunner();
  } catch (error) {
    console.warn('[Engine] Failed to build hook runner, continuing without hooks:', error);
  }

  // Phase 13: Initialize orchestrator for workflow execution
  let orchestrator: OrchestratorAgent | null = null;
  try {
    orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();
    if (cfg.debug) {
      console.log('[Engine] Orchestrator initialized');
    }
  } catch (error) {
    console.warn('[Engine] Failed to initialize orchestrator, workflows will be limited:', error);
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

  /**
   * Convert SaaSRun to RunResult
   */
  function saasRunToResult(run: SaaSRun): RunResult {
    return {
      runId: run.id,
      status: run.status as EngineRunStatus,
      summary: run.result && typeof run.result === 'object' && 'summary' in run.result
        ? (run.result as { summary?: string }).summary
        : undefined,
      currentStep: run.currentStep,
      completedSteps: run.steps.filter(s => s.status === 'completed').length,
      totalSteps: run.steps.length || getExpectedSteps(run.type.toUpperCase()),
      error: run.error,
      startedAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      durationMs: run.durationMs,
    };
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

      // Store run via TenantStore
      try {
        const saasRun: Omit<SaaSRun, 'id' | 'createdAt' | 'updatedAt'> = {
          tenantId,
          repoId: `repo-${repo.fullName.replace('/', '-')}`,
          prId: request.prNumber ? `pr-${request.prNumber}` : `issue-${request.issueNumber || 'none'}`,
          prUrl: `${request.repoUrl}/pull/${request.prNumber || 0}`,
          type: runType.toLowerCase() as SaaSRun['type'],
          status: 'running',
          currentStep: 'initializing',
          steps: [],
          trigger: {
            source: request.trigger === 'api' ? 'ui' : request.trigger,
            commandText: request.metadata?.commandText as string | undefined,
          },
          a2aCorrelationId: runId,
        };

        await tenantStore.createRun(tenantId, saasRun);

        if (cfg.debug) {
          console.log(`[Engine] Run ${runId} stored in ${storeBackend}`);
        }
      } catch (error) {
        // Fall back to in-memory storage if TenantStore fails
        console.warn(`[Engine] TenantStore.createRun failed, using fallback:`, error);
        fallbackRuns.set(`${tenantId}:${runId}`, {
          request: validatedRequest,
          result,
          createdAt: new Date(),
        });
      }

      // Log to hooks
      await logToHooks(validatedRequest, 'started');

      // Phase 13: Trigger actual workflow execution via orchestrator
      if (orchestrator) {
        // Execute workflow asynchronously (don't block the response)
        const workflowType = mapRunTypeToWorkflowType(runType);
        const workflowInput = {
          workflowType,
          payload: {
            tenantId,
            runId,
            repo: validatedRequest.repo,
            prNumber: request.prNumber,
            issueNumber: request.issueNumber,
            riskMode: request.riskMode,
            metadata: request.metadata,
          },
        };

        // Start workflow execution in background
        orchestrator.startWorkflow(workflowType, workflowInput.payload)
          .then(async (workflowResult) => {
            // Update run status based on workflow result
            const finalStatus: EngineRunStatus =
              workflowResult.status === 'completed' ? 'completed' :
              workflowResult.status === 'failed' ? 'failed' :
              workflowResult.status === 'escalated' ? 'completed' : 'running';

            try {
              await tenantStore.updateRun(tenantId, runId, {
                status: finalStatus,
                result: workflowResult.result,
                completedAt: new Date(),
                durationMs: Date.now() - new Date(result.startedAt).getTime(),
              });

              await logToHooks(validatedRequest, finalStatus);
            } catch (err) {
              console.error(`[Engine] Failed to update run ${runId}:`, err);
            }

            if (cfg.debug) {
              console.log(`[Engine] Workflow ${workflowResult.workflowId} completed with status: ${workflowResult.status}`);
            }
          })
          .catch(async (error) => {
            console.error(`[Engine] Workflow failed for run ${runId}:`, error);
            try {
              await tenantStore.updateRun(tenantId, runId, {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
              });
              await logToHooks(validatedRequest, 'failed');
            } catch (err) {
              console.error(`[Engine] Failed to update failed run ${runId}:`, err);
            }
          });
      }

      return result;
    },

    async getRun(tenantId: string, runId: string): Promise<RunResult | null> {
      // Try TenantStore first
      try {
        const saasRun = await tenantStore.getRun(tenantId, runId);
        if (saasRun) {
          return saasRunToResult(saasRun);
        }
      } catch (error) {
        if (cfg.debug) {
          console.warn(`[Engine] TenantStore.getRun failed:`, error);
        }
      }

      // Fall back to in-memory storage
      const key = `${tenantId}:${runId}`;
      const stored = fallbackRuns.get(key);
      return stored?.result ?? null;
    },

    async cancelRun(tenantId: string, runId: string): Promise<boolean> {
      // Try TenantStore first
      try {
        const saasRun = await tenantStore.getRun(tenantId, runId);
        if (saasRun) {
          if (['completed', 'failed', 'cancelled'].includes(saasRun.status)) {
            return false;
          }

          await tenantStore.updateRun(tenantId, runId, { status: 'cancelled' });

          if (cfg.debug) {
            console.log(`[Engine] Cancelled run ${runId} in ${storeBackend}`);
          }
          return true;
        }
      } catch (error) {
        if (cfg.debug) {
          console.warn(`[Engine] TenantStore.cancelRun failed:`, error);
        }
      }

      // Fall back to in-memory storage
      const key = `${tenantId}:${runId}`;
      const stored = fallbackRuns.get(key);

      if (!stored) {
        return false;
      }

      if (['completed', 'failed', 'cancelled'].includes(stored.result.status)) {
        return false;
      }

      stored.result.status = 'cancelled';
      stored.result.completedAt = new Date().toISOString();

      if (cfg.debug) {
        console.log(`[Engine] Cancelled run ${runId} in fallback storage`);
      }

      return true;
    },

    async listRuns(tenantId: string, limit = 20): Promise<RunResult[]> {
      // Try TenantStore first
      try {
        const saasRuns = await tenantStore.listRuns(tenantId, { limit });
        if (saasRuns.length > 0) {
          return saasRuns.map(saasRunToResult);
        }
      } catch (error) {
        if (cfg.debug) {
          console.warn(`[Engine] TenantStore.listRuns failed:`, error);
        }
      }

      // Fall back to in-memory storage
      const results: RunResult[] = [];

      for (const [key, stored] of fallbackRuns) {
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
      return 3; // triage + resolver + reviewer
    case 'REVIEW':
      return 2; // triage + reviewer
    case 'AUTOPILOT':
      return 3; // triage + coder + reviewer
    default:
      return 1;
  }
}

/**
 * Map engine run type to orchestrator workflow type
 */
function mapRunTypeToWorkflowType(runType: EngineRunType): WorkflowType {
  switch (runType) {
    case 'RESOLVE':
      return 'pr-resolve';
    case 'REVIEW':
      return 'pr-review';
    case 'AUTOPILOT':
      return 'issue-to-code';
    case 'TRIAGE':
    case 'PLAN':
    default:
      return 'pr-review'; // Default to review for triage/plan
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
