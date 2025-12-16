/**
 * Beads Integration for Git With Intent
 *
 * Wraps the bd CLI to provide programmatic access to the Beads issue tracker.
 * ALL task tracking must go through Beads - no markdown TODOs.
 *
 * @see https://github.com/steveyegge/beads
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Issue types supported by Beads
 */
export type IssueType = 'bug' | 'task' | 'epic' | 'feature' | 'chore';

/**
 * Issue status values
 */
export type IssueStatus = 'open' | 'in_progress' | 'blocked' | 'paused' | 'closed';

/**
 * Issue priority (0 = lowest, 2 = highest)
 */
export type IssuePriority = 0 | 1 | 2;

/**
 * Dependency types
 */
export type DependencyType = 'blocks' | 'related' | 'parent-child' | 'discovered-from';

/**
 * Beads issue structure
 */
export interface BeadsIssue {
  id: string; // e.g., "bd-a1b2"
  title: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  body?: string;
  labels?: string[];
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  title: string;
  type?: IssueType;
  priority?: IssuePriority;
  description?: string;
  labels?: string[];
  assignee?: string;
}

/**
 * Options for updating an issue
 */
export interface UpdateIssueOptions {
  status?: IssueStatus;
  title?: string;
  priority?: IssuePriority;
  labels?: string[];
  assignee?: string;
}

/**
 * Beads client for programmatic access to the issue tracker
 */
export class BeadsClient {
  private readonly cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Check if Beads is initialized in the current directory
   */
  async isInitialized(): Promise<boolean> {
    try {
      await execAsync('bd info --json', { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize Beads in the current directory (quiet mode for agents)
   */
  async init(): Promise<void> {
    try {
      await execAsync('bd init --quiet', { cwd: this.cwd });
    } catch (error) {
      // May already be initialized
      if (await this.isInitialized()) {
        return;
      }
      throw error;
    }
  }

  /**
   * Get issues that are ready to work on (no open blockers)
   */
  async getReadyIssues(): Promise<BeadsIssue[]> {
    try {
      const { stdout } = await execAsync('bd ready --json', { cwd: this.cwd });
      return JSON.parse(stdout);
    } catch (error) {
      // Empty result or bd not initialized
      return [];
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(options: CreateIssueOptions): Promise<BeadsIssue> {
    const args: string[] = ['bd', 'create', `"${options.title}"`];

    if (options.type) {
      args.push('-t', options.type);
    }

    if (options.priority !== undefined) {
      args.push('-p', String(options.priority));
    }

    if (options.description) {
      args.push('--description', `"${options.description}"`);
    }

    args.push('--json');

    const { stdout } = await execAsync(args.join(' '), { cwd: this.cwd });
    return JSON.parse(stdout);
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueId: string, options: UpdateIssueOptions): Promise<BeadsIssue> {
    const args: string[] = ['bd', 'update', issueId];

    if (options.status) {
      args.push('--status', options.status);
    }

    if (options.title) {
      args.push('--title', `"${options.title}"`);
    }

    if (options.priority !== undefined) {
      args.push('--priority', String(options.priority));
    }

    args.push('--json');

    const { stdout } = await execAsync(args.join(' '), { cwd: this.cwd });
    return JSON.parse(stdout);
  }

  /**
   * Close an issue with a reason
   */
  async closeIssue(issueId: string, reason: string): Promise<BeadsIssue> {
    const { stdout } = await execAsync(
      `bd close ${issueId} --reason "${reason}" --json`,
      { cwd: this.cwd }
    );
    return JSON.parse(stdout);
  }

  /**
   * Get a specific issue by ID
   */
  async getIssue(issueId: string): Promise<BeadsIssue | null> {
    try {
      const { stdout } = await execAsync(`bd show ${issueId} --json`, { cwd: this.cwd });
      return JSON.parse(stdout);
    } catch {
      return null;
    }
  }

  /**
   * List all issues
   */
  async listIssues(options?: { status?: IssueStatus; type?: IssueType }): Promise<BeadsIssue[]> {
    const args: string[] = ['bd', 'list'];

    if (options?.status) {
      args.push('--status', options.status);
    }

    if (options?.type) {
      args.push('--type', options.type);
    }

    args.push('--json');

    try {
      const { stdout } = await execAsync(args.join(' '), { cwd: this.cwd });
      return JSON.parse(stdout);
    } catch {
      return [];
    }
  }

  /**
   * Add a dependency between issues
   */
  async addDependency(
    issueId: string,
    dependsOnId: string,
    type: DependencyType
  ): Promise<void> {
    await execAsync(`bd dep add ${issueId} ${dependsOnId} --type ${type}`, {
      cwd: this.cwd,
    });
  }

  /**
   * Sync local state with git (manual sync)
   */
  async sync(): Promise<void> {
    await execAsync('bd sync', { cwd: this.cwd });
  }

  /**
   * Run health check
   */
  async doctor(): Promise<{ healthy: boolean; issues: string[] }> {
    try {
      await execAsync('bd doctor', { cwd: this.cwd });
      return { healthy: true, issues: [] };
    } catch (error) {
      return {
        healthy: false,
        issues: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

/**
 * Create a Beads client instance
 */
export function createBeadsClient(cwd?: string): BeadsClient {
  return new BeadsClient(cwd);
}

/**
 * Helper to format a task ID for commit messages
 */
export function formatTaskIdForCommit(issueId: string): string {
  return `[Task: ${issueId}]`;
}

/**
 * Extract task ID from commit message
 */
export function extractTaskIdFromCommit(commitMessage: string): string | null {
  const match = commitMessage.match(/\[Task:\s*(bd-[a-z0-9]+)\]/i);
  return match ? match[1] : null;
}

/**
 * Check if Beads CLI is available
 */
export function isBeadsAvailable(): boolean {
  try {
    execSync('bd --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
