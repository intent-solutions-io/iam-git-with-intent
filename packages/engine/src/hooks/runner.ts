/**
 * Agent Hook Runner
 *
 * Manages registration and execution of hooks after agent steps.
 * Designed to be resilient - hooks should never crash the main pipeline.
 *
 * @module @gwi/engine/hooks
 */

import type {
  AgentHook,
  AgentRunContext,
  HookConfig,
} from './types.js';
import { DEFAULT_HOOK_CONFIG } from './types.js';

/**
 * Logger interface for hook runner
 */
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Simple console logger as fallback
 */
const consoleLogger: Logger = {
  debug: (msg, meta) => console.debug(`[HookRunner] ${msg}`, meta || ''),
  info: (msg, meta) => console.info(`[HookRunner] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[HookRunner] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[HookRunner] ${msg}`, meta || ''),
};

/**
 * Result of a single hook execution
 */
interface HookExecutionResult {
  hookName: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Result of running all hooks
 */
export interface HookRunResult {
  totalHooks: number;
  successfulHooks: number;
  failedHooks: number;
  results: HookExecutionResult[];
  totalDurationMs: number;
}

/**
 * AgentHookRunner manages and executes hooks in the agent lifecycle
 *
 * Usage:
 * ```typescript
 * const runner = new AgentHookRunner();
 * runner.register(new CustomHook({ ... }));
 *
 * // After each agent step:
 * await runner.afterStep(context);
 * ```
 */
export class AgentHookRunner {
  private hooks: AgentHook[] = [];
  private config: HookConfig;
  private logger: Logger;

  constructor(config?: Partial<HookConfig>, logger?: Logger) {
    this.config = { ...DEFAULT_HOOK_CONFIG, ...config };
    this.logger = logger || consoleLogger;
  }

  /**
   * Register a hook to be called on agent lifecycle events
   *
   * @param hook - The hook to register
   */
  register(hook: AgentHook): void {
    // Check for duplicate names
    if (this.hooks.some((h) => h.name === hook.name)) {
      this.logger.warn(`Hook already registered: ${hook.name}, skipping duplicate`);
      return;
    }

    this.hooks.push(hook);
    this.logger.debug(`Hook registered: ${hook.name}`);
  }

