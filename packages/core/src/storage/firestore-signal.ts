/**
 * Firestore Signal Store Implementation (Phase 14)
 *
 * Production-ready SignalStore backed by Google Firestore.
 * Manages signals with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/signals/{signalId}
 *
 * Refactored to use BaseFirestoreRepository.
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import {
  BaseFirestoreRepository,
  COLLECTIONS,
  Timestamp,
  timestampToDate,
  dateToTimestamp,
  type TenantScopedEntity,
} from './base-firestore-repository.js';
import type {
  SignalStore,
  Signal,
  SignalSource,
  SignalStatus,
  SignalContext,
} from './interfaces.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface SignalDoc extends DocumentData {
  id: string;
  tenantId: string;
  source: string;
  externalId: string;
  occurredAt: Timestamp;
  receivedAt: Timestamp;
  status: string;
  payload: Record<string, unknown>;
  context: SignalContext;
  processingMeta?: {
    processedAt?: Timestamp;
    workItemId?: string;
    ignoredReason?: string;
    errorMessage?: string;
  };
}

// =============================================================================
// Conversion Functions
// =============================================================================

function signalDocToModel(doc: SignalDoc, id: string): Signal {
  return {
    id,
    tenantId: doc.tenantId,
    source: doc.source as SignalSource,
    externalId: doc.externalId,
    occurredAt: timestampToDate(doc.occurredAt)!,
    receivedAt: timestampToDate(doc.receivedAt)!,
    status: doc.status as SignalStatus,
    payload: doc.payload,
    context: doc.context,
    processingMeta: doc.processingMeta ? {
      processedAt: timestampToDate(doc.processingMeta.processedAt as Timestamp),
      workItemId: doc.processingMeta.workItemId,
      ignoredReason: doc.processingMeta.ignoredReason,
      errorMessage: doc.processingMeta.errorMessage,
    } : undefined,
  };
}

function signalModelToDoc(signal: Signal): SignalDoc {
  return {
    id: signal.id,
    tenantId: signal.tenantId,
    source: signal.source,
    externalId: signal.externalId,
    occurredAt: dateToTimestamp(signal.occurredAt)!,
    receivedAt: dateToTimestamp(signal.receivedAt)!,
    status: signal.status,
    payload: signal.payload,
    context: signal.context,
    processingMeta: signal.processingMeta ? {
      processedAt: dateToTimestamp(signal.processingMeta.processedAt),
      workItemId: signal.processingMeta.workItemId,
      ignoredReason: signal.processingMeta.ignoredReason,
      errorMessage: signal.processingMeta.errorMessage,
    } : undefined,
  };
}

// =============================================================================
// Firestore Signal Store Implementation
// =============================================================================

/**
 * Firestore-backed SignalStore implementation (Phase 14)
 *
 * Provides production-ready signal storage with:
 * - Tenant-scoped signal management
 * - External ID deduplication
 * - Status-based filtering
 * - Pending signal queries for processing
 */
export class FirestoreSignalStore
  extends BaseFirestoreRepository<Signal & TenantScopedEntity, SignalDoc>
  implements SignalStore
{
  constructor(db?: Firestore) {
    super(db, {
      tenantScoped: {
        parentCollection: COLLECTIONS.TENANTS,
        subcollection: COLLECTIONS.SIGNALS,
      },
      idPrefix: 'sig',
      timestampFields: ['occurredAt', 'receivedAt'],
      docToModel: signalDocToModel,
      modelToDoc: signalModelToDoc,
    });
  }

  async createSignal(signal: Omit<Signal, 'id' | 'receivedAt'>): Promise<Signal> {
    const now = new Date();
    const signalId = this.generateId();

    const fullSignal: Signal = {
      ...signal,
      id: signalId,
      receivedAt: now,
    };

    const doc = this.toDocument(fullSignal);
    await this.getDocRef(signalId, signal.tenantId).set(doc);

    return fullSignal;
  }

  async getSignal(signalId: string): Promise<Signal | null> {
    return this.getDocumentAcrossTenants(signalId);
  }

  async getSignalByExternalId(
    tenantId: string,
    source: SignalSource,
    externalId: string
  ): Promise<Signal | null> {
    const results = await this.listDocuments(
      [
        { field: 'source', operator: '==', value: source },
        { field: 'externalId', operator: '==', value: externalId },
      ],
      { limit: 1 },
      tenantId
    );
    return results[0] ?? null;
  }

  async listSignals(
    tenantId: string,
    filter?: {
      source?: SignalSource;
      status?: SignalStatus;
      since?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<Signal[]> {
    const conditions: Array<{ field: string; operator: '==' | '>=' | '<' | '>' | '<=' | '!=' | 'in' | 'array-contains'; value: unknown }> = [];

    if (filter?.source) {
      conditions.push({ field: 'source', operator: '==', value: filter.source });
    }
    if (filter?.status) {
      conditions.push({ field: 'status', operator: '==', value: filter.status });
    }
    if (filter?.since) {
      conditions.push({ field: 'receivedAt', operator: '>=', value: Timestamp.fromDate(filter.since) });
    }

    return this.listDocuments(
      conditions,
      { limit: filter?.limit, offset: filter?.offset },
      tenantId,
      'receivedAt',
      'desc'
    );
  }

  async updateSignal(
    signalId: string,
    update: Partial<Pick<Signal, 'status' | 'processingMeta'>>
  ): Promise<Signal> {
    // Find the signal first
    const existing = await this.getSignal(signalId);
    if (!existing) {
      throw new Error(`Signal not found: ${signalId}`);
    }

    const updated: Signal = {
      ...existing,
      ...update,
    };

    // Convert processingMeta timestamps if present
    const updateData: Record<string, unknown> = {};
    if (update.status !== undefined) {
      updateData.status = update.status;
    }
    if (update.processingMeta !== undefined) {
      updateData.processingMeta = {
        processedAt: update.processingMeta.processedAt
          ? dateToTimestamp(update.processingMeta.processedAt)
          : undefined,
        workItemId: update.processingMeta.workItemId,
        ignoredReason: update.processingMeta.ignoredReason,
        errorMessage: update.processingMeta.errorMessage,
      };
    }

    await this.getDocRef(signalId, existing.tenantId).update(updateData);

    return updated;
  }

  async listPendingSignals(tenantId: string, limit = 100): Promise<Signal[]> {
    return this.listSignals(tenantId, { status: 'pending', limit });
  }
}
