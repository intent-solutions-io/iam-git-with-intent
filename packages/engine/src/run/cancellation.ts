/**
 * Run Cancellation Semantics (A2.s4)
 *
 * Provides safe cancellation with:
 * - CancellationToken for cooperative cancellation checking
 * - CompensationRegistry for rollback of partial changes
 * - CancellationReason for audit trail
 *
 * Safe Stop Pattern:
 * - Running steps complete or abort at next checkpoint
 * - Compensation actions execute in reverse order
 * - Final state is 'cancelled' with reason and compensation log
 *
 * @module @gwi/engine/run/cancellation
 */

import { EventEmitter } from 'events';

// =============================================================================
// Cancellation Token
// =============================================================================

/**
 * Reason for cancellation
 */
export interface CancellationReason {
  /** Who initiated cancellation (user, system, timeout) */
  initiator: 'user' | 'system' | 'timeout' | 'policy';
  /** Human-readable reason */
  reason: string;
  /** User ID if user-initiated */
  userId?: string;
  /** Timestamp when cancellation was requested */
  requestedAt: Date;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Cancellation token for cooperative cancellation
 *
 * Pass this token to long-running operations. They should check
 * `token.isCancelled` at safe checkpoints and abort gracefully.
 *
 * @example
 * ```typescript
 * async function longRunningOperation(token: CancellationToken) {
 *   for (const item of items) {
 *     token.throwIfCancelled(); // Throws CancelledError if cancelled
 *     await processItem(item);
 *   }
 * }
 * ```
 */
export class CancellationToken {
  private _isCancelled = false;
  private _reason: CancellationReason | undefined;
  private readonly emitter = new EventEmitter();

  /**
   * Check if cancellation has been requested
   */
  get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Get the cancellation reason (if cancelled)
   */
  get reason(): CancellationReason | undefined {
    return this._reason;
  }

  /**
   * Request cancellation with reason
   */
  cancel(reason: CancellationReason): void {
    if (this._isCancelled) {
      return; // Already cancelled
    }
    this._isCancelled = true;
    this._reason = reason;
    this.emitter.emit('cancelled', reason);
  }

  /**
   * Register a callback for cancellation events
   */
  onCancelled(callback: (reason: CancellationReason) => void): () => void {
    this.emitter.on('cancelled', callback);
    return () => this.emitter.off('cancelled', callback);
  }

  /**
   * Throw CancelledError if cancellation has been requested
   *
   * Use at safe checkpoints in long-running operations.
   */
  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new CancelledError(this._reason!);
    }
  }

  /**
   * Create a promise that resolves when cancelled
   *
   * Useful for racing with async operations.
   */
  whenCancelled(): Promise<CancellationReason> {
    if (this._isCancelled) {
      return Promise.resolve(this._reason!);
    }
    return new Promise((resolve) => {
      this.emitter.once('cancelled', resolve);
    });
  }

  /**
   * Create a child token that inherits cancellation from parent
   */
  createChild(): CancellationToken {
    const child = new CancellationToken();
    if (this._isCancelled) {
      child.cancel(this._reason!);
    } else {
      this.onCancelled((reason) => child.cancel(reason));
    }
    return child;
  }
}

/**
 * Error thrown when operation is cancelled
 */
export class CancelledError extends Error {
  readonly name = 'CancelledError';
  readonly isCancellation = true;

  constructor(public readonly reason: CancellationReason) {
    super(`Operation cancelled: ${reason.reason}`);
  }
}

/**
 * Check if an error is a CancelledError
 */
export function isCancelledError(error: unknown): error is CancelledError {
  return error instanceof CancelledError ||
    (error instanceof Error && (error as CancelledError).isCancellation === true);
}

// =============================================================================
// Cancellation Token Source
// =============================================================================

/**
 * Factory for creating and managing cancellation tokens
 */
export class CancellationTokenSource {
  private readonly token: CancellationToken;
  private _isDisposed = false;

  constructor() {
    this.token = new CancellationToken();
  }

  /**
   * Get the cancellation token
   */
  getToken(): CancellationToken {
    return this.token;
  }

  /**
   * Request cancellation
   */
  cancel(reason: CancellationReason): void {
    if (this._isDisposed) {
      throw new Error('CancellationTokenSource has been disposed');
    }
    this.token.cancel(reason);
  }

  /**
   * Check if already cancelled
   */
  get isCancelled(): boolean {
    return this.token.isCancelled;
  }

  /**
   * Dispose the source (cannot cancel after disposal)
   */
  dispose(): void {
    this._isDisposed = true;
  }
}

// =============================================================================
// Compensation Registry
// =============================================================================

/**
 * Compensation action for rollback
 */
export interface CompensationAction {
  /** Unique ID for this action */
  id: string;
  /** Human-readable description */
  description: string;
  /** The compensating function to execute */
  execute: () => Promise<void>;
  /** Priority (higher = execute first during rollback) */
  priority: number;
  /** Whether this action is critical (must succeed) */
  critical: boolean;
  /** Timestamp when registered */
  registeredAt: Date;
  /** Context for logging */
  context?: Record<string, unknown>;
}

