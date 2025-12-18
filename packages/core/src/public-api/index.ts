/**
 * Phase 61: Public REST API
 *
 * Versioned REST API infrastructure:
 * - OpenAPI spec generation
 * - Request/response validation
 * - API versioning (v1, v2, etc.)
 * - Error standardization
 * - Rate limiting integration
 *
 * @module @gwi/core/public-api
 */

import { z } from 'zod';

// =============================================================================
// PUBLIC API VERSION
// =============================================================================

export const PUBLIC_API_VERSION = '1.0.0';
export const CURRENT_API_VERSION = 'v1';
export const SUPPORTED_API_VERSIONS = ['v1'] as const;

// =============================================================================
// ERROR CODES
// =============================================================================

export const PublicApiErrorCodes = {
  // Request errors (1xxx)
  INVALID_REQUEST: 'API_1001',
  MISSING_PARAMETER: 'API_1002',
  INVALID_PARAMETER: 'API_1003',
  VALIDATION_FAILED: 'API_1004',

  // Auth errors (2xxx)
  UNAUTHORIZED: 'API_2001',
  FORBIDDEN: 'API_2002',
  TOKEN_EXPIRED: 'API_2003',
  INVALID_API_KEY: 'API_2004',

  // Resource errors (3xxx)
  NOT_FOUND: 'API_3001',
  CONFLICT: 'API_3002',
  GONE: 'API_3003',
  PRECONDITION_FAILED: 'API_3004',

  // Rate limit errors (4xxx)
  RATE_LIMITED: 'API_4001',
  QUOTA_EXCEEDED: 'API_4002',
  CONCURRENT_LIMIT: 'API_4003',
  DAILY_LIMIT: 'API_4004',

  // Server errors (5xxx)
  INTERNAL_ERROR: 'API_5001',
  SERVICE_UNAVAILABLE: 'API_5002',
  TIMEOUT: 'API_5003',
  DEPENDENCY_FAILED: 'API_5004',
} as const;

export type PublicApiErrorCode = (typeof PublicApiErrorCodes)[keyof typeof PublicApiErrorCodes];

// =============================================================================
// API TYPES
// =============================================================================

export type ApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiEndpoint {
  /** HTTP method */
  method: HttpMethod;
  /** Path pattern (with :params) */
  path: string;
  /** API version */
  version: ApiVersion;
  /** Endpoint name/ID */
  operationId: string;
  /** Summary */
  summary: string;
  /** Description */
  description?: string;
  /** Tags for grouping */
  tags: string[];
  /** Request body schema */
  requestSchema?: z.ZodType;
  /** Query params schema */
  querySchema?: z.ZodType;
  /** Path params schema */
  pathSchema?: z.ZodType;
  /** Response schema */
  responseSchema?: z.ZodType;
  /** Requires auth */
  requiresAuth: boolean;
  /** Required scopes */
  scopes?: string[];
  /** Rate limit tier */
  rateLimitTier?: 'default' | 'high' | 'low' | 'unlimited';
}

// =============================================================================
// API ERROR
// =============================================================================

export interface ApiError {
  /** Error code */
  code: PublicApiErrorCode;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Validation errors */
  validationErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  /** Trace ID for debugging */
  traceId?: string;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// API RESPONSE
// =============================================================================

export interface ApiResponse<T = unknown> {
  /** Response data */
  data?: T;
  /** Success flag */
  success: boolean;
  /** Error (if failed) */
  error?: ApiError;
  /** Pagination info */
  pagination?: PaginationInfo;
  /** Response metadata */
  meta?: ResponseMeta;
}

export interface PaginationInfo {
  /** Current page */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total items */
  totalItems: number;
  /** Total pages */
  totalPages: number;
  /** Has next page */
  hasNext: boolean;
  /** Has previous page */
  hasPrev: boolean;
}

export interface ResponseMeta {
  /** API version used */
  apiVersion: ApiVersion;
  /** Request ID */
  requestId: string;
  /** Response time (ms) */
  responseTimeMs: number;
  /** Deprecation warning */
  deprecationWarning?: string;
}

// =============================================================================
// API REQUEST CONTEXT
// =============================================================================

export interface ApiRequestContext {
  /** Request ID */
  requestId: string;
  /** API version */
  version: ApiVersion;
  /** Tenant ID */
  tenantId?: string;
  /** User ID */
  userId?: string;
  /** API key ID */
  apiKeyId?: string;
  /** Client IP */
  clientIp: string;
  /** User agent */
  userAgent?: string;
  /** Start time */
  startTime: number;
  /** Scopes */
  scopes: string[];
}

// =============================================================================
// OPENAPI SPEC TYPES
// =============================================================================

export interface PublicOpenApiSpec {
  openapi: '3.0.3';
  info: OpenApiInfo;
  servers: OpenApiServer[];
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
  tags: OpenApiTag[];
}

export interface OpenApiInfo {
  title: string;
  description: string;
  version: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

export interface OpenApiRequestBody {
  required: boolean;
  content: Record<string, { schema: Record<string, unknown> }>;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: Record<string, unknown> }>;
}

export interface OpenApiComponents {
  schemas?: Record<string, Record<string, unknown>>;
  securitySchemes?: Record<string, Record<string, unknown>>;
}

export interface OpenApiTag {
  name: string;
  description?: string;
}

// =============================================================================
// API REGISTRY
// =============================================================================

/**
 * API endpoint registry and spec generator
 */
export class ApiRegistry {
  private endpoints: Map<string, ApiEndpoint> = new Map();

