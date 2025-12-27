/**
 * Secrets API Routes
 *
 * Epic E: RBAC & Governance - Secrets Management API
 *
 * Provides REST endpoints for tenant secrets management.
 * All endpoints require ADMIN or OWNER role.
 *
 * SECURITY:
 * - All endpoints require authentication
 * - RBAC enforcement (ADMIN/OWNER only)
 * - Audit logging for all operations
 * - Secret values NEVER logged
 * - Rate limiting on sensitive operations
 *
 * OWASP References:
 * - A01:2021 Broken Access Control: RBAC enforcement
 * - A02:2021 Cryptographic Failures: AES-256-GCM encryption
 * - A07:2021 Security Logging: Audit events
 *
 * Endpoints:
 * - POST   /api/v1/tenants/:tenantId/secrets     - Store a new secret
 * - GET    /api/v1/tenants/:tenantId/secrets     - List secrets (names only)
 * - GET    /api/v1/tenants/:tenantId/secrets/:name - Retrieve secret value (ADMIN/OWNER)
 * - DELETE /api/v1/tenants/:tenantId/secrets/:name - Delete secret
 * - POST   /api/v1/tenants/:tenantId/secrets/:name/rotate - Rotate secret
 *
 * @module @gwi/api/routes/secrets
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  storeSecret,
  retrieveSecret,
  listTenantSecrets,
  deleteSecret,
  rotateSecret,
  type SecretMetadata,
  type Role,
  hasMinimumRole,
} from '@gwi/core';

const router = Router({ mergeParams: true });

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Schema for storing a new secret
 */
const StoreSecretSchema = z.object({
  name: z.string()
    .min(1, 'Secret name is required')
    .max(128, 'Secret name must be 128 characters or less')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      'Secret name must start with a letter and contain only letters, numbers, underscores, and hyphens'
    ),
  value: z.string()
    .min(1, 'Secret value is required')
    .max(1024 * 1024, 'Secret value must be 1MB or less'),
  metadata: z.object({
    description: z.string().max(1000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    expiresAt: z.string().datetime().optional(),
    custom: z.record(z.string().max(500)).optional(),
  }).optional(),
});

/**
 * Schema for rotating a secret
 */
const RotateSecretSchema = z.object({
  value: z.string()
    .min(1, 'New secret value is required')
    .max(1024 * 1024, 'Secret value must be 1MB or less'),
  metadata: z.object({
    description: z.string().max(1000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    expiresAt: z.string().datetime().optional(),
    custom: z.record(z.string().max(500)).optional(),
  }).optional(),
});

// =============================================================================
// Request Types
// =============================================================================

/**
 * Request context with authentication info
 */
interface RequestContext {
  userId: string;
  email?: string;
  tenantId?: string;
  role?: Role;
  isServiceAccount: boolean;
}

/**
 * Extended Request with context
 */
interface AuthenticatedRequest extends Request {
  context?: RequestContext;
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Require ADMIN or OWNER role for secrets operations
 *
 * SECURITY: Secrets are highly sensitive - restrict to admins only
 */
function requireSecretsPermission(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const ctx = req.context;

  if (!ctx) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Service accounts have full permissions
  if (ctx.isServiceAccount) {
    return next();
  }

  if (!ctx.role) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'No role assigned for this tenant',
    });
    return;
  }

  // Require at least ADMIN role
  if (!hasMinimumRole(ctx.role, 'ADMIN')) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Secrets management requires ADMIN or OWNER role',
      requiredRole: 'ADMIN',
      userRole: ctx.role,
    });
    return;
  }

  next();
}

/**
 * Validate request body against schema
 */
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request body',
        details: result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    // Replace body with validated data
    req.body = result.data;
    next();
  };
}

/**
 * Log secrets API access (without values)
 */
function logSecretsAccess(operation: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    console.log(JSON.stringify({
      severity: 'INFO',
      type: 'secrets_api_access',
      operation,
      tenantId: req.params.tenantId,
      secretName: req.params.name,
      userId: req.context?.userId,
      userRole: req.context?.role,
      timestamp: new Date().toISOString(),
      // NEVER log secret values
    }));
    next();
  };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/v1/tenants/:tenantId/secrets
 *
 * Store a new secret
 */
