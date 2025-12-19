/**
 * Git With Intent - SaaS API Service
 *
 * Multi-tenant API for the Git With Intent platform.
 * Designed to run on Cloud Run with Firebase Auth integration.
 *
 * Phase 11: Production-ready with RBAC and plan enforcement.
 * Set GWI_STORE_BACKEND=firestore and GCP_PROJECT_ID to enable Firestore.
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /me - Current user info (requires auth)
 * - GET /tenants - List user's tenants
 * - GET /tenants/:tenantId - Get tenant details
 * - GET /tenants/:tenantId/repos - List connected repos
 * - POST /tenants/:tenantId/repos:connect - Connect a repo (ADMIN+)
 * - GET /tenants/:tenantId/runs - List runs (VIEWER+)
 * - POST /tenants/:tenantId/runs - Start a new run (DEVELOPER+)
 * - GET /tenants/:tenantId/runs/:runId - Get run status (VIEWER+)
 * - POST /tenants/:tenantId/settings - Update tenant settings (ADMIN+)
 *
 * @module @gwi/api
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { createEngine, idempotencyMiddleware, requireIdempotency, getIdempotencyMetrics } from '@gwi/engine';
import type { Engine, RunRequest, EngineRunType } from '@gwi/engine';
import {
  getTenantStore,
  getStoreBackend,
  getMembershipStore,
  getUserStore,
  getApprovalStore,
  getAuditStore,
  type TenantStore,
  type TenantRole,
  type ApprovalDecision,
  type AuditEventType,
  // Security utilities
  canPerform,
  checkRunLimit,
  checkRepoLimit,
  checkMemberLimit,
  checkConcurrencyLimit,
  type Role,
  // A7: Telemetry
  createContextFromRequest,
  runWithContextAsync,
  type TelemetryContext,
  generateTraceId,
  type Action,
  type PlanId,
} from '@gwi/core';

const app = express();
const PORT = process.env.PORT || 8080;

// =============================================================================
// Configuration
// =============================================================================

const config = {
  appName: process.env.APP_NAME || 'gwi-api',
  appVersion: process.env.APP_VERSION || '0.1.0',
  env: process.env.DEPLOYMENT_ENV || 'dev',
  storeBackend: getStoreBackend(),
};

// =============================================================================
// Environment Validation
// =============================================================================

/**
 * Validates required environment variables based on deployment environment.
 * Production requires strict configuration; dev allows more flexibility.
 */
function validateEnvironment(): void {
  const isProd = config.env === 'prod';
  const errors: string[] = [];
  const warnings: string[] = [];

  // Production requirements
  if (isProd) {
    if (config.storeBackend !== 'firestore') {
      errors.push('GWI_STORE_BACKEND must be "firestore" in production');
    }
    if (!process.env.GCP_PROJECT_ID) {
      errors.push('GCP_PROJECT_ID is required in production');
    }
    if (!process.env.CORS_ALLOWED_ORIGINS) {
      warnings.push('CORS_ALLOWED_ORIGINS not set - using restrictive defaults');
    }
  }

  // Log warnings
  for (const warning of warnings) {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      type: 'env_validation',
      message: warning,
      env: config.env,
    }));
  }

  // Fail on errors
  if (errors.length > 0) {
    console.error(JSON.stringify({
      severity: 'CRITICAL',
      type: 'env_validation_failed',
      errors,
      env: config.env,
    }));
    process.exit(1);
  }
}

validateEnvironment();

// =============================================================================
// Middleware
// =============================================================================

// Security middleware
app.use(helmet());

// CORS configuration - allow configured origins
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173']; // Dev defaults

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Debug-User'],
}));

app.use(express.json({ limit: '1mb' }));

// =============================================================================
// Rate Limiting (P3: Production Security)
// =============================================================================

/**
 * Simple in-memory rate limiter using token bucket algorithm.
 * For production scale, consider Redis-based rate limiting.
 */
interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  // Global limits (per IP)
  global: {
    maxTokens: 100,        // Max burst
    refillRate: 10,        // Tokens per second
    refillInterval: 1000,  // Refill every second
  },
  // Authenticated user limits (more generous)
  authenticated: {
    maxTokens: 200,
    refillRate: 20,
    refillInterval: 1000,
  },
  // Strict limits for expensive operations
  expensive: {
    maxTokens: 10,
    refillRate: 1,
    refillInterval: 1000,
  },
};

/**
 * Get rate limit key for request
 */
function getRateLimitKey(req: express.Request, prefix: string = 'global'): string {
  const userId = req.context?.userId;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`;
}

/**
 * Check and consume rate limit token
 */
function checkRateLimit(key: string, config: typeof RATE_LIMIT_CONFIG.global): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry) {
    entry = { tokens: config.maxTokens, lastRefill: now };
    rateLimitStore.set(key, entry);
  }

  // Refill tokens based on time elapsed
  const elapsed = now - entry.lastRefill;
  const tokensToAdd = Math.floor(elapsed / config.refillInterval) * config.refillRate;

  if (tokensToAdd > 0) {
    entry.tokens = Math.min(config.maxTokens, entry.tokens + tokensToAdd);
    entry.lastRefill = now;
  }

  // Check if we have tokens
  if (entry.tokens > 0) {
    entry.tokens--;
    return { allowed: true, remaining: entry.tokens };
  }

  // Calculate retry-after
  const retryAfter = Math.ceil((config.refillInterval - (now - entry.lastRefill)) / 1000);
  return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
}

/**
 * Rate limiting middleware
 */
function rateLimitMiddleware(configType: 'global' | 'authenticated' | 'expensive' = 'global') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/metrics') {
      return next();
    }

    const config = RATE_LIMIT_CONFIG[configType];
    const key = getRateLimitKey(req, configType);
    const result = checkRateLimit(key, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxTokens);
    res.setHeader('X-RateLimit-Remaining', result.remaining);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 1);
      console.log(JSON.stringify({
        severity: 'WARNING',
        type: 'rate_limit_exceeded',
        key,
        configType,
        retryAfter: result.retryAfter,
        timestamp: new Date().toISOString(),
      }));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please slow down.',
        retryAfter: result.retryAfter,
      });
    }

    next();
  };
}

// Apply global rate limiting to all requests
app.use(rateLimitMiddleware('global'));

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.lastRefill > staleThreshold) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// =============================================================================
// Phase 11: Observability - Request Logging and Metrics
// =============================================================================

// Simple metrics counters (in production, use OpenTelemetry/Prometheus)
const metrics = {
  requestsTotal: 0,
  requestsByPath: new Map<string, number>(),
  requestsByStatus: new Map<number, number>(),
  errorsTotal: 0,
  latencySum: 0,
  startTime: Date.now(),
};

/**
 * Request logging middleware
 * Produces structured JSON logs for Cloud Logging
 * Phase A7: Enhanced with trace ID correlation
 */
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const startTime = Date.now();

  // A7: Extract or generate trace ID from W3C traceparent header
  const traceparent = req.headers['traceparent'] as string | undefined;
  let traceId: string;
  if (traceparent) {
    const parts = traceparent.split('-');
    traceId = parts.length >= 2 && parts[1].length === 32 ? parts[1] : generateTraceId();
  } else {
    traceId = generateTraceId();
  }

  const requestId = req.headers['x-request-id'] as string
    || `req-${startTime}-${Math.random().toString(36).slice(2, 8)}`;

  // Add trace headers to response
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Trace-ID', traceId);

  // Store trace context on request for downstream use
  (req as Express.Request & { traceId?: string }).traceId = traceId;

  // Log request
  const logRequest = () => {
    const duration = Date.now() - startTime;
    const path = req.route?.path || req.path;

    // Update metrics
    metrics.requestsTotal++;
    metrics.latencySum += duration;
    metrics.requestsByPath.set(path, (metrics.requestsByPath.get(path) || 0) + 1);
    metrics.requestsByStatus.set(res.statusCode, (metrics.requestsByStatus.get(res.statusCode) || 0) + 1);

    if (res.statusCode >= 500) {
      metrics.errorsTotal++;
    }

    // A7: Structured log for Cloud Logging with trace correlation
    const projectId = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;
    console.log(JSON.stringify({
      severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
      type: 'http_request',
      message: `${req.method} ${path} ${res.statusCode} ${duration}ms`,
      // Cloud Logging trace correlation
      ...(projectId && { 'logging.googleapis.com/trace': `projects/${projectId}/traces/${traceId}` }),
      'logging.googleapis.com/spanId': requestId.slice(0, 16),
      // Request fields
      requestId,
      traceId,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      // Context fields
      tenantId: req.context?.tenantId,
      userId: req.context?.userId,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    }));
  };

  res.on('finish', logRequest);
  next();
});

/**
 * Request context type (Phase 11: Full RBAC support)
 */
interface RequestContext {
  userId: string;
  email?: string;
  tenantId?: string;
  /** User's role in the current tenant (lowercase to match Firestore) */
  tenantRole?: TenantRole;
  /** Security role (uppercase for permission checks) */
  role?: Role;
  isServiceAccount: boolean;
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
 * Map TenantRole (lowercase) to Role (uppercase) for permission checks
 */
function mapTenantRoleToRole(tenantRole: TenantRole): Role {
  switch (tenantRole) {
    case 'owner': return 'OWNER';
    case 'admin': return 'ADMIN';
    case 'member': return 'DEVELOPER'; // 'member' maps to DEVELOPER level
    default: return 'VIEWER';
  }
}

/**
 * Authentication middleware
 *
 * In production: Verifies Firebase Auth token.
 * In development: Accepts X-Debug-User header.
 * Service accounts: Identified by email pattern.
 */
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Check for service account (Cloud Run internal calls)
  const serviceAccountHeader = req.headers['x-service-account'] as string;
  if (serviceAccountHeader && process.env.NODE_ENV !== 'production') {
    req.context = {
      userId: serviceAccountHeader,
      isServiceAccount: true,
    };
    return next();
  }

  // DEVELOPMENT ONLY: Accept debug header
  const debugUser = req.headers['x-debug-user'] as string;
  const debugRole = (req.headers['x-debug-role'] as string) || 'owner';
  if (debugUser && process.env.NODE_ENV !== 'production') {
    req.context = {
      userId: debugUser,
      tenantRole: debugRole as TenantRole,
      role: mapTenantRoleToRole(debugRole as TenantRole),
      isServiceAccount: false,
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
  // req.context = { userId: decoded.uid, isServiceAccount: false };

  // For now, return 401 if no debug header
  return res.status(401).json({
    error: 'Authentication required',
    hint: 'Set X-Debug-User header for development',
  });
}

/**
 * Tenant authorization middleware (Phase 11: RBAC)
 *
 * Ensures the user has access to the specified tenant by checking membership.
 * Sets the user's role in the request context.
 */
async function tenantAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { tenantId } = req.params;
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenantId parameter' });
  }

  if (!req.context) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Service accounts have full access
  if (req.context.isServiceAccount) {
    req.context.tenantId = tenantId;
    req.context.role = 'OWNER'; // Service accounts have full permissions
    return next();
  }

  try {
    // Check user's membership in the tenant
    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context.userId, tenantId);

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this tenant',
      });
    }

    if (membership.status !== 'active') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Your membership is ${membership.status}`,
      });
    }

    // Set tenant context with role
    req.context.tenantId = tenantId;
    req.context.tenantRole = membership.role;
    req.context.role = mapTenantRoleToRole(membership.role);

    next();
  } catch (error) {
    console.error('Membership check failed:', error);
    res.status(500).json({
      error: 'Failed to verify tenant access',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Permission middleware factory
 *
 * Creates middleware that checks if the user can perform a specific action.
 */
function requirePermission(action: Action) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.context?.role) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No role assigned',
      });
    }

    if (!canPerform(req.context.role, action)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions for action: ${action}`,
        requiredAction: action,
        userRole: req.context.role,
      });
    }

    next();
  };
}

// =============================================================================
// Engine and Store Instances
// =============================================================================

let engine: Engine | null = null;
let tenantStore: TenantStore | null = null;

async function getEngine(): Promise<Engine> {
  if (!engine) {
    engine = await createEngine({ debug: config.env === 'dev' });
  }
  return engine;
}

function getStore(): TenantStore {
  if (!tenantStore) {
    tenantStore = getTenantStore();
  }
  return tenantStore;
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

// Phase 12: Signup and Onboarding Schemas
const SignupSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  githubLogin: z.string().min(1).max(39).optional(),
  githubUserId: z.number().optional(),
  githubAvatarUrl: z.string().url().optional(),
});

// GitHub App callback config
const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || 'git-with-intent';
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:5173';

const CreateTenantSchema = z.object({
  displayName: z.string().min(1).max(100),
  githubOrgLogin: z.string().min(1).max(39).optional(),
  githubOrgId: z.number().optional(),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

const _AcceptInviteSchema = z.object({
  inviteToken: z.string().min(1),
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
    storeBackend: config.storeBackend,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics - Basic metrics endpoint (Phase 11: Observability)
 *
 * Returns simple metrics for monitoring. In production, consider using
 * OpenTelemetry with Prometheus exporter for proper metrics collection.
 */
app.get('/metrics', (_req, res) => {
  const uptime = Date.now() - metrics.startTime;
  const avgLatency = metrics.requestsTotal > 0
    ? metrics.latencySum / metrics.requestsTotal
    : 0;

  // Convert Maps to objects for JSON serialization
  const requestsByPath: Record<string, number> = {};
  metrics.requestsByPath.forEach((count, path) => {
    requestsByPath[path] = count;
  });

  const requestsByStatus: Record<string, number> = {};
  metrics.requestsByStatus.forEach((count, status) => {
    requestsByStatus[status.toString()] = count;
  });

  // Get idempotency metrics
  const idempotencyMetrics = getIdempotencyMetrics().getMetrics();
  const duplicateRate = idempotencyMetrics.checksTotal > 0
    ? (idempotencyMetrics.duplicatesSkipped / idempotencyMetrics.checksTotal * 100).toFixed(2)
    : '0.00';

  res.json({
    app: config.appName,
    version: config.appVersion,
    env: config.env,
    uptimeMs: uptime,
    uptimeHuman: `${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m`,
    requests: {
      total: metrics.requestsTotal,
      byPath: requestsByPath,
      byStatus: requestsByStatus,
    },
    errors: {
      total: metrics.errorsTotal,
      rate: metrics.requestsTotal > 0
        ? (metrics.errorsTotal / metrics.requestsTotal * 100).toFixed(2) + '%'
        : '0%',
    },
    latency: {
      avgMs: Math.round(avgLatency),
      totalMs: metrics.latencySum,
    },
    idempotency: {
      checksTotal: idempotencyMetrics.checksTotal,
      newRequests: idempotencyMetrics.newRequests,
      duplicatesSkipped: idempotencyMetrics.duplicatesSkipped,
      duplicateRate: `${duplicateRate}%`,
      processingConflicts: idempotencyMetrics.processingConflicts,
      lockRecoveries: idempotencyMetrics.lockRecoveries,
      completedTotal: idempotencyMetrics.completedTotal,
      failedTotal: idempotencyMetrics.failedTotal,
      ttlCleanups: idempotencyMetrics.ttlCleanups,
      bySource: idempotencyMetrics.bySource,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics/prometheus - Prometheus-format metrics
 *
 * Returns metrics in Prometheus text format for scraping.
 */
app.get('/metrics/prometheus', (_req, res) => {
  const idempotencyCollector = getIdempotencyMetrics();

  // Add app-level metrics
  const lines: string[] = [];
  const labels = `app="${config.appName}",env="${config.env}"`;

  // Request metrics
  lines.push(`# HELP gwi_requests_total Total HTTP requests`);
  lines.push(`# TYPE gwi_requests_total counter`);
  lines.push(`gwi_requests_total{${labels}} ${metrics.requestsTotal}`);

  lines.push(`# HELP gwi_errors_total Total HTTP errors`);
  lines.push(`# TYPE gwi_errors_total counter`);
  lines.push(`gwi_errors_total{${labels}} ${metrics.errorsTotal}`);

  lines.push(`# HELP gwi_latency_sum_ms Total latency in milliseconds`);
  lines.push(`# TYPE gwi_latency_sum_ms counter`);
  lines.push(`gwi_latency_sum_ms{${labels}} ${metrics.latencySum}`);

  // Idempotency metrics
  lines.push(idempotencyCollector.toPrometheusFormat());

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines.join('\n'));
});

