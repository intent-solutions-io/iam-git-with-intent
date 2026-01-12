/**
 * Policy Engine Module
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 * Epic D: Policy & Audit - Enhanced schema and condition types
 *
 * @module @gwi/core/policy
 */

// Types - use prefixed names to avoid conflicts with tenancy
export {
  type PolicyDecision as Phase25PolicyDecision,
  type PolicyAction,
  type PolicyActor,
  type PolicyResource,
  type PolicyEnvironment,
  type PolicyContext,
  type PolicyReason,
  type PolicyResult,
  type Policy as Phase25Policy,
  type PolicyPriority,
  type PolicySet,
  createEnvironmentContext,
  PRIORITY_ORDER,
} from './types.js';

// Engine - use prefixed names to avoid conflicts
export {
  PolicyEngine as Phase25PolicyEngine,
  PolicyBuilder,
  getPolicyEngine as getPhase25PolicyEngine,
  resetPolicyEngine as resetPhase25PolicyEngine,
  evaluatePolicy,
  createPolicy,
} from './engine.js';

// Default Policies
export {
  requireApprovalPolicy,
  destructiveActionsOwnerPolicy,
  protectedBranchPolicy,
  productionDeployPolicy,
  memberRemovalPolicy,
  largePatchReviewPolicy,
  noSelfApprovalPolicy,
  DEFAULT_POLICIES,
  registerDefaultPolicies,
} from './policies.js';

// Execution Gate
export {
  type GateCheckResult,
  type GateCheckInput,
  initializePolicyGate,
  checkGate,
  requirePolicyApproval,
  PolicyDeniedError as Phase25PolicyDeniedError,
  createPolicyMiddleware,
} from './gate.js';

// =============================================================================
// Epic D: Enhanced Policy Schema
// =============================================================================

// Schema types and validators (prefixed to avoid conflicts with other modules)
export {
  // Version and scope
  PolicyVersion as SchemaVersion,
  PolicyScope as SchemaScope,
  ActorType as SchemaActorType,
  AgentType as SchemaAgentType,
  ActionSource as SchemaActionSource,
  // Operators
  ComparisonOperator as SchemaComparisonOperator,
  LogicalOperator as SchemaLogicalOperator,
  // Conditions
  BaseCondition as SchemaBaseCondition,
  ComplexityCondition as SchemaComplexityCondition,
  FilePatternCondition as SchemaFilePatternCondition,
  AuthorCondition as SchemaAuthorCondition,
  TimeWindowCondition as SchemaTimeWindowCondition,
  RepositoryCondition as SchemaRepositoryCondition,
  BranchCondition as SchemaBranchCondition,
  LabelCondition as SchemaLabelCondition,
  AgentCondition as SchemaAgentCondition,
  CustomCondition as SchemaCustomCondition,
  PolicyCondition as SchemaPolicyCondition,
  ConditionGroup as SchemaConditionGroup,
  // Actions
  ActionEffect as SchemaActionEffect,
  ApprovalConfig as SchemaApprovalConfig,
  NotificationConfig as SchemaNotificationConfig,
  PolicyAction as SchemaPolicyAction,
  // Rules
  PolicyRule as SchemaPolicyRule,
  // Documents
  InheritanceMode as SchemaInheritanceMode,
  PolicyMetadata as SchemaPolicyMetadata,
  PolicyDocument as SchemaPolicyDocument,
  PolicySet as SchemaPolicySet,
  // Evaluation
  PolicyEvaluationRequest as SchemaEvaluationRequest,
  PolicyEvaluationResult as SchemaEvaluationResult,
  // Validation helpers
  validatePolicyDocument,
  validatePolicyRule,
  validateEvaluationRequest,
  isPolicyDocumentValid,
  getPolicyValidationErrors,
} from './schema.js';

// Inheritance
export {
  type PolicyStore,
  type ResolvedPolicy,
  PolicyInheritanceResolver,
  InMemoryPolicyStore,
  createInheritanceResolver,
  SCOPE_HIERARCHY,
  getScopePriority,
  isScopeMoreSpecific,
  getParentScope,
  validateInheritanceChain,
} from './inheritance.js';

