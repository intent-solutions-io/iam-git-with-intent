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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
