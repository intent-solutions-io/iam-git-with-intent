/**
 * Evaluation Module
 *
 * EPIC 003: Evaluation Harness + Golden Tasks Framework
 *
 * Provides rubric-based evaluation of agentic workflow outputs:
 * - YAML rubric definitions with weighted dimensions
 * - Deterministic and LLM-assisted evaluation
 * - Golden task fixtures for regression testing
 * - CI integration support
 *
 * @module @gwi/core/evaluation
 */

// Rubric types and utilities
export {
  // Schemas
  CriterionSchema,
  DimensionSchema,
  GradeScaleSchema,
  RubricSchema,
  // Types
  type Criterion,
  type Dimension,
  type GradeScale,
  type Rubric,
  type CriterionResult,
  type DimensionResult,
  type EvaluationResult,
  // Functions
  loadRubric,
  parseRubric,
  discoverRubrics,
  scoreToLetterGrade,
  calculateOverallScore,
  generateSummary,
  validateRubric,
} from './rubric.js';

// Evaluation harness
export {
  // Types
  type EvaluationInput,
  type ValidatorFn,
  type LLMEvaluatorFn,
  type EvaluationHarnessConfig,
  // Classes
  EvaluationHarness,
  // Functions
  createHarness,
  // Built-in validators
  DEFAULT_VALIDATORS,
} from './harness.js';

// Golden tasks
export {
  // Schemas
  GoldenTaskSchema,
  // Types
  type GoldenTask,
  type GoldenTaskResult,
  type GoldenSuiteResult,
  type OutputGeneratorFn,
  type GoldenRunnerConfig,
  // Classes
  GoldenTaskRunner,
  // Functions
  createGoldenRunner,
  createMockGenerator,
} from './golden-task.js';
