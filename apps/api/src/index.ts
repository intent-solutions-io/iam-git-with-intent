/**
 * Git With Intent - SaaS API Service
 *
 * Multi-tenant API for the Git With Intent platform.
 * Designed to run on Cloud Run with Firebase Auth integration (future).
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /me - Current user info (requires auth)
 * - GET /tenants - List user's tenants
 * - GET /tenants/:tenantId - Get tenant details
 * - GET /tenants/:tenantId/repos - List connected repos
 * - POST /tenants/:tenantId/repos:connect - Connect a repo
 * - GET /tenants/:tenantId/runs - List runs
 * - POST /tenants/:tenantId/runs - Start a new run
 * - GET /tenants/:tenantId/runs/:runId - Get run status
 * - POST /tenants/:tenantId/settings - Update tenant settings
 *
 * @module @gwi/api
 */

import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { createEngine } from '@gwi/engine';
import type { Engine, RunRequest, EngineRunType } from '@gwi/engine';

const app = express();
const PORT = process.env.PORT || 8080;

// =============================================================================
// Configuration
// =============================================================================

const config = {
  appName: process.env.APP_NAME || 'gwi-api',
  appVersion: process.env.APP_VERSION || '0.1.0',
  env: process.env.DEPLOYMENT_ENV || 'dev',
};

// =============================================================================
// Middleware
// =============================================================================

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

/**
 * Request context type
 * TODO: Replace with Firebase Auth context in a later phase
 */
interface RequestContext {
  userId: string;
  tenantId?: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * Extend Express Request type
 */
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

/**
 * Authentication middleware (STUB)
 *
 * TODO: Replace with Firebase Auth verification in a later phase.
 * For now, accepts X-Debug-User header for development.
 */
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // DEVELOPMENT ONLY: Accept debug header
  const debugUser = req.headers['x-debug-user'] as string;
  if (debugUser) {
    req.context = {
      userId: debugUser,
      role: 'owner', // Assume owner for development
    };
    return next();
  }

  // TODO: Verify Firebase Auth token
  // const authHeader = req.headers.authorization;
  // if (!authHeader?.startsWith('Bearer ')) {
  //   return res.status(401).json({ error: 'Missing authorization header' });
  // }
  // const token = authHeader.slice(7);
  // const decoded = await verifyFirebaseToken(token);
  // req.context = { userId: decoded.uid };

  // For now, return 401 if no debug header
  return res.status(401).json({
    error: 'Authentication required',
    hint: 'Set X-Debug-User header for development',
  });
}

/**
 * Tenant authorization middleware
 *
 * Ensures the user has access to the specified tenant.
 * TODO: Implement proper membership checks in a later phase.
 */
function tenantAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { tenantId } = req.params;
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenantId parameter' });
  }

  // TODO: Check user's membership in the tenant
  // For now, assume access is granted
  if (req.context) {
    req.context.tenantId = tenantId;
  }

  next();
}

// =============================================================================
// Engine Instance
// =============================================================================

let engine: Engine | null = null;

async function getEngine(): Promise<Engine> {
  if (!engine) {
    engine = await createEngine({ debug: config.env === 'dev' });
  }
  return engine;
}

// =============================================================================
// Request Schemas
// =============================================================================

