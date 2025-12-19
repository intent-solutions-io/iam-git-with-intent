/**
 * Idempotency Layer Types
 *
 * A4.s1: Defines idempotency key schemes for all event sources.
 *
 * Event sources:
 * - GitHub webhooks (PR, issue, comment events)
 * - API calls (direct CLI/UI invocations)
 * - Slack commands (slash commands from Slack)
 * - Scheduler (cron-triggered events)
 *
 * @module @gwi/engine/idempotency
 */

import { z } from 'zod';

// =============================================================================
// Event Sources
// =============================================================================

/**
 * Event source types
 */
export const EventSource = z.enum([
  'github_webhook',
  'api',
  'slack',
  'scheduler',
]);
export type EventSource = z.infer<typeof EventSource>;

// =============================================================================
// Idempotency Key Schemes
// =============================================================================

/**
 * GitHub webhook idempotency key components
 *
 * Format: github:{delivery_id}
 * Example: github:12345678-1234-1234-1234-123456789012
 *
 * The X-GitHub-Delivery header provides a unique ID per webhook delivery.
 * This guarantees idempotency even for retried webhooks.
 */
export const GitHubIdempotencyKey = z.object({
  source: z.literal('github_webhook'),
  deliveryId: z.string().uuid(),
});
export type GitHubIdempotencyKey = z.infer<typeof GitHubIdempotencyKey>;

/**
 * API call idempotency key components
 *
 * Format: api:{client_id}:{request_id}
 * Example: api:cli-abc123:req-550e8400-e29b-41d4-a716-446655440000
 *
 * Client provides a unique request ID via X-Request-ID or X-Idempotency-Key header.
 * Combined with client ID to prevent cross-client collisions.
 */
export const ApiIdempotencyKey = z.object({
  source: z.literal('api'),
  clientId: z.string().min(1),
  requestId: z.string().min(1),
});
export type ApiIdempotencyKey = z.infer<typeof ApiIdempotencyKey>;

/**
 * Slack command idempotency key components
 *
 * Format: slack:{team_id}:{trigger_id}
 * Example: slack:T12345678:1234567890.123456
 *
 * Slack's trigger_id is unique per interaction (valid for 30 mins).
 * Combined with team_id for cross-workspace isolation.
 */
export const SlackIdempotencyKey = z.object({
  source: z.literal('slack'),
  teamId: z.string().min(1),
  triggerId: z.string().min(1),
});
export type SlackIdempotencyKey = z.infer<typeof SlackIdempotencyKey>;

/**
 * Scheduler idempotency key components
 *
 * Format: scheduler:{schedule_id}:{execution_time}
 * Example: scheduler:daily-cleanup:2024-12-19T00:00:00Z
 *
 * Schedule ID + execution time ensures each scheduled run is unique.
 * Execution time is truncated to the schedule granularity (e.g., minute, hour).
 */
export const SchedulerIdempotencyKey = z.object({
  source: z.literal('scheduler'),
  scheduleId: z.string().min(1),
  executionTime: z.string().datetime(),
});
export type SchedulerIdempotencyKey = z.infer<typeof SchedulerIdempotencyKey>;

/**
 * Union of all idempotency key types
 */
export const IdempotencyKeyInput = z.discriminatedUnion('source', [
  GitHubIdempotencyKey,
  ApiIdempotencyKey,
  SlackIdempotencyKey,
  SchedulerIdempotencyKey,
]);
export type IdempotencyKeyInput = z.infer<typeof IdempotencyKeyInput>;

// =============================================================================
// Idempotency Record
// =============================================================================

/**
 * Status of an idempotency record
 */
export const IdempotencyStatus = z.enum([
  'processing', // Request is currently being processed
  'completed',  // Request completed successfully
  'failed',     // Request failed (may be retried)
]);
export type IdempotencyStatus = z.infer<typeof IdempotencyStatus>;

/**
 * Idempotency record stored in Firestore
 *
 * Stored in: gwi_idempotency/{key}
 */
