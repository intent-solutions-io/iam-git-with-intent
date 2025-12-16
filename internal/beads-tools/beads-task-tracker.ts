/**
 * Beads Task Tracker Implementation
 *
 * INTERNAL USE ONLY - This adapter is for Intent Solutions' internal development.
 * External users of Git With Intent do not need this.
 *
 * Implements a TaskTracker interface using Beads for task/issue management.
 *
 * @internal
 */

// Beads types (from @gwi/core when available)
type IssueType = 'bug' | 'task' | 'epic' | 'feature' | 'chore';
type IssueStatus = 'open' | 'in_progress' | 'blocked' | 'paused' | 'closed';
type IssuePriority = 0 | 1 | 2;

interface BeadsIssue {
  id: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface CreateTaskOptions {
  title: string;
  type: IssueType;
  priority?: IssuePriority;
  description?: string;
}

interface UpdateTaskOptions {
  title?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  description?: string;
}

interface BeadsClient {
  isInitialized(): Promise<boolean>;
  createIssue(options: CreateTaskOptions): Promise<BeadsIssue>;
  getIssue(id: string): Promise<BeadsIssue | null>;
  updateIssue(id: string, options: UpdateTaskOptions): Promise<BeadsIssue>;
  getReadyIssues(): Promise<BeadsIssue[]>;
  closeIssue(id: string): Promise<void>;
}

/**
 * TaskTracker interface for abstracting task management
 * This allows switching between Beads (internal) and other backends
 */
export interface TaskTracker {
  createTask(options: CreateTaskOptions): Promise<{ id: string; title: string }>;
  getTask(id: string): Promise<{ id: string; title: string; status: string } | null>;
  updateTask(id: string, options: UpdateTaskOptions): Promise<void>;
  completeTask(id: string): Promise<void>;
  listReadyTasks(): Promise<Array<{ id: string; title: string; priority: number }>>;
  isAvailable(): Promise<boolean>;
}

/**
 * Beads-backed implementation of TaskTracker
 *
 * @internal - For Intent Solutions internal use only
 */
export class BeadsTaskTracker implements TaskTracker {
  private beadsClient: BeadsClient | null = null;
  private initialized = false;

  /**
   * Initialize Beads connection
   * @internal
   */
  private async ensureConnection(): Promise<BeadsClient> {
    if (this.beadsClient) {
      return this.beadsClient;
    }

    // Dynamic import to avoid hard dependency in runtime
    try {
      const { createBeadsClient } = await import('../../packages/core/src/beads/index.js');
      this.beadsClient = createBeadsClient();

      if (!(await this.beadsClient.isInitialized())) {
        throw new Error('Beads not initialized. Run: bd init --quiet');
      }

      this.initialized = true;
      return this.beadsClient;
    } catch (error) {
      throw new Error(
        `Beads initialization failed. This is an internal tool - external users don't need Beads. Error: ${error}`
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (process.env.GWI_USE_BEADS !== 'true') {
      return false;
    }

    try {
      const client = await this.ensureConnection();
      return client.isInitialized();
    } catch {
      return false;
    }
  }

  async createTask(options: CreateTaskOptions): Promise<{ id: string; title: string }> {
    const client = await this.ensureConnection();

    const issue = await client.createIssue({
      title: options.title,
      type: options.type,
      priority: options.priority ?? 1,
      description: options.description,
    });

    return { id: issue.id, title: issue.title };
  }

  async getTask(id: string): Promise<{ id: string; title: string; status: string } | null> {
    const client = await this.ensureConnection();
    const issue = await client.getIssue(id);

    if (!issue) {
      return null;
    }

    return {
      id: issue.id,
      title: issue.title,
      status: issue.status,
    };
  }

  async updateTask(id: string, options: UpdateTaskOptions): Promise<void> {
    const client = await this.ensureConnection();
    await client.updateIssue(id, options);
  }

  async completeTask(id: string): Promise<void> {
    const client = await this.ensureConnection();
    await client.closeIssue(id);
  }

  async listReadyTasks(): Promise<Array<{ id: string; title: string; priority: number }>> {
    const client = await this.ensureConnection();
    const issues = await client.getReadyIssues();

    return issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
    }));
  }
}

/**
 * No-op task tracker for when Beads is not available
 * Used in external/public runtime where Beads is optional
 */
export class NoOpTaskTracker implements TaskTracker {
  async isAvailable(): Promise<boolean> {
    return true; // Always "available" but does nothing
  }

  async createTask(options: CreateTaskOptions): Promise<{ id: string; title: string }> {
    // Generate a pseudo-ID for tracking
    const id = `noop-${Date.now()}`;
    console.log(`[NoOp TaskTracker] Task created: ${options.title} (${id})`);
    return { id, title: options.title };
  }

  async getTask(_id: string): Promise<{ id: string; title: string; status: string } | null> {
    return null; // No persistence
  }

  async updateTask(_id: string, _options: UpdateTaskOptions): Promise<void> {
    // No-op
  }

  async completeTask(_id: string): Promise<void> {
    // No-op
  }

  async listReadyTasks(): Promise<Array<{ id: string; title: string; priority: number }>> {
    return []; // No tasks
  }
}

/**
 * Create a task tracker based on environment
 *
 * - If GWI_USE_BEADS=true: Uses Beads (internal)
 * - Otherwise: Uses NoOpTaskTracker (external/public)
 */
export function createTaskTracker(): TaskTracker {
  if (process.env.GWI_USE_BEADS === 'true') {
    return new BeadsTaskTracker();
  }
  return new NoOpTaskTracker();
}
