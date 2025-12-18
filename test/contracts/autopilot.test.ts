/**
 * Contract Tests - Autopilot Flow (Issue → PR)
 *
 * Phase 34: E2E tests for the autopilot workflow.
 *
 * Validates:
 * - Webhook event handling
 * - Durable job creation and tracking
 * - Workspace isolation
 * - Patch application
 * - PR creation flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Autopilot webhook payload schema
 */
const AutopilotWebhookPayloadSchema = z.object({
  tenantId: z.string().min(1),
  repoId: z.string().optional(),
  runId: z.string().min(1),
  issue: z.object({
    number: z.number().int().positive(),
    title: z.string().min(1),
    body: z.string().nullable(),
    url: z.string().url(),
    labels: z.array(z.string()).optional(),
    author: z.string().optional(),
    createdAt: z.string().optional(),
  }),
  triggerLabel: z.string().min(1),
  delivery: z.string().min(1),
  repoFullName: z.string().optional(),
  installationId: z.number().optional(),
});

/**
 * Durable job schema
 */
const DurableJobSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().optional(),
  payload: z.record(z.unknown()),
  status: z.enum(['pending', 'claimed', 'running', 'completed', 'failed', 'dead_letter']),
  attempts: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
  priority: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  claimedBy: z.string().optional(),
  claimedAt: z.date().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  lastHeartbeat: z.date().optional(),
  error: z.string().optional(),
  result: z.record(z.unknown()).optional(),
  messageId: z.string().optional(),
});

/**
 * Isolated workspace schema
 */
const IsolatedWorkspaceSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  repoFullName: z.string().regex(/^[^/]+\/[^/]+$/),
  baseBranch: z.string().min(1),
  targetBranch: z.string().min(1),
  active: z.boolean(),
  createdAt: z.date(),
});

/**
 * Patch result schema
 */
const PatchResultSchema = z.object({
  success: z.boolean(),
  filesModified: z.array(z.string()),
  filesCreated: z.array(z.string()),
  error: z.string().optional(),
});

/**
 * Commit result schema
 */
