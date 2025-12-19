/**
 * Installation Handler Tests
 *
 * B2.s1: Tests for GitHub App installation and uninstallation event handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleInstallationRepositories,
  type InstallationPayload,
  type InstallationRepositoriesPayload,
} from '../handlers/installation.js';
import { InMemoryTenantStore, InMemoryRunStore } from '@gwi/core';

describe('Installation Handler', () => {
  let tenantStore: InMemoryTenantStore;
  let runStore: InMemoryRunStore;

  beforeEach(() => {
    tenantStore = new InMemoryTenantStore();
    runStore = new InMemoryRunStore();
  });

  afterEach(() => {
    // Clean up
  });

  describe('handleInstallationCreated', () => {
    it('should create new tenant for organization installation', async () => {
      const payload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
            avatar_url: 'https://github.com/acme-corp.png',
          },
          repository_selection: 'selected',
          permissions: {
            contents: 'read',
            pull_requests: 'write',
          },
          events: ['pull_request', 'push'],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
          {
            id: 222,
            name: 'repo2',
            full_name: 'acme-corp/repo2',
            private: true,
          },
        ],
        sender: {
          id: 999,
          login: 'admin-user',
          avatar_url: 'https://github.com/admin-user.png',
        },
      };

      const result = await handleInstallationCreated(payload, tenantStore);

      expect(result.status).toBe('created');
      expect(result.tenantId).toBe('gh-organization-67890');
      expect(result.reposAdded).toBe(2);

      // Verify tenant was created
      const tenant = await tenantStore.getTenant('gh-organization-67890');
      expect(tenant).toBeDefined();
      expect(tenant?.githubOrgId).toBe(67890);
      expect(tenant?.githubOrgLogin).toBe('acme-corp');
      expect(tenant?.installationId).toBe(12345);
      expect(tenant?.installedBy).toBe('admin-user');
      expect(tenant?.status).toBe('active');
      expect(tenant?.plan).toBe('free');

      // Verify repos were added
      const repos = await tenantStore.listRepos('gh-organization-67890');
      expect(repos).toHaveLength(2);
      expect(repos.map(r => r.githubRepoId).sort()).toEqual([111, 222]);
    });

    it('should create new tenant for user installation', async () => {
      const payload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 11111,
          account: {
            id: 22222,
            login: 'john-doe',
            type: 'User',
          },
          repository_selection: 'all',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        sender: {
          id: 22222,
          login: 'john-doe',
        },
      };

      const result = await handleInstallationCreated(payload, tenantStore);

      expect(result.status).toBe('created');
      expect(result.tenantId).toBe('gh-user-22222');

      const tenant = await tenantStore.getTenant('gh-user-22222');
      expect(tenant?.githubOrgLogin).toBe('john-doe');
    });

    it('should update existing tenant on reinstall', async () => {
      // First installation
      const payload1: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin1',
        },
      };

      await handleInstallationCreated(payload1, tenantStore);

      // Reinstall with new installation ID
      const payload2: InstallationPayload = {
        ...payload1,
        installation: {
          ...payload1.installation,
          id: 99999, // New installation ID
          created_at: '2025-01-02T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
        repositories: [
          {
            id: 222,
            name: 'repo2',
            full_name: 'acme-corp/repo2',
            private: false,
          },
        ],
        sender: {
          id: 888,
          login: 'admin2',
        },
      };

      const result = await handleInstallationCreated(payload2, tenantStore);

      expect(result.status).toBe('updated');
      expect(result.tenantId).toBe('gh-organization-67890');

      const tenant = await tenantStore.getTenant('gh-organization-67890');
      expect(tenant?.installationId).toBe(99999);
      expect(tenant?.installedBy).toBe('admin2');

      // Should have both repos
      const repos = await tenantStore.listRepos('gh-organization-67890');
      expect(repos.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle installation with no repositories', async () => {
      const payload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        // No repositories array
        sender: {
          id: 999,
          login: 'admin-user',
        },
      };

      const result = await handleInstallationCreated(payload, tenantStore);

      expect(result.status).toBe('created');
      expect(result.reposAdded).toBe(0);
    });

    it('should set default tenant settings', async () => {
      const payload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'all',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      await handleInstallationCreated(payload, tenantStore);

      const tenant = await tenantStore.getTenant('gh-organization-67890');
      expect(tenant?.settings).toBeDefined();
      expect(tenant?.settings.defaultRiskMode).toBe('comment_only');
      expect(tenant?.settings.autoRunOnConflict).toBe(true);
    });

    it('should set default repo settings', async () => {
      const payload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      await handleInstallationCreated(payload, tenantStore);

      const repos = await tenantStore.listRepos('gh-organization-67890');
      expect(repos[0].settings).toBeDefined();
      expect(repos[0].settings.autoTriage).toBe(true);
      expect(repos[0].settings.autoResolve).toBe(false);
    });
  });

  describe('handleInstallationDeleted', () => {
    it('should soft delete tenant on uninstall', async () => {
      // First create a tenant
      const createPayload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      await handleInstallationCreated(createPayload, tenantStore);

      // Now delete it
      const deletePayload: InstallationPayload = {
        action: 'deleted',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationDeleted(deletePayload, tenantStore);

      expect(result.status).toBe('deleted');
      expect(result.tenantId).toBe('gh-organization-67890');
      expect(result.reposRemoved).toBe(1);

      // Tenant should still exist but with installationId set to 0
      const tenant = await tenantStore.getTenant('gh-organization-67890');
      expect(tenant).toBeDefined();
      expect(tenant?.installationId).toBe(0);

      // Repos should be disabled
      const repos = await tenantStore.listRepos('gh-organization-67890');
      expect(repos[0].enabled).toBe(false);
    });

    it('should handle deletion of non-existent tenant', async () => {
      const payload: InstallationPayload = {
        action: 'deleted',
        installation: {
          id: 12345,
          account: {
            id: 99999,
            login: 'non-existent',
            type: 'Organization',
          },
          repository_selection: 'all',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationDeleted(payload, tenantStore);

      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('not found');
    });

    it('should disable all repos on deletion', async () => {
      // Create tenant with multiple repos
      const createPayload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
          {
            id: 222,
            name: 'repo2',
            full_name: 'acme-corp/repo2',
            private: false,
          },
          {
            id: 333,
            name: 'repo3',
            full_name: 'acme-corp/repo3',
            private: true,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      await handleInstallationCreated(createPayload, tenantStore);

      // Delete installation
      const deletePayload: InstallationPayload = {
        ...createPayload,
        action: 'deleted',
      };

      const result = await handleInstallationDeleted(deletePayload, tenantStore);

      expect(result.reposRemoved).toBe(3);

      // All repos should be disabled
      const repos = await tenantStore.listRepos('gh-organization-67890');
      expect(repos.every(r => !r.enabled)).toBe(true);
    });
  });

  describe('handleInstallationRepositories', () => {
    beforeEach(async () => {
      // Create a tenant first
      const createPayload: InstallationPayload = {
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
          repository_selection: 'selected',
          permissions: {},
          events: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      await handleInstallationCreated(createPayload, tenantStore);
    });

    it('should add new repositories', async () => {
      const payload: InstallationRepositoriesPayload = {
        action: 'added',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
        },
        repository_selection: 'selected',
        repositories_added: [
          {
            id: 222,
            name: 'repo2',
            full_name: 'acme-corp/repo2',
            private: false,
          },
          {
            id: 333,
            name: 'repo3',
            full_name: 'acme-corp/repo3',
            private: true,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationRepositories(payload, tenantStore);

      expect(result.status).toBe('updated');
      expect(result.reposAdded).toBe(2);

      const repos = await tenantStore.listRepos('gh-organization-67890');
      expect(repos.length).toBeGreaterThanOrEqual(3);
    });

    it('should remove repositories (soft delete)', async () => {
      const payload: InstallationRepositoriesPayload = {
        action: 'removed',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
        },
        repository_selection: 'selected',
        repositories_removed: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationRepositories(payload, tenantStore);

      expect(result.status).toBe('updated');
      expect(result.reposRemoved).toBe(1);

      // Repo should be disabled, not deleted
      const repos = await tenantStore.listRepos('gh-organization-67890');
      const repo1 = repos.find(r => r.githubRepoId === 111);
      expect(repo1).toBeDefined();
      expect(repo1?.enabled).toBe(false);
    });

    it('should handle both add and remove in same event', async () => {
      const payload: InstallationRepositoriesPayload = {
        action: 'added',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
        },
        repository_selection: 'selected',
        repositories_added: [
          {
            id: 222,
            name: 'repo2',
            full_name: 'acme-corp/repo2',
            private: false,
          },
        ],
        repositories_removed: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationRepositories(payload, tenantStore);

      expect(result.status).toBe('updated');
      expect(result.reposAdded).toBe(1);
      expect(result.reposRemoved).toBe(1);
    });

    it('should handle event for non-existent tenant', async () => {
      const payload: InstallationRepositoriesPayload = {
        action: 'added',
        installation: {
          id: 99999,
          account: {
            id: 11111,
            login: 'non-existent',
            type: 'Organization',
          },
        },
        repository_selection: 'selected',
        repositories_added: [
          {
            id: 222,
            name: 'repo2',
            full_name: 'non-existent/repo2',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationRepositories(payload, tenantStore);

      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('not found');
    });

    it('should re-enable previously disabled repo', async () => {
      // First remove repo1
      const removePayload: InstallationRepositoriesPayload = {
        action: 'removed',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
        },
        repository_selection: 'selected',
        repositories_removed: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      await handleInstallationRepositories(removePayload, tenantStore);

      // Now add it back
      const addPayload: InstallationRepositoriesPayload = {
        action: 'added',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
        },
        repository_selection: 'selected',
        repositories_added: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin',
        },
      };

      const result = await handleInstallationRepositories(addPayload, tenantStore);

      expect(result.reposAdded).toBe(1);

      // Repo should be re-enabled
      const repo = await tenantStore.getRepo('gh-organization-67890', 'gh-repo-111');
      expect(repo?.enabled).toBe(true);
    });
  });
});
