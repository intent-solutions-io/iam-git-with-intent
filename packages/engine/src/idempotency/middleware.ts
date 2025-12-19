/**
 * Idempotency Express Middleware
 *
 * A5.s3: Provides idempotency middleware for Express-based API handlers.
 *
 * Usage:
 * ```typescript
 * import { idempotencyMiddleware } from '@gwi/engine';
 *
 * // Apply to specific routes
 * app.post('/api/workflows', idempotencyMiddleware(), async (req, res) => {
 *   // Handler code - will only run once per idempotency key
 * });
 *
 * // Or apply to all POST/PUT/PATCH routes
 * app.use(idempotencyMiddleware({ methods: ['POST', 'PUT', 'PATCH'] }));
 * ```
 *
 * @module @gwi/engine/idempotency
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiIdempotencyKey } from './types.js';
import { getIdempotencyService, IdempotencyProcessingError } from './service.js';

// =============================================================================
// Middleware Options
// =============================================================================

/**
 * Options for idempotency middleware
 */
export interface IdempotencyMiddlewareOptions {
  /**
   * HTTP methods to apply idempotency to
   * Default: ['POST', 'PUT', 'PATCH']
   */
  methods?: string[];

  /**
   * Header name for idempotency key
   * Default: 'X-Idempotency-Key'
   * Also checks: 'X-Request-ID', 'Idempotency-Key'
   */
  headerName?: string;

  /**
   * Whether idempotency key is required
   * If false, requests without key will proceed normally
   * Default: false
   */
  required?: boolean;

  /**
   * Function to extract client ID from request
   * Default: Uses Authorization header hash or IP address
   */
  getClientId?: (req: Request) => string;

  /**
   * Function to extract tenant ID from request
   * Default: Uses req.params.tenantId or 'default'
   */
  getTenantId?: (req: Request) => string;

  /**
   * Skip idempotency for certain paths
   * Default: ['/health', '/metrics']
   */
  skipPaths?: string[];
}

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: Required<IdempotencyMiddlewareOptions> = {
  methods: ['POST', 'PUT', 'PATCH'],
  headerName: 'X-Idempotency-Key',
  required: false,
  getClientId: (req: Request) => {
    // Try to extract a stable client identifier
    const auth = req.headers.authorization;
    if (auth) {
      // Hash the auth header to get a stable client ID
      return `auth:${hashString(auth)}`;
    }
    // Fall back to IP
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `ip:${Array.isArray(ip) ? ip[0] : ip}`;
  },
  getTenantId: (req: Request) => {
    // Try common patterns for tenant ID
    const params = req.params as Record<string, string>;
    return params.tenantId || params.tenant_id || params.orgId || 'default';
  },
  skipPaths: ['/health', '/metrics', '/.well-known'],
};

// =============================================================================
// Middleware Implementation
// =============================================================================

/**
 * Create idempotency middleware for Express
 */
