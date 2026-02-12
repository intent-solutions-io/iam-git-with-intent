/**
 * Git Worktree Manager
 *
 * Manages isolated git worktrees for agent execution.
 * Each agent session gets its own worktree to prevent conflicts
 * and enable parallel execution.
 *
 * Workflow:
 * 1. Create worktree for session
 * 2. Agent makes changes in worktree
 * 3. Review/approve changes
 * 4. Merge back to target branch
 * 5. Cleanup worktree
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

/**
 * Worktree session metadata
 */
export interface WorktreeSession {
  /** Unique session ID */
  sessionId: string;
  /** Path to the worktree directory */
  worktreePath: string;
  /** Source branch the worktree was created from */
  sourceBranch: string;
  /** Working branch name in the worktree */
  workingBranch: string;
  /** Creation timestamp */
  createdAt: number;
  /** Agent type using this worktree */
  agentType: string;
  /** Current status */
  status: 'active' | 'merged' | 'abandoned' | 'error';
}

/**
 * Worktree manager options
 */
export interface WorktreeManagerOptions {
  /** Base directory for worktrees (default: .gwi/worktrees) */
  baseDir?: string;
  /** Maximum concurrent worktrees */
  maxWorktrees?: number;
  /** Auto-cleanup after this many milliseconds */
  autoCleanupMs?: number;
}

/**
 * Git Worktree Manager
 *
 * Creates and manages isolated worktrees for agent execution.
 */
export class WorktreeManager {
  private baseDir: string;
  private maxWorktrees: number;
  private autoCleanupMs: number;
  private sessions = new Map<string, WorktreeSession>();
  private repoRoot: string | null = null;

  constructor(options: WorktreeManagerOptions = {}) {
    this.baseDir = options.baseDir ?? '.gwi/worktrees';
    this.maxWorktrees = options.maxWorktrees ?? 10;
    this.autoCleanupMs = options.autoCleanupMs ?? 3600000; // 1 hour
  }

  /**
   * Initialize the manager - must be called before use
   */
  async initialize(): Promise<void> {
    // Find git repo root
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel']);
      this.repoRoot = stdout.trim();
    } catch {
      throw new Error('Not inside a git repository');
    }

    // Create base directory
    const fullBaseDir = join(this.repoRoot, this.baseDir);
    await fs.mkdir(fullBaseDir, { recursive: true });

