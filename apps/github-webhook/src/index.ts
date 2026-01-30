/**
 * Git With Intent - GitHub Webhook Handler
 *
 * Receives GitHub webhook events and triggers workflows via orchestrator.
 * Phase 8: Added tenant linking and installation handling.
 *
 * R3: Gateway only - no agent logic, pure event routing.
 */

import express from 'express';
import helmet from 'helmet';
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleInstallationRepositories,
  type InstallationPayload,
  type InstallationRepositoriesPayload,
} from './handlers/installation.js';
import {
  getTenantLinker,
  type WebhookContext,
  type TenantContext,
} from './services/tenant-linker.js';
import {
  verifyGitHubWebhookSignature,
  type WebhookVerificationResult,
  enqueueJob,
  createWorkflowJob,
  type AutomationTriggers,
  getAutomationRateLimiter,
  // B5: Health check utilities
  createHealthRouter,
  type ServiceHealthConfig,
} from '@gwi/core';
import {
  getIdempotencyService,
  IdempotencyProcessingError,
  type GitHubIdempotencyKey,
} from '@gwi/engine';

const app = express();
const PORT = process.env.PORT || 8080;

// Environment
const config = {
  projectId: process.env.PROJECT_ID || '',
  orchestratorEngineId: process.env.ORCHESTRATOR_ENGINE_ID || '',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  env: process.env.DEPLOYMENT_ENV || 'dev',
  location: 'us-central1',
  // Phase 17: Use job queue instead of direct orchestrator calls
  useJobQueue: process.env.USE_JOB_QUEUE === 'true',
};

// Security validation: Require webhook secret in production
if (config.env === 'prod' && !config.webhookSecret) {
  console.error(JSON.stringify({
    severity: 'CRITICAL',
    type: 'startup_security_error',
    error: 'GITHUB_WEBHOOK_SECRET is required in production',
    hint: 'Set GITHUB_WEBHOOK_SECRET environment variable',
  }));
  process.exit(1);
}

if (!config.webhookSecret) {
  console.warn(JSON.stringify({
    severity: 'WARNING',
    type: 'startup_warning',
    message: 'GITHUB_WEBHOOK_SECRET not set - webhook signature validation DISABLED',
    env: config.env,
  }));
}

