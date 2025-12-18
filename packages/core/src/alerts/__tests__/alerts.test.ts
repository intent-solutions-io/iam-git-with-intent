/**
 * Tests for Phase 59: Alerts Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALERTS_VERSION,
  AlertsErrorCodes,
  AlertsEngine,
  createAlertsEngine,
  createAlertRule,
  createAlertCondition,
  createNotificationChannel,
  validateAlertRule,
  validateAlertCondition,
  validateNotificationChannel,
  AlertRuleSchema,
  AlertConditionSchema,
  NotificationChannelSchema,
  type AlertRuleDefinition,
  type AlertCondition,
  type AlertInstance,
  type AlertRuleSeverity,
  type AlertState,
  type AlertConditionType,
  type NotificationChannel,
} from '../index.js';
import type { CanonicalPoint } from '../../time-series/index.js';

describe('Alerts Module', () => {
  describe('Version and Constants', () => {
    it('should export version', () => {
      expect(ALERTS_VERSION).toBe('1.0.0');
    });

    it('should export error codes', () => {
      expect(AlertsErrorCodes.INVALID_RULE).toBe('AL_1001');
      expect(AlertsErrorCodes.EVALUATION_FAILED).toBe('AL_2001');
      expect(AlertsErrorCodes.STATE_TRANSITION_INVALID).toBe('AL_3001');
      expect(AlertsErrorCodes.NOTIFICATION_FAILED).toBe('AL_4001');
    });
  });

  describe('AlertCondition Validation', () => {
    it('should validate valid threshold above condition', () => {
      const condition = createAlertCondition({
        type: 'threshold_above',
        threshold: 80,
      });
      const result = validateAlertCondition(condition);
      expect(result.success).toBe(true);
    });

    it('should validate valid range condition', () => {
      const condition = createAlertCondition({
        type: 'threshold_range',
        lowerThreshold: 20,
        upperThreshold: 80,
      });
      const result = validateAlertCondition(condition);
      expect(result.success).toBe(true);
    });

    it('should validate valid zscore condition', () => {
      const condition = createAlertCondition({
        type: 'anomaly_zscore',
        zScoreThreshold: 3,
      });
      const result = validateAlertCondition(condition);
      expect(result.success).toBe(true);
    });

    it('should reject invalid condition type', () => {
      const condition = { ...createAlertCondition({ type: 'threshold_above' }), type: 'invalid' };
      const result = validateAlertCondition(condition);
      expect(result.success).toBe(false);
    });
  });

  describe('AlertRule Validation', () => {
    it('should validate valid alert rule', () => {
      const condition = createAlertCondition({ type: 'threshold_above', threshold: 80 });
      const rule = createAlertRule({
        name: 'High CPU',
        tenantId: 'tenant_1',
        seriesIds: ['cpu_usage'],
        condition,
        severity: 'warning',
      });
      const fullRule = {
        ...rule,
        id: 'rule_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateAlertRule(fullRule);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const condition = createAlertCondition({ type: 'threshold_above' });
      const rule = {
        ...createAlertRule({
          name: '',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        }),
        id: 'rule_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateAlertRule(rule);
      expect(result.success).toBe(false);
    });

    it('should reject empty seriesIds', () => {
      const condition = createAlertCondition({ type: 'threshold_above' });
      const rule = {
        ...createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: [],
          condition,
          severity: 'warning',
        }),
        id: 'rule_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateAlertRule(rule);
      expect(result.success).toBe(false);
    });
  });

  describe('NotificationChannel Validation', () => {
    it('should validate valid email channel', () => {
      const channel = {
        id: 'channel_1',
        name: 'Email Team',
        type: 'email' as const,
        config: { emailAddresses: ['team@example.com'] },
        enabled: true,
      };
      const result = validateNotificationChannel(channel);
      expect(result.success).toBe(true);
    });

    it('should validate valid webhook channel', () => {
      const channel = {
        id: 'channel_1',
        name: 'Webhook',
        type: 'webhook' as const,
        config: { webhookUrl: 'https://example.com/hook' },
        enabled: true,
      };
      const result = validateNotificationChannel(channel);
      expect(result.success).toBe(true);
    });

    it('should validate with severity filter', () => {
      const channel = {
        id: 'channel_1',
        name: 'Critical Only',
        type: 'slack' as const,
        config: { slackWebhookUrl: 'https://hooks.slack.com/xxx' },
        severityFilter: ['critical', 'emergency'] as AlertRuleSeverity[],
        enabled: true,
      };
      const result = validateNotificationChannel(channel);
      expect(result.success).toBe(true);
    });
  });

  describe('createAlertCondition', () => {
    it('should create default condition', () => {
      const condition = createAlertCondition({ type: 'threshold_above' });
      expect(condition.type).toBe('threshold_above');
      expect(condition.aggregationWindow).toBe('5m');
      expect(condition.aggregation).toBe('avg');
    });

    it('should override defaults', () => {
      const condition = createAlertCondition({
        type: 'threshold_below',
        threshold: 10,
        aggregationWindow: '1h',
        aggregation: 'min',
      });
      expect(condition.type).toBe('threshold_below');
      expect(condition.threshold).toBe(10);
      expect(condition.aggregationWindow).toBe('1h');
      expect(condition.aggregation).toBe('min');
    });
  });

  describe('createAlertRule', () => {
    it('should create default rule', () => {
      const condition = createAlertCondition({ type: 'threshold_above', threshold: 90 });
      const rule = createAlertRule({
        name: 'High Memory',
        tenantId: 'tenant_1',
        seriesIds: ['memory_usage'],
        condition,
        severity: 'critical',
      });
      expect(rule.name).toBe('High Memory');
      expect(rule.evaluationInterval).toBe(60);
      expect(rule.forDuration).toBe(0);
      expect(rule.enabled).toBe(true);
      expect(rule.labels).toEqual({});
      expect(rule.annotations).toEqual({});
    });

    it('should override defaults', () => {
      const condition = createAlertCondition({ type: 'threshold_above' });
      const rule = createAlertRule({
        name: 'Custom Rule',
        tenantId: 'tenant_1',
        seriesIds: ['metric_1'],
        condition,
        severity: 'warning',
        evaluationInterval: 30,
        forDuration: 300,
        labels: { team: 'platform' },
      });
      expect(rule.evaluationInterval).toBe(30);
      expect(rule.forDuration).toBe(300);
      expect(rule.labels).toEqual({ team: 'platform' });
    });
  });

  describe('createAlertsEngine', () => {
    it('should create an alerts engine instance', () => {
      const engine = createAlertsEngine();
      expect(engine).toBeInstanceOf(AlertsEngine);
    });
  });

  describe('AlertsEngine', () => {
    let engine: AlertsEngine;

    beforeEach(() => {
      engine = createAlertsEngine();
    });

    describe('Rule Management', () => {
      it('should create a rule', () => {
        const condition = createAlertCondition({ type: 'threshold_above', threshold: 80 });
        const ruleInput = createAlertRule({
          name: 'Test Rule',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);
        expect(rule.id).toMatch(/^rule_\d+$/);
        expect(rule.name).toBe('Test Rule');
        expect(rule.createdAt).toBeGreaterThan(0);
      });

      it('should get a rule by ID', () => {
        const condition = createAlertCondition({ type: 'threshold_above' });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'info',
        });
        const created = engine.createRule(ruleInput);
        const retrieved = engine.getRule(created.id);
        expect(retrieved).toEqual(created);
      });

      it('should list rules for a tenant', () => {
        const condition = createAlertCondition({ type: 'threshold_above' });
        engine.createRule(createAlertRule({
          name: 'Rule 1',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        }));
        engine.createRule(createAlertRule({
          name: 'Rule 2',
          tenantId: 'tenant_1',
          seriesIds: ['memory'],
          condition,
          severity: 'critical',
        }));
        engine.createRule(createAlertRule({
          name: 'Rule 3',
          tenantId: 'tenant_2',
          seriesIds: ['disk'],
          condition,
          severity: 'info',
        }));

        const tenant1Rules = engine.listRules('tenant_1');
        expect(tenant1Rules).toHaveLength(2);

        const tenant2Rules = engine.listRules('tenant_2');
        expect(tenant2Rules).toHaveLength(1);
      });

      it('should update a rule', () => {
        const condition = createAlertCondition({ type: 'threshold_above', threshold: 80 });
        const ruleInput = createAlertRule({
          name: 'Original',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const created = engine.createRule(ruleInput);
        const updated = engine.updateRule(created.id, { name: 'Updated' });

        expect(updated).toBeDefined();
        expect(updated!.name).toBe('Updated');
        expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
      });

      it('should delete a rule', () => {
        const condition = createAlertCondition({ type: 'threshold_above' });
        const ruleInput = createAlertRule({
          name: 'To Delete',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'info',
        });
        const created = engine.createRule(ruleInput);
        const deleted = engine.deleteRule(created.id);
        expect(deleted).toBe(true);

        const retrieved = engine.getRule(created.id);
        expect(retrieved).toBeUndefined();
      });
    });

    describe('Rule Evaluation', () => {
      it('should trigger threshold_above alert', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'High CPU',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 30000, value: 85, quality: 'good' },
          { timestamp: now - 20000, value: 90, quality: 'good' },
          { timestamp: now - 10000, value: 95, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(true);
        expect(evaluation.value).toBeGreaterThan(80);
      });

      it('should not trigger threshold_above when below', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'High CPU',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 30000, value: 50, quality: 'good' },
          { timestamp: now - 20000, value: 55, quality: 'good' },
          { timestamp: now - 10000, value: 60, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(false);
      });

      it('should trigger threshold_below alert', () => {
        const condition = createAlertCondition({
          type: 'threshold_below',
          threshold: 20,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Low Disk',
          tenantId: 'tenant_1',
          seriesIds: ['disk_free'],
          condition,
          severity: 'critical',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 30000, value: 10, quality: 'good' },
          { timestamp: now - 20000, value: 8, quality: 'good' },
          { timestamp: now - 10000, value: 5, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(true);
      });

      it('should trigger threshold_range alert outside range', () => {
        const condition = createAlertCondition({
          type: 'threshold_range',
          lowerThreshold: 30,
          upperThreshold: 70,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Out of Range',
          tenantId: 'tenant_1',
          seriesIds: ['temp'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 30000, value: 85, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(true);
      });

      it('should trigger change_absolute alert', () => {
        const condition = createAlertCondition({
          type: 'change_absolute',
          changeValue: 20,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Big Change',
          tenantId: 'tenant_1',
          seriesIds: ['requests'],
          condition,
          severity: 'info',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 30000, value: 100, quality: 'good' },
          { timestamp: now - 10000, value: 150, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(true);
      });

      it('should trigger change_percent alert', () => {
        const condition = createAlertCondition({
          type: 'change_percent',
          changeValue: 50, // 50% change
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Percent Change',
          tenantId: 'tenant_1',
          seriesIds: ['metric'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 30000, value: 100, quality: 'good' },
          { timestamp: now - 10000, value: 200, quality: 'good' }, // 100% change
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(true);
      });

      it('should trigger anomaly_zscore alert', () => {
        const condition = createAlertCondition({
          type: 'anomaly_zscore',
          zScoreThreshold: 2,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Z-Score Anomaly',
          tenantId: 'tenant_1',
          seriesIds: ['latency'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        // More data points to establish stable mean/std, then clear anomaly
        // Mean of first 9 values = 50, std ~1.5, so 200 is a massive outlier (~100 std devs)
        const points: CanonicalPoint[] = [
          { timestamp: now - 55000, value: 49, quality: 'good' },
          { timestamp: now - 50000, value: 50, quality: 'good' },
          { timestamp: now - 45000, value: 51, quality: 'good' },
          { timestamp: now - 40000, value: 50, quality: 'good' },
          { timestamp: now - 35000, value: 49, quality: 'good' },
          { timestamp: now - 30000, value: 51, quality: 'good' },
          { timestamp: now - 25000, value: 50, quality: 'good' },
          { timestamp: now - 20000, value: 49, quality: 'good' },
          { timestamp: now - 15000, value: 51, quality: 'good' },
          { timestamp: now - 10000, value: 200, quality: 'good' }, // Clear anomaly
        ];

        const evaluation = engine.evaluateRule(rule, points);
        expect(evaluation.triggered).toBe(true);
      });

      it('should handle missing_data condition', () => {
        const condition = createAlertCondition({
          type: 'missing_data',
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'No Data',
          tenantId: 'tenant_1',
          seriesIds: ['metric'],
          condition,
          severity: 'critical',
        });
        const rule = engine.createRule(ruleInput);

        // Empty points should trigger
        const evaluation = engine.evaluateRule(rule, []);
        expect(evaluation.triggered).toBe(true);
      });
    });

    describe('Alert State Management', () => {
      it('should create and track alert instance', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        const alert = engine.processEvaluation(rule, 'cpu', evaluation);

        expect(alert).toBeDefined();
        expect(alert!.state).toBe('firing');
        expect(alert!.severity).toBe('warning');
        expect(alert!.value).toBeGreaterThan(80);
      });

      it('should resolve alert when condition no longer met', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();

        // First evaluation - trigger alert
        const highPoints: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];
        const eval1 = engine.evaluateRule(rule, highPoints);
        engine.processEvaluation(rule, 'cpu', eval1);

        // Second evaluation - resolve alert
        const lowPoints: CanonicalPoint[] = [
          { timestamp: now - 5000, value: 50, quality: 'good' },
        ];
        const eval2 = engine.evaluateRule(rule, lowPoints);
        const alert = engine.processEvaluation(rule, 'cpu', eval2);

        expect(alert).toBeDefined();
        expect(alert!.state).toBe('resolved');
        expect(alert!.endsAt).toBeDefined();
      });

      it('should acknowledge alert', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        const alert = engine.processEvaluation(rule, 'cpu', evaluation);

        const acknowledged = engine.acknowledgeAlert(alert!.id, 'user_123');
        expect(acknowledged).toBeDefined();
        expect(acknowledged!.state).toBe('acknowledged');
        expect(acknowledged!.acknowledgedBy).toBe('user_123');
        expect(acknowledged!.acknowledgedAt).toBeDefined();
      });

      it('should list alerts with filters', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 50,
          aggregationWindow: '1m',
        });

        const rule1 = engine.createRule(createAlertRule({
          name: 'Warning Rule',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        }));

        const rule2 = engine.createRule(createAlertRule({
          name: 'Critical Rule',
          tenantId: 'tenant_1',
          seriesIds: ['memory'],
          condition,
          severity: 'critical',
        }));

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];

        engine.processEvaluation(rule1, 'cpu', engine.evaluateRule(rule1, points));
        engine.processEvaluation(rule2, 'memory', engine.evaluateRule(rule2, points));

        const allAlerts = engine.listAlerts('tenant_1');
        expect(allAlerts.length).toBe(2);

        const criticalAlerts = engine.listAlerts('tenant_1', { severity: ['critical'] });
        expect(criticalAlerts.length).toBe(1);
        expect(criticalAlerts[0].severity).toBe('critical');

        const firingAlerts = engine.listAlerts('tenant_1', { state: ['firing'] });
        expect(firingAlerts.length).toBe(2);
      });
    });

    describe('Alert History', () => {
      it('should track alert history', () => {
        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        const alert = engine.processEvaluation(rule, 'cpu', evaluation);

        const history = engine.getAlertHistory(alert!.id);
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].toState).toBe('firing');
      });
    });

    describe('Notification Channels', () => {
      it('should register a notification channel', () => {
        const channel: NotificationChannel = {
          id: 'channel_1',
          name: 'Test Channel',
          type: 'webhook',
          config: { webhookUrl: 'https://example.com/hook' },
          enabled: true,
        };
        engine.registerChannel(channel);

        const retrieved = engine.getChannel('channel_1');
        expect(retrieved).toEqual(channel);
      });

      it('should list channels', () => {
        engine.registerChannel({
          id: 'channel_1',
          name: 'Slack',
          type: 'slack',
          config: { slackWebhookUrl: 'https://hooks.slack.com/xxx' },
          enabled: true,
        });
        engine.registerChannel({
          id: 'channel_2',
          name: 'Email',
          type: 'email',
          config: { emailAddresses: ['team@example.com'] },
          enabled: true,
        });

        const channels = engine.listChannels();
        expect(channels).toHaveLength(2);
      });

      it('should send notifications', async () => {
        engine.registerChannel({
          id: 'channel_1',
          name: 'Slack',
          type: 'slack',
          config: { slackWebhookUrl: 'https://hooks.slack.com/xxx' },
          enabled: true,
        });

        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning',
          notificationChannels: ['channel_1'],
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        const alert = engine.processEvaluation(rule, 'cpu', evaluation);

        const results = await engine.sendNotification(alert!, rule);
        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
      });

      it('should filter by severity', async () => {
        engine.registerChannel({
          id: 'channel_1',
          name: 'Critical Only',
          type: 'slack',
          config: { slackWebhookUrl: 'https://hooks.slack.com/xxx' },
          severityFilter: ['critical', 'emergency'],
          enabled: true,
        });

        const condition = createAlertCondition({
          type: 'threshold_above',
          threshold: 80,
          aggregationWindow: '1m',
        });
        const ruleInput = createAlertRule({
          name: 'Test',
          tenantId: 'tenant_1',
          seriesIds: ['cpu'],
          condition,
          severity: 'warning', // Won't match severity filter
          notificationChannels: ['channel_1'],
        });
        const rule = engine.createRule(ruleInput);

        const now = Date.now();
        const points: CanonicalPoint[] = [
          { timestamp: now - 10000, value: 90, quality: 'good' },
        ];

        const evaluation = engine.evaluateRule(rule, points);
        const alert = engine.processEvaluation(rule, 'cpu', evaluation);

        const results = await engine.sendNotification(alert!, rule);
        expect(results).toHaveLength(0); // Filtered out
      });
    });
  });

  describe('Zod Schemas', () => {
    it('should validate AlertConditionSchema', () => {
      const condition = {
        type: 'threshold_above',
        threshold: 80,
        aggregationWindow: '5m',
        aggregation: 'avg',
      };
      const result = AlertConditionSchema.safeParse(condition);
      expect(result.success).toBe(true);
    });

    it('should reject invalid aggregation window', () => {
      const condition = {
        type: 'threshold_above',
        threshold: 80,
        aggregationWindow: '10m', // Invalid
        aggregation: 'avg',
      };
      const result = AlertConditionSchema.safeParse(condition);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Exports', () => {
    it('should export all types', () => {
      const severity: AlertRuleSeverity = 'critical';
      const state: AlertState = 'firing';
      const conditionType: AlertConditionType = 'threshold_above';

      expect(severity).toBe('critical');
      expect(state).toBe('firing');
      expect(conditionType).toBe('threshold_above');
    });
  });
});
