/**
 * Sandbox Step Executor
 *
 * Executes sandbox workflow steps by integrating with @gwi/sandbox.
 * Handles sandbox creation, command execution, diff generation, and IaC export.
 *
 * @module @gwi/engine/workflow/sandbox-executor
 */

import type { StepInput, StepOutput, StepTiming } from '../step-contract/types.js';
import type { SandboxStepConfig } from './schema.js';

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult {
  /** Whether execution was successful */
  success: boolean;

  /** Sandbox ID */
  sandboxId: string;

  /** File diffs from sandbox execution */
  diffs: Array<{
    path: string;
    type: 'added' | 'modified' | 'deleted' | 'renamed';
    oldContent?: string;
    newContent?: string;
  }>;

  /** Command outputs */
  commandOutputs: Array<{
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  }>;

  /** Exported IaC (if exportFormat was specified) */
  iacExport?: {
    format: string;
    files: Array<{
      path: string;
      content: string;
    }>;
  };

  /** Snapshot ID (if snapshot was enabled) */
  snapshotId?: string;

  /** Error message if execution failed */
  error?: string;
}

/**
 * Sandbox provider interface (subset of @gwi/sandbox types)
 *
 * This is a minimal interface - the actual provider comes from @gwi/sandbox.
 */
export interface SandboxProviderInterface {
  create(config: {
    type: 'docker' | 'kvm' | 'deno-isolate';
    image?: string;
    workDir?: string;
    resources?: {
      memory?: string;
      cpu?: string;
      disk?: string;
      network?: 'none' | 'host' | 'bridge';
    };
    mounts?: Array<{
      source: string;
      target: string;
      readonly?: boolean;
    }>;
    env?: Record<string, string>;
  }): Promise<SandboxInstance>;
}

/**
 * Sandbox instance interface
 */
export interface SandboxInstance {
  id: string;
  execute(command: string, options?: { timeout?: number }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  snapshot(): Promise<string>;
  diff(since?: string): Promise<Array<{
    path: string;
    type: 'added' | 'modified' | 'deleted' | 'renamed';
    oldContent?: string;
    newContent?: string;
  }>>;
  destroy(): Promise<void>;
}

/**
 * IaC exporter interface
 */
export interface IaCExporterInterface {
  export(
    diffs: Array<{
      path: string;
      type: 'added' | 'modified' | 'deleted' | 'renamed';
      newContent?: string;
    }>,
    options?: {
      format?: string;
      prefix?: string;
    }
  ): Promise<{
    files: Array<{ path: string; content: string; type: string }>;
    summary: { resourceCount: number };
    warnings: string[];
  }>;
}

/**
 * Sandbox executor context
 */
export interface SandboxExecutorContext {
  /** Sandbox provider from @gwi/sandbox */
  sandboxProvider: SandboxProviderInterface;

  /** IaC exporter (optional) */
  iacExporter?: IaCExporterInterface;

  /** Logger */
  logger?: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * Execute a sandbox workflow step
 *
 * @param input - Step input envelope
 * @param config - Sandbox step configuration
 * @param context - Execution context with sandbox provider
 * @returns Step output envelope
 */
export async function executeSandboxStep(
  input: StepInput,
  config: SandboxStepConfig,
  context: SandboxExecutorContext
): Promise<StepOutput> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const { sandboxProvider, iacExporter, logger } = context;

  let sandbox: SandboxInstance | undefined;
  let snapshotId: string | undefined;

