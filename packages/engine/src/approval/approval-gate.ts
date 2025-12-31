/**
 * Approval Gate
 *
 * Story C4: Gate that blocks step execution until approved/rejected/timeout.
 * Integrates with step state machine to handle awaiting_approval status.
 *
 * @module @gwi/engine/approval
 */

import type {
  ApprovalRequest,
  ApprovalGateResult,
  ApprovalDecision,
  ApprovalPolicy,
  EscalationPolicy,
  NotificationChannel,
} from './types.js';
import type { ApprovalStore } from './approval-store.js';
import { getApprovalStore } from './approval-store.js';
import { performEscalation, checkEscalation } from './escalation.js';
import { getNotifier, createApprovalRequestNotification } from './notifier.js';

// =============================================================================
// Approval Gate Configuration
// =============================================================================

/**
 * Configuration for creating an approval gate
 */
export interface ApprovalGateConfig {
  /**
   * Run ID
   */
  runId: string;

  /**
   * Step ID
   */
  stepId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * User or system requesting approval
   */
  requestedBy: string;

  /**
   * List of user IDs who can approve
   */
  approvers: string[];

  /**
   * Approval policy (default: 'any')
   */
  policy?: ApprovalPolicy;

  /**
   * Escalation policy (optional)
   */
  escalationPolicy?: EscalationPolicy;

  /**
   * Notification channels (optional)
   */
  notificationChannels?: NotificationChannel[];

  /**
   * Context for the approval
   */
  context?: {
    description: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    changes?: Array<{
      file: string;
      action: 'create' | 'update' | 'delete';
      linesAdded?: number;
      linesDeleted?: number;
    }>;
    metadata?: Record<string, unknown>;
  };

  /**
   * Polling interval in milliseconds (default: 1000)
   */
  pollIntervalMs?: number;

  /**
   * Maximum wait time in milliseconds (default: from escalationPolicy.timeoutMs or 3600000)
   */
  maxWaitMs?: number;
}

// =============================================================================
// Approval Gate
// =============================================================================

/**
 * Approval Gate - blocks until approved, rejected, or timeout
 */
export class ApprovalGate {
  private store: ApprovalStore;
  private request: ApprovalRequest | null = null;

  constructor(
    private config: ApprovalGateConfig,
    store?: ApprovalStore
  ) {
    this.store = store || getApprovalStore();
  }

