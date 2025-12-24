/**
 * E2E Test API Client
 *
 * HTTP client wrapper for E2E testing with built-in:
 * - Authentication helpers
 * - Request/response logging
 * - Error handling
 * - Type-safe request/response handling
 */

import request, { Test } from 'supertest';
import type { Express } from 'express';

export interface ApiClientOptions {
  /** Express app instance to test */
  app: Express;
  /** Enable request/response logging */
  enableLogging?: boolean;
  /** Default user ID for authenticated requests */
  defaultUserId?: string;
  /** Default tenant ID for tenant-scoped requests */
  defaultTenantId?: string;
}

export interface RequestOptions {
  /** User ID for authentication (overrides default) */
  userId?: string;
  /** Tenant ID for tenant-scoped requests (overrides default) */
  tenantId?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Query parameters */
  query?: Record<string, string | number | boolean>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

/**
 * E2E API Test Client
 *
 * Provides a type-safe wrapper around supertest with:
 * - Automatic authentication headers
 * - Request/response logging
 * - Standardized error handling
 */
export class ApiClient {
  private app: Express;
  private enableLogging: boolean;
  private defaultUserId?: string;
  private defaultTenantId?: string;

  constructor(options: ApiClientOptions) {
    this.app = options.app;
    this.enableLogging = options.enableLogging ?? false;
    this.defaultUserId = options.defaultUserId;
    this.defaultTenantId = options.defaultTenantId;
  }

  /**
   * Build a supertest request with standard options
   */
  private buildRequest(method: string, path: string, options?: RequestOptions): Test {
    const req = request(this.app)[method.toLowerCase()](path);

    // Add authentication headers
    const userId = options?.userId ?? this.defaultUserId;
    if (userId) {
      req.set('X-Debug-User', userId);
    }

    // Add custom headers
    if (options?.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    // Add query parameters
    if (options?.query) {
      req.query(options.query);
    }

    // Add body for POST/PUT/PATCH
    if (options?.body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      req.send(options.body);
      req.set('Content-Type', 'application/json');
    }

    // Log request if enabled
    if (this.enableLogging) {
      console.log(`[API Client] ${method} ${path}`, {
        userId,
        headers: options?.headers,
        query: options?.query,
        body: options?.body,
      });
    }

    return req;
  }

  /**
   * Execute request and return typed response
   */
  private async executeRequest<T = unknown>(
    req: Test,
    path: string,
    method: string
  ): Promise<ApiResponse<T>> {
    const response = await req;

    // Log response if enabled
    if (this.enableLogging) {
      console.log(`[API Client] ${method} ${path} -> ${response.status}`, {
        body: response.body,
        headers: response.headers,
      });
    }

    return {
      status: response.status,
      body: response.body as T,
      headers: response.headers as Record<string, string>,
    };
  }

  /**
   * GET request
   */
  async get<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const req = this.buildRequest('GET', path, options);
    return this.executeRequest<T>(req, path, 'GET');
  }

  /**
   * POST request
   */
  async post<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const req = this.buildRequest('POST', path, options);
    return this.executeRequest<T>(req, path, 'POST');
  }

  /**
   * PUT request
   */
  async put<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const req = this.buildRequest('PUT', path, options);
    return this.executeRequest<T>(req, path, 'PUT');
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const req = this.buildRequest('PATCH', path, options);
    return this.executeRequest<T>(req, path, 'PATCH');
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const req = this.buildRequest('DELETE', path, options);
    return this.executeRequest<T>(req, path, 'DELETE');
  }

  /**
   * Health check helper
   */
  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string; version?: string }>> {
    return this.get('/health');
  }

  /**
   * Create a workflow run
   */
  async createWorkflow<T = unknown>(
    tenantId: string,
    workflowType: string,
    input: unknown,
    options?: Omit<RequestOptions, 'body' | 'tenantId'>
  ): Promise<ApiResponse<T>> {
    return this.post(`/tenants/${tenantId}/workflows`, {
      ...options,
      tenantId,
      body: {
        workflowType,
        input,
      },
    });
  }

  /**
   * Get workflow run status
   */
  async getRunStatus<T = unknown>(
    tenantId: string,
    runId: string,
    options?: Omit<RequestOptions, 'tenantId'>
  ): Promise<ApiResponse<T>> {
    return this.get(`/tenants/${tenantId}/runs/${runId}`, {
      ...options,
      tenantId,
    });
  }

  /**
   * List workflow runs
   */
  async listRuns<T = unknown>(
    tenantId: string,
    options?: Omit<RequestOptions, 'tenantId'>
  ): Promise<ApiResponse<T>> {
    return this.get(`/tenants/${tenantId}/runs`, {
      ...options,
      tenantId,
    });
  }

  /**
   * Cancel a workflow run
   */
  async cancelRun<T = unknown>(
    tenantId: string,
    runId: string,
    reason?: string,
    options?: Omit<RequestOptions, 'body' | 'tenantId'>
  ): Promise<ApiResponse<T>> {
    return this.post(`/tenants/${tenantId}/runs/${runId}/cancel`, {
      ...options,
      tenantId,
      body: { reason },
    });
  }

  /**
   * Set default user ID for all subsequent requests
   */
  setDefaultUser(userId: string): void {
    this.defaultUserId = userId;
  }

  /**
   * Set default tenant ID for all subsequent requests
   */
  setDefaultTenant(tenantId: string): void {
    this.defaultTenantId = tenantId;
  }

  /**
   * Enable/disable request logging
   */
  setLogging(enabled: boolean): void {
    this.enableLogging = enabled;
  }
}

/**
 * Create an API client for E2E testing
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}

/**
 * Assert helpers for common response patterns
 */
export const assertResponse = {
  /**
   * Assert response is successful (2xx)
   */
  isSuccess(response: ApiResponse): void {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Expected success response, got ${response.status}: ${JSON.stringify(response.body)}`
      );
    }
  },

  /**
   * Assert response is unauthorized (401)
   */
  isUnauthorized(response: ApiResponse): void {
    if (response.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${response.status}`);
    }
  },

  /**
   * Assert response is forbidden (403)
   */
  isForbidden(response: ApiResponse): void {
    if (response.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${response.status}`);
    }
  },

  /**
   * Assert response is not found (404)
   */
  isNotFound(response: ApiResponse): void {
    if (response.status !== 404) {
      throw new Error(`Expected 404 Not Found, got ${response.status}`);
    }
  },

  /**
   * Assert response is bad request (400)
   */
  isBadRequest(response: ApiResponse): void {
    if (response.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${response.status}`);
    }
  },

  /**
   * Assert response has specific status
   */
  hasStatus(response: ApiResponse, expectedStatus: number): void {
    if (response.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
    }
  },

  /**
   * Assert response body has property
   */
  hasProperty<T = unknown>(response: ApiResponse<T>, property: string): void {
    if (!(property in (response.body as object))) {
      throw new Error(`Expected response body to have property '${property}'`);
    }
  },

  /**
   * Assert response body matches structure
   */
  matchesStructure<T = unknown>(response: ApiResponse<T>, expected: Partial<T>): void {
    const body = response.body as Record<string, unknown>;
    Object.keys(expected).forEach((key) => {
      if (!(key in body)) {
        throw new Error(`Expected response body to have property '${key}'`);
      }
    });
  },
};
