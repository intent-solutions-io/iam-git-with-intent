/**
 * Workflow Graph Operations
 *
 * C1: DAG operations for workflow execution planning.
 * Provides utilities for traversing, analyzing, and executing
 * workflow step graphs.
 *
 * @module @gwi/engine/workflow/graph
 */

import type {
  WorkflowDefinition,
  WorkflowStep,
  StepDependency,
  StepExecutionState,
  StepInstanceState,
} from './schema.js';

// =============================================================================
// Graph Types
// =============================================================================

/**
 * A node in the workflow graph
 */
export interface WorkflowNode {
  /** Step definition */
  step: WorkflowStep;
  /** IDs of steps this step depends on */
  dependencies: string[];
  /** IDs of steps that depend on this step */
  dependents: string[];
  /** Depth in the DAG (0 for root nodes) */
  depth: number;
}

/**
 * The complete workflow graph structure
 */
export interface WorkflowGraph {
  /** All nodes indexed by step ID */
  nodes: Map<string, WorkflowNode>;
  /** Root nodes (no dependencies) */
  roots: string[];
  /** Leaf nodes (no dependents) */
  leaves: string[];
  /** Maximum depth of the DAG */
  maxDepth: number;
  /** Total number of nodes */
  size: number;
}

/**
 * Execution schedule for a workflow
 */
export interface ExecutionSchedule {
  /** Steps grouped by execution level (can run in parallel within level) */
  levels: ExecutionLevel[];
  /** Critical path through the DAG */
  criticalPath: string[];
  /** Estimated total duration (sum of critical path step durations) */
  estimatedDurationMs?: number;
}

/**
 * A single level in the execution schedule
 */
export interface ExecutionLevel {
  /** Level number (0 = first to execute) */
  level: number;
  /** Step IDs that can execute at this level */
  stepIds: string[];
  /** Whether all steps in this level can run in parallel */
  parallelizable: boolean;
}

/**
 * Options for getting ready steps
 */
export interface ReadyStepsOptions {
  /** Maximum number of steps to return */
  limit?: number;
  /** Filter by step type */
  types?: string[];
  /** Exclude steps requiring approval */
  excludeApproval?: boolean;
}

// =============================================================================
// Graph Construction
// =============================================================================

/**
 * Build a graph representation of a workflow
 *
 * @param workflow - The workflow definition
 * @returns The workflow graph
 *
 * @example
 * ```typescript
 * const graph = buildGraph(workflow);
 * console.log('Root steps:', graph.roots);
 * console.log('Max depth:', graph.maxDepth);
 * ```
 */
export function buildGraph(workflow: WorkflowDefinition): WorkflowGraph {
  const nodes = new Map<string, WorkflowNode>();

  // First pass: create nodes
  for (const step of workflow.steps) {
    const deps = normalizeDependencies(step.dependsOn);
    nodes.set(step.id, {
      step,
      dependencies: deps.map(d => d.stepId),
      dependents: [],
      depth: 0,
    });
  }

  // Second pass: populate dependents and calculate depths
  for (const [stepId, node] of nodes) {
    for (const depId of node.dependencies) {
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.dependents.push(stepId);
      }
    }
  }

  // Calculate depths using BFS from roots
  const roots: string[] = [];
  for (const [stepId, node] of nodes) {
    if (node.dependencies.length === 0) {
      roots.push(stepId);
      node.depth = 0;
    }
  }

  // BFS to set depths
  const queue = [...roots];
  let maxDepth = 0;

  while (queue.length > 0) {
    const stepId = queue.shift()!;
    const node = nodes.get(stepId)!;

    for (const depId of node.dependents) {
      const depNode = nodes.get(depId)!;
      const newDepth = node.depth + 1;
      if (newDepth > depNode.depth) {
        depNode.depth = newDepth;
        maxDepth = Math.max(maxDepth, newDepth);
      }
      queue.push(depId);
    }
  }

  // Find leaves
  const leaves: string[] = [];
  for (const [stepId, node] of nodes) {
    if (node.dependents.length === 0) {
      leaves.push(stepId);
    }
  }

  return {
    nodes,
    roots,
    leaves,
    maxDepth,
    size: nodes.size,
  };
}

// =============================================================================
// Execution Planning
// =============================================================================

/**
 * Create an execution schedule for a workflow
 *
 * Groups steps into levels where all steps in a level can
 * potentially run in parallel (all their dependencies are in
 * previous levels).
 *
 * @param workflow - The workflow definition
 * @returns Execution schedule
 */