router.post(
  '/',
  requireSecretsPermission,
  logSecretsAccess('store'),
  validateBody(StoreSecretSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.params;
    const { name, value, metadata } = req.body;
    const userId = req.context!.userId;

    try {
      // Parse metadata dates if provided
      let parsedMetadata: SecretMetadata | undefined;
      if (metadata) {
        parsedMetadata = {
          ...metadata,
          expiresAt: metadata.expiresAt ? new Date(metadata.expiresAt) : undefined,
        };
      }

      const result = await storeSecret({
        tenantId,
        name,
        value,
        metadata: parsedMetadata,
        userId,
      });

      res.status(201).json({
        success: true,
        secret: {
          id: result.id,
          name: result.name,
          version: result.version,
          createdAt: result.createdAt.toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Check for duplicate name error
      if (message.includes('already exists')) {
        res.status(409).json({
          error: 'Conflict',
          message: `Secret with name '${name}' already exists`,
        });
        return;
      }

      console.error(JSON.stringify({
        severity: 'ERROR',
        type: 'secrets_store_failed',
        tenantId,
        secretName: name,
        userId,
        error: message,
        timestamp: new Date().toISOString(),
      }));

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to store secret',
      });
    }
  }
);

/**
 * GET /api/v1/tenants/:tenantId/secrets
 *
 * List all secrets for a tenant (names and metadata only, not values)
 */
router.get(
  '/',
  requireSecretsPermission,
  logSecretsAccess('list'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId } = req.params;

    try {
      const secrets = await listTenantSecrets(tenantId);

      res.json({
        success: true,
        secrets: secrets.map(s => ({
          id: s.id,
          name: s.name,
          metadata: s.metadata,
          version: s.version,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          rotatedAt: s.rotatedAt?.toISOString(),
          createdBy: s.createdBy,
          updatedBy: s.updatedBy,
        })),
        count: secrets.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error(JSON.stringify({
        severity: 'ERROR',
        type: 'secrets_list_failed',
        tenantId,
        userId: req.context?.userId,
        error: message,
        timestamp: new Date().toISOString(),
      }));

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list secrets',
      });
    }
  }
);

/**
 * GET /api/v1/tenants/:tenantId/secrets/:name
 *
 * Retrieve a secret value (ADMIN/OWNER only)
 *
 * SECURITY: This endpoint returns the actual secret value.
 * It should be used sparingly and all access is audited.
 */
router.get(
  '/:name',
  requireSecretsPermission,
  logSecretsAccess('retrieve'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId, name } = req.params;
    const userId = req.context!.userId;

    try {
      const value = await retrieveSecret(tenantId, name, userId);

      if (value === null) {
        res.status(404).json({
          error: 'Not Found',
          message: `Secret '${name}' not found`,
        });
        return;
      }

      // Return the secret value
      // WARNING: This is the only endpoint that returns secret values
      res.json({
        success: true,
        name,
        value,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error(JSON.stringify({
        severity: 'ERROR',
        type: 'secrets_retrieve_failed',
        tenantId,
        secretName: name,
        userId,
        error: message,
        timestamp: new Date().toISOString(),
      }));

      // Check for decryption errors
      if (message.includes('Decryption failed')) {
        res.status(500).json({
          error: 'Decryption Error',
          message: 'Failed to decrypt secret. Data may be corrupted.',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve secret',
      });
    }
  }
);

/**
 * DELETE /api/v1/tenants/:tenantId/secrets/:name
 *
 * Delete a secret
 */
router.delete(
  '/:name',
  requireSecretsPermission,
  logSecretsAccess('delete'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId, name } = req.params;
    const userId = req.context!.userId;

    try {
      const deleted = await deleteSecret(tenantId, name, userId);

      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Secret '${name}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        message: `Secret '${name}' deleted successfully`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error(JSON.stringify({
        severity: 'ERROR',
        type: 'secrets_delete_failed',
        tenantId,
        secretName: name,
        userId,
        error: message,
        timestamp: new Date().toISOString(),
      }));

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete secret',
      });
    }
  }
);

/**
 * POST /api/v1/tenants/:tenantId/secrets/:name/rotate
 *
 * Rotate a secret (update value with new value)
 */
router.post(
  '/:name/rotate',
  requireSecretsPermission,
  logSecretsAccess('rotate'),
  validateBody(RotateSecretSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId, name } = req.params;
    const { value, metadata } = req.body;
    const userId = req.context!.userId;

    try {
      // Parse metadata dates if provided
      let parsedMetadata: SecretMetadata | undefined;
      if (metadata) {
        parsedMetadata = {
          ...metadata,
          expiresAt: metadata.expiresAt ? new Date(metadata.expiresAt) : undefined,
        };
      }

      const result = await rotateSecret(tenantId, name, value, userId, parsedMetadata);

      res.json({
        success: true,
        secret: {
          name: result.name,
          version: result.version,
          rotatedAt: result.rotatedAt.toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Check for not found error
      if (message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: `Secret '${name}' not found`,
        });
        return;
      }

      console.error(JSON.stringify({
        severity: 'ERROR',
        type: 'secrets_rotate_failed',
        tenantId,
        secretName: name,
        userId,
        error: message,
        timestamp: new Date().toISOString(),
      }));

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to rotate secret',
      });
    }
  }
);

export default router;

/**
 * Mount secrets routes under /api/v1/tenants/:tenantId/secrets
 *
 * Usage in main app:
 * ```typescript
 * import secretsRoutes from './routes/secrets.js';
 *
 * // Apply auth and tenant middleware first
 * app.use('/api/v1/tenants/:tenantId/secrets', authMiddleware, tenantAuthMiddleware, secretsRoutes);
 * ```
 */
