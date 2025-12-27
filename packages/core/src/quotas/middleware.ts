/**
 * Quota Enforcement Middleware
 *
 * Epic E: RBAC & Governance
 *
 * Provides Express middleware for quota enforcement with:
 * - Pre-request quota checking
 * - Post-request usage recording
 * - Retry-After header calculation
 * - Telemetry integration
 * - Support for soft/hard/warn enforcement levels
 *
 * @module @gwi/core/quotas/middleware
 */

import type {
  QuotaManager,
  QuotaResourceType,
  QuotaEnforcement,
} from './index.js';
import { createLogger, getCurrentContext } from '../telemetry/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Express-compatible request interface
 */
export interface QuotaRequest {
  context?: {
    tenantId?: string;
    userId?: string;
  };
  quotaUsageAmount?: number; // Custom usage amount (default: 1)
  quotaMetadata?: Record<string, unknown>; // Additional metadata to record
}

/**
 * Express-compatible response interface
 */
export interface QuotaResponse {
  status(code: number): QuotaResponse;
  json(body: unknown): void;
  set(header: string, value: string): void;
}

/**
 * Express-compatible next function
 */
export type QuotaNext = (err?: Error) => void;

/**
 * Quota middleware configuration
 */
export interface QuotaMiddlewareConfig {
  /**
   * Resource type to enforce
   */
  resourceType: QuotaResourceType;

  /**
   * Extract tenant ID from request
   * @default (req) => req.context?.tenantId
   */
  getTenantId?: (req: QuotaRequest) => string | undefined;

  /**
   * Extract usage amount from request
   * @default (req) => req.quotaUsageAmount || 1
   */
  getUsageAmount?: (req: QuotaRequest) => number;

  /**
   * Extract metadata from request
   * @default (req) => req.quotaMetadata
   */
  getMetadata?: (req: QuotaRequest) => Record<string, unknown> | undefined;

  /**
   * Should we record usage on success?
   * @default true
   */
  recordUsage?: boolean;

  /**
   * Should we log quota warnings?
   * @default true
   */
  logWarnings?: boolean;
}

/**
 * Quota check error
 */
export class QuotaExceededError extends Error {
  constructor(
    public resourceType: QuotaResourceType,
    public currentUsage: number,
    public limit: number,
    public retryAfterMs?: number,
    public enforcement?: QuotaEnforcement
  ) {
    super(`Quota exceeded for ${resourceType}: ${currentUsage}/${limit}`);
    this.name = 'QuotaExceededError';
  }
}

// =============================================================================
// Middleware Factory
// =============================================================================

const logger = createLogger('quota-middleware');

/**
 * Create Express middleware that enforces quota before request proceeds
 *
 * @example
 * ```typescript
 * // Enforce run quota
 * app.post('/runs',
 *   enforceQuota(quotaManager, { resourceType: 'runs' }),
 *   async (req, res) => {
 *     // If we get here, quota check passed
 *     const run = await createRun(req.body);
 *     res.json(run);
 *   }
 * );
 *
 * // Enforce API calls quota with custom amount
 * app.post('/batch',
 *   (req, res, next) => {
 *     req.quotaUsageAmount = req.body.items.length;
 *     next();
 *   },
 *   enforceQuota(quotaManager, { resourceType: 'api_calls' }),
 *   async (req, res) => {
 *     const results = await processBatch(req.body.items);
 *     res.json(results);
 *   }
 * );
 * ```
 */
