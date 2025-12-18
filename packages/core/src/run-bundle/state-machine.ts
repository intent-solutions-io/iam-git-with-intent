/**
 * Run State Machine
 *
 * Manages state transitions for runs with validation.
 */

import { RunState, STATE_TRANSITIONS } from './types.js';

/**
 * Error thrown when an invalid state transition is attempted
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly fromState: RunState,
    public readonly toState: RunState,
    public readonly runId: string
  ) {
    super(
      `Invalid state transition: ${fromState} → ${toState} for run ${runId}. ` +
      `Valid transitions from ${fromState}: [${STATE_TRANSITIONS[fromState].join(', ')}]`
    );
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: RunState, to: RunState): boolean {
  const validTargets = STATE_TRANSITIONS[from];
  return validTargets.includes(to);
}

/**
 * Validate a state transition, throwing if invalid
 */
export function validateTransition(from: RunState, to: RunState, runId: string): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to, runId);
  }
}

/**
 * Check if a state is terminal (no further transitions possible)
 */
export function isTerminalState(state: RunState): boolean {
  return STATE_TRANSITIONS[state].length === 0;
}

/**
 * Get the next expected state for a workflow
 * Returns null if multiple paths are possible or state is terminal
 */
export function getNextExpectedState(current: RunState): RunState | null {
  const validTargets = STATE_TRANSITIONS[current];

  // Terminal state or multiple paths
  if (validTargets.length !== 1) {
    // Filter out error states to find the "happy path"
    const happyPath = validTargets.filter(s => s !== 'failed' && s !== 'aborted');
    if (happyPath.length === 1) {
      return happyPath[0];
    }
    return null;
  }

  return validTargets[0];
}

/**
 * Get the complete happy path from a given state to done
 */
export function getHappyPath(from: RunState): RunState[] {
  const path: RunState[] = [from];
  let current = from;

  while (current !== 'done') {
    const validTargets = STATE_TRANSITIONS[current];
    // Filter to happy path (non-error states)
    const happyTargets = validTargets.filter(s => s !== 'failed' && s !== 'aborted');

    if (happyTargets.length === 0) {
      break; // Terminal state
    }

    // Prefer the most likely next state
    const nextState = happyTargets[0];
    path.push(nextState);
    current = nextState;
  }

  return path;
}

/**
 * Calculate progress percentage based on current state
 */
export function calculateProgress(state: RunState): number {
  const progressMap: Record<RunState, number> = {
    queued: 0,
    triaged: 15,
    planned: 30,
    resolving: 50,
    review: 70,
    awaiting_approval: 85,
    applying: 95,
    done: 100,
    aborted: 100,
    failed: 100,
  };

  return progressMap[state];
}
