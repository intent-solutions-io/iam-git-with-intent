/**
 * Storage Module for Git With Intent
 *
 * Provides pluggable storage backends with a default SQLite implementation.
 *
 * Usage:
 * ```typescript
 * import { createStoreFactory } from '@gwi/core/storage';
 *
 * const factory = createStoreFactory();
 * const prStore = factory.createPRStore();
 * const runStore = factory.createRunStore();
 * ```
 *
 * Storage backend can be configured via GWI_STORAGE environment variable:
 * - sqlite (default): Local SQLite database
 * - turso: Turso edge database
 * - postgres: PostgreSQL
 * - firestore: Google Firestore
 * - memory: In-memory (for testing)
 *
 * For Firestore, set:
 * - GCP_PROJECT_ID: Google Cloud project ID
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON (optional in GCP)
 */

export * from './interfaces.js';
export { SQLiteStoreFactory } from './sqlite.js';

// Run status state machine (Critical C3: State machine validation)
export {
  RUN_STATUS_TRANSITIONS,
  InvalidRunStatusTransitionError,
  isValidRunStatusTransition,
  validateRunStatusTransition,
  isTerminalRunStatus,
  isRunInProgress,
  isRunFinished,
} from './run-status-machine.js';

// Schema migration utilities (A1.s4: Migration strategy)
export {
  SCHEMA_VERSIONS,
  needsMigration,
  getCurrentVersion,
  withSchemaVersion,
  migrateDocument,
  createMigrationId,
  DEFAULT_BACKFILL_OPTIONS,
  migrations,
  type CollectionType,
  type VersionedDocument,
  type MigrationFn,
  type MigrationRegistry,
  type BackfillOptions,
  type BackfillResult,
  type MigrationRecord,
} from './migration.js';
export {
  InMemoryRunStore,
  InMemoryTenantStore,
  InMemoryUserStore,
  InMemoryMembershipStore,
  InMemoryInstanceStore,
  InMemoryScheduleStore,
  // Phase 14: Signals → PR Queue
  InMemorySignalStore,
  InMemoryWorkItemStore,
  InMemoryPRCandidateStore,
} from './inmemory.js';

// Firestore exports
export {
  getFirestoreClient,
  closeFirestoreClient,
  getFirestoreConfig,
  COLLECTIONS,
  type FirestoreConfig,
} from './firestore-client.js';
export { FirestoreTenantStore } from './firestore-tenant.js';
export { FirestoreRunStore, OptimisticLockError } from './firestore-run.js';
export { FirestoreMembershipStore, getMembershipStore } from './firestore-membership.js';
export { FirestoreUserStore, getUserStore } from './firestore-user.js';

// Phase 11: Approval and Audit stores
export {
  FirestoreApprovalStore,
  InMemoryApprovalStore,
  getApprovalStore,
  resetApprovalStore,
} from './firestore-approval.js';
export {
  FirestoreAuditStore,
  InMemoryAuditStore,
  getAuditStore,
  resetAuditStore,
} from './firestore-audit.js';

// Phase 13: Instance and Schedule stores
export { FirestoreInstanceStore } from './firestore-instance.js';
export { FirestoreScheduleStore } from './firestore-schedule.js';

// Phase 14: Signal, WorkItem, and PRCandidate stores
export { FirestoreSignalStore } from './firestore-signal.js';
export { FirestoreWorkItemStore } from './firestore-workitem.js';
export { FirestorePRCandidateStore } from './firestore-candidate.js';

// Phase 22: Metering stores
export {
  FirestoreMeteringStore,
  InMemoryMeteringStore,
  getMeteringStore,
  setMeteringStore,
  resetMeteringStore,
  type MeteringStore,
  type EventQueryOptions,
} from './firestore-metering.js';

import type { StoreFactory, StorageConfig, TenantStore, RunStore, SignalStore, WorkItemStore, PRCandidateStore, InstanceStore, ScheduleStore } from './interfaces.js';
import { getStorageConfig } from './interfaces.js';
import { SQLiteStoreFactory } from './sqlite.js';
import { InMemoryTenantStore, InMemoryRunStore, InMemorySignalStore, InMemoryWorkItemStore, InMemoryPRCandidateStore, InMemoryInstanceStore, InMemoryScheduleStore } from './inmemory.js';
// Import Firestore stores for internal use in getter functions
import { FirestoreTenantStore } from './firestore-tenant.js';
import { FirestoreRunStore } from './firestore-run.js';
import { FirestoreInstanceStore } from './firestore-instance.js';
import { FirestoreScheduleStore } from './firestore-schedule.js';
import { FirestoreSignalStore } from './firestore-signal.js';
import { FirestoreWorkItemStore } from './firestore-workitem.js';
import { FirestorePRCandidateStore } from './firestore-candidate.js';

/**
 * Create a store factory based on configuration
 *
 * By default, uses SQLite. Set GWI_STORAGE to use a different backend.
 */
export function createStoreFactory(config?: Partial<StorageConfig>): StoreFactory {
  const finalConfig = { ...getStorageConfig(), ...config };

  switch (finalConfig.type) {
    case 'sqlite':
      return new SQLiteStoreFactory(finalConfig.sqlitePath);

    case 'turso':
      // Alternative storage backends tracked in git-with-intent-u08v
      throw new Error('Turso storage not yet implemented. Use sqlite for now.');

    case 'postgres':
      // Alternative storage backends tracked in git-with-intent-u08v
      throw new Error('PostgreSQL storage not yet implemented. Use sqlite for now.');

    case 'firestore':
      // Alternative storage backends tracked in git-with-intent-u08v
      throw new Error('Firestore storage not yet implemented. Use sqlite for now.');

    case 'memory':
      // Alternative storage backends tracked in git-with-intent-u08v
      throw new Error('Memory storage not yet implemented. Use sqlite for now.');

    default:
      console.warn(`Unknown storage type: ${finalConfig.type}. Falling back to SQLite.`);
      return new SQLiteStoreFactory(finalConfig.sqlitePath);
  }
}

