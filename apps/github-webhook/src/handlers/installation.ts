/**
 * GitHub App Installation Handler
 *
 * Handles installation.created and installation.deleted events to:
 * 1. Create/delete tenants in Firestore
 * 2. Map installed repos to tenant
 * 3. Track installation metadata
 *
 * Phase 8: GitHub App + Webhook Integration
 *
 * @module @gwi/github-webhook/handlers
 */

import type {
  Tenant,
  TenantRepo,
  TenantStore,
  TenantSettings,
  RepoSettings,
} from '@gwi/core';
import { getTenantStore, createLogger } from '@gwi/core';

const logger = createLogger('github-webhook:installation');

// =============================================================================
// Types
// =============================================================================

/**
 * GitHub App installation payload (subset)
 */
export interface InstallationPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend' | 'new_permissions_accepted';
  installation: {
    id: number;
    account: {
      id: number;
      login: string;
      type: 'Organization' | 'User';
      avatar_url?: string;
    };
    repository_selection: 'all' | 'selected';
    permissions: Record<string, string>;
    events: string[];
    created_at: string;
    updated_at: string;
    single_file_name?: string;
    html_url?: string;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender: {
    id: number;
    login: string;
    avatar_url?: string;
  };
}

/**
 * GitHub installation_repositories event payload
 */
export interface InstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: {
    id: number;
    account: {
      id: number;
      login: string;
      type: 'Organization' | 'User';
    };
  };
  repository_selection: 'all' | 'selected';
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender: {
    id: number;
    login: string;
  };
}

/**
 * Result from installation handler
 */
export interface InstallationResult {
  status: 'created' | 'deleted' | 'updated' | 'skipped';
  tenantId?: string;
  reposAdded?: number;
  reposRemoved?: number;
  reason?: string;
}

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  defaultRiskMode: 'comment_only',
  defaultTriageModel: 'gemini-2.0-flash-exp',
  defaultCodeModel: 'claude-sonnet-4-20250514',
  complexityThreshold: 3,
  autoRunOnConflict: true,
  autoRunOnPrOpen: false,
};

const DEFAULT_REPO_SETTINGS: RepoSettings = {
  autoTriage: true,
  autoReview: false,
  autoResolve: false,
};

// =============================================================================
// Installation Handler
// =============================================================================

/**
 * Handle installation.created event
 *
 * Creates a new tenant in Firestore for the GitHub org/user.
 */
export async function handleInstallationCreated(
  payload: InstallationPayload,
  store?: TenantStore
): Promise<InstallationResult> {
  const tenantStore = store ?? getTenantStore();
  const { installation, repositories, sender } = payload;
  const account = installation.account;

  // Generate tenant ID from GitHub org/user ID
  const tenantId = `gh-${account.type.toLowerCase()}-${account.id}`;

  // Check if tenant already exists
  const existing = await tenantStore.getTenant(tenantId);
  if (existing) {
    logger.info('Tenant already exists, updating', { tenantId });

    // Update installation info
    await tenantStore.updateTenant(tenantId, {
      installationId: installation.id,
      installedAt: new Date(installation.created_at),
      installedBy: sender.login,
    });

    // Add any new repos
    const reposAdded = await addReposToTenant(
      tenantStore,
      tenantId,
      repositories || []
    );

    return {
      status: 'updated',
      tenantId,
      reposAdded,
    };
  }

  // Create new tenant
  const tenant: Omit<Tenant, 'createdAt' | 'updatedAt'> = {
    id: tenantId,
    githubOrgId: account.id,
    githubOrgLogin: account.login,
    displayName: account.login,
    installationId: installation.id,
    installedAt: new Date(installation.created_at),
    installedBy: sender.login,
    status: 'active',  // Phase 11: new tenants start as active
    plan: 'free',
    planLimits: {
      runsPerMonth: 100,
      reposMax: 5,
      membersMax: 3,
    },
    settings: DEFAULT_TENANT_SETTINGS,
    runsThisMonth: 0,
  };

  await tenantStore.createTenant(tenant);

  console.log(JSON.stringify({
    type: 'tenant_created',
    tenantId,
    githubOrgLogin: account.login,
    installationId: installation.id,
  }));

  // Add repositories
  const reposAdded = await addReposToTenant(
    tenantStore,
    tenantId,
    repositories || []
  );

  return {
    status: 'created',
    tenantId,
    reposAdded,
  };
}

/**
 * Handle installation.deleted event
 *
 * Marks tenant as inactive (soft delete) rather than hard deleting.
 * This preserves run history for auditing.
 */
