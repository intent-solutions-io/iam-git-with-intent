/**
 * Step Execution Contract Types
 *
 * A3: Defines the typed envelopes for step inputs and outputs.
 * All agents receive StepInput and return StepOutput, ensuring
 * consistent structure across the pipeline.
 *
 * @module @gwi/engine/step-contract
 */

import { z } from 'zod';

// =============================================================================
// A3.s2: Step Result Codes
// =============================================================================

/**
 * Step result codes indicating execution outcome.
 *
 * - ok: Step completed successfully, proceed to next step
 * - retryable: Temporary failure, orchestrator may retry
 * - fatal: Permanent failure, abort the run
 * - blocked: Waiting for external input (approval, human review)
 * - skipped: Step was skipped (not applicable for this run)
 */
export const StepResultCode = z.enum([
  'ok',
  'retryable',
  'fatal',
  'blocked',
  'skipped',
]);

export type StepResultCode = z.infer<typeof StepResultCode>;

/**
 * Map of result codes to their retry eligibility
 */
export const RESULT_CODE_RETRY_MAP: Record<StepResultCode, boolean> = {
  ok: false,       // No retry needed
  retryable: true, // Can retry
  fatal: false,    // Do not retry
  blocked: false,  // Waiting, not a retry scenario
  skipped: false,  // Not applicable
};

/**
 * Map of result codes to whether they continue the pipeline
 */
export const RESULT_CODE_CONTINUE_MAP: Record<StepResultCode, boolean> = {
  ok: true,        // Continue to next step
  retryable: false, // Retry current step
  fatal: false,    // Abort pipeline
  blocked: false,  // Wait for unblock
  skipped: true,   // Continue to next step
};

// =============================================================================
// A3.s4: Artifact Pointers (GCS URIs)
// =============================================================================

/**
 * Artifact pointer to cloud storage.
 *
 * All large artifacts (diffs, logs, reports) are stored in GCS and
 * referenced via URI. The content field provides a preview/summary.
 */
export const ArtifactPointer = z.object({
  /** GCS URI: gs://bucket/path/to/artifact */
  uri: z.string().regex(/^gs:\/\/[a-z0-9][-a-z0-9._]*\/.*$/, 'Must be a valid GCS URI'),

  /** Content type (MIME) */
  contentType: z.string(),

  /** Size in bytes */
  sizeBytes: z.number().int().nonnegative(),

  /** SHA256 hash for integrity verification */
  sha256: z.string().length(64),

  /** Optional preview/summary (first 1KB or structured summary) */
  preview: z.string().max(4096).optional(),

  /** When the artifact was created */
  createdAt: z.string().datetime(),
});

export type ArtifactPointer = z.infer<typeof ArtifactPointer>;

/**
 * Inline content for small artifacts (< 64KB)
 */
export const InlineArtifact = z.object({
  /** Artifact content (inline) */
  content: z.string().max(65536),

  /** Content type (MIME) */
  contentType: z.string(),

  /** SHA256 hash for integrity verification */
  sha256: z.string().length(64).optional(),
});

export type InlineArtifact = z.infer<typeof InlineArtifact>;

/**
 * Artifact reference (either pointer to GCS or inline content)
 */
export const ArtifactRef = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pointer'), pointer: ArtifactPointer }),
  z.object({ type: z.literal('inline'), inline: InlineArtifact }),
]);

export type ArtifactRef = z.infer<typeof ArtifactRef>;

// =============================================================================
// A3.s3: Step Timing and Cost Accounting
// =============================================================================

/**
 * Token usage for LLM calls
 */
export const TokenUsage = z.object({
  /** Input/prompt tokens */
  input: z.number().int().nonnegative(),

  /** Output/completion tokens */
  output: z.number().int().nonnegative(),

  /** Total tokens */
  total: z.number().int().nonnegative(),
});

export type TokenUsage = z.infer<typeof TokenUsage>;

/**
 * Cost breakdown for a step
 */
export const StepCost = z.object({
  /** Model used */
  model: z.string(),

  /** Provider (anthropic, google, openai) */
  provider: z.string(),

  /** Token usage */
  tokens: TokenUsage,

  /** Estimated cost in USD (millicents precision) */
  estimatedCostUsd: z.number().nonnegative(),

  /** Pricing tier used for estimation */
  pricingTier: z.string().optional(),
});

export type StepCost = z.infer<typeof StepCost>;

/**
 * Step timing information
 */
export const StepTiming = z.object({
  /** When the step started (ISO 8601) */
  startedAt: z.string().datetime(),

  /** When the step completed (ISO 8601) */
  completedAt: z.string().datetime().optional(),

  /** Total duration in milliseconds */
  durationMs: z.number().int().nonnegative().optional(),

  /** Time spent waiting for LLM responses */
  llmWaitMs: z.number().int().nonnegative().optional(),

  /** Time spent on tool calls */
  toolCallMs: z.number().int().nonnegative().optional(),

  /** Time spent on I/O (storage, network) */
  ioMs: z.number().int().nonnegative().optional(),
});

export type StepTiming = z.infer<typeof StepTiming>;

// =============================================================================
// A3.s1: Step Input/Output Types
// =============================================================================

/**
 * Repository context for step execution
 */
