/**
 * Stub Agent Adapter - Phase 18
 *
 * Deterministic agent adapter for development and testing.
 * Produces predictable output without making real API calls.
 *
 * @module @gwi/core/agents/stub-adapter
 */

import type {
  AgentAdapter,
  AgentCapabilities,
  PlanInput,
  ExecuteInput,
  ImplementationPlan,
  ExecutionResult,
  ImplementationStep,
  StepExecutionResult,
} from './types.js';
import { ImplementationPlan as ImplementationPlanSchema } from './types.js';

/**
 * Configuration for StubAgentAdapter
 */
export interface StubAgentAdapterConfig {
  /** Whether to simulate failures for testing */
  simulateFailures?: boolean;
  /** Failure rate (0-1) when simulateFailures is true */
  failureRate?: number;
  /** Artificial delay in ms */
  delayMs?: number;
  /** Seed for deterministic output */
  seed?: string;
}

/**
 * StubAgentAdapter - Deterministic agent for dev/tests
 *
 * Generates predictable implementation plans and execution results
 * without making real AI API calls.
 */
export class StubAgentAdapter implements AgentAdapter {
  readonly name = 'stub';
  readonly version = '1.0.0';

  private readonly config: Required<StubAgentAdapterConfig>;

  constructor(config: StubAgentAdapterConfig = {}) {
    this.config = {
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
      delayMs: config.delayMs ?? 0,
      seed: config.seed ?? 'stub-seed',
    };
  }

  /**
   * Generate a deterministic implementation plan
   */
  async planCandidate(input: PlanInput): Promise<ImplementationPlan> {
    await this.maybeDelay();
    this.maybeThrow('Planning failed (simulated)');

    const planId = `plan-${this.deterministicId(input.workItem.id)}`;
    const candidateId = input.candidate?.id ?? `candidate-${this.deterministicId(input.workItem.id)}`;

    // Generate steps based on work item type
    const steps = this.generateSteps(input);

    // Calculate affected files from steps
    const affectedFiles = [...new Set(steps.flatMap(s => s.files ?? []))];

    // Determine required scopes from step policy classes
    const requiredScopes = this.computeRequiredScopes(steps);

    // Calculate complexity based on step count and policy classes
    const complexity = Math.min(5, Math.ceil(steps.length / 2));

    // Calculate confidence based on work item clarity
    const confidence = this.calculateConfidence(input);

    const plan: ImplementationPlan = {
      id: planId,
      candidateId,
      summary: this.generateSummary(input),
      steps,
      affectedFiles,
      complexity,
      risk: {
        level: complexity > 3 ? 'medium' : 'low',
        score: complexity * 15,
        factors: this.generateRiskFactors(input, steps),
        mitigations: ['Run tests before merging', 'Review changes carefully'],
      },
      requiredScopes,
      confidence,
      reasoning: `Stub adapter generated plan for work item: ${input.workItem.title}`,
      generatedAt: new Date().toISOString(),
    };

    // Validate against schema
    return ImplementationPlanSchema.parse(plan);
  }

