/**
 * Phase 59: Alerts Engine
 *
 * Comprehensive alerting system:
 * - Threshold-based alerts (above/below/change/range)
 * - Anomaly alerts (z-score, forecast deviation)
 * - Alert severity levels and escalation
 * - Alert state management (firing, pending, resolved)
 * - Alert grouping and deduplication
 * - Notification routing
 *
 * @module @gwi/core/alerts
 */

import { z } from 'zod';
import type { CanonicalPoint } from '../time-series/index.js';

// =============================================================================
// ALERTS CONTRACT VERSION
// =============================================================================

export const ALERTS_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const AlertsErrorCodes = {
  // Config errors (1xxx)
  INVALID_RULE: 'AL_1001',
  INVALID_CONDITION: 'AL_1002',
  INVALID_THRESHOLD: 'AL_1003',
  INVALID_SEVERITY: 'AL_1004',

  // Evaluation errors (2xxx)
  EVALUATION_FAILED: 'AL_2001',
  INSUFFICIENT_DATA: 'AL_2002',
  SERIES_NOT_FOUND: 'AL_2003',
  TIMEOUT: 'AL_2004',

  // State errors (3xxx)
  STATE_TRANSITION_INVALID: 'AL_3001',
  DUPLICATE_ALERT: 'AL_3002',
  ALERT_NOT_FOUND: 'AL_3003',
  ALREADY_ACKNOWLEDGED: 'AL_3004',

  // Notification errors (4xxx)
  NOTIFICATION_FAILED: 'AL_4001',
  CHANNEL_NOT_CONFIGURED: 'AL_4002',
  RATE_LIMITED: 'AL_4003',
  DELIVERY_FAILED: 'AL_4004',
} as const;

export type AlertsErrorCode = (typeof AlertsErrorCodes)[keyof typeof AlertsErrorCodes];

// =============================================================================
// ALERT TYPES
// =============================================================================

export type AlertRuleSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export type AlertState = 'inactive' | 'pending' | 'firing' | 'resolved' | 'acknowledged';

export type AlertConditionType =
  | 'threshold_above'
  | 'threshold_below'
  | 'threshold_range'
  | 'change_absolute'
  | 'change_percent'
  | 'anomaly_zscore'
  | 'anomaly_forecast'
  | 'missing_data'
  | 'custom';

export type AggregationWindow = '1m' | '5m' | '15m' | '1h' | '6h' | '24h';

// =============================================================================
// ALERT RULE
// =============================================================================

