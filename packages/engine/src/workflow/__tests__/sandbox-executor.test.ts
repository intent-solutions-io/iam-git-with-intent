/**
 * Sandbox Executor Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeSandboxStep,
  createSandboxStepDefinition,
  type SandboxProviderInterface,
  type SandboxInstance,
  type SandboxExecutorContext,
  type IaCExporterInterface,
} from '../sandbox-executor.js';
import type { StepInput } from '../../step-contract/types.js';
import type { SandboxStepConfig } from '../schema.js';

describe('Sandbox Executor', () => {
  // Mock sandbox instance
  const createMockSandbox = (): SandboxInstance => ({
    id: 'sbx-docker-1234567890-abcd',
    execute: vi.fn().mockResolvedValue({
      stdout: 'command output',
      stderr: '',
      exitCode: 0,
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('file content'),
    snapshot: vi.fn().mockResolvedValue('snap-001'),
    diff: vi.fn().mockResolvedValue([
      {
        path: '/workspace/output.txt',
        type: 'added',
        newContent: 'generated content',
      },
    ]),
    destroy: vi.fn().mockResolvedValue(undefined),
  });

  // Mock sandbox provider
  const createMockProvider = (sandbox: SandboxInstance): SandboxProviderInterface => ({
    create: vi.fn().mockResolvedValue(sandbox),
  });

  // Mock IaC exporter
  const createMockExporter = (): IaCExporterInterface => ({
    export: vi.fn().mockResolvedValue({
      files: [
        { path: 'main.tf', content: 'resource "local_file" "output" {}', type: 'main' },
      ],
      summary: { resourceCount: 1 },
      warnings: [],
    }),
  });

  // Mock logger
  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });

  // Create step input
  const createStepInput = (): StepInput => ({
    runId: '550e8400-e29b-41d4-a716-446655440000',
    stepId: 'sandbox-step-1',
    tenantId: 'tenant-123',
    repo: {
      owner: 'test-org',
      name: 'test-repo',
      fullName: 'test-org/test-repo',
      defaultBranch: 'main',
    },
    stepType: 'sandbox',
    riskMode: 'suggest_patch',
    capabilitiesMode: 'patch-only',
    queuedAt: new Date().toISOString(),
    attemptNumber: 0,
    maxAttempts: 3,
  });

  // Create sandbox config
  const createSandboxConfig = (): SandboxStepConfig => ({
    sandboxType: 'docker',
    baseImage: 'node:20-alpine',
    workDir: '/workspace',
    snapshot: true,
    commands: ['npm install', 'npm run build'],
    sandboxTimeoutMs: 60000,
    requiresRoot: false,
  });

  let mockSandbox: SandboxInstance;
  let mockProvider: SandboxProviderInterface;
  let mockExporter: IaCExporterInterface;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let context: SandboxExecutorContext;

  beforeEach(() => {
    mockSandbox = createMockSandbox();
    mockProvider = createMockProvider(mockSandbox);
    mockExporter = createMockExporter();
    mockLogger = createMockLogger();
    context = {
      sandboxProvider: mockProvider,
      iacExporter: mockExporter,
      logger: mockLogger,
    };
  });

  describe('executeSandboxStep', () => {
    it('should create sandbox with correct configuration', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      await executeSandboxStep(input, config, context);

      expect(mockProvider.create).toHaveBeenCalledWith({
        type: 'docker',
        image: 'node:20-alpine',
        workDir: '/workspace',
        resources: undefined,
        mounts: undefined,
        env: undefined,
      });
    });

    it('should take initial snapshot when configured', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      await executeSandboxStep(input, config, context);

      expect(mockSandbox.snapshot).toHaveBeenCalled();
    });

    it('should skip snapshot when disabled', async () => {
      const input = createStepInput();
      const config = { ...createSandboxConfig(), snapshot: false };

      await executeSandboxStep(input, config, context);

      expect(mockSandbox.snapshot).not.toHaveBeenCalled();
    });

    it('should execute all commands', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      await executeSandboxStep(input, config, context);

      expect(mockSandbox.execute).toHaveBeenCalledTimes(2);
      expect(mockSandbox.execute).toHaveBeenCalledWith('npm install', { timeout: 60000 });
      expect(mockSandbox.execute).toHaveBeenCalledWith('npm run build', { timeout: 60000 });
    });

    it('should generate diff after execution', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      await executeSandboxStep(input, config, context);

      expect(mockSandbox.diff).toHaveBeenCalledWith('snap-001');
    });

    it('should return ok result on successful execution', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      const result = await executeSandboxStep(input, config, context);

      expect(result.resultCode).toBe('ok');
      expect(result.summary).toContain('1 file(s) changed');
      expect(result.requiresApproval).toBe(true);
    });

    it('should include diffs in proposed changes', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      const result = await executeSandboxStep(input, config, context);

      expect(result.proposedChanges).toHaveLength(1);
      expect(result.proposedChanges![0]).toEqual({
        file: '/workspace/output.txt',
        action: 'create',
        summary: 'added: /workspace/output.txt',
        diff: 'generated content',
      });
    });

    it('should return retryable result when commands fail', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      // Make one command fail
      mockSandbox.execute = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'build failed', exitCode: 1 });

      const result = await executeSandboxStep(input, config, context);

      expect(result.resultCode).toBe('retryable');
      expect(result.summary).toContain('1 failed command(s)');
    });

    it('should destroy sandbox after execution', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      await executeSandboxStep(input, config, context);

      expect(mockSandbox.destroy).toHaveBeenCalled();
    });

    it('should destroy sandbox even on error', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      mockSandbox.execute = vi.fn().mockRejectedValue(new Error('Execution failed'));

      await executeSandboxStep(input, config, context);

      expect(mockSandbox.destroy).toHaveBeenCalled();
    });

    it('should return fatal result on unexpected error', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      mockSandbox.execute = vi.fn().mockRejectedValue(new Error('Unexpected error'));

      const result = await executeSandboxStep(input, config, context);

      expect(result.resultCode).toBe('fatal');
      expect(result.error?.message).toBe('Unexpected error');
      expect(result.error?.code).toBe('SANDBOX_EXECUTION_ERROR');
    });

    it('should include timing information', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      const result = await executeSandboxStep(input, config, context);

      expect(result.timing).toBeDefined();
      expect(result.timing.startedAt).toBeDefined();
      expect(result.timing.completedAt).toBeDefined();
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log execution progress', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      await executeSandboxStep(input, config, context);

      expect(mockLogger.info).toHaveBeenCalledWith('Creating sandbox', expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith('Sandbox created', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('Diff generated', expect.any(Object));
    });
  });

  describe('executeSandboxStep with IaC export', () => {
    it('should export to IaC when format is specified', async () => {
      const input = createStepInput();
      const config: SandboxStepConfig = {
        ...createSandboxConfig(),
        exportFormat: 'terraform',
      };

      const result = await executeSandboxStep(input, config, context);

      expect(mockExporter.export).toHaveBeenCalled();
      expect((result.data as { iacExport?: unknown }).iacExport).toBeDefined();
    });

    it('should not export when no diffs', async () => {
      const input = createStepInput();
      const config: SandboxStepConfig = {
        ...createSandboxConfig(),
        exportFormat: 'terraform',
      };

      // No diffs
      mockSandbox.diff = vi.fn().mockResolvedValue([]);

      await executeSandboxStep(input, config, context);

      expect(mockExporter.export).not.toHaveBeenCalled();
    });

    it('should not require approval when no changes', async () => {
      const input = createStepInput();
      const config = createSandboxConfig();

      mockSandbox.diff = vi.fn().mockResolvedValue([]);

      const result = await executeSandboxStep(input, config, context);

      expect(result.requiresApproval).toBe(false);
    });
  });

  describe('executeSandboxStep with resources', () => {
    it('should pass resource limits to provider', async () => {
      const input = createStepInput();
      const config: SandboxStepConfig = {
        ...createSandboxConfig(),
        resources: {
          memory: '512m',
          cpu: '0.5',
          network: 'bridge',
        },
      };

      await executeSandboxStep(input, config, context);

      expect(mockProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: {
            memory: '512m',
            cpu: '0.5',
            disk: undefined,
            network: 'bridge',
          },
        })
      );
    });

    it('should pass mounts to provider', async () => {
      const input = createStepInput();
      const config: SandboxStepConfig = {
        ...createSandboxConfig(),
        mounts: [
          { source: '/host/data', target: '/data', readonly: true },
        ],
      };

      await executeSandboxStep(input, config, context);

      expect(mockProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mounts: [{ source: '/host/data', target: '/data', readonly: true }],
        })
      );
    });

    it('should pass environment variables to provider', async () => {
      const input = createStepInput();
      const config: SandboxStepConfig = {
        ...createSandboxConfig(),
        env: { NODE_ENV: 'production', DEBUG: 'true' },
      };

      await executeSandboxStep(input, config, context);

      expect(mockProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          env: { NODE_ENV: 'production', DEBUG: 'true' },
        })
      );
    });
  });

  describe('createSandboxStepDefinition', () => {
    it('should create step definition with correct properties', () => {
      const definition = createSandboxStepDefinition(context);

      expect(definition.type).toBe('sandbox');
      expect(definition.description).toContain('isolated sandbox');
      expect(definition.defaultTimeoutMs).toBe(300000);
      expect(definition.supportsRetry).toBe(true);
      expect(definition.maxRetries).toBe(2);
    });

    it('should create executable step', async () => {
      const definition = createSandboxStepDefinition(context);
      const input = createStepInput();
      const config = createSandboxConfig();

      const result = await definition.execute(input, config);

      expect(result.runId).toBe(input.runId);
      expect(result.stepId).toBe(input.stepId);
    });
  });

  describe('executeSandboxStep with no commands', () => {
    it('should succeed with no commands', async () => {
      const input = createStepInput();
      const config: SandboxStepConfig = {
        ...createSandboxConfig(),
        commands: undefined,
      };

      const result = await executeSandboxStep(input, config, context);

      expect(result.resultCode).toBe('ok');
      expect(mockSandbox.execute).not.toHaveBeenCalled();
    });
  });

  describe('executeSandboxStep without logger', () => {
    it('should work without logger', async () => {
      const contextWithoutLogger: SandboxExecutorContext = {
        sandboxProvider: mockProvider,
      };

      const input = createStepInput();
      const config = createSandboxConfig();

      const result = await executeSandboxStep(input, config, contextWithoutLogger);

      expect(result.resultCode).toBe('ok');
    });
  });
});
