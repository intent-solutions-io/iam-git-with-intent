/**
 * Git With Intent - Multi-Source Webhook Receiver
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Receives webhooks from multiple sources (GitHub, GitLab, Linear, Slack),
 * verifies signatures, applies rate limiting, and publishes to Pub/Sub
 * for async processing.
 *
 * Endpoints:
 * - POST /webhooks/github   - GitHub webhook events
 * - POST /webhooks/gitlab   - GitLab webhook events
 * - POST /webhooks/linear   - Linear webhook events
 * - POST /webhooks/slack    - Slack webhook events
 * - GET  /health            - Liveness probe
 * - GET  /health/ready      - Readiness probe
 *
 * Target: <500ms p95 response time
 *
 * @module @gwi/webhook-receiver
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { PubSub } from '@google-cloud/pubsub';

import {
  WebhookSourceSchema,
  RateLimitError,
  DEFAULT_CONFIG,
  type WebhookEvent,
  type WebhookResponse,
  type WebhookSource,
  type WebhookReceiverConfig,
} from './types.js';
import { WebhookVerifier, extractEventId, extractEventType, extractSignature } from './webhook/WebhookVerifier.js';
import { WebhookRouter } from './pubsub/WebhookRouter.js';
import { getRateLimiter } from './ratelimit/RateLimiter.js';
import { createLogger } from './logger.js';
import { createSecretManager } from './secrets.js';

// =============================================================================
// Configuration
// =============================================================================

const config: WebhookReceiverConfig = {
  ...DEFAULT_CONFIG,
  projectId: process.env.GCP_PROJECT_ID || DEFAULT_CONFIG.projectId,
  environment: process.env.DEPLOYMENT_ENV || DEFAULT_CONFIG.environment,
  port: parseInt(process.env.PORT || String(DEFAULT_CONFIG.port), 10),
  rateLimitPerMinute: parseInt(
    process.env.RATE_LIMIT_PER_MINUTE || String(DEFAULT_CONFIG.rateLimitPerMinute),
    10
  ),
  requireSignature: process.env.REQUIRE_SIGNATURE !== 'false' &&
    (process.env.DEPLOYMENT_ENV === 'prod' || process.env.REQUIRE_SIGNATURE === 'true'),
};

// Validate production configuration
if (config.environment === 'prod') {
  if (!config.projectId) {
    console.error(JSON.stringify({
      severity: 'CRITICAL',
      type: 'startup_error',
      error: 'GCP_PROJECT_ID is required in production',
    }));
    process.exit(1);
  }

  if (!config.requireSignature) {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      type: 'startup_warning',
      message: 'Signature verification disabled in production',
    }));
  }
}

// =============================================================================
// Service Initialization
// =============================================================================

const logger = createLogger({ env: config.environment });
const secretManager = createSecretManager();
const verifier = new WebhookVerifier(secretManager, logger);
const rateLimiter = getRateLimiter({
  maxTokens: config.rateLimitPerMinute,
  refillRate: config.rateLimitPerMinute / 60,
});

// Initialize Pub/Sub router (lazy for dev environments)
let webhookRouter: WebhookRouter | null = null;

function getWebhookRouter(): WebhookRouter {
  if (!webhookRouter) {
    const pubsub = new PubSub({
      projectId: config.projectId || undefined,
    });
    webhookRouter = new WebhookRouter(pubsub, logger, config.topicPrefix);
  }
  return webhookRouter;
}

// =============================================================================
// Express Application
// =============================================================================

const app = express();

// Security middleware
app.use(helmet());

// Trust proxy for Cloud Run
app.set('trust proxy', true);

// Parse JSON with raw body preservation for signature verification
app.use(express.json({
  limit: '10mb',
  verify: (req: Request & { rawBody?: string }, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));

// =============================================================================
// Health Check Endpoints
// =============================================================================

/**
 * Liveness probe - is the service running?
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'webhook-receiver',
    version: '0.1.0',
    env: config.environment,
    timestamp: Date.now(),
  });
});

/**
 * Readiness probe - is the service ready to receive traffic?
 */
