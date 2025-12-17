/**
 * Review Result Schema
 *
 * Schema for the output of the reviewer agent.
 * Saved to review.json in the run bundle.
 */

import { z } from 'zod';
import {
  ConfidenceScore,
  FilePath,
  SecurityIssue,
  ReviewCheck,
} from './common.js';
import { RunState } from '../types.js';

// =============================================================================
// Review Finding
// =============================================================================

/**
 * Finding type
 */
export const FindingType = z.enum([
  'security',       // Security issue
  'syntax',         // Syntax error
  'logic',          // Logic error
  'style',          // Style/formatting
  'performance',    // Performance concern
  'compatibility',  // Compatibility issue
  'documentation',  // Missing/incorrect docs
  'test',           // Test-related issue
  'other',          // Other finding
]);

export type FindingType = z.infer<typeof FindingType>;

/**
 * Finding severity
 */
export const FindingSeverity = z.enum([
  'info',      // Informational
  'warning',   // Warning (should fix)
  'error',     // Error (must fix)
  'blocker',   // Blocker (cannot proceed)
]);

export type FindingSeverity = z.infer<typeof FindingSeverity>;

/**
 * A finding from the review
 */
export const ReviewFinding = z.object({
  id: z.string(),
  type: FindingType,
  severity: FindingSeverity,
  file: FilePath.optional(),
  line: z.number().int().min(1).optional(),
  message: z.string(),
  details: z.string().optional(),
  suggestion: z.string().optional(),
  autoFixable: z.boolean(),
});

export type ReviewFinding = z.infer<typeof ReviewFinding>;

// =============================================================================
// File Review
// =============================================================================

/**
 * Review result for a single file
 */
export const FileReview = z.object({
  path: FilePath,
  reviewed: z.boolean(),
  passed: z.boolean(),
  findings: z.array(ReviewFinding),
  notes: z.string().optional(),
});

export type FileReview = z.infer<typeof FileReview>;

// =============================================================================
// Review Result
// =============================================================================

/**
 * Complete review result saved to review.json
 */
export const ReviewResult = z.object({
  // Schema version
  version: z.literal(1),

  // Timestamp
  timestamp: z.string().datetime(),

  // Overall result
  approved: z.boolean(),
  confidence: ConfidenceScore,
  summary: z.string(),

  // Checks performed
  checksPerformed: z.array(ReviewCheck),
  allChecksPassed: z.boolean(),

  // Findings
  findings: z.array(ReviewFinding),
  totalFindings: z.number().int().min(0),
  blockerCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  warningCount: z.number().int().min(0),

  // Security
  securityIssues: z.array(SecurityIssue),
  hasSecurityIssues: z.boolean(),
  criticalSecurityIssues: z.number().int().min(0),

  // Per-file reviews
  fileReviews: z.array(FileReview),
  filesReviewed: z.number().int().min(0),
  filesPassed: z.number().int().min(0),
  filesFailed: z.number().int().min(0),

  // Syntax validation
  syntaxValid: z.boolean(),
  syntaxErrors: z.array(z.string()),

  // Code quality
  codeLossDetected: z.boolean(),
  codeLossDetails: z.string().optional(),

  // Human review
  requiresHuman: z.boolean(),
  humanReviewReasons: z.array(z.string()),

  // Recommended next state
  recommendedNextState: RunState,

  // Suggestions
  suggestions: z.array(z.string()),

  // Metadata
  modelUsed: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
  }).optional(),
  durationMs: z.number().int().min(0).optional(),

  // Patch verification
  patchHash: z.string().optional(),
  patchVerified: z.boolean().optional(),
});

export type ReviewResult = z.infer<typeof ReviewResult>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a review result, returning errors if invalid
 */
export function validateReviewResult(data: unknown): { valid: boolean; errors?: z.ZodError } {
  const result = ReviewResult.safeParse(data);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, errors: result.error };
}

/**
 * Parse and validate a review result, throwing on error
 */
export function parseReviewResult(data: unknown): ReviewResult {
  return ReviewResult.parse(data);
}
