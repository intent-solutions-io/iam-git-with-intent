/**
 * Sandboxed Agent Wrapper
 *
 * Wraps agent execution in a Deno sandbox with appropriate permissions.
 * Provides isolation, resource limits, and audit logging.
 */

import { randomUUID } from 'node:crypto';
import type { Sandbox, ExecResult } from './types.js';
import { DenoSandboxProvider } from './providers/deno.js';
import {
  type AgentPermissionProfile,
  getAgentPermissions,
} from './permissions.js';
import {
  type WorktreeSession,
  WorktreeManager,
  createWorktreeManager,
} from './worktree-manager.js';

/**
 * Sandboxed execution result
 */
export interface SandboxedExecutionResult {
  /** Execution ID for audit */
  executionId: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Whether execution timed out */
  timedOut: boolean;
  /** Files changed in sandbox */
  filesChanged: string[];
  /** Permission profile used */
  permissionProfile: string;
}

/**
 * Sandboxed agent options
 */
export interface SandboxedAgentOptions {
  /** Agent type (used to select permission profile) */
  agentType: string;
  /** Custom permission profile (overrides agentType lookup) */
  customPermissions?: AgentPermissionProfile;
  /** Enable git worktree isolation */
  useWorktree?: boolean;
  /** Source branch for worktree */
  sourceBranch?: string;
  /** Enable detailed audit logging */
  auditLogging?: boolean;
  /** Maximum execution time override */
  maxExecutionTimeMs?: number;
}

/**
 * Audit log entry for sandboxed execution
 */
interface AuditEntry {
  executionId: string;
  agentType: string;
  timestamp: string;
  operation: 'start' | 'complete' | 'timeout' | 'error';
  permissionProfile: string;
  worktreeSession?: string;
  exitCode?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Simple audit logger
 */
function auditLog(entry: AuditEntry): void {
  console.log(JSON.stringify({
    ...entry,
    component: 'sandboxed-agent',
  }));
}

/**
 * Sandboxed Agent Executor
 *
 * Executes agent code in an isolated Deno sandbox with:
 * - Permission restrictions based on agent type
 * - Optional git worktree isolation
 * - Execution time limits
 * - Audit logging
 */
export class SandboxedAgentExecutor {
  private provider: DenoSandboxProvider;
  private worktreeManager: WorktreeManager | null = null;
  private sandbox: Sandbox | null = null;
  private worktreeSession: WorktreeSession | null = null;
  private options: SandboxedAgentOptions;
  private permissionProfile: AgentPermissionProfile;
  private initialized = false;

  constructor(options: SandboxedAgentOptions) {
    this.options = options;
    this.provider = new DenoSandboxProvider();
    this.permissionProfile =
      options.customPermissions ?? getAgentPermissions(options.agentType);
  }