export function idempotencyMiddleware(
  options: IdempotencyMiddlewareOptions = {}
): RequestHandler {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if method not in list
    if (!opts.methods.includes(req.method)) {
      return next();
    }

    // Skip certain paths
    if (opts.skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Extract idempotency key from headers
    const idempotencyKey = extractIdempotencyKey(req, opts.headerName);

    // If no key and not required, proceed normally
    if (!idempotencyKey) {
      if (opts.required) {
        return res.status(400).json({
          error: 'Missing idempotency key',
          message: `${opts.headerName} header is required for this request`,
        });
      }
      return next();
    }

    // Build API idempotency key
    const clientId = opts.getClientId(req);
    const tenantId = opts.getTenantId(req);

    const apiKey: ApiIdempotencyKey = {
      source: 'api',
      clientId,
      requestId: idempotencyKey,
    };

    // Get idempotency service
    const service = getIdempotencyService();

    try {
      // Check for duplicate
      const checkResult = await service.check(apiKey, tenantId, {
        method: req.method,
        path: req.path,
        body: req.body,
      });

      if (checkResult.status === 'duplicate') {
        // Return cached response
        const cachedResponse = checkResult.record.response as CachedResponse | undefined;

        // Add header to indicate this is a cached response
        res.setHeader('X-Idempotency-Replayed', 'true');
        res.setHeader('X-Idempotency-Key', idempotencyKey);

        if (cachedResponse?.statusCode) {
          return res.status(cachedResponse.statusCode).json(cachedResponse.body);
        }

        // If no cached response (unusual), return 200 with basic info
        return res.status(200).json({
          duplicate: true,
          runId: checkResult.record.runId,
          message: 'Request already processed',
        });
      }

      if (checkResult.status === 'processing') {
        // Another instance is processing
        res.setHeader('X-Idempotency-Key', idempotencyKey);
        res.setHeader('Retry-After', '5');

        return res.status(409).json({
          error: 'Request in progress',
          message: 'This request is currently being processed',
          key: checkResult.key,
        });
      }

      // New request - wrap the response to capture for caching
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      // Track response for caching
      let responseCaptured = false;

      res.json = function(body: unknown) {
        if (!responseCaptured) {
          responseCaptured = true;

          // Store response in idempotency record
          const cachedResponse: CachedResponse = {
            statusCode: res.statusCode,
            body,
          };

          // Fire and forget - don't wait for storage
          service.process(
            apiKey,
            tenantId,
            { method: req.method, path: req.path, body: req.body },
            async () => ({
              runId: (body as Record<string, unknown>)?.runId as string | undefined,
              response: cachedResponse,
            })
          ).catch((err: Error) => {
            console.error('Failed to store idempotency response:', err.message);
          });
        }

        return originalJson(body);
      };

      res.send = function(body: unknown) {
        if (!responseCaptured && typeof body === 'object') {
          responseCaptured = true;

          service.process(
            apiKey,
            tenantId,
            { method: req.method, path: req.path, body: req.body },
            async () => ({
              response: { statusCode: res.statusCode, body },
            })
          ).catch((err: Error) => {
            console.error('Failed to store idempotency response:', err.message);
          });
        }

        return originalSend(body);
      };

      // Add idempotency key to response headers
      res.setHeader('X-Idempotency-Key', idempotencyKey);

      return next();
    } catch (error) {
      if (error instanceof IdempotencyProcessingError) {
        res.setHeader('X-Idempotency-Key', idempotencyKey);
        res.setHeader('Retry-After', '5');

        return res.status(409).json({
          error: 'Request in progress',
          message: error.message,
          key: error.key,
        });
      }

      // Log error but don't fail the request
      console.error('Idempotency middleware error:', error);
      return next();
    }
  };
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Cached response structure
 */
interface CachedResponse {
  statusCode: number;
  body: unknown;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract idempotency key from request headers
 */
function extractIdempotencyKey(req: Request, primaryHeader: string): string | undefined {
  // Try primary header first
  const primary = req.headers[primaryHeader.toLowerCase()] as string | undefined;
  if (primary) return primary;

  // Try alternatives
  const alternatives = ['x-idempotency-key', 'idempotency-key', 'x-request-id'];
  for (const header of alternatives) {
    const value = req.headers[header] as string | undefined;
    if (value) return value;
  }

  return undefined;
}

/**
 * Simple string hash for client ID generation
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create middleware that requires idempotency key
 */
export function requireIdempotency(
  options: Omit<IdempotencyMiddlewareOptions, 'required'> = {}
): RequestHandler {
  return idempotencyMiddleware({ ...options, required: true });
}

/**
 * Create middleware for specific methods only
 */
export function idempotencyForMethods(
  methods: string[],
  options: Omit<IdempotencyMiddlewareOptions, 'methods'> = {}
): RequestHandler {
  return idempotencyMiddleware({ ...options, methods });
}
