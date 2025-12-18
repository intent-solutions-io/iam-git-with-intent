/**
 * Phase 65: Admin API
 *
 * Administrative API infrastructure:
 * - Tenant management
 * - User management
 * - System configuration
 * - Metrics and monitoring
 * - Operational controls
 *
 * @module @gwi/core/admin-api
 */

import { z } from 'zod';

// =============================================================================
// ADMIN PERMISSIONS
// =============================================================================

export const AdminPermissions = {
  // Tenant management
  TENANT_READ: 'admin:tenant:read',
  TENANT_CREATE: 'admin:tenant:create',
  TENANT_UPDATE: 'admin:tenant:update',
  TENANT_DELETE: 'admin:tenant:delete',
  TENANT_SUSPEND: 'admin:tenant:suspend',

  // User management
  USER_READ: 'admin:user:read',
  USER_CREATE: 'admin:user:create',
  USER_UPDATE: 'admin:user:update',
  USER_DELETE: 'admin:user:delete',
  USER_IMPERSONATE: 'admin:user:impersonate',

  // System configuration
  CONFIG_READ: 'admin:config:read',
  CONFIG_UPDATE: 'admin:config:update',
  FEATURE_FLAGS: 'admin:feature:manage',

  // Operations
  SYSTEM_METRICS: 'admin:metrics:read',
  SYSTEM_LOGS: 'admin:logs:read',
  SYSTEM_HEALTH: 'admin:health:read',
  MAINTENANCE_MODE: 'admin:maintenance:manage',

  // Billing
  BILLING_READ: 'admin:billing:read',
  BILLING_UPDATE: 'admin:billing:update',
  BILLING_REFUND: 'admin:billing:refund',

  // Security
  SECURITY_AUDIT: 'admin:security:audit',
  API_KEYS_MANAGE: 'admin:apikeys:manage',
  SESSIONS_MANAGE: 'admin:sessions:manage',
} as const;

export type AdminPermission = (typeof AdminPermissions)[keyof typeof AdminPermissions];

// =============================================================================
// ADMIN ROLES
// =============================================================================

export const AdminRoles = {
  SUPER_ADMIN: 'super_admin',
  PLATFORM_ADMIN: 'platform_admin',
  SUPPORT_ADMIN: 'support_admin',
  BILLING_ADMIN: 'billing_admin',
  SECURITY_ADMIN: 'security_admin',
  READ_ONLY_ADMIN: 'read_only_admin',
} as const;

export type AdminRole = (typeof AdminRoles)[keyof typeof AdminRoles];

export const AdminRolePermissions: Record<AdminRole, AdminPermission[]> = {
  super_admin: Object.values(AdminPermissions),
  platform_admin: [
    AdminPermissions.TENANT_READ,
    AdminPermissions.TENANT_CREATE,
    AdminPermissions.TENANT_UPDATE,
    AdminPermissions.TENANT_SUSPEND,
    AdminPermissions.USER_READ,
    AdminPermissions.USER_CREATE,
    AdminPermissions.USER_UPDATE,
    AdminPermissions.CONFIG_READ,
    AdminPermissions.CONFIG_UPDATE,
    AdminPermissions.FEATURE_FLAGS,
    AdminPermissions.SYSTEM_METRICS,
    AdminPermissions.SYSTEM_LOGS,
    AdminPermissions.SYSTEM_HEALTH,
  ],
  support_admin: [
    AdminPermissions.TENANT_READ,
    AdminPermissions.USER_READ,
    AdminPermissions.USER_UPDATE,
    AdminPermissions.USER_IMPERSONATE,
    AdminPermissions.BILLING_READ,
    AdminPermissions.SYSTEM_LOGS,
  ],
  billing_admin: [
    AdminPermissions.TENANT_READ,
    AdminPermissions.USER_READ,
    AdminPermissions.BILLING_READ,
    AdminPermissions.BILLING_UPDATE,
    AdminPermissions.BILLING_REFUND,
  ],
  security_admin: [
    AdminPermissions.TENANT_READ,
    AdminPermissions.USER_READ,
    AdminPermissions.SECURITY_AUDIT,
    AdminPermissions.API_KEYS_MANAGE,
    AdminPermissions.SESSIONS_MANAGE,
    AdminPermissions.SYSTEM_LOGS,
  ],
  read_only_admin: [
    AdminPermissions.TENANT_READ,
    AdminPermissions.USER_READ,
    AdminPermissions.CONFIG_READ,
    AdminPermissions.SYSTEM_METRICS,
    AdminPermissions.SYSTEM_HEALTH,
    AdminPermissions.BILLING_READ,
  ],
};

