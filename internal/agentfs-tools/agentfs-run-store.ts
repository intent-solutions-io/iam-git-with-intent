/**
 * AgentFS Run Store Implementation
 *
 * INTERNAL USE ONLY - This adapter is for Intent Solutions' internal development.
 * External users of Git With Intent do not need this.
 *
 * Implements the RunStore interface using AgentFS for state persistence and audit.
 *
 * @internal
 */

import type {
  RunStore,
  Run,
  RunStep,
  RunType,
  RunStatus,
  RunResult,
} from '../../packages/core/src/storage/interfaces.js';

// AgentFS types (imported from @gwi/core when available)
interface AgentFSInstance {
  kv: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
  };
  tools: {
    record(name: string, startedAt: number, endedAt: number, input: unknown, output: unknown): Promise<void>;
    list(limit?: number): Promise<Array<{ name: string; startedAt: number }>>;
  };
}

interface AgentFSRunStoreOptions {
  agentId: string;
  tursoUrl?: string;
  tursoAuthToken?: string;
}

/**
 * AgentFS-backed implementation of RunStore
 *
 * @internal - For Intent Solutions internal use only
 */
export class AgentFSRunStore implements RunStore {
  private agentfs: AgentFSInstance | null = null;
  private options: AgentFSRunStoreOptions;

  constructor(options: AgentFSRunStoreOptions) {
    this.options = options;
  }

  /**
   * Initialize AgentFS connection
   * @internal
   */
  private async ensureConnection(): Promise<AgentFSInstance> {
    if (this.agentfs) {
      return this.agentfs;
    }

    // Dynamic import to avoid hard dependency in runtime
    try {
      const { openAgentFS } = await import('../../packages/core/src/agentfs/index.js');
      this.agentfs = await openAgentFS({
        id: this.options.agentId,
        tursoUrl: this.options.tursoUrl,
        tursoAuthToken: this.options.tursoAuthToken,
      });
      return this.agentfs;
    } catch (error) {
      throw new Error(
        `AgentFS initialization failed. This is an internal tool - external users should use SQLite storage. Error: ${error}`
      );
    }
  }

  async createRun(prId: string, prUrl: string, type: RunType): Promise<Run> {
    const agentfs = await this.ensureConnection();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const run: Run = {
      id: runId,
      prId,
      prUrl,
      type,
      status: 'pending',
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await agentfs.kv.set(`runs:${runId}`, run);
    await agentfs.kv.set(`runs:by-pr:${prId}:${runId}`, runId);

    // Record tool call for audit
    await agentfs.tools.record('createRun', Date.now(), Date.now(), { prId, type }, { runId });

    return run;
  }

  async getRun(runId: string): Promise<Run | null> {
    const agentfs = await this.ensureConnection();
    return agentfs.kv.get<Run>(`runs:${runId}`);
  }

  async getLatestRun(prId: string): Promise<Run | null> {
    const agentfs = await this.ensureConnection();
    const keys = await agentfs.kv.list(`runs:by-pr:${prId}:`);

    if (keys.length === 0) {
      return null;
    }

    // Keys are sorted by timestamp due to run ID format
    const latestKey = keys[keys.length - 1];
    const runId = await agentfs.kv.get<string>(latestKey);

    if (!runId) {
      return null;
    }

    return this.getRun(runId);
  }

  async listRuns(prId: string, limit?: number): Promise<Run[]> {
    const agentfs = await this.ensureConnection();
    const keys = await agentfs.kv.list(`runs:by-pr:${prId}:`);

    const runs: Run[] = [];
    const keysToFetch = limit ? keys.slice(-limit) : keys;

    for (const key of keysToFetch) {
      const runId = await agentfs.kv.get<string>(key);
      if (runId) {
        const run = await this.getRun(runId);
        if (run) {
          runs.push(run);
        }
      }
    }

    return runs.reverse(); // Most recent first
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    const agentfs = await this.ensureConnection();
    const run = await this.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    run.status = status;
    run.updatedAt = new Date();

    await agentfs.kv.set(`runs:${runId}`, run);
  }

  async addStep(runId: string, agent: string): Promise<RunStep> {
    const agentfs = await this.ensureConnection();
    const run = await this.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const stepId = `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const step: RunStep = {
      id: stepId,
      runId,
      agent,
      status: 'pending',
      startedAt: new Date(),
    };

    run.steps.push(step);
    run.currentStep = stepId;
    run.updatedAt = new Date();

    await agentfs.kv.set(`runs:${runId}`, run);
    await agentfs.tools.record('addStep', Date.now(), Date.now(), { runId, agent }, { stepId });

    return step;
  }

  async updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void> {
    const agentfs = await this.ensureConnection();
    const run = await this.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const stepIndex = run.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step not found: ${stepId}`);
    }

    run.steps[stepIndex] = { ...run.steps[stepIndex], ...update };
    run.updatedAt = new Date();

    await agentfs.kv.set(`runs:${runId}`, run);
  }

  async getSteps(runId: string): Promise<RunStep[]> {
    const run = await this.getRun(runId);
    return run?.steps ?? [];
  }

  async completeRun(runId: string, result: RunResult): Promise<void> {
    const agentfs = await this.ensureConnection();
    const run = await this.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    run.status = 'completed';
    run.result = result;
    run.completedAt = new Date();
    run.updatedAt = new Date();
    run.durationMs = run.completedAt.getTime() - run.createdAt.getTime();

    await agentfs.kv.set(`runs:${runId}`, run);
    await agentfs.tools.record('completeRun', Date.now(), Date.now(), { runId }, result);
  }

  async failRun(runId: string, error: string): Promise<void> {
    const agentfs = await this.ensureConnection();
    const run = await this.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    run.status = 'failed';
    run.error = error;
    run.completedAt = new Date();
    run.updatedAt = new Date();
    run.durationMs = run.completedAt.getTime() - run.createdAt.getTime();

    await agentfs.kv.set(`runs:${runId}`, run);
    await agentfs.tools.record('failRun', Date.now(), Date.now(), { runId }, { error });
  }

  async cancelRun(runId: string): Promise<void> {
    const agentfs = await this.ensureConnection();
    const run = await this.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    run.status = 'cancelled';
    run.completedAt = new Date();
    run.updatedAt = new Date();
    run.durationMs = run.completedAt.getTime() - run.createdAt.getTime();

    await agentfs.kv.set(`runs:${runId}`, run);
  }
}

/**
 * Create an AgentFS-backed run store
 *
 * @internal - For Intent Solutions internal use only
 */
export function createAgentFSRunStore(options: AgentFSRunStoreOptions): RunStore {
  return new AgentFSRunStore(options);
}
