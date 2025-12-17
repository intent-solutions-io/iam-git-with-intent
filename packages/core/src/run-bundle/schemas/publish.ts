/**
 * Publish Result Schema
 *
 * Schema for publish/apply step output.
 * This is the final step that commits, pushes, or creates a PR.
 */

import { z } from 'zod';
import { ConfidenceScore } from './common.js';

// =============================================================================
// Publish Action Types
// =============================================================================

/**
 * Types of publish actions
 */
export const PublishAction = z.enum([
  'commit',      // Local commit only
  'push',        // Push to remote
  'create_pr',   // Create a new PR
  'update_pr',   // Update existing PR
  'comment',     // Post comment only (no code changes)
]);

export type PublishAction = z.infer<typeof PublishAction>;

/**
 * Status of the publish action
 */
export const PublishStatus = z.enum([
  'success',     // Action completed successfully
  'partial',     // Some actions completed, others failed
  'failed',      // Action failed
  'skipped',     // Action was skipped (e.g., no changes to push)
  'pending',     // Action is pending approval
]);

export type PublishStatus = z.infer<typeof PublishStatus>;

// =============================================================================
// Publish Details
// =============================================================================

/**
 * Git commit details
 */
export const CommitDetails = z.object({
  sha: z.string().optional(),
  message: z.string(),
  author: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export type CommitDetails = z.infer<typeof CommitDetails>;

/**
 * Push details
 */
export const PushDetails = z.object({
  branch: z.string(),
  remote: z.string().default('origin'),
  commitsPushed: z.number().int().nonnegative(),
  beforeSha: z.string().optional(),
  afterSha: z.string().optional(),
});

export type PushDetails = z.infer<typeof PushDetails>;

/**
 * PR creation/update details
 */
export const PrDetails = z.object({
  number: z.number().int().positive().optional(), // Only set if PR exists/created
  url: z.string().url().optional(),
  title: z.string(),
  body: z.string().optional(),
  baseBranch: z.string(),
  headBranch: z.string(),
  isDraft: z.boolean().default(false),
  labels: z.array(z.string()).default([]),
  reviewers: z.array(z.string()).default([]),
});

export type PrDetails = z.infer<typeof PrDetails>;

/**
 * Comment posted
 */
export const CommentDetails = z.object({
  id: z.string().optional(),
  url: z.string().url().optional(),
  body: z.string(),
  target: z.enum(['pr', 'issue', 'commit']),
});

export type CommentDetails = z.infer<typeof CommentDetails>;

// =============================================================================
// Publish Result
// =============================================================================

/**
 * Complete publish result
 */
export const PublishResult = z.object({
  // Versioning
  version: z.literal(1),
  timestamp: z.string().datetime(),

  // Overall status
  action: PublishAction,
  status: PublishStatus,
  confidence: ConfidenceScore,

  // Summary
  summary: z.string(),

  // Action-specific details (only one will be present based on action type)
  commit: CommitDetails.optional(),
  push: PushDetails.optional(),
  pr: PrDetails.optional(),
  comment: CommentDetails.optional(),

  // Patch info (if code changes were applied)
  patchHash: z.string().optional(), // sha256 of applied patch
  patchFile: z.string().optional(), // path to patch file

  // Approval binding
  approvalId: z.string().uuid().optional(), // ID of the approval that authorized this
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),

  // Error details (if failed)
  error: z.string().optional(),
  errorDetails: z.unknown().optional(),

  // Next steps
  requiresManualAction: z.boolean().default(false),
  manualActionReason: z.string().optional(),
  suggestedNextSteps: z.array(z.string()).default([]),
});

export type PublishResult = z.infer<typeof PublishResult>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a publish result
 */
export function validatePublishResult(data: unknown): { valid: boolean; errors?: z.ZodError } {
  const result = PublishResult.safeParse(data);
  if (result.success) {
    return { valid: true };
  }
  return { valid: false, errors: result.error };
}

/**
 * Parse and validate a publish result (throws on invalid)
 */
export function parsePublishResult(data: unknown): PublishResult {
  return PublishResult.parse(data);
}
