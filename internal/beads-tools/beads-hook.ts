/**
 * Beads Hook Implementation
 *
 * INTERNAL USE ONLY - This hook is for Intent Solutions' internal development.
 * External users of Git With Intent do not need this.
 *
 * This hook creates/updates Beads issues based on agent activity:
 * - Creates issues for complex multi-step plans
 * - Updates issues on partial success or deferral
 * - Links related issues for dependency tracking
 *
 * Implements smart heuristics to avoid spamming issues.
 *
 * Reference: https://github.com/steveyegge/beads
 *
 * Beads CLI Commands Used:
 * - bd create "title" -t <type> -p <priority>  # Create issue
 * - bd update <id> --status <status>           # Update status
 * - bd close <id> --reason "reason"            # Close issue
 * - bd ready                                    # List ready issues
 * - bd dep add <src> <tgt> --type <type>       # Add dependency
 *
 * Issue Types: epic, task, bug, feature, chore, research
 * Statuses: open, in_progress, closed, blocked
 * Priorities: 0 (critical) to 3 (low)
 *
 * @internal
 */

import type {
  AgentHook,
  AgentRunContext,
  BeadsHookConfig,
} from '../../packages/engine/src/hooks/index.js';
import { DEFAULT_BEADS_HOOK_CONFIG } from '../../packages/engine/src/hooks/index.js';
import { execSync } from 'child_process';

/**
 * Decision log entry for debugging Beads decisions
 */
interface BeadsDecision {
  timestamp: string;
  runId: string;
  stepId: string;
  decision: 'create' | 'update' | 'skip';
  reason: string;
  beadId?: string;
}

/**
 * Beads Hook - Creates/updates Beads issues based on agent activity
 *
 * @internal - For Intent Solutions internal use only
 */
export class BeadsHook implements AgentHook {
  readonly name = 'beads-task-tracker';

  private config: BeadsHookConfig;
  private decisionLog: BeadsDecision[] = [];
  private runBeadIds: Map<string, string> = new Map(); // runId -> beadId

  constructor(config?: Partial<BeadsHookConfig>) {
    this.config = { ...DEFAULT_BEADS_HOOK_CONFIG, ...config };
  }