/**
 * Result of compensation execution
 */
export interface CompensationResult {
  actionId: string;
  description: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Summary of all compensation executions
 */
export interface CompensationSummary {
  /** Total actions executed */
  total: number;
  /** Successfully completed */
  succeeded: number;
  /** Failed (non-critical) */
  failed: number;
  /** Failed critical actions */
  criticalFailures: number;
  /** Individual results */
  results: CompensationResult[];
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Whether rollback was complete (no critical failures) */
  rollbackComplete: boolean;
}

/**
 * Registry for compensation actions
 *
 * Register compensation actions as side effects occur.
 * On cancellation, execute all registered actions in reverse order.
 *
 * @example
 * ```typescript
 * const registry = new CompensationRegistry();
 *
 * // Create a branch
 * await createBranch('feature-123');
 * registry.register({
 *   id: 'delete-branch',
 *   description: 'Delete feature-123 branch',
 *   execute: () => deleteBranch('feature-123'),
 *   priority: 1,
 *   critical: false,
 * });
 *
 * // On cancellation, rollback
 * await registry.executeCompensations();
 * ```
 */
export class CompensationRegistry {
  private readonly actions: CompensationAction[] = [];
  private _executed = false;

  /**
   * Register a compensation action
   */
  register(
    action: Omit<CompensationAction, 'registeredAt'>
  ): void {
    if (this._executed) {
      throw new Error('Cannot register actions after compensations have been executed');
    }
    this.actions.push({
      ...action,
      registeredAt: new Date(),
    });
  }

  /**
   * Get all registered actions (for inspection)
   */
  getActions(): readonly CompensationAction[] {
    return [...this.actions];
  }

  /**
   * Check if any compensations are registered
   */
  hasCompensations(): boolean {
    return this.actions.length > 0;
  }

  /**
   * Execute all compensation actions in reverse priority order
   *
   * Actions are sorted by priority (descending) and then by registration time (descending).
   * This ensures later actions are rolled back first.
   *
   * @returns Summary of compensation execution
   */
  async executeCompensations(): Promise<CompensationSummary> {
    if (this._executed) {
      throw new Error('Compensations have already been executed');
    }
    this._executed = true;

    const startTime = Date.now();
    const results: CompensationResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let criticalFailures = 0;

    // Sort by priority descending, then by registration time descending (LIFO)
    const sortedActions = [...this.actions].sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.registeredAt.getTime() - a.registeredAt.getTime();
    });

    for (const action of sortedActions) {
      const actionStart = Date.now();
      try {
        await action.execute();
        results.push({
          actionId: action.id,
          description: action.description,
          success: true,
          durationMs: Date.now() - actionStart,
        });
        succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          actionId: action.id,
          description: action.description,
          success: false,
          error: errorMessage,
          durationMs: Date.now() - actionStart,
        });
        failed++;
        if (action.critical) {
          criticalFailures++;
        }
      }
    }

    return {
      total: this.actions.length,
      succeeded,
      failed,
      criticalFailures,
      results,
      totalDurationMs: Date.now() - startTime,
      rollbackComplete: criticalFailures === 0,
    };
  }

  /**
   * Clear all registered actions without executing
   *
   * Use when the operation completes successfully and
   * compensation is no longer needed.
   */
  clear(): void {
    this.actions.length = 0;
  }
}

// =============================================================================
// Cancellation Context
// =============================================================================

/**
 * Full cancellation context for a run
 *
 * Combines token, registry, and metadata for complete
 * cancellation handling.
 */
export interface CancellationContext {
  /** The cancellation token */
  token: CancellationToken;
  /** Compensation registry for rollback */
  compensations: CompensationRegistry;
  /** Run ID for logging */
  runId: string;
  /** Tenant ID for logging */
  tenantId: string;
}

/**
 * Create a cancellation context for a run
 */
export function createCancellationContext(
  runId: string,
  tenantId: string
): CancellationContext {
  return {
    token: new CancellationToken(),
    compensations: new CompensationRegistry(),
    runId,
    tenantId,
  };
}

// =============================================================================
// Step Checkpoint Helper
// =============================================================================

/**
 * Options for step checkpoints
 */
export interface CheckpointOptions {
  /** Name of the checkpoint for logging */
  name: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Create a checkpoint function for a step
 *
 * Use this to create consistent checkpoint behavior within a step.
 *
 * @example
 * ```typescript
 * const checkpoint = createStepCheckpoint(ctx, 'apply-patches');
 *
 * for (const file of files) {
 *   await checkpoint({ name: 'before-file', context: { file } });
 *   await applyPatch(file);
 * }
 * ```
 */
export function createStepCheckpoint(
  ctx: CancellationContext,
  _stepName: string
): (options: CheckpointOptions) => Promise<void> {
  return async (_options: CheckpointOptions) => {
    // Check for cancellation
    if (ctx.token.isCancelled) {
      throw new CancelledError(ctx.token.reason!);
    }
    // Could add logging here with stepName and options if needed
  };
}

// =============================================================================
// Exports
// =============================================================================

export { CancellationToken as default };
