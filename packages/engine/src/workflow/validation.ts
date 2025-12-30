/**
 * Workflow DAG Validation
 *
 * C1: Validates workflow definitions for structural integrity.
 * Ensures workflows form valid DAGs with no cycles, valid references,
 * and proper step configurations.
 *
 * @module @gwi/engine/workflow/validation
 */

import type { WorkflowDefinition, WorkflowStep, StepDependency } from './schema.js';

// =============================================================================
// Validation Error Types
// =============================================================================

/**
 * Base validation error
 */
export class WorkflowValidationError extends Error {
  readonly name = 'WorkflowValidationError';
  readonly isValidationError = true;

  constructor(
    message: string,
    public readonly code: ValidationErrorCode,
    public readonly details?: ValidationErrorDetails
  ) {
    super(message);
  }
}

/**
 * Error codes for workflow validation
 */
export type ValidationErrorCode =
  | 'DUPLICATE_STEP_ID'
  | 'INVALID_DEPENDENCY_REF'
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_ENTRY_POINT'
  | 'ORPHANED_STEP'
  | 'INVALID_CONDITION'
  | 'MISSING_HANDLER'
  | 'EMPTY_WORKFLOW';

/**
 * Detailed error information
 */
export interface ValidationErrorDetails {
  /** Step ID where error occurred */
  stepId?: string;
  /** Related step IDs (for cycle detection) */
  relatedStepIds?: string[];
  /** The cycle path if circular dependency detected */
  cyclePath?: string[];
  /** Referenced ID that doesn't exist */
  missingRef?: string;
}

/**
 * Workflow validation result
 */
export interface WorkflowValidationResult {
  /** Whether the workflow is valid */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: WorkflowValidationError[];
  /** Warnings (non-fatal issues) */
  warnings: ValidationWarning[];
  /** Topologically sorted step order (if valid) */
  executionOrder?: string[];
}

/**
 * Non-fatal validation warning
 */
export interface ValidationWarning {
  code: WarningCode;
  message: string;
  stepId?: string;
}

export type WarningCode =
  | 'UNUSED_OUTPUT'
  | 'MISSING_DESCRIPTION'
  | 'LONG_WORKFLOW'
  | 'DEEP_DEPENDENCY_CHAIN';

// =============================================================================
// Core Validation Functions
// =============================================================================

/**
 * Validate a complete workflow definition
 *
 * Performs comprehensive validation including:
 * - Step ID uniqueness
 * - Dependency reference validity
 * - Cycle detection
 * - Entry point validation
 * - Structural integrity
 *
 * @param workflow - The workflow definition to validate
 * @returns Validation result with errors/warnings and execution order
 *
 * @example
 * ```typescript
 * const result = validateWorkflow(myWorkflow);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * } else {
 *   console.log('Execution order:', result.executionOrder);
 * }
 * ```
 */
