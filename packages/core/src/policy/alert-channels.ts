/**
 * Alert Channels for Violation Notifications
 *
 * Epic D: Policy & Audit - Story D5: Policy Violations & Alerts
 * Task D5.3: Implement alert channels
 *
 * Supports:
 * - Email notifications via Resend API
 * - Slack notifications via webhooks
 * - Generic webhook notifications (stub)
 * - Rate limiting to prevent notification spam
 *
 * @module @gwi/core/policy/alert-channels
 */

import { z } from 'zod';
import type { Violation, ViolationSeverity } from './violation-schema.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Supported alert channel types
 */
export type AlertChannelType = 'email' | 'slack' | 'webhook';

/**
 * Alert priority based on violation severity
 */
export type AlertPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Alert payload sent to channels
 */
export interface AlertPayload {
  /** Unique alert ID */
  id: string;
  /** Violation that triggered the alert */
  violation: Violation;
  /** Alert priority */
  priority: AlertPriority;
  /** Human-readable title */
  title: string;
  /** Human-readable summary */
  summary: string;
  /** Link to violation details (if available) */
  detailsUrl?: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Result of sending an alert
 */
export interface AlertResult {
  /** Whether the alert was sent successfully */
  success: boolean;
  /** Channel that was used */
  channel: AlertChannelType;
  /** External message ID (if available) */
  messageId?: string;
  /** Error message (if failed) */
  error?: string;
  /** Time taken to send (ms) */
  durationMs: number;
  /** Whether rate limited */
  rateLimited?: boolean;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  /** Channel type */
  type: AlertChannelType;
  /** Whether channel is enabled */
  enabled: boolean;
  /** Minimum severity to alert on */
  minSeverity: ViolationSeverity;
  /** Violation types to alert on (empty = all) */
  violationTypes?: string[];
  /** Rate limit: max alerts per window */
  rateLimit?: {
    maxAlerts: number;
    windowMs: number;
  };
}

// =============================================================================
// Email Channel Configuration
// =============================================================================

export const EmailChannelConfigSchema = z.object({
  type: z.literal('email'),
  enabled: z.boolean().default(true),
  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  violationTypes: z.array(z.string()).optional(),
  rateLimit: z.object({
    maxAlerts: z.number().default(10),
    windowMs: z.number().default(3600000), // 1 hour
  }).optional(),
  // Email-specific config
  apiKey: z.string().describe('Resend API key'),
  from: z.string().email().describe('Sender email address'),
  to: z.array(z.string().email()).min(1).describe('Recipient email addresses'),
  cc: z.array(z.string().email()).optional(),
  replyTo: z.string().email().optional(),
});

export type EmailChannelConfig = z.infer<typeof EmailChannelConfigSchema>;

// =============================================================================
// Slack Channel Configuration
// =============================================================================

export const SlackChannelConfigSchema = z.object({
  type: z.literal('slack'),
  enabled: z.boolean().default(true),
  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  violationTypes: z.array(z.string()).optional(),
  rateLimit: z.object({
    maxAlerts: z.number().default(20),
    windowMs: z.number().default(3600000),
  }).optional(),
  // Slack-specific config
  webhookUrl: z.string().url().describe('Slack incoming webhook URL'),
  channel: z.string().optional().describe('Override channel (if allowed)'),
  username: z.string().optional().default('GWI Security'),
  iconEmoji: z.string().optional().default(':shield:'),
  mentionUsers: z.array(z.string()).optional().describe('User IDs to mention on critical'),
  mentionGroups: z.array(z.string()).optional().describe('Group IDs to mention on critical'),
});

export type SlackChannelConfig = z.infer<typeof SlackChannelConfigSchema>;

// =============================================================================
// Webhook Channel Configuration (Stub)
// =============================================================================

export const WebhookChannelConfigSchema = z.object({
  type: z.literal('webhook'),
  enabled: z.boolean().default(true),
  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  violationTypes: z.array(z.string()).optional(),
  rateLimit: z.object({
    maxAlerts: z.number().default(100),
    windowMs: z.number().default(3600000),
  }).optional(),
  // Webhook-specific config
  url: z.string().url().describe('Webhook endpoint URL'),
  method: z.enum(['POST', 'PUT']).default('POST'),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional().describe('HMAC signing secret'),
  timeout: z.number().default(10000),
});

export type WebhookChannelConfig = z.infer<typeof WebhookChannelConfigSchema>;

// =============================================================================
// Alert Channel Interface
// =============================================================================

/**
 * Base interface for all alert channels
 */
export interface AlertChannel {
  /** Channel type identifier */
  readonly type: AlertChannelType;
  /** Channel name for logging */
  readonly name: string;
  /** Whether channel is currently enabled */
  isEnabled(): boolean;
  /** Check if channel should handle this violation */
  shouldAlert(violation: Violation): boolean;
  /** Send alert through this channel */
  send(payload: AlertPayload): Promise<AlertResult>;
  /** Test channel connectivity */
  test(): Promise<{ success: boolean; error?: string }>;
}

// =============================================================================
// Severity Utilities
// =============================================================================

const SEVERITY_WEIGHTS: Record<ViolationSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function severityToWeight(severity: ViolationSeverity): number {
  return SEVERITY_WEIGHTS[severity] ?? 1;
}

function severityToPriority(severity: ViolationSeverity): AlertPriority {
  switch (severity) {
    case 'critical': return 'urgent';
    case 'high': return 'high';
    case 'medium': return 'normal';
    case 'low': return 'low';
    default: return 'normal';
  }
}

function severityToColor(severity: ViolationSeverity): string {
  switch (severity) {
    case 'critical': return '#dc2626'; // red
    case 'high': return '#ea580c'; // orange
    case 'medium': return '#ca8a04'; // yellow
    case 'low': return '#16a34a'; // green
    default: return '#6b7280'; // gray
  }
}

// =============================================================================
// Email Channel Implementation (Resend)
// =============================================================================

/**
 * Email alert channel using Resend API
 */
export class EmailChannel implements AlertChannel {
  readonly type: AlertChannelType = 'email';
  readonly name: string;
  private readonly config: EmailChannelConfig;

