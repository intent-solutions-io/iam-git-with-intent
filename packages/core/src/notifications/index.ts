/**
 * Notification System
 *
 * Phase 13: Workflow Catalog - Notification connectors and routing
 *
 * Features:
 * - Multiple notification channels (webhook, slack, email)
 * - Run state change notifications with 5W evidence
 * - Rate limiting per tenant
 * - Secret redaction
 *
 * @module @gwi/core/notifications
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Run states that trigger notifications
 */
export type NotificationEvent =
  | 'run_started'
  | 'run_awaiting_approval'
  | 'run_approved'
  | 'run_rejected'
  | 'run_completed'
  | 'run_failed';

/**
 * 5W evidence for notifications
 */
export interface FiveWEvidence {
  who: string;      // Who triggered/performed the action
  what: string;     // What action was taken
  when: string;     // ISO timestamp
  where: string;    // Resource location (repo, PR, etc.)
  why: string;      // Reason/trigger for the action
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  event: NotificationEvent;
  tenantId: string;
  runId: string;
  instanceId?: string;
  templateRef?: string;
  status: string;
  evidence: FiveWEvidence;
  links: {
    runUrl?: string;
    prUrl?: string;
    approvalUrl?: string;
  };
  metadata: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Notification channel configuration
 */
export interface NotificationChannelConfig {
  type: 'webhook' | 'slack' | 'email';
  enabled: boolean;
  /** Events to notify on (empty = all) */
  events?: NotificationEvent[];
  /** Channel-specific settings */
  settings: Record<string, unknown>;
}

/**
 * Notification result
 */
export interface NotificationResult {
  success: boolean;
  channel: string;
  error?: string;
  responseCode?: number;
}

// =============================================================================
// Base Notification Connector
// =============================================================================

/**
 * Base interface for notification connectors
 */
export interface NotificationConnector {
  readonly type: string;
  readonly name: string;

  /**
   * Send a notification
   */
  send(payload: NotificationPayload, config: NotificationChannelConfig): Promise<NotificationResult>;

  /**
   * Validate configuration
   */
  validateConfig(config: NotificationChannelConfig): { valid: boolean; errors: string[] };
}

// =============================================================================
// Webhook Notification Connector
// =============================================================================

/**
 * Webhook notification connector
 * Sends HTTP POST requests to configured endpoints
 */
export class WebhookNotificationConnector implements NotificationConnector {
  readonly type = 'webhook';
  readonly name = 'Webhook';

  async send(payload: NotificationPayload, config: NotificationChannelConfig): Promise<NotificationResult> {
    const url = config.settings.url as string;
    const headers = (config.settings.headers as Record<string, string>) || {};
    const secret = config.settings.secret as string | undefined;

    try {
      // Build webhook payload (never include raw secrets)
      const webhookPayload = {
        event: payload.event,
        tenantId: payload.tenantId,
        runId: payload.runId,
        instanceId: payload.instanceId,
        status: payload.status,
        evidence: payload.evidence,
        links: payload.links,
        timestamp: payload.timestamp.toISOString(),
        metadata: this.redactSecrets(payload.metadata),
      };

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'GWI-Webhook/1.0',
        ...headers,
      };

      // Add signature if secret is configured
      if (secret) {
        const signature = await this.computeSignature(JSON.stringify(webhookPayload), secret);
        requestHeaders['X-GWI-Signature'] = signature;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(webhookPayload),
      });

