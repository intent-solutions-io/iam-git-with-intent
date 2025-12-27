/**
 * Tenant Management Module
 *
 * Epic E: RBAC & Governance
 *
 * Provides comprehensive tenant lifecycle and settings management.
 *
 * @module @gwi/core/tenants
 */

// Lifecycle management
export {
  TenantLifecycleService,
  createTenantLifecycleService,
  type CreateTenantParams,
  type UpdatePlanParams,
  type SuspendTenantParams,
  type TenantStatusReport,
  CreateTenantParamsSchema,
  UpdatePlanParamsSchema,
  SuspendTenantParamsSchema,
  PLAN_LIMITS,
} from './lifecycle.js';

// Settings management
export {
  TenantSettingsService,
  createTenantSettingsService,
  type ExtendedTenantSettings,
  type UpdateTenantSettingsParams,
  TenantSettingsSchema,
  ExtendedTenantSettingsSchema,
  UpdateTenantSettingsSchema,
  DEFAULT_SETTINGS,
  getDefaultSettings,
} from './settings.js';

// API routes
export {
  createTenantRoutes,
  registerTenantRoutes,
  type TenantRoutesConfig,
} from './routes.js';
