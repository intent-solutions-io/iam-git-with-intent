/**
 * Git With Intent - A2A Gateway
 *
 * R3: Cloud Run as gateway only (proxy to Agent Engine via REST)
 *
 * Phase 11: Added tenant verification for foreman endpoint.
 * Phase 29: Added marketplace registry API for connector hosting.
 *
 * The gateway can now:
 * 1. Route to Vertex AI Agent Engine (production)
 * 2. Call the local engine directly (development/testing)
 * 3. Verify tenant exists before processing runs
 * 4. Serve connector marketplace registry API
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /.well-known/agent.json - AgentCard discovery
 * - POST /a2a/:agent - Route to specific agent (Vertex AI)
 * - POST /a2a/foreman - Main foreman endpoint (uses local engine in dev)
 * - POST /api/workflows - Start workflow via orchestrator
 * - GET /v1/search - Search connectors (marketplace)
 * - GET /v1/connectors/:id - Get connector info (marketplace)
 * - GET /v1/connectors/:id/:version - Get version metadata (marketplace)
 * - GET /v1/connectors/:id/:version/tarball - Download tarball (marketplace)
 * - GET /v1/connectors/:id/:version/signature - Download signature (marketplace)
 * - POST /v1/connectors - Publish connector metadata (marketplace, authenticated)
 * - POST /v1/publish - Full publish with tarball upload (marketplace, authenticated)
 * - POST /v1/connectors/:id/:version/deprecate - Deprecate version (marketplace)
 * - POST /v1/connectors/:id/:version/download - Track download (marketplace)
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { createEngine, idempotencyMiddleware, getIdempotencyMetrics } from '@gwi/engine';
import type { Engine, RunRequest, EngineRunType } from '@gwi/engine';
import { getTenantStore, checkConcurrencyLimit, type PlanId, generateTraceId } from '@gwi/core';
import { marketplaceRouter } from './marketplace-routes.js';
import { onboardingRouter } from './onboarding-routes.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

app.use(express.json({ limit: '1mb' }));

// A7: Request logging middleware with trace ID correlation
app.use((req, res, next) => {
  const startTime = Date.now();

  // Extract or generate trace ID
  const traceparent = req.headers['traceparent'] as string | undefined;
  let traceId: string;
  if (traceparent) {
    const parts = traceparent.split('-');
    traceId = parts.length >= 2 && parts[1].length === 32 ? parts[1] : generateTraceId();
  } else {
    traceId = generateTraceId();
  }

  const requestId = (req.headers['x-request-id'] as string)
    || `req-${startTime}-${Math.random().toString(36).slice(2, 8)}`;

  // Add trace headers to response
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Trace-ID', traceId);

  // Store on request for downstream use
  (req as typeof req & { traceId?: string; requestId?: string }).traceId = traceId;
  (req as typeof req & { traceId?: string; requestId?: string }).requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const path = req.route?.path || req.path;
    const projectId = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;

    console.log(JSON.stringify({
      severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
      type: 'http_request',
      message: `${req.method} ${path} ${res.statusCode} ${duration}ms`,
      ...(projectId && { 'logging.googleapis.com/trace': `projects/${projectId}/traces/${traceId}` }),
      'logging.googleapis.com/spanId': requestId.slice(0, 16),
      requestId,
      traceId,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      service: 'gateway',
      timestamp: new Date().toISOString(),
    }));
  });

  next();
});

// Mount marketplace routes (Phase 29: Connector Marketplace)
app.use(marketplaceRouter);

// Mount onboarding routes (Phase 33: Customer Onboarding)
app.use(onboardingRouter);

// Environment
const config = {
  projectId: process.env.PROJECT_ID || '',
  location: process.env.LOCATION || 'us-central1',
  orchestratorEngineId: process.env.ORCHESTRATOR_ENGINE_ID || '',
  triageEngineId: process.env.TRIAGE_ENGINE_ID || '',
  resolverEngineId: process.env.RESOLVER_ENGINE_ID || '',
  reviewerEngineId: process.env.REVIEWER_ENGINE_ID || '',
  appName: process.env.APP_NAME || 'git-with-intent',
  appVersion: process.env.APP_VERSION || '0.1.0',
  spiffeId: process.env.AGENT_SPIFFE_ID || 'spiffe://intent.solutions/agent/gwi',
  env: process.env.DEPLOYMENT_ENV || 'dev',
};

// A2A Message schema
const A2AMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum(['task', 'response', 'heartbeat', 'error']),
  payload: z.record(z.unknown()),
  timestamp: z.number(),
  correlationId: z.string().optional(),
});

type A2AMessage = z.infer<typeof A2AMessageSchema>;

// Agent engine mapping
const agentEngines: Record<string, string> = {
  orchestrator: config.orchestratorEngineId,
  triage: config.triageEngineId,
  resolver: config.resolverEngineId,
  reviewer: config.reviewerEngineId,
};

// =============================================================================
// Local Engine (for development/testing)
// =============================================================================

let localEngine: Engine | null = null;

async function getLocalEngine(): Promise<Engine> {
  if (!localEngine) {
    localEngine = await createEngine({ debug: config.env === 'dev' });
  }
  return localEngine;
}

/**
 * Check if we should use local engine (no Agent Engine IDs configured)
 */
