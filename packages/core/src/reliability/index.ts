/**
 * Reliability Primitives
 *
 * Phase 7: Operator-grade hardening for deterministic, resumable runs.
 * Phase 16: Firestore-backed distributed implementations.
 * Phase 30: Retry/backoff and circuit breaker patterns.
 *
 * This module provides:
 * - Run locking to prevent concurrent mutation
 * - Idempotency keys for tool/step invocations
 * - Error taxonomy for consistent failure handling
 * - Observability primitives (structured logging, tracing, metrics)
 * - Checkpoints for resume/replay
 * - Retry with exponential backoff and jitter
 * - Circuit breaker pattern for cascading failure prevention
 *
 * @module @gwi/core/reliability
 */

// Run locking
export {
  type RunLock,
  type RunLockOptions,
  type RunLockResult,
  type LockAcquisitionError,
  RunLockManager,
  MemoryRunLockManager,
  getRunLockManager,
  setRunLockManager,
} from './locking.js';

// Firestore locking (Phase 16)
export { FirestoreRunLockManager } from './firestore-locking.js';

// Idempotency
export {
  type IdempotencyKey,
  type IdempotencyRecord,
  type IdempotencyOptions,
  IdempotencyStore,
  MemoryIdempotencyStore,
  getIdempotencyStore,
  setIdempotencyStore,
  generateIdempotencyKey,
  hashInput,
  createIdempotencyKey,
} from './idempotency.js';

// Firestore idempotency (Phase 16)
export { FirestoreIdempotencyStore } from './firestore-idempotency.js';

// Error taxonomy
export {
  type GwiErrorCode,
  type GwiErrorOptions,
  GwiError,
  RetryableError,
  NonRetryableError,
  PolicyDeniedError,
  ApprovalRequiredError,
  LockConflictError,
  TimeoutError,
  ValidationError,
  isRetryable,
  toExitCode,
  toAuditEvent,
} from './errors.js';

// Observability
export {
  type LogLevel,
  type LogEntry,
  type TraceContext,
  type MetricType,
  type MetricValue,
  type MetricsRegistry,
  Logger,
  getLogger,
  createTraceContext,
  getTraceContext,
  setTraceContext,
  DefaultMetricsRegistry,
  getMetricsRegistry,
  setMetricsRegistry,
} from './observability.js';

// Resume/Replay
export {
  type RunCheckpoint,
  type ResumeOptions,
  type ResumeResult,
  CheckpointManager,
  analyzeResumePoint,
  shouldSkipStep,
  mergeArtifacts,
  getCheckpointManager,
  setCheckpointManager,
} from './resume.js';

// Firestore checkpoint (Phase 16)
export {
  FirestoreCheckpointManager,
  getFirestoreCheckpointManager,
  resetFirestoreCheckpointManager,
} from './firestore-checkpoint.js';

// Retry and Circuit Breaker (Phase 30)
export {
  // Retry
  type RetryConfig,
  type RetryResult,
  DEFAULT_RETRY_CONFIG,
  RETRY_PRESETS,
  retry,
  retryWithResult,
  calculateBackoff,

  // Circuit Breaker
  type CircuitState,
  type CircuitBreakerConfig,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  CircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,

  // Combined
  ResilientExecutor,
} from './retry.js';

// =============================================================================
// Environment-Aware Store Getters (Phase 16)
// =============================================================================

import { getStoreBackend } from '../storage/index.js';
import { RunLockManager, MemoryRunLockManager, setRunLockManager, getRunLockManager as getBaseRunLockManager } from './locking.js';
import { IdempotencyStore, MemoryIdempotencyStore, setIdempotencyStore, getIdempotencyStore as getBaseIdempotencyStore } from './idempotency.js';
import { FirestoreRunLockManager } from './firestore-locking.js';
import { FirestoreIdempotencyStore } from './firestore-idempotency.js';

let reliabilityInitialized = false;

/**
 * Initialize reliability stores based on environment
 *
 * Call this at app startup to configure the appropriate store backends.
 */
export function initializeReliabilityStores(): void {
  if (reliabilityInitialized) {
    return;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    setRunLockManager(new FirestoreRunLockManager());
    setIdempotencyStore(new FirestoreIdempotencyStore());
  } else {
    setRunLockManager(new MemoryRunLockManager());
    setIdempotencyStore(new MemoryIdempotencyStore());
  }

  reliabilityInitialized = true;
}

/**
 * Reset reliability stores (for testing)
 */
export function resetReliabilityStores(): void {
  reliabilityInitialized = false;
}

/**
 * Get the run lock manager (environment-aware)
 *
 * Auto-initializes if not already done.
 */
export function getDistributedLockManager(): RunLockManager {
  initializeReliabilityStores();
  return getBaseRunLockManager();
}

/**
 * Get the idempotency store (environment-aware)
 *
 * Auto-initializes if not already done.
 */
export function getDistributedIdempotencyStore(): IdempotencyStore {
  initializeReliabilityStores();
  return getBaseIdempotencyStore();
}
