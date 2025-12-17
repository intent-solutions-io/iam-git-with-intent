/**
 * Run Locking
 *
 * Phase 7: Mutex/lock mechanism to prevent concurrent mutation of runs.
 *
 * Hard rules:
 * - Only one process can hold a lock on a run at a time
 * - Locks have TTL to prevent deadlocks
 * - Lock acquisition is atomic
 * - Lock holder ID enables ownership verification
 *
 * @module @gwi/core/reliability/locking
 */

import { randomBytes } from 'crypto';

// =============================================================================
// Types
// =============================================================================

/**
 * Run lock metadata
 */
export interface RunLock {
  /** Run ID being locked */
  runId: string;

  /** Unique lock holder ID */
  holderId: string;

  /** When the lock was acquired */
  acquiredAt: Date;

  /** When the lock expires (TTL) */
  expiresAt: Date;

  /** Optional reason for locking */
  reason?: string;
}

/**
 * Lock acquisition options
 */
export interface RunLockOptions {
  /** Time-to-live in milliseconds (default: 60000 = 1 minute) */
  ttlMs?: number;

  /** Wait timeout for acquiring lock (default: 0 = no wait) */
  waitTimeoutMs?: number;

  /** Retry interval when waiting (default: 100ms) */
  retryIntervalMs?: number;

  /** Reason for acquiring lock */
  reason?: string;
}

/**
 * Lock acquisition result
 */
export interface RunLockResult {
  /** Whether lock was acquired */
  acquired: boolean;

  /** The lock if acquired */
  lock?: RunLock;

  /** Error if not acquired */
  error?: string;

  /** Holder ID if lock is held by another */
  existingHolderId?: string;
}

/**
 * Lock acquisition error details
 */
export interface LockAcquisitionError {
  runId: string;
  holderId: string;
  existingHolderId?: string;
  reason: string;
}

// =============================================================================
// Run Lock Manager
// =============================================================================

/**
 * Abstract lock manager interface
 *
 * Implementations can use:
 * - In-memory (for single-process)
 * - File-based (.gwi/runs/<runId>.lock)
 * - Redis (for distributed)
 * - Firestore (for cloud)
 */
export abstract class RunLockManager {
  /**
   * Try to acquire a lock on a run
   *
   * @param runId - Run ID to lock
   * @param options - Lock options
   * @returns Lock result
   */
  abstract tryAcquire(runId: string, options?: RunLockOptions): Promise<RunLockResult>;

  /**
   * Release a lock
   *
   * @param runId - Run ID to unlock
   * @param holderId - Must match the holder that acquired the lock
   * @returns true if released, false if not held or wrong holder
   */
  abstract release(runId: string, holderId: string): Promise<boolean>;

  /**
   * Check if a run is locked
   *
   * @param runId - Run ID to check
   * @returns Lock info if locked, null otherwise
   */
  abstract getLock(runId: string): Promise<RunLock | null>;

  /**
   * Extend a lock's TTL
   *
   * @param runId - Run ID
   * @param holderId - Must match the holder
   * @param ttlMs - New TTL in milliseconds
   * @returns true if extended, false if not held or wrong holder
   */
  abstract extend(runId: string, holderId: string, ttlMs: number): Promise<boolean>;

  /**
   * Force release a lock (admin operation)
   *
   * @param runId - Run ID to unlock
   * @returns true if released
   */
  abstract forceRelease(runId: string): Promise<boolean>;

  /**
   * List all active locks
   *
   * @returns Array of active locks
   */
  abstract listLocks(): Promise<RunLock[]>;

  /**
   * Acquire lock with automatic retry
   */
  async acquire(runId: string, options: RunLockOptions = {}): Promise<RunLockResult> {
    const {
      waitTimeoutMs = 0,
      retryIntervalMs = 100,
    } = options;

    // First attempt
    let result = await this.tryAcquire(runId, options);
    if (result.acquired || waitTimeoutMs <= 0) {
      return result;
    }

    // Retry loop if waiting
    const deadline = Date.now() + waitTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(retryIntervalMs);
      result = await this.tryAcquire(runId, options);
      if (result.acquired) {
        return result;
      }
    }

