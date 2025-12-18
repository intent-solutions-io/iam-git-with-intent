/**
 * Phase 26: LLM Planner Module
 *
 * Exports for the LLM Planner subsystem:
 * - PatchPlan schema and types
 * - PlannerService orchestrator
 * - PlannerProvider interface (Gemini/Claude)
 * - PlanGuard safety checks
 */

// Types and Schema
export {
  // Provider enum
  PlannerProvider,
  type PlannerProvider as PlannerProviderType,

  // Risk levels
  PatchRiskLevel,
  type PatchRiskLevel as PatchRiskLevelType,

  // File types
  SafeFilePath,
  PatchFileAction,
  PatchFileEntry,
  type PatchFileEntry as PatchFileEntryType,

  // Step types
  PatchStepEntry,
  type PatchStepEntry as PatchStepEntryType,

  // Test types
  TestType,
  PatchTestEntry,
  type PatchTestEntry as PatchTestEntryType,

  // Risk types
  RiskMitigation,
  PatchRiskAssessment,
  type RiskMitigation as RiskMitigationType,
  type PatchRiskAssessment as PatchRiskAssessmentType,

  // Policy types
  PlanPolicyContext,
  type PlanPolicyContext as PlanPolicyContextType,

  // Rollback types
  RollbackPlan,
  type RollbackPlan as RollbackPlanType,

  // Main PatchPlan schema
  PatchPlanSchema,
  type PatchPlan,

  // Validation helpers
  validatePatchPlan,
  parsePatchPlan,
  safeParsePatchPlan,
  type PatchPlanValidationResult,

  // Security validation
  validatePatchPlanSecurity,
  type SecurityValidationResult,
} from './types.js';

// Service and Providers
export {
  PlannerService,
  getPlannerService,
  type PlannerInput,
  type PlannerOutput,
  type PlannerConfig,
} from './service.js';

// Provider Interface
export {
  type PlannerProviderInterface,
  GeminiPlannerProvider,
  ClaudePlannerProvider,
  createPlannerProvider,
} from './providers.js';

// PlanGuard
export {
  PlanGuard,
  getPlanGuard,
  type PlanGuardResult,
  type PlanGuardConfig,
} from './guard.js';