export function createExecutionSchedule(
  workflow: WorkflowDefinition
): ExecutionSchedule {
  const graph = buildGraph(workflow);
  const levels: ExecutionLevel[] = [];

  // Group steps by depth
  const stepsByDepth = new Map<number, string[]>();
  for (const [stepId, node] of graph.nodes) {
    const depth = node.depth;
    if (!stepsByDepth.has(depth)) {
      stepsByDepth.set(depth, []);
    }
    stepsByDepth.get(depth)!.push(stepId);
  }

  // Convert to levels
  for (let level = 0; level <= graph.maxDepth; level++) {
    const stepIds = stepsByDepth.get(level) || [];
    levels.push({
      level,
      stepIds,
      parallelizable: stepIds.length > 1,
    });
  }

  // Find critical path (longest path through DAG)
  const criticalPath = findCriticalPath(graph);

  return {
    levels,
    criticalPath,
  };
}

/**
 * Find the critical path (longest path) through the workflow DAG
 */
function findCriticalPath(graph: WorkflowGraph): string[] {
  if (graph.size === 0) return [];

  // Find the leaf with maximum depth
  let maxDepthLeaf = graph.leaves[0];
  let maxDepth = graph.nodes.get(maxDepthLeaf)?.depth || 0;

  for (const leafId of graph.leaves) {
    const depth = graph.nodes.get(leafId)?.depth || 0;
    if (depth > maxDepth) {
      maxDepth = depth;
      maxDepthLeaf = leafId;
    }
  }

  // Trace back from leaf to root
  const path: string[] = [];
  let current = maxDepthLeaf;

  while (current) {
    path.unshift(current);
    const node = graph.nodes.get(current);
    if (!node || node.dependencies.length === 0) break;

    // Find dependency with maximum depth
    let maxDepDep = node.dependencies[0];
    let maxDepDepth = graph.nodes.get(maxDepDep)?.depth || 0;

    for (const depId of node.dependencies) {
      const depDepth = graph.nodes.get(depId)?.depth || 0;
      if (depDepth > maxDepDepth) {
        maxDepDepth = depDepth;
        maxDepDep = depId;
      }
    }

    current = maxDepDep;
  }

  return path;
}

// =============================================================================
// Runtime Execution Helpers
// =============================================================================

/**
 * Get steps that are ready to execute based on current state
 *
 * A step is ready when:
 * - It has not started yet (pending state)
 * - All its dependencies have completed successfully
 *
 * @param workflow - The workflow definition
 * @param stepStates - Current state of each step
 * @param options - Filter options
 * @returns Array of step IDs ready to execute
 */
export function getReadySteps(
  workflow: WorkflowDefinition,
  stepStates: Map<string, StepInstanceState>,
  options: ReadyStepsOptions = {}
): string[] {
  const { limit, types, excludeApproval } = options;
  const ready: string[] = [];

  for (const step of workflow.steps) {
    // Check if step is pending
    const state = stepStates.get(step.id);
    if (state && state.state !== 'pending') {
      continue;
    }

    // Check type filter
    if (types && types.length > 0 && !types.includes(step.type)) {
      continue;
    }

    // Check approval filter
    if (excludeApproval && step.requiresApproval) {
      continue;
    }

    // Check if all dependencies are completed
    const deps = normalizeDependencies(step.dependsOn);

    const allDepsComplete = deps.every(dep => {
      const depState = stepStates.get(dep.stepId);
      if (!depState) return false;

      // Check if dependency result matches requirements
      const resultMatches = dep.requiredResults.some(
        required => {
          if (required === 'ok') return depState.state === 'completed';
          if (required === 'skipped') return depState.state === 'skipped';
          return false;
        }
      );

      return resultMatches;
    });

    if (allDepsComplete || deps.length === 0) {
      ready.push(step.id);
      if (limit && ready.length >= limit) {
        break;
      }
    }
  }

  return ready;
}

/**
 * Check if a workflow is complete
 *
 * A workflow is complete when all steps are in a terminal state
 * (completed, failed, skipped, or cancelled).
 *
 * @param workflow - The workflow definition
 * @param stepStates - Current state of each step
 * @returns Whether all steps are complete
 */