export const RepoContext = z.object({
  /** Repository owner */
  owner: z.string(),

  /** Repository name */
  name: z.string(),

  /** Full name (owner/name) */
  fullName: z.string(),

  /** Default branch */
  defaultBranch: z.string().default('main'),

  /** GitHub installation ID (for API access) */
  installationId: z.number().optional(),
});

export type RepoContext = z.infer<typeof RepoContext>;

/**
 * PR context for step execution
 */
export const PRContext = z.object({
  /** PR number */
  number: z.number().int().positive(),

  /** PR title */
  title: z.string(),

  /** PR URL */
  url: z.string().url(),

  /** Base branch */
  baseBranch: z.string(),

  /** Head branch */
  headBranch: z.string(),

  /** Base commit SHA */
  baseSha: z.string(),

  /** Head commit SHA */
  headSha: z.string(),

  /** Author login */
  author: z.string(),

  /** PR state */
  state: z.enum(['open', 'closed', 'merged']),

  /** Whether the PR is a draft */
  isDraft: z.boolean().default(false),

  /** Labels on the PR */
  labels: z.array(z.string()).default([]),
});

export type PRContext = z.infer<typeof PRContext>;

/**
 * Issue context for step execution
 */
export const IssueContext = z.object({
  /** Issue number */
  number: z.number().int().positive(),

  /** Issue title */
  title: z.string(),

  /** Issue body */
  body: z.string(),

  /** Issue URL */
  url: z.string().url(),

  /** Author login */
  author: z.string(),

  /** Labels on the issue */
  labels: z.array(z.string()).default([]),
});

export type IssueContext = z.infer<typeof IssueContext>;

/**
 * Step input envelope.
 *
 * Every step receives this standardized input structure.
 */
export const StepInput = z.object({
  // --- Identity ---
  /** Unique run ID */
  runId: z.string().uuid(),

  /** Step ID within the run */
  stepId: z.string(),

  /** Tenant ID for multi-tenant isolation */
  tenantId: z.string(),

  // --- Context ---
  /** Repository context */
  repo: RepoContext,

  /** PR context (for PR-related workflows) */
  pr: PRContext.optional(),

  /** Issue context (for issue-to-code workflows) */
  issue: IssueContext.optional(),

  // --- Workflow ---
  /** Step type/name */
  stepType: z.enum(['triage', 'plan', 'code', 'resolve', 'review', 'apply']),

  /** Risk mode for this run */
  riskMode: z.enum(['comment_only', 'suggest_patch', 'auto_patch', 'auto_push']),

  /** Capabilities mode */
  capabilitiesMode: z.enum(['comment-only', 'patch-only', 'commit-after-approval']),

  // --- Dependencies ---
  /** Output from previous step (if any) */
  previousOutput: z.unknown().optional(),

  /** Artifacts from previous steps */
  artifacts: z.record(z.string(), ArtifactRef).optional(),

  // --- Configuration ---
  /** Model configuration for this step */
  modelConfig: z.object({
    model: z.string(),
    provider: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional(),

  /** Step-specific parameters */
  params: z.record(z.unknown()).optional(),

  // --- Timing ---
  /** When the step was queued */
  queuedAt: z.string().datetime(),

  /** Retry attempt number (0 = first attempt) */
  attemptNumber: z.number().int().nonnegative().default(0),

  /** Maximum retry attempts */
  maxAttempts: z.number().int().positive().default(3),
});

export type StepInput = z.infer<typeof StepInput>;

/**
 * Step output envelope.
 *
 * Every step returns this standardized output structure.
 */
export const StepOutput = z.object({
  // --- Identity ---
  /** Run ID (echoed from input) */
  runId: z.string().uuid(),

  /** Step ID (echoed from input) */
  stepId: z.string(),

  // --- Result ---
  /** Result code */
  resultCode: StepResultCode,

  /** Human-readable summary of what the step did */
  summary: z.string(),

  /** Detailed result data (step-specific) */
  data: z.unknown().optional(),

  // --- Error (if applicable) ---
  /** Error message if resultCode is retryable/fatal */
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z.unknown().optional(),
    retryAfterMs: z.number().int().positive().optional(),
  }).optional(),

  // --- Artifacts ---
  /** Artifacts produced by this step */
  artifacts: z.record(z.string(), ArtifactRef).optional(),

  // --- Timing & Cost (A3.s3) ---
  /** Step timing information */
  timing: StepTiming,

  /** Cost breakdown (if LLM was used) */
  cost: StepCost.optional(),

  // --- Next Step Hints ---
  /** Suggested next step (orchestrator may override) */
  suggestedNextStep: z.string().optional(),

  /** Whether this step requires approval before proceeding */
  requiresApproval: z.boolean().default(false),

  /** Proposed changes for approval */
  proposedChanges: z.array(z.object({
    file: z.string(),
    action: z.enum(['create', 'modify', 'delete']),
    summary: z.string(),
    diff: z.string().optional(),
  })).optional(),
});

export type StepOutput = z.infer<typeof StepOutput>;

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Step execution function signature
 */
export type StepExecutor = (input: StepInput) => Promise<StepOutput>;

/**
 * Step definition for registration
 */
export interface StepDefinition {
  /** Step type name */
  type: StepInput['stepType'];

  /** Human-readable description */
  description: string;

  /** Step executor function */
  execute: StepExecutor;

  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;

  /** Whether this step supports retries */
  supportsRetry: boolean;

  /** Maximum retry attempts (if supportsRetry) */
  maxRetries?: number;
}