export interface AlertRuleDefinition {
  /** Unique rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description?: string;
  /** Tenant ID */
  tenantId: string;
  /** Series IDs to monitor */
  seriesIds: string[];
  /** Alert condition */
  condition: AlertCondition;
  /** Alert severity */
  severity: AlertRuleSeverity;
  /** Evaluation interval in seconds */
  evaluationInterval: number;
  /** For duration before firing */
  forDuration: number;
  /** Labels for routing */
  labels: Record<string, string>;
  /** Annotations for templates */
  annotations: Record<string, string>;
  /** Whether rule is enabled */
  enabled: boolean;
  /** Notification channels */
  notificationChannels: string[];
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface AlertCondition {
  /** Condition type */
  type: AlertConditionType;
  /** Threshold value (for threshold conditions) */
  threshold?: number;
  /** Upper threshold (for range) */
  upperThreshold?: number;
  /** Lower threshold (for range) */
  lowerThreshold?: number;
  /** Change value (for change conditions) */
  changeValue?: number;
  /** Z-score threshold (for anomaly) */
  zScoreThreshold?: number;
  /** Forecast deviation multiplier */
  forecastDeviationMultiplier?: number;
  /** Aggregation window */
  aggregationWindow: AggregationWindow;
  /** Aggregation function */
  aggregation: 'avg' | 'min' | 'max' | 'sum' | 'count' | 'last';
  /** Custom expression (for custom type) */
  customExpression?: string;
}

// =============================================================================
// ALERT INSTANCE
// =============================================================================

export interface AlertInstance {
  /** Unique instance ID */
  id: string;
  /** Rule ID that generated this alert */
  ruleId: string;
  /** Series ID */
  seriesId: string;
  /** Current state */
  state: AlertState;
  /** Severity */
  severity: AlertRuleSeverity;
  /** Current value that triggered alert */
  value: number;
  /** Threshold that was breached */
  threshold: number;
  /** Alert message */
  message: string;
  /** Labels (copied from rule + series) */
  labels: Record<string, string>;
  /** Annotations (rendered from templates) */
  annotations: Record<string, string>;
  /** When alert started */
  startsAt: number;
  /** When alert ended (if resolved) */
  endsAt?: number;
  /** When alert was acknowledged */
  acknowledgedAt?: number;
  /** Who acknowledged */
  acknowledgedBy?: string;
  /** Fingerprint for deduplication */
  fingerprint: string;
  /** Number of times fired */
  firedCount: number;
  /** Last evaluation timestamp */
  lastEvaluatedAt: number;
}

// =============================================================================
// ALERT HISTORY
// =============================================================================

export interface AlertHistoryEntry {
  /** Entry ID */
  id: string;
  /** Alert instance ID */
  alertId: string;
  /** Timestamp */
  timestamp: number;
  /** State transition */
  fromState: AlertState;
  /** New state */
  toState: AlertState;
  /** Value at transition */
  value?: number;
  /** Reason for transition */
  reason: string;
  /** User who triggered (if manual) */
  triggeredBy?: string;
}

// =============================================================================
// NOTIFICATION CHANNEL
// =============================================================================

export type NotificationChannelType = 'email' | 'slack' | 'pagerduty' | 'webhook' | 'sms';

export interface NotificationChannel {
  /** Channel ID */
  id: string;
  /** Channel name */
  name: string;
  /** Channel type */
  type: NotificationChannelType;
  /** Configuration */
  config: AlertNotificationConfig;
  /** Severity filter (only send for these severities) */
  severityFilter?: AlertRuleSeverity[];
  /** Enabled */
  enabled: boolean;
}

export interface AlertNotificationConfig {
  // Email
  emailAddresses?: string[];
  // Slack
  slackWebhookUrl?: string;
  slackChannel?: string;
  // PagerDuty
  pagerDutyRoutingKey?: string;
  // Webhook
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  // SMS
  phoneNumbers?: string[];
}

// =============================================================================
// ALERTS ENGINE
// =============================================================================

/**
 * Alerts engine for evaluating rules and managing alert state
 */
export class AlertsEngine {
  private rules: Map<string, AlertRuleDefinition> = new Map();
  private alerts: Map<string, AlertInstance> = new Map();
  private channels: Map<string, NotificationChannel> = new Map();
  private history: AlertHistoryEntry[] = [];
  private ruleCounter = 0;
  private alertCounter = 0;
  private historyCounter = 0;

