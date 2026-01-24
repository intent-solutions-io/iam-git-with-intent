/**
 * Local Complexity Scorer (Epic J - J2.3)
 *
 * Deterministic scoring algorithm for local changes.
 * Ported from baseline-scorer.ts to work with local diff analysis.
 *
 * @module @gwi/core/local
 */

import type { LocalChanges } from './change-reader.js';
import type { DiffAnalysis, RiskLevel } from './diff-analyzer.js';
import { categorizeFile } from './diff-analyzer.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Complexity score (1-10 scale)
 */
export type LocalComplexityScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Rubric tags for scoring breakdown
 */
export type LocalRubricTag =
  // Size factors
  | 'small_change'
  | 'medium_change'
  | 'large_change'
  | 'many_files'
  // Complexity factors
  | 'simple_change'
  | 'scattered_changes'
  | 'high_churn'
  | 'api_change'
  // Risk factors
  | 'security_sensitive'
  | 'config_change'
  | 'infra_change'
  | 'dependency_change'
  // Reduction factors
  | 'test_only'
  | 'docs_only'
  | 'types_only';

/**
 * Local scoring result
 */
export interface LocalScoreResult {
  /** Final complexity score (1-10) */
  score: LocalComplexityScore;
  /** Rubric tags that contributed to score */
  reasons: LocalRubricTag[];
  /** Detailed breakdown of score contributions */
  breakdown: Record<string, number>;
  /** Risk level derived from score */
  riskLevel: RiskLevel;
  /** Human-readable summary */
  summary: string;
}

// =============================================================================
// Scoring Constants
// =============================================================================

const BASE_SCORE = 1;
const MAX_SCORE = 10;
const MIN_SCORE = 1;

/**
 * Score contributions for each rubric tag
 */
const RUBRIC_WEIGHTS: Record<LocalRubricTag, number> = {
  // Size factors
  small_change: 0,
  medium_change: 1,
  large_change: 2,
  many_files: 1.5,

  // Complexity factors
  simple_change: 0,
  scattered_changes: 1.5,
  high_churn: 1,
  api_change: 2,

  // Risk factors
  security_sensitive: 3,
  config_change: 1,
  infra_change: 2,
  dependency_change: 1.5,

  // Reduction factors
  test_only: -1,
  docs_only: -1,
  types_only: -0.5,
};

/**
 * Thresholds for categorization
 */
const THRESHOLDS = {
  // Line count
  SMALL_LINES: 50,
  MEDIUM_LINES: 200,
  LARGE_LINES: 500,

  // File count
  FEW_FILES: 3,
  MANY_FILES: 8,

  // Churn ratio (min/max of adds/deletes)
  HIGH_CHURN: 0.7,

  // Scattered changes (files with small changes)
  SCATTERED_FILES: 5,
  SCATTERED_MAX_LINES: 10,
};

/**
 * Patterns for detecting security-sensitive files
 */
const SECURITY_PATTERNS = [
  /auth/i,
  /login/i,
  /password/i,
  /credential/i,
  /secret/i,
  /token/i,
  /permission/i,
  /rbac/i,
  /oauth/i,
  /jwt/i,
  /session/i,
  /encrypt/i,
  /decrypt/i,
  /security/i,
];

/**
 * Patterns for detecting infrastructure files
 */
const INFRA_PATTERNS = [
  /Dockerfile/i,
  /docker-compose/i,
  /\.tf$/,
  /\.tfvars$/,
  /kubernetes/i,
  /k8s/i,
  /\.ya?ml$/,
  /cloudbuild/i,
  /\.github\/workflows/i,
];

/**
 * Patterns for detecting API-related files
 */
const API_PATTERNS = [
  /routes?\./i,
  /controller/i,
  /handler/i,
  /endpoint/i,
  /api\//i,
  /graphql/i,
  /schema/i,
  /openapi/i,
  /swagger/i,
];

// =============================================================================
// Scoring Logic
// =============================================================================

/**
 * Check if any file matches patterns
 */
function matchesPatterns(files: { path: string }[], patterns: RegExp[]): boolean {
  return files.some((f) => patterns.some((p) => p.test(f.path)));
}

/**
 * Score local changes
 */
