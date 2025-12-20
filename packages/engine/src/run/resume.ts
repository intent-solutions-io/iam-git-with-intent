/**
 * Run Resume Semantics (A2.s5)
 *
 * Provides resume capabilities for interrupted runs:
 * - findResumePoint: Locate the last successful step
 * - canResume: Validate if a run is resumable
 * - resumeRun: Execute resume with state recovery
 *
 * Resume Strategy:
 * - Runs can only be resumed if they have checkpoints
 * - Resume skips completed steps and starts from next step
 * - Idempotent steps can be replayed safely
 * - State is carried forward from last checkpoint
 *
 * @module @gwi/engine/run/resume
 */

import type { Run, StepCheckpoint } from '@gwi/core';
import type {
  CheckpointStore,
  ResumeContext,
  ResumeMode,
} from './checkpoint.js';
import { createResumeContext } from './checkpoint.js';

// =============================================================================
// Resume Point Discovery
// =============================================================================

/**
 * Result of finding a resume point
 */
export interface ResumePoint {
  /** Whether a resume point was found */
  found: boolean;
  /** The checkpoint to resume from (if found) */
  checkpoint?: StepCheckpoint;
  /** Index in the checkpoints array */
  checkpointIndex?: number;
  /** Reason if not found */
  reason?: string;
}

/**
 * Find the resume point for a run
 *
 * Strategy:
 * - Look for the last successful (completed) checkpoint
 * - Ensure the checkpoint is marked as resumable
 * - Return the checkpoint and its index
 *
 * @param runId - Run ID to find resume point for
 * @param store - Checkpoint store to query
 * @returns Resume point information
 */
export async function findResumePoint(
  runId: string,
  store: CheckpointStore
): Promise<ResumePoint> {
  const checkpoints = await store.getCheckpoints(runId);

  if (checkpoints.length === 0) {
    return {
      found: false,
      reason: 'No checkpoints found for run',
    };
  }

  // Find the last successful, resumable checkpoint
  let lastSuccessfulIndex = -1;
  let lastSuccessful: StepCheckpoint | undefined;

  for (let i = checkpoints.length - 1; i >= 0; i--) {
    const cp = checkpoints[i];
    if (cp.status === 'completed' && cp.resumable) {
      lastSuccessfulIndex = i;
      lastSuccessful = cp;
      break;
    }
  }

  if (!lastSuccessful) {
    return {
      found: false,
      reason: 'No resumable checkpoints found',
    };
  }

  return {
    found: true,
    checkpoint: lastSuccessful,
    checkpointIndex: lastSuccessfulIndex,
  };
}

// =============================================================================
// Resume Validation
// =============================================================================

/**
 * Reasons why a run cannot be resumed
 */
export type ResumeBlocker =
  | 'run_not_found'
  | 'run_completed'
  | 'run_cancelled'
  | 'no_checkpoints'
  | 'no_resumable_checkpoint'
  | 'missing_steps';

/**
 * Result of checking if a run can be resumed
 */
export interface CanResumeResult {
  /** Whether the run can be resumed */
  canResume: boolean;
  /** Reason if not resumable */
  blocker?: ResumeBlocker;
  /** Human-readable reason */
  reason?: string;
  /** Resume point if resumable */
  resumePoint?: ResumePoint;
}

/**
 * Check if a run can be resumed
 *
 * Validation rules:
 * - Run must exist
 * - Run must not be completed or cancelled
 * - Run must have at least one resumable checkpoint
 * - Run must have a clear resume point
 *
 * @param run - The run to validate
 * @param store - Checkpoint store to query
 * @returns Validation result
 */
export async function canResume(
  run: Run | null,
  store: CheckpointStore
): Promise<CanResumeResult> {
  // Check run exists
  if (!run) {
    return {
      canResume: false,
      blocker: 'run_not_found',
      reason: 'Run does not exist',
    };
  }

  // Check run status
  if (run.status === 'completed') {
    return {
      canResume: false,
      blocker: 'run_completed',
      reason: 'Run has already completed successfully',
    };
  }

  if (run.status === 'cancelled') {
    return {
      canResume: false,
      blocker: 'run_cancelled',
      reason: 'Cannot resume cancelled runs',
    };
  }

  // Check for checkpoints
  const hasCheckpoints = await store.hasCheckpoints(run.id);
  if (!hasCheckpoints) {
    return {
      canResume: false,
      blocker: 'no_checkpoints',
      reason: 'No checkpoints found for run',
    };
  }

  // Find resume point
  const resumePoint = await findResumePoint(run.id, store);
  if (!resumePoint.found) {
    return {
      canResume: false,
      blocker: 'no_resumable_checkpoint',
      reason: resumePoint.reason || 'No resumable checkpoint found',
    };
  }

  // All checks passed
  return {
    canResume: true,
    resumePoint,
  };
}

// =============================================================================
// Resume Execution
// =============================================================================

/**
 * Options for resuming a run
 */
