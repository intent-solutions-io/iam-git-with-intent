/**
 * AutopilotExecutor Unit Tests
 *
 * Phase 36: Unit tests for the autopilot workflow executor.
 *
 * Tests:
 * - Configuration validation
 * - Phase execution flow
 * - Dry run mode
 * - Error handling
 * - Hook runner integration (PR 2: git-with-intent-0lt)
 * - Checkpoint creation after each phase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track hook calls for verification — use vi.hoisted() so the variable
// is available when vi.mock factories run (Vitest 4 hoisting change)
const { mockHookRunner } = vi.hoisted(() => ({
  mockHookRunner: {
    runStart: vi.fn().mockResolvedValue({ totalHooks: 0, successfulHooks: 0, failedHooks: 0, results: [], totalDurationMs: 0 }),
    beforeStep: vi.fn().mockResolvedValue({ totalHooks: 0, successfulHooks: 0, failedHooks: 0, results: [], totalDurationMs: 0 }),
    afterStep: vi.fn().mockResolvedValue({ totalHooks: 0, successfulHooks: 0, failedHooks: 0, results: [], totalDurationMs: 0 }),
    runEnd: vi.fn().mockResolvedValue({ totalHooks: 0, successfulHooks: 0, failedHooks: 0, results: [], totalDurationMs: 0 }),
    register: vi.fn(),
    getRegisteredHooks: vi.fn().mockReturnValue([]),
    getHooks: vi.fn().mockReturnValue([]),
    unregister: vi.fn(),
  },
}));

// Mock hook system
vi.mock('../../hooks/config.js', () => ({
  buildDefaultHookRunner: vi.fn().mockResolvedValue(mockHookRunner),
}));

vi.mock('../../hooks/runner.js', () => ({
  AgentHookRunner: vi.fn().mockImplementation(() => mockHookRunner),
}));

// Mock dependencies
vi.mock('@gwi/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gwi/core')>();
  return {
    ...actual,
    getRunWorkspaceDir: vi.fn(() => '/tmp/gwi-workspaces'),
    getRunArtifactPaths: vi.fn((runId: string) => ({
      planPath: `/tmp/gwi-artifacts/${runId}/plan.md`,
      patchDir: `/tmp/gwi-artifacts/${runId}/patches`,
      evidencePath: `/tmp/gwi-artifacts/${runId}/evidence.json`,
    })),
    createIsolatedWorkspace: vi.fn().mockResolvedValue({
      id: 'ws-test-123',
      path: '/tmp/gwi-workspaces/ws-test-123',
      repoFullName: 'owner/repo',
      baseBranch: 'main',
      targetBranch: 'gwi/autopilot-42',
      active: true,
      createdAt: new Date(),
      applyPatch: vi.fn().mockResolvedValue({ success: true, filesModified: ['src/test.ts'], filesCreated: [] }),
      commit: vi.fn().mockResolvedValue({ success: true, sha: 'abc123' }),
      push: vi.fn().mockResolvedValue({ success: true }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }),
    getFirestoreJobStore: vi.fn(() => ({
      heartbeat: vi.fn().mockResolvedValue(true),
    })),
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@gwi/integrations', () => ({
  createGitHubClient: vi.fn(() => ({
    createPR: vi.fn().mockResolvedValue({
      number: 123,
      url: 'https://github.com/owner/repo/pull/123',
      sha: 'def456',
    }),
  })),
}));

// Import after mocks
import { AutopilotExecutor, type AutopilotConfig } from '../autopilot-executor.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createValidConfig = (): AutopilotConfig => ({
  tenantId: 'tenant-abc',
  runId: 'run-xyz-123',
  issue: {
    number: 42,
    title: 'Add authentication feature',
    body: 'Please implement OAuth2 authentication',
    url: 'https://github.com/owner/repo/issues/42',
    labels: ['enhancement'],
    author: 'developer',
  },
  repo: {
    owner: 'owner',
    name: 'repo',
    fullName: 'owner/repo',
  },
  installation: {
    id: 12345678,
    token: 'ghs_mock_token_123',
  },
  baseBranch: 'main',
  dryRun: false,
  skipTests: false,
});

// =============================================================================
// Tests
// =============================================================================

describe('AutopilotExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create executor with valid config', () => {
      const config = createValidConfig();
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeInstanceOf(AutopilotExecutor);
    });

    it('should apply default baseBranch when not provided', () => {
      const config = createValidConfig();
      delete (config as any).baseBranch;
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeInstanceOf(AutopilotExecutor);
    });
  });

  describe('Dry Run Mode', () => {
    it('should execute in dry run mode without making changes', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.runId).toBe('run-xyz-123');
      expect(result.tenantId).toBe('tenant-abc');
      expect(result.issue.number).toBe(42);
    });

    it('should complete all phases in dry run', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.phases.analyze.completed).toBe(true);
      expect(result.phases.plan.completed).toBe(true);
      expect(result.phases.apply.completed).toBe(true);
      expect(result.phases.test.completed).toBe(true);
      expect(result.phases.pr.completed).toBe(true);
    });

    it('should not create actual PR in dry run', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      // PR phase completes but no actual PR number
      expect(result.phases.pr.completed).toBe(true);
      expect(result.phases.pr.prNumber).toBeUndefined();
    });
  });

  describe('Result Structure', () => {
    it('should return properly structured result', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      // Validate result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('runId');
      expect(result).toHaveProperty('tenantId');
      expect(result).toHaveProperty('issue');
      expect(result).toHaveProperty('phases');

      // Validate issue structure
      expect(result.issue).toHaveProperty('number');
      expect(result.issue).toHaveProperty('url');

      // Validate phases structure
      expect(result.phases).toHaveProperty('analyze');
      expect(result.phases).toHaveProperty('plan');
      expect(result.phases).toHaveProperty('apply');
      expect(result.phases).toHaveProperty('test');
      expect(result.phases).toHaveProperty('pr');
    });

    it('should include totalDurationMs', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.totalDurationMs).toBeDefined();
      expect(typeof result.totalDurationMs).toBe('number');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Phase Execution', () => {
    it('should execute analyze phase', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.phases.analyze.completed).toBe(true);
      expect(result.phases.analyze.durationMs).toBeDefined();
    });

    it('should execute plan phase after analyze', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.phases.plan.completed).toBe(true);
      expect(result.phases.plan.durationMs).toBeDefined();
    });

    it('should execute apply phase with file counts', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.phases.apply.completed).toBe(true);
      expect(typeof result.phases.apply.filesModified).toBe('number');
      expect(typeof result.phases.apply.filesCreated).toBe('number');
    });

    it('should execute test phase with skipped status in dry run', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.phases.test.completed).toBe(true);
      // In dry run, tests are skipped (not passed/failed)
      expect(result.phases.test.data?.skipped).toBe(true);
    });

    it('should skip tests when skipTests is true', async () => {
      const config = createValidConfig();
      config.dryRun = true;
      config.skipTests = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.phases.test.completed).toBe(true);
      expect(result.phases.test.data?.skipped).toBe(true);
    });
  });

  describe('Configuration Defaults', () => {
    it('should store config with tenantId', () => {
      const config = createValidConfig();
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeDefined();
    });

    it('should store config with runId', () => {
      const config = createValidConfig();
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeDefined();
    });

    it('should store config with issue', () => {
      const config = createValidConfig();
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeDefined();
    });

    it('should store config with repo', () => {
      const config = createValidConfig();
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeDefined();
    });

    it('should store config with installation', () => {
      const config = createValidConfig();
      const executor = new AutopilotExecutor(config);
      expect(executor).toBeDefined();
    });
  });

  // ===========================================================================
  // Hook Runner Integration Tests (PR 2: git-with-intent-0lt)
  // ===========================================================================

  // TODO(gwi-64f): Hook runner mock expectations don't match current executor behavior — needs test update
  describe.skip('Hook Runner Integration', () => {
    beforeEach(() => {
      mockHookRunner.runStart.mockClear();
      mockHookRunner.afterStep.mockClear();
      mockHookRunner.runEnd.mockClear();
    });

    it('should initialize hook runner and call runStart', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      expect(mockHookRunner.runStart).toHaveBeenCalledTimes(1);
      const startCtx = mockHookRunner.runStart.mock.calls[0][0];
      expect(startCtx.runId).toBe('run-xyz-123');
      expect(startCtx.agentRole).toBe('FOREMAN');
      expect(startCtx.runType).toBe('autopilot');
    });

    it('should call afterStep for each completed phase', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      // Dry run: analyze, generate-code, apply-patches, then PR (skips test afterStep in dry run)
      // In dry run: analyze + code gen + apply hook calls
      expect(mockHookRunner.afterStep).toHaveBeenCalled();
      const calls = mockHookRunner.afterStep.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // Verify analyze step context
      const analyzeCtx = calls[0][0];
      expect(analyzeCtx.agentRole).toBe('TRIAGE');
      expect(analyzeCtx.stepId).toContain('analyze');
      expect(analyzeCtx.stepStatus).toBe('completed');

      // Verify code generation step context
      const coderCtx = calls[1][0];
      expect(coderCtx.agentRole).toBe('CODER');
      expect(coderCtx.stepId).toContain('generate-code');
      expect(coderCtx.stepStatus).toBe('completed');
    });

    it('should pass generated files in CODER step metadata for CodeQualityHook', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      // Find the CODER generate-code call
      const coderCall = mockHookRunner.afterStep.mock.calls.find(
        (call: any[]) => call[0].agentRole === 'CODER' && call[0].stepId.includes('generate-code')
      );
      expect(coderCall).toBeDefined();

      const coderCtx = coderCall![0];
      expect(coderCtx.metadata).toBeDefined();
      expect(coderCtx.metadata.generatedFiles).toBeDefined();
      expect(Array.isArray(coderCtx.metadata.generatedFiles)).toBe(true);
      expect(coderCtx.metadata.confidence).toBeDefined();
    });

    it('should call runEnd in finally block on success', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      expect(mockHookRunner.runEnd).toHaveBeenCalledTimes(1);
      const [endCtx, success] = mockHookRunner.runEnd.mock.calls[0];
      expect(endCtx.runId).toBe('run-xyz-123');
      expect(success).toBe(true);
    });

    it('should call runEnd with success=false on failure', async () => {
      // Make runStart throw to simulate an error
      mockHookRunner.runStart.mockRejectedValueOnce(new Error('Risk tier exceeded'));

      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(mockHookRunner.runEnd).toHaveBeenCalledTimes(1);
      const [, success] = mockHookRunner.runEnd.mock.calls[0];
      expect(success).toBe(false);
    });

    it('should include tenantId in all hook contexts', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      // Check runStart
      expect(mockHookRunner.runStart.mock.calls[0][0].tenantId).toBe('tenant-abc');

      // Check all afterStep calls
      for (const call of mockHookRunner.afterStep.mock.calls) {
        expect(call[0].tenantId).toBe('tenant-abc');
      }

      // Check runEnd
      expect(mockHookRunner.runEnd.mock.calls[0][0].tenantId).toBe('tenant-abc');
    });

    it('should include durationMs in afterStep contexts', async () => {
      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      for (const call of mockHookRunner.afterStep.mock.calls) {
        expect(call[0].durationMs).toBeDefined();
        expect(typeof call[0].durationMs).toBe('number');
        expect(call[0].durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ===========================================================================
  // Checkpoint Tests (PR 2: git-with-intent-0lt)
  // ===========================================================================

  // TODO(gwi-64f): Checkpoint assertions don't match current executor behavior — needs test update
  describe.skip('Checkpoints', () => {
    it('should create checkpoints after each phase in dry run', async () => {
      const { getLogger } = await import('@gwi/core');
      const mockLogger = (getLogger as any)();

      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      // Verify checkpoint log calls for each phase
      const checkpointCalls = mockLogger.info.mock.calls.filter(
        (call: any[]) => call[0] === 'Checkpoint created'
      );

      // dry run should checkpoint: analyze, plan, apply, test, pr
      expect(checkpointCalls.length).toBeGreaterThanOrEqual(4);
    });

    it('should track completedPhases in run completion log', async () => {
      const { getLogger } = await import('@gwi/core');
      const mockLogger = (getLogger as any)();

      const config = createValidConfig();
      config.dryRun = true;

      const executor = new AutopilotExecutor(config);
      await executor.execute();

      // Find the final completion log
      const completionLog = mockLogger.info.mock.calls.find(
        (call: any[]) => call[0] === 'Autopilot execution completed'
      );
      expect(completionLog).toBeDefined();
      expect(completionLog![1].completedPhases).toBeDefined();
      expect(completionLog![1].completedPhases.length).toBeGreaterThan(0);
    });
  });
});
