/**
 * LLM Adjustment
 *
 * Types and utilities for LLM-based score adjustments.
 * The adjustment is bounded to -2..+2 range.
 */

import type { LLMAdjustmentReason, ComplexityScore } from '../run-bundle/schemas/index.js';
import { clampScore } from './baseline-scorer.js';

// =============================================================================
// Types
// =============================================================================

/**
 * LLM adjustment result
 */
export interface LLMAdjustmentResult {
  /** Adjustment value (-2 to +2) */
  adjustment: -2 | -1 | 0 | 1 | 2;

  /** Reasons for the adjustment */
  reasons: LLMAdjustmentReason[];

  /** Optional explanation text */
  explanation?: string;
}

/**
 * Combined score result
 */
export interface FinalScoreResult {
  baselineScore: ComplexityScore;
  llmAdjustment: number;
  finalScore: ComplexityScore;
  reasons: {
    baseline: string[];
    llm: LLMAdjustmentReason[];
  };
}

// =============================================================================
// Adjustment Validation
// =============================================================================

/**
 * Valid adjustment values
 */
export const VALID_ADJUSTMENTS = [-2, -1, 0, 1, 2] as const;
export type ValidAdjustment = typeof VALID_ADJUSTMENTS[number];

/**
 * Validate and clamp an LLM adjustment to valid range
 */
export function validateAdjustment(value: number): ValidAdjustment {
  if (value <= -2) return -2;
  if (value >= 2) return 2;
  return Math.round(value) as ValidAdjustment;
}

/**
 * Check if an adjustment value is valid
 */
export function isValidAdjustment(value: number): value is ValidAdjustment {
  return VALID_ADJUSTMENTS.includes(value as ValidAdjustment);
}

// =============================================================================
// Score Combination
// =============================================================================

/**
 * Apply LLM adjustment to baseline score
 *
 * @param baseline - Baseline score (1-10)
 * @param adjustment - LLM adjustment (-2 to +2)
 * @returns Final clamped score (1-10)
 */
export function applyAdjustment(
  baseline: ComplexityScore,
  adjustment: ValidAdjustment
): ComplexityScore {
  return clampScore(baseline + adjustment);
}

/**
 * Create a final score result
 */
export function combinedScore(
  baselineScore: ComplexityScore,
  baselineReasons: string[],
  llmAdjustment: LLMAdjustmentResult
): FinalScoreResult {
  const adjustment = validateAdjustment(llmAdjustment.adjustment);
  const finalScore = applyAdjustment(baselineScore, adjustment);

  return {
    baselineScore,
    llmAdjustment: adjustment,
    finalScore,
    reasons: {
      baseline: baselineReasons,
      llm: llmAdjustment.reasons,
    },
  };
}

// =============================================================================
// Reason Descriptions
// =============================================================================

/**
 * Human-readable descriptions for adjustment reasons
 */
export const REASON_DESCRIPTIONS: Record<LLMAdjustmentReason, string> = {
  // Increase complexity
  needs_domain_knowledge: 'Requires domain-specific expertise to resolve correctly',
  ambiguous_intent: 'The intent of the changes is unclear',
  multi_file_coherence: 'Cross-file consistency must be maintained',
  risk_security: 'Security implications require careful review',
  risk_data_loss: 'Risk of data loss if resolved incorrectly',
  complex_merge_semantics: 'Semantic merge logic is complex',

  // Decrease complexity
  clear_intent: 'The intent is clear and straightforward',
  isolated_change: 'Changes are isolated and self-contained',
  well_documented: 'Good documentation makes resolution easier',
  standard_pattern: 'Follows a standard, well-known pattern',
  test_coverage: 'Good test coverage reduces risk',
};

/**
 * Get description for an adjustment reason
 */
export function getReasonDescription(reason: LLMAdjustmentReason): string {
  return REASON_DESCRIPTIONS[reason] || reason;
}
