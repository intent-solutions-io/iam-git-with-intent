/**
 * Concurrency Tracking Tests
 *
 * Phase A6: Tests for countInFlightRuns in TenantStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTenantStore } from '../inmemory.js';
import type { RunType } from '../interfaces.js';

describe('TenantStore.countInFlightRuns (A6)', () => {
  let store: InMemoryTenantStore;
  const tenantId = 'test-tenant';

  beforeEach(async () => {
    store = new InMemoryTenantStore();
    // Create a tenant first
    await store.createTenant({
      id: tenantId,
      name: 'Test Tenant',
      slug: 'test-tenant',
      status: 'active',
      plan: 'pro',
    });
  });

  it('should return 0 when no runs exist', async () => {
    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(0);
  });

  it('should count pending runs', async () => {
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'pending',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(1);
  });

  it('should count running runs', async () => {
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'running',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(1);
  });

  it('should count both pending and running runs', async () => {
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'pending',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'running',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/2',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(2);
  });

  it('should NOT count completed runs', async () => {
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'completed',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(0);
  });

  it('should NOT count failed runs', async () => {
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'failed',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(0);
  });

  it('should NOT count cancelled runs', async () => {
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'cancelled',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(0);
  });

  it('should only count runs for the specified tenant', async () => {
    const otherTenantId = 'other-tenant';
    await store.createTenant({
      id: otherTenantId,
      name: 'Other Tenant',
      slug: 'other-tenant',
      status: 'active',
      plan: 'pro',
    });

    // Create runs for both tenants
    await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'running',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    await store.createRun(otherTenantId, {
      tenantId: otherTenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'running',
      trigger: 'api',
      prUrl: 'https://github.com/other/repo/pull/1',
    });

    const count = await store.countInFlightRuns(tenantId);
    expect(count).toBe(1);

    const otherCount = await store.countInFlightRuns(otherTenantId);
    expect(otherCount).toBe(1);
  });

  it('should update count when run status changes', async () => {
    const run = await store.createRun(tenantId, {
      tenantId,
      repoId: 'repo-1',
      type: 'pr_triage' as RunType,
      status: 'pending',
      trigger: 'api',
      prUrl: 'https://github.com/test/repo/pull/1',
    });

    expect(await store.countInFlightRuns(tenantId)).toBe(1);

    // Update to running - should still count
    await store.updateRun(tenantId, run.id, { status: 'running' });
    expect(await store.countInFlightRuns(tenantId)).toBe(1);

    // Update to completed - should not count
    await store.updateRun(tenantId, run.id, { status: 'completed' });
    expect(await store.countInFlightRuns(tenantId)).toBe(0);
  });
});