  /**
   * Create a new alert rule
   */
  createRule(
    rule: Omit<AlertRuleDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): AlertRuleDefinition {
    const newRule: AlertRuleDefinition = {
      ...rule,
      id: `rule_${++this.ruleCounter}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.rules.set(newRule.id, newRule);
    return newRule;
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): AlertRuleDefinition | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * List rules for a tenant
   */
  listRules(tenantId: string): AlertRuleDefinition[] {
    return Array.from(this.rules.values()).filter(r => r.tenantId === tenantId);
  }

  /**
   * Update a rule
   */
  updateRule(
    ruleId: string,
    updates: Partial<Omit<AlertRuleDefinition, 'id' | 'createdAt'>>
  ): AlertRuleDefinition | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule) return undefined;

    const updated = {
      ...rule,
      ...updates,
      updatedAt: Date.now(),
    };
    this.rules.set(ruleId, updated);
    return updated;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Evaluate a rule against data points
   */
  evaluateRule(rule: AlertRuleDefinition, points: CanonicalPoint[]): AlertEvaluation {
    const now = Date.now();
    const windowMs = this.getWindowMs(rule.condition.aggregationWindow);
    const windowPoints = points.filter(
      p => p.timestamp >= now - windowMs && typeof p.value === 'number'
    );

    if (windowPoints.length === 0) {
      return {
        ruleId: rule.id,
        triggered: rule.condition.type === 'missing_data',
        value: 0,
        threshold: rule.condition.threshold ?? 0,
        evaluatedAt: now,
        reason: windowPoints.length === 0 ? 'No data in window' : 'Evaluation complete',
      };
    }

    const values = windowPoints.map(p => p.value as number);
    const aggregatedValue = this.aggregateValues(values, rule.condition.aggregation);

    let triggered = false;
    let threshold = rule.condition.threshold ?? 0;

    switch (rule.condition.type) {
      case 'threshold_above':
        triggered = aggregatedValue > threshold;
        break;

      case 'threshold_below':
        triggered = aggregatedValue < threshold;
        break;

      case 'threshold_range':
        const lower = rule.condition.lowerThreshold ?? 0;
        const upper = rule.condition.upperThreshold ?? 100;
        triggered = aggregatedValue < lower || aggregatedValue > upper;
        threshold = aggregatedValue < lower ? lower : upper;
        break;

      case 'change_absolute':
        if (values.length >= 2) {
          const change = Math.abs(values[values.length - 1] - values[0]);
          triggered = change > (rule.condition.changeValue ?? 0);
          threshold = rule.condition.changeValue ?? 0;
        }
        break;

      case 'change_percent':
        if (values.length >= 2 && values[0] !== 0) {
          const percentChange = Math.abs((values[values.length - 1] - values[0]) / values[0]) * 100;
          triggered = percentChange > (rule.condition.changeValue ?? 0);
          threshold = rule.condition.changeValue ?? 0;
        }
        break;

      case 'anomaly_zscore':
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
        if (std > 0) {
          const lastValue = values[values.length - 1];
          const zScore = Math.abs((lastValue - mean) / std);
          triggered = zScore > (rule.condition.zScoreThreshold ?? 3);
          threshold = rule.condition.zScoreThreshold ?? 3;
        }
        break;

      case 'anomaly_forecast':
        // Simplified: just check if latest value deviates significantly from mean
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        const deviation = Math.abs(values[values.length - 1] - avg);
        const multiplier = rule.condition.forecastDeviationMultiplier ?? 2;
        const stdDev = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
        triggered = deviation > multiplier * stdDev;
        threshold = multiplier * stdDev;
        break;

      case 'missing_data':
        triggered = windowPoints.length === 0;
        break;
    }

    return {
      ruleId: rule.id,
      triggered,
      value: aggregatedValue,
      threshold,
      evaluatedAt: now,
      reason: triggered ? `Condition ${rule.condition.type} met` : 'Condition not met',
    };
  }

  /**
   * Process evaluation result and manage alert state
   */
  processEvaluation(
    rule: AlertRuleDefinition,
    seriesId: string,
    evaluation: AlertEvaluation
  ): AlertInstance | undefined {
    const fingerprint = this.generateFingerprint(rule.id, seriesId);
    const existing = Array.from(this.alerts.values()).find(
      a => a.fingerprint === fingerprint
    );

    if (evaluation.triggered) {
      if (existing) {
        // Update existing alert
        if (existing.state === 'pending' || existing.state === 'inactive') {
          // Check if forDuration has passed
          const duration = Date.now() - existing.startsAt;
          if (duration >= rule.forDuration * 1000) {
            this.transitionAlert(existing, 'firing', 'Duration threshold exceeded');
          }
        }
        existing.value = evaluation.value;
        existing.lastEvaluatedAt = evaluation.evaluatedAt;
        existing.firedCount++;
        return existing;
      } else {
        // Create new alert
        const alert = this.createAlert(rule, seriesId, evaluation);
        return alert;
      }
    } else {
      if (existing && (existing.state === 'firing' || existing.state === 'pending')) {
        this.transitionAlert(existing, 'resolved', 'Condition no longer met');
        existing.endsAt = Date.now();
        return existing;
      }
    }

    return existing;
  }

  /**
   * Create a new alert instance
   */
  private createAlert(
    rule: AlertRuleDefinition,
    seriesId: string,
    evaluation: AlertEvaluation
  ): AlertInstance {
    const now = Date.now();
    const alert: AlertInstance = {
      id: `alert_${++this.alertCounter}`,
      ruleId: rule.id,
      seriesId,
      state: rule.forDuration > 0 ? 'pending' : 'firing',
      severity: rule.severity,
      value: evaluation.value,
      threshold: evaluation.threshold,
      message: this.renderTemplate(
        rule.annotations['summary'] ?? `Alert triggered for ${rule.name}`,
        { value: evaluation.value, threshold: evaluation.threshold, seriesId }
      ),
      labels: { ...rule.labels, seriesId },
      annotations: Object.fromEntries(
        Object.entries(rule.annotations).map(([k, v]) => [
          k,
          this.renderTemplate(v, { value: evaluation.value, threshold: evaluation.threshold, seriesId }),
        ])
      ),
      startsAt: now,
      fingerprint: this.generateFingerprint(rule.id, seriesId),
      firedCount: 1,
      lastEvaluatedAt: now,
    };

    this.alerts.set(alert.id, alert);
    this.addHistory(alert.id, 'inactive', alert.state, evaluation.value, 'Alert created');

    return alert;
  }

  /**
   * Transition alert to new state
   */
  private transitionAlert(
    alert: AlertInstance,
    newState: AlertState,
    reason: string,
    triggeredBy?: string
  ): void {
    const oldState = alert.state;
    alert.state = newState;
    this.addHistory(alert.id, oldState, newState, alert.value, reason, triggeredBy);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId: string): AlertInstance | undefined {
    const alert = this.alerts.get(alertId);
    if (!alert) return undefined;

    if (alert.state === 'acknowledged') {
      return alert; // Already acknowledged
    }

    this.transitionAlert(alert, 'acknowledged', 'Acknowledged by user', userId);
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = userId;

    return alert;
  }

  /**
   * Get an alert by ID
   */
  getAlert(alertId: string): AlertInstance | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * List alerts for a tenant (via rule tenant)
   */
  listAlerts(tenantId: string, options?: {
    state?: AlertState[];
    severity?: AlertRuleSeverity[];
    limit?: number;
  }): AlertInstance[] {
    const tenantRuleIds = new Set(
      this.listRules(tenantId).map(r => r.id)
    );

    let alerts = Array.from(this.alerts.values()).filter(
      a => tenantRuleIds.has(a.ruleId)
    );

    if (options?.state) {
      alerts = alerts.filter(a => options.state!.includes(a.state));
    }

    if (options?.severity) {
      alerts = alerts.filter(a => options.severity!.includes(a.severity));
    }

    alerts.sort((a, b) => b.startsAt - a.startsAt);

    if (options?.limit) {
      alerts = alerts.slice(0, options.limit);
    }

    return alerts;
  }

  /**
   * Get alert history
   */
  getAlertHistory(alertId: string, limit = 100): AlertHistoryEntry[] {
    return this.history
      .filter(h => h.alertId === alertId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Register a notification channel
   */
  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.id, channel);
  }

  /**
   * Get notification channel
   */
  getChannel(channelId: string): NotificationChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * List channels
   */
  listChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Send notification for an alert (mock)
   */
  async sendNotification(
    alert: AlertInstance,
    rule: AlertRuleDefinition
  ): Promise<AlertNotificationResult[]> {
    const results: AlertNotificationResult[] = [];

    for (const channelId of rule.notificationChannels) {
      const channel = this.channels.get(channelId);
      if (!channel || !channel.enabled) continue;

      if (channel.severityFilter && !channel.severityFilter.includes(alert.severity)) {
        continue;
      }

      // Mock notification sending
      results.push({
        channelId,
        success: true,
        timestamp: Date.now(),
        messageId: `msg_${Date.now()}_${channelId}`,
      });
    }

    return results;
  }

  // Helper methods

  private getWindowMs(window: AggregationWindow): number {
    const map: Record<AggregationWindow, number> = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '6h': 21600000,
      '24h': 86400000,
    };
    return map[window];
  }

  private aggregateValues(values: number[], aggregation: string): number {
    if (values.length === 0) return 0;

    switch (aggregation) {
      case 'avg':
        return values.reduce((s, v) => s + v, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'sum':
        return values.reduce((s, v) => s + v, 0);
      case 'count':
        return values.length;
      case 'last':
        return values[values.length - 1];
      default:
        return values[values.length - 1];
    }
  }

  private generateFingerprint(ruleId: string, seriesId: string): string {
    return `${ruleId}:${seriesId}`;
  }

  private renderTemplate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`
    );
  }

