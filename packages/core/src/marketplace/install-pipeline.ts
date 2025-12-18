/**
 * Connector Install Pipeline
 *
 * Phase 29: Policy-aware connector installation.
 * Phase 30 fixup: Firestore-backed pending request persistence.
 *
 * Integrates with Phase 25 approval system to enforce:
 * - Tenant-level connector policies
 * - Capability-based approval requirements
 * - Audit trail for all installations
 * - Persistent pending requests (survives restarts)
 * - Idempotent request creation
 *
 * @module @gwi/core/marketplace/install-pipeline
 */

import { randomUUID, createHash } from 'node:crypto';
import type {
  SignedApproval,
  ApproverIdentity,
} from '../approvals/types.js';
import type { ConnectorCapability } from '../connectors/manifest.js';
import { getMarketplaceService, type MarketplaceService } from './service.js';
import { getMarketplaceStore, type MarketplaceStore } from './storage.js';
import type { ConnectorInstallation, InstallRequest, PendingInstallRequestRecord } from './types.js';

// =============================================================================
// Install Policy Types
// =============================================================================

/**
 * Connector install policy
 */
export interface ConnectorInstallPolicy {
  /** Policy ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Capabilities that require approval */
  requireApprovalForCapabilities: ConnectorCapability[];

  /** Capabilities that are blocked entirely */
  blockedCapabilities: ConnectorCapability[];

  /** Specific connectors that are allowed (whitelist mode) */
  allowedConnectors?: string[];

  /** Specific connectors that are blocked */
  blockedConnectors: string[];

  /** Require approval for all installs */
  requireApprovalForAll: boolean;

  /** Minimum number of approvals required */
  minApprovals: number;

  /** Roles that can approve installations */
  approverRoles: string[];

  /** Auto-approve verified connectors */
  autoApproveVerified: boolean;

  /** Updated timestamp */
  updatedAt: string;

  /** Updated by */
  updatedBy: string;
}

/**
 * Install request result
 */
export interface InstallPipelineResult {
  success: boolean;
  installation?: ConnectorInstallation;
  requiresApproval?: boolean;
  approvalId?: string;
  blockedReason?: string;
  error?: string;
}

/**
 * Pending install request (in-memory view with full approvals)
 *
 * @deprecated Use PendingInstallRequestRecord from types.ts for storage
 */
export interface PendingInstallRequest {
  id: string;
  tenantId: string;
  connectorId: string;
  version: string;
  requestedBy: string;
  requestedAt: string;
  requiredApprovals: number;
  currentApprovals: SignedApproval[];
  policyId: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  expiresAt: string;
}

// =============================================================================
// Default Policy
// =============================================================================

/**
 * Default connector install policy
 */
export const DEFAULT_INSTALL_POLICY: Omit<ConnectorInstallPolicy, 'id' | 'tenantId' | 'updatedAt' | 'updatedBy'> = {
  requireApprovalForCapabilities: ['auth', 'cloud', 'database'],
  blockedCapabilities: [],
  blockedConnectors: [],
  requireApprovalForAll: false,
  minApprovals: 1,
  approverRoles: ['owner', 'admin'],
  autoApproveVerified: true,
};

// =============================================================================
// Install Pipeline
// =============================================================================

export class InstallPipeline {
  private service: MarketplaceService;
  private store: MarketplaceStore;
  private policies: Map<string, ConnectorInstallPolicy> = new Map();

  constructor(service?: MarketplaceService, store?: MarketplaceStore) {
    this.service = service ?? getMarketplaceService();
    this.store = store ?? getMarketplaceStore();
  }

  /**
   * Generate idempotency key for install request
   */
  private generateIdempotencyKey(tenantId: string, connectorId: string, version: string): string {
    const data = `${tenantId}:${connectorId}:${version}`;
    return createHash('sha256').update(data).digest('hex').slice(0, 32);
  }

  /**
   * Set install policy for a tenant
   */
  setPolicy(policy: ConnectorInstallPolicy): void {
    this.policies.set(policy.tenantId, policy);
  }

