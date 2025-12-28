/**
 * WebhookTestHarness - Generate and verify webhook payloads
 *
 * Provides utilities for testing webhook handling:
 * - Generate valid webhook payloads (GitHub, GitLab, etc.)
 * - HMAC signature generation and verification
 * - Send test webhooks to local receiver
 * - Verify webhook processing
 *
 * @module @gwi/core/connectors/testing
 */

import crypto from 'node:crypto';

// =============================================================================
// Webhook Payload Types
// =============================================================================

/**
 * GitHub webhook event types
 */
export type GitHubEventType =
  | 'pull_request'
  | 'push'
  | 'issues'
  | 'issue_comment'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'check_run'
  | 'check_suite';

/**
 * GitLab webhook event types
 */
export type GitLabEventType =
  | 'Push Hook'
  | 'Merge Request Hook'
  | 'Issue Hook'
  | 'Note Hook';

/**
 * Webhook payload builder options
 */
export interface WebhookOptions {
  /** Repository owner/org */
  owner?: string;

  /** Repository name */
  repo?: string;

  /** PR/issue/MR number */
  number?: number;

  /** User who triggered the event */
  sender?: string;

  /** Action type (opened, closed, synchronize, etc.) */
  action?: string;

  /** Additional custom data */
  data?: Record<string, unknown>;
}

// =============================================================================
// Webhook Signature Configuration
// =============================================================================

/**
 * Signature configuration for webhook verification
 */
export interface WebhookSignatureConfig {
  /** Secret key for HMAC generation */
  secret: string;

  /** Signature algorithm */
  algorithm?: 'sha1' | 'sha256';

  /** Header name for signature */
  headerName?: string;

  /** Signature prefix (e.g., 'sha256=') */
  prefix?: string;
}

// =============================================================================
// WebhookTestHarness Implementation
// =============================================================================

/**
 * WebhookTestHarness - Generate and verify webhook payloads
 *
 * @example
 * ```typescript
 * // Generate GitHub PR opened webhook
 * const harness = new WebhookTestHarness();
 * const { payload, headers } = harness.github('pull_request', {
 *   owner: 'acme',
 *   repo: 'app',
 *   number: 42,
 *   action: 'opened'
 * });
 *
 * // Verify signature
 * const isValid = harness.verifySignature(
 *   payload,
 *   headers['X-Hub-Signature-256'],
 *   { secret: 'webhook-secret' }
 * );
 * ```
 */
export class WebhookTestHarness {
  private defaultSecret = 'test-webhook-secret-123';

  // ===========================================================================
  // GitHub Webhook Payloads
  // ===========================================================================

