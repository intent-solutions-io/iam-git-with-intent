/**
 * Tests for Run State Machine (A2.1)
 *
 * Tests cover:
 * - Valid state transitions
 * - Invalid state transitions
 * - Terminal state detection
 * - Error context and audit information
 *
 * @module @gwi/engine/run/__tests__/state-machine
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  validateTransition,
  getNextValidStates,
  isTerminalState,
  getStateMachineDescription,
  InvalidTransitionError,
  isInvalidTransitionError,
  type TransitionContext,
} from '../state-machine.js';

describe('Run State Machine', () => {
  describe('isValidTransition', () => {
    describe('from pending', () => {
      it('should allow pending -> running', () => {
        expect(isValidTransition('pending', 'running')).toBe(true);
      });

      it('should allow pending -> cancelled', () => {
        expect(isValidTransition('pending', 'cancelled')).toBe(true);
      });

      it('should reject pending -> completed', () => {
        expect(isValidTransition('pending', 'completed')).toBe(false);
      });
    });

    describe('from running', () => {
      it('should allow running -> completed', () => {
        expect(isValidTransition('running', 'completed')).toBe(true);
      });

      it('should allow running -> failed', () => {
        expect(isValidTransition('running', 'failed')).toBe(true);
      });

      it('should allow running -> cancelled', () => {
        expect(isValidTransition('running', 'cancelled')).toBe(true);
      });

      it('should reject running -> pending', () => {
        expect(isValidTransition('running', 'pending')).toBe(false);
      });
    });

    describe('from terminal states', () => {
      it('should reject completed -> any state', () => {
        expect(isValidTransition('completed', 'running')).toBe(false);
        expect(isValidTransition('completed', 'pending')).toBe(false);
        expect(isValidTransition('completed', 'failed')).toBe(false);
        expect(isValidTransition('completed', 'cancelled')).toBe(false);
      });

      it('should reject failed -> any state', () => {
        expect(isValidTransition('failed', 'running')).toBe(false);
        expect(isValidTransition('failed', 'pending')).toBe(false);
        expect(isValidTransition('failed', 'completed')).toBe(false);
        expect(isValidTransition('failed', 'cancelled')).toBe(false);
      });

      it('should reject cancelled -> any state', () => {
        expect(isValidTransition('cancelled', 'running')).toBe(false);
        expect(isValidTransition('cancelled', 'pending')).toBe(false);
        expect(isValidTransition('cancelled', 'completed')).toBe(false);
        expect(isValidTransition('cancelled', 'failed')).toBe(false);
      });
    });

    describe('self-transitions', () => {
      it('should allow pending -> pending (no-op)', () => {
        expect(isValidTransition('pending', 'pending')).toBe(true);
      });

      it('should allow running -> running (no-op)', () => {
        expect(isValidTransition('running', 'running')).toBe(true);
      });

      it('should allow completed -> completed (no-op)', () => {
        expect(isValidTransition('completed', 'completed')).toBe(true);
      });

      it('should allow failed -> failed (no-op)', () => {
        expect(isValidTransition('failed', 'failed')).toBe(true);
      });

      it('should allow cancelled -> cancelled (no-op)', () => {
        expect(isValidTransition('cancelled', 'cancelled')).toBe(true);
      });
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => validateTransition('pending', 'running')).not.toThrow();
      expect(() => validateTransition('running', 'completed')).not.toThrow();
      expect(() => validateTransition('running', 'cancelled')).not.toThrow();
      expect(() => validateTransition('pending', 'cancelled')).not.toThrow();
    });

    it('should not throw for self-transitions', () => {
      expect(() => validateTransition('pending', 'pending')).not.toThrow();
      expect(() => validateTransition('running', 'running')).not.toThrow();
      expect(() => validateTransition('completed', 'completed')).not.toThrow();
    });

    it('should throw InvalidTransitionError for invalid transitions', () => {
      expect(() => validateTransition('pending', 'completed')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('completed', 'running')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('failed', 'running')).toThrow(InvalidTransitionError);
    });

    it('should include context in error when provided', () => {
      const context: TransitionContext = {
        runId: 'run-123',
        userId: 'user-456',
        initiator: 'user',
        timestamp: new Date(),
      };

      try {
        validateTransition('completed', 'running', context);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        const err = error as InvalidTransitionError;
        expect(err.context).toEqual(context);
        expect(err.message).toContain('run-123');
        expect(err.message).toContain('user-456');
        expect(err.message).toContain('user');
      }
    });

    it('should include valid transitions in error message', () => {
      try {
        validateTransition('pending', 'completed');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        const err = error as InvalidTransitionError;
        expect(err.message).toContain('running');
        expect(err.message).toContain('cancelled');
      }
    });

    it('should indicate terminal state in error message', () => {
      try {
        validateTransition('completed', 'running');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        const err = error as InvalidTransitionError;
        expect(err.message).toContain('terminal');
      }
    });
  });

  describe('getNextValidStates', () => {
    it('should return correct next states for pending', () => {
      const nextStates = getNextValidStates('pending');
      expect(nextStates).toContain('running');
      expect(nextStates).toContain('cancelled');
      expect(nextStates).toContain('failed');
      expect(nextStates).toHaveLength(3);
    });

    it('should return correct next states for running', () => {
      const nextStates = getNextValidStates('running');
      expect(nextStates).toContain('completed');
      expect(nextStates).toContain('failed');
      expect(nextStates).toContain('cancelled');
      expect(nextStates).toHaveLength(3);
    });

    it('should return empty array for terminal states', () => {
      expect(getNextValidStates('completed')).toEqual([]);
      expect(getNextValidStates('failed')).toEqual([]);
      expect(getNextValidStates('cancelled')).toEqual([]);
    });

    it('should return a new array each time', () => {
      const first = getNextValidStates('running');
      const second = getNextValidStates('running');
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe('isTerminalState', () => {
    it('should identify completed as terminal', () => {
      expect(isTerminalState('completed')).toBe(true);
    });

    it('should identify failed as terminal', () => {
      expect(isTerminalState('failed')).toBe(true);
    });

    it('should identify cancelled as terminal', () => {
      expect(isTerminalState('cancelled')).toBe(true);
    });

    it('should identify pending as non-terminal', () => {
      expect(isTerminalState('pending')).toBe(false);
    });

    it('should identify running as non-terminal', () => {
      expect(isTerminalState('running')).toBe(false);
    });

  });

  describe('getStateMachineDescription', () => {
    it('should return a description string', () => {
      const description = getStateMachineDescription();
      expect(description).toBeTruthy();
      expect(typeof description).toBe('string');
    });

    it('should include all states', () => {
      const description = getStateMachineDescription();
      expect(description).toContain('pending');
      expect(description).toContain('running');
      expect(description).toContain('completed');
      expect(description).toContain('failed');
      expect(description).toContain('cancelled');
    });

    it('should indicate terminal states', () => {
      const description = getStateMachineDescription();
      expect(description).toContain('terminal');
      expect(description).toContain('Terminal States:');
    });
  });

  describe('InvalidTransitionError', () => {
    it('should include from and to states', () => {
      const error = new InvalidTransitionError('completed', 'running');
      expect(error.from).toBe('completed');
      expect(error.to).toBe('running');
    });

    it('should include context when provided', () => {
      const context: TransitionContext = {
        runId: 'run-789',
        userId: 'user-abc',
        initiator: 'system',
        timestamp: new Date(),
        metadata: { reason: 'test' },
      };
      const error = new InvalidTransitionError('failed', 'running', context);
      expect(error.context).toEqual(context);
    });

    it('should have correct name', () => {
      const error = new InvalidTransitionError('completed', 'running');
      expect(error.name).toBe('InvalidTransitionError');
    });

    it('should have isInvalidTransition flag', () => {
      const error = new InvalidTransitionError('completed', 'running');
      expect(error.isInvalidTransition).toBe(true);
    });

    it('should provide getValidTransitions method', () => {
      const error = new InvalidTransitionError('running', 'pending');
      const validTransitions = error.getValidTransitions();
      expect(validTransitions).toContain('completed');
      expect(validTransitions).toContain('failed');
      expect(validTransitions).toContain('cancelled');
    });

    it('should provide isTerminalStateError method', () => {
      const terminalError = new InvalidTransitionError('completed', 'running');
      expect(terminalError.isTerminalStateError()).toBe(true);

      const nonTerminalError = new InvalidTransitionError('running', 'pending');
      expect(nonTerminalError.isTerminalStateError()).toBe(false);
    });

    it('should include valid transitions in message', () => {
      const error = new InvalidTransitionError('pending', 'completed');
      expect(error.message).toContain('pending');
      expect(error.message).toContain('completed');
      expect(error.message).toContain('running');
      expect(error.message).toContain('cancelled');
    });

    it('should indicate terminal state in message when applicable', () => {
      const error = new InvalidTransitionError('completed', 'running');
      expect(error.message).toContain('terminal');
    });
  });

  describe('isInvalidTransitionError', () => {
    it('should identify InvalidTransitionError', () => {
      const error = new InvalidTransitionError('completed', 'running');
      expect(isInvalidTransitionError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new Error('Regular error');
      expect(isInvalidTransitionError(error)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isInvalidTransitionError('string')).toBe(false);
      expect(isInvalidTransitionError(null)).toBe(false);
      expect(isInvalidTransitionError(undefined)).toBe(false);
      expect(isInvalidTransitionError(123)).toBe(false);
    });
  });

  describe('Integration: Typical Run Lifecycle', () => {
    it('should support happy path: pending -> running -> completed', () => {
      // Start in pending
      expect(isValidTransition('pending', 'running')).toBe(true);
      validateTransition('pending', 'running');

      // Move to running
      expect(isValidTransition('running', 'completed')).toBe(true);
      validateTransition('running', 'completed');

      // Completed is terminal
      expect(isTerminalState('completed')).toBe(true);
      expect(getNextValidStates('completed')).toEqual([]);
    });

    it('should support failure path: pending -> running -> failed', () => {
      // Start in pending
      expect(isValidTransition('pending', 'running')).toBe(true);
      validateTransition('pending', 'running');

      // Move to running
      expect(isValidTransition('running', 'failed')).toBe(true);
      validateTransition('running', 'failed');

      // Failed is terminal
      expect(isTerminalState('failed')).toBe(true);
      expect(getNextValidStates('failed')).toEqual([]);
    });

    it('should support cancellation from pending', () => {
      expect(isValidTransition('pending', 'cancelled')).toBe(true);
      validateTransition('pending', 'cancelled');

      // Cancelled is terminal
      expect(isTerminalState('cancelled')).toBe(true);
      expect(getNextValidStates('cancelled')).toEqual([]);
    });

    it('should support cancellation from running', () => {
      expect(isValidTransition('pending', 'running')).toBe(true);
      expect(isValidTransition('running', 'cancelled')).toBe(true);
      validateTransition('running', 'cancelled');

      // Cancelled is terminal
      expect(isTerminalState('cancelled')).toBe(true);
    });

    it('should support early failure: pending -> failed', () => {
      // Start in pending and immediately fail (e.g., invalid input)
      expect(isValidTransition('pending', 'failed')).toBe(true);
      validateTransition('pending', 'failed');

      // Failed is terminal
      expect(isTerminalState('failed')).toBe(true);
    });

    it('should reject restart from terminal state', () => {
      expect(() => validateTransition('completed', 'pending')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('completed', 'running')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('failed', 'pending')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('failed', 'running')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('cancelled', 'pending')).toThrow(InvalidTransitionError);
      expect(() => validateTransition('cancelled', 'running')).toThrow(InvalidTransitionError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state changes', () => {
      // Simulate rapid valid state changes
      validateTransition('pending', 'running');
      validateTransition('running', 'completed');

      // Terminal state should block further changes
      expect(() => validateTransition('completed', 'running')).toThrow(InvalidTransitionError);
    });

    it('should provide detailed error context for debugging', () => {
      const context: TransitionContext = {
        runId: 'run-debug-001',
        userId: 'debug-user',
        initiator: 'system',
        timestamp: new Date('2025-12-19T10:00:00Z'),
        metadata: {
          reason: 'automated test',
          attemptNumber: 1,
        },
      };

      try {
        validateTransition('completed', 'running', context);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        const err = error as InvalidTransitionError;

        // Verify error contains all context
        expect(err.from).toBe('completed');
        expect(err.to).toBe('running');
        expect(err.context?.runId).toBe('run-debug-001');
        expect(err.context?.userId).toBe('debug-user');
        expect(err.context?.initiator).toBe('system');
        expect(err.context?.metadata).toEqual({
          reason: 'automated test',
          attemptNumber: 1,
        });

        // Verify error message includes key context
        expect(err.message).toContain('run-debug-001');
        expect(err.message).toContain('debug-user');
        expect(err.message).toContain('system');
      }
    });
  });
});