// =============================================================================
// TENANT MANAGEMENT
// =============================================================================

export interface AdminTenant {
  /** Tenant ID */
  id: string;
  /** Tenant name */
  name: string;
  /** Slug (URL-safe identifier) */
  slug: string;
  /** Status */
  status: 'active' | 'suspended' | 'pending' | 'deleted';
  /** Tier */
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  /** Owner user ID */
  ownerId: string;
  /** Billing email */
  billingEmail: string;
  /** Settings */
  settings: AdminTenantSettings;
  /** Usage */
  usage: TenantUsage;
  /** Limits */
  limits: TenantLimits;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Suspended at */
  suspendedAt?: string;
  /** Suspension reason */
  suspensionReason?: string;
}

export interface AdminTenantSettings {
  /** Allowed auth methods */
  authMethods: ('password' | 'sso' | 'api_key')[];
  /** SSO provider */
  ssoProvider?: string;
  /** SSO config */
  ssoConfig?: Record<string, unknown>;
  /** MFA required */
  mfaRequired: boolean;
  /** IP allowlist */
  ipAllowlist?: string[];
  /** Custom domain */
  customDomain?: string;
  /** Data region */
  dataRegion: string;
  /** Feature flags */
  featureFlags: Record<string, boolean>;
}

export interface TenantUsage {
  /** API calls this month */
  apiCallsThisMonth: number;
  /** Storage used (bytes) */
  storageUsedBytes: number;
  /** Active users */
  activeUsers: number;
  /** Total users */
  totalUsers: number;
  /** Forecasts generated this month */
  forecastsThisMonth: number;
  /** Data points stored */
  dataPointsStored: number;
}

export interface TenantLimits {
  /** Max users */
  maxUsers: number;
  /** Max API calls per month */
  maxApiCallsPerMonth: number;
  /** Max storage (bytes) */
  maxStorageBytes: number;
  /** Max forecasts per month */
  maxForecastsPerMonth: number;
  /** Max data points */
  maxDataPoints: number;
  /** Max connectors */
  maxConnectors: number;
}

// =============================================================================
// USER MANAGEMENT
// =============================================================================