export async function handleInstallationDeleted(
  payload: InstallationPayload,
  store?: TenantStore
): Promise<InstallationResult> {
  const tenantStore = store ?? getTenantStore();
  const account = payload.installation.account;

  const tenantId = `gh-${account.type.toLowerCase()}-${account.id}`;

  const existing = await tenantStore.getTenant(tenantId);
  if (!existing) {
    logger.info('Tenant not found for deletion', { tenantId });
    return {
      status: 'skipped',
      reason: 'Tenant not found',
    };
  }

  // Soft delete: update installationId to 0 and disable all repos
  await tenantStore.updateTenant(tenantId, {
    installationId: 0,
  });

  // Disable all repos
  const repos = await tenantStore.listRepos(tenantId);
  for (const repo of repos) {
    await tenantStore.updateRepo(tenantId, repo.id, { enabled: false });
  }

  console.log(JSON.stringify({
    type: 'tenant_deactivated',
    tenantId,
    githubOrgLogin: account.login,
    reposDisabled: repos.length,
  }));

  return {
    status: 'deleted',
    tenantId,
    reposRemoved: repos.length,
  };
}

/**
 * Handle installation_repositories event (repos added/removed)
 */
export async function handleInstallationRepositories(
  payload: InstallationRepositoriesPayload,
  store?: TenantStore
): Promise<InstallationResult> {
  const tenantStore = store ?? getTenantStore();
  const account = payload.installation.account;

  const tenantId = `gh-${account.type.toLowerCase()}-${account.id}`;

  const existing = await tenantStore.getTenant(tenantId);
  if (!existing) {
    logger.info('Tenant not found for repo update', { tenantId });
    return {
      status: 'skipped',
      reason: 'Tenant not found',
    };
  }

  let reposAdded = 0;
  let reposRemoved = 0;

  // Add new repos
  if (payload.repositories_added?.length) {
    reposAdded = await addReposToTenant(
      tenantStore,
      tenantId,
      payload.repositories_added
    );
  }

  // Remove repos (soft delete - disable)
  if (payload.repositories_removed?.length) {
    for (const repo of payload.repositories_removed) {
      const repoId = `gh-repo-${repo.id}`;
      try {
        await tenantStore.updateRepo(tenantId, repoId, { enabled: false });
        reposRemoved++;
      } catch {
        // Repo might not exist in our store
      }
    }
  }

  console.log(JSON.stringify({
    type: 'repos_updated',
    tenantId,
    reposAdded,
    reposRemoved,
    action: payload.action,
  }));

  return {
    status: 'updated',
    tenantId,
    reposAdded,
    reposRemoved,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Add repositories to a tenant
 */
async function addReposToTenant(
  store: TenantStore,
  tenantId: string,
  repos: Array<{ id: number; name: string; full_name: string; private: boolean }>
): Promise<number> {
  let added = 0;

  for (const repo of repos) {
    const repoId = `gh-repo-${repo.id}`;

    // Check if repo already exists
    const existing = await store.getRepo(tenantId, repoId);
    if (existing) {
      // Re-enable if it was disabled
      if (!existing.enabled) {
        await store.updateRepo(tenantId, repoId, { enabled: true });
        added++;
      }
      continue;
    }

    const tenantRepo: Omit<TenantRepo, 'addedAt' | 'updatedAt'> = {
      id: repoId,
      tenantId,
      githubRepoId: repo.id,
      githubFullName: repo.full_name,
      displayName: repo.name,
      enabled: true,
      settings: DEFAULT_REPO_SETTINGS,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
    };

    await store.addRepo(tenantId, tenantRepo);
    added++;

    console.log(JSON.stringify({
      type: 'repo_added',
      tenantId,
      repoId,
      fullName: repo.full_name,
    }));
  }

  return added;
}

/**
 * Get tenant ID from installation ID
 *
 * Useful for webhook events that only have installation.id
 */
export async function getTenantByInstallationId(
  installationId: number,
  _store?: TenantStore
): Promise<Tenant | null> {
  // Note: This is a simple implementation that would benefit from
  // an index on installationId in production. For now we use
  // a convention-based lookup.
  //
  // In a real implementation, we'd add:
  // - An installationId -> tenantId index in Firestore
  // - Or a dedicated installations collection
  //
  // For Phase 8, we rely on the tenant ID being known from
  // the installation event context.

  logger.warn('Consider adding installationId index for production', { installationId });

  return null;
}
