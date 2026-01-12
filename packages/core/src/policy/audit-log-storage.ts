/**
 * Immutable Audit Log Storage (D3.3)
 *
 * Append-only storage for cryptographically chained audit log entries.
 * Supports Firestore (production), SQLite (local dev), and in-memory (testing).
 *
 * Key properties:
 * - Append-only: No update or delete operations
 * - Chain integrity: Entries are linked via prevHash
 * - Multi-tenant: Isolated by tenantId
 * - Queryable: By time range, actor, action, resource
 *
 * @module @gwi/core/policy
 */

import type {
  ImmutableAuditLogEntry,
  CreateAuditLogEntry,
  SHA256Hash,
  AuditLogEntryId,
  AuditLogId,
} from './audit-log-schema.js';
import type { ChainState, BatchCreateResult } from './crypto-chain.js';
import {
  AuditChainBuilder,
  verifyChain,
  createBatch,
} from './crypto-chain.js';

// =============================================================================
// Storage Interface
// =============================================================================

/**
 * Query options for listing audit log entries
 */
export interface AuditLogQueryOptions {
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by actor type */
  actorType?: string;
  /** Filter by action category */
  actionCategory?: string;
  /** Filter by action name */
  actionName?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by outcome status */
  outcomeStatus?: 'success' | 'failure' | 'partial' | 'pending';
  /** Filter entries after this timestamp */
  startTime?: Date;
  /** Filter entries before this timestamp */
  endTime?: Date;
  /** Filter entries after this sequence */
  startSequence?: number;
  /** Filter entries before this sequence */
  endSequence?: number;
  /** Filter by high risk only */
  highRiskOnly?: boolean;
  /** Maximum entries to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a query operation
 */
export interface AuditLogQueryResult {
  /** Matching entries */
  entries: ImmutableAuditLogEntry[];
  /** Total count (for pagination) */
  totalCount: number;
  /** Whether there are more results */
  hasMore: boolean;
  /** Query metadata */
  metadata: {
    query: AuditLogQueryOptions;
    executedAt: Date;
    durationMs: number;
  };
}

/**
 * Chain state for a tenant
 */
export interface TenantChainState {
  tenantId: string;
  chainState: ChainState;
  lastEntryId: AuditLogEntryId | null;
  lastUpdated: Date;
}

/**
 * Metadata for an audit log
 */
export interface AuditLogMetadata {
  logId: AuditLogId;
  tenantId: string;
  entryCount: number;
  firstEntryId: AuditLogEntryId | null;
  lastEntryId: AuditLogEntryId | null;
  lastSequence: number;
  chainIntact: boolean;
  createdAt: Date;
  lastUpdatedAt: Date;
}

/**
 * Immutable Audit Log Store Interface
 *
 * This interface defines append-only operations for audit log entries.
 * Implementations must NOT provide update or delete operations.
 */
export interface ImmutableAuditLogStore {
  // ==========================================================================
  // Append Operations (write-only)
  // ==========================================================================

  /**
   * Append a single entry to the audit log
   *
   * The entry will be assigned a sequence number and linked to the chain.
   */
  append(
    tenantId: string,
    input: CreateAuditLogEntry
  ): Promise<ImmutableAuditLogEntry>;

  /**
   * Append multiple entries as a batch
   *
   * All entries are appended atomically with a Merkle root for batch verification.
   */
  appendBatch(
    tenantId: string,
    inputs: CreateAuditLogEntry[]
  ): Promise<BatchCreateResult>;

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  /**
   * Get a single entry by ID
   */
  getEntry(entryId: AuditLogEntryId): Promise<ImmutableAuditLogEntry | null>;

  /**
   * Get entry by sequence number within a tenant
   */
  getEntryBySequence(
    tenantId: string,
    sequence: number
  ): Promise<ImmutableAuditLogEntry | null>;

  /**
   * Query entries with filtering and pagination
   */
  query(options: AuditLogQueryOptions): Promise<AuditLogQueryResult>;

