/**
 * Job Envelope Schema for Queue Messages
 *
 * Epic A5: Worker Infrastructure - Job envelope schema for Pub/Sub queue messages.
 *
 * Features:
 * - Full Zod validation for job envelopes
 * - Type-safe job payloads with discriminated unions
 * - Retry tracking and distributed tracing support
 * - Priority and scheduling controls
 * - Idempotency key support
 *
 * @module @gwi/core/queue/job-envelope
 */

import { z } from 'zod';

// =============================================================================
// Core Job Identification
// =============================================================================

/**
 * Job priority levels
 */
export const JobPriority = z.enum(['high', 'normal', 'low']);
export type JobPriority = z.infer<typeof JobPriority>;

/**
 * Job types (extensible enum)
 */
export const JobType = z.enum([
  'run.start',         // Start a new run
  'run.resume',        // Resume a paused run
  'step.execute',      // Execute a specific step
  'step.retry',        // Retry a failed step
  'cleanup.run',       // Cleanup after run completion
  'notification.send', // Send notifications
]);
export type JobType = z.infer<typeof JobType>;

/**
 * Previous attempt record for retry tracking
 */
export const PreviousAttempt = z.object({
  attempt: z.number().int().min(1),
  error: z.string(),
  timestamp: z.string().datetime(),
});
export type PreviousAttempt = z.infer<typeof PreviousAttempt>;

// =============================================================================
// Job Envelope
// =============================================================================

/**
 * Core job envelope schema
 *
 * This is the base schema for all queue messages. Each job type should have
 * a specific payload schema that extends this base.
 */
export const JobEnvelope = z.object({
  // Identification
  jobId: z.string().min(1).describe('Unique job ID (UUID)'),
  tenantId: z.string().min(1).describe('Tenant owning this job'),
  runId: z.string().min(1).describe('Associated run'),
  stepId: z.string().min(1).optional().describe('Associated step (if step-level job)'),

  // Execution context
  attempt: z.number().int().min(1).describe('Current attempt (1-based)'),
  maxRetries: z.number().int().min(0).describe('Max retry attempts'),
  traceId: z.string().min(1).describe('Distributed tracing ID'),
  spanId: z.string().min(1).optional().describe('Current span ID'),

  // Scheduling
  priority: JobPriority.default('normal').describe('Job priority'),
  orderingKey: z.string().optional().describe('For ordered processing (e.g., per-run)'),
  deadline: z.string().datetime().optional().describe('ISO timestamp for absolute deadline'),
  delayUntil: z.string().datetime().optional().describe('ISO timestamp for delayed execution'),

  // Payload
  type: JobType.describe('Job type'),
  payload: z.unknown().describe('Type-specific payload'),

  // Metadata
  createdAt: z.string().datetime().describe('ISO timestamp'),
  source: z.string().min(1).describe('What created this job (webhook, api, scheduler)'),
  idempotencyKey: z.string().optional().describe('For deduplication'),

  // Retry context (set on retries)
  previousAttempts: z.array(PreviousAttempt).optional().describe('History of previous attempts'),
});

export type JobEnvelope = z.infer<typeof JobEnvelope>;

// =============================================================================
// Job Payload Schemas
// =============================================================================

/**
 * Payload for run.start jobs
 */
export const RunStartPayload = z.object({
  prUrl: z.string().url().describe('GitHub PR URL'),
  initiatedBy: z.string().describe('User ID who initiated'),
  config: z.record(z.unknown()).optional().describe('Optional run configuration'),
});
export type RunStartPayload = z.infer<typeof RunStartPayload>;

/**
 * Payload for run.resume jobs
 */
export const RunResumePayload = z.object({
  fromStepId: z.string().optional().describe('Step to resume from'),
  reason: z.string().optional().describe('Reason for resume'),
});
export type RunResumePayload = z.infer<typeof RunResumePayload>;

/**
 * Payload for step.execute jobs
 */
export const StepExecutePayload = z.object({
  agentId: z.string().describe('Agent to execute'),
  input: z.record(z.unknown()).describe('Step input data'),
  dependencies: z.array(z.string()).optional().describe('Step IDs this depends on'),
});
export type StepExecutePayload = z.infer<typeof StepExecutePayload>;

/**
 * Payload for step.retry jobs
 */
export const StepRetryPayload = z.object({
  originalError: z.string().describe('Original error that triggered retry'),
  retryStrategy: z.enum(['immediate', 'exponential', 'manual']).optional(),
});
export type StepRetryPayload = z.infer<typeof StepRetryPayload>;

/**
 * Payload for cleanup.run jobs
 */
export const CleanupRunPayload = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']).describe('Final run status'),
  artifacts: z.array(z.string()).optional().describe('Artifact IDs to clean up'),
  retainLogs: z.boolean().default(true).describe('Whether to retain logs'),
});
export type CleanupRunPayload = z.infer<typeof CleanupRunPayload>;

/**
 * Payload for notification.send jobs
 */
export const NotificationSendPayload = z.object({
  recipientId: z.string().describe('User ID to notify'),
  channel: z.enum(['email', 'slack', 'webhook']).describe('Notification channel'),
  template: z.string().describe('Notification template ID'),
  data: z.record(z.unknown()).describe('Template data'),
});
export type NotificationSendPayload = z.infer<typeof NotificationSendPayload>;

// =============================================================================
// Discriminated Union for Type-Safe Payloads
// =============================================================================

/**
 * Run start job envelope with typed payload
 */
