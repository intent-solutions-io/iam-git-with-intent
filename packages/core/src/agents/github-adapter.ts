/**
 * GitHub Agent Adapter - Phase 19
 *
 * Production agent adapter that executes plans via the GitHub connector.
 * Uses invokeTool() for all GitHub operations to ensure policy enforcement.
 *
 * @module @gwi/core/agents/github-adapter
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
import { ImplementationPlan as ImplementationPlanSchema, STEP_CLASS_SCOPES } from './types.js';
import type { ApprovalScope } from '../run-bundle/types.js';
import {
  invokeTool,
  getConnectorRegistry,
  type ConnectorRegistry,
  type ToolInvocationRequest,
} from '../connectors/index.js';

/** Inline approval record type matching ToolInvocationRequest.approval */
type ApprovalRecord = NonNullable<ToolInvocationRequest['approval']>;
import { getLogger } from '../reliability/observability.js';
import { formatIntentReceiptAsComment } from './intent-receipt.js';

const logger = getLogger('github-adapter');

/**
 * Configuration for GitHubAgentAdapter
 */
export interface GitHubAgentAdapterConfig {
  /** GitHub token for authentication */
  token?: string;
  /** GitHub App installation ID */
  installationId?: number;
  /** Base path for audit logs */
  auditBasePath?: string;
  /** Whether to post Intent Receipt comments on PRs */
  postIntentReceipt?: boolean;
}

/**
 * GitHubAgentAdapter - Production adapter using GitHub connector
 *
 * Executes implementation plans by invoking GitHub connector tools
 * through the unified invokeTool() pipeline with full policy enforcement.
 */
export class GitHubAgentAdapter implements AgentAdapter {
  readonly name = 'github';
  readonly version = '1.0.0';

  private readonly config: Required<GitHubAgentAdapterConfig>;
  private registry: ConnectorRegistry;

  constructor(config: GitHubAgentAdapterConfig = {}) {
    this.config = {
      token: config.token ?? process.env.GITHUB_TOKEN ?? '',
      installationId: config.installationId ?? 0,
      auditBasePath: config.auditBasePath ?? '',
      postIntentReceipt: config.postIntentReceipt ?? true,
    };
    this.registry = getConnectorRegistry();
  }

  /**
   * Generate an implementation plan for a work item
   *
   * Note: This adapter focuses on EXECUTION. Planning is typically done
   * by a separate LLM-based planner. For now, returns a stub plan or
   * validates/enhances an existing candidate plan.
   */
  async planCandidate(input: PlanInput): Promise<ImplementationPlan> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const candidateId = input.candidate?.id ?? `candidate-${planId}`;

    // If we have an existing candidate plan, convert it to ImplementationPlan format
    if (input.candidate?.plan) {
      const existingPlan = input.candidate.plan;
      const steps: ImplementationStep[] = existingPlan.steps.map((step, idx) => ({
        order: step.order ?? idx + 1,
        description: step.description,
        tool: this.mapActionToTool(step.action),
        args: { files: step.files ?? [] },
        policyClass: this.mapActionToPolicyClass(step.action),
        files: step.files,
        expectedOutput: this.mapActionToOutput(step.action),
        reversible: step.action !== 'delete',
      }));

      // Add execution steps
      steps.push(
        {
          order: steps.length + 1,
          description: 'Create feature branch',
          tool: 'github.createBranch',
          args: { branchName: `gwi/${candidateId}`, fromRef: input.repo.defaultBranch ?? 'main' },
          policyClass: 'destructive',
          expectedOutput: 'branch',
          reversible: true,
        },
        {
          order: steps.length + 2,
          description: 'Commit changes',
          tool: 'github.pushCommit',
          args: { message: existingPlan.summary },
          policyClass: 'destructive',
          expectedOutput: 'commit',
          reversible: false,
        },
        {
          order: steps.length + 3,
          description: 'Create pull request',
          tool: 'github.createPullRequest',
          args: { title: input.workItem.title, body: existingPlan.summary },
          policyClass: 'destructive',
          expectedOutput: 'pr',
          reversible: true,
        }
      );

      const requiredScopes = this.computeRequiredScopes(steps);

      return ImplementationPlanSchema.parse({
        id: planId,
        candidateId,
        summary: existingPlan.summary,
        steps,
        affectedFiles: existingPlan.affectedFiles,
        complexity: existingPlan.complexity,
        risk: input.candidate.risk ?? {
          level: 'low',
          score: 20,
          factors: [{ name: 'standard_change', severity: 20, description: 'Standard change' }],
        },
        requiredScopes,
        confidence: input.candidate.confidence ?? 70,
        reasoning: `Plan based on candidate ${candidateId}`,
        generatedAt: new Date().toISOString(),
      });
    }

