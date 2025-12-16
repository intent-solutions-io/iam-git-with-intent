/**
 * Firestore Membership Store Implementation
 *
 * Phase 11: Production-ready membership store for multi-tenant RBAC.
 * Manages user-tenant relationships with role-based access control.
 *
 * Collection Structure:
 * - gwi_memberships/{membershipId} - User membership in a tenant
 *   - membershipId format: {userId}_{tenantId}
 * - gwi_users/{userId}/memberships/{tenantId} - Reverse index for user lookups
 *
 * @module @gwi/core/storage/firestore-membership
 */

import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type { MembershipStore, Membership, TenantRole, MembershipStatus } from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
} from './firestore-client.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface MembershipDoc {
  id: string;
  userId: string;
  tenantId: string;
  role: string;
  githubRole?: string;
  status: string;
  invitedBy?: string;
  invitedAt?: Timestamp;
  acceptedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function membershipDocToModel(doc: MembershipDoc): Membership {
  return {
    id: doc.id,
    userId: doc.userId,
    tenantId: doc.tenantId,
    role: doc.role as TenantRole,
    githubRole: doc.githubRole,
    status: doc.status as MembershipStatus,
    invitedBy: doc.invitedBy,
    invitedAt: timestampToDate(doc.invitedAt),
    acceptedAt: timestampToDate(doc.acceptedAt),
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
  };
}

function membershipModelToDoc(membership: Membership): MembershipDoc {
  return {
    id: membership.id,
    userId: membership.userId,
    tenantId: membership.tenantId,
    role: membership.role,
    githubRole: membership.githubRole,
    status: membership.status,
    invitedBy: membership.invitedBy,
    invitedAt: dateToTimestamp(membership.invitedAt),
    acceptedAt: dateToTimestamp(membership.acceptedAt),
    createdAt: dateToTimestamp(membership.createdAt)!,
    updatedAt: dateToTimestamp(membership.updatedAt)!,
  };
}

// =============================================================================
// Firestore Membership Store Implementation
// =============================================================================

/**
 * Firestore-backed MembershipStore implementation
 *
 * Provides:
 * - User-tenant membership management
 * - Role-based access queries
 * - Both user-centric and tenant-centric lookups
 */
export class FirestoreMembershipStore implements MembershipStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private membershipsRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.MEMBERSHIPS);
  }

  private membershipDoc(membershipId: string): DocumentReference {
    return this.membershipsRef().doc(membershipId);
  }

  /**
   * Generate a deterministic membership ID
   */
  private getMembershipId(userId: string, tenantId: string): string {
    return `${userId}_${tenantId}`;
  }

  // ---------------------------------------------------------------------------
  // MembershipStore Implementation
  // ---------------------------------------------------------------------------

  async createMembership(
    membership: Omit<Membership, 'createdAt' | 'updatedAt'>
  ): Promise<Membership> {
    const now = new Date();
    const membershipId = this.getMembershipId(membership.userId, membership.tenantId);

    // Check if membership already exists
    const existing = await this.getMembership(membership.userId, membership.tenantId);
    if (existing) {
      throw new Error(`Membership already exists for user ${membership.userId} in tenant ${membership.tenantId}`);
    }

    const fullMembership: Membership = {
      ...membership,
      id: membershipId,
      createdAt: now,
      updatedAt: now,
    };

    const doc = membershipModelToDoc(fullMembership);
    await this.membershipDoc(membershipId).set(doc);

    return fullMembership;
  }

  async getMembership(userId: string, tenantId: string): Promise<Membership | null> {
    const membershipId = this.getMembershipId(userId, tenantId);
    const snapshot = await this.membershipDoc(membershipId).get();

    if (!snapshot.exists) {
      return null;
    }

    return membershipDocToModel(snapshot.data() as MembershipDoc);
  }

  async listUserMemberships(userId: string): Promise<Membership[]> {
    const query = this.membershipsRef()
      .where('userId', '==', userId)
      .where('status', '==', 'active');

    const snapshot = await query.get();
    return snapshot.docs.map(doc => membershipDocToModel(doc.data() as MembershipDoc));
  }

  async listTenantMembers(tenantId: string): Promise<Membership[]> {
    const query = this.membershipsRef()
      .where('tenantId', '==', tenantId);

    const snapshot = await query.get();
    return snapshot.docs.map(doc => membershipDocToModel(doc.data() as MembershipDoc));
  }

  async updateMembership(
    membershipId: string,
    update: Partial<Membership>
  ): Promise<Membership> {
    const snapshot = await this.membershipDoc(membershipId).get();

    if (!snapshot.exists) {
      throw new Error(`Membership not found: ${membershipId}`);
    }

    const existing = membershipDocToModel(snapshot.data() as MembershipDoc);

    const updated: Membership = {
      ...existing,
      ...update,
      id: existing.id, // Never change ID
      userId: existing.userId, // Never change userId
      tenantId: existing.tenantId, // Never change tenantId
      createdAt: existing.createdAt, // Never change createdAt
      updatedAt: new Date(),
    };

    const doc = membershipModelToDoc(updated);
    await this.membershipDoc(membershipId).set(doc, { merge: true });

    return updated;
  }

  async deleteMembership(membershipId: string): Promise<void> {
    await this.membershipDoc(membershipId).delete();
  }

  // ---------------------------------------------------------------------------
  // Extended Methods for RBAC
  // ---------------------------------------------------------------------------

  /**
   * Check if a user has access to a tenant with at least the specified role
   */
  async hasAccess(
    userId: string,
    tenantId: string,
    requiredRole?: TenantRole
  ): Promise<boolean> {
    const membership = await this.getMembership(userId, tenantId);

    if (!membership || membership.status !== 'active') {
      return false;
    }

    if (!requiredRole) {
      return true; // Any active membership grants access
    }

    // Role hierarchy: owner > admin > member
    const roleHierarchy: Record<TenantRole, number> = {
      owner: 3,
      admin: 2,
      member: 1,
    };

    return roleHierarchy[membership.role] >= roleHierarchy[requiredRole];
  }

  /**
   * Get a user's role in a tenant
   */
  async getUserRole(userId: string, tenantId: string): Promise<TenantRole | null> {
    const membership = await this.getMembership(userId, tenantId);

    if (!membership || membership.status !== 'active') {
      return null;
    }

    return membership.role;
  }

  /**
   * Count active members in a tenant
   */
  async countTenantMembers(tenantId: string): Promise<number> {
    const query = this.membershipsRef()
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'active');

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  /**
   * List tenant members by role
   */
  async listTenantMembersByRole(tenantId: string, role: TenantRole): Promise<Membership[]> {
    const query = this.membershipsRef()
      .where('tenantId', '==', tenantId)
      .where('role', '==', role)
      .where('status', '==', 'active');

    const snapshot = await query.get();
    return snapshot.docs.map(doc => membershipDocToModel(doc.data() as MembershipDoc));
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let membershipStoreInstance: FirestoreMembershipStore | null = null;

/**
 * Get the singleton MembershipStore instance
 */
export function getMembershipStore(): MembershipStore {
  if (!membershipStoreInstance) {
    membershipStoreInstance = new FirestoreMembershipStore();
  }
  return membershipStoreInstance;
}
