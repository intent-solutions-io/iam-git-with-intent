/**
 * Tenant Lifecycle Service Tests
 *
 * Epic E: RBAC & Governance
 *
 * Tests for tenant lifecycle management including:
 * - Tenant creation
 * - State transitions
 * - Plan management
 * - Validation and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TenantLifecycleService,
  type CreateTenantParams,
  type UpdatePlanParams,
  type SuspendTenantParams,
  PLAN_LIMITS,
} from '../lifecycle.js';
import type {
  Tenant,
  TenantStore,
  AuditStore,
  MembershipStore,
  TenantRepo,
  Membership,
  AuditEvent,
} from '../../storage/interfaces.js';

// =============================================================================
// Mock Stores
// =============================================================================

class MockTenantStore implements Partial<TenantStore> {
  private tenants = new Map<string, Tenant>();
  private repos = new Map<string, TenantRepo[]>();

  async createTenant(tenant: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const created: Tenant = {
      ...tenant,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(tenant.id, created);
    return created;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) || null;
  }

  async updateTenant(tenantId: string, update: Partial<Tenant>): Promise<Tenant> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const updated = { ...tenant, ...update, updatedAt: new Date() };
    this.tenants.set(tenantId, updated);
    return updated;
  }

  async deleteTenant(tenantId: string): Promise<void> {
    this.tenants.delete(tenantId);
    this.repos.delete(tenantId);
  }

  async listRepos(tenantId: string): Promise<TenantRepo[]> {
    return this.repos.get(tenantId) || [];
  }

  addRepoForTest(tenantId: string, repo: TenantRepo): void {
    const repos = this.repos.get(tenantId) || [];
    repos.push(repo);
    this.repos.set(tenantId, repos);
  }
}

class MockAuditStore implements Partial<AuditStore> {
  private events: AuditEvent[] = [];

  async createEvent(event: Omit<AuditEvent, 'id'>): Promise<AuditEvent> {
    const created: AuditEvent = {
      ...event,
      id: `audit_${this.events.length + 1}`,
    };
    this.events.push(created);
    return created;
  }

  async listTenantEvents(tenantId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.tenantId === tenantId);
  }

  getEvents(): AuditEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }
}

class MockMembershipStore implements Partial<MembershipStore> {
  private memberships = new Map<string, Membership[]>();

  async listTenantMembers(tenantId: string): Promise<Membership[]> {
    return this.memberships.get(tenantId) || [];
  }

  addMember(tenantId: string, membership: Membership): void {
    const members = this.memberships.get(tenantId) || [];
    members.push(membership);
    this.memberships.set(tenantId, members);
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('TenantLifecycleService', () => {
  let tenantStore: MockTenantStore;
  let auditStore: MockAuditStore;
  let membershipStore: MockMembershipStore;
  let service: TenantLifecycleService;

  beforeEach(() => {
    tenantStore = new MockTenantStore();
    auditStore = new MockAuditStore();
    membershipStore = new MockMembershipStore();
    service = new TenantLifecycleService(
      tenantStore as unknown as TenantStore,
      auditStore as unknown as AuditStore,
      membershipStore as unknown as MembershipStore
    );
  });

  // ===========================================================================
  // Create Tenant Tests
  // ===========================================================================

  describe('createTenant', () => {
    it('should create a new tenant with default settings', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const tenant = await service.createTenant(params);

      expect(tenant.id).toBe('gh-org-12345');
      expect(tenant.githubOrgId).toBe(12345);
      expect(tenant.githubOrgLogin).toBe('test-org');
      expect(tenant.displayName).toBe('Test Organization');
      expect(tenant.status).toBe('active');
      expect(tenant.plan).toBe('free');
      expect(tenant.planLimits).toEqual(PLAN_LIMITS.free);
      expect(tenant.settings.defaultRiskMode).toBe('comment_only');
      expect(tenant.runsThisMonth).toBe(0);
    });

    it('should create tenant with pro plan limits', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'pro',
      };

      const tenant = await service.createTenant(params);

      expect(tenant.plan).toBe('pro');
      expect(tenant.planLimits).toEqual(PLAN_LIMITS.pro);
      expect(tenant.planLimits.runsPerMonth).toBe(5000);
    });

    it('should create audit event when tenant is created', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'team',
      };

      await service.createTenant(params);

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tenant_created');
      expect(events[0].details.plan).toBe('team');
      expect(events[0].details.installedBy).toBe('user-123');
    });

    it('should throw error if tenant already exists', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      await service.createTenant(params);

      await expect(service.createTenant(params)).rejects.toThrow(
        'Tenant gh-org-12345 already exists'
      );
    });

    it('should reject invalid github org ID', async () => {
      const params = {
        githubOrgId: -1,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      await expect(service.createTenant(params as CreateTenantParams)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // State Transition Tests
  // ===========================================================================

  describe('activateTenant', () => {
    it('should activate a suspended tenant', async () => {
      // Create and suspend a tenant
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      await service.suspendTenant(created.id, {
        reason: 'Testing',
        suspendedBy: 'user-123',
      });

      const activated = await service.activateTenant(created.id, 'user-123');

      expect(activated.status).toBe('active');
    });

    it('should create audit event when tenant is activated', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      await service.suspendTenant(created.id, {
        reason: 'Testing',
        suspendedBy: 'user-123',
      });

      auditStore.clear();
      await service.activateTenant(created.id, 'user-456');

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tenant_activated');
      expect(events[0].details.activatedBy).toBe('user-456');
      expect(events[0].details.previousStatus).toBe('suspended');
    });

    it('should throw error when transitioning from invalid state', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);

      // Already active, cannot activate again
      await expect(service.activateTenant(created.id, 'user-123')).rejects.toThrow(
        /Invalid state transition/
      );
    });
  });

  describe('suspendTenant', () => {
    it('should suspend an active tenant', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      const suspended = await service.suspendTenant(created.id, {
        reason: 'Payment failure',
        suspendedBy: 'system',
      });

      expect(suspended.status).toBe('suspended');
    });

    it('should create audit event with suspension reason', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      auditStore.clear();

      await service.suspendTenant(created.id, {
        reason: 'Payment failure',
        suspendedBy: 'system',
      });

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tenant_suspended');
      expect(events[0].details.reason).toBe('Payment failure');
      expect(events[0].details.suspendedBy).toBe('system');
    });
  });

  describe('pauseTenant', () => {
    it('should pause an active tenant', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      const paused = await service.pauseTenant(created.id, 'user-123', 'Temporary hold');

      expect(paused.status).toBe('paused');
    });
  });

  describe('deleteTenant', () => {
    it('should soft delete a tenant', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      const deleted = await service.deleteTenant(created.id, 'user-123', 'No longer needed');

      expect(deleted.status).toBe('deactivated');

      // Verify tenant still exists in store
      const tenant = await tenantStore.getTenant(created.id);
      expect(tenant).toBeTruthy();
      expect(tenant?.status).toBe('deactivated');
    });

    it('should create audit event marking deletion as recoverable', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      auditStore.clear();

      await service.deleteTenant(created.id, 'user-123', 'No longer needed');

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tenant_deleted');
      expect(events[0].details.recoverable).toBe(true);
    });
  });

  describe('hardDeleteTenant', () => {
    it('should permanently delete a tenant with valid confirmation', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      await service.hardDeleteTenant(created.id, 'user-123', created.id);

      // Verify tenant is gone
      const tenant = await tenantStore.getTenant(created.id);
      expect(tenant).toBeNull();
    });

    it('should reject hard delete without valid confirmation token', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);

      await expect(
        service.hardDeleteTenant(created.id, 'user-123', 'wrong-token')
      ).rejects.toThrow('Invalid confirmation token');

      // Verify tenant still exists
      const tenant = await tenantStore.getTenant(created.id);
      expect(tenant).toBeTruthy();
    });

    it('should create audit event marking deletion as irreversible', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      auditStore.clear();

      await service.hardDeleteTenant(created.id, 'user-123', created.id);

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tenant_hard_deleted');
      expect(events[0].details.recoverable).toBe(false);
      expect(events[0].details.warning).toBe('IRREVERSIBLE_DELETION');
    });
  });

  // ===========================================================================
  // Plan Management Tests
  // ===========================================================================

  describe('updateTenantPlan', () => {
    it('should upgrade tenant plan', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'free',
      };

      const created = await service.createTenant(params);
      const updated = await service.updateTenantPlan(
        created.id,
        { newPlan: 'pro', reason: 'Upgrading for more features' },
        'user-123'
      );

      expect(updated.plan).toBe('pro');
      expect(updated.planLimits).toEqual(PLAN_LIMITS.pro);
    });

    it('should downgrade plan if constraints are met', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'pro',
      };

      const created = await service.createTenant(params);
      const updated = await service.updateTenantPlan(
        created.id,
        { newPlan: 'team', reason: 'Cost reduction' },
        'user-123'
      );

      expect(updated.plan).toBe('team');
      expect(updated.planLimits).toEqual(PLAN_LIMITS.team);
    });

    it('should reject downgrade if repo count exceeds new limit', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'pro',
      };

      const created = await service.createTenant(params);

      // Add more repos than team plan allows (team allows 10, add 11)
      for (let i = 0; i < 11; i++) {
        tenantStore.addRepoForTest(created.id, {
          id: `repo-${i}`,
          tenantId: created.id,
          githubRepoId: i,
          githubFullName: `test-org/repo-${i}`,
          displayName: `Repo ${i}`,
          enabled: true,
          settings: {
            autoTriage: false,
            autoReview: false,
            autoResolve: false,
          },
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          addedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await expect(
        service.updateTenantPlan(created.id, { newPlan: 'team' }, 'user-123')
      ).rejects.toThrow(/11 active repos exceeds limit of 10/);
    });

    it('should reject downgrade if member count exceeds new limit', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'team',
      };

      const created = await service.createTenant(params);

      // Add more members than free plan allows (free allows 5, add 6)
      for (let i = 0; i < 6; i++) {
        membershipStore.addMember(created.id, {
          id: `membership-${i}`,
          userId: `user-${i}`,
          tenantId: created.id,
          role: 'member',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await expect(
        service.updateTenantPlan(created.id, { newPlan: 'free' }, 'user-123')
      ).rejects.toThrow(/6 active members exceeds limit of 5/);
    });

    it('should skip update if plan is unchanged', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'team',
      };

      const created = await service.createTenant(params);
      auditStore.clear();

      const updated = await service.updateTenantPlan(
        created.id,
        { newPlan: 'team' },
        'user-123'
      );

      expect(updated.plan).toBe('team');

      // Should not create audit event for no-op
      const events = auditStore.getEvents();
      expect(events).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Status Tests
  // ===========================================================================

  describe('getTenantStatus', () => {
    it('should return detailed tenant status', async () => {
      const params: CreateTenantParams = {
        githubOrgId: 12345,
        githubOrgLogin: 'test-org',
        displayName: 'Test Organization',
        installationId: 67890,
        installedBy: 'user-123',
        plan: 'pro',
      };

      const created = await service.createTenant(params);

      // Add some repos
      tenantStore.addRepoForTest(created.id, {
        id: 'repo-1',
        tenantId: created.id,
        githubRepoId: 1,
        githubFullName: 'test-org/repo-1',
        displayName: 'Repo 1',
        enabled: true,
        settings: {
          autoTriage: false,
          autoReview: false,
          autoResolve: false,
        },
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        addedAt: new Date(),
        updatedAt: new Date(),
      });

      // Add some members
      membershipStore.addMember(created.id, {
        id: 'membership-1',
        userId: 'user-1',
        tenantId: created.id,
        role: 'owner',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const status = await service.getTenantStatus(created.id);

      expect(status.tenantId).toBe(created.id);
      expect(status.status).toBe('active');
      expect(status.plan).toBe('pro');
      expect(status.limits).toEqual(PLAN_LIMITS.pro);
      expect(status.usage.activeRepos).toBe(1);
      expect(status.usage.activeMembers).toBe(1);
      expect(status.quotaUsage.repos).toBeLessThan(100);
      expect(status.quotaUsage.members).toBeLessThan(100);
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(service.getTenantStatus('gh-org-99999')).rejects.toThrow(
        'Tenant gh-org-99999 not found'
      );
    });
  });
});
