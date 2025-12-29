/**
 * Step State Types
 *
 * C2: Types for persistent step state management.
 * Designed for Cloud Run resilience - step state survives restarts.
 *
 * @module @gwi/engine/state/types
 */

import { z } from 'zod';

// =============================================================================
// Step State Schema
// =============================================================================

/**
 * Step execution status (aligned with @gwi/core StepStatus)
 */
export const StepStateStatus = z.enum([
  'pending',    // Not yet started
  'running',    // Currently executing
  'blocked',    // Waiting for approval gate (C3)
  'waiting',    // Waiting for external event (C3)
  'completed',  // Finished successfully
  'failed',     // Failed with error
  'skipped',    // Skipped (condition not met)
]);

export type StepStateStatus = z.infer<typeof StepStateStatus>;

/**
 * Result code for step execution (state module variant)
 *
 * Note: This is similar to StepResultCode in step-contract but includes
 * additional codes for the state module. Use StateStepResultCode to avoid
 * conflicts.
 */
export const StateStepResultCode = z.enum([
  'ok',         // Step completed successfully
  'retryable',  // Step failed but can retry
  'fatal',      // Step failed, no retry
  'blocked',    // Step waiting for approval
  'skipped',    // Step was skipped
  'cancelled',  // Step was cancelled
]);

export type StateStepResultCode = z.infer<typeof StateStepResultCode>;

/**
 * Approval gate state (C3)
 */
export const ApprovalState = z.object({
  /** Whether approval is required for this step */
  required: z.boolean(),
  /** Current approval status */
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  /** User who approved/rejected */
  userId: z.string().optional(),
  /** When approval was granted/rejected */
  timestamp: z.string().datetime().optional(),
  /** Approval/rejection reason */
  reason: z.string().optional(),
  /** SHA256 hash of approved content */
  contentHash: z.string().optional(),
});

export type ApprovalState = z.infer<typeof ApprovalState>;

/**
 * External wait state (C3)
 */
export const ExternalWaitState = z.object({
  /** Type of external event being waited for */
  eventType: z.string(),
  /** Event filter/identifier */
  eventId: z.string().optional(),
  /** When the wait started */
  startedAt: z.string().datetime(),
  /** Timeout for waiting */
  timeoutMs: z.number().int().positive().optional(),
  /** Whether the event was received */
  received: z.boolean().default(false),
  /** Event payload when received */
  payload: z.unknown().optional(),
});

export type ExternalWaitState = z.infer<typeof ExternalWaitState>;

/**
 * Retry state for step execution
 */
export const RetryState = z.object({
  /** Current attempt number (0-indexed) */
  attempt: z.number().int().nonnegative(),
  /** Maximum attempts allowed */
  maxAttempts: z.number().int().positive(),
  /** When next retry is scheduled (if retrying) */
  nextRetryAt: z.string().datetime().optional(),
  /** History of previous attempt errors */
  errors: z.array(z.object({
    attempt: z.number(),
    error: z.string(),
    timestamp: z.string().datetime(),
  })).default([]),
});

export type RetryState = z.infer<typeof RetryState>;

/**
 * Complete step state record
 */
export const StepState = z.object({
  /** Unique step state ID */
  id: z.string().uuid(),

  /** Run ID this step belongs to */
  runId: z.string().uuid(),

  /** Workflow instance ID */
  workflowInstanceId: z.string().uuid().optional(),

  /** Step ID from workflow definition */
  stepId: z.string(),

  /** Step type (for quick filtering) */
  stepType: z.string(),

  /** Tenant ID for multi-tenant isolation */
  tenantId: z.string(),

  /** Current execution status */
  status: StepStateStatus,

  /** Result code (set when step completes) */
  resultCode: StateStepResultCode.optional(),

  /** Step input (parameters passed to step) */
  input: z.unknown().optional(),

  /** Step output (result from step execution) */
  output: z.unknown().optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Error stack trace if available */
  errorStack: z.string().optional(),

  /** Retry state */
  retry: RetryState.optional(),

  /** Approval gate state (C3) */
  approval: ApprovalState.optional(),

  /** External wait state (C3) */
  externalWait: ExternalWaitState.optional(),

  /** When the step was created */
  createdAt: z.string().datetime(),

  /** When the step started executing */
  startedAt: z.string().datetime().optional(),

  /** When the step completed */
  completedAt: z.string().datetime().optional(),

  /** Last update timestamp */
  updatedAt: z.string().datetime(),

  /** Duration in milliseconds (if completed) */
  durationMs: z.number().int().nonnegative().optional(),

  /** Token usage for AI-powered steps */
  tokenUsage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }).optional(),

  /** Model used for AI-powered steps */
  model: z.string().optional(),

  /** Correlation ID for tracing */
  correlationId: z.string().optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type StepState = z.infer<typeof StepState>;

/**
 * Step state creation input (omitting auto-generated fields)
 */
export const StepStateCreate = StepState.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  status: true,
  resultCode: true,
});

export type StepStateCreate = z.infer<typeof StepStateCreate>;

/**
 * Step state update input
 */
export const StepStateUpdate = StepState.partial().omit({
  id: true,
  runId: true,
  stepId: true,
  tenantId: true,
  createdAt: true,
});

export type StepStateUpdate = z.infer<typeof StepStateUpdate>;

// =============================================================================
// Query Types
// =============================================================================

/**
 * Filter for querying step states
 */
export interface StepStateFilter {
  /** Filter by run ID */
  runId?: string;
  /** Filter by step IDs */
  stepIds?: string[];
  /** Filter by status */
  status?: StepStateStatus | StepStateStatus[];
  /** Filter by step type */
  stepType?: string | string[];
  /** Filter by tenant ID */
  tenantId?: string;
  /** Include only steps requiring approval */
  requiresApproval?: boolean;
  /** Include only steps waiting for external event */
  waitingExternal?: boolean;
}

/**
 * Sort options for step state queries
 */
export interface StepStateSort {
  field: 'createdAt' | 'startedAt' | 'updatedAt' | 'stepId';
  direction: 'asc' | 'desc';
}

/**
 * Pagination options
 */
export interface StepStatePagination {
  limit?: number;
  offset?: number;
  cursor?: string;
}

// =============================================================================
// Helper Constants
// =============================================================================

/**
 * Terminal step statuses (no further transitions)
 */
export const TERMINAL_STEP_STATUSES: ReadonlySet<StepStateStatus> = new Set([
  'completed',
  'failed',
  'skipped',
]);

/**
 * Active step statuses (currently executing or waiting)
 */
export const ACTIVE_STEP_STATUSES: ReadonlySet<StepStateStatus> = new Set([
  'running',
  'blocked',
  'waiting',
]);

/**
 * Check if a status is terminal
 */
export function isTerminalStepStatus(status: StepStateStatus): boolean {
  return TERMINAL_STEP_STATUSES.has(status);
}

/**
 * Check if a status is active
 */
export function isActiveStepStatus(status: StepStateStatus): boolean {
  return ACTIVE_STEP_STATUSES.has(status);
}
