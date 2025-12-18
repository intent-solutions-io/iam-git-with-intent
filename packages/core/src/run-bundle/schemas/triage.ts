/**
 * Triage Result Schema
 *
 * Schema for the output of the triage agent.
 * Saved to triage.json in the run bundle.
 */

import { z } from 'zod';
import {
  ComplexityScore,
  RiskLevel,
  ConfidenceScore,
  FilePath,
  FileRiskClassification,
  ResolutionStrategy,
  RouteDecision,
  BaselineRubricTag,
  LLMAdjustmentReason,
} from './common.js';

// =============================================================================
// Feature Metrics (Deterministic)
// =============================================================================

/**
 * Deterministic features extracted from the conflict/issue
 */
export const TriageFeatures = z.object({
  // Counts
  numFiles: z.number().int().min(0),
  numHunks: z.number().int().min(0),
  totalConflictLines: z.number().int().min(0),
  totalAdditions: z.number().int().min(0),
  totalDeletions: z.number().int().min(0),

  // File types
  fileTypes: z.array(z.string()),  // e.g., ['ts', 'json', 'md']
  hasSecurityFiles: z.boolean(),    // auth/, security/, etc.
  hasInfraFiles: z.boolean(),       // terraform/, k8s/, etc.
  hasConfigFiles: z.boolean(),      // config.*, .env*, etc.
  hasTestFiles: z.boolean(),        // *.test.ts, *.spec.ts

  // Conflict patterns
  hasConflictMarkers: z.boolean(),
  maxHunksPerFile: z.number().int().min(0),
  avgHunksPerFile: z.number().min(0),
});

export type TriageFeatures = z.infer<typeof TriageFeatures>;

// =============================================================================
// Per-File Analysis
// =============================================================================

/**
 * Per-file triage information
 */
export const PerFileTriage = z.object({
  path: FilePath,
  hunks: z.number().int().min(0),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  strategy: ResolutionStrategy,
  fileRisk: FileRiskClassification,
  scoreContribution: z.number().min(0),
  notes: z.string().optional(),
});

export type PerFileTriage = z.infer<typeof PerFileTriage>;

// =============================================================================
// Triage Result
// =============================================================================

/**
 * Complete triage result saved to triage.json
 */
export const TriageResult = z.object({
  // Schema version
  version: z.literal(1),

  // Timestamp
  timestamp: z.string().datetime(),

  // Deterministic features
  features: TriageFeatures,

  // Scoring
  baselineScore: ComplexityScore,
  llmAdjustment: z.number().int().min(-2).max(2),
  finalScore: ComplexityScore,

  // Reasoning
  baselineReasons: z.array(BaselineRubricTag),
  llmReasons: z.array(LLMAdjustmentReason),
  explanation: z.string(),

  // Per-file breakdown
  perFile: z.array(PerFileTriage),

  // Decision
  routeDecision: RouteDecision,
  riskLevel: RiskLevel,
  confidence: ConfidenceScore,

  // Estimates
  estimatedTimeSec: z.number().int().min(0),
  estimatedCostUSD: z.number().min(0).optional(),

  // Metadata
  modelUsed: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
  }).optional(),
});

export type TriageResult = z.infer<typeof TriageResult>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a triage result, returning errors if invalid
 */
export function validateTriageResult(data: unknown): { valid: boolean; errors?: z.ZodError } {
  const result = TriageResult.safeParse(data);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, errors: result.error };
}

/**
 * Parse and validate a triage result, throwing on error
 */
export function parseTriageResult(data: unknown): TriageResult {
  return TriageResult.parse(data);
}