export interface AdminUser {
  /** User ID */
  id: string;
  /** Email */
  email: string;
  /** Name */
  name: string;
  /** Status */
  status: 'active' | 'suspended' | 'pending' | 'deleted';
  /** Email verified */
  emailVerified: boolean;
  /** MFA enabled */
  mfaEnabled: boolean;
  /** Tenant memberships */
  tenantMemberships: AdminTenantMembership[];
  /** Admin role (if any) */
  adminRole?: AdminRole;
  /** Last login */
  lastLoginAt?: string;
  /** Login count */
  loginCount: number;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface AdminTenantMembership {
  /** Tenant ID */
  tenantId: string;
  /** Tenant name */
  tenantName: string;
  /** Role in tenant */
  role: 'owner' | 'admin' | 'member' | 'viewer';
  /** Joined at */
  joinedAt: string;
}

// =============================================================================
// SYSTEM CONFIGURATION
// =============================================================================

export interface SystemConfig {
  /** Config ID */
  id: string;
  /** Config key */
  key: string;
  /** Config value */
  value: unknown;
  /** Value type */
  valueType: 'string' | 'number' | 'boolean' | 'json';
  /** Description */
  description: string;
  /** Category */
  category: string;
  /** Requires restart */
  requiresRestart: boolean;
  /** Is sensitive */
  isSensitive: boolean;
  /** Updated at */
  updatedAt: string;
  /** Updated by */
  updatedBy: string;
}

export interface AdminFeatureFlag {
  /** Flag key */
  key: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Enabled globally */
  enabledGlobally: boolean;
  /** Enabled for tenants */
  enabledTenants: string[];
  /** Enabled for users */
  enabledUsers: string[];
  /** Percentage rollout (0-100) */
  rolloutPercentage: number;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

// =============================================================================
// SYSTEM METRICS
// =============================================================================

export interface SystemMetrics {
  /** Timestamp */
  timestamp: string;
  /** Request metrics */
  requests: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  /** Resource metrics */
  resources: {
    cpuUsagePercent: number;
    memoryUsagePercent: number;
    diskUsagePercent: number;
    activeConnections: number;
  };
  /** Business metrics */
  business: {
    activeTenants: number;
    activeUsers: number;
    totalApiCalls: number;
    forecastsGenerated: number;
    errorsCount: number;
  };
  /** Queue metrics */
  queues: {
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
  };
}

export interface AdminSystemHealth {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Component health */
  components: ComponentHealth[];
  /** Last check */
  lastCheck: string;
  /** Uptime (seconds) */
  uptimeSeconds: number;
  /** Version */
  version: string;
}

export interface ComponentHealth {
  /** Component name */
  name: string;
  /** Status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Response time (ms) */
  responseTimeMs?: number;
  /** Error message */
  error?: string;
  /** Last check */
  lastCheck: string;
}

// =============================================================================
// MAINTENANCE MODE
// =============================================================================

export interface MaintenanceConfig {
  /** Enabled */
  enabled: boolean;
  /** Start time */
  startTime?: string;
  /** End time */
  endTime?: string;
  /** Message */
  message: string;
  /** Allowed IPs (bypasses maintenance) */
  allowedIps: string[];
  /** Allowed tenant IDs */
  allowedTenants: string[];
  /** Updated at */
  updatedAt: string;
  /** Updated by */
  updatedBy: string;
}

// =============================================================================
// ADMIN OPERATIONS
// =============================================================================

export interface AdminOperation {
  /** Operation ID */
  id: string;
  /** Operation type */
  type: AdminOperationType;
  /** Status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Target type */
  targetType: 'tenant' | 'user' | 'system' | 'billing';
  /** Target ID */
  targetId?: string;
  /** Parameters */
  params: Record<string, unknown>;
  /** Result */
  result?: Record<string, unknown>;
  /** Error */
  error?: string;
  /** Started at */
  startedAt: string;
  /** Completed at */
  completedAt?: string;
  /** Initiated by */
  initiatedBy: string;
}

export type AdminOperationType =
  | 'tenant_create'
  | 'tenant_suspend'
  | 'tenant_unsuspend'
  | 'tenant_delete'
  | 'user_create'
  | 'user_suspend'
  | 'user_unsuspend'
  | 'user_delete'
  | 'user_password_reset'
  | 'config_update'
  | 'feature_toggle'
  | 'maintenance_toggle'
  | 'data_export'
  | 'data_delete'
  | 'billing_refund'
  | 'api_key_revoke';

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const AdminTenantSettingsSchema = z.object({
  authMethods: z.array(z.enum(['password', 'sso', 'api_key'])),
  ssoProvider: z.string().optional(),
  ssoConfig: z.record(z.unknown()).optional(),
  mfaRequired: z.boolean(),
  ipAllowlist: z.array(z.string()).optional(),
  customDomain: z.string().optional(),
  dataRegion: z.string(),
  featureFlags: z.record(z.boolean()),
});

export const TenantUsageSchema = z.object({
  apiCallsThisMonth: z.number().int().nonnegative(),
  storageUsedBytes: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
  forecastsThisMonth: z.number().int().nonnegative(),
  dataPointsStored: z.number().int().nonnegative(),
});

export const TenantLimitsSchema = z.object({
  maxUsers: z.number().int().positive(),
  maxApiCallsPerMonth: z.number().int().positive(),
  maxStorageBytes: z.number().int().positive(),
  maxForecastsPerMonth: z.number().int().positive(),
  maxDataPoints: z.number().int().positive(),
  maxConnectors: z.number().int().positive(),
});

export const AdminTenantSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  status: z.enum(['active', 'suspended', 'pending', 'deleted']),
  tier: z.enum(['free', 'starter', 'professional', 'enterprise']),
  ownerId: z.string(),
  billingEmail: z.string().email(),
  settings: AdminTenantSettingsSchema,
  usage: TenantUsageSchema,
  limits: TenantLimitsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  suspendedAt: z.string().datetime().optional(),
  suspensionReason: z.string().optional(),
});