export function validateWorkflow(workflow: WorkflowDefinition): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for empty workflow
  if (workflow.steps.length === 0) {
    errors.push(new WorkflowValidationError(
      'Workflow must have at least one step',
      'EMPTY_WORKFLOW'
    ));
    return { valid: false, errors, warnings };
  }

  // Validate step ID uniqueness
  const stepIds = new Set<string>();
  const duplicates = new Set<string>();

  for (const step of workflow.steps) {
    if (stepIds.has(step.id)) {
      duplicates.add(step.id);
    }
    stepIds.add(step.id);
  }

  for (const dupId of duplicates) {
    errors.push(new WorkflowValidationError(
      `Duplicate step ID: ${dupId}`,
      'DUPLICATE_STEP_ID',
      { stepId: dupId }
    ));
  }

  // Build adjacency list for dependency validation
  const adjacencyList = buildAdjacencyList(workflow.steps);

  // Validate dependency references
  for (const step of workflow.steps) {
    const deps = normalizeDependencies(step.dependsOn);
    for (const dep of deps) {
      if (!stepIds.has(dep.stepId)) {
        errors.push(new WorkflowValidationError(
          `Step "${step.id}" references non-existent dependency "${dep.stepId}"`,
          'INVALID_DEPENDENCY_REF',
          { stepId: step.id, missingRef: dep.stepId }
        ));
      }
    }
  }

  // Check for circular dependencies
  const cycleResult = detectCycles(adjacencyList, Array.from(stepIds));
  if (cycleResult.hasCycle) {
    errors.push(new WorkflowValidationError(
      `Circular dependency detected: ${cycleResult.cyclePath!.join(' -> ')}`,
      'CIRCULAR_DEPENDENCY',
      { cyclePath: cycleResult.cyclePath, relatedStepIds: cycleResult.cyclePath }
    ));
  }

  // Validate entry point
  if (workflow.entryPoint && !stepIds.has(workflow.entryPoint)) {
    errors.push(new WorkflowValidationError(
      `Entry point "${workflow.entryPoint}" does not exist`,
      'MISSING_ENTRY_POINT',
      { missingRef: workflow.entryPoint }
    ));
  }

  // Validate custom step handlers
  for (const step of workflow.steps) {
    if (step.type === 'custom' && !step.handler) {
      errors.push(new WorkflowValidationError(
        `Custom step "${step.id}" requires a handler`,
        'MISSING_HANDLER',
        { stepId: step.id }
      ));
    }
  }

  // Generate warnings
  warnings.push(...generateWarnings(workflow));

  // Calculate execution order if valid
  let executionOrder: string[] | undefined;
  if (errors.length === 0 && !cycleResult.hasCycle) {
    executionOrder = topologicalSort(adjacencyList, Array.from(stepIds));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    executionOrder,
  };
}

/**
 * Quick validation check (returns boolean only)
 *
 * @param workflow - The workflow to validate
 * @returns true if workflow is valid
 */
export function isValidWorkflow(workflow: WorkflowDefinition): boolean {
  return validateWorkflow(workflow).valid;
}

/**
 * Validate a single step in isolation
 *
 * @param step - The step to validate
 * @param existingStepIds - Set of existing step IDs for dependency validation
 * @returns List of validation errors (empty if valid)
 */
export function validateStep(
  step: WorkflowStep,
  existingStepIds: Set<string>
): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = [];

  // Validate dependency references
  const deps = normalizeDependencies(step.dependsOn);
  for (const dep of deps) {
    if (!existingStepIds.has(dep.stepId)) {
      errors.push(new WorkflowValidationError(
        `Step "${step.id}" references non-existent dependency "${dep.stepId}"`,
        'INVALID_DEPENDENCY_REF',
        { stepId: step.id, missingRef: dep.stepId }
      ));
    }
  }

  // Validate custom step handler
  if (step.type === 'custom' && !step.handler) {
    errors.push(new WorkflowValidationError(
      `Custom step "${step.id}" requires a handler`,
      'MISSING_HANDLER',
      { stepId: step.id }
    ));
  }

  return errors;
}

// =============================================================================
// Graph Utilities (for validation)
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

/**
 * Build an adjacency list from steps (step -> dependencies)
 */
function buildAdjacencyList(steps: WorkflowStep[]): Map<string, string[]> {
  const adjacencyList = new Map<string, string[]>();

  for (const step of steps) {
    const deps = normalizeDependencies(step.dependsOn);
    adjacencyList.set(step.id, deps.map(d => d.stepId));
  }

  return adjacencyList;
}

/**
 * Detect cycles in the dependency graph using DFS
 */