// Security middleware
app.use(helmet());
app.use(express.json({
  limit: '1mb',
  verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));

// Tenant linker instance
const tenantLinker = getTenantLinker();

/**
 * B5: Create standardized health router for Cloud Run integration.
 *
 * Provides:
 * - GET /health - Liveness probe
 * - GET /health/ready - Readiness probe (checks webhook secret)
 * - GET /health/deep - Full diagnostics
 */
const healthConfig: ServiceHealthConfig = {
  serviceName: 'github-webhook',
  version: '0.2.0',
  env: config.env,
  checks: {
    // External check - verify webhook secret is configured
    external: {
      'webhook-secret': async () => {
        const isConfigured = !!config.webhookSecret;
        return {
          healthy: isConfigured,
          message: isConfigured ? 'Webhook secret configured' : 'Webhook secret not configured',
        };
      },
    },
  },
  metadata: {
    projectId: config.projectId,
    useJobQueue: config.useJobQueue,
  },
};

const healthRouter = createHealthRouter(healthConfig);
app.use(healthRouter);

/**
 * GitHub webhook endpoint
 *
 * A5: Integrated with idempotency layer to prevent duplicate processing.
 * Uses X-GitHub-Delivery header as unique identifier per webhook delivery.
 */
app.post('/webhook', async (req: express.Request & { rawBody?: string }, res) => {
  const startTime = Date.now();
  const event = req.headers['x-github-event'] as string;
  const delivery = req.headers['x-github-delivery'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;

  // Validate delivery ID exists (required for idempotency)
  if (!delivery) {
    console.log(JSON.stringify({
      severity: 'WARNING',
      type: 'webhook_missing_delivery_id',
      event,
    }));
    return res.status(400).json({
      error: 'Missing X-GitHub-Delivery header',
    });
  }

  try {
    // Validate webhook signature using centralized security function (Phase 17)
    if (config.webhookSecret) {
      const verificationResult: WebhookVerificationResult = verifyGitHubWebhookSignature(
        req.rawBody || '',
        signature,
        config.webhookSecret
      );

      if (!verificationResult.valid) {
        console.log(JSON.stringify({
          severity: 'WARNING',
          type: 'webhook_signature_verification_failed',
          delivery,
          event,
          error: verificationResult.error,
          signatureType: verificationResult.signatureType,
        }));
        return res.status(401).json({
          error: verificationResult.error || 'Signature verification failed',
        });
      }
    }

    // A5: Use idempotency service to prevent duplicate processing
    const idempotencyService = getIdempotencyService();
    const idempotencyKey: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: delivery,
    };

    // Extract tenant ID from payload for idempotency record
    // Installation ID is used as a proxy when tenant is not yet resolved
    const installationId = (req.body.installation?.id || 'unknown').toString();

    const idempotencyResult = await idempotencyService.process(
      idempotencyKey,
      `installation:${installationId}`, // Tenant ID placeholder until resolved
      req.body,
      async () => {
        // Process the webhook event
        const result = await handleWebhookEvent(event, req.body, delivery);
        return {
          runId: result.workflowId,
          response: result,
        };
      }
    );

    // Log based on whether we processed or returned cached result
    if (idempotencyResult.processed) {
      console.log(JSON.stringify({
        type: 'webhook_processed',
        delivery,
        event,
        action: req.body.action,
        durationMs: Date.now() - startTime,
        ...idempotencyResult.result,
      }));
    } else {
      console.log(JSON.stringify({
        type: 'webhook_duplicate_skipped',
        delivery,
        event,
        action: req.body.action,
        durationMs: Date.now() - startTime,
        cachedRunId: idempotencyResult.runId,
      }));
    }

    return res.json({
      ...idempotencyResult.result,
      duplicate: !idempotencyResult.processed,
    });
  } catch (error: unknown) {
    // Handle concurrent processing (another instance is handling this webhook)
    if (error instanceof IdempotencyProcessingError) {
      console.log(JSON.stringify({
        type: 'webhook_processing_concurrent',
        delivery,
        event,
        key: error.key,
        runId: error.runId,
        durationMs: Date.now() - startTime,
      }));

      // Return 202 Accepted - another instance is processing
      return res.status(202).json({
        status: 'processing',
        message: 'Webhook is being processed by another instance',
        key: error.key,
        runId: error.runId,
      });
    }

    console.error(JSON.stringify({
      type: 'webhook_error',
      delivery,
      event,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Note: verifySignature removed in Phase 17 - now using centralized verifyGitHubWebhookSignature from @gwi/core

/**
 * Handle webhook event based on type
 */
async function handleWebhookEvent(
  event: string,
  payload: unknown,
  delivery: string
): Promise<{ status: string; workflowId?: string; tenantId?: string; skipped?: boolean; reason?: string }> {
  const body = payload as Record<string, unknown>;

  // Handle installation events first (no tenant context needed)
  if (event === 'installation') {
    return handleInstallationEvent(body, delivery);
  }

  if (event === 'installation_repositories') {
    return handleInstallationReposEvent(body, delivery);
  }

  // For all other events, extract context and resolve tenant
  const webhookCtx = tenantLinker.extractContext(event, body, delivery);

  // Resolve tenant (may be null if not found)
  const tenantCtx = await tenantLinker.resolveTenant(webhookCtx);

  switch (event) {
    case 'pull_request':
      return handlePullRequestEvent(body, delivery, webhookCtx, tenantCtx);

    case 'issue_comment':
      return handleIssueCommentEvent(body, delivery, webhookCtx, tenantCtx);

    case 'issues':
      return handleIssueEvent(body, delivery, webhookCtx, tenantCtx);

    case 'push':
      return handlePushEvent(body, delivery, webhookCtx, tenantCtx);

    default:
      return { status: 'skipped', skipped: true, reason: `Unsupported event: ${event}` };
  }
}

/**
 * Handle installation events
 */
async function handleInstallationEvent(
  payload: Record<string, unknown>,
  _delivery: string
): Promise<{ status: string; tenantId?: string; skipped?: boolean; reason?: string }> {
  const installationPayload = payload as unknown as InstallationPayload;
  const action = installationPayload.action;

  switch (action) {
    case 'created': {
      const result = await handleInstallationCreated(installationPayload);
      if (result.tenantId) {
        // Register in linker cache
        tenantLinker.registerInstallation(
          installationPayload.installation.id,
          result.tenantId
        );
      }
      return {
        status: result.status,
        tenantId: result.tenantId,
        reason: result.reason,
      };
    }

    case 'deleted': {
      const result = await handleInstallationDeleted(installationPayload);
      // Unregister from cache
      tenantLinker.unregisterInstallation(installationPayload.installation.id);
      return {
        status: result.status,
        tenantId: result.tenantId,
        reason: result.reason,
      };
    }

    case 'suspend':
    case 'unsuspend':
      // Future enhancement: Handle suspend/unsuspend webhooks
      return {
        status: 'skipped',
        skipped: true,
        reason: `Installation ${action} not yet implemented`,
      };

    default:
      return {
        status: 'skipped',
        skipped: true,
        reason: `Unknown installation action: ${action}`,
      };
  }
}

/**
 * Handle installation_repositories events
 */
async function handleInstallationReposEvent(
  payload: Record<string, unknown>,
  _delivery: string
): Promise<{ status: string; tenantId?: string; skipped?: boolean; reason?: string }> {
  const reposPayload = payload as unknown as InstallationRepositoriesPayload;
  const result = await handleInstallationRepositories(reposPayload);

  return {
    status: result.status,
    tenantId: result.tenantId,
    reason: result.reason,
  };
}

/**
 * Handle pull_request events
 */
async function handlePullRequestEvent(
  payload: Record<string, unknown>,
  delivery: string,
  webhookCtx: WebhookContext,
  tenantCtx: TenantContext | null
): Promise<{ status: string; workflowId?: string; tenantId?: string; skipped?: boolean; reason?: string }> {
  const action = payload.action as string;
  const pr = payload.pull_request as Record<string, unknown>;

  // Only handle specific actions
  const triggerActions = ['opened', 'synchronize', 'reopened'];
  if (!triggerActions.includes(action)) {
    return { status: 'skipped', skipped: true, reason: `Action ${action} not handled` };
  }

  // Check tenant context
  if (!tenantCtx) {
    return {
      status: 'skipped',
      skipped: true,
      reason: 'Tenant not found for installation',
    };
  }

  // Check if repo is enabled
  if (!tenantCtx.repoEnabled) {
    return {
      status: 'skipped',
      skipped: true,
      reason: 'Repository not enabled for processing',
      tenantId: tenantCtx.tenant.id,
    };
  }

  // Check plan limits
  if (!tenantCtx.withinLimits) {
    return {
      status: 'skipped',
      skipped: true,
      reason: tenantCtx.limitReason,
      tenantId: tenantCtx.tenant.id,
    };
  }

  // Get effective settings
  const settings = tenantLinker.getEffectiveSettings(tenantCtx);

  // Check if PR has conflicts
  const mergeable = pr.mergeable as boolean | null;
  const mergeableState = pr.mergeable_state as string;

  const hasConflicts = mergeable === false || mergeableState === 'dirty';

  // Determine what to trigger based on settings and PR state
  if (hasConflicts && settings.autoResolve) {
    // Create run in Firestore
    const run = await tenantLinker.createRun(
      tenantCtx,
      'resolve',
      webhookCtx,
      { number: pr.number as number, url: pr.html_url as string }
    );

    // Trigger workflow
    const workflowId = await triggerWorkflow('pr-resolve', {
      tenantId: tenantCtx.tenant.id,
      repoId: tenantCtx.repo?.id,
      runId: run.id,
      pr: {
        url: pr.html_url,
        number: pr.number,
        title: pr.title,
        baseBranch: (pr.base as Record<string, unknown>).ref,
        headBranch: (pr.head as Record<string, unknown>).ref,
        author: ((pr.user as Record<string, unknown>).login),
        hasConflicts: true,
      },
      delivery,
    });

    return {
      status: 'triggered',
      workflowId,
      tenantId: tenantCtx.tenant.id,
    };
  }

  if (action === 'opened' && settings.autoTriage) {
    // Create run in Firestore
    const run = await tenantLinker.createRun(
      tenantCtx,
      'triage',
      webhookCtx,
      { number: pr.number as number, url: pr.html_url as string }
    );

    // Trigger triage workflow
    const workflowId = await triggerWorkflow('pr-triage', {
      tenantId: tenantCtx.tenant.id,
      repoId: tenantCtx.repo?.id,
      runId: run.id,
      pr: {
        url: pr.html_url,
        number: pr.number,
        title: pr.title,
        baseBranch: (pr.base as Record<string, unknown>).ref,
        headBranch: (pr.head as Record<string, unknown>).ref,
        author: ((pr.user as Record<string, unknown>).login),
      },
      delivery,
    });

    return {
      status: 'triggered',
      workflowId,
      tenantId: tenantCtx.tenant.id,
    };
  }

  return {
    status: 'skipped',
    skipped: true,
    reason: hasConflicts ? 'Auto-resolve not enabled' : 'No action required',
    tenantId: tenantCtx.tenant.id,
  };
}

/**
 * Handle issue_comment events (for /gwi commands)
 *
 * Supports both built-in commands and customizable comment commands
 * from automation triggers config.
 */
async function handleIssueCommentEvent(
  payload: Record<string, unknown>,
  delivery: string,
  webhookCtx: WebhookContext,
  tenantCtx: TenantContext | null
): Promise<{ status: string; workflowId?: string; tenantId?: string; skipped?: boolean; reason?: string }> {
  const action = payload.action as string;
  if (action !== 'created') {
    return { status: 'skipped', skipped: true, reason: 'Only handle created comments' };
  }

  const comment = payload.comment as Record<string, unknown>;
  const body = (comment.body as string).trim();
  const issue = payload.issue as Record<string, unknown>;
  const isPR = 'pull_request' in issue;
  const labels = (issue.labels as Array<Record<string, unknown>>) || [];
  const labelNames = labels.map(l => l.name as string);

  // Check tenant context
  if (!tenantCtx) {
    return {
      status: 'skipped',
      skipped: true,
      reason: 'Tenant not found for installation',
    };
  }

  if (!tenantCtx.repoEnabled) {
    return {
      status: 'skipped',
      skipped: true,
      reason: 'Repository not enabled',
      tenantId: tenantCtx.tenant.id,
    };
  }

  if (!tenantCtx.withinLimits) {
    return {
      status: 'skipped',
      skipped: true,
      reason: tenantCtx.limitReason,
      tenantId: tenantCtx.tenant.id,
    };
  }

  // Get automation triggers for custom comment commands
  const automationTriggers = tenantCtx.repo?.settings?.automationTriggers;

  // Check for custom comment commands from automation config (for issues only)
  if (!isPR && automationTriggers?.commentCommands?.length) {
    const matchedCommand = automationTriggers.commentCommands.find(cmd =>
      body.toLowerCase().startsWith(cmd.toLowerCase())
    );

    if (matchedCommand) {
      // Trigger issue-to-code via custom command
      console.log(JSON.stringify({
        type: 'comment_command_matched',
        tenantId: tenantCtx.tenant.id,
        repoId: tenantCtx.repo?.id,
        issueNumber: issue.number,
        command: matchedCommand,
      }));

      // Check rate limit before triggering automation
      const rateLimiter = getAutomationRateLimiter();
      const maxRunsPerDay = automationTriggers?.maxAutoRunsPerDay ?? 10;
      const repoFullName = tenantCtx.repo?.githubFullName ?? 'unknown';

      const rateLimitResult = await rateLimiter.checkLimit(
        tenantCtx.tenant.id,
        repoFullName,
        maxRunsPerDay
      );

      if (!rateLimitResult.allowed) {
        console.log(JSON.stringify({
          type: 'automation_rate_limited',
          tenantId: tenantCtx.tenant.id,
          repoId: tenantCtx.repo?.id,
          repoFullName,
          issueNumber: issue.number,
          source: 'comment_command',
          current: rateLimitResult.current,
          limit: rateLimitResult.limit,
          resetInHours: rateLimitResult.resetInHours,
        }));

        return {
          status: 'rate_limited',
          skipped: true,
          reason: rateLimitResult.message ?? `Rate limit exceeded: ${rateLimitResult.current}/${rateLimitResult.limit} runs today`,
          tenantId: tenantCtx.tenant.id,
        };
      }

      const run = await tenantLinker.createRun(
        tenantCtx,
        'autopilot',
        webhookCtx,
        { number: issue.number as number, url: issue.html_url as string }
      );

      const workflowId = await triggerWorkflow('autopilot', {
        tenantId: tenantCtx.tenant.id,
        repoId: tenantCtx.repo?.id,
        runId: run.id,
        issue: {
          number: issue.number,
          title: issue.title,
          body: issue.body,
          url: issue.html_url,
          labels: labelNames,
          author: (issue.user as Record<string, unknown>)?.login,
          createdAt: issue.created_at,
        },
        triggerReason: `comment:${matchedCommand}`,
        triggerType: 'comment',
        triggerValue: matchedCommand,
        automationConfig: {
          approvalMode: automationTriggers.approvalMode,
          smartThreshold: automationTriggers.smartThreshold ?? 4,
        },
        delivery,
        repoFullName: webhookCtx.repository?.fullName,
        installationId: webhookCtx.installationId,
        triggeredBy: (comment.user as Record<string, unknown>)?.login,
      });

      return {
        status: 'triggered',
        workflowId,
        tenantId: tenantCtx.tenant.id,
      };
    }
  }

  // Check for built-in /gwi commands
  if (!body.startsWith('/gwi ')) {
    return { status: 'skipped', skipped: true, reason: 'Not a /gwi command' };
  }

  const command = body.slice(5).trim().split(' ')[0].toLowerCase();

  // Handle commands
  switch (command) {
    // Built-in generate/code command for issue-to-code
    case 'generate':
    case 'code': {
      if (isPR) {
        return {
          status: 'skipped',
          skipped: true,
          reason: 'Generate only works on issues, not PRs',
          tenantId: tenantCtx.tenant.id,
        };
      }

      const generateRun = await tenantLinker.createRun(
        tenantCtx,
        'autopilot',
        webhookCtx,
        { number: issue.number as number, url: issue.html_url as string }
      );

      const generateWorkflowId = await triggerWorkflow('autopilot', {
        tenantId: tenantCtx.tenant.id,
        repoId: tenantCtx.repo?.id,
        runId: generateRun.id,
        issue: {
          number: issue.number,
          title: issue.title,
          body: issue.body,
          url: issue.html_url,
          labels: labelNames,
          author: (issue.user as Record<string, unknown>)?.login,
          createdAt: issue.created_at,
        },
        triggerReason: `comment:/gwi ${command}`,
        triggerType: 'comment',
        triggerValue: `/gwi ${command}`,
        automationConfig: automationTriggers ? {
          approvalMode: automationTriggers.approvalMode,
          smartThreshold: automationTriggers.smartThreshold ?? 4,
        } : undefined,
        delivery,
        repoFullName: webhookCtx.repository?.fullName,
        installationId: webhookCtx.installationId,
        triggeredBy: (comment.user as Record<string, unknown>)?.login,
      });

      return {
        status: 'triggered',
        workflowId: generateWorkflowId,
        tenantId: tenantCtx.tenant.id,
      };
    }
    case 'resolve':
      if (!isPR) {
        return {
          status: 'skipped',
          skipped: true,
          reason: 'Resolve only works on PRs',
          tenantId: tenantCtx.tenant.id,
        };
      }

      {
        const resolveRun = await tenantLinker.createRun(
          tenantCtx,
          'resolve',
          webhookCtx,
          { number: issue.number as number, url: issue.html_url as string }
        );

        const workflowId = await triggerWorkflow('pr-resolve', {
          tenantId: tenantCtx.tenant.id,
          repoId: tenantCtx.repo?.id,
          runId: resolveRun.id,
          pr: { number: issue.number, url: issue.html_url },
          delivery,
          triggeredBy: (comment.user as Record<string, unknown>).login,
        });

        return {
          status: 'triggered',
          workflowId,
          tenantId: tenantCtx.tenant.id,
        };
      }

    case 'review':
      if (!isPR) {
        return {
          status: 'skipped',
          skipped: true,
          reason: 'Review only works on PRs',
          tenantId: tenantCtx.tenant.id,
        };
      }

      {
        const reviewRun = await tenantLinker.createRun(
          tenantCtx,
          'review',
          webhookCtx,
          { number: issue.number as number, url: issue.html_url as string }
        );

        const reviewId = await triggerWorkflow('pr-review', {
          tenantId: tenantCtx.tenant.id,
          repoId: tenantCtx.repo?.id,
          runId: reviewRun.id,
          pr: { number: issue.number, url: issue.html_url },
          delivery,
          triggeredBy: (comment.user as Record<string, unknown>).login,
        });

        return {
          status: 'triggered',
          workflowId: reviewId,
          tenantId: tenantCtx.tenant.id,
        };
      }

    case 'triage':
      if (!isPR) {
        return {
          status: 'skipped',
          skipped: true,
          reason: 'Triage only works on PRs',
          tenantId: tenantCtx.tenant.id,
        };
      }

      {
        const triageRun = await tenantLinker.createRun(
          tenantCtx,
          'triage',
          webhookCtx,
          { number: issue.number as number, url: issue.html_url as string }
        );

        const triageId = await triggerWorkflow('pr-triage', {
          tenantId: tenantCtx.tenant.id,
          repoId: tenantCtx.repo?.id,
          runId: triageRun.id,
          pr: { number: issue.number, url: issue.html_url },
          delivery,
          triggeredBy: (comment.user as Record<string, unknown>).login,
        });

        return {
          status: 'triggered',
          workflowId: triageId,
          tenantId: tenantCtx.tenant.id,
        };
      }

    default:
      return {
        status: 'skipped',
        skipped: true,
        reason: `Unknown command: ${command}`,
        tenantId: tenantCtx.tenant.id,
      };
  }
}

// =============================================================================
// Automation Trigger Checking
// =============================================================================

/**
 * Result of checking trigger conditions
 */
interface TriggerResult {
  matched: boolean;
  reason: string;
  triggerType?: 'label' | 'title' | 'body' | 'default';
  triggerValue?: string;
}

/**
 * Default trigger labels (fallback when no automation triggers configured)
 */
const DEFAULT_TRIGGER_LABELS = ['gwi-auto-code', 'gwi:autopilot', 'gwi:auto'];

/**
 * Check if an issue matches the configured automation trigger conditions
 *
 * Checks in order: labels, title keywords, body keywords, exclude patterns
 */
function checkTriggerConditions(
  issue: { title: string; body: string | null; labels: string[] },
  triggers: AutomationTriggers | undefined
): TriggerResult {
  // If no triggers configured, use default labels
  if (!triggers) {
    const matched = issue.labels.find(l => DEFAULT_TRIGGER_LABELS.includes(l));
    if (matched) {
      return { matched: true, reason: `default-label:${matched}`, triggerType: 'default', triggerValue: matched };
    }
    return { matched: false, reason: 'no-automation-config' };
  }

  // Check if automation is disabled
  if (triggers.enabled === false) {
    return { matched: false, reason: 'automation-disabled' };
  }

  // Check exclude patterns first (before any positive matches)
  if (triggers.excludePatterns?.length) {
    const excluded = triggers.excludePatterns.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(issue.title) || regex.test(issue.body || '');
      } catch {
        // Invalid regex pattern, skip it
        console.warn(`Invalid exclude pattern: ${pattern}`);
        return false;
      }
    });
    if (excluded) {
      return { matched: false, reason: 'excluded-by-pattern' };
    }
  }

  // Check labels
  if (triggers.labels?.length) {
    const matched = triggers.labels.find(t =>
      issue.labels.some(l => l.toLowerCase() === t.toLowerCase())
    );
    if (matched) {
      return { matched: true, reason: `label:${matched}`, triggerType: 'label', triggerValue: matched };
    }
  }

  // Check title keywords
  if (triggers.titleKeywords?.length) {
    const matched = triggers.titleKeywords.find(kw =>
      issue.title.toLowerCase().includes(kw.toLowerCase())
    );
    if (matched) {
      return { matched: true, reason: `title:${matched}`, triggerType: 'title', triggerValue: matched };
    }
  }

  // Check body keywords
  if (triggers.bodyKeywords?.length) {
    const matched = triggers.bodyKeywords.find(kw =>
      issue.body?.toLowerCase().includes(kw.toLowerCase())
    );
    if (matched) {
      return { matched: true, reason: `body:${matched}`, triggerType: 'body', triggerValue: matched };
    }
  }

  return { matched: false, reason: 'no-trigger-match' };
}

/**
 * Handle issues events
 *
 * Phase 34: Enhanced autopilot support
 * Phase X: Config-based automation triggers from RepoSettings
 * - Supports customizable labels, keywords, and exclude patterns
 * - Uses approval mode from automation triggers config
 */
async function handleIssueEvent(
  payload: Record<string, unknown>,
  delivery: string,
  webhookCtx: WebhookContext,
  tenantCtx: TenantContext | null
): Promise<{ status: string; workflowId?: string; tenantId?: string; skipped?: boolean; reason?: string }> {
  const action = payload.action as string;
  if (action !== 'opened' && action !== 'labeled') {
    return { status: 'skipped', skipped: true, reason: `Action ${action} not handled` };
  }

  const issue = payload.issue as Record<string, unknown>;
  const labels = (issue.labels as Array<Record<string, unknown>>) || [];
  const labelNames = labels.map(l => l.name as string);

  // Check tenant context
  if (!tenantCtx) {
    return {
      status: 'skipped',
      skipped: true,
      reason: 'Tenant not found for installation',
    };
  }

  if (!tenantCtx.repoEnabled) {
    return {
      status: 'skipped',
      skipped: true,
      reason: 'Repository not enabled',
      tenantId: tenantCtx.tenant.id,
    };
  }

  if (!tenantCtx.withinLimits) {
    return {
      status: 'skipped',
      skipped: true,
      reason: tenantCtx.limitReason,
      tenantId: tenantCtx.tenant.id,
    };
  }

  // Get automation triggers from repo settings
  const automationTriggers = tenantCtx.repo?.settings?.automationTriggers;

  // Check if issue matches trigger conditions
  const triggerResult = checkTriggerConditions(
    {
      title: issue.title as string,
      body: issue.body as string | null,
      labels: labelNames,
    },
    automationTriggers
  );

  if (!triggerResult.matched) {
    return {
      status: 'skipped',
      skipped: true,
      reason: triggerResult.reason,
      tenantId: tenantCtx.tenant.id,
    };
  }

  // Log the trigger match
  console.log(JSON.stringify({
    type: 'issue_trigger_matched',
    tenantId: tenantCtx.tenant.id,
    repoId: tenantCtx.repo?.id,
    issueNumber: issue.number,
    triggerReason: triggerResult.reason,
    triggerType: triggerResult.triggerType,
    triggerValue: triggerResult.triggerValue,
  }));

  // Check rate limit before triggering automation
  const rateLimiter = getAutomationRateLimiter();
  const maxRunsPerDay = automationTriggers?.maxAutoRunsPerDay ?? 10;
  const repoFullName = tenantCtx.repo?.githubFullName ?? 'unknown';

  const rateLimitResult = await rateLimiter.checkLimit(
    tenantCtx.tenant.id,
    repoFullName,
    maxRunsPerDay
  );

  if (!rateLimitResult.allowed) {
    console.log(JSON.stringify({
      type: 'automation_rate_limited',
      tenantId: tenantCtx.tenant.id,
      repoId: tenantCtx.repo?.id,
      repoFullName,
      issueNumber: issue.number,
      current: rateLimitResult.current,
      limit: rateLimitResult.limit,
      resetInHours: rateLimitResult.resetInHours,
    }));

    return {
      status: 'rate_limited',
      skipped: true,
      reason: rateLimitResult.message ?? `Rate limit exceeded: ${rateLimitResult.current}/${rateLimitResult.limit} runs today`,
      tenantId: tenantCtx.tenant.id,
    };
  }

  // Create autopilot run
  const run = await tenantLinker.createRun(
    tenantCtx,
    'autopilot',
    webhookCtx,
    { number: issue.number as number, url: issue.html_url as string }
  );

  // Trigger autopilot workflow with automation config
  const workflowId = await triggerWorkflow('autopilot', {
    tenantId: tenantCtx.tenant.id,
    repoId: tenantCtx.repo?.id,
    runId: run.id,
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      labels: labelNames,
      author: (issue.user as Record<string, unknown>)?.login,
      createdAt: issue.created_at,
    },
    // Pass trigger info for audit trail
    triggerReason: triggerResult.reason,
    triggerType: triggerResult.triggerType,
    triggerValue: triggerResult.triggerValue,
    // Pass approval mode for workflow logic
    automationConfig: automationTriggers ? {
      approvalMode: automationTriggers.approvalMode,
      smartThreshold: automationTriggers.smartThreshold ?? 4,
    } : undefined,
    delivery,
    repoFullName: webhookCtx.repository?.fullName,
    installationId: webhookCtx.installationId,
  });

  return {
    status: 'triggered',
    workflowId,
    tenantId: tenantCtx.tenant.id,
  };
}

/**
 * Handle push events
 */
async function handlePushEvent(
  _payload: Record<string, unknown>,
  _delivery: string,
  _webhookCtx: WebhookContext,
  tenantCtx: TenantContext | null
): Promise<{ status: string; tenantId?: string; skipped: boolean; reason: string }> {
  // Push events could trigger CI checks in future phases
  return {
    status: 'skipped',
    skipped: true,
    reason: 'Push events not yet implemented',
    tenantId: tenantCtx?.tenant.id,
  };
}

/**
 * Trigger a workflow via the job queue or orchestrator
 *
 * Phase 17: Supports both queue-based (recommended) and direct orchestrator calls.
 * Set USE_JOB_QUEUE=true to use the job queue.
 */
async function triggerWorkflow(
  type: string,
  input: Record<string, unknown>
): Promise<string> {
  const workflowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Phase 17: Use job queue when enabled
  if (config.useJobQueue) {
    const tenantId = input.tenantId as string;
    const runId = input.runId as string;

    const job = createWorkflowJob(tenantId, runId, type, {
      ...input,
      workflowId,
    });

    const result = await enqueueJob(job);

    console.log(JSON.stringify({
      type: 'workflow_queued',
      workflowType: type,
      workflowId,
      messageId: result.messageId,
      success: result.success,
      tenantId,
      runId,
    }));

    if (!result.success) {
      throw new Error(`Failed to queue workflow: ${result.error}`);
    }

    return workflowId;
  }

  // Skip actual orchestrator call if not configured
  if (!config.projectId || !config.orchestratorEngineId) {
    console.log(JSON.stringify({
      type: 'workflow_dry_run',
      workflowType: type,
      workflowId,
      input,
    }));
    return workflowId;
  }

  // Build Agent Engine URL
  const url = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/reasoningEngines/${config.orchestratorEngineId}:query`;

  // Get access token
  const accessToken = await getAccessToken();

  // Create A2A message
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: 'spiffe://intent.solutions/gateway/github-webhook',
    to: 'spiffe://intent.solutions/agent/gwi/orchestrator',
    type: 'task',
    payload: {
      taskType: 'workflow',
      workflowType: type,
      workflowId,
      input,
    },
    timestamp: Date.now(),
  };

  // Send to orchestrator
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: { message } }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orchestrator error (${response.status}): ${errorText}`);
  }

  return workflowId;
}

/**
 * Get access token for GCP
 */
async function getAccessToken(): Promise<string> {
  const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

  const response = await fetch(metadataUrl, {
    headers: { 'Metadata-Flavor': 'Google' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(JSON.stringify({
    type: 'startup',
    service: 'github-webhook',
    version: '0.2.0',
    env: config.env,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

export { app };