  /**
   * Unregister a hook by name
   *
   * @param name - Name of the hook to remove
   * @returns true if hook was found and removed
   */
  unregister(name: string): boolean {
    const index = this.hooks.findIndex((h) => h.name === name);
    if (index !== -1) {
      this.hooks.splice(index, 1);
      this.logger.debug(`Hook unregistered: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Get list of registered hook names
   */
  getRegisteredHooks(): string[] {
    return this.hooks.map((h) => h.name);
  }

  /**
   * Get all registered hooks
   */
  getHooks(): AgentHook[] {
    return [...this.hooks];
  }

  /**
   * Execute onBeforeStep for all hooks that implement it.
   *
   * Unlike afterStep, errors from beforeStep hooks are NOT swallowed —
   * they propagate to the caller so that the operation can be blocked
   * before it executes (e.g. risk enforcement).
   *
   * Hooks run in series to ensure deterministic ordering and so that
   * an early hook can abort before later hooks run.
   *
   * @param ctx - The context of the upcoming step
   * @returns Results of hook execution
   * @throws Re-throws errors from hooks (e.g. RiskEnforcementError)
   */
  async beforeStep(ctx: AgentRunContext): Promise<HookRunResult> {
    const startTime = Date.now();
    const results: HookExecutionResult[] = [];

    const enabledHooks = await this.getEnabledHooks();
    const hooksWithBeforeStep = enabledHooks.filter((h) => h.onBeforeStep);

    if (hooksWithBeforeStep.length === 0) {
      return {
        totalHooks: 0,
        successfulHooks: 0,
        failedHooks: 0,
        results: [],
        totalDurationMs: 0,
      };
    }

    if (this.config.debug) {
      this.logger.debug(`Running ${hooksWithBeforeStep.length} beforeStep hooks for step ${ctx.stepId}`);
    }

    // Always run in series — an early hook may block further execution
    for (const hook of hooksWithBeforeStep) {
      const hookStart = Date.now();
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Hook timeout after ${this.config.hookTimeoutMs}ms`));
          }, this.config.hookTimeoutMs);
        });

        await Promise.race([hook.onBeforeStep!(ctx), timeoutPromise]);

        results.push({
          hookName: hook.name,
          success: true,
          durationMs: Date.now() - hookStart,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          hookName: hook.name,
          success: false,
          durationMs: Date.now() - hookStart,
          error: errorMessage,
        });

        this.logger.error(`Hook ${hook.name}.onBeforeStep blocked operation: ${errorMessage}`, {
          hookName: hook.name,
          stepId: ctx.stepId,
          runId: ctx.runId,
        });

        // Re-throw to block the operation
        throw error;
      }
    }

    return {
      totalHooks: hooksWithBeforeStep.length,
      successfulHooks: results.filter((r) => r.success).length,
      failedHooks: results.filter((r) => !r.success).length,
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute all hooks after a step completes
   *
   * This method will:
   * - Run all registered hooks
   * - Handle errors gracefully (log and continue)
   * - Respect timeout configuration
   * - Run in parallel or series based on config
   *
   * @param ctx - The context of the completed step
   * @returns Results of hook execution
   */
  async afterStep(ctx: AgentRunContext): Promise<HookRunResult> {
    const startTime = Date.now();
    const results: HookExecutionResult[] = [];

    if (this.hooks.length === 0) {
      return {
        totalHooks: 0,
        successfulHooks: 0,
        failedHooks: 0,
        results: [],
        totalDurationMs: 0,
      };
    }

    if (this.config.debug) {
      this.logger.debug(`Running ${this.hooks.length} hooks for step ${ctx.stepId}`);
    }

    // Filter to enabled hooks
    const enabledHooks = await this.getEnabledHooks();

    if (this.config.parallelExecution) {
      // Run hooks in parallel with timeout
      const promises = enabledHooks.map((hook) =>
        this.executeHookWithTimeout(hook, 'onAfterStep', ctx)
      );
      const hookResults = await Promise.all(promises);
      results.push(...hookResults);
    } else {
      // Run hooks in series
      for (const hook of enabledHooks) {
        const result = await this.executeHookWithTimeout(hook, 'onAfterStep', ctx);
        results.push(result);
      }
    }

    const successfulHooks = results.filter((r) => r.success).length;
    const failedHooks = results.filter((r) => !r.success).length;

    if (this.config.debug || failedHooks > 0) {
      this.logger.info(`Hooks completed: ${successfulHooks} success, ${failedHooks} failed`, {
        stepId: ctx.stepId,
        results: results.map((r) => ({
          name: r.hookName,
          success: r.success,
          durationMs: r.durationMs,
        })),
      });
    }

    return {
      totalHooks: enabledHooks.length,
      successfulHooks,
      failedHooks,
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute onRunStart for all hooks
   */
  async runStart(ctx: AgentRunContext): Promise<HookRunResult> {
    const startTime = Date.now();
    const results: HookExecutionResult[] = [];

    const enabledHooks = await this.getEnabledHooks();
    const hooksWithRunStart = enabledHooks.filter((h) => h.onRunStart);

    if (this.config.parallelExecution) {
      const promises = hooksWithRunStart.map((hook) =>
        this.executeHookWithTimeout(hook, 'onRunStart', ctx)
      );
      const hookResults = await Promise.all(promises);
      results.push(...hookResults);
    } else {
      for (const hook of hooksWithRunStart) {
        const result = await this.executeHookWithTimeout(hook, 'onRunStart', ctx);
        results.push(result);
      }
    }

    return {
      totalHooks: hooksWithRunStart.length,
      successfulHooks: results.filter((r) => r.success).length,
      failedHooks: results.filter((r) => !r.success).length,
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute onRunEnd for all hooks
   */
  async runEnd(ctx: AgentRunContext, success: boolean): Promise<HookRunResult> {
    const startTime = Date.now();
    const results: HookExecutionResult[] = [];

    const enabledHooks = await this.getEnabledHooks();
    const hooksWithRunEnd = enabledHooks.filter((h) => h.onRunEnd);

    if (this.config.parallelExecution) {
      const promises = hooksWithRunEnd.map((hook) =>
        this.executeHookWithTimeout(hook, 'onRunEnd', ctx, success)
      );
      const hookResults = await Promise.all(promises);
      results.push(...hookResults);
    } else {
      for (const hook of hooksWithRunEnd) {
        const result = await this.executeHookWithTimeout(hook, 'onRunEnd', ctx, success);
        results.push(result);
      }
    }

    return {
      totalHooks: hooksWithRunEnd.length,
      successfulHooks: results.filter((r) => r.success).length,
      failedHooks: results.filter((r) => !r.success).length,
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Get hooks that are currently enabled
   */
  private async getEnabledHooks(): Promise<AgentHook[]> {
    const enabledChecks = await Promise.all(
      this.hooks.map(async (hook) => {
        if (hook.isEnabled) {
          try {
            return await hook.isEnabled();
          } catch (error) {
            this.logger.warn(`Failed to check if hook ${hook.name} is enabled`, {
              error: String(error),
            });
            return false;
          }
        }
        return true; // Default to enabled if no isEnabled method
      })
    );

    return this.hooks.filter((_, index) => enabledChecks[index]);
  }

  /**
   * Execute a single hook method with timeout protection
   */
  private async executeHookWithTimeout(
    hook: AgentHook,
    method: 'onAfterStep' | 'onBeforeStep' | 'onRunStart' | 'onRunEnd',
    ctx: AgentRunContext,
    success?: boolean
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Hook timeout after ${this.config.hookTimeoutMs}ms`));
        }, this.config.hookTimeoutMs);
      });

      let hookPromise: Promise<void>;

      switch (method) {
        case 'onAfterStep':
          hookPromise = hook.onAfterStep(ctx);
          break;
        case 'onBeforeStep':
          hookPromise = hook.onBeforeStep?.(ctx) ?? Promise.resolve();
          break;
        case 'onRunStart':
          hookPromise = hook.onRunStart?.(ctx) ?? Promise.resolve();
          break;
        case 'onRunEnd':
          hookPromise = hook.onRunEnd?.(ctx, success!) ?? Promise.resolve();
          break;
      }

      await Promise.race([hookPromise, timeoutPromise]);

      return {
        hookName: hook.name,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Hook ${hook.name}.${method} failed: ${errorMessage}`, {
        hookName: hook.name,
        method,
        stepId: ctx.stepId,
        runId: ctx.runId,
      });

      return {
        hookName: hook.name,
        success: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }
}
