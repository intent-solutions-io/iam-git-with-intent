/**
 * Run Checkpoint Management (A2.s5)
 *
 * Provides checkpoint persistence for resumable runs:
 * - StepCheckpoint captures step state at completion
 * - CheckpointStore manages checkpoint persistence
 * - ResumeContext tracks resume state during execution
 *
 * Checkpoint Pattern:
 * - Save checkpoint after each successful step
 * - Store deterministic inputs and outputs
 * - Enable resume from last successful checkpoint
 * - Support idempotent step replay
 *
 * @module @gwi/engine/run/checkpoint
 */

import type { RunStep, StepCheckpoint } from '@gwi/core';

// =============================================================================
// Step Checkpoint
// =============================================================================
// Note: StepCheckpoint interface is defined in @gwi/core/storage/interfaces.ts

/**
 * Options for creating a checkpoint
 */
export interface CreateCheckpointOptions {
  /** Step record to checkpoint */
  step: RunStep;
  /** Whether this step is resumable (default: true) */
  resumable?: boolean;
  /** Whether this step is idempotent (default: false) */
  idempotent?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create a checkpoint from a completed step
 */
export function createCheckpoint(
  options: CreateCheckpointOptions
): StepCheckpoint {
  const { step, resumable = true, idempotent = false } = options;

  return {
    stepId: step.id,
    agent: step.agent,
    status: step.status,
    input: step.input,
    output: step.output,
    error: step.error,
    timestamp: new Date(),
    resumable,
    idempotent,
    tokensUsed: step.tokensUsed,
    durationMs: step.durationMs,
  };
}

// =============================================================================
// Checkpoint Store
// =============================================================================

/**
 * Interface for persisting checkpoints
 *
 * Implementations can:
 * - Store in-memory for development
 * - Persist to database for production
 * - Write to Run.checkpoints field
 */
export interface CheckpointStore {
  /**
   * Save a checkpoint for a run
   */
  saveCheckpoint(runId: string, checkpoint: StepCheckpoint): Promise<void>;

  /**
   * Get all checkpoints for a run (ordered by timestamp)
   */
  getCheckpoints(runId: string): Promise<StepCheckpoint[]>;

  /**
   * Get the latest successful checkpoint for a run
   */
  getLatestCheckpoint(runId: string): Promise<StepCheckpoint | null>;

  /**
   * Clear all checkpoints for a run
   */
  clearCheckpoints(runId: string): Promise<void>;

  /**
   * Check if a run has any checkpoints
   */
  hasCheckpoints(runId: string): Promise<boolean>;
}

/**
 * In-memory checkpoint store (for development/testing)
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private checkpoints: Map<string, StepCheckpoint[]> = new Map();

  async saveCheckpoint(runId: string, checkpoint: StepCheckpoint): Promise<void> {
    const existing = this.checkpoints.get(runId) || [];
    existing.push(checkpoint);
    this.checkpoints.set(runId, existing);
  }

  async getCheckpoints(runId: string): Promise<StepCheckpoint[]> {
    return this.checkpoints.get(runId) || [];
  }

  async getLatestCheckpoint(runId: string): Promise<StepCheckpoint | null> {
    const checkpoints = await this.getCheckpoints(runId);
    if (checkpoints.length === 0) return null;

    // Return the most recent successful checkpoint
    const successful = checkpoints.filter(
      cp => cp.status === 'completed'
    );
    return successful.length > 0
      ? successful[successful.length - 1]
      : null;
  }

  async clearCheckpoints(runId: string): Promise<void> {
    this.checkpoints.delete(runId);
  }

  async hasCheckpoints(runId: string): Promise<boolean> {
    const checkpoints = await this.getCheckpoints(runId);
    return checkpoints.length > 0;
  }
}

// =============================================================================
// Resume Context
// =============================================================================

/**
 * Resume mode for run execution
 */
export type ResumeMode =
  | 'from_start'      // Normal execution from beginning
  | 'from_checkpoint' // Resume from last successful checkpoint
  | 'replay_step';    // Replay a specific step (for debugging)

/**
 * Context for tracking resume state during run execution
 */
export interface ResumeContext {
  /** Run ID being resumed */
  runId: string;
  /** Resume mode */
  mode: ResumeMode;
  /** Checkpoint to resume from (if mode = 'from_checkpoint') */
  resumeCheckpoint?: StepCheckpoint;
  /** Step ID to replay (if mode = 'replay_step') */
  replayStepId?: string;
  /** Number of times this run has been resumed */
  resumeCount: number;
  /** When the resume was initiated */
  resumedAt: Date;
  /** IDs of steps to skip (already completed) */
  skipStepIds: Set<string>;
  /** State carried forward from checkpoint */
  carryForwardState?: unknown;
}

/**
 * Options for creating a resume context
 */
export interface CreateResumeContextOptions {
  /** Run ID */
  runId: string;
  /** Resume mode */
  mode: ResumeMode;
  /** Checkpoints from previous execution */
  checkpoints?: StepCheckpoint[];
  /** Step ID to replay (if mode = 'replay_step') */
  replayStepId?: string;
  /** Previous resume count */
  resumeCount?: number;
}

/**
 * Create a resume context from checkpoints
 */
export function createResumeContext(
  options: CreateResumeContextOptions
): ResumeContext {
  const {
    runId,
    mode,
    checkpoints = [],
    replayStepId,
    resumeCount = 0,
  } = options;

  // Find the latest successful checkpoint
  const resumeCheckpoint = checkpoints
    .filter(cp => cp.status === 'completed' && cp.resumable)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

  // Build set of step IDs to skip (completed steps before resume point)
  const skipStepIds = new Set<string>();
  if (mode === 'from_checkpoint' && resumeCheckpoint) {
    // Skip all completed steps up to and including the resume checkpoint
    for (const cp of checkpoints) {
      if (cp.timestamp <= resumeCheckpoint.timestamp && cp.status === 'completed') {
        skipStepIds.add(cp.stepId);
      }
    }
  }

  return {
    runId,
    mode,
    resumeCheckpoint,
    replayStepId,
    resumeCount: resumeCount + 1,
    resumedAt: new Date(),
    skipStepIds,
    carryForwardState: resumeCheckpoint?.output,
  };
}

/**
 * Check if a step should be skipped during resume
 */
export function shouldSkipStep(
  ctx: ResumeContext,
  stepId: string
): boolean {
  return ctx.skipStepIds.has(stepId);
}

/**
 * Check if a step is the resume point
 */
export function isResumePoint(
  ctx: ResumeContext,
  stepId: string
): boolean {
  return ctx.resumeCheckpoint?.stepId === stepId;
}

// =============================================================================
// Exports
// =============================================================================

export { InMemoryCheckpointStore as default };
