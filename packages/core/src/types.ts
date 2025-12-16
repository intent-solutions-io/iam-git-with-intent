/**
 * Core types used across Git With Intent
 */

/**
 * Agent identifiers follow SPIFFE format for Vertex AI compatibility
 * Format: spiffe://intent.solutions/agent/{agent-name}
 */
export type AgentId = `spiffe://intent.solutions/agent/${string}`;

/**
 * Supported model providers
 */
export type ModelProvider = 'anthropic' | 'google' | 'openai';

/**
 * Model identifiers for each provider
 */
export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Complexity scores for triage (1-10)
 */
export type ComplexityScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Routing decisions from Triage Agent
 */
export type RouteDecision = 'auto-resolve' | 'agent-resolve' | 'human-required';

/**
 * PR conflict information
 */
export interface ConflictInfo {
  file: string;
  baseContent: string;
  oursContent: string;
  theirsContent: string;
  conflictMarkers: string;
  complexity: ComplexityScore;
}

/**
 * PR metadata from GitHub/GitLab
 */
export interface PRMetadata {
  url: string;
  number: number;
  title: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  conflicts: ConflictInfo[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resolution result from Resolver Agent
 */
export interface ResolutionResult {
  file: string;
  resolvedContent: string;
  explanation: string;
  confidence: number; // 0-100
  strategy: 'merge-both' | 'accept-ours' | 'accept-theirs' | 'custom';
}

/**
 * Review result from Reviewer Agent
 */
export interface ReviewResult {
  approved: boolean;
  syntaxValid: boolean;
  codeLossDetected: boolean;
  securityIssues: string[];
  suggestions: string[];
  confidence: number; // 0-100
}
