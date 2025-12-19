/**
 * Idempotency Layer
 *
 * A4: Provides idempotency guarantees for all event sources.
 *
 * Features:
 * - A4.s1: Idempotency key schemes per source (GitHub, API, Slack, Scheduler)
 * - A4.s2: Check-and-set using Firestore transactions
 * - A4.s3: TTL/retention policy for idempotency records
 * - A4.s5: Observability counters for monitoring
 *
 * Usage:
 * ```typescript
 * import { getIdempotencyService } from '@gwi/engine';
 *
 * const service = getIdempotencyService();
 *
 * // In a webhook handler:
 * const result = await service.process(
 *   { source: 'github_webhook', deliveryId: req.headers['x-github-delivery'] },
 *   tenantId,
 *   req.body,
 *   async () => {
 *     const run = await startRun(req.body);
 *     return { runId: run.id, response: run };
 *   }
 * );
 *
 * if (!result.processed) {
 *   console.log('Duplicate webhook, returning cached result');
 * }
 * ```
 *
 * @module @gwi/engine/idempotency
 */

// Types - Zod schemas (values that also export types via z.infer)
export {
  EventSource,
  GitHubIdempotencyKey,
  ApiIdempotencyKey,
  SlackIdempotencyKey,
  SchedulerIdempotencyKey,
  IdempotencyKeyInput,
  IdempotencyStatus,
  IdempotencyRecord,
  IdempotencyCheckResult,
  DEFAULT_IDEMPOTENCY_CONFIG,
  generateIdempotencyKey,
  parseIdempotencyKey,
  hashRequestPayload,
} from './types.js';

// Types - interfaces (pure types)
export type { IdempotencyConfig } from './types.js';

// Store - types
export type { IdempotencyStore } from './store.js';

// Store - values
export {
  InMemoryIdempotencyStore,
  FirestoreIdempotencyStore,
  getIdempotencyStore,
  setIdempotencyStore,
  resetIdempotencyStore,
} from './store.js';

// Metrics - types
export type { IdempotencyMetrics, SourceMetrics } from './metrics.js';

// Metrics - values
export {
  IdempotencyMetricCollector,
  getIdempotencyMetrics,
  resetIdempotencyMetrics,
} from './metrics.js';

// Service - types
export type { IdempotencyProcessResult, ProcessOptions } from './service.js';

// Service - values
export {
  IdempotencyService,
  IdempotencyProcessingError,
  IdempotencyTimeoutError,
  getIdempotencyService,
  setIdempotencyService,
  resetIdempotencyService,
} from './service.js';

// Middleware - types
export type { IdempotencyMiddlewareOptions } from './middleware.js';

// Middleware - values
export {
  idempotencyMiddleware,
  requireIdempotency,
  idempotencyForMethods,
} from './middleware.js';
