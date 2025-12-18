/**
 * Phase 60: Auto-Actions Framework
 *
 * Automated response system for alerts:
 * - Action definitions and triggers
 * - Webhook notifications
 * - Escalation policies
 * - Rate limiting and circuit breakers
 * - Action audit logging
 * - Runbook integration
 *
 * @module @gwi/core/auto-actions
 */

import { z } from 'zod';
import type { AlertRuleSeverity, AlertInstance } from '../alerts/index.js';

// =============================================================================
// AUTO-ACTIONS CONTRACT VERSION
// =============================================================================

export const AUTO_ACTIONS_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const AutoActionsErrorCodes = {
  // Config errors (1xxx)
  INVALID_ACTION: 'AA_1001',
  INVALID_TRIGGER: 'AA_1002',
  INVALID_POLICY: 'AA_1003',
  MISSING_CONFIG: 'AA_1004',

  // Execution errors (2xxx)
  EXECUTION_FAILED: 'AA_2001',
  TIMEOUT: 'AA_2002',
  RATE_LIMITED: 'AA_2003',
  CIRCUIT_OPEN: 'AA_2004',

  // Policy errors (3xxx)
  ESCALATION_FAILED: 'AA_3001',
  NO_AVAILABLE_TARGETS: 'AA_3002',
  MAX_ESCALATIONS: 'AA_3003',
  POLICY_NOT_FOUND: 'AA_3004',

  // Audit errors (4xxx)
  AUDIT_WRITE_FAILED: 'AA_4001',
  AUDIT_READ_FAILED: 'AA_4002',
  LOG_OVERFLOW: 'AA_4003',
  RETENTION_ERROR: 'AA_4004',
} as const;

export type AutoActionsErrorCode =
  (typeof AutoActionsErrorCodes)[keyof typeof AutoActionsErrorCodes];

// =============================================================================
// ACTION TYPES
// =============================================================================

export type ActionType =
  | 'webhook'
  | 'email'
  | 'slack'
  | 'pagerduty'
  | 'scale'
  | 'restart'
  | 'runbook'
  | 'custom';

export type ActionState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type TriggerType =
  | 'alert_firing'
  | 'alert_resolved'
  | 'alert_escalated'
  | 'threshold_breach'
  | 'schedule'
  | 'manual';

// =============================================================================
// ACTION DEFINITION
// =============================================================================

export interface ActionDefinition {
  /** Unique action ID */
  id: string;
  /** Action name */
  name: string;
  /** Description */
  description?: string;
  /** Tenant ID */
  tenantId: string;
  /** Action type */
  type: ActionType;
  /** Action configuration */
  config: ActionConfig;
  /** Triggers for this action */
  triggers: ActionTrigger[];
  /** Rate limit config */
  rateLimit?: ActionRateLimitConfig;
  /** Circuit breaker config */
  circuitBreaker?: ActionCircuitBreakerConfig;
  /** Retry config */
  retryConfig?: ActionRetryConfig;
  /** Whether action is enabled */
  enabled: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface ActionConfig {
  // Webhook
  webhookUrl?: string;
  webhookMethod?: 'GET' | 'POST' | 'PUT';
  webhookHeaders?: Record<string, string>;
  webhookBody?: string;
  // Email
  emailTo?: string[];
  emailSubject?: string;
  emailBody?: string;
  // Slack
  slackWebhookUrl?: string;
  slackMessage?: string;
  // PagerDuty
  pagerDutyRoutingKey?: string;
  pagerDutySeverity?: 'critical' | 'error' | 'warning' | 'info';
  // Scale
  scaleTarget?: string;
  scaleReplicas?: number;
  // Restart
  restartTarget?: string;
  // Runbook
  runbookId?: string;
  runbookParams?: Record<string, string>;
  // Custom
  customHandler?: string;
  customParams?: Record<string, unknown>;
}

export interface ActionTrigger {
  /** Trigger type */
  type: TriggerType;
  /** Alert severity filter */
  severityFilter?: AlertRuleSeverity[];
  /** Alert rule filter */
  ruleFilter?: string[];
  /** Label filter (key=value) */
  labelFilter?: Record<string, string>;
  /** Delay before action (seconds) */
  delaySeconds?: number;
  /** Schedule (cron expression for schedule type) */
  schedule?: string;
}

// =============================================================================
// RATE LIMITING & CIRCUIT BREAKER
// =============================================================================

export interface ActionRateLimitConfig {
  /** Max actions per window */
  maxActions: number;
  /** Window duration (seconds) */
  windowSeconds: number;
  /** Behavior when limited */
  onLimited: 'drop' | 'queue' | 'error';
}

export interface ActionCircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit */
  successThreshold: number;
  /** Half-open timeout (seconds) */
  halfOpenTimeout: number;
  /** Reset timeout (seconds) */
  resetTimeout: number;
}

