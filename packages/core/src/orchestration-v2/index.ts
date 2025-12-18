/**
 * Agent Orchestration v2 Module
 *
 * Phase 47: Advanced agent coordination, workflow execution, and parallel processing.
 * Provides sophisticated multi-agent orchestration capabilities.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Agent execution status
 */
export type AgentExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * Task dependency type (prefixed to avoid conflict with supply-chain)
 */
export type OrchDependencyType = 'sequential' | 'parallel' | 'conditional' | 'race';

/**
 * Agent capability
 */
export interface AgentCapability {
  name: string;
  version: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

/**
 * Retry policy
 */
export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/**
 * Agent definition
 */
export interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: AgentCapability[];
  healthEndpoint?: string;
  priority: number;
  maxConcurrency: number;
  tags: string[];
}

/**
 * Task definition
 */
export interface TaskDefinition {
  id: string;
  name: string;
  agentId: string;
  capability: string;
  input: Record<string, unknown>;
  dependencies: string[];
  dependencyType: OrchDependencyType;
  timeout: number;
  retryPolicy?: RetryPolicy;
  condition?: string;
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string;
  status: AgentExecutionStatus;
  output?: Record<string, unknown>;
  error?: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  attempts: number;
  agentId: string;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  tasks: TaskDefinition[];
  input: Record<string, unknown>;
  timeout: number;
  failurePolicy: 'fail_fast' | 'continue' | 'rollback';
  tags: string[];
  createdAt: Date;
}

/**
 * Workflow execution (prefixed to avoid conflict with workflows module)
 */
export interface OrchWorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: AgentExecutionStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  taskResults: TaskResult[];
  currentTasks: string[];
  completedTasks: string[];
  failedTasks: string[];
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  error?: string;
}

/**
 * Execution context (prefixed to avoid conflict with tenancy module)
 */
export interface OrchExecutionContext {
  executionId: string;
  workflowId: string;
  tenantId: string;
  userId: string;
  variables: Record<string, unknown>;
  parentExecutionId?: string;
  metadata: Record<string, string>;
}

/**
 * Agent pool
 */
export interface AgentPool {
  id: string;
  name: string;
  agents: string[];
  loadBalancer: 'round_robin' | 'least_busy' | 'random' | 'priority';
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  };
}

// =============================================================================
// Store Interfaces
// =============================================================================

/**
 * Agent registry store
 */
export interface AgentRegistryStore {
  register(agent: Omit<AgentDefinition, 'id'>): Promise<AgentDefinition>;
  unregister(agentId: string): Promise<void>;
  get(agentId: string): Promise<AgentDefinition | null>;
  list(): Promise<AgentDefinition[]>;
  findByCapability(capability: string): Promise<AgentDefinition[]>;
  updateHealth(agentId: string, healthy: boolean): Promise<void>;
}

/**
 * Workflow store
 */
export interface WorkflowStore {
  create(workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>): Promise<WorkflowDefinition>;
  get(workflowId: string): Promise<WorkflowDefinition | null>;
  list(): Promise<WorkflowDefinition[]>;
  update(workflowId: string, updates: Partial<WorkflowDefinition>): Promise<WorkflowDefinition>;
  delete(workflowId: string): Promise<void>;
}

/**
 * Execution store
 */
export interface ExecutionStore {
  create(execution: Omit<OrchWorkflowExecution, 'id'>): Promise<OrchWorkflowExecution>;
  get(executionId: string): Promise<OrchWorkflowExecution | null>;
  list(workflowId?: string): Promise<OrchWorkflowExecution[]>;
  update(executionId: string, updates: Partial<OrchWorkflowExecution>): Promise<OrchWorkflowExecution>;
  updateTaskResult(executionId: string, taskResult: TaskResult): Promise<OrchWorkflowExecution>;
}

// =============================================================================
// In-Memory Stores
// =============================================================================

/**
 * In-memory agent registry
 */
export class InMemoryAgentRegistry implements AgentRegistryStore {
  private agents = new Map<string, AgentDefinition & { healthy: boolean }>();
  private counter = 0;

