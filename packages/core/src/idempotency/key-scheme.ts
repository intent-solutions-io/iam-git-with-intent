/**
 * Idempotency Key Scheme
 *
 * A4.s1: Defines idempotency key schemes for all event sources.
 *
 * Event sources:
 * - GitHub webhooks (PR, issue, comment events) - Uses X-GitHub-Delivery header
 * - API requests (CLI/UI invocations) - Uses X-Request-ID or X-Idempotency-Key header
 * - Slack commands (slash commands) - Uses callback_id
 * - Scheduler (cron-triggered events) - Uses schedule_id + timestamp
 *
 * Key Format: {source}:{tenant}:{unique_id}
 *
 * Design Considerations:
 * - Keys are deterministic for the same input
 * - Keys include tenant isolation to prevent cross-tenant collisions
 * - Keys have reasonable length for Firestore document IDs (max 1500 bytes)
 * - Keys expire after TTL (24h for completed, 1h for failed)
 *
 * @module @gwi/core/idempotency
 */

import { z } from 'zod';
import * as crypto from 'node:crypto';

// =============================================================================
// Event Sources
// =============================================================================

/**
 * Event source types that can trigger runs
 */
export const EventSourceSchema = z.enum([
  'github_webhook',
  'api',
  'slack',
  'scheduler',
]);
export type EventSource = z.infer<typeof EventSourceSchema>;

// =============================================================================
// Idempotency Key Input Schemas
// =============================================================================

/**
 * GitHub webhook idempotency key components
 *
 * Format: github:{tenant}:{delivery_id}
 * Example: github:org-123:550e8400-e29b-41d4-a716-446655440000
 *
 * The X-GitHub-Delivery header provides a unique UUID per webhook delivery.
 * This guarantees idempotency even for retried webhooks.
 */
export const GitHubIdempotencyKeySchema = z.object({
  source: z.literal('github_webhook'),
  tenant: z.string().min(1).max(100),
  deliveryId: z.string().uuid(),
});
export type GitHubIdempotencyKey = z.infer<typeof GitHubIdempotencyKeySchema>;

/**
 * API request idempotency key components
 *
 * Format: api:{tenant}:{request_id}
 * Example: api:org-123:req-550e8400-e29b-41d4-a716-446655440000
 *
 * Client provides a unique request ID via X-Request-ID or X-Idempotency-Key header.
 * If not provided, one is generated server-side using crypto.randomUUID().
 */
export const ApiIdempotencyKeySchema = z.object({
  source: z.literal('api'),
  tenant: z.string().min(1).max(100),
  requestId: z.string().min(1).max(200),
});
export type ApiIdempotencyKey = z.infer<typeof ApiIdempotencyKeySchema>;

/**
 * Slack command idempotency key components
 *
 * Format: slack:{tenant}:{callback_id}
 * Example: slack:team-T12345678:callback-1234567890.123456
 *
 * Slack's callback_id is unique per interaction.
 * Combined with team_id (as tenant) for cross-workspace isolation.
 */
export const SlackIdempotencyKeySchema = z.object({
  source: z.literal('slack'),
  tenant: z.string().min(1).max(100),
  callbackId: z.string().min(1).max(200),
});
export type SlackIdempotencyKey = z.infer<typeof SlackIdempotencyKeySchema>;

/**
 * Scheduler idempotency key components
 *
 * Format: scheduler:{tenant}:{schedule_id}:{timestamp}
 * Example: scheduler:org-123:daily-cleanup:2024-12-19T00:00:00Z
 *
 * Schedule ID + timestamp ensures each scheduled run is unique.
 * Timestamp is truncated to the schedule granularity (e.g., minute, hour).
 */
export const SchedulerIdempotencyKeySchema = z.object({
  source: z.literal('scheduler'),
  tenant: z.string().min(1).max(100),
  scheduleId: z.string().min(1).max(100),
  timestamp: z.string().datetime(),
});
export type SchedulerIdempotencyKey = z.infer<
  typeof SchedulerIdempotencyKeySchema
>;

/**
 * Union of all idempotency key input types
 */
export const IdempotencyKeyInputSchema = z.discriminatedUnion('source', [
  GitHubIdempotencyKeySchema,
  ApiIdempotencyKeySchema,
  SlackIdempotencyKeySchema,
  SchedulerIdempotencyKeySchema,
]);
export type IdempotencyKeyInput = z.infer<typeof IdempotencyKeyInputSchema>;

// =============================================================================
// Key Generation Functions
// =============================================================================

