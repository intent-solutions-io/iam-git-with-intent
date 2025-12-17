/**
 * Plan Result Schema
 *
 * Schema for the output of the planning step.
 * Saved to plan.json in the run bundle (alongside plan.md for human reading).
 */

import { z } from 'zod';
import {
  ComplexityScore,
  RiskLevel,
  ConfidenceScore,
  FilePath,
  ResolutionStrategy,
} from './common.js';

// =============================================================================
// Planned Action
// =============================================================================

/**
 * Action type for a file
 */
export const FileActionType = z.enum([
  'create',   // Create new file
  'modify',   // Modify existing file
  'delete',   // Delete file
  'rename',   // Rename file
  'resolve',  // Resolve conflict in file
  'skip',     // Skip this file
]);

export type FileActionType = z.infer<typeof FileActionType>;

/**
 * Planned action for a single file
 */
export const PlannedFileAction = z.object({
  path: FilePath,
  action: FileActionType,
  strategy: ResolutionStrategy.optional(), // For resolve actions
  description: z.string(),
  risk: RiskLevel,
  confidence: ConfidenceScore,
  dependencies: z.array(FilePath).optional(), // Files that must be done first
  estimatedLines: z.number().int().min(0).optional(),
});

export type PlannedFileAction = z.infer<typeof PlannedFileAction>;

// =============================================================================
// Plan Step
// =============================================================================

/**
 * A step in the execution plan
 */
export const PlanStep = z.object({
  order: z.number().int().min(1),
  name: z.string(),
  description: z.string(),
  files: z.array(FilePath),
  actions: z.array(PlannedFileAction),
  canParallelize: z.boolean(),
  estimatedDurationSec: z.number().int().min(0).optional(),
});

export type PlanStep = z.infer<typeof PlanStep>;

// =============================================================================
// Risk Assessment
// =============================================================================

/**
 * Identified risk in the plan
 */
export const PlanRisk = z.object({
  id: z.string(),
  severity: RiskLevel,
  description: z.string(),
  affectedFiles: z.array(FilePath),
  mitigation: z.string().optional(),
  requiresReview: z.boolean(),
});

export type PlanRisk = z.infer<typeof PlanRisk>;

// =============================================================================
// Plan Result
// =============================================================================

/**
 * Complete plan result saved to plan.json
 */
export const PlanResult = z.object({
  // Schema version
  version: z.literal(1),

  // Timestamp
  timestamp: z.string().datetime(),

  // Summary
  summary: z.string(),
  complexity: ComplexityScore,
  overallRisk: RiskLevel,
  confidence: ConfidenceScore,

  // Execution plan
  steps: z.array(PlanStep),
  totalFiles: z.number().int().min(0),
  parallelizable: z.boolean(),

  // File actions (flat list for quick lookup)
  fileActions: z.array(PlannedFileAction),

  // Risks
  risks: z.array(PlanRisk),
  requiresHumanReview: z.boolean(),
  reviewReasons: z.array(z.string()),

  // Estimates
  estimatedTotalDurationSec: z.number().int().min(0),
  estimatedTokens: z.number().int().min(0).optional(),

  // Metadata
  basedOnTriageScore: ComplexityScore.optional(),
  modelUsed: z.string().optional(),
});

export type PlanResult = z.infer<typeof PlanResult>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a plan result, returning errors if invalid
 */
export function validatePlanResult(data: unknown): { valid: boolean; errors?: z.ZodError } {
  const result = PlanResult.safeParse(data);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, errors: result.error };
}

/**
 * Parse and validate a plan result, throwing on error
 */
export function parsePlanResult(data: unknown): PlanResult {
  return PlanResult.parse(data);
}