export interface ResumeRunOptions {
  /** Run to resume */
  run: Run;
  /** Checkpoint store */
  store: CheckpointStore;
  /** Step to resume from (optional, defaults to last successful) */
  fromStepId?: string;
  /** Whether to force resume even if validation fails */
  force?: boolean;
  /** Resume mode (defaults to 'from_checkpoint') */
  mode?: ResumeMode;
}

/**
 * Result of attempting to resume a run
 */
export interface ResumeResult {
  /** Whether resume was successful */
  success: boolean;
  /** Resume context if successful */
  context?: ResumeContext;
  /** Error if failed */
  error?: string;
  /** Blocker if validation failed */
  blocker?: ResumeBlocker;
}

/**
 * Prepare to resume a run
 *
 * This function validates the run and creates a ResumeContext
 * that can be used during execution to skip completed steps.
 *
 * The actual execution is handled by the engine/orchestrator,
 * which uses the ResumeContext to determine which steps to skip.
 *
 * @param options - Resume options
 * @returns Resume result with context
 */
export async function resumeRun(
  options: ResumeRunOptions
): Promise<ResumeResult> {
  const {
    run,
    store,
    fromStepId,
    force = false,
    mode = 'from_checkpoint',
  } = options;

  // Validate run can be resumed (unless force = true)
  if (!force) {
    const validation = await canResume(run, store);
    if (!validation.canResume) {
      return {
        success: false,
        error: validation.reason,
        blocker: validation.blocker,
      };
    }
  }

  // Get checkpoints
  const checkpoints = await store.getCheckpoints(run.id);

  // Create resume context
  const context = createResumeContext({
    runId: run.id,
    mode,
    checkpoints,
    replayStepId: fromStepId,
    resumeCount: run.resumeCount || 0,
  });

  return {
    success: true,
    context,
  };
}

// =============================================================================
// Idempotent Step Replay
// =============================================================================

/**
 * Options for replaying a step
 */
export interface ReplayStepOptions {
  /** Run ID */
  runId: string;
  /** Step ID to replay */
  stepId: string;
  /** Checkpoint store */
  store: CheckpointStore;
}

/**
 * Result of attempting to replay a step
 */
export interface ReplayStepResult {
  /** Whether the step can be replayed */
  canReplay: boolean;
  /** Checkpoint for the step */
  checkpoint?: StepCheckpoint;
  /** Reason if not replayable */
  reason?: string;
}

/**
 * Check if a step can be replayed
 *
 * A step can be replayed if:
 * - It has a checkpoint
 * - It is marked as idempotent
 * - It completed successfully
 *
 * @param options - Replay options
 * @returns Replay result
 */
export async function canReplayStep(
  options: ReplayStepOptions
): Promise<ReplayStepResult> {
  const { runId, stepId, store } = options;

  // Get all checkpoints
  const checkpoints = await store.getCheckpoints(runId);

  // Find checkpoint for this step
  const checkpoint = checkpoints.find(cp => cp.stepId === stepId);

  if (!checkpoint) {
    return {
      canReplay: false,
      reason: 'No checkpoint found for step',
    };
  }

  if (!checkpoint.idempotent) {
    return {
      canReplay: false,
      reason: 'Step is not marked as idempotent',
    };
  }

  if (checkpoint.status !== 'completed') {
    return {
      canReplay: false,
      reason: 'Step did not complete successfully',
    };
  }

  return {
    canReplay: true,
    checkpoint,
  };
}

// =============================================================================
// State Recovery
// =============================================================================

/**
 * Recovery strategy for resume
 */
export type RecoveryStrategy =
  | 'carry_forward'  // Use state from last checkpoint
  | 'rebuild'        // Rebuild state by replaying steps
  | 'hybrid';        // Carry forward + selective replay

/**
 * Options for recovering state
 */
export interface RecoverStateOptions {
  /** Run ID */
  runId: string;
  /** Checkpoint store */
  store: CheckpointStore;
  /** Recovery strategy */
  strategy: RecoveryStrategy;
  /** Target state shape (for validation) */
  expectedStateShape?: Record<string, unknown>;
}

/**
 * Result of state recovery
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Recovered state */
  state?: unknown;
  /** Steps that were replayed (if strategy = 'rebuild' or 'hybrid') */
  replayedSteps?: string[];
  /** Error if failed */
  error?: string;
}

/**
 * Recover state for a resume
 *
 * Simple implementation: just returns the last checkpoint output.
 * More sophisticated strategies (rebuild, hybrid) can be implemented
 * based on specific use cases.
 *
 * @param options - Recovery options
 * @returns Recovery result
 */
export async function recoverState(
  options: RecoverStateOptions
): Promise<RecoveryResult> {
  const { runId, store, strategy } = options;

  // Get latest checkpoint
  const latest = await store.getLatestCheckpoint(runId);

  if (!latest) {
    return {
      success: false,
      error: 'No checkpoint found for state recovery',
    };
  }

  // For now, implement simple carry_forward strategy
  if (strategy === 'carry_forward') {
    return {
      success: true,
      state: latest.output,
    };
  }

  // Other strategies (rebuild, hybrid) would be implemented here
  // based on specific requirements
  return {
    success: false,
    error: `Recovery strategy '${strategy}' not yet implemented`,
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  findResumePoint as default,
};
