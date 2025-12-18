/**
 * Identity Store Interface and In-Memory Implementation
 *
 * Phase 31: Storage for enterprise identity data.
 *
 * @module @gwi/core/identity/store
 */

import type {
  OrgIdentityConfig,
  SsoState,
  LinkedIdentity,
  ScimUser,
  ScimGroup,
  IdentityAuditEvent,
} from './types.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Identity store interface for SSO, SCIM, and identity management
 */
export interface IdentityStore {
  // =========================================================================
  // Org Identity Config
  // =========================================================================

  /**
   * Get identity configuration for an organization
   */
  getOrgIdentityConfig(orgId: string): Promise<OrgIdentityConfig | null>;

  /**
   * Create or update identity configuration for an organization
   */
  saveOrgIdentityConfig(config: OrgIdentityConfig): Promise<void>;

  /**
   * Delete identity configuration for an organization
   */
  deleteOrgIdentityConfig(orgId: string): Promise<void>;

  // =========================================================================
  // SSO State (CSRF/Nonce)
  // =========================================================================

  /**
   * Save SSO state for a login attempt
   */
  saveSsoState(state: SsoState): Promise<void>;

  /**
   * Get and delete SSO state (one-time use)
   */
  consumeSsoState(state: string): Promise<SsoState | null>;

  /**
   * Cleanup expired SSO states
   */
  cleanupExpiredSsoStates(): Promise<number>;

  // =========================================================================
  // Linked Identities
  // =========================================================================

  /**
   * Get linked identity by external ID
   */
  getLinkedIdentityByExternalId(
    orgId: string,
    idpConfigId: string,
    externalId: string
  ): Promise<LinkedIdentity | null>;

  /**
   * Get all linked identities for a user
   */
  getLinkedIdentitiesForUser(userId: string): Promise<LinkedIdentity[]>;

  /**
   * Save/update a linked identity
   */
  saveLinkedIdentity(identity: LinkedIdentity): Promise<void>;

  /**
   * Delete a linked identity
   */
  deleteLinkedIdentity(userId: string, idpConfigId: string): Promise<void>;

  // =========================================================================
  // SCIM Users (Provisioned Users)
  // =========================================================================

  /**
   * Get SCIM user by ID
   */
  getScimUser(orgId: string, id: string): Promise<ScimUser | null>;

  /**
   * Get SCIM user by external ID
   */
  getScimUserByExternalId(orgId: string, externalId: string): Promise<ScimUser | null>;

  /**
   * Get SCIM user by username
   */
  getScimUserByUsername(orgId: string, userName: string): Promise<ScimUser | null>;

  /**
   * List SCIM users with optional filtering
   */
  listScimUsers(
    orgId: string,
    options?: {
      filter?: string;
      startIndex?: number;
      count?: number;
    }
  ): Promise<{ users: ScimUser[]; totalResults: number }>;

  /**
   * Create a SCIM user
   */
  createScimUser(orgId: string, user: ScimUser): Promise<ScimUser>;

  /**
   * Update a SCIM user
   */
  updateScimUser(orgId: string, id: string, user: Partial<ScimUser>): Promise<ScimUser | null>;

  /**
   * Delete a SCIM user
   */
  deleteScimUser(orgId: string, id: string): Promise<boolean>;

  // =========================================================================
  // SCIM Groups
  // =========================================================================

  /**
   * Get SCIM group by ID
   */
  getScimGroup(orgId: string, id: string): Promise<ScimGroup | null>;

  /**
   * Get SCIM group by external ID
   */
  getScimGroupByExternalId(orgId: string, externalId: string): Promise<ScimGroup | null>;

  /**
   * List SCIM groups with optional filtering
   */
  listScimGroups(
    orgId: string,
    options?: {
      filter?: string;
      startIndex?: number;
      count?: number;
    }
  ): Promise<{ groups: ScimGroup[]; totalResults: number }>;

  /**
   * Create a SCIM group
   */
  createScimGroup(orgId: string, group: ScimGroup): Promise<ScimGroup>;

  /**
   * Update a SCIM group
   */
  updateScimGroup(orgId: string, id: string, group: Partial<ScimGroup>): Promise<ScimGroup | null>;

  /**
   * Delete a SCIM group
   */
  deleteScimGroup(orgId: string, id: string): Promise<boolean>;

  // =========================================================================
  // Identity Audit Events
  // =========================================================================

  /**
   * Append an identity audit event
   */
  appendAuditEvent(event: IdentityAuditEvent): Promise<void>;

