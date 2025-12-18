/**
 * SCIM 2.0 Provisioning Service
 *
 * Phase 31: System for Cross-domain Identity Management
 *
 * Implements RFC 7643 (Core Schema) and RFC 7644 (Protocol)
 *
 * @module @gwi/core/identity/scim
 */

import { randomBytes, timingSafeEqual, createHash } from 'crypto';
import type {
  ScimUser,
  ScimGroup,
  ScimListResponse,
  IdentityAuditEvent,
} from './types.js';
import { getIdentityStore } from './store.js';

// =============================================================================
// Types
// =============================================================================

export interface ScimRequest {
  orgId: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  bearerToken: string;
}

export interface ScimResponse<T = unknown> {
  status: number;
  body: T | ScimError;
  headers?: Record<string, string>;
}

export interface ScimError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: string;
  scimType?: string;
  detail: string;
}

export interface ScimPatchOp {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'];
  Operations: ScimPatchOp[];
}

// =============================================================================
// SCIM Schema Constants
// =============================================================================

export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  ENTERPRISE_USER: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
} as const;

// =============================================================================
// Token Validation
// =============================================================================

/**
 * Hash a SCIM token for storage
 */
export function hashScimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a new SCIM token
 */
export function generateScimToken(): { token: string; hash: string } {
  const token = `scim_${randomBytes(32).toString('hex')}`;
  const hash = hashScimToken(token);
  return { token, hash };
}

/**
 * Validate SCIM bearer token
 */
async function validateToken(
  orgId: string,
  bearerToken: string
): Promise<{ valid: boolean; reason?: string }> {
  const store = getIdentityStore();
  const config = await store.getOrgIdentityConfig(orgId);

  if (!config?.scimConfig?.enabled) {
    return { valid: false, reason: 'SCIM not enabled for organization' };
  }

  const providedHash = hashScimToken(bearerToken);

  // Check all active tokens
  for (const token of config.scimConfig.tokens) {
    if (!token.active) continue;
    if (token.expiresAt && new Date(token.expiresAt) < new Date()) continue;

    // Timing-safe comparison
    try {
      const storedHashBuf = Buffer.from(token.tokenHash, 'hex');
      const providedHashBuf = Buffer.from(providedHash, 'hex');
      if (storedHashBuf.length === providedHashBuf.length &&
          timingSafeEqual(storedHashBuf, providedHashBuf)) {
        return { valid: true };
      }
    } catch {
      // Buffer length mismatch, continue checking
    }
  }

  return { valid: false, reason: 'Invalid or expired token' };
}

// =============================================================================
// SCIM Service Class
// =============================================================================

