/**
 * Run Status State Machine (C3: Enhanced)
 *
 * Validates state transitions for the storage layer's RunStatus type.
 *
 * State transitions (C3 Enhanced):
 *   pending → running | failed | cancelled
 *   running → completed | failed | cancelled | awaiting_approval | waiting_external
 *   awaiting_approval → running | completed | failed | cancelled
 *   waiting_external → running | completed | failed | cancelled
 *   completed, failed, cancelled → (terminal)
 *
 * @module @gwi/core/storage
 */

import type { RunStatus } from './interfaces.js';

/**
 * Valid state transitions for RunStatus
 *
 * Enhanced in C3:
 * - running can pause for approval (awaiting_approval)
 * - running can wait for external events (waiting_external)
 * - Both waiting states can resume to running
 */
export const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  pending: ['running', 'failed', 'cancelled'],
  running: ['completed', 'failed', 'cancelled', 'awaiting_approval', 'waiting_external'],
  awaiting_approval: ['running', 'completed', 'failed', 'cancelled'], // C3: approval gate
  waiting_external: ['running', 'completed', 'failed', 'cancelled'],  // C3: external wait
  completed: [], // Terminal state
  failed: [],    // Terminal state
  cancelled: [], // Terminal state
};

/**
 * Error thrown when an invalid status transition is attempted
 */
export class InvalidRunStatusTransitionError extends Error {
  constructor(
    public readonly fromStatus: RunStatus,
    public readonly toStatus: RunStatus,
    public readonly runId: string
  ) {
    const validTransitions = RUN_STATUS_TRANSITIONS[fromStatus];
    super(
      `Invalid run status transition: ${fromStatus} → ${toStatus} for run ${runId}. ` +
        `Valid transitions from ${fromStatus}: [${validTransitions.join(', ')}]`
    );
    this.name = 'InvalidRunStatusTransitionError';
  }
}

/**
 * Check if a status transition is valid
 */
export function isValidRunStatusTransition(from: RunStatus, to: RunStatus): boolean {
  const validTargets = RUN_STATUS_TRANSITIONS[from];
  return validTargets.includes(to);
}

/**
 * Validate a status transition, throwing if invalid
 */
export function validateRunStatusTransition(
  from: RunStatus,
  to: RunStatus,
  runId: string
): void {
  if (!isValidRunStatusTransition(from, to)) {
    throw new InvalidRunStatusTransitionError(from, to, runId);
  }
}

/**
 * Check if a status is terminal (no further transitions possible)
 */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return RUN_STATUS_TRANSITIONS[status].length === 0;
}

/**
 * Check if a status indicates the run is in progress
 *
 * Enhanced in C3: awaiting_approval and waiting_external are also considered in-progress
 * (paused but not finished)
 *
 * Derived from isTerminalRunStatus for maintainability - if new non-terminal states
 * are added, they will automatically be considered "in progress".
 */
export function isRunInProgress(status: RunStatus): boolean {
  return !isTerminalRunStatus(status);
}

/**
 * Check if a status indicates the run has finished (success or failure)
 *
 * Equivalent to isTerminalRunStatus - provided for semantic clarity.
 */
export function isRunFinished(status: RunStatus): boolean {
  return isTerminalRunStatus(status);
}
