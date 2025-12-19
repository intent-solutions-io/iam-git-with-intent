/**
 * Step Execution Contract Module
 *
 * A3: Provides typed envelopes for step inputs and outputs.
 *
 * Key exports:
 * - StepInput, StepOutput: Core step envelope types
 * - StepResultCode: Execution outcome codes
 * - ArtifactRef, ArtifactPointer: Cloud storage references
 * - validateStepInput, validateStepOutput: Validation functions
 * - StepValidationError: Error type for invalid inputs/outputs
 *
 * @module @gwi/engine/step-contract
 */

// Types
export {
  // Result codes (A3.s2)
  StepResultCode,
  RESULT_CODE_RETRY_MAP,
  RESULT_CODE_CONTINUE_MAP,

  // Artifacts (A3.s4)
  ArtifactPointer,
  InlineArtifact,
  ArtifactRef,

  // Timing & Cost (A3.s3)
  TokenUsage,
  StepCost,
  StepTiming,

  // Context types
  RepoContext,
  PRContext,
  IssueContext,

  // Core types (A3.s1)
  StepInput,
  StepOutput,

  // Type aliases
  type StepResultCode as StepResultCodeType,
  type ArtifactPointer as ArtifactPointerType,
  type InlineArtifact as InlineArtifactType,
  type ArtifactRef as ArtifactRefType,
  type TokenUsage as TokenUsageType,
  type StepCost as StepCostType,
  type StepTiming as StepTimingType,
  type RepoContext as RepoContextType,
  type PRContext as PRContextType,
  type IssueContext as IssueContextType,
  type StepInput as StepInputType,
  type StepOutput as StepOutputType,

  // Helper types
  type StepExecutor,
  type StepDefinition,
} from './types.js';

// Validation (A3.s5)
export {
  // Validation results
  type ValidationError,
  type ValidationResult,

  // Schema validation
  validateStepInput,
  validateStepOutput,

  // Assertion functions
  assertValidStepInput,
  assertValidStepOutput,
  StepValidationError,

  // Partial validation
  PartialStepInput,
  PartialStepOutput,
  validatePartialInput,
  validatePartialOutput,

  // Semantic validation
  type SemanticValidationError,
  validateOutputSemantics,
  validateStepOutputFull,
} from './validation.js';
