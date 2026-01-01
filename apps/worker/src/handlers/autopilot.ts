/**
 * Autopilot Job Handler
 *
 * Phase 35: Handles autopilot workflow jobs from the job queue.
 *
 * This handler processes Issue → PR autopilot jobs using the
 * AutopilotExecutor from @gwi/engine.
 *
 * @module @gwi/worker/handlers/autopilot
 */

import type { WorkerJob, JobContext, JobResult } from '../processor.js';
import {
  AutopilotExecutor,
  type AutopilotConfig,
} from '@gwi/engine';
import {
  getTenantStore,
  getLogger,
  getFirestoreJobStore,
} from '@gwi/core';
import { createAppAuth } from '@octokit/auth-app';

const logger = getLogger('autopilot-handler');

// =============================================================================
// Types
// =============================================================================

/**
 * Automation config passed from webhook (approval mode settings)
 */
export interface AutomationConfig {
  /** Approval mode: always (require approval), never (YOLO), smart (complexity-based) */
  approvalMode: 'always' | 'never' | 'smart';
  /** Complexity threshold for smart mode (default: 4) */
  smartThreshold: number;
}

/**
 * Autopilot job payload from webhook/queue
 */
export interface AutopilotJobPayload {
  /** Issue metadata from GitHub */
  issue: {
    url: string;
    number: number;
    title: string;
    body: string | null;
    author: string;
    labels: string[];
  };

  /** Repository info */
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch?: string;
  };

  /** Installation ID for GitHub App */
  installationId: number;

  /** Trigger label that started this autopilot */
  triggerLabel?: string;

  /** Trigger reason from automation triggers */
  triggerReason?: string;

  /** Trigger type (label, title, body, comment, default) */
  triggerType?: string;

  /** Trigger value (the matched label/keyword/command) */
  triggerValue?: string;

  /** Automation config (approval mode settings) */
  automationConfig?: AutomationConfig;

  /** Dry run mode (no actual changes) */
  dryRun?: boolean;

  /** Skip test execution */
  skipTests?: boolean;

  /** Create PR as draft */
  draft?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine if approval is needed based on automation config and complexity
 *
 * @param automationConfig - Automation config from webhook (may be undefined)
 * @param complexity - Complexity score from triage (1-10)
 * @returns Whether approval is required before creating PR
 */
function determineApprovalNeeded(
  automationConfig: AutomationConfig | undefined,
  complexity: number
): { needed: boolean; reason: string } {
  // If no automation config, default to requiring approval (safe default)
  if (!automationConfig) {
    return { needed: true, reason: 'no-automation-config' };
  }

  switch (automationConfig.approvalMode) {
    case 'always':
      return { needed: true, reason: 'approval-mode-always' };

    case 'never':
      return { needed: false, reason: 'approval-mode-never' };

    case 'smart': {
      const threshold = automationConfig.smartThreshold ?? 4;
      if (complexity >= threshold) {
        return {
          needed: true,
          reason: `smart-mode-complexity-${complexity}-gte-threshold-${threshold}`,
        };
      }
      return {
        needed: false,
        reason: `smart-mode-complexity-${complexity}-lt-threshold-${threshold}`,
      };
    }

    default:
      return { needed: true, reason: 'unknown-approval-mode' };
  }
}

/**
 * Generate an installation access token for GitHub App
 */
async function getInstallationToken(
  appId: string,
  privateKey: string,
  installationId: number
): Promise<string> {
  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });

  const installationAuthentication = await auth({ type: 'installation' });
  return installationAuthentication.token;
}

// =============================================================================
// Handler Implementation
// =============================================================================

/**
 * Handle autopilot execution jobs
 *
 * This is the main handler for Issue → PR autopilot workflows:
 * 1. Validates tenant and issue data
 * 2. Creates AutopilotExecutor with job config
 * 3. Executes the full workflow (analyze → generate → test → PR)
 * 4. Updates job state in Firestore
 * 5. Returns result for queue acknowledgment
 */
