/**
 * Example E2E Test
 *
 * Demonstrates best practices for E2E testing in Git With Intent:
 * - Using test helpers (ApiClient, GitHubMock, test data fixtures)
 * - Test setup and teardown
 * - Test isolation
 * - Assertions
 *
 * This test serves as a template for writing new E2E tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createApiClient, assertResponse } from './helpers/api-client.js';
import { createGitHubMock, scenarios as githubScenarios } from './helpers/github-mock.js';
import { createCompleteScenario, scenarios as dataScenarios } from './helpers/test-data.js';
import { setupE2E, createMockStores } from './setup.js';

// Initialize E2E test setup
setupE2E();

/**
 * Example E2E Test Suite
 */
describe('E2E Example Tests', () => {
  // Test fixtures
  let mockStores: ReturnType<typeof createMockStores>;
  let githubMock: ReturnType<typeof createGitHubMock>;

  // Setup before all tests
  beforeAll(async () => {
    // Initialize mock stores
    mockStores = createMockStores();

    // Initialize GitHub mock
    githubMock = createGitHubMock();
  });

  // Reset between tests for isolation
  beforeEach(async () => {
    mockStores.reset();
    githubMock.reset();
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up any resources
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      // Create a simple Express app for testing
      const app = express();
      app.get('/health', (_req, res) => {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '0.2.0',
          app: 'test',
        });
      });

      // Create API client
      const client = createApiClient({
        app,
        enableLogging: false,
      });

      // Make health check request
      const response = await client.healthCheck();

      // Assertions
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('app');
    });

    it('should include version information', async () => {
      const app = express();
      app.get('/health', (_req, res) => {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '0.2.0',
        });
      });

      const client = createApiClient({ app });
      const response = await client.healthCheck();

      assertResponse.isSuccess(response);
      assertResponse.hasProperty(response, 'version');
      expect(response.body.version).toBe('0.2.0');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const app = express();
      app.get('/protected', (req, res) => {
        const userId = req.headers['x-debug-user'];
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ message: 'Success' });
      });

      const client = createApiClient({ app });
      const response = await client.get('/protected');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should accept requests with valid authentication', async () => {
      const app = express();
      app.get('/protected', (req, res) => {
        const userId = req.headers['x-debug-user'];
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ message: 'Success', userId });
      });

      const client = createApiClient({
        app,
        defaultUserId: 'test-user-123',
      });

      const response = await client.get('/protected');

      assertResponse.isSuccess(response);
      expect(response.body).toHaveProperty('message', 'Success');
      expect(response.body).toHaveProperty('userId', 'test-user-123');
    });
  });

  describe('Test Data Fixtures', () => {
    it('should create complete test scenario', () => {
      // Create a complete scenario with tenant, user, membership, and repository
      const scenario = createCompleteScenario();

      // Verify all components are created
      expect(scenario.tenant).toBeDefined();
      expect(scenario.user).toBeDefined();
      expect(scenario.membership).toBeDefined();
      expect(scenario.repository).toBeDefined();

      // Verify relationships
      expect(scenario.membership.userId).toBe(scenario.user.id);
      expect(scenario.membership.tenantId).toBe(scenario.tenant.id);
    });

    it('should create solo developer scenario', () => {
      const scenario = dataScenarios.soloDeveloper();

      expect(scenario.tenant.plan).toBe('free');
      expect(scenario.membership.role).toBe('owner');
      expect(scenario.user.displayName).toContain('Solo Developer');
    });

    it('should create team scenario', () => {
      const scenario = dataScenarios.team();

      expect(scenario.tenant.plan).toBe('team');
      expect(scenario.memberships).toHaveLength(3);
      expect(scenario.memberships[0].role).toBe('owner');
      expect(scenario.memberships[1].role).toBe('admin');
      expect(scenario.memberships[2].role).toBe('member');
    });
  });

  describe('GitHub Mock', () => {
    it('should create and retrieve issue', () => {
      const issue = githubMock.addIssue('testorg', 'testrepo', {
        number: 1,
        title: 'Test Issue',
        body: 'Test issue body',
      });

      const retrieved = githubMock.getIssue('testorg', 'testrepo', 1);

      expect(retrieved).toEqual(issue);
      expect(retrieved?.title).toBe('Test Issue');
    });

    it('should create bug fix scenario', () => {
      const { mock, issue, repository } = githubScenarios.bugFixIssue();

      expect(issue.labels).toContainEqual({ name: 'bug', color: 'd73a4a' });
      expect(issue.title).toContain('Fix:');
      expect(repository.name).toBe('testrepo');
    });

    it('should create PR with conflicts', () => {
      const { pr } = githubScenarios.conflictingPR();

      expect(pr.mergeable).toBe(false);
      expect(pr.mergeable_state).toBe('dirty');
    });

    it('should track API requests', () => {
      githubMock.trackRequest('GET', '/repos/testorg/testrepo/issues/1');
      const commentsPath = '/repos/testorg/testrepo/issues/1/comments';
      githubMock.trackRequest('POST', commentsPath, {
        body: 'Test comment',
      });

      const history = githubMock.getRequestHistory();
      expect(history).toHaveLength(2);
      expect(history[0].method).toBe('GET');
      expect(history[1].method).toBe('POST');

      const getRequests = githubMock.findRequests({ method: 'GET' });
      expect(getRequests).toHaveLength(1);
    });
  });

  describe('Mock Stores', () => {
    it('should create and retrieve tenant', async () => {
      const tenant = {
        id: 'tenant-123',
        name: 'Test Tenant',
        plan: 'pro',
      };

      await mockStores.tenantStore.createTenant(tenant);
      const retrieved = await mockStores.tenantStore.getTenant('tenant-123');

      expect(retrieved).toEqual(tenant);
    });

    it('should create and retrieve user', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      await mockStores.userStore.createUser(user);
      const retrieved = await mockStores.userStore.getUser('user-123');

      expect(retrieved).toEqual(user);
    });

    it('should manage memberships', async () => {
      const membership = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'owner',
      };

      await mockStores.membershipStore.addMember(membership);
      const retrieved = await mockStores.membershipStore.getMembership('user-123', 'tenant-123');

      expect(retrieved).toEqual(membership);
    });

    it('should reset between tests', async () => {
      await mockStores.tenantStore.createTenant({ id: 'test', name: 'Test' });
      expect(await mockStores.tenantStore.getTenant('test')).toBeDefined();

      mockStores.reset();
      expect(await mockStores.tenantStore.getTenant('test')).toBeUndefined();
    });
  });

  describe('Integration Example', () => {
    it('should simulate complete workflow', async () => {
      // Setup test scenario
      const scenario = createCompleteScenario({
        tenantOptions: { displayName: 'Test Org', plan: 'pro' },
        userOptions: { displayName: 'Test User', email: 'test@example.com' },
      });

      // Create GitHub scenario
      const { mock, issue } = githubScenarios.bugFixIssue();

      // Setup stores
      await mockStores.tenantStore.createTenant(scenario.tenant);
      await mockStores.userStore.createUser(scenario.user);
      await mockStores.membershipStore.addMember(scenario.membership);

      // Create Express app with workflow endpoint
      const app = express();
      app.use(express.json());

      app.post('/tenants/:tenantId/workflows', async (req, res) => {
        const { tenantId } = req.params;
        const userId = req.headers['x-debug-user'] as string;

        // Verify user has access to tenant
        const membership = await mockStores.membershipStore.getMembership(userId, tenantId);
        if (!membership) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        // Create workflow run
        const runId = `run-${Date.now()}`;
        await mockStores.runStore.createRun({
          id: runId,
          tenantId,
          userId,
          status: 'pending',
          type: req.body.workflowType,
        });

        res.status(202).json({
          runId,
          status: 'pending',
        });
      });

      // Create API client
      const client = createApiClient({
        app,
        defaultUserId: scenario.user.id,
        enableLogging: false,
      });

      // Make workflow request
      const response = await client.createWorkflow(
        scenario.tenant.id,
        'issue-to-code',
        {
          issue: {
            url: issue.html_url,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            owner: 'testorg',
            repo: 'testrepo',
          },
          targetBranch: 'main',
        }
      );

      // Verify response
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('runId');
      expect(response.body).toHaveProperty('status', 'pending');

      // Verify run was created in store
      const runId = (response.body as { runId: string }).runId;
      const run = await mockStores.runStore.getRun(runId);
      expect(run).toBeDefined();
      expect((run as { tenantId: string }).tenantId).toBe(scenario.tenant.id);
    });
  });

  describe('Error Handling', () => {
    it('should handle not found errors', async () => {
      const app = express();
      app.get('/resource/:id', (req, res) => {
        res.status(404).json({ error: 'Not found' });
      });

      const client = createApiClient({ app });
      const response = await client.get('/resource/123');

      expect(response.status).toBe(404);
      assertResponse.isNotFound(response);
    });

    it('should handle validation errors', async () => {
      const app = express();
      app.use(express.json());
      app.post('/validate', (req, res) => {
        if (!req.body.name) {
          return res.status(400).json({ error: 'Name is required' });
        }
        res.json({ message: 'Valid' });
      });

      const client = createApiClient({ app });
      const response = await client.post('/validate', {
        body: {}, // Missing required 'name' field
      });

      expect(response.status).toBe(400);
      assertResponse.isBadRequest(response);
    });
  });
});