const StartRunSchema = z.object({
  repoUrl: z.string().url(),
  runType: z.enum(['TRIAGE', 'PLAN', 'RESOLVE', 'REVIEW', 'AUTOPILOT']),
  prNumber: z.number().optional(),
  issueNumber: z.number().optional(),
  riskMode: z.enum(['comment_only', 'suggest_patch', 'auto_patch', 'auto_push']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateSettingsSchema = z.object({
  defaultRiskMode: z.enum(['comment_only', 'suggest_patch', 'auto_patch', 'auto_push']).optional(),
  defaultTriageModel: z.string().optional(),
  defaultCodeModel: z.string().optional(),
  complexityThreshold: z.number().min(1).max(5).optional(),
  autoRunOnConflict: z.boolean().optional(),
  autoRunOnPrOpen: z.boolean().optional(),
});

const ConnectRepoSchema = z.object({
  repoUrl: z.string().url(),
  displayName: z.string().optional(),
  settings: z.object({
    autoTriage: z.boolean().optional(),
    autoReview: z.boolean().optional(),
    autoResolve: z.boolean().optional(),
  }).optional(),
});

// =============================================================================
// Routes: Health
// =============================================================================

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Routes: User (requires auth)
// =============================================================================

/**
 * GET /me - Get current user info
 */
app.get('/me', authMiddleware, (req, res) => {
  // TODO: Fetch user details from UserStore
  res.json({
    userId: req.context!.userId,
    // TODO: Add email, displayName, memberships
    _stub: true,
    _message: 'User details will be fetched from Firestore in a later phase',
  });
});

// =============================================================================
// Routes: Tenants
// =============================================================================

/**
 * GET /tenants - List user's tenants
 */
app.get('/tenants', authMiddleware, (_req, res) => {
  // TODO: Fetch user's memberships and related tenants
  res.status(501).json({
    error: 'Not implemented',
    message: 'Tenant listing will be implemented with Firestore in a later phase',
  });
});

/**
 * GET /tenants/:tenantId - Get tenant details
 */
app.get('/tenants/:tenantId', authMiddleware, tenantAuthMiddleware, (req, res) => {
  const { tenantId } = req.params;

  // TODO: Fetch tenant from TenantStore
  res.status(501).json({
    error: 'Not implemented',
    tenantId,
    message: 'Tenant details will be fetched from Firestore in a later phase',
  });
});

// =============================================================================
// Routes: Repos
// =============================================================================

/**
 * GET /tenants/:tenantId/repos - List connected repos
 */
app.get('/tenants/:tenantId/repos', authMiddleware, tenantAuthMiddleware, (req, res) => {
  const { tenantId } = req.params;

  // TODO: Fetch repos from TenantStore
  res.status(501).json({
    error: 'Not implemented',
    tenantId,
    message: 'Repo listing will be implemented with Firestore in a later phase',
  });
});

/**
 * POST /tenants/:tenantId/repos:connect - Connect a repo
 */
app.post('/tenants/:tenantId/repos:connect', authMiddleware, tenantAuthMiddleware, (req, res) => {
  const { tenantId } = req.params;

  const parseResult = ConnectRepoSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  // TODO: Add repo to TenantStore
  res.status(501).json({
    error: 'Not implemented',
    tenantId,
    input: parseResult.data,
    message: 'Repo connection will be implemented with Firestore in a later phase',
  });
});

// =============================================================================
// Routes: Runs
// =============================================================================

/**
 * GET /tenants/:tenantId/runs - List runs
 */
app.get('/tenants/:tenantId/runs', authMiddleware, tenantAuthMiddleware, async (req, res) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const eng = await getEngine();
    const runs = await eng.listRuns(tenantId, limit);
    res.json({ runs });
  } catch (error) {
    console.error('Failed to list runs:', error);
    res.status(500).json({
      error: 'Failed to list runs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/runs - Start a new run
 *
 * This is the main entrypoint for starting agent workflows.
 */
app.post('/tenants/:tenantId/runs', authMiddleware, tenantAuthMiddleware, async (req, res) => {
  const { tenantId } = req.params;
  const startTime = Date.now();

  // Validate request body
  const parseResult = StartRunSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const eng = await getEngine();

    // Build RunRequest
    const runRequest: RunRequest = {
      tenantId,
      repoUrl: input.repoUrl,
      runType: input.runType as EngineRunType,
      prNumber: input.prNumber,
      issueNumber: input.issueNumber,
      riskMode: input.riskMode,
      trigger: 'api',
      metadata: {
        ...input.metadata,
        userId: req.context!.userId,
      },
    };

    // Start the run
    const result = await eng.startRun(runRequest);

    console.log(JSON.stringify({
      type: 'run_started',
      tenantId,
      runId: result.runId,
      runType: input.runType,
      repoUrl: input.repoUrl,
      durationMs: Date.now() - startTime,
    }));

    // Return 202 Accepted since run is async
    res.status(202).json(result);
  } catch (error) {
    console.error(JSON.stringify({
      type: 'run_start_failed',
      tenantId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }));

    res.status(500).json({
      error: 'Failed to start run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/runs/:runId - Get run status
 */
app.get('/tenants/:tenantId/runs/:runId', authMiddleware, tenantAuthMiddleware, async (req, res) => {
  const { tenantId, runId } = req.params;

  try {
    const eng = await getEngine();
    const run = await eng.getRun(tenantId, runId);

    if (!run) {
      return res.status(404).json({
        error: 'Run not found',
        runId,
      });
    }

    res.json(run);
  } catch (error) {
    console.error('Failed to get run:', error);
    res.status(500).json({
      error: 'Failed to get run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Settings
// =============================================================================

/**
 * POST /tenants/:tenantId/settings - Update tenant settings
 */
app.post('/tenants/:tenantId/settings', authMiddleware, tenantAuthMiddleware, (req, res) => {
  const { tenantId } = req.params;

  // Check role (only owner/admin can update settings)
  if (req.context?.role && !['owner', 'admin'].includes(req.context.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only owners and admins can update settings',
    });
  }

  const parseResult = UpdateSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  // TODO: Update settings in TenantStore
  res.status(501).json({
    error: 'Not implemented',
    tenantId,
    input: parseResult.data,
    message: 'Settings update will be implemented with Firestore in a later phase',
  });
});

// =============================================================================
// Error Handling
// =============================================================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// =============================================================================
// Server Startup
// =============================================================================

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
