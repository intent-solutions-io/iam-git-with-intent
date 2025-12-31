/**
 * Approval Store Interface and Implementations
 *
 * Story C4: Stores and retrieves approval requests.
 * Provides in-memory implementation for testing/dev.
 *
 * @module @gwi/engine/approval
 */

import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  ApprovalDecision,
} from './types.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Interface for storing and retrieving approval requests
 */
export interface ApprovalStore {
  /**
   * Create a new approval request
   */
  createRequest(request: Omit<ApprovalRequest, 'id' | 'createdAt' | 'escalationCount' | 'decisions'>): Promise<ApprovalRequest>;

  /**
   * Get an approval request by ID
   */
  getRequest(requestId: string): Promise<ApprovalRequest | null>;

  /**
   * Get approval request by run and step ID
   */
  getRequestByRunAndStep(runId: string, stepId: string): Promise<ApprovalRequest | null>;

  /**
   * Update approval request status
   */
  updateStatus(requestId: string, status: ApprovalRequestStatus): Promise<void>;

  /**
   * Add a decision to an approval request
   */
  addDecision(requestId: string, decision: ApprovalDecision): Promise<void>;

  /**
   * Increment escalation count
   */
  incrementEscalation(requestId: string): Promise<void>;

  /**
   * Set resolved timestamp
   */
  setResolved(requestId: string, resolvedAt: Date): Promise<void>;

  /**
   * List pending approval requests (for timeout checking)
   */
  listPending(tenantId: string): Promise<ApprovalRequest[]>;

  /**
   * List approval requests by run ID
   */
  listByRunId(runId: string): Promise<ApprovalRequest[]>;

  /**
   * Delete an approval request (for testing)
   */
  deleteRequest(requestId: string): Promise<void>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory implementation of ApprovalStore
 * Used for testing and local development
 */
export class InMemoryApprovalStore implements ApprovalStore {
  private requests = new Map<string, ApprovalRequest>();
  private idCounter = 0;

  async createRequest(
    request: Omit<ApprovalRequest, 'id' | 'createdAt' | 'escalationCount' | 'decisions'>
  ): Promise<ApprovalRequest> {
    const id = `apr-${Date.now()}-${this.idCounter++}`;
    const now = new Date();

    const fullRequest: ApprovalRequest = {
      ...request,
      id,
      createdAt: now,
      escalationCount: 0,
      decisions: [],
    };

    this.requests.set(id, fullRequest);
    return fullRequest;
  }

  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    return this.requests.get(requestId) || null;
  }

  async getRequestByRunAndStep(runId: string, stepId: string): Promise<ApprovalRequest | null> {
    for (const request of this.requests.values()) {
      if (request.runId === runId && request.stepId === stepId) {
        return request;
      }
    }
    return null;
  }

  async updateStatus(requestId: string, status: ApprovalRequestStatus): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }
    request.status = status;
  }

  async addDecision(requestId: string, decision: ApprovalDecision): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }
    request.decisions.push(decision);
  }

  async incrementEscalation(requestId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }
    request.escalationCount++;
  }

  async setResolved(requestId: string, resolvedAt: Date): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }
    request.resolvedAt = resolvedAt;
  }

  async listPending(tenantId: string): Promise<ApprovalRequest[]> {
    return Array.from(this.requests.values())
      .filter(r => r.tenantId === tenantId && r.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listByRunId(runId: string): Promise<ApprovalRequest[]> {
    return Array.from(this.requests.values())
      .filter(r => r.runId === runId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async deleteRequest(requestId: string): Promise<void> {
    this.requests.delete(requestId);
  }

  /**
   * Clear all requests (for testing)
   */
  clear(): void {
    this.requests.clear();
    this.idCounter = 0;
  }

  /**
   * Get all requests (for testing)
   */
  getAllRequests(): ApprovalRequest[] {
    return Array.from(this.requests.values());
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let storeInstance: ApprovalStore | null = null;

/**
 * Get the ApprovalStore singleton
 * Uses in-memory implementation by default
 */
export function getApprovalStore(): ApprovalStore {
  if (!storeInstance) {
    // TODO: Support Firestore backend when GWI_STORE_BACKEND=firestore
    storeInstance = new InMemoryApprovalStore();
  }
  return storeInstance;
}

/**
 * Set custom approval store (for testing)
 */
export function setApprovalStore(store: ApprovalStore): void {
  storeInstance = store;
}

/**
 * Reset approval store (for testing)
 */
export function resetApprovalStore(): void {
  storeInstance = null;
}
