/**
 * Run Status State Machine
 *
 * Validates state transitions for the storage layer's RunStatus type.
 * This is a simpler state machine than the run-bundle's RunState.
 *
 * State transitions:
 *   pending → running → completed
 *                    ↘ failed
 *                    ↘ cancelled
 *                    ↘ awaiting_approval (C3)
 *                    ↘ waiting_external (C3)
 *   awaiting_approval → running (approved)
 *                     ↘ failed (rejected)
 *                     ↘ cancelled
 *   waiting_external → running (event received)
 *                    ↘ failed (timeout)
 *                    ↘ cancelled
 *   pending → failed (immediate failure)
 *   pending → cancelled (cancelled before start)
 *
 * @module @gwi/core/storage
 */

import type { RunStatus } from './interfaces.js';

/**
 * Valid state transitions for RunStatus
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
 */
export function isRunInProgress(status: RunStatus): boolean {
  return (
    status === 'pending' ||
    status === 'running' ||
    status === 'awaiting_approval' ||
    status === 'waiting_external'
  );
}

/**
 * Check if a status indicates the run has finished (success or failure)
 */
export function isRunFinished(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
