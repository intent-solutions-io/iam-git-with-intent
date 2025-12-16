/**
 * Git With Intent - GitHub Webhook Handler
 *
 * Receives GitHub webhook events and triggers workflows via orchestrator.
 * R3: Gateway only - no agent logic, pure event routing.
 */

import express from 'express';
import helmet from 'helmet';
import crypto from 'crypto';

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

// Security middleware
app.use(helmet());
app.use(express.json({
  limit: '1mb',
  verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'github-webhook',
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
    // Validate webhook signature
    if (config.webhookSecret && !verifySignature(req.rawBody || '', signature)) {
      console.log(JSON.stringify({
        type: 'webhook_invalid_signature',
        delivery,
        event,
      }));
      return res.status(401).json({ error: 'Invalid signature' });
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
): Promise<{ status: string; workflowId?: string; skipped?: boolean; reason?: string }> {
  const body = payload as Record<string, unknown>;

  switch (event) {
    case 'pull_request':
      return handlePullRequestEvent(body, delivery);

    case 'issue_comment':
      return handleIssueCommentEvent(body, delivery);

    case 'issues':
      return handleIssueEvent(body, delivery);

    case 'push':
      return handlePushEvent(body, delivery);

    default:
      return { status: 'skipped', skipped: true, reason: `Unsupported event: ${event}` };
  }
}

/**
 * Handle pull_request events
 */
async function handlePullRequestEvent(
  payload: Record<string, unknown>,
  delivery: string
): Promise<{ status: string; workflowId?: string; skipped?: boolean; reason?: string }> {
  const action = payload.action as string;
  const pr = payload.pull_request as Record<string, unknown>;

  // Only handle specific actions
  const triggerActions = ['opened', 'synchronize', 'reopened'];
  if (!triggerActions.includes(action)) {
    return { status: 'skipped', skipped: true, reason: `Action ${action} not handled` };
  }

  // Check if PR has conflicts
  const mergeable = pr.mergeable as boolean | null;
  const mergeableState = pr.mergeable_state as string;

  if (mergeable !== false && mergeableState !== 'dirty') {
    return { status: 'skipped', skipped: true, reason: 'No conflicts detected' };
  }

  // Trigger pr-resolve workflow
  const workflowId = await triggerWorkflow('pr-resolve', {
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

  return { status: 'triggered', workflowId };
}

/**
 * Handle issue_comment events (for /gwi commands)
 */
async function handleIssueCommentEvent(
  payload: Record<string, unknown>,
  delivery: string
): Promise<{ status: string; workflowId?: string; skipped?: boolean; reason?: string }> {
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

  const command = body.slice(5).trim().split(' ')[0];
  const issue = payload.issue as Record<string, unknown>;
  const isPR = 'pull_request' in issue;

  // Handle commands
  switch (command) {
    case 'resolve':
      if (!isPR) {
        return { status: 'skipped', skipped: true, reason: 'Resolve only works on PRs' };
      }
      const workflowId = await triggerWorkflow('pr-resolve', {
        pr: { number: issue.number, url: issue.html_url },
        delivery,
        triggeredBy: (comment.user as Record<string, unknown>).login,
      });
      return { status: 'triggered', workflowId };

    case 'review':
      if (!isPR) {
        return { status: 'skipped', skipped: true, reason: 'Review only works on PRs' };
      }
      const reviewId = await triggerWorkflow('pr-review', {
        pr: { number: issue.number, url: issue.html_url },
        delivery,
        triggeredBy: (comment.user as Record<string, unknown>).login,
      });
      return { status: 'triggered', workflowId: reviewId };

    default:
      return { status: 'skipped', skipped: true, reason: `Unknown command: ${command}` };
  }
}

/**
 * Handle issues events
 */
async function handleIssueEvent(
  payload: Record<string, unknown>,
  delivery: string
): Promise<{ status: string; workflowId?: string; skipped?: boolean; reason?: string }> {
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

  // Trigger issue-to-code workflow
  const workflowId = await triggerWorkflow('issue-to-code', {
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      labels: labels.map(l => l.name),
    },
    delivery,
  });

  return { status: 'triggered', workflowId };
}

/**
 * Handle push events
 */
async function handlePushEvent(
  _payload: Record<string, unknown>,
  _delivery: string
): Promise<{ status: string; skipped: boolean; reason: string }> {
  // Push events could trigger CI checks
  return { status: 'skipped', skipped: true, reason: 'Push events not yet implemented' };
}

/**
 * Trigger a workflow via the orchestrator
 */
async function triggerWorkflow(
  type: string,
  input: Record<string, unknown>
): Promise<string> {
  const workflowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    env: config.env,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

export { app };
