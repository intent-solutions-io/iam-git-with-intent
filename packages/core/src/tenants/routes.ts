/**
 * Tenant Lifecycle API Routes
 *
 * Epic E: RBAC & Governance
 *
 * Express route handlers for tenant lifecycle management:
 * - GET /api/v1/tenants/:id - Get tenant details
 * - PATCH /api/v1/tenants/:id - Update tenant
 * - POST /api/v1/tenants/:id/suspend - Suspend tenant
 * - POST /api/v1/tenants/:id/activate - Activate tenant
 * - DELETE /api/v1/tenants/:id - Soft delete tenant
 * - GET /api/v1/tenants/:id/settings - Get settings
 * - PATCH /api/v1/tenants/:id/settings - Update settings
 * - POST /api/v1/tenants/:id/plan - Update plan
 * - GET /api/v1/tenants/:id/status - Get detailed status
 *
 * All endpoints enforce RBAC using middleware from @gwi/core/security/rbac
 *
 * @module @gwi/core/tenants/routes
 */

import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { TenantStore, AuditStore, MembershipStore } from '../storage/interfaces.js';
import {
  TenantLifecycleService,
  UpdatePlanParamsSchema,
  SuspendTenantParamsSchema,
} from './lifecycle.js';
import {
  TenantSettingsService,
  UpdateTenantSettingsSchema,
} from './settings.js';
import {
  expressRequireAuth,
  expressRequirePermission,
  type RBACRequest,
} from '../security/rbac.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('tenant-routes');

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Activate tenant request schema
 */
