/**
 * Run Bundle Types
 *
 * Type definitions for the run artifact bundle system.
 * These types define the structure of run artifacts stored in .gwi/runs/<runId>/.
 */

import { z } from 'zod';

// =============================================================================
// Run State Machine
// =============================================================================

/**
 * Run states in the workflow state machine.
 *
 * State transitions:
 *   queued → triaged → planned → resolving → review → awaiting_approval → applying → done
 *                                                                       ↘ aborted
 *                                                                       ↘ failed
 */
export const RunState = z.enum([
  'queued',            // Initial state, waiting to be processed
  'triaged',           // Triage complete, complexity scored
  'planned',           // Plan generated
  'resolving',         // Resolution in progress
  'review',            // Under review
  'awaiting_approval', // Waiting for human approval
  'applying',          // Applying changes (with approval)
  'done',              // Successfully completed
  'aborted',           // User aborted
  'failed',            // Failed with error
]);

export type RunState = z.infer<typeof RunState>;

/**
 * Valid state transitions
 */
export const STATE_TRANSITIONS: Record<RunState, RunState[]> = {
  queued: ['triaged', 'failed', 'aborted'],
  triaged: ['planned', 'failed', 'aborted'],
  planned: ['resolving', 'review', 'failed', 'aborted'], // Can skip to review if no resolution needed
  resolving: ['review', 'failed', 'aborted'],
  review: ['awaiting_approval', 'done', 'failed', 'aborted'], // Can skip approval if comment-only
  awaiting_approval: ['applying', 'aborted', 'failed'],
  applying: ['done', 'failed'],
  done: [],    // Terminal state
  aborted: [], // Terminal state
  failed: [],  // Terminal state
};

// =============================================================================
// Capabilities Mode
// =============================================================================

/**
 * What actions the run is permitted to take
 */
export const CapabilitiesMode = z.enum([
  'comment-only',          // Can only post comments, no code changes
  'patch-only',            // Can generate patch.diff but cannot apply
  'commit-after-approval', // Can commit/push after explicit approval
]);

export type CapabilitiesMode = z.infer<typeof CapabilitiesMode>;

// =============================================================================
// Run Context (run.json)
// =============================================================================

/**
 * Model configuration summary for the run
 */
export const ModelConfigSummary = z.object({
  triage: z.string(),    // e.g., "gemini-2.0-flash-exp"
  resolver: z.string(),  // e.g., "claude-sonnet-4-20250514"
  reviewer: z.string(),  // e.g., "claude-sonnet-4-20250514"
  coder: z.string().optional(), // For issue-to-code workflows
});

export type ModelConfigSummary = z.infer<typeof ModelConfigSummary>;

/**
 * Repository information
 */
export const RepoInfo = z.object({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(), // owner/name
});

export type RepoInfo = z.infer<typeof RepoInfo>;

/**
 * Run context stored in run.json
 */
export const RunContext = z.object({
  // Identifiers
  runId: z.string().uuid(),
  version: z.literal(1), // Schema version

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  // Repository
  repo: RepoInfo,
  prUrl: z.string().url().optional(),
  issueUrl: z.string().url().optional(),
  baseRef: z.string().optional(),
  headRef: z.string().optional(),

  // Initiator
  initiator: z.string(), // User or system that started the run

  // Configuration
  models: ModelConfigSummary,
  capabilitiesMode: CapabilitiesMode,

  // State
  state: RunState,
  previousStates: z.array(z.object({
    state: RunState,
    timestamp: z.string().datetime(),
  })),

  // Error info (if failed)
  error: z.string().optional(),
  errorDetails: z.unknown().optional(),
});

export type RunContext = z.infer<typeof RunContext>;

// =============================================================================
// Audit Log
// =============================================================================

/**
 * Actor types for audit events
 */
export const AuditActor = z.enum([
  'system',     // GWI system
  'user',       // Human user
  'agent',      // AI agent
  'tool',       // External tool
]);

export type AuditActor = z.infer<typeof AuditActor>;

/**
 * Audit log entry (one per line in audit.log, JSON Lines format)
 */
export const AuditEntry = z.object({
  timestamp: z.string().datetime(),
  runId: z.string().uuid(),
  actor: AuditActor,
  actorId: z.string().optional(), // e.g., "triage-agent", "user@example.com"
  action: z.string(),             // e.g., "state_transition", "artifact_written", "approval_granted"
  details: z.record(z.unknown()).optional(),
});

export type AuditEntry = z.infer<typeof AuditEntry>;

// =============================================================================
// Approval Record
// =============================================================================

/**
 * Approval scope - what actions are approved
 */
export const ApprovalScope = z.enum([
  'commit',       // Can commit changes
  'push',         // Can push to remote
  'open_pr',      // Can open/update PR
  'merge',        // Can merge PR
]);

export type ApprovalScope = z.infer<typeof ApprovalScope>;

/**
 * Approval record stored in approval.json
 */
export const ApprovalRecord = z.object({
  runId: z.string().uuid(),
  approvedAt: z.string().datetime(),
  approvedBy: z.string(),
  scope: z.array(ApprovalScope),
  patchHash: z.string(), // sha256 hash of patch.diff
  comment: z.string().optional(),
});

export type ApprovalRecord = z.infer<typeof ApprovalRecord>;

// =============================================================================
// Artifact Names
// =============================================================================

/**
 * Standard artifact file names
 */
export const ARTIFACT_NAMES = {
  RUN_CONTEXT: 'run.json',
  TRIAGE: 'triage.json',
  PLAN_MD: 'plan.md',
  PLAN_JSON: 'plan.json',
  PATCH: 'patch.diff',
  RESOLVE: 'resolve.json',
  REVIEW: 'review.json',
  APPROVAL: 'approval.json',
  AUDIT_LOG: 'audit.log',
} as const;

export type ArtifactName = typeof ARTIFACT_NAMES[keyof typeof ARTIFACT_NAMES];
