/**
 * Baseline Complexity Scorer
 *
 * Deterministic scoring algorithm for conflict complexity.
 * Same input always produces the same output.
 *
 * @see docs/complexity-rubric.md for full rubric documentation
 */

import type {
  TriageFeatures,
  ComplexityScore,
  BaselineRubricTag,
} from '../run-bundle/schemas/index.js';

// =============================================================================
// Scoring Constants
// =============================================================================

/**
 * Base score (starting point)
 */
const BASE_SCORE = 1;

/**
 * Maximum possible score
 */
const MAX_SCORE = 10;

/**
 * Minimum possible score
 */
const MIN_SCORE = 1;

// =============================================================================
// Scoring Rubric Weights
// =============================================================================

/**
 * Score contributions for each rubric tag
 *
 * These weights are carefully calibrated to produce scores in the 1-10 range.
 * The rubric is documented in docs/complexity-rubric.md
 */
const RUBRIC_WEIGHTS: Record<BaselineRubricTag, number> = {
  // Size factors
  small_change: 0,      // No additional complexity
  medium_change: 1,     // +1 for medium changes
  large_change: 2,      // +2 for large changes
  many_files: 1.5,      // +1.5 for many files

  // Complexity factors
  simple_conflict: 0,   // No additional complexity
  logic_conflict: 1.5,  // +1.5 for logic changes
  api_change: 2,        // +2 for API changes
  schema_change: 2.5,   // +2.5 for schema changes

  // Risk factors
  auth_related: 3,      // +3 for auth-related code
  security_sensitive: 3, // +3 for security-sensitive code
  financial_code: 3,    // +3 for financial code
  config_change: 1,     // +1 for config changes
  infra_change: 2,      // +2 for infrastructure changes

  // Code patterns (can reduce complexity)
  test_file: -1,        // -1 if only test files
  documentation: -1,    // -1 if only docs
  type_definitions: -0.5, // -0.5 if only types
};

// =============================================================================
// Threshold Constants
// =============================================================================

const THRESHOLDS = {
  // Line count thresholds
  SMALL_LINES: 50,
  MEDIUM_LINES: 200,
  LARGE_LINES: 500,

  // File count thresholds
  FEW_FILES: 3,
  MANY_FILES: 8,

  // Hunk thresholds
  SIMPLE_HUNKS: 2,
  COMPLEX_HUNKS: 5,

  // Per-file hunk thresholds
  HIGH_HUNKS_PER_FILE: 3,
};

// =============================================================================
// Baseline Scorer
// =============================================================================

/**
 * Baseline scoring result
 */
export interface BaselineScoreResult {
  score: ComplexityScore;
  reasons: BaselineRubricTag[];
  breakdown: Record<string, number>;
}

/**
 * Calculate baseline complexity score from features
 *
 * This is a fully deterministic algorithm:
 * - Same features always produce the same score
 * - No randomness or LLM involvement
 * - Reproducible across runs
 *
 * @param features - Extracted features from conflict metadata
 * @returns Baseline score result with breakdown
 */
