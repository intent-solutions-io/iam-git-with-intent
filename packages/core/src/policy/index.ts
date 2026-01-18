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

// =============================================================================
// Epic D: Violation Schema (D5.1)
// =============================================================================

// Violation types and severity levels
export {
  // Core types
  ViolationType,
  ViolationSeverity,
  ViolationStatus,
  ViolationSource,
  ViolationId,

  // Actor, resource, action types
  ViolationActor,
  ViolationResource,
  ViolationAction,

  // Type-specific details
  PolicyDeniedDetails,
  ApprovalBypassedDetails,
  LimitExceededDetails,
  AnomalyDetectedDetails,
  ViolationDetails,

  // Main violation schema
  Violation,
  CreateViolationInput,
  ViolationQuery,

  // Factory functions
  generateViolationId,
  createViolation,
  createPolicyDeniedViolation,
  createApprovalBypassedViolation,
  createLimitExceededViolation,
  createAnomalyDetectedViolation,

  // Validation functions
  validateViolation,
  safeParseViolation,
  validateCreateViolationInput,
  validateViolationQuery,

  // Type guards
  isViolationType,
  isViolationSeverity,
  isViolationStatus,
  isViolation,

  // Utility functions
  getSeverityWeight,
  compareBySeverity,
  getViolationTypeDescription,
  calculateAggregateSeverity,

  // Constants
  VIOLATION_TYPE_DESCRIPTIONS,
  SEVERITY_WEIGHTS,
  DEFAULT_VIOLATION_SEVERITY,
  VIOLATION_SCHEMA_VERSION,
  ALL_VIOLATION_TYPES,
  ALL_SEVERITY_LEVELS,
  ALL_VIOLATION_STATUSES,
  ALL_VIOLATION_SOURCES,
} from './violation-schema.js';

// =============================================================================
// Epic D: Compliance Report Templates (D4.1)
// =============================================================================

// Compliance report template types and schemas (prefixed to avoid conflicts with compliance module)
export {
  // Framework types (prefixed to avoid conflict with compliance/index.ts)
  ComplianceFramework as ReportComplianceFramework,
  type FrameworkMetadata as ReportFrameworkMetadata,

  // Control types (prefixed to avoid conflicts)
  type ControlStatus as ReportControlStatus,
  type ControlPriority as ReportControlPriority,
  type EvidenceType as ReportEvidenceType,
  type EvidenceReference as ReportEvidenceReference,
  type Attestation as ReportAttestation,
  type RemediationItem as ReportRemediationItem,
  type ControlDefinition as ReportControlDefinition,

  // Report structure
  type ReportPeriod,
  type ReportSummary,
  type ComplianceReportTemplate,

  // SOC2 types
  type SOC2Category,
  SOC2_COMMON_CRITERIA_DOMAINS,
  SOC2_CONTROL_TEMPLATES,

  // ISO 27001 types
  ISO27001_DOMAINS,
  ISO27001_CONTROL_TEMPLATES,

  // Framework metadata
  FRAMEWORK_METADATA as REPORT_FRAMEWORK_METADATA,

  // Factory functions
  generateReportId,
  createControlFromTemplate,
  createSOC2Template,
  createISO27001Template,
  createCustomTemplate,
  calculateReportSummary,

  // Evidence helpers
  createAuditLogEvidence,
  createDocumentEvidence,
  addEvidenceToControl,
  updateControlStatus as updateReportControlStatus,

  // Formatters
  formatReportAsMarkdown,
  formatReportAsJSON,
  parseReportFromJSON,

  // Validation
  validateReportTemplate,
  isReportComplete,
} from './report-templates.js';

// =============================================================================
// Epic D: Evidence Collection (D4.2)
// =============================================================================

// Evidence collection types and service
export {
  // Query types
  EvidenceTimeRange,
  EvidenceQuery,
  CollectedEvidence,
  EvidenceCollectionResult,

  // Control-to-action mappings
  CONTROL_TO_ACTION_MAPPINGS,
  SOC2_CRITERIA_MAPPINGS,
  ISO27001_CONTROL_MAPPINGS,

  // Source interface
  type EvidenceSource,

  // Audit log evidence source
  type AuditLogEvidenceSourceConfig,
  AuditLogEvidenceSource,

  // Decision trace evidence source
  type DecisionTraceStore,
  type DecisionTrace,
  type DecisionTraceEvidenceSourceConfig,
  DecisionTraceEvidenceSource,

  // Main evidence collector
  type EvidenceCollectorConfig,
  EvidenceCollector,

  // Factory functions
  createAuditLogEvidenceSource,
  createDecisionTraceEvidenceSource,
  createEvidenceCollector,

  // Helper functions
  linkEvidenceToControl,
  getEvidenceSummary,
  filterByRelevance,
  getTopEvidence,

  // Singleton management
  initializeEvidenceCollector,
  getEvidenceCollector,
  setEvidenceCollector,
  resetEvidenceCollector,
} from './evidence-collector.js';