// Validation (prefixed to avoid conflicts with reliability and policy-dsl modules)
export {
  type ValidationSeverity as SchemaValidationSeverity,
  type ValidationError as SchemaValidationError,
  type ValidationResult as SchemaValidationResult,
  type ValidationOptions as SchemaValidationOptions,
  type CustomValidationRule as SchemaCustomValidationRule,
  ValidationErrorCodes as SchemaValidationErrorCodes,
  type ValidationErrorCode as SchemaValidationErrorCode,
  PolicyValidator,
  createPolicyValidator,
  isValidPolicy,
  validatePolicy,
  formatValidationErrors,
} from './validation.js';

// Schema-based Policy Engine (Epic D)
export {
  type SchemaEngineConfig,
  type PolicyStore as SchemaEnginePolicyStore,
  // Dry-run types (D2.5)
  type ConditionEvaluation,
  type RuleEvaluation,
  type DryRunResult,
  // Engine
  SchemaPolicyEngine,
  createSchemaEngine,
  getSchemaEngine,
  resetSchemaEngine,
  evaluateSchemaPolicy,
} from './schema-engine.js';

// =============================================================================
// Epic D: Policy Cache
// =============================================================================

// Cache types and classes
export {
  // Types
  type PolicyCacheKey,
  type CompiledRule,
  type CachedPolicy,
  type CacheStats,
  type PolicyCacheConfig,
  type CacheEventType,
  type CacheEventListener,
  type PolicyCompiler,
  type PolicyLoader,
  type CachedPolicyEngineConfig,
  // Classes
  PolicyCache,
  CachedPolicyEngine,
  // Factory functions
  createPolicyCache,
  createCachedPolicyEngine,
  // Singleton
  getPolicyCache,
  setPolicyCache,
  resetPolicyCache,
} from './cache.js';

// =============================================================================
// Epic D: Immutable Audit Log Schema (D3.1)
// =============================================================================

// Audit log schema types and validators (prefixed with Immutable to avoid conflicts)
export {
  // Cryptographic types
  HashAlgorithm as ImmutableHashAlgorithm,
  CryptoHash as ImmutableCryptoHash,
  SHA256Hash as ImmutableSHA256Hash,

  // Identification
  AuditLogEntryId as ImmutableAuditLogEntryId,
  AuditLogId as ImmutableAuditLogId,

  // Actor types
  AuditActorType as ImmutableAuditActorType,
  AuditLogActor as ImmutableAuditLogActor,

  // Action types
  AuditActionCategory as ImmutableAuditActionCategory,
  AuditLogAction as ImmutableAuditLogAction,

  // Resource types
  AuditResourceType as ImmutableAuditResourceType,
  AuditLogResource as ImmutableAuditLogResource,

  // Outcome types
  AuditOutcomeStatus as ImmutableAuditOutcomeStatus,
  AuditLogOutcome as ImmutableAuditLogOutcome,

  // Context types
  AuditLogContext as ImmutableAuditLogContext,
  ContextHash as ImmutableContextHash,

  // Chain integrity
  AuditChainLink as ImmutableAuditChainLink,

  // Main entry schema
  ImmutableAuditLogEntry,
  CreateAuditLogEntry as CreateImmutableAuditLogEntry,

  // Query types
  AuditLogQuery as ImmutableAuditLogQuery,
  AuditLogQueryResult as ImmutableAuditLogQueryResult,

  // Metadata
  AuditLogMetadata as ImmutableAuditLogMetadata,

  // Factory functions
  generateAuditLogEntryId,
  generateAuditLogId,
  createAuditAction as createImmutableAuditAction,
  createAuditActor as createImmutableAuditActor,
  createAuditResource as createImmutableAuditResource,
  createAuditContext as createImmutableAuditContext,
  createAuditOutcome as createImmutableAuditOutcome,

  // Validation functions
  validateAuditLogEntry as validateImmutableAuditLogEntry,
  safeParseAuditLogEntry as safeParseImmutableAuditLogEntry,
  validateCreateAuditLogEntry as validateCreateImmutableAuditLogEntry,

  // High-risk detection (prefixed to avoid conflicts with security module)
  isHighRiskAction as isImmutableHighRiskAction,
  markHighRiskIfApplicable as markImmutableHighRiskIfApplicable,
  HIGH_RISK_ACTIONS as IMMUTABLE_HIGH_RISK_ACTIONS,

  // Constants
  CURRENT_SCHEMA_VERSION as IMMUTABLE_AUDIT_LOG_SCHEMA_VERSION,
  DEFAULT_HASH_ALGORITHM as IMMUTABLE_DEFAULT_HASH_ALGORITHM,
  MAX_QUERY_LIMIT as IMMUTABLE_AUDIT_LOG_MAX_QUERY_LIMIT,
  CONTEXT_HASH_FIELDS as IMMUTABLE_CONTEXT_HASH_FIELDS,
} from './audit-log-schema.js';

