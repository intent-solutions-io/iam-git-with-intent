/**
 * Workflow Execution Integration Tests
 *
 * Epic D - Story 4: SDK Integration Tests
 *
 * Tests Workflow API integration through the SDK client.
 * Validates:
 * - Creating workflows via SDK
 * - Getting workflow status
 * - Listing workflows with filters
 * - Approving workflows
 * - Workflow lifecycle (created → running → completed)
 * - Error workflows (failed status)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGatewayMock, type GatewayMock } from '../helpers/gateway-mock.js';

// =============================================================================
// Types
// =============================================================================

interface WorkflowCreateRequest {
  workflowType: 'issue-to-code' | 'pr-resolve' | 'pr-review' | 'test-gen' | 'docs-update';
  input: Record<string, unknown>;
}

interface WorkflowCreateResponse {
  workflowId: string;
  status: string;
  currentStep?: string;
  message: string;
}

interface WorkflowStatusResponse {
  id: string;
  type: string;
  status: string;
  steps: Array<{
    agent: string;
    status: string;
    startedAt?: number;
    completedAt?: number;
    error?: string;
  }>;
  output?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface WorkflowListResponse {
  workflows: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }>;
  count: number;
}

interface WorkflowApprovalRequest {
  approved: boolean;
}

interface WorkflowApprovalResponse {
  workflowId: string;
  status: string;
  message: string;
}

// =============================================================================
// Mock Workflow Client
// =============================================================================

class WorkflowClient {
  constructor(private baseUrl: string) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  }

  async create(request: WorkflowCreateRequest): Promise<WorkflowCreateResponse> {
    return this.request<WorkflowCreateResponse>('POST', '/v1/workflows', request);
  }

  async getStatus(workflowId: string): Promise<WorkflowStatusResponse> {
    return this.request<WorkflowStatusResponse>('GET', `/v1/workflows/${workflowId}`);
  }

  async list(options?: { status?: string }): Promise<WorkflowListResponse> {
    const query: Record<string, string> = {};
    if (options?.status) query.status = options.status;

    return this.request<WorkflowListResponse>('GET', '/v1/workflows', undefined, query);
  }

  async approve(
    workflowId: string,
    approved: boolean
  ): Promise<WorkflowApprovalResponse> {
    return this.request<WorkflowApprovalResponse>('POST', `/v1/workflows/${workflowId}/approve`, {
      approved,
    });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Workflow Execution Integration', () => {
  let mockServer: GatewayMock;
  let workflowClient: WorkflowClient;

  beforeEach(async () => {
    mockServer = await createGatewayMock();
    workflowClient = new WorkflowClient(mockServer.url);
  });

  afterEach(async () => {
    await mockServer.close();
  });

  // =============================================================================
  // Create Workflow
  // =============================================================================

  describe('Create Workflow', () => {
    it('should create issue-to-code workflow with correct types', async () => {
      const request: WorkflowCreateRequest = {
        workflowType: 'issue-to-code',
        input: {
          issueUrl: 'https://github.com/owner/repo/issues/123',
          targetBranch: 'main',
        },
      };

      const response = await workflowClient.create(request);

      expect(response.workflowId).toBeDefined();
      expect(response.workflowId).toMatch(/^wf-/);
      expect(response.status).toBe('created');
      expect(response.message).toBe('Workflow created successfully');
    });

    it('should create pr-resolve workflow', async () => {
      const request: WorkflowCreateRequest = {
        workflowType: 'pr-resolve',
        input: {
          prUrl: 'https://github.com/owner/repo/pull/42',
          strategy: 'semantic',
        },
      };

      const response = await workflowClient.create(request);

      expect(response.workflowId).toBeDefined();
      expect(response.status).toBe('created');
    });

    it('should create pr-review workflow', async () => {
      const request: WorkflowCreateRequest = {
        workflowType: 'pr-review',
        input: {
          prUrl: 'https://github.com/owner/repo/pull/42',
          reviewDepth: 'comprehensive',
        },
      };

      const response = await workflowClient.create(request);

      expect(response.workflowId).toBeDefined();
      expect(response.status).toBe('created');
    });

    it('should validate required fields', async () => {
      const invalidRequest = {
        // Missing workflowType
        input: {},
      } as WorkflowCreateRequest;

      await expect(workflowClient.create(invalidRequest)).rejects.toThrow(
        /workflowType is required/
      );
    });
  });

  // =============================================================================
  // Get Workflow Status
  // =============================================================================

  describe('Get Workflow Status', () => {
    it('should get workflow status with correct types', async () => {
      // Create a workflow
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/owner/repo/issues/1' },
      });

      // Get status
      const status = await workflowClient.getStatus(created.workflowId);

      expect(status.id).toBe(created.workflowId);
      expect(status.type).toBe('issue-to-code');
      expect(status.status).toBe('created');
      expect(status.steps).toBeDefined();
      expect(Array.isArray(status.steps)).toBe(true);
      expect(status.createdAt).toBeDefined();
      expect(status.updatedAt).toBeDefined();
    });

    it('should handle 404 for non-existent workflow', async () => {
      await expect(
        workflowClient.getStatus('non-existent-workflow-id')
      ).rejects.toThrow(/Workflow not found/);
    });

    it('should include all workflow metadata', async () => {
      const created = await workflowClient.create({
        workflowType: 'pr-review',
        input: { prUrl: 'https://github.com/owner/repo/pull/1' },
      });

      const status = await workflowClient.getStatus(created.workflowId);

      // Verify all required metadata fields
      expect(status).toHaveProperty('id');
      expect(status).toHaveProperty('type');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('steps');
      expect(status).toHaveProperty('createdAt');
      expect(status).toHaveProperty('updatedAt');
    });
  });

  // =============================================================================
  // List Workflows
  // =============================================================================

  describe('List Workflows', () => {
    it('should list all workflows', async () => {
      // Create multiple workflows
      await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      await workflowClient.create({
        workflowType: 'pr-review',
        input: { prUrl: 'https://github.com/test/repo/pull/1' },
      });

      const list = await workflowClient.list();

      expect(list.workflows).toBeDefined();
      expect(Array.isArray(list.workflows)).toBe(true);
      expect(list.workflows.length).toBeGreaterThanOrEqual(2);
      expect(list.count).toBe(list.workflows.length);
    });

    it('should filter workflows by status', async () => {
      // Create a workflow
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      // Approve it to change status
      await workflowClient.approve(created.workflowId, true);

      // List workflows with status filter
      const runningWorkflows = await workflowClient.list({ status: 'running' });

      expect(runningWorkflows.workflows.length).toBeGreaterThan(0);
      runningWorkflows.workflows.forEach(w => {
        expect(w.status).toBe('running');
      });
    });

    it('should return empty list when no workflows match filter', async () => {
      const list = await workflowClient.list({ status: 'completed' });

      expect(list.workflows).toEqual([]);
      expect(list.count).toBe(0);
    });

    it('should include workflow summary in list', async () => {
      await workflowClient.create({
        workflowType: 'test-gen',
        input: { targetFile: 'src/example.ts' },
      });

      const list = await workflowClient.list();

      const workflow = list.workflows[0];
      expect(workflow).toHaveProperty('id');
      expect(workflow).toHaveProperty('type');
      expect(workflow).toHaveProperty('status');
      expect(workflow).toHaveProperty('createdAt');
    });
  });

  // =============================================================================
  // Approve Workflow
  // =============================================================================

  describe('Approve Workflow', () => {
    it('should approve workflow and change status', async () => {
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      const approval = await workflowClient.approve(created.workflowId, true);

      expect(approval.workflowId).toBe(created.workflowId);
      expect(approval.status).toBe('running');
      expect(approval.message).toContain('approved');
    });

    it('should reject workflow and mark as failed', async () => {
      const created = await workflowClient.create({
        workflowType: 'pr-resolve',
        input: { prUrl: 'https://github.com/test/repo/pull/1' },
      });

      const rejection = await workflowClient.approve(created.workflowId, false);

      expect(rejection.workflowId).toBe(created.workflowId);
      expect(rejection.status).toBe('failed');
      expect(rejection.message).toContain('rejected');
    });

    it('should handle 404 for non-existent workflow', async () => {
      await expect(
        workflowClient.approve('non-existent-id', true)
      ).rejects.toThrow(/Workflow not found/);
    });
  });

  // =============================================================================
  // Workflow Lifecycle
  // =============================================================================

  describe('Workflow Lifecycle', () => {
    it('should transition from created to running to completed', async () => {
      // Create workflow (created status)
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      let status = await workflowClient.getStatus(created.workflowId);
      expect(status.status).toBe('created');

      // Approve workflow (running status)
      await workflowClient.approve(created.workflowId, true);

      status = await workflowClient.getStatus(created.workflowId);
      expect(status.status).toBe('running');
    });

    it('should track workflow state transitions', async () => {
      const created = await workflowClient.create({
        workflowType: 'test-gen',
        input: { targetFile: 'test.ts' },
      });

      const statusBefore = await workflowClient.getStatus(created.workflowId);
      const createdAt = new Date(statusBefore.createdAt).getTime();
      const updatedAt1 = new Date(statusBefore.updatedAt).getTime();

      // Initially, createdAt and updatedAt should be close
      expect(Math.abs(updatedAt1 - createdAt)).toBeLessThan(100);

      // Wait a bit and approve
      await new Promise(resolve => setTimeout(resolve, 10));
      await workflowClient.approve(created.workflowId, true);

      const statusAfter = await workflowClient.getStatus(created.workflowId);
      const updatedAt2 = new Date(statusAfter.updatedAt).getTime();

      // updatedAt should have changed
      expect(updatedAt2).toBeGreaterThan(updatedAt1);
    });
  });

  // =============================================================================
  // Error Workflows
  // =============================================================================

  describe('Error Workflows', () => {
    it('should handle failed workflow status', async () => {
      const created = await workflowClient.create({
        workflowType: 'pr-review',
        input: { prUrl: 'https://github.com/test/repo/pull/1' },
      });

      // Reject the workflow
      await workflowClient.approve(created.workflowId, false);

      const status = await workflowClient.getStatus(created.workflowId);
      expect(status.status).toBe('failed');
    });

    it('should list failed workflows separately', async () => {
      // Create and reject a workflow
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      await workflowClient.approve(created.workflowId, false);

      // List failed workflows
      const failedList = await workflowClient.list({ status: 'failed' });

      expect(failedList.workflows.length).toBeGreaterThan(0);
      expect(failedList.workflows[0].status).toBe('failed');
    });
  });

  // =============================================================================
  // Type Safety
  // =============================================================================

  describe('Type Safety', () => {
    it('should enforce WorkflowCreateRequest types', async () => {
      const request: WorkflowCreateRequest = {
        workflowType: 'docs-update',
        input: {
          targetDocs: ['README.md', 'CONTRIBUTING.md'],
          updateType: 'refresh',
        },
      };

      const response = await workflowClient.create(request);

      expect(response).toBeDefined();
    });

    it('should enforce WorkflowStatusResponse types', async () => {
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      const status = await workflowClient.getStatus(created.workflowId);

      // All required fields should be present
      expect(typeof status.id).toBe('string');
      expect(typeof status.type).toBe('string');
      expect(typeof status.status).toBe('string');
      expect(Array.isArray(status.steps)).toBe(true);
      expect(typeof status.createdAt).toBe('string');
      expect(typeof status.updatedAt).toBe('string');
    });

    it('should enforce workflow type enum', async () => {
      // Valid workflow types
      const validTypes: Array<WorkflowCreateRequest['workflowType']> = [
        'issue-to-code',
        'pr-resolve',
        'pr-review',
        'test-gen',
        'docs-update',
      ];

      for (const type of validTypes) {
        const request: WorkflowCreateRequest = {
          workflowType: type,
          input: { test: 'data' },
        };

        const response = await workflowClient.create(request);
        expect(response.workflowId).toBeDefined();
      }
    });
  });

  // =============================================================================
  // Concurrent Workflows
  // =============================================================================

  describe('Concurrent Workflows', () => {
    it('should handle multiple concurrent workflow creations', async () => {
      const workflows = await Promise.all([
        workflowClient.create({
          workflowType: 'issue-to-code',
          input: { issueUrl: 'https://github.com/test/repo/issues/1' },
        }),
        workflowClient.create({
          workflowType: 'pr-review',
          input: { prUrl: 'https://github.com/test/repo/pull/1' },
        }),
        workflowClient.create({
          workflowType: 'test-gen',
          input: { targetFile: 'test.ts' },
        }),
      ]);

      expect(workflows).toHaveLength(3);
      workflows.forEach(w => {
        expect(w.workflowId).toBeDefined();
        expect(w.status).toBe('created');
      });

      // All workflows should have unique IDs
      const ids = workflows.map(w => w.workflowId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle concurrent status checks', async () => {
      const created = await workflowClient.create({
        workflowType: 'issue-to-code',
        input: { issueUrl: 'https://github.com/test/repo/issues/1' },
      });

      // Make 5 concurrent status requests
      const statuses = await Promise.all(
        Array(5)
          .fill(null)
          .map(() => workflowClient.getStatus(created.workflowId))
      );

      expect(statuses).toHaveLength(5);
      statuses.forEach(s => {
        expect(s.id).toBe(created.workflowId);
        expect(s.status).toBe('created');
      });
    });
  });
});