    // Generate a minimal plan for the work item
    const steps: ImplementationStep[] = [
      {
        order: 1,
        description: 'Create feature branch',
        tool: 'github.createBranch',
        args: {
          branchName: `gwi/${candidateId}`,
          fromRef: input.repo.defaultBranch ?? 'main',
        },
        policyClass: 'destructive',
        expectedOutput: 'branch',
        reversible: true,
      },
      {
        order: 2,
        description: 'Commit changes',
        tool: 'github.pushCommit',
        args: {
          message: input.workItem.title,
          files: [],
        },
        policyClass: 'destructive',
        expectedOutput: 'commit',
        reversible: false,
      },
      {
        order: 3,
        description: 'Create pull request',
        tool: 'github.createPullRequest',
        args: {
          title: input.workItem.title,
          body: input.workItem.summary,
          draft: false,
        },
        policyClass: 'destructive',
        expectedOutput: 'pr',
        reversible: true,
      },
    ];

    const requiredScopes = this.computeRequiredScopes(steps);

    return ImplementationPlanSchema.parse({
      id: planId,
      candidateId,
      summary: `Implement: ${input.workItem.title}`,
      steps,
      affectedFiles: [],
      complexity: 2,
      risk: {
        level: 'low',
        score: 25,
        factors: [{ name: 'minimal_plan', severity: 25, description: 'Minimal implementation plan' }],
      },
      requiredScopes,
      confidence: 60,
      reasoning: `Minimal plan for work item: ${input.workItem.id}`,
      generatedAt: new Date().toISOString(),
    });
  }

  /**
   * Execute a plan to create a PR via GitHub connector tools
   */
  async executePlan(input: ExecuteInput): Promise<ExecutionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    logger.info('Starting plan execution', {
      executionId,
      planId: input.plan.id,
      candidateId: input.plan.candidateId,
      tenantId: input.tenantId,
      dryRun: input.dryRun,
    });

    // Build approval record for invokeTool
    const approval: ApprovalRecord | undefined = input.approvedScopes.length > 0
      ? {
          runId: input.runId ?? executionId,
          approvedAt: new Date().toISOString(),
          approvedBy: 'gwi-system',
          scope: input.approvedScopes,
          patchHash: input.patchHash ?? '',
        }
      : undefined;

    // Validate we have required scopes
    const requiredScopes = this.computeRequiredScopes(input.plan.steps);
    const missingScopes = requiredScopes.filter(
      scope => !input.approvedScopes.includes(scope)
    );

    if (missingScopes.length > 0 && !input.dryRun) {
      logger.warn('Missing required approval scopes', { missingScopes });
      return {
        id: executionId,
        planId: input.plan.id,
        candidateId: input.plan.candidateId,
        success: false,
        stepResults: [],
        error: `Missing required approval scopes: ${missingScopes.join(', ')}`,
        durationMs: Date.now() - startTime,
        intentReceipt: this.createIntentReceipt(input, false, `Missing scopes: ${missingScopes.join(', ')}`),
        executedAt: new Date().toISOString(),
      };
    }

    // Execute plan steps
    const stepResults: StepExecutionResult[] = [];
    let branchName: string | undefined;
    let branchSha: string | undefined;
    const commits: Array<{ sha: string; message: string }> = [];
    let prUrl: string | undefined;
    let prNumber: number | undefined;

    for (const step of input.plan.steps) {
      if (input.dryRun) {
        stepResults.push({
          order: step.order,
          success: true,
          output: { dryRun: true, tool: step.tool, skipped: true },
          durationMs: 0,
        });
        continue;
      }

      const stepResult = await this.executeStep(
        step,
        input,
        approval,
        { branchName, branchSha, commits }
      );

      stepResults.push(stepResult);

      if (!stepResult.success) {
        logger.error('Step execution failed', {
          step: step.order,
          tool: step.tool,
          error: stepResult.error,
        });

        return {
          id: executionId,
          planId: input.plan.id,
          candidateId: input.plan.candidateId,
          success: false,
          stepResults,
          branchName,
          commits: commits.length > 0 ? commits : undefined,
          error: stepResult.error,
          durationMs: Date.now() - startTime,
          intentReceipt: this.createIntentReceipt(input, false, stepResult.error),
          executedAt: new Date().toISOString(),
        };
      }

      // Extract results from successful steps
      const output = stepResult.output as Record<string, unknown> | undefined;
      if (output) {
        if (step.tool === 'github.createBranch') {
          branchName = output.ref as string;
          branchSha = output.sha as string;
        } else if (step.tool === 'github.pushCommit') {
          commits.push({
            sha: output.sha as string,
            message: step.args.message as string ?? input.plan.summary,
          });
        } else if (step.tool === 'github.createPullRequest') {
          prUrl = output.htmlUrl as string;
          prNumber = output.prNumber as number;
        }
      }
    }

    // Post Intent Receipt comment if PR was created
    if (prNumber && this.config.postIntentReceipt && !input.dryRun) {
      const intentReceipt = this.createIntentReceipt(input, true);
      const commentResult = await this.postIntentReceiptComment(
        input,
        prNumber,
        intentReceipt,
        approval
      );

      if (!commentResult.success) {
        logger.warn('Failed to post Intent Receipt comment', {
          prNumber,
          error: commentResult.error,
        });
      }
    }

    logger.info('Plan execution completed', {
      executionId,
      success: true,
      branchName,
      prNumber,
      prUrl,
      durationMs: Date.now() - startTime,
    });

    return {
      id: executionId,
      planId: input.plan.id,
      candidateId: input.plan.candidateId,
      success: true,
      stepResults,
      branchName,
      commits: commits.length > 0 ? commits : undefined,
      prUrl,
      prNumber,
      durationMs: Date.now() - startTime,
      intentReceipt: this.createIntentReceipt(input, true),
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Health check - verify GitHub connector is available
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const connector = this.registry.get('github');

    if (!connector) {
      return {
        healthy: false,
        message: 'GitHub connector not registered in registry',
      };
    }

    if (!this.config.token) {
      return {
        healthy: false,
        message: 'GitHub token not configured',
      };
    }

    try {
      if (!connector.healthcheck) {
        // Connector doesn't implement healthcheck, assume healthy if registered
        return {
          healthy: true,
          message: 'GitHub connector registered (no healthcheck method)',
        };
      }
      const healthOk = await connector.healthcheck();
      return {
        healthy: healthOk,
        message: healthOk ? 'GitHub connector healthy' : 'GitHub connector health check failed',
      };
    } catch (error) {
      return {
        healthy: false,
        message: `GitHub connector health check error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
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
      requiresNetwork: true,
    };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Execute a single step via invokeTool
   */
  private async executeStep(
    step: ImplementationStep,
    input: ExecuteInput,
    approval: ApprovalRecord | undefined,
    context: { branchName?: string; branchSha?: string; commits: Array<{ sha: string; message: string }> }
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();

    // Build tool input based on step
    const toolInput = this.buildToolInput(step, input, context);

    const request: ToolInvocationRequest = {
      runId: input.runId ?? `run-${Date.now()}`,
      tenantId: input.tenantId,
      toolName: step.tool,
      input: toolInput,
      approval,
    };

    logger.debug('Invoking tool', {
      tool: step.tool,
      runId: request.runId,
    });

    const result = await invokeTool(
      this.registry,
      request,
      this.config.auditBasePath
    );

    return {
      order: step.order,
      success: result.success,
      output: result.output,
      error: result.error,
      durationMs: result.durationMs ?? (Date.now() - startTime),
      artifacts: result.auditEventIds
        ? { auditEvents: result.auditEventIds.join(',') }
        : undefined,
    };
  }

  /**
   * Build tool input from step and context
   */
  private buildToolInput(
    step: ImplementationStep,
    input: ExecuteInput,
    context: { branchName?: string; branchSha?: string; commits: Array<{ sha: string; message: string }> }
  ): Record<string, unknown> {
    const baseInput: Record<string, unknown> = {
      owner: input.repo.owner,
      repo: input.repo.name,
      ...step.args,
    };

    switch (step.tool) {
      case 'github.createBranch':
        return {
          ...baseInput,
          branchName: step.args.branchName ?? `gwi/${input.plan.candidateId}`,
          fromRef: step.args.fromRef ?? input.repo.defaultBranch,
        };

      case 'github.pushCommit':
        return {
          ...baseInput,
          branch: context.branchName ?? step.args.branch,
          message: step.args.message ?? input.plan.summary,
          files: step.args.files ?? [],
          parentSha: context.branchSha ?? context.commits.at(-1)?.sha,
        };

      case 'github.createPullRequest':
        return {
          ...baseInput,
          title: step.args.title ?? input.plan.summary,
          body: step.args.body ?? this.buildPRBody(input),
          headBranch: context.branchName ?? step.args.headBranch,
          baseBranch: step.args.baseBranch ?? input.repo.defaultBranch,
          draft: step.args.draft ?? false,
        };

      case 'github.postComment':
        return {
          ...baseInput,
          issueNumber: step.args.issueNumber,
          body: step.args.body,
        };

      default:
        return baseInput;
    }
  }

  /**
   * Build PR body with Intent Receipt format
   */
  private buildPRBody(input: ExecuteInput): string {
    const sections: string[] = [];

    sections.push(`## Summary`);
    sections.push(input.plan.summary);
    sections.push('');

    sections.push(`## Changes`);
    if (input.plan.affectedFiles.length > 0) {
      for (const file of input.plan.affectedFiles.slice(0, 10)) {
        sections.push(`- \`${file}\``);
      }
      if (input.plan.affectedFiles.length > 10) {
        sections.push(`- _...and ${input.plan.affectedFiles.length - 10} more_`);
      }
    } else {
      sections.push('_No files listed_');
    }
    sections.push('');

    sections.push(`## Risk Assessment`);
    sections.push(`- **Level**: ${input.plan.risk.level}`);
    sections.push(`- **Score**: ${input.plan.risk.score}/100`);
    sections.push(`- **Confidence**: ${input.plan.confidence}%`);
    sections.push('');

    sections.push('---');
    sections.push('_Generated by [Git With Intent](https://github.com/git-with-intent)_');

    return sections.join('\n');
  }

  /**
   * Post Intent Receipt comment on PR
   */
  private async postIntentReceiptComment(
    input: ExecuteInput,
    prNumber: number,
    intentReceipt: ExecutionResult['intentReceipt'],
    approval: ApprovalRecord | undefined
  ): Promise<{ success: boolean; error?: string }> {
    const formatted = formatIntentReceiptAsComment(intentReceipt, {
      includeEvidence: true,
      includeTraceIds: true,
    });

    const request: ToolInvocationRequest = {
      runId: input.runId ?? `run-${Date.now()}`,
      tenantId: input.tenantId,
      toolName: 'github.postComment',
      input: {
        owner: input.repo.owner,
        repo: input.repo.name,
        issueNumber: prNumber,
        body: formatted.markdown,
      },
      approval, // Comments are WRITE_NON_DESTRUCTIVE, approval not required
    };

    const result = await invokeTool(this.registry, request, this.config.auditBasePath);

    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Create Intent Receipt from execution context
   */
  private createIntentReceipt(
    input: ExecuteInput,
    success: boolean,
    error?: string
  ): ExecutionResult['intentReceipt'] {
    return {
      intent: input.plan.summary,
      changeSummary: success
        ? `Executed ${input.plan.steps.length} steps affecting ${input.plan.affectedFiles.length} files`
        : `Failed: ${error ?? 'Unknown error'}`,
      actor: 'github-agent',
      when: new Date().toISOString(),
      scope: input.repo.fullName,
      policyApproval: input.approvedScopes.length > 0
        ? `Approved: ${input.approvedScopes.join(', ')}`
        : 'No approval',
      evidence: `Complexity: ${input.plan.complexity}/5, Confidence: ${input.plan.confidence}%, Risk: ${input.plan.risk.level}`,
      traceId: input.runId,
      runId: input.runId,
    };
  }

  /**
   * Compute required scopes from steps
   */
  private computeRequiredScopes(steps: ImplementationStep[]): ApprovalScope[] {
    const scopes = new Set<ApprovalScope>();

    for (const step of steps) {
      const stepScopes = STEP_CLASS_SCOPES[step.policyClass] ?? [];
      for (const scope of stepScopes) {
        scopes.add(scope);
      }
    }

    return Array.from(scopes);
  }

  /**
   * Map candidate action to tool name
   */
  private mapActionToTool(action: string): string {
    const actionMap: Record<string, string> = {
      create: 'file.create',
      modify: 'file.modify',
      delete: 'file.delete',
      review: 'github.postComment',
      test: 'runner.test',
    };
    return actionMap[action] ?? 'file.modify';
  }

  /**
   * Map candidate action to policy class
   */
  private mapActionToPolicyClass(action: string): 'read_only' | 'informational' | 'additive' | 'destructive' {
    const actionMap: Record<string, 'read_only' | 'informational' | 'additive' | 'destructive'> = {
      create: 'additive',
      modify: 'additive',
      delete: 'destructive',
      review: 'informational',
      test: 'read_only',
    };
    return actionMap[action] ?? 'additive';
  }

  /**
   * Map candidate action to expected output type
   */
  private mapActionToOutput(action: string): 'file' | 'branch' | 'commit' | 'pr' | 'comment' | 'status' {
    const actionMap: Record<string, 'file' | 'branch' | 'commit' | 'pr' | 'comment' | 'status'> = {
      create: 'file',
      modify: 'file',
      delete: 'file',
      review: 'comment',
      test: 'status',
    };
    return actionMap[action] ?? 'file';
  }
}

/**
 * Create a GitHubAgentAdapter with default config
 */
export function createGitHubAdapter(
  config?: GitHubAgentAdapterConfig
): GitHubAgentAdapter {
  return new GitHubAgentAdapter(config);
}