    // Add to .gitignore if not already present
    await this.ensureGitignore();
  }

  /**
   * Ensure worktrees directory is gitignored
   */
  private async ensureGitignore(): Promise<void> {
    if (!this.repoRoot) return;

    const gitignorePath = join(this.repoRoot, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      if (!content.includes(this.baseDir)) {
        await fs.appendFile(gitignorePath, `\n# GWI Agent Worktrees\n${this.baseDir}/\n`);
      }
    } catch {
      // .gitignore doesn't exist, create it
      await fs.writeFile(gitignorePath, `# GWI Agent Worktrees\n${this.baseDir}/\n`);
    }
  }

  /**
   * Create a new worktree for an agent session
   */
  async create(options: {
    agentType: string;
    sourceBranch?: string;
    workingBranchPrefix?: string;
  }): Promise<WorktreeSession> {
    if (!this.repoRoot) {
      throw new Error('WorktreeManager not initialized');
    }

    // Check worktree limit
    const activeCount = Array.from(this.sessions.values()).filter(
      (s) => s.status === 'active'
    ).length;
    if (activeCount >= this.maxWorktrees) {
      throw new Error(`Maximum worktrees (${this.maxWorktrees}) reached`);
    }

    const sessionId = randomUUID();
    const sourceBranch = options.sourceBranch ?? 'HEAD';
    const branchPrefix = options.workingBranchPrefix ?? 'gwi-agent';
    const workingBranch = `${branchPrefix}/${options.agentType}/${sessionId.slice(0, 8)}`;
    const worktreePath = join(this.repoRoot, this.baseDir, sessionId);

    try {
      // Create the worktree with a new branch
      await execFileAsync(
        'git',
        ['worktree', 'add', '-b', workingBranch, worktreePath, sourceBranch],
        { cwd: this.repoRoot }
      );

      const session: WorktreeSession = {
        sessionId,
        worktreePath,
        sourceBranch,
        workingBranch,
        createdAt: Date.now(),
        agentType: options.agentType,
        status: 'active',
      };

      this.sessions.set(sessionId, session);

      // Schedule auto-cleanup
      if (this.autoCleanupMs > 0) {
        setTimeout(() => {
          this.cleanup(sessionId).catch(() => {});
        }, this.autoCleanupMs);
      }

      return session;
    } catch (err) {
      throw new Error(
        `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): WorktreeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions
   */
  listSessions(): WorktreeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get the diff of changes in a worktree
   */
  async getDiff(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd: session.worktreePath });
      return stdout;
    } catch (err) {
      throw new Error(
        `Failed to get diff: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Commit changes in a worktree
   */
  async commit(
    sessionId: string,
    message: string,
    options: { addAll?: boolean } = {}
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      if (options.addAll) {
        await execFileAsync('git', ['add', '-A'], { cwd: session.worktreePath });
      }

      await execFileAsync('git', ['commit', '-m', message], {
        cwd: session.worktreePath,
      });

      // Get the commit hash
      const { stdout: hash } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: session.worktreePath,
      });

      return hash.trim();
    } catch (err) {
      throw new Error(
        `Failed to commit: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Merge worktree changes back to target branch
   */
  async merge(
    sessionId: string,
    targetBranch: string,
    options: { squash?: boolean; message?: string } = {}
  ): Promise<{ merged: boolean; hash?: string; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || !this.repoRoot) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      // Checkout target branch in main repo
      await execFileAsync('git', ['checkout', targetBranch], { cwd: this.repoRoot });

      // Merge the working branch
      if (options.squash) {
        await execFileAsync('git', ['merge', '--squash', session.workingBranch], {
          cwd: this.repoRoot,
        });
      } else {
        const mergeMessage = options.message ?? `Merge ${session.workingBranch}`;
        await execFileAsync('git', ['merge', session.workingBranch, '-m', mergeMessage], {
          cwd: this.repoRoot,
        });
      }

      // If squash, we need to commit
      if (options.squash) {
        const commitMessage = options.message ?? `Agent changes from ${session.agentType}`;
        await execFileAsync('git', ['commit', '-m', commitMessage], {
          cwd: this.repoRoot,
        });
      }

      // Get the merge commit hash
      const { stdout: hash } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: this.repoRoot,
      });

      // Update session status
      session.status = 'merged';

      return { merged: true, hash: hash.trim() };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      session.status = 'error';
      return { merged: false, error };
    }
  }

  /**
   * Cleanup a worktree session
   */
  async cleanup(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !this.repoRoot) {
      return;
    }

    try {
      // Remove the worktree
      await execFileAsync('git', ['worktree', 'remove', '--force', session.worktreePath], {
        cwd: this.repoRoot,
      });

      // Delete the working branch if not merged
      if (session.status !== 'merged') {
        await execFileAsync('git', ['branch', '-D', session.workingBranch], {
          cwd: this.repoRoot,
        }).catch(() => {}); // Ignore if branch doesn't exist
      }

      session.status = 'abandoned';
    } catch {
      // Force remove directory if worktree command fails
      await fs.rm(session.worktreePath, { recursive: true, force: true }).catch(() => {});
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup all worktrees
   */
  async cleanupAll(): Promise<number> {
    let cleaned = 0;
    for (const sessionId of this.sessions.keys()) {
      try {
        await this.cleanup(sessionId);
        cleaned++;
      } catch {
        // Continue with other cleanups
      }
    }
    return cleaned;
  }

  /**
   * Prune stale worktrees
   */
  async prune(): Promise<void> {
    if (!this.repoRoot) return;

    try {
      await execFileAsync('git', ['worktree', 'prune'], { cwd: this.repoRoot });
    } catch {
      // Ignore prune errors
    }
  }
}

/**
 * Create a worktree manager instance
 */
export function createWorktreeManager(
  options?: WorktreeManagerOptions
): WorktreeManager {
  return new WorktreeManager(options);
}
