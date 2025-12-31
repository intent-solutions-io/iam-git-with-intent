/**
 * Escalation Logic
 *
 * Story C4: Handles timeout and escalation of approval requests.
 *
 * @module @gwi/engine/approval
 */

import type {
  ApprovalRequest,
  EscalationAction,
} from './types.js';
import type { ApprovalStore } from './approval-store.js';

// =============================================================================
// Escalation Evaluator
// =============================================================================

/**
 * Result of checking if a request should be escalated
 */
export interface EscalationCheckResult {
  /**
   * Whether the request should be escalated
   */
  shouldEscalate: boolean;

  /**
   * Reason for escalation (or not)
   */
  reason: string;

  /**
   * Action to take
   */
  action?: EscalationAction;

  /**
   * Next level approvers (for escalate action)
   */
  nextApprovers?: string[];

  /**
   * Admins to notify (for notify_admin action)
   */
  adminsToNotify?: string[];
}

/**
 * Check if an approval request should be escalated
 */
export function checkEscalation(request: ApprovalRequest): EscalationCheckResult {
  // No escalation policy configured
  if (!request.escalationPolicy) {
    return {
      shouldEscalate: false,
      reason: 'No escalation policy configured',
    };
  }

  const policy = request.escalationPolicy;
  const now = new Date();

  // Check if request has timed out
  if (!request.expiresAt) {
    return {
      shouldEscalate: false,
      reason: 'No expiration time set',
    };
  }

  if (now < request.expiresAt) {
    return {
      shouldEscalate: false,
      reason: 'Not yet expired',
    };
  }

  // Check max escalation levels
  if (policy.maxEscalations !== undefined && request.escalationCount >= policy.maxEscalations) {
    return {
      shouldEscalate: true,
      reason: 'Max escalation levels reached, auto-rejecting',
      action: 'auto_reject',
    };
  }

  // Return escalation action
  return {
    shouldEscalate: true,
    reason: 'Request timed out',
    action: policy.action,
    nextApprovers: policy.escalateToApprovers,
    adminsToNotify: policy.notifyAdmins,
  };
}

// =============================================================================
// Escalation Handler
// =============================================================================

/**
 * Result of performing escalation
 */
export interface EscalationResult {
  /**
   * Whether escalation was performed
   */
  escalated: boolean;

  /**
   * Updated approval request
   */
  request: ApprovalRequest;

  /**
   * Action that was taken
   */
  action: EscalationAction | 'none';

  /**
   * Users to notify
   */
  notifyUsers: string[];

  /**
   * Message for notification
   */
  message: string;
}

/**
 * Perform escalation on an approval request
 */
export async function performEscalation(
  request: ApprovalRequest,
  store: ApprovalStore
): Promise<EscalationResult> {
  const check = checkEscalation(request);

  if (!check.shouldEscalate) {
    return {
      escalated: false,
      request,
      action: 'none',
      notifyUsers: [],
      message: check.reason,
    };
  }

  // Handle different escalation actions
  switch (check.action) {
    case 'auto_reject':
      return await handleAutoReject(request, store, check.reason);

    case 'escalate':
      return await handleEscalate(request, store, check.nextApprovers || []);

    case 'notify_admin':
      return await handleNotifyAdmin(request, store, check.adminsToNotify || []);

    default:
      return {
        escalated: false,
        request,
        action: 'none',
        notifyUsers: [],
        message: 'Unknown escalation action',
      };
  }
}

/**
 * Handle auto-reject escalation
 */
async function handleAutoReject(
  request: ApprovalRequest,
  store: ApprovalStore,
  reason: string
): Promise<EscalationResult> {
  await store.updateStatus(request.id, 'timeout');
  await store.setResolved(request.id, new Date());

  const updatedRequest = await store.getRequest(request.id);
  if (!updatedRequest) {
    throw new Error(`Failed to retrieve updated request: ${request.id}`);
  }

  return {
    escalated: true,
    request: updatedRequest,
    action: 'auto_reject',
    notifyUsers: request.approvers,
    message: `Approval request automatically rejected: ${reason}`,
  };
}

/**
 * Handle escalate to next level
 */
async function handleEscalate(
  request: ApprovalRequest,
  store: ApprovalStore,
  nextApprovers: string[]
): Promise<EscalationResult> {
  if (nextApprovers.length === 0) {
    // No next approvers, auto-reject
    return await handleAutoReject(request, store, 'No escalation approvers configured');
  }

  // Calculate new expiration time
  const timeoutMs = request.escalationPolicy?.timeoutMs || 3600000; // 1 hour default
  const newExpiresAt = new Date(Date.now() + timeoutMs);

  // Combine original approvers with new escalation approvers
  const combinedApprovers = [...new Set([...request.approvers, ...nextApprovers])];

  // Persist all changes to the store
  await store.updateStatus(request.id, 'escalated');
  await store.incrementEscalation(request.id);
  await store.updateApprovers(request.id, combinedApprovers);
  await store.updateExpiresAt(request.id, newExpiresAt);

  // Retrieve the updated request with all persisted changes
  const updatedRequest = await store.getRequest(request.id);
  if (!updatedRequest) {
    throw new Error(`Failed to retrieve updated request: ${request.id}`);
  }

  // Notify all approvers (original + new escalation targets)
  const notifyUsers = combinedApprovers;

  return {
    escalated: true,
    request: updatedRequest,
    action: 'escalate',
    notifyUsers,
    message: `Approval request escalated to next level (escalation ${updatedRequest.escalationCount})`,
  };
}

/**
 * Handle notify admin action
 */
async function handleNotifyAdmin(
  request: ApprovalRequest,
  store: ApprovalStore,
  admins: string[]
): Promise<EscalationResult> {
  // Don't change status, just notify admins
  const updatedRequest = await store.getRequest(request.id);
  if (!updatedRequest) {
    throw new Error(`Failed to retrieve updated request: ${request.id}`);
  }

  return {
    escalated: true,
    request: updatedRequest,
    action: 'notify_admin',
    notifyUsers: admins,
    message: `Approval request timed out, admins notified: ${admins.join(', ')}`,
  };
}

// =============================================================================
// Batch Escalation Checker
// =============================================================================

/**
 * Check all pending requests for a tenant and perform escalations
 */
export async function checkAndEscalatePending(
  tenantId: string,
  store: ApprovalStore
): Promise<EscalationResult[]> {
  const pending = await store.listPending(tenantId);
  const results: EscalationResult[] = [];

  for (const request of pending) {
    const result = await performEscalation(request, store);
    if (result.escalated) {
      results.push(result);
    }
  }

  return results;
}
