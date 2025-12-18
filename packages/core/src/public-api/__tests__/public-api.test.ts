/**
 * Tests for Phase 61: Public REST API
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ApiRegistry,
  createApiRegistry,
  createApiError,
  createApiResponse,
  createErrorResponse,
  createRequestContext,
  PublicApiErrorCodes,
  SUPPORTED_API_VERSIONS,
  CURRENT_API_VERSION,
  type ApiEndpoint,
  type ApiRequestContext,
} from '../index.js';

describe('Public API', () => {
  describe('ApiRegistry', () => {
    let registry: ApiRegistry;

    beforeEach(() => {
      registry = createApiRegistry();
    });

    it('should register and retrieve endpoints', () => {
      const endpoint: ApiEndpoint = {
        method: 'GET',
        path: '/users',
        version: 'v1',
        operationId: 'listUsers',
        summary: 'List all users',
        tags: ['users'],
        requiresAuth: true,
        scopes: ['users:read'],
      };

      registry.registerEndpoint(endpoint);

      const retrieved = registry.getEndpoint('GET', '/users', 'v1');
      expect(retrieved).toEqual(endpoint);
    });

    it('should list all endpoints', () => {
      const endpoint1: ApiEndpoint = {
        method: 'GET',
        path: '/users',
        version: 'v1',
        operationId: 'listUsers',
        summary: 'List users',
        tags: ['users'],
        requiresAuth: true,
      };

      const endpoint2: ApiEndpoint = {
        method: 'POST',
        path: '/users',
        version: 'v1',
        operationId: 'createUser',
        summary: 'Create user',
        tags: ['users'],
        requiresAuth: true,
      };

      registry.registerEndpoint(endpoint1);
      registry.registerEndpoint(endpoint2);

      const endpoints = registry.listEndpoints();
      expect(endpoints).toHaveLength(2);
    });

    it('should filter endpoints by version', () => {
      const v1Endpoint: ApiEndpoint = {
        method: 'GET',
        path: '/users',
        version: 'v1',
        operationId: 'listUsers',
        summary: 'List users v1',
        tags: ['users'],
        requiresAuth: true,
      };

      registry.registerEndpoint(v1Endpoint);

      const v1Endpoints = registry.listEndpoints('v1');
      expect(v1Endpoints).toHaveLength(1);
      expect(v1Endpoints[0].version).toBe('v1');
    });

    it('should filter endpoints by tag', () => {
      const usersEndpoint: ApiEndpoint = {
        method: 'GET',
        path: '/users',
        version: 'v1',
        operationId: 'listUsers',
        summary: 'List users',
        tags: ['users'],
        requiresAuth: true,
      };

      const forecastEndpoint: ApiEndpoint = {
        method: 'GET',
        path: '/forecasts',
        version: 'v1',
        operationId: 'listForecasts',
        summary: 'List forecasts',
        tags: ['forecasts'],
        requiresAuth: true,
      };

      registry.registerEndpoint(usersEndpoint);
      registry.registerEndpoint(forecastEndpoint);

      const userEndpoints = registry.listEndpointsByTag('users');
      expect(userEndpoints).toHaveLength(1);
      expect(userEndpoints[0].operationId).toBe('listUsers');
    });

    it('should generate OpenAPI spec', () => {
      const endpoint: ApiEndpoint = {
        method: 'GET',
        path: '/users',
        version: 'v1',
        operationId: 'listUsers',
        summary: 'List all users',
        description: 'Returns a list of users',
        tags: ['users'],
        requiresAuth: true,
      };

      registry.registerEndpoint(endpoint);

      const spec = registry.generateOpenApiSpec(
        {
          title: 'Test API',
          description: 'Test API description',
          version: '1.0.0',
        },
        [{ url: 'https://api.example.com' }],
        'v1'
      );

      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Test API');
      expect(spec.paths['/api/v1/users']).toBeDefined();
      expect(spec.paths['/api/v1/users'].get).toBeDefined();
      expect(spec.paths['/api/v1/users'].get?.operationId).toBe('listUsers');
      expect(spec.tags).toContainEqual({ name: 'users' });
    });

    it('should include security schemes in spec', () => {
      const endpoint: ApiEndpoint = {
        method: 'GET',
        path: '/secure',
        version: 'v1',
        operationId: 'secureEndpoint',
        summary: 'Secure endpoint',
        tags: ['secure'],
        requiresAuth: true,
      };

      registry.registerEndpoint(endpoint);

      const spec = registry.generateOpenApiSpec(
        { title: 'Test', description: 'Test', version: '1.0.0' },
        []
      );

      expect(spec.components?.securitySchemes).toBeDefined();
      expect(spec.components?.securitySchemes?.ApiKeyAuth).toBeDefined();
      expect(spec.components?.securitySchemes?.BearerAuth).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    let registry: ApiRegistry;

    beforeEach(() => {
      registry = createApiRegistry();
    });

    it('should validate request body', () => {
      const endpoint: ApiEndpoint = {
        method: 'POST',
        path: '/users',
        version: 'v1',
        operationId: 'createUser',
        summary: 'Create user',
        tags: ['users'],
        requiresAuth: true,
        requestSchema: z.object({
          name: z.string().min(1),
          email: z.string().email(),
        }),
      };

      registry.registerEndpoint(endpoint);

      const validResult = registry.validateRequest(
        endpoint,
        { name: 'John', email: 'john@example.com' }
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = registry.validateRequest(
        endpoint,
        { name: '', email: 'not-an-email' }
      );
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
      expect(invalidResult.errors!.length).toBeGreaterThan(0);
    });

    it('should validate query parameters', () => {
      const endpoint: ApiEndpoint = {
        method: 'GET',
        path: '/users',
        version: 'v1',
        operationId: 'listUsers',
        summary: 'List users',
        tags: ['users'],
        requiresAuth: true,
        querySchema: z.object({
          limit: z.coerce.number().int().positive().max(100).optional(),
          offset: z.coerce.number().int().nonnegative().optional(),
        }),
      };

      const validResult = registry.validateRequest(
        endpoint,
        undefined,
        { limit: 10, offset: 0 }
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = registry.validateRequest(
        endpoint,
        undefined,
        { limit: 200 }
      );
      expect(invalidResult.valid).toBe(false);
    });

    it('should validate path parameters', () => {
      const endpoint: ApiEndpoint = {
        method: 'GET',
        path: '/users/:id',
        version: 'v1',
        operationId: 'getUser',
        summary: 'Get user',
        tags: ['users'],
        requiresAuth: true,
        pathSchema: z.object({
          id: z.string().uuid(),
        }),
      };

      const validResult = registry.validateRequest(
        endpoint,
        undefined,
        undefined,
        { id: '550e8400-e29b-41d4-a716-446655440000' }
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = registry.validateRequest(
        endpoint,
        undefined,
        undefined,
        { id: 'not-a-uuid' }
      );
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('API Error', () => {
    it('should create API error with code and message', () => {
      const error = createApiError(
        PublicApiErrorCodes.INVALID_REQUEST,
        'Invalid request body'
      );

      expect(error.code).toBe('API_1001');
      expect(error.message).toBe('Invalid request body');
      expect(error.timestamp).toBeDefined();
    });

    it('should include validation errors', () => {
      const error = createApiError(
        PublicApiErrorCodes.VALIDATION_FAILED,
        'Validation failed',
        {
          validationErrors: [
            { field: 'email', message: 'Invalid email format', code: 'invalid_email' },
            { field: 'name', message: 'Name is required', code: 'required' },
          ],
        }
      );

      expect(error.validationErrors).toHaveLength(2);
      expect(error.validationErrors![0].field).toBe('email');
    });

    it('should include trace ID and details', () => {
      const error = createApiError(
        PublicApiErrorCodes.INTERNAL_ERROR,
        'Something went wrong',
        {
          traceId: 'trace-123',
          details: { component: 'database' },
        }
      );

      expect(error.traceId).toBe('trace-123');
      expect(error.details).toEqual({ component: 'database' });
    });
  });

  describe('API Response', () => {
    let context: ApiRequestContext;

    beforeEach(() => {
      context = createRequestContext({
        clientIp: '127.0.0.1',
        requestId: 'req-123',
        version: 'v1',
      });
    });

    it('should create successful response', () => {
      const response = createApiResponse(
        { id: '1', name: 'Test' },
        context
      );

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ id: '1', name: 'Test' });
      expect(response.meta?.apiVersion).toBe('v1');
      expect(response.meta?.requestId).toBe('req-123');
      expect(response.meta?.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should create response with pagination', () => {
      const response = createApiResponse(
        [{ id: '1' }, { id: '2' }],
        context,
        {
          page: 1,
          pageSize: 10,
          totalItems: 50,
          totalPages: 5,
          hasNext: true,
          hasPrev: false,
        }
      );

      expect(response.pagination).toBeDefined();
      expect(response.pagination?.page).toBe(1);
      expect(response.pagination?.totalPages).toBe(5);
    });

    it('should create error response', () => {
      const error = createApiError(
        PublicApiErrorCodes.NOT_FOUND,
        'User not found'
      );

      const response = createErrorResponse(error, context);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('API_3001');
      expect(response.meta?.requestId).toBe('req-123');
    });
  });

  describe('Request Context', () => {
    it('should create context with defaults', () => {
      const context = createRequestContext({
        clientIp: '192.168.1.1',
      });

      expect(context.clientIp).toBe('192.168.1.1');
      expect(context.version).toBe('v1');
      expect(context.requestId).toBeDefined();
      expect(context.startTime).toBeDefined();
      expect(context.scopes).toEqual([]);
    });

    it('should create context with custom values', () => {
      const context = createRequestContext({
        clientIp: '10.0.0.1',
        requestId: 'custom-req-id',
        version: 'v1',
        tenantId: 'tenant-123',
        userId: 'user-456',
        apiKeyId: 'key-789',
        scopes: ['users:read', 'forecasts:write'],
      });

      expect(context.requestId).toBe('custom-req-id');
      expect(context.tenantId).toBe('tenant-123');
      expect(context.userId).toBe('user-456');
      expect(context.apiKeyId).toBe('key-789');
      expect(context.scopes).toContain('users:read');
    });
  });

  describe('Constants', () => {
    it('should have correct API version', () => {
      expect(CURRENT_API_VERSION).toBe('v1');
    });

    it('should have supported versions', () => {
      expect(SUPPORTED_API_VERSIONS).toContain('v1');
    });

    it('should have all error codes', () => {
      expect(PublicApiErrorCodes.INVALID_REQUEST).toBe('API_1001');
      expect(PublicApiErrorCodes.UNAUTHORIZED).toBe('API_2001');
      expect(PublicApiErrorCodes.NOT_FOUND).toBe('API_3001');
      expect(PublicApiErrorCodes.RATE_LIMITED).toBe('API_4001');
      expect(PublicApiErrorCodes.INTERNAL_ERROR).toBe('API_5001');
    });
  });
});
