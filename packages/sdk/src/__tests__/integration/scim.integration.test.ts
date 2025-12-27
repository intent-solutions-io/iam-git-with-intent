/**
 * SCIM API Integration Tests
 *
 * Epic D - Story 4: SDK Integration Tests
 *
 * Tests SCIM 2.0 API integration through the SDK client against a mock gateway.
 * Validates:
 * - User CRUD operations
 * - Group CRUD operations
 * - Group membership management
 * - Request/response type safety
 * - Error handling (404, 400, 401, 409)
 * - Pagination for list operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGatewayMock, type GatewayMock } from '../helpers/gateway-mock.js';
import type { ScimUser, ScimGroup, ScimListResponse } from '../../types.js';

// =============================================================================
// Mock SCIM Client (simplified version of what will be in GWIClient)
// =============================================================================

/**
 * Simplified SCIM client for testing
 * In production, this would be part of GWIClient.scim namespace
 */
class ScimClient {
  constructor(
    private baseUrl: string,
    private bearerToken: string
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/scim+json',
        Authorization: `Bearer ${this.bearerToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`SCIM API Error: ${error.detail || error.message}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async listUsers(options?: {
    filter?: string;
    startIndex?: number;
    count?: number;
  }): Promise<ScimListResponse> {
    const query: Record<string, string> = {};
    if (options?.filter) query.filter = options.filter;
    if (options?.startIndex) query.startIndex = String(options.startIndex);
    if (options?.count) query.count = String(options.count);

    return this.request<ScimListResponse>('GET', '/scim/v2/Users', undefined, query);
  }

  async createUser(user: Partial<ScimUser>): Promise<ScimUser> {
    return this.request<ScimUser>('POST', '/scim/v2/Users', user);
  }

  async getUser(id: string): Promise<ScimUser> {
    return this.request<ScimUser>('GET', `/scim/v2/Users/${id}`);
  }

  async updateUser(id: string, user: Partial<ScimUser>): Promise<ScimUser> {
    return this.request<ScimUser>('PUT', `/scim/v2/Users/${id}`, user);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request<void>('DELETE', `/scim/v2/Users/${id}`);
  }

  async listGroups(options?: {
    startIndex?: number;
    count?: number;
  }): Promise<ScimListResponse> {
    const query: Record<string, string> = {};
    if (options?.startIndex) query.startIndex = String(options.startIndex);
    if (options?.count) query.count = String(options.count);

    return this.request<ScimListResponse>('GET', '/scim/v2/Groups', undefined, query);
  }

  async createGroup(group: Partial<ScimGroup>): Promise<ScimGroup> {
    return this.request<ScimGroup>('POST', '/scim/v2/Groups', group);
  }

  async getGroup(id: string): Promise<ScimGroup> {
    return this.request<ScimGroup>('GET', `/scim/v2/Groups/${id}`);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.request<void>('DELETE', `/scim/v2/Groups/${id}`);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('SCIM API Integration', () => {
  let mockServer: GatewayMock;
  let scimClient: ScimClient;
  const bearerToken = 'test-scim-token';

  beforeEach(async () => {
    mockServer = await createGatewayMock({ scimBearerToken: bearerToken });
    scimClient = new ScimClient(mockServer.url, bearerToken);
  });

  afterEach(async () => {
    await mockServer.close();
  });

  // =============================================================================
  // User CRUD Operations
  // =============================================================================

  describe('User CRUD Operations', () => {
    it('should create user with correct types', async () => {
      const userRequest: Partial<ScimUser> = {
        userName: 'test@example.com',
        displayName: 'Test User',
        active: true,
        emails: [
          {
            value: 'test@example.com',
            type: 'work',
            primary: true,
          },
        ],
        name: {
          givenName: 'Test',
          familyName: 'User',
        },
      };

      const createdUser = await scimClient.createUser(userRequest);

      // Validate response types
      expect(createdUser.id).toBeDefined();
      expect(createdUser.userName).toBe('test@example.com');
      expect(createdUser.displayName).toBe('Test User');
      expect(createdUser.active).toBe(true);
      expect(createdUser.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
      expect(createdUser.meta?.resourceType).toBe('User');
      expect(createdUser.meta?.created).toBeDefined();
      expect(createdUser.meta?.location).toContain('/scim/v2/Users/');
    });

    it('should read user by ID with correct types', async () => {
      // Create a user first
      const createdUser = await scimClient.createUser({
        userName: 'read-test@example.com',
        active: true,
      });

      // Read the user
      const fetchedUser = await scimClient.getUser(createdUser.id!);

      expect(fetchedUser.id).toBe(createdUser.id);
      expect(fetchedUser.userName).toBe('read-test@example.com');
      expect(fetchedUser.active).toBe(true);
    });

    it('should update user with correct types', async () => {
      // Create a user
      const createdUser = await scimClient.createUser({
        userName: 'update-test@example.com',
        displayName: 'Original Name',
        active: true,
      });

      // Update the user
      const updatedUser = await scimClient.updateUser(createdUser.id!, {
        userName: 'update-test@example.com',
        displayName: 'Updated Name',
        active: false,
        schemas: createdUser.schemas,
      });

      expect(updatedUser.id).toBe(createdUser.id);
      expect(updatedUser.displayName).toBe('Updated Name');
      expect(updatedUser.active).toBe(false);
      expect(updatedUser.meta?.lastModified).toBeDefined();
    });

    it('should delete user', async () => {
      // Create a user
      const createdUser = await scimClient.createUser({
        userName: 'delete-test@example.com',
        active: true,
      });

      // Delete the user
      await scimClient.deleteUser(createdUser.id!);

      // Verify user is deleted
      await expect(scimClient.getUser(createdUser.id!)).rejects.toThrow(
        /User not found/
      );
    });

    it('should list users with pagination', async () => {
      // Create multiple users
      await Promise.all([
        scimClient.createUser({ userName: 'user1@example.com', active: true }),
        scimClient.createUser({ userName: 'user2@example.com', active: true }),
        scimClient.createUser({ userName: 'user3@example.com', active: true }),
      ]);

      // List users with pagination
      const page1 = await scimClient.listUsers({ startIndex: 1, count: 2 });

      expect(page1.totalResults).toBe(3);
      expect(page1.startIndex).toBe(1);
      expect(page1.itemsPerPage).toBe(2);
      expect(page1.Resources).toHaveLength(2);
      expect(page1.schemas).toContain(
        'urn:ietf:params:scim:api:messages:2.0:ListResponse'
      );
    });

    it('should filter users by userName', async () => {
      // Create users
      await scimClient.createUser({ userName: 'filter1@example.com', active: true });
      await scimClient.createUser({ userName: 'filter2@example.com', active: true });

      // Filter by userName
      const filtered = await scimClient.listUsers({
        filter: 'userName eq "filter1@example.com"',
      });

      expect(filtered.totalResults).toBe(1);
      expect((filtered.Resources![0] as ScimUser).userName).toBe(
        'filter1@example.com'
      );
    });
  });

  // =============================================================================
  // Group CRUD Operations
  // =============================================================================

  describe('Group CRUD Operations', () => {
    it('should create group with correct types', async () => {
      const groupRequest: Partial<ScimGroup> = {
        displayName: 'Engineering Team',
        members: [],
      };

      const createdGroup = await scimClient.createGroup(groupRequest);

      expect(createdGroup.id).toBeDefined();
      expect(createdGroup.displayName).toBe('Engineering Team');
      expect(createdGroup.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:Group');
      expect(createdGroup.meta?.resourceType).toBe('Group');
      expect(createdGroup.meta?.created).toBeDefined();
    });

    it('should read group by ID with correct types', async () => {
      const createdGroup = await scimClient.createGroup({
        displayName: 'Read Test Group',
      });

      const fetchedGroup = await scimClient.getGroup(createdGroup.id!);

      expect(fetchedGroup.id).toBe(createdGroup.id);
      expect(fetchedGroup.displayName).toBe('Read Test Group');
    });

    it('should delete group', async () => {
      const createdGroup = await scimClient.createGroup({
        displayName: 'Delete Test Group',
      });

      await scimClient.deleteGroup(createdGroup.id!);

      await expect(scimClient.getGroup(createdGroup.id!)).rejects.toThrow(
        /Group not found/
      );
    });

    it('should list groups with pagination', async () => {
      // Create multiple groups
      await Promise.all([
        scimClient.createGroup({ displayName: 'Group 1' }),
        scimClient.createGroup({ displayName: 'Group 2' }),
        scimClient.createGroup({ displayName: 'Group 3' }),
      ]);

      const page1 = await scimClient.listGroups({ startIndex: 1, count: 2 });

      expect(page1.totalResults).toBe(3);
      expect(page1.startIndex).toBe(1);
      expect(page1.itemsPerPage).toBe(2);
      expect(page1.Resources).toHaveLength(2);
    });
  });

  // =============================================================================
  // Group Membership Operations
  // =============================================================================

  describe('Group Membership Operations', () => {
    it('should create group with members', async () => {
      // Create a user first
      const user = await scimClient.createUser({
        userName: 'member@example.com',
        active: true,
      });

      // Create group with member
      const group = await scimClient.createGroup({
        displayName: 'Team with Members',
        members: [
          {
            value: user.id!,
            display: user.displayName,
          },
        ],
      });

      expect(group.members).toHaveLength(1);
      expect(group.members![0].value).toBe(user.id);
    });

    it('should verify member types are correct', async () => {
      const user = await scimClient.createUser({
        userName: 'type-check@example.com',
        displayName: 'Type Check User',
        active: true,
      });

      const group = await scimClient.createGroup({
        displayName: 'Type Check Group',
        members: [
          {
            value: user.id!,
            display: user.displayName,
            $ref: `/scim/v2/Users/${user.id}`,
          },
        ],
      });

      const member = group.members![0];
      expect(member.value).toBe(user.id);
      expect(member.display).toBe('Type Check User');
      expect(member.$ref).toContain('/scim/v2/Users/');
    });
  });

  // =============================================================================
  // Error Handling
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle 404 for non-existent user', async () => {
      await expect(scimClient.getUser('non-existent-id')).rejects.toThrow(
        /User not found/
      );
    });

    it('should handle 404 for non-existent group', async () => {
      await expect(scimClient.getGroup('non-existent-id')).rejects.toThrow(
        /Group not found/
      );
    });

    it('should handle 400 for invalid user request', async () => {
      await expect(
        scimClient.createUser({
          // Missing required userName
          displayName: 'Invalid User',
        })
      ).rejects.toThrow(/userName is required/);
    });

    it('should handle 400 for invalid group request', async () => {
      await expect(
        scimClient.createGroup({
          // Missing required displayName
          members: [],
        } as Partial<ScimGroup>)
      ).rejects.toThrow(/displayName is required/);
    });

    it('should handle 401 for invalid authentication', async () => {
      const unauthClient = new ScimClient(mockServer.url, 'invalid-token');

      await expect(
        unauthClient.listUsers()
      ).rejects.toThrow(/Authentication failed/);
    });

    it('should handle 409 for duplicate user', async () => {
      await scimClient.createUser({
        userName: 'duplicate@example.com',
        active: true,
      });

      await expect(
        scimClient.createUser({
          userName: 'duplicate@example.com',
          active: true,
        })
      ).rejects.toThrow(/User already exists/);
    });
  });

  // =============================================================================
  // Type Safety Validation
  // =============================================================================

  describe('Type Safety Validation', () => {
    it('should enforce SCIM schemas in responses', async () => {
      const user = await scimClient.createUser({
        userName: 'schema-test@example.com',
        active: true,
      });

      expect(user.schemas).toBeDefined();
      expect(Array.isArray(user.schemas)).toBe(true);
      expect(user.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    });

    it('should include metadata in all resource responses', async () => {
      const user = await scimClient.createUser({
        userName: 'meta-test@example.com',
        active: true,
      });

      expect(user.meta).toBeDefined();
      expect(user.meta?.resourceType).toBe('User');
      expect(user.meta?.created).toBeDefined();
      expect(user.meta?.lastModified).toBeDefined();
      expect(user.meta?.location).toContain('/scim/v2/Users/');
    });

    it('should support optional fields correctly', async () => {
      const user = await scimClient.createUser({
        userName: 'minimal@example.com',
        // All other fields are optional
      });

      expect(user.id).toBeDefined();
      expect(user.userName).toBe('minimal@example.com');
      expect(user.active).toBe(true); // Default value
    });

    it('should handle email array types correctly', async () => {
      const user = await scimClient.createUser({
        userName: 'email-test@example.com',
        emails: [
          { value: 'work@example.com', type: 'work', primary: true },
          { value: 'home@example.com', type: 'home', primary: false },
        ],
        active: true,
      });

      expect(user.emails).toBeDefined();
      expect(user.emails).toHaveLength(2);
      expect(user.emails![0].value).toBe('work@example.com');
      expect(user.emails![0].primary).toBe(true);
    });
  });

  // =============================================================================
  // Pagination Edge Cases
  // =============================================================================

  describe('Pagination Edge Cases', () => {
    it('should handle empty result set', async () => {
      const result = await scimClient.listUsers();

      expect(result.totalResults).toBe(0);
      expect(result.Resources).toEqual([]);
    });

    it('should handle pagination beyond available results', async () => {
      await scimClient.createUser({ userName: 'page-test@example.com', active: true });

      const result = await scimClient.listUsers({ startIndex: 10, count: 10 });

      expect(result.totalResults).toBe(1);
      expect(result.itemsPerPage).toBe(0);
      expect(result.Resources).toHaveLength(0);
    });

    it('should respect count parameter', async () => {
      // Create 5 users
      await Promise.all(
        Array(5)
          .fill(null)
          .map((_, i) =>
            scimClient.createUser({ userName: `count-test-${i}@example.com`, active: true })
          )
      );

      const result = await scimClient.listUsers({ count: 3 });

      expect(result.totalResults).toBe(5);
      expect(result.itemsPerPage).toBe(3);
      expect(result.Resources).toHaveLength(3);
    });
  });
});
