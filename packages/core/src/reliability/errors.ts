/**
 * Error Taxonomy
 *
 * Phase 7: Standard error types with clear semantics for retry, audit, exit codes.
 *
 * Hard rules:
 * - Every error has a code for programmatic handling
 * - Every error knows if it's retryable
 * - Every error maps to an exit code
 * - Every error can become an audit event
 *
 * @module @gwi/core/reliability/errors
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Standard GWI error codes
 */
export type GwiErrorCode =
  // Retryable errors (5xx-like, transient)
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'UPSTREAM_ERROR'

  // Non-retryable errors (4xx-like, permanent)
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LOCK_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'

  // Policy errors
  | 'POLICY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'QUOTA_EXCEEDED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'

  // Internal errors
  | 'INTERNAL_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'UNHANDLED_ERROR';

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * GWI error options
 */
export interface GwiErrorOptions {
  /** Error code */
  code: GwiErrorCode;

  /** Whether the error is retryable */
  retryable?: boolean;

  /** Suggested retry delay in ms */
  retryAfterMs?: number;

  /** Maximum retry attempts */
  maxRetries?: number;

  /** Additional context for debugging */
  context?: Record<string, unknown>;

  /** Underlying cause */
  cause?: Error;
}

/**
 * Base GWI error class
 *
 * All GWI errors extend this for consistent handling.
 */
export class GwiError extends Error {
  readonly code: GwiErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly maxRetries?: number;
  readonly context?: Record<string, unknown>;
  readonly cause?: Error;
  readonly timestamp: Date;

  constructor(message: string, options: GwiErrorOptions) {
    super(message);
    this.name = 'GwiError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.maxRetries = options.maxRetries;
    this.context = options.context;
    this.cause = options.cause;
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON for logging/audit
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      maxRetries: this.maxRetries,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

// =============================================================================
// Retryable Errors
// =============================================================================

/**
 * Retryable error - transient failure, safe to retry
 */
export class RetryableError extends GwiError {
  constructor(
    message: string,
    code: GwiErrorCode = 'UPSTREAM_ERROR',
    options?: Partial<GwiErrorOptions>
  ) {
    super(message, {
      code,
      retryable: true,
      retryAfterMs: options?.retryAfterMs ?? 1000,
      maxRetries: options?.maxRetries ?? 3,
      ...options,
    });
    this.name = 'RetryableError';
  }
}

/**
 * Non-retryable error - permanent failure, do not retry
 */
export class NonRetryableError extends GwiError {
  constructor(
    message: string,
    code: GwiErrorCode = 'INTERNAL_ERROR',
    options?: Partial<GwiErrorOptions>
  ) {
    super(message, {
      code,
      retryable: false,
      ...options,
    });
    this.name = 'NonRetryableError';
  }
}

// =============================================================================
// Specific Error Types
// =============================================================================

/**
 * Policy denied error - action blocked by policy engine
 */
export class PolicyDeniedError extends GwiError {
  readonly policyReasonCode?: string;
  readonly toolName?: string;

  constructor(
    message: string,
    options?: {
      policyReasonCode?: string;
      toolName?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: 'POLICY_DENIED',
      retryable: false,
      context: options?.context,
    });
    this.name = 'PolicyDeniedError';
    this.policyReasonCode = options?.policyReasonCode;
    this.toolName = options?.toolName;
  }
}

/**
 * Approval required error - action needs human approval
 */
export class ApprovalRequiredError extends GwiError {
  readonly requiredApprovalType: 'destructive' | 'high_risk' | 'manual';
  readonly toolName?: string;
  readonly approvalScope?: string;

  constructor(
    message: string,
    requiredApprovalType: 'destructive' | 'high_risk' | 'manual' = 'destructive',
    options?: {
      toolName?: string;
      approvalScope?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: 'APPROVAL_REQUIRED',
      retryable: false, // Needs human action, not automatic retry
      context: options?.context,
    });
    this.name = 'ApprovalRequiredError';
    this.requiredApprovalType = requiredApprovalType;
    this.toolName = options?.toolName;
    this.approvalScope = options?.approvalScope;
  }
}

