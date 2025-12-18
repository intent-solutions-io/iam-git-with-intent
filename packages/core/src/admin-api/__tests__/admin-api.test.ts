/**
 * Tests for Phase 65: Admin API
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdminApiService,
  createAdminApiService,
  createTestAdminUser,
  getDefaultLimits,
  AdminApiError,
  AdminPermissions,
  AdminRoles,
  AdminRolePermissions,
  type AdminTenant,
  type AdminUser,
  type AdminFeatureFlag,
} from '../index.js';

describe('Admin API', () => {
  describe('AdminApiService', () => {
    let service: AdminApiService;
    let superAdmin: AdminUser;
    let supportAdmin: AdminUser;
    let readOnlyAdmin: AdminUser;

    beforeEach(() => {
      service = createAdminApiService();
      superAdmin = createTestAdminUser('super_admin', { id: 'super-1' });
      supportAdmin = createTestAdminUser('support_admin', { id: 'support-1' });
      readOnlyAdmin = createTestAdminUser('read_only_admin', { id: 'readonly-1' });
    });

    describe('Permission Checking', () => {
      it('should check permissions correctly', () => {
        expect(service.hasPermission(superAdmin, AdminPermissions.TENANT_DELETE)).toBe(true);
        expect(service.hasPermission(supportAdmin, AdminPermissions.TENANT_DELETE)).toBe(false);
        expect(service.hasPermission(readOnlyAdmin, AdminPermissions.TENANT_READ)).toBe(true);
        expect(service.hasPermission(readOnlyAdmin, AdminPermissions.TENANT_UPDATE)).toBe(false);
      });

      it('should throw on missing permission', () => {
        expect(() => service.assertPermission(supportAdmin, AdminPermissions.TENANT_DELETE))
          .toThrow(AdminApiError);
      });

      it('should not throw when permission exists', () => {
        expect(() => service.assertPermission(superAdmin, AdminPermissions.TENANT_DELETE))
          .not.toThrow();
      });
    });

    describe('Tenant Management', () => {
      it('should create tenant', async () => {
        const tenant = await service.createTenant(superAdmin, {
          name: 'Test Tenant',
          slug: 'test-tenant',
          status: 'active',
          tier: 'professional',
          ownerId: 'owner-123',
          billingEmail: 'billing@test.com',
          settings: {
            authMethods: ['password', 'sso'],
            mfaRequired: true,
            dataRegion: 'us-east-1',
            featureFlags: {},
          },
          limits: getDefaultLimits('professional'),
        });

        expect(tenant.id).toBeDefined();
        expect(tenant.id).toMatch(/^ten_/);
        expect(tenant.name).toBe('Test Tenant');
        expect(tenant.tier).toBe('professional');
        expect(tenant.usage.apiCallsThisMonth).toBe(0);
      });

      it('should list tenants', async () => {
        await service.createTenant(superAdmin, {
          name: 'Tenant A',
          slug: 'tenant-a',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'a@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        await service.createTenant(superAdmin, {
          name: 'Tenant B',
          slug: 'tenant-b',
          status: 'suspended',
          tier: 'professional',
          ownerId: 'owner-2',
          billingEmail: 'b@test.com',
          settings: { authMethods: ['sso'], mfaRequired: true, dataRegion: 'eu', featureFlags: {} },
          limits: getDefaultLimits('professional'),
        });

        const all = await service.listTenants(superAdmin);
        expect(all.tenants).toHaveLength(2);
        expect(all.total).toBe(2);

        const active = await service.listTenants(superAdmin, { status: 'active' });
        expect(active.tenants).toHaveLength(1);

        const professional = await service.listTenants(superAdmin, { tier: 'professional' });
        expect(professional.tenants).toHaveLength(1);
      });

      it('should search tenants', async () => {
        await service.createTenant(superAdmin, {
          name: 'Acme Corp',
          slug: 'acme',
          status: 'active',
          tier: 'enterprise',
          ownerId: 'owner-1',
          billingEmail: 'admin@acme.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('enterprise'),
        });

        await service.createTenant(superAdmin, {
          name: 'Beta Inc',
          slug: 'beta',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-2',
          billingEmail: 'admin@beta.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        const searchResult = await service.listTenants(superAdmin, { search: 'acme' });
        expect(searchResult.tenants).toHaveLength(1);
        expect(searchResult.tenants[0].name).toBe('Acme Corp');
      });

      it('should get tenant by ID', async () => {
        const created = await service.createTenant(superAdmin, {
          name: 'Get Test',
          slug: 'get-test',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        const retrieved = await service.getTenant(superAdmin, created.id);
        expect(retrieved.id).toBe(created.id);
        expect(retrieved.name).toBe('Get Test');
      });

      it('should throw on non-existent tenant', async () => {
        await expect(service.getTenant(superAdmin, 'non-existent'))
          .rejects.toThrow(AdminApiError);
      });

      it('should update tenant', async () => {
        const created = await service.createTenant(superAdmin, {
          name: 'Update Test',
          slug: 'update-test',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'old@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        const updated = await service.updateTenant(superAdmin, created.id, {
          name: 'Updated Name',
          tier: 'professional',
          billingEmail: 'new@test.com',
        });

        expect(updated.name).toBe('Updated Name');
        expect(updated.tier).toBe('professional');
        expect(updated.billingEmail).toBe('new@test.com');
      });

      it('should suspend tenant', async () => {
        const created = await service.createTenant(superAdmin, {
          name: 'Suspend Test',
          slug: 'suspend-test',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        const suspended = await service.suspendTenant(superAdmin, created.id, 'Violation of ToS');

        expect(suspended.status).toBe('suspended');
        expect(suspended.suspensionReason).toBe('Violation of ToS');
        expect(suspended.suspendedAt).toBeDefined();
      });

      it('should not suspend already suspended tenant', async () => {
        const created = await service.createTenant(superAdmin, {
          name: 'Already Suspended',
          slug: 'already-suspended',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        await service.suspendTenant(superAdmin, created.id, 'First suspension');

        await expect(service.suspendTenant(superAdmin, created.id, 'Second suspension'))
          .rejects.toThrow('already suspended');
      });

      it('should unsuspend tenant', async () => {
        const created = await service.createTenant(superAdmin, {
          name: 'Unsuspend Test',
          slug: 'unsuspend-test',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        await service.suspendTenant(superAdmin, created.id, 'Suspension');
        const unsuspended = await service.unsuspendTenant(superAdmin, created.id);

        expect(unsuspended.status).toBe('active');
        expect(unsuspended.suspensionReason).toBeUndefined();
        expect(unsuspended.suspendedAt).toBeUndefined();
      });

      it('should enforce permission for tenant operations', async () => {
        await expect(service.createTenant(readOnlyAdmin, {
          name: 'Unauthorized',
          slug: 'unauthorized',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        })).rejects.toThrow('Permission denied');
      });
    });

    describe('User Management', () => {
      beforeEach(() => {
        service.addUser({
          id: 'user-1',
          email: 'user1@test.com',
          name: 'User One',
          status: 'active',
          emailVerified: true,
          mfaEnabled: false,
          tenantMemberships: [{ tenantId: 'tenant-1', tenantName: 'Tenant 1', role: 'admin', joinedAt: new Date().toISOString() }],
          loginCount: 10,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        service.addUser({
          id: 'user-2',
          email: 'user2@test.com',
          name: 'User Two',
          status: 'suspended',
          emailVerified: true,
          mfaEnabled: true,
          tenantMemberships: [{ tenantId: 'tenant-2', tenantName: 'Tenant 2', role: 'member', joinedAt: new Date().toISOString() }],
          loginCount: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      it('should list users', async () => {
        const result = await service.listUsers(superAdmin);
        expect(result.users).toHaveLength(2);
      });

      it('should filter users by status', async () => {
        const result = await service.listUsers(superAdmin, { status: 'active' });
        expect(result.users).toHaveLength(1);
        expect(result.users[0].status).toBe('active');
      });

      it('should filter users by tenant', async () => {
        const result = await service.listUsers(superAdmin, { tenantId: 'tenant-1' });
        expect(result.users).toHaveLength(1);
      });

      it('should search users', async () => {
        const result = await service.listUsers(superAdmin, { search: 'user1' });
        expect(result.users).toHaveLength(1);
        expect(result.users[0].email).toBe('user1@test.com');
      });

      it('should get user by ID', async () => {
        const user = await service.getUser(superAdmin, 'user-1');
        expect(user.id).toBe('user-1');
        expect(user.name).toBe('User One');
      });

      it('should update user', async () => {
        const updated = await service.updateUser(superAdmin, 'user-1', {
          name: 'Updated Name',
        });
        expect(updated.name).toBe('Updated Name');
      });

      it('should suspend user', async () => {
        const suspended = await service.suspendUser(superAdmin, 'user-1');
        expect(suspended.status).toBe('suspended');
      });

      it('should not suspend super admin', async () => {
        service.addUser({
          ...superAdmin,
          id: 'super-admin-user',
        });

        await expect(service.suspendUser(superAdmin, 'super-admin-user'))
          .rejects.toThrow('Cannot suspend super admin');
      });
    });

    describe('Feature Flags', () => {
      it('should create feature flag', async () => {
        const flag = await service.createFeatureFlag(superAdmin, {
          key: 'new_dashboard',
          name: 'New Dashboard',
          description: 'Enable new dashboard UI',
          enabledGlobally: false,
          enabledTenants: [],
          enabledUsers: [],
          rolloutPercentage: 0,
        });

        expect(flag.key).toBe('new_dashboard');
        expect(flag.createdAt).toBeDefined();
      });

      it('should list feature flags', async () => {
        await service.createFeatureFlag(superAdmin, {
          key: 'flag_1',
          name: 'Flag 1',
          description: 'First flag',
          enabledGlobally: true,
          enabledTenants: [],
          enabledUsers: [],
          rolloutPercentage: 0,
        });

        await service.createFeatureFlag(superAdmin, {
          key: 'flag_2',
          name: 'Flag 2',
          description: 'Second flag',
          enabledGlobally: false,
          enabledTenants: ['tenant-1'],
          enabledUsers: [],
          rolloutPercentage: 50,
        });

        const flags = await service.listFeatureFlags(superAdmin);
        expect(flags).toHaveLength(2);
      });

      it('should update feature flag', async () => {
        await service.createFeatureFlag(superAdmin, {
          key: 'update_test',
          name: 'Update Test',
          description: 'Test flag',
          enabledGlobally: false,
          enabledTenants: [],
          enabledUsers: [],
          rolloutPercentage: 0,
        });

        const updated = await service.updateFeatureFlag(superAdmin, 'update_test', {
          enabledGlobally: true,
          rolloutPercentage: 100,
        });

        expect(updated.enabledGlobally).toBe(true);
        expect(updated.rolloutPercentage).toBe(100);
      });

      it('should check if feature is enabled globally', async () => {
        await service.createFeatureFlag(superAdmin, {
          key: 'global_feature',
          name: 'Global Feature',
          description: 'Enabled globally',
          enabledGlobally: true,
          enabledTenants: [],
          enabledUsers: [],
          rolloutPercentage: 0,
        });

        expect(service.isFeatureEnabled('global_feature')).toBe(true);
        expect(service.isFeatureEnabled('non_existent')).toBe(false);
      });

      it('should check if feature is enabled for tenant', async () => {
        await service.createFeatureFlag(superAdmin, {
          key: 'tenant_feature',
          name: 'Tenant Feature',
          description: 'Enabled for specific tenants',
          enabledGlobally: false,
          enabledTenants: ['tenant-abc'],
          enabledUsers: [],
          rolloutPercentage: 0,
        });

        expect(service.isFeatureEnabled('tenant_feature', 'tenant-abc')).toBe(true);
        expect(service.isFeatureEnabled('tenant_feature', 'tenant-xyz')).toBe(false);
      });

      it('should check if feature is enabled for user', async () => {
        await service.createFeatureFlag(superAdmin, {
          key: 'user_feature',
          name: 'User Feature',
          description: 'Enabled for specific users',
          enabledGlobally: false,
          enabledTenants: [],
          enabledUsers: ['user-123'],
          rolloutPercentage: 0,
        });

        expect(service.isFeatureEnabled('user_feature', undefined, 'user-123')).toBe(true);
        expect(service.isFeatureEnabled('user_feature', undefined, 'user-456')).toBe(false);
      });

      it('should not create duplicate flag', async () => {
        await service.createFeatureFlag(superAdmin, {
          key: 'duplicate_key',
          name: 'First',
          description: 'First flag',
          enabledGlobally: false,
          enabledTenants: [],
          enabledUsers: [],
          rolloutPercentage: 0,
        });

        await expect(service.createFeatureFlag(superAdmin, {
          key: 'duplicate_key',
          name: 'Second',
          description: 'Second flag',
          enabledGlobally: false,
          enabledTenants: [],
          enabledUsers: [],
          rolloutPercentage: 0,
        })).rejects.toThrow('already exists');
      });
    });

    describe('Maintenance Mode', () => {
      it('should get maintenance config', async () => {
        const config = await service.getMaintenanceConfig(superAdmin);
        expect(config.enabled).toBe(false);
        expect(config.message).toBeDefined();
      });

      it('should update maintenance config', async () => {
        const updated = await service.updateMaintenanceConfig(superAdmin, {
          enabled: true,
          message: 'System under maintenance',
          allowedIps: ['10.0.0.1'],
          allowedTenants: ['priority-tenant'],
        });

        expect(updated.enabled).toBe(true);
        expect(updated.message).toBe('System under maintenance');
        expect(updated.allowedIps).toContain('10.0.0.1');
        expect(updated.updatedBy).toBe(superAdmin.id);
      });

      it('should check if allowed during maintenance', async () => {
        await service.updateMaintenanceConfig(superAdmin, {
          enabled: true,
          allowedIps: ['192.168.1.1'],
          allowedTenants: ['vip-tenant'],
        });

        expect(service.isAllowedDuringMaintenance('192.168.1.1')).toBe(true);
        expect(service.isAllowedDuringMaintenance('192.168.1.2')).toBe(false);
        expect(service.isAllowedDuringMaintenance('0.0.0.0', 'vip-tenant')).toBe(true);
        expect(service.isAllowedDuringMaintenance('0.0.0.0', 'regular-tenant')).toBe(false);
      });

      it('should allow all when maintenance is disabled', async () => {
        expect(service.isAllowedDuringMaintenance('any-ip')).toBe(true);
      });

      it('should require permission to update maintenance', async () => {
        await expect(service.updateMaintenanceConfig(readOnlyAdmin, { enabled: true }))
          .rejects.toThrow('Permission denied');
      });
    });

    describe('System Metrics', () => {
      it('should get system metrics', async () => {
        const metrics = await service.getSystemMetrics(superAdmin);

        expect(metrics.timestamp).toBeDefined();
        expect(metrics.requests).toBeDefined();
        expect(metrics.requests.totalRequests).toBeGreaterThanOrEqual(0);
        expect(metrics.resources).toBeDefined();
        expect(metrics.business).toBeDefined();
        expect(metrics.queues).toBeDefined();
      });

      it('should require permission for metrics', async () => {
        await expect(service.getSystemMetrics(supportAdmin))
          .rejects.toThrow('Permission denied');
      });
    });

    describe('System Health', () => {
      it('should get system health', async () => {
        const health = await service.getSystemHealth(superAdmin);

        expect(health.status).toBe('healthy');
        expect(health.components).toBeDefined();
        expect(health.components.length).toBeGreaterThan(0);
        expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
        expect(health.version).toBeDefined();
      });

      it('should require permission for health', async () => {
        await expect(service.getSystemHealth(supportAdmin))
          .rejects.toThrow('Permission denied');
      });
    });

    describe('Operations History', () => {
      it('should record and list operations', async () => {
        await service.createTenant(superAdmin, {
          name: 'Op Test',
          slug: 'op-test',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        const result = await service.listOperations(superAdmin);
        expect(result.operations.length).toBeGreaterThan(0);
        expect(result.operations[0].type).toBe('tenant_create');
      });

      it('should filter operations by type', async () => {
        const tenant = await service.createTenant(superAdmin, {
          name: 'Filter Op Test',
          slug: 'filter-op-test',
          status: 'active',
          tier: 'starter',
          ownerId: 'owner-1',
          billingEmail: 'test@test.com',
          settings: { authMethods: ['password'], mfaRequired: false, dataRegion: 'us', featureFlags: {} },
          limits: getDefaultLimits('starter'),
        });

        await service.suspendTenant(superAdmin, tenant.id, 'Test');

        const suspensions = await service.listOperations(superAdmin, { type: 'tenant_suspend' });
        expect(suspensions.operations).toHaveLength(1);
      });
    });
  });

  describe('Role Permissions', () => {
    it('should have all permissions for super_admin', () => {
      const permissions = AdminRolePermissions.super_admin;
      expect(permissions).toContain(AdminPermissions.TENANT_DELETE);
      expect(permissions).toContain(AdminPermissions.USER_IMPERSONATE);
      expect(permissions).toContain(AdminPermissions.BILLING_REFUND);
    });

    it('should have limited permissions for read_only_admin', () => {
      const permissions = AdminRolePermissions.read_only_admin;
      expect(permissions).toContain(AdminPermissions.TENANT_READ);
      expect(permissions).not.toContain(AdminPermissions.TENANT_UPDATE);
      expect(permissions).not.toContain(AdminPermissions.USER_DELETE);
    });

    it('should have support-specific permissions', () => {
      const permissions = AdminRolePermissions.support_admin;
      expect(permissions).toContain(AdminPermissions.USER_IMPERSONATE);
      expect(permissions).toContain(AdminPermissions.BILLING_READ);
      expect(permissions).not.toContain(AdminPermissions.BILLING_REFUND);
    });
  });

  describe('Default Limits', () => {
    it('should return correct limits for free tier', () => {
      const limits = getDefaultLimits('free');
      expect(limits.maxUsers).toBe(3);
      expect(limits.maxApiCallsPerMonth).toBe(1000);
    });

    it('should return correct limits for starter tier', () => {
      const limits = getDefaultLimits('starter');
      expect(limits.maxUsers).toBe(10);
      expect(limits.maxConnectors).toBe(5);
    });

    it('should return correct limits for professional tier', () => {
      const limits = getDefaultLimits('professional');
      expect(limits.maxUsers).toBe(50);
      expect(limits.maxForecastsPerMonth).toBe(10000);
    });

    it('should return correct limits for enterprise tier', () => {
      const limits = getDefaultLimits('enterprise');
      expect(limits.maxUsers).toBe(1000);
      expect(limits.maxDataPoints).toBe(10000000);
    });
  });

  describe('AdminApiError', () => {
    it('should create error with code and status', () => {
      const error = new AdminApiError('NOT_FOUND', 'Resource not found', 404);

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('AdminApiError');
    });

    it('should default to 500 status code', () => {
      const error = new AdminApiError('INTERNAL_ERROR', 'Something went wrong');
      expect(error.statusCode).toBe(500);
    });
  });
});