  /**
   * Generate a GitHub webhook payload
   */
  github(
    event: GitHubEventType,
    options: WebhookOptions = {},
    signatureConfig?: WebhookSignatureConfig
  ): {
    payload: string;
    headers: Record<string, string>;
  } {
    const owner = options.owner ?? 'octocat';
    const repo = options.repo ?? 'hello-world';
    const number = options.number ?? 1;
    const sender = options.sender ?? 'octocat';
    const action = options.action ?? 'opened';

    let payloadObj: Record<string, unknown>;

    switch (event) {
      case 'pull_request':
        payloadObj = this.githubPullRequestPayload(owner, repo, number, sender, action, options.data);
        break;
      case 'push':
        payloadObj = this.githubPushPayload(owner, repo, sender, options.data);
        break;
      case 'issues':
        payloadObj = this.githubIssuesPayload(owner, repo, number, sender, action, options.data);
        break;
      case 'issue_comment':
        payloadObj = this.githubIssueCommentPayload(owner, repo, number, sender, action, options.data);
        break;
      case 'pull_request_review':
        payloadObj = this.githubPRReviewPayload(owner, repo, number, sender, action, options.data);
        break;
      default:
        payloadObj = { action, sender: { login: sender }, ...options.data };
    }

    const payload = JSON.stringify(payloadObj);
    const signature = this.generateSignature(
      payload,
      signatureConfig ?? { secret: this.defaultSecret, algorithm: 'sha256' }
    );

    return {
      payload,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': event,
        'X-Hub-Signature-256': signature,
        'X-GitHub-Delivery': crypto.randomUUID(),
      },
    };
  }

  private githubPullRequestPayload(
    owner: string,
    repo: string,
    number: number,
    sender: string,
    action: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      action,
      number,
      pull_request: {
        id: number * 1000,
        number,
        state: action === 'closed' ? 'closed' : 'open',
        title: `Test PR #${number}`,
        body: 'This is a test pull request',
        user: { login: sender, id: 12345 },
        head: {
          ref: 'feature-branch',
          sha: crypto.randomBytes(20).toString('hex'),
        },
        base: {
          ref: 'main',
          sha: crypto.randomBytes(20).toString('hex'),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
        ...customData,
      },
      repository: {
        id: 123456,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner, id: 54321 },
        html_url: `https://github.com/${owner}/${repo}`,
      },
      sender: { login: sender, id: 12345 },
    };
  }

  private githubPushPayload(
    owner: string,
    repo: string,
    sender: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ref: 'refs/heads/main',
      before: crypto.randomBytes(20).toString('hex'),
      after: crypto.randomBytes(20).toString('hex'),
      commits: [
        {
          id: crypto.randomBytes(20).toString('hex'),
          message: 'Test commit',
          author: { name: sender, email: `${sender}@example.com` },
          timestamp: new Date().toISOString(),
        },
      ],
      repository: {
        id: 123456,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner, id: 54321 },
      },
      pusher: { name: sender, email: `${sender}@example.com` },
      sender: { login: sender, id: 12345 },
      ...customData,
    };
  }

  private githubIssuesPayload(
    owner: string,
    repo: string,
    number: number,
    sender: string,
    action: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      action,
      issue: {
        id: number * 1000,
        number,
        title: `Test Issue #${number}`,
        body: 'This is a test issue',
        state: action === 'closed' ? 'closed' : 'open',
        user: { login: sender, id: 12345 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        html_url: `https://github.com/${owner}/${repo}/issues/${number}`,
        ...customData,
      },
      repository: {
        id: 123456,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner, id: 54321 },
      },
      sender: { login: sender, id: 12345 },
    };
  }

  private githubIssueCommentPayload(
    owner: string,
    repo: string,
    number: number,
    sender: string,
    action: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      action,
      issue: {
        number,
        title: `Test Issue #${number}`,
        state: 'open',
        user: { login: sender, id: 12345 },
      },
      comment: {
        id: number * 2000,
        body: 'This is a test comment',
        user: { login: sender, id: 12345 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...customData,
      },
      repository: {
        id: 123456,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner, id: 54321 },
      },
      sender: { login: sender, id: 12345 },
    };
  }

  private githubPRReviewPayload(
    owner: string,
    repo: string,
    number: number,
    sender: string,
    action: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      action,
      review: {
        id: number * 3000,
        body: 'This is a test review',
        user: { login: sender, id: 12345 },
        state: 'commented',
        submitted_at: new Date().toISOString(),
        ...customData,
      },
      pull_request: {
        number,
        title: `Test PR #${number}`,
        state: 'open',
      },
      repository: {
        id: 123456,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner, id: 54321 },
      },
      sender: { login: sender, id: 12345 },
    };
  }

  // ===========================================================================
  // GitLab Webhook Payloads
  // ===========================================================================

  /**
   * Generate a GitLab webhook payload
   */
  gitlab(
    event: GitLabEventType,
    options: WebhookOptions = {},
    signatureConfig?: WebhookSignatureConfig
  ): {
    payload: string;
    headers: Record<string, string>;
  } {
    const owner = options.owner ?? 'gitlab-org';
    const repo = options.repo ?? 'gitlab';
    const number = options.number ?? 1;
    const sender = options.sender ?? 'root';
    const action = options.action ?? 'open';

    let payloadObj: Record<string, unknown>;

    switch (event) {
      case 'Merge Request Hook':
        payloadObj = this.gitlabMergeRequestPayload(owner, repo, number, sender, action, options.data);
        break;
      case 'Push Hook':
        payloadObj = this.gitlabPushPayload(owner, repo, sender, options.data);
        break;
      default:
        payloadObj = { object_kind: event, user: { username: sender }, ...options.data };
    }

    const payload = JSON.stringify(payloadObj);
    const token = signatureConfig?.secret ?? this.defaultSecret;

    return {
      payload,
      headers: {
        'Content-Type': 'application/json',
        'X-Gitlab-Event': event,
        'X-Gitlab-Token': token, // GitLab uses simple token, not HMAC
      },
    };
  }

  private gitlabMergeRequestPayload(
    owner: string,
    repo: string,
    number: number,
    sender: string,
    action: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      object_kind: 'merge_request',
      object_attributes: {
        id: number * 1000,
        iid: number,
        title: `Test MR !${number}`,
        description: 'This is a test merge request',
        state: action === 'close' ? 'closed' : 'opened',
        source_branch: 'feature-branch',
        target_branch: 'main',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        action,
        ...customData,
      },
      project: {
        id: 123456,
        name: repo,
        path_with_namespace: `${owner}/${repo}`,
      },
      user: {
        username: sender,
        name: sender,
      },
    };
  }

  private gitlabPushPayload(
    owner: string,
    repo: string,
    sender: string,
    customData?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      object_kind: 'push',
      before: crypto.randomBytes(20).toString('hex'),
      after: crypto.randomBytes(20).toString('hex'),
      ref: 'refs/heads/main',
      commits: [
        {
          id: crypto.randomBytes(20).toString('hex'),
          message: 'Test commit',
          author: { name: sender, email: `${sender}@example.com` },
          timestamp: new Date().toISOString(),
        },
      ],
      project: {
        id: 123456,
        name: repo,
        path_with_namespace: `${owner}/${repo}`,
      },
      user_username: sender,
      ...customData,
    };
  }

  // ===========================================================================
  // Signature Generation & Verification
  // ===========================================================================

  /**
   * Generate HMAC signature for a payload
   */
  generateSignature(
    payload: string,
    config: WebhookSignatureConfig
  ): string {
    const algorithm = config.algorithm ?? 'sha256';
    const prefix = config.prefix ?? `${algorithm}=`;

    const hmac = crypto.createHmac(algorithm, config.secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    return `${prefix}${signature}`;
  }

  /**
   * Verify HMAC signature for a payload
   */
  verifySignature(
    payload: string,
    signature: string,
    config: WebhookSignatureConfig
  ): boolean {
    const expected = this.generateSignature(payload, config);

    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      // Length mismatch
      return false;
    }
  }

  /**
   * Extract signature from header value
   *
   * Handles formats like:
   * - 'sha256=abc123...'
   * - 'abc123...'
   */
  extractSignature(headerValue: string): string {
    const match = headerValue.match(/^(sha1|sha256)=(.+)$/);
    return match ? match[2] : headerValue;
  }

  // ===========================================================================
  // HTTP Request Simulation
  // ===========================================================================

  /**
   * Send webhook to a local endpoint (for integration testing)
   */
  async sendWebhook(
    url: string,
    payload: string,
    headers: Record<string, string>
  ): Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      body: await response.text(),
      headers: responseHeaders,
    };
  }

  // ===========================================================================
  // Batch Webhook Generation
  // ===========================================================================

  /**
   * Generate multiple webhook payloads for testing pagination/streams
   */
  generateBatch(
    count: number,
    generator: () => { payload: string; headers: Record<string, string> }
  ): Array<{ payload: string; headers: Record<string, string> }> {
    return Array.from({ length: count }, () => generator());
  }

  /**
   * Generate a sequence of related webhooks (PR opened → commented → merged)
   */
  githubPRLifecycle(
    owner: string,
    repo: string,
    number: number,
    secret?: string
  ): Array<{ payload: string; headers: Record<string, string>; event: string }> {
    const config = { secret: secret ?? this.defaultSecret, algorithm: 'sha256' as const };

    return [
      {
        event: 'PR opened',
        ...this.github('pull_request', { owner, repo, number, action: 'opened' }, config),
      },
      {
        event: 'Comment added',
        ...this.github('issue_comment', { owner, repo, number, action: 'created' }, config),
      },
      {
        event: 'Review submitted',
        ...this.github('pull_request_review', { owner, repo, number, action: 'submitted' }, config),
      },
      {
        event: 'PR merged',
        ...this.github('pull_request', { owner, repo, number, action: 'closed', data: { merged: true } }, config),
      },
    ];
  }
}

// Types are already exported via the type declarations above
// No need for re-export