    return {
      acquired: false,
      error: `Lock acquisition timed out after ${waitTimeoutMs}ms`,
      existingHolderId: result.existingHolderId,
    };
  }

  /**
   * Execute a function with a lock held
   *
   * @param runId - Run ID to lock
   * @param fn - Function to execute while holding lock
   * @param options - Lock options
   * @returns Result of function or throws if lock not acquired
   */
  async withLock<T>(
    runId: string,
    fn: (lock: RunLock) => Promise<T>,
    options: RunLockOptions = {}
  ): Promise<T> {
    const result = await this.acquire(runId, options);

    if (!result.acquired || !result.lock) {
      throw new Error(`Failed to acquire lock for run ${runId}: ${result.error}`);
    }

    try {
      return await fn(result.lock);
    } finally {
      await this.release(runId, result.lock.holderId);
    }
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory lock manager for single-process scenarios
 */
export class MemoryRunLockManager extends RunLockManager {
  private locks = new Map<string, RunLock>();

  async tryAcquire(runId: string, options: RunLockOptions = {}): Promise<RunLockResult> {
    const { ttlMs = 60000, reason } = options;

    // Check existing lock
    const existing = this.locks.get(runId);
    if (existing) {
      // Check if expired
      if (existing.expiresAt > new Date()) {
        return {
          acquired: false,
          error: `Run ${runId} is locked by ${existing.holderId}`,
          existingHolderId: existing.holderId,
        };
      }
      // Expired, remove it
      this.locks.delete(runId);
    }

    // Create new lock
    const holderId = generateHolderId();
    const now = new Date();
    const lock: RunLock = {
      runId,
      holderId,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      reason,
    };

    this.locks.set(runId, lock);

    return { acquired: true, lock };
  }

  async release(runId: string, holderId: string): Promise<boolean> {
    const existing = this.locks.get(runId);
    if (!existing || existing.holderId !== holderId) {
      return false;
    }

    this.locks.delete(runId);
    return true;
  }

  async getLock(runId: string): Promise<RunLock | null> {
    const lock = this.locks.get(runId);
    if (!lock) {
      return null;
    }

    // Check if expired
    if (lock.expiresAt <= new Date()) {
      this.locks.delete(runId);
      return null;
    }

    return lock;
  }

  async extend(runId: string, holderId: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(runId);
    if (!existing || existing.holderId !== holderId) {
      return false;
    }

    existing.expiresAt = new Date(Date.now() + ttlMs);
    return true;
  }

  async forceRelease(runId: string): Promise<boolean> {
    const existed = this.locks.has(runId);
    this.locks.delete(runId);
    return existed;
  }

  async listLocks(): Promise<RunLock[]> {
    const now = new Date();
    const active: RunLock[] = [];

    for (const [runId, lock] of this.locks) {
      if (lock.expiresAt > now) {
        active.push(lock);
      } else {
        this.locks.delete(runId);
      }
    }

    return active;
  }

  /**
   * Clear all locks (for testing)
   */
  clear(): void {
    this.locks.clear();
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a unique holder ID
 */
function generateHolderId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  const pid = process.pid.toString(36);
  return `holder-${timestamp}-${pid}-${random}`;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Global Singleton
// =============================================================================

let globalLockManager: RunLockManager | null = null;

/**
 * Get the global lock manager
 */
export function getRunLockManager(): RunLockManager {
  if (!globalLockManager) {
    globalLockManager = new MemoryRunLockManager();
  }
  return globalLockManager;
}

/**
 * Set a custom lock manager (for testing or distributed scenarios)
 */
export function setRunLockManager(manager: RunLockManager): void {
  globalLockManager = manager;
}