  /**
   * Query audit events
   */
  queryAuditEvents(
    orgId: string,
    options?: {
      action?: string;
      actorId?: string;
      targetId?: string;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: IdentityAuditEvent[]; total: number }>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory identity store for development/testing
 */
export class InMemoryIdentityStore implements IdentityStore {
  private orgConfigs = new Map<string, OrgIdentityConfig>();
  private ssoStates = new Map<string, SsoState>();
  private linkedIdentities = new Map<string, LinkedIdentity>();
  private scimUsers = new Map<string, Map<string, ScimUser>>();
  private scimGroups = new Map<string, Map<string, ScimGroup>>();
  private auditEvents: IdentityAuditEvent[] = [];

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // =========================================================================
  // Org Identity Config
  // =========================================================================

  async getOrgIdentityConfig(orgId: string): Promise<OrgIdentityConfig | null> {
    return this.orgConfigs.get(orgId) ?? null;
  }

  async saveOrgIdentityConfig(config: OrgIdentityConfig): Promise<void> {
    this.orgConfigs.set(config.orgId, config);
  }

  async deleteOrgIdentityConfig(orgId: string): Promise<void> {
    this.orgConfigs.delete(orgId);
  }

  // =========================================================================
  // SSO State
  // =========================================================================

  async saveSsoState(state: SsoState): Promise<void> {
    this.ssoStates.set(state.state, state);
  }

  async consumeSsoState(state: string): Promise<SsoState | null> {
    const ssoState = this.ssoStates.get(state);
    if (ssoState) {
      this.ssoStates.delete(state);
      if (ssoState.expiresAt < new Date()) {
        return null; // Expired
      }
    }
    return ssoState ?? null;
  }

  async cleanupExpiredSsoStates(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [key, state] of this.ssoStates) {
      if (state.expiresAt < now) {
        this.ssoStates.delete(key);
        count++;
      }
    }
    return count;
  }

  // =========================================================================
  // Linked Identities
  // =========================================================================

  private linkedIdentityKey(orgId: string, idpConfigId: string, externalId: string): string {
    return `${orgId}:${idpConfigId}:${externalId}`;
  }

  async getLinkedIdentityByExternalId(
    orgId: string,
    idpConfigId: string,
    externalId: string
  ): Promise<LinkedIdentity | null> {
    const key = this.linkedIdentityKey(orgId, idpConfigId, externalId);
    return this.linkedIdentities.get(key) ?? null;
  }

  async getLinkedIdentitiesForUser(userId: string): Promise<LinkedIdentity[]> {
    const results: LinkedIdentity[] = [];
    for (const identity of this.linkedIdentities.values()) {
      if (identity.userId === userId) {
        results.push(identity);
      }
    }
    return results;
  }

  async saveLinkedIdentity(identity: LinkedIdentity): Promise<void> {
    const key = this.linkedIdentityKey(identity.orgId, identity.idpConfigId, identity.externalId);
    this.linkedIdentities.set(key, identity);
  }

  async deleteLinkedIdentity(userId: string, idpConfigId: string): Promise<void> {
    for (const [key, identity] of this.linkedIdentities) {
      if (identity.userId === userId && identity.idpConfigId === idpConfigId) {
        this.linkedIdentities.delete(key);
        break;
      }
    }
  }

  // =========================================================================
  // SCIM Users
  // =========================================================================

  private getOrgScimUsers(orgId: string): Map<string, ScimUser> {
    let users = this.scimUsers.get(orgId);
    if (!users) {
      users = new Map();
      this.scimUsers.set(orgId, users);
    }
    return users;
  }

  async getScimUser(orgId: string, id: string): Promise<ScimUser | null> {
    return this.getOrgScimUsers(orgId).get(id) ?? null;
  }

  async getScimUserByExternalId(orgId: string, externalId: string): Promise<ScimUser | null> {
    for (const user of this.getOrgScimUsers(orgId).values()) {
      if (user.externalId === externalId) {
        return user;
      }
    }
    return null;
  }

  async getScimUserByUsername(orgId: string, userName: string): Promise<ScimUser | null> {
    for (const user of this.getOrgScimUsers(orgId).values()) {
      if (user.userName === userName) {
        return user;
      }
    }
    return null;
  }

  async listScimUsers(
    orgId: string,
    options?: { filter?: string; startIndex?: number; count?: number }
  ): Promise<{ users: ScimUser[]; totalResults: number }> {
    let users = Array.from(this.getOrgScimUsers(orgId).values());

    // Simple filter support (SCIM filter syntax is complex, this is minimal)
    if (options?.filter) {
      const lowerFilter = options.filter.toLowerCase();
      users = users.filter(u =>
        u.userName.toLowerCase().includes(lowerFilter) ||
        u.displayName?.toLowerCase().includes(lowerFilter) ||
        u.emails?.some(e => e.value.toLowerCase().includes(lowerFilter))
      );
    }

    const totalResults = users.length;
    const startIndex = options?.startIndex ?? 1;
    const count = options?.count ?? 100;

    users = users.slice(startIndex - 1, startIndex - 1 + count);

    return { users, totalResults };
  }

  async createScimUser(orgId: string, user: ScimUser): Promise<ScimUser> {
    const id = user.id ?? this.generateId();
    const now = new Date().toISOString();
    const newUser: ScimUser = {
      ...user,
      id,
      meta: {
        resourceType: 'User',
        created: now,
        lastModified: now,
        location: `/scim/v2/Users/${id}`,
      },
    };
    this.getOrgScimUsers(orgId).set(id, newUser);
    return newUser;
  }

  async updateScimUser(orgId: string, id: string, updates: Partial<ScimUser>): Promise<ScimUser | null> {
    const existing = this.getOrgScimUsers(orgId).get(id);
    if (!existing) return null;

    const updated: ScimUser = {
      ...existing,
      ...updates,
      id, // Preserve ID
      meta: {
        ...existing.meta,
        resourceType: 'User',
        lastModified: new Date().toISOString(),
      },
    };
    this.getOrgScimUsers(orgId).set(id, updated);
    return updated;
  }

  async deleteScimUser(orgId: string, id: string): Promise<boolean> {
    return this.getOrgScimUsers(orgId).delete(id);
  }

  // =========================================================================
  // SCIM Groups
  // =========================================================================

  private getOrgScimGroups(orgId: string): Map<string, ScimGroup> {
    let groups = this.scimGroups.get(orgId);
    if (!groups) {
      groups = new Map();
      this.scimGroups.set(orgId, groups);
    }
    return groups;
  }

  async getScimGroup(orgId: string, id: string): Promise<ScimGroup | null> {
    return this.getOrgScimGroups(orgId).get(id) ?? null;
  }

  async getScimGroupByExternalId(orgId: string, externalId: string): Promise<ScimGroup | null> {
    for (const group of this.getOrgScimGroups(orgId).values()) {
      if (group.externalId === externalId) {
        return group;
      }
    }
    return null;
  }

  async listScimGroups(
    orgId: string,
    options?: { filter?: string; startIndex?: number; count?: number }
  ): Promise<{ groups: ScimGroup[]; totalResults: number }> {
    let groups = Array.from(this.getOrgScimGroups(orgId).values());

    if (options?.filter) {
      const lowerFilter = options.filter.toLowerCase();
      groups = groups.filter(g =>
        g.displayName.toLowerCase().includes(lowerFilter)
      );
    }

    const totalResults = groups.length;
    const startIndex = options?.startIndex ?? 1;
    const count = options?.count ?? 100;

    groups = groups.slice(startIndex - 1, startIndex - 1 + count);

    return { groups, totalResults };
  }

  async createScimGroup(orgId: string, group: ScimGroup): Promise<ScimGroup> {
    const id = group.id ?? this.generateId();
    const now = new Date().toISOString();
    const newGroup: ScimGroup = {
      ...group,
      id,
      meta: {
        resourceType: 'Group',
        created: now,
        lastModified: now,
        location: `/scim/v2/Groups/${id}`,
      },
    };
    this.getOrgScimGroups(orgId).set(id, newGroup);
    return newGroup;
  }

  async updateScimGroup(orgId: string, id: string, updates: Partial<ScimGroup>): Promise<ScimGroup | null> {
    const existing = this.getOrgScimGroups(orgId).get(id);
    if (!existing) return null;

    const updated: ScimGroup = {
      ...existing,
      ...updates,
      id,
      meta: {
        ...existing.meta,
        resourceType: 'Group',
        lastModified: new Date().toISOString(),
      },
    };
    this.getOrgScimGroups(orgId).set(id, updated);
    return updated;
  }

  async deleteScimGroup(orgId: string, id: string): Promise<boolean> {
    return this.getOrgScimGroups(orgId).delete(id);
  }

  // =========================================================================
  // Audit Events
  // =========================================================================

  async appendAuditEvent(event: IdentityAuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }

  async queryAuditEvents(
    orgId: string,
    options?: {
      action?: string;
      actorId?: string;
      targetId?: string;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: IdentityAuditEvent[]; total: number }> {
    let events = this.auditEvents.filter(e => e.orgId === orgId);

    if (options?.action) {
      events = events.filter(e => e.action === options.action);
    }
    if (options?.actorId) {
      events = events.filter(e => e.actor.id === options.actorId);
    }
    if (options?.targetId) {
      events = events.filter(e => e.target?.id === options.targetId);
    }
    if (options?.startTime) {
      events = events.filter(e => new Date(e.timestamp) >= options.startTime!);
    }
    if (options?.endTime) {
      events = events.filter(e => new Date(e.timestamp) <= options.endTime!);
    }

    const total = events.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;

    events = events.slice(offset, offset + limit);

    return { events, total };
  }

  // =========================================================================
  // Testing Helpers
  // =========================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.orgConfigs.clear();
    this.ssoStates.clear();
    this.linkedIdentities.clear();
    this.scimUsers.clear();
    this.scimGroups.clear();
    this.auditEvents = [];
  }
}

// =============================================================================
// Store Singleton
// =============================================================================

let identityStoreInstance: IdentityStore | null = null;

/**
 * Get the identity store instance
 */
export function getIdentityStore(): IdentityStore {
  if (!identityStoreInstance) {
    identityStoreInstance = new InMemoryIdentityStore();
  }
  return identityStoreInstance;
}

/**
 * Set the identity store instance
 */
export function setIdentityStore(store: IdentityStore): void {
  identityStoreInstance = store;
}

/**
 * Reset the identity store (for testing)
 */
export function resetIdentityStore(): void {
  identityStoreInstance = null;
}
