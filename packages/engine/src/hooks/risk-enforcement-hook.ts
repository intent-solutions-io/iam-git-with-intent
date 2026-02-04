/**
 * Risk Tier Enforcement Hook
 *
 * EPIC 025: Regulated Domain Controls
 *
 * Enforces risk tier limits before operations execute.
 * Operations exceeding the allowed risk tier are blocked.
 *
 * Risk Tiers:
 * - R0: Unrestricted (local dev, read-only)
 * - R1: Tool Allowlist (approved tools only)
 * - R2: Approval Required (human approval + SHA binding)
 * - R3: Secrets Detection (credential scanning + redaction)
 * - R4: Immutable Audit (tamper-evident logging)
 *
 * @module @gwi/engine/hooks
 */

import { getLogger } from '@gwi/core';
import type { AgentHook, AgentRunContext } from './types.js';
import { type RiskTier, meetsRiskTier } from '@gwi/core';

const logger = getLogger('risk-enforcement');

/**
 * Configuration for risk enforcement
 */
export interface RiskEnforcementConfig {
  /**
   * Maximum risk tier allowed for this environment
   * @default 'R2'
   */
  maxRiskTier: RiskTier;

  /**
   * Whether to block operations exceeding risk tier
   * If false, only warns but allows operation
   * @default true
   */
  enforceBlocking: boolean;

  /**
   * Callback when operation is blocked
   */
  onBlocked?: (ctx: AgentRunContext, reason: string) => Promise<void>;

  /**
   * Callback when operation is allowed
   */
  onAllowed?: (ctx: AgentRunContext, tier: RiskTier) => Promise<void>;
}

/**
 * Default configuration
 */
export const DEFAULT_RISK_CONFIG: RiskEnforcementConfig = {
  maxRiskTier: 'R2',
  enforceBlocking: true,
};

/**
 * Map agent roles to their minimum required risk tier
 */
const ROLE_RISK_TIERS: Record<string, RiskTier> = {
  FOREMAN: 'R1',      // Orchestration needs tool allowlist
  TRIAGE: 'R0',       // Read-only analysis
  PLANNER: 'R0',      // Plan generation is read-only
  CODER: 'R2',        // Code modification requires approval
  VALIDATOR: 'R1',    // Test execution needs tool allowlist
  REVIEWER: 'R0',     // Review generation is read-only
};

/**
 * Map operations to their required risk tier
 */
const OPERATION_RISK_TIERS: Record<string, RiskTier> = {
  // Read operations
  'read_file': 'R0',
  'list_files': 'R0',
  'analyze_code': 'R0',
  'generate_plan': 'R0',
  'generate_review': 'R0',

  // Tool-restricted operations
  'run_tests': 'R1',
  'run_linter': 'R1',
  'execute_command': 'R1',

  // Approval-required operations
  'write_file': 'R2',
  'create_commit': 'R2',
  'create_branch': 'R2',
  'open_pr': 'R2',

  // Secret-sensitive operations
  'access_credentials': 'R3',
  'modify_secrets': 'R3',
  'deploy_service': 'R3',

  // Audit-required operations
  'merge_pr': 'R4',
  'push_to_main': 'R4',
  'delete_branch': 'R4',
  'production_deploy': 'R4',
};

/**
 * Risk enforcement errors
 */
export class RiskEnforcementError extends Error {
  constructor(
    message: string,
    public readonly requiredTier: RiskTier,
    public readonly allowedTier: RiskTier,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = 'RiskEnforcementError';
  }
}

/**
 * Risk Enforcement Hook
 *
 * Blocks operations that exceed the allowed risk tier.
 * Integrates with the policy gate system for custom checks.
 */
export class RiskEnforcementHook implements AgentHook {
  readonly name = 'risk-enforcement';
  private config: RiskEnforcementConfig;
  private blockedOperations: Map<string, string> = new Map();

  constructor(config?: Partial<RiskEnforcementConfig>) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
  }

  /**
   * Check risk tier before step executes
   */
  async onRunStart(ctx: AgentRunContext): Promise<void> {
    // Check role-based risk tier
    const roleRiskTier = ROLE_RISK_TIERS[ctx.agentRole] || 'R0';

    if (!meetsRiskTier(roleRiskTier, this.config.maxRiskTier)) {
      const reason = `Agent role ${ctx.agentRole} requires ${roleRiskTier}, but max allowed is ${this.config.maxRiskTier}`;

      if (this.config.enforceBlocking) {
        this.blockedOperations.set(ctx.runId, reason);
        await this.config.onBlocked?.(ctx, reason);
        throw new RiskEnforcementError(
          reason,
          roleRiskTier,
          this.config.maxRiskTier,
        );
      } else {
        logger.warn('Risk tier exceeded but enforcement disabled', { reason });
      }
    }

    await this.config.onAllowed?.(ctx, roleRiskTier);
  }

  /**
   * Validate step completion and check for risk violations
   */
  async onAfterStep(ctx: AgentRunContext): Promise<void> {
    // Extract operation from metadata if available
    const operation = ctx.metadata?.operation as string | undefined;

    if (operation) {
      const operationRiskTier = OPERATION_RISK_TIERS[operation] || 'R0';

      if (!meetsRiskTier(operationRiskTier, this.config.maxRiskTier)) {
        const reason = `Operation '${operation}' requires ${operationRiskTier}, but max allowed is ${this.config.maxRiskTier}`;

        if (this.config.enforceBlocking) {
          await this.config.onBlocked?.(ctx, reason);
          // Log but don't throw - step already completed
          logger.error('Risk enforcement violation detected', { reason, operation });
        } else {
          logger.warn('Risk tier exceeded but enforcement disabled', { reason, operation });
        }
      }
    }

  }

  /**
   * Log final risk status on run end
   */
  async onRunEnd(ctx: AgentRunContext, success: boolean): Promise<void> {
    const wasBlocked = this.blockedOperations.get(ctx.runId);

    if (wasBlocked) {
      logger.info('Run was blocked by risk enforcement', { runId: ctx.runId, reason: wasBlocked });
      this.blockedOperations.delete(ctx.runId);
    } else if (success) {
      logger.debug('Run completed within risk tier', { runId: ctx.runId, maxRiskTier: this.config.maxRiskTier });
    }
  }

  /**
   * Check if this hook is enabled
   */
  async isEnabled(): Promise<boolean> {
    return true; // Always enabled
  }

  /**
   * Check if an operation would be allowed
   */
  checkOperation(operation: string): { allowed: boolean; requiredTier: RiskTier } {
    const requiredTier = OPERATION_RISK_TIERS[operation] || 'R0';
    const allowed = meetsRiskTier(requiredTier, this.config.maxRiskTier);
    return { allowed, requiredTier };
  }

  /**
   * Get the current max risk tier
   */
  getMaxRiskTier(): RiskTier {
    return this.config.maxRiskTier;
  }

  /**
   * Update the max risk tier dynamically
   */
  setMaxRiskTier(tier: RiskTier): void {
    this.config.maxRiskTier = tier;
  }
}

/**
 * Factory function to create a risk enforcement hook
 */
export function createRiskEnforcementHook(
  config?: Partial<RiskEnforcementConfig>,
): RiskEnforcementHook {
  return new RiskEnforcementHook(config);
}

/**
 * Get the required risk tier for an operation
 */
export function getOperationRiskTier(operation: string): RiskTier {
  return OPERATION_RISK_TIERS[operation] || 'R0';
}

/**
 * Get the required risk tier for an agent role
 */
export function getRoleRiskTier(role: string): RiskTier {
  return ROLE_RISK_TIERS[role] || 'R0';
}