  async register(agent: Omit<AgentDefinition, 'id'>): Promise<AgentDefinition> {
    const id = `agent_${++this.counter}`;
    const agentDef: AgentDefinition = { ...agent, id };
    this.agents.set(id, { ...agentDef, healthy: true });
    return agentDef;
  }

  async unregister(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }

  async get(agentId: string): Promise<AgentDefinition | null> {
    const agent = this.agents.get(agentId);
    return agent ? { ...agent } : null;
  }

  async list(): Promise<AgentDefinition[]> {
    return Array.from(this.agents.values()).map((a) => ({ ...a }));
  }

  async findByCapability(capability: string): Promise<AgentDefinition[]> {
    return Array.from(this.agents.values())
      .filter((a) => a.healthy && a.capabilities.some((c) => c.name === capability))
      .map((a) => ({ ...a }));
  }

  async updateHealth(agentId: string, healthy: boolean): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.healthy = healthy;
    }
  }
}

/**
 * In-memory workflow store
 */
export class InMemoryWorkflowStore implements WorkflowStore {
  private workflows = new Map<string, WorkflowDefinition>();
  private counter = 0;

  async create(workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>): Promise<WorkflowDefinition> {
    const id = `workflow_${++this.counter}`;
    const workflowDef: WorkflowDefinition = { ...workflow, id, createdAt: new Date() };
    this.workflows.set(id, workflowDef);
    return workflowDef;
  }

  async get(workflowId: string): Promise<WorkflowDefinition | null> {
    return this.workflows.get(workflowId) || null;
  }

  async list(): Promise<WorkflowDefinition[]> {
    return Array.from(this.workflows.values());
  }

  async update(workflowId: string, updates: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    const updated = { ...workflow, ...updates, id: workflowId };
    this.workflows.set(workflowId, updated);
    return updated;
  }

  async delete(workflowId: string): Promise<void> {
    this.workflows.delete(workflowId);
  }
}

/**
 * In-memory execution store
 */
export class InMemoryExecutionStore implements ExecutionStore {
  private executions = new Map<string, OrchWorkflowExecution>();
  private counter = 0;

  async create(execution: Omit<OrchWorkflowExecution, 'id'>): Promise<OrchWorkflowExecution> {
    const id = `exec_${++this.counter}`;
    const exec: OrchWorkflowExecution = { ...execution, id };
    this.executions.set(id, exec);
    return exec;
  }

  async get(executionId: string): Promise<OrchWorkflowExecution | null> {
    return this.executions.get(executionId) || null;
  }

  async list(workflowId?: string): Promise<OrchWorkflowExecution[]> {
    let executions = Array.from(this.executions.values());
    if (workflowId) {
      executions = executions.filter((e) => e.workflowId === workflowId);
    }
    return executions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  async update(executionId: string, updates: Partial<OrchWorkflowExecution>): Promise<OrchWorkflowExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    const updated = { ...execution, ...updates, id: executionId };
    this.executions.set(executionId, updated);
    return updated;
  }

  async updateTaskResult(executionId: string, taskResult: TaskResult): Promise<OrchWorkflowExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    // Update or add task result
    const existingIndex = execution.taskResults.findIndex((r) => r.taskId === taskResult.taskId);
    if (existingIndex >= 0) {
      execution.taskResults[existingIndex] = taskResult;
    } else {
      execution.taskResults.push(taskResult);
    }

    // Update task tracking
    if (taskResult.status === 'completed') {
      execution.completedTasks = [...new Set([...execution.completedTasks, taskResult.taskId])];
      execution.currentTasks = execution.currentTasks.filter((t) => t !== taskResult.taskId);
    } else if (taskResult.status === 'failed') {
      execution.failedTasks = [...new Set([...execution.failedTasks, taskResult.taskId])];
      execution.currentTasks = execution.currentTasks.filter((t) => t !== taskResult.taskId);
    } else if (taskResult.status === 'running') {
      execution.currentTasks = [...new Set([...execution.currentTasks, taskResult.taskId])];
    }

    return execution;
  }
}

// =============================================================================
// Orchestration Manager
// =============================================================================

/**
 * Orchestration manager configuration
 */
