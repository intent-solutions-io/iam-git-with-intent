/**
 * GitHub Capabilities Types
 *
 * Defines types for capability-based access control on GitHub operations.
 */

import { z } from 'zod';
import { ApprovalScope, ApprovalRecord } from '../run-bundle/types.js';

// =============================================================================
// Operation Types
// =============================================================================

/**
 * Operation that requires approval
 */
export const GatedOperation = z.enum([
  'git_commit',      // Create a commit
  'git_push',        // Push to remote
  'pr_create',       // Create a new PR
  'pr_update',       // Update/push to PR branch
  'pr_merge',        // Merge a PR
  'branch_delete',   // Delete a branch
  'file_write',      // Write a file to repo
]);

export type GatedOperation = z.infer<typeof GatedOperation>;

/**
 * Maps gated operations to required approval scopes
 */
export const OPERATION_SCOPE_MAP: Record<GatedOperation, ApprovalScope> = {
  git_commit: 'commit',
  git_push: 'push',
  pr_create: 'open_pr',
  pr_update: 'push',
  pr_merge: 'merge',
  branch_delete: 'push',
  file_write: 'commit',
};

// =============================================================================
// Capability Request
// =============================================================================

/**
 * Request to perform a gated operation
 */
export const OperationRequest = z.object({
  runId: z.string().uuid(),
  operation: GatedOperation,
  targetRepo: z.object({
    owner: z.string(),
    name: z.string(),
  }),
  targetRef: z.string().optional(),    // branch name
  patchHash: z.string().optional(),    // sha256 of patch.diff if applicable
  description: z.string(),             // human-readable description
});

export type OperationRequest = z.infer<typeof OperationRequest>;

// =============================================================================
// Capability Response
// =============================================================================

/**
 * Approval check result
 */
export const ApprovalCheckResult = z.object({
  approved: z.boolean(),
  reason: z.string(),
  approval: ApprovalRecord.optional(),
});

export type ApprovalCheckResult = z.infer<typeof ApprovalCheckResult>;

/**
 * Denial reasons
 */
export const DENIAL_REASONS = {
  NO_APPROVAL: 'No approval record found for this run',
  SCOPE_MISSING: 'Approval does not include required scope',
  PATCH_MISMATCH: 'Patch hash does not match approval',
  APPROVAL_EXPIRED: 'Approval has expired',
  RUN_ID_MISMATCH: 'Approval is for a different run',
} as const;

// =============================================================================
// Safe vs Gated Operations
// =============================================================================

/**
 * Operations that do NOT require approval (read-only)
 */
export const SafeOperation = z.enum([
  'pr_read',         // Read PR metadata
  'pr_diff',         // Get PR diff
  'issue_read',      // Read issue metadata
  'file_read',       // Read file contents
  'comment_read',    // Read comments
  'branch_list',     // List branches
  'commit_read',     // Read commit info
]);

export type SafeOperation = z.infer<typeof SafeOperation>;

// =============================================================================
// Capabilities Mode Configuration
// =============================================================================

/**
 * Which operations are allowed in each capabilities mode
 */
export const MODE_CAPABILITIES: Record<
  'comment-only' | 'patch-only' | 'commit-after-approval',
  {
    allowed: GatedOperation[];
    requiresApproval: GatedOperation[];
  }
> = {
  'comment-only': {
    allowed: [],
    requiresApproval: [],
  },
  'patch-only': {
    allowed: [],
    requiresApproval: [],
  },
  'commit-after-approval': {
    allowed: ['git_commit', 'git_push', 'pr_create', 'pr_update', 'file_write'],
    requiresApproval: ['git_commit', 'git_push', 'pr_create', 'pr_update', 'file_write'],
  },
};
