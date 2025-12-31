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

    // Check if all dependencies are resolved (completed, failed, or skipped)
    const dependencies = plan.dependencyGraph.get(stepId) ?? new Set();
    const allDepsResolved = Array.from(dependencies).every((depId) => {
      const depExecution = executions.get(depId);
      const status = depExecution?.status;
      return status === 'completed' || status === 'failed' || status === 'skipped';
    });

    if (allDepsResolved) {
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
 * Safe expression evaluator - no eval() or new Function()
 *
 * Supports:
 * - Property access: stepOutputs.stepId.field
 * - Comparisons: ===, !==, ==, !=, >, <, >=, <=
 * - Logical: &&, ||, !
 * - Literals: strings, numbers, booleans, null, undefined
 * - Parentheses for grouping
 */
class SafeExpressionEvaluator {
  private pos = 0;
  private expr = '';
  private context: Record<string, unknown> = {};

  evaluate(expression: string, context: Record<string, unknown>): unknown {
    this.expr = expression.trim();
    this.pos = 0;
    this.context = context;
    const result = this.parseOr();
    this.skipWhitespace();
    if (this.pos < this.expr.length) {
      throw new Error(`Unexpected character at position ${this.pos}: ${this.expr[this.pos]}`);
    }
    return result;
  }

  private skipWhitespace(): void {
    while (this.pos < this.expr.length && /\s/.test(this.expr[this.pos])) {
      this.pos++;
    }
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    this.skipWhitespace();
    while (this.expr.slice(this.pos, this.pos + 2) === '||') {
      this.pos += 2;
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseComparison();
    this.skipWhitespace();
    while (this.expr.slice(this.pos, this.pos + 2) === '&&') {
      this.pos += 2;
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseComparison(): unknown {
    let left = this.parseUnary();
    this.skipWhitespace();

    const ops = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];
    for (const op of ops) {
      if (this.expr.slice(this.pos, this.pos + op.length) === op) {
        this.pos += op.length;
        const right = this.parseUnary();
        switch (op) {
          case '===': return left === right;
          case '!==': return left !== right;
          case '==': return left == right;
          case '!=': return left != right;
          case '>=': return (left as number) >= (right as number);
          case '<=': return (left as number) <= (right as number);
          case '>': return (left as number) > (right as number);
          case '<': return (left as number) < (right as number);
        }
      }
    }
    return left;
  }

  private parseUnary(): unknown {
    this.skipWhitespace();
    if (this.expr[this.pos] === '!') {
      this.pos++;
      return !this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    this.skipWhitespace();

    // Parentheses
    if (this.expr[this.pos] === '(') {
      this.pos++;
      const result = this.parseOr();
      this.skipWhitespace();
      if (this.expr[this.pos] !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      this.pos++;
      return result;
    }

    // String literal (single or double quotes)
    if (this.expr[this.pos] === '"' || this.expr[this.pos] === "'") {
      const quote = this.expr[this.pos];
      this.pos++;
      let str = '';
      while (this.pos < this.expr.length && this.expr[this.pos] !== quote) {
        if (this.expr[this.pos] === '\\' && this.pos + 1 < this.expr.length) {
          this.pos++;
          str += this.expr[this.pos];
        } else {
          str += this.expr[this.pos];
        }
        this.pos++;
      }
      if (this.expr[this.pos] !== quote) {
        throw new Error('Unterminated string literal');
      }
      this.pos++;
      return str;
    }

    // Number
    if (/[\d.-]/.test(this.expr[this.pos])) {
      let numStr = '';
      if (this.expr[this.pos] === '-') {
        numStr += '-';
        this.pos++;
      }
      while (this.pos < this.expr.length && /[\d.]/.test(this.expr[this.pos])) {
        numStr += this.expr[this.pos];
        this.pos++;
      }
      return parseFloat(numStr);
    }

    // Identifier (true, false, null, undefined, or property access)
    if (/[a-zA-Z_$]/.test(this.expr[this.pos])) {
      let ident = '';
      while (this.pos < this.expr.length && /[a-zA-Z0-9_$]/.test(this.expr[this.pos])) {
        ident += this.expr[this.pos];
        this.pos++;
      }

      // Keywords
      if (ident === 'true') return true;
      if (ident === 'false') return false;
      if (ident === 'null') return null;
      if (ident === 'undefined') return undefined;

      // Property access chain
      let value: unknown = this.context[ident];
      this.skipWhitespace();
      while (this.expr[this.pos] === '.') {
        this.pos++;
        this.skipWhitespace();
        let prop = '';
        while (this.pos < this.expr.length && /[a-zA-Z0-9_$]/.test(this.expr[this.pos])) {
          prop += this.expr[this.pos];
          this.pos++;
        }
        if (!prop) {
          throw new Error('Expected property name after .');
        }
        if (value !== null && value !== undefined && typeof value === 'object') {
          value = (value as Record<string, unknown>)[prop];
        } else {
          value = undefined;
        }
        this.skipWhitespace();
      }
      return value;
    }

    throw new Error(`Unexpected character at position ${this.pos}: ${this.expr[this.pos]}`);
  }
}

// Singleton evaluator instance
const safeEvaluator = new SafeExpressionEvaluator();

/**
 * Evaluate conditional execution predicate
 *
 * Safe predicate evaluation for conditional steps.
 * Supports basic comparisons on previous step outputs without using eval().
 *
 * @param condition - Condition string (e.g., "stepOutputs.step1.success === true")
 * @param context - Execution context with step outputs
 * @returns True if condition is met
 */
export function evaluateCondition(
  condition: string | undefined,
  context: { stepOutputs: Map<string, unknown> }
): boolean {
  if (!condition || !condition.trim()) {
    return true; // No condition = always execute
  }

  try {
    // Create evaluation context
    const stepOutputs = Object.fromEntries(context.stepOutputs);
    const evalContext: Record<string, unknown> = { stepOutputs };

    // Use safe expression evaluator (no eval/new Function)
    const result = safeEvaluator.evaluate(condition, evalContext);
    return result === true;
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
