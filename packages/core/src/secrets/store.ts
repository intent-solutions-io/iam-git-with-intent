/**
 * Secrets Store Interface and Implementations
 *
 * Epic E: RBAC & Governance - Secrets Management
 *
 * Provides the storage layer for encrypted secrets.
 * All implementations store encrypted blobs, never plaintext.
 *
 * SECURITY REQUIREMENTS:
 * - All secret values are stored encrypted (AES-256-GCM)
 * - IVs are unique per secret and stored alongside encrypted data
 * - Secret values are NEVER logged
 * - All operations emit audit events
 *
 * @module @gwi/core/secrets/store
 */

import { getFirestoreClient, generateFirestoreId, timestampToDate } from '../storage/firestore-client.js';
import type { Firestore } from 'firebase-admin/firestore';

// =============================================================================
// Types
// =============================================================================

/**
 * Metadata for a secret
 */
export interface SecretMetadata {
  /** Human-readable description */
  description?: string;
  /** Tags for organization */
  tags?: string[];
  /** Expiration date (optional) */
  expiresAt?: Date;
  /** Custom key-value pairs */
  custom?: Record<string, string>;
}

/**
 * Stored secret record (encrypted)
 */
export interface StoredSecret {
  /** Unique secret ID */
  id: string;
  /** Tenant ID (for isolation) */
  tenantId: string;
  /** Secret name (unique within tenant) */
  name: string;
  /** Encrypted value (Base64-encoded) */
  encryptedValue: string;
  /** Initialization vector for AES-GCM (Base64-encoded) */
  iv: string;
  /** Auth tag for AES-GCM (Base64-encoded) */
  authTag: string;
  /** Algorithm used for encryption */
  algorithm: 'aes-256-gcm';
  /** Key derivation info (salt, if using derived key) */
  keyDerivation?: {
    salt: string;
    iterations: number;
    algorithm: 'pbkdf2-sha256';
  };
  /** Secret metadata (not encrypted) */
  metadata?: SecretMetadata;
  /** Version number (increments on rotation) */
  version: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Last rotation timestamp */
  rotatedAt?: Date;
  /** User who created the secret */
  createdBy: string;
  /** User who last updated the secret */
  updatedBy: string;
}

/**
 * Input for creating a secret
 */
export interface CreateSecretInput {
  tenantId: string;
  name: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
  keyDerivation?: {
    salt: string;
    iterations: number;
    algorithm: 'pbkdf2-sha256';
  };
  metadata?: SecretMetadata;
  createdBy: string;
}

/**
 * Input for updating a secret
 */
export interface UpdateSecretInput {
  encryptedValue: string;
  iv: string;
  authTag: string;
  metadata?: SecretMetadata;
  updatedBy: string;
  isRotation?: boolean;
}

/**
 * Secret list item (without encrypted value)
 */
export interface SecretListItem {
  id: string;
  tenantId: string;
  name: string;
  metadata?: SecretMetadata;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  rotatedAt?: Date;
  createdBy: string;
  updatedBy: string;
}

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Secret store interface
 *
 * Implementations must ensure:
 * - Tenant isolation (secrets are scoped to tenants)
 * - Secret names are unique within a tenant
 * - All CRUD operations are atomic
 */
export interface SecretStore {
  /**
   * Store a new secret
   * @throws Error if secret with same name exists
   */
  createSecret(input: CreateSecretInput): Promise<StoredSecret>;

  /**
   * Retrieve a secret by tenant and name
   * @returns StoredSecret or null if not found
   */
  getSecret(tenantId: string, name: string): Promise<StoredSecret | null>;

  /**
   * Retrieve a secret by ID
   * @returns StoredSecret or null if not found
   */
  getSecretById(secretId: string): Promise<StoredSecret | null>;

  /**
   * List all secrets for a tenant (without encrypted values)
   */
  listSecrets(tenantId: string): Promise<SecretListItem[]>;

  /**
   * Update a secret (for rotation or metadata update)
   * Increments version on each update
   */
  updateSecret(tenantId: string, name: string, input: UpdateSecretInput): Promise<StoredSecret>;

  /**
   * Delete a secret
   * @returns true if deleted, false if not found
   */
  deleteSecret(tenantId: string, name: string): Promise<boolean>;

  /**
   * Delete all secrets for a tenant (used in tenant cleanup)
   * @returns Number of secrets deleted
   */
  deleteAllTenantSecrets(tenantId: string): Promise<number>;

  /**
   * Check if a secret exists
   */
  secretExists(tenantId: string, name: string): Promise<boolean>;
}

// =============================================================================
// In-Memory Implementation (Testing)
// =============================================================================

