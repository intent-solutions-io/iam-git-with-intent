/**
 * Notification Interface
 *
 * Story C4: Sends notifications via Slack, email, webhook, etc.
 * This is a stub implementation - actual integrations to be added later.
 *
 * @module @gwi/engine/approval
 */

import { getLogger } from '@gwi/core';
import type {
  NotificationChannel,
  NotificationChannelType,
  NotificationMessage,
  ApprovalRequest,
} from './types.js';

const logger = getLogger('notifier');

// =============================================================================
// Notification Result
// =============================================================================

/**
 * Result of sending a notification
 */
export interface NotificationResult {
  /**
   * Whether the notification was sent successfully
   */
  success: boolean;

  /**
   * Channel type
   */
  channel: NotificationChannelType;

  /**
   * Recipient(s)
   */
  recipients: string[];

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Timestamp when sent
   */
  sentAt: Date;

  /**
   * External message ID (e.g., Slack message TS, email ID)
   */
  messageId?: string;
}

// =============================================================================
// Notifier Interface
// =============================================================================

/**
 * Interface for sending notifications
 */
export interface Notifier {
  /**
   * Send a notification message via a specific channel
   */
  send(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult>;

  /**
   * Send a notification via all enabled channels
   */
  sendToAll(channels: NotificationChannel[], message: NotificationMessage): Promise<NotificationResult[]>;

  /**
   * Test if a notification channel is configured and working
   */
  testChannel(channel: NotificationChannel): Promise<boolean>;
}

// =============================================================================
// Stub Implementation
// =============================================================================

/**
 * Stub implementation of Notifier
 * Logs notifications instead of actually sending them
 *
 * TODO: Implement actual integrations for Slack, email, webhook
 */
export class StubNotifier implements Notifier {
  private sentNotifications: NotificationResult[] = [];

  async send(
    channel: NotificationChannel,
    message: NotificationMessage
  ): Promise<NotificationResult> {
    const now = new Date();

    logger.info('Notification sent', {
      type: 'notification_sent',
      channel: channel.type,
      subject: message.subject,
      recipients: message.recipients,
      approvalRequestId: message.approvalRequestId,
      runId: message.runId,
    });

    const result: NotificationResult = {
      success: true,
      channel: channel.type,
      recipients: message.recipients,
      sentAt: now,
      messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    this.sentNotifications.push(result);
    return result;
  }

  async sendToAll(
    channels: NotificationChannel[],
    message: NotificationMessage
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      if (channel.enabled) {
        try {
          const result = await this.send(channel, message);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            channel: channel.type,
            recipients: message.recipients,
            error: error instanceof Error ? error.message : 'Unknown error',
            sentAt: new Date(),
          });
        }
      }
    }