  private addHistory(
    alertId: string,
    fromState: AlertState,
    toState: AlertState,
    value: number | undefined,
    reason: string,
    triggeredBy?: string
  ): void {
    this.history.push({
      id: `history_${++this.historyCounter}`,
      alertId,
      timestamp: Date.now(),
      fromState,
      toState,
      value,
      reason,
      triggeredBy,
    });
  }
}

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface AlertEvaluation {
  /** Rule ID */
  ruleId: string;
  /** Whether condition triggered */
  triggered: boolean;
  /** Current value */
  value: number;
  /** Threshold that was compared */
  threshold: number;
  /** Evaluation timestamp */
  evaluatedAt: number;
  /** Reason/description */
  reason: string;
}

export interface AlertNotificationResult {
  /** Channel ID */
  channelId: string;
  /** Whether send succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: number;
  /** Message ID (if available) */
  messageId?: string;
  /** Error message (if failed) */
  error?: string;
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const AlertConditionSchema = z.object({
  type: z.enum([
    'threshold_above', 'threshold_below', 'threshold_range',
    'change_absolute', 'change_percent',
    'anomaly_zscore', 'anomaly_forecast',
    'missing_data', 'custom',
  ]),
  threshold: z.number().optional(),
  upperThreshold: z.number().optional(),
  lowerThreshold: z.number().optional(),
  changeValue: z.number().optional(),
  zScoreThreshold: z.number().optional(),
  forecastDeviationMultiplier: z.number().optional(),
  aggregationWindow: z.enum(['1m', '5m', '15m', '1h', '6h', '24h']),
  aggregation: z.enum(['avg', 'min', 'max', 'sum', 'count', 'last']),
  customExpression: z.string().optional(),
});

export const AlertRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tenantId: z.string().min(1),
  seriesIds: z.array(z.string()).min(1),
  condition: AlertConditionSchema,
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  evaluationInterval: z.number().int().positive(),
  forDuration: z.number().int().nonnegative(),
  labels: z.record(z.string()),
  annotations: z.record(z.string()),
  enabled: z.boolean(),
  notificationChannels: z.array(z.string()),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const NotificationChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['email', 'slack', 'pagerduty', 'webhook', 'sms']),
  config: z.object({
    emailAddresses: z.array(z.string().email()).optional(),
    slackWebhookUrl: z.string().url().optional(),
    slackChannel: z.string().optional(),
    pagerDutyRoutingKey: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    webhookHeaders: z.record(z.string()).optional(),
    phoneNumbers: z.array(z.string()).optional(),
  }),
  severityFilter: z.array(z.enum(['info', 'warning', 'critical', 'emergency'])).optional(),
  enabled: z.boolean(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateAlertRule(
  rule: unknown
): { success: boolean; data?: AlertRuleDefinition; errors?: string[] } {
  const result = AlertRuleSchema.safeParse(rule);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateAlertCondition(
  condition: unknown
): { success: boolean; data?: AlertCondition; errors?: string[] } {
  const result = AlertConditionSchema.safeParse(condition);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateNotificationChannel(
  channel: unknown
): { success: boolean; data?: NotificationChannel; errors?: string[] } {
  const result = NotificationChannelSchema.safeParse(channel);
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
 * Create default alert condition
 */
export function createAlertCondition(
  params: Partial<AlertCondition> & Pick<AlertCondition, 'type'>
): AlertCondition {
  return {
    aggregationWindow: '5m',
    aggregation: 'avg',
    ...params,
  };
}

/**
 * Create default alert rule
 */
export function createAlertRule(
  params: Pick<AlertRuleDefinition, 'name' | 'tenantId' | 'seriesIds' | 'condition' | 'severity'> &
    Partial<AlertRuleDefinition>
): Omit<AlertRuleDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    evaluationInterval: 60,
    forDuration: 0,
    labels: {},
    annotations: {},
    enabled: true,
    notificationChannels: [],
    ...params,
  };
}

/**
 * Create default notification channel
 */
export function createNotificationChannel(
  params: Pick<NotificationChannel, 'name' | 'type' | 'config'> &
    Partial<NotificationChannel>
): Omit<NotificationChannel, 'id'> {
  return {
    enabled: true,
    ...params,
  };
}

/**
 * Create an alerts engine instance
 */
export function createAlertsEngine(): AlertsEngine {
  return new AlertsEngine();
}
