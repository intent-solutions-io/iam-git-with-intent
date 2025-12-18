/**
 * Resolve Result Schema
 *
 * Schema for the output of the resolver agent.
 * The actual patch is saved to patch.diff, while metadata is in resolve.json.
 */

import { z } from 'zod';
import {
  ComplexityScore,
  ConfidenceScore,
  FilePath,
  ResolutionStrategy,
} from './common.js';

// =============================================================================
// Per-File Resolution
// =============================================================================

/**
 * Resolution status for a file
 */
export const ResolutionStatus = z.enum([
  'resolved',     // Successfully resolved
  'partial',      // Partially resolved, needs review
  'failed',       // Failed to resolve
  'skipped',      // Skipped (e.g., binary file)
  'unchanged',    // No changes needed
]);

export type ResolutionStatus = z.infer<typeof ResolutionStatus>;

/**
 * Resolution metadata for a single file
 */
export const FileResolution = z.object({
  path: FilePath,
  status: ResolutionStatus,
  strategy: ResolutionStrategy,
  confidence: ConfidenceScore,

  // Statistics
  linesAdded: z.number().int().min(0),
  linesRemoved: z.number().int().min(0),
  conflictsResolved: z.number().int().min(0),

  // Explanation
  explanation: z.string(),
  notes: z.array(z.string()).optional(),

  // Warnings
  warnings: z.array(z.string()).optional(),
  requiresReview: z.boolean(),
});

export type FileResolution = z.infer<typeof FileResolution>;

// =============================================================================
// Resolve Result
// =============================================================================

/**
 * Complete resolve result saved to resolve.json
 * The actual diff content is in patch.diff
 */
export const ResolveResult = z.object({
  // Schema version
  version: z.literal(1),

  // Timestamp
  timestamp: z.string().datetime(),

  // Patch reference
  patchFile: z.literal('patch.diff'),
  patchHash: z.string(), // sha256 hash of patch.diff for verification

  // Summary
  summary: z.string(),
  overallConfidence: ConfidenceScore,
  complexity: ComplexityScore,

  // Per-file results
  files: z.array(FileResolution),

  // Statistics
  totalFiles: z.number().int().min(0),
  filesResolved: z.number().int().min(0),
  filesPartial: z.number().int().min(0),
  filesFailed: z.number().int().min(0),
  filesSkipped: z.number().int().min(0),

  // Line changes
  totalLinesAdded: z.number().int().min(0),
  totalLinesRemoved: z.number().int().min(0),
  totalConflictsResolved: z.number().int().min(0),

  // Flags
  allResolved: z.boolean(),
  requiresReview: z.boolean(),
  reviewReasons: z.array(z.string()),

  // Model info
  modelUsed: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
  }).optional(),

  // Timing
  durationMs: z.number().int().min(0).optional(),
});

export type ResolveResult = z.infer<typeof ResolveResult>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a resolve result, returning errors if invalid
 */
export function validateResolveResult(data: unknown): { valid: boolean; errors?: z.ZodError } {
  const result = ResolveResult.safeParse(data);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, errors: result.error };
}

/**
 * Parse and validate a resolve result, throwing on error
 */
export function parseResolveResult(data: unknown): ResolveResult {
  return ResolveResult.parse(data);
}