  /**
   * Wait for approval decision
   * This is the main blocking method that waits until:
   * - Request is approved
   * - Request is rejected
   * - Request times out and is escalated/auto-rejected
   */
  async waitForApproval(): Promise<ApprovalGateResult> {
    // Create approval request
    this.request = await this.createRequest();

    // Send initial notification
    await this.notifyApprovers('created');

    // Poll for decision
    const pollInterval = this.config.pollIntervalMs || 1000;
    const maxWait = this.config.maxWaitMs || this.config.escalationPolicy?.timeoutMs || 3600000;
    const startTime = Date.now();

    while (true) {
      // Check for timeout
      if (Date.now() - startTime > maxWait) {
        return await this.handleTimeout();
      }

      // Refresh request
      const updated = await this.store.getRequest(this.request.id);
      if (!updated) {
        throw new Error(`Approval request disappeared: ${this.request.id}`);
      }
      this.request = updated;

      // Check if resolved
      if (this.request.status === 'approved') {
        return {
          approved: true,
          request: this.request,
          reason: 'Approval granted',
          timedOut: false,
          escalated: false,
        };
      }

      if (this.request.status === 'rejected') {
        return {
          approved: false,
          request: this.request,
          reason: 'Approval rejected',
          timedOut: false,
          escalated: false,
        };
      }

      if (this.request.status === 'timeout') {
        return {
          approved: false,
          request: this.request,
          reason: 'Approval timed out',
          timedOut: true,
          escalated: false,
        };
      }

      if (this.request.status === 'cancelled') {
        return {
          approved: false,
          request: this.request,
          reason: 'Approval cancelled',
          timedOut: false,
          escalated: false,
        };
      }

      // Check for escalation
      const escalationCheck = checkEscalation(this.request);
      if (escalationCheck.shouldEscalate) {
        const escalationResult = await performEscalation(this.request, this.store);
        if (escalationResult.escalated) {
          this.request = escalationResult.request;
          await this.notifyApprovers('escalated');

          // If auto-rejected, return immediately
          if (escalationResult.action === 'auto_reject') {
            return {
              approved: false,
              request: this.request,
              reason: escalationResult.message,
              timedOut: true,
              escalated: true,
            };
          }
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Approve the request
   */
  async approve(decidedBy: string, reason?: string): Promise<void> {
    if (!this.request) {
      throw new Error('No approval request created');
    }

    const decision: ApprovalDecision = {
      approved: true,
      decidedBy,
      reason,
      decidedAt: new Date(),
    };

    await this.store.addDecision(this.request.id, decision);

    // Check if approval policy is satisfied
    if (await this.isPolicySatisfied()) {
      await this.store.updateStatus(this.request.id, 'approved');
      await this.store.setResolved(this.request.id, new Date());
      await this.notifyApprovers('approved');
    }
  }

  /**
   * Reject the request
   */
  async reject(decidedBy: string, reason?: string): Promise<void> {
    if (!this.request) {
      throw new Error('No approval request created');
    }

    const decision: ApprovalDecision = {
      approved: false,
      decidedBy,
      reason,
      decidedAt: new Date(),
    };

    await this.store.addDecision(this.request.id, decision);
    await this.store.updateStatus(this.request.id, 'rejected');
    await this.store.setResolved(this.request.id, new Date());
    await this.notifyApprovers('rejected');
  }

  /**
   * Cancel the request
   */
  async cancel(): Promise<void> {
    if (!this.request) {
      throw new Error('No approval request created');
    }

    await this.store.updateStatus(this.request.id, 'cancelled');
    await this.store.setResolved(this.request.id, new Date());
  }

  /**
   * Get the current request
   */
  getRequest(): ApprovalRequest | null {
    return this.request;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Create the approval request
   */
  private async createRequest(): Promise<ApprovalRequest> {
    const timeoutMs = this.config.escalationPolicy?.timeoutMs || 3600000; // 1 hour default
    const expiresAt = new Date(Date.now() + timeoutMs);

    return await this.store.createRequest({
      runId: this.config.runId,
      stepId: this.config.stepId,
      tenantId: this.config.tenantId,
      requestedBy: this.config.requestedBy,
      approvers: this.config.approvers,
      policy: this.config.policy || 'any',
      status: 'pending',
      escalationPolicy: this.config.escalationPolicy,
      notificationChannels: this.config.notificationChannels || [],
      expiresAt,
      context: this.config.context,
    });
  }

  /**
   * Check if approval policy is satisfied
   */
  private async isPolicySatisfied(): Promise<boolean> {
    if (!this.request) {
      return false;
    }

    const approvedDecisions = this.request.decisions.filter(d => d.approved);
    const rejectedDecisions = this.request.decisions.filter(d => !d.approved);

    // If any rejection, policy is not satisfied
    if (rejectedDecisions.length > 0) {
      return false;
    }

    switch (this.request.policy) {
      case 'any':
        return approvedDecisions.length > 0;

      case 'all':
        return approvedDecisions.length === this.request.approvers.length;

      case 'majority':
        const majority = Math.ceil(this.request.approvers.length / 2);
        return approvedDecisions.length >= majority;

      default:
        return false;
    }
  }

  /**
   * Handle timeout
   */
  private async handleTimeout(): Promise<ApprovalGateResult> {
    if (!this.request) {
      throw new Error('No approval request');
    }

    const escalationResult = await performEscalation(this.request, this.store);

    return {
      approved: false,
      request: escalationResult.request,
      reason: escalationResult.message,
      timedOut: true,
      escalated: escalationResult.escalated,
    };
  }

  /**
   * Send notifications to approvers
   */
  private async notifyApprovers(
    action: 'created' | 'escalated' | 'timeout' | 'approved' | 'rejected'
  ): Promise<void> {
    if (!this.request) {
      return;
    }

    const notifier = getNotifier();
    const message = createApprovalRequestNotification(this.request, action);

    await notifier.sendToAll(this.request.notificationChannels, message);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an approval gate and wait for decision
 * Convenience function for simple approval flows
 */
export async function createAndWaitForApproval(
  config: ApprovalGateConfig,
  store?: ApprovalStore
): Promise<ApprovalGateResult> {
  const gate = new ApprovalGate(config, store);
  return await gate.waitForApproval();
}