/**
 * In-memory secret store for testing
 *
 * WARNING: Not for production use.
 * - Stores secrets in memory (lost on restart)
 * - No persistence
 * - No encryption at rest
 */
export class InMemorySecretStore implements SecretStore {
  private secrets = new Map<string, StoredSecret>();

  /**
   * Generate composite key for tenant + name lookup
   */
  private getKey(tenantId: string, name: string): string {
    return `${tenantId}:${name}`;
  }

  async createSecret(input: CreateSecretInput): Promise<StoredSecret> {
    const key = this.getKey(input.tenantId, input.name);

    if (this.secrets.has(key)) {
      throw new Error(`Secret with name '${input.name}' already exists for tenant`);
    }

    const now = new Date();
    const secret: StoredSecret = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: input.tenantId,
      name: input.name,
      encryptedValue: input.encryptedValue,
      iv: input.iv,
      authTag: input.authTag,
      algorithm: input.algorithm,
      keyDerivation: input.keyDerivation,
      metadata: input.metadata,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    };

    this.secrets.set(key, secret);
    return secret;
  }

  async getSecret(tenantId: string, name: string): Promise<StoredSecret | null> {
    const key = this.getKey(tenantId, name);
    return this.secrets.get(key) || null;
  }

  async getSecretById(secretId: string): Promise<StoredSecret | null> {
    const secrets = Array.from(this.secrets.values());
    for (const secret of secrets) {
      if (secret.id === secretId) {
        return secret;
      }
    }
    return null;
  }

  async listSecrets(tenantId: string): Promise<SecretListItem[]> {
    const items: SecretListItem[] = [];
    const secrets = Array.from(this.secrets.values());

    for (const secret of secrets) {
      if (secret.tenantId === tenantId) {
        // Return list item without encrypted value
        items.push({
          id: secret.id,
          tenantId: secret.tenantId,
          name: secret.name,
          metadata: secret.metadata,
          version: secret.version,
          createdAt: secret.createdAt,
          updatedAt: secret.updatedAt,
          rotatedAt: secret.rotatedAt,
          createdBy: secret.createdBy,
          updatedBy: secret.updatedBy,
        });
      }
    }

    // Sort by name
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async updateSecret(tenantId: string, name: string, input: UpdateSecretInput): Promise<StoredSecret> {
    const key = this.getKey(tenantId, name);
    const existing = this.secrets.get(key);

    if (!existing) {
      throw new Error(`Secret '${name}' not found for tenant`);
    }

    const now = new Date();
    const updated: StoredSecret = {
      ...existing,
      encryptedValue: input.encryptedValue,
      iv: input.iv,
      authTag: input.authTag,
      metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
      version: existing.version + 1,
      updatedAt: now,
      updatedBy: input.updatedBy,
      rotatedAt: input.isRotation ? now : existing.rotatedAt,
    };

    this.secrets.set(key, updated);
    return updated;
  }

  async deleteSecret(tenantId: string, name: string): Promise<boolean> {
    const key = this.getKey(tenantId, name);
    return this.secrets.delete(key);
  }

  async deleteAllTenantSecrets(tenantId: string): Promise<number> {
    let count = 0;
    const entries = Array.from(this.secrets.entries());
    for (const [key, secret] of entries) {
      if (secret.tenantId === tenantId) {
        this.secrets.delete(key);
        count++;
      }
    }
    return count;
  }

  async secretExists(tenantId: string, name: string): Promise<boolean> {
    const key = this.getKey(tenantId, name);
    return this.secrets.has(key);
  }

  // Testing helpers
  clear(): void {
    this.secrets.clear();
  }

  getAll(): StoredSecret[] {
    return Array.from(this.secrets.values());
  }
}

// =============================================================================
// Firestore Implementation (Production)
// =============================================================================

/**
 * Firestore collection name for secrets
 */
export const SECRETS_COLLECTION = 'gwi_secrets';

/**
 * Firestore secret store implementation
 *
 * Collection structure:
 * - gwi_secrets/{secretId} - Secret documents with tenant index
 *
 * Required indexes:
 * - (tenantId, name) - Unique constraint for secret names
 * - (tenantId, createdAt) - For listing secrets
 */
export class FirestoreSecretStore implements SecretStore {
  private get db(): Firestore {
    return getFirestoreClient();
  }

  private get collection() {
    return this.db.collection(SECRETS_COLLECTION);
  }