export async function handleAutopilotExecute(
  job: WorkerJob,
  context: JobContext
): Promise<JobResult> {
  // Validate payload structure
  const rawPayload = job.payload;
  if (!rawPayload.issue || !rawPayload.repo || !rawPayload.installationId) {
    return {
      status: 'failed',
      error: 'Invalid autopilot payload: missing issue, repo, or installationId',
      durationMs: 0,
    };
  }
  const payload = rawPayload as unknown as AutopilotJobPayload;
  const startTime = Date.now();
  const workerId = context.lockHolderId || `worker-${Date.now()}`;

  context.log('info', 'Starting autopilot execution', {
    issueNumber: payload.issue.number,
    repo: payload.repo.fullName,
    runId: job.runId,
    triggerLabel: payload.triggerLabel,
    triggerReason: payload.triggerReason,
    automationConfig: payload.automationConfig,
    dryRun: payload.dryRun,
  });

  // Validate tenant
  const tenantStore = getTenantStore();
  const tenant = await tenantStore.getTenant(job.tenantId);

  if (!tenant) {
    return {
      status: 'failed',
      error: `Tenant not found: ${job.tenantId}`,
      durationMs: Date.now() - startTime,
    };
  }

  if (tenant.status !== 'active') {
    return {
      status: 'failed',
      error: `Tenant is not active: ${tenant.status}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Get GitHub App credentials from environment (set by Terraform/Secret Manager)
  const githubAppId = process.env.GITHUB_APP_ID;
  const githubPrivateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!githubAppId || !githubPrivateKey) {
    context.log('error', 'GitHub App credentials not configured');
    return {
      status: 'failed',
      error: 'GitHub App credentials not configured. Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY.',
      durationMs: Date.now() - startTime,
    };
  }

  // Generate installation access token
  let installationToken: string;
  try {
    installationToken = await getInstallationToken(
      githubAppId,
      githubPrivateKey,
      payload.installationId
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.log('error', 'Failed to generate installation token', { error: errorMessage });
    return {
      status: 'failed',
      error: `Failed to generate GitHub installation token: ${errorMessage}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Build autopilot config
  const config: AutopilotConfig = {
    runId: job.runId || `autopilot-${Date.now()}`,
    tenantId: job.tenantId,
    issue: {
      number: payload.issue.number,
      title: payload.issue.title,
      body: payload.issue.body,
      url: payload.issue.url,
      labels: payload.issue.labels,
      author: payload.issue.author,
    },
    repo: {
      owner: payload.repo.owner,
      name: payload.repo.name,
      fullName: payload.repo.fullName,
    },
    installation: {
      id: payload.installationId,
      token: installationToken,
    },
    baseBranch: payload.repo.defaultBranch || 'main',
    dryRun: payload.dryRun ?? false,
    skipTests: payload.skipTests ?? false,
    workerId,
    jobId: job.id,
  };

  // Get job store for state tracking
  const jobStore = getFirestoreJobStore();

  // Send initial heartbeat (job is already claimed by worker processor)
  if (job.id) {
    await jobStore.heartbeat(job.id, workerId);
  }

  // Extend lock for long-running execution
  await context.extendLock(600000); // 10 minutes

  try {
    // Create and execute autopilot
    const executor = new AutopilotExecutor(config);
    const result = await executor.execute();

    // Extract PR info from phases
    const prPhase = result.phases.pr;
    const prNumber = prPhase.prNumber;
    const prUrl = prPhase.prUrl;

    // Determine approval decision (for audit trail and future pause-before-PR support)
    // TODO: In future, implement actual pause-and-resume for approval modes
    const analyzeData = result.phases.analyze?.data as { complexity?: number } | undefined;
    const complexity = analyzeData?.complexity ?? 5; // Default to medium if not available
    const approvalDecision = determineApprovalNeeded(payload.automationConfig, complexity);

    // Log result
    context.log('info', 'Autopilot execution completed', {
      success: result.success,
      prUrl,
      prNumber,
      totalDurationMs: result.totalDurationMs,
      approvalMode: payload.automationConfig?.approvalMode ?? 'default',
      approvalNeeded: approvalDecision.needed,
      approvalReason: approvalDecision.reason,
      complexity,
    });

    // Update job state
    if (job.id) {
      if (result.success) {
        // Serialize result to Record<string, unknown> for storage
        await jobStore.completeJob(job.id, workerId, {
          result: JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
        });
      } else {
        await jobStore.failJob(job.id, workerId, result.error || 'Unknown error');
      }
    }

    return {
      status: result.success ? 'completed' : 'failed',
      output: {
        runId: config.runId,
        issueNumber: payload.issue.number,
        repo: payload.repo.fullName,
        prUrl,
        prNumber,
        totalDurationMs: result.totalDurationMs,
        dryRun: payload.dryRun,
        phases: {
          analyze: result.phases.analyze.completed,
          plan: result.phases.plan.completed,
          apply: result.phases.apply.completed,
          test: result.phases.test.completed,
          pr: result.phases.pr.completed,
        },
      },
      error: result.error,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.log('error', 'Autopilot execution failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Update job state to failed
    if (job.id) {
      await jobStore.failJob(job.id, workerId, errorMessage);
    }

    return {
      status: 'failed',
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Handle autopilot dry run jobs (planning only)
 *
 * This handler runs the autopilot in dry-run mode to generate
 * a plan without making any actual changes.
 */
export async function handleAutopilotPlan(
  job: WorkerJob,
  context: JobContext
): Promise<JobResult> {
  // Validate and force dry run mode
  const rawPayload = job.payload;
  if (!rawPayload.issue || !rawPayload.repo || !rawPayload.installationId) {
    return {
      status: 'failed',
      error: 'Invalid autopilot payload: missing issue, repo, or installationId',
      durationMs: 0,
    };
  }

  // Set dry run mode
  rawPayload.dryRun = true;

  return handleAutopilotExecute(job, context);
}

// =============================================================================
// Export handlers map
// =============================================================================

export const autopilotHandlers: Record<
  string,
  (job: WorkerJob, context: JobContext) => Promise<JobResult>
> = {
  'autopilot:execute': handleAutopilotExecute,
  'autopilot:plan': handleAutopilotPlan,
};
