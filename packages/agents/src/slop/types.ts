/**
 * Slop Detector Types
 *
 * Zod schemas and types for AI slop detection in PRs.
 * "Slop" refers to low-quality, AI-generated contributions that
 * add noise rather than value to open source projects.
 */

import { z } from 'zod';

/**
 * Input for slop analysis
 */
export const SlopAnalysisInputSchema = z.object({
  /** PR URL for reference */
  prUrl: z.string().url(),
  /** Combined diff content */
  diff: z.string(),
  /** PR title */
  prTitle: z.string(),
  /** PR body/description */
  prBody: z.string(),
  /** Contributor username */
  contributor: z.string(),
  /** Changed files with metadata */
  files: z.array(z.object({
    path: z.string(),
    additions: z.number(),
    deletions: z.number(),
  })),
  /** Optional: commit messages in the PR */
  commitMessages: z.array(z.string()).optional(),
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
