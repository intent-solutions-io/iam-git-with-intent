/**
 * Worker Job Handlers
 *
 * Phase 17: Production workflow handlers with engine integration.
 *
 * These handlers bridge the gap between the job queue and the
 * workflow execution engine.
 *
 * @module @gwi/worker/handlers
 */

import type { WorkerJob, JobContext, JobResult } from '../processor.js';
import { createEngine, type Engine } from '@gwi/engine';
import {
  getTenantStore,
  getLogger,
  getWorkItemStore,
  getPRCandidateStore,
  getAgentAdapter,
  planCandidate,
  executePlan,
  STEP_CLASS_SCOPES,
  getConnectorRegistry,
  invokeTool,
  formatPlanReviewComment,
  type PlanInput,
  type ExecuteInput,
  type ApprovalScope,
  type ImplementationPlan,
} from '@gwi/core';

const logger = getLogger('handlers');

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate required approval scopes from an implementation plan
 * Uses STEP_CLASS_SCOPES mapping to determine what scopes are needed
 */
function calculateRequiredScopes(plan: ImplementationPlan): ApprovalScope[] {
  const scopes = new Set<ApprovalScope>();

  for (const step of plan.steps) {
    const stepScopes = STEP_CLASS_SCOPES[step.policyClass] ?? [];
    for (const scope of stepScopes) {
      scopes.add(scope);
    }
  }

  return Array.from(scopes);
}

/**
 * Check if all required scopes are approved
 */