      return {
        success: response.ok,
        channel: this.type,
        responseCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        channel: this.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  validateConfig(config: NotificationChannelConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.settings.url) {
      errors.push('Webhook URL is required');
    } else {
      try {
        new URL(config.settings.url as string);
      } catch {
        errors.push('Invalid webhook URL');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private async computeSignature(payload: string, secret: string): Promise<string> {
    // Use Web Crypto API for HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return `sha256=${Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const secretPatterns = ['password', 'secret', 'token', 'key', 'api_key', 'apikey'];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (secretPatterns.some(p => lowerKey.includes(p))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactSecrets(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

// =============================================================================
// Slack Notification Connector
// =============================================================================

/**
 * Slack notification connector
 * Uses Slack webhook URLs to send messages
 */
export class SlackNotificationConnector implements NotificationConnector {
  readonly type = 'slack';
  readonly name = 'Slack';

  async send(payload: NotificationPayload, config: NotificationChannelConfig): Promise<NotificationResult> {
    const webhookUrl = config.settings.webhookUrl as string;
    const channel = config.settings.channel as string | undefined;

    try {
      // Build Slack message
      const color = this.getEventColor(payload.event);
      const icon = this.getEventIcon(payload.event);

      const slackPayload = {
        channel,
        attachments: [
          {
            color,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `${icon} ${this.getEventTitle(payload.event)}`,
                  emoji: true,
                },
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Who:*\n${payload.evidence.who}` },
                  { type: 'mrkdwn', text: `*What:*\n${payload.evidence.what}` },
                  { type: 'mrkdwn', text: `*When:*\n${payload.evidence.when}` },
                  { type: 'mrkdwn', text: `*Where:*\n${payload.evidence.where}` },
                ],
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Why:* ${payload.evidence.why}`,
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `Run ID: \`${payload.runId}\` | Status: \`${payload.status}\``,
                  },
                ],
              },
            ],
          },
        ],
      };

      // Add action buttons if links are available
      const actions = [];
      if (payload.links.runUrl) {
        actions.push({
          type: 'button',
          text: { type: 'plain_text', text: 'View Run', emoji: true },
          url: payload.links.runUrl,
        });
      }
      if (payload.links.prUrl) {
        actions.push({
          type: 'button',
          text: { type: 'plain_text', text: 'View PR', emoji: true },
          url: payload.links.prUrl,
        });
      }
      if (payload.links.approvalUrl && payload.event === 'run_awaiting_approval') {
        actions.push({
          type: 'button',
          text: { type: 'plain_text', text: 'Review & Approve', emoji: true },
          url: payload.links.approvalUrl,
          style: 'primary',
        });
      }

      if (actions.length > 0) {
        slackPayload.attachments[0].blocks.push({
          type: 'actions',
          elements: actions,
        } as never);
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
      });

      return {
        success: response.ok,
        channel: this.type,
        responseCode: response.status,
        error: response.ok ? undefined : `Slack webhook failed: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        channel: this.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  validateConfig(config: NotificationChannelConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.settings.webhookUrl) {
      errors.push('Slack webhook URL is required');
    } else {
      try {
        const url = new URL(config.settings.webhookUrl as string);
        if (!url.hostname.includes('slack.com')) {
          errors.push('Invalid Slack webhook URL');
        }
      } catch {
        errors.push('Invalid webhook URL format');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private getEventColor(event: NotificationEvent): string {
    switch (event) {
      case 'run_started': return '#2196F3';       // Blue
      case 'run_awaiting_approval': return '#FF9800'; // Orange
      case 'run_approved': return '#4CAF50';      // Green
      case 'run_rejected': return '#f44336';      // Red
      case 'run_completed': return '#4CAF50';     // Green
      case 'run_failed': return '#f44336';        // Red
      default: return '#9E9E9E';                  // Gray
    }
  }

  private getEventIcon(event: NotificationEvent): string {
    switch (event) {
      case 'run_started': return '🚀';
      case 'run_awaiting_approval': return '⏳';
      case 'run_approved': return '✅';
      case 'run_rejected': return '❌';
      case 'run_completed': return '🎉';
      case 'run_failed': return '💥';
      default: return '📋';
    }
  }

  private getEventTitle(event: NotificationEvent): string {
    switch (event) {
      case 'run_started': return 'Workflow Run Started';
      case 'run_awaiting_approval': return 'Approval Required';
      case 'run_approved': return 'Workflow Approved';
      case 'run_rejected': return 'Workflow Rejected';
      case 'run_completed': return 'Workflow Completed';
      case 'run_failed': return 'Workflow Failed';
      default: return 'Workflow Update';
    }
  }
}

// =============================================================================
// Email Notification Connector (Stub)
// =============================================================================

/**
 * Email notification connector (stub implementation)
 * In production, integrate with SendGrid, SES, etc.
 */
export class EmailNotificationConnector implements NotificationConnector {
  readonly type = 'email';
  readonly name = 'Email';

  async send(payload: NotificationPayload, config: NotificationChannelConfig): Promise<NotificationResult> {
    const to = config.settings.to as string | string[];
    // From address for emails (used in production integrations)
    const _fromAddress = config.settings.from as string || 'notifications@gwi.dev';
    void _fromAddress; // Silence unused variable warning in stub

    // Stub implementation - log email that would be sent
    console.log(JSON.stringify({
      type: 'email_notification_stub',
      to,
      subject: this.getSubject(payload),
      event: payload.event,
      runId: payload.runId,
      timestamp: new Date().toISOString(),
    }));

    // Return success for stub (in production, integrate with email provider)
    return {
      success: true,
      channel: this.type,
      error: undefined,
    };
  }

  validateConfig(config: NotificationChannelConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.settings.to) {
      errors.push('Email recipient(s) required');
    }

    return { valid: errors.length === 0, errors };
  }

  private getSubject(payload: NotificationPayload): string {
    switch (payload.event) {
      case 'run_started': return `[GWI] Workflow started: ${payload.runId}`;
      case 'run_awaiting_approval': return `[GWI] Approval needed: ${payload.runId}`;
      case 'run_approved': return `[GWI] Workflow approved: ${payload.runId}`;
      case 'run_rejected': return `[GWI] Workflow rejected: ${payload.runId}`;
      case 'run_completed': return `[GWI] Workflow completed: ${payload.runId}`;
      case 'run_failed': return `[GWI] Workflow failed: ${payload.runId}`;
      default: return `[GWI] Workflow update: ${payload.runId}`;
    }
  }
}

// =============================================================================
// Notification Router
// =============================================================================

/**
 * Rate limit state per tenant
 */
interface RateLimitState {
  count: number;
  windowStart: Date;
}

/**
 * Notification Router
 * Routes notifications to configured channels with rate limiting
 */
export class NotificationRouter {
  private connectors: Map<string, NotificationConnector> = new Map();
  private rateLimits: Map<string, RateLimitState> = new Map();
  private rateLimitWindow = 60000; // 1 minute
  private rateLimitMax = 60; // Max notifications per tenant per minute

  constructor() {
    // Register built-in connectors
    this.registerConnector(new WebhookNotificationConnector());
    this.registerConnector(new SlackNotificationConnector());
    this.registerConnector(new EmailNotificationConnector());
  }

  /**
   * Register a notification connector
   */
  registerConnector(connector: NotificationConnector): void {
    this.connectors.set(connector.type, connector);
  }

  /**
   * Send notification to all configured channels
   */
  async send(
    payload: NotificationPayload,
    channels: NotificationChannelConfig[]
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // Check rate limit
    if (!this.checkRateLimit(payload.tenantId)) {
      console.warn(JSON.stringify({
        type: 'notification_rate_limited',
        tenantId: payload.tenantId,
        event: payload.event,
        timestamp: new Date().toISOString(),
      }));
      return [{
        success: false,
        channel: 'all',
        error: 'Rate limit exceeded',
      }];
    }

    for (const channelConfig of channels) {
      // Skip disabled channels
      if (!channelConfig.enabled) continue;

      // Skip if channel doesn't handle this event
      if (channelConfig.events && channelConfig.events.length > 0) {
        if (!channelConfig.events.includes(payload.event)) continue;
      }

      const connector = this.connectors.get(channelConfig.type);
      if (!connector) {
        results.push({
          success: false,
          channel: channelConfig.type,
          error: `Unknown channel type: ${channelConfig.type}`,
        });
        continue;
      }

      // Validate config
      const validation = connector.validateConfig(channelConfig);
      if (!validation.valid) {
        results.push({
          success: false,
          channel: channelConfig.type,
          error: `Invalid config: ${validation.errors.join(', ')}`,
        });
        continue;
      }

      // Send notification
      const result = await connector.send(payload, channelConfig);
      results.push(result);

      // Log result
      console.log(JSON.stringify({
        type: 'notification_sent',
        channel: channelConfig.type,
        success: result.success,
        event: payload.event,
        tenantId: payload.tenantId,
        runId: payload.runId,
        error: result.error,
        timestamp: new Date().toISOString(),
      }));
    }

    // Increment rate limit counter
    this.incrementRateLimit(payload.tenantId);

    return results;
  }

  /**
   * Create a notification payload from run data
   */
  createPayload(params: {
    event: NotificationEvent;
    tenantId: string;
    runId: string;
    instanceId?: string;
    templateRef?: string;
    status: string;
    triggeredBy: string;
    action: string;
    resourceUrl: string;
    reason: string;
    links?: { runUrl?: string; prUrl?: string; approvalUrl?: string };
    metadata?: Record<string, unknown>;
  }): NotificationPayload {
    return {
      event: params.event,
      tenantId: params.tenantId,
      runId: params.runId,
      instanceId: params.instanceId,
      templateRef: params.templateRef,
      status: params.status,
      evidence: {
        who: params.triggeredBy,
        what: params.action,
        when: new Date().toISOString(),
        where: params.resourceUrl,
        why: params.reason,
      },
      links: params.links || {},
      metadata: params.metadata || {},
      timestamp: new Date(),
    };
  }

  private checkRateLimit(tenantId: string): boolean {
    const now = new Date();
    const state = this.rateLimits.get(tenantId);

    if (!state) {
      return true;
    }

    const elapsed = now.getTime() - state.windowStart.getTime();
    if (elapsed > this.rateLimitWindow) {
      // Window expired, reset
      return true;
    }

    return state.count < this.rateLimitMax;
  }

  private incrementRateLimit(tenantId: string): void {
    const now = new Date();
    const state = this.rateLimits.get(tenantId);

    if (!state || now.getTime() - state.windowStart.getTime() > this.rateLimitWindow) {
      // Start new window
      this.rateLimits.set(tenantId, { count: 1, windowStart: now });
    } else {
      state.count++;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let routerInstance: NotificationRouter | null = null;

/**
 * Get the notification router singleton
 */
export function getNotificationRouter(): NotificationRouter {
  if (!routerInstance) {
    routerInstance = new NotificationRouter();
  }
  return routerInstance;
}

/**
 * Reset the notification router (for testing)
 */
export function resetNotificationRouter(): void {
  routerInstance = null;
}