  /**
   * Check if Beads is available and configured
   */
  async isEnabled(): Promise<boolean> {
    // Check environment variable
    if (process.env.GWI_BEADS_ENABLED !== 'true') {
      return false;
    }

    // Check if bd CLI is available
    try {
      execSync('which bd', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Called after each agent step completes
   *
   * Uses heuristics to determine if a Beads issue should be created/updated
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    if (!await this.isEnabled()) {
      return;
    }

    const decision = this.evaluateBeadsDecision(ctx);
    this.logDecision(decision);

    if (decision.decision === 'skip') {
      return;
    }

    try {
      if (decision.decision === 'create') {
        const beadId = await this.createBead(ctx);
        if (beadId) {
          this.runBeadIds.set(ctx.runId, beadId);
          decision.beadId = beadId;
        }
      } else if (decision.decision === 'update') {
        const existingBeadId = this.runBeadIds.get(ctx.runId);
        if (existingBeadId) {
          await this.updateBead(existingBeadId, ctx);
          decision.beadId = existingBeadId;
        }
      }
    } catch (error) {
      console.warn(`[BeadsHook] Failed to ${decision.decision} bead: ${error}`);
    }
  }

  /**
   * Called when a run starts
   */
  async onRunStart(ctx: AgentRunContext): Promise<void> {
    if (!await this.isEnabled()) {
      return;
    }

    // Only create initial beads for AUTOPILOT and RESOLVE runs
    if (!this.config.createIssueForRunTypes.includes(ctx.runType)) {
      this.logDecision({
        timestamp: new Date().toISOString(),
        runId: ctx.runId,
        stepId: ctx.stepId,
        decision: 'skip',
        reason: `Run type ${ctx.runType} not configured for bead creation`,
      });
      return;
    }

    // Create an initial bead for tracking
    try {
      const beadId = await this.createBead(ctx, true);
      if (beadId) {
        this.runBeadIds.set(ctx.runId, beadId);
      }
    } catch (error) {
      console.warn(`[BeadsHook] Failed to create initial bead: ${error}`);
    }
  }

  /**
   * Called when a run completes
   */
  async onRunEnd(ctx: AgentRunContext, success: boolean): Promise<void> {
    if (!await this.isEnabled()) {
      return;
    }

    const beadId = this.runBeadIds.get(ctx.runId);
    if (!beadId) {
      return;
    }

    try {
      if (success) {
        // Close the bead on success
        await this.closeBead(beadId);
      } else {
        // Update bead with failure info
        await this.updateBeadStatus(beadId, 'blocked', ctx.outputSummary);
      }
    } catch (error) {
      console.warn(`[BeadsHook] Failed to finalize bead: ${error}`);
    }

    // Clean up
    this.runBeadIds.delete(ctx.runId);
  }

  /**
   * Evaluate whether to create/update a Beads issue
   *
   * This implements the heuristics to avoid spamming:
   * - Only create for configured run types
   * - Only create when complexity/risk is high
   * - Create on partial success or deferral
   */
  private evaluateBeadsDecision(ctx: AgentRunContext): BeadsDecision {
    const timestamp = new Date().toISOString();
    const base = { timestamp, runId: ctx.runId, stepId: ctx.stepId };

    // Check if run type allows bead creation
    if (!this.config.createIssueForRunTypes.includes(ctx.runType)) {
      return {
        ...base,
        decision: 'skip',
        reason: `Run type ${ctx.runType} not configured for bead creation`,
      };
    }

    // Check for existing bead for this run
    const existingBeadId = this.runBeadIds.get(ctx.runId);

    // Check step status for update triggers
    if (ctx.stepStatus === 'failed') {
      if (existingBeadId && this.config.updateExistingIssues) {
        return {
          ...base,
          decision: 'update',
          reason: `Step failed - updating existing bead`,
        };
      } else {
        return {
          ...base,
          decision: 'create',
          reason: `Step failed - creating bead for tracking`,
        };
      }
    }

    // Check for partial success indicators in metadata
    const isPartialSuccess = ctx.metadata?.partialSuccess === true;
    if (isPartialSuccess && this.config.createOnPartialSuccess) {
      if (existingBeadId && this.config.updateExistingIssues) {
        return {
          ...base,
          decision: 'update',
          reason: `Partial success - updating existing bead`,
        };
      } else {
        return {
          ...base,
          decision: 'create',
          reason: `Partial success - creating bead for follow-up`,
        };
      }
    }

    // Check for deferral
    const isDeferred = ctx.metadata?.deferred === true;
    if (isDeferred && this.config.createOnDeferral) {
      return {
        ...base,
        decision: 'create',
        reason: `Deferred work detected - creating bead`,
      };
    }

    // Check complexity from metadata
    const complexity = (ctx.metadata?.complexity as number) ?? 0;
    if (complexity >= this.config.minComplexityForIssue) {
      if (!existingBeadId) {
        return {
          ...base,
          decision: 'create',
          reason: `High complexity (${complexity}) - creating bead`,
        };
      } else if (this.config.updateExistingIssues) {
        return {
          ...base,
          decision: 'update',
          reason: `High complexity step update`,
        };
      }
    }

    // Default: skip
    return {
      ...base,
      decision: 'skip',
      reason: `No trigger conditions met (complexity=${complexity}, status=${ctx.stepStatus})`,
    };
  }

  /**
   * Create a new Beads issue
   *
   * Uses: bd create "title" -t <type> -p <priority>
   *
   * Types: epic, task, bug, feature, chore, research
   * Priorities: 0 (critical) to 3 (low)
   */
  private async createBead(ctx: AgentRunContext, isInitial = false): Promise<string | null> {
    const title = this.generateBeadTitle(ctx, isInitial);

    // Use bd CLI to create issue
    // bd create "title" -t task -p 1
    try {
      // Determine issue type based on context
      const issueType = this.determineIssueType(ctx);
      const priority = this.determinePriority(ctx);

      const cmd = `bd create "${this.escapeShell(title)}" -t ${issueType} -p ${priority}`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

      // Parse bead ID from output (format varies, look for bd-xxxx pattern)
      const match = output.match(/bd-[a-zA-Z0-9]+/);
      if (match) {
        console.log(`[BeadsHook] Created bead: ${match[0]} - ${title}`);
        return match[0];
      }

      return null;
    } catch (error) {
      console.warn(`[BeadsHook] Failed to create bead: ${error}`);
      return null;
    }
  }

  /**
   * Determine issue type based on context
   */
  private determineIssueType(ctx: AgentRunContext): string {
    // Map run types and agent roles to Beads issue types
    if (ctx.runType === 'AUTOPILOT') {
      return 'epic';
    }
    if (ctx.agentRole === 'CODER') {
      return 'task';
    }
    if (ctx.metadata?.isBug === true) {
      return 'bug';
    }
    if (ctx.runType === 'TRIAGE') {
      return 'research';
    }
    return 'task';
  }

  /**
   * Determine priority based on context
   */
  private determinePriority(ctx: AgentRunContext): number {
    const complexity = (ctx.metadata?.complexity as number) ?? 0;
    if (complexity >= 4) return 0; // Critical
    if (complexity >= 3) return 1; // High
    if (complexity >= 2) return 2; // Medium
    return 3; // Low
  }

  /**
   * Update an existing Beads issue
   *
   * Uses: bd update <id> --status in_progress
   *
   * Statuses: open, in_progress, closed, blocked
   */
  private async updateBead(beadId: string, ctx: AgentRunContext): Promise<void> {
    try {
      // Map step status to Beads status
      const beadsStatus = this.mapToBeadsStatus(ctx.stepStatus);

      // Update the issue status
      const cmd = `bd update ${beadId} --status ${beadsStatus}`;
      execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

      console.log(`[BeadsHook] Updated bead: ${beadId} -> ${beadsStatus}`);
    } catch (error) {
      console.warn(`[BeadsHook] Failed to update bead ${beadId}: ${error}`);
    }
  }

  /**
   * Map agent step status to Beads status
   */
  private mapToBeadsStatus(stepStatus: string): string {
    switch (stepStatus) {
      case 'running':
        return 'in_progress';
      case 'completed':
        return 'closed';
      case 'failed':
        return 'blocked';
      case 'skipped':
        return 'closed';
      default:
        return 'open';
    }
  }

  /**
   * Update bead status directly
   *
   * Uses: bd update <id> --status <status>
   */
  private async updateBeadStatus(beadId: string, status: string, reason?: string): Promise<void> {
    try {
      const cmd = `bd update ${beadId} --status ${status}`;
      execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

      console.log(`[BeadsHook] Updated bead status: ${beadId} -> ${status}${reason ? ` (${reason})` : ''}`);
    } catch (error) {
      console.warn(`[BeadsHook] Failed to update bead status ${beadId}: ${error}`);
    }
  }

  /**
   * Close a bead (mark as completed)
   *
   * Uses: bd close <id> --reason "reason"
   */
  private async closeBead(beadId: string): Promise<void> {
    try {
      const cmd = `bd close ${beadId} --reason "Run completed successfully"`;
      execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
      console.log(`[BeadsHook] Closed bead: ${beadId}`);
    } catch (error) {
      console.warn(`[BeadsHook] Failed to close bead ${beadId}: ${error}`);
    }
  }

  /**
   * Generate a title for the bead
   */
  private generateBeadTitle(ctx: AgentRunContext, isInitial: boolean): string {
    if (isInitial) {
      return `GWI: ${ctx.runType} run ${ctx.runId.slice(-8)}`;
    }

    return `GWI: ${ctx.agentRole} step in ${ctx.runType} run`;
  }

  /**
   * Generate a description for the bead
   */
  private generateBeadDescription(ctx: AgentRunContext): string {
    const parts = [
      `Run ID: ${ctx.runId}`,
      `Run Type: ${ctx.runType}`,
      `Agent: ${ctx.agentRole}`,
      `Status: ${ctx.stepStatus}`,
    ];

    if (ctx.tenantId) {
      parts.push(`Tenant: ${ctx.tenantId}`);
    }

    if (ctx.inputSummary) {
      parts.push(`Input: ${ctx.inputSummary}`);
    }

    if (ctx.outputSummary) {
      parts.push(`Output: ${ctx.outputSummary}`);
    }

    return parts.join('\n');
  }

  /**
   * Log a decision for debugging
   */
  private logDecision(decision: BeadsDecision): void {
    this.decisionLog.push(decision);

    // Keep only last 100 decisions
    if (this.decisionLog.length > 100) {
      this.decisionLog.shift();
    }

    // Log to console if debug enabled
    if (process.env.GWI_BEADS_DEBUG === 'true') {
      console.log(`[BeadsHook] Decision: ${decision.decision} - ${decision.reason}`);
    }
  }

  /**
   * Escape shell special characters
   */
  private escapeShell(str: string): string {
    return str.replace(/['"\\]/g, '\\$&').replace(/\n/g, ' ');
  }

  /**
   * Get recent decision log (for debugging)
   */
  getDecisionLog(): BeadsDecision[] {
    return [...this.decisionLog];
  }
}

/**
 * Create a Beads hook from environment configuration
 *
 * @internal
 */
export function createBeadsHook(config?: Partial<BeadsHookConfig>): BeadsHook | null {
  if (process.env.GWI_BEADS_ENABLED !== 'true') {
    return null;
  }

  return new BeadsHook(config);
}