  /**
   * Register an endpoint
   */
  registerEndpoint(endpoint: ApiEndpoint): void {
    const key = `${endpoint.method}:${endpoint.version}:${endpoint.path}`;
    this.endpoints.set(key, endpoint);
  }

  /**
   * Get endpoint by method and path
   */
  getEndpoint(method: HttpMethod, path: string, version: ApiVersion): ApiEndpoint | undefined {
    const key = `${method}:${version}:${path}`;
    return this.endpoints.get(key);
  }

  /**
   * List all endpoints
   */
  listEndpoints(version?: ApiVersion): ApiEndpoint[] {
    return Array.from(this.endpoints.values()).filter(
      e => !version || e.version === version
    );
  }

  /**
   * List endpoints by tag
   */
  listEndpointsByTag(tag: string, version?: ApiVersion): ApiEndpoint[] {
    return this.listEndpoints(version).filter(e => e.tags.includes(tag));
  }

  /**
   * Generate OpenAPI spec
   */
  generateOpenApiSpec(
    info: OpenApiInfo,
    servers: OpenApiServer[],
    version: ApiVersion = 'v1'
  ): PublicOpenApiSpec {
    const endpoints = this.listEndpoints(version);
    const paths: Record<string, OpenApiPathItem> = {};
    const tags = new Set<string>();

    for (const endpoint of endpoints) {
      const path = `/api/${version}${endpoint.path}`;
      if (!paths[path]) {
        paths[path] = {};
      }

      const operation = this.endpointToOperation(endpoint);
      const method = endpoint.method.toLowerCase() as keyof OpenApiPathItem;
      paths[path][method] = operation;

      endpoint.tags.forEach(t => tags.add(t));
    }

    return {
      openapi: '3.0.3',
      info,
      servers,
      paths,
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
        },
      },
      tags: Array.from(tags).map(name => ({ name })),
    };
  }

  private endpointToOperation(endpoint: ApiEndpoint): OpenApiOperation {
    const operation: OpenApiOperation = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      description: endpoint.description,
      tags: endpoint.tags,
      responses: {
        '200': { description: 'Successful response' },
        '400': { description: 'Bad request' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not found' },
        '429': { description: 'Rate limited' },
        '500': { description: 'Internal server error' },
      },
    };

    if (endpoint.requiresAuth) {
      operation.security = [{ ApiKeyAuth: [] }, { BearerAuth: [] }];
    }

    return operation;
  }

  /**
   * Validate request against endpoint schema
   */
  validateRequest(
    endpoint: ApiEndpoint,
    body?: unknown,
    query?: unknown,
    params?: unknown
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (endpoint.requestSchema && body !== undefined) {
      const result = endpoint.requestSchema.safeParse(body);
      if (!result.success) {
        errors.push(...result.error.issues.map(i => `body.${i.path.join('.')}: ${i.message}`));
      }
    }

    if (endpoint.querySchema && query !== undefined) {
      const result = endpoint.querySchema.safeParse(query);
      if (!result.success) {
        errors.push(...result.error.issues.map(i => `query.${i.path.join('.')}: ${i.message}`));
      }
    }

    if (endpoint.pathSchema && params !== undefined) {
      const result = endpoint.pathSchema.safeParse(params);
      if (!result.success) {
        errors.push(...result.error.issues.map(i => `path.${i.path.join('.')}: ${i.message}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  validationErrors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string(),
  })).optional(),
  traceId: z.string().optional(),
  timestamp: z.number().int(),
});

export const PaginationInfoSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const ApiResponseSchema = z.object({
  data: z.unknown().optional(),
  success: z.boolean(),
  error: ApiErrorSchema.optional(),
  pagination: PaginationInfoSchema.optional(),
  meta: z.object({
    apiVersion: z.enum(SUPPORTED_API_VERSIONS),
    requestId: z.string(),
    responseTimeMs: z.number().nonnegative(),
    deprecationWarning: z.string().optional(),
  }).optional(),
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create API error response
 */
export function createApiError(
  code: PublicApiErrorCode,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    validationErrors?: Array<{ field: string; message: string; code: string }>;
    traceId?: string;
  }
): ApiError {
  return {
    code,
    message,
    details: options?.details,
    validationErrors: options?.validationErrors,
    traceId: options?.traceId,
    timestamp: Date.now(),
  };
}

/**
 * Create successful API response
 */
export function createApiResponse<T>(
  data: T,
  context: ApiRequestContext,
  pagination?: PaginationInfo
): ApiResponse<T> {
  return {
    data,
    success: true,
    pagination,
    meta: {
      apiVersion: context.version,
      requestId: context.requestId,
      responseTimeMs: Date.now() - context.startTime,
    },
  };
}

/**
 * Create error API response
 */
export function createErrorResponse(
  error: ApiError,
  context: ApiRequestContext
): ApiResponse<never> {
  return {
    success: false,
    error,
    meta: {
      apiVersion: context.version,
      requestId: context.requestId,
      responseTimeMs: Date.now() - context.startTime,
    },
  };
}

/**
 * Create an API registry instance
 */
export function createApiRegistry(): ApiRegistry {
  return new ApiRegistry();
}

/**
 * Create request context
 */
export function createRequestContext(
  params: Pick<ApiRequestContext, 'clientIp'> & Partial<ApiRequestContext>
): ApiRequestContext {
  const { clientIp, requestId, version, startTime, scopes, ...rest } = params;
  return {
    requestId: requestId ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    version: version ?? 'v1',
    clientIp,
    startTime: startTime ?? Date.now(),
    scopes: scopes ?? [],
    ...rest,
  };
}