export interface ActionRetryConfig {
  /** Max retry attempts */
  maxAttempts: number;
  /** Initial delay (ms) */
  initialDelayMs: number;
  /** Max delay (ms) */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

// =============================================================================
// ESCALATION POLICY
// =============================================================================

export interface EscalationPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Tenant ID */
  tenantId: string;
  /** Escalation levels */
  levels: EscalationLevel[];
  /** Repeat interval (seconds, 0 = no repeat) */
  repeatInterval: number;
  /** Max escalations before stopping */
  maxEscalations: number;
  /** Whether to notify all previous levels on escalation */
  notifyPreviousLevels: boolean;
  /** Enabled */
  enabled: boolean;
}

export interface EscalationLevel {
  /** Level number (1 = first) */
  level: number;
  /** Delay before escalating to next level (seconds) */
  delaySeconds: number;
  /** Targets at this level */
  targets: EscalationTarget[];
}

export interface EscalationTarget {
  /** Target type */
  type: 'user' | 'team' | 'channel' | 'schedule';
  /** Target ID */
  id: string;
  /** Target name (for display) */
  name: string;
}

// =============================================================================
// ACTION EXECUTION
// =============================================================================

export interface ActionExecution {
  /** Execution ID */
  id: string;
  /** Action definition ID */
  actionId: string;
  /** Alert instance ID (if triggered by alert) */
  alertId?: string;
  /** Trigger type */
  triggerType: TriggerType;
  /** Execution state */
  state: ActionState;
  /** Start time */
  startedAt: number;
  /** End time */
  completedAt?: number;
  /** Duration (ms) */
  durationMs?: number;
  /** Result data */
  result?: ActionResult;
  /** Error (if failed) */
  error?: string;
  /** Retry count */
  retryCount: number;
}

export interface ActionResult {
  /** HTTP status code (for webhooks) */
  statusCode?: number;
  /** Response body */
  responseBody?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

// =============================================================================
// AUDIT LOG
// =============================================================================

export interface ActionAuditEntry {
  /** Entry ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Action definition ID */
  actionId: string;
  /** Action name */
  actionName: string;
  /** Execution ID */
  executionId: string;
  /** Tenant ID */
  tenantId: string;
  /** Trigger type */
  triggerType: TriggerType;
  /** Alert ID (if applicable) */
  alertId?: string;
  /** State */
  state: ActionState;
  /** Duration (ms) */
  durationMs?: number;
  /** Error message */
  error?: string;
  /** User who triggered (if manual) */
  triggeredBy?: string;
}

// =============================================================================
// AUTO-ACTIONS ENGINE
// =============================================================================

/**
 * Auto-actions engine for automated responses
 */
export class AutoActionsEngine {
  private actions: Map<string, ActionDefinition> = new Map();
  private policies: Map<string, EscalationPolicy> = new Map();
  private executions: Map<string, ActionExecution> = new Map();
  private auditLog: ActionAuditEntry[] = [];
  private rateLimitWindows: Map<string, { count: number; resetAt: number }> = new Map();
  private circuitStates: Map<string, {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    successes: number;
    lastFailure: number;
  }> = new Map();
  private actionCounter = 0;
  private policyCounter = 0;
  private executionCounter = 0;
  private auditCounter = 0;