// =============================================================================
// Epic D: Report Generator (D4.3)
// =============================================================================

// Report generation and scheduling
export {
  // Request and result types
  ReportGenerationRequest,
  ReportGenerationResult,

  // Scheduling types
  ScheduledReportConfig,
  ScheduledReportRun,

  // Cron utilities
  parseNextCronRun,
  calculatePeriodDates,

  // Generator config
  type ReportGeneratorConfig,

  // Classes
  ReportGenerator,
  ReportScheduleManager,

  // Factory functions
  createReportGenerator,
  createScheduleManager,
  createScheduledReport,

  // Singleton management
  initializeReportGenerator,
  getReportGenerator,
  getScheduleManager,
  setReportGenerator,
  resetReportGenerator,
} from './report-generator.js';

// =============================================================================
// Epic D: Violation Detector (D5.2)
// =============================================================================

// Violation detection and storage
export {
  // Store types
  type ViolationQueryResult,
  type ViolationAggregation,
  type ViolationStore,

  // Store implementations
  InMemoryViolationStore,

  // Detector types
  type ViolationDetectorConfig,
  type PolicyEvaluationContext,
  type ApprovalBypassContext,
  type RateLimitContext,
  type AnomalyContext,
  type DetectionResult,

  // Detector class
  ViolationDetector,

  // Factory functions
  createInMemoryViolationStore,
  createViolationDetector,

  // Singleton management
  initializeViolationDetector,
  getViolationDetector,
  setViolationDetector,
  resetViolationDetector,
} from './violation-detector.js';

// =============================================================================
// Epic D: Alert Channels (D5.3)
// =============================================================================

// Alert channels for violation notifications
export {
  // Types
  type AlertChannelType,
  type AlertPriority,
  type AlertPayload,
  type AlertResult,
  type ChannelConfig,
  type AlertChannel,

  // Config schemas
  EmailChannelConfigSchema,
  type EmailChannelConfig,
  SlackChannelConfigSchema,
  type SlackChannelConfig,
  WebhookChannelConfigSchema,
  type WebhookChannelConfig,

  // Channel implementations
  EmailChannel,
  SlackChannel,
  WebhookChannel,

  // Dispatcher
  type AlertDispatcherConfig,
  type DispatchResult,
  AlertDispatcher,

  // Factory functions
  createEmailChannel,
  createSlackChannel,
  createWebhookChannel,
  createAlertDispatcher,

  // Singleton management
  initializeAlertDispatcher,
  getAlertDispatcher,
  setAlertDispatcher,
  resetAlertDispatcher,
} from './alert-channels.js';

// =============================================================================
// Epic D: Remediation Suggestions (D5.4)
// =============================================================================

// Remediation types and engine
export {
  // Types
  type RemediationActionType,
  type RemediationDifficulty,
  type RemediationActor,
  type RemediationAction,
  type PolicyLink,
  type RemediationSuggestion,
  type RemediationEngineConfig,

  // Schemas
  RemediationActionSchema,
  PolicyLinkSchema,
  RemediationSuggestionSchema,

  // Engine
  RemediationEngine,

  // Factory functions
  createRemediationEngine,
  generateRemediation,

  // Singleton management
  initializeRemediationEngine,
  getRemediationEngine,
  setRemediationEngine,
  resetRemediationEngine,

  // Integration helpers
  enrichViolationWithRemediation,
  getPrimaryRemediationAction,
  getOneClickActions,
  getActionsForActor,
} from './remediation.js';

// =============================================================================
// Epic D: Report Signing (D4.4)
// =============================================================================

// Report signing and verification
export {
  // Schema types
  SignatureAlgorithm,
  SignerIdentity,
  SigningKeyInfo,
  ReportSignature,
  SignedReport,
  SignatureVerificationResult,

  // Config types
  type SigningOptions,
  type SigningKeyPair,
  type ReportSignerConfig,

  // Key utilities
  generateSignatureId,
  computeKeyFingerprint,
  computeReportHash,
  canonicalizeReportContent,
  generateSigningKeyPair,

  // Signing functions
  signReport,
  signReportContent,
  verifyReportSignature,
  verifySignature,
  isSignatureValid,

  // Signer class
  ReportSigner,

  // Factory functions
  createReportSigner,
  createReportSignerWithKey,
  createReportVerifier,

  // Singleton management
  initializeReportSigner,
  initializeReportSignerWithKey,
  getReportSigner,
  setReportSigner,
  resetReportSigner,
} from './report-signing.js';