/**
 * Generate a composite idempotency key string from components
 *
 * The generated key:
 * - Is deterministic for the same input
 * - Includes tenant isolation
 * - Is safe for use as Firestore document ID
 * - Has format: {source}:{tenant}:{unique_id}
 *
 * @param input - Idempotency key components
 * @returns Composite key string
 *
 * @example
 * ```typescript
 * const key = generateIdempotencyKey({
 *   source: 'github_webhook',
 *   tenant: 'org-123',
 *   deliveryId: '550e8400-e29b-41d4-a716-446655440000'
 * });
 * // Returns: "github:org-123:550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateIdempotencyKey(input: IdempotencyKeyInput): string {
  // Validate input
  const validated = IdempotencyKeyInputSchema.parse(input);

  switch (validated.source) {
    case 'github_webhook':
      return `github:${validated.tenant}:${validated.deliveryId}`;

    case 'api':
      return `api:${validated.tenant}:${validated.requestId}`;

    case 'slack':
      return `slack:${validated.tenant}:${validated.callbackId}`;

    case 'scheduler':
      return `scheduler:${validated.tenant}:${validated.scheduleId}:${validated.timestamp}`;
  }
}

/**
 * Parse a composite idempotency key string back to components
 *
 * Returns null if the key is invalid or doesn't match any known format.
 *
 * @param key - Composite key string
 * @returns Parsed key components or null if invalid
 *
 * @example
 * ```typescript
 * const parsed = parseIdempotencyKey('github:org-123:550e8400-e29b-41d4-a716-446655440000');
 * // Returns: { source: 'github_webhook', tenant: 'org-123', deliveryId: '...' }
 * ```
 */
export function parseIdempotencyKey(
  key: string
): IdempotencyKeyInput | null {
  const parts = key.split(':');
  if (parts.length < 3) return null;

  const source = parts[0];
  const tenant = parts[1];

  try {
    switch (source) {
      case 'github': {
        if (parts.length !== 3) return null;
        const deliveryId = parts[2];
        const result = GitHubIdempotencyKeySchema.safeParse({
          source: 'github_webhook',
          tenant,
          deliveryId,
        });
        return result.success ? result.data : null;
      }

      case 'api': {
        if (parts.length !== 3) return null;
        const requestId = parts[2];
        const result = ApiIdempotencyKeySchema.safeParse({
          source: 'api',
          tenant,
          requestId,
        });
        return result.success ? result.data : null;
      }

      case 'slack': {
        if (parts.length !== 3) return null;
        const callbackId = parts[2];
        const result = SlackIdempotencyKeySchema.safeParse({
          source: 'slack',
          tenant,
          callbackId,
        });
        return result.success ? result.data : null;
      }

      case 'scheduler': {
        // Scheduler format: scheduler:tenant:scheduleId:timestamp
        // Timestamp contains colons, so we need to rejoin
        if (parts.length < 4) return null;
        const scheduleId = parts[2];
        const timestamp = parts.slice(3).join(':');
        const result = SchedulerIdempotencyKeySchema.safeParse({
          source: 'scheduler',
          tenant,
          scheduleId,
          timestamp,
        });
        return result.success ? result.data : null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Validate that a key is well-formed
 *
 * @param key - Composite key string to validate
 * @returns true if valid, false otherwise
 */
export function validateIdempotencyKey(key: string): boolean {
  return parseIdempotencyKey(key) !== null;
}

// =============================================================================
// Payload Hashing
// =============================================================================

/**
 * Hash a request payload for consistent comparison
 *
 * Uses SHA-256 to produce a deterministic hash of the payload.
 * Keys are sorted before hashing to ensure consistency.
 *
 * @param payload - Request payload to hash
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * ```typescript
 * const hash = hashRequestPayload({ action: 'opened', pr: 123 });
 * // Returns: "a1b2c3d4..."
 * ```
 */
export function hashRequestPayload(payload: unknown): string {
  // Convert to JSON with sorted keys for deterministic output
  const sorted = sortObjectKeys(payload);
  const json = JSON.stringify(sorted);

  // SHA-256 hash
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Recursively sort object keys for deterministic JSON serialization
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }

  return sorted;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a new request ID for API requests that don't provide one
 *
 * @returns A new UUID v4 string
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Extract tenant ID from various input formats
 *
 * This is a helper for middleware/handlers to normalize tenant extraction.
 *
 * @param input - Object that may contain tenant information
 * @returns Tenant ID or 'default' if not found
 */
export function extractTenantId(input: {
  tenantId?: string;
  organizationId?: string;
  orgId?: string;
}): string {
  return input.tenantId || input.organizationId || input.orgId || 'default';
}
