/**
 * Firestore Work Item Store Implementation (Phase 14)
 *
 * Production-ready WorkItemStore backed by Google Firestore.
 * Manages work items (PR queue) with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/work_items/{itemId}
 *
 * Refactored to use BaseFirestoreRepository.
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  BaseFirestoreRepository,
  COLLECTIONS,
  Timestamp,
  timestampToDate,
  dateToTimestamp,
  type TenantScopedEntity,
} from './base-firestore-repository.js';
import type {
  WorkItemStore,
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  ScoreBreakdown,
  WorkItemEvidence,
} from './interfaces.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface WorkItemDoc extends DocumentData {
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

function workItemDocToModel(doc: WorkItemDoc, id: string): WorkItem {
  return {
    id,
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
export class FirestoreWorkItemStore
  extends BaseFirestoreRepository<WorkItem & TenantScopedEntity, WorkItemDoc>
  implements WorkItemStore
{
  constructor(db?: Firestore) {
    super(db, {
      tenantScoped: {
        parentCollection: COLLECTIONS.TENANTS,
        subcollection: COLLECTIONS.WORK_ITEMS,
      },
      idPrefix: 'wi',
      timestampFields: ['createdAt', 'updatedAt', 'dueAt'],
      docToModel: workItemDocToModel,
      modelToDoc: workItemModelToDoc,
    });
  }

  async createWorkItem(item: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkItem> {
    const now = new Date();
    const itemId = this.generateId();

    const fullItem: WorkItem = {
      ...item,
      id: itemId,
      createdAt: now,
      updatedAt: now,
    };

    const doc = this.toDocument(fullItem);
    await this.getDocRef(itemId, item.tenantId).set(doc);

    return fullItem;
  }

  async getWorkItem(itemId: string): Promise<WorkItem | null> {
    return this.getDocumentAcrossTenants(itemId);
  }

  async getWorkItemByDedupeKey(tenantId: string, dedupeKey: string): Promise<WorkItem | null> {
    return this.findByField('dedupeKey', dedupeKey, tenantId);
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
    const conditions: Array<{ field: string; operator: '==' | '>=' | '<' | '>' | '<=' | '!=' | 'in' | 'array-contains'; value: unknown }> = [];

    // Handle status array - Firestore doesn't support 'in' with other conditions easily
    const statusArray = filter?.status
      ? (Array.isArray(filter.status) ? filter.status : [filter.status])
      : null;

    if (statusArray && statusArray.length === 1) {
      conditions.push({ field: 'status', operator: '==', value: statusArray[0] });
    }
    if (filter?.type) {
      conditions.push({ field: 'type', operator: '==', value: filter.type });
    }
    if (filter?.assignedTo) {
      conditions.push({ field: 'assignedTo', operator: '==', value: filter.assignedTo });
    }
    if (filter?.minScore !== undefined) {
      conditions.push({ field: 'score', operator: '>=', value: filter.minScore });
    }

    let items = await this.listDocuments(
      conditions,
      { limit: filter?.limit, offset: filter?.offset },
      tenantId,
      'score',
      'desc'
    );

    // Apply client-side filters
    if (statusArray && statusArray.length > 1) {
      items = items.filter(i => statusArray.includes(i.status));
    }
    if (filter?.repo) {
      items = items.filter(i => i.repo?.fullName === filter.repo);
    }

    return items;
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

    await this.getDocRef(itemId, existing.tenantId).update(updateData);

    return updated;
  }

  async addSignalToWorkItem(itemId: string, signalId: string): Promise<WorkItem> {
    const existing = await this.getWorkItem(itemId);
    if (!existing) {
      throw new Error(`Work item not found: ${itemId}`);
    }

    await this.getDocRef(itemId, existing.tenantId).update({
      signalIds: FieldValue.arrayUnion(signalId),
      updatedAt: Timestamp.now(),
    });

    existing.signalIds.push(signalId);
    existing.updatedAt = new Date();
    return existing;
  }

  async countWorkItems(tenantId: string, status?: WorkItemStatus | WorkItemStatus[]): Promise<number> {
    const conditions: Array<{ field: string; operator: '==' | '>=' | '<' | '>' | '<=' | '!=' | 'in' | 'array-contains'; value: unknown }> = [];

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      if (statuses.length === 1) {
        conditions.push({ field: 'status', operator: '==', value: statuses[0] });
      }
      // For multiple statuses, count is less accurate - we count all and filter would be needed
    }

    return this.countDocuments(conditions, tenantId);
  }

  async getQueueStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<WorkItemStatus, number>;
    byType: Record<WorkItemType, number>;
    avgScore: number;
  }> {
    // Fetch all items for stats calculation
    const items = await this.listDocuments([], { limit: 10000 }, tenantId);

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
