/**
 * Git With Intent - Background Worker Service
 *
 * Phase 16: Durable background job processing with Pub/Sub integration.
 *
 * Features:
 * - Pub/Sub message consumption (push or pull)
 * - Distributed locking for job execution
 * - Idempotent job processing
 * - Checkpoint-based resume/replay
 * - Health checks for Cloud Run
 *
 * @module @gwi/worker
 */

import express from 'express';
import helmet from 'helmet';
import {
  initializeReliabilityStores,
  getDistributedLockManager,
  getDistributedIdempotencyStore,
  getFirestoreCheckpointManager,
  getLogger,
} from '@gwi/core';
import { getIdempotencyService } from '@gwi/engine';
import { WorkerProcessor, type WorkerJob, type JobResult } from './processor.js';
import { createMessageBroker, type MessageBroker, type BrokerMessage } from './pubsub.js';
import { registerHandlers } from './handlers/index.js';

// =============================================================================
// Configuration
// =============================================================================

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  env: process.env.DEPLOYMENT_ENV || 'dev',
  projectId: process.env.GCP_PROJECT_ID || process.env.PROJECT_ID || '',
  subscriptionId: process.env.PUBSUB_SUBSCRIPTION || 'gwi-worker-sub',
  topicId: process.env.PUBSUB_TOPIC || 'gwi-worker-jobs',
  pullMode: process.env.WORKER_PULL_MODE === 'true',
  maxConcurrent: parseInt(process.env.WORKER_MAX_CONCURRENT || '5', 10),
  jobTimeoutMs: parseInt(process.env.WORKER_JOB_TIMEOUT_MS || '300000', 10), // 5 min
  lockTtlMs: parseInt(process.env.WORKER_LOCK_TTL_MS || '60000', 10), // 1 min
};

// =============================================================================
// App Setup
// =============================================================================

const app = express();
const logger = getLogger('worker');

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Initialize reliability stores
initializeReliabilityStores();

// Create worker processor
const processor = new WorkerProcessor({
  lockManager: getDistributedLockManager(),
  idempotencyStore: getDistributedIdempotencyStore(),
  checkpointManager: getFirestoreCheckpointManager(),
  jobTimeoutMs: config.jobTimeoutMs,
  lockTtlMs: config.lockTtlMs,
});

// Phase 17: Register production handlers
registerHandlers(processor);

// Message broker (initialized on startup)
let broker: MessageBroker | null = null;

// =============================================================================
// Health Check Endpoints
// =============================================================================

/**
 * Liveness probe - is the process running?
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'worker',
    version: '0.2.0',
    env: config.env,
    mode: config.pullMode ? 'pull' : 'push',
    timestamp: Date.now(),
  });
});

/**
 * Readiness probe - can we process jobs?
 */