  constructor(config: EmailChannelConfig) {
    this.config = EmailChannelConfigSchema.parse(config);
    this.name = `email:${this.config.to[0]}`;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  shouldAlert(violation: Violation): boolean {
    if (!this.config.enabled) return false;

    // Check severity threshold
    const minWeight = severityToWeight(this.config.minSeverity);
    const violationWeight = severityToWeight(violation.severity);
    if (violationWeight < minWeight) return false;

    // Check violation type filter
    if (this.config.violationTypes?.length) {
      if (!this.config.violationTypes.includes(violation.type)) return false;
    }

    return true;
  }

  async send(payload: AlertPayload): Promise<AlertResult> {
    const startTime = Date.now();

    try {
      const emailBody = this.buildEmailBody(payload);

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.from,
          to: this.config.to,
          cc: this.config.cc,
          reply_to: this.config.replyTo,
          subject: `[${payload.priority.toUpperCase()}] ${payload.title}`,
          html: emailBody,
          text: this.buildPlainTextBody(payload),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          channel: 'email',
          error: `Resend API error: ${response.status} - ${errorText}`,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await response.json() as { id: string };

      return {
        success: true,
        channel: 'email',
        messageId: result.id,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        channel: 'email',
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  async test(): Promise<{ success: boolean; error?: string }> {
    try {
      // Resend doesn't have a direct test endpoint, so we validate config
      if (!this.config.apiKey) {
        return { success: false, error: 'Missing API key' };
      }
      if (!this.config.from) {
        return { success: false, error: 'Missing from address' };
      }
      if (!this.config.to.length) {
        return { success: false, error: 'Missing recipients' };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildEmailBody(payload: AlertPayload): string {
    const color = severityToColor(payload.violation.severity);
    const v = payload.violation;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 24px; }
    .severity { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: white; background: ${color}; }
    .title { font-size: 20px; font-weight: 600; margin: 8px 0; }
    .section { margin: 16px 0; padding: 16px; background: #f9fafb; border-radius: 8px; }
    .section-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px; }
    .detail-row { display: flex; margin: 4px 0; }
    .detail-label { font-weight: 500; color: #6b7280; min-width: 120px; }
    .detail-value { color: #1f2937; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
    .btn { display: inline-block; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <span class="severity">${v.severity}</span>
    <h1 class="title">${payload.title}</h1>
    <p style="color: #6b7280; margin: 0;">${payload.summary}</p>
  </div>

  <div class="section">
    <div class="section-title">Violation Details</div>
    <div class="detail-row">
      <span class="detail-label">Type:</span>
      <span class="detail-value">${v.type}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Actor:</span>
      <span class="detail-value">${v.actor.name || v.actor.id} (${v.actor.type})</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Resource:</span>
      <span class="detail-value">${v.resource.name || v.resource.id} (${v.resource.type})</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Action:</span>
      <span class="detail-value">${v.action.type}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Detected:</span>
      <span class="detail-value">${v.detectedAt.toISOString()}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status:</span>
      <span class="detail-value">${v.status}</span>
    </div>
  </div>

  ${payload.detailsUrl ? `<a href="${payload.detailsUrl}" class="btn">View Details</a>` : ''}

  <div class="footer">
    <p>This is an automated alert from Git With Intent (GWI) security monitoring.</p>
    <p>Alert ID: ${payload.id} | Violation ID: ${v.id}</p>
  </div>
</body>
</html>`;
  }

  private buildPlainTextBody(payload: AlertPayload): string {
    const v = payload.violation;
    return `
[${payload.priority.toUpperCase()}] ${payload.title}

${payload.summary}

VIOLATION DETAILS
-----------------
Type: ${v.type}
Severity: ${v.severity}
Actor: ${v.actor.name || v.actor.id} (${v.actor.type})
Resource: ${v.resource.name || v.resource.id} (${v.resource.type})
Action: ${v.action.type}
Detected: ${v.detectedAt.toISOString()}
Status: ${v.status}

${payload.detailsUrl ? `View Details: ${payload.detailsUrl}` : ''}

---
Alert ID: ${payload.id}
Violation ID: ${v.id}
This is an automated alert from Git With Intent (GWI).
`.trim();
  }
}

// =============================================================================
// Slack Channel Implementation
// =============================================================================

/**
 * Slack alert channel using incoming webhooks
 */
export class SlackChannel implements AlertChannel {
  readonly type: AlertChannelType = 'slack';
  readonly name: string;
  private readonly config: SlackChannelConfig;

  constructor(config: SlackChannelConfig) {
    this.config = SlackChannelConfigSchema.parse(config);
    this.name = `slack:${this.config.channel || 'default'}`;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  shouldAlert(violation: Violation): boolean {
    if (!this.config.enabled) return false;

    const minWeight = severityToWeight(this.config.minSeverity);
    const violationWeight = severityToWeight(violation.severity);
    if (violationWeight < minWeight) return false;

    if (this.config.violationTypes?.length) {
      if (!this.config.violationTypes.includes(violation.type)) return false;
    }

    return true;
  }

  async send(payload: AlertPayload): Promise<AlertResult> {
    const startTime = Date.now();

    try {
      const slackPayload = this.buildSlackPayload(payload);

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          channel: 'slack',
          error: `Slack webhook error: ${response.status} - ${errorText}`,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        channel: 'slack',
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        channel: 'slack',
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  async test(): Promise<{ success: boolean; error?: string }> {
    try {
      // Send a test message
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'GWI Alert Channel Test - Connection successful',
          username: this.config.username,
          icon_emoji: this.config.iconEmoji,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildSlackPayload(payload: AlertPayload): Record<string, unknown> {
    const v = payload.violation;
    const color = severityToColor(v.severity);

    // Build mentions for critical alerts
    let mentionText = '';
    if (v.severity === 'critical') {
      const mentions: string[] = [];
      if (this.config.mentionUsers?.length) {
        mentions.push(...this.config.mentionUsers.map(u => `<@${u}>`));
      }
      if (this.config.mentionGroups?.length) {
        mentions.push(...this.config.mentionGroups.map(g => `<!subteam^${g}>`));
      }
      if (mentions.length > 0) {
        mentionText = mentions.join(' ') + ' ';
      }
    }

    const slackPayload: Record<string, unknown> = {
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      text: `${mentionText}${payload.title}`,
      attachments: [
        {
          color,
          fallback: `${payload.title}: ${payload.summary}`,
          title: payload.title,
          title_link: payload.detailsUrl,
          text: payload.summary,
          fields: [
            { title: 'Type', value: v.type, short: true },
            { title: 'Severity', value: v.severity.toUpperCase(), short: true },
            { title: 'Actor', value: `${v.actor.name || v.actor.id}`, short: true },
            { title: 'Resource', value: `${v.resource.name || v.resource.id}`, short: true },
            { title: 'Action', value: v.action.type, short: true },
            { title: 'Status', value: v.status, short: true },
          ],
          footer: 'GWI Security',
          footer_icon: 'https://git-with-intent.io/favicon.ico',
          ts: Math.floor(payload.timestamp.getTime() / 1000),
        },
      ],
    };

    if (this.config.channel) {
      slackPayload.channel = this.config.channel;
    }

    return slackPayload;
  }
}

// =============================================================================
// Webhook Channel Implementation (Stub)
// =============================================================================

/**
 * Generic webhook alert channel (stub implementation)
 *
 * This is a placeholder for custom webhook integrations.
 * Future implementation will support:
 * - Custom payload templates
 * - HMAC request signing
 * - Retry logic with backoff
 * - Response validation
 */
export class WebhookChannel implements AlertChannel {
  readonly type: AlertChannelType = 'webhook';
  readonly name: string;
  private readonly config: WebhookChannelConfig;

  constructor(config: WebhookChannelConfig) {
    this.config = WebhookChannelConfigSchema.parse(config);
    this.name = `webhook:${new URL(this.config.url).hostname}`;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  shouldAlert(violation: Violation): boolean {
    if (!this.config.enabled) return false;

    const minWeight = severityToWeight(this.config.minSeverity);
    const violationWeight = severityToWeight(violation.severity);
    if (violationWeight < minWeight) return false;

    if (this.config.violationTypes?.length) {
      if (!this.config.violationTypes.includes(violation.type)) return false;
    }

    return true;
  }

  async send(_payload: AlertPayload): Promise<AlertResult> {
    const startTime = Date.now();

    // STUB: Return not implemented error
    // Full implementation would:
    // 1. Build webhook payload from template
    // 2. Sign request with HMAC if secret provided
    // 3. Send request with timeout
    // 4. Validate response
    // 5. Retry on failure with exponential backoff

    return {
      success: false,
      channel: 'webhook',
      error: 'Webhook channel not yet implemented - use email or slack channels',
      durationMs: Date.now() - startTime,
    };
  }

  async test(): Promise<{ success: boolean; error?: string }> {
    // STUB: Validate config only
    try {
      new URL(this.config.url);
      return {
        success: false,
        error: 'Webhook channel not yet implemented - configuration is valid but sending is disabled'
      };
    } catch {
      return { success: false, error: 'Invalid webhook URL' };
    }
  }
}

// =============================================================================
// Rate Limiter
// =============================================================================

interface RateLimitState {
  count: number;
  windowStart: number;
}

/**
 * Simple sliding window rate limiter
 */
class RateLimiter {
  private readonly limits: Map<string, RateLimitState> = new Map();

  /**
   * Check if action is allowed under rate limit
   * @returns true if allowed, false if rate limited
   */
  check(key: string, maxCount: number, windowMs: number): boolean {
    const now = Date.now();
    const state = this.limits.get(key);

    if (!state || now - state.windowStart >= windowMs) {
      // Start new window
      this.limits.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (state.count >= maxCount) {
      return false;
    }

    state.count++;
    return true;
  }

  /**
   * Get remaining count for key
   */
  remaining(key: string, maxCount: number, windowMs: number): number {
    const now = Date.now();
    const state = this.limits.get(key);

    if (!state || now - state.windowStart >= windowMs) {
      return maxCount;
    }

    return Math.max(0, maxCount - state.count);
  }

  /**
   * Reset rate limit for key
   */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.limits.clear();
  }
}

// =============================================================================
// Alert Dispatcher
// =============================================================================

/**
 * Dispatcher configuration
 */
export interface AlertDispatcherConfig {
  /** Registered alert channels */
  channels: AlertChannel[];
  /** Default rate limit (per channel per tenant) */
  defaultRateLimit?: {
    maxAlerts: number;
    windowMs: number;
  };
  /** Base URL for violation details links */
  detailsBaseUrl?: string;
  /** Callback for dispatched alerts */
  onAlertDispatched?: (result: AlertResult, payload: AlertPayload) => void | Promise<void>;
  /** Callback for rate limited alerts */
  onRateLimited?: (channel: AlertChannel, violation: Violation) => void | Promise<void>;
}

/**
 * Dispatch result for a single violation
 */
export interface DispatchResult {
  /** Violation that was dispatched */
  violationId: string;
  /** Results from each channel */
  results: AlertResult[];
  /** Total channels attempted */
  channelsAttempted: number;
  /** Channels that succeeded */
  channelsSucceeded: number;
  /** Channels that were rate limited */
  channelsRateLimited: number;
}

/**
 * Alert dispatcher - routes violations to configured channels with rate limiting
 */
export class AlertDispatcher {
  private readonly channels: AlertChannel[];
  private readonly config: AlertDispatcherConfig;
  private readonly rateLimiter: RateLimiter;

  constructor(config: AlertDispatcherConfig) {
    this.config = config;
    this.channels = config.channels;
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Dispatch alert for a violation to all applicable channels
   */
  async dispatch(violation: Violation, tenantId: string): Promise<DispatchResult> {
    const payload = this.buildPayload(violation);
    const results: AlertResult[] = [];
    let rateLimited = 0;

    for (const channel of this.channels) {
      // Skip if channel shouldn't handle this violation
      if (!channel.shouldAlert(violation)) {
        continue;
      }

      // Check rate limit
      const rateLimitKey = `${tenantId}:${channel.type}:${channel.name}`;
      const rateLimit = this.config.defaultRateLimit ?? { maxAlerts: 50, windowMs: 3600000 };

      if (!this.rateLimiter.check(rateLimitKey, rateLimit.maxAlerts, rateLimit.windowMs)) {
        rateLimited++;
        results.push({
          success: false,
          channel: channel.type,
          rateLimited: true,
          error: 'Rate limit exceeded',
          durationMs: 0,
        });

        if (this.config.onRateLimited) {
          await this.config.onRateLimited(channel, violation);
        }
        continue;
      }

      // Send alert
      const result = await channel.send(payload);
      results.push(result);

      if (this.config.onAlertDispatched) {
        await this.config.onAlertDispatched(result, payload);
      }
    }

    return {
      violationId: violation.id,
      results,
      channelsAttempted: results.length,
      channelsSucceeded: results.filter(r => r.success).length,
      channelsRateLimited: rateLimited,
    };
  }

  /**
   * Get all registered channels
   */
  getChannels(): AlertChannel[] {
    return [...this.channels];
  }

  /**
   * Get enabled channels
   */
  getEnabledChannels(): AlertChannel[] {
    return this.channels.filter(c => c.isEnabled());
  }

  /**
   * Add a channel to the dispatcher
   */
  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  /**
   * Remove a channel by name
   */
  removeChannel(name: string): boolean {
    const index = this.channels.findIndex(c => c.name === name);
    if (index >= 0) {
      this.channels.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Test all channels
   */
  async testChannels(): Promise<Map<string, { success: boolean; error?: string }>> {
    const results = new Map<string, { success: boolean; error?: string }>();

    for (const channel of this.channels) {
      const result = await channel.test();
      results.set(channel.name, result);
    }

    return results;
  }

  /**
   * Reset rate limits (useful for testing)
   */
  resetRateLimits(): void {
    this.rateLimiter.clear();
  }

  private buildPayload(violation: Violation): AlertPayload {
    const title = this.buildTitle(violation);
    const summary = this.buildSummary(violation);

    return {
      id: `alert-${violation.id}-${Date.now()}`,
      violation,
      priority: severityToPriority(violation.severity),
      title,
      summary,
      detailsUrl: this.config.detailsBaseUrl
        ? `${this.config.detailsBaseUrl}/violations/${violation.id}`
        : undefined,
      timestamp: new Date(),
    };
  }

  private buildTitle(violation: Violation): string {
    const typeLabels: Record<string, string> = {
      'policy-denied': 'Policy Violation',
      'approval-bypassed': 'Approval Bypass',
      'limit-exceeded': 'Rate Limit Exceeded',
      'anomaly-detected': 'Anomaly Detected',
    };

    const label = typeLabels[violation.type] || violation.type;
    return `${label}: ${violation.action.type} by ${violation.actor.name || violation.actor.id}`;
  }

  private buildSummary(violation: Violation): string {
    const actor = violation.actor.name || violation.actor.id;
    const resource = violation.resource.name || violation.resource.id;

    switch (violation.type) {
      case 'policy-denied':
        return `${actor} attempted ${violation.action.type} on ${resource} but was denied by policy`;
      case 'approval-bypassed':
        return `${actor} bypassed required approval for ${violation.action.type} on ${resource}`;
      case 'limit-exceeded':
        return `${actor} exceeded rate limit for ${violation.action.type} on ${resource}`;
      case 'anomaly-detected':
        return `Anomalous behavior detected: ${actor} performed ${violation.action.type} on ${resource}`;
      default:
        return `Security violation by ${actor} on ${resource}`;
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an email channel with Resend
 */
export function createEmailChannel(config: EmailChannelConfig): EmailChannel {
  return new EmailChannel(config);
}

/**
 * Create a Slack channel with webhook
 */
export function createSlackChannel(config: SlackChannelConfig): SlackChannel {
  return new SlackChannel(config);
}

/**
 * Create a webhook channel (stub)
 */
export function createWebhookChannel(config: WebhookChannelConfig): WebhookChannel {
  return new WebhookChannel(config);
}

/**
 * Create an alert dispatcher
 */
export function createAlertDispatcher(config: AlertDispatcherConfig): AlertDispatcher {
  return new AlertDispatcher(config);
}

// =============================================================================
// Singleton Management
// =============================================================================

let defaultDispatcher: AlertDispatcher | undefined;

/**
 * Initialize the default alert dispatcher
 */
export function initializeAlertDispatcher(config: AlertDispatcherConfig): AlertDispatcher {
  defaultDispatcher = new AlertDispatcher(config);
  return defaultDispatcher;
}

/**
 * Get the default alert dispatcher
 * @throws Error if not initialized
 */
export function getAlertDispatcher(): AlertDispatcher {
  if (!defaultDispatcher) {
    throw new Error('Alert dispatcher not initialized. Call initializeAlertDispatcher first.');
  }
  return defaultDispatcher;
}

/**
 * Set the default alert dispatcher (for testing)
 */
export function setAlertDispatcher(dispatcher: AlertDispatcher): void {
  defaultDispatcher = dispatcher;
}

/**
 * Reset the default alert dispatcher
 */
export function resetAlertDispatcher(): void {
  defaultDispatcher = undefined;
}
