/**
 * Run Resume/Replay
 *
 * Phase 7: Support for resuming interrupted runs and replaying workflows.
 *
 * Hard rules:
 * - Resume reads prior artifacts and continues from last completed step
 * - Replay uses idempotency to skip already-completed steps
 * - State is persisted to enable cold restart
 * - Resume is safe even after process crash
 *
 * @module @gwi/core/reliability/resume
 */

import type { SaaSRun, RunStep, RunStatus } from '../storage/interfaces.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Checkpoint representing a run's resumable state
 */
export interface RunCheckpoint {
  /** Run ID */
  runId: string;

  /** Tenant ID */
  tenantId: string;

  /** Current step index (0-based) */
  currentStepIndex: number;

  /** Name of the current step */
  currentStepName: string;

  /** Status of the run */
  status: RunStatus;

  /** Completed step IDs */
  completedSteps: string[];

  /** Failed step ID if any */
  failedStepId?: string;

  /** Accumulated artifacts from prior steps */
  artifacts: Record<string, unknown>;

  /** When the checkpoint was created */
  checkpointedAt: Date;

  /** Reason for checkpoint (pause, crash, user-initiated) */
  reason?: 'pause' | 'crash' | 'timeout' | 'manual';
}

/**
 * Resume options
 */
export interface ResumeOptions {
  /** Force restart from beginning */
  forceRestart?: boolean;

  /** Skip to specific step (for debugging) */
  skipToStep?: string;

  /** Override artifacts from prior steps */
  overrideArtifacts?: Record<string, unknown>;
}

/**
 * Resume result
 */
export interface ResumeResult {
  /** Whether resume was successful */
  success: boolean;

  /** The checkpoint that was used */
  checkpoint?: RunCheckpoint;

  /** Error if resume failed */
  error?: string;

  /** Step to start from */
  startFromStep?: string;

  /** Index to start from */
  startFromIndex?: number;

  /** Artifacts available for the resumed step */
  availableArtifacts?: Record<string, unknown>;
}

// =============================================================================
// Checkpoint Manager
// =============================================================================

/**
 * Manages run checkpoints for resume/replay
 */
export class CheckpointManager {
  private checkpoints = new Map<string, RunCheckpoint>();

  /**
   * Create a checkpoint from a run's current state
   */
  createCheckpoint(
    run: SaaSRun,
    artifacts: Record<string, unknown>,
    reason?: RunCheckpoint['reason']
  ): RunCheckpoint {
    const completedSteps = run.steps
      .filter(s => s.status === 'completed')
      .map(s => s.id);

    const failedStep = run.steps.find(s => s.status === 'failed');

    const checkpoint: RunCheckpoint = {
      runId: run.id,
      tenantId: run.tenantId,
      currentStepIndex: completedSteps.length,
      currentStepName: run.currentStep ?? 'unknown',
      status: run.status,
      completedSteps,
      failedStepId: failedStep?.id,
      artifacts,
      checkpointedAt: new Date(),
      reason,
    };

    this.checkpoints.set(run.id, checkpoint);
    return checkpoint;
  }

  /**
   * Get the latest checkpoint for a run
   */
  getCheckpoint(runId: string): RunCheckpoint | null {
    return this.checkpoints.get(runId) ?? null;
  }

  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(runId: string): boolean {
    return this.checkpoints.delete(runId);
  }

  /**
   * List all checkpoints
   */
  listCheckpoints(): RunCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Clear all checkpoints (for testing)
   */
  clear(): void {
    this.checkpoints.clear();
  }
}

// =============================================================================
// Resume Logic
// =============================================================================

/**
 * Analyze a run to determine resume point
 */
export function analyzeResumePoint(
  run: SaaSRun,
  checkpoint: RunCheckpoint | null,
  options: ResumeOptions = {}
): ResumeResult {
  // Force restart
  if (options.forceRestart) {
    return {
      success: true,
      startFromStep: run.steps[0]?.agent ?? 'start',
      startFromIndex: 0,
      availableArtifacts: options.overrideArtifacts ?? {},
    };
  }

  // Check if run can be resumed
  if (run.status === 'completed') {
    return {
      success: false,
      error: 'Run is already completed',
    };
  }

  if (run.status === 'cancelled') {
    return {
      success: false,
      error: 'Run was cancelled',
    };
  }

  // Skip to specific step
  if (options.skipToStep) {
    const stepIndex = run.steps.findIndex(s => s.agent === options.skipToStep);
    if (stepIndex === -1) {
      return {
        success: false,
        error: `Step ${options.skipToStep} not found in run`,
      };
    }

    // Collect artifacts from steps before the skip point
    const priorArtifacts: Record<string, unknown> = {};
    for (let i = 0; i < stepIndex; i++) {
      const step = run.steps[i];
      if (step.output) {
        priorArtifacts[step.agent] = step.output;
      }
    }

    return {
      success: true,
      startFromStep: options.skipToStep,
      startFromIndex: stepIndex,
      availableArtifacts: { ...priorArtifacts, ...options.overrideArtifacts },
    };
  }

  // Use checkpoint if available
  if (checkpoint) {
    return {
      success: true,
      checkpoint,
      startFromStep: checkpoint.currentStepName,
      startFromIndex: checkpoint.currentStepIndex,
      availableArtifacts: { ...checkpoint.artifacts, ...options.overrideArtifacts },
    };
  }

  // Find last completed step
  const completedSteps = run.steps.filter(s => s.status === 'completed');
  const nextIndex = completedSteps.length;

  // Collect artifacts from completed steps
  const artifacts: Record<string, unknown> = {};
  for (const step of completedSteps) {
    if (step.output) {
      artifacts[step.agent] = step.output;
    }
  }

  // Find next step
  const nextStep = run.steps[nextIndex];
  if (!nextStep) {
    // No more steps - run might be done
    return {
      success: false,
      error: 'No more steps to resume',
    };
  }

  return {
    success: true,
    startFromStep: nextStep.agent,
    startFromIndex: nextIndex,
    availableArtifacts: { ...artifacts, ...options.overrideArtifacts },
  };
}

/**
 * Check if a step should be skipped due to idempotency
 */
export function shouldSkipStep(
  step: RunStep,
  completedSteps: Set<string>
): boolean {
  // Already completed
  if (step.status === 'completed') {
    return true;
  }

  // Check if step ID is in completed set
  if (completedSteps.has(step.id)) {
    return true;
  }

  return false;
}

/**
 * Merge artifacts from multiple steps
 */
export function mergeArtifacts(
  prior: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> {
  return { ...prior, ...current };
}

// =============================================================================
// Global Singleton
// =============================================================================

let globalCheckpointManager: CheckpointManager | null = null;

/**
 * Get the global checkpoint manager
 */
export function getCheckpointManager(): CheckpointManager {
  if (!globalCheckpointManager) {
    globalCheckpointManager = new CheckpointManager();
  }
  return globalCheckpointManager;
}

/**
 * Set a custom checkpoint manager
 */
export function setCheckpointManager(manager: CheckpointManager): void {
  globalCheckpointManager = manager;
}