function shouldUseLocalEngine(): boolean {
  return !config.orchestratorEngineId || config.orchestratorEngineId === '';
}

// =============================================================================
// Foreman Request Schema (A2A-style)
// =============================================================================

const ForemanRequestSchema = z.object({
  tenantId: z.string(),
  runId: z.string().optional(),
  runType: z.enum(['TRIAGE', 'PLAN', 'RESOLVE', 'REVIEW', 'AUTOPILOT']),
  repoUrl: z.string().url(),
  prNumber: z.number().optional(),
  issueNumber: z.number().optional(),
  trigger: z.enum(['webhook', 'api', 'cli', 'scheduled']).default('api'),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Health check endpoint (liveness probe)
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    timestamp: Date.now(),
  });
});

/**
 * Startup/readiness probe endpoint
 * Cloud Run startup probe checks this to determine when the service is ready.
 */
app.get('/health/ready', (_req, res) => {
  // Gateway is ready when agent engines are configured
  const hasEngines = Object.keys(agentEngines).length > 0;

  if (hasEngines) {
    res.json({
      status: 'ready',
      app: config.appName,
      version: config.appVersion,
      agents: Object.keys(agentEngines),
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      reason: 'No agent engines configured',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /metrics - Idempotency and gateway metrics
 */
app.get('/metrics', (_req, res) => {
  const idempotencyMetrics = getIdempotencyMetrics().getMetrics();
  const duplicateRate = idempotencyMetrics.checksTotal > 0
    ? (idempotencyMetrics.duplicatesSkipped / idempotencyMetrics.checksTotal * 100).toFixed(2)
    : '0.00';

  res.json({
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    idempotency: {
      checksTotal: idempotencyMetrics.checksTotal,
      newRequests: idempotencyMetrics.newRequests,
      duplicatesSkipped: idempotencyMetrics.duplicatesSkipped,
      duplicateRate: `${duplicateRate}%`,
      processingConflicts: idempotencyMetrics.processingConflicts,
      completedTotal: idempotencyMetrics.completedTotal,
      failedTotal: idempotencyMetrics.failedTotal,
      bySource: idempotencyMetrics.bySource,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics/prometheus - Prometheus-format metrics
 */
app.get('/metrics/prometheus', (_req, res) => {
  const collector = getIdempotencyMetrics();
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(collector.toPrometheusFormat());
});

/**
 * Agent card discovery endpoint (A2A protocol)
 */
app.get('/.well-known/agent.json', (_req, res) => {
  res.json({
    id: config.spiffeId,
    name: 'Git With Intent Gateway',
    description: 'A2A Gateway for AI-powered git workflow automation',
    version: config.appVersion,
    capabilities: [
      'pr-resolution',
      'issue-to-code',
      'code-review',
      'conflict-analysis',
    ],
    endpoints: {
      a2a: '/a2a',
      health: '/health',
      workflows: '/api/workflows',
      marketplace: '/v1',
      onboarding: '/v1/onboarding',
    },
    agents: Object.keys(agentEngines).map(name => ({
      name,
      spiffeId: `${config.spiffeId}/${name}`,
      endpoint: `/a2a/${name}`,
    })),
    metadata: {
      owner: 'Intent Solutions',
      contact: 'jeremy@intentsolutions.io',
      repository: 'https://github.com/intent-solutions-io/git-with-intent',
    },
  });
});

/**
 * POST /a2a/foreman - Main foreman endpoint
 *
 * This is the primary A2A entrypoint for starting runs.
 * In development (no Agent Engine IDs), uses local engine.
 * In production, routes to Vertex AI Agent Engine.
 *
 * Phase 11: Verifies tenant exists and is active before processing.
 * A5: Added idempotency middleware for duplicate request prevention.
 */
app.post('/a2a/foreman', idempotencyMiddleware({
  // Idempotency key is optional for this endpoint but recommended
  required: false,
  getTenantId: (req) => (req.body as { tenantId?: string }).tenantId || 'default',
}), async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate request
    const parseResult = ForemanRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid foreman request',
        details: parseResult.error.errors,
      });
    }

    const input = parseResult.data;

    // Phase 11: Verify tenant exists and is active
    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(input.tenantId);

    if (!tenant) {
      console.log(JSON.stringify({
        type: 'foreman_rejected',
        reason: 'TENANT_NOT_FOUND',
        tenantId: input.tenantId,
        durationMs: Date.now() - startTime,
      }));
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId: input.tenantId,
      });
    }

    if (tenant.status !== 'active') {
      // Phase A6: Differentiate between paused (temporary) and suspended/deactivated
      if (tenant.status === 'paused') {
        console.log(JSON.stringify({
          type: 'foreman_rejected',
          reason: 'TENANT_PAUSED',
          tenantId: input.tenantId,
          status: tenant.status,
          durationMs: Date.now() - startTime,
        }));
        return res.status(503).json({
          error: 'Tenant is temporarily paused',
          tenantId: input.tenantId,
          status: tenant.status,
          message: 'Run processing is temporarily suspended. Try again later.',
          retryAfter: 60,
        });
      }

      console.log(JSON.stringify({
        type: 'foreman_rejected',
        reason: 'TENANT_SUSPENDED',
        tenantId: input.tenantId,
        status: tenant.status,
        durationMs: Date.now() - startTime,
      }));
      return res.status(403).json({
        error: 'Tenant is not active',
        tenantId: input.tenantId,
        status: tenant.status,
      });
    }

    // Phase A6: Check concurrency limit
    const planId = (tenant.plan || 'free') as PlanId;
    const inFlightRuns = await tenantStore.countInFlightRuns(input.tenantId);
    const concurrencyCheck = checkConcurrencyLimit(inFlightRuns, planId);

    if (!concurrencyCheck.allowed) {
      console.log(JSON.stringify({
        type: 'foreman_rejected',
        reason: 'PLAN_LIMIT_CONCURRENCY',
        tenantId: input.tenantId,
        plan: planId,
        inFlightRuns,
        limit: concurrencyCheck.limit,
        durationMs: Date.now() - startTime,
      }));
      return res.status(429).json({
        error: 'Concurrency limit exceeded',
        reason: concurrencyCheck.reason,
        currentUsage: concurrencyCheck.currentUsage,
        limit: concurrencyCheck.limit,
        plan: planId,
        retryAfter: 30,
      });
    }

    // Decide whether to use local engine or Agent Engine
    if (shouldUseLocalEngine()) {
      // Use local engine (development mode)
      const engine = await getLocalEngine();

      const runRequest: RunRequest = {
        tenantId: input.tenantId,
        repoUrl: input.repoUrl,
        runType: input.runType as EngineRunType,
        prNumber: input.prNumber,
        issueNumber: input.issueNumber,
        trigger: input.trigger,
        metadata: input.metadata,
      };

      const result = await engine.startRun(runRequest);

      console.log(JSON.stringify({
        type: 'foreman_local',
        tenantId: input.tenantId,
        runId: result.runId,
        runType: input.runType,
        durationMs: Date.now() - startTime,
      }));

      return res.json({
        runId: result.runId,
        status: result.status,
        message: 'Run started via local engine (development mode)',
        mode: 'local',
      });
    }

    // Production mode: Route to Agent Engine
    const message: A2AMessage = {
      id: `foreman-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: config.spiffeId,
      to: `${config.spiffeId}/orchestrator`,
      type: 'task',
      payload: {
        taskType: 'run',
        ...input,
      },
      timestamp: Date.now(),
    };

    const response = await proxyToAgentEngine(
      'orchestrator',
      config.orchestratorEngineId,
      message
    );

    console.log(JSON.stringify({
      type: 'foreman_agent_engine',
      tenantId: input.tenantId,
      messageId: message.id,
      durationMs: Date.now() - startTime,
    }));

    return res.json({
      ...response as object,
      mode: 'agent-engine',
    });
  } catch (error) {
    console.error(JSON.stringify({
      type: 'foreman_error',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    return res.status(500).json({
      error: 'Foreman execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * A2A message endpoint - routes to appropriate agent
 */
app.post('/a2a/:agent', async (req, res) => {
  const { agent } = req.params;
  const startTime = Date.now();

  try {
    // Validate agent exists
    const engineId = agentEngines[agent];
    if (!engineId) {
      return res.status(404).json({
        error: 'Agent not found',
        agent,
        availableAgents: Object.keys(agentEngines),
      });
    }

    // Validate message
    const parseResult = A2AMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid A2A message',
        details: parseResult.error.errors,
      });
    }

    const message = parseResult.data;

    // R3: Proxy to Agent Engine (no agent logic here)
    const response = await proxyToAgentEngine(agent, engineId, message);

    // Audit log
    console.log(JSON.stringify({
      type: 'a2a_request',
      agent,
      messageId: message.id,
      messageType: message.type,
      from: message.from,
      durationMs: Date.now() - startTime,
      status: 'success',
    }));

    return res.json(response);
  } catch (error) {
    console.error(JSON.stringify({
      type: 'a2a_error',
      agent,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    return res.status(500).json({
      error: 'Agent execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Workflow endpoint - start a new workflow via orchestrator
 *
 * A5: Added idempotency middleware for duplicate request prevention.
 */
app.post('/api/workflows', idempotencyMiddleware({
  required: false,
  getTenantId: (req) => (req.body as { input?: { tenantId?: string } }).input?.tenantId || 'default',
}), async (req, res) => {
  const startTime = Date.now();

  try {
    const { type, input } = req.body;

    if (!type || !input) {
      return res.status(400).json({
        error: 'Missing required fields: type, input',
      });
    }

    // Create A2A message for orchestrator
    const message: A2AMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: config.spiffeId,
      to: `${config.spiffeId}/orchestrator`,
      type: 'task',
      payload: {
        taskType: 'workflow',
        workflowType: type,
        input,
      },
      timestamp: Date.now(),
    };

    // Route to orchestrator
    const response = await proxyToAgentEngine(
      'orchestrator',
      config.orchestratorEngineId,
      message
    );

    console.log(JSON.stringify({
      type: 'workflow_start',
      workflowType: type,
      messageId: message.id,
      durationMs: Date.now() - startTime,
    }));

    return res.json(response);
  } catch (error) {
    console.error(JSON.stringify({
      type: 'workflow_error',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    return res.status(500).json({
      error: 'Workflow start failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Proxy request to Vertex AI Agent Engine
 * R3: Gateway is pure proxy - no agent logic
 */
async function proxyToAgentEngine(
  agent: string,
  engineId: string,
  message: A2AMessage
): Promise<unknown> {
  // Build Agent Engine URL
  const url = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/reasoningEngines/${engineId}:query`;

  // Get access token
  const accessToken = await getAccessToken();

  // Make request to Agent Engine
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        message,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Agent Engine error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Build A2A response
  return {
    id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: `${config.spiffeId}/${agent}`,
    to: message.from,
    type: 'response',
    payload: result,
    timestamp: Date.now(),
    correlationId: message.id,
  };
}

/**
 * Get access token for GCP (uses Application Default Credentials)
 */
async function getAccessToken(): Promise<string> {
  // In Cloud Run, ADC is automatically available
  const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

  const response = await fetch(metadataUrl, {
    headers: {
      'Metadata-Flavor': 'Google',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(JSON.stringify({
    type: 'startup',
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

export { app };
