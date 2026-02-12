/**
 * Slop Detector Types
 *
 * Zod schemas and types for AI slop detection in PRs.
 * "Slop" refers to low-quality, AI-generated contributions that
 * add noise rather than value to open source projects.
 */

import { z } from 'zod';

/**
 * Input size limits to prevent DoS and resource exhaustion
 */
export const INPUT_LIMITS = {
  MAX_URL_LENGTH: 2048,
  MAX_DIFF_LENGTH: 500_000,      // 500KB
  MAX_TITLE_LENGTH: 500,
  MAX_BODY_LENGTH: 65_536,       // 64KB
  MAX_CONTRIBUTOR_LENGTH: 256,
  MAX_PATH_LENGTH: 512,
  MAX_FILES: 1000,
  MAX_ADDITIONS: 100_000,
  MAX_DELETIONS: 100_000,
  MAX_COMMIT_MESSAGE_LENGTH: 1024,
  MAX_COMMIT_MESSAGES: 100,
} as const;

/**
 * Input for slop analysis
 */
export const SlopAnalysisInputSchema = z.object({
  /** PR URL for reference */
  prUrl: z.string().url().max(INPUT_LIMITS.MAX_URL_LENGTH),
  /** Combined diff content */
  diff: z.string().max(INPUT_LIMITS.MAX_DIFF_LENGTH),
  /** PR title */
  prTitle: z.string().max(INPUT_LIMITS.MAX_TITLE_LENGTH),
  /** PR body/description */
  prBody: z.string().max(INPUT_LIMITS.MAX_BODY_LENGTH),
  /** Contributor username */
  contributor: z.string().max(INPUT_LIMITS.MAX_CONTRIBUTOR_LENGTH),
  /** Changed files with metadata */
  files: z.array(z.object({
    path: z.string().max(INPUT_LIMITS.MAX_PATH_LENGTH),
    additions: z.number().int().min(0).max(INPUT_LIMITS.MAX_ADDITIONS),
    deletions: z.number().int().min(0).max(INPUT_LIMITS.MAX_DELETIONS),
  })).max(INPUT_LIMITS.MAX_FILES),
  /** Optional: commit messages in the PR */
  commitMessages: z.array(
    z.string().max(INPUT_LIMITS.MAX_COMMIT_MESSAGE_LENGTH)
  ).max(INPUT_LIMITS.MAX_COMMIT_MESSAGES).optional(),
});

export type SlopAnalysisInput = z.infer<typeof SlopAnalysisInputSchema>;

/**
 * Signal types from different analyzers
 */
export const SignalTypeSchema = z.enum(['linguistic', 'contributor', 'quality']);
export type SignalType = z.infer<typeof SignalTypeSchema>;

/**
 * Individual signal detected during analysis
 */
export const SlopSignalSchema = z.object({
  /** Which analyzer found this signal */
  type: SignalTypeSchema,
  /** Human-readable description of the signal */
  signal: z.string(),
  /** Weight contribution to slop score (0-30) */
  weight: z.number().min(0).max(30),
  /** Evidence or example that triggered this signal */
  evidence: z.string().optional(),
});

export type SlopSignal = z.infer<typeof SlopSignalSchema>;

/**
 * Recommended action based on slop score
 */
export const SlopRecommendationSchema = z.enum(['allow', 'flag', 'auto_close']);
export type SlopRecommendation = z.infer<typeof SlopRecommendationSchema>;

/**
 * Result from slop analysis
 */
export const SlopAnalysisResultSchema = z.object({
  /** Overall slop score (0-100) */
  slopScore: z.number().min(0).max(100),
  /** Confidence in the assessment (0-1) */
  confidence: z.number().min(0).max(1),
  /** Individual signals that contributed to the score */
  signals: z.array(SlopSignalSchema),
  /** Recommended action */
  recommendation: SlopRecommendationSchema,
  /** Human-readable explanation */
  reasoning: z.string(),
});

export type SlopAnalysisResult = z.infer<typeof SlopAnalysisResultSchema>;

/**
 * Thresholds for slop actions (configurable)
 */
export const SlopThresholdsSchema = z.object({
  /** Score below this = allow */
  allowMax: z.number().min(0).max(100).default(30),
  /** Score below this but above allowMax = flag */
  flagMax: z.number().min(0).max(100).default(60),
  /** Score above flagMax but below this = flag with warning */
  warnMax: z.number().min(0).max(100).default(75),
  /** Score above warnMax = auto_close */
});

export type SlopThresholds = z.infer<typeof SlopThresholdsSchema>;

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: SlopThresholds = {
  allowMax: 30,
  flagMax: 60,
  warnMax: 75,
};

/**
 * Linguistic pattern for detection
 */
export interface LinguisticPattern {
  /** Pattern name for reporting */
  name: string;
  /** Regex or string patterns to match */
  patterns: (RegExp | string)[];
  /** Weight when matched (0-30) */
  weight: number;
  /** Description of why this is suspicious */
  description: string;
}

/**
 * Quality signal for detection
 */
export interface QualitySignal {
  /** Signal name */
  name: string;
  /** Weight when detected (0-30) */
  weight: number;
  /** Description */
  description: string;
}

/**
 * Analyzer result interface
 */
export interface AnalyzerResult {
  signals: SlopSignal[];
  totalWeight: number;
}

/**
 * LLM refinement response schema for validation
 */
export const LLMRefinementResponseSchema = z.object({
  adjustedScore: z.number().min(0).max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  falsePositives: z.array(z.string().max(100)).max(20).default([]),
  additionalConcerns: z.array(z.string().max(500)).max(10).default([]),
  reasoning: z.string().max(2000).optional(),
});

export type LLMRefinementResponse = z.infer<typeof LLMRefinementResponseSchema>;

/**
 * Contributor context for reputation analysis
 */
export const ContributorContextSchema = z.object({
  /** Whether this is the contributor's first PR to this repo */
  isFirstTimeContributor: z.boolean(),
  /** Number of previous PRs to this repo */
  previousPRCount: z.number().int().min(0),
  /** Number of issues/comments in this repo */
  engagementCount: z.number().int().min(0),
  /** Account age in days */
  accountAgeDays: z.number().int().min(0),
  /** Number of repos they contribute to */
  repoCount: z.number().int().min(0),
  /** Number of PRs submitted in last 24h across all repos */
  recentPRCount: z.number().int().min(0),
  /** Similar PRs detected across repos (spam detection) */
  crossRepoSimilarPRs: z.number().int().min(0),
});

export type ContributorContext = z.infer<typeof ContributorContextSchema>;
