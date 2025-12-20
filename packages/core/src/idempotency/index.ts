/**
 * Idempotency Module
 *
 * A4.s1: Idempotency key schemes for preventing duplicate run creation
 * A4.s2: Atomic check-and-set for idempotency keys using Firestore transactions
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

export {
  // Store Types
  type IdempotencyStatus,
  type IdempotencyRecord,
  type CheckAndSetResult,
  type IdempotencyStore,

  // Store Implementations
  FirestoreIdempotencyStore,
  InMemoryIdempotencyStore,

  // Factory
  createIdempotencyStore,

  // Hash Function
  hashIdempotencyKey,
} from './store.js';