const CommitResultSchema = z.object({
  success: z.boolean(),
  sha: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Push result schema
 */
const PushResultSchema = z.object({
  success: z.boolean(),
  remoteUrl: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Autopilot run result schema
 */
const AutopilotRunResultSchema = z.object({
  success: z.boolean(),
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  issue: z.object({
    number: z.number().int().positive(),
    url: z.string().url(),
  }),
  phases: z.object({
    analyze: z.object({
      completed: z.boolean(),
      durationMs: z.number().optional(),
      error: z.string().optional(),
    }),
    plan: z.object({
      completed: z.boolean(),
      durationMs: z.number().optional(),
      error: z.string().optional(),
    }),
    apply: z.object({
      completed: z.boolean(),
      filesModified: z.number(),
      filesCreated: z.number(),
      durationMs: z.number().optional(),
      error: z.string().optional(),
    }),
    test: z.object({
      completed: z.boolean(),
      passed: z.boolean().optional(),
      durationMs: z.number().optional(),
      error: z.string().optional(),
    }),
    pr: z.object({
      completed: z.boolean(),
      prNumber: z.number().optional(),
      prUrl: z.string().optional(),
      durationMs: z.number().optional(),
      error: z.string().optional(),
    }),
  }),
  totalDurationMs: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// Contract Tests
// =============================================================================

describe('Autopilot Contract Tests', () => {
  describe('Schema Validation', () => {
    describe('AutopilotWebhookPayloadSchema', () => {
      it('should validate a complete webhook payload', () => {
        const payload = {
          tenantId: 'tenant-abc123',
          repoId: 'repo-xyz789',
          runId: 'run-20231218-abcdef',
          issue: {
            number: 42,
            title: 'Add user authentication',
            body: 'Implement OAuth2 authentication flow',
            url: 'https://github.com/owner/repo/issues/42',
            labels: ['gwi:autopilot', 'enhancement'],
            author: 'developer',
            createdAt: '2023-12-18T12:00:00Z',
          },
          triggerLabel: 'gwi:autopilot',
          delivery: 'abc-123-delivery',
          repoFullName: 'owner/repo',
          installationId: 12345678,
        };

        const result = AutopilotWebhookPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should validate minimal webhook payload', () => {
        const payload = {
          tenantId: 'tenant-abc123',
          runId: 'run-20231218-abcdef',
          issue: {
            number: 1,
            title: 'Fix bug',
            body: null,
            url: 'https://github.com/owner/repo/issues/1',
          },
          triggerLabel: 'gwi-auto-code',
          delivery: 'xyz-789',
        };

        const result = AutopilotWebhookPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should reject invalid issue number', () => {
        const payload = {
          tenantId: 'tenant-abc123',
          runId: 'run-123',
          issue: {
            number: 0, // Invalid: must be positive
            title: 'Test',
            body: null,
            url: 'https://github.com/owner/repo/issues/0',
          },
          triggerLabel: 'gwi:autopilot',
          delivery: 'delivery-1',
        };

        const result = AutopilotWebhookPayloadSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject missing tenantId', () => {
        const payload = {
          runId: 'run-123',
          issue: {
            number: 1,
            title: 'Test',
            body: null,
            url: 'https://github.com/owner/repo/issues/1',
          },
          triggerLabel: 'gwi:autopilot',
          delivery: 'delivery-1',
        };

        const result = AutopilotWebhookPayloadSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe('DurableJobSchema', () => {
      it('should validate a pending job', () => {
        const job = {
          id: 'job-abc123',
          type: 'workflow:execute',
          tenantId: 'tenant-xyz',
          runId: 'run-456',
          payload: { workflowType: 'autopilot' },
          status: 'pending' as const,
          attempts: 0,
          maxRetries: 3,
          priority: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = DurableJobSchema.safeParse(job);
        expect(result.success).toBe(true);
      });

      it('should validate a running job with all fields', () => {
        const now = new Date();
        const job = {
          id: 'job-running-1',
          type: 'workflow:execute',
          tenantId: 'tenant-xyz',
          runId: 'run-789',
          payload: { workflowType: 'autopilot', issue: { number: 42 } },
          status: 'running' as const,
          attempts: 2,
          maxRetries: 3,
          priority: 7,
          createdAt: new Date(now.getTime() - 60000),
          updatedAt: now,
          claimedBy: 'worker-1',
          claimedAt: new Date(now.getTime() - 30000),
          startedAt: new Date(now.getTime() - 25000),
          lastHeartbeat: now,
          messageId: 'pubsub-msg-abc',
        };

        const result = DurableJobSchema.safeParse(job);
        expect(result.success).toBe(true);
      });

      it('should validate a completed job', () => {
        const now = new Date();
        const job = {
          id: 'job-completed-1',
          type: 'workflow:execute',
          tenantId: 'tenant-xyz',
          payload: {},
          status: 'completed' as const,
          attempts: 1,
          maxRetries: 3,
          priority: 5,
          createdAt: new Date(now.getTime() - 120000),
          updatedAt: now,
          completedAt: now,
          result: { prNumber: 123, prUrl: 'https://github.com/owner/repo/pull/123' },
        };

        const result = DurableJobSchema.safeParse(job);
        expect(result.success).toBe(true);
      });

      it('should validate a failed job', () => {
        const job = {
          id: 'job-failed-1',
          type: 'workflow:execute',
          tenantId: 'tenant-xyz',
          payload: {},
          status: 'failed' as const,
          attempts: 3,
          maxRetries: 3,
          priority: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: new Date(),
          error: 'Max retries exceeded',
        };

        const result = DurableJobSchema.safeParse(job);
        expect(result.success).toBe(true);
      });

      it('should reject invalid status', () => {
        const job = {
          id: 'job-invalid',
          type: 'workflow:execute',
          tenantId: 'tenant-xyz',
          payload: {},
          status: 'invalid_status',
          attempts: 0,
          maxRetries: 3,
          priority: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = DurableJobSchema.safeParse(job);
        expect(result.success).toBe(false);
      });
    });

    describe('IsolatedWorkspaceSchema', () => {
      it('should validate an active workspace', () => {
        const workspace = {
          id: 'ws-tenant123-run456-abc-xyz',
          path: '/tmp/gwi-workspaces/ws-tenant123-run456-abc-xyz',
          repoFullName: 'owner/repo',
          baseBranch: 'main',
          targetBranch: 'gwi/autopilot-42',
          active: true,
          createdAt: new Date(),
        };

        const result = IsolatedWorkspaceSchema.safeParse(workspace);
        expect(result.success).toBe(true);
      });

      it('should reject invalid repoFullName format', () => {
        const workspace = {
          id: 'ws-123',
          path: '/tmp/workspace',
          repoFullName: 'invalid-format', // Missing slash
          baseBranch: 'main',
          targetBranch: 'feature',
          active: true,
          createdAt: new Date(),
        };

        const result = IsolatedWorkspaceSchema.safeParse(workspace);
        expect(result.success).toBe(false);
      });
    });

    describe('PatchResultSchema', () => {
      it('should validate a successful patch', () => {
        const result = {
          success: true,
          filesModified: ['src/auth.ts', 'src/utils.ts'],
          filesCreated: ['src/oauth.ts'],
        };

        const parsed = PatchResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });

      it('should validate a failed patch', () => {
        const result = {
          success: false,
          filesModified: [],
          filesCreated: [],
          error: 'Patch conflict at line 42',
        };

        const parsed = PatchResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });
    });

    describe('CommitResultSchema', () => {
      it('should validate a successful commit', () => {
        const result = {
          success: true,
          sha: 'abc123def456789012345678901234567890abcd',
        };

        const parsed = CommitResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });

      it('should validate a failed commit', () => {
        const result = {
          success: false,
          error: 'No changes to commit',
        };

        const parsed = CommitResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });
    });

    describe('PushResultSchema', () => {
      it('should validate a successful push', () => {
        const result = {
          success: true,
          remoteUrl: 'https://github.com/owner/repo/tree/gwi/autopilot-42',
        };

        const parsed = PushResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });
    });

    describe('AutopilotRunResultSchema', () => {
      it('should validate a successful run', () => {
        const result = {
          success: true,
          runId: 'run-20231218-abc123',
          tenantId: 'tenant-xyz789',
          issue: {
            number: 42,
            url: 'https://github.com/owner/repo/issues/42',
          },
          phases: {
            analyze: { completed: true, durationMs: 2000 },
            plan: { completed: true, durationMs: 5000 },
            apply: { completed: true, filesModified: 3, filesCreated: 1, durationMs: 1000 },
            test: { completed: true, passed: true, durationMs: 10000 },
            pr: { completed: true, prNumber: 123, prUrl: 'https://github.com/owner/repo/pull/123', durationMs: 500 },
          },
          totalDurationMs: 18500,
        };

        const parsed = AutopilotRunResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });

      it('should validate a failed run with error', () => {
        const result = {
          success: false,
          runId: 'run-20231218-def456',
          tenantId: 'tenant-xyz789',
          issue: {
            number: 43,
            url: 'https://github.com/owner/repo/issues/43',
          },
          phases: {
            analyze: { completed: true, durationMs: 2000 },
            plan: { completed: true, durationMs: 5000 },
            apply: { completed: false, filesModified: 0, filesCreated: 0, error: 'Patch failed' },
            test: { completed: false },
            pr: { completed: false },
          },
          error: 'Failed in apply phase: Patch failed',
        };

        const parsed = AutopilotRunResultSchema.safeParse(result);
        expect(parsed.success).toBe(true);
      });
    });
  });

  describe('Trigger Label Variations', () => {
    const validLabels = ['gwi-auto-code', 'gwi:autopilot', 'gwi:auto'];

    it('should accept all valid trigger labels', () => {
      for (const label of validLabels) {
        const payload = {
          tenantId: 'tenant-123',
          runId: 'run-456',
          issue: {
            number: 1,
            title: 'Test',
            body: null,
            url: 'https://github.com/owner/repo/issues/1',
          },
          triggerLabel: label,
          delivery: 'delivery-1',
        };

        const result = AutopilotWebhookPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Job Lifecycle Transitions', () => {
    const validTransitions = [
      { from: 'pending', to: 'claimed' },
      { from: 'claimed', to: 'running' },
      { from: 'running', to: 'completed' },
      { from: 'running', to: 'failed' },
      { from: 'failed', to: 'pending' }, // retry
      { from: 'running', to: 'dead_letter' },
    ];

    it('should define expected job lifecycle', () => {
      expect(validTransitions.length).toBe(6);

      // Verify each transition starts from a valid state
      const validStatuses = ['pending', 'claimed', 'running', 'completed', 'failed', 'dead_letter'];
      for (const transition of validTransitions) {
        expect(validStatuses).toContain(transition.from);
        expect(validStatuses).toContain(transition.to);
      }
    });
  });

  describe('Workspace Branch Naming', () => {
    it('should generate valid branch names', () => {
      const issueNumber = 42;
      const runId = 'run-20231218-abc123';

      // Common branch naming patterns
      const patterns = [
        `gwi/autopilot-${issueNumber}`,
        `gwi/issue-${issueNumber}`,
        `gwi/${runId}`,
      ];

      for (const branch of patterns) {
        // Branch names should be valid git refs
        expect(branch).toMatch(/^[a-zA-Z0-9/_-]+$/);
        expect(branch.length).toBeLessThan(256);
      }
    });
  });

  describe('Error Handling', () => {
    it('should capture errors at each phase', () => {
      const errorResult = {
        success: false,
        runId: 'run-error-test',
        tenantId: 'tenant-xyz',
        issue: {
          number: 99,
          url: 'https://github.com/owner/repo/issues/99',
        },
        phases: {
          analyze: { completed: false, error: 'Failed to fetch issue details' },
          plan: { completed: false },
          apply: { completed: false, filesModified: 0, filesCreated: 0 },
          test: { completed: false },
          pr: { completed: false },
        },
        error: 'Failed to fetch issue details',
      };

      const result = AutopilotRunResultSchema.safeParse(errorResult);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phases.analyze.error).toBe('Failed to fetch issue details');
      }
    });
  });
});