function validateApprovals(
  requiredScopes: ApprovalScope[],
  approvedScopes: ApprovalScope[]
): { valid: boolean; missing: ApprovalScope[] } {
  const missing = requiredScopes.filter(s => !approvedScopes.includes(s));
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Post a plan review comment to GitHub issue/PR
 * Uses invokeTool to go through the connector pipeline
 */
async function postPlanReviewComment(
  tenantId: string,
  runId: string,
  repo: { owner: string; name: string },
  issueNumber: number,
  plan: ImplementationPlan
): Promise<{ success: boolean; error?: string }> {
  const registry = getConnectorRegistry();

  // Format the plan review comment with checkboxes
  const commentBody = formatPlanReviewComment(
    plan.summary,
    plan.requiredScopes,
    plan.risk.level,
    plan.confidence,
    plan.affectedFiles
  );

  const result = await invokeTool(registry, {
    runId,
    tenantId,
    toolName: 'github.postComment',
    input: {
      owner: repo.owner,
      repo: repo.name,
      issueNumber,
      body: commentBody,
    },
    // postComment is WRITE_NON_DESTRUCTIVE, no approval needed
  });

  return {
    success: result.success,
    error: result.error,
  };
}

// Singleton engine instance
let engineInstance: Engine | null = null;

/**
 * Get or create the engine instance
 */
async function getEngine(): Promise<Engine> {
  if (!engineInstance) {
    const debug = process.env.DEPLOYMENT_ENV !== 'prod';
    engineInstance = await createEngine({ debug });
    logger.info('Engine initialized', { debug });
  }
  return engineInstance;
}

// =============================================================================
// Workflow Execution Handler
// =============================================================================

/**
 * Handle workflow execution jobs
 *
 * This is the primary handler for executing GWI workflows:
 * - pr-triage: Analyze PR complexity
 * - pr-resolve: Resolve conflicts
 * - pr-review: Generate code review
 * - issue-to-code: Generate code from issue
 */
export async function handleWorkflowExecute(
  job: WorkerJob,
  context: JobContext
): Promise<JobResult> {
  const { workflowType, workflowId } = job.payload as {
    workflowType: string;
    workflowId: string;
  };

  context.log('info', 'Starting workflow execution', {
    workflowType,
    workflowId,
    runId: job.runId,
  });

  // Validate tenant exists
  const tenantStore = getTenantStore();
  const tenant = await tenantStore.getTenant(job.tenantId);

  if (!tenant) {
    return {
      status: 'failed',
      error: `Tenant not found: ${job.tenantId}`,
    };
  }

  if (tenant.status !== 'active') {
    return {
      status: 'failed',
      error: `Tenant is not active: ${tenant.status}`,
    };
  }

  // Map workflow type to engine run type
  const runTypeMap: Record<string, string> = {
    'pr-triage': 'TRIAGE',
    'pr-resolve': 'RESOLVE',
    'pr-review': 'REVIEW',
    'issue-to-code': 'AUTOPILOT',
    'autopilot': 'AUTOPILOT',
    'plan': 'PLAN',
  };

  const runType = runTypeMap[workflowType];
  if (!runType) {
    return {
      status: 'failed',
      error: `Unknown workflow type: ${workflowType}`,
    };
  }

  try {
    const engine = await getEngine();

    // Extract PR/issue info from payload
    const pr = job.payload.pr as { url?: string; number?: number } | undefined;
    const issue = job.payload.issue as { url?: string; number?: number } | undefined;
    const repoUrl = job.payload.repoUrl as string | undefined;

    // Construct the repo URL if not provided
    let finalRepoUrl = repoUrl;
    if (!finalRepoUrl && pr?.url) {
      // Extract repo URL from PR URL: https://github.com/owner/repo/pull/123
      const match = pr.url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)/);
      if (match) {
        finalRepoUrl = match[1];
      }
    }

    if (!finalRepoUrl) {
      return {
        status: 'failed',
        error: 'Could not determine repository URL',
      };
    }

    // Check if we have an existing run to resume
    if (job.runId) {
      // Check for existing checkpoint
      const checkpoint = await context.checkpointManager.getCheckpoint(job.runId);

      if (checkpoint && checkpoint.status === 'running') {
        context.log('info', 'Resuming run from checkpoint', {
          runId: job.runId,
          currentStep: checkpoint.currentStepName,
          completedSteps: checkpoint.completedSteps?.length || 0,
        });

        // Extend lock for resumed processing
        await context.extendLock(120000); // 2 minutes
      }
    }

    // Start or resume the run
    const result = await engine.startRun({
      tenantId: job.tenantId,
      repoUrl: finalRepoUrl,
      runType: runType as 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT',
      prNumber: pr?.number,
      issueNumber: issue?.number,
      trigger: 'webhook',
      metadata: {
        workflowId,
        queuedAt: new Date().toISOString(),
        ...job.metadata,
      },
    });

    context.log('info', 'Workflow run started', {
      runId: result.runId,
      status: result.status,
    });

    // Note: Checkpoint management is handled by the engine
    // The engine creates checkpoints during run execution

    return {
      status: 'completed',
      output: {
        runId: result.runId,
        status: result.status,
        workflowType,
        workflowId,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.log('error', 'Workflow execution failed', { error: errorMessage });

    // Note: Engine handles checkpoint persistence for failed runs

    return {
      status: 'failed',
      error: errorMessage,
    };
  }
}

// =============================================================================
// Signal Processing Handler
// =============================================================================

/**
 * Handle signal processing jobs
 *
 * Signals are lightweight events that may trigger workflows:
 * - PR opened/updated
 * - Issue labeled
 * - Comment with /gwi command
 */
export async function handleSignalProcess(
  job: WorkerJob,
  context: JobContext
): Promise<JobResult> {
  const { signalId, signalType } = job.payload as {
    signalId: string;
    signalType: string;
  };

  context.log('info', 'Processing signal', {
    signalId,
    signalType,
    tenantId: job.tenantId,
  });

  // Validate tenant
  const tenantStore = getTenantStore();
  const tenant = await tenantStore.getTenant(job.tenantId);

  if (!tenant) {
    return {
      status: 'failed',
      error: `Tenant not found: ${job.tenantId}`,
    };
  }

  // Process based on signal type
  switch (signalType) {
    case 'pr_opened':
    case 'pr_updated':
    case 'pr_conflict':
      context.log('info', 'PR signal processed', { signalType });
      return {
        status: 'completed',
        output: {
          signalId,
          signalType,
          action: 'acknowledged',
          note: 'PR signals trigger workflows via webhook handler',
        },
      };

    case 'issue_labeled':
      context.log('info', 'Issue signal processed', { signalType });
      return {
        status: 'completed',
        output: {
          signalId,
          signalType,
          action: 'acknowledged',
          note: 'Issue signals trigger workflows via webhook handler',
        },
      };

    case 'command':
      context.log('info', 'Command signal processed', { signalType });
      return {
        status: 'completed',
        output: {
          signalId,
          signalType,
          action: 'acknowledged',
          note: 'Command signals processed by issue_comment handler',
        },
      };

    default:
      context.log('warn', 'Unknown signal type', { signalType });
      return {
        status: 'skipped',
        output: {
          signalId,
          signalType,
          reason: `Unknown signal type: ${signalType}`,
        },
      };
  }
}

// =============================================================================
// Candidate Generation Handler
// =============================================================================

/**
 * Handle PR candidate generation jobs
 *
 * Phase 18: Now integrates with AgentAdapter for real candidate execution.
 * Generates PR candidates from work items (issues, feature requests).
 *
 * Flow:
 * 1. Load work item and existing candidate (if any)
 * 2. Call agent.planCandidate() to generate implementation plan
 * 3. Call agent.executePlan() with approved scopes
 * 4. Update candidate status and create PR
 */
export async function handleCandidateGenerate(
  job: WorkerJob,
  context: JobContext
): Promise<JobResult> {
  const {
    workItemId,
    candidateId,
    approvedScopes = [],
    dryRun = false,
  } = job.payload as {
    workItemId: string;
    candidateId?: string;
    approvedScopes?: ApprovalScope[];
    dryRun?: boolean;
  };

  context.log('info', 'Starting candidate generation', {
    workItemId,
    candidateId,
    tenantId: job.tenantId,
    runId: job.runId,
    dryRun,
    approvedScopes,
  });

  // Validate tenant
  const tenantStore = getTenantStore();
  const tenant = await tenantStore.getTenant(job.tenantId);

  if (!tenant) {
    return {
      status: 'failed',
      error: `Tenant not found: ${job.tenantId}`,
    };
  }

  if (tenant.status !== 'active') {
    return {
      status: 'failed',
      error: `Tenant is not active: ${tenant.status}`,
    };
  }

  // Load work item
  const workItemStore = getWorkItemStore();
  const workItem = await workItemStore.getWorkItem(workItemId);

  if (!workItem) {
    return {
      status: 'failed',
      error: `Work item not found: ${workItemId}`,
    };
  }

  // Load existing candidate if specified
  const candidateStore = getPRCandidateStore();
  const candidate = candidateId
    ? await candidateStore.getCandidate(candidateId)
    : undefined;

  // Build repo info from work item
  const repo = workItem.repo;
  if (!repo) {
    return {
      status: 'failed',
      error: 'No repository information available on work item',
    };
  }

  try {
    // Get the agent adapter
    const adapter = getAgentAdapter();
    context.log('info', 'Using agent adapter', {
      adapter: adapter.name,
      version: adapter.version,
    });

    // Extend lock for long-running planning
    await context.extendLock(120000); // 2 minutes

    // =========================================================================
    // Phase 1: Planning
    // =========================================================================
    const planInput: PlanInput = {
      tenantId: job.tenantId,
      workItem,
      candidate: candidate ?? undefined,
      repo: {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
      },
      runId: job.runId,
    };

    context.log('info', 'Generating implementation plan');
    const plan = await planCandidate(planInput);

    context.log('info', 'Plan generated', {
      planId: plan.id,
      steps: plan.steps.length,
      complexity: plan.complexity,
      confidence: plan.confidence,
      requiredScopes: plan.requiredScopes,
    });

    // Log plan details (candidate plan/risk updates would require interface expansion)
    context.log('info', 'Plan details', {
      candidateId: candidate?.id,
      planSummary: plan.summary,
      planComplexity: plan.complexity,
      riskLevel: plan.risk.level,
    });

    // Calculate required scopes from plan steps using policy class mapping
    const requiredScopes = calculateRequiredScopes(plan);
    const approvalValidation = validateApprovals(requiredScopes, approvedScopes);

    context.log('info', 'Approval validation', {
      requiredScopes,
      approvedScopes,
      valid: approvalValidation.valid,
      missing: approvalValidation.missing,
    });

    if (!approvalValidation.valid && !dryRun) {
      context.log('info', 'Missing approval scopes, plan ready for approval', {
        required: requiredScopes,
        approved: approvedScopes,
        missing: approvalValidation.missing,
      });

      // Update candidate with plan, risk, and confidence (Phase 19)
      if (candidate) {
        // Map tool names to action types for CandidatePlanStep
        const mapToolToAction = (tool: string): 'create' | 'modify' | 'delete' | 'review' | 'test' => {
          if (tool.includes('create') || tool.includes('Branch')) return 'create';
          if (tool.includes('delete') || tool.includes('Delete')) return 'delete';
          if (tool.includes('Comment') || tool.includes('Review')) return 'review';
          if (tool.includes('test') || tool.includes('Test')) return 'test';
          return 'modify'; // Default for push, commit, etc.
        };

        await candidateStore.updateCandidate(candidate.id, {
          status: 'draft',
          plan: {
            summary: plan.summary,
            steps: plan.steps.map(s => ({
              order: s.order,
              description: s.description,
              action: mapToolToAction(s.tool),
              files: s.files,
            })),
            complexity: plan.complexity,
            affectedFiles: plan.affectedFiles,
          },
          risk: plan.risk,
          confidence: plan.confidence,
        });
      }

      // Post plan review comment to the source issue/PR (Phase 19)
      // This shows the plan with approval checkboxes
      if (workItem.resourceNumber && job.runId) {
        const commentResult = await postPlanReviewComment(
          job.tenantId,
          job.runId,
          { owner: repo.owner, name: repo.name },
          workItem.resourceNumber,
          plan
        );

        if (commentResult.success) {
          context.log('info', 'Posted plan review comment', {
            issueNumber: workItem.resourceNumber,
          });
        } else {
          context.log('warn', 'Failed to post plan review comment', {
            issueNumber: workItem.resourceNumber,
            error: commentResult.error,
          });
        }
      }

      return {
        status: 'completed',
        output: {
          workItemId,
          candidateId: candidate?.id,
          planId: plan.id,
          status: 'awaiting_approval',
          requiredScopes,
          missingScopes: approvalValidation.missing,
          plan: {
            summary: plan.summary,
            complexity: plan.complexity,
            confidence: plan.confidence,
            affectedFiles: plan.affectedFiles.length,
          },
        },
      };
    }

    // =========================================================================
    // Phase 2: Execution
    // =========================================================================
    context.log('info', 'Executing plan');

    // Extend lock for execution
    await context.extendLock(300000); // 5 minutes

    const executeInput: ExecuteInput = {
      tenantId: job.tenantId,
      plan,
      approvedScopes,
      repo: {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        defaultBranch: 'main', // Default to main, can be made configurable
      },
      runId: job.runId,
      dryRun,
    };

    const result = await executePlan(executeInput);

    context.log('info', 'Execution completed', {
      success: result.success,
      branchName: result.branchName,
      prNumber: result.prNumber,
      durationMs: result.durationMs,
    });

    // Update candidate with execution results
    if (candidate && result.success) {
      await candidateStore.updateCandidate(candidate.id, {
        status: dryRun ? 'ready' : 'applied',
        patchset: result.branchName
          ? {
              branchName: result.branchName,
              baseCommit: result.commits?.[0]?.sha ?? '',
              changes: [],
              commitMessage: result.commits?.[0]?.message ?? plan.summary,
            }
          : undefined,
        resultingPRUrl: result.prUrl,
        runId: job.runId,
        appliedAt: dryRun ? undefined : new Date(),
      });

      // Update work item to link to candidate
      await workItemStore.updateWorkItem(workItemId, {
        candidateId: candidate.id,
        status: dryRun ? 'in_progress' : 'completed',
      });
    }

    return {
      status: result.success ? 'completed' : 'failed',
      output: {
        workItemId,
        candidateId: candidate?.id,
        planId: plan.id,
        executionId: result.id,
        success: result.success,
        branchName: result.branchName,
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        durationMs: result.durationMs,
        dryRun,
        intentReceipt: result.intentReceipt,
      },
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.log('error', 'Candidate generation failed', { error: errorMessage });

    // Update candidate status on failure
    if (candidate) {
      await candidateStore.updateCandidate(candidate.id, {
        status: 'failed',
      });
    }

    return {
      status: 'failed',
      error: errorMessage,
    };
  }
}

// =============================================================================
// Health Check Handler
// =============================================================================

/**
 * Health check job - used for testing worker connectivity
 */
export async function handleHealthCheck(
  job: WorkerJob,
  context: JobContext
): Promise<JobResult> {
  context.log('info', 'Health check job received');

  return {
    status: 'completed',
    output: {
      healthy: true,
      timestamp: new Date().toISOString(),
      tenantId: job.tenantId,
      payload: job.payload,
    },
  };
}

// =============================================================================
// Handler Registry
// =============================================================================

/**
 * All available job handlers
 */
export const handlers: Record<string, (job: WorkerJob, context: JobContext) => Promise<JobResult>> = {
  'workflow:execute': handleWorkflowExecute,
  'signal:process': handleSignalProcess,
  'candidate:generate': handleCandidateGenerate,
  'health:check': handleHealthCheck,
};

/**
 * Register all handlers with a processor
 */
export function registerHandlers(
  processor: { registerHandler: (type: string, handler: (job: WorkerJob, context: JobContext) => Promise<JobResult>) => void }
): void {
  for (const [type, handler] of Object.entries(handlers)) {
    processor.registerHandler(type, handler);
  }
  logger.info('Registered handlers', { count: Object.keys(handlers).length });
}