  /**
   * Execute a plan and produce deterministic results
   */
  async executePlan(input: ExecuteInput): Promise<ExecutionResult> {
    await this.maybeDelay();
    this.maybeThrow('Execution failed (simulated)');

    const executionId = `exec-${this.deterministicId(input.plan.id)}`;
    const startTime = Date.now();

    // Check approval scopes
    const missingScopes = input.plan.requiredScopes.filter(
      scope => !input.approvedScopes.includes(scope as never)
    );

    if (missingScopes.length > 0 && !input.dryRun) {
      return {
        id: executionId,
        planId: input.plan.id,
        candidateId: input.plan.candidateId,
        success: false,
        stepResults: [],
        error: `Missing required approval scopes: ${missingScopes.join(', ')}`,
        durationMs: Date.now() - startTime,
        intentReceipt: this.generateIntentReceipt(input, false, 'Missing approvals'),
        executedAt: new Date().toISOString(),
      };
    }

    // Execute steps
    const stepResults: StepExecutionResult[] = [];
    let success = true;
    let errorMessage: string | undefined;

    for (const step of input.plan.steps) {
      const stepResult = await this.executeStep(step, input.dryRun ?? false);
      stepResults.push(stepResult);

      if (!stepResult.success) {
        success = false;
        errorMessage = stepResult.error;
        break;
      }
    }

    // Generate branch name and PR info if successful
    const branchName = success ? `gwi/${input.plan.candidateId}` : undefined;
    const commits = success
      ? [{ sha: this.deterministicId(executionId), message: input.plan.summary }]
      : undefined;
    const prNumber = success && !input.dryRun ? this.deterministicNumber(executionId) : undefined;
    const prUrl = prNumber
      ? `https://github.com/${input.repo.fullName}/pull/${prNumber}`
      : undefined;

    return {
      id: executionId,
      planId: input.plan.id,
      candidateId: input.plan.candidateId,
      success,
      stepResults,
      branchName,
      commits,
      prUrl,
      prNumber,
      error: errorMessage,
      durationMs: Date.now() - startTime,
      intentReceipt: this.generateIntentReceipt(input, success, errorMessage),
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Health check - always healthy for stub
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    await this.maybeDelay();
    return { healthy: true, message: 'Stub adapter is always healthy' };
  }

  /**
   * Get adapter capabilities
   */
  getCapabilities(): AgentCapabilities {
    return {
      canPlan: true,
      canExecute: true,
      supportsDryRun: true,
      supportedWorkTypes: [
        'issue_to_code',
        'pr_review',
        'pr_resolve',
        'docs_update',
        'test_gen',
        'custom',
      ],
      maxComplexity: 5,
      requiresNetwork: false,
    };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private async maybeDelay(): Promise<void> {
    if (this.config.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.delayMs));
    }
  }

  private maybeThrow(message: string): void {
    if (this.config.simulateFailures && Math.random() < this.config.failureRate) {
      throw new Error(message);
    }
  }