export interface OrchestrationConfig {
  defaultTimeout: number;
  maxConcurrentExecutions: number;
  enableParallelExecution: boolean;
  defaultRetryPolicy: RetryPolicy;
}

/**
 * Default orchestration config
 */
export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  defaultTimeout: 300000, // 5 minutes
  maxConcurrentExecutions: 10,
  enableParallelExecution: true,
  defaultRetryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
};

/**
 * Orchestration Manager - coordinates multi-agent workflows
 */
export class OrchestrationManager {
  private agentRegistry: AgentRegistryStore;
  private workflowStore: WorkflowStore;
  private executionStore: ExecutionStore;
  private pools = new Map<string, AgentPool>();
  private poolCounter = 0;

  constructor(
    agentRegistry: AgentRegistryStore,
    workflowStore: WorkflowStore,
    executionStore: ExecutionStore,
    _config: OrchestrationConfig = DEFAULT_ORCHESTRATION_CONFIG
  ) {
    this.agentRegistry = agentRegistry;
    this.workflowStore = workflowStore;
    this.executionStore = executionStore;
  }

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

  async registerAgent(agent: Omit<AgentDefinition, 'id'>): Promise<AgentDefinition> {
    return this.agentRegistry.register(agent);
  }

  async unregisterAgent(agentId: string): Promise<void> {
    return this.agentRegistry.unregister(agentId);
  }

  async getAgent(agentId: string): Promise<AgentDefinition | null> {
    return this.agentRegistry.get(agentId);
  }

  async listAgents(): Promise<AgentDefinition[]> {
    return this.agentRegistry.list();
  }

  async findAgentsForCapability(capability: string): Promise<AgentDefinition[]> {
    return this.agentRegistry.findByCapability(capability);
  }

  // -------------------------------------------------------------------------
  // Workflow Management
  // -------------------------------------------------------------------------

  async createWorkflow(workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>): Promise<WorkflowDefinition> {
    // Validate tasks
    this.validateWorkflow(workflow);
    return this.workflowStore.create(workflow);
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
    return this.workflowStore.get(workflowId);
  }

  async listWorkflows(): Promise<WorkflowDefinition[]> {
    return this.workflowStore.list();
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    return this.workflowStore.delete(workflowId);
  }

  // -------------------------------------------------------------------------
  // Execution Management
  // -------------------------------------------------------------------------

  async executeWorkflow(
    workflowId: string,
    input: Record<string, unknown>,
    _context?: Partial<OrchExecutionContext>
  ): Promise<OrchWorkflowExecution> {
    const workflow = await this.workflowStore.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    // Create execution
    const execution = await this.executionStore.create({
      workflowId,
      workflowName: workflow.name,
      status: 'running',
      input,
      taskResults: [],
      currentTasks: [],
      completedTasks: [],
      failedTasks: [],
      startTime: new Date(),
    });

    // Execute tasks (simplified - in production would be async)
    await this.executeTasks(execution, workflow);

    return this.executionStore.get(execution.id) as Promise<OrchWorkflowExecution>;
  }

  async getExecution(executionId: string): Promise<OrchWorkflowExecution | null> {
    return this.executionStore.get(executionId);
  }

  async listExecutions(workflowId?: string): Promise<OrchWorkflowExecution[]> {
    return this.executionStore.list(workflowId);
  }

  async cancelExecution(executionId: string): Promise<OrchWorkflowExecution> {
    return this.executionStore.update(executionId, {
      status: 'cancelled',
      endTime: new Date(),
    });
  }

  async pauseExecution(executionId: string): Promise<OrchWorkflowExecution> {
    return this.executionStore.update(executionId, { status: 'paused' });
  }

  async resumeExecution(executionId: string): Promise<OrchWorkflowExecution> {
    const execution = await this.executionStore.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (execution.status !== 'paused') throw new Error('Execution is not paused');

    return this.executionStore.update(executionId, { status: 'running' });
  }

  // -------------------------------------------------------------------------
  // Agent Pool Management
  // -------------------------------------------------------------------------

