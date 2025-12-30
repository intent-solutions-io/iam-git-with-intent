/**
 * Step State Store Interface
 *
 * C2: Interface for persistent step state storage.
 * Implementations can use Firestore (production) or in-memory (testing).
 *
 * @module @gwi/engine/state/step-state-store
 */

import type {
  StepState,
  StepStateCreate,
  StepStateUpdate,
  StepStateFilter,
  StepStateSort,
  StepStatePagination,
} from './types.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Step State Store Interface
 *
 * Provides persistent storage for step execution state.
 * Designed for Cloud Run resilience - state survives container restarts.
 *
 * Key features:
 * - Multi-tenant isolation via tenantId
 * - Optimistic locking via updatedAt
 * - Support for approval gates (C3)
 * - Support for external wait (C3)
 */
export interface StepStateStore {
  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Create a new step state record
   *
   * @param data - Step state data (id is auto-generated)
   * @returns The created step state with generated id
   */
  create(data: StepStateCreate): Promise<StepState>;

  /**
   * Get a step state by ID
   *
   * @param id - Step state ID
   * @returns The step state or null if not found
   */
  get(id: string): Promise<StepState | null>;

  /**
   * Get a step state by run ID and step ID
   *
   * @param runId - Run ID
   * @param stepId - Step ID from workflow definition
   * @returns The step state or null if not found
   */
  getByRunAndStep(runId: string, stepId: string): Promise<StepState | null>;

  /**
   * Update a step state
   *
   * @param id - Step state ID
   * @param data - Fields to update
   * @returns The updated step state
   * @throws {Error} If step state not found
   */
  update(id: string, data: StepStateUpdate): Promise<StepState>;

  /**
   * Delete a step state
   *
   * @param id - Step state ID
   * @returns true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Create multiple step states
   *
   * @param data - Array of step state data
   * @returns Array of created step states
   */
  createMany(data: StepStateCreate[]): Promise<StepState[]>;

  /**
   * Get all step states for a run
   *
   * @param runId - Run ID
   * @returns Array of step states
   */
  getByRun(runId: string): Promise<StepState[]>;

  /**
   * Get step states for a run as a map
   *
   * @param runId - Run ID
   * @returns Map of stepId -> StepState
   */
  getByRunAsMap(runId: string): Promise<Map<string, StepState>>;

  /**
   * Delete all step states for a run
   *
   * @param runId - Run ID
   * @returns Number of deleted records
   */
  deleteByRun(runId: string): Promise<number>;

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * Query step states with filters
   *
   * @param filter - Query filters
   * @param options - Sort and pagination options
   * @returns Array of matching step states
   */
  query(
    filter: StepStateFilter,
    options?: {
      sort?: StepStateSort;
      pagination?: StepStatePagination;
    }
  ): Promise<StepState[]>;

  /**
   * Count step states matching filter
   *
   * @param filter - Query filters
   * @returns Count of matching records
   */
  count(filter: StepStateFilter): Promise<number>;

  // ===========================================================================
  // Status Transition Operations
  // ===========================================================================

  /**
   * Transition step to running status
   *
   * @param id - Step state ID
   * @returns Updated step state
   */
  markRunning(id: string): Promise<StepState>;

  /**
   * Transition step to completed status
   *
   * @param id - Step state ID
   * @param output - Step output
   * @returns Updated step state
   */
  markCompleted(id: string, output?: unknown): Promise<StepState>;

  /**
   * Transition step to failed status
   *
   * @param id - Step state ID
   * @param error - Error message
   * @param stack - Error stack trace
   * @returns Updated step state
   */
  markFailed(id: string, error: string, stack?: string): Promise<StepState>;

  /**
   * Transition step to skipped status
   *
   * @param id - Step state ID
   * @param reason - Skip reason
   * @returns Updated step state
   */
  markSkipped(id: string, reason?: string): Promise<StepState>;

  // ===========================================================================
  // Approval Gate Operations (C3)
  // ===========================================================================

  /**
   * Transition step to blocked (awaiting approval) status
   *
   * @param id - Step state ID
   * @param contentHash - SHA256 hash of content requiring approval
   * @returns Updated step state
   */
  markBlocked(id: string, contentHash?: string): Promise<StepState>;

  /**
   * Record approval for a step
   *
   * @param id - Step state ID
   * @param userId - User who approved
   * @param reason - Approval reason
   * @returns Updated step state (returns to running status)
   */
  recordApproval(id: string, userId: string, reason?: string): Promise<StepState>;

  /**
   * Record rejection for a step
   *
   * @param id - Step state ID
   * @param userId - User who rejected
   * @param reason - Rejection reason
   * @returns Updated step state (transitions to failed)
   */
  recordRejection(id: string, userId: string, reason?: string): Promise<StepState>;

  /**
   * Get all steps awaiting approval for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns Array of steps awaiting approval
   */
  getPendingApprovals(tenantId: string): Promise<StepState[]>;

  // ===========================================================================
  // External Wait Operations (C3)
  // ===========================================================================

  /**
   * Transition step to waiting (for external event) status
   *
   * @param id - Step state ID
   * @param eventType - Type of event being waited for
   * @param eventId - Optional event identifier
   * @param timeoutMs - Optional timeout
   * @returns Updated step state
   */
  markWaiting(
    id: string,
    eventType: string,
    eventId?: string,
    timeoutMs?: number
  ): Promise<StepState>;

  /**
   * Record external event received
   *
   * @param id - Step state ID
   * @param payload - Event payload
   * @returns Updated step state (returns to running status)
   */
  recordExternalEvent(id: string, payload?: unknown): Promise<StepState>;

  /**
   * Get steps waiting for a specific event type
   *
   * @param eventType - Event type to filter by
   * @param eventId - Optional event ID to filter by
   * @returns Array of waiting steps
   */
  getWaitingForEvent(eventType: string, eventId?: string): Promise<StepState[]>;

  /**
   * Check for timed-out waiting steps and mark them as failed
   *
   * @returns Number of steps that timed out
   */
  processTimeouts(): Promise<number>;

  // ===========================================================================
  // Retry Operations
  // ===========================================================================

  /**
   * Increment retry count and schedule next attempt
   *
   * @param id - Step state ID
   * @param error - Error from failed attempt
   * @param nextRetryAt - When to retry
   * @returns Updated step state
   */
  scheduleRetry(
    id: string,
    error: string,
    nextRetryAt: Date
  ): Promise<StepState>;

  /**
   * Get steps ready for retry
   *
   * @param limit - Maximum number to return
   * @returns Array of steps ready for retry
   */
  getRetryReady(limit?: number): Promise<StepState[]>;

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  /**
   * Check if the store is healthy
   *
   * @returns true if store is operational
   */
  healthCheck(): Promise<boolean>;

  /**
   * Close the store connection (cleanup)
   */
  close(): Promise<void>;
}

// =============================================================================
// Store Factory Types
// =============================================================================

/**
 * Options for creating a step state store
 */
export interface StepStateStoreOptions {
  /** Backend type */
  backend: 'memory' | 'firestore';
  /** Firestore-specific options */
  firestore?: {
    /** GCP project ID */
    projectId: string;
    /** Firestore database ID (default: '(default)') */
    databaseId?: string;
    /** Collection name (default: 'stepStates') */
    collection?: string;
  };
}

/**
 * Factory function type for creating step state stores
 */
export type StepStateStoreFactory = (
  options: StepStateStoreOptions
) => Promise<StepStateStore>;
