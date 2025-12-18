/**
 * Agent Module Tests - Phase 18
 *
 * Tests for agent adapter contract, stub adapter, and Intent Receipt formatting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Registry
  getAgentRegistry,
  resetAgentRegistry,
  getAgentAdapter,
  registerAgentAdapter,
  planCandidate,
  executePlan,
  healthCheckAgent,

  // Stub adapter
  StubAgentAdapter,
  createStubAdapter,

  // Types
  AgentStepClass,
  STEP_CLASS_SCOPES,
  type PlanInput,
  type ExecuteInput,
  type AgentAdapter,
  type WorkItem,
} from '../index.js';

import {
  // Intent Receipt
  formatIntentReceiptAsComment,
  formatMinimalIntentReceipt,
  formatPlanReviewComment,
  formatSuccessComment,
  formatFailureComment,
} from '../intent-receipt.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockWorkItem: WorkItem = {
  id: 'work-item-1',
  tenantId: 'tenant-1',
  type: 'issue_to_code',
  title: 'Add user authentication',
  summary: 'Implement JWT-based authentication for the API',
  status: 'queued',
  dedupeKey: 'issue:123',
  score: 85,
  scoreBreakdown: {
    baseScore: 70,
    modifiers: [
      { name: 'priority_label', value: 10, reason: 'Has priority:high label' },
      { name: 'assignment', value: 5, reason: 'Assigned to team' },
    ],
    finalScore: 85,
    explanation: 'High priority issue with team assignment',
  },
  signalIds: ['signal-1'],
  evidence: {
    sourceUrls: ['https://github.com/test/repo/issues/123'],
  },
  repo: {
    owner: 'test',
    name: 'repo',
    fullName: 'test/repo',
  },
  resourceNumber: 123,
  resourceUrl: 'https://github.com/test/repo/issues/123',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createMockPlanInput = (): PlanInput => ({
  tenantId: 'tenant-1',
  workItem: mockWorkItem,
  repo: {
    owner: 'test',
    name: 'repo',
    fullName: 'test/repo',
    defaultBranch: 'main',
  },
  runId: 'run-123',
});

// =============================================================================
// Agent Registry Tests
// =============================================================================

describe('Agent Registry', () => {
  beforeEach(() => {
    resetAgentRegistry();
  });

  afterEach(() => {
    resetAgentRegistry();
  });

  describe('getAgentRegistry', () => {
    it('should return singleton instance', () => {
      const registry1 = getAgentRegistry();
      const registry2 = getAgentRegistry();
      expect(registry1).toBe(registry2);
    });

    it('should have stub adapter registered by default', () => {
      const registry = getAgentRegistry();
      expect(registry.list()).toContain('stub');
    });
  });

  describe('getAgentAdapter', () => {
    it('should return default adapter', () => {
      const adapter = getAgentAdapter();
      expect(adapter.name).toBe('stub');
    });
  });

  describe('registerAgentAdapter', () => {
    it('should register custom adapter', () => {
      const customAdapter: AgentAdapter = {
        name: 'custom',
        version: '1.0.0',
        async planCandidate() {
          throw new Error('Not implemented');
        },
        async executePlan() {
          throw new Error('Not implemented');
        },
        async healthCheck() {
          return { healthy: true };
        },
        getCapabilities() {
          return {
            canPlan: true,
            canExecute: false,
            supportsDryRun: false,
            supportedWorkTypes: [],
            maxComplexity: 3,
            requiresNetwork: false,
          };
        },
      };

      registerAgentAdapter(customAdapter);

      const registry = getAgentRegistry();
      expect(registry.list()).toContain('custom');
      expect(registry.get('custom')).toBe(customAdapter);
    });
  });
});

// =============================================================================
// StubAgentAdapter Tests
// =============================================================================

describe('StubAgentAdapter', () => {
  let adapter: StubAgentAdapter;

  beforeEach(() => {
    adapter = createStubAdapter();
  });

  describe('planCandidate', () => {
    it('should generate a valid plan', async () => {
      const input = createMockPlanInput();
      const plan = await adapter.planCandidate(input);

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.candidateId).toMatch(/^candidate-/);
      expect(plan.summary).toContain('Implement');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.complexity).toBeGreaterThanOrEqual(1);
      expect(plan.complexity).toBeLessThanOrEqual(5);
      expect(plan.confidence).toBeGreaterThanOrEqual(0);
      expect(plan.confidence).toBeLessThanOrEqual(100);
      expect(plan.generatedAt).toBeTruthy();
    });

    it('should generate different steps for different work types', async () => {
      const issueInput = createMockPlanInput();
      const issuePlan = await adapter.planCandidate(issueInput);

      const reviewInput = createMockPlanInput();
      reviewInput.workItem = { ...mockWorkItem, type: 'pr_review' };
      const reviewPlan = await adapter.planCandidate(reviewInput);

      // Issue to code should have additive steps
      expect(issuePlan.steps.some(s => s.policyClass === 'additive')).toBe(true);

      // PR review should have informational steps
      expect(reviewPlan.steps.some(s => s.policyClass === 'informational')).toBe(true);
    });

    it('should include required scopes based on policy classes', async () => {
      const input = createMockPlanInput();
      const plan = await adapter.planCandidate(input);

      // Issue to code should require commit scope
      expect(plan.requiredScopes).toContain('commit');
    });
  });

  describe('executePlan', () => {
    it('should execute plan successfully with proper approvals', async () => {
      const planInput = createMockPlanInput();
      const plan = await adapter.planCandidate(planInput);

      const executeInput: ExecuteInput = {
        tenantId: 'tenant-1',
        plan,
        approvedScopes: ['commit', 'push', 'open_pr'],
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        runId: 'run-123',
      };

      const result = await adapter.executePlan(executeInput);

      expect(result.success).toBe(true);
      expect(result.branchName).toMatch(/^gwi\//);
      expect(result.commits?.length).toBeGreaterThan(0);
      expect(result.intentReceipt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should fail without required approvals', async () => {
      const planInput = createMockPlanInput();
      const plan = await adapter.planCandidate(planInput);

      const executeInput: ExecuteInput = {
        tenantId: 'tenant-1',
        plan,
        approvedScopes: [], // No approvals
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        runId: 'run-123',
      };

      const result = await adapter.executePlan(executeInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required approval scopes');
    });

    it('should succeed in dry run mode without approvals', async () => {
      const planInput = createMockPlanInput();
      const plan = await adapter.planCandidate(planInput);

      const executeInput: ExecuteInput = {
        tenantId: 'tenant-1',
        plan,
        approvedScopes: [],
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        runId: 'run-123',
        dryRun: true,
      };

      const result = await adapter.executePlan(executeInput);

      expect(result.success).toBe(true);
      expect(result.prNumber).toBeUndefined(); // No PR in dry run
    });
  });

  describe('healthCheck', () => {
    it('should always return healthy', async () => {
      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
    });
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = adapter.getCapabilities();

      expect(caps.canPlan).toBe(true);
      expect(caps.canExecute).toBe(true);
      expect(caps.supportsDryRun).toBe(true);
      expect(caps.requiresNetwork).toBe(false);
      expect(caps.supportedWorkTypes).toContain('issue_to_code');
    });
  });
});

// =============================================================================
// Policy Class Mapping Tests
// =============================================================================

describe('Policy Class Mapping', () => {
  it('should have correct scopes for read_only', () => {
    expect(STEP_CLASS_SCOPES.read_only).toEqual([]);
  });

  it('should have correct scopes for informational', () => {
    expect(STEP_CLASS_SCOPES.informational).toEqual([]);
  });

  it('should have correct scopes for additive', () => {
    expect(STEP_CLASS_SCOPES.additive).toContain('commit');
  });

  it('should have correct scopes for destructive', () => {
    expect(STEP_CLASS_SCOPES.destructive).toContain('commit');
    expect(STEP_CLASS_SCOPES.destructive).toContain('push');
    expect(STEP_CLASS_SCOPES.destructive).toContain('open_pr');
  });
});

// =============================================================================
// Intent Receipt Formatting Tests
// =============================================================================

describe('Intent Receipt Formatting', () => {
  const mockReceipt = {
    intent: 'Implement user authentication',
    changeSummary: 'Added JWT auth middleware and user model',
    actor: 'gwi-agent',
    when: '2025-12-17T12:00:00Z',
    scope: 'test/repo#123',
    policyApproval: 'Approved by user@example.com',
    evidence: 'Score: 85/100. High priority issue.',
    traceId: 'trace-123',
    runId: 'run-456',
  };

  describe('formatIntentReceiptAsComment', () => {
    it('should generate valid markdown', () => {
      const result = formatIntentReceiptAsComment(mockReceipt);

      expect(result.markdown).toContain('## 🤖 GWI Intent Receipt');
      expect(result.markdown).toContain(mockReceipt.intent);
      expect(result.markdown).toContain(mockReceipt.changeSummary);
      expect(result.markdown).toContain(mockReceipt.actor);
    });

    it('should include evidence when requested', () => {
      const result = formatIntentReceiptAsComment(mockReceipt, {
        includeEvidence: true,
      });

      expect(result.markdown).toContain('### Evidence');
      expect(result.markdown).toContain(mockReceipt.evidence);
    });

    it('should include trace IDs when requested', () => {
      const result = formatIntentReceiptAsComment(mockReceipt, {
        includeTraceIds: true,
      });

      expect(result.markdown).toContain('Debug Information');
      expect(result.markdown).toContain(mockReceipt.runId!);
    });

    it('should generate plain text version', () => {
      const result = formatIntentReceiptAsComment(mockReceipt);

      expect(result.plainText).toContain('GWI Intent Receipt');
      expect(result.plainText).toContain(mockReceipt.intent);
    });

    it('should generate JSON version', () => {
      const result = formatIntentReceiptAsComment(mockReceipt);

      expect(result.json.intent).toBe(mockReceipt.intent);
      expect(result.json.actor).toBe(mockReceipt.actor);
    });
  });

  describe('formatMinimalIntentReceipt', () => {
    it('should generate concise output', () => {
      const result = formatMinimalIntentReceipt(mockReceipt);

      expect(result).toContain('🤖 **GWI**');
      expect(result).toContain(mockReceipt.intent);
      expect(result.length).toBeLessThan(500);
    });
  });

  describe('formatPlanReviewComment', () => {
    it('should format plan review with checkboxes', () => {
      const result = formatPlanReviewComment(
        'Add authentication',
        ['commit', 'push'],
        'medium',
        75,
        ['src/auth.ts', 'src/middleware.ts']
      );

      expect(result).toContain('## 📋 GWI Implementation Plan');
      expect(result).toContain('- [ ] `commit`');
      expect(result).toContain('- [ ] `push`');
      expect(result).toContain('75%');
      expect(result).toContain('/gwi approve');
    });
  });

  describe('formatSuccessComment', () => {
    it('should include PR URL', () => {
      const result = formatSuccessComment(
        'https://github.com/test/repo/pull/42',
        mockReceipt
      );

      expect(result).toContain('## ✅ GWI Execution Complete');
      expect(result).toContain('https://github.com/test/repo/pull/42');
    });
  });

  describe('formatFailureComment', () => {
    it('should include error message', () => {
      const result = formatFailureComment(
        'Build failed: type errors',
        mockReceipt
      );

      expect(result).toContain('## ❌ GWI Execution Failed');
      expect(result).toContain('Build failed: type errors');
    });
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('Convenience Functions', () => {
  beforeEach(() => {
    resetAgentRegistry();
  });

  afterEach(() => {
    resetAgentRegistry();
  });

  describe('planCandidate', () => {
    it('should delegate to default adapter', async () => {
      const input = createMockPlanInput();
      const plan = await planCandidate(input);

      expect(plan.id).toBeTruthy();
      expect(plan.summary).toBeTruthy();
    });
  });

  describe('executePlan', () => {
    it('should delegate to default adapter', async () => {
      const planInput = createMockPlanInput();
      const plan = await planCandidate(planInput);

      const result = await executePlan({
        tenantId: 'tenant-1',
        plan,
        approvedScopes: ['commit', 'push', 'open_pr'],
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('healthCheckAgent', () => {
    it('should return health status with adapter name', async () => {
      const result = await healthCheckAgent();

      expect(result.healthy).toBe(true);
      expect(result.adapter).toBe('stub');
    });
  });
});

// =============================================================================
// GitHubAgentAdapter Tests (Phase 19)
// =============================================================================

describe('GitHubAgentAdapter', () => {
  let adapter: import('../github-adapter.js').GitHubAgentAdapter;

  beforeEach(async () => {
    const { createGitHubAdapter } = await import('../github-adapter.js');
    adapter = createGitHubAdapter({
      token: 'test-token',
    });
  });

  describe('planCandidate', () => {
    it('should generate a minimal plan for work item', async () => {
      const input = createMockPlanInput();
      const plan = await adapter.planCandidate(input);

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.candidateId).toMatch(/^candidate-/);
      expect(plan.summary).toContain('Implement');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.requiredScopes).toBeDefined();
      expect(plan.generatedAt).toBeTruthy();
    });

    it('should include execution steps (branch, commit, PR)', async () => {
      const input = createMockPlanInput();
      const plan = await adapter.planCandidate(input);

      const tools = plan.steps.map(s => s.tool);
      expect(tools).toContain('github.createBranch');
      expect(tools).toContain('github.pushCommit');
      expect(tools).toContain('github.createPullRequest');
    });

    it('should require push and open_pr scopes', async () => {
      const input = createMockPlanInput();
      const plan = await adapter.planCandidate(input);

      expect(plan.requiredScopes).toContain('push');
      expect(plan.requiredScopes).toContain('open_pr');
    });
  });

  describe('executePlan', () => {
    it('should fail without required scopes', async () => {
      const planInput = createMockPlanInput();
      const plan = await adapter.planCandidate(planInput);

      const result = await adapter.executePlan({
        tenantId: 'tenant-1',
        plan,
        approvedScopes: [], // No approvals
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        runId: 'run-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required approval scopes');
    });

    it('should succeed in dry run mode without approvals', async () => {
      const planInput = createMockPlanInput();
      const plan = await adapter.planCandidate(planInput);

      const result = await adapter.executePlan({
        tenantId: 'tenant-1',
        plan,
        approvedScopes: [],
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        runId: 'run-123',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.stepResults.every(s => s.output?.dryRun === true)).toBe(true);
    });

    it('should create intent receipt on failure', async () => {
      const planInput = createMockPlanInput();
      const plan = await adapter.planCandidate(planInput);

      const result = await adapter.executePlan({
        tenantId: 'tenant-1',
        plan,
        approvedScopes: [],
        repo: {
          owner: 'test',
          name: 'repo',
          fullName: 'test/repo',
          defaultBranch: 'main',
        },
        runId: 'run-123',
      });

      expect(result.intentReceipt).toBeDefined();
      expect(result.intentReceipt.actor).toBe('github-agent');
      expect(result.intentReceipt.changeSummary).toContain('Failed');
    });
  });

  describe('healthCheck', () => {
    it('should fail without GitHub connector', async () => {
      const result = await adapter.healthCheck();
      // GitHub connector is not registered in test environment
      expect(result.healthy).toBe(false);
      expect(result.message).toContain('GitHub connector');
    });
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = adapter.getCapabilities();

      expect(caps.canPlan).toBe(true);
      expect(caps.canExecute).toBe(true);
      expect(caps.supportsDryRun).toBe(true);
      expect(caps.requiresNetwork).toBe(true);
      expect(caps.supportedWorkTypes).toContain('issue_to_code');
    });
  });
});