export const IdempotencyRecord = z.object({
  /** Composite idempotency key (e.g., github:12345-abcd) */
  key: z.string().min(1),

  /** Event source type */
  source: EventSource,

  /** Tenant ID for the request */
  tenantId: z.string().min(1),

  /** Run ID created for this request (if any) */
  runId: z.string().optional(),

  /** Current status */
  status: IdempotencyStatus,

  /** Original request payload (for debugging) */
  requestHash: z.string().min(1),

  /** Response to return for duplicate requests */
  response: z.unknown().optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Created timestamp */
  createdAt: z.date(),

  /** Last updated timestamp */
  updatedAt: z.date(),

  /** Expiration timestamp (for TTL) */
  expiresAt: z.date(),

  /** Processing lock expiration (for distributed locking) */
  lockExpiresAt: z.date().optional(),

  /** Processing attempts */
  attempts: z.number().int().min(0).default(0),
});
export type IdempotencyRecord = z.infer<typeof IdempotencyRecord>;

// =============================================================================
// Check-and-Set Result
// =============================================================================

/**
 * Result of idempotency check
 */
export const IdempotencyCheckResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('new'),
    /** Key was new - caller should proceed with processing */
    key: z.string(),
  }),
  z.object({
    status: z.literal('duplicate'),
    /** Key already exists - return cached response */
    key: z.string(),
    record: IdempotencyRecord,
  }),
  z.object({
    status: z.literal('processing'),
    /** Key exists but is still processing - wait or return accepted */
    key: z.string(),
    record: IdempotencyRecord,
  }),
]);
export type IdempotencyCheckResult = z.infer<typeof IdempotencyCheckResult>;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Idempotency layer configuration
 */
export interface IdempotencyConfig {
  /** TTL for completed records (default: 24 hours) */
  completedTtlMs: number;

  /** TTL for failed records (default: 1 hour, allows retry) */
  failedTtlMs: number;

  /** Lock timeout for processing records (default: 5 minutes) */
  lockTimeoutMs: number;

  /** Max attempts before giving up (default: 3) */
  maxAttempts: number;

  /** Enable observability counters */
  enableMetrics: boolean;
}

export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyConfig = {
  completedTtlMs: 24 * 60 * 60 * 1000,  // 24 hours
  failedTtlMs: 60 * 60 * 1000,           // 1 hour
  lockTimeoutMs: 5 * 60 * 1000,          // 5 minutes
  maxAttempts: 3,
  enableMetrics: true,
};

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a composite idempotency key string from components
 */
export function generateIdempotencyKey(input: IdempotencyKeyInput): string {
  switch (input.source) {
    case 'github_webhook':
      return `github:${input.deliveryId}`;

    case 'api':
      return `api:${input.clientId}:${input.requestId}`;

    case 'slack':
      return `slack:${input.teamId}:${input.triggerId}`;

    case 'scheduler':
      return `scheduler:${input.scheduleId}:${input.executionTime}`;
  }
}

/**
 * Parse a composite idempotency key string back to components
 */
export function parseIdempotencyKey(key: string): IdempotencyKeyInput | null {
  const parts = key.split(':');
  if (parts.length < 2) return null;

  const source = parts[0];

  switch (source) {
    case 'github':
      if (parts.length !== 2) return null;
      const deliveryId = parts[1];
      const githubResult = GitHubIdempotencyKey.safeParse({
        source: 'github_webhook',
        deliveryId,
      });
      return githubResult.success ? githubResult.data : null;

    case 'api':
      if (parts.length !== 3) return null;
      const apiResult = ApiIdempotencyKey.safeParse({
        source: 'api',
        clientId: parts[1],
        requestId: parts[2],
      });
      return apiResult.success ? apiResult.data : null;

    case 'slack':
      if (parts.length !== 3) return null;
      const slackResult = SlackIdempotencyKey.safeParse({
        source: 'slack',
        teamId: parts[1],
        triggerId: parts[2],
      });
      return slackResult.success ? slackResult.data : null;

    case 'scheduler':
      if (parts.length !== 3) return null;
      const schedulerResult = SchedulerIdempotencyKey.safeParse({
        source: 'scheduler',
        scheduleId: parts[1],
        executionTime: parts[2],
      });
      return schedulerResult.success ? schedulerResult.data : null;

    default:
      return null;
  }
}

/**
 * Hash a request payload for comparison
 */
export function hashRequestPayload(payload: unknown): string {
  const str = JSON.stringify(payload, Object.keys(payload as object).sort());
  // Simple djb2 hash - fast and good enough for comparison
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}
