/**
 * Schema Migration Module for Git With Intent
 *
 * Provides schema versioning and migration utilities for Firestore documents.
 * All documents include a schemaVersion field to support future migrations.
 *
 * Migration Strategy:
 * 1. All new documents written with current schema version
 * 2. On read, documents with older versions are migrated in-memory
 * 3. Backfill jobs can update older documents in batches
 * 4. Version checks happen at runtime, not on every read (lazy migration)
 */

// =============================================================================
// Schema Version Constants
// =============================================================================

/**
 * Current schema versions for each collection.
 * Increment when making breaking changes to document structure.
 */
export const SCHEMA_VERSIONS = {
  // Core collections
  tenant: 1,
  repo: 1,
  run: 1,
  step: 1,
  user: 1,
  membership: 1,
  installation: 1,
  approval: 1,
  auditEvent: 1,

  // Phase 13: Workflow
  instance: 1,
  schedule: 1,

  // Phase 14: Signal/Queue
  signal: 1,
  workItem: 1,
  prCandidate: 1,

  // Phase 16: Reliability
  runLock: 1,
  idempotency: 1,
  checkpoint: 1,

  // Phase 22: Metering
  usageEvent: 1,
  usageDaily: 1,
  usageMonthly: 1,
  usageSnapshot: 1,
} as const;

export type CollectionType = keyof typeof SCHEMA_VERSIONS;

// =============================================================================
// Migration Types
// =============================================================================

/**
 * Document with schema version (base type for all Firestore documents)
 */
export interface VersionedDocument {
  /** Schema version for this document type */
  schemaVersion: number;
}

/**
 * Migration function signature
 */
export type MigrationFn<T> = (doc: T) => T;

/**
 * Migration registry for a collection
 */
export interface MigrationRegistry<T> {
  /** Collection name */
  collection: CollectionType;
  /** Migrations indexed by source version (migrates from version N to N+1) */
  migrations: Map<number, MigrationFn<T>>;
}

// =============================================================================
// Migration Utilities
// =============================================================================

/**
 * Check if a document needs migration
 */
export function needsMigration(
  doc: VersionedDocument | undefined,
  collectionType: CollectionType
): boolean {
  if (!doc) return false;
  const currentVersion = SCHEMA_VERSIONS[collectionType];
  const docVersion = doc.schemaVersion ?? 0;
  return docVersion < currentVersion;
}

/**
 * Get the current schema version for a collection
 */
export function getCurrentVersion(collectionType: CollectionType): number {
  return SCHEMA_VERSIONS[collectionType];
}

/**
 * Add schema version to a new document
 */
export function withSchemaVersion<T extends object>(
  doc: T,
  collectionType: CollectionType
): T & VersionedDocument {
  return {
    ...doc,
    schemaVersion: SCHEMA_VERSIONS[collectionType],
  };
}

/**
 * Migrate a document through all necessary versions
 */
export function migrateDocument<T extends VersionedDocument>(
  doc: T,
  collectionType: CollectionType,
  registry: MigrationRegistry<T>
): T {
  const targetVersion = SCHEMA_VERSIONS[collectionType];
  let currentDoc = doc;
  let currentVersion = doc.schemaVersion ?? 0;

  while (currentVersion < targetVersion) {
    const migration = registry.migrations.get(currentVersion);
    if (!migration) {
      throw new Error(
        `Missing migration for ${collectionType} from version ${currentVersion} to ${currentVersion + 1}`
      );
    }
    currentDoc = migration(currentDoc);
    currentVersion++;
    currentDoc = { ...currentDoc, schemaVersion: currentVersion };
  }

  return currentDoc;
}

// =============================================================================
// Backfill Utilities
// =============================================================================

/**
 * Backfill options
 */
export interface BackfillOptions {
  /** Batch size for updates */
  batchSize: number;
  /** Dry run (log but don't update) */
  dryRun: boolean;
  /** Target version (defaults to current) */
  targetVersion?: number;
  /** Rate limit (documents per second) */
  rateLimit?: number;
}

/**
 * Backfill result
 */
export interface BackfillResult {
  /** Total documents scanned */
  scanned: number;
  /** Documents migrated */
  migrated: number;
  /** Documents already current */
  skipped: number;
  /** Errors encountered */
  errors: Array<{ id: string; error: string }>;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Default backfill options
 */
export const DEFAULT_BACKFILL_OPTIONS: BackfillOptions = {
  batchSize: 100,
  dryRun: false,
  rateLimit: 50,
};

// =============================================================================
// Migration History Tracking
// =============================================================================

/**
 * Migration history record (stored in gwi_migrations collection)
 */
export interface MigrationRecord {
  /** Migration ID (collection_version format) */
  id: string;
  /** Collection being migrated */
  collection: CollectionType;
  /** Source version */
  fromVersion: number;
  /** Target version */
  toVersion: number;
  /** When migration started */
  startedAt: Date;
  /** When migration completed */
  completedAt?: Date;
  /** Migration status */
  status: 'running' | 'completed' | 'failed' | 'rolled_back';
  /** Documents processed */
  documentsProcessed: number;
  /** Error message if failed */
  error?: string;
  /** User who initiated the migration */
  initiatedBy: string;
}

/**
 * Create a migration record ID
 */
export function createMigrationId(
  collection: CollectionType,
  fromVersion: number,
  toVersion: number
): string {
  return `${collection}_v${fromVersion}_to_v${toVersion}`;
}

// =============================================================================
// Collection-Specific Migration Registries
// =============================================================================

/**
 * Tenant document migrations
 * Add new migrations as schema evolves
 */
export function createTenantMigrations(): MigrationRegistry<VersionedDocument & Record<string, unknown>> {
  const migrations = new Map<number, MigrationFn<VersionedDocument & Record<string, unknown>>>();

  // Example: Migration from v0 to v1 (initial schemaVersion)
  migrations.set(0, (doc) => ({
    ...doc,
    // Add any default fields that were added in v1
    schemaVersion: 1,
  }));

  // Future migrations would be added here:
  // migrations.set(1, (doc) => ({ ...doc, newField: 'default', schemaVersion: 2 }));

  return {
    collection: 'tenant',
    migrations,
  };
}

/**
 * Run document migrations
 */
export function createRunMigrations(): MigrationRegistry<VersionedDocument & Record<string, unknown>> {
  const migrations = new Map<number, MigrationFn<VersionedDocument & Record<string, unknown>>>();

  migrations.set(0, (doc) => ({
    ...doc,
    schemaVersion: 1,
  }));

  return {
    collection: 'run',
    migrations,
  };
}

/**
 * User document migrations
 */
export function createUserMigrations(): MigrationRegistry<VersionedDocument & Record<string, unknown>> {
  const migrations = new Map<number, MigrationFn<VersionedDocument & Record<string, unknown>>>();

  migrations.set(0, (doc) => ({
    ...doc,
    schemaVersion: 1,
  }));

  return {
    collection: 'user',
    migrations,
  };
}

// =============================================================================
// Exports
// =============================================================================

export const migrations = {
  tenant: createTenantMigrations(),
  run: createRunMigrations(),
  user: createUserMigrations(),
};