// =============================================================================
// Epic D: Cryptographic Chaining (D3.2)
// =============================================================================

// Hash functions and chain operations (prefixed with CryptoChain to avoid conflicts)
export {
  // Hash functions
  sha256 as cryptoChainSha256,
  sha384 as cryptoChainSha384,
  sha512 as cryptoChainSha512,
  computeHash as computeCryptoHash,
  toCanonicalJson as cryptoToCanonicalJson,
  computeContentHash as cryptoComputeContentHash,
  computeContextHash as cryptoComputeContextHash,

  // Chain state management
  type ChainState as CryptoChainState,
  createChainState as createCryptoChainState,
  buildChainLink as buildCryptoChainLink,
  advanceChainState as advanceCryptoChainState,

  // Chain builder
  AuditChainBuilder,

  // Verification types
  type EntryVerificationResult as CryptoEntryVerificationResult,
  type ChainVerificationResult as CryptoChainVerificationResult,

  // Verification functions
  verifyEntryContentHash as verifyCryptoEntryContentHash,
  verifyChainLink as verifyCryptoChainLink,
  verifyChain as verifyCryptoChain,

  // Merkle tree
  type MerkleNode as CryptoMerkleNode,
  type MerkleProof as CryptoMerkleProof,
  MerkleTree as CryptoMerkleTree,
  buildMerkleTree as buildCryptoMerkleTree,
  verifyMerkleProof as verifyCryptoMerkleProof,

  // Batch operations
  type BatchCreateResult as CryptoBatchCreateResult,
  createBatch as createCryptoBatch,
  verifyBatch as verifyCryptoBatch,

  // Schemas
  ChainStateSchema as CryptoChainStateSchema,
  MerkleProofSchema as CryptoMerkleProofSchema,
  BatchCreateResultSchema as CryptoBatchCreateResultSchema,
} from './crypto-chain.js';

// =============================================================================
// Epic D: Immutable Audit Log Storage (D3.3)
// =============================================================================

// Audit log storage interfaces and implementations
export {
  // Types
  type AuditLogQueryOptions,
  type AuditLogQueryResult as StorageQueryResult,
  type TenantChainState,
  type ImmutableAuditLogStore,

  // Implementations
  InMemoryAuditLogStore,
  FirestoreAuditLogStore,

  // Constants
  AUDIT_LOG_COLLECTIONS,

  // Factory functions
  createInMemoryAuditLogStore,
  createFirestoreAuditLogStore,

  // Singleton management
  getImmutableAuditLogStore,
  setImmutableAuditLogStore,
  resetImmutableAuditLogStore,
} from './audit-log-storage.js';

// =============================================================================
// Epic D: Audit Log Integrity Verification (D3.4)
// =============================================================================

// Verification service for audit log chain integrity
export {
  // Types
  type IntegrityIssueType,
  type IssueSeverity,
  type IntegrityIssue,
  type ChainHealthStats,
  type VerificationReport,
  type VerificationOptions,

  // Service interface and implementation
  type AuditVerificationService,
  AuditVerificationServiceImpl,

  // Factory functions
  createAuditVerificationService,

  // Singleton management
  initializeAuditVerificationService,
  getAuditVerificationService,
  setAuditVerificationService,
  resetAuditVerificationService,
} from './audit-verification.js';

// =============================================================================
// Epic D: Audit Log Export (D3.5)
// =============================================================================

// Export service for audit log data
export {
  // Types (ExportFormat renamed to avoid collision with other modules)
  type ExportFormat as AuditLogExportFormat,
  type ExportOptions,
  type ExportMetadata,
  type ExportSignature,
  type ExportResult,

  // Service interface and implementation
  type AuditLogExportService,
  AuditLogExportServiceImpl,

  // Signature verification
  verifyExportSignature,

  // Factory functions
  createAuditLogExportService,

  // Singleton management
  initializeAuditLogExportService,
  getAuditLogExportService,
  setAuditLogExportService,
  resetAuditLogExportService,
} from './audit-log-export.js';
