/**
 * Security Audit Module
 *
 * Phase 24: Security & Compliance Hardening
 *
 * @module @gwi/core/security/audit
 */

// Types
export {
  type SecurityAuditEventType,
  type SecurityAuditActor,
  type AuditOutcome,
  type SecurityAuditEvent,
  type CreateSecurityAuditEvent,
  generateAuditEventId,
  createSecurityAuditEvent,
  createRBACCheckEvent,
  createWebhookVerifyEvent,
  createQueueJobEvent,
  createCandidateEvent,
  createGitOperationEvent,
  createConnectorEvent,
  createRegistryEvent,
  createPlanLimitEvent,
} from './types.js';

// Store interface and implementations
export {
  type SecurityAuditStore,
  type AuditQueryOptions,
  InMemorySecurityAuditStore,
} from './store.js';

export {
  SECURITY_AUDIT_COLLECTION,
  FirestoreSecurityAuditStore,
  getSecurityAuditStore,
  resetSecurityAuditStore,
  setSecurityAuditStore,
} from './firestore-store.js';

// Emitter
export {
  emitAuditEvent,
  emitRBACEvent,
  emitWebhookVerifyEvent,
  emitQueueJobEvent,
  emitCandidateEvent,
  emitGitOperationEvent,
  emitConnectorEvent,
  emitRegistryEvent,
  emitPlanLimitEvent,
} from './emitter.js';
