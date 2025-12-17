/**
 * Firestore Approval Store
 *
 * Phase 11: Approval records for runs with destructive actions.
 * Immutable - once created, approvals cannot be modified.
 *
 * @module @gwi/core/storage
 */

import { getFirestoreClient, COLLECTIONS } from './firestore-client.js';
import type { ApprovalStore, RunApproval, ApprovalDecision } from './interfaces.js';

/**
 * Firestore implementation of ApprovalStore
 */
export class FirestoreApprovalStore implements ApprovalStore {
  private get db() {
    return getFirestoreClient();
  }

  private get collection() {
    return this.db.collection(COLLECTIONS.APPROVALS);
  }

  /**
   * Create a new approval record
   */
  async createApproval(approval: Omit<RunApproval, 'id'>): Promise<RunApproval> {
    const id = `apv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const record: RunApproval = {
      ...approval,
      id,
    };

    await this.collection.doc(id).set({
      ...record,
      decidedAt: record.decidedAt,
    });

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
    const doc = await this.collection.doc(approvalId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      ...data,
      id: doc.id,
      decidedAt: data.decidedAt?.toDate?.() || new Date(data.decidedAt),
    } as RunApproval;
  }

  /**
   * Get approval for a specific run
   */
  async getApprovalByRunId(runId: string): Promise<RunApproval | null> {
    const snapshot = await this.collection
      .where('runId', '==', runId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      decidedAt: data.decidedAt?.toDate?.() || new Date(data.decidedAt),
    } as RunApproval;
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
    let query = this.collection.where('tenantId', '==', tenantId);

    if (filter?.runId) {
      query = query.where('runId', '==', filter.runId);
    }

    if (filter?.decision) {
      query = query.where('decision', '==', filter.decision);
    }

    query = query.orderBy('decidedAt', 'desc');

    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        decidedAt: data.decidedAt?.toDate?.() || new Date(data.decidedAt),
      } as RunApproval;
    });
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
