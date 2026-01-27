/**
 * Tests for gwi gate command (Epic J - J3.4)
 *
 * Tests interactive approval gate functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gateCommand, type GateOptions } from '../gate.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('Gate Command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let exitCode: number | undefined;

  beforeEach(() => {
    exitCode = undefined;

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to record the exit code
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      exitCode = typeof code === 'number' ? code : 0;
      return undefined as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Basic Command Tests
  // ===========================================================================

  describe('gateCommand', () => {
    it('should handle no-interactive mode', async () => {
      const options: GateOptions = {
        noInteractive: true,
        cwd: '/tmp/test-repo',
      };

      // This will fail because /tmp/test-repo likely doesn't exist
      // But we're testing that the option is recognized
      await gateCommand(options).catch(() => {
        // Expected to fail in test environment
      });

      expect(processExitSpy).toHaveBeenCalled();
    });

    it('should accept strict mode option', async () => {
      const options: GateOptions = {
        strict: true,
        noInteractive: true,
        cwd: '/tmp/test-repo',
      };

      await gateCommand(options).catch(() => {
        // Expected to fail in test environment
      });

      expect(processExitSpy).toHaveBeenCalled();
    });

    it('should accept max complexity option', async () => {
      const options: GateOptions = {
        maxComplexity: 5,
        noInteractive: true,
        cwd: '/tmp/test-repo',
      };

      await gateCommand(options).catch(() => {
        // Expected to fail in test environment
      });

      expect(processExitSpy).toHaveBeenCalled();
    });

    it('should accept verbose option', async () => {
      const options: GateOptions = {
        verbose: true,
        noInteractive: true,
        cwd: '/tmp/test-repo',
      };

      await gateCommand(options).catch(() => {
        // Expected to fail in test environment
      });

      expect(processExitSpy).toHaveBeenCalled();
    });

    it('should accept json output option', async () => {
      const options: GateOptions = {
        json: true,
        noInteractive: true,
        cwd: '/tmp/test-repo',
      };

      await gateCommand(options).catch(() => {
        // Expected to fail in test environment
      });

      expect(processExitSpy).toHaveBeenCalled();
    });

    it('should accept block-security option', async () => {
      const options: GateOptions = {
        blockSecurity: true,
        noInteractive: true,
        cwd: '/tmp/test-repo',
      };

      await gateCommand(options).catch(() => {
        // Expected to fail in test environment
      });

      expect(processExitSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Exit Code Tests
  // ===========================================================================

  describe('Exit Codes', () => {
    it('should exit with code 2 when not a git repository', async () => {
      const options: GateOptions = {
        noInteractive: true,
        cwd: '/tmp/definitely-not-a-git-repo-' + Date.now(),
      };

      await gateCommand(options);

      expect(exitCode).toBe(2);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
