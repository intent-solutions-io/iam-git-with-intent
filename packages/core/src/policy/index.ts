/**
 * Policy Engine Module
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
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
