/**
 * Firestore PR Candidate Store Implementation (Phase 14)
 *
 * Production-ready PRCandidateStore backed by Google Firestore.
 * Manages PR candidates with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/pr_candidates/{candidateId}
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, Query, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type {
  PRCandidateStore,
  PRCandidate,
  PRCandidateStatus,
  CandidatePlan,
  CandidatePatchset,
  CandidateRisk,
  CandidateApproval,
  CandidateIntentReceipt,
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

interface CandidateDoc {
  id: string;
  workItemId: string;
  tenantId: string;
  status: string;
  plan: CandidatePlan;
  patchset?: CandidatePatchset;
  risk: CandidateRisk;
  confidence: number;
  requiredApprovals: number;
  approvals: Array<{
    userId: string;
    decision: string;
    comment?: string;
    timestamp: Timestamp;
  }>;
  intentReceipt: CandidateIntentReceipt;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  appliedAt?: Timestamp;
  resultingPRUrl?: string;
  runId?: string;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function candidateDocToModel(doc: CandidateDoc): PRCandidate {
  return {
    id: doc.id,
    workItemId: doc.workItemId,
    tenantId: doc.tenantId,
    status: doc.status as PRCandidateStatus,
    plan: doc.plan,
    patchset: doc.patchset,
    risk: doc.risk,
    confidence: doc.confidence,
    requiredApprovals: doc.requiredApprovals,
    approvals: doc.approvals.map(a => ({
      userId: a.userId,
      decision: a.decision as CandidateApproval['decision'],
      comment: a.comment,
      timestamp: timestampToDate(a.timestamp)!,
    })),
    intentReceipt: doc.intentReceipt,
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
    appliedAt: timestampToDate(doc.appliedAt),
    resultingPRUrl: doc.resultingPRUrl,
    runId: doc.runId,
  };
}

function candidateModelToDoc(candidate: PRCandidate): CandidateDoc {
  return {
    id: candidate.id,
    workItemId: candidate.workItemId,
    tenantId: candidate.tenantId,
    status: candidate.status,
    plan: candidate.plan,
    patchset: candidate.patchset,
    risk: candidate.risk,
    confidence: candidate.confidence,
    requiredApprovals: candidate.requiredApprovals,
    approvals: candidate.approvals.map(a => ({
      userId: a.userId,
      decision: a.decision,
      comment: a.comment,
      timestamp: dateToTimestamp(a.timestamp)!,
    })),
    intentReceipt: candidate.intentReceipt,
    createdAt: dateToTimestamp(candidate.createdAt)!,
    updatedAt: dateToTimestamp(candidate.updatedAt)!,
    appliedAt: dateToTimestamp(candidate.appliedAt),
    resultingPRUrl: candidate.resultingPRUrl,
    runId: candidate.runId,
  };
}

// =============================================================================
// Firestore PR Candidate Store Implementation
// =============================================================================

/**
 * Firestore-backed PRCandidateStore implementation (Phase 14)
 *
 * Provides production-ready PR candidate storage with:
 * - Tenant-scoped candidate management
 * - Work item ID indexing
 * - Approval tracking
 * - Status filtering
 */
export class FirestorePRCandidateStore implements PRCandidateStore {
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

  private candidatesRef(tenantId: string): CollectionReference {
    return this.tenantsRef().doc(tenantId).collection(COLLECTIONS.PR_CANDIDATES);
  }

  private candidateDoc(tenantId: string, candidateId: string): DocumentReference {
    return this.candidatesRef(tenantId).doc(candidateId);
  }

  // ---------------------------------------------------------------------------
  // PR Candidate CRUD
  // ---------------------------------------------------------------------------

  async createCandidate(
    candidate: Omit<PRCandidate, 'id' | 'createdAt' | 'updatedAt' | 'approvals'>
  ): Promise<PRCandidate> {
    const now = new Date();
    const candidateId = generateFirestoreId('prc');

    const fullCandidate: PRCandidate = {
      ...candidate,
      id: candidateId,
      approvals: [],
      createdAt: now,
      updatedAt: now,
    };

    const doc = candidateModelToDoc(fullCandidate);
    await this.candidateDoc(candidate.tenantId, candidateId).set(doc);

    return fullCandidate;
  }

  async getCandidate(candidateId: string): Promise<PRCandidate | null> {
    // We need to search across all tenants since we only have candidateId
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const candidateSnapshot = await this.candidatesRef(tenantDoc.id).doc(candidateId).get();
      if (candidateSnapshot.exists) {
        return candidateDocToModel(candidateSnapshot.data() as CandidateDoc);
      }
    }