  /**
   * Initialize the sandboxed executor
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check Deno availability
    const health = await this.provider.healthCheck();
    if (!health.healthy) {
      throw new Error(`Deno sandbox not available: ${health.message}`);
    }

    // Initialize worktree manager if needed
    if (this.options.useWorktree) {
      this.worktreeManager = createWorktreeManager();
      await this.worktreeManager.initialize();

      // Create worktree for this session
      this.worktreeSession = await this.worktreeManager.create({
        agentType: this.options.agentType,
        sourceBranch: this.options.sourceBranch,
      });
    }

    // Create sandbox
    this.sandbox = await this.provider.create({
      type: 'deno-isolate',
      baseImage: 'deno', // Not actually an image, but required by interface
      workDir: this.worktreeSession?.worktreePath ?? process.cwd(),
      timeoutMs: this.options.maxExecutionTimeMs ?? this.permissionProfile.maxExecutionTimeMs,
      network: {
        enabled: this.permissionProfile.permissions.allowNet !== false,
        allowedHosts: Array.isArray(this.permissionProfile.permissions.allowNet)
          ? this.permissionProfile.permissions.allowNet
          : undefined,
      },
    });

    this.initialized = true;
  }

  /**
   * Execute code in the sandbox
   */
  async execute(code: string): Promise<SandboxedExecutionResult> {
    if (!this.initialized || !this.sandbox) {
      throw new Error('SandboxedAgentExecutor not initialized');
    }

    const executionId = randomUUID();
    const startTime = Date.now();

    if (this.options.auditLogging) {
      auditLog({
        executionId,
        agentType: this.options.agentType,
        timestamp: new Date().toISOString(),
        operation: 'start',
        permissionProfile: this.permissionProfile.name,
        worktreeSession: this.worktreeSession?.sessionId,
      });
    }

    try {
      // Execute in sandbox
      const result = await this.sandbox.execute(code, {
        timeoutMs: this.permissionProfile.maxExecutionTimeMs,
      });

      // Get changed files
      const diff = await this.sandbox.diff();
      const filesChanged = diff.map((d) => d.path);

      const executionResult: SandboxedExecutionResult = {
        executionId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startTime,
        timedOut: result.timedOut ?? false,
        filesChanged,
        permissionProfile: this.permissionProfile.name,
      };

      if (this.options.auditLogging) {
        auditLog({
          executionId,
          agentType: this.options.agentType,
          timestamp: new Date().toISOString(),
          operation: result.timedOut ? 'timeout' : 'complete',
          permissionProfile: this.permissionProfile.name,
          worktreeSession: this.worktreeSession?.sessionId,
          exitCode: result.exitCode,
          durationMs: executionResult.durationMs,
        });
      }

      return executionResult;
    } catch (err) {
      if (this.options.auditLogging) {
        auditLog({
          executionId,
          agentType: this.options.agentType,
          timestamp: new Date().toISOString(),
          operation: 'error',
          permissionProfile: this.permissionProfile.name,
          worktreeSession: this.worktreeSession?.sessionId,
          durationMs: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  /**
   * Execute a shell command in the sandbox
   */
  async executeCommand(command: string): Promise<ExecResult> {
    if (!this.initialized || !this.sandbox) {
      throw new Error('SandboxedAgentExecutor not initialized');
    }

    return this.sandbox.execute(command);
  }

  /**
   * Get the diff of changes made in the sandbox
   */
  async getDiff(): Promise<string> {
    if (this.worktreeSession && this.worktreeManager) {
      return this.worktreeManager.getDiff(this.worktreeSession.sessionId);
    }
    if (this.sandbox) {
      const diffs = await this.sandbox.diff();
      return diffs.map((d) => `${d.type}: ${d.path}`).join('\n');
    }
    return '';
  }

  /**
   * Commit changes (only if using worktree)
   */
  async commit(message: string): Promise<string | null> {
    if (!this.worktreeSession || !this.worktreeManager) {
      return null;
    }

    return this.worktreeManager.commit(this.worktreeSession.sessionId, message, {
      addAll: true,
    });
  }

  /**
   * Merge changes back to target branch (only if using worktree)
   */
  async merge(
    targetBranch: string,
    options?: { squash?: boolean; message?: string }
  ): Promise<{ merged: boolean; hash?: string; error?: string }> {
    if (!this.worktreeSession || !this.worktreeManager) {
      return { merged: false, error: 'Not using worktree isolation' };
    }

    return this.worktreeManager.merge(
      this.worktreeSession.sessionId,
      targetBranch,
      options
    );
  }

  /**
   * Get the permission profile being used
   */
  getPermissionProfile(): AgentPermissionProfile {
    return this.permissionProfile;
  }

  /**
   * Get the worktree session (if using worktree isolation)
   */
  getWorktreeSession(): WorktreeSession | null {
    return this.worktreeSession;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.destroy();
      this.sandbox = null;
    }

    if (this.worktreeSession && this.worktreeManager) {
      await this.worktreeManager.cleanup(this.worktreeSession.sessionId);
      this.worktreeSession = null;
    }

    this.initialized = false;
  }
}

/**
 * Create a sandboxed agent executor
 */
export function createSandboxedAgent(
  options: SandboxedAgentOptions
): SandboxedAgentExecutor {
  return new SandboxedAgentExecutor(options);
}

/**
 * Run agent code in a one-shot sandbox
 */
export async function runInSandbox(
  agentType: string,
  code: string,
  options?: Partial<SandboxedAgentOptions>
): Promise<SandboxedExecutionResult> {
  const executor = createSandboxedAgent({
    agentType,
    ...options,
  });

  try {
    await executor.initialize();
    return await executor.execute(code);
  } finally {
    await executor.cleanup();
  }
}
