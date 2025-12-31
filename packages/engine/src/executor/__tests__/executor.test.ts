/**
 * Parallel Executor Tests
 *
 * Tests for parallel workflow execution with DAG scheduling.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveExecutionPlan,
  CyclicDependencyError,
  InvalidDependencyError,
  getReadySteps,
  shouldSkipStep,
  evaluateCondition,
  getAncestors,
  getDescendants,
} from '../dependency-resolver.js';
import { Scheduler } from '../scheduler.js';
import { ParallelExecutor, type StepExecutorFn } from '../parallel-executor.js';
import type {
  WorkflowDefinition,
  StepExecution,
  ExecutionContext,
} from '../types.js';

describe('DependencyResolver', () => {
  describe('resolveExecutionPlan', () => {
    it('should resolve linear workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step2'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);

      expect(plan.totalSteps).toBe(3);
      expect(plan.levels).toEqual([['step1'], ['step2'], ['step3']]);
      expect(plan.dependencyGraph.get('step2')).toEqual(new Set(['step1']));
      expect(plan.dependentGraph.get('step1')).toEqual(new Set(['step2']));
    });

    it('should resolve parallel workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: [] },
          { id: 'step4', agent: 'agent4', name: 'Step 4', dependencies: ['step1', 'step2', 'step3'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);

      expect(plan.totalSteps).toBe(4);
      expect(plan.levels[0]).toContain('step1');
      expect(plan.levels[0]).toContain('step2');
      expect(plan.levels[0]).toContain('step3');
      expect(plan.levels[1]).toEqual(['step4']);
    });

    it('should detect cyclic dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: ['step3'] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step2'] },
        ],
      };

      expect(() => resolveExecutionPlan(workflow)).toThrow(CyclicDependencyError);
    });

    it('should detect invalid dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['nonexistent'] },
        ],
      };

      expect(() => resolveExecutionPlan(workflow)).toThrow(InvalidDependencyError);
    });

    it('should handle diamond dependency pattern', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step1'] },
          { id: 'step4', agent: 'agent4', name: 'Step 4', dependencies: ['step2', 'step3'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);

      expect(plan.totalSteps).toBe(4);
      expect(plan.levels[0]).toEqual(['step1']);
      expect(plan.levels[1]).toContain('step2');
      expect(plan.levels[1]).toContain('step3');
      expect(plan.levels[2]).toEqual(['step4']);
    });
  });

  describe('getReadySteps', () => {
    it('should return steps with completed dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step1'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'completed', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'pending', retryAttempts: 0 }],
        ['step3', { stepId: 'step3', status: 'pending', retryAttempts: 0 }],
      ]);

      const ready = getReadySteps(plan, executions);

      expect(ready).toContain('step2');
      expect(ready).toContain('step3');
    });

    it('should respect priority ordering', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [], priority: 1 },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [], priority: 10 },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: [], priority: 5 },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'pending', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'pending', retryAttempts: 0 }],
        ['step3', { stepId: 'step3', status: 'pending', retryAttempts: 0 }],
      ]);

      const ready = getReadySteps(plan, executions);

      expect(ready[0]).toBe('step2'); // Highest priority
      expect(ready[1]).toBe('step3');
      expect(ready[2]).toBe('step1');
    });
  });

  describe('shouldSkipStep', () => {
    it('should skip if dependency failed', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'failed', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'pending', retryAttempts: 0 }],
      ]);

      expect(shouldSkipStep('step2', plan, executions)).toBe(true);
    });

    it('should skip if dependency skipped', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'skipped', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'pending', retryAttempts: 0 }],
      ]);

      expect(shouldSkipStep('step2', plan, executions)).toBe(true);
    });
  });

  describe('evaluateCondition', () => {
    it('should return true for undefined condition', () => {
      const context = { stepOutputs: new Map() };
      expect(evaluateCondition(undefined, context)).toBe(true);
    });

    it('should evaluate simple conditions', () => {
      const context = {
        stepOutputs: new Map([['step1', { status: 'success' }]]),
      };

      expect(evaluateCondition('stepOutputs.step1.status === "success"', context)).toBe(true);
      expect(evaluateCondition('stepOutputs.step1.status === "failed"', context)).toBe(false);
    });
  });

  describe('getAncestors', () => {
    it('should find all transitive dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step2'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const ancestors = getAncestors('step3', plan);

      expect(ancestors.has('step1')).toBe(true);
      expect(ancestors.has('step2')).toBe(true);
    });
  });

  describe('getDescendants', () => {
    it('should find all transitive dependents', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step2'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const descendants = getDescendants('step1', plan);

      expect(descendants.has('step2')).toBe(true);
      expect(descendants.has('step3')).toBe(true);
    });
  });
});

describe('Scheduler', () => {
  describe('getNextBatch', () => {
    it('should respect parallelism limit', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 2,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: [] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const scheduler = new Scheduler(plan, { maxParallelSteps: 2 });

      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'pending', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'pending', retryAttempts: 0 }],
        ['step3', { stepId: 'step3', status: 'pending', retryAttempts: 0 }],
      ]);

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      const batch = scheduler.getNextBatch(executions, context);

      expect(batch.length).toBe(2); // Limited by maxParallelSteps
    });

    it('should not schedule if at capacity', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 2,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: [] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const scheduler = new Scheduler(plan, { maxParallelSteps: 2 });

      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'running', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'running', retryAttempts: 0 }],
        ['step3', { stepId: 'step3', status: 'pending', retryAttempts: 0 }],
      ]);

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      const batch = scheduler.getNextBatch(executions, context);

      expect(batch.length).toBe(0); // At capacity
    });
  });

  describe('isComplete', () => {
    it('should return true when all steps terminal', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const scheduler = new Scheduler(plan, {});

      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'completed', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'failed', retryAttempts: 0 }],
      ]);

      expect(scheduler.isComplete(executions)).toBe(true);
    });

    it('should return false when steps pending', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const scheduler = new Scheduler(plan, {});

      const executions = new Map<string, StepExecution>([
        ['step1', { stepId: 'step1', status: 'completed', retryAttempts: 0 }],
        ['step2', { stepId: 'step2', status: 'pending', retryAttempts: 0 }],
      ]);

      expect(scheduler.isComplete(executions)).toBe(false);
    });
  });

  describe('getCriticalPath', () => {
    it('should find longest dependency chain', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step1'] },
          { id: 'step4', agent: 'agent4', name: 'Step 4', dependencies: ['step2'] },
        ],
      };

      const plan = resolveExecutionPlan(workflow);
      const scheduler = new Scheduler(plan, {});

      const criticalPath = scheduler.getCriticalPath();

      expect(criticalPath).toEqual(['step1', 'step2', 'step4']);
    });
  });
});

describe('ParallelExecutor', () => {
  describe('executeWorkflow', () => {
    it('should execute linear workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: ['step2'] },
        ],
      };

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      const stepExecutor: StepExecutorFn = vi.fn(async (step) => {
        return { stepId: step.id, result: 'success' };
      });

      const executor = new ParallelExecutor();
      const result = await executor.executeWorkflow(workflow, context, stepExecutor);

      expect(result.success).toBe(true);
      expect(result.stats.completedSteps).toBe(3);
      expect(result.stats.failedSteps).toBe(0);
      expect(stepExecutor).toHaveBeenCalledTimes(3);
    });

    it('should execute parallel steps concurrently', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 3,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
          { id: 'step3', agent: 'agent3', name: 'Step 3', dependencies: [] },
        ],
      };

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      const executionOrder: string[] = [];
      const stepExecutor: StepExecutorFn = vi.fn(async (step) => {
        executionOrder.push(`start-${step.id}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(`end-${step.id}`);
        return { stepId: step.id };
      });

      const executor = new ParallelExecutor();
      const result = await executor.executeWorkflow(workflow, context, stepExecutor);

      expect(result.success).toBe(true);
      expect(result.stats.completedSteps).toBe(3);

      // All steps should start before any complete (parallel execution)
      const startIndices = executionOrder
        .map((e, i) => (e.startsWith('start-') ? i : -1))
        .filter((i) => i >= 0);
      const endIndices = executionOrder
        .map((e, i) => (e.startsWith('end-') ? i : -1))
        .filter((i) => i >= 0);

      expect(Math.max(...startIndices)).toBeLessThan(Math.min(...endIndices));
    });

    it('should handle step failures', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
        ],
      };

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      const stepExecutor: StepExecutorFn = vi.fn(async (step) => {
        if (step.id === 'step1') {
          throw new Error('Step 1 failed');
        }
        return { stepId: step.id };
      });

      const executor = new ParallelExecutor();
      const result = await executor.executeWorkflow(workflow, context, stepExecutor);

      expect(result.success).toBe(false);
      expect(result.stats.failedSteps).toBe(1);
      expect(result.stats.skippedSteps).toBe(1); // step2 skipped due to step1 failure
    });

    it('should retry failed steps', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          {
            id: 'step1',
            agent: 'agent1',
            name: 'Step 1',
            dependencies: [],
            retry: { maxAttempts: 3, initialDelayMs: 10, backoffMultiplier: 1, maxDelayMs: 100 },
          },
        ],
      };

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      let attempts = 0;
      const stepExecutor: StepExecutorFn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true };
      });

      const executor = new ParallelExecutor();
      const result = await executor.executeWorkflow(workflow, context, stepExecutor);

      expect(result.success).toBe(true);
      expect(stepExecutor).toHaveBeenCalledTimes(3);
      expect(result.stats.totalRetries).toBe(2); // 0-indexed, so 2 retries = 3 attempts
    });

    it('should call progress callback', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: [] },
        ],
      };

      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
      };

      const stepExecutor: StepExecutorFn = vi.fn(async () => ({ success: true }));
      const onProgress = vi.fn();

      const executor = new ParallelExecutor({ onProgress });
      await executor.executeWorkflow(workflow, context, stepExecutor);

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(2, 2); // Final call: 2/2 complete
    });

    it('should handle cancellation', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        type: 'test',
        name: 'Test Workflow',
        maxParallelSteps: 5,
        steps: [
          { id: 'step1', agent: 'agent1', name: 'Step 1', dependencies: [] },
          { id: 'step2', agent: 'agent2', name: 'Step 2', dependencies: ['step1'] },
        ],
      };

      const abortController = new AbortController();
      const context: ExecutionContext = {
        workflowId: 'test',
        tenantId: 'tenant1',
        userId: 'user1',
        correlationId: 'corr1',
        stepOutputs: new Map(),
        workflowInput: {},
        abortSignal: abortController.signal,
      };

      const stepExecutor: StepExecutorFn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true };
      });

      const executor = new ParallelExecutor();
      const resultPromise = executor.executeWorkflow(workflow, context, stepExecutor);

      // Cancel after a short delay
      setTimeout(() => abortController.abort(), 50);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('cancelled');
    });
  });
});
