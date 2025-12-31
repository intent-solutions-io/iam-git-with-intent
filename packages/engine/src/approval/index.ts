/**
 * Approval Gates System
 *
 * Story C4: Human-in-the-loop approval with timeout and escalation.
 *
 * Exports:
 * - Types for approval requests, decisions, policies
 * - ApprovalGate class for blocking on approval
 * - ApprovalStore interface and implementations
 * - Escalation logic for timeout handling
 * - Notifier interface for sending notifications
 *
 * @module @gwi/engine/approval
 */

// Types
export type {
  ApprovalRequestStatus,
  ApprovalPolicy,
  EscalationAction,
  NotificationChannelType,
  NotificationChannel,
  EscalationPolicy,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalGateResult,
  NotificationMessage,
} from './types.js';

// Approval Store
export type { ApprovalStore } from './approval-store.js';
export {
  InMemoryApprovalStore,
  getApprovalStore,
  setApprovalStore,
  resetApprovalStore,
} from './approval-store.js';

// Approval Gate
export type { ApprovalGateConfig } from './approval-gate.js';
export { ApprovalGate, createAndWaitForApproval } from './approval-gate.js';

// Escalation
export type {
  EscalationCheckResult,
  EscalationResult,
} from './escalation.js';
export {
  checkEscalation,
  performEscalation,
  checkAndEscalatePending,
} from './escalation.js';

// Notifier
export type {
  NotificationResult,
  Notifier,
} from './notifier.js';
export {
  StubNotifier,
  getNotifier,
  setNotifier,
  resetNotifier,
  createApprovalRequestNotification,
} from './notifier.js';