  /**
   * Get install policy for a tenant
   */
  getPolicy(tenantId: string): ConnectorInstallPolicy {
    const custom = this.policies.get(tenantId);
    if (custom) return custom;

    // Return default policy with tenant ID
    return {
      ...DEFAULT_INSTALL_POLICY,
      id: `default-${tenantId}`,
      tenantId,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
  }

  /**
   * Request connector installation
   *
   * May complete immediately or require approval based on policy.
   */
  async requestInstall(
    tenantId: string,
    request: InstallRequest,
    requestedBy: ApproverIdentity
  ): Promise<InstallPipelineResult> {
    const policy = this.getPolicy(tenantId);

    // Get connector info
    const connector = await this.service.getConnector(request.connectorId);
    if (!connector) {
      return { success: false, error: 'Connector not found' };
    }

    // Resolve version
    let version = request.version;
    if (version === 'latest') {
      version = connector.latestVersion;
    }

    // Check blocked connectors
    if (policy.blockedConnectors.includes(request.connectorId)) {
      return {
        success: false,
        blockedReason: `Connector ${request.connectorId} is blocked by policy`,
      };
    }

    // Check whitelist mode
    if (policy.allowedConnectors && !policy.allowedConnectors.includes(request.connectorId)) {
      return {
        success: false,
        blockedReason: `Connector ${request.connectorId} is not in the allowed list`,
      };
    }

    // Check blocked capabilities
    const blockedCaps = connector.capabilities.filter(cap =>
      policy.blockedCapabilities.includes(cap as ConnectorCapability)
    );
    if (blockedCaps.length > 0) {
      return {
        success: false,
        blockedReason: `Connector has blocked capabilities: ${blockedCaps.join(', ')}`,
      };
    }

    // Determine if approval is required
    const requiresApproval = this.checkApprovalRequired(connector.capabilities, policy, connector.verified);

    if (!requiresApproval) {
      // Proceed with installation
      const result = await this.service.install(
        tenantId,
        { ...request, version },
        requestedBy.id
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        installation: result.installation,
      };
    }

    // Generate idempotency key to prevent duplicate requests
    const idempotencyKey = this.generateIdempotencyKey(tenantId, request.connectorId, version);

    // Check for existing request with same idempotency key
    const existingRequest = await this.store.getInstallRequestByIdempotencyKey(tenantId, idempotencyKey);
    if (existingRequest) {
      // Return existing request (idempotent behavior)
      if (existingRequest.status === 'pending') {
        return {
          success: false,
          requiresApproval: true,
          approvalId: existingRequest.id,
        };
      } else if (existingRequest.status === 'approved') {
        // Already approved, check if installation exists
        const installation = await this.store.getInstallation(tenantId, request.connectorId);
        if (installation) {
          return { success: true, installation };
        }
      } else if (existingRequest.status === 'denied') {
        return {
          success: false,
          blockedReason: existingRequest.denialReason || 'Request was previously denied',
        };
      }
      // Expired request - allow creating new one below
    }

    // Create pending request (persisted to Firestore)
    const now = new Date().toISOString();
    const pendingRequest: PendingInstallRequestRecord = {
      id: randomUUID(),
      tenantId,
      connectorId: request.connectorId,
      version,
      requestedBy: requestedBy.id,
      requestedAt: now,
      requiredApprovals: policy.minApprovals,
      currentApprovalCount: 0,
      approvalIds: [],
      policyId: policy.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.createInstallRequest(pendingRequest);

    return {
      success: false,
      requiresApproval: true,
      approvalId: pendingRequest.id,
    };
  }

  /**
   * Approve a pending install request
   */
  async approveInstall(
    tenantId: string,
    requestId: string,
    approval: SignedApproval
  ): Promise<InstallPipelineResult> {
    const request = await this.store.getInstallRequest(tenantId, requestId);
    if (!request) {
      return { success: false, error: 'Pending request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request is ${request.status}` };
    }

    // Check expiration
    if (new Date(request.expiresAt) < new Date()) {
      await this.store.updateInstallRequest(tenantId, requestId, { status: 'expired' });
      return { success: false, error: 'Request has expired' };
    }

    // Add approval ID
    const newApprovalCount = request.currentApprovalCount + 1;
    const newApprovalIds = [...request.approvalIds, approval.approvalId];

    // Check if we have enough approvals
    if (newApprovalCount >= request.requiredApprovals) {
      // Update status to approved
      await this.store.updateInstallRequest(tenantId, requestId, {
        status: 'approved',
        currentApprovalCount: newApprovalCount,
        approvalIds: newApprovalIds,
      });

      // Proceed with installation
      const result = await this.service.install(
        request.tenantId,
        {
          connectorId: request.connectorId,
          version: request.version,
        },
        request.requestedBy,
        requestId // Link to approval
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Keep the request record for audit trail (don't delete)

      return {
        success: true,
        installation: result.installation,
      };
    }

    // Update approval count (still needs more approvals)
    await this.store.updateInstallRequest(tenantId, requestId, {
      currentApprovalCount: newApprovalCount,
      approvalIds: newApprovalIds,
    });

    return {
      success: false,
      requiresApproval: true,
      approvalId: requestId,
    };
  }

  /**
   * Deny a pending install request
   */
  async denyInstall(tenantId: string, requestId: string, reason: string): Promise<InstallPipelineResult> {
    const request = await this.store.getInstallRequest(tenantId, requestId);
    if (!request) {
      return { success: false, error: 'Pending request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request is ${request.status}` };
    }

    await this.store.updateInstallRequest(tenantId, requestId, {
      status: 'denied',
      denialReason: reason,
    });

    return {
      success: false,
      blockedReason: reason,
    };
  }

  /**
   * Get pending requests for a tenant
   */
  async getPendingRequests(tenantId: string): Promise<PendingInstallRequestRecord[]> {
    return this.store.listPendingInstallRequests(tenantId);
  }

  /**
   * Get a specific install request
   */
  async getInstallRequest(tenantId: string, requestId: string): Promise<PendingInstallRequestRecord | null> {
    return this.store.getInstallRequest(tenantId, requestId);
  }

  /**
   * Check if approval is required based on policy
   */
  private checkApprovalRequired(
    capabilities: string[],
    policy: ConnectorInstallPolicy,
    verified: boolean
  ): boolean {
    // Auto-approve verified connectors if policy allows
    if (verified && policy.autoApproveVerified) {
      return false;
    }

    // Require approval for all
    if (policy.requireApprovalForAll) {
      return true;
    }

    // Check capability-based requirements
    const requiresApproval = capabilities.some(cap =>
      policy.requireApprovalForCapabilities.includes(cap as ConnectorCapability)
    );

    return requiresApproval;
  }
}

// =============================================================================
// Singleton
// =============================================================================

let pipelineInstance: InstallPipeline | null = null;

export function getInstallPipeline(): InstallPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new InstallPipeline();
  }
  return pipelineInstance;
}

export function resetInstallPipeline(): void {
  pipelineInstance = null;
}