  async createSecret(input: CreateSecretInput): Promise<StoredSecret> {
    // Check if secret with same name exists
    const existing = await this.getSecret(input.tenantId, input.name);
    if (existing) {
      throw new Error(`Secret with name '${input.name}' already exists for tenant`);
    }

    const now = new Date();
    const id = generateFirestoreId('sec');

    const secret: StoredSecret = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      encryptedValue: input.encryptedValue,
      iv: input.iv,
      authTag: input.authTag,
      algorithm: input.algorithm,
      keyDerivation: input.keyDerivation,
      metadata: input.metadata,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    };

    await this.collection.doc(id).set({
      ...secret,
      // Add indexed fields for queries
      _tenantId: input.tenantId,
      _name: input.name,
      _createdAt: now,
      _updatedAt: now,
    });

    return secret;
  }

  async getSecret(tenantId: string, name: string): Promise<StoredSecret | null> {
    const snapshot = await this.collection
      .where('_tenantId', '==', tenantId)
      .where('_name', '==', name)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return this.docToSecret(snapshot.docs[0]);
  }

  async getSecretById(secretId: string): Promise<StoredSecret | null> {
    const doc = await this.collection.doc(secretId).get();

    if (!doc.exists) {
      return null;
    }

    return this.docToSecret(doc);
  }

  async listSecrets(tenantId: string): Promise<SecretListItem[]> {
    const snapshot = await this.collection
      .where('_tenantId', '==', tenantId)
      .orderBy('_name')
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        name: data.name,
        metadata: data.metadata,
        version: data.version,
        createdAt: timestampToDate(data.createdAt) || new Date(),
        updatedAt: timestampToDate(data.updatedAt) || new Date(),
        rotatedAt: timestampToDate(data.rotatedAt),
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      };
    });
  }

  async updateSecret(tenantId: string, name: string, input: UpdateSecretInput): Promise<StoredSecret> {
    const existing = await this.getSecret(tenantId, name);
    if (!existing) {
      throw new Error(`Secret '${name}' not found for tenant`);
    }

    const now = new Date();
    const updates: Partial<StoredSecret> & { _updatedAt: Date; _rotatedAt?: Date } = {
      encryptedValue: input.encryptedValue,
      iv: input.iv,
      authTag: input.authTag,
      version: existing.version + 1,
      updatedAt: now,
      updatedBy: input.updatedBy,
      _updatedAt: now,
    };

    if (input.metadata !== undefined) {
      updates.metadata = input.metadata;
    }

    if (input.isRotation) {
      updates.rotatedAt = now;
      updates._rotatedAt = now;
    }

    await this.collection.doc(existing.id).update(updates);

    return {
      ...existing,
      ...updates,
      metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
    };
  }

  async deleteSecret(tenantId: string, name: string): Promise<boolean> {
    const existing = await this.getSecret(tenantId, name);
    if (!existing) {
      return false;
    }

    await this.collection.doc(existing.id).delete();
    return true;
  }

  async deleteAllTenantSecrets(tenantId: string): Promise<number> {
    const snapshot = await this.collection
      .where('_tenantId', '==', tenantId)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    // Delete in batches of 500 (Firestore limit)
    const batch = this.db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
    }

    await batch.commit();
    return count;
  }

  async secretExists(tenantId: string, name: string): Promise<boolean> {
    const snapshot = await this.collection
      .where('_tenantId', '==', tenantId)
      .where('_name', '==', name)
      .select()  // Don't fetch data
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Convert Firestore document to StoredSecret
   */
  private docToSecret(doc: FirebaseFirestore.DocumentSnapshot): StoredSecret {
    const data = doc.data()!;

    return {
      id: doc.id,
      tenantId: data.tenantId,
      name: data.name,
      encryptedValue: data.encryptedValue,
      iv: data.iv,
      authTag: data.authTag,
      algorithm: data.algorithm,
      keyDerivation: data.keyDerivation,
      metadata: data.metadata,
      version: data.version,
      createdAt: timestampToDate(data.createdAt) || new Date(),
      updatedAt: timestampToDate(data.updatedAt) || new Date(),
      rotatedAt: timestampToDate(data.rotatedAt),
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
    };
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let secretStoreInstance: SecretStore | null = null;

/**
 * Get the secret store based on environment
 *
 * Production: Uses Firestore
 * Development/Testing: Uses in-memory store
 */
export function getSecretStore(): SecretStore {
  if (secretStoreInstance) {
    return secretStoreInstance;
  }

  const backend = process.env.GWI_STORE_BACKEND?.toLowerCase();

  if (backend === 'firestore') {
    secretStoreInstance = new FirestoreSecretStore();
  } else {
    secretStoreInstance = new InMemorySecretStore();
  }

  return secretStoreInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetSecretStore(): void {
  secretStoreInstance = null;
}

/**
 * Set custom store (for testing)
 */
export function setSecretStore(store: SecretStore): void {
  secretStoreInstance = store;
}