export function scoreLocalChanges(changes: LocalChanges): LocalScoreResult {
  let score = BASE_SCORE;
  const reasons: LocalRubricTag[] = [];
  const breakdown: Record<string, number> = { base: BASE_SCORE };

  const { files, totalAdditions, totalDeletions } = changes;
  const totalLines = totalAdditions + totalDeletions;

  // ==========================================================================
  // Size Factors
  // ==========================================================================

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
  if (files.length > THRESHOLDS.MANY_FILES) {
    score += RUBRIC_WEIGHTS.many_files;
    reasons.push('many_files');
    breakdown.many_files = RUBRIC_WEIGHTS.many_files;
  }

  // ==========================================================================
  // Complexity Factors
  // ==========================================================================

  // Scattered changes (many files with small changes each)
  const scatteredFiles = files.filter(
    (f) => f.additions + f.deletions < THRESHOLDS.SCATTERED_MAX_LINES
  );
  if (scatteredFiles.length >= THRESHOLDS.SCATTERED_FILES) {
    score += RUBRIC_WEIGHTS.scattered_changes;
    reasons.push('scattered_changes');
    breakdown.scattered_changes = RUBRIC_WEIGHTS.scattered_changes;
  }

  // High churn (lots of adds AND deletes = refactoring)
  if (totalAdditions > 0 && totalDeletions > 0) {
    const churnRatio = Math.min(totalAdditions, totalDeletions) / Math.max(totalAdditions, totalDeletions);
    if (churnRatio > THRESHOLDS.HIGH_CHURN) {
      score += RUBRIC_WEIGHTS.high_churn;
      reasons.push('high_churn');
      breakdown.high_churn = RUBRIC_WEIGHTS.high_churn;
    }
  }

  // API changes
  if (matchesPatterns(files, API_PATTERNS)) {
    score += RUBRIC_WEIGHTS.api_change;
    reasons.push('api_change');
    breakdown.api_change = RUBRIC_WEIGHTS.api_change;
  }

  // ==========================================================================
  // Risk Factors
  // ==========================================================================

  // Security-sensitive files
  if (matchesPatterns(files, SECURITY_PATTERNS)) {
    score += RUBRIC_WEIGHTS.security_sensitive;
    reasons.push('security_sensitive');
    breakdown.security_sensitive = RUBRIC_WEIGHTS.security_sensitive;
  }

  // Infrastructure files
  if (matchesPatterns(files, INFRA_PATTERNS)) {
    score += RUBRIC_WEIGHTS.infra_change;
    reasons.push('infra_change');
    breakdown.infra_change = RUBRIC_WEIGHTS.infra_change;
  }

  // Dependency files
  const depPatterns = [/package\.json$/, /package-lock\.json$/, /yarn\.lock$/, /go\.mod$/, /Cargo\.toml$/];
  if (matchesPatterns(files, depPatterns)) {
    score += RUBRIC_WEIGHTS.dependency_change;
    reasons.push('dependency_change');
    breakdown.dependency_change = RUBRIC_WEIGHTS.dependency_change;
  }

  // Config files (non-infra)
  const configFiles = files.filter((f) => categorizeFile(f.path) === 'config');
  if (configFiles.length > 0 && !reasons.includes('infra_change')) {
    score += RUBRIC_WEIGHTS.config_change;
    reasons.push('config_change');
    breakdown.config_change = RUBRIC_WEIGHTS.config_change;
  }

  // ==========================================================================
  // Reduction Factors
  // ==========================================================================

  // Test-only changes
  const testFiles = files.filter((f) => categorizeFile(f.path) === 'test');
  if (testFiles.length === files.length && files.length > 0) {
    score += RUBRIC_WEIGHTS.test_only;
    reasons.push('test_only');
    breakdown.test_only = RUBRIC_WEIGHTS.test_only;
  }

  // Docs-only changes
  const docFiles = files.filter((f) => categorizeFile(f.path) === 'docs');
  if (docFiles.length === files.length && files.length > 0) {
    score += RUBRIC_WEIGHTS.docs_only;
    reasons.push('docs_only');
    breakdown.docs_only = RUBRIC_WEIGHTS.docs_only;
  }

  // Type definitions only
  const typeFiles = files.filter((f) => f.path.endsWith('.d.ts'));
  if (typeFiles.length === files.length && files.length > 0) {
    score += RUBRIC_WEIGHTS.types_only;
    reasons.push('types_only');
    breakdown.types_only = RUBRIC_WEIGHTS.types_only;
  }

  // ==========================================================================
  // Clamp and Derive Risk Level
  // ==========================================================================

  const clampedScore = clampScore(score);
  const riskLevel = scoreToRiskLevel(clampedScore);
  const summary = generateSummary(clampedScore, reasons);

  return {
    score: clampedScore,
    reasons,
    breakdown,
    riskLevel,
    summary,
  };
}

/**
 * Score from a DiffAnalysis result
 */
