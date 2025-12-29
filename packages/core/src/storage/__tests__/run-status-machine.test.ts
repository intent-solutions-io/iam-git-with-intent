/**
 * Run Status State Machine Tests
 *
 * Tests the state machine validation for RunStatus transitions.
 */

import { describe, it, expect } from 'vitest';
import {
  RUN_STATUS_TRANSITIONS,
  InvalidRunStatusTransitionError,
  isValidRunStatusTransition,
  validateRunStatusTransition,
  isTerminalRunStatus,
  isRunInProgress,
  isRunFinished,
} from '../run-status-machine.js';

describe('Run Status State Machine', () => {
  describe('RUN_STATUS_TRANSITIONS', () => {
    it('should define transitions from pending', () => {
      expect(RUN_STATUS_TRANSITIONS.pending).toEqual(['running', 'failed', 'cancelled']);
    });

    it('should define transitions from running (C3)', () => {
      expect(RUN_STATUS_TRANSITIONS.running).toEqual([
        'completed',
        'failed',
        'cancelled',
        'awaiting_approval',
        'waiting_external',
      ]);
    });

    it('should have no transitions from terminal states', () => {
      expect(RUN_STATUS_TRANSITIONS.completed).toEqual([]);
      expect(RUN_STATUS_TRANSITIONS.failed).toEqual([]);
      expect(RUN_STATUS_TRANSITIONS.cancelled).toEqual([]);
    });

    it('should define transitions from awaiting_approval (C3)', () => {
      expect(RUN_STATUS_TRANSITIONS.awaiting_approval).toEqual([
        'running',
        'completed',
        'failed',
        'cancelled',
      ]);
    });

    it('should define transitions from waiting_external (C3)', () => {
      expect(RUN_STATUS_TRANSITIONS.waiting_external).toEqual([
        'running',
        'completed',
        'failed',
        'cancelled',
      ]);
    });
  });

  describe('isValidRunStatusTransition', () => {
    it('should return true for valid transitions', () => {
      expect(isValidRunStatusTransition('pending', 'running')).toBe(true);
      expect(isValidRunStatusTransition('pending', 'failed')).toBe(true);
      expect(isValidRunStatusTransition('pending', 'cancelled')).toBe(true);
      expect(isValidRunStatusTransition('running', 'completed')).toBe(true);
      expect(isValidRunStatusTransition('running', 'failed')).toBe(true);
      expect(isValidRunStatusTransition('running', 'cancelled')).toBe(true);
      // C3 approval/wait state transitions
      expect(isValidRunStatusTransition('running', 'awaiting_approval')).toBe(true);
      expect(isValidRunStatusTransition('running', 'waiting_external')).toBe(true);
      expect(isValidRunStatusTransition('awaiting_approval', 'running')).toBe(true);
      expect(isValidRunStatusTransition('waiting_external', 'running')).toBe(true);
    });

    it('should return true for C3 approval transitions (flexible)', () => {
      expect(isValidRunStatusTransition('running', 'awaiting_approval')).toBe(true);
      expect(isValidRunStatusTransition('awaiting_approval', 'running')).toBe(true);
      expect(isValidRunStatusTransition('awaiting_approval', 'cancelled')).toBe(true);
      expect(isValidRunStatusTransition('awaiting_approval', 'completed')).toBe(true);
      expect(isValidRunStatusTransition('awaiting_approval', 'failed')).toBe(true);
    });

    it('should return true for C3 external event transitions (flexible)', () => {
      expect(isValidRunStatusTransition('running', 'waiting_external')).toBe(true);
      expect(isValidRunStatusTransition('waiting_external', 'running')).toBe(true);
      expect(isValidRunStatusTransition('waiting_external', 'failed')).toBe(true);
      expect(isValidRunStatusTransition('waiting_external', 'completed')).toBe(true);
      expect(isValidRunStatusTransition('waiting_external', 'cancelled')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(isValidRunStatusTransition('pending', 'completed')).toBe(false);
      expect(isValidRunStatusTransition('completed', 'running')).toBe(false);
      expect(isValidRunStatusTransition('failed', 'pending')).toBe(false);
      expect(isValidRunStatusTransition('cancelled', 'running')).toBe(false);
    });

    it('should return false for invalid C3 transitions', () => {
      // Only pending is invalid from waiting states
      expect(isValidRunStatusTransition('awaiting_approval', 'pending')).toBe(false);
      expect(isValidRunStatusTransition('waiting_external', 'pending')).toBe(false);
      // Cannot transition between waiting states
      expect(isValidRunStatusTransition('awaiting_approval', 'waiting_external')).toBe(false);
      expect(isValidRunStatusTransition('waiting_external', 'awaiting_approval')).toBe(false);
    });

    it('should return false for self-transitions', () => {
      expect(isValidRunStatusTransition('pending', 'pending')).toBe(false);
      expect(isValidRunStatusTransition('running', 'running')).toBe(false);
      expect(isValidRunStatusTransition('completed', 'completed')).toBe(false);
      expect(isValidRunStatusTransition('awaiting_approval', 'awaiting_approval')).toBe(false);
      expect(isValidRunStatusTransition('waiting_external', 'waiting_external')).toBe(false);
    });
  });

  describe('validateRunStatusTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => validateRunStatusTransition('pending', 'running', 'test-run')).not.toThrow();
      expect(() => validateRunStatusTransition('running', 'completed', 'test-run')).not.toThrow();
      expect(() => validateRunStatusTransition('running', 'failed', 'test-run')).not.toThrow();
    });

    it('should throw InvalidRunStatusTransitionError for invalid transitions', () => {
      expect(() => validateRunStatusTransition('pending', 'completed', 'test-run'))
        .toThrow(InvalidRunStatusTransitionError);
      expect(() => validateRunStatusTransition('completed', 'running', 'test-run'))
        .toThrow(InvalidRunStatusTransitionError);
    });

    it('should include run ID in error message', () => {
      try {
        validateRunStatusTransition('pending', 'completed', 'my-test-run-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidRunStatusTransitionError);
        expect((error as InvalidRunStatusTransitionError).runId).toBe('my-test-run-123');
        expect((error as InvalidRunStatusTransitionError).message).toContain('my-test-run-123');
      }
    });

    it('should include valid transitions in error message', () => {
      try {
        validateRunStatusTransition('pending', 'completed', 'test-run');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidRunStatusTransitionError);
        expect((error as InvalidRunStatusTransitionError).message).toContain('running');
        expect((error as InvalidRunStatusTransitionError).message).toContain('failed');
        expect((error as InvalidRunStatusTransitionError).message).toContain('cancelled');
      }
    });
  });

  describe('isTerminalRunStatus', () => {
    it('should return true for terminal states', () => {
      expect(isTerminalRunStatus('completed')).toBe(true);
      expect(isTerminalRunStatus('failed')).toBe(true);
      expect(isTerminalRunStatus('cancelled')).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalRunStatus('pending')).toBe(false);
      expect(isTerminalRunStatus('running')).toBe(false);
    });

    it('should return false for C3 waiting states (non-terminal)', () => {
      expect(isTerminalRunStatus('awaiting_approval')).toBe(false);
      expect(isTerminalRunStatus('waiting_external')).toBe(false);
    });
  });

  describe('isRunInProgress', () => {
    it('should return true for in-progress states', () => {
      expect(isRunInProgress('pending')).toBe(true);
      expect(isRunInProgress('running')).toBe(true);
    });

    it('should return true for C3 waiting states (paused but in-progress)', () => {
      expect(isRunInProgress('awaiting_approval')).toBe(true);
      expect(isRunInProgress('waiting_external')).toBe(true);
    });

    it('should return false for finished states', () => {
      expect(isRunInProgress('completed')).toBe(false);
      expect(isRunInProgress('failed')).toBe(false);
      expect(isRunInProgress('cancelled')).toBe(false);
    });
  });

  describe('isRunFinished', () => {
    it('should return true for finished states', () => {
      expect(isRunFinished('completed')).toBe(true);
      expect(isRunFinished('failed')).toBe(true);
      expect(isRunFinished('cancelled')).toBe(true);
    });

    it('should return false for in-progress states', () => {
      expect(isRunFinished('pending')).toBe(false);
      expect(isRunFinished('running')).toBe(false);
    });

    it('should return false for C3 waiting states (paused, not finished)', () => {
      expect(isRunFinished('awaiting_approval')).toBe(false);
      expect(isRunFinished('waiting_external')).toBe(false);
    });
  });
});