/**
 * Default store factory instance (lazy initialized)
 */
let defaultFactory: StoreFactory | null = null;

/**
 * Get the default store factory
 *
 * Creates a singleton instance using environment configuration.
 */
export function getDefaultStoreFactory(): StoreFactory {
  if (!defaultFactory) {
    defaultFactory = createStoreFactory();
  }
  return defaultFactory;
}

/**
 * Close the default store factory
 *
 * Call this during shutdown to clean up resources.
 */
export async function closeDefaultStoreFactory(): Promise<void> {
  if (defaultFactory) {
    await defaultFactory.close();
    defaultFactory = null;
  }
}

// =============================================================================
// Direct Store Access (Environment-based)
// =============================================================================

/**
 * Storage backend type from environment
 */
export type StoreBackend = 'memory' | 'firestore';

/**
 * Get the storage backend from environment
 *
 * Set GWI_STORE_BACKEND to 'firestore' for production.
 * Defaults to 'memory' for development.
 */
export function getStoreBackend(): StoreBackend {
  const backend = process.env.GWI_STORE_BACKEND?.toLowerCase();
  if (backend === 'firestore') {
    return 'firestore';
  }
  return 'memory';
}

// Singleton instances for direct store access
let tenantStoreInstance: TenantStore | null = null;
let runStoreInstance: RunStore | null = null;

/**
 * Get the TenantStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns TenantStore instance (singleton)
 */
export function getTenantStore(): TenantStore {
  if (tenantStoreInstance) {
    return tenantStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    tenantStoreInstance = new FirestoreTenantStore() as TenantStore;
  } else {
    tenantStoreInstance = new InMemoryTenantStore();
  }

  return tenantStoreInstance!;
}

/**
 * Get the RunStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns RunStore instance (singleton)
 */
export function getRunStore(): RunStore {
  if (runStoreInstance) {
    return runStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    runStoreInstance = new FirestoreRunStore() as RunStore;
  } else {
    runStoreInstance = new InMemoryRunStore();
  }

  return runStoreInstance!;
}

/**
 * Reset store singletons (for testing)
 */
export function resetStores(): void {
  tenantStoreInstance = null;
  runStoreInstance = null;
  instanceStoreInstance = null;
  scheduleStoreInstance = null;
  signalStoreInstance = null;
  workItemStoreInstance = null;
  prCandidateStoreInstance = null;
}

// =============================================================================
// Phase 13: Instance and Schedule Store Access
// =============================================================================

// Singleton instances for Phase 13 stores
let instanceStoreInstance: InstanceStore | null = null;
let scheduleStoreInstance: ScheduleStore | null = null;

/**
 * Get the InstanceStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns InstanceStore instance (singleton)
 */
export function getInstanceStore(): InstanceStore {
  if (instanceStoreInstance) {
    return instanceStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    instanceStoreInstance = new FirestoreInstanceStore() as InstanceStore;
  } else {
    instanceStoreInstance = new InMemoryInstanceStore();
  }

  return instanceStoreInstance;
}

/**
 * Get the ScheduleStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns ScheduleStore instance (singleton)
 */
export function getScheduleStore(): ScheduleStore {
  if (scheduleStoreInstance) {
    return scheduleStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    scheduleStoreInstance = new FirestoreScheduleStore() as ScheduleStore;
  } else {
    scheduleStoreInstance = new InMemoryScheduleStore();
  }

  return scheduleStoreInstance;
}

// =============================================================================
// Phase 14: Signal and PR Queue Store Access
// =============================================================================

// Singleton instances for Phase 14 stores
let signalStoreInstance: SignalStore | null = null;
let workItemStoreInstance: WorkItemStore | null = null;
let prCandidateStoreInstance: PRCandidateStore | null = null;

/**
 * Get the SignalStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns SignalStore instance (singleton)
 */
export function getSignalStore(): SignalStore {
  if (signalStoreInstance) {
    return signalStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    signalStoreInstance = new FirestoreSignalStore() as SignalStore;
  } else {
    signalStoreInstance = new InMemorySignalStore();
  }

  return signalStoreInstance;
}

/**
 * Get the WorkItemStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns WorkItemStore instance (singleton)
 */
export function getWorkItemStore(): WorkItemStore {
  if (workItemStoreInstance) {
    return workItemStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    workItemStoreInstance = new FirestoreWorkItemStore() as WorkItemStore;
  } else {
    workItemStoreInstance = new InMemoryWorkItemStore();
  }

  return workItemStoreInstance;
}

/**
 * Get the PRCandidateStore based on environment configuration
 *
 * Uses Firestore when GWI_STORE_BACKEND=firestore, otherwise in-memory.
 *
 * @returns PRCandidateStore instance (singleton)
 */
export function getPRCandidateStore(): PRCandidateStore {
  if (prCandidateStoreInstance) {
    return prCandidateStoreInstance;
  }

  const backend = getStoreBackend();

  if (backend === 'firestore') {
    // Use statically imported Firestore store
    prCandidateStoreInstance = new FirestorePRCandidateStore() as PRCandidateStore;
  } else {
    prCandidateStoreInstance = new InMemoryPRCandidateStore();
  }

  return prCandidateStoreInstance;
}

/**
 * Reset Phase 14 store singletons (for testing)
 */
export function resetPhase14Stores(): void {
  signalStoreInstance = null;
  workItemStoreInstance = null;
  prCandidateStoreInstance = null;
}
