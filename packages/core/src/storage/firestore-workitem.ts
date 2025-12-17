/**
 * Firestore Work Item Store Implementation (Phase 14)
 *
 * Production-ready WorkItemStore backed by Google Firestore.
 * Manages work items (PR queue) with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/work_items/{itemId}
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, Query, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type {
  WorkItemStore,
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  ScoreBreakdown,
  WorkItemEvidence,
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

interface WorkItemDoc {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  summary: string;
  status: string;
  dedupeKey: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  signalIds: string[];
  evidence: WorkItemEvidence;
  repo?: {
    owner: string;
    name: string;
    fullName: string;
  };
  resourceNumber?: number;
  resourceUrl?: string;
  assignedTo?: string;
  candidateId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  dueAt?: Timestamp;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function workItemDocToModel(doc: WorkItemDoc): WorkItem {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    type: doc.type as WorkItemType,
    title: doc.title,
    summary: doc.summary,
    status: doc.status as WorkItemStatus,
    dedupeKey: doc.dedupeKey,
    score: doc.score,
    scoreBreakdown: doc.scoreBreakdown,
    signalIds: doc.signalIds,
    evidence: doc.evidence,
    repo: doc.repo,
    resourceNumber: doc.resourceNumber,
    resourceUrl: doc.resourceUrl,
    assignedTo: doc.assignedTo,
    candidateId: doc.candidateId,
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
    dueAt: timestampToDate(doc.dueAt),
  };
}

function workItemModelToDoc(item: WorkItem): WorkItemDoc {
  return {
    id: item.id,
    tenantId: item.tenantId,
    type: item.type,
    title: item.title,
    summary: item.summary,
    status: item.status,
    dedupeKey: item.dedupeKey,
    score: item.score,
    scoreBreakdown: item.scoreBreakdown,
    signalIds: item.signalIds,
    evidence: item.evidence,
    repo: item.repo,
    resourceNumber: item.resourceNumber,
    resourceUrl: item.resourceUrl,
    assignedTo: item.assignedTo,
    candidateId: item.candidateId,
    createdAt: dateToTimestamp(item.createdAt)!,
    updatedAt: dateToTimestamp(item.updatedAt)!,
    dueAt: dateToTimestamp(item.dueAt),
  };
}

// =============================================================================
// Firestore Work Item Store Implementation
// =============================================================================

/**
 * Firestore-backed WorkItemStore implementation (Phase 14)
 *
 * Provides production-ready work item storage with:
 * - Tenant-scoped work item management
 * - Dedupe key indexing for deduplication
 * - Score-based sorting for PR queue
 * - Status filtering and statistics
 */
export class FirestoreWorkItemStore implements WorkItemStore {
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

  private workItemsRef(tenantId: string): CollectionReference {
    return this.tenantsRef().doc(tenantId).collection(COLLECTIONS.WORK_ITEMS);
  }

  private workItemDoc(tenantId: string, itemId: string): DocumentReference {
    return this.workItemsRef(tenantId).doc(itemId);
  }

  // ---------------------------------------------------------------------------
  // Work Item CRUD
  // ---------------------------------------------------------------------------

  async createWorkItem(item: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkItem> {
    const now = new Date();
    const itemId = generateFirestoreId('wi');

    const fullItem: WorkItem = {
      ...item,
      id: itemId,
      createdAt: now,
      updatedAt: now,
    };

    const doc = workItemModelToDoc(fullItem);
    await this.workItemDoc(item.tenantId, itemId).set(doc);

    return fullItem;
  }

  async getWorkItem(itemId: string): Promise<WorkItem | null> {
    // We need to search across all tenants since we only have itemId
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const itemSnapshot = await this.workItemsRef(tenantDoc.id).doc(itemId).get();
      if (itemSnapshot.exists) {
        return workItemDocToModel(itemSnapshot.data() as WorkItemDoc);
      }
    }

    return null;
  }

  async getWorkItemByDedupeKey(tenantId: string, dedupeKey: string): Promise<WorkItem | null> {
    const snapshot = await this.workItemsRef(tenantId)
      .where('dedupeKey', '==', dedupeKey)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return workItemDocToModel(snapshot.docs[0].data() as WorkItemDoc);
  }

