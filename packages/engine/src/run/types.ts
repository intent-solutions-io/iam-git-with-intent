/**
 * Run Request and Engine Types
 *
 * Defines the contracts for starting and managing multi-agent runs.
 * Used by gwi-api and gwi-gateway to invoke the shared engine.
 *
 * @module @gwi/engine/run
 */

// =============================================================================
// Run Types (Engine uses uppercase, storage uses lowercase)
// =============================================================================

/**
 * Run types for the engine (uppercase for clarity in API/logs)
 */
export type EngineRunType = 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';

/**
 * Run status
 */
export type EngineRunStatus = 'started' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Trigger source for a run
 */
export type RunTrigger = 'api' | 'webhook' | 'cli' | 'scheduled';

// =============================================================================
// Run Request
// =============================================================================

/**
 * Request to start a new run
 *
 * Used by:
 * - gwi-api POST /tenants/:tenantId/runs
 * - gwi-gateway POST /a2a/foreman
 */
export interface RunRequest {
  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * Repository URL (GitHub format: https://github.com/owner/repo)
   */
  repoUrl: string;

  /**
   * PR number (required for RESOLVE, REVIEW)
   */
  prNumber?: number;

  /**
   * Issue number (for issue-to-code workflows)
   */
  issueNumber?: number;

  /**
   * Type of run to execute
   */
  runType: EngineRunType;

  /**
   * What triggered this run
   */
  trigger: RunTrigger;

  /**
   * Risk mode for this run (defaults to tenant settings)
   */
  riskMode?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Validated run request (after validation)
 */
export interface ValidatedRunRequest extends RunRequest {
  /**
   * Generated run ID
   */
  runId: string;

  /**
   * Parsed repository info
   */
  repo: {
    owner: string;
    name: string;
    fullName: string;
  };

  /**
   * Timestamp when request was validated
   */
  validatedAt: string;
}

// =============================================================================
// Run Result
// =============================================================================

/**
 * Result returned when a run is started or queried
 */
export interface RunResult {
  /**
   * Unique run identifier
   */
  runId: string;

  /**
   * Current status
   */
  status: EngineRunStatus;

  /**
   * Human-readable summary (populated on completion)
   */
  summary?: string;

  /**
   * Current step being executed
   */
  currentStep?: string;

  /**
   * Number of completed steps
   */
  completedSteps?: number;

  /**
   * Total expected steps
   */
  totalSteps?: number;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * When the run started
   */
  startedAt: string;

  /**
   * When the run completed (if done)
   */
  completedAt?: string;

  /**
   * Duration in milliseconds (if completed)
   */
  durationMs?: number;
}

// =============================================================================
// Engine Interface
// =============================================================================

/**
 * Engine configuration
 */
export interface EngineConfig {
  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Maximum concurrent runs per tenant
   */
  maxConcurrentRuns?: number;

  /**
   * Run timeout in milliseconds
   */
  runTimeoutMs?: number;
}

/**
 * Dependencies required by the engine
 */
export interface EngineDependencies {
  /**
   * Tenant store for multi-tenant data
   * TEMPORARY: Uses in-memory implementation until Firestore is wired
   */
  tenantStore?: import('@gwi/core').TenantStore;

  /**
   * Run store for tracking runs
   * TEMPORARY: Uses in-memory implementation until Firestore is wired
   */
  runStore?: import('@gwi/core').RunStore;
}

/**
 * The Engine interface for starting and managing runs
 *
 * This is the core abstraction that gwi-api and gwi-gateway call.
 */
export interface Engine {
  /**
   * Start a new run
   *
   * @param request - The run request
   * @returns The initial run result with status 'started'
   */
  startRun(request: RunRequest): Promise<RunResult>;

  /**
   * Get the status of a run
   *
   * @param tenantId - Tenant ID
   * @param runId - Run ID
   * @returns The current run result or null if not found
   */
  getRun(tenantId: string, runId: string): Promise<RunResult | null>;

  /**
   * Cancel a running run
   *
   * @param tenantId - Tenant ID
   * @param runId - Run ID
   * @returns true if cancelled, false if not found or already completed
   */
  cancelRun(tenantId: string, runId: string): Promise<boolean>;

  /**
   * List recent runs for a tenant
   *
   * @param tenantId - Tenant ID
   * @param limit - Maximum number of runs to return
   * @returns Array of run results
   */
  listRuns(tenantId: string, limit?: number): Promise<RunResult[]>;
}