app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    // Check Pub/Sub connection if project ID is set
    if (config.projectId) {
      const router = getWebhookRouter();
      const topicHealth = await router.checkAllTopicsHealth();
      const allHealthy = Object.values(topicHealth).every(Boolean);

      if (!allHealthy) {
        const unhealthyTopics = Object.entries(topicHealth)
          .filter(([, healthy]) => !healthy)
          .map(([source]) => source);

        res.status(503).json({
          status: 'not_ready',
          reason: `Pub/Sub topics not ready: ${unhealthyTopics.join(', ')}`,
          topics: topicHealth,
          timestamp: Date.now(),
        });
        return;
      }
    }

    res.json({
      status: 'ready',
      service: 'webhook-receiver',
      version: '0.1.0',
      env: config.environment,
      projectId: config.projectId || 'not_configured',
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

// =============================================================================
// Webhook Endpoints
// =============================================================================

/**
 * Generic webhook handler factory
 */
function createWebhookHandler(source: WebhookSource) {
  return async (
    req: Request & { rawBody?: string },
    res: Response
  ): Promise<void> => {
    const startTime = Date.now();

    // Extract tenant ID (from header or default)
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    // Extract event metadata from headers
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const eventId = extractEventId(headers, source);
    const eventType = extractEventType(headers, source, req.body);
    const signature = extractSignature(headers, source);

    // Create request logger with context
    const reqLogger = logger.child({
      source,
      eventId,
      eventType,
      tenantId,
    });

    try {
      // Rate limiting
      const limitResult = rateLimiter.check(tenantId, source);
      if (!limitResult.allowed) {
        reqLogger.warn('Rate limit exceeded', {
          remaining: limitResult.remaining,
          resetInMs: limitResult.resetInMs,
        });

        res.status(429).json({
          status: 'rejected',
          error: 'rate_limit_exceeded',
          message: `Rate limit exceeded. Try again in ${Math.ceil(limitResult.resetInMs / 1000)} seconds.`,
          retry_after: Math.ceil(limitResult.resetInMs / 1000),
        } satisfies WebhookResponse);
        return;
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', limitResult.limit);
      res.setHeader('X-RateLimit-Remaining', limitResult.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + limitResult.resetInMs / 1000));

      // Create webhook event
      const event: WebhookEvent = {
        id: eventId,
        source,
        type: eventType,
        timestamp: new Date().toISOString(),
        payload: req.body,
        signature,
        headers: normalizeHeaders(headers),
        tenantId,
      };

      // Verify signature
      if (config.requireSignature) {
        const verifyResult = await verifier.verify(event, tenantId, req.rawBody || '');

        if (!verifyResult.valid) {
          reqLogger.warn('Signature verification failed', {
            error: verifyResult.error,
          });

          res.status(400).json({
            status: 'rejected',
            error: 'invalid_signature',
            message: verifyResult.error || 'HMAC signature verification failed',
          } satisfies WebhookResponse);
          return;
        }
      }

      // Publish to Pub/Sub
      let messageId = 'dry-run';
      if (config.projectId) {
        const router = getWebhookRouter();
        const publishResult = await router.route(event, tenantId);
        messageId = publishResult.messageId;
      } else {
        reqLogger.debug('Dry run mode - not publishing to Pub/Sub');
      }

      // Record metric
      const duration = Date.now() - startTime;
      reqLogger.info('Webhook accepted', {
        messageId,
        durationMs: duration,
      });

      res.status(200).json({
        status: 'accepted',
        event_id: eventId,
        message_id: messageId,
      } satisfies WebhookResponse);
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle rate limit errors
      if (error instanceof RateLimitError) {
        reqLogger.warn('Rate limit error', {
          source: error.source,
          retryAfter: error.retryAfter,
          durationMs: duration,
        });

        res.status(429).json({
          status: 'rejected',
          error: 'rate_limit_exceeded',
          message: error.message,
          retry_after: error.retryAfter,
        } satisfies WebhookResponse);
        return;
      }

      // Log error without leaking details
      reqLogger.error('Webhook processing failed', {
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });

      res.status(500).json({
        status: 'error',
        error: 'internal_error',
        message: 'Webhook processing failed',
      } satisfies WebhookResponse);
    }
  };
}

/**
 * Normalize headers to Record<string, string>
 */
function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  return normalized;
}

// Register webhook endpoints
app.post('/webhooks/github', createWebhookHandler('github'));
app.post('/webhooks/gitlab', createWebhookHandler('gitlab'));
app.post('/webhooks/linear', createWebhookHandler('linear'));
app.post('/webhooks/slack', createWebhookHandler('slack'));

// Generic webhook endpoint (validates source)
app.post('/webhooks/:source', async (req: Request & { rawBody?: string }, res: Response) => {
  const { source } = req.params;

  // Validate source
  const parseResult = WebhookSourceSchema.safeParse(source);
  if (!parseResult.success) {
    res.status(400).json({
      status: 'rejected',
      error: 'invalid_source',
      message: `Unsupported webhook source: ${source}. Valid sources: github, gitlab, linear, slack`,
    } satisfies WebhookResponse);
    return;
  }

  // Delegate to specific handler
  const handler = createWebhookHandler(parseResult.data);
  await handler(req, res);
});

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    error: 'not_found',
    message: 'Endpoint not found',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    status: 'error',
    error: 'internal_error',
    message: 'Internal server error',
  });
});

// =============================================================================
// Server Startup
// =============================================================================

const PORT = config.port;

app.listen(PORT, () => {
  logger.info('Webhook receiver started', {
    port: PORT,
    projectId: config.projectId || 'not_configured',
    requireSignature: config.requireSignature,
    rateLimitPerMinute: config.rateLimitPerMinute,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  rateLimiter.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  rateLimiter.stop();
  process.exit(0);
});

// Export for testing
export { app, config };
