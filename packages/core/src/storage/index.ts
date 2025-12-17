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
export {
  InMemoryRunStore,
  InMemoryTenantStore,
  InMemoryUserStore,
  InMemoryMembershipStore,
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
export { FirestoreRunStore } from './firestore-run.js';
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

import type { StoreFactory, StorageConfig, TenantStore, RunStore } from './interfaces.js';
import { getStorageConfig } from './interfaces.js';
import { SQLiteStoreFactory } from './sqlite.js';
import { InMemoryTenantStore, InMemoryRunStore } from './inmemory.js';

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
      // TODO: Implement TursoStoreFactory
      throw new Error('Turso storage not yet implemented. Use sqlite for now.');

    case 'postgres':
      // TODO: Implement PostgresStoreFactory
      throw new Error('PostgreSQL storage not yet implemented. Use sqlite for now.');

    case 'firestore':
      // TODO: Implement FirestoreStoreFactory
      throw new Error('Firestore storage not yet implemented. Use sqlite for now.');

    case 'memory':
      // TODO: Implement MemoryStoreFactory for testing
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
    // Dynamic import to avoid requiring firebase-admin when not using Firestore
    const { FirestoreTenantStore } = require('./firestore-tenant.js');
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
    // Dynamic import to avoid requiring firebase-admin when not using Firestore
    const { FirestoreRunStore } = require('./firestore-run.js');
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
}
