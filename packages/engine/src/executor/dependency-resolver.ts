/**
 * Dependency Resolver
 *
 * Analyzes workflow DAG to determine step execution order and detect cycles.
 *
 * @module @gwi/engine/executor
 */

import type {
  WorkflowDefinition,
  StepDefinition,
  ExecutionPlan,
  StepExecution,
  StepExecutionStatus,
} from './types.js';

/**
 * Error thrown when DAG has cycles
 */
export class CyclicDependencyError extends Error {
  constructor(
    public readonly cycle: string[],
    message?: string
  ) {
    super(message ?? `Cyclic dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CyclicDependencyError';
  }
}

/**
 * Error thrown when step references non-existent dependency
 */
export class InvalidDependencyError extends Error {
  constructor(
    public readonly stepId: string,
    public readonly missingDependency: string,
    message?: string
  ) {
    super(message ?? `Step ${stepId} depends on non-existent step ${missingDependency}`);
    this.name = 'InvalidDependencyError';
  }
}

/**
 * Resolve workflow DAG into an execution plan
 *
 * Creates execution plan with topological sort and dependency tracking.
 *
 * @param workflow - Workflow definition
 * @returns Execution plan with levels for parallel execution
 * @throws CyclicDependencyError if DAG has cycles
 * @throws InvalidDependencyError if step references non-existent dependency
 */
export function resolveExecutionPlan(workflow: WorkflowDefinition): ExecutionPlan {
  // Build maps
  const stepDefinitions = new Map<string, StepDefinition>();
  const dependencyGraph = new Map<string, Set<string>>();
  const dependentGraph = new Map<string, Set<string>>();

  // Initialize all steps
  for (const step of workflow.steps) {
    stepDefinitions.set(step.id, step);
    dependencyGraph.set(step.id, new Set(step.dependencies));
    dependentGraph.set(step.id, new Set());
  }

  // Build reverse dependency graph
  for (const step of workflow.steps) {
    for (const depId of step.dependencies) {
      if (!stepDefinitions.has(depId)) {
        throw new InvalidDependencyError(step.id, depId);
      }
      dependentGraph.get(depId)!.add(step.id);
    }
  }

  // Detect cycles using DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function detectCycle(stepId: string): boolean {
    visited.add(stepId);
    recStack.add(stepId);
    path.push(stepId);

    const dependencies = dependencyGraph.get(stepId) ?? new Set();
    for (const depId of dependencies) {
      if (!visited.has(depId)) {
        if (detectCycle(depId)) {
          return true;
        }
      } else if (recStack.has(depId)) {
        // Found cycle - extract the cycle path
        const cycleStart = path.indexOf(depId);
        const cycle = path.slice(cycleStart).concat(depId);
        throw new CyclicDependencyError(cycle);
      }
    }

    recStack.delete(stepId);
    path.pop();
    return false;
  }

  for (const stepId of stepDefinitions.keys()) {
    if (!visited.has(stepId)) {
      detectCycle(stepId);
    }
  }

  // Build execution levels using topological sort (Kahn's algorithm)
  const levels: string[][] = [];
  const inDegree = new Map<string, number>();

  // Initialize in-degree
  for (const stepId of stepDefinitions.keys()) {
    inDegree.set(stepId, dependencyGraph.get(stepId)!.size);
  }

  // Find all steps with no dependencies (level 0)
  const queue: string[] = [];
  for (const [stepId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(stepId);
    }
  }

  while (queue.length > 0) {
    // All steps in queue can execute in parallel (same level)
    const level = [...queue];
    levels.push(level);
    queue.length = 0;

    // Process each step in current level
    for (const stepId of level) {
      // Reduce in-degree for all dependents
      const dependents = dependentGraph.get(stepId) ?? new Set();
      for (const depId of dependents) {
        const newDegree = inDegree.get(depId)! - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }
  }

  // Verify all steps were included (sanity check)
  const totalInLevels = levels.flat().length;
  if (totalInLevels !== stepDefinitions.size) {
    throw new Error(`Execution plan incomplete: ${totalInLevels}/${stepDefinitions.size} steps`);
  }

  return {
    workflowId: workflow.id,
    totalSteps: stepDefinitions.size,
    levels,
    stepDefinitions,
    dependencyGraph,
    dependentGraph,
  };
}

/**
 * Get steps that are ready to execute
 *
 * Returns steps whose dependencies are all completed.
 *
 * @param plan - Execution plan
 * @param executions - Current step executions
 * @returns Array of step IDs ready to run
 */
export function getReadySteps(
  plan: ExecutionPlan,
  executions: Map<string, StepExecution>
): string[] {
  const ready: string[] = [];

  for (const stepId of plan.stepDefinitions.keys()) {
    const execution = executions.get(stepId);
    if (!execution || execution.status !== 'pending') {
      continue; // Skip if already started or completed
    }

    // Check if all dependencies are completed
    const dependencies = plan.dependencyGraph.get(stepId) ?? new Set();
    const allDepsCompleted = Array.from(dependencies).every((depId) => {
      const depExecution = executions.get(depId);
      return depExecution?.status === 'completed';
    });

    if (allDepsCompleted) {
      ready.push(stepId);
    }
  }

  // Sort by priority (higher first)
  ready.sort((a, b) => {
    const priorityA = plan.stepDefinitions.get(a)?.priority ?? 0;
    const priorityB = plan.stepDefinitions.get(b)?.priority ?? 0;
    return priorityB - priorityA;
  });

  return ready;
}

/**
 * Check if a step should be skipped
 *
 * A step is skipped if any of its dependencies failed or were skipped.
 *
 * @param stepId - Step ID to check
 * @param plan - Execution plan
 * @param executions - Current step executions
 * @returns True if step should be skipped
 */
export function shouldSkipStep(
  stepId: string,
  plan: ExecutionPlan,
  executions: Map<string, StepExecution>
): boolean {
  const dependencies = plan.dependencyGraph.get(stepId) ?? new Set();

  for (const depId of dependencies) {
    const depExecution = executions.get(depId);
    if (!depExecution) {
      continue; // Dependency not started yet
    }

    if (depExecution.status === 'failed' || depExecution.status === 'skipped') {
      return true; // Skip if any dependency failed or was skipped
    }
  }

  return false;
}

/**
 * Evaluate conditional execution predicate
 *
 * Simple predicate evaluation for conditional steps.
 * Supports basic comparisons on previous step outputs.
 *
 * @param condition - Condition string
 * @param context - Execution context with step outputs
 * @returns True if condition is met
 */
export function evaluateCondition(
  condition: string | undefined,
  context: { stepOutputs: Map<string, unknown> }
): boolean {
  if (!condition) {
    return true; // No condition = always execute
  }

  // Simple condition evaluation (could be extended with a proper expression parser)
  // For now, just support basic patterns like: "stepId.field === 'value'"
  try {
    // Create a safe evaluation context
    const stepOutputs = Object.fromEntries(context.stepOutputs);
    const evalContext = { stepOutputs };

    // Very simple eval - in production, use a safe expression evaluator
    // This is just for MVP demonstration
    const func = new Function('context', `with(context) { return ${condition}; }`);
    return func(evalContext) === true;
  } catch (error) {
    // If condition evaluation fails, default to false (don't execute)
    console.warn(`Failed to evaluate condition "${condition}":`, error);
    return false;
  }
}

/**
 * Get all ancestor steps (transitive dependencies)
 *
 * @param stepId - Step ID
 * @param plan - Execution plan
 * @returns Set of all ancestor step IDs
 */
export function getAncestors(stepId: string, plan: ExecutionPlan): Set<string> {
  const ancestors = new Set<string>();
  const queue = [stepId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependencies = plan.dependencyGraph.get(current) ?? new Set();

    for (const depId of dependencies) {
      if (!ancestors.has(depId)) {
        ancestors.add(depId);
        queue.push(depId);
      }
    }
  }

  return ancestors;
}

/**
 * Get all descendant steps (transitive dependents)
 *
 * @param stepId - Step ID
 * @param plan - Execution plan
 * @returns Set of all descendant step IDs
 */
export function getDescendants(stepId: string, plan: ExecutionPlan): Set<string> {
  const descendants = new Set<string>();
  const queue = [stepId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = plan.dependentGraph.get(current) ?? new Set();

    for (const depId of dependents) {
      if (!descendants.has(depId)) {
        descendants.add(depId);
        queue.push(depId);
      }
    }
  }

  return descendants;
}