  async listWorkItems(
    tenantId: string,
    filter?: {
      status?: WorkItemStatus | WorkItemStatus[];
      type?: WorkItemType;
      repo?: string;
      assignedTo?: string;
      minScore?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<WorkItem[]> {
    let query: Query = this.workItemsRef(tenantId);

    // Note: Firestore doesn't support array 'in' queries with other where clauses easily
    // For status array, we'll filter client-side if needed
    const statusArray = filter?.status
      ? (Array.isArray(filter.status) ? filter.status : [filter.status])
      : null;

    if (statusArray && statusArray.length === 1) {
      query = query.where('status', '==', statusArray[0]);
    }
    if (filter?.type) {
      query = query.where('type', '==', filter.type);
    }
    if (filter?.assignedTo) {
      query = query.where('assignedTo', '==', filter.assignedTo);
    }
    if (filter?.minScore !== undefined) {
      query = query.where('score', '>=', filter.minScore);
    }

    // Sort by score descending
    query = query.orderBy('score', 'desc');

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    // Apply limit with offset padding
    query = query.limit(limit + offset);

    const snapshot = await query.get();
    let items = snapshot.docs.map(doc => workItemDocToModel(doc.data() as WorkItemDoc));

    // Apply client-side filters
    if (statusArray && statusArray.length > 1) {
      items = items.filter(i => statusArray.includes(i.status));
    }
    if (filter?.repo) {
      items = items.filter(i => i.repo?.fullName === filter.repo);
    }

    // Apply offset
    return items.slice(offset, offset + limit);
  }

  async updateWorkItem(
    itemId: string,
    update: Partial<Pick<WorkItem, 'status' | 'assignedTo' | 'candidateId' | 'score' | 'scoreBreakdown'>>
  ): Promise<WorkItem> {
    // Find the item first
    const existing = await this.getWorkItem(itemId);
    if (!existing) {
      throw new Error(`Work item not found: ${itemId}`);
    }

    const updated: WorkItem = {
      ...existing,
      ...update,
      updatedAt: new Date(),
    };

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (update.status !== undefined) updateData.status = update.status;
    if (update.assignedTo !== undefined) updateData.assignedTo = update.assignedTo;
    if (update.candidateId !== undefined) updateData.candidateId = update.candidateId;
    if (update.score !== undefined) updateData.score = update.score;
    if (update.scoreBreakdown !== undefined) updateData.scoreBreakdown = update.scoreBreakdown;

    await this.workItemDoc(existing.tenantId, itemId).update(updateData);

    return updated;
  }

  async addSignalToWorkItem(itemId: string, signalId: string): Promise<WorkItem> {
    const existing = await this.getWorkItem(itemId);
    if (!existing) {
      throw new Error(`Work item not found: ${itemId}`);
    }

    await this.workItemDoc(existing.tenantId, itemId).update({
      signalIds: FieldValue.arrayUnion(signalId),
      updatedAt: Timestamp.now(),
    });

    existing.signalIds.push(signalId);
    existing.updatedAt = new Date();
    return existing;
  }

  async countWorkItems(tenantId: string, status?: WorkItemStatus | WorkItemStatus[]): Promise<number> {
    let query: Query = this.workItemsRef(tenantId);

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      if (statuses.length === 1) {
        query = query.where('status', '==', statuses[0]);
      }
      // For multiple statuses, we count all and filter
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  async getQueueStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<WorkItemStatus, number>;
    byType: Record<WorkItemType, number>;
    avgScore: number;
  }> {
    // Fetch all items for stats calculation
    // In production, consider using aggregation or maintaining counters
    const snapshot = await this.workItemsRef(tenantId).get();
    const items = snapshot.docs.map(doc => workItemDocToModel(doc.data() as WorkItemDoc));

    const byStatus: Record<WorkItemStatus, number> = {
      queued: 0,
      in_progress: 0,
      awaiting_approval: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
      dismissed: 0,
    };

    const byType: Record<WorkItemType, number> = {
      issue_to_code: 0,
      pr_review: 0,
      pr_resolve: 0,
      docs_update: 0,
      test_gen: 0,
      custom: 0,
    };

    let totalScore = 0;
    for (const item of items) {
      byStatus[item.status]++;
      byType[item.type]++;
      totalScore += item.score;
    }

    return {
      total: items.length,
      byStatus,
      byType,
      avgScore: items.length > 0 ? Math.round(totalScore / items.length) : 0,
    };
  }
}
