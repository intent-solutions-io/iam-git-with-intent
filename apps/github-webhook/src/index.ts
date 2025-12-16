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
import crypto from 'crypto';
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

const app = express();
const PORT = process.env.PORT || 8080;

// Environment
const config = {
  projectId: process.env.PROJECT_ID || '',
  orchestratorEngineId: process.env.ORCHESTRATOR_ENGINE_ID || '',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  env: process.env.DEPLOYMENT_ENV || 'dev',
  location: 'us-central1',
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
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'github-webhook',
    version: '0.2.0',
    env: config.env,
    timestamp: Date.now(),
  });
});

/**
 * GitHub webhook endpoint
 */
app.post('/webhook', async (req: express.Request & { rawBody?: string }, res) => {
  const startTime = Date.now();
  const event = req.headers['x-github-event'] as string;
  const delivery = req.headers['x-github-delivery'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;

  try {
    // Validate webhook signature (required in production)
    if (config.webhookSecret) {
      if (!signature) {
        console.log(JSON.stringify({
          severity: 'WARNING',
          type: 'webhook_missing_signature',
          delivery,
          event,
        }));
        return res.status(401).json({ error: 'Missing signature header' });
      }
      if (!verifySignature(req.rawBody || '', signature)) {
        console.log(JSON.stringify({
          severity: 'WARNING',
          type: 'webhook_invalid_signature',
          delivery,
          event,
        }));
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Route based on event type
    const result = await handleWebhookEvent(event, req.body, delivery);

    console.log(JSON.stringify({
      type: 'webhook_processed',
      delivery,
      event,
      action: req.body.action,
      durationMs: Date.now() - startTime,
      ...result,
    }));

    return res.json(result);
  } catch (error) {
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

/**
 * Verify GitHub webhook signature
 */
function verifySignature(payload: string, signature: string): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', config.webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

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
      // TODO: Handle suspend/unsuspend in future phase
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
  const body = comment.body as string;

  // Check for /gwi commands
  if (!body.startsWith('/gwi ')) {
    return { status: 'skipped', skipped: true, reason: 'Not a /gwi command' };
  }

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

  const command = body.slice(5).trim().split(' ')[0];
  const issue = payload.issue as Record<string, unknown>;
  const isPR = 'pull_request' in issue;

  // Handle commands
  switch (command) {
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

/**
 * Handle issues events
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

  // Check for gwi-auto-code label
  const hasAutoCodeLabel = labels.some(l => l.name === 'gwi-auto-code');
  if (!hasAutoCodeLabel) {
    return { status: 'skipped', skipped: true, reason: 'Missing gwi-auto-code label' };
  }

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

  // Create autopilot run
  const run = await tenantLinker.createRun(
    tenantCtx,
    'autopilot',
    webhookCtx,
    { number: issue.number as number, url: issue.html_url as string }
  );

  // Trigger issue-to-code workflow
  const workflowId = await triggerWorkflow('issue-to-code', {
    tenantId: tenantCtx.tenant.id,
    repoId: tenantCtx.repo?.id,
    runId: run.id,
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      labels: labels.map(l => l.name),
    },
    delivery,
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
 * Trigger a workflow via the orchestrator
 */
async function triggerWorkflow(
  type: string,
  input: Record<string, unknown>
): Promise<string> {
  const workflowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
