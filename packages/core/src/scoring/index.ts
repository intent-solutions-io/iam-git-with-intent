/**
 * Complexity Scoring Module
 *
 * Provides deterministic baseline scoring and LLM adjustment utilities.
 *
 * @module @gwi/core/scoring
 */

// Feature extraction
export {
  extractFeatures,
  classifyFileRisk,
  getFileExtension,
  getFileTypes,
  createMinimalFeatures,
  type ConflictHunk,
  type FileConflict,
  type ConflictMetadata,
} from './features.js';

// Baseline scorer
export {
  calculateBaselineScore,
  quickEstimate,
  clampScore,
  type BaselineScoreResult,
} from './baseline-scorer.js';

// LLM adjustment
export {
  validateAdjustment,
  isValidAdjustment,
  applyAdjustment,
  combinedScore,
  getReasonDescription,
  VALID_ADJUSTMENTS,
  REASON_DESCRIPTIONS,
  type ValidAdjustment,
  type LLMAdjustmentResult,
  type FinalScoreResult,
} from './llm-adjustment.js';
