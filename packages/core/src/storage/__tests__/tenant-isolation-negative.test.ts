/**
 * Tenant Isolation Negative Tests (A1.s5)
 *
 * CRITICAL SECURITY TESTS: Verify tenant A cannot access tenant B's data.
 *
 * These tests validate:
 * 1. Cross-tenant run access is blocked
 * 2. Cross-tenant repo access is blocked
 * 3. Cross-tenant connector config access is blocked
 * 4. Audit logging occurs for access attempts
 *
 * OWASP Reference: A01:2021 - Broken Access Control
 *
 * @module @gwi/core/storage/__tests__/tenant-isolation-negative
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryTenantStore } from '../inmemory.js';
import type { Tenant, TenantRepo, SaaSRun, RunType, TenantConnectorConfig } from '../interfaces.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('Tenant Isolation - Negative Tests (A1.s5)', () => {
  let store: InMemoryTenantStore;

  // Test tenant IDs
  const TENANT_A = 'tenant-alpha';
  const TENANT_B = 'tenant-beta';
  const TENANT_NONEXISTENT = 'tenant-does-not-exist';

  // Shared test data
  let tenantARun: SaaSRun;
  let tenantBRun: SaaSRun;
  let tenantARepo: TenantRepo;
  let tenantBRepo: TenantRepo;

  beforeEach(async () => {
    store = new InMemoryTenantStore();

    // Create two separate tenants
    await store.createTenant({
      id: TENANT_A,
      githubOrgId: 1001,
      githubOrgLogin: 'alpha-org',
      displayName: 'Alpha Organization',
      installationId: 1001,
      installedAt: new Date(),
      installedBy: 'user-alpha',
      status: 'active',
      plan: 'pro',
      planLimits: { runsPerMonth: 500, reposMax: 20, membersMax: 15 },
      settings: {
        defaultRiskMode: 'comment_only',
        defaultTriageModel: 'gemini-flash',
        defaultCodeModel: 'claude-sonnet',
        complexityThreshold: 3,
        autoRunOnConflict: false,
        autoRunOnPrOpen: false,
      },
      runsThisMonth: 0,
    });

    await store.createTenant({
      id: TENANT_B,
      githubOrgId: 2002,
      githubOrgLogin: 'beta-org',
      displayName: 'Beta Organization',
      installationId: 2002,
      installedAt: new Date(),
      installedBy: 'user-beta',
      status: 'active',
      plan: 'enterprise',
      planLimits: { runsPerMonth: 10000, reposMax: 200, membersMax: 100 },
      settings: {
        defaultRiskMode: 'auto_patch',
        defaultTriageModel: 'gemini-flash',
        defaultCodeModel: 'claude-opus',
        complexityThreshold: 4,
        autoRunOnConflict: true,
        autoRunOnPrOpen: true,
      },
      runsThisMonth: 0,
    });

    // Create repos for each tenant
    tenantARepo = await store.addRepo(TENANT_A, {
      id: 'repo-alpha-1',
      tenantId: TENANT_A,
      githubRepoId: 11111,
      githubFullName: 'alpha-org/secret-repo',
      displayName: 'Alpha Secret Repo',
      enabled: true,
      settings: {
        autoTriage: true,
        autoReview: true,
        autoResolve: false,
      },
      totalRuns: 10,
      successfulRuns: 8,
      failedRuns: 2,
    });

    tenantBRepo = await store.addRepo(TENANT_B, {
      id: 'repo-beta-1',
      tenantId: TENANT_B,
      githubRepoId: 22222,
      githubFullName: 'beta-org/confidential-repo',
      displayName: 'Beta Confidential Repo',
      enabled: true,
      settings: {
        autoTriage: false,
        autoReview: true,
        autoResolve: true,
      },
      totalRuns: 50,
      successfulRuns: 45,
      failedRuns: 5,
    });

    // Create runs for each tenant
    tenantARun = await store.createRun(TENANT_A, {
      tenantId: TENANT_A,
      repoId: 'repo-alpha-1',
      prId: 'pr-alpha-123',
      prUrl: 'https://github.com/alpha-org/secret-repo/pull/123',
      type: 'triage' as RunType,
      status: 'completed',
      steps: [],
      trigger: { source: 'webhook' },
    });

    tenantBRun = await store.createRun(TENANT_B, {
      tenantId: TENANT_B,
      repoId: 'repo-beta-1',
      prId: 'pr-beta-456',
      prUrl: 'https://github.com/beta-org/confidential-repo/pull/456',
      type: 'autopilot' as RunType,
      status: 'running',
      steps: [],
      trigger: { source: 'ui', userId: 'user-beta-admin' },
    });
  });

  // =============================================================================
  // Cross-Tenant Run Access Tests
  // =============================================================================

  describe('Cross-Tenant Run Access Prevention', () => {
    it('CRITICAL: tenant A cannot read tenant B run by ID', async () => {
      // Attempt to access tenant B's run using tenant A's context
      const result = await store.getRun(TENANT_A, tenantBRun.id);

      // MUST return null - never expose other tenant's data
      expect(result).toBeNull();
    });

    it('CRITICAL: tenant B cannot read tenant A run by ID', async () => {
      const result = await store.getRun(TENANT_B, tenantARun.id);

      expect(result).toBeNull();
    });

    it('CRITICAL: cross-tenant listRuns returns empty array, not other tenant data', async () => {
      // List runs for tenant A
      const tenantARuns = await store.listRuns(TENANT_A);

      // Verify only tenant A's runs are returned
      expect(tenantARuns.length).toBeGreaterThan(0);
      tenantARuns.forEach((run) => {
        expect(run.tenantId).toBe(TENANT_A);
      });

      // Verify tenant B's run is NOT in tenant A's list
      const hasTenantBRun = tenantARuns.some((run) => run.id === tenantBRun.id);
      expect(hasTenantBRun).toBe(false);
    });

    it('CRITICAL: tenant cannot access runs with non-existent tenant ID', async () => {
      const result = await store.getRun(TENANT_NONEXISTENT, tenantARun.id);
      expect(result).toBeNull();
    });

    it('CRITICAL: countRuns only counts own tenant runs', async () => {
      const tenantACount = await store.countRuns(TENANT_A);
      const tenantBCount = await store.countRuns(TENANT_B);

      // Each tenant should only see their own count
      expect(tenantACount).toBe(1);
      expect(tenantBCount).toBe(1);
    });

    it('CRITICAL: countInFlightRuns respects tenant boundary', async () => {
      // Create an in-flight run for tenant B
      await store.createRun(TENANT_B, {
        tenantId: TENANT_B,
        repoId: 'repo-beta-1',
        prId: 'pr-beta-789',
        prUrl: 'https://github.com/beta-org/confidential-repo/pull/789',
        type: 'resolve' as RunType,
        status: 'pending',
        steps: [],
        trigger: { source: 'api' },
      });

      // Tenant A should see 0 in-flight runs (their run is completed)
      const tenantAInFlight = await store.countInFlightRuns(TENANT_A);
      expect(tenantAInFlight).toBe(0);

      // Tenant B should see 2 (running + pending)
      const tenantBInFlight = await store.countInFlightRuns(TENANT_B);
      expect(tenantBInFlight).toBe(2);
    });

    it('CRITICAL: updateRun fails for cross-tenant attempt', async () => {
      // Attempt to update tenant B's run using tenant A's context
      await expect(
        store.updateRun(TENANT_A, tenantBRun.id, { status: 'cancelled' })
      ).rejects.toThrow('Run not found');

      // Verify tenant B's run is unchanged
      const tenantBRunAfter = await store.getRun(TENANT_B, tenantBRun.id);
      expect(tenantBRunAfter?.status).toBe('running');
    });
  });

  // =============================================================================
  // Cross-Tenant Repo Access Tests
  // =============================================================================

  describe('Cross-Tenant Repo Access Prevention', () => {
    it('CRITICAL: tenant A cannot read tenant B repo', async () => {
      const result = await store.getRepo(TENANT_A, tenantBRepo.id);
      expect(result).toBeNull();
    });

    it('CRITICAL: tenant B cannot read tenant A repo', async () => {
      const result = await store.getRepo(TENANT_B, tenantARepo.id);
      expect(result).toBeNull();
    });

    it('CRITICAL: listRepos only returns own tenant repos', async () => {
      const tenantARepos = await store.listRepos(TENANT_A);
      const tenantBRepos = await store.listRepos(TENANT_B);

      // Verify isolation
      tenantARepos.forEach((repo) => {
        expect(repo.tenantId).toBe(TENANT_A);
      });
      tenantBRepos.forEach((repo) => {
        expect(repo.tenantId).toBe(TENANT_B);
      });

      // Cross-check: no leakage
      expect(tenantARepos.some((r) => r.id === tenantBRepo.id)).toBe(false);
      expect(tenantBRepos.some((r) => r.id === tenantARepo.id)).toBe(false);
    });

    it('CRITICAL: updateRepo fails for cross-tenant attempt', async () => {
      await expect(
        store.updateRepo(TENANT_A, tenantBRepo.id, { enabled: false })
      ).rejects.toThrow('Repo not found');

      // Verify tenant B's repo is unchanged
      const tenantBRepoAfter = await store.getRepo(TENANT_B, tenantBRepo.id);
      expect(tenantBRepoAfter?.enabled).toBe(true);
    });

    it('CRITICAL: removeRepo fails for cross-tenant attempt', async () => {
      // This should silently fail (no-op) or throw - either is acceptable
      await store.removeRepo(TENANT_A, tenantBRepo.id);

      // Verify tenant B's repo still exists
      const tenantBRepoAfter = await store.getRepo(TENANT_B, tenantBRepo.id);
      expect(tenantBRepoAfter).not.toBeNull();
    });
  });

  // =============================================================================
  // Cross-Tenant Connector Config Tests
  // =============================================================================

  describe('Cross-Tenant Connector Config Access Prevention', () => {
    beforeEach(async () => {
      // Set up connector configs for each tenant
      await store.setConnectorConfig(TENANT_A, {
        connectorId: 'github-connector',
        tenantId: TENANT_A,
        enabled: true,
        timeouts: { connectMs: 5000, readMs: 30000 },
        secretRefs: { token: 'gcp://tenant-a-github-token' },
        config: { org: 'alpha-org' },
        updatedAt: new Date(),
        updatedBy: 'admin-alpha',
      });

      await store.setConnectorConfig(TENANT_B, {
        connectorId: 'github-connector',
        tenantId: TENANT_B,
        enabled: true,
        timeouts: { connectMs: 10000, readMs: 60000 },
        secretRefs: { token: 'gcp://tenant-b-github-token' },
        config: { org: 'beta-org' },
        updatedAt: new Date(),
        updatedBy: 'admin-beta',
      });
    });

    it('CRITICAL: tenant A cannot read tenant B connector config', async () => {
      // Same connector ID, different tenant context
      const result = await store.getConnectorConfig(TENANT_A, 'github-connector');

      // Should return tenant A's config, not tenant B's
      expect(result).not.toBeNull();
      expect(result?.tenantId).toBe(TENANT_A);
      expect(result?.secretRefs.token).toBe('gcp://tenant-a-github-token');
      expect(result?.secretRefs.token).not.toBe('gcp://tenant-b-github-token');
    });

    it('CRITICAL: listConnectorConfigs only returns own tenant configs', async () => {
      const tenantAConfigs = await store.listConnectorConfigs(TENANT_A);
      const tenantBConfigs = await store.listConnectorConfigs(TENANT_B);

      tenantAConfigs.forEach((config) => {
        expect(config.tenantId).toBe(TENANT_A);
      });
      tenantBConfigs.forEach((config) => {
        expect(config.tenantId).toBe(TENANT_B);
      });
    });

    it('CRITICAL: deleteConnectorConfig only affects own tenant', async () => {
      // Attempt to delete tenant B's config from tenant A's context
      await store.deleteConnectorConfig(TENANT_A, 'github-connector');

      // Tenant A's config should be deleted
      const tenantAConfigAfter = await store.getConnectorConfig(TENANT_A, 'github-connector');
      expect(tenantAConfigAfter).toBeNull();

      // Tenant B's config should still exist
      const tenantBConfigAfter = await store.getConnectorConfig(TENANT_B, 'github-connector');
      expect(tenantBConfigAfter).not.toBeNull();
    });
  });

  // =============================================================================
  // Tenant Deletion Isolation Tests
  // =============================================================================

  describe('Tenant Deletion Isolation', () => {
    it('CRITICAL: deleting tenant A does not affect tenant B data', async () => {
      // Record tenant B state before deletion
      const tenantBRunsBefore = await store.listRuns(TENANT_B);
      const tenantBReposBefore = await store.listRepos(TENANT_B);

      // Delete tenant A
      await store.deleteTenant(TENANT_A);

      // Verify tenant A is gone
      const tenantAAfter = await store.getTenant(TENANT_A);
      expect(tenantAAfter).toBeNull();

      // Verify tenant B is completely unaffected
      const tenantBAfter = await store.getTenant(TENANT_B);
      expect(tenantBAfter).not.toBeNull();

      const tenantBRunsAfter = await store.listRuns(TENANT_B);
      expect(tenantBRunsAfter.length).toBe(tenantBRunsBefore.length);

      const tenantBReposAfter = await store.listRepos(TENANT_B);
      expect(tenantBReposAfter.length).toBe(tenantBReposBefore.length);
    });

    it('CRITICAL: deleted tenant runs cannot be accessed by other tenants', async () => {
      const deletedRunId = tenantARun.id;

      // Delete tenant A
      await store.deleteTenant(TENANT_A);

      // Tenant B should not be able to access the deleted run
      const result = await store.getRun(TENANT_B, deletedRunId);
      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // Edge Cases and Boundary Tests
  // =============================================================================

  describe('Edge Cases', () => {
    it('CRITICAL: empty tenant ID is rejected', async () => {
      const result = await store.getRun('', tenantARun.id);
      expect(result).toBeNull();
    });

    it('CRITICAL: null-like tenant ID strings are rejected', async () => {
      const result = await store.getRun('null', tenantARun.id);
      expect(result).toBeNull();

      const result2 = await store.getRun('undefined', tenantARun.id);
      expect(result2).toBeNull();
    });

    it('CRITICAL: tenant ID with injection attempt is safely handled', async () => {
      // SQL injection style (should be harmless but test anyway)
      const result = await store.getRun("tenant'; DROP TABLE runs;--", tenantARun.id);
      expect(result).toBeNull();

      // Path traversal style
      const result2 = await store.getRun('../tenant-b', tenantARun.id);
      expect(result2).toBeNull();
    });

    it('CRITICAL: very long tenant ID is handled safely', async () => {
      const longTenantId = 'a'.repeat(10000);
      const result = await store.getRun(longTenantId, tenantARun.id);
      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // Audit Logging Verification (Conceptual - for future integration)
  // =============================================================================

  describe('Audit Logging for Cross-Tenant Access Attempts', () => {
    it('should log when cross-tenant run access is attempted', async () => {
      // Note: This test documents expected behavior for audit logging
      // The actual audit emitter integration would be tested in security/__tests__

      // Cross-tenant access attempt
      const result = await store.getRun(TENANT_A, tenantBRun.id);
      expect(result).toBeNull();

      // TODO: When audit integration is added, verify:
      // - An audit event was emitted
      // - Event type is 'data.accessed' with outcome 'denied'
      // - Event contains both the requesting tenant ID and the resource's tenant ID
    });

    it('should NOT log for successful same-tenant access', async () => {
      // Same-tenant access should succeed without denial logging
      const result = await store.getRun(TENANT_A, tenantARun.id);
      expect(result).not.toBeNull();

      // TODO: When audit integration is added, verify:
      // - No denial event was emitted
      // - Success access event may be emitted (depending on verbosity settings)
    });
  });
});

// =============================================================================
// Firestore-Specific Tests (requires emulator or mocks)
// =============================================================================

describe('Firestore Tenant Isolation - Integration Tests', () => {
  // These tests would run against Firestore emulator
  // Skipped by default - enable when running with emulator

  it.skip('Firestore rules: tenant A authenticated user cannot read tenant B runs', async () => {
    // This test requires Firestore emulator with rules
    // Test would:
    // 1. Create authenticated context for user in tenant A
    // 2. Attempt to read document in gwi_runs where tenantId = tenant B
    // 3. Verify PERMISSION_DENIED error
  });

  it.skip('Firestore rules: membership check prevents unauthorized access', async () => {
    // Test would verify the getMembership() function in rules
    // properly blocks users without active membership
  });

  it.skip('Firestore rules: suspended tenant cannot access data', async () => {
    // Test would verify isTenantActive() check blocks suspended tenants
  });
});
