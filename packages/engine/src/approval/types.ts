/**
 * Approval Gates Types
 *
 * Story C4: Human-in-the-loop approval with timeout and escalation.
 * Types for approval requests, decisions, escalation policies, and notifications.
 *
 * @module @gwi/engine/approval
 */

// =============================================================================
// Approval Request Status
// =============================================================================

/**
 * Status of an approval request
 */
export type ApprovalRequestStatus =
  | 'pending'           // Waiting for initial approval
  | 'approved'          // Approved by an approver
  | 'rejected'          // Rejected by an approver
  | 'timeout'           // Timed out without decision
  | 'escalated'         // Escalated to next level
  | 'cancelled';        // Cancelled by system or user

// =============================================================================
// Approval Policy
// =============================================================================

/**
 * Approval policy determines who must approve and how many
 */
export type ApprovalPolicy =
  | 'any'              // Any single approver can approve
  | 'all'              // All approvers must approve
  | 'majority';        // More than 50% must approve

/**
 * Escalation action when timeout occurs
 */
export type EscalationAction =
  | 'auto_reject'      // Automatically reject the request
  | 'escalate'         // Escalate to next level of approvers
  | 'notify_admin';    // Notify admin but keep pending

// =============================================================================
// Notification Channel
// =============================================================================

/**
 * Notification channel type
 */
export type NotificationChannelType =
  | 'slack'            // Slack direct message or channel
  | 'email'            // Email notification
  | 'webhook'          // HTTP webhook
  | 'in_app';          // In-app notification

/**
 * Notification channel configuration
 */
export interface NotificationChannel {
  /**
   * Type of notification channel
   */
  type: NotificationChannelType;

  /**
   * Channel-specific configuration
   * - slack: { channel: string, token: string }
   * - email: { to: string[], from: string, smtp: {...} }
   * - webhook: { url: string, method: string, headers: {...} }
   * - in_app: { userId: string }
   */
  config: Record<string, unknown>;

  /**
   * Whether this channel is enabled
   */
  enabled: boolean;
}

// =============================================================================
// Escalation Policy
// =============================================================================

/**
 * Escalation policy defines timeout and escalation behavior
 */
export interface EscalationPolicy {
  /**
   * Timeout in milliseconds before escalation
   */
  timeoutMs: number;

  /**
   * Action to take when timeout occurs
   */
  action: EscalationAction;

  /**
   * Next level of approvers (for 'escalate' action)
   */
  escalateToApprovers?: string[];

  /**
   * Admin user IDs to notify (for 'notify_admin' action)
   */
  notifyAdmins?: string[];

  /**
   * Maximum number of escalation levels
   */
  maxEscalations?: number;
}

// =============================================================================
// Approval Decision
// =============================================================================

/**
 * Individual approval decision from an approver
 */
export interface ApprovalDecision {
  /**
   * Whether the request was approved
   */
  approved: boolean;

  /**
   * User ID who made the decision
   */
  decidedBy: string;

  /**
   * Reason or comment for the decision
   */
  reason?: string;

  /**
   * When the decision was made
   */
  decidedAt: Date;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Approval Request
// =============================================================================

/**
 * Approval request for a run step
 */
export interface ApprovalRequest {
  /**
   * Unique approval request ID
   */
  id: string;

  /**
   * Run ID this approval is for
   */
  runId: string;

  /**
   * Step ID this approval is for
   */
  stepId: string;

  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: string;

  /**
   * User or system that requested approval
   */
  requestedBy: string;

  /**
   * List of user IDs who can approve
   */
  approvers: string[];

  /**
   * Approval policy (any, all, majority)
   */
  policy: ApprovalPolicy;

  /**
   * Current status
   */
  status: ApprovalRequestStatus;

  /**
   * Individual decisions from approvers
   */
  decisions: ApprovalDecision[];

  /**
   * Escalation policy
   */
  escalationPolicy?: EscalationPolicy;

  /**
   * Number of times this request has been escalated
   */
  escalationCount: number;

  /**
   * Notification channels
   */
  notificationChannels: NotificationChannel[];

  /**
   * When the request was created
   */
  createdAt: Date;

  /**
   * When the request expires (based on timeout)
   */
  expiresAt?: Date;

  /**
   * When the request was resolved (approved/rejected/timeout)
   */
  resolvedAt?: Date;

  /**
   * Additional context for the approval
   */
  context?: {
    /**
     * Human-readable description of what's being approved
     */
    description: string;

    /**
     * Risk level (low, medium, high, critical)
     */
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';

    /**
     * Changes being approved (for visibility)
     */
    changes?: Array<{
      file: string;
      action: 'create' | 'update' | 'delete';
      linesAdded?: number;
      linesDeleted?: number;
    }>;

    /**
     * Additional metadata
     */
    metadata?: Record<string, unknown>;
  };
}

// =============================================================================
// Approval Gate Result
// =============================================================================

/**
 * Result of waiting on an approval gate
 */
export interface ApprovalGateResult {
  /**
   * Whether the request was approved
   */
  approved: boolean;

  /**
   * The approval request
   */
  request: ApprovalRequest;

  /**
   * Reason for the result
   */
  reason: string;

  /**
   * Whether the result was due to timeout
   */
  timedOut: boolean;

  /**
   * Whether the result was due to escalation
   */
  escalated: boolean;
}

// =============================================================================
// Notification Message
// =============================================================================

/**
 * Notification message to be sent
 */
export interface NotificationMessage {
  /**
   * Notification subject/title
   */
  subject: string;

  /**
   * Notification body (supports markdown)
   */
  body: string;

  /**
   * Approval request ID
   */
  approvalRequestId: string;

  /**
   * Run ID
   */
  runId: string;

  /**
   * Recipient user IDs
   */
  recipients: string[];

  /**
   * Priority level
   */
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}