export function calculateBaselineScore(features: TriageFeatures): BaselineScoreResult {
  let score = BASE_SCORE;
  const reasons: BaselineRubricTag[] = [];
  const breakdown: Record<string, number> = { base: BASE_SCORE };

  // ==========================================================================
  // Size Factors
  // ==========================================================================

  const totalLines = features.totalConflictLines + features.totalAdditions + features.totalDeletions;

  if (totalLines > THRESHOLDS.LARGE_LINES) {
    score += RUBRIC_WEIGHTS.large_change;
    reasons.push('large_change');
    breakdown.large_change = RUBRIC_WEIGHTS.large_change;
  } else if (totalLines > THRESHOLDS.MEDIUM_LINES) {
    score += RUBRIC_WEIGHTS.medium_change;
    reasons.push('medium_change');
    breakdown.medium_change = RUBRIC_WEIGHTS.medium_change;
  } else if (totalLines <= THRESHOLDS.SMALL_LINES) {
    reasons.push('small_change');
    breakdown.small_change = 0;
  }

  // Many files
  if (features.numFiles > THRESHOLDS.MANY_FILES) {
    score += RUBRIC_WEIGHTS.many_files;
    reasons.push('many_files');
    breakdown.many_files = RUBRIC_WEIGHTS.many_files;
  }

  // ==========================================================================
  // Complexity Factors
  // ==========================================================================

  // Simple vs complex conflicts based on hunk count
  if (features.numHunks <= THRESHOLDS.SIMPLE_HUNKS && !features.hasConflictMarkers) {
    reasons.push('simple_conflict');
    breakdown.simple_conflict = 0;
  } else if (features.numHunks > THRESHOLDS.COMPLEX_HUNKS || features.maxHunksPerFile > THRESHOLDS.HIGH_HUNKS_PER_FILE) {
    score += RUBRIC_WEIGHTS.logic_conflict;
    reasons.push('logic_conflict');
    breakdown.logic_conflict = RUBRIC_WEIGHTS.logic_conflict;
  }

  // Config files indicate potential API/config changes
  if (features.hasConfigFiles && features.numFiles > 1) {
    score += RUBRIC_WEIGHTS.config_change;
    reasons.push('config_change');
    breakdown.config_change = RUBRIC_WEIGHTS.config_change;
  }

  // ==========================================================================
  // Risk Factors
  // ==========================================================================

  // Security-sensitive files (auth + secrets)
  if (features.hasSecurityFiles) {
    score += RUBRIC_WEIGHTS.security_sensitive;
    reasons.push('security_sensitive');
    breakdown.security_sensitive = RUBRIC_WEIGHTS.security_sensitive;

    // Additional weight for auth specifically
    reasons.push('auth_related');
    // Don't double-count, already added security_sensitive
  }

  // Infrastructure files
  if (features.hasInfraFiles) {
    score += RUBRIC_WEIGHTS.infra_change;
    reasons.push('infra_change');
    breakdown.infra_change = RUBRIC_WEIGHTS.infra_change;
  }

  // ==========================================================================
  // Reduction Factors
  // ==========================================================================

  // Test-only changes are lower risk
  if (features.hasTestFiles && features.numFiles === 1) {
    // Only reduce if ALL files are tests
    if (features.fileTypes.every(t => t === 'test' || t === 'spec')) {
      score += RUBRIC_WEIGHTS.test_file;
      reasons.push('test_file');
      breakdown.test_file = RUBRIC_WEIGHTS.test_file;
    }
  }

  // Type definition only changes
  if (features.fileTypes.length === 1 && features.fileTypes[0] === 'd.ts') {
    score += RUBRIC_WEIGHTS.type_definitions;
    reasons.push('type_definitions');
    breakdown.type_definitions = RUBRIC_WEIGHTS.type_definitions;
  }

  // ==========================================================================
  // Clamp and Return
  // ==========================================================================

  const clampedScore = Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score))) as ComplexityScore;

  return {
    score: clampedScore,
    reasons,
    breakdown,
  };
}

/**
 * Quick complexity estimate from minimal info
 *
 * Useful when you only have basic counts available.
 */
export function quickEstimate(
  numFiles: number,
  totalLines: number,
  hasSecurityFiles: boolean = false
): ComplexityScore {
  let score = BASE_SCORE;

  // Size
  if (totalLines > THRESHOLDS.LARGE_LINES) score += 2;
  else if (totalLines > THRESHOLDS.MEDIUM_LINES) score += 1;

  // File count
  if (numFiles > THRESHOLDS.MANY_FILES) score += 1.5;
  else if (numFiles > THRESHOLDS.FEW_FILES) score += 0.5;

  // Security
  if (hasSecurityFiles) score += 3;

  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score))) as ComplexityScore;
}

/**
 * Clamp a score to valid complexity range
 */
export function clampScore(score: number): ComplexityScore {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score))) as ComplexityScore;
}
