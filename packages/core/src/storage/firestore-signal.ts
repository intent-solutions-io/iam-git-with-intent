/**
 * Firestore Signal Store Implementation (Phase 14)
 *
 * Production-ready SignalStore backed by Google Firestore.
 * Manages signals with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/signals/{signalId}
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, Query, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  SignalStore,
  Signal,
  SignalSource,
  SignalStatus,
  SignalContext,
} from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
} from './firestore-client.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface SignalDoc {
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

function signalDocToModel(doc: SignalDoc): Signal {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    source: doc.source as SignalSource,
    externalId: doc.externalId,
    occurredAt: timestampToDate(doc.occurredAt)!,
    receivedAt: timestampToDate(doc.receivedAt)!,
    status: doc.status as SignalStatus,
    payload: doc.payload,
    context: doc.context,
    processingMeta: doc.processingMeta ? {
      processedAt: timestampToDate(doc.processingMeta.processedAt),
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
export class FirestoreSignalStore implements SignalStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private tenantsRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.TENANTS);
  }

  private signalsRef(tenantId: string): CollectionReference {
    return this.tenantsRef().doc(tenantId).collection(COLLECTIONS.SIGNALS);
  }

  private signalDoc(tenantId: string, signalId: string): DocumentReference {
    return this.signalsRef(tenantId).doc(signalId);
  }

  // ---------------------------------------------------------------------------
  // Signal CRUD
  // ---------------------------------------------------------------------------

  async createSignal(signal: Omit<Signal, 'id' | 'receivedAt'>): Promise<Signal> {
    const now = new Date();
    const signalId = generateFirestoreId('sig');

    const fullSignal: Signal = {
      ...signal,
      id: signalId,
      receivedAt: now,
    };

    const doc = signalModelToDoc(fullSignal);
    await this.signalDoc(signal.tenantId, signalId).set(doc);

    return fullSignal;
  }

  async getSignal(signalId: string): Promise<Signal | null> {
    // We need to search across all tenants since we only have signalId
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const signalSnapshot = await this.signalsRef(tenantDoc.id).doc(signalId).get();
      if (signalSnapshot.exists) {
        return signalDocToModel(signalSnapshot.data() as SignalDoc);
      }
    }

    return null;
  }

  async getSignalByExternalId(
    tenantId: string,
    source: SignalSource,
    externalId: string
  ): Promise<Signal | null> {
    const snapshot = await this.signalsRef(tenantId)
      .where('source', '==', source)
      .where('externalId', '==', externalId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return signalDocToModel(snapshot.docs[0].data() as SignalDoc);
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
    let query: Query = this.signalsRef(tenantId);

    if (filter?.source) {
      query = query.where('source', '==', filter.source);
    }
    if (filter?.status) {
      query = query.where('status', '==', filter.status);
    }
    if (filter?.since) {
      query = query.where('receivedAt', '>=', Timestamp.fromDate(filter.since));
    }

    query = query.orderBy('receivedAt', 'desc');

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    // Apply limit with offset padding
    query = query.limit(limit + offset);

    const snapshot = await query.get();
    const signals = snapshot.docs.map(doc => signalDocToModel(doc.data() as SignalDoc));

    // Apply offset
    return signals.slice(offset, offset + limit);
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

    await this.signalDoc(existing.tenantId, signalId).update(updateData);

    return updated;
  }

  async listPendingSignals(tenantId: string, limit = 100): Promise<Signal[]> {
    return this.listSignals(tenantId, { status: 'pending', limit });
  }
}