export function enforceQuota(
  quotaManager: QuotaManager,
  config: QuotaMiddlewareConfig
) {
  const {
    resourceType,
    getTenantId = (req) => req.context?.tenantId,
    getUsageAmount = (req) => req.quotaUsageAmount || 1,
    getMetadata = (req) => req.quotaMetadata,
    recordUsage = true,
    logWarnings = true,
  } = config;

  return async (req: QuotaRequest, res: QuotaResponse, next: QuotaNext) => {
    const telemetryContext = getCurrentContext();
    const tenantId = getTenantId(req);

    // Skip if no tenant context
    if (!tenantId) {
      logger.debug('Skipping quota check - no tenant context', {
        eventName: 'quota.middleware.skipped',
        resourceType,
        reason: 'no_tenant',
        traceId: telemetryContext?.traceId,
        requestId: telemetryContext?.requestId,
      });
      return next();
    }

    const amount = getUsageAmount(req);
    const metadata = getMetadata(req);

    try {
      // Check quota
      const checkResult = await quotaManager.checkQuota(tenantId, resourceType, amount);

      // Log warnings
      if (logWarnings && checkResult.warnings.length > 0) {
        for (const warning of checkResult.warnings) {
          logger.warn(warning, {
            eventName: 'quota.middleware.warning',
            tenantId,
            resourceType,
            currentUsage: checkResult.currentUsage,
            limit: checkResult.limit,
            percentUsed: ((checkResult.currentUsage / checkResult.limit) * 100).toFixed(1),
            traceId: telemetryContext?.traceId,
            requestId: telemetryContext?.requestId,
          });
        }
      }

      // Handle based on enforcement level
      if (!checkResult.allowed) {
        const enforcement = checkResult.enforcement || 'hard';

        // Log quota denial
        logger.warn('Quota exceeded', {
          eventName: 'quota.middleware.exceeded',
          tenantId,
          resourceType,
          currentUsage: checkResult.currentUsage,
          limit: checkResult.limit,
          remaining: checkResult.remaining,
          enforcement,
          reason: checkResult.reason,
          traceId: telemetryContext?.traceId,
          requestId: telemetryContext?.requestId,
        });

        // HARD enforcement: block request
        if (enforcement === 'hard') {
          // Set Retry-After header if available
          if (checkResult.retryAfterMs) {
            const retryAfterSeconds = Math.ceil(checkResult.retryAfterMs / 1000);
            res.set('Retry-After', retryAfterSeconds.toString());
          }

          // Return 429 Too Many Requests
          res.status(429).json({
            error: 'QuotaExceeded',
            message: checkResult.reason || `Quota exceeded for ${resourceType}`,
            resourceType,
            currentUsage: checkResult.currentUsage,
            limit: checkResult.limit,
            remaining: checkResult.remaining,
            enforcement,
            retryAfterMs: checkResult.retryAfterMs,
          });
          return;
        }

        // SOFT/WARN enforcement: log but allow
        logger.info(`Quota exceeded but ${enforcement} enforcement - allowing request`, {
          eventName: 'quota.middleware.soft_exceeded',
          tenantId,
          resourceType,
          currentUsage: checkResult.currentUsage,
          limit: checkResult.limit,
          enforcement,
          traceId: telemetryContext?.traceId,
          requestId: telemetryContext?.requestId,
        });
      } else {
        // Quota check passed
        logger.debug('Quota check passed', {
          eventName: 'quota.middleware.allowed',
          tenantId,
          resourceType,
          currentUsage: checkResult.currentUsage,
          limit: checkResult.limit,
          remaining: checkResult.remaining,
          traceId: telemetryContext?.traceId,
          requestId: telemetryContext?.requestId,
        });
      }

      // Record usage after successful response (if enabled)
      if (recordUsage) {
        // Attach cleanup function to response
        const originalJson = res.json.bind(res);
        res.json = function (body: unknown) {
          // Record usage asynchronously (don't block response)
          quotaManager
            .recordUsage(tenantId, resourceType, amount, metadata)
            .then((event) => {
              logger.debug('Usage recorded', {
                eventName: 'quota.middleware.usage_recorded',
                tenantId,
                resourceType,
                amount,
                usageEventId: event.id,
                traceId: telemetryContext?.traceId,
                requestId: telemetryContext?.requestId,
              });
            })
            .catch((err) => {
              logger.error('Failed to record usage', {
                eventName: 'quota.middleware.usage_failed',
                tenantId,
                resourceType,
                amount,
                error: err.message,
                traceId: telemetryContext?.traceId,
                requestId: telemetryContext?.requestId,
              });
            });

          return originalJson(body);
        };
      }

      next();
    } catch (err) {
      logger.error('Quota middleware error', {
        eventName: 'quota.middleware.error',
        tenantId,
        resourceType,
        error: err instanceof Error ? err.message : String(err),
        traceId: telemetryContext?.traceId,
        requestId: telemetryContext?.requestId,
      });

      // On error, allow request to proceed (fail open)
      next();
    }
  };
}

/**
 * Create Express middleware that only checks quota (does not record usage)
 *
 * Useful for read operations where you want to check but not increment usage.
 */
export function checkQuota(quotaManager: QuotaManager, config: QuotaMiddlewareConfig) {
  return enforceQuota(quotaManager, { ...config, recordUsage: false });
}

/**
 * Create Express middleware that only records usage (does not check quota)
 *
 * Useful when you want to record usage after an operation completes.
 */
export function recordQuotaUsage(quotaManager: QuotaManager, config: QuotaMiddlewareConfig) {
  const {
    resourceType,
    getTenantId = (req) => req.context?.tenantId,
    getUsageAmount = (req) => req.quotaUsageAmount || 1,
    getMetadata = (req) => req.quotaMetadata,
  } = config;

  return async (req: QuotaRequest, _res: QuotaResponse, next: QuotaNext) => {
    const telemetryContext = getCurrentContext();
    const tenantId = getTenantId(req);

    if (!tenantId) {
      return next();
    }

    const amount = getUsageAmount(req);
    const metadata = getMetadata(req);

    try {
      await quotaManager.recordUsage(tenantId, resourceType, amount, metadata);

      logger.debug('Usage recorded', {
        eventName: 'quota.middleware.usage_recorded',
        tenantId,
        resourceType,
        amount,
        traceId: telemetryContext?.traceId,
        requestId: telemetryContext?.requestId,
      });
    } catch (err) {
      logger.error('Failed to record usage', {
        eventName: 'quota.middleware.usage_failed',
        tenantId,
        resourceType,
        amount,
        error: err instanceof Error ? err.message : String(err),
        traceId: telemetryContext?.traceId,
        requestId: telemetryContext?.requestId,
      });
    }

    next();
  };
}

/**
 * Create Express error handler for quota errors
 *
 * Use this at the end of your middleware chain to catch QuotaExceededError.
 */
export function quotaErrorHandler() {
  return (err: Error, req: QuotaRequest, res: QuotaResponse, next: QuotaNext) => {
    if (err instanceof QuotaExceededError) {
      const telemetryContext = getCurrentContext();

      logger.warn('Quota exceeded error caught', {
        eventName: 'quota.error_handler.caught',
        tenantId: req.context?.tenantId,
        resourceType: err.resourceType,
        currentUsage: err.currentUsage,
        limit: err.limit,
        enforcement: err.enforcement,
        traceId: telemetryContext?.traceId,
        requestId: telemetryContext?.requestId,
      });

      if (err.retryAfterMs) {
        const retryAfterSeconds = Math.ceil(err.retryAfterMs / 1000);
        res.set('Retry-After', retryAfterSeconds.toString());
      }

      res.status(429).json({
        error: 'QuotaExceeded',
        message: err.message,
        resourceType: err.resourceType,
        currentUsage: err.currentUsage,
        limit: err.limit,
        enforcement: err.enforcement,
        retryAfterMs: err.retryAfterMs,
      });
      return;
    }

    next(err);
  };
}