  async createPool(pool: Omit<AgentPool, 'id'>): Promise<AgentPool> {
    const id = `pool_${++this.poolCounter}`;
    const agentPool: AgentPool = { ...pool, id };
    this.pools.set(id, agentPool);
    return agentPool;
  }

  async getPool(poolId: string): Promise<AgentPool | null> {
    return this.pools.get(poolId) || null;
  }

  async addAgentToPool(poolId: string, agentId: string): Promise<AgentPool> {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error(`Pool ${poolId} not found`);
    if (!pool.agents.includes(agentId)) {
      pool.agents.push(agentId);
    }
    return pool;
  }

  async removeAgentFromPool(poolId: string, agentId: string): Promise<AgentPool> {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error(`Pool ${poolId} not found`);
    pool.agents = pool.agents.filter((a) => a !== agentId);
    return pool;
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  private validateWorkflow(workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>): void {
    const taskIds = new Set(workflow.tasks.map((t) => t.id));

    for (const task of workflow.tasks) {
      for (const dep of task.dependencies) {
        if (!taskIds.has(dep)) {
          throw new Error(`Task ${task.id} depends on non-existent task ${dep}`);
        }
      }

      // Check for circular dependencies (simplified)
      if (task.dependencies.includes(task.id)) {
        throw new Error(`Task ${task.id} has circular dependency on itself`);
      }
    }
  }

  private async executeTasks(
    execution: OrchWorkflowExecution,
    workflow: WorkflowDefinition
  ): Promise<void> {
    // Build task map for dependency resolution (used implicitly by workflow.tasks iteration)
    void new Map(workflow.tasks.map((t) => [t.id, t]));
    const completed = new Set<string>();
    const failed = new Set<string>();

    // Simple topological execution
    let iterations = 0;
    const maxIterations = workflow.tasks.length * 2;

    while (completed.size + failed.size < workflow.tasks.length && iterations < maxIterations) {
      iterations++;

      for (const task of workflow.tasks) {
        if (completed.has(task.id) || failed.has(task.id)) continue;

        // Check dependencies
        const depsCompleted = task.dependencies.every((d) => completed.has(d));
        const depsFailed = task.dependencies.some((d) => failed.has(d));

        if (depsFailed) {
          // Dependency failed
          const result: TaskResult = {
            taskId: task.id,
            status: 'failed',
            error: 'Dependency failed',
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 0,
            attempts: 0,
            agentId: task.agentId,
          };
          await this.executionStore.updateTaskResult(execution.id, result);
          failed.add(task.id);
          continue;
        }

        if (!depsCompleted) continue;

        // Execute task (simulated)
        const startTime = new Date();
        const result: TaskResult = {
          taskId: task.id,
          status: 'completed',
          output: { result: 'success' },
          startTime,
          endTime: new Date(),
          durationMs: Date.now() - startTime.getTime(),
          attempts: 1,
          agentId: task.agentId,
        };
        await this.executionStore.updateTaskResult(execution.id, result);
        completed.add(task.id);
      }
    }

    // Update execution status
    const finalStatus: AgentExecutionStatus = failed.size > 0 ? 'failed' : 'completed';
    await this.executionStore.update(execution.id, {
      status: finalStatus,
      endTime: new Date(),
      durationMs: Date.now() - execution.startTime.getTime(),
    });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an Orchestration Manager with in-memory stores
 */
export function createOrchestrationManager(
  config: Partial<OrchestrationConfig> = {}
): OrchestrationManager {
  return new OrchestrationManager(
    new InMemoryAgentRegistry(),
    new InMemoryWorkflowStore(),
    new InMemoryExecutionStore(),
    { ...DEFAULT_ORCHESTRATION_CONFIG, ...config }
  );
}

/**
 * Create agent registry
 */
export function createAgentRegistry(): InMemoryAgentRegistry {
  return new InMemoryAgentRegistry();
}

/**
 * Create workflow store
 */
export function createWorkflowStore(): InMemoryWorkflowStore {
  return new InMemoryWorkflowStore();
}

/**
 * Create execution store
 */
export function createExecutionStore(): InMemoryExecutionStore {
  return new InMemoryExecutionStore();
}