app.get('/ready', async (_req, res) => {
  try {
    // Check if broker is connected
    const brokerReady = broker?.isConnected() ?? false;

    if (!brokerReady && !config.pullMode) {
      // In push mode, we're ready as soon as we're listening
      res.json({
        status: 'ready',
        service: 'worker',
        mode: 'push',
      });
      return;
    }

    res.json({
      status: brokerReady ? 'ready' : 'not_ready',
      service: 'worker',
      mode: config.pullMode ? 'pull' : 'push',
      brokerConnected: brokerReady,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Push Endpoint (for Pub/Sub push subscriptions)
// =============================================================================

/**
 * Pub/Sub push endpoint
 *
 * Receives messages from Pub/Sub push subscriptions.
 * Each message contains a job to process.
 */
app.post('/push', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate Pub/Sub message format
    const pubsubMessage = req.body?.message;
    if (!pubsubMessage) {
      logger.warn('Invalid push message: missing message field');
      return res.status(400).json({ error: 'Invalid message format' });
    }

    // Decode message data
    let jobData: WorkerJob;
    try {
      const decoded = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
      jobData = JSON.parse(decoded);
    } catch {
      logger.warn('Invalid push message: failed to decode data');
      return res.status(400).json({ error: 'Invalid message data' });
    }

    // Add message metadata
    const brokerMessage: BrokerMessage = {
      id: pubsubMessage.messageId || `push-${Date.now()}`,
      data: jobData,
      attributes: pubsubMessage.attributes || {},
      publishTime: pubsubMessage.publishTime ? new Date(pubsubMessage.publishTime) : new Date(),
    };

    // Process the job
    const result = await processor.processJob(brokerMessage);

    logger.info('Push job completed', {
      messageId: brokerMessage.id,
      jobType: jobData.type,
      status: result.status,
      durationMs: Date.now() - startTime,
    });

    // Return success - Pub/Sub will not retry
    return res.status(200).json({
      status: result.status,
      messageId: brokerMessage.id,
      result: result.output,
    });
  } catch (error) {
    logger.error('Push job failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });

    // Return 500 - Pub/Sub will retry based on subscription settings
    return res.status(500).json({
      error: 'Job processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Admin Endpoints
// =============================================================================

/**
 * Get worker stats
 */
app.get('/stats', (_req, res) => {
  const stats = processor.getStats();
  res.json({
    ...stats,
    config: {
      env: config.env,
      mode: config.pullMode ? 'pull' : 'push',
      maxConcurrent: config.maxConcurrent,
      jobTimeoutMs: config.jobTimeoutMs,
    },
  });
});

/**
 * Manually trigger job processing (for testing)
 */
app.post('/process', async (req, res) => {
  if (config.env === 'prod') {
    return res.status(403).json({ error: 'Manual processing disabled in production' });
  }

  const job = req.body as WorkerJob;
  if (!job || !job.type) {
    return res.status(400).json({ error: 'Invalid job format' });
  }

  const brokerMessage: BrokerMessage = {
    id: `manual-${Date.now()}`,
    data: job,
    attributes: {},
    publishTime: new Date(),
  };

  const result = await processor.processJob(brokerMessage);
  return res.json(result);
});

// =============================================================================
// Scheduled Task Endpoints (for Cloud Scheduler)
// =============================================================================

/**
 * POST /tasks/cleanup-idempotency - Clean up expired idempotency records
 *
 * Called by Cloud Scheduler to remove expired idempotency records from Firestore.
 * Runs every hour to keep the collection size manageable.
 *
 * Security: Should be protected by Cloud Scheduler OIDC token validation.
 */
app.post('/tasks/cleanup-idempotency', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate Cloud Scheduler request (optional - for extra security)
    const userAgent = req.headers['user-agent'];
    const isCloudScheduler = userAgent?.includes('Google-Cloud-Scheduler');
    const isLocalDev = config.env === 'dev' || config.env === 'local';

    if (!isCloudScheduler && !isLocalDev) {
      logger.warn('Cleanup endpoint called from non-scheduler source', {
        userAgent,
        env: config.env,
      });
      // Still allow the request but log it
    }

    // Run cleanup in batches
    const idempotencyService = getIdempotencyService();
    let totalDeleted = 0;
    let batchCount = 0;
    const maxBatches = 20; // Limit to prevent runaway cleanup

    // Run multiple batches until no more expired records
    while (batchCount < maxBatches) {
      const deleted = await idempotencyService.cleanup();
      totalDeleted += deleted;
      batchCount++;

      if (deleted < 500) {
        // Last batch was less than full, we're done
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info('Idempotency cleanup completed', {
      totalDeleted,
      batchCount,
      durationMs,
    });

    return res.json({
      status: 'completed',
      totalDeleted,
      batchCount,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('Idempotency cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    return res.status(500).json({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
    });
  }
});

// =============================================================================
// Error Handling
// =============================================================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// =============================================================================
// Startup
// =============================================================================

async function start(): Promise<void> {
  // Create message broker
  broker = createMessageBroker({
    projectId: config.projectId,
    subscriptionId: config.subscriptionId,
    topicId: config.topicId,
    pullMode: config.pullMode,
    maxMessages: config.maxConcurrent,
  });

  // Start pull mode if configured
  if (config.pullMode && broker) {
    await broker.startPulling(async (message) => {
      const result = await processor.processJob(message);
      return result.status === 'completed';
    });
  }

  // Start HTTP server
  app.listen(config.port, () => {
    logger.info('Worker started', {
      port: config.port,
      env: config.env,
      mode: config.pullMode ? 'pull' : 'push',
      projectId: config.projectId || '(not set)',
      subscriptionId: config.subscriptionId,
    });
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');

  if (broker) {
    await broker.stop();
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');

  if (broker) {
    await broker.stop();
  }

  process.exit(0);
});

// Start the worker
start().catch((error) => {
  logger.error('Failed to start worker', { error: error.message });
  process.exit(1);
});

export { app };