function detectCycles(
  adjacencyList: Map<string, string[]>,
  nodeIds: string[]
): { hasCycle: boolean; cyclePath?: string[] } {
  const WHITE = 0; // Unvisited
  const GRAY = 1;  // Being processed (in current path)
  const BLACK = 2; // Fully processed

  const colors = new Map<string, number>();
  const parent = new Map<string, string | null>();

  // Initialize all nodes as unvisited
  for (const id of nodeIds) {
    colors.set(id, WHITE);
    parent.set(id, null);
  }

  function dfs(node: string, path: string[]): string[] | null {
    colors.set(node, GRAY);

    const deps = adjacencyList.get(node) || [];
    for (const dep of deps) {
      if (!colors.has(dep)) {
        // Skip non-existent nodes (will be caught by other validation)
        continue;
      }

      if (colors.get(dep) === GRAY) {
        // Found a back edge (cycle)
        // The path contains ancestors of 'node', and 'node' is currently being processed
        const cycleStart = path.indexOf(dep);
        if (cycleStart === -1) {
          // dep not in path means we're at the start of the cycle detection
          // The full cycle is: path + current node + back edge to dep
          return [...path, node, dep];
        }
        // Standard case: extract the cycle portion from path
        return [...path.slice(cycleStart), node, dep];
      }

      if (colors.get(dep) === WHITE) {
        parent.set(dep, node);
        const result = dfs(dep, [...path, node]);
        if (result) return result;
      }
    }

    colors.set(node, BLACK);
    return null;
  }

  // Run DFS from each unvisited node
  for (const id of nodeIds) {
    if (colors.get(id) === WHITE) {
      const cycle = dfs(id, []);
      if (cycle) {
        return { hasCycle: true, cyclePath: cycle };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Topological sort of steps (Kahn's algorithm)
 * Returns steps in execution order (dependencies first)
 */
function topologicalSort(
  adjacencyList: Map<string, string[]>,
  nodeIds: string[]
): string[] {
  // Calculate in-degrees
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }

  // Count incoming edges
  for (const [, deps] of adjacencyList) {
    for (const dep of deps) {
      if (inDegree.has(dep)) {
        // Note: In our adjacency list, edges go from step to dependency
        // So we need to count reverse edges
      }
    }
  }

  // Build reverse adjacency list (dependency -> dependent steps)
  const reverseAdj = new Map<string, string[]>();
  for (const id of nodeIds) {
    reverseAdj.set(id, []);
  }

  for (const [stepId, deps] of adjacencyList) {
    for (const dep of deps) {
      if (reverseAdj.has(dep)) {
        reverseAdj.get(dep)!.push(stepId);
        inDegree.set(stepId, (inDegree.get(stepId) || 0) + 1);
      }
    }
  }

  // Find nodes with no dependencies
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    // For each step that depends on this node
    const dependents = reverseAdj.get(node) || [];
    for (const dependent of dependents) {
      const newDegree = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  return result;
}

/**
 * Generate validation warnings
 */
function generateWarnings(workflow: WorkflowDefinition): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Warn about long workflows
  if (workflow.steps.length > 20) {
    warnings.push({
      code: 'LONG_WORKFLOW',
      message: `Workflow has ${workflow.steps.length} steps. Consider breaking into sub-workflows.`,
    });
  }

  // Warn about missing descriptions
  for (const step of workflow.steps) {
    if (!step.description) {
      warnings.push({
        code: 'MISSING_DESCRIPTION',
        message: `Step "${step.id}" is missing a description`,
        stepId: step.id,
      });
    }
  }

  // Check for deep dependency chains
  const maxDepth = calculateMaxDepth(workflow.steps);
  if (maxDepth > 10) {
    warnings.push({
      code: 'DEEP_DEPENDENCY_CHAIN',
      message: `Workflow has a dependency chain of depth ${maxDepth}. This may impact performance.`,
    });
  }

  return warnings;
}

/**
 * Calculate the maximum dependency depth in the workflow
 */
function calculateMaxDepth(steps: WorkflowStep[]): number {
  const adjacencyList = buildAdjacencyList(steps);
  const depths = new Map<string, number>();

  function getDepth(stepId: string, visited: Set<string>): number {
    if (visited.has(stepId)) return 0; // Cycle - already handled by validation
    if (depths.has(stepId)) return depths.get(stepId)!;

    visited.add(stepId);
    const deps = adjacencyList.get(stepId) || [];

    if (deps.length === 0) {
      depths.set(stepId, 0);
      return 0;
    }

    const maxDepDep = Math.max(...deps.map(d => getDepth(d, visited)));
    const depth = maxDepDep + 1;
    depths.set(stepId, depth);
    return depth;
  }

  let maxDepth = 0;
  for (const step of steps) {
    const depth = getDepth(step.id, new Set());
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for WorkflowValidationError
 */
export function isWorkflowValidationError(
  error: unknown
): error is WorkflowValidationError {
  return (
    error instanceof WorkflowValidationError ||
    (error instanceof Error &&
      (error as WorkflowValidationError).isValidationError === true)
  );
}
