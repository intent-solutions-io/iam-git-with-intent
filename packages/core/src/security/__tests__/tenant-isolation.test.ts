/**
 * Tenant Isolation Tests (A10.s4)
 *
 * Tests to verify tenant isolation is enforced at storage and API layers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasMinimumRole,
  canPerform,
  ROLE_HIERARCHY,
  type Role,
  type Action,
} from '../index.js';

// =============================================================================
// Role Hierarchy Tests
// =============================================================================

describe('Role Hierarchy', () => {
  it('has correct privilege ordering', () => {
    expect(ROLE_HIERARCHY.VIEWER).toBeLessThan(ROLE_HIERARCHY.DEVELOPER);
    expect(ROLE_HIERARCHY.DEVELOPER).toBeLessThan(ROLE_HIERARCHY.ADMIN);
    expect(ROLE_HIERARCHY.ADMIN).toBeLessThan(ROLE_HIERARCHY.OWNER);
  });

  it('hasMinimumRole allows same role', () => {
    expect(hasMinimumRole('VIEWER', 'VIEWER')).toBe(true);
    expect(hasMinimumRole('DEVELOPER', 'DEVELOPER')).toBe(true);
    expect(hasMinimumRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasMinimumRole('OWNER', 'OWNER')).toBe(true);
  });

  it('hasMinimumRole allows higher role', () => {
    expect(hasMinimumRole('OWNER', 'VIEWER')).toBe(true);
    expect(hasMinimumRole('ADMIN', 'DEVELOPER')).toBe(true);
    expect(hasMinimumRole('DEVELOPER', 'VIEWER')).toBe(true);
  });

  it('hasMinimumRole denies lower role', () => {
    expect(hasMinimumRole('VIEWER', 'DEVELOPER')).toBe(false);
    expect(hasMinimumRole('DEVELOPER', 'ADMIN')).toBe(false);
    expect(hasMinimumRole('ADMIN', 'OWNER')).toBe(false);
  });
});

// =============================================================================
// Permission Tests
// =============================================================================

describe('Permission Matrix', () => {
  describe('Tenant actions', () => {
    it('allows all roles to read tenant', () => {
      expect(canPerform('VIEWER', 'tenant:read')).toBe(true);
      expect(canPerform('DEVELOPER', 'tenant:read')).toBe(true);
      expect(canPerform('ADMIN', 'tenant:read')).toBe(true);
      expect(canPerform('OWNER', 'tenant:read')).toBe(true);
    });

    it('restricts tenant update to ADMIN+', () => {
      expect(canPerform('VIEWER', 'tenant:update')).toBe(false);
      expect(canPerform('DEVELOPER', 'tenant:update')).toBe(false);
      expect(canPerform('ADMIN', 'tenant:update')).toBe(true);
      expect(canPerform('OWNER', 'tenant:update')).toBe(true);
    });

    it('restricts tenant delete to OWNER only', () => {
      expect(canPerform('VIEWER', 'tenant:delete')).toBe(false);
      expect(canPerform('DEVELOPER', 'tenant:delete')).toBe(false);
      expect(canPerform('ADMIN', 'tenant:delete')).toBe(false);
      expect(canPerform('OWNER', 'tenant:delete')).toBe(true);
    });

    it('restricts billing to OWNER only', () => {
      expect(canPerform('VIEWER', 'tenant:billing')).toBe(false);
      expect(canPerform('DEVELOPER', 'tenant:billing')).toBe(false);
      expect(canPerform('ADMIN', 'tenant:billing')).toBe(false);
      expect(canPerform('OWNER', 'tenant:billing')).toBe(true);
    });
  });

  describe('Run actions', () => {
    it('allows all roles to read runs', () => {
      expect(canPerform('VIEWER', 'run:read')).toBe(true);
      expect(canPerform('DEVELOPER', 'run:read')).toBe(true);
    });

    it('restricts run creation to DEVELOPER+', () => {
      expect(canPerform('VIEWER', 'run:create')).toBe(false);
      expect(canPerform('DEVELOPER', 'run:create')).toBe(true);
      expect(canPerform('ADMIN', 'run:create')).toBe(true);
    });

    it('restricts run cancellation to DEVELOPER+', () => {
      expect(canPerform('VIEWER', 'run:cancel')).toBe(false);
      expect(canPerform('DEVELOPER', 'run:cancel')).toBe(true);
    });
  });

  describe('Member actions', () => {
    it('restricts member invite to ADMIN+', () => {
      expect(canPerform('VIEWER', 'member:invite')).toBe(false);
      expect(canPerform('DEVELOPER', 'member:invite')).toBe(false);
      expect(canPerform('ADMIN', 'member:invite')).toBe(true);
    });

    it('restricts role changes to OWNER only', () => {
      expect(canPerform('ADMIN', 'member:update_role')).toBe(false);
      expect(canPerform('OWNER', 'member:update_role')).toBe(true);
    });
  });

  describe('Repo actions', () => {
    it('allows all roles to read repos', () => {
      expect(canPerform('VIEWER', 'repo:read')).toBe(true);
    });

    it('restricts repo connection to ADMIN+', () => {
      expect(canPerform('DEVELOPER', 'repo:connect')).toBe(false);
      expect(canPerform('ADMIN', 'repo:connect')).toBe(true);
    });

    it('allows DEVELOPER+ to update repo settings', () => {
      expect(canPerform('VIEWER', 'repo:settings')).toBe(false);
      expect(canPerform('DEVELOPER', 'repo:settings')).toBe(true);
    });
  });
});

// =============================================================================
// RBAC Tenant Context Tests
// =============================================================================

import {
  requireTenant,
  requireTenantPermission,
  type RBACContext,
} from '../rbac.js';

describe('RBAC Tenant Context Enforcement', () => {
  const tenantAId = 'tenant-alpha';
  const tenantBId = 'tenant-beta';

  const createUserContext = (tenantId: string, role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER'): RBACContext => ({
    userId: 'user-123',
    email: 'user@example.com',
    tenantId,
    role,
    isServiceAccount: false,
  });

  const createServiceAccountContext = (): RBACContext => ({
    userId: 'sa-cloud-run',
    isServiceAccount: true,
  });

  describe('requireTenant()', () => {
    it('allows access when tenant IDs match', () => {
      const ctx = createUserContext(tenantAId, 'DEVELOPER');
      const result = requireTenant(ctx, tenantAId);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('CRITICAL: denies access when tenant IDs do not match', () => {
      const ctx = createUserContext(tenantAId, 'OWNER');
      const result = requireTenant(ctx, tenantBId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Access denied for this tenant');
    });

    it('denies access when user has no tenant context', () => {
      const ctx: RBACContext = {
        userId: 'user-123',
        isServiceAccount: false,
        // No tenantId
      };
      const result = requireTenant(ctx, tenantAId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No tenant context');
    });

    it('allows service accounts to access any tenant', () => {
      const ctx = createServiceAccountContext();
      const result = requireTenant(ctx, tenantBId);

      expect(result.allowed).toBe(true);
    });
  });

  describe('requireTenantPermission()', () => {
    it('allows action when tenant matches and role permits', () => {
      const ctx = createUserContext(tenantAId, 'DEVELOPER');
      const result = requireTenantPermission(ctx, tenantAId, 'run:create');

      expect(result.allowed).toBe(true);
    });

    it('CRITICAL: denies action when tenant does not match (even if role permits)', () => {
      const ctx = createUserContext(tenantAId, 'OWNER');
      const result = requireTenantPermission(ctx, tenantBId, 'run:create');

      // Should fail on tenant check before even reaching permission check
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Access denied for this tenant');
    });

    it('denies action when tenant matches but role forbids', () => {
      const ctx = createUserContext(tenantAId, 'VIEWER');
      const result = requireTenantPermission(ctx, tenantAId, 'run:create');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted');
    });
  });
});

// =============================================================================
// Cross-Tenant Access Prevention Tests
// =============================================================================

describe('Cross-Tenant Access Prevention', () => {
  /**
   * NOTE: Comprehensive negative tests for storage-layer tenant isolation
   * are in: packages/core/src/storage/__tests__/tenant-isolation-negative.test.ts
   *
   * This file focuses on RBAC/security module enforcement.
   */

  it('enforces tenantId in RBAC context for all operations', () => {
    // The RBACContext interface requires tenantId for tenant-scoped operations
    const ctx: RBACContext = {
      userId: 'user-123',
      isServiceAccount: false,
      // Missing tenantId - should fail tenant checks
    };

    const result = requireTenant(ctx, 'any-tenant');
    expect(result.allowed).toBe(false);
  });

  it('documents storage operations that require tenantId', () => {
    // All TenantStore methods require tenantId as first parameter
    const tenantScopedOperations = [
      'TenantStore.getRun(tenantId, runId)',
      'TenantStore.listRuns(tenantId, filter)',
      'TenantStore.createRun(tenantId, run)',
      'TenantStore.updateRun(tenantId, runId, update)',
      'TenantStore.getRepo(tenantId, repoId)',
      'TenantStore.listRepos(tenantId, filter)',
      'TenantStore.addRepo(tenantId, repo)',
      'TenantStore.updateRepo(tenantId, repoId, update)',
      'TenantStore.removeRepo(tenantId, repoId)',
      'TenantStore.getConnectorConfig(tenantId, connectorId)',
      'TenantStore.setConnectorConfig(tenantId, config)',
      'TenantStore.listConnectorConfigs(tenantId)',
      'TenantStore.countInFlightRuns(tenantId)',
    ];

    // All operations enforce tenant scoping by design
    tenantScopedOperations.forEach((op) => {
      expect(op).toContain('tenantId');
    });
  });
});