    return null;
  }

  async getCandidateByWorkItemId(workItemId: string): Promise<PRCandidate | null> {
    // Search across all tenants for the work item's candidate
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const snapshot = await this.candidatesRef(tenantDoc.id)
        .where('workItemId', '==', workItemId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        return candidateDocToModel(snapshot.docs[0].data() as CandidateDoc);
      }
    }

    return null;
  }

  async listCandidates(
    tenantId: string,
    filter?: {
      status?: PRCandidateStatus | PRCandidateStatus[];
      workItemId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<PRCandidate[]> {
    let query: Query = this.candidatesRef(tenantId);

    // Note: Firestore doesn't support array 'in' queries with other where clauses easily
    const statusArray = filter?.status
      ? (Array.isArray(filter.status) ? filter.status : [filter.status])
      : null;

    if (statusArray && statusArray.length === 1) {
      query = query.where('status', '==', statusArray[0]);
    }
    if (filter?.workItemId) {
      query = query.where('workItemId', '==', filter.workItemId);
    }

    query = query.orderBy('createdAt', 'desc');

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    // Apply limit with offset padding
    query = query.limit(limit + offset);

    const snapshot = await query.get();
    let candidates = snapshot.docs.map(doc => candidateDocToModel(doc.data() as CandidateDoc));

    // Apply client-side filters
    if (statusArray && statusArray.length > 1) {
      candidates = candidates.filter(c => statusArray.includes(c.status));
    }

    // Apply offset
    return candidates.slice(offset, offset + limit);
  }

  async updateCandidate(
    candidateId: string,
    update: Partial<Pick<PRCandidate, 'status' | 'patchset' | 'resultingPRUrl' | 'runId' | 'appliedAt' | 'plan' | 'risk' | 'confidence' | 'intentReceipt'>>
  ): Promise<PRCandidate> {
    // Find the candidate first
    const existing = await this.getCandidate(candidateId);
    if (!existing) {
      throw new Error(`PR candidate not found: ${candidateId}`);
    }

    const updated: PRCandidate = {
      ...existing,
      ...update,
      updatedAt: new Date(),
    };

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (update.status !== undefined) updateData.status = update.status;
    if (update.patchset !== undefined) updateData.patchset = update.patchset;
    if (update.resultingPRUrl !== undefined) updateData.resultingPRUrl = update.resultingPRUrl;
    if (update.runId !== undefined) updateData.runId = update.runId;
    if (update.appliedAt !== undefined) updateData.appliedAt = dateToTimestamp(update.appliedAt);
    // Phase 19: Support plan/risk/confidence/intentReceipt updates
    if (update.plan !== undefined) updateData.plan = update.plan;
    if (update.risk !== undefined) updateData.risk = update.risk;
    if (update.confidence !== undefined) updateData.confidence = update.confidence;
    if (update.intentReceipt !== undefined) updateData.intentReceipt = update.intentReceipt;

    await this.candidateDoc(existing.tenantId, candidateId).update(updateData);

    return updated;
  }

  async addApproval(candidateId: string, approval: CandidateApproval): Promise<PRCandidate> {
    const existing = await this.getCandidate(candidateId);
    if (!existing) {
      throw new Error(`PR candidate not found: ${candidateId}`);
    }

    const approvalDoc = {
      userId: approval.userId,
      decision: approval.decision,
      comment: approval.comment,
      timestamp: dateToTimestamp(approval.timestamp),
    };

    // Add approval and update status in a transaction
    const candidateRef = this.candidateDoc(existing.tenantId, candidateId);

    await this.db.runTransaction(async (transaction) => {
      const docSnapshot = await transaction.get(candidateRef);
      const data = docSnapshot.data() as CandidateDoc;

      const newApprovals = [...data.approvals, approvalDoc];

      // Check if we have enough approvals
      const approvedCount = newApprovals.filter(a => a.decision === 'approved').length;
      let newStatus = data.status;

      if (approvedCount >= data.requiredApprovals && data.status === 'ready') {
        newStatus = 'approved';
      }
      if (approval.decision === 'rejected') {
        newStatus = 'rejected';
      }

      transaction.update(candidateRef, {
        approvals: FieldValue.arrayUnion(approvalDoc),
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
    });

    // Refresh and return
    const refreshed = await this.getCandidate(candidateId);
    return refreshed!;
  }
}
