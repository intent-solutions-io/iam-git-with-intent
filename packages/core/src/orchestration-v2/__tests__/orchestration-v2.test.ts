/**
 * Agent Orchestration v2 Tests
 *
 * Phase 47: Tests for advanced agent coordination and workflow execution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryAgentRegistry,
  InMemoryWorkflowStore,
  InMemoryExecutionStore,
  OrchestrationManager,
  createOrchestrationManager,
  DEFAULT_ORCHESTRATION_CONFIG,
} from '../index.js';

// =============================================================================
// InMemoryAgentRegistry Tests
// =============================================================================

describe('InMemoryAgentRegistry', () => {
  let registry: InMemoryAgentRegistry;

  beforeEach(() => {
    registry = new InMemoryAgentRegistry();
  });

  describe('register()', () => {
    it('should register agent', async () => {
      const agent = await registry.register({
        name: 'Coder Agent',
        version: '1.0.0',
        description: 'Generates code',
        capabilities: [
          { name: 'code_generation', version: '1.0.0', description: 'Generate code' },
        ],
        priority: 1,
        maxConcurrency: 5,
        tags: ['coder'],
      });

      expect(agent.id).toMatch(/^agent_/);
      expect(agent.name).toBe('Coder Agent');
    });
  });

  describe('findByCapability()', () => {
    beforeEach(async () => {
      await registry.register({
        name: 'Agent 1',
        version: '1.0.0',
        description: 'Agent 1',
        capabilities: [
          { name: 'code_generation', version: '1.0.0', description: 'Gen code' },
        ],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      await registry.register({
        name: 'Agent 2',
        version: '1.0.0',
        description: 'Agent 2',
        capabilities: [
          { name: 'code_review', version: '1.0.0', description: 'Review code' },
        ],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });
    });

    it('should find agents by capability', async () => {
      const agents = await registry.findByCapability('code_generation');
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Agent 1');
    });

    it('should return empty for unknown capability', async () => {
      const agents = await registry.findByCapability('unknown');
      expect(agents).toHaveLength(0);
    });
  });

  describe('updateHealth()', () => {
    it('should update agent health', async () => {
      const agent = await registry.register({
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test',
        capabilities: [{ name: 'test', version: '1.0.0', description: 'Test' }],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      await registry.updateHealth(agent.id, false);

      const agents = await registry.findByCapability('test');
      expect(agents).toHaveLength(0); // Unhealthy agents filtered out
    });
  });
});

// =============================================================================
// InMemoryWorkflowStore Tests
// =============================================================================

describe('InMemoryWorkflowStore', () => {
  let store: InMemoryWorkflowStore;

  beforeEach(() => {
    store = new InMemoryWorkflowStore();
  });

  describe('create()', () => {
    it('should create workflow', async () => {
      const workflow = await store.create({
        name: 'PR Review Workflow',
        version: '1.0.0',
        description: 'Reviews PRs',
        tasks: [],
        input: {},
        timeout: 300000,
        failurePolicy: 'fail_fast',
        tags: ['review'],
      });

      expect(workflow.id).toMatch(/^workflow_/);
      expect(workflow.createdAt).toBeDefined();
    });
  });

  describe('list()', () => {
    it('should list workflows', async () => {
      await store.create({
        name: 'Workflow 1',
        version: '1.0.0',
        description: 'Test',
        tasks: [],
        input: {},
        timeout: 300000,
        failurePolicy: 'fail_fast',
        tags: [],
      });

      await store.create({
        name: 'Workflow 2',
        version: '1.0.0',
        description: 'Test',
        tasks: [],
        input: {},
        timeout: 300000,
        failurePolicy: 'continue',
        tags: [],
      });

      const workflows = await store.list();
      expect(workflows).toHaveLength(2);
    });
  });
});

// =============================================================================
// InMemoryExecutionStore Tests
// =============================================================================

describe('InMemoryExecutionStore', () => {
  let store: InMemoryExecutionStore;

  beforeEach(() => {
    store = new InMemoryExecutionStore();
  });

  describe('create()', () => {
    it('should create execution', async () => {
      const execution = await store.create({
        workflowId: 'workflow_1',
        workflowName: 'Test Workflow',
        status: 'pending',
        input: { prUrl: 'https://github.com/test/repo/pull/1' },
        taskResults: [],
        currentTasks: [],
        completedTasks: [],
        failedTasks: [],
        startTime: new Date(),
      });

      expect(execution.id).toMatch(/^exec_/);
      expect(execution.status).toBe('pending');
    });
  });

  describe('updateTaskResult()', () => {
    it('should update task result', async () => {
      const execution = await store.create({
        workflowId: 'workflow_1',
        workflowName: 'Test',
        status: 'running',
        input: {},
        taskResults: [],
        currentTasks: ['task_1'],
        completedTasks: [],
        failedTasks: [],
        startTime: new Date(),
      });

      const updated = await store.updateTaskResult(execution.id, {
        taskId: 'task_1',
        status: 'completed',
        output: { result: 'success' },
        startTime: new Date(),
        endTime: new Date(),
        durationMs: 100,
        attempts: 1,
        agentId: 'agent_1',
      });

      expect(updated.taskResults).toHaveLength(1);
      expect(updated.completedTasks).toContain('task_1');
      expect(updated.currentTasks).not.toContain('task_1');
    });
  });
});

// =============================================================================
// OrchestrationManager Tests
// =============================================================================

describe('OrchestrationManager', () => {
  let manager: OrchestrationManager;

  beforeEach(() => {
    manager = createOrchestrationManager();
  });

  describe('Agent Management', () => {
    it('should register and list agents', async () => {
      await manager.registerAgent({
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test',
        capabilities: [],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      const agents = await manager.listAgents();
      expect(agents).toHaveLength(1);
    });

    it('should unregister agent', async () => {
      const agent = await manager.registerAgent({
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test',
        capabilities: [],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      await manager.unregisterAgent(agent.id);

      const agents = await manager.listAgents();
      expect(agents).toHaveLength(0);
    });

    it('should find agents by capability', async () => {
      await manager.registerAgent({
        name: 'Coder',
        version: '1.0.0',
        description: 'Code gen',
        capabilities: [{ name: 'code_gen', version: '1.0.0', description: 'Gen' }],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      const agents = await manager.findAgentsForCapability('code_gen');
      expect(agents).toHaveLength(1);
    });
  });

  describe('Workflow Management', () => {
    it('should create workflow', async () => {
      const workflow = await manager.createWorkflow({
        name: 'Test Workflow',
        version: '1.0.0',
        description: 'Test',
        tasks: [
          {
            id: 'task_1',
            name: 'Task 1',
            agentId: 'agent_1',
            capability: 'test',
            input: {},
            dependencies: [],
            dependencyType: 'sequential',
            timeout: 60000,
          },
        ],
        input: {},
        timeout: 300000,
        failurePolicy: 'fail_fast',
        tags: [],
      });

      expect(workflow.id).toBeDefined();
    });

    it('should reject workflow with circular dependencies', async () => {
      await expect(
        manager.createWorkflow({
          name: 'Bad Workflow',
          version: '1.0.0',
          description: 'Test',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              agentId: 'agent_1',
              capability: 'test',
              input: {},
              dependencies: ['task_1'], // Self-dependency
              dependencyType: 'sequential',
              timeout: 60000,
            },
          ],
          input: {},
          timeout: 300000,
          failurePolicy: 'fail_fast',
          tags: [],
        })
      ).rejects.toThrow('circular dependency');
    });

    it('should reject workflow with invalid dependencies', async () => {
      await expect(
        manager.createWorkflow({
          name: 'Bad Workflow',
          version: '1.0.0',
          description: 'Test',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              agentId: 'agent_1',
              capability: 'test',
              input: {},
              dependencies: ['non_existent'],
              dependencyType: 'sequential',
              timeout: 60000,
            },
          ],
          input: {},
          timeout: 300000,
          failurePolicy: 'fail_fast',
          tags: [],
        })
      ).rejects.toThrow('non-existent task');
    });
  });

  describe('Execution Management', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflow = await manager.createWorkflow({
        name: 'Test Workflow',
        version: '1.0.0',
        description: 'Test',
        tasks: [
          {
            id: 'task_1',
            name: 'Task 1',
            agentId: 'agent_1',
            capability: 'test',
            input: {},
            dependencies: [],
            dependencyType: 'sequential',
            timeout: 60000,
          },
          {
            id: 'task_2',
            name: 'Task 2',
            agentId: 'agent_1',
            capability: 'test',
            input: {},
            dependencies: ['task_1'],
            dependencyType: 'sequential',
            timeout: 60000,
          },
        ],
        input: {},
        timeout: 300000,
        failurePolicy: 'fail_fast',
        tags: [],
      });
      workflowId = workflow.id;
    });

    it('should execute workflow', async () => {
      const execution = await manager.executeWorkflow(workflowId, { test: true });

      expect(execution.status).toBe('completed');
      expect(execution.taskResults).toHaveLength(2);
      expect(execution.completedTasks).toContain('task_1');
      expect(execution.completedTasks).toContain('task_2');
    });

    it('should list executions', async () => {
      await manager.executeWorkflow(workflowId, {});
      await manager.executeWorkflow(workflowId, {});

      const executions = await manager.listExecutions(workflowId);
      expect(executions).toHaveLength(2);
    });

    it('should cancel execution', async () => {
      const execution = await manager.executeWorkflow(workflowId, {});
      const cancelled = await manager.cancelExecution(execution.id);

      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('Agent Pool Management', () => {
    it('should create agent pool', async () => {
      const pool = await manager.createPool({
        name: 'Coder Pool',
        agents: [],
        loadBalancer: 'round_robin',
        healthCheck: {
          enabled: true,
          intervalMs: 30000,
          timeoutMs: 5000,
        },
      });

      expect(pool.id).toMatch(/^pool_/);
    });

    it('should add agent to pool', async () => {
      const agent = await manager.registerAgent({
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test',
        capabilities: [],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      const pool = await manager.createPool({
        name: 'Test Pool',
        agents: [],
        loadBalancer: 'least_busy',
        healthCheck: { enabled: false, intervalMs: 0, timeoutMs: 0 },
      });

      const updated = await manager.addAgentToPool(pool.id, agent.id);
      expect(updated.agents).toContain(agent.id);
    });

    it('should remove agent from pool', async () => {
      const agent = await manager.registerAgent({
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test',
        capabilities: [],
        priority: 1,
        maxConcurrency: 5,
        tags: [],
      });

      const pool = await manager.createPool({
        name: 'Test Pool',
        agents: [agent.id],
        loadBalancer: 'random',
        healthCheck: { enabled: false, intervalMs: 0, timeoutMs: 0 },
      });

      const updated = await manager.removeAgentFromPool(pool.id, agent.id);
      expect(updated.agents).not.toContain(agent.id);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default orchestration config', () => {
    expect(DEFAULT_ORCHESTRATION_CONFIG.defaultTimeout).toBe(300000);
    expect(DEFAULT_ORCHESTRATION_CONFIG.maxConcurrentExecutions).toBe(10);
    expect(DEFAULT_ORCHESTRATION_CONFIG.enableParallelExecution).toBe(true);
    expect(DEFAULT_ORCHESTRATION_CONFIG.defaultRetryPolicy.maxAttempts).toBe(3);
  });
});