export class ScimService {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '/scim/v2') {
    this.baseUrl = baseUrl;
  }

  // ===========================================================================
  // Request Handler
  // ===========================================================================

  /**
   * Handle a SCIM request
   */
  async handleRequest(request: ScimRequest): Promise<ScimResponse> {
    // Validate token
    const tokenResult = await validateToken(request.orgId, request.bearerToken);
    if (!tokenResult.valid) {
      return this.errorResponse(401, 'unauthorized', tokenResult.reason ?? 'Unauthorized');
    }

    // Parse path
    const pathMatch = request.path.match(/^\/(Users|Groups)(?:\/([^/]+))?$/);
    if (!pathMatch) {
      return this.errorResponse(404, 'invalidPath', 'Invalid SCIM endpoint');
    }

    const [, resourceType, resourceId] = pathMatch;

    // Route to handler
    if (resourceType === 'Users') {
      return this.handleUserRequest(request, resourceId);
    } else if (resourceType === 'Groups') {
      return this.handleGroupRequest(request, resourceId);
    }

    return this.errorResponse(404, 'invalidPath', 'Unknown resource type');
  }

  // ===========================================================================
  // User Handlers
  // ===========================================================================

  private async handleUserRequest(
    request: ScimRequest,
    userId?: string
  ): Promise<ScimResponse> {
    switch (request.method) {
      case 'GET':
        if (userId) {
          return this.getUser(request.orgId, userId);
        }
        return this.listUsers(request.orgId, request.query);

      case 'POST':
        return this.createUser(request.orgId, request.body as Partial<ScimUser>);

      case 'PUT':
        if (!userId) {
          return this.errorResponse(400, 'invalidValue', 'User ID required for PUT');
        }
        return this.replaceUser(request.orgId, userId, request.body as Partial<ScimUser>);

      case 'PATCH':
        if (!userId) {
          return this.errorResponse(400, 'invalidValue', 'User ID required for PATCH');
        }
        return this.patchUser(request.orgId, userId, request.body as ScimPatchRequest);

      case 'DELETE':
        if (!userId) {
          return this.errorResponse(400, 'invalidValue', 'User ID required for DELETE');
        }
        return this.deleteUser(request.orgId, userId);

      default:
        return this.errorResponse(405, 'invalidValue', 'Method not allowed');
    }
  }

  private async getUser(orgId: string, userId: string): Promise<ScimResponse> {
    const store = getIdentityStore();
    const user = await store.getScimUser(orgId, userId);

    if (!user) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    return {
      status: 200,
      body: this.formatUser(user),
    };
  }

  private async listUsers(
    orgId: string,
    query?: Record<string, string>
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    const startIndex = parseInt(query?.startIndex ?? '1', 10);
    const count = parseInt(query?.count ?? '100', 10);
    const filter = query?.filter;

    const result = await store.listScimUsers(orgId, { filter, startIndex, count });

    const response: ScimListResponse = {
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults: result.totalResults,
      startIndex,
      itemsPerPage: result.users.length,
      Resources: result.users.map(u => this.formatUser(u)),
    };

    return { status: 200, body: response };
  }

  private async createUser(
    orgId: string,
    userData: Partial<ScimUser>
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    // Validate required fields
    if (!userData.userName) {
      return this.errorResponse(400, 'invalidValue', 'userName is required');
    }

    // Check for duplicate
    const existing = await store.getScimUserByUsername(orgId, userData.userName);
    if (existing) {
      return this.errorResponse(409, 'uniqueness', 'User with this userName already exists');
    }

    // Create user
    const user: ScimUser = {
      schemas: [SCIM_SCHEMAS.USER],
      userName: userData.userName,
      externalId: userData.externalId,
      name: userData.name,
      displayName: userData.displayName,
      emails: userData.emails,
      active: userData.active ?? true,
    };

    const created = await store.createScimUser(orgId, user);

    // Audit event
    await this.logAuditEvent(orgId, 'scim.user.created', 'user', created.id!, {
      userName: created.userName,
      externalId: created.externalId,
    });

    return {
      status: 201,
      body: this.formatUser(created),
      headers: { Location: `${this.baseUrl}/Users/${created.id}` },
    };
  }

  private async replaceUser(
    orgId: string,
    userId: string,
    userData: Partial<ScimUser>
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    const existing = await store.getScimUser(orgId, userId);
    if (!existing) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    // Validate required fields
    if (!userData.userName) {
      return this.errorResponse(400, 'invalidValue', 'userName is required');
    }

    const updated = await store.updateScimUser(orgId, userId, {
      userName: userData.userName,
      externalId: userData.externalId,
      name: userData.name,
      displayName: userData.displayName,
      emails: userData.emails,
      active: userData.active,
    });

    if (!updated) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    await this.logAuditEvent(orgId, 'scim.user.updated', 'user', userId, {
      userName: updated.userName,
    });

    return { status: 200, body: this.formatUser(updated) };
  }

  private async patchUser(
    orgId: string,
    userId: string,
    patchRequest: ScimPatchRequest
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    const existing = await store.getScimUser(orgId, userId);
    if (!existing) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    // Apply patch operations
    const updates: Partial<ScimUser> = {};

    for (const op of patchRequest.Operations) {
      if (op.op === 'replace' || op.op === 'add') {
        if (op.path === 'active' || !op.path) {
          if (typeof op.value === 'object' && op.value !== null && 'active' in op.value) {
            updates.active = (op.value as { active: boolean }).active;
          } else if (typeof op.value === 'boolean') {
            updates.active = op.value;
          }
        }
        if (op.path === 'displayName' && typeof op.value === 'string') {
          updates.displayName = op.value;
        }
        if (op.path === 'userName' && typeof op.value === 'string') {
          updates.userName = op.value;
        }
        if (op.path === 'emails' && Array.isArray(op.value)) {
          updates.emails = op.value;
        }
        if (!op.path && typeof op.value === 'object') {
          Object.assign(updates, op.value);
        }
      }
    }

    const updated = await store.updateScimUser(orgId, userId, updates);
    if (!updated) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    await this.logAuditEvent(orgId, 'scim.user.patched', 'user', userId, {
      operations: patchRequest.Operations.length,
    });

    return { status: 200, body: this.formatUser(updated) };
  }

  private async deleteUser(orgId: string, userId: string): Promise<ScimResponse> {
    const store = getIdentityStore();

    const existing = await store.getScimUser(orgId, userId);
    if (!existing) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    const deleted = await store.deleteScimUser(orgId, userId);
    if (!deleted) {
      return this.errorResponse(404, 'noTarget', 'User not found');
    }

    await this.logAuditEvent(orgId, 'scim.user.deleted', 'user', userId, {
      userName: existing.userName,
    });

    return { status: 204, body: undefined as unknown as void };
  }

  // ===========================================================================
  // Group Handlers
  // ===========================================================================

  private async handleGroupRequest(
    request: ScimRequest,
    groupId?: string
  ): Promise<ScimResponse> {
    switch (request.method) {
      case 'GET':
        if (groupId) {
          return this.getGroup(request.orgId, groupId);
        }
        return this.listGroups(request.orgId, request.query);

      case 'POST':
        return this.createGroup(request.orgId, request.body as Partial<ScimGroup>);

      case 'PUT':
        if (!groupId) {
          return this.errorResponse(400, 'invalidValue', 'Group ID required for PUT');
        }
        return this.replaceGroup(request.orgId, groupId, request.body as Partial<ScimGroup>);

      case 'PATCH':
        if (!groupId) {
          return this.errorResponse(400, 'invalidValue', 'Group ID required for PATCH');
        }
        return this.patchGroup(request.orgId, groupId, request.body as ScimPatchRequest);

      case 'DELETE':
        if (!groupId) {
          return this.errorResponse(400, 'invalidValue', 'Group ID required for DELETE');
        }
        return this.deleteGroup(request.orgId, groupId);

      default:
        return this.errorResponse(405, 'invalidValue', 'Method not allowed');
    }
  }

  private async getGroup(orgId: string, groupId: string): Promise<ScimResponse> {
    const store = getIdentityStore();
    const group = await store.getScimGroup(orgId, groupId);

    if (!group) {
      return this.errorResponse(404, 'noTarget', 'Group not found');
    }

    return { status: 200, body: this.formatGroup(group) };
  }

  private async listGroups(
    orgId: string,
    query?: Record<string, string>
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    const startIndex = parseInt(query?.startIndex ?? '1', 10);
    const count = parseInt(query?.count ?? '100', 10);
    const filter = query?.filter;

    const result = await store.listScimGroups(orgId, { filter, startIndex, count });

    const response: ScimListResponse = {
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults: result.totalResults,
      startIndex,
      itemsPerPage: result.groups.length,
      Resources: result.groups.map(g => this.formatGroup(g)),
    };

    return { status: 200, body: response };
  }

  private async createGroup(
    orgId: string,
    groupData: Partial<ScimGroup>
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    if (!groupData.displayName) {
      return this.errorResponse(400, 'invalidValue', 'displayName is required');
    }

    const group: ScimGroup = {
      schemas: [SCIM_SCHEMAS.GROUP],
      displayName: groupData.displayName,
      externalId: groupData.externalId,
      members: groupData.members ?? [],
    };

    const created = await store.createScimGroup(orgId, group);

    await this.logAuditEvent(orgId, 'scim.group.created', 'group', created.id!, {
      displayName: created.displayName,
    });

    return {
      status: 201,
      body: this.formatGroup(created),
      headers: { Location: `${this.baseUrl}/Groups/${created.id}` },
    };
  }

  private async replaceGroup(
    orgId: string,
    groupId: string,
    groupData: Partial<ScimGroup>
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    if (!groupData.displayName) {
      return this.errorResponse(400, 'invalidValue', 'displayName is required');
    }

    const updated = await store.updateScimGroup(orgId, groupId, {
      displayName: groupData.displayName,
      externalId: groupData.externalId,
      members: groupData.members,
    });

    if (!updated) {
      return this.errorResponse(404, 'noTarget', 'Group not found');
    }

    await this.logAuditEvent(orgId, 'scim.group.updated', 'group', groupId, {
      displayName: updated.displayName,
    });

    return { status: 200, body: this.formatGroup(updated) };
  }

  private async patchGroup(
    orgId: string,
    groupId: string,
    patchRequest: ScimPatchRequest
  ): Promise<ScimResponse> {
    const store = getIdentityStore();

    const existing = await store.getScimGroup(orgId, groupId);
    if (!existing) {
      return this.errorResponse(404, 'noTarget', 'Group not found');
    }

    const updates: Partial<ScimGroup> = {};
    let members = [...(existing.members ?? [])];

    for (const op of patchRequest.Operations) {
      if (op.path === 'members' || op.path?.startsWith('members')) {
        if (op.op === 'add' && Array.isArray(op.value)) {
          members.push(...op.value);
        } else if (op.op === 'remove') {
          if (op.path?.includes('[')) {
            // Remove specific member: members[value eq "userId"]
            const valueMatch = op.path.match(/value eq "([^"]+)"/);
            if (valueMatch) {
              members = members.filter(m => m.value !== valueMatch[1]);
            }
          } else if (Array.isArray(op.value)) {
            const removeIds = new Set(op.value.map((v: { value: string }) => v.value));
            members = members.filter(m => !removeIds.has(m.value));
          }
        } else if (op.op === 'replace' && Array.isArray(op.value)) {
          members = op.value;
        }
      } else if (op.path === 'displayName' && typeof op.value === 'string') {
        updates.displayName = op.value;
      }
    }

    updates.members = members;

    const updated = await store.updateScimGroup(orgId, groupId, updates);
    if (!updated) {
      return this.errorResponse(404, 'noTarget', 'Group not found');
    }

    await this.logAuditEvent(orgId, 'scim.group.patched', 'group', groupId, {
      operations: patchRequest.Operations.length,
    });

    return { status: 200, body: this.formatGroup(updated) };
  }

  private async deleteGroup(orgId: string, groupId: string): Promise<ScimResponse> {
    const store = getIdentityStore();

    const existing = await store.getScimGroup(orgId, groupId);
    if (!existing) {
      return this.errorResponse(404, 'noTarget', 'Group not found');
    }

    const deleted = await store.deleteScimGroup(orgId, groupId);
    if (!deleted) {
      return this.errorResponse(404, 'noTarget', 'Group not found');
    }

    await this.logAuditEvent(orgId, 'scim.group.deleted', 'group', groupId, {
      displayName: existing.displayName,
    });

    return { status: 204, body: undefined as unknown as void };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private formatUser(user: ScimUser): ScimUser {
    return {
      schemas: [SCIM_SCHEMAS.USER],
      id: user.id,
      externalId: user.externalId,
      userName: user.userName,
      name: user.name,
      displayName: user.displayName,
      emails: user.emails,
      active: user.active,
      meta: user.meta,
    };
  }

  private formatGroup(group: ScimGroup): ScimGroup {
    return {
      schemas: [SCIM_SCHEMAS.GROUP],
      id: group.id,
      externalId: group.externalId,
      displayName: group.displayName,
      members: group.members,
      meta: group.meta,
    };
  }

  private errorResponse(
    status: number,
    scimType: string,
    detail: string
  ): ScimResponse {
    return {
      status,
      body: {
        schemas: [SCIM_SCHEMAS.ERROR],
        status: status.toString(),
        scimType,
        detail,
      },
    };
  }

  private async logAuditEvent(
    orgId: string,
    action: string,
    targetType: 'user' | 'group',
    targetId: string,
    context?: Record<string, unknown>
  ): Promise<void> {
    const store = getIdentityStore();

    const event: IdentityAuditEvent = {
      id: `audit-${Date.now()}-${randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      orgId,
      actor: {
        type: 'scim',
        id: 'scim-service',
      },
      action,
      target: {
        type: targetType,
        id: targetId,
      },
      outcome: 'success',
      context,
    };

    await store.appendAuditEvent(event);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let scimServiceInstance: ScimService | null = null;

export function getScimService(baseUrl?: string): ScimService {
  if (!scimServiceInstance) {
    scimServiceInstance = new ScimService(baseUrl);
  }
  return scimServiceInstance;
}

export function setScimService(service: ScimService): void {
  scimServiceInstance = service;
}

export function resetScimService(): void {
  scimServiceInstance = null;
}