export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  status: z.enum(['active', 'suspended', 'pending', 'deleted']),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  tenantMemberships: z.array(z.object({
    tenantId: z.string(),
    tenantName: z.string(),
    role: z.enum(['owner', 'admin', 'member', 'viewer']),
    joinedAt: z.string().datetime(),
  })),
  adminRole: z.enum(['super_admin', 'platform_admin', 'support_admin', 'billing_admin', 'security_admin', 'read_only_admin']).optional(),
  lastLoginAt: z.string().datetime().optional(),
  loginCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AdminFeatureFlagSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(100),
  description: z.string(),
  enabledGlobally: z.boolean(),
  enabledTenants: z.array(z.string()),
  enabledUsers: z.array(z.string()),
  rolloutPercentage: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MaintenanceConfigSchema = z.object({
  enabled: z.boolean(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  message: z.string(),
  allowedIps: z.array(z.string()),
  allowedTenants: z.array(z.string()),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
});

// =============================================================================
// ADMIN API SERVICE
// =============================================================================

export interface AdminApiConfig {
  /** Enable audit logging */
  enableAuditLogging: boolean;
  /** Require MFA for sensitive operations */
  requireMfaForSensitive: boolean;
  /** Max results per page */
  maxPageSize: number;
  /** Rate limit (requests per minute) */
  rateLimitPerMinute: number;
}

/**
 * Admin API service
 */
export class AdminApiService {
  private config: AdminApiConfig;
  private tenants: Map<string, AdminTenant> = new Map();
  private users: Map<string, AdminUser> = new Map();
  private featureFlags: Map<string, AdminFeatureFlag> = new Map();
  private operations: Map<string, AdminOperation> = new Map();
  private maintenance: MaintenanceConfig;
  private operationCounter = 0;

  constructor(config: Partial<AdminApiConfig> = {}) {
    this.config = {
      enableAuditLogging: config.enableAuditLogging ?? true,
      requireMfaForSensitive: config.requireMfaForSensitive ?? true,
      maxPageSize: config.maxPageSize ?? 100,
      rateLimitPerMinute: config.rateLimitPerMinute ?? 60,
    };

    this.maintenance = {
      enabled: false,
      message: 'System is under maintenance',
      allowedIps: [],
      allowedTenants: [],
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
  }

  // ---------------------------------------------------------------------------
  // Permission Checking
  // ---------------------------------------------------------------------------

  /**
   * Check if user has permission
   */
  hasPermission(user: AdminUser, permission: AdminPermission): boolean {
    if (!user.adminRole) return false;
    const rolePermissions = AdminRolePermissions[user.adminRole];
    return rolePermissions.includes(permission);
  }

  /**
   * Assert user has permission
   */
  assertPermission(user: AdminUser, permission: AdminPermission): void {
    if (!this.hasPermission(user, permission)) {
      throw new AdminApiError(
        'FORBIDDEN',
        `Permission denied: ${permission}`,
        403
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tenant Management
  // ---------------------------------------------------------------------------

  /**
   * List tenants
   */
  async listTenants(
    user: AdminUser,
    query?: {
      status?: AdminTenant['status'];
      tier?: AdminTenant['tier'];
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tenants: AdminTenant[]; total: number }> {
    this.assertPermission(user, AdminPermissions.TENANT_READ);

    let tenants = Array.from(this.tenants.values());

    if (query?.status) {
      tenants = tenants.filter(t => t.status === query.status);
    }
    if (query?.tier) {
      tenants = tenants.filter(t => t.tier === query.tier);
    }
    if (query?.search) {
      const search = query.search.toLowerCase();
      tenants = tenants.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.slug.toLowerCase().includes(search) ||
        t.billingEmail.toLowerCase().includes(search)
      );
    }

    const total = tenants.length;
    const offset = query?.offset ?? 0;
    const limit = Math.min(query?.limit ?? 20, this.config.maxPageSize);
    tenants = tenants.slice(offset, offset + limit);

    return { tenants, total };
  }

  /**
   * Get tenant by ID
   */
  async getTenant(user: AdminUser, tenantId: string): Promise<AdminTenant> {
    this.assertPermission(user, AdminPermissions.TENANT_READ);

    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new AdminApiError('NOT_FOUND', 'Tenant not found', 404);
    }

    return tenant;
  }

  /**
   * Create tenant
   */
  async createTenant(
    user: AdminUser,
    data: Omit<AdminTenant, 'id' | 'createdAt' | 'updatedAt' | 'usage'>
  ): Promise<AdminTenant> {
    this.assertPermission(user, AdminPermissions.TENANT_CREATE);

    const id = `ten_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const tenant: AdminTenant = {
      ...data,
      id,
      usage: {
        apiCallsThisMonth: 0,
        storageUsedBytes: 0,
        activeUsers: 0,
        totalUsers: 0,
        forecastsThisMonth: 0,
        dataPointsStored: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.tenants.set(id, tenant);
    await this.recordOperation(user.id, 'tenant_create', 'tenant', id, { name: data.name });

    return tenant;
  }

  /**
   * Update tenant
   */
  async updateTenant(
    user: AdminUser,
    tenantId: string,
    updates: Partial<Pick<AdminTenant, 'name' | 'tier' | 'settings' | 'limits' | 'billingEmail'>>
  ): Promise<AdminTenant> {
    this.assertPermission(user, AdminPermissions.TENANT_UPDATE);

    const tenant = await this.getTenant(user, tenantId);

    const updated: AdminTenant = {
      ...tenant,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.tenants.set(tenantId, updated);

    return updated;
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(
    user: AdminUser,
    tenantId: string,
    reason: string
  ): Promise<AdminTenant> {
    this.assertPermission(user, AdminPermissions.TENANT_SUSPEND);

    const tenant = await this.getTenant(user, tenantId);

    if (tenant.status === 'suspended') {
      throw new AdminApiError('CONFLICT', 'Tenant is already suspended', 409);
    }

    const now = new Date().toISOString();
    const updated: AdminTenant = {
      ...tenant,
      status: 'suspended',
      suspendedAt: now,
      suspensionReason: reason,
      updatedAt: now,
    };

    this.tenants.set(tenantId, updated);
    await this.recordOperation(user.id, 'tenant_suspend', 'tenant', tenantId, { reason });

    return updated;
  }

  /**
   * Unsuspend tenant
   */
  async unsuspendTenant(user: AdminUser, tenantId: string): Promise<AdminTenant> {
    this.assertPermission(user, AdminPermissions.TENANT_SUSPEND);

    const tenant = await this.getTenant(user, tenantId);

    if (tenant.status !== 'suspended') {
      throw new AdminApiError('CONFLICT', 'Tenant is not suspended', 409);
    }

    const updated: AdminTenant = {
      ...tenant,
      status: 'active',
      suspendedAt: undefined,
      suspensionReason: undefined,
      updatedAt: new Date().toISOString(),
    };

    this.tenants.set(tenantId, updated);
    await this.recordOperation(user.id, 'tenant_unsuspend', 'tenant', tenantId, {});

    return updated;
  }

  // ---------------------------------------------------------------------------
  // User Management
  // ---------------------------------------------------------------------------

  /**
   * List users
   */
  async listUsers(
    user: AdminUser,
    query?: {
      status?: AdminUser['status'];
      tenantId?: string;
      adminRole?: AdminRole;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ users: AdminUser[]; total: number }> {
    this.assertPermission(user, AdminPermissions.USER_READ);

    let users = Array.from(this.users.values());

    if (query?.status) {
      users = users.filter(u => u.status === query.status);
    }
    if (query?.tenantId) {
      users = users.filter(u =>
        u.tenantMemberships.some(m => m.tenantId === query.tenantId)
      );
    }
    if (query?.adminRole) {
      users = users.filter(u => u.adminRole === query.adminRole);
    }
    if (query?.search) {
      const search = query.search.toLowerCase();
      users = users.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search)
      );
    }

    const total = users.length;
    const offset = query?.offset ?? 0;
    const limit = Math.min(query?.limit ?? 20, this.config.maxPageSize);
    users = users.slice(offset, offset + limit);

    return { users, total };
  }

  /**
   * Get user by ID
   */
  async getUser(user: AdminUser, userId: string): Promise<AdminUser> {
    this.assertPermission(user, AdminPermissions.USER_READ);

    const targetUser = this.users.get(userId);
    if (!targetUser) {
      throw new AdminApiError('NOT_FOUND', 'User not found', 404);
    }

    return targetUser;
  }

  /**
   * Update user
   */
  async updateUser(
    user: AdminUser,
    userId: string,
    updates: Partial<Pick<AdminUser, 'name' | 'status' | 'adminRole'>>
  ): Promise<AdminUser> {
    this.assertPermission(user, AdminPermissions.USER_UPDATE);

    const targetUser = await this.getUser(user, userId);

    const updated: AdminUser = {
      ...targetUser,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.users.set(userId, updated);

    return updated;
  }

  /**
   * Suspend user
   */
  async suspendUser(user: AdminUser, userId: string): Promise<AdminUser> {
    this.assertPermission(user, AdminPermissions.USER_UPDATE);

    const targetUser = await this.getUser(user, userId);

    if (targetUser.adminRole === 'super_admin') {
      throw new AdminApiError('FORBIDDEN', 'Cannot suspend super admin', 403);
    }

    const updated: AdminUser = {
      ...targetUser,
      status: 'suspended',
      updatedAt: new Date().toISOString(),
    };

    this.users.set(userId, updated);
    await this.recordOperation(user.id, 'user_suspend', 'user', userId, {});

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Feature Flags
  // ---------------------------------------------------------------------------

  /**
   * List feature flags
   */
  async listFeatureFlags(user: AdminUser): Promise<AdminFeatureFlag[]> {
    this.assertPermission(user, AdminPermissions.CONFIG_READ);
    return Array.from(this.featureFlags.values());
  }

  /**
   * Get feature flag
   */
  async getFeatureFlag(user: AdminUser, key: string): Promise<AdminFeatureFlag> {
    this.assertPermission(user, AdminPermissions.CONFIG_READ);

    const flag = this.featureFlags.get(key);
    if (!flag) {
      throw new AdminApiError('NOT_FOUND', 'Feature flag not found', 404);
    }

    return flag;
  }

  /**
   * Update feature flag
   */
  async updateFeatureFlag(
    user: AdminUser,
    key: string,
    updates: Partial<Omit<AdminFeatureFlag, 'key' | 'createdAt' | 'updatedAt'>>
  ): Promise<AdminFeatureFlag> {
    this.assertPermission(user, AdminPermissions.FEATURE_FLAGS);

    const flag = await this.getFeatureFlag(user, key);

    const updated: AdminFeatureFlag = {
      ...flag,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.featureFlags.set(key, updated);
    await this.recordOperation(user.id, 'feature_toggle', 'system', key, updates);

    return updated;
  }

  /**
   * Create feature flag
   */
  async createFeatureFlag(
    user: AdminUser,
    flag: Omit<AdminFeatureFlag, 'createdAt' | 'updatedAt'>
  ): Promise<AdminFeatureFlag> {
    this.assertPermission(user, AdminPermissions.FEATURE_FLAGS);

    if (this.featureFlags.has(flag.key)) {
      throw new AdminApiError('CONFLICT', 'Feature flag already exists', 409);
    }

    const now = new Date().toISOString();
    const created: AdminFeatureFlag = {
      ...flag,
      createdAt: now,
      updatedAt: now,
    };

    this.featureFlags.set(flag.key, created);

    return created;
  }

  /**
   * Check if feature is enabled for tenant/user
   */
  isFeatureEnabled(key: string, tenantId?: string, userId?: string): boolean {
    const flag = this.featureFlags.get(key);
    if (!flag) return false;

    if (flag.enabledGlobally) return true;
    if (tenantId && flag.enabledTenants.includes(tenantId)) return true;
    if (userId && flag.enabledUsers.includes(userId)) return true;

    // Percentage rollout (deterministic based on tenant/user ID)
    if (flag.rolloutPercentage > 0) {
      const seed = tenantId ?? userId ?? '';
      const hash = this.simpleHash(seed);
      return (hash % 100) < flag.rolloutPercentage;
    }

    return false;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // ---------------------------------------------------------------------------
  // Maintenance Mode
  // ---------------------------------------------------------------------------

  /**
   * Get maintenance config
   */
  async getMaintenanceConfig(user: AdminUser): Promise<MaintenanceConfig> {
    this.assertPermission(user, AdminPermissions.CONFIG_READ);
    return this.maintenance;
  }

  /**
   * Update maintenance config
   */
  async updateMaintenanceConfig(
    user: AdminUser,
    updates: Partial<Omit<MaintenanceConfig, 'updatedAt' | 'updatedBy'>>
  ): Promise<MaintenanceConfig> {
    this.assertPermission(user, AdminPermissions.MAINTENANCE_MODE);

    this.maintenance = {
      ...this.maintenance,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    await this.recordOperation(user.id, 'maintenance_toggle', 'system', undefined, updates);

    return this.maintenance;
  }

  /**
   * Check if request is allowed during maintenance
   */
  isAllowedDuringMaintenance(ip: string, tenantId?: string): boolean {
    if (!this.maintenance.enabled) return true;

    // Check time window
    if (this.maintenance.startTime && new Date() < new Date(this.maintenance.startTime)) {
      return true;
    }
    if (this.maintenance.endTime && new Date() > new Date(this.maintenance.endTime)) {
      return true;
    }

    // Check allowlists
    if (this.maintenance.allowedIps.includes(ip)) return true;
    if (tenantId && this.maintenance.allowedTenants.includes(tenantId)) return true;

    return false;
  }

  // ---------------------------------------------------------------------------
  // System Metrics
  // ---------------------------------------------------------------------------

  /**
   * Get system metrics
   */
  async getSystemMetrics(user: AdminUser): Promise<SystemMetrics> {
    this.assertPermission(user, AdminPermissions.SYSTEM_METRICS);

    // In real implementation, this would collect actual metrics
    return {
      timestamp: new Date().toISOString(),
      requests: {
        totalRequests: 10000,
        successfulRequests: 9800,
        failedRequests: 200,
        averageLatencyMs: 45,
        p50LatencyMs: 30,
        p95LatencyMs: 120,
        p99LatencyMs: 250,
      },
      resources: {
        cpuUsagePercent: 35,
        memoryUsagePercent: 60,
        diskUsagePercent: 45,
        activeConnections: 150,
      },
      business: {
        activeTenants: this.tenants.size,
        activeUsers: Array.from(this.users.values()).filter(u => u.status === 'active').length,
        totalApiCalls: 50000,
        forecastsGenerated: 1500,
        errorsCount: 25,
      },
      queues: {
        pendingJobs: 50,
        processingJobs: 10,
        completedJobs: 5000,
        failedJobs: 15,
      },
    };
  }

  /**
   * Get system health
   */
  async getSystemHealth(user: AdminUser): Promise<AdminSystemHealth> {
    this.assertPermission(user, AdminPermissions.SYSTEM_HEALTH);

    // In real implementation, this would check actual component health
    return {
      status: 'healthy',
      components: [
        { name: 'api', status: 'healthy', responseTimeMs: 10, lastCheck: new Date().toISOString() },
        { name: 'database', status: 'healthy', responseTimeMs: 5, lastCheck: new Date().toISOString() },
        { name: 'cache', status: 'healthy', responseTimeMs: 1, lastCheck: new Date().toISOString() },
        { name: 'queue', status: 'healthy', responseTimeMs: 3, lastCheck: new Date().toISOString() },
      ],
      lastCheck: new Date().toISOString(),
      uptimeSeconds: 86400,
      version: '1.0.0',
    };
  }

  // ---------------------------------------------------------------------------
  // Operations History
  // ---------------------------------------------------------------------------

  /**
   * List operations
   */
  async listOperations(
    user: AdminUser,
    query?: {
      type?: AdminOperationType;
      status?: AdminOperation['status'];
      targetType?: AdminOperation['targetType'];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ operations: AdminOperation[]; total: number }> {
    this.assertPermission(user, AdminPermissions.SECURITY_AUDIT);

    let operations = Array.from(this.operations.values());

    if (query?.type) {
      operations = operations.filter(o => o.type === query.type);
    }
    if (query?.status) {
      operations = operations.filter(o => o.status === query.status);
    }
    if (query?.targetType) {
      operations = operations.filter(o => o.targetType === query.targetType);
    }

    // Sort by start time descending
    operations.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const total = operations.length;
    const offset = query?.offset ?? 0;
    const limit = Math.min(query?.limit ?? 20, this.config.maxPageSize);
    operations = operations.slice(offset, offset + limit);

    return { operations, total };
  }

  private async recordOperation(
    initiatedBy: string,
    type: AdminOperationType,
    targetType: AdminOperation['targetType'],
    targetId: string | undefined,
    params: Record<string, unknown>
  ): Promise<AdminOperation> {
    const id = `op_${Date.now()}_${++this.operationCounter}`;
    const now = new Date().toISOString();

    const operation: AdminOperation = {
      id,
      type,
      status: 'completed',
      targetType,
      targetId,
      params,
      startedAt: now,
      completedAt: now,
      initiatedBy,
    };

    this.operations.set(id, operation);

    return operation;
  }

  // ---------------------------------------------------------------------------
  // Data Management (for testing)
  // ---------------------------------------------------------------------------

  /**
   * Add tenant directly (for testing)
   */
  addTenant(tenant: AdminTenant): void {
    this.tenants.set(tenant.id, tenant);
  }

  /**
   * Add user directly (for testing)
   */
  addUser(user: AdminUser): void {
    this.users.set(user.id, user);
  }
}

// =============================================================================
// ADMIN API ERROR
// =============================================================================

export class AdminApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create admin API service
 */
export function createAdminApiService(config?: Partial<AdminApiConfig>): AdminApiService {
  return new AdminApiService(config);
}

/**
 * Create test admin user
 */
export function createTestAdminUser(role: AdminRole, overrides?: Partial<AdminUser>): AdminUser {
  const now = new Date().toISOString();
  return {
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email: 'admin@example.com',
    name: 'Test Admin',
    status: 'active',
    emailVerified: true,
    mfaEnabled: true,
    tenantMemberships: [],
    adminRole: role,
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Get default tenant limits for a tier
 */
export function getDefaultLimits(tier: AdminTenant['tier']): TenantLimits {
  const limits: Record<AdminTenant['tier'], TenantLimits> = {
    free: {
      maxUsers: 3,
      maxApiCallsPerMonth: 1000,
      maxStorageBytes: 100 * 1024 * 1024, // 100 MB
      maxForecastsPerMonth: 100,
      maxDataPoints: 10000,
      maxConnectors: 1,
    },
    starter: {
      maxUsers: 10,
      maxApiCallsPerMonth: 10000,
      maxStorageBytes: 1024 * 1024 * 1024, // 1 GB
      maxForecastsPerMonth: 1000,
      maxDataPoints: 100000,
      maxConnectors: 5,
    },
    professional: {
      maxUsers: 50,
      maxApiCallsPerMonth: 100000,
      maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      maxForecastsPerMonth: 10000,
      maxDataPoints: 1000000,
      maxConnectors: 20,
    },
    enterprise: {
      maxUsers: 1000,
      maxApiCallsPerMonth: 1000000,
      maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
      maxForecastsPerMonth: 100000,
      maxDataPoints: 10000000,
      maxConnectors: 100,
    },
  };

  return limits[tier];
}
