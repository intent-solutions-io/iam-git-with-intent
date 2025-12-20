/**
 * Run State Machine (A2.1)
 *
 * Validates state transitions for run status changes.
 * Enforces terminal state rules and provides audit context.
 *
 * State Machine Diagram:
 * ```
 *                    ┌─────────┐
 *                    │ pending │ (initial state)
 *                    └────┬────┘
 *                         │
 *          ┌──────────────┼──────────────┐
 *          │              │              │
 *          v              v              v
 *     ┌─────────┐    ┌─────────┐   ┌────────┐
 *     │cancelled│    │ running │   │ failed │
 *     └─────────┘    └────┬────┘   └────────┘
 *      (terminal)         │         (terminal)
 *                    ┌────┼────┐
 *                    │    │    │
 *                    v    v    v
 *             ┌──────────┐ ┌─────────┐
 *             │completed │ │cancelled│
 *             └──────────┘ └─────────┘
 *              (terminal)   (terminal)
 * ```
 *
 * Terminal states: completed, failed, cancelled
 * - Once a run reaches a terminal state, no transitions are allowed
 *
 * @module @gwi/engine/run/state-machine
 */

import type { RunStatus } from '@gwi/core';

// =============================================================================
// State Machine Configuration
// =============================================================================

/**
 * Valid state transitions
 *
 * Maps each RunStatus to the states it can transition to.
 */
const STATE_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  pending: ['running', 'cancelled', 'failed'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [], // terminal
  failed: [],    // terminal
  cancelled: [], // terminal
};

/**
 * Terminal states (no outbound transitions)
 */
const TERMINAL_STATES: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled']);

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a state transition is valid
 *
 * @param from - Current run status
 * @param to - Desired run status
 * @returns true if transition is allowed, false otherwise
 *
 * @example
 * ```typescript
 * isValidTransition('pending', 'running')  // => true
 * isValidTransition('completed', 'running') // => false
 * isValidTransition('running', 'paused')   // => true
 * ```
 */
export function isValidTransition(from: RunStatus, to: RunStatus): boolean {
  // Self-transitions are always considered "valid" (no-op)
  if (from === to) {
    return true;
  }

  const allowedStates = STATE_TRANSITIONS[from];
  return allowedStates.includes(to);
}

/**
 * Validate a state transition (throws on invalid)
 *
 * @param from - Current run status
 * @param to - Desired run status
 * @param context - Optional audit context
 * @throws {InvalidTransitionError} If transition is not allowed
 *
 * @example
 * ```typescript
 * validateTransition('running', 'completed', {
 *   runId: 'run-123',
 *   userId: 'user-456',
 *   timestamp: new Date(),
 * });
 * ```
 */
export function validateTransition(
  from: RunStatus,
  to: RunStatus,
  context?: TransitionContext
): void {
  // Self-transitions are no-ops (allowed)
  if (from === to) {
    return;
  }

  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to, context);
  }
}

/**
 * Get the next valid states from the current state
 *
 * @param current - Current run status
 * @returns Array of valid next states
 *
 * @example
 * ```typescript
 * getNextValidStates('running')  // => ['completed', 'failed', 'cancelled', 'paused']
 * getNextValidStates('completed') // => []
 * ```
 */
export function getNextValidStates(current: RunStatus): RunStatus[] {
  return [...STATE_TRANSITIONS[current]];
}

/**
 * Check if a state is terminal (no outbound transitions)
 *
 * @param status - Run status to check
 * @returns true if state is terminal
 *
 * @example
 * ```typescript
 * isTerminalState('completed') // => true
 * isTerminalState('running')   // => false
 * isTerminalState('paused')    // => false
 * ```
 */
export function isTerminalState(status: RunStatus): boolean {
  return TERMINAL_STATES.has(status);
}

/**
 * Get a human-readable description of the state machine
 *
 * @returns State machine documentation as a string
 */
export function getStateMachineDescription(): string {
  const lines: string[] = [
    'Run State Machine',
    '==================',
    '',
    'Valid Transitions:',
  ];

  for (const [from, toStates] of Object.entries(STATE_TRANSITIONS)) {
    if (toStates.length === 0) {
      lines.push(`  ${from} -> (terminal)`);
    } else {
      lines.push(`  ${from} -> ${toStates.join(', ')}`);
    }
  }

  lines.push('');
  lines.push(`Terminal States: ${Array.from(TERMINAL_STATES).join(', ')}`);

  return lines.join('\n');
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Context for state transition (audit trail)
 */
export interface TransitionContext {
  /** Run ID */
  runId?: string;
  /** Who requested the transition */
  userId?: string;
  /** User-initiated or system-initiated */
  initiator?: 'user' | 'system' | 'timeout' | 'policy';
  /** When the transition was requested */
  timestamp?: Date;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Error thrown when an invalid state transition is attempted
 */
export class InvalidTransitionError extends Error {
  readonly name = 'InvalidTransitionError';
  readonly isInvalidTransition = true;

  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
    public readonly context?: TransitionContext
  ) {
    const validStates = STATE_TRANSITIONS[from];
    const validTransitions = validStates.length > 0
      ? validStates.join(', ')
      : '(none - terminal state)';

    let message = `Invalid state transition: ${from} -> ${to}. `;
    message += `Valid transitions from ${from}: ${validTransitions}`;

    if (context?.runId) {
      message += ` [runId: ${context.runId}]`;
    }
    if (context?.userId) {
      message += ` [userId: ${context.userId}]`;
    }
    if (context?.initiator) {
      message += ` [initiator: ${context.initiator}]`;
    }

    super(message);
  }

  /**
   * Get the valid transitions from the 'from' state
   */
  getValidTransitions(): RunStatus[] {
    return getNextValidStates(this.from);
  }

  /**
   * Check if the error was due to a terminal state
   */
  isTerminalStateError(): boolean {
    return isTerminalState(this.from);
  }
}

/**
 * Type guard for InvalidTransitionError
 */
export function isInvalidTransitionError(error: unknown): error is InvalidTransitionError {
  return error instanceof InvalidTransitionError ||
    (error instanceof Error && (error as InvalidTransitionError).isInvalidTransition === true);
}

// =============================================================================
// Exports
// =============================================================================

export type { RunStatus };