  try {
    logger?.info('Creating sandbox', {
      runId: input.runId,
      stepId: input.stepId,
      sandboxType: config.sandboxType,
    });

    // Create sandbox
    sandbox = await sandboxProvider.create({
      type: config.sandboxType,
      image: config.baseImage,
      workDir: config.workDir,
      resources: config.resources
        ? {
            memory: config.resources.memory,
            cpu: config.resources.cpu,
            disk: config.resources.disk,
            network: config.resources.network,
          }
        : undefined,
      mounts: config.mounts?.map((m) => ({
        source: m.source,
        target: m.target,
        readonly: m.readonly,
      })),
      env: config.env,
    });

    logger?.debug('Sandbox created', { sandboxId: sandbox.id });

    // Take initial snapshot if configured
    if (config.snapshot) {
      snapshotId = await sandbox.snapshot();
      logger?.debug('Initial snapshot taken', { snapshotId });
    }

    // Execute commands
    const commandOutputs: SandboxExecutionResult['commandOutputs'] = [];
    const commands = config.commands ?? [];

    for (const command of commands) {
      const cmdStartTime = Date.now();

      logger?.debug('Executing command', { command });

      const result = await sandbox.execute(command, {
        timeout: config.sandboxTimeoutMs,
      });

      const cmdDurationMs = Date.now() - cmdStartTime;

      commandOutputs.push({
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: cmdDurationMs,
      });

      // Check for command failure
      if (result.exitCode !== 0) {
        logger?.warn('Command failed', {
          command,
          exitCode: result.exitCode,
          stderr: result.stderr,
        });

        // Continue executing remaining commands (like make -k)
        // Individual command failures are recorded
      }
    }

    // Generate diff
    const diffs = await sandbox.diff(snapshotId);
    logger?.info('Diff generated', { changeCount: diffs.length });

    // Export to IaC if configured
    let iacExport: SandboxExecutionResult['iacExport'] | undefined;

    if (config.exportFormat && iacExporter && diffs.length > 0) {
      logger?.debug('Exporting to IaC', { format: config.exportFormat });

      const exportResult = await iacExporter.export(diffs, {
        format: config.exportFormat,
        prefix: `sandbox_${sandbox.id}`,
      });

      iacExport = {
        format: config.exportFormat,
        files: exportResult.files.map((f) => ({
          path: f.path,
          content: f.content,
        })),
      };

      if (exportResult.warnings.length > 0) {
        logger?.warn('IaC export warnings', { warnings: exportResult.warnings });
      }
    }

    // Calculate timing
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const timing: StepTiming = {
      startedAt,
      completedAt,
      durationMs,
    };

    // Check if any commands failed
    const failedCommands = commandOutputs.filter((c) => c.exitCode !== 0);
    const hasFailures = failedCommands.length > 0;

    // Build result
    const result: SandboxExecutionResult = {
      success: !hasFailures,
      sandboxId: sandbox.id,
      diffs,
      commandOutputs,
      iacExport,
      snapshotId,
      error: hasFailures
        ? `${failedCommands.length} command(s) failed`
        : undefined,
    };

    // Create step output
    const output: StepOutput = {
      runId: input.runId,
      stepId: input.stepId,
      resultCode: hasFailures ? 'retryable' : 'ok',
      summary: hasFailures
        ? `Sandbox execution completed with ${failedCommands.length} failed command(s) out of ${commands.length}`
        : `Sandbox execution completed: ${diffs.length} file(s) changed`,
      data: result,
      timing,
      requiresApproval: diffs.length > 0, // Require approval if there are changes
      proposedChanges: diffs.map((d) => ({
        file: d.path,
        action: d.type === 'added' ? 'create' : d.type === 'deleted' ? 'delete' : 'modify',
        summary: `${d.type}: ${d.path}`,
        diff: d.type === 'deleted' ? undefined : d.newContent,
      })),
    };

    return output;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const timing: StepTiming = {
      startedAt,
      completedAt,
      durationMs,
    };

    logger?.error('Sandbox step failed', {
      error: (error as Error).message,
      runId: input.runId,
      stepId: input.stepId,
    });

    return {
      runId: input.runId,
      stepId: input.stepId,
      resultCode: 'fatal',
      summary: `Sandbox execution failed: ${(error as Error).message}`,
      error: {
        message: (error as Error).message,
        code: 'SANDBOX_EXECUTION_ERROR',
        details: {
          sandboxType: config.sandboxType,
          sandboxId: sandbox?.id,
        },
      },
      timing,
      requiresApproval: false,
    };
  } finally {
    // Cleanup sandbox
    if (sandbox) {
      try {
        await sandbox.destroy();
        logger?.debug('Sandbox destroyed', { sandboxId: sandbox.id });
      } catch (cleanupError) {
        logger?.warn('Failed to destroy sandbox', {
          sandboxId: sandbox.id,
          error: (cleanupError as Error).message,
        });
      }
    }
  }
}

/**
 * Create a sandbox step definition for workflow registration
 */
export function createSandboxStepDefinition(
  context: SandboxExecutorContext
): {
  type: 'sandbox';
  description: string;
  execute: (input: StepInput, config: SandboxStepConfig) => Promise<StepOutput>;
  defaultTimeoutMs: number;
  supportsRetry: boolean;
  maxRetries: number;
} {
  return {
    type: 'sandbox',
    description: 'Execute commands in an isolated sandbox environment with diff tracking and IaC export',
    execute: (input: StepInput, config: SandboxStepConfig) =>
      executeSandboxStep(input, config, context),
    defaultTimeoutMs: 300000, // 5 minutes
    supportsRetry: true,
    maxRetries: 2,
  };
}
