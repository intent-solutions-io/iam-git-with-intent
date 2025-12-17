/**
 * Firestore Client Module
 *
 * Centralized Firestore client initialization with proper credential handling.
 * Used by all Firestore store implementations.
 *
 * Environment Variables:
 * - GCP_PROJECT_ID: Google Cloud project ID
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON (optional in GCP)
 * - GWI_FIRESTORE_EMULATOR_HOST: Firestore emulator host (for testing)
 *
 * @module @gwi/core/storage/firestore
 */

import { initializeApp, cert, getApps, getApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, Timestamp } from 'firebase-admin/firestore';

// =============================================================================
// Firestore Configuration
// =============================================================================

export interface FirestoreConfig {
  /**
   * GCP project ID
   */
  projectId: string;

  /**
   * Path to service account JSON (optional in GCP environments)
   */
  credentialsPath?: string;

  /**
   * Firestore emulator host (for testing)
   */
  emulatorHost?: string;

  /**
   * Database ID (default: "(default)")
   */
  databaseId?: string;
}

/**
 * Read Firestore configuration from environment
 */
export function getFirestoreConfig(): FirestoreConfig | null {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;

  if (!projectId) {
    return null;
  }

  return {
    projectId,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    emulatorHost: process.env.GWI_FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST,
    databaseId: process.env.GWI_FIRESTORE_DATABASE_ID || '(default)',
  };
}

// =============================================================================
// Firestore Client Singleton
// =============================================================================

let firestoreInstance: Firestore | null = null;
let firebaseApp: App | null = null;

/**
 * Get Firestore client instance (singleton)
 *
 * Initializes Firebase Admin SDK if not already initialized.
 * Uses Application Default Credentials in GCP environments.
 *
 * @returns Firestore client instance
 * @throws Error if configuration is missing
 */
export function getFirestoreClient(config?: Partial<FirestoreConfig>): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const envConfig = getFirestoreConfig();
  const finalConfig = { ...envConfig, ...config };

  if (!finalConfig.projectId) {
    throw new Error(
      'Firestore configuration missing. Set GCP_PROJECT_ID environment variable.'
    );
  }

  // Set emulator host if configured
  if (finalConfig.emulatorHost) {
    process.env.FIRESTORE_EMULATOR_HOST = finalConfig.emulatorHost;
  }

  // Initialize Firebase Admin SDK
  const apps = getApps();
  if (apps.length === 0) {
    const appConfig: Record<string, unknown> = {
      projectId: finalConfig.projectId,
    };

    // Use explicit credentials if provided
    if (finalConfig.credentialsPath) {
      appConfig.credential = cert(finalConfig.credentialsPath);
    }
    // Otherwise, use Application Default Credentials (automatic in GCP)

    firebaseApp = initializeApp(appConfig);
  } else {
    firebaseApp = getApp();
  }

  // Get Firestore instance
  firestoreInstance = getFirestore(firebaseApp);

  // Configure Firestore settings
  firestoreInstance.settings({
    ignoreUndefinedProperties: true,
  });

  return firestoreInstance;
}

/**
 * Close Firestore client and cleanup
 */
export async function closeFirestoreClient(): Promise<void> {
  if (firestoreInstance) {
    await firestoreInstance.terminate();
    firestoreInstance = null;
  }
  // Note: Firebase Admin doesn't have a clean way to delete apps
  // In production, the process termination handles cleanup
  firebaseApp = null;
}

// =============================================================================
// Firestore Collection Constants
// =============================================================================

/**
 * Firestore collection names for git-with-intent
 */
export const COLLECTIONS = {
  /** Tenants (GitHub org installations) */
  TENANTS: 'gwi_tenants',
  /** Repos within tenants */
  REPOS: 'repos',  // Subcollection under tenants
  /** Runs (multi-agent pipeline executions) */
  RUNS: 'gwi_runs',
  /** Users */
  USERS: 'gwi_users',
  /** Memberships (user-tenant relationships) */
  MEMBERSHIPS: 'gwi_memberships',
  /** Steps within runs */
  STEPS: 'steps',  // Subcollection under runs
  /** Phase 11: Approval records */
  APPROVALS: 'gwi_approvals',
  /** Phase 11: Audit events */
  AUDIT_EVENTS: 'gwi_audit_events',
} as const;

// =============================================================================
// Firestore Utility Functions
// =============================================================================

/**
 * Convert Firestore Timestamp to Date
 */
export function timestampToDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Convert Date to Firestore Timestamp
 */
export function dateToTimestamp(date: Date | undefined): Timestamp | undefined {
  if (!date) return undefined;
  return Timestamp.fromDate(date);
}

/**
 * Generate a Firestore-friendly ID
 *
 * @param prefix - Optional prefix for the ID
 * @returns A unique ID string
 */
export function generateFirestoreId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Batch converter for Firestore documents
 *
 * Handles converting Firestore Timestamps to Dates in document data.
 */
export function convertTimestamps<T extends Record<string, unknown>>(
  data: T,
  timestampFields: (keyof T)[]
): T {
  const result = { ...data };
  for (const field of timestampFields) {
    const value = result[field];
    if (value instanceof Timestamp) {
      (result as Record<string, unknown>)[field as string] = value.toDate();
    }
  }
  return result;
}
