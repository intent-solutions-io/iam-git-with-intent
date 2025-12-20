/**
 * Idempotency Module
 *
 * A4.s1: Idempotency key schemes for preventing duplicate run creation
 *
 * @module @gwi/core/idempotency
 */

export {
  // Types
  type EventSource,
  type GitHubIdempotencyKey,
  type ApiIdempotencyKey,
  type SlackIdempotencyKey,
  type SchedulerIdempotencyKey,
  type IdempotencyKeyInput,

  // Schemas
  EventSourceSchema,
  GitHubIdempotencyKeySchema,
  ApiIdempotencyKeySchema,
  SlackIdempotencyKeySchema,
  SchedulerIdempotencyKeySchema,
  IdempotencyKeyInputSchema,

  // Functions
  generateIdempotencyKey,
  parseIdempotencyKey,
  validateIdempotencyKey,
  hashRequestPayload,
  generateRequestId,
  extractTenantId,
} from './key-scheme.js';
