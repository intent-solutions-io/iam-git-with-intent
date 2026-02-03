/**
 * Firestore Approval Store
 *
 * Phase 11: Approval records for runs with destructive actions.
 * Immutable - once created, approvals cannot be modified.
 *
 * Refactored to use BaseFirestoreRepository.
 *
 * @module @gwi/core/storage
 */

import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import {
  BaseFirestoreRepository,
  COLLECTIONS,
  Timestamp,
  timestampToDate,
  dateToTimestamp,
} from './base-firestore-repository.js';
import type { ApprovalStore, RunApproval, ApprovalDecision, ProposedChange } from './interfaces.js';

// =============================================================================
// Firestore Document Type
// =============================================================================

interface ApprovalDoc extends DocumentData {
  id: string;
  runId: string;
  tenantId: string;
  decision: string;
  decidedBy: string;
  decidedAt: Timestamp;
  reason?: string;
  proposedChangesSnapshot?: ProposedChange[];
}

// =============================================================================
// Conversion Functions
// =============================================================================

function approvalDocToModel(doc: ApprovalDoc, id: string): RunApproval {
  return {
    id,
    runId: doc.runId,
    tenantId: doc.tenantId,
    decision: doc.decision as ApprovalDecision,
    decidedBy: doc.decidedBy,
    decidedAt: timestampToDate(doc.decidedAt) ?? new Date(),
    reason: doc.reason,
    proposedChangesSnapshot: doc.proposedChangesSnapshot,
  };
}

function approvalModelToDoc(approval: RunApproval): ApprovalDoc {
  return {
    id: approval.id,
    runId: approval.runId,
    tenantId: approval.tenantId,
    decision: approval.decision,
    decidedBy: approval.decidedBy,
    decidedAt: dateToTimestamp(approval.decidedAt) as Timestamp,
    reason: approval.reason,
    proposedChangesSnapshot: approval.proposedChangesSnapshot,
  };
}

// =============================================================================
// Firestore Approval Store Implementation
// =============================================================================

/**
 * Firestore implementation of ApprovalStore using BaseFirestoreRepository
 */
export class FirestoreApprovalStore
  extends BaseFirestoreRepository<RunApproval, ApprovalDoc>
  implements ApprovalStore
{
  constructor(db?: Firestore) {
    super(db, {
      collection: COLLECTIONS.APPROVALS,
      idPrefix: 'apv',
      timestampFields: ['decidedAt'],
      docToModel: approvalDocToModel,
      modelToDoc: approvalModelToDoc,
    });
  }

  /**
   * Create a new approval record
   */
  async createApproval(approval: Omit<RunApproval, 'id'>): Promise<RunApproval> {
    const id = this.generateId();

    const record: RunApproval = {
      ...approval,
      id,
    };

    const doc = this.toDocument(record);
    await this.getDocRef(id).set(doc);

    console.log(JSON.stringify({
      type: 'approval_created',
      approvalId: id,
      runId: approval.runId,
      tenantId: approval.tenantId,
      decision: approval.decision,
      decidedBy: approval.decidedBy,
    }));

    return record;
  }

  /**
   * Get approval by ID
   */
  async getApproval(approvalId: string): Promise<RunApproval | null> {
    return this.getDocument(approvalId);
  }

  /**
   * Get approval for a specific run
   */
  async getApprovalByRunId(runId: string): Promise<RunApproval | null> {
    return this.findByField('runId', runId);
  }

  /**
   * List approvals for a tenant
   */
  async listApprovals(
    tenantId: string,
    filter?: {
      runId?: string;
      decision?: ApprovalDecision;
      limit?: number;
    }
  ): Promise<RunApproval[]> {
    const conditions = [
      { field: 'tenantId', operator: '==' as const, value: tenantId },
    ];

    if (filter?.runId) {
      conditions.push({ field: 'runId', operator: '==', value: filter.runId });
    }

    if (filter?.decision) {
      conditions.push({ field: 'decision', operator: '==', value: filter.decision });
    }

    return this.listDocuments(
      conditions,
      { limit: filter?.limit },
      undefined,
      'decidedAt',
      'desc'
    );
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let approvalStoreInstance: ApprovalStore | null = null;

/**
 * Get the ApprovalStore based on environment configuration
 */
export function getApprovalStore(): ApprovalStore {
  if (approvalStoreInstance) {
    return approvalStoreInstance;
  }

  const backend = process.env.GWI_STORE_BACKEND?.toLowerCase();

  if (backend === 'firestore') {
    approvalStoreInstance = new FirestoreApprovalStore();
  } else {
    // In-memory fallback
    approvalStoreInstance = new InMemoryApprovalStore();
  }

  return approvalStoreInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetApprovalStore(): void {
  approvalStoreInstance = null;
}

// =============================================================================
// In-Memory Implementation (for testing/dev)
// =============================================================================

export class InMemoryApprovalStore implements ApprovalStore {
  private approvals = new Map<string, RunApproval>();

  async createApproval(approval: Omit<RunApproval, 'id'>): Promise<RunApproval> {
    const id = `apv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: RunApproval = { ...approval, id };
    this.approvals.set(id, record);
    return record;
  }

  async getApproval(approvalId: string): Promise<RunApproval | null> {
    return this.approvals.get(approvalId) || null;
  }

  async getApprovalByRunId(runId: string): Promise<RunApproval | null> {
    for (const approval of this.approvals.values()) {
      if (approval.runId === runId) {
        return approval;
      }
    }
    return null;
  }

  async listApprovals(
    tenantId: string,
    filter?: {
      runId?: string;
      decision?: ApprovalDecision;
      limit?: number;
    }
  ): Promise<RunApproval[]> {
    let results = Array.from(this.approvals.values())
      .filter((a) => a.tenantId === tenantId);

    if (filter?.runId) {
      results = results.filter((a) => a.runId === filter.runId);
    }

    if (filter?.decision) {
      results = results.filter((a) => a.decision === filter.decision);
    }

    results.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  // Testing helper
  clear(): void {
    this.approvals.clear();
  }
}
