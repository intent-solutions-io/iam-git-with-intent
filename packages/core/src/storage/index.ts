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
 * - agentfs: AgentFS (internal only)
 */

export * from './interfaces.js';
export { SQLiteStoreFactory } from './sqlite.js';
export {
  InMemoryRunStore,
  InMemoryTenantStore,
  InMemoryUserStore,
  InMemoryMembershipStore,
} from './inmemory.js';

import type { StoreFactory, StorageConfig } from './interfaces.js';
import { getStorageConfig } from './interfaces.js';
import { SQLiteStoreFactory } from './sqlite.js';

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

    case 'agentfs':
      // Internal only - check for explicit opt-in
      if (process.env.GWI_USE_AGENTFS !== 'true') {
        console.warn('AgentFS storage is internal-only. Falling back to SQLite.');
        return new SQLiteStoreFactory(finalConfig.sqlitePath);
      }
      // TODO: Implement AgentFSStoreFactory
      throw new Error('AgentFS storage not yet implemented.');

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