/**
 * Lock conflict error - resource is locked by another process
 */
export class LockConflictError extends GwiError {
  readonly runId: string;
  readonly holderId?: string;

  constructor(
    runId: string,
    options?: {
      holderId?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(`Run ${runId} is locked by another process`, {
      code: 'LOCK_CONFLICT',
      retryable: true, // Can retry after lock is released
      retryAfterMs: 1000,
      maxRetries: 5,
      context: options?.context,
    });
    this.name = 'LockConflictError';
    this.runId = runId;
    this.holderId = options?.holderId;
  }
}

/**
 * Timeout error - operation exceeded time limit
 */
export class TimeoutError extends GwiError {
  readonly timeoutMs: number;
  readonly operation?: string;

  constructor(
    message: string,
    timeoutMs: number,
    options?: {
      operation?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: 'TIMEOUT',
      retryable: true,
      retryAfterMs: 2000,
      maxRetries: 2,
      context: options?.context,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = options?.operation;
  }
}

/**
 * Validation error - input failed validation
 */
export class ValidationError extends GwiError {
  readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    options?: {
      fieldErrors?: Record<string, string>;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: 'VALIDATION_ERROR',
      retryable: false,
      context: options?.context,
    });
    this.name = 'ValidationError';
    this.fieldErrors = options?.fieldErrors;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof GwiError) {
    return error.retryable;
  }

  // Check for common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('503') ||
      message.includes('429')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Map error to CLI exit code
 */
export function toExitCode(error: unknown): number {
  if (!(error instanceof GwiError)) {
    return 1; // Generic error
  }

  switch (error.code) {
    // Success (shouldn't happen with error)
    // case 'SUCCESS': return 0;

    // Retryable errors (10-19)
    case 'RATE_LIMITED':
      return 10;
    case 'TIMEOUT':
      return 11;
    case 'NETWORK_ERROR':
      return 12;
    case 'SERVICE_UNAVAILABLE':
      return 13;
    case 'UPSTREAM_ERROR':
      return 14;

    // Validation errors (20-29)
    case 'VALIDATION_ERROR':
      return 20;
    case 'NOT_FOUND':
      return 21;
    case 'CONFLICT':
      return 22;
    case 'LOCK_CONFLICT':
      return 23;
    case 'IDEMPOTENCY_CONFLICT':
      return 24;

    // Policy errors (30-39)
    case 'POLICY_DENIED':
      return 30;
    case 'APPROVAL_REQUIRED':
      return 31;
    case 'QUOTA_EXCEEDED':
      return 32;
    case 'UNAUTHORIZED':
      return 33;
    case 'FORBIDDEN':
      return 34;

    // Internal errors (40-49)
    case 'INTERNAL_ERROR':
      return 40;
    case 'CONFIGURATION_ERROR':
      return 41;
    case 'UNHANDLED_ERROR':
      return 42;

    default:
      return 1;
  }
}

/**
 * Convert error to audit event format
 */
export function toAuditEvent(error: unknown, context?: Record<string, unknown>): {
  type: 'error';
  code: GwiErrorCode;
  message: string;
  retryable: boolean;
  timestamp: string;
  context?: Record<string, unknown>;
} {
  if (error instanceof GwiError) {
    return {
      type: 'error',
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      timestamp: error.timestamp.toISOString(),
      context: { ...error.context, ...context },
    };
  }

  return {
    type: 'error',
    code: 'UNHANDLED_ERROR',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    timestamp: new Date().toISOString(),
    context,
  };
}

/**
 * Wrap any error as a GwiError
 */
export function wrapError(error: unknown, defaults?: Partial<GwiErrorOptions>): GwiError {
  if (error instanceof GwiError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new GwiError(message, {
    code: defaults?.code ?? 'UNHANDLED_ERROR',
    retryable: defaults?.retryable ?? isRetryable(error),
    cause,
    ...defaults,
  });
}
