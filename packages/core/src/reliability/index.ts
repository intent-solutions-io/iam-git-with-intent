/**
 * Reliability Primitives
 *
 * Phase 7: Operator-grade hardening for deterministic, resumable runs.
 *
 * This module provides:
 * - Run locking to prevent concurrent mutation
 * - Idempotency keys for tool/step invocations
 * - Error taxonomy for consistent failure handling
 * - Observability primitives (structured logging, tracing, metrics)
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
