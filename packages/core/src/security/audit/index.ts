/**
 * Security Audit Module
 *
 * Phase 24: Security & Compliance Hardening
 * Epic D: Policy Engine - D4.s1 Audit Event Schema
 *
 * @module @gwi/core/security/audit
 */

// =============================================================================
// Zod Schema (Epic D - Primary Schema)
// Prefixed with 'Schema' suffix to avoid conflicts with storage/interfaces
// =============================================================================

export {
  // Primitive schemas
  Timestamp,
  NonEmptyString,
  AuditEventId,
  TenantId,
  ActorId,
  IPAddress,
  UserAgent,

  // Principal schemas (WHO) - prefixed to avoid conflicts
  ActorType as SecurityActorType,
  AuditActor as SecurityAuditActorSchema,
  AuditRequestSource,

  // Action schemas (WHAT) - prefixed to avoid conflicts
  AuditEventCategory as SecurityAuditEventCategory,
  AuditEventType as SecurityAuditEventTypeSchema,
  AuditResource as SecurityAuditResource,

  // Result schemas - prefixed to avoid conflicts
  AuditOutcome as SecurityAuditOutcomeSchema,
  AuditError,

  // Context schemas
  AuditCorrelation,

  // Evidence schemas
  EvidenceType,
  AuditEvidence,

  // Main event schemas
  SecurityAuditEventSchema,
  AuditEventSchema,
  CreateSecurityAuditEvent as CreateSecurityAuditEventSchema,
  CreateAuditEventSchema,
  AuditEventQuery,

  // Factory functions - prefixed to avoid conflicts
  generateAuditEventId as generateSecurityAuditEventId,
  extractCategory,
  createAuditEvent as createSecurityAuditEventFromSchema,
  validateAuditEvent,
  safeParseAuditEvent,

  // High-risk detection
  HIGH_RISK_EVENT_TYPES,
  isHighRiskEventType,
  markHighRiskIfApplicable,

  // Backward compatibility
  type LegacySecurityAuditEvent,
  fromLegacyEvent,
  toLegacyEvent,
} from './schema.js';

// =============================================================================
// Legacy Types (Backward Compatibility - existing implementation)
// =============================================================================

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

// =============================================================================
// Store Interface and Implementations
// =============================================================================

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

// =============================================================================
// Emitter Functions
// =============================================================================

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