export const RunStartJob = JobEnvelope.extend({
  type: z.literal('run.start'),
  payload: RunStartPayload,
});
export type RunStartJob = z.infer<typeof RunStartJob>;

/**
 * Run resume job envelope with typed payload
 */
export const RunResumeJob = JobEnvelope.extend({
  type: z.literal('run.resume'),
  payload: RunResumePayload,
});
export type RunResumeJob = z.infer<typeof RunResumeJob>;

/**
 * Step execute job envelope with typed payload
 */
export const StepExecuteJob = JobEnvelope.extend({
  type: z.literal('step.execute'),
  payload: StepExecutePayload,
});
export type StepExecuteJob = z.infer<typeof StepExecuteJob>;

/**
 * Step retry job envelope with typed payload
 */
export const StepRetryJob = JobEnvelope.extend({
  type: z.literal('step.retry'),
  payload: StepRetryPayload,
});
export type StepRetryJob = z.infer<typeof StepRetryJob>;

/**
 * Cleanup run job envelope with typed payload
 */
export const CleanupRunJob = JobEnvelope.extend({
  type: z.literal('cleanup.run'),
  payload: CleanupRunPayload,
});
export type CleanupRunJob = z.infer<typeof CleanupRunJob>;

/**
 * Notification send job envelope with typed payload
 */
export const NotificationSendJob = JobEnvelope.extend({
  type: z.literal('notification.send'),
  payload: NotificationSendPayload,
});
export type NotificationSendJob = z.infer<typeof NotificationSendJob>;

/**
 * Discriminated union of all job types
 */
export const TypedJobEnvelope = z.discriminatedUnion('type', [
  RunStartJob,
  RunResumeJob,
  StepExecuteJob,
  StepRetryJob,
  CleanupRunJob,
  NotificationSendJob,
]);
export type TypedJobEnvelope = z.infer<typeof TypedJobEnvelope>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a job envelope with proper defaults
 */
export function createJobEnvelope(params: {
  jobId: string;
  tenantId: string;
  runId: string;
  stepId?: string;
  type: JobType;
  payload: unknown;
  traceId: string;
  spanId?: string;
  source: string;
  priority?: JobPriority;
  orderingKey?: string;
  deadline?: string;
  delayUntil?: string;
  idempotencyKey?: string;
}): JobEnvelope {
  return {
    jobId: params.jobId,
    tenantId: params.tenantId,
    runId: params.runId,
    stepId: params.stepId,
    attempt: 1,
    maxRetries: 3, // Default to 3 retries
    traceId: params.traceId,
    spanId: params.spanId,
    priority: params.priority ?? 'normal',
    orderingKey: params.orderingKey,
    deadline: params.deadline,
    delayUntil: params.delayUntil,
    type: params.type,
    payload: params.payload,
    createdAt: new Date().toISOString(),
    source: params.source,
    idempotencyKey: params.idempotencyKey,
  };
}

/**
 * Parse a job envelope from unknown data (e.g., from Pub/Sub message)
 *
 * @throws {z.ZodError} If validation fails
 */
export function parseJobEnvelope(data: unknown): JobEnvelope {
  return JobEnvelope.parse(data);
}

/**
 * Validate a job envelope without throwing
 *
 * @returns Validation result with parsed data or errors
 */
export function validateJobEnvelope(
  data: unknown
): { success: true; data: JobEnvelope } | { success: false; error: z.ZodError } {
  const result = JobEnvelope.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Parse a typed job envelope (discriminated union)
 *
 * This provides type-safe access to payload based on job type.
 *
 * @throws {z.ZodError} If validation fails
 */
export function parseTypedJobEnvelope(data: unknown): TypedJobEnvelope {
  return TypedJobEnvelope.parse(data);
}

/**
 * Validate a typed job envelope without throwing
 */
export function validateTypedJobEnvelope(
  data: unknown
): { success: true; data: TypedJobEnvelope } | { success: false; error: z.ZodError } {
  const result = TypedJobEnvelope.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Create a retry attempt record
 */
export function createPreviousAttempt(attempt: number, error: string): PreviousAttempt {
  return {
    attempt,
    error,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Add a retry attempt to a job envelope
 */
export function addRetryAttempt(
  envelope: JobEnvelope,
  error: string
): JobEnvelope {
  const previousAttempts = envelope.previousAttempts || [];
  return {
    ...envelope,
    attempt: envelope.attempt + 1,
    previousAttempts: [
      ...previousAttempts,
      createPreviousAttempt(envelope.attempt, error),
    ],
  };
}

/**
 * Check if job has exceeded max retries
 */
export function isRetryExceeded(envelope: JobEnvelope): boolean {
  return envelope.attempt > envelope.maxRetries;
}

/**
 * Check if job has a deadline and if it's expired
 */
export function isDeadlineExpired(envelope: JobEnvelope): boolean {
  if (!envelope.deadline) return false;
  return new Date(envelope.deadline) < new Date();
}

/**
 * Check if job should be delayed
 */
export function shouldDelay(envelope: JobEnvelope): boolean {
  if (!envelope.delayUntil) return false;
  return new Date(envelope.delayUntil) > new Date();
}

/**
 * Get remaining delay in milliseconds
 */
export function getRemainingDelay(envelope: JobEnvelope): number {
  if (!envelope.delayUntil) return 0;
  const delay = new Date(envelope.delayUntil).getTime() - Date.now();
  return Math.max(0, delay);
}
