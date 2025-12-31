/**
 * Scheduler
 *
 * Schedules steps for parallel execution respecting dependencies and limits.
 *
 * @module @gwi/engine/executor
 */

import type {
  ExecutionPlan,
  StepExecution,
  StepDefinition,
  ExecutorConfig,
  ExecutionContext,
} from './types.js';
import { getReadySteps, shouldSkipStep, evaluateCondition } from './dependency-resolver.js';

/**
 * Scheduler for parallel step execution
 */
export class Scheduler {
  constructor(
    private readonly plan: ExecutionPlan,
    private readonly config: ExecutorConfig
  ) {}

  /**
   * Get next batch of steps to execute
   *
   * Returns steps that:
   * 1. Have all dependencies completed
   * 2. Pass conditional checks
   * 3. Fit within parallelism limits
   * 4. Are not already running
   *
   * @param executions - Current step executions
   * @param context - Execution context
   * @returns Array of step IDs to execute
   */
  getNextBatch(
    executions: Map<string, StepExecution>,
    context: ExecutionContext
  ): string[] {
    // Get currently running steps
    const runningCount = Array.from(executions.values()).filter(
      (e) => e.status === 'running'
    ).length;

    // Calculate available slots
    const maxParallel = this.config.maxParallelSteps ?? 5;
    const availableSlots = maxParallel - runningCount;

    if (availableSlots <= 0) {
      return []; // No capacity for new steps
    }

    // Get steps ready to run (dependencies met)
    const readySteps = getReadySteps(this.plan, executions);

    // Filter out steps that should be skipped
    const executableSteps: Array<{ stepId: string; definition: StepDefinition }> = [];

    for (const stepId of readySteps) {
      // Check if step should be skipped due to failed dependencies
      if (shouldSkipStep(stepId, this.plan, executions)) {
        // Mark as skipped
        const execution = executions.get(stepId);
        if (execution) {
          execution.status = 'skipped';
        }
        continue;
      }

      // Check conditional execution
      const definition = this.plan.stepDefinitions.get(stepId);
      if (!definition) {
        continue;
      }

      if (!evaluateCondition(definition.condition, context)) {
        // Condition not met - mark as skipped
        const execution = executions.get(stepId);
        if (execution) {
          execution.status = 'skipped';
        }
        continue;
      }

      executableSteps.push({ stepId, definition });
    }

    // Note: readySteps from getReadySteps() is already sorted by priority,
    // and we iterate in order, so executableSteps preserves priority order.

    // Take up to availableSlots steps
    const batch = executableSteps.slice(0, availableSlots).map((s) => s.stepId);

    return batch;
  }

  /**
   * Check if workflow execution is complete
   *
   * @param executions - Current step executions
   * @returns True if all steps are in terminal state
   */
  isComplete(executions: Map<string, StepExecution>): boolean {
    return Array.from(executions.values()).every((execution) =>
      this.isTerminalStatus(execution.status)
    );
  }

  /**
   * Check if workflow has failed
   *
   * @param executions - Current step executions
   * @returns True if any critical step failed
   */
  hasFailed(executions: Map<string, StepExecution>): boolean {
    // A workflow fails if any step fails (unless it's optional/skippable)
    return Array.from(executions.values()).some(
      (execution) => execution.status === 'failed'
    );
  }

  /**
   * Check if status is terminal (no further state changes)
   *
   * @param status - Step execution status
   * @returns True if status is terminal
   */
  private isTerminalStatus(status: string): boolean {
    return ['completed', 'failed', 'skipped', 'cancelled'].includes(status);
  }

  /**
   * Get workflow progress
   *
   * @param executions - Current step executions
   * @returns Progress statistics
   */
  getProgress(executions: Map<string, StepExecution>): {
    total: number;
    completed: number;
    running: number;
    failed: number;
    skipped: number;
    pending: number;
  } {
    const stats = {
      total: this.plan.totalSteps,
      completed: 0,
      running: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
    };

    for (const execution of executions.values()) {
      switch (execution.status) {
        case 'completed':
          stats.completed++;
          break;
        case 'running':
          stats.running++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
        case 'pending':
          stats.pending++;
          break;
      }
    }

    return stats;
  }

  /**
   * Estimate remaining execution time
   *
   * Simple estimation based on average step duration.
   *
   * @param executions - Current step executions
   * @returns Estimated milliseconds remaining
   */
  estimateRemainingTime(executions: Map<string, StepExecution>): number {
    const completedSteps = Array.from(executions.values()).filter(
      (e) => e.status === 'completed' && e.durationMs
    );

    if (completedSteps.length === 0) {
      return 0; // Can't estimate without completed steps
    }

    // Calculate average step duration
    const totalDuration = completedSteps.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
    const avgDuration = totalDuration / completedSteps.length;

    // Estimate remaining steps
    const progress = this.getProgress(executions);
    const remainingSteps = progress.pending + progress.running;

    // Account for parallelism (steps run concurrently)
    const maxParallel = this.config.maxParallelSteps ?? 5;
    const estimatedWaves = Math.ceil(remainingSteps / maxParallel);

    return estimatedWaves * avgDuration;
  }

  /**
   * Get critical path (longest dependency chain)
   *
   * @returns Array of step IDs in critical path
   */
  getCriticalPath(): string[] {
    const memo = new Map<string, { length: number; path: string[] }>();

    const computeLength = (stepId: string): { length: number; path: string[] } => {
      if (memo.has(stepId)) {
        return memo.get(stepId)!;
      }

      const dependencies = this.plan.dependencyGraph.get(stepId) ?? new Set();
      if (dependencies.size === 0) {
        const result = { length: 1, path: [stepId] };
        memo.set(stepId, result);
        return result;
      }

      let maxLength = 0;
      let maxPath: string[] = [];

      for (const depId of dependencies) {
        const depResult = computeLength(depId);
        if (depResult.length > maxLength) {
          maxLength = depResult.length;
          maxPath = depResult.path;
        }
      }

      const result = {
        length: maxLength + 1,
        path: [...maxPath, stepId],
      };
      memo.set(stepId, result);
      return result;
    };

    // Find longest path among all steps
    let criticalPath: string[] = [];
    let maxLength = 0;

    for (const stepId of this.plan.stepDefinitions.keys()) {
      const result = computeLength(stepId);
      if (result.length > maxLength) {
        maxLength = result.length;
        criticalPath = result.path;
      }
    }

    return criticalPath;
  }

  /**
   * Calculate parallelism efficiency
   *
   * Returns ratio of actual concurrent execution to ideal.
   *
   * @param executions - Completed step executions
   * @returns Efficiency ratio (0-1)
   */
  calculateEfficiency(executions: Map<string, StepExecution>): number {
    const completedSteps = Array.from(executions.values()).filter(
      (e) => e.status === 'completed'
    );

    if (completedSteps.length === 0) {
      return 0;
    }

    // Calculate total execution time (wall clock)
    const startTimes = completedSteps
      .filter((e) => e.startedAt)
      .map((e) => e.startedAt!.getTime());
    const endTimes = completedSteps
      .filter((e) => e.completedAt)
      .map((e) => e.completedAt!.getTime());

    if (startTimes.length === 0 || endTimes.length === 0) {
      return 0;
    }

    const wallClockTime = Math.max(...endTimes) - Math.min(...startTimes);

    // Calculate total CPU time (sum of all step durations)
    const cpuTime = completedSteps.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

    // Efficiency = CPU time / (wall clock time * max parallel)
    const maxParallel = this.config.maxParallelSteps ?? 5;
    const idealTime = wallClockTime * maxParallel;

    return cpuTime / idealTime;
  }
}