    return results;
  }

  async testChannel(channel: NotificationChannel): Promise<boolean> {
    // For stub, always return true if enabled
    return channel.enabled;
  }

  /**
   * Get sent notifications (for testing)
   */
  getSentNotifications(): NotificationResult[] {
    return this.sentNotifications;
  }

  /**
   * Clear sent notifications (for testing)
   */
  clearSentNotifications(): void {
    this.sentNotifications = [];
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a notification message for an approval request
 */
export function createApprovalRequestNotification(
  request: ApprovalRequest,
  action: 'created' | 'escalated' | 'timeout' | 'approved' | 'rejected'
): NotificationMessage {
  const subject = createSubject(request, action);
  const body = createBody(request, action);

  return {
    subject,
    body,
    approvalRequestId: request.id,
    runId: request.runId,
    recipients: request.approvers,
    priority: getPriority(request, action),
  };
}

/**
 * Create notification subject
 */
function createSubject(request: ApprovalRequest, action: string): string {
  const riskLevel = request.context?.riskLevel || 'medium';
  const riskEmoji = getRiskEmoji(riskLevel);

  switch (action) {
    case 'created':
      return `${riskEmoji} Approval Required: ${request.context?.description || 'Step approval'}`;
    case 'escalated':
      return `🔺 Escalated Approval: ${request.context?.description || 'Step approval'} (Level ${request.escalationCount})`;
    case 'timeout':
      return `⏰ Approval Timeout: ${request.context?.description || 'Step approval'}`;
    case 'approved':
      return `✅ Approved: ${request.context?.description || 'Step approval'}`;
    case 'rejected':
      return `❌ Rejected: ${request.context?.description || 'Step approval'}`;
    default:
      return `Approval Update: ${request.context?.description || 'Step approval'}`;
  }
}

/**
 * Create notification body
 */
function createBody(request: ApprovalRequest, action: string): string {
  const lines: string[] = [];

  // Header
  lines.push(`**Approval Request:** ${request.id}`);
  lines.push(`**Run ID:** ${request.runId}`);
  lines.push(`**Step ID:** ${request.stepId}`);
  lines.push('');

  // Description
  if (request.context?.description) {
    lines.push(`**Description:**`);
    lines.push(request.context.description);
    lines.push('');
  }

  // Risk level
  if (request.context?.riskLevel) {
    lines.push(`**Risk Level:** ${request.context.riskLevel.toUpperCase()}`);
    lines.push('');
  }

  // Changes
  if (request.context?.changes && request.context.changes.length > 0) {
    lines.push(`**Changes:**`);
    for (const change of request.context.changes) {
      const added = change.linesAdded ? `+${change.linesAdded}` : '';
      const deleted = change.linesDeleted ? `-${change.linesDeleted}` : '';
      const stats = [added, deleted].filter(Boolean).join(', ');
      lines.push(`- ${change.action.toUpperCase()} ${change.file}${stats ? ` (${stats})` : ''}`);
    }
    lines.push('');
  }

  // Action-specific info
  switch (action) {
    case 'created':
      lines.push(`**Approvers:** ${request.approvers.join(', ')}`);
      lines.push(`**Policy:** ${request.policy}`);
      if (request.expiresAt) {
        lines.push(`**Expires:** ${request.expiresAt.toISOString()}`);
      }
      break;
    case 'escalated':
      lines.push(`**Escalation Level:** ${request.escalationCount}`);
      lines.push(`**Previous Approvers:** ${request.approvers.join(', ')}`);
      break;
    case 'timeout':
      lines.push(`**Timeout Action:** Auto-reject`);
      break;
    case 'approved':
    case 'rejected':
      const lastDecision = request.decisions[request.decisions.length - 1];
      if (lastDecision) {
        lines.push(`**Decision By:** ${lastDecision.decidedBy}`);
        if (lastDecision.reason) {
          lines.push(`**Reason:** ${lastDecision.reason}`);
        }
      }
      break;
  }

  return lines.join('\n');
}

/**
 * Get risk emoji
 */
function getRiskEmoji(riskLevel: string): string {
  switch (riskLevel) {
    case 'low':
      return '🟢';
    case 'medium':
      return '🟡';
    case 'high':
      return '🟠';
    case 'critical':
      return '🔴';
    default:
      return '⚪';
  }
}

/**
 * Get notification priority
 */
function getPriority(
  request: ApprovalRequest,
  action: string
): 'low' | 'normal' | 'high' | 'urgent' {
  const riskLevel = request.context?.riskLevel || 'medium';

  if (action === 'escalated' || action === 'timeout') {
    return 'urgent';
  }

  switch (riskLevel) {
    case 'critical':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'normal';
    case 'low':
      return 'low';
    default:
      return 'normal';
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let notifierInstance: Notifier | null = null;

/**
 * Get the Notifier singleton
 */
export function getNotifier(): Notifier {
  if (!notifierInstance) {
    notifierInstance = new StubNotifier();
  }
  return notifierInstance;
}

/**
 * Set custom notifier (for testing or custom implementations)
 */
export function setNotifier(notifier: Notifier): void {
  notifierInstance = notifier;
}

/**
 * Reset notifier (for testing)
 */
export function resetNotifier(): void {
  notifierInstance = null;
}