const ActivateTenantSchema = z.object({
  activatedBy: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * Delete tenant request schema
 */
const DeleteTenantSchema = z.object({
  deletedBy: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * Hard delete tenant request schema
 */
const HardDeleteTenantSchema = z.object({
  deletedBy: z.string().min(1),
  confirmationToken: z.string().min(1),
});

/**
 * Pause tenant request schema
 */
const PauseTenantSchema = z.object({
  pausedBy: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * Reset settings request schema
 */
const ResetSettingsSchema = z.object({
  resetBy: z.string().min(1),
});

// =============================================================================
// Route Handler Factory
// =============================================================================

/**
 * Configuration for tenant routes
 */
export interface TenantRoutesConfig {
  tenantStore: TenantStore;
  auditStore?: AuditStore;
  membershipStore?: MembershipStore;
  enableAudit?: boolean;
}

/**
 * Create tenant lifecycle API route handlers
 *
 * Usage:
 * ```typescript
 * const routes = createTenantRoutes({
 *   tenantStore: myTenantStore,
 *   auditStore: myAuditStore,
 *   membershipStore: myMembershipStore,
 * });
 *
 * app.get('/api/v1/tenants/:id', ...routes.getTenant);
 * app.patch('/api/v1/tenants/:id', ...routes.updateTenant);
 * ```
 */
export function createTenantRoutes(config: TenantRoutesConfig) {
  const lifecycleService = new TenantLifecycleService(
    config.tenantStore,
    config.auditStore,
    config.membershipStore,
    { enableAudit: config.enableAudit ?? true }
  );

  const settingsService = new TenantSettingsService(
    config.tenantStore,
    config.auditStore,
    { enableAudit: config.enableAudit ?? true }
  );

  // ===========================================================================
  // GET /api/v1/tenants/:id - Get tenant details
  // ===========================================================================

  const getTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:read'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;

        logger.debug('GET /api/v1/tenants/:id', {
          eventName: 'api.tenants.get',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const tenant = await config.tenantStore.getTenant(id);
        if (!tenant) {
          res.status(404).json({ error: 'Tenant not found' });
          return;
        }

        res.json({ tenant });
      } catch (error) {
        logger.error('Failed to get tenant', {
          eventName: 'api.tenants.get.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to get tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // PATCH /api/v1/tenants/:id - Update tenant
  // ===========================================================================

  const updateTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:update'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const updates = req.body;

        logger.info('PATCH /api/v1/tenants/:id', {
          eventName: 'api.tenants.update',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const updated = await config.tenantStore.updateTenant(id, updates);
        res.json({ tenant: updated });
      } catch (error) {
        logger.error('Failed to update tenant', {
          eventName: 'api.tenants.update.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to update tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // POST /api/v1/tenants/:id/suspend - Suspend tenant
  // ===========================================================================

  const suspendTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:update'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const params = SuspendTenantParamsSchema.parse(req.body);

        logger.info('POST /api/v1/tenants/:id/suspend', {
          eventName: 'api.tenants.suspend',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const tenant = await lifecycleService.suspendTenant(id, params);
        res.json({ tenant });
      } catch (error) {
        logger.error('Failed to suspend tenant', {
          eventName: 'api.tenants.suspend.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to suspend tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // POST /api/v1/tenants/:id/activate - Activate tenant
  // ===========================================================================

  const activateTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:update'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const { activatedBy } = ActivateTenantSchema.parse(req.body);

        logger.info('POST /api/v1/tenants/:id/activate', {
          eventName: 'api.tenants.activate',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const tenant = await lifecycleService.activateTenant(id, activatedBy);
        res.json({ tenant });
      } catch (error) {
        logger.error('Failed to activate tenant', {
          eventName: 'api.tenants.activate.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to activate tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // POST /api/v1/tenants/:id/pause - Pause tenant
  // ===========================================================================

  const pauseTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:update'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const { pausedBy, reason } = PauseTenantSchema.parse(req.body);

        logger.info('POST /api/v1/tenants/:id/pause', {
          eventName: 'api.tenants.pause',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const tenant = await lifecycleService.pauseTenant(id, pausedBy, reason);
        res.json({ tenant });
      } catch (error) {
        logger.error('Failed to pause tenant', {
          eventName: 'api.tenants.pause.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to pause tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // DELETE /api/v1/tenants/:id - Soft delete tenant
  // ===========================================================================

  const deleteTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:delete'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const { deletedBy, reason } = DeleteTenantSchema.parse(req.body);

        logger.warn('DELETE /api/v1/tenants/:id - soft delete', {
          eventName: 'api.tenants.delete',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const tenant = await lifecycleService.deleteTenant(id, deletedBy, reason);
        res.json({ tenant, message: 'Tenant soft deleted (recoverable)' });
      } catch (error) {
        logger.error('Failed to delete tenant', {
          eventName: 'api.tenants.delete.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to delete tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // POST /api/v1/tenants/:id/hard-delete - Permanently delete tenant
  // ===========================================================================

  const hardDeleteTenant = [
    expressRequireAuth(),
    expressRequirePermission('tenant:delete'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const { deletedBy, confirmationToken } = HardDeleteTenantSchema.parse(req.body);

        logger.warn('POST /api/v1/tenants/:id/hard-delete - IRREVERSIBLE', {
          eventName: 'api.tenants.hard_delete',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        await lifecycleService.hardDeleteTenant(id, deletedBy, confirmationToken);
        res.json({ message: 'Tenant permanently deleted' });
      } catch (error) {
        logger.error('Failed to hard delete tenant', {
          eventName: 'api.tenants.hard_delete.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to hard delete tenant',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // GET /api/v1/tenants/:id/settings - Get tenant settings
  // ===========================================================================

  const getTenantSettings = [
    expressRequireAuth(),
    expressRequirePermission('settings:read'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;

        logger.debug('GET /api/v1/tenants/:id/settings', {
          eventName: 'api.tenants.settings.get',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const settings = await settingsService.getTenantSettings(id);
        res.json({ settings });
      } catch (error) {
        logger.error('Failed to get tenant settings', {
          eventName: 'api.tenants.settings.get.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to get tenant settings',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // PATCH /api/v1/tenants/:id/settings - Update tenant settings
  // ===========================================================================

  const updateTenantSettings = [
    expressRequireAuth(),
    expressRequirePermission('settings:update'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const updates = UpdateTenantSettingsSchema.parse(req.body);
        const updatedBy = req.rbacContext?.userId || 'unknown';

        logger.info('PATCH /api/v1/tenants/:id/settings', {
          eventName: 'api.tenants.settings.update',
          tenantId: id,
          userId: updatedBy,
        });

        const settings = await settingsService.updateTenantSettings(id, updates, updatedBy);
        res.json({ settings });
      } catch (error) {
        logger.error('Failed to update tenant settings', {
          eventName: 'api.tenants.settings.update.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to update tenant settings',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // POST /api/v1/tenants/:id/settings/reset - Reset settings to defaults
  // ===========================================================================

  const resetTenantSettings = [
    expressRequireAuth(),
    expressRequirePermission('settings:update'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const { resetBy } = ResetSettingsSchema.parse(req.body);

        logger.info('POST /api/v1/tenants/:id/settings/reset', {
          eventName: 'api.tenants.settings.reset',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const settings = await settingsService.resetTenantSettings(id, resetBy);
        res.json({ settings, message: 'Settings reset to defaults' });
      } catch (error) {
        logger.error('Failed to reset tenant settings', {
          eventName: 'api.tenants.settings.reset.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to reset tenant settings',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // POST /api/v1/tenants/:id/plan - Update tenant plan
  // ===========================================================================

  const updateTenantPlan = [
    expressRequireAuth(),
    expressRequirePermission('tenant:billing'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const params = UpdatePlanParamsSchema.parse(req.body);
        const updatedBy = req.rbacContext?.userId || 'unknown';

        logger.info('POST /api/v1/tenants/:id/plan', {
          eventName: 'api.tenants.plan.update',
          tenantId: id,
          userId: updatedBy,
          newPlan: params.newPlan,
        });

        const tenant = await lifecycleService.updateTenantPlan(id, params, updatedBy);
        res.json({ tenant });
      } catch (error) {
        logger.error('Failed to update tenant plan', {
          eventName: 'api.tenants.plan.update.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(error instanceof z.ZodError ? 400 : 500).json({
          error: 'Failed to update tenant plan',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // GET /api/v1/tenants/:id/status - Get detailed tenant status
  // ===========================================================================

  const getTenantStatus = [
    expressRequireAuth(),
    expressRequirePermission('tenant:read'),
    async (req: RBACRequest & Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;

        logger.debug('GET /api/v1/tenants/:id/status', {
          eventName: 'api.tenants.status.get',
          tenantId: id,
          userId: req.rbacContext?.userId,
        });

        const status = await lifecycleService.getTenantStatus(id);
        res.json({ status });
      } catch (error) {
        logger.error('Failed to get tenant status', {
          eventName: 'api.tenants.status.get.error',
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: 'Failed to get tenant status',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];

  // ===========================================================================
  // Return all route handlers
  // ===========================================================================

  return {
    getTenant,
    updateTenant,
    suspendTenant,
    activateTenant,
    pauseTenant,
    deleteTenant,
    hardDeleteTenant,
    getTenantSettings,
    updateTenantSettings,
    resetTenantSettings,
    updateTenantPlan,
    getTenantStatus,
  };
}

/**
 * Register tenant routes on an Express router
 *
 * Usage:
 * ```typescript
 * const app = express();
 * registerTenantRoutes(app, {
 *   tenantStore: myTenantStore,
 *   auditStore: myAuditStore,
 *   membershipStore: myMembershipStore,
 * });
 * ```
 */
export function registerTenantRoutes(router: Router, config: TenantRoutesConfig): void {
  const routes = createTenantRoutes(config);

  // Tenant management
  router.get('/api/v1/tenants/:id', ...routes.getTenant as any);
  router.patch('/api/v1/tenants/:id', ...routes.updateTenant as any);
  router.post('/api/v1/tenants/:id/suspend', ...routes.suspendTenant as any);
  router.post('/api/v1/tenants/:id/activate', ...routes.activateTenant as any);
  router.post('/api/v1/tenants/:id/pause', ...routes.pauseTenant as any);
  router.delete('/api/v1/tenants/:id', ...routes.deleteTenant as any);
  router.post('/api/v1/tenants/:id/hard-delete', ...routes.hardDeleteTenant as any);

  // Settings management
  router.get('/api/v1/tenants/:id/settings', ...routes.getTenantSettings as any);
  router.patch('/api/v1/tenants/:id/settings', ...routes.updateTenantSettings as any);
  router.post('/api/v1/tenants/:id/settings/reset', ...routes.resetTenantSettings as any);

  // Plan management
  router.post('/api/v1/tenants/:id/plan', ...routes.updateTenantPlan as any);

  // Status
  router.get('/api/v1/tenants/:id/status', ...routes.getTenantStatus as any);

  logger.info('Tenant lifecycle routes registered', {
    eventName: 'routes.tenants.registered',
    routeCount: 12,
  });
}
