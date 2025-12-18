/**
 * Telemetry HTTP Middleware
 *
 * Phase 23: Production Observability
 *
 * Express/Hono-compatible middleware for:
 * - Automatic telemetry context creation from requests
 * - Request/response logging
 * - Context propagation through async operations
 *
 * @module @gwi/core/telemetry/middleware
 */

import {
  createContextFromRequest,
  runWithContextAsync,
  TelemetryContext,
  TelemetrySource,
} from './context.js';
import { createLogger, Logger } from './logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Request-like object (works with Express, Hono, etc.)
 */
export interface RequestLike {
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Response-like object (works with Express, Hono, etc.)
 */
export interface ResponseLike {
  statusCode?: number;
  status?: number;
}

/**
 * Next function type
 */
export type NextFunction = () => Promise<void> | void;

/**
 * Middleware options
 */
export interface TelemetryMiddlewareOptions {
  /** Service name for logging */
  serviceName: string;
  /** Source type */
  source?: TelemetrySource;
  /** Paths to skip logging (e.g., health checks) */
  skipPaths?: string[];
  /** Whether to log request bodies (default: false for security) */
  logRequestBody?: boolean;
  /** Whether to log response bodies (default: false for performance) */
  logResponseBody?: boolean;
  /** Custom logger instance */
  logger?: Logger;
}

// =============================================================================
// Express-style Middleware
// =============================================================================

/**
 * Create Express-compatible telemetry middleware
 *
 * Usage:
 * ```typescript
 * import { createTelemetryMiddleware } from '@gwi/core';
 *
 * app.use(createTelemetryMiddleware({ serviceName: 'api' }));
 * ```
 */
export function createTelemetryMiddleware(options: TelemetryMiddlewareOptions) {
  const logger = options.logger ?? createLogger(options.serviceName);
  const skipPaths = new Set(options.skipPaths ?? ['/health', '/ready', '/metrics']);
  const source = options.source ?? 'api';

  return async function telemetryMiddleware(
    req: RequestLike,
    res: ResponseLike,
    next: NextFunction
  ): Promise<void> {
    const path = req.path ?? req.url ?? '/';

    // Skip logging for health checks etc.
    if (skipPaths.has(path)) {
      return next();
    }

    // Create telemetry context from request
    const ctx = createContextFromRequest(
      {
        headers: req.headers,
        method: req.method,
        path,
      },
      source
    );

    const startTime = Date.now();

    // Log request start
    logger.requestStart(req.method ?? 'GET', path, {
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      tenantId: ctx.tenantId,
    });

    // Run handler with context
    await runWithContextAsync(ctx, async () => {
      try {
        await next();
      } finally {
        // Log request end
        const durationMs = Date.now() - startTime;
        const status = res.statusCode ?? res.status ?? 200;

        logger.requestEnd(req.method ?? 'GET', path, status, durationMs, {
          requestId: ctx.requestId,
          traceId: ctx.traceId,
          tenantId: ctx.tenantId,
        });
      }
    });
  };
}

// =============================================================================
// Hono-style Middleware
// =============================================================================

/**
 * Hono context type (minimal interface)
 */
export interface HonoContext {
  req: {
    method: string;
    path: string;
    url: string;
    header: (name: string) => string | undefined;
    raw?: RequestLike;
  };
  res: ResponseLike;
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
  status: (code: number) => void;
}

/**
 * Create Hono-compatible telemetry middleware
 *
 * Usage:
 * ```typescript
 * import { createHonoTelemetryMiddleware } from '@gwi/core';
 *
 * app.use(createHonoTelemetryMiddleware({ serviceName: 'gateway' }));
 * ```
 */
export function createHonoTelemetryMiddleware(options: TelemetryMiddlewareOptions) {
  const logger = options.logger ?? createLogger(options.serviceName);
  const skipPaths = new Set(options.skipPaths ?? ['/health', '/ready', '/metrics']);
  const source = options.source ?? 'api';

  return async function honoTelemetryMiddleware(
    c: HonoContext,
    next: () => Promise<void>
  ): Promise<void> {
    const path = c.req.path;

    // Skip logging for health checks etc.
    if (skipPaths.has(path)) {
      return next();
    }

    // Convert Hono headers to record
    const headers: Record<string, string | undefined> = {};
    const headerNames = ['traceparent', 'x-tenant-id', 'x-request-id', 'user-agent', 'authorization'];
    for (const name of headerNames) {
      headers[name] = c.req.header(name);
    }

    // Create telemetry context from request
    const ctx = createContextFromRequest(
      {
        headers,
        method: c.req.method,
        path,
      },
      source
    );

    // Store context in Hono context for downstream access
    c.set('telemetryContext', ctx);

    const startTime = Date.now();

    // Log request start
    logger.requestStart(c.req.method, path, {
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      tenantId: ctx.tenantId,
    });

    // Run handler with context
    await runWithContextAsync(ctx, async () => {
      try {
        await next();
      } finally {
        // Log request end
        const durationMs = Date.now() - startTime;
        const status = (c.res as { status?: number }).status ?? 200;

        logger.requestEnd(c.req.method, path, status, durationMs, {
          requestId: ctx.requestId,
          traceId: ctx.traceId,
          tenantId: ctx.tenantId,
        });
      }
    });
  };
}

// =============================================================================
// Helper to get context from Hono
// =============================================================================

/**
 * Get telemetry context from Hono context
 */
export function getTelemetryContextFromHono(c: HonoContext): TelemetryContext | undefined {
  return c.get('telemetryContext') as TelemetryContext | undefined;
}

// =============================================================================
// Worker/Job Wrapper
// =============================================================================

/**
 * Wrap a job handler with telemetry context
 *
 * Usage:
 * ```typescript
 * import { wrapJobHandler } from '@gwi/core';
 *
 * const handler = wrapJobHandler('worker', async (job, ctx) => {
 *   logger.info('Processing job', { jobId: job.id });
 *   // ... job logic
 * });
 * ```
 */
export function wrapJobHandler<T extends { traceId?: string; spanId?: string; tenantId?: string }>(
  serviceName: string,
  handler: (job: T, ctx: TelemetryContext) => Promise<void>
): (job: T) => Promise<void> {
  const logger = createLogger(serviceName);

  return async function wrappedHandler(job: T): Promise<void> {
    const ctx = createContextFromRequest(
      {
        headers: {
          traceparent: job.traceId ? `00-${job.traceId}-0000000000000000-01` : undefined,
          'x-tenant-id': job.tenantId,
        },
      },
      'worker'
    );

    const jobId = (job as unknown as { id?: string }).id ?? 'unknown';
    const jobType = (job as unknown as { type?: string }).type ?? 'job';

    logger.jobStart(jobType, jobId, {
      tenantId: ctx.tenantId,
      traceId: ctx.traceId,
    });

    const startTime = Date.now();
    let success = true;

    await runWithContextAsync(ctx, async () => {
      try {
        await handler(job, ctx);
      } catch (error) {
        success = false;
        logger.error('Job failed', error, {
          jobType,
          jobId,
          tenantId: ctx.tenantId,
          traceId: ctx.traceId,
        });
        throw error;
      } finally {
        const durationMs = Date.now() - startTime;
        logger.jobEnd(jobType, jobId, success, durationMs, {
          tenantId: ctx.tenantId,
          traceId: ctx.traceId,
        });
      }
    });
  };
}

// =============================================================================
// Webhook Handler Wrapper
// =============================================================================

/**
 * Wrap a webhook handler with telemetry context
 */
export function wrapWebhookHandler<T>(
  serviceName: string,
  handler: (event: T, ctx: TelemetryContext) => Promise<void>
): (
  event: T,
  headers?: Record<string, string | string[] | undefined>
) => Promise<void> {
  const logger = createLogger(serviceName);

  return async function wrappedWebhookHandler(
    event: T,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<void> {
    const eventType = (event as unknown as { action?: string }).action ?? 'webhook';
    const deliveryId = headers?.['x-github-delivery'] as string | undefined;

    const ctx = createContextFromRequest(
      {
        headers,
        method: 'POST',
        path: '/webhook',
      },
      'webhook'
    );

    logger.webhookReceived(eventType, deliveryId ?? ctx.requestId ?? 'unknown', {
      traceId: ctx.traceId,
    });

    const startTime = Date.now();

    await runWithContextAsync(ctx, async () => {
      try {
        await handler(event, ctx);

        const durationMs = Date.now() - startTime;
        logger.info('Webhook processed', {
          eventName: 'webhook.processed',
          webhookEventType: eventType,
          durationMs,
          traceId: ctx.traceId,
        });
      } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error('Webhook failed', error, {
          eventName: 'webhook.failed',
          webhookEventType: eventType,
          durationMs,
          traceId: ctx.traceId,
        });
        throw error;
      }
    });
  };
}