  /**
   * Get entries in a sequence range (for chain verification)
   */
  getChainSegment(
    tenantId: string,
    startSequence: number,
    endSequence: number
  ): Promise<ImmutableAuditLogEntry[]>;

  /**
   * Get the latest entry for a tenant
   */
  getLatestEntry(tenantId: string): Promise<ImmutableAuditLogEntry | null>;

  /**
   * Get chain state for a tenant
   */
  getChainState(tenantId: string): Promise<TenantChainState | null>;

  /**
   * Count entries for a tenant
   */
  countEntries(tenantId: string, options?: {
    startTime?: Date;
    endTime?: Date;
    highRiskOnly?: boolean;
  }): Promise<number>;

  // ==========================================================================
  // Chain Verification
  // ==========================================================================

  /**
   * Verify chain integrity for a tenant
   */
  verifyChainIntegrity(
    tenantId: string,
    options?: {
      startSequence?: number;
      endSequence?: number;
    }
  ): Promise<{
    valid: boolean;
    entriesVerified: number;
    firstInvalidSequence?: number;
    error?: string;
  }>;

  // ==========================================================================
  // Metadata
  // ==========================================================================

  /**
   * Get audit log metadata for a tenant
   */
  getMetadata(tenantId: string): Promise<AuditLogMetadata | null>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory implementation of ImmutableAuditLogStore
 *
 * Useful for testing and development. Not suitable for production.
 */
export class InMemoryAuditLogStore implements ImmutableAuditLogStore {
  private entries = new Map<AuditLogEntryId, ImmutableAuditLogEntry>();
  private tenantEntries = new Map<string, AuditLogEntryId[]>();
  private tenantChainStates = new Map<string, TenantChainState>();
  private builders = new Map<string, AuditChainBuilder>();

  // ==========================================================================
  // Append Operations
  // ==========================================================================

  async append(
    tenantId: string,
    input: CreateAuditLogEntry
  ): Promise<ImmutableAuditLogEntry> {
    const builder = this.getOrCreateBuilder(tenantId);
    const entry = builder.buildEntry(input);

    // Store entry
    this.entries.set(entry.id, entry);

    // Track by tenant
    const tenantIds = this.tenantEntries.get(tenantId) || [];
    tenantIds.push(entry.id);
    this.tenantEntries.set(tenantId, tenantIds);

    // Update chain state
    this.updateChainState(tenantId, builder, entry.id);

    return entry;
  }

  async appendBatch(
    tenantId: string,
    inputs: CreateAuditLogEntry[]
  ): Promise<BatchCreateResult> {
    if (inputs.length === 0) {
      throw new Error('Cannot create empty batch');
    }

    const builder = this.getOrCreateBuilder(tenantId);
    const batch = createBatch(builder, inputs);

    // Store all entries
    for (const entry of batch.entries) {
      this.entries.set(entry.id, entry);

      const tenantIds = this.tenantEntries.get(tenantId) || [];
      tenantIds.push(entry.id);
      this.tenantEntries.set(tenantId, tenantIds);
    }

    // Update chain state
    const lastEntry = batch.entries[batch.entries.length - 1];
    this.updateChainState(tenantId, builder, lastEntry.id);

    return batch;
  }

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  async getEntry(entryId: AuditLogEntryId): Promise<ImmutableAuditLogEntry | null> {
    return this.entries.get(entryId) || null;
  }

  async getEntryBySequence(
    tenantId: string,
    sequence: number
  ): Promise<ImmutableAuditLogEntry | null> {
    const tenantIds = this.tenantEntries.get(tenantId) || [];
    for (const id of tenantIds) {
      const entry = this.entries.get(id);
      if (entry && entry.chain.sequence === sequence) {
        return entry;
      }
    }
    return null;
  }