export function scoreFromAnalysis(analysis: DiffAnalysis): LocalScoreResult {
  return scoreLocalChanges(analysis.changes);
}

/**
 * Clamp score to valid range
 */
export function clampScore(score: number): LocalComplexityScore {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score))) as LocalComplexityScore;
}

/**
 * Convert score to risk level
 */
export function scoreToRiskLevel(score: LocalComplexityScore): RiskLevel {
  if (score <= 2) return 'low';
  if (score <= 5) return 'medium';
  if (score <= 7) return 'high';
  return 'critical';
}

/**
 * Generate human-readable summary from score
 */
function generateSummary(score: LocalComplexityScore, reasons: LocalRubricTag[]): string {
  const level = scoreToRiskLevel(score);

  const summaries: Record<RiskLevel, string> = {
    low: 'Simple changes, low review effort needed',
    medium: 'Moderate changes, standard review recommended',
    high: 'Complex changes, careful review required',
    critical: 'High-risk changes, thorough review essential',
  };

  let summary = summaries[level];

  // Add context from top reasons
  if (reasons.includes('security_sensitive')) {
    summary += '. Security-sensitive files modified.';
  } else if (reasons.includes('infra_change')) {
    summary += '. Infrastructure files affected.';
  } else if (reasons.includes('api_change')) {
    summary += '. API changes detected.';
  } else if (reasons.includes('large_change')) {
    summary += '. Large changeset.';
  }

  return summary;
}

// =============================================================================
// Quick Scoring
// =============================================================================

/**
 * Quick score estimate from minimal info
 */
export function quickScore(
  numFiles: number,
  totalLines: number,
  hasSecurityFiles: boolean = false
): LocalComplexityScore {
  let score = BASE_SCORE;

  // Size
  if (totalLines > THRESHOLDS.LARGE_LINES) score += 2;
  else if (totalLines > THRESHOLDS.MEDIUM_LINES) score += 1;

  // File count
  if (numFiles > THRESHOLDS.MANY_FILES) score += 1.5;
  else if (numFiles > THRESHOLDS.FEW_FILES) score += 0.5;

  // Security
  if (hasSecurityFiles) score += 3;

  return clampScore(score);
}

// =============================================================================
// Triage Helpers
// =============================================================================

/**
 * Triage result for local changes
 */
export interface LocalTriageResult {
  /** Complexity score */
  score: LocalComplexityScore;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Whether changes should be reviewed */
  needsReview: boolean;
  /** Whether changes are ready for commit */
  readyForCommit: boolean;
  /** Blocking issues (if any) */
  blockers: string[];
  /** Warnings (non-blocking) */
  warnings: string[];
  /** Recommendations */
  recommendations: string[];
}

/**
 * Triage local changes for review/commit readiness
 */
export function triageLocalChanges(
  scoreResult: LocalScoreResult,
  options: {
    requireTests?: boolean;
    maxComplexity?: number;
    blockSecurityChanges?: boolean;
  } = {}
): LocalTriageResult {
  const {
    requireTests = false,
    maxComplexity = 8,
    blockSecurityChanges = false,
  } = options;

  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  const { score, reasons, riskLevel } = scoreResult;

  // Check complexity threshold
  if (score > maxComplexity) {
    blockers.push(`Complexity ${score}/10 exceeds threshold ${maxComplexity}/10`);
    recommendations.push('Consider breaking into smaller changes');
  }

  // Check security changes
  if (blockSecurityChanges && reasons.includes('security_sensitive')) {
    blockers.push('Security-sensitive files require additional review');
  }

  // Warnings based on patterns
  if (reasons.includes('high_churn')) {
    warnings.push('High churn (significant refactoring) - verify tests pass');
  }

  if (reasons.includes('scattered_changes')) {
    warnings.push('Scattered changes across many files - ensure related');
  }

  if (reasons.includes('dependency_change')) {
    warnings.push('Dependency changes detected - review for security updates');
  }

  if (reasons.includes('infra_change')) {
    warnings.push('Infrastructure changes - verify deployment pipeline');
  }

  // Check for test requirement
  // Note: This would need analysis context to properly check
  if (requireTests) {
    // This is a simplified check - full implementation would look at analysis
    recommendations.push('Ensure tests are included for source changes');
  }

  // General recommendations
  if (riskLevel === 'high' || riskLevel === 'critical') {
    recommendations.push('Request peer review before committing');
  }

  return {
    score,
    riskLevel,
    needsReview: riskLevel !== 'low',
    readyForCommit: blockers.length === 0,
    blockers,
    warnings,
    recommendations,
  };
}
