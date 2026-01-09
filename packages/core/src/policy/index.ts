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
