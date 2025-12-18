/**
 * Common Schema Types
 *
 * Shared types used across multiple agent step schemas.
 */

import { z } from 'zod';

// =============================================================================
// Complexity Scoring
// =============================================================================

/**
 * Complexity score (1-10)
 */
export const ComplexityScore = z.number().int().min(1).max(10);
export type ComplexityScore = z.infer<typeof ComplexityScore>;

/**
 * Risk level
 */
export const RiskLevel = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevel>;

/**
 * Confidence score (0-100)
 */
export const ConfidenceScore = z.number().min(0).max(100);
export type ConfidenceScore = z.infer<typeof ConfidenceScore>;

// =============================================================================
// File Information
// =============================================================================

/**
 * File path (non-empty string)
 */
export const FilePath = z.string().min(1);
export type FilePath = z.infer<typeof FilePath>;

/**
 * File risk classification based on path
 */
export const FileRiskClassification = z.enum([
  'safe',           // Regular code files
  'config',         // Configuration files
  'infrastructure', // IaC, terraform, k8s
  'auth',           // Authentication/authorization
  'secrets',        // Potentially contains secrets
  'financial',      // Payment/financial logic
  'test',           // Test files (lower risk)
]);
export type FileRiskClassification = z.infer<typeof FileRiskClassification>;

// =============================================================================
// Strategy Types
// =============================================================================

/**
 * Resolution strategy for conflicts
 */
export const ResolutionStrategy = z.enum([
  'accept-ours',    // Keep our changes
  'accept-theirs',  // Keep their changes
  'merge-both',     // Merge both changes
  'manual',         // Requires manual intervention
  'custom',         // Custom resolution
]);
export type ResolutionStrategy = z.infer<typeof ResolutionStrategy>;

/**
 * Route decision from triage
 */
export const RouteDecision = z.enum([
  'auto-resolve',   // Can be auto-resolved
  'agent-resolve',  // Agent can resolve with approval
  'human-required', // Needs human intervention
]);
export type RouteDecision = z.infer<typeof RouteDecision>;

// =============================================================================
// Rubric Tags (for scoring reasons)
// =============================================================================

/**
 * Baseline scoring rubric tags
 */
export const BaselineRubricTag = z.enum([
  // Size factors
  'small_change',      // Few lines changed
  'medium_change',     // Moderate lines changed
  'large_change',      // Many lines changed
  'many_files',        // Multiple files affected

  // Complexity factors
  'simple_conflict',   // Import/format only
  'logic_conflict',    // Logic changes
  'api_change',        // API contract changes
  'schema_change',     // Database/schema changes

  // Risk factors
  'auth_related',      // Authentication/authorization
  'security_sensitive', // Security-related code
  'financial_code',    // Payment/financial logic
  'config_change',     // Configuration change
  'infra_change',      // Infrastructure change

  // Code patterns
  'test_file',         // Test file (lower risk)
  'documentation',     // Documentation only
  'type_definitions',  // Type definitions only
]);
export type BaselineRubricTag = z.infer<typeof BaselineRubricTag>;

/**
 * LLM adjustment reason tags
 */
export const LLMAdjustmentReason = z.enum([
  // Increase complexity (-2 to +2)
  'needs_domain_knowledge',    // Domain expertise required
  'ambiguous_intent',          // Unclear what the intent is
  'multi_file_coherence',      // Cross-file consistency needed
  'risk_security',             // Security risk identified
  'risk_data_loss',            // Data loss risk
  'complex_merge_semantics',   // Semantically complex merge

  // Decrease complexity
  'clear_intent',              // Intent is clear
  'isolated_change',           // Change is isolated
  'well_documented',           // Good documentation/comments
  'standard_pattern',          // Follows standard pattern
  'test_coverage',             // Has good test coverage
]);
export type LLMAdjustmentReason = z.infer<typeof LLMAdjustmentReason>;

// =============================================================================
// Review Types
// =============================================================================

/**
 * Security issue severity
 */
export const SecurityIssueSeverity = z.enum([
  'info',      // Informational
  'low',       // Low severity
  'medium',    // Medium severity
  'high',      // High severity
  'critical',  // Critical severity
]);
export type SecurityIssueSeverity = z.infer<typeof SecurityIssueSeverity>;

/**
 * Security issue found during review
 */
export const SecurityIssue = z.object({
  severity: SecurityIssueSeverity,
  type: z.string(),         // e.g., 'hardcoded_secret', 'eval_usage', 'sql_injection'
  file: FilePath,
  line: z.number().int().optional(),
  description: z.string(),
  recommendation: z.string().optional(),
});
export type SecurityIssue = z.infer<typeof SecurityIssue>;

/**
 * Check performed during review
 */
export const ReviewCheck = z.object({
  name: z.string(),         // e.g., 'syntax_validation', 'security_scan'
  passed: z.boolean(),
  details: z.string().optional(),
  duration_ms: z.number().int().optional(),
});
export type ReviewCheck = z.infer<typeof ReviewCheck>;
