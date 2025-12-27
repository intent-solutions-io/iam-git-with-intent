/**
 * Type Safety Integration Tests
 *
 * Epic D - Story 4: SDK Integration Tests
 *
 * Tests type safety of SDK against generated Gateway API types.
 * Validates:
 * - RequestBody types work correctly
 * - SuccessResponse types work correctly
 * - PathParams and QueryParams types work correctly
 * - Type errors are caught at compile time
 * - All SDK methods return properly typed responses
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGatewayMock, type GatewayMock } from '../helpers/gateway-mock.js';
import type {
  RequestBody,
  SuccessResponse,
  PathParams,
  QueryParams,
  operations,
  ScimUser,
  SearchConnectorsParams,
  SearchConnectorsResponse,
  PublishConnectorRequest,
  PublishConnectorResponse,
} from '../../types.js';

// =============================================================================
// Type Helper Tests
// =============================================================================

describe('Type Safety - Type Helpers', () => {
  // These tests verify that the type helpers extract correct types from operations

  it('should extract request body type correctly', () => {
    // Test RequestBody helper extracts the correct type
    type PublishRequest = RequestBody<'publishFull'>;

    const validRequest: PublishRequest = {
      manifest: {
        id: 'test',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Author',
        capabilities: ['read'],
      },
      tarball: 'base64-data',
      signature: {
        version: 1,
        keyId: 'key',
        algorithm: 'ed25519',
        signature: 'sig',
        checksum: 'check',
        signedAt: new Date().toISOString(),
      },
    };

    // Should compile successfully
    expect(validRequest).toBeDefined();
  });

  it('should extract success response type correctly', () => {
    // Test SuccessResponse helper extracts the correct type
    type SearchResponse = SuccessResponse<'searchConnectors'>;

    const validResponse: SearchResponse = {
      connectors: [],
      total: 0,
      page: 1,
      pageSize: 20,
    };

    expect(validResponse).toBeDefined();
  });

  it('should extract path params type correctly', () => {
    // Test PathParams helper extracts the correct type
    type ConnectorParams = PathParams<'getConnector'>;

    const validParams: ConnectorParams = {
      id: 'connector-123',
    };

    expect(validParams.id).toBe('connector-123');
  });

  it('should extract query params type correctly', () => {
    // Test QueryParams helper extracts the correct type
    type SearchParams = QueryParams<'searchConnectors'>;

    const validParams: SearchParams = {
      q: 'github',
      page: 1,
      pageSize: 20,
      sortBy: 'downloads',
      sortOrder: 'desc',
    };

    expect(validParams).toBeDefined();
  });
});

// =============================================================================
// Compile-Time Type Safety Tests
// =============================================================================

describe('Type Safety - Compile Time', () => {
  it('should catch missing required fields at compile time', () => {
    // This test demonstrates that TypeScript will catch errors

    // @ts-expect-error - Missing required 'manifest' field
    const invalidRequest1: RequestBody<'publishFull'> = {
      tarball: 'data',
      signature: {} as any,
    };

    // @ts-expect-error - Invalid field type
    const invalidRequest2: RequestBody<'publishFull'> = {
      manifest: 'wrong-type', // Should be object
      tarball: 'data',
      signature: {} as any,
    };

    expect(invalidRequest1).toBeDefined();
    expect(invalidRequest2).toBeDefined();
  });

  it('should catch invalid enum values at compile time', () => {
    type SearchParams = QueryParams<'searchConnectors'>;

    // Valid enum value
    const valid: SearchParams = {
      sortBy: 'downloads',
    };

    // @ts-expect-error - Invalid enum value
    const invalid: SearchParams = {
      sortBy: 'invalid-sort-option',
    };

    expect(valid).toBeDefined();
    expect(invalid).toBeDefined();
  });

  it('should enforce readonly fields', () => {
    type UserResponse = ScimUser;

    const user: UserResponse = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: 'user-123',
      userName: 'test@example.com',
      active: true,
    };

    // id is readonly, this should cause a compile error
    // @ts-expect-error - Cannot assign to readonly property
    user.id = 'different-id';

    expect(user).toBeDefined();
  });
});

// =============================================================================
// Runtime Type Safety Tests
// =============================================================================

describe('Type Safety - Runtime Validation', () => {
  let mockServer: GatewayMock;

  beforeEach(async () => {
    mockServer = await createGatewayMock();
  });

  afterEach(async () => {
    await mockServer.close();
  });

  it('should return correctly typed response from search endpoint', async () => {
    const response = await fetch(`${mockServer.url}/v1/search`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const data = (await response.json()) as SearchConnectorsResponse;

    // Verify response structure matches type
    expect(data).toHaveProperty('connectors');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('page');
    expect(data).toHaveProperty('pageSize');

    expect(Array.isArray(data.connectors)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.page).toBe('number');
    expect(typeof data.pageSize).toBe('number');
  });

  it('should send correctly typed request to publish endpoint', async () => {
    const request: PublishConnectorRequest = {
      manifest: {
        id: 'runtime-test',
        version: '1.0.0',
        displayName: 'Runtime Test',
        author: 'Tester',
        capabilities: ['read'],
      },
      tarball: Buffer.from('test').toString('base64'),
      signature: {
        version: 1,
        keyId: 'key',
        algorithm: 'ed25519',
        signature: 'sig',
        checksum: 'check',
        signedAt: new Date().toISOString(),
      },
    };

    const response = await fetch(`${mockServer.url}/v1/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data = (await response.json()) as PublishConnectorResponse;

    expect(data.success).toBe(true);
    expect(typeof data.connectorId).toBe('string');
    expect(typeof data.version).toBe('string');
    expect(typeof data.checksum).toBe('string');
    expect(typeof data.tarballUrl).toBe('string');
  });

  it('should handle SCIM user creation with correct types', async () => {
    const userRequest: RequestBody<'createScimUser'> = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'type-safe@example.com',
      active: true,
      emails: [
        {
          value: 'type-safe@example.com',
          type: 'work',
          primary: true,
        },
      ],
    };

    const response = await fetch(`${mockServer.url}/scim/v2/Users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/scim+json',
        Authorization: 'Bearer test-scim-token',
      },
      body: JSON.stringify(userRequest),
    });

    const user = (await response.json()) as SuccessResponse<'createScimUser'>;

    expect(user.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(user.userName).toBe('type-safe@example.com');
    expect(user.active).toBe(true);
    expect(user.id).toBeDefined();
  });
});

// =============================================================================
// Type Aliases Tests
// =============================================================================

describe('Type Safety - Type Aliases', () => {
  it('should provide convenient type aliases', () => {
    // Test that convenience type aliases work correctly
    const searchParams: SearchConnectorsParams = {
      q: 'test',
      page: 1,
      pageSize: 20,
    };

    const searchResponse: SearchConnectorsResponse = {
      connectors: [],
      total: 0,
      page: 1,
      pageSize: 20,
    };

    expect(searchParams).toBeDefined();
    expect(searchResponse).toBeDefined();
  });

  it('should have consistent types between operations and aliases', () => {
    // Verify that type aliases match the extracted operation types
    type OperationParams = QueryParams<'searchConnectors'>;
    type AliasParams = SearchConnectorsParams;

    const params1: OperationParams = { q: 'test' };
    const params2: AliasParams = params1; // Should be assignable

    expect(params2.q).toBe('test');
  });
});

// =============================================================================
// Generic Response Types
// =============================================================================

describe('Type Safety - Generic Response Types', () => {
  let mockServer: GatewayMock;

  beforeEach(async () => {
    mockServer = await createGatewayMock();
  });

  afterEach(async () => {
    await mockServer.close();
  });

  it('should handle paginated list responses consistently', async () => {
    // SCIM list response
    const scimResponse = await fetch(`${mockServer.url}/scim/v2/Users`, {
      headers: { Authorization: 'Bearer test-scim-token' },
    });
    const scimList = await scimResponse.json();

    expect(scimList).toHaveProperty('schemas');
    expect(scimList).toHaveProperty('totalResults');
    expect(scimList).toHaveProperty('Resources');

    // Search response
    const searchResponse = await fetch(`${mockServer.url}/v1/search`);
    const searchList = await searchResponse.json();

    expect(searchList).toHaveProperty('connectors');
    expect(searchList).toHaveProperty('total');
    expect(searchList).toHaveProperty('page');
  });

  it('should handle error responses consistently', async () => {
    const response = await fetch(`${mockServer.url}/v1/connectors/non-existent`);
    expect(response.ok).toBe(false);

    const error = await response.json();

    expect(error).toHaveProperty('error');
    expect(error).toHaveProperty('message');
    expect(typeof error.error).toBe('string');
    expect(typeof error.message).toBe('string');
  });
});

// =============================================================================
// Optional vs Required Fields
// =============================================================================

describe('Type Safety - Optional vs Required Fields', () => {
  it('should correctly mark optional fields in SCIM user', () => {
    // Required: schemas, userName, active
    // Optional: id, externalId, name, displayName, emails, meta

    const minimalUser: ScimUser = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'minimal@example.com',
      active: true,
    };

    expect(minimalUser).toBeDefined();

    const fullUser: ScimUser = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: 'user-123',
      userName: 'full@example.com',
      displayName: 'Full User',
      active: true,
      emails: [{ value: 'full@example.com', type: 'work', primary: true }],
      externalId: 'ext-123',
      name: {
        givenName: 'Full',
        familyName: 'User',
      },
      meta: {
        resourceType: 'User',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    };

    expect(fullUser).toBeDefined();
  });

  it('should allow partial updates with optional fields', () => {
    // For update operations, most fields should be optional
    type UserUpdate = Partial<ScimUser>;

    const updateData: UserUpdate = {
      displayName: 'Updated Name',
      active: false,
    };

    expect(updateData.displayName).toBe('Updated Name');
  });
});

// =============================================================================
// Array and Union Types
// =============================================================================

describe('Type Safety - Complex Types', () => {
  it('should handle array types correctly', () => {
    type Manifest = RequestBody<'publishFull'>['manifest'];

    const manifest: Manifest = {
      id: 'test',
      version: '1.0.0',
      displayName: 'Test',
      author: 'Author',
      capabilities: ['read', 'write', 'search'],
    };

    expect(manifest.capabilities).toHaveLength(3);
    expect(Array.isArray(manifest.capabilities)).toBe(true);
  });

  it('should handle nested object types correctly', () => {
    type UserName = ScimUser['name'];

    const name: UserName = {
      givenName: 'John',
      familyName: 'Doe',
      middleName: 'Q',
      formatted: 'John Q Doe',
    };

    expect(name.givenName).toBe('John');
  });

  it('should handle union types for resources', () => {
    type ListResponse = SuccessResponse<'listScimUsers'>;
    type Resources = ListResponse['Resources'];

    // Resources can be ScimUser[] or ScimGroup[]
    const users: Resources = [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'user1@example.com',
        active: true,
      },
    ];

    expect(users).toHaveLength(1);
  });
});

// =============================================================================
// Type Inference
// =============================================================================

describe('Type Safety - Type Inference', () => {
  let mockServer: GatewayMock;

  beforeEach(async () => {
    mockServer = await createGatewayMock();
  });

  afterEach(async () => {
    await mockServer.close();
  });

  it('should infer response types from operations', async () => {
    const response = await fetch(`${mockServer.url}/v1/search`);
    const data = await response.json();

    // TypeScript should infer the type based on the operation
    type InferredType = typeof data;

    const typed: SearchConnectorsResponse = data;

    expect(typed.connectors).toBeDefined();
  });

  it('should infer request types from operations', () => {
    const request: RequestBody<'publishFull'> = {
      manifest: {
        id: 'infer-test',
        version: '1.0.0',
        displayName: 'Infer Test',
        author: 'Test',
        capabilities: ['read'],
      },
      tarball: 'data',
      signature: {
        version: 1,
        keyId: 'key',
        algorithm: 'ed25519',
        signature: 'sig',
        checksum: 'check',
        signedAt: new Date().toISOString(),
      },
    };

    // Should infer all nested types correctly
    expect(request.manifest.capabilities[0]).toBe('read');
  });
});

// =============================================================================
// Discriminated Unions
// =============================================================================

describe('Type Safety - Discriminated Unions', () => {
  it('should handle SCIM error types with discriminated unions', () => {
    type ScimErrorType =
      | 'invalidValue'
      | 'uniqueness'
      | 'noTarget'
      | 'invalidPath'
      | 'invalidFilter'
      | 'tooMany'
      | 'mutability'
      | 'sensitive'
      | 'invalidSyntax'
      | 'invalidVersion';

    const errorTypes: ScimErrorType[] = [
      'invalidValue',
      'uniqueness',
      'noTarget',
      'invalidPath',
      'invalidFilter',
      'tooMany',
      'mutability',
      'sensitive',
      'invalidSyntax',
      'invalidVersion',
    ];

    expect(errorTypes).toHaveLength(10);
  });

  it('should handle resource type discriminators', () => {
    type ResourceType = 'User' | 'Group';

    const userType: ResourceType = 'User';
    const groupType: ResourceType = 'Group';

    expect(userType).toBe('User');
    expect(groupType).toBe('Group');
  });
});