  private deterministicId(input: string): string {
    // Simple deterministic hash for testing
    let hash = 0;
    const str = `${this.config.seed}-${input}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private deterministicNumber(input: string): number {
    const id = this.deterministicId(input);
    return parseInt(id.substring(0, 4), 16) % 1000 + 1;
  }

  private generateSteps(input: PlanInput): ImplementationStep[] {
    const steps: ImplementationStep[] = [];
    const workType = input.workItem.type;

    // Read-only analysis step
    steps.push({
      order: 1,
      description: 'Analyze existing codebase',
      tool: 'read_files',
      args: { paths: ['src/**/*.ts'] },
      policyClass: 'read_only',
      files: [],
      expectedOutput: 'status',
      reversible: true,
    });

    // Type-specific steps
    switch (workType) {
      case 'issue_to_code':
        steps.push({
          order: 2,
          description: 'Create implementation files',
          tool: 'write_files',
          args: { files: ['src/new-feature.ts'] },
          policyClass: 'additive',
          files: ['src/new-feature.ts'],
          expectedOutput: 'file',
          reversible: true,
        });
        break;

      case 'pr_resolve':
        steps.push({
          order: 2,
          description: 'Resolve merge conflicts',
          tool: 'resolve_conflicts',
          args: { strategy: 'auto' },
          policyClass: 'destructive',
          files: input.candidate?.plan?.affectedFiles ?? [],
          expectedOutput: 'file',
          reversible: false,
        });
        break;

      case 'pr_review':
        steps.push({
          order: 2,
          description: 'Generate review comments',
          tool: 'add_review',
          args: { type: 'comprehensive' },
          policyClass: 'informational',
          expectedOutput: 'comment',
          reversible: true,
        });
        break;

      default:
        steps.push({
          order: 2,
          description: 'Apply changes',
          tool: 'apply_patch',
          args: {},
          policyClass: 'additive',
          files: input.candidate?.plan?.affectedFiles ?? [],
          expectedOutput: 'file',
          reversible: true,
        });
    }

    // Commit step (if we have code changes)
    if (workType !== 'pr_review') {
      steps.push({
        order: 3,
        description: 'Commit changes',
        tool: 'git_commit',
        args: { message: input.workItem.title },
        policyClass: 'destructive',
        expectedOutput: 'commit',
        reversible: false,
      });
    }

    return steps;
  }

  private computeRequiredScopes(steps: ImplementationStep[]): string[] {
    const scopes = new Set<string>();

    for (const step of steps) {
      if (step.policyClass === 'additive') {
        scopes.add('commit');
      } else if (step.policyClass === 'destructive') {
        scopes.add('commit');
        scopes.add('push');
        scopes.add('open_pr');
      }
    }

    return Array.from(scopes);
  }

  private calculateConfidence(input: PlanInput): number {
    let confidence = 70; // Base confidence

    // Boost for clear title
    if (input.workItem.title && input.workItem.title.length > 10) {
      confidence += 10;
    }

    // Boost for existing candidate with plan
    if (input.candidate?.plan?.affectedFiles?.length) {
      confidence += 15;
    }

    // Reduce for high complexity
    if (input.candidate?.risk?.score && input.candidate.risk.score > 50) {
      confidence -= 10;
    }

    return Math.min(100, Math.max(0, confidence));
  }

  private generateSummary(input: PlanInput): string {
    const workType = input.workItem.type;
    const title = input.workItem.title;

    switch (workType) {
      case 'issue_to_code':
        return `Implement: ${title}`;
      case 'pr_resolve':
        return `Resolve conflicts: ${title}`;
      case 'pr_review':
        return `Review: ${title}`;
      case 'docs_update':
        return `Update documentation: ${title}`;
      case 'test_gen':
        return `Generate tests: ${title}`;
      default:
        return `Process: ${title}`;
    }
  }

  private generateRiskFactors(
    input: PlanInput,
    steps: ImplementationStep[]
  ): Array<{ name: string; severity: number; description: string }> {
    const factors: Array<{ name: string; severity: number; description: string }> = [];

    // Check for destructive operations
    const destructiveSteps = steps.filter(s => s.policyClass === 'destructive');
    if (destructiveSteps.length > 0) {
      factors.push({
        name: 'destructive_operations',
        severity: 60,
        description: `Plan includes ${destructiveSteps.length} destructive operation(s)`,
      });
    }

    // Check file count
    const fileCount = input.candidate?.plan?.affectedFiles?.length ?? 0;
    if (fileCount > 5) {
      factors.push({
        name: 'many_files',
        severity: 40,
        description: `Plan affects ${fileCount} files`,
      });
    }

    // Add base risk factor
    if (factors.length === 0) {
      factors.push({
        name: 'standard_change',
        severity: 20,
        description: 'Standard change with low risk',
      });
    }

    return factors;
  }

  private async executeStep(
    step: ImplementationStep,
    dryRun: boolean
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();

    if (dryRun) {
      return {
        order: step.order,
        success: true,
        output: { dryRun: true, tool: step.tool, skipped: true },
        durationMs: Date.now() - startTime,
      };
    }

    // Simulate step execution
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      order: step.order,
      success: true,
      output: { tool: step.tool, completed: true },
      durationMs: Date.now() - startTime,
      artifacts: step.files?.length
        ? Object.fromEntries(step.files.map(f => [f, 'modified']))
        : undefined,
    };
  }

  private generateIntentReceipt(
    input: ExecuteInput,
    success: boolean,
    error?: string
  ): ExecutionResult['intentReceipt'] {
    return {
      intent: input.plan.summary,
      changeSummary: success
        ? `Executed ${input.plan.steps.length} steps affecting ${input.plan.affectedFiles.length} files`
        : `Failed: ${error}`,
      actor: 'stub-agent',
      when: new Date().toISOString(),
      scope: input.repo.fullName,
      policyApproval: input.approvedScopes.join(', ') || 'none',
      evidence: input.dryRun ? 'dry-run' : success ? 'execution-complete' : 'execution-failed',
      traceId: input.runId,
      runId: input.runId,
    };
  }
}

/**
 * Create a StubAgentAdapter with default config
 */
export function createStubAdapter(
  config?: StubAgentAdapterConfig
): StubAgentAdapter {
  return new StubAgentAdapter(config);
}