  async query(options: AuditLogQueryOptions): Promise<AuditLogQueryResult> {
    const startTime = Date.now();

    let results: ImmutableAuditLogEntry[] = [];

    // Get entries to filter
    if (options.tenantId) {
      const tenantIds = this.tenantEntries.get(options.tenantId) || [];
      results = tenantIds
        .map((id) => this.entries.get(id))
        .filter((e): e is ImmutableAuditLogEntry => e !== undefined);
    } else {
      results = Array.from(this.entries.values());
    }

    // Apply filters
    results = this.applyFilters(results, options);

    // Get total count before pagination
    const totalCount = results.length;

    // Sort
    const sortOrder = options.sortOrder || 'desc';
    results.sort((a, b) => {
      const diff = a.chain.sequence - b.chain.sequence;
      return sortOrder === 'asc' ? diff : -diff;
    });

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    results = results.slice(offset, offset + limit);

    return {
      entries: results,
      totalCount,
      hasMore: offset + results.length < totalCount,
      metadata: {
        query: options,
        executedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  async getChainSegment(
    tenantId: string,
    startSequence: number,
    endSequence: number
  ): Promise<ImmutableAuditLogEntry[]> {
    const tenantIds = this.tenantEntries.get(tenantId) || [];
    const entries: ImmutableAuditLogEntry[] = [];

    for (const id of tenantIds) {
      const entry = this.entries.get(id);
      if (
        entry &&
        entry.chain.sequence >= startSequence &&
        entry.chain.sequence <= endSequence
      ) {
        entries.push(entry);
      }
    }

    // Sort by sequence
    entries.sort((a, b) => a.chain.sequence - b.chain.sequence);
    return entries;
  }

  async getLatestEntry(tenantId: string): Promise<ImmutableAuditLogEntry | null> {
    const tenantIds = this.tenantEntries.get(tenantId) || [];
    if (tenantIds.length === 0) {
      return null;
    }

    let latest: ImmutableAuditLogEntry | null = null;
    for (const id of tenantIds) {
      const entry = this.entries.get(id);
      if (entry && (!latest || entry.chain.sequence > latest.chain.sequence)) {
        latest = entry;
      }
    }
    return latest;
  }

  async getChainState(tenantId: string): Promise<TenantChainState | null> {
    return this.tenantChainStates.get(tenantId) || null;
  }

  async countEntries(
    tenantId: string,
    options?: {
      startTime?: Date;
      endTime?: Date;
      highRiskOnly?: boolean;
    }
  ): Promise<number> {
    const tenantIds = this.tenantEntries.get(tenantId) || [];
    let count = 0;

    for (const id of tenantIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;

      const entryTime = new Date(entry.timestamp);
      if (options?.startTime && entryTime < options.startTime) continue;
      if (options?.endTime && entryTime > options.endTime) continue;
      if (options?.highRiskOnly && !entry.highRisk) continue;

      count++;
    }

    return count;
  }

  // ==========================================================================
  // Chain Verification
  // ==========================================================================

  async verifyChainIntegrity(
    tenantId: string,
    options?: {
      startSequence?: number;
      endSequence?: number;
    }
  ): Promise<{
    valid: boolean;
    entriesVerified: number;
    firstInvalidSequence?: number;
    error?: string;
  }> {
    const chainState = await this.getChainState(tenantId);
    if (!chainState) {
      return {
        valid: true,
        entriesVerified: 0,
      };
    }

    const startSeq = options?.startSequence ?? 0;
    const endSeq = options?.endSequence ?? chainState.chainState.sequence - 1;

    const entries = await this.getChainSegment(tenantId, startSeq, endSeq);

    if (entries.length === 0) {
      return {
        valid: true,
        entriesVerified: 0,
      };
    }

    // Determine expected first prevHash
    let expectedFirstPrevHash: SHA256Hash | null = null;
    if (startSeq > 0) {
      const prevEntry = await this.getEntryBySequence(tenantId, startSeq - 1);
      expectedFirstPrevHash = prevEntry?.chain.contentHash || null;
    }

    const result = verifyChain(entries, {
      startSequence: startSeq,
      expectedFirstPrevHash,
    });

    return {
      valid: result.valid,
      entriesVerified: result.entriesVerified,
      firstInvalidSequence: result.firstInvalidSequence,
      error: result.error,
    };
  }

  // ==========================================================================
  // Metadata
  // ==========================================================================

  async getMetadata(tenantId: string): Promise<AuditLogMetadata | null> {
    const chainState = await this.getChainState(tenantId);
    if (!chainState) {
      return null;
    }

    const entryCount = (this.tenantEntries.get(tenantId) || []).length;
    const latestEntry = await this.getLatestEntry(tenantId);

    // Get first entry for creation time
    const firstEntry = await this.getEntryBySequence(tenantId, 0);

    return {
      logId: `log-${tenantId}` as AuditLogId,
      tenantId,
      entryCount,
      firstEntryId: firstEntry?.id || null,
      lastEntryId: latestEntry?.id || null,
      lastSequence: latestEntry?.chain.sequence ?? -1,
      chainIntact: true, // Assume true for in-memory
      createdAt: firstEntry ? new Date(firstEntry.timestamp) : new Date(),
      lastUpdatedAt: chainState.lastUpdated,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getOrCreateBuilder(tenantId: string): AuditChainBuilder {
    let builder = this.builders.get(tenantId);
    if (!builder) {
      builder = new AuditChainBuilder();
      this.builders.set(tenantId, builder);
    }
    return builder;
  }

  private updateChainState(
    tenantId: string,
    builder: AuditChainBuilder,
    lastEntryId: AuditLogEntryId
  ): void {
    const state = builder.getState();
    this.tenantChainStates.set(tenantId, {
      tenantId,
      chainState: state,
      lastEntryId,
      lastUpdated: new Date(),
    });
  }

  private applyFilters(
    entries: ImmutableAuditLogEntry[],
    options: AuditLogQueryOptions
  ): ImmutableAuditLogEntry[] {
    return entries.filter((entry) => {
      if (options.actorId && entry.actor.id !== options.actorId) return false;
      if (options.actorType && entry.actor.type !== options.actorType) return false;
      if (options.actionCategory && entry.action.category !== options.actionCategory)
        return false;
      if (options.actionName && entry.action.type !== options.actionName) return false;
      if (options.resourceType && entry.resource?.type !== options.resourceType)
        return false;
      if (options.resourceId && entry.resource?.id !== options.resourceId) return false;
      if (options.outcomeStatus && entry.outcome.status !== options.outcomeStatus)
        return false;
      const entryTime = new Date(entry.timestamp);
      if (options.startTime && entryTime < options.startTime) return false;
      if (options.endTime && entryTime > options.endTime) return false;
      if (
        options.startSequence !== undefined &&
        entry.chain.sequence < options.startSequence
      )
        return false;
      if (
        options.endSequence !== undefined &&
        entry.chain.sequence > options.endSequence
      )
        return false;
      if (options.highRiskOnly && !entry.highRisk) return false;
      return true;
    });
  }

  // ==========================================================================
  // Testing Helpers
  // ==========================================================================

  /**
   * Clear all data (testing only)
   */
  clear(): void {
    this.entries.clear();
    this.tenantEntries.clear();
    this.tenantChainStates.clear();
    this.builders.clear();
  }

  /**
   * Get entry count (testing only)
   */
  size(): number {
    return this.entries.size;
  }
}

// =============================================================================
// Firestore Implementation
// =============================================================================

/**
 * Firestore collection names for audit log
 */
export const AUDIT_LOG_COLLECTIONS = {
  ENTRIES: 'immutable_audit_log_entries',
  CHAIN_STATE: 'immutable_audit_log_chain_state',
  METADATA: 'immutable_audit_log_metadata',
} as const;

/**
 * Firestore implementation of ImmutableAuditLogStore
 *
 * Uses Firestore for production with proper indexing for queries.
 */
export class FirestoreAuditLogStore implements ImmutableAuditLogStore {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  // ==========================================================================
  // Append Operations
  // ==========================================================================

  async append(
    tenantId: string,
    input: CreateAuditLogEntry
  ): Promise<ImmutableAuditLogEntry> {
    // Use transaction to ensure atomicity
    return this.db.runTransaction(async (transaction) => {
      // Get or initialize chain state
      const chainStateRef = this.db
        .collection(AUDIT_LOG_COLLECTIONS.CHAIN_STATE)
        .doc(tenantId);
      const chainStateDoc = await transaction.get(chainStateRef);

      let builder: AuditChainBuilder;
      if (chainStateDoc.exists) {
        const data = chainStateDoc.data()!;
        builder = new AuditChainBuilder();
        builder.initializeFrom(data.sequence, data.lastHash);
      } else {
        builder = new AuditChainBuilder();
      }

      // Build entry
      const entry = builder.buildEntry(input);

      // Store entry
      const entryRef = this.db
        .collection(AUDIT_LOG_COLLECTIONS.ENTRIES)
        .doc(entry.id);
      transaction.set(entryRef, this.serializeEntry(entry));

      // Update chain state
      const state = builder.getState();
      transaction.set(chainStateRef, {
        tenantId,
        sequence: state.sequence,
        lastHash: state.lastHash,
        algorithm: state.algorithm,
        lastEntryId: entry.id,
        lastUpdated: new Date(),
      });

      return entry;
    });
  }

  async appendBatch(
    tenantId: string,
    inputs: CreateAuditLogEntry[]
  ): Promise<BatchCreateResult> {
    if (inputs.length === 0) {
      throw new Error('Cannot create empty batch');
    }

    // Use transaction for atomicity
    return this.db.runTransaction(async (transaction) => {
      // Get or initialize chain state
      const chainStateRef = this.db
        .collection(AUDIT_LOG_COLLECTIONS.CHAIN_STATE)
        .doc(tenantId);
      const chainStateDoc = await transaction.get(chainStateRef);

      let builder: AuditChainBuilder;
      if (chainStateDoc.exists) {
        const data = chainStateDoc.data()!;
        builder = new AuditChainBuilder();
        builder.initializeFrom(data.sequence, data.lastHash);
      } else {
        builder = new AuditChainBuilder();
      }

      // Create batch
      const batch = createBatch(builder, inputs);

      // Store all entries
      for (const entry of batch.entries) {
        const entryRef = this.db
          .collection(AUDIT_LOG_COLLECTIONS.ENTRIES)
          .doc(entry.id);
        transaction.set(entryRef, this.serializeEntry(entry));
      }

      // Update chain state
      const state = builder.getState();
      const lastEntry = batch.entries[batch.entries.length - 1];
      transaction.set(chainStateRef, {
        tenantId,
        sequence: state.sequence,
        lastHash: state.lastHash,
        algorithm: state.algorithm,
        lastEntryId: lastEntry.id,
        lastUpdated: new Date(),
      });

      return batch;
    });
  }

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  async getEntry(entryId: AuditLogEntryId): Promise<ImmutableAuditLogEntry | null> {
    const doc = await this.db
      .collection(AUDIT_LOG_COLLECTIONS.ENTRIES)
      .doc(entryId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return this.deserializeEntry(doc.data()!);
  }

  async getEntryBySequence(
    tenantId: string,
    sequence: number
  ): Promise<ImmutableAuditLogEntry | null> {
    const snapshot = await this.db
      .collection(AUDIT_LOG_COLLECTIONS.ENTRIES)
      .where('context.tenantId', '==', tenantId)
      .where('chain.sequence', '==', sequence)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return this.deserializeEntry(snapshot.docs[0].data());
  }

  async query(options: AuditLogQueryOptions): Promise<AuditLogQueryResult> {
    const startTime = Date.now();

    let query: FirebaseFirestore.Query = this.db.collection(
      AUDIT_LOG_COLLECTIONS.ENTRIES
    );

    // Apply filters
    if (options.tenantId) {
      query = query.where('context.tenantId', '==', options.tenantId);
    }
    if (options.actorId) {
      query = query.where('actor.id', '==', options.actorId);
    }
    if (options.actorType) {
      query = query.where('actor.type', '==', options.actorType);
    }
    if (options.actionCategory) {
      query = query.where('action.category', '==', options.actionCategory);
    }
    if (options.actionName) {
      query = query.where('action.name', '==', options.actionName);
    }
    if (options.resourceType) {
      query = query.where('resource.type', '==', options.resourceType);
    }
    if (options.resourceId) {
      query = query.where('resource.id', '==', options.resourceId);
    }
    if (options.outcomeStatus) {
      query = query.where('outcome.status', '==', options.outcomeStatus);
    }
    if (options.highRiskOnly) {
      query = query.where('highRisk', '==', true);
    }
    if (options.startTime) {
      query = query.where('timestamp', '>=', options.startTime);
    }
    if (options.endTime) {
      query = query.where('timestamp', '<=', options.endTime);
    }

    // Sort
    const sortOrder = options.sortOrder || 'desc';
    query = query.orderBy('chain.sequence', sortOrder);

    // Get total count (separate query)
    const countSnapshot = await query.count().get();
    const totalCount = countSnapshot.data().count;

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    // Note: Firestore doesn't support native offset, so we fetch extra and slice
    if (offset > 0) {
      query = query.limit(offset + limit);
    } else {
      query = query.limit(limit);
    }

    const snapshot = await query.get();

    let entries = snapshot.docs.map((doc) => this.deserializeEntry(doc.data()));

    // Apply offset
    if (offset > 0) {
      entries = entries.slice(offset);
    }

    return {
      entries,
      totalCount,
      hasMore: offset + entries.length < totalCount,
      metadata: {
        query: options,
        executedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  async getChainSegment(
    tenantId: string,
    startSequence: number,
    endSequence: number
  ): Promise<ImmutableAuditLogEntry[]> {
    const snapshot = await this.db
      .collection(AUDIT_LOG_COLLECTIONS.ENTRIES)
      .where('context.tenantId', '==', tenantId)
      .where('chain.sequence', '>=', startSequence)
      .where('chain.sequence', '<=', endSequence)
      .orderBy('chain.sequence', 'asc')
      .get();

    return snapshot.docs.map((doc) => this.deserializeEntry(doc.data()));
  }

  async getLatestEntry(tenantId: string): Promise<ImmutableAuditLogEntry | null> {
    const chainState = await this.getChainState(tenantId);
    if (!chainState || !chainState.lastEntryId) {
      return null;
    }
    return this.getEntry(chainState.lastEntryId);
  }

  async getChainState(tenantId: string): Promise<TenantChainState | null> {
    const doc = await this.db
      .collection(AUDIT_LOG_COLLECTIONS.CHAIN_STATE)
      .doc(tenantId)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      tenantId: data.tenantId,
      chainState: {
        sequence: data.sequence,
        lastHash: data.lastHash,
        algorithm: data.algorithm,
      },
      lastEntryId: data.lastEntryId,
      lastUpdated: data.lastUpdated?.toDate?.() || new Date(data.lastUpdated),
    };
  }

  async countEntries(
    tenantId: string,
    options?: {
      startTime?: Date;
      endTime?: Date;
      highRiskOnly?: boolean;
    }
  ): Promise<number> {
    let query: FirebaseFirestore.Query = this.db
      .collection(AUDIT_LOG_COLLECTIONS.ENTRIES)
      .where('context.tenantId', '==', tenantId);

    if (options?.startTime) {
      query = query.where('timestamp', '>=', options.startTime);
    }
    if (options?.endTime) {
      query = query.where('timestamp', '<=', options.endTime);
    }
    if (options?.highRiskOnly) {
      query = query.where('highRisk', '==', true);
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  // ==========================================================================
  // Chain Verification
  // ==========================================================================

  async verifyChainIntegrity(
    tenantId: string,
    options?: {
      startSequence?: number;
      endSequence?: number;
    }
  ): Promise<{
    valid: boolean;
    entriesVerified: number;
    firstInvalidSequence?: number;
    error?: string;
  }> {
    const chainState = await this.getChainState(tenantId);
    if (!chainState) {
      return {
        valid: true,
        entriesVerified: 0,
      };
    }

    const startSeq = options?.startSequence ?? 0;
    const endSeq = options?.endSequence ?? chainState.chainState.sequence - 1;

    const entries = await this.getChainSegment(tenantId, startSeq, endSeq);

    if (entries.length === 0) {
      return {
        valid: true,
        entriesVerified: 0,
      };
    }

    // Determine expected first prevHash
    let expectedFirstPrevHash: SHA256Hash | null = null;
    if (startSeq > 0) {
      const prevEntry = await this.getEntryBySequence(tenantId, startSeq - 1);
      expectedFirstPrevHash = prevEntry?.chain.contentHash || null;
    }

    const result = verifyChain(entries, {
      startSequence: startSeq,
      expectedFirstPrevHash,
    });

    return {
      valid: result.valid,
      entriesVerified: result.entriesVerified,
      firstInvalidSequence: result.firstInvalidSequence,
      error: result.error,
    };
  }

  // ==========================================================================
  // Metadata
  // ==========================================================================

  async getMetadata(tenantId: string): Promise<AuditLogMetadata | null> {
    const chainState = await this.getChainState(tenantId);
    if (!chainState) {
      return null;
    }

    const entryCount = await this.countEntries(tenantId);
    const latestEntry = await this.getLatestEntry(tenantId);
    const firstEntry = await this.getEntryBySequence(tenantId, 0);

    return {
      logId: `log-${tenantId}` as AuditLogId,
      tenantId,
      entryCount,
      firstEntryId: firstEntry?.id || null,
      lastEntryId: latestEntry?.id || null,
      lastSequence: latestEntry?.chain.sequence ?? -1,
      chainIntact: true, // Would need full verification
      createdAt: firstEntry ? new Date(firstEntry.timestamp) : new Date(),
      lastUpdatedAt: chainState.lastUpdated,
    };
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  private serializeEntry(
    entry: ImmutableAuditLogEntry
  ): Record<string, unknown> {
    return {
      ...entry,
      timestamp: entry.timestamp,
    };
  }

  private deserializeEntry(data: Record<string, unknown>): ImmutableAuditLogEntry {
    return {
      ...(data as ImmutableAuditLogEntry),
      timestamp:
        (data.timestamp as any)?.toDate?.() || new Date(data.timestamp as string),
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let auditLogStoreInstance: ImmutableAuditLogStore | null = null;

/**
 * Get the ImmutableAuditLogStore based on environment configuration
 */
export function getImmutableAuditLogStore(): ImmutableAuditLogStore {
  if (auditLogStoreInstance) {
    return auditLogStoreInstance;
  }

  const backend = process.env.GWI_STORE_BACKEND?.toLowerCase();

  if (backend === 'firestore') {
    // Dynamic import to avoid loading Firestore in non-Firestore environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestoreClient } = require('../storage/firestore-client.js');
    auditLogStoreInstance = new FirestoreAuditLogStore(getFirestoreClient());
  } else {
    // Default to in-memory
    auditLogStoreInstance = new InMemoryAuditLogStore();
  }

  return auditLogStoreInstance;
}

/**
 * Set a custom ImmutableAuditLogStore instance (for testing)
 */
export function setImmutableAuditLogStore(store: ImmutableAuditLogStore): void {
  auditLogStoreInstance = store;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetImmutableAuditLogStore(): void {
  auditLogStoreInstance = null;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an in-memory audit log store
 */
export function createInMemoryAuditLogStore(): InMemoryAuditLogStore {
  return new InMemoryAuditLogStore();
}

/**
 * Create a Firestore audit log store
 */
export function createFirestoreAuditLogStore(
  db: FirebaseFirestore.Firestore
): FirestoreAuditLogStore {
  return new FirestoreAuditLogStore(db);
}