// =============================================================================
// Routes: User (requires auth)
// =============================================================================

/**
 * GET /me - Get current user info
 */
app.get('/me', authMiddleware, async (req, res) => {
  try {
    const userStore = getUserStore();
    const user = await userStore.getUser(req.context!.userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        userId: req.context!.userId,
      });
    }

    // Get user's memberships
    const membershipStore = getMembershipStore();
    const memberships = await membershipStore.listUserMemberships(req.context!.userId);

    res.json({
      user,
      memberships,
    });
  } catch (error) {
    console.error('Failed to get user:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Signup and Onboarding (Phase 12)
// =============================================================================

/**
 * POST /signup - Create a new user account
 *
 * Phase 12: Self-serve signup flow
 * Creates a user profile and optionally a personal tenant.
 */
app.post('/signup', rateLimitMiddleware('expensive'), async (req, res) => {
  const parseResult = SignupSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const userStore = getUserStore();

    // Check if user already exists by email
    const existingUser = await userStore.getUserByEmail(input.email);
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists',
        userId: existingUser.id,
      });
    }

    // Generate user ID (in production, this would come from Firebase Auth)
    const userId = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Create user
    const user = await userStore.createUser({
      id: userId,
      email: input.email,
      displayName: input.displayName,
      githubUserId: input.githubUserId || 0,
      githubLogin: input.githubLogin || input.email.split('@')[0],
      githubAvatarUrl: input.githubAvatarUrl,
      preferences: {
        notificationsEnabled: true,
        theme: 'system',
      },
      lastLoginAt: new Date(),
    });

    console.log(JSON.stringify({
      type: 'user_created',
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json({
      user,
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Signup failed:', error);
    res.status(500).json({
      error: 'Signup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /github/callback - GitHub App installation callback
 *
 * Phase 12: Redirect users after GitHub App installation.
 * GitHub redirects here after the user installs the app.
 */
app.get('/github/callback', async (req, res) => {
  const installationId = req.query.installation_id as string;
  const setupAction = req.query.setup_action as string;

  console.log(JSON.stringify({
    type: 'github_callback',
    installationId,
    setupAction,
    timestamp: new Date().toISOString(),
  }));

  if (!installationId) {
    // User cancelled or error - redirect to onboarding
    return res.redirect(`${WEB_APP_URL}/onboarding?error=github_cancelled`);
  }

  // For 'install' action, the webhook handler will create the tenant
  // We redirect to dashboard - the user can find their org there
  if (setupAction === 'install') {
    res.redirect(`${WEB_APP_URL}/dashboard?github_connected=true&installation_id=${installationId}`);
  } else if (setupAction === 'update') {
    // Permissions update - just redirect back
    res.redirect(`${WEB_APP_URL}/dashboard?github_updated=true`);
  } else {
    // Default redirect
    res.redirect(`${WEB_APP_URL}/dashboard`);
  }
});

/**
 * GET /github/install - Redirect to GitHub App installation
 *
 * Phase 12: Start GitHub App installation flow.
 */
app.get('/github/install', (_req, res) => {
  const installUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;
  res.redirect(installUrl);
});

/**
 * POST /tenants - Create a new tenant (org/workspace)
 *
 * Phase 12: Self-serve tenant creation
 * Creates a tenant and assigns the current user as owner.
 */
app.post('/tenants', authMiddleware, idempotencyMiddleware({
  getTenantId: (req) => req.context?.userId || 'default',
}), async (req, res) => {
  const parseResult = CreateTenantSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const store = getStore();
    const membershipStore = getMembershipStore();

    // Generate tenant ID
    const tenantId = input.githubOrgId
      ? `gh-org-${input.githubOrgId}`
      : `tenant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Create tenant with default free plan
    const tenant = await store.createTenant({
      id: tenantId,
      githubOrgId: input.githubOrgId || 0,
      githubOrgLogin: input.githubOrgLogin || input.displayName.toLowerCase().replace(/\s+/g, '-'),
      displayName: input.displayName,
      installationId: 0, // Will be set when GitHub App is installed
      installedAt: new Date(),
      installedBy: req.context!.userId,
      status: 'active',
      plan: 'free',
      planLimits: {
        runsPerMonth: 50,
        reposMax: 3,
        membersMax: 3,
      },
      settings: {
        defaultRiskMode: 'comment_only',
        defaultTriageModel: 'gemini-1.5-flash',
        defaultCodeModel: 'gemini-1.5-pro',
        complexityThreshold: 3,
        autoRunOnConflict: false,
        autoRunOnPrOpen: false,
      },
      runsThisMonth: 0,
    });

    // Create owner membership for the creator
    await membershipStore.createMembership({
      id: `${req.context!.userId}_${tenantId}`,
      userId: req.context!.userId,
      tenantId: tenantId,
      role: 'owner',
      status: 'active',
      acceptedAt: new Date(),
    });

    console.log(JSON.stringify({
      type: 'tenant_created',
      tenantId: tenant.id,
      createdBy: req.context!.userId,
      plan: tenant.plan,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json({
      tenant,
      message: 'Workspace created successfully',
    });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    res.status(500).json({
      error: 'Failed to create workspace',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Tenants
// =============================================================================

/**
 * GET /tenants - List user's tenants
 */
app.get('/tenants', authMiddleware, async (req, res) => {
  try {
    const membershipStore = getMembershipStore();
    const store = getStore();

    // Get user's memberships
    const memberships = await membershipStore.listUserMemberships(req.context!.userId);

    // Fetch tenant details for each membership
    const tenantsWithRole = await Promise.all(
      memberships.map(async (membership) => {
        const tenant = await store.getTenant(membership.tenantId);
        return {
          tenant,
          role: membership.role,
          joinedAt: membership.acceptedAt || membership.createdAt,
        };
      })
    );

    // Filter out any null tenants (shouldn't happen but safety check)
    const validTenants = tenantsWithRole.filter(t => t.tenant !== null);

    res.json({
      tenants: validTenants,
      count: validTenants.length,
    });
  } catch (error) {
    console.error('Failed to list tenants:', error);
    res.status(500).json({
      error: 'Failed to list tenants',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId - Get tenant details (VIEWER+)
 */
app.get('/tenants/:tenantId', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const store = getStore();
    const tenant = await store.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId,
      });
    }

    res.json(tenant);
  } catch (error) {
    console.error('Failed to get tenant:', error);
    res.status(500).json({
      error: 'Failed to get tenant',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Member Invites (Phase 12)
// =============================================================================

/**
 * POST /tenants/:tenantId/invites - Create a member invite (ADMIN+)
 *
 * Phase 12: Self-serve member invitations
 */
app.post('/tenants/:tenantId/invites', authMiddleware, tenantAuthMiddleware, requirePermission('member:invite'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId } = req.params;

  const parseResult = InviteMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const store = getStore();
    const membershipStore = getMembershipStore();
    const userStore = getUserStore();

    // Check tenant and plan limits
    const tenant = await store.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId,
      });
    }

    // Check member limit
    const currentMembers = await membershipStore.listTenantMembers(tenantId);
    const activeMemberCount = currentMembers.filter(m => m.status === 'active').length;
    const planId = (tenant.plan || 'free') as PlanId;
    const memberLimitCheck = checkMemberLimit(activeMemberCount, planId);

    if (!memberLimitCheck.allowed) {
      return res.status(429).json({
        error: 'Plan limit exceeded',
        reason: memberLimitCheck.reason,
        currentUsage: memberLimitCheck.currentUsage,
        limit: memberLimitCheck.limit,
        plan: planId,
        upgradeUrl: '/billing/upgrade',
      });
    }

    // Check if user already has a membership
    const existingUser = await userStore.getUserByEmail(input.email);
    if (existingUser) {
      const existingMembership = await membershipStore.getMembership(existingUser.id, tenantId);
      if (existingMembership) {
        return res.status(409).json({
          error: 'User already has access',
          message: 'This user is already a member of this workspace',
          status: existingMembership.status,
        });
      }
    }

    // Generate invite token
    const inviteToken = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

    // Create membership in 'invited' status
    const membership = await membershipStore.createMembership({
      id: `pending_${inviteToken}`,
      userId: `pending_${input.email}`, // Placeholder until user signs up/accepts
      tenantId: tenantId,
      role: input.role as 'admin' | 'member',
      status: 'invited',
      invitedBy: req.context!.userId,
      invitedAt: new Date(),
    });

    console.log(JSON.stringify({
      type: 'invite_created',
      tenantId,
      email: input.email,
      role: input.role,
      invitedBy: req.context!.userId,
      inviteToken,
      timestamp: new Date().toISOString(),
    }));

    // In production, send email here
    res.status(201).json({
      invite: {
        id: membership.id,
        email: input.email,
        role: input.role,
        status: 'invited',
        invitedAt: membership.invitedAt,
        inviteToken, // Return token for development; in production, email it
      },
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    console.error('Failed to create invite:', error);
    res.status(500).json({
      error: 'Failed to create invite',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/invites - List pending invites (ADMIN+)
 */
app.get('/tenants/:tenantId/invites', authMiddleware, tenantAuthMiddleware, requirePermission('member:invite'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const membershipStore = getMembershipStore();
    const members = await membershipStore.listTenantMembers(tenantId);

    // Filter to only invited (pending) memberships
    const invites = members
      .filter(m => m.status === 'invited')
      .map(m => ({
        id: m.id,
        role: m.role,
        status: m.status,
        invitedBy: m.invitedBy,
        invitedAt: m.invitedAt,
      }));

    res.json({ invites });
  } catch (error) {
    console.error('Failed to list invites:', error);
    res.status(500).json({
      error: 'Failed to list invites',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/members - List tenant members (VIEWER+)
 */
app.get('/tenants/:tenantId/members', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const membershipStore = getMembershipStore();
    const userStore = getUserStore();

    const memberships = await membershipStore.listTenantMembers(tenantId);

    // Enrich with user details
    const members = await Promise.all(
      memberships
        .filter(m => m.status === 'active')
        .map(async (membership) => {
          const user = await userStore.getUser(membership.userId);
          return {
            userId: membership.userId,
            role: membership.role,
            joinedAt: membership.acceptedAt || membership.createdAt,
            displayName: user?.displayName,
            email: user?.email,
            avatarUrl: user?.githubAvatarUrl,
          };
        })
    );

    res.json({ members });
  } catch (error) {
    console.error('Failed to list members:', error);
    res.status(500).json({
      error: 'Failed to list members',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /invites/:inviteToken/accept - Accept an invitation
 *
 * Phase 12: Invite acceptance flow
 * Requires authentication - updates the membership with real user ID.
 */
app.post('/invites/:inviteToken/accept', authMiddleware, async (req, res) => {
  const { inviteToken } = req.params;

  try {
    const membershipStore = getMembershipStore();

    // Find the pending membership by invite token
    const membershipId = `pending_${inviteToken}`;

    // Get all memberships and find the one with matching ID
    // Note: In production, use a dedicated invites collection for O(1) lookup
    const _snapshot = await membershipStore.getMembership(`pending_${inviteToken.split('_')[1] || ''}`, '');

    // For now, we'll need to search - this is a simplification
    // The membership ID format is `pending_inv-xxx`
    let pendingMembership = null;

    // Update the membership with the real user ID and status
    try {
      pendingMembership = await membershipStore.updateMembership(membershipId, {
        userId: req.context!.userId,
        status: 'active',
        acceptedAt: new Date(),
      });
    } catch {
      return res.status(404).json({
        error: 'Invite not found',
        message: 'This invitation does not exist or has already been used',
      });
    }

    console.log(JSON.stringify({
      type: 'invite_accepted',
      tenantId: pendingMembership.tenantId,
      userId: req.context!.userId,
      role: pendingMembership.role,
      inviteToken,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      membership: pendingMembership,
      message: 'Invitation accepted successfully',
    });
  } catch (error) {
    console.error('Failed to accept invite:', error);
    res.status(500).json({
      error: 'Failed to accept invite',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /tenants/:tenantId/invites/:inviteId - Cancel a pending invite (ADMIN+)
 */
app.delete('/tenants/:tenantId/invites/:inviteId', authMiddleware, tenantAuthMiddleware, requirePermission('member:remove'), async (req, res) => {
  const { tenantId, inviteId } = req.params;

  try {
    const membershipStore = getMembershipStore();

    // Verify the invite belongs to this tenant
    const _membership = await membershipStore.getMembership(inviteId.split('_')[1] || '', tenantId);

    // Delete the pending membership
    await membershipStore.deleteMembership(inviteId);

    console.log(JSON.stringify({
      type: 'invite_cancelled',
      tenantId,
      inviteId,
      cancelledBy: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json({ message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Failed to cancel invite:', error);
    res.status(500).json({
      error: 'Failed to cancel invite',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Repos
// =============================================================================

/**
 * GET /tenants/:tenantId/repos - List connected repos (VIEWER+)
 */
app.get('/tenants/:tenantId/repos', authMiddleware, tenantAuthMiddleware, requirePermission('repo:read'), async (req, res) => {
  const { tenantId } = req.params;
  const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;

  try {
    const store = getStore();
    const repos = await store.listRepos(tenantId, { enabled });
    res.json({ repos });
  } catch (error) {
    console.error('Failed to list repos:', error);
    res.status(500).json({
      error: 'Failed to list repos',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/repos:connect - Connect a repo (ADMIN+)
 *
 * Phase 11: Checks repo limit before connecting.
 */
app.post('/tenants/:tenantId/repos:connect', authMiddleware, tenantAuthMiddleware, requirePermission('repo:connect'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId } = req.params;

  const parseResult = ConnectRepoSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const store = getStore();

    // Phase 11: Check tenant and plan limits
    const tenant = await store.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId,
      });
    }

    // Check repo limit
    const currentRepos = await store.listRepos(tenantId);
    const planId = (tenant.plan || 'free') as PlanId;
    const repoLimitCheck = checkRepoLimit(currentRepos.length, planId);

    if (!repoLimitCheck.allowed) {
      console.log(JSON.stringify({
        type: 'repo_connect_rejected',
        reason: 'PLAN_LIMIT_REPOS',
        tenantId,
        plan: planId,
        currentRepos: currentRepos.length,
        limit: repoLimitCheck.limit,
      }));
      return res.status(429).json({
        error: 'Plan limit exceeded',
        reason: repoLimitCheck.reason,
        currentUsage: repoLimitCheck.currentUsage,
        limit: repoLimitCheck.limit,
        plan: planId,
        upgradeUrl: '/billing/upgrade',
      });
    }

    // Generate repo ID from URL
    const repoUrlParts = input.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!repoUrlParts) {
      return res.status(400).json({
        error: 'Invalid GitHub URL',
        message: 'Expected format: https://github.com/owner/repo',
      });
    }

    const [, owner, repoName] = repoUrlParts;
    const repoId = `gh-repo-${owner}-${repoName}`.toLowerCase();

    const repo = await store.addRepo(tenantId, {
      id: repoId,
      tenantId,
      githubRepoId: 0, // Will be populated from GitHub API in later phase
      githubFullName: `${owner}/${repoName}`,
      displayName: input.displayName || repoName,
      enabled: true,
      settings: {
        autoTriage: input.settings?.autoTriage ?? true,
        autoReview: input.settings?.autoReview ?? false,
        autoResolve: input.settings?.autoResolve ?? false,
      },
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
    });

    console.log(JSON.stringify({
      type: 'repo_connected',
      tenantId,
      repoId,
      plan: planId,
      reposCount: currentRepos.length + 1,
      limit: repoLimitCheck.limit,
    }));

    res.status(201).json(repo);
  } catch (error) {
    console.error('Failed to connect repo:', error);
    res.status(500).json({
      error: 'Failed to connect repo',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Runs
// =============================================================================

/**
 * GET /tenants/:tenantId/runs - List runs (VIEWER+)
 */
app.get('/tenants/:tenantId/runs', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
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
 * POST /tenants/:tenantId/runs - Start a new run (DEVELOPER+)
 *
 * This is the main entrypoint for starting agent workflows.
 * Phase 11: Plan limits are checked before creating the run.
 */
app.post('/tenants/:tenantId/runs', rateLimitMiddleware('expensive'), authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
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
    // Phase 11: Check plan limits before creating run
    const store = getStore();
    const tenant = await store.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId,
      });
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      // Phase A6: Differentiate between paused (temporary) and suspended/deactivated
      if (tenant.status === 'paused') {
        console.log(JSON.stringify({
          type: 'run_rejected',
          reason: 'TENANT_PAUSED',
          tenantId,
          status: tenant.status,
          durationMs: Date.now() - startTime,
        }));
        return res.status(503).json({
          error: 'Tenant is temporarily paused',
          status: tenant.status,
          message: 'Run processing is temporarily suspended. Try again later.',
          retryAfter: 60, // Suggest retry after 60 seconds
        });
      }

      console.log(JSON.stringify({
        type: 'run_rejected',
        reason: 'TENANT_SUSPENDED',
        tenantId,
        status: tenant.status,
        durationMs: Date.now() - startTime,
      }));
      return res.status(403).json({
        error: 'Tenant is not active',
        status: tenant.status,
        message: 'Contact support to reactivate your account',
      });
    }

    // Check run limit based on plan
    const planId = (tenant.plan || 'free') as PlanId;
    const runLimitCheck = checkRunLimit(tenant.runsThisMonth, planId);

    if (!runLimitCheck.allowed) {
      console.log(JSON.stringify({
        type: 'run_rejected',
        reason: 'PLAN_LIMIT_RUNS',
        tenantId,
        plan: planId,
        runsThisMonth: tenant.runsThisMonth,
        limit: runLimitCheck.limit,
        durationMs: Date.now() - startTime,
      }));
      return res.status(429).json({
        error: 'Plan limit exceeded',
        reason: runLimitCheck.reason,
        currentUsage: runLimitCheck.currentUsage,
        limit: runLimitCheck.limit,
        plan: planId,
        upgradeUrl: '/billing/upgrade',
      });
    }

    // Phase A6: Check concurrency limit
    const inFlightRuns = await store.countInFlightRuns(tenantId);
    const concurrencyCheck = checkConcurrencyLimit(inFlightRuns, planId);

    if (!concurrencyCheck.allowed) {
      console.log(JSON.stringify({
        type: 'run_rejected',
        reason: 'PLAN_LIMIT_CONCURRENCY',
        tenantId,
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
        retryAfter: 30, // Suggest retry after 30 seconds
      });
    }

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

    // Increment usage counter (will be done by the engine in future)
    // For now, log the usage increment
    console.log(JSON.stringify({
      type: 'run_started',
      tenantId,
      runId: result.runId,
      runType: input.runType,
      repoUrl: input.repoUrl,
      runsThisMonth: tenant.runsThisMonth + 1,
      planLimit: runLimitCheck.limit,
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
 * GET /tenants/:tenantId/runs/:runId - Get run status (VIEWER+)
 */
app.get('/tenants/:tenantId/runs/:runId', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
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
// Routes: Run Approvals (Phase 11)
// =============================================================================

const ApproveRunSchema = z.object({
  reason: z.string().optional(),
});

const RejectRunSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

/**
 * POST /tenants/:tenantId/runs/:runId/approve - Approve a run (ADMIN+)
 *
 * Phase 11: Creates an ApprovalRecord and updates run status.
 * Only works for runs with approvalStatus='pending'.
 */
app.post('/tenants/:tenantId/runs/:runId/approve', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId, runId } = req.params;

  const parseResult = ApproveRunSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  try {
    // Get run directly from store to access Phase 11 fields (SaaSRun)
    const store = getStore();
    const run = await store.getRun(tenantId, runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found', runId });
    }

    // Check if run is pending approval
    if (run.approvalStatus !== 'pending') {
      return res.status(400).json({
        error: 'Run is not pending approval',
        currentStatus: run.approvalStatus || 'none',
      });
    }

    // Create approval record
    const approvalStore = getApprovalStore();
    const approval = await approvalStore.createApproval({
      runId,
      tenantId,
      decision: 'approved' as ApprovalDecision,
      decidedBy: req.context!.userId,
      decidedAt: new Date(),
      reason: parseResult.data.reason,
      proposedChangesSnapshot: run.proposedChanges,
    });

    // Create audit event
    const auditStore = getAuditStore();
    await auditStore.createEvent({
      runId,
      tenantId,
      eventType: 'approval_granted' as AuditEventType,
      timestamp: new Date(),
      actor: req.context!.userId,
      details: {
        approvalId: approval.id,
        reason: parseResult.data.reason,
      },
      who: req.context!.userId,
      what: 'Approved run for execution',
      when: new Date().toISOString(),
      where: `Run ${runId}`,
      why: parseResult.data.reason || 'Manual approval',
    });

    // Update run status
    await store.updateRun(tenantId, runId, {
      approvalStatus: 'approved',
      status: 'running',
    });

    console.log(JSON.stringify({
      type: 'run_approved',
      tenantId,
      runId,
      approvalId: approval.id,
      approvedBy: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      approval,
      message: 'Run approved successfully',
    });
  } catch (error) {
    console.error('Failed to approve run:', error);
    res.status(500).json({
      error: 'Failed to approve run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/runs/:runId/reject - Reject a run (ADMIN+)
 *
 * Phase 11: Creates an ApprovalRecord with rejection and fails the run.
 */
app.post('/tenants/:tenantId/runs/:runId/reject', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId, runId } = req.params;

  const parseResult = RejectRunSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  try {
    // Get run directly from store to access Phase 11 fields (SaaSRun)
    const store = getStore();
    const run = await store.getRun(tenantId, runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found', runId });
    }

    if (run.approvalStatus !== 'pending') {
      return res.status(400).json({
        error: 'Run is not pending approval',
        currentStatus: run.approvalStatus || 'none',
      });
    }

    // Create rejection record
    const approvalStore = getApprovalStore();
    const approval = await approvalStore.createApproval({
      runId,
      tenantId,
      decision: 'rejected' as ApprovalDecision,
      decidedBy: req.context!.userId,
      decidedAt: new Date(),
      reason: parseResult.data.reason,
      proposedChangesSnapshot: run.proposedChanges,
    });

    // Create audit event
    const auditStore = getAuditStore();
    await auditStore.createEvent({
      runId,
      tenantId,
      eventType: 'approval_rejected' as AuditEventType,
      timestamp: new Date(),
      actor: req.context!.userId,
      details: {
        approvalId: approval.id,
        reason: parseResult.data.reason,
      },
      who: req.context!.userId,
      what: 'Rejected run',
      when: new Date().toISOString(),
      where: `Run ${runId}`,
      why: parseResult.data.reason,
    });

    // Update run status
    await store.updateRun(tenantId, runId, {
      approvalStatus: 'rejected',
      status: 'failed',
      error: `Rejected by ${req.context!.userId}: ${parseResult.data.reason}`,
    });

    console.log(JSON.stringify({
      type: 'run_rejected',
      tenantId,
      runId,
      approvalId: approval.id,
      rejectedBy: req.context!.userId,
      reason: parseResult.data.reason,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      approval,
      message: 'Run rejected',
    });
  } catch (error) {
    console.error('Failed to reject run:', error);
    res.status(500).json({
      error: 'Failed to reject run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/runs/:runId/audit - Get audit trail for run (VIEWER+)
 *
 * Phase 11: Returns paginated audit events for a run.
 */
app.get('/tenants/:tenantId/runs/:runId/audit', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { tenantId, runId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const eventType = req.query.eventType as string | undefined;

  try {
    // Verify run exists
    const eng = await getEngine();
    const run = await eng.getRun(tenantId, runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found', runId });
    }

    // Get audit events
    const auditStore = getAuditStore();
    const events = await auditStore.listEvents(runId, {
      eventType: eventType as AuditEventType,
      limit,
      offset,
    });

    // Get approval record if exists
    const approvalStore = getApprovalStore();
    const approval = await approvalStore.getApprovalByRunId(runId);

    res.json({
      runId,
      events,
      approval,
      pagination: {
        limit,
        offset,
        hasMore: events.length === limit,
      },
    });
  } catch (error) {
    console.error('Failed to get audit trail:', error);
    res.status(500).json({
      error: 'Failed to get audit trail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Settings
// =============================================================================

/**
 * POST /tenants/:tenantId/settings - Update tenant settings (ADMIN+)
 */
app.post('/tenants/:tenantId/settings', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId } = req.params;

  const parseResult = UpdateSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  try {
    const store = getStore();
    const existing = await store.getTenant(tenantId);

    if (!existing) {
      return res.status(404).json({
        error: 'Tenant not found',
        tenantId,
      });
    }

    const input = parseResult.data;
    const updatedSettings = {
      ...existing.settings,
      ...(input.defaultRiskMode && { defaultRiskMode: input.defaultRiskMode }),
      ...(input.defaultTriageModel && { defaultTriageModel: input.defaultTriageModel }),
      ...(input.defaultCodeModel && { defaultCodeModel: input.defaultCodeModel }),
      ...(input.complexityThreshold !== undefined && { complexityThreshold: input.complexityThreshold }),
      ...(input.autoRunOnConflict !== undefined && { autoRunOnConflict: input.autoRunOnConflict }),
      ...(input.autoRunOnPrOpen !== undefined && { autoRunOnPrOpen: input.autoRunOnPrOpen }),
    };

    const updated = await store.updateTenant(tenantId, { settings: updatedSettings });
    res.json(updated);
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Tenant Pause/Resume (Phase A6)
// =============================================================================

/**
 * POST /tenants/:tenantId/pause - Pause tenant (ADMIN+)
 *
 * Phase A6: Emergency brake for overloaded tenants.
 * Paused tenants return 503 for new runs until resumed.
 */
app.post('/tenants/:tenantId/pause', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), async (req, res) => {
  const { tenantId } = req.params;
  const { reason } = req.body as { reason?: string };

  try {
    const store = getStore();
    const tenant = await store.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status === 'paused') {
      return res.status(409).json({
        error: 'Tenant is already paused',
        status: tenant.status,
      });
    }

    if (tenant.status !== 'active') {
      return res.status(409).json({
        error: 'Can only pause active tenants',
        status: tenant.status,
      });
    }

    const updated = await store.updateTenant(tenantId, {
      status: 'paused',
    });

    console.log(JSON.stringify({
      type: 'tenant_paused',
      tenantId,
      reason: reason || 'admin_action',
      pausedBy: req.context?.userId,
    }));

    res.json({
      success: true,
      status: updated.status,
      message: 'Tenant paused. New runs will be rejected until resumed.',
    });
  } catch (error) {
    console.error('Failed to pause tenant:', error);
    res.status(500).json({
      error: 'Failed to pause tenant',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/resume - Resume paused tenant (ADMIN+)
 *
 * Phase A6: Resume a paused tenant to accept new runs.
 */
app.post('/tenants/:tenantId/resume', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const store = getStore();
    const tenant = await store.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'paused') {
      return res.status(409).json({
        error: 'Tenant is not paused',
        status: tenant.status,
      });
    }

    const updated = await store.updateTenant(tenantId, {
      status: 'active',
    });

    console.log(JSON.stringify({
      type: 'tenant_resumed',
      tenantId,
      resumedBy: req.context?.userId,
    }));

    res.json({
      success: true,
      status: updated.status,
      message: 'Tenant resumed. New runs will be accepted.',
    });
  } catch (error) {
    console.error('Failed to resume tenant:', error);
    res.status(500).json({
      error: 'Failed to resume tenant',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Policy (Phase 12)
// =============================================================================

/**
 * Phase 12: Policy validation schema
 * Based on PolicyDocument from @gwi/core/tenancy
 */
const PolicyRuleSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  effect: z.enum(['allow', 'deny']),
  priority: z.number().default(0),
  conditions: z.object({
    tenants: z.array(z.string()).optional(),
    actors: z.array(z.string()).optional(),
    actorTypes: z.array(z.enum(['human', 'service', 'github_app'])).optional(),
    sources: z.array(z.enum(['cli', 'web', 'api', 'github_action', 'webhook'])).optional(),
    connectors: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
    policyClasses: z.array(z.enum(['READ', 'WRITE_NON_DESTRUCTIVE', 'DESTRUCTIVE'])).optional(),
    resources: z.array(z.string()).optional(),
  }).optional(),
});

const PolicyDocumentSchema = z.object({
  version: z.string().default('1.0'),
  name: z.string(),
  description: z.string().optional(),
  defaultReadBehavior: z.enum(['allow', 'deny']).default('allow'),
  defaultWriteBehavior: z.enum(['allow', 'deny']).default('deny'),
  defaultDestructiveBehavior: z.literal('deny').default('deny'),
  rules: z.array(PolicyRuleSchema),
});

/**
 * GET /tenants/:tenantId/policy - Get tenant policy (VIEWER+)
 *
 * Phase 12: Returns the tenant's policy document with metadata.
 */
app.get('/tenants/:tenantId/policy', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const store = getStore();
    const tenant = await store.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (!tenant.policy) {
      // Return default policy structure
      return res.json({
        policy: null,
        message: 'No custom policy configured. Using default deny-by-default behavior.',
        defaults: {
          defaultReadBehavior: 'allow',
          defaultWriteBehavior: 'deny',
          defaultDestructiveBehavior: 'deny',
        },
      });
    }

    res.json({
      policy: tenant.policy.document,
      version: tenant.policy.version,
      updatedAt: tenant.policy.updatedAt,
      updatedBy: tenant.policy.updatedBy,
      valid: tenant.policy.valid,
      validationErrors: tenant.policy.validationErrors,
    });
  } catch (error) {
    console.error('Failed to get policy:', error);
    res.status(500).json({
      error: 'Failed to get policy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /tenants/:tenantId/policy - Update tenant policy (ADMIN+)
 *
 * Phase 12: Validates and saves the policy document.
 */
app.put('/tenants/:tenantId/policy', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), async (req, res) => {
  const { tenantId } = req.params;

  const parseResult = PolicyDocumentSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid policy document',
      validationErrors: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    });
  }

  try {
    const store = getStore();
    const tenant = await store.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Determine new version
    const currentVersion = tenant.policy?.version ?? 0;
    const newVersion = currentVersion + 1;

    const policyUpdate = {
      document: parseResult.data,
      version: newVersion,
      updatedAt: new Date(),
      updatedBy: req.context!.userId,
      valid: true,
      validationErrors: undefined,
    };

    await store.updateTenant(tenantId, { policy: policyUpdate });

    console.log(JSON.stringify({
      type: 'policy_updated',
      tenantId,
      version: newVersion,
      updatedBy: req.context!.userId,
      rulesCount: parseResult.data.rules.length,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      message: 'Policy updated successfully',
      version: newVersion,
      policy: parseResult.data,
    });
  } catch (error) {
    console.error('Failed to update policy:', error);
    res.status(500).json({
      error: 'Failed to update policy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/policy/validate - Validate a policy document (VIEWER+)
 *
 * Phase 12: Validates without saving. Returns normalized policy and any errors.
 */
app.post('/tenants/:tenantId/policy/validate', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const parseResult = PolicyDocumentSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.json({
      valid: false,
      errors: parseResult.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
      normalized: null,
    });
  }

  // Return the normalized/validated policy
  res.json({
    valid: true,
    errors: [],
    normalized: parseResult.data,
    summary: {
      rulesCount: parseResult.data.rules.length,
      allowRules: parseResult.data.rules.filter(r => r.effect === 'allow').length,
      denyRules: parseResult.data.rules.filter(r => r.effect === 'deny').length,
      defaultReadBehavior: parseResult.data.defaultReadBehavior,
      defaultWriteBehavior: parseResult.data.defaultWriteBehavior,
    },
  });
});

// =============================================================================
// Routes: Connector Config (Phase 12)
// =============================================================================

/**
 * Phase 12: Connector config validation schema
 */
const ConnectorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().url().optional(),
  timeouts: z.object({
    connectMs: z.number().min(1000).max(60000).default(5000),
    readMs: z.number().min(1000).max(300000).default(30000),
  }).default({ connectMs: 5000, readMs: 30000 }),
  rateLimit: z.object({
    requestsPerMinute: z.number().min(1).max(1000).optional(),
    requestsPerHour: z.number().min(1).max(10000).optional(),
  }).optional(),
  secretRefs: z.record(z.string()).default({}),
  config: z.record(z.unknown()).default({}),
});

/**
 * GET /tenants/:tenantId/connectors - List connector configs (VIEWER+)
 *
 * Phase 12: Returns all connector configurations for the tenant.
 */
app.get('/tenants/:tenantId/connectors', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const store = getStore();
    const configs = await store.listConnectorConfigs(tenantId);

    res.json({
      connectors: configs.map(c => ({
        connectorId: c.connectorId,
        enabled: c.enabled,
        baseUrl: c.baseUrl,
        timeouts: c.timeouts,
        rateLimit: c.rateLimit,
        // Never expose secret values, only refs
        secretRefKeys: Object.keys(c.secretRefs),
        hasCustomConfig: Object.keys(c.config).length > 0,
        updatedAt: c.updatedAt,
        updatedBy: c.updatedBy,
      })),
      count: configs.length,
    });
  } catch (error) {
    console.error('Failed to list connectors:', error);
    res.status(500).json({
      error: 'Failed to list connector configs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/connectors/:connectorId/config - Get connector config (VIEWER+)
 *
 * Phase 12: Returns configuration for a specific connector.
 */
app.get('/tenants/:tenantId/connectors/:connectorId/config', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId, connectorId } = req.params;

  try {
    const store = getStore();
    const config = await store.getConnectorConfig(tenantId, connectorId);

    if (!config) {
      return res.status(404).json({
        error: 'Connector config not found',
        connectorId,
        message: 'No configuration exists for this connector. Use PUT to create one.',
      });
    }

    res.json({
      connectorId: config.connectorId,
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      timeouts: config.timeouts,
      rateLimit: config.rateLimit,
      // Never expose secret values, only refs
      secretRefs: Object.fromEntries(
        Object.entries(config.secretRefs).map(([key, ref]) => [key, `${ref.substring(0, 4)}...`])
      ),
      config: config.config,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    });
  } catch (error) {
    console.error('Failed to get connector config:', error);
    res.status(500).json({
      error: 'Failed to get connector config',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /tenants/:tenantId/connectors/:connectorId/config - Update connector config (ADMIN+)
 *
 * Phase 12: Creates or updates connector configuration.
 */
app.put('/tenants/:tenantId/connectors/:connectorId/config', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), async (req, res) => {
  const { tenantId, connectorId } = req.params;

  const parseResult = ConnectorConfigSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid connector config',
      details: parseResult.error.errors,
    });
  }

  try {
    const store = getStore();
    const input = parseResult.data;

    const config = await store.setConnectorConfig(tenantId, {
      connectorId,
      tenantId,
      enabled: input.enabled,
      baseUrl: input.baseUrl,
      timeouts: input.timeouts,
      rateLimit: input.rateLimit,
      secretRefs: input.secretRefs,
      config: input.config,
      updatedAt: new Date(),
      updatedBy: req.context!.userId,
    });

    console.log(JSON.stringify({
      type: 'connector_config_updated',
      tenantId,
      connectorId,
      enabled: config.enabled,
      updatedBy: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      message: 'Connector config updated successfully',
      connectorId: config.connectorId,
      enabled: config.enabled,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error('Failed to update connector config:', error);
    res.status(500).json({
      error: 'Failed to update connector config',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /tenants/:tenantId/connectors/:connectorId/config - Delete connector config (ADMIN+)
 *
 * Phase 12: Removes connector configuration (reverts to defaults).
 */
app.delete('/tenants/:tenantId/connectors/:connectorId/config', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), async (req, res) => {
  const { tenantId, connectorId } = req.params;

  try {
    const store = getStore();
    await store.deleteConnectorConfig(tenantId, connectorId);

    console.log(JSON.stringify({
      type: 'connector_config_deleted',
      tenantId,
      connectorId,
      deletedBy: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      message: 'Connector config deleted',
      connectorId,
    });
  } catch (error) {
    console.error('Failed to delete connector config:', error);
    res.status(500).json({
      error: 'Failed to delete connector config',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Workflows (Phase 13)
// =============================================================================

const StartWorkflowSchema = z.object({
  workflowType: z.enum(['issue-to-code', 'pr-resolve', 'pr-review', 'test-gen', 'docs-update']),
  input: z.record(z.unknown()),
});

/**
 * POST /tenants/:tenantId/workflows - Start a new workflow (DEVELOPER+)
 *
 * Phase 13: Direct workflow execution endpoint
 */
app.post('/tenants/:tenantId/workflows', rateLimitMiddleware('expensive'), authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId } = req.params;
  const startTime = Date.now();

  const parseResult = StartWorkflowSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const { workflowType, input } = parseResult.data;

  try {
    // Import orchestrator dynamically to avoid circular deps
    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    // Add tenant context to input
    const workflowInput = {
      ...input,
      tenantId,
      triggeredBy: req.context!.userId,
      triggerSource: 'api',
    };

    // Start the workflow
    const result = await orchestrator.startWorkflow(workflowType as any, workflowInput);

    // Cleanup
    await orchestrator.shutdown();

    console.log(JSON.stringify({
      type: 'workflow_started',
      tenantId,
      workflowId: result.workflowId,
      workflowType,
      status: result.status,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }));

    res.status(202).json({
      workflowId: result.workflowId,
      status: result.status,
      currentStep: result.currentStep,
      message: `Workflow ${workflowType} started`,
    });
  } catch (error) {
    console.error('Failed to start workflow:', error);
    res.status(500).json({
      error: 'Failed to start workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/workflows - List recent workflows (VIEWER+)
 *
 * Phase 13: Returns workflows executed via the orchestrator
 */
app.get('/tenants/:tenantId/workflows', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { tenantId } = req.params;
  const status = req.query.status as string | undefined;

  try {
    // Import orchestrator dynamically
    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    // List workflows
    const workflows = await orchestrator.listWorkflows(status as any);

    // Filter by tenant (orchestrator currently stores all workflows)
    const tenantWorkflows = workflows.filter(wf => {
      const input = wf.input as Record<string, unknown>;
      return input?.tenantId === tenantId;
    });

    await orchestrator.shutdown();

    res.json({
      workflows: tenantWorkflows.map(wf => ({
        id: wf.id,
        type: wf.type,
        status: wf.status,
        createdAt: new Date(wf.createdAt).toISOString(),
        completedAt: wf.completedAt ? new Date(wf.completedAt).toISOString() : undefined,
      })),
      count: tenantWorkflows.length,
    });
  } catch (error) {
    console.error('Failed to list workflows:', error);
    res.status(500).json({
      error: 'Failed to list workflows',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/workflows/:workflowId - Get workflow status (VIEWER+)
 *
 * Phase 13: Returns detailed workflow status including steps
 */
app.get('/tenants/:tenantId/workflows/:workflowId', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { workflowId } = req.params;

  try {
    // Import orchestrator dynamically
    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    const workflow = await orchestrator.getWorkflowStatus(workflowId);

    await orchestrator.shutdown();

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        workflowId,
      });
    }

    res.json({
      id: workflow.id,
      type: workflow.type,
      status: workflow.status,
      steps: workflow.steps.map(step => ({
        agent: step.agent,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        error: step.error,
      })),
      output: workflow.output,
      error: workflow.error,
      createdAt: new Date(workflow.createdAt).toISOString(),
      updatedAt: new Date(workflow.updatedAt).toISOString(),
      completedAt: workflow.completedAt ? new Date(workflow.completedAt).toISOString() : undefined,
    });
  } catch (error) {
    console.error('Failed to get workflow:', error);
    res.status(500).json({
      error: 'Failed to get workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/workflows/:workflowId/approve - Approve or reject a workflow (ADMIN+)
 *
 * Phase 13: For workflows waiting for human approval
 */
app.post('/tenants/:tenantId/workflows/:workflowId/approve', authMiddleware, tenantAuthMiddleware, requirePermission('settings:update'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { workflowId } = req.params;
  const { approved } = req.body as { approved?: boolean };

  if (typeof approved !== 'boolean') {
    return res.status(400).json({
      error: 'Invalid request body',
      message: 'approved field must be a boolean',
    });
  }

  try {
    // Import orchestrator dynamically
    const { OrchestratorAgent } = await import('@gwi/agents');
    const orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();

    const result = await orchestrator.resumeWorkflow(workflowId, approved);

    await orchestrator.shutdown();

    console.log(JSON.stringify({
      type: 'workflow_approved',
      workflowId,
      approved,
      newStatus: result.status,
      approvedBy: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      workflowId,
      status: result.status,
      message: approved ? 'Workflow approved and resumed' : 'Workflow rejected',
    });
  } catch (error) {
    console.error('Failed to approve workflow:', error);
    res.status(500).json({
      error: 'Failed to approve workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Billing Endpoints (Phase 15)
// =============================================================================

/**
 * GET /tenants/:tenantId/billing/subscription - Get current subscription
 */
app.get('/tenants/:tenantId/billing/subscription', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:billing'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const { getBillingStore } = await import('@gwi/core');
    const billingStore = getBillingStore();
    const subscription = await billingStore.getSubscriptionByTenant(tenantId);

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    res.json({ subscription });
  } catch (error) {
    console.error('Failed to get subscription:', error);
    res.status(500).json({
      error: 'Failed to get subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/billing/checkout - Create Stripe checkout session
 */
app.post('/tenants/:tenantId/billing/checkout', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:billing'), async (req, res) => {
  const { tenantId } = req.params;
  const { planId, interval, successUrl, cancelUrl } = req.body;

  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(501).json({ error: 'Stripe not configured' });
    }

    const { createStripeProvider, getTenantStore } = await import('@gwi/core');
    const stripe = createStripeProvider();
    const tenantStore = getTenantStore();

    // Get tenant to find or create Stripe customer
    const tenant = await tenantStore.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Get or create Stripe customer
    let customerId = (tenant as any).stripeCustomerId;
    if (!customerId) {
      customerId = await stripe.createCustomer(tenantId, req.context!.email || '', tenant.displayName);
      // TODO: Save customerId to tenant
    }

    // Create checkout session
    const session = await stripe.createCheckoutSession(customerId, planId, interval, {
      successUrl: successUrl || `${req.headers.origin}/billing/success`,
      cancelUrl: cancelUrl || `${req.headers.origin}/billing/cancel`,
      trialDays: planId === 'pro' ? 14 : 0,
    });

    res.json({
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (error) {
    console.error('Failed to create checkout:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tenants/:tenantId/billing/portal - Create Stripe billing portal session
 */
app.post('/tenants/:tenantId/billing/portal', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:billing'), async (req, res) => {
  const { tenantId } = req.params;
  const { returnUrl } = req.body;

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(501).json({ error: 'Stripe not configured' });
    }

    const { createStripeProvider, getTenantStore } = await import('@gwi/core');
    const stripe = createStripeProvider();
    const tenantStore = getTenantStore();

    const tenant = await tenantStore.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const customerId = (tenant as any).stripeCustomerId;
    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer found. Please create a subscription first.' });
    }

    const session = await stripe.createBillingPortalSession(
      customerId,
      returnUrl || `${req.headers.origin}/settings/billing`
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Failed to create portal:', error);
    res.status(500).json({
      error: 'Failed to create billing portal',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/billing/invoices - List invoices
 */
app.get('/tenants/:tenantId/billing/invoices', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:billing'), async (req, res) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    const { getBillingStore } = await import('@gwi/core');
    const billingStore = getBillingStore();
    const invoices = await billingStore.listInvoices(tenantId, { limit });

    res.json({ invoices });
  } catch (error) {
    console.error('Failed to list invoices:', error);
    res.status(500).json({
      error: 'Failed to list invoices',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Usage Metering Endpoints (A11)
// =============================================================================

/**
 * GET /tenants/:tenantId/usage - Get current usage status
 * Returns plan limits, current usage, and remaining capacity
 */
app.get('/tenants/:tenantId/usage', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const { getMeteringService, isMeteringEnabled, getTenantStore } = await import('@gwi/core');

    if (!isMeteringEnabled()) {
      return res.status(501).json({ error: 'Metering not enabled', code: 'METERING_DISABLED' });
    }

    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(tenantId);
    const planId = (tenant?.plan || 'free') as string;

    const meteringService = getMeteringService();
    meteringService.setTenantPlan(tenantId, planId);

    const status = await meteringService.getPlanUsageStatus(tenantId);

    res.json({
      plan: {
        id: status.plan.id,
        name: status.plan.name,
        tier: status.plan.tier,
      },
      usage: {
        tokens: {
          used: status.plan.token_limit - status.tokens_remaining,
          limit: status.plan.token_limit,
          remaining: status.tokens_remaining,
          percent: status.token_usage_percent,
        },
        runs: {
          used: status.plan.run_limit - status.runs_remaining,
          limit: status.plan.run_limit,
          remaining: status.runs_remaining,
          percent: status.run_usage_percent,
        },
      },
      limits: {
        softLimitReached: status.soft_limit_reached,
        hardLimitReached: status.hard_limit_reached,
      },
      periodResetsAt: status.period_resets_at,
    });
  } catch (error) {
    console.error('Failed to get usage:', error);
    res.status(500).json({
      error: 'Failed to get usage',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/usage/aggregate - Get detailed usage aggregate
 * Returns breakdown by provider, model, and time period
 */
app.get('/tenants/:tenantId/usage/aggregate', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;
  const { start, end } = req.query;

  try {
    const { getMeteringService, isMeteringEnabled, getTenantStore } = await import('@gwi/core');

    if (!isMeteringEnabled()) {
      return res.status(501).json({ error: 'Metering not enabled', code: 'METERING_DISABLED' });
    }

    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(tenantId);
    const planId = (tenant?.plan || 'free') as string;

    const meteringService = getMeteringService();
    meteringService.setTenantPlan(tenantId, planId);

    let aggregate;
    if (start && end) {
      aggregate = await meteringService.computeAggregate(
        tenantId,
        new Date(start as string),
        new Date(end as string)
      );
    } else {
      aggregate = await meteringService.getCurrentAggregate(tenantId);
    }

    res.json({
      tenantId: aggregate.tenant_id,
      period: {
        start: aggregate.period_start,
        end: aggregate.period_end,
      },
      summary: {
        totalRuns: aggregate.total_runs,
        totalLlmCalls: aggregate.total_llm_calls,
        totalTokens: aggregate.total_tokens,
        totalLatencyMs: aggregate.total_latency_ms,
        totalCostUsd: aggregate.total_cost_usd,
      },
      byProvider: aggregate.by_provider,
      byModel: aggregate.by_model,
      updatedAt: aggregate.updated_at,
    });
  } catch (error) {
    console.error('Failed to get usage aggregate:', error);
    res.status(500).json({
      error: 'Failed to get usage aggregate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /tenants/:tenantId/usage/check - Check if tenant can proceed (budget guardrails)
 * Returns whether the tenant is within limits
 */
app.get('/tenants/:tenantId/usage/check', authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const { getMeteringService, isMeteringEnabled, getTenantStore } = await import('@gwi/core');

    if (!isMeteringEnabled()) {
      // When metering is disabled, always allow
      return res.json({ allowed: true, reason: 'Metering disabled' });
    }

    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(tenantId);
    const planId = (tenant?.plan || 'free') as string;

    const meteringService = getMeteringService();
    meteringService.setTenantPlan(tenantId, planId);

    const result = await meteringService.checkLimits(tenantId);

    res.json({
      allowed: result.allowed,
      reason: result.reason,
      usage: {
        tokens: {
          percent: result.status.token_usage_percent,
          remaining: result.status.tokens_remaining,
        },
        runs: {
          percent: result.status.run_usage_percent,
          remaining: result.status.runs_remaining,
        },
      },
      limits: {
        softLimitReached: result.status.soft_limit_reached,
        hardLimitReached: result.status.hard_limit_reached,
      },
    });
  } catch (error) {
    console.error('Failed to check limits:', error);
    res.status(500).json({
      error: 'Failed to check limits',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /webhooks/stripe - Stripe webhook handler
 */
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ error: 'Stripe not configured' });
  }

  try {
    const { createStripeProvider, getBillingStore } = await import('@gwi/core');
    const stripe = createStripeProvider();
    const _billingStore = getBillingStore();

    // Verify signature
    if (!stripe.verifyWebhookSignature(req.body.toString(), signature)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = stripe.parseWebhookEvent(req.body.toString(), signature);

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        console.log(JSON.stringify({
          type: 'stripe_webhook',
          event: event.type,
          subscriptionId: subscription.id,
          status: subscription.status,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        console.log(JSON.stringify({
          type: 'stripe_webhook',
          event: event.type,
          subscriptionId: subscription.id,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;
        console.log(JSON.stringify({
          type: 'stripe_webhook',
          event: event.type,
          invoiceId: invoice.id,
          amount: invoice.amount_paid,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        console.log(JSON.stringify({
          type: 'stripe_webhook',
          event: event.type,
          invoiceId: invoice.id,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      default:
        console.log(JSON.stringify({
          type: 'stripe_webhook',
          event: event.type,
          timestamp: new Date().toISOString(),
        }));
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({
      error: 'Webhook error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Routes: Templates + Instances + Schedules (Phase 13)
// =============================================================================

import {
  getTemplateRegistry,
  validateTemplateInputs,
  applyTemplateDefaults,
  type WorkflowTemplate,
} from '@gwi/core';
import { InMemoryInstanceStore, InMemoryScheduleStore } from '@gwi/core';

// In-memory stores for Phase 13 (will be replaced with Firestore)
const instanceStore = new InMemoryInstanceStore();
const scheduleStore = new InMemoryScheduleStore();

/**
 * GET /v1/templates - List available workflow templates
 */
app.get('/v1/templates', authMiddleware, async (req, res) => {
  try {
    const registry = getTemplateRegistry();
    const category = req.query.category as string | undefined;
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;

    const templates = registry.list({
      category: category as WorkflowTemplate['category'],
      enabled: true,
      tags,
    });

    res.json({
      templates: templates.map(t => ({
        id: t.id,
        version: t.version,
        displayName: t.displayName,
        description: t.description,
        category: t.category,
        tags: t.tags,
        requiredConnectors: t.requiredConnectors,
      })),
      count: templates.length,
    });
  } catch (error) {
    console.error('Failed to list templates:', error);
    res.status(500).json({
      error: 'Failed to list templates',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/templates/:templateId - Get template details
 */
app.get('/v1/templates/:templateId', authMiddleware, async (req, res) => {
  try {
    const { templateId } = req.params;
    const registry = getTemplateRegistry();
    const template = registry.getByRef(templateId);

    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        templateId,
      });
    }

    res.json(template);
  } catch (error) {
    console.error('Failed to get template:', error);
    res.status(500).json({
      error: 'Failed to get template',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Instance creation schema
 */
const CreateInstanceSchema = z.object({
  templateRef: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  configuredInputs: z.record(z.unknown()).default({}),
  connectorBindings: z.array(z.object({
    requirementId: z.string(),
    connectorConfigId: z.string(),
  })).default([]),
});

/**
 * POST /v1/tenants/:tenantId/instances - Create a workflow instance
 */
app.post('/v1/tenants/:tenantId/instances', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:update'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId } = req.params;

  const parseResult = CreateInstanceSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  try {
    const input = parseResult.data;
    const registry = getTemplateRegistry();
    const template = registry.getByRef(input.templateRef);

    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        templateRef: input.templateRef,
      });
    }

    // Apply defaults and validate inputs
    const inputsWithDefaults = applyTemplateDefaults(template, input.configuredInputs);
    const validation = validateTemplateInputs(template, inputsWithDefaults);

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid template inputs',
        validationErrors: validation.errors,
      });
    }

    // Create instance
    const instance = await instanceStore.createInstance({
      tenantId,
      templateRef: `${template.id}@${template.version}`,
      name: input.name,
      description: input.description,
      configuredInputs: inputsWithDefaults,
      connectorBindings: input.connectorBindings,
      enabled: true,
      createdBy: req.context!.userId,
    });

    console.log(JSON.stringify({
      type: 'instance_created',
      instanceId: instance.id,
      tenantId,
      templateRef: instance.templateRef,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json(instance);
  } catch (error) {
    console.error('Failed to create instance:', error);
    res.status(500).json({
      error: 'Failed to create instance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/tenants/:tenantId/instances - List workflow instances
 */
app.get('/v1/tenants/:tenantId/instances', authMiddleware, tenantAuthMiddleware, requirePermission('tenant:read'), async (req, res) => {
  const { tenantId } = req.params;

  try {
    const instances = await instanceStore.listInstances(tenantId, {
      templateRef: req.query.templateRef as string | undefined,
      enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    });

    res.json({
      instances,
      count: instances.length,
    });
  } catch (error) {
    console.error('Failed to list instances:', error);
    res.status(500).json({
      error: 'Failed to list instances',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/instances/:instanceId - Get instance details
 */
app.get('/v1/instances/:instanceId', authMiddleware, async (req, res) => {
  const { instanceId } = req.params;

  try {
    const instance = await instanceStore.getInstance(instanceId);

    if (!instance) {
      return res.status(404).json({
        error: 'Instance not found',
        instanceId,
      });
    }

    // Check tenant access
    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, instance.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this instance',
      });
    }

    res.json(instance);
  } catch (error) {
    console.error('Failed to get instance:', error);
    res.status(500).json({
      error: 'Failed to get instance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/instances/:instanceId/run - Trigger a workflow run
 */
app.post('/v1/instances/:instanceId/run', authMiddleware, idempotencyMiddleware({
  getTenantId: (req) => req.params.instanceId,
}), async (req, res) => {
  const { instanceId } = req.params;

  try {
    const instance = await instanceStore.getInstance(instanceId);

    if (!instance) {
      return res.status(404).json({
        error: 'Instance not found',
        instanceId,
      });
    }

    // Check tenant access
    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, instance.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this instance',
      });
    }

    // Check permission (DEVELOPER+ to run)
    const roleNum = membership.role === 'owner' ? 100 : membership.role === 'admin' ? 50 : 10;
    if (roleNum < 30) { // DEVELOPER = 30
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You need DEVELOPER permission to run workflows',
      });
    }

    if (!instance.enabled) {
      return res.status(400).json({
        error: 'Instance disabled',
        message: 'This workflow instance is currently disabled',
      });
    }

    // Check plan limits
    const tenantStore = getTenantStore();
    const tenant = await tenantStore.getTenant(instance.tenantId);
    if (tenant) {
      const planId = (tenant.plan || 'free') as PlanId;
      const store = getStore();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const runsThisMonth = await store.countRuns(instance.tenantId, monthStart.toISOString());
      const limitCheck = checkRunLimit(runsThisMonth, planId);

      if (!limitCheck.allowed) {
        console.log(JSON.stringify({
          type: 'run_rejected_plan_limit',
          tenantId: instance.tenantId,
          instanceId,
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
          reason: limitCheck.reason,
          timestamp: new Date().toISOString(),
        }));
        return res.status(429).json({
          error: 'Plan limit reached',
          message: limitCheck.reason,
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
        });
      }
    }

    // Get template
    const registry = getTemplateRegistry();
    const template = registry.getByRef(instance.templateRef);

    if (!template) {
      return res.status(500).json({
        error: 'Template not found',
        message: 'The template for this instance no longer exists',
      });
    }

    // Create a run using existing engine infrastructure
    const store = getStore();
    const run = await store.createRun(instance.tenantId, {
      prId: `instance-${instanceId}`,
      prUrl: `gwi://instances/${instanceId}`,
      type: 'autopilot',
      status: 'pending',
      steps: [],
      trigger: {
        source: 'api',
        userId: req.context!.userId,
        commandText: `run instance ${instanceId}`,
      },
      tenantId: instance.tenantId,
      repoId: 'workflow-instance',
    });

    // Update instance stats
    await instanceStore.incrementRunCount(instanceId);
    await instanceStore.updateLastRun(instanceId, new Date());

    console.log(JSON.stringify({
      type: 'instance_run_triggered',
      instanceId,
      runId: run.id,
      tenantId: instance.tenantId,
      templateRef: instance.templateRef,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json({
      runId: run.id,
      instanceId,
      status: run.status,
      createdAt: run.createdAt,
    });
  } catch (error) {
    console.error('Failed to trigger run:', error);
    res.status(500).json({
      error: 'Failed to trigger run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Schedule creation schema
 */
const CreateScheduleSchema = z.object({
  cronExpression: z.string().regex(/^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)$/, 'Invalid cron expression'),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
});

/**
 * POST /v1/instances/:instanceId/schedules - Create a schedule
 */
app.post('/v1/instances/:instanceId/schedules', authMiddleware, idempotencyMiddleware({
  getTenantId: (req) => req.params.instanceId,
}), async (req, res) => {
  const { instanceId } = req.params;

  const parseResult = CreateScheduleSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  try {
    const instance = await instanceStore.getInstance(instanceId);

    if (!instance) {
      return res.status(404).json({
        error: 'Instance not found',
        instanceId,
      });
    }

    // Check tenant access (ADMIN+ to create schedules)
    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, instance.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const roleNum = membership.role === 'owner' ? 100 : membership.role === 'admin' ? 50 : 10;
    if (roleNum < 50) { // ADMIN = 50
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You need ADMIN permission to create schedules',
      });
    }

    const input = parseResult.data;

    // Calculate next trigger time (simplified - in production use a cron library)
    const nextTriggerAt = new Date(Date.now() + 60000); // Placeholder: 1 minute from now

    const schedule = await scheduleStore.createSchedule({
      instanceId,
      tenantId: instance.tenantId,
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      enabled: input.enabled,
      nextTriggerAt,
      createdBy: req.context!.userId,
    });

    console.log(JSON.stringify({
      type: 'schedule_created',
      scheduleId: schedule.id,
      instanceId,
      tenantId: instance.tenantId,
      cronExpression: input.cronExpression,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json(schedule);
  } catch (error) {
    console.error('Failed to create schedule:', error);
    res.status(500).json({
      error: 'Failed to create schedule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/instances/:instanceId/schedules - List schedules for an instance
 */
app.get('/v1/instances/:instanceId/schedules', authMiddleware, async (req, res) => {
  const { instanceId } = req.params;

  try {
    const instance = await instanceStore.getInstance(instanceId);

    if (!instance) {
      return res.status(404).json({
        error: 'Instance not found',
        instanceId,
      });
    }

    // Check tenant access
    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, instance.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const schedules = await scheduleStore.listSchedules(instanceId);

    res.json({
      schedules,
      count: schedules.length,
    });
  } catch (error) {
    console.error('Failed to list schedules:', error);
    res.status(500).json({
      error: 'Failed to list schedules',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /v1/schedules/:scheduleId - Delete a schedule
 */
app.delete('/v1/schedules/:scheduleId', authMiddleware, async (req, res) => {
  const { scheduleId } = req.params;

  try {
    const schedule = await scheduleStore.getSchedule(scheduleId);

    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found',
        scheduleId,
      });
    }

    // Check tenant access (ADMIN+ to delete)
    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, schedule.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const roleNum = membership.role === 'owner' ? 100 : membership.role === 'admin' ? 50 : 10;
    if (roleNum < 50) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You need ADMIN permission to delete schedules',
      });
    }

    await scheduleStore.deleteSchedule(scheduleId);

    console.log(JSON.stringify({
      type: 'schedule_deleted',
      scheduleId,
      tenantId: schedule.tenantId,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    res.status(500).json({
      error: 'Failed to delete schedule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Phase 14: Signal and PR Queue Routes
// =============================================================================

import {
  getSignalStore,
  getWorkItemStore,
  getPRCandidateStore,
  SignalProcessor,
  createCandidateIntentReceipt,
  assessCandidateRisk,
  type SignalSource,
  type WorkItemStatus,
} from '@gwi/core';

// Initialize Phase 14 stores
const signalStore = getSignalStore();
const workItemStore = getWorkItemStore();
const prCandidateStore = getPRCandidateStore();

// Request schemas for Phase 14
const CreateSignalSchema = z.object({
  source: z.enum(['github_issue', 'github_pr', 'github_comment', 'webhook', 'scheduled', 'manual', 'api']),
  externalId: z.string(),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.unknown()),
  context: z.object({
    repo: z.object({
      owner: z.string(),
      name: z.string(),
      fullName: z.string(),
      id: z.number().optional(),
    }).optional(),
    resourceNumber: z.number().optional(),
    resourceType: z.enum(['issue', 'pr', 'comment', 'commit']).optional(),
    resourceUrl: z.string().optional(),
    actor: z.string().optional(),
    action: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
  }).optional(),
});

const UpdateWorkItemSchema = z.object({
  status: z.enum(['queued', 'in_progress', 'awaiting_approval', 'approved', 'rejected', 'completed', 'dismissed']).optional(),
  assignedTo: z.string().optional(),
});

const GenerateCandidateSchema = z.object({
  planSummary: z.string(),
  steps: z.array(z.object({
    order: z.number(),
    description: z.string(),
    files: z.array(z.string()).optional(),
    action: z.enum(['create', 'modify', 'delete', 'review', 'test']),
  })),
  affectedFiles: z.array(z.string()),
  complexity: z.number().min(1).max(5),
  estimatedMinutes: z.number().optional(),
});

const ApproveCandidateSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  comment: z.string().optional(),
});

/**
 * POST /v1/tenants/:tenantId/signals - Create a signal (DEVELOPER+)
 */
app.post('/v1/tenants/:tenantId/signals', authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId } = req.params;

  const parseResult = CreateSignalSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const existing = await signalStore.getSignalByExternalId(
      tenantId,
      input.source as SignalSource,
      input.externalId
    );
    if (existing) {
      return res.status(409).json({
        error: 'Signal already exists',
        signalId: existing.id,
        status: existing.status,
      });
    }

    const signal = await signalStore.createSignal({
      tenantId,
      source: input.source as SignalSource,
      externalId: input.externalId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      status: 'pending',
      payload: input.payload,
      context: input.context || {},
    });

    console.log(JSON.stringify({
      type: 'signal_created',
      signalId: signal.id,
      tenantId,
      source: input.source,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json(signal);
  } catch (error) {
    console.error('Failed to create signal:', error);
    res.status(500).json({
      error: 'Failed to create signal',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/tenants/:tenantId/signals - List signals (VIEWER+)
 */
app.get('/v1/tenants/:tenantId/signals', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { tenantId } = req.params;
  const { source, status, limit, offset } = req.query;

  try {
    const signals = await signalStore.listSignals(tenantId, {
      source: source as SignalSource | undefined,
      status: status as 'pending' | 'processed' | 'ignored' | 'failed' | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json({
      signals,
      count: signals.length,
    });
  } catch (error) {
    console.error('Failed to list signals:', error);
    res.status(500).json({
      error: 'Failed to list signals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/tenants/:tenantId/signals/process - Process pending signals (DEVELOPER+)
 */
app.post('/v1/tenants/:tenantId/signals/process', authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), async (req, res) => {
  const { tenantId } = req.params;
  const { limit } = req.query;

  try {
    const processor = new SignalProcessor(signalStore, workItemStore);
    const result = await processor.processPendingSignals(
      tenantId,
      limit ? parseInt(limit as string, 10) : 100
    );

    console.log(JSON.stringify({
      type: 'signals_processed',
      tenantId,
      ...result,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json(result);
  } catch (error) {
    console.error('Failed to process signals:', error);
    res.status(500).json({
      error: 'Failed to process signals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/tenants/:tenantId/queue - Get PR queue (work items) (VIEWER+)
 */
app.get('/v1/tenants/:tenantId/queue', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { tenantId } = req.params;
  const { status, type, repo, assignedTo, minScore, limit, offset } = req.query;

  try {
    let statusFilter: WorkItemStatus | WorkItemStatus[] | undefined;
    if (status) {
      const statuses = (status as string).split(',') as WorkItemStatus[];
      statusFilter = statuses.length === 1 ? statuses[0] : statuses;
    }

    const items = await workItemStore.listWorkItems(tenantId, {
      status: statusFilter,
      type: type as 'issue_to_code' | 'pr_review' | 'pr_resolve' | 'docs_update' | 'test_gen' | 'custom' | undefined,
      repo: repo as string | undefined,
      assignedTo: assignedTo as string | undefined,
      minScore: minScore ? parseInt(minScore as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    const stats = await workItemStore.getQueueStats(tenantId);

    res.json({
      items,
      count: items.length,
      stats,
    });
  } catch (error) {
    console.error('Failed to list queue:', error);
    res.status(500).json({
      error: 'Failed to list queue',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/tenants/:tenantId/queue/:itemId - Get work item details (VIEWER+)
 */
app.get('/v1/tenants/:tenantId/queue/:itemId', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { tenantId, itemId } = req.params;

  try {
    const item = await workItemStore.getWorkItem(itemId);

    if (!item) {
      return res.status(404).json({
        error: 'Work item not found',
        itemId,
      });
    }

    if (item.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const signals = await Promise.all(
      item.signalIds.map(id => signalStore.getSignal(id))
    );

    let candidate = null;
    if (item.candidateId) {
      candidate = await prCandidateStore.getCandidate(item.candidateId);
    }

    res.json({
      item,
      signals: signals.filter(Boolean),
      candidate,
    });
  } catch (error) {
    console.error('Failed to get work item:', error);
    res.status(500).json({
      error: 'Failed to get work item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /v1/tenants/:tenantId/queue/:itemId - Update work item (DEVELOPER+)
 */
app.patch('/v1/tenants/:tenantId/queue/:itemId', authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), async (req, res) => {
  const { tenantId, itemId } = req.params;

  const parseResult = UpdateWorkItemSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  try {
    const item = await workItemStore.getWorkItem(itemId);

    if (!item) {
      return res.status(404).json({
        error: 'Work item not found',
        itemId,
      });
    }

    if (item.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const updated = await workItemStore.updateWorkItem(itemId, parseResult.data);

    console.log(JSON.stringify({
      type: 'work_item_updated',
      itemId,
      tenantId,
      changes: parseResult.data,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json(updated);
  } catch (error) {
    console.error('Failed to update work item:', error);
    res.status(500).json({
      error: 'Failed to update work item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/tenants/:tenantId/queue/:itemId/dismiss - Dismiss work item (DEVELOPER+)
 */
app.post('/v1/tenants/:tenantId/queue/:itemId/dismiss', authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId, itemId } = req.params;

  try {
    const item = await workItemStore.getWorkItem(itemId);

    if (!item) {
      return res.status(404).json({
        error: 'Work item not found',
        itemId,
      });
    }

    if (item.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const updated = await workItemStore.updateWorkItem(itemId, { status: 'dismissed' });

    console.log(JSON.stringify({
      type: 'work_item_dismissed',
      itemId,
      tenantId,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json(updated);
  } catch (error) {
    console.error('Failed to dismiss work item:', error);
    res.status(500).json({
      error: 'Failed to dismiss work item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/tenants/:tenantId/queue/:itemId/candidate - Generate PR candidate (DEVELOPER+)
 */
app.post('/v1/tenants/:tenantId/queue/:itemId/candidate', authMiddleware, tenantAuthMiddleware, requirePermission('run:create'), idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
}), async (req, res) => {
  const { tenantId, itemId } = req.params;

  const parseResult = GenerateCandidateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const item = await workItemStore.getWorkItem(itemId);

    if (!item) {
      return res.status(404).json({
        error: 'Work item not found',
        itemId,
      });
    }

    if (item.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    if (item.candidateId) {
      const existing = await prCandidateStore.getCandidate(item.candidateId);
      if (existing && existing.status !== 'rejected' && existing.status !== 'failed') {
        return res.status(409).json({
          error: 'Candidate already exists',
          candidateId: existing.id,
          status: existing.status,
        });
      }
    }

    const plan = {
      summary: input.planSummary,
      steps: input.steps,
      complexity: input.complexity,
      affectedFiles: input.affectedFiles,
      estimatedMinutes: input.estimatedMinutes,
    };

    const risk = assessCandidateRisk(plan, item);
    const intentReceipt = createCandidateIntentReceipt(item, plan, req.context!.userId);
    const requiredApprovals = risk.level === 'critical' ? 2 : risk.level === 'high' ? 2 : 1;

    const candidate = await prCandidateStore.createCandidate({
      workItemId: itemId,
      tenantId,
      status: 'ready',
      plan,
      risk,
      confidence: 100 - risk.score,
      requiredApprovals,
      intentReceipt,
    });

    await workItemStore.updateWorkItem(itemId, {
      candidateId: candidate.id,
      status: 'awaiting_approval',
    });

    console.log(JSON.stringify({
      type: 'candidate_generated',
      candidateId: candidate.id,
      workItemId: itemId,
      tenantId,
      riskLevel: risk.level,
      requiredApprovals,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.status(201).json(candidate);
  } catch (error) {
    console.error('Failed to generate candidate:', error);
    res.status(500).json({
      error: 'Failed to generate candidate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/tenants/:tenantId/candidates - List PR candidates (VIEWER+)
 */
app.get('/v1/tenants/:tenantId/candidates', authMiddleware, tenantAuthMiddleware, requirePermission('run:read'), async (req, res) => {
  const { tenantId } = req.params;
  const { status, workItemId, limit, offset } = req.query;

  try {
    let statusFilter: string | string[] | undefined;
    if (status) {
      const statuses = (status as string).split(',');
      statusFilter = statuses.length === 1 ? statuses[0] : statuses;
    }

    const candidates = await prCandidateStore.listCandidates(tenantId, {
      status: statusFilter as any,
      workItemId: workItemId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json({
      candidates,
      count: candidates.length,
    });
  } catch (error) {
    console.error('Failed to list candidates:', error);
    res.status(500).json({
      error: 'Failed to list candidates',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/candidates/:candidateId - Get candidate details
 */
app.get('/v1/candidates/:candidateId', authMiddleware, async (req, res) => {
  const { candidateId } = req.params;

  try {
    const candidate = await prCandidateStore.getCandidate(candidateId);

    if (!candidate) {
      return res.status(404).json({
        error: 'Candidate not found',
        candidateId,
      });
    }

    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, candidate.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const workItem = await workItemStore.getWorkItem(candidate.workItemId);

    res.json({
      candidate,
      workItem,
    });
  } catch (error) {
    console.error('Failed to get candidate:', error);
    res.status(500).json({
      error: 'Failed to get candidate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/candidates/:candidateId/approve - Approve/reject candidate (DEVELOPER+)
 */
app.post('/v1/candidates/:candidateId/approve', authMiddleware, idempotencyMiddleware({
  getTenantId: (req) => req.params.candidateId,
}), async (req, res) => {
  const { candidateId } = req.params;

  const parseResult = ApproveCandidateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.errors,
    });
  }

  const input = parseResult.data;

  try {
    const candidate = await prCandidateStore.getCandidate(candidateId);

    if (!candidate) {
      return res.status(404).json({
        error: 'Candidate not found',
        candidateId,
      });
    }

    const membershipStore = getMembershipStore();
    const membership = await membershipStore.getMembership(req.context!.userId, candidate.tenantId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    const roleNum = membership.role === 'owner' ? 100 : membership.role === 'admin' ? 50 : 10;
    if (roleNum < 10) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You need DEVELOPER permission to approve candidates',
      });
    }

    if (candidate.status !== 'ready') {
      return res.status(400).json({
        error: 'Cannot approve candidate',
        message: `Candidate is in '${candidate.status}' state`,
      });
    }

    if (candidate.approvals.some(a => a.userId === req.context!.userId)) {
      return res.status(409).json({
        error: 'Already voted',
        message: 'You have already submitted a decision for this candidate',
      });
    }

    const updated = await prCandidateStore.addApproval(candidateId, {
      userId: req.context!.userId,
      decision: input.decision,
      comment: input.comment,
      timestamp: new Date(),
    });

    if (updated.status === 'approved') {
      await workItemStore.updateWorkItem(candidate.workItemId, { status: 'approved' });
    } else if (updated.status === 'rejected') {
      await workItemStore.updateWorkItem(candidate.workItemId, { status: 'rejected' });
    }

    console.log(JSON.stringify({
      type: 'candidate_approval',
      candidateId,
      workItemId: candidate.workItemId,
      tenantId: candidate.tenantId,
      decision: input.decision,
      newStatus: updated.status,
      userId: req.context!.userId,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      candidate: updated,
      message: input.decision === 'approved' ? 'Approval recorded' : input.decision === 'rejected' ? 'Candidate rejected' : 'Changes requested',
    });
  } catch (error) {
    console.error('Failed to approve candidate:', error);
    res.status(500).json({
      error: 'Failed to approve candidate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
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

// Only start server if not in test mode (tests import app directly)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(JSON.stringify({
      type: 'startup',
      app: config.appName,
      version: config.appVersion,
      env: config.env,
      storeBackend: config.storeBackend,
      port: PORT,
      timestamp: new Date().toISOString(),
    }));
  });
}

export { app };
