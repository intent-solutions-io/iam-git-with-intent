/**
 * Parallel Executor
 *
 * Executes workflow steps concurrently with controlled parallelism.
 *
 * @module @gwi/engine/executor
 */

import type {
  WorkflowDefinition,
  StepDefinition,
  StepExecution,
  ExecutionPlan,
  ExecutionContext,
  ExecutionResult,
  ExecutorConfig,
  StepRetryConfig,
} from './types.js';
import { resolveExecutionPlan } from './dependency-resolver.js';
import { Scheduler } from './scheduler.js';
import { DEFAULT_EXECUTOR_CONFIG, DEFAULT_RETRY_CONFIG } from './types.js';

/**
 * Step executor function type
 *
 * Executes a single step and returns its output.
 */
export type StepExecutorFn = (
  stepDefinition: StepDefinition,
  context: ExecutionContext
) => Promise<unknown>;

/**
 * Parallel workflow executor
 *
 * Executes workflow steps concurrently respecting DAG dependencies.
 */
export class ParallelExecutor {
  private readonly config: ExecutorConfig;

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Execute a workflow
   *
   * @param workflow - Workflow definition with DAG
   * @param context - Execution context
   * @param stepExecutor - Function to execute individual steps
   * @returns Execution result
   */
  async executeWorkflow(
    workflow: WorkflowDefinition,
    context: ExecutionContext,
    stepExecutor: StepExecutorFn
  ): Promise<ExecutionResult> {
    const startedAt = new Date();

    // Resolve execution plan from DAG
    const plan = resolveExecutionPlan(workflow);

    // Create scheduler
    const scheduler = new Scheduler(plan, this.config);

    // Initialize step executions
    const executions = new Map<string, StepExecution>();
    for (const stepId of plan.stepDefinitions.keys()) {
      executions.set(stepId, {
        stepId,
        status: 'pending',
        retryAttempts: 0,
      });
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    if (context.abortSignal) {
      // Chain parent abort signal
      context.abortSignal.addEventListener('abort', () => {
        abortController.abort();
      });
    }

    // Execute workflow
    try {
      await this.executeSteps(
        plan,
        executions,
        context,
        stepExecutor,
        scheduler,
        abortController.signal
      );
    } catch (error) {
      // Handle catastrophic errors
      return this.createErrorResult(
        workflow.id,
        executions,
        startedAt,
        error as Error
      );
    }

    // Check for cancellation
    if (abortController.signal.aborted) {
      return this.createCancelledResult(workflow.id, executions, startedAt);
    }

    // Build final result
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Calculate statistics
    const stats = this.calculateStats(executions);

    // Get final output (output of last completed step)
    const finalOutput = this.getFinalOutput(plan, executions);

    // Check overall success
    const success = !scheduler.hasFailed(executions);

    return {
      workflowId: workflow.id,
      success,
      stepExecutions: executions,
      output: finalOutput,
      error: success ? undefined : new Error('Workflow failed'),
      startedAt,
      completedAt,
      durationMs,
      totalTokensUsed: this.calculateTotalTokens(executions),
      stats,
    };
  }

  /**
   * Execute steps in parallel waves
   */
  private async executeSteps(
    plan: ExecutionPlan,
    executions: Map<string, StepExecution>,
    context: ExecutionContext,
    stepExecutor: StepExecutorFn,
    scheduler: Scheduler,
    abortSignal: AbortSignal
  ): Promise<void> {
    const runningSteps = new Map<string, Promise<void>>();

    while (!scheduler.isComplete(executions) && !abortSignal.aborted) {
      // Get next batch of steps to execute
      const batch = scheduler.getNextBatch(executions, context);

      // Start new steps
      for (const stepId of batch) {
        const stepDefinition = plan.stepDefinitions.get(stepId);
        if (!stepDefinition) {
          continue;
        }

        const execution = executions.get(stepId)!;
        execution.status = 'running';
        execution.startedAt = new Date();

        // Notify state change
        this.config.onStepStateChange?.(stepId, 'running', execution);

        // Start step execution
        const stepPromise = this.executeStep(
          stepDefinition,
          execution,
          context,
          stepExecutor,
          abortSignal
        ).finally(() => {
          // Remove from running set when complete
          runningSteps.delete(stepId);

          // Notify state change
          this.config.onStepStateChange?.(stepId, execution.status, execution);

          // Notify progress
          const progress = scheduler.getProgress(executions);
          this.config.onProgress?.(
            progress.completed + progress.failed + progress.skipped,
            progress.total
          );
        });

        runningSteps.set(stepId, stepPromise);
      }

      // Wait for at least one step to complete before scheduling more
      if (runningSteps.size > 0) {
        await Promise.race(runningSteps.values());
      } else if (!scheduler.isComplete(executions)) {
        // Deadlock detection - no steps running but workflow not complete
        throw new Error('Workflow deadlock: no steps can run but workflow incomplete');
      }
    }

    // Wait for all remaining steps to complete
    await Promise.all(runningSteps.values());
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStep(
    definition: StepDefinition,
    execution: StepExecution,
    context: ExecutionContext,
    stepExecutor: StepExecutorFn,
    abortSignal: AbortSignal
  ): Promise<void> {
    const retryConfig: StepRetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...this.config.defaultRetry,
      ...definition.retry,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
      if (abortSignal.aborted) {
        execution.status = 'cancelled';
        return;
      }

      try {
        execution.retryAttempts = attempt;

        // Execute step with timeout
        const timeoutMs =
          definition.timeoutMs ?? this.config.defaultStepTimeoutMs ?? 300000;
        const output = await this.executeWithTimeout(
          stepExecutor(definition, context),
          timeoutMs,
          abortSignal
        );

        // Success
        execution.output = output;
        execution.status = 'completed';
        execution.completedAt = new Date();
        execution.durationMs =
          execution.completedAt.getTime() - (execution.startedAt?.getTime() ?? 0);

        // Store output in context for dependent steps
        context.stepOutputs.set(definition.id, output);

        return;
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (this.isNonRetryableError(lastError, retryConfig)) {
          break; // Don't retry
        }

        // Calculate backoff delay
        if (attempt < retryConfig.maxAttempts - 1) {
          const delay = Math.min(
            retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt),
            retryConfig.maxDelayMs
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    execution.status = 'failed';
    execution.error = lastError;
    execution.completedAt = new Date();
    execution.durationMs =
      execution.completedAt.getTime() - (execution.startedAt?.getTime() ?? 0);
  }

  /**
   * Execute promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    abortSignal: AbortSignal
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Step execution timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Step execution cancelled'));
        });
      }),
    ]);
  }

  /**
   * Check if error should not trigger retry
   */
  private isNonRetryableError(error: Error, config: StepRetryConfig): boolean {
    const nonRetryable = config.nonRetryableErrors ?? [];
    return nonRetryable.some((errorName) => error.name === errorName);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get final workflow output
   */
  private getFinalOutput(
    plan: ExecutionPlan,
    executions: Map<string, StepExecution>
  ): unknown {
    // Find the last completed step (no dependents)
    for (const stepId of plan.stepDefinitions.keys()) {
      const dependents = plan.dependentGraph.get(stepId) ?? new Set();
      if (dependents.size === 0) {
        const execution = executions.get(stepId);
        if (execution?.status === 'completed') {
          return execution.output;
        }
      }
    }

    return undefined;
  }

  /**
   * Calculate execution statistics
   */
  private calculateStats(executions: Map<string, StepExecution>): ExecutionResult['stats'] {
    const stats = {
      totalSteps: executions.size,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      cancelledSteps: 0,
      totalRetries: 0,
    };

    for (const execution of executions.values()) {
      stats.totalRetries += execution.retryAttempts;

      switch (execution.status) {
        case 'completed':
          stats.completedSteps++;
          break;
        case 'failed':
          stats.failedSteps++;
          break;
        case 'skipped':
          stats.skippedSteps++;
          break;
        case 'cancelled':
          stats.cancelledSteps++;
          break;
      }
    }

    return stats;
  }

  /**
   * Calculate total tokens used
   */
  private calculateTotalTokens(
    executions: Map<string, StepExecution>
  ): { input: number; output: number } | undefined {
    let totalInput = 0;
    let totalOutput = 0;
    let hasTokens = false;

    for (const execution of executions.values()) {
      if (execution.tokensUsed) {
        totalInput += execution.tokensUsed.input;
        totalOutput += execution.tokensUsed.output;
        hasTokens = true;
      }
    }

    return hasTokens ? { input: totalInput, output: totalOutput } : undefined;
  }

  /**
   * Create error result
   */
  private createErrorResult(
    workflowId: string,
    executions: Map<string, StepExecution>,
    startedAt: Date,
    error: Error
  ): ExecutionResult {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    return {
      workflowId,
      success: false,
      stepExecutions: executions,
      error,
      startedAt,
      completedAt,
      durationMs,
      stats: this.calculateStats(executions),
    };
  }

  /**
   * Create cancelled result
   */
  private createCancelledResult(
    workflowId: string,
    executions: Map<string, StepExecution>,
    startedAt: Date
  ): ExecutionResult {
    // Mark all pending/running steps as cancelled
    for (const execution of executions.values()) {
      if (execution.status === 'pending' || execution.status === 'running') {
        execution.status = 'cancelled';
        execution.completedAt = new Date();
        if (execution.startedAt) {
          execution.durationMs = execution.completedAt.getTime() - execution.startedAt.getTime();
        }
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    return {
      workflowId,
      success: false,
      stepExecutions: executions,
      error: new Error('Workflow cancelled'),
      startedAt,
      completedAt,
      durationMs,
      stats: this.calculateStats(executions),
    };
  }
}
