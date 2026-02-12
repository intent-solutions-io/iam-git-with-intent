/**
 * Worktree Manager Security Tests
 *
 * Verifies that WorktreeManager uses execFile (argument arrays)
 * instead of exec (shell string interpolation) to prevent
 * command injection via branch names, paths, or commit messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process to verify execFile is used (not exec)
const mockExecFile = vi.fn().mockImplementation((_cmd, _args, _opts, cb) => {
  if (typeof _opts === 'function') {
    cb = _opts;
  }
  return { stdout: '/fake/repo\n', stderr: '' };
});

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: any, cb?: any) => {
    const callback = typeof _opts === 'function' ? _opts : cb;
    if (_args.includes('rev-parse') && _args.includes('--show-toplevel')) {
      callback(null, { stdout: '/fake/repo\n', stderr: '' });
    } else if (_args.includes('rev-parse') && _args.includes('HEAD')) {
      callback(null, { stdout: 'abc123\n', stderr: '' });
    } else {
      callback(null, { stdout: '', stderr: '' });
    }
  }),
  // exec should NOT be imported by worktree-manager
  exec: vi.fn(() => {
    throw new Error('exec should not be used - use execFile for injection safety');
  }),
}));

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    appendFile: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('WorktreeManager Shell Injection Safety', () => {
  it('imports execFile, not exec', async () => {
    // Dynamically import to trigger the module-level imports
    const childProcess = await import('node:child_process');

    // Import worktree-manager - it should use execFile
    const { WorktreeManager } = await import('../worktree-manager.js');
    const manager = new WorktreeManager();
    await manager.initialize();

    // execFile should have been called (for rev-parse --show-toplevel)
    expect(childProcess.execFile).toHaveBeenCalled();
  });

  it('uses argument arrays for git commands (not string interpolation)', async () => {
    const childProcess = await import('node:child_process');
    const { WorktreeManager } = await import('../worktree-manager.js');
    const manager = new WorktreeManager();
    await manager.initialize();

    // All calls should use execFile with separate arguments
    const calls = (childProcess.execFile as any).mock.calls;
    for (const call of calls) {
      // First arg is always 'git', second is an array of string args
      expect(call[0]).toBe('git');
      expect(Array.isArray(call[1])).toBe(true);
      // No argument should contain the full command as a string
      for (const arg of call[1]) {
        expect(typeof arg).toBe('string');
      }
    }
  });
});