  /**
   * Register an action
   */
  registerAction(
    action: Omit<ActionDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): ActionDefinition {
    const newAction: ActionDefinition = {
      ...action,
      id: `action_${++this.actionCounter}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.actions.set(newAction.id, newAction);
    return newAction;
  }

  /**
   * Get action by ID
   */
  getAction(actionId: string): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }

  /**
   * List actions for tenant
   */
  listActions(tenantId: string): ActionDefinition[] {
    return Array.from(this.actions.values()).filter(a => a.tenantId === tenantId);
  }

  /**
   * Update an action
   */
  updateAction(
    actionId: string,
    updates: Partial<Omit<ActionDefinition, 'id' | 'createdAt'>>
  ): ActionDefinition | undefined {
    const action = this.actions.get(actionId);
    if (!action) return undefined;

    const updated = {
      ...action,
      ...updates,
      updatedAt: Date.now(),
    };
    this.actions.set(actionId, updated);
    return updated;
  }

  /**
   * Delete an action
   */
  deleteAction(actionId: string): boolean {
    return this.actions.delete(actionId);
  }

  /**
   * Register an escalation policy
   */
  registerPolicy(
    policy: Omit<EscalationPolicy, 'id'>
  ): EscalationPolicy {
    const newPolicy: EscalationPolicy = {
      ...policy,
      id: `policy_${++this.policyCounter}`,
    };
    this.policies.set(newPolicy.id, newPolicy);
    return newPolicy;
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): EscalationPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * List policies for tenant
   */
  listPolicies(tenantId: string): EscalationPolicy[] {
    return Array.from(this.policies.values()).filter(p => p.tenantId === tenantId);
  }

  /**
   * Execute action for an alert
   */
  async executeAction(
    actionId: string,
    alert?: AlertInstance,
    triggerType: TriggerType = 'alert_firing',
    triggeredBy?: string
  ): Promise<ActionExecution> {
    const action = this.actions.get(actionId);
    if (!action || !action.enabled) {
      throw new Error(`Action ${actionId} not found or disabled`);
    }

    // Check rate limit
    if (action.rateLimit && !this.checkRateLimit(actionId, action.rateLimit)) {
      const execution = this.createExecution(actionId, alert?.id, triggerType);
      execution.state = 'skipped';
      execution.error = 'Rate limited';
      execution.completedAt = Date.now();
      this.logAudit(action, execution, triggeredBy);
      return execution;
    }

    // Check circuit breaker
    if (action.circuitBreaker && !this.checkCircuitBreaker(actionId, action.circuitBreaker)) {
      const execution = this.createExecution(actionId, alert?.id, triggerType);
      execution.state = 'skipped';
      execution.error = 'Circuit breaker open';
      execution.completedAt = Date.now();
      this.logAudit(action, execution, triggeredBy);
      return execution;
    }

    const execution = this.createExecution(actionId, alert?.id, triggerType);
    execution.state = 'running';

    try {
      const result = await this.performAction(action, alert);
      execution.state = 'completed';
      execution.result = result;
      execution.completedAt = Date.now();
      execution.durationMs = execution.completedAt - execution.startedAt;

      // Update circuit breaker success
      if (action.circuitBreaker) {
        this.recordCircuitSuccess(actionId, action.circuitBreaker);
      }
    } catch (error) {
      execution.state = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = Date.now();
      execution.durationMs = execution.completedAt - execution.startedAt;

      // Update circuit breaker failure
      if (action.circuitBreaker) {
        this.recordCircuitFailure(actionId, action.circuitBreaker);
      }

      // Retry if configured
      if (action.retryConfig && execution.retryCount < action.retryConfig.maxAttempts) {
        await this.retryExecution(execution, action, alert, triggerType, triggeredBy);
      }
    }

    this.logAudit(action, execution, triggeredBy);
    return execution;
  }

  /**
   * Find matching actions for an alert
   */
  findMatchingActions(alert: AlertInstance, triggerType: TriggerType): ActionDefinition[] {
    return Array.from(this.actions.values()).filter(action => {
      if (!action.enabled) return false;

      return action.triggers.some(trigger => {
        if (trigger.type !== triggerType) return false;

        if (trigger.severityFilter && !trigger.severityFilter.includes(alert.severity)) {
          return false;
        }

        if (trigger.ruleFilter && !trigger.ruleFilter.includes(alert.ruleId)) {
          return false;
        }

        if (trigger.labelFilter) {
          for (const [key, value] of Object.entries(trigger.labelFilter)) {
            if (alert.labels[key] !== value) return false;
          }
        }

        return true;
      });
    });
  }

  /**
   * Process alert and execute matching actions
   */
  async processAlert(
    alert: AlertInstance,
    triggerType: TriggerType
  ): Promise<ActionExecution[]> {
    const matchingActions = this.findMatchingActions(alert, triggerType);
    const executions: ActionExecution[] = [];

    for (const action of matchingActions) {
      const trigger = action.triggers.find(t => t.type === triggerType);

      if (trigger?.delaySeconds && trigger.delaySeconds > 0) {
        // In a real implementation, this would schedule the action
        // For now, we execute immediately
      }

      const execution = await this.executeAction(action.id, alert, triggerType);
      executions.push(execution);
    }

    return executions;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): ActionExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * List executions
   */
  listExecutions(options?: {
    actionId?: string;
    alertId?: string;
    state?: ActionState[];
    limit?: number;
  }): ActionExecution[] {
    let executions = Array.from(this.executions.values());

    if (options?.actionId) {
      executions = executions.filter(e => e.actionId === options.actionId);
    }

    if (options?.alertId) {
      executions = executions.filter(e => e.alertId === options.alertId);
    }

    if (options?.state) {
      executions = executions.filter(e => options.state!.includes(e.state));
    }

    executions.sort((a, b) => b.startedAt - a.startedAt);

    if (options?.limit) {
      executions = executions.slice(0, options.limit);
    }

    return executions;
  }

  /**
   * Get audit log
   */
  getAuditLog(options?: {
    tenantId?: string;
    actionId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): ActionAuditEntry[] {
    let entries = [...this.auditLog];

    if (options?.tenantId) {
      entries = entries.filter(e => e.tenantId === options.tenantId);
    }

    if (options?.actionId) {
      entries = entries.filter(e => e.actionId === options.actionId);
    }

    if (options?.startTime) {
      entries = entries.filter(e => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      entries = entries.filter(e => e.timestamp <= options.endTime!);
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  // Private helper methods

  private createExecution(
    actionId: string,
    alertId: string | undefined,
    triggerType: TriggerType
  ): ActionExecution {
    const execution: ActionExecution = {
      id: `exec_${++this.executionCounter}`,
      actionId,
      alertId,
      triggerType,
      state: 'pending',
      startedAt: Date.now(),
      retryCount: 0,
    };
    this.executions.set(execution.id, execution);
    return execution;
  }

  private async performAction(
    action: ActionDefinition,
    alert?: AlertInstance
  ): Promise<ActionResult> {
    // Mock action execution based on type
    switch (action.type) {
      case 'webhook':
        return this.executeWebhook(action, alert);
      case 'email':
        return this.executeEmail(action, alert);
      case 'slack':
        return this.executeSlack(action, alert);
      case 'pagerduty':
        return this.executePagerDuty(action, alert);
      case 'scale':
        return this.executeScale(action);
      case 'restart':
        return this.executeRestart(action);
      case 'runbook':
        return this.executeRunbook(action, alert);
      case 'custom':
        return this.executeCustom(action, alert);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async executeWebhook(
    action: ActionDefinition,
    _alert?: AlertInstance
  ): Promise<ActionResult> {
    // Mock webhook execution
    return {
      statusCode: 200,
      responseBody: JSON.stringify({ success: true }),
      data: { url: action.config.webhookUrl },
    };
  }

  private async executeEmail(
    action: ActionDefinition,
    _alert?: AlertInstance
  ): Promise<ActionResult> {
    return {
      data: { to: action.config.emailTo, sent: true },
    };
  }

  private async executeSlack(
    action: ActionDefinition,
    _alert?: AlertInstance
  ): Promise<ActionResult> {
    return {
      statusCode: 200,
      data: { channel: action.config.slackWebhookUrl },
    };
  }

  private async executePagerDuty(
    action: ActionDefinition,
    _alert?: AlertInstance
  ): Promise<ActionResult> {
    return {
      data: { routingKey: action.config.pagerDutyRoutingKey, incident: 'created' },
    };
  }

  private async executeScale(action: ActionDefinition): Promise<ActionResult> {
    return {
      data: { target: action.config.scaleTarget, replicas: action.config.scaleReplicas },
    };
  }

  private async executeRestart(action: ActionDefinition): Promise<ActionResult> {
    return {
      data: { target: action.config.restartTarget, restarted: true },
    };
  }

  private async executeRunbook(
    action: ActionDefinition,
    _alert?: AlertInstance
  ): Promise<ActionResult> {
    return {
      data: { runbookId: action.config.runbookId, executed: true },
    };
  }

  private async executeCustom(
    action: ActionDefinition,
    _alert?: AlertInstance
  ): Promise<ActionResult> {
    return {
      data: { handler: action.config.customHandler, params: action.config.customParams },
    };
  }

  private checkRateLimit(actionId: string, config: ActionRateLimitConfig): boolean {
    const now = Date.now();
    const key = `ratelimit:${actionId}`;
    let window = this.rateLimitWindows.get(key);

    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + config.windowSeconds * 1000 };
      this.rateLimitWindows.set(key, window);
    }

    if (window.count >= config.maxActions) {
      return false;
    }

    window.count++;
    return true;
  }

  private checkCircuitBreaker(actionId: string, config: ActionCircuitBreakerConfig): boolean {
    const key = `circuit:${actionId}`;
    let circuit = this.circuitStates.get(key);

    if (!circuit) {
      circuit = { state: 'closed', failures: 0, successes: 0, lastFailure: 0 };
      this.circuitStates.set(key, circuit);
    }

    if (circuit.state === 'open') {
      const timeSinceFailure = Date.now() - circuit.lastFailure;
      if (timeSinceFailure >= config.resetTimeout * 1000) {
        circuit.state = 'half-open';
      } else {
        return false;
      }
    }

    return true;
  }

  private recordCircuitSuccess(actionId: string, config: ActionCircuitBreakerConfig): void {
    const key = `circuit:${actionId}`;
    const circuit = this.circuitStates.get(key);
    if (!circuit) return;

    circuit.successes++;
    circuit.failures = 0;

    if (circuit.state === 'half-open' && circuit.successes >= config.successThreshold) {
      circuit.state = 'closed';
      circuit.successes = 0;
    }
  }

  private recordCircuitFailure(actionId: string, config: ActionCircuitBreakerConfig): void {
    const key = `circuit:${actionId}`;
    const circuit = this.circuitStates.get(key);
    if (!circuit) return;

    circuit.failures++;
    circuit.successes = 0;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= config.failureThreshold) {
      circuit.state = 'open';
    }
  }

  private async retryExecution(
    execution: ActionExecution,
    action: ActionDefinition,
    alert: AlertInstance | undefined,
    triggerType: TriggerType,
    triggeredBy?: string
  ): Promise<void> {
    const config = action.retryConfig!;
    execution.retryCount++;

    const delay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, execution.retryCount - 1),
      config.maxDelayMs
    );

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const result = await this.performAction(action, alert);
      execution.state = 'completed';
      execution.result = result;
      execution.completedAt = Date.now();
      execution.durationMs = execution.completedAt - execution.startedAt;
      this.logAudit(action, execution, triggeredBy);
    } catch (error) {
      if (execution.retryCount < config.maxAttempts) {
        await this.retryExecution(execution, action, alert, triggerType, triggeredBy);
      }
    }
  }

  private logAudit(
    action: ActionDefinition,
    execution: ActionExecution,
    triggeredBy?: string
  ): void {
    this.auditLog.push({
      id: `audit_${++this.auditCounter}`,
      timestamp: Date.now(),
      actionId: action.id,
      actionName: action.name,
      executionId: execution.id,
      tenantId: action.tenantId,
      triggerType: execution.triggerType,
      alertId: execution.alertId,
      state: execution.state,
      durationMs: execution.durationMs,
      error: execution.error,
      triggeredBy,
    });
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const ActionConfigSchema = z.object({
  webhookUrl: z.string().url().optional(),
  webhookMethod: z.enum(['GET', 'POST', 'PUT']).optional(),
  webhookHeaders: z.record(z.string()).optional(),
  webhookBody: z.string().optional(),
  emailTo: z.array(z.string().email()).optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  slackWebhookUrl: z.string().url().optional(),
  slackMessage: z.string().optional(),
  pagerDutyRoutingKey: z.string().optional(),
  pagerDutySeverity: z.enum(['critical', 'error', 'warning', 'info']).optional(),
  scaleTarget: z.string().optional(),
  scaleReplicas: z.number().int().positive().optional(),
  restartTarget: z.string().optional(),
  runbookId: z.string().optional(),
  runbookParams: z.record(z.string()).optional(),
  customHandler: z.string().optional(),
  customParams: z.record(z.unknown()).optional(),
});

export const ActionTriggerSchema = z.object({
  type: z.enum([
    'alert_firing', 'alert_resolved', 'alert_escalated',
    'threshold_breach', 'schedule', 'manual',
  ]),
  severityFilter: z.array(z.enum(['info', 'warning', 'critical', 'emergency'])).optional(),
  ruleFilter: z.array(z.string()).optional(),
  labelFilter: z.record(z.string()).optional(),
  delaySeconds: z.number().int().nonnegative().optional(),
  schedule: z.string().optional(),
});

export const ActionRateLimitConfigSchema = z.object({
  maxActions: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
  onLimited: z.enum(['drop', 'queue', 'error']),
});

export const ActionCircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive(),
  successThreshold: z.number().int().positive(),
  halfOpenTimeout: z.number().int().positive(),
  resetTimeout: z.number().int().positive(),
});

export const ActionRetryConfigSchema = z.object({
  maxAttempts: z.number().int().positive().max(10),
  initialDelayMs: z.number().int().positive(),
  maxDelayMs: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
});

export const ActionDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tenantId: z.string().min(1),
  type: z.enum(['webhook', 'email', 'slack', 'pagerduty', 'scale', 'restart', 'runbook', 'custom']),
  config: ActionConfigSchema,
  triggers: z.array(ActionTriggerSchema).min(1),
  rateLimit: ActionRateLimitConfigSchema.optional(),
  circuitBreaker: ActionCircuitBreakerConfigSchema.optional(),
  retryConfig: ActionRetryConfigSchema.optional(),
  enabled: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const EscalationTargetSchema = z.object({
  type: z.enum(['user', 'team', 'channel', 'schedule']),
  id: z.string().min(1),
  name: z.string().min(1),
});

export const EscalationLevelSchema = z.object({
  level: z.number().int().positive(),
  delaySeconds: z.number().int().nonnegative(),
  targets: z.array(EscalationTargetSchema).min(1),
});

export const EscalationPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tenantId: z.string().min(1),
  levels: z.array(EscalationLevelSchema).min(1),
  repeatInterval: z.number().int().nonnegative(),
  maxEscalations: z.number().int().positive(),
  notifyPreviousLevels: z.boolean(),
  enabled: z.boolean(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateActionDefinition(
  action: unknown
): { success: boolean; data?: ActionDefinition; errors?: string[] } {
  const result = ActionDefinitionSchema.safeParse(action);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateEscalationPolicy(
  policy: unknown
): { success: boolean; data?: EscalationPolicy; errors?: string[] } {
  const result = EscalationPolicySchema.safeParse(policy);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create action definition
 */
export function createActionDefinition(
  params: Pick<ActionDefinition, 'name' | 'tenantId' | 'type' | 'config' | 'triggers'> &
    Partial<ActionDefinition>
): Omit<ActionDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    enabled: true,
    ...params,
  };
}

/**
 * Create action trigger
 */
export function createActionTrigger(
  params: Pick<ActionTrigger, 'type'> & Partial<ActionTrigger>
): ActionTrigger {
  return {
    ...params,
  };
}

/**
 * Create escalation policy
 */
export function createEscalationPolicy(
  params: Pick<EscalationPolicy, 'name' | 'tenantId' | 'levels'> &
    Partial<EscalationPolicy>
): Omit<EscalationPolicy, 'id'> {
  return {
    repeatInterval: 0,
    maxEscalations: 3,
    notifyPreviousLevels: false,
    enabled: true,
    ...params,
  };
}

/**
 * Create an auto-actions engine instance
 */
export function createAutoActionsEngine(): AutoActionsEngine {
  return new AutoActionsEngine();
}
