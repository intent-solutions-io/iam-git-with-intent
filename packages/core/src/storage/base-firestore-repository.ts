/**
 * Base Firestore Repository
 *
 * Generic base class for Firestore-backed repositories.
 * Eliminates ~70% of repetitive code across 13+ Firestore stores.
 *
 * Features:
 * - Generic CRUD operations (create, get, list, update, delete)
 * - Automatic timestamp conversion (Date ↔ Firestore Timestamp)
 * - Tenant-scoped and top-level collection support
 * - Type-safe document conversion
 * - Pagination with offset/limit
 * - ID generation with prefix
 *
 * @module @gwi/core/storage/base-firestore-repository
 */

import type {
  Firestore,
  DocumentReference,
  CollectionReference,
  Query,
  DocumentData,
  WithFieldValue,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import {
  getFirestoreClient,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
} from './firestore-client.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Base entity interface - all stored entities must have at least an ID
 */
export interface BaseEntity {
  id: string;
}

/**
 * Entity with standard timestamps
 */
export interface TimestampedEntity extends BaseEntity {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entity with tenant scope
 */
export interface TenantScopedEntity extends BaseEntity {
  tenantId: string;
}

/**
 * Configuration for converting a field to/from Firestore
 */
export interface FieldConverter<TModel, TDoc> {
  /** Convert from Firestore document field to model field */
  toModel: (docValue: TDoc) => TModel;
  /** Convert from model field to Firestore document field */
  toDoc: (modelValue: TModel) => TDoc;
}

/**
 * Repository configuration options
 */
export interface RepositoryConfig<TModel extends BaseEntity, TDoc extends DocumentData> {
  /**
   * Collection name (for top-level collections)
   */
  collection?: string;

  /**
   * Parent collection and subcollection names (for tenant-scoped collections)
   * e.g., { parent: 'gwi_tenants', subcollection: 'signals' }
   */
  tenantScoped?: {
    parentCollection: string;
    subcollection: string;
  };

  /**
   * ID prefix for generated IDs (e.g., 'sig', 'wi', 'prc')
   */
  idPrefix: string;

  /**
   * Fields that should be converted from Timestamp to Date
   */
  timestampFields: (keyof TDoc)[];

  /**
   * Convert Firestore document to model
   */
  docToModel: (doc: TDoc, id: string) => TModel;

  /**
   * Convert model to Firestore document
   */
  modelToDoc: (model: TModel) => TDoc;

  /**
   * Optional custom field converters for complex nested structures
   */
  fieldConverters?: Partial<Record<keyof TDoc, FieldConverter<unknown, unknown>>>;
}

/**
 * Filter options for list queries
 */
export interface ListFilter {
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip (implemented client-side for Firestore) */
  offset?: number;
}

/**
 * Query condition for building Firestore queries
 */
export interface QueryCondition {
  field: string;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
  value: unknown;
}

// =============================================================================
// Base Firestore Repository
// =============================================================================

/**
 * Generic base class for Firestore-backed repositories
 *
 * @template TModel - The domain model type
 * @template TDoc - The Firestore document type
 *
 * @example
 * ```typescript
 * // Top-level collection
 * class UserRepository extends BaseFirestoreRepository<User, UserDoc> {
 *   constructor(db?: Firestore) {
 *     super(db, {
 *       collection: 'gwi_users',
 *       idPrefix: 'usr',
 *       timestampFields: ['createdAt', 'updatedAt', 'lastLoginAt'],
 *       docToModel: userDocToModel,
 *       modelToDoc: userModelToDoc,
 *     });
 *   }
 * }
 *
 * // Tenant-scoped subcollection
 * class SignalRepository extends BaseFirestoreRepository<Signal, SignalDoc> {
 *   constructor(db?: Firestore) {
 *     super(db, {
 *       tenantScoped: {
 *         parentCollection: 'gwi_tenants',
 *         subcollection: 'signals',
 *       },
 *       idPrefix: 'sig',
 *       timestampFields: ['occurredAt', 'receivedAt'],
 *       docToModel: signalDocToModel,
 *       modelToDoc: signalModelToDoc,
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseFirestoreRepository<
  TModel extends BaseEntity,
  TDoc extends DocumentData,
> {
  protected readonly db: Firestore;
  protected readonly config: RepositoryConfig<TModel, TDoc>;

  constructor(db: Firestore | undefined, config: RepositoryConfig<TModel, TDoc>) {
    this.db = db ?? getFirestoreClient();
    this.config = config;

    // Validate configuration
    if (!config.collection && !config.tenantScoped) {
      throw new Error('Repository must specify either collection or tenantScoped config');
    }
    if (config.collection && config.tenantScoped) {
      throw new Error('Repository cannot specify both collection and tenantScoped config');
    }
  }

  // ===========================================================================
  // Collection References
  // ===========================================================================

  /**
   * Get the top-level collection reference
   * @throws Error if repository is tenant-scoped
   */
  protected getCollection(): CollectionReference {
    if (!this.config.collection) {
      throw new Error('Cannot access top-level collection on tenant-scoped repository');
    }
    return this.db.collection(this.config.collection);
  }

  /**
   * Get the parent collection reference for tenant-scoped repositories
   */
  protected getParentCollection(): CollectionReference {
    if (!this.config.tenantScoped) {
      throw new Error('Cannot access parent collection on top-level repository');
    }
    return this.db.collection(this.config.tenantScoped.parentCollection);
  }

  /**
   * Get subcollection reference for a specific tenant
   * @throws Error if repository is not tenant-scoped
   */
  protected getTenantCollection(tenantId: string): CollectionReference {
    if (!this.config.tenantScoped) {
      throw new Error('Cannot access tenant collection on top-level repository');
    }
    return this.getParentCollection()
      .doc(tenantId)
      .collection(this.config.tenantScoped.subcollection);
  }

  /**
   * Get document reference
   * For top-level: directly in the collection
   * For tenant-scoped: requires tenantId
   */
  protected getDocRef(id: string, tenantId?: string): DocumentReference {
    if (this.config.tenantScoped) {
      if (!tenantId) {
        throw new Error('tenantId required for tenant-scoped repository');
      }
      return this.getTenantCollection(tenantId).doc(id);
    }
    return this.getCollection().doc(id);
  }

  // ===========================================================================
  // Document Conversion
  // ===========================================================================

  /**
   * Convert Firestore document data to model
   * Handles timestamp conversion automatically
   */
  protected toModel(data: DocumentData, id: string): TModel {
    // Convert timestamps
    const converted = this.convertTimestampsToDate(data as TDoc);
    return this.config.docToModel(converted, id);
  }

  /**
   * Convert model to Firestore document data
   * Handles timestamp conversion automatically
   */
  protected toDocument(model: TModel): WithFieldValue<TDoc> {
    const doc = this.config.modelToDoc(model);
    return this.convertDatesToTimestamp(doc) as WithFieldValue<TDoc>;
  }

  /**
   * Convert Timestamp fields to Date
   */
  protected convertTimestampsToDate(doc: TDoc): TDoc {
    const result = { ...doc };
    for (const field of this.config.timestampFields) {
      const value = result[field] as unknown;
      if (value && typeof value === 'object') {
        if ('toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
          (result as Record<string, unknown>)[field as string] = timestampToDate(value as Timestamp);
        }
      }
    }
    return result;
  }

  /**
   * Convert Date fields to Timestamp
   */
  protected convertDatesToTimestamp(doc: TDoc): TDoc {
    const result = { ...doc };
    for (const field of this.config.timestampFields) {
      const value = result[field] as unknown;
      if (value && typeof value === 'object' && value instanceof Date) {
        (result as Record<string, unknown>)[field as string] = dateToTimestamp(value);
      }
    }
    return result;
  }

  // ===========================================================================
  // ID Generation
  // ===========================================================================

  /**
   * Generate a new unique ID with the configured prefix
   */
  protected generateId(): string {
    return generateFirestoreId(this.config.idPrefix);
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Create a document
   *
   * @param data - Document data without system fields (id, createdAt, updatedAt)
   * @param tenantId - Required for tenant-scoped repositories
   * @returns Created model with all fields populated
   */
  protected async createDocument(
    data: Omit<TModel, 'id' | 'createdAt' | 'updatedAt'>,
    tenantId?: string,
  ): Promise<TModel> {
    const now = new Date();
    const id = this.generateId();

    const model = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    } as unknown as TModel;

    const doc = this.toDocument(model);
    const docRef = this.getDocRef(id, tenantId);
    await docRef.set(doc);

    return model;
  }

  /**
   * Get a document by ID
   *
   * For tenant-scoped: requires tenantId
   * For top-level: tenantId is ignored
   */
  protected async getDocument(id: string, tenantId?: string): Promise<TModel | null> {
    const docRef = this.getDocRef(id, tenantId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return null;
    }

    return this.toModel(snapshot.data()!, id);
  }

  /**
   * Get a document by ID, searching across all tenants if necessary
   * Useful for tenant-scoped repos where tenantId is unknown
   */
  protected async getDocumentAcrossTenants(id: string): Promise<TModel | null> {
    if (!this.config.tenantScoped) {
      // For top-level collections, just do a direct lookup
      return this.getDocument(id);
    }

    // Search across all tenants
    const tenantsSnapshot = await this.getParentCollection().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const result = await this.getDocument(id, tenantDoc.id);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Update a document
   *
   * @param id - Document ID
   * @param updates - Partial update data
   * @param tenantId - Required for tenant-scoped repositories
   * @returns Updated model
   */
  protected async updateDocument(
    id: string,
    updates: Partial<TModel>,
    tenantId?: string,
  ): Promise<TModel> {
    const existing = tenantId
      ? await this.getDocument(id, tenantId)
      : await this.getDocumentAcrossTenants(id);

    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    // Extract tenantId from existing if needed (for tenant-scoped repos)
    const resolvedTenantId = tenantId || (existing as unknown as TenantScopedEntity).tenantId;

    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // Never change ID
      updatedAt: new Date(),
    } as TModel;

    const doc = this.toDocument(updated);
    const docRef = this.getDocRef(id, resolvedTenantId);
    await docRef.set(doc, { merge: true });

    return updated;
  }

  /**
   * Delete a document
   */
  protected async deleteDocument(id: string, tenantId?: string): Promise<void> {
    if (!tenantId && this.config.tenantScoped) {
      // Need to find the document first to get tenantId
      const existing = await this.getDocumentAcrossTenants(id);
      if (!existing) {
        throw new Error(`Document not found: ${id}`);
      }
      tenantId = (existing as unknown as TenantScopedEntity).tenantId;
    }

    const docRef = this.getDocRef(id, tenantId);
    await docRef.delete();
  }

  /**
   * List documents with filtering and pagination
   *
   * @param conditions - Query conditions
   * @param filter - Pagination options
   * @param tenantId - Required for tenant-scoped repositories
   * @param orderBy - Field to order by
   * @param orderDirection - Sort direction
   */
  protected async listDocuments(
    conditions: QueryCondition[],
    filter?: ListFilter,
    tenantId?: string,
    orderBy?: string,
    orderDirection: 'asc' | 'desc' = 'desc',
  ): Promise<TModel[]> {
    let query: Query;

    if (this.config.tenantScoped) {
      if (!tenantId) {
        throw new Error('tenantId required for listing tenant-scoped documents');
      }
      query = this.getTenantCollection(tenantId);
    } else {
      query = this.getCollection();
    }

    // Apply conditions
    for (const condition of conditions) {
      query = query.where(condition.field, condition.operator, condition.value);
    }

    // Apply ordering
    if (orderBy) {
      query = query.orderBy(orderBy, orderDirection);
    }

    // Apply limit (with offset padding since Firestore doesn't support offset)
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;
    query = query.limit(limit + offset);

    const snapshot = await query.get();
    const models = snapshot.docs.map((doc: QueryDocumentSnapshot) =>
      this.toModel(doc.data(), doc.id),
    );

    // Apply offset (client-side)
    return models.slice(offset, offset + limit);
  }

  /**
   * Find a single document by a unique field
   */
  protected async findByField(
    field: string,
    value: unknown,
    tenantId?: string,
  ): Promise<TModel | null> {
    const results = await this.listDocuments(
      [{ field, operator: '==', value }],
      { limit: 1 },
      tenantId,
    );
    return results[0] ?? null;
  }

  /**
   * Find a document by field, searching across all tenants
   */
  protected async findByFieldAcrossTenants(
    field: string,
    value: unknown,
  ): Promise<TModel | null> {
    if (!this.config.tenantScoped) {
      return this.findByField(field, value);
    }

    const tenantsSnapshot = await this.getParentCollection().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const result = await this.findByField(field, value, tenantDoc.id);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Count documents matching conditions
   */
  protected async countDocuments(
    conditions: QueryCondition[],
    tenantId?: string,
  ): Promise<number> {
    let query: Query;

    if (this.config.tenantScoped) {
      if (!tenantId) {
        throw new Error('tenantId required for counting tenant-scoped documents');
      }
      query = this.getTenantCollection(tenantId);
    } else {
      query = this.getCollection();
    }

    for (const condition of conditions) {
      query = query.where(condition.field, condition.operator, condition.value);
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Run a Firestore transaction
   */
  protected async runTransaction<T>(
    callback: (transaction: FirebaseFirestore.Transaction) => Promise<T>,
  ): Promise<T> {
    return this.db.runTransaction(callback);
  }

  /**
   * Get the raw Firestore client for advanced operations
   */
  protected getFirestore(): Firestore {
    return this.db;
  }
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export {
  getFirestoreClient,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
  COLLECTIONS,
} from './firestore-client.js';

export { Timestamp } from 'firebase-admin/firestore';