export function isWorkflowComplete(
  workflow: WorkflowDefinition,
  stepStates: Map<string, StepInstanceState>
): boolean {
  const terminalStates: StepExecutionState[] = [
    'completed',
    'failed',
    'skipped',
    'cancelled',
  ];

  for (const step of workflow.steps) {
    const state = stepStates.get(step.id);
    if (!state || !terminalStates.includes(state.state)) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate workflow completion percentage
 *
 * @param workflow - The workflow definition
 * @param stepStates - Current state of each step
 * @returns Percentage (0-100) of completed steps
 */
export function getCompletionPercentage(
  workflow: WorkflowDefinition,
  stepStates: Map<string, StepInstanceState>
): number {
  if (workflow.steps.length === 0) return 100;

  const terminalStates: StepExecutionState[] = [
    'completed',
    'failed',
    'skipped',
    'cancelled',
  ];

  let completed = 0;
  for (const step of workflow.steps) {
    const state = stepStates.get(step.id);
    if (state && terminalStates.includes(state.state)) {
      completed++;
    }
  }

  return Math.round((completed / workflow.steps.length) * 100);
}

/**
 * Get steps that are blocked (waiting for dependencies)
 *
 * @param workflow - The workflow definition
 * @param stepStates - Current state of each step
 * @returns Map of blocked step IDs to their blocking dependencies
 */
export function getBlockedSteps(
  workflow: WorkflowDefinition,
  stepStates: Map<string, StepInstanceState>
): Map<string, string[]> {
  const blocked = new Map<string, string[]>();

  for (const step of workflow.steps) {
    const state = stepStates.get(step.id);
    if (state && state.state !== 'pending') {
      continue;
    }

    const deps = normalizeDependencies(step.dependsOn);
    const blockingDeps: string[] = [];

    for (const dep of deps) {
      const depState = stepStates.get(dep.stepId);
      if (!depState) {
        blockingDeps.push(dep.stepId);
        continue;
      }

      const resultMatches = dep.requiredResults.some(required => {
        if (required === 'ok') return depState.state === 'completed';
        if (required === 'skipped') return depState.state === 'skipped';
        return false;
      });

      if (!resultMatches) {
        blockingDeps.push(dep.stepId);
      }
    }

    if (blockingDeps.length > 0) {
      blocked.set(step.id, blockingDeps);
    }
  }

  return blocked;
}

// =============================================================================
// Graph Analysis
// =============================================================================

/**
 * Get all ancestor steps (transitive dependencies) of a step
 *
 * @param graph - The workflow graph
 * @param stepId - The step ID
 * @returns Set of ancestor step IDs
 */
export function getAncestors(
  graph: WorkflowGraph,
  stepId: string
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [stepId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = graph.nodes.get(current);
    if (!node) continue;

    for (const depId of node.dependencies) {
      if (!ancestors.has(depId)) {
        ancestors.add(depId);
        queue.push(depId);
      }
    }
  }

  return ancestors;
}

/**
 * Get all descendant steps (transitive dependents) of a step
 *
 * @param graph - The workflow graph
 * @param stepId - The step ID
 * @returns Set of descendant step IDs
 */
export function getDescendants(
  graph: WorkflowGraph,
  stepId: string
): Set<string> {
  const descendants = new Set<string>();
  const queue = [stepId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = graph.nodes.get(current);
    if (!node) continue;

    for (const depId of node.dependents) {
      if (!descendants.has(depId)) {
        descendants.add(depId);
        queue.push(depId);
      }
    }
  }

  return descendants;
}

/**
 * Check if two steps can run in parallel
 *
 * Steps can run in parallel if neither is an ancestor of the other.
 *
 * @param graph - The workflow graph
 * @param stepId1 - First step ID
 * @param stepId2 - Second step ID
 * @returns Whether the steps can run in parallel
 */
export function canRunInParallel(
  graph: WorkflowGraph,
  stepId1: string,
  stepId2: string
): boolean {
  const ancestors1 = getAncestors(graph, stepId1);
  const ancestors2 = getAncestors(graph, stepId2);

  return !ancestors1.has(stepId2) && !ancestors2.has(stepId1);
}

/**
 * Get the maximum parallelism level for a workflow
 *
 * This is the maximum number of steps that can execute simultaneously.
 *
 * @param workflow - The workflow definition
 * @returns Maximum parallelism
 */
export function getMaxParallelism(workflow: WorkflowDefinition): number {
  const schedule = createExecutionSchedule(workflow);
  let maxParallel = 0;

  for (const level of schedule.levels) {
    maxParallel = Math.max(maxParallel, level.stepIds.length);
  }

  return maxParallel;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize step dependencies to full StepDependency objects
 */
function normalizeDependencies(
  deps: (string | StepDependency)[] | undefined
): StepDependency[] {
  if (!deps) return [];

  return deps.map(dep => {
    if (typeof dep === 'string') {
      return {
        stepId: dep,
        requiredResults: ['ok'] as const,
        passOutput: true,
      };
    }
    return dep;
  });
}
