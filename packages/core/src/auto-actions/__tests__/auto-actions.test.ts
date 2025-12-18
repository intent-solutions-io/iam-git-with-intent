/**
 * Tests for Phase 60: Auto-Actions Framework
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTO_ACTIONS_VERSION,
  AutoActionsErrorCodes,
  AutoActionsEngine,
  createAutoActionsEngine,
  createActionDefinition,
  createActionTrigger,
  createEscalationPolicy,
  validateActionDefinition,
  validateEscalationPolicy,
  ActionDefinitionSchema,
  EscalationPolicySchema,
  ActionConfigSchema,
  ActionTriggerSchema,
  ActionRateLimitConfigSchema,
  ActionCircuitBreakerConfigSchema,
  ActionRetryConfigSchema,
  type ActionDefinition,
  type ActionTrigger,
  type EscalationPolicy,
  type ActionExecution,
  type ActionState,
  type ActionType,
  type TriggerType,
} from '../index.js';
import type { AlertInstance, AlertRuleSeverity } from '../../alerts/index.js';

describe('Auto-Actions Module', () => {
  describe('Version and Constants', () => {
    it('should export version', () => {
      expect(AUTO_ACTIONS_VERSION).toBe('1.0.0');
    });

    it('should export error codes', () => {
      expect(AutoActionsErrorCodes.INVALID_ACTION).toBe('AA_1001');
      expect(AutoActionsErrorCodes.EXECUTION_FAILED).toBe('AA_2001');
      expect(AutoActionsErrorCodes.ESCALATION_FAILED).toBe('AA_3001');
      expect(AutoActionsErrorCodes.AUDIT_WRITE_FAILED).toBe('AA_4001');
    });
  });

  describe('ActionDefinition Validation', () => {
    it('should validate valid webhook action', () => {
      const action = {
        id: 'action_1',
        name: 'Webhook Action',
        tenantId: 'tenant_1',
        type: 'webhook' as const,
        config: {
          webhookUrl: 'https://example.com/hook',
          webhookMethod: 'POST' as const,
        },
        triggers: [{ type: 'alert_firing' as const }],
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateActionDefinition(action);
      expect(result.success).toBe(true);
    });

    it('should reject invalid action type', () => {
      const action = {
        id: 'action_1',
        name: 'Invalid Action',
        tenantId: 'tenant_1',
        type: 'invalid_type',
        config: {},
        triggers: [{ type: 'alert_firing' }],
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateActionDefinition(action);
      expect(result.success).toBe(false);
    });

    it('should reject empty triggers', () => {
      const action = {
        id: 'action_1',
        name: 'No Triggers',
        tenantId: 'tenant_1',
        type: 'webhook' as const,
        config: {},
        triggers: [],
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateActionDefinition(action);
      expect(result.success).toBe(false);
    });
  });

  describe('EscalationPolicy Validation', () => {
    it('should validate valid escalation policy', () => {
      const policy = {
        id: 'policy_1',
        name: 'On-Call Escalation',
        tenantId: 'tenant_1',
        levels: [
          {
            level: 1,
            delaySeconds: 0,
            targets: [{ type: 'user' as const, id: 'user_1', name: 'Primary' }],
          },
          {
            level: 2,
            delaySeconds: 300,
            targets: [{ type: 'team' as const, id: 'team_1', name: 'Platform Team' }],
          },
        ],
        repeatInterval: 3600,
        maxEscalations: 3,
        notifyPreviousLevels: true,
        enabled: true,
      };
      const result = validateEscalationPolicy(policy);
      expect(result.success).toBe(true);
    });

    it('should reject empty levels', () => {
      const policy = {
        id: 'policy_1',
        name: 'Empty Policy',
        tenantId: 'tenant_1',
        levels: [],
        repeatInterval: 0,
        maxEscalations: 3,
        notifyPreviousLevels: false,
        enabled: true,
      };
      const result = validateEscalationPolicy(policy);
      expect(result.success).toBe(false);
    });
  });

  describe('createActionDefinition', () => {
    it('should create default action definition', () => {
      const action = createActionDefinition({
        name: 'Test Action',
        tenantId: 'tenant_1',
        type: 'webhook',
        config: { webhookUrl: 'https://example.com/hook' },
        triggers: [{ type: 'alert_firing' }],
      });
      expect(action.name).toBe('Test Action');
      expect(action.enabled).toBe(true);
    });

    it('should override defaults', () => {
      const action = createActionDefinition({
        name: 'Disabled Action',
        tenantId: 'tenant_1',
        type: 'email',
        config: { emailTo: ['team@example.com'] },
        triggers: [{ type: 'alert_resolved' }],
        enabled: false,
      });
      expect(action.enabled).toBe(false);
    });
  });

  describe('createActionTrigger', () => {
    it('should create trigger with defaults', () => {
      const trigger = createActionTrigger({ type: 'alert_firing' });
      expect(trigger.type).toBe('alert_firing');
    });

    it('should create trigger with filters', () => {
      const trigger = createActionTrigger({
        type: 'alert_firing',
        severityFilter: ['critical', 'emergency'],
        ruleFilter: ['rule_1', 'rule_2'],
        delaySeconds: 60,
      });
      expect(trigger.severityFilter).toEqual(['critical', 'emergency']);
      expect(trigger.ruleFilter).toEqual(['rule_1', 'rule_2']);
      expect(trigger.delaySeconds).toBe(60);
    });
  });

  describe('createEscalationPolicy', () => {
    it('should create default policy', () => {
      const policy = createEscalationPolicy({
        name: 'Default Policy',
        tenantId: 'tenant_1',
        levels: [
          {
            level: 1,
            delaySeconds: 0,
            targets: [{ type: 'user', id: 'user_1', name: 'Primary' }],
          },
        ],
      });
      expect(policy.name).toBe('Default Policy');
      expect(policy.repeatInterval).toBe(0);
      expect(policy.maxEscalations).toBe(3);
      expect(policy.notifyPreviousLevels).toBe(false);
      expect(policy.enabled).toBe(true);
    });
  });

  describe('createAutoActionsEngine', () => {
    it('should create an auto-actions engine instance', () => {
      const engine = createAutoActionsEngine();
      expect(engine).toBeInstanceOf(AutoActionsEngine);
    });
  });

  describe('AutoActionsEngine', () => {
    let engine: AutoActionsEngine;

    beforeEach(() => {
      engine = createAutoActionsEngine();
    });

    describe('Action Management', () => {
      it('should register an action', () => {
        const actionInput = createActionDefinition({
          name: 'Webhook Action',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: { webhookUrl: 'https://example.com/hook' },
          triggers: [{ type: 'alert_firing' }],
        });
        const action = engine.registerAction(actionInput);
        expect(action.id).toMatch(/^action_\d+$/);
        expect(action.name).toBe('Webhook Action');
        expect(action.createdAt).toBeGreaterThan(0);
      });

      it('should get action by ID', () => {
        const actionInput = createActionDefinition({
          name: 'Test',
          tenantId: 'tenant_1',
          type: 'slack',
          config: { slackWebhookUrl: 'https://hooks.slack.com/xxx' },
          triggers: [{ type: 'alert_firing' }],
        });
        const created = engine.registerAction(actionInput);
        const retrieved = engine.getAction(created.id);
        expect(retrieved).toEqual(created);
      });

      it('should list actions for tenant', () => {
        engine.registerAction(createActionDefinition({
          name: 'Action 1',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));
        engine.registerAction(createActionDefinition({
          name: 'Action 2',
          tenantId: 'tenant_1',
          type: 'email',
          config: {},
          triggers: [{ type: 'alert_resolved' }],
        }));
        engine.registerAction(createActionDefinition({
          name: 'Action 3',
          tenantId: 'tenant_2',
          type: 'slack',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        const tenant1Actions = engine.listActions('tenant_1');
        expect(tenant1Actions).toHaveLength(2);

        const tenant2Actions = engine.listActions('tenant_2');
        expect(tenant2Actions).toHaveLength(1);
      });

      it('should update an action', () => {
        const actionInput = createActionDefinition({
          name: 'Original',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        });
        const created = engine.registerAction(actionInput);
        const updated = engine.updateAction(created.id, { name: 'Updated' });

        expect(updated).toBeDefined();
        expect(updated!.name).toBe('Updated');
        expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
      });

      it('should delete an action', () => {
        const actionInput = createActionDefinition({
          name: 'To Delete',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        });
        const created = engine.registerAction(actionInput);
        const deleted = engine.deleteAction(created.id);
        expect(deleted).toBe(true);

        const retrieved = engine.getAction(created.id);
        expect(retrieved).toBeUndefined();
      });
    });

    describe('Policy Management', () => {
      it('should register a policy', () => {
        const policyInput = createEscalationPolicy({
          name: 'Test Policy',
          tenantId: 'tenant_1',
          levels: [
            {
              level: 1,
              delaySeconds: 0,
              targets: [{ type: 'user', id: 'user_1', name: 'Primary' }],
            },
          ],
        });
        const policy = engine.registerPolicy(policyInput);
        expect(policy.id).toMatch(/^policy_\d+$/);
        expect(policy.name).toBe('Test Policy');
      });

      it('should get policy by ID', () => {
        const policyInput = createEscalationPolicy({
          name: 'Test',
          tenantId: 'tenant_1',
          levels: [
            {
              level: 1,
              delaySeconds: 0,
              targets: [{ type: 'user', id: 'user_1', name: 'Primary' }],
            },
          ],
        });
        const created = engine.registerPolicy(policyInput);
        const retrieved = engine.getPolicy(created.id);
        expect(retrieved).toEqual(created);
      });

      it('should list policies for tenant', () => {
        engine.registerPolicy(createEscalationPolicy({
          name: 'Policy 1',
          tenantId: 'tenant_1',
          levels: [{ level: 1, delaySeconds: 0, targets: [{ type: 'user', id: 'u1', name: 'User 1' }] }],
        }));
        engine.registerPolicy(createEscalationPolicy({
          name: 'Policy 2',
          tenantId: 'tenant_2',
          levels: [{ level: 1, delaySeconds: 0, targets: [{ type: 'user', id: 'u2', name: 'User 2' }] }],
        }));

        const tenant1Policies = engine.listPolicies('tenant_1');
        expect(tenant1Policies).toHaveLength(1);
      });
    });

    describe('Action Execution', () => {
      it('should execute webhook action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Webhook Test',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {
            webhookUrl: 'https://example.com/hook',
            webhookMethod: 'POST',
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
        expect(execution.result).toBeDefined();
        expect(execution.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should execute email action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Email Test',
          tenantId: 'tenant_1',
          type: 'email',
          config: {
            emailTo: ['team@example.com'],
            emailSubject: 'Alert',
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
      });

      it('should execute slack action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Slack Test',
          tenantId: 'tenant_1',
          type: 'slack',
          config: {
            slackWebhookUrl: 'https://hooks.slack.com/xxx',
            slackMessage: 'Alert fired!',
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
      });

      it('should execute pagerduty action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'PagerDuty Test',
          tenantId: 'tenant_1',
          type: 'pagerduty',
          config: {
            pagerDutyRoutingKey: 'xxx',
            pagerDutySeverity: 'critical',
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
      });

      it('should execute scale action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Scale Test',
          tenantId: 'tenant_1',
          type: 'scale',
          config: {
            scaleTarget: 'deployment/app',
            scaleReplicas: 5,
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
        expect(execution.result?.data?.replicas).toBe(5);
      });

      it('should execute restart action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Restart Test',
          tenantId: 'tenant_1',
          type: 'restart',
          config: {
            restartTarget: 'pod/app-1',
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
      });

      it('should execute runbook action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Runbook Test',
          tenantId: 'tenant_1',
          type: 'runbook',
          config: {
            runbookId: 'rb_123',
            runbookParams: { severity: 'high' },
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
      });

      it('should execute custom action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Custom Test',
          tenantId: 'tenant_1',
          type: 'custom',
          config: {
            customHandler: 'myHandler',
            customParams: { key: 'value' },
          },
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        expect(execution.state).toBe('completed');
      });

      it('should throw for disabled action', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Disabled Action',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
          enabled: false,
        }));

        await expect(engine.executeAction(action.id)).rejects.toThrow('not found or disabled');
      });

      it('should throw for non-existent action', async () => {
        await expect(engine.executeAction('non_existent')).rejects.toThrow('not found');
      });
    });

    describe('Rate Limiting', () => {
      it('should rate limit actions', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Rate Limited',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
          rateLimit: {
            maxActions: 2,
            windowSeconds: 60,
            onLimited: 'drop',
          },
        }));

        // First two should succeed
        const exec1 = await engine.executeAction(action.id);
        expect(exec1.state).toBe('completed');

        const exec2 = await engine.executeAction(action.id);
        expect(exec2.state).toBe('completed');

        // Third should be skipped
        const exec3 = await engine.executeAction(action.id);
        expect(exec3.state).toBe('skipped');
        expect(exec3.error).toBe('Rate limited');
      });
    });

    describe('Circuit Breaker', () => {
      it('should track circuit breaker state', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Circuit Breaker Test',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
          circuitBreaker: {
            failureThreshold: 3,
            successThreshold: 2,
            halfOpenTimeout: 10,
            resetTimeout: 30,
          },
        }));

        // Should execute successfully
        const exec = await engine.executeAction(action.id);
        expect(exec.state).toBe('completed');
      });
    });

    describe('Action Matching', () => {
      it('should find matching actions for alert', () => {
        engine.registerAction(createActionDefinition({
          name: 'Critical Alert Handler',
          tenantId: 'tenant_1',
          type: 'pagerduty',
          config: {},
          triggers: [{
            type: 'alert_firing',
            severityFilter: ['critical', 'emergency'],
          }],
        }));

        engine.registerAction(createActionDefinition({
          name: 'Warning Handler',
          tenantId: 'tenant_1',
          type: 'slack',
          config: {},
          triggers: [{
            type: 'alert_firing',
            severityFilter: ['warning'],
          }],
        }));

        const criticalAlert: AlertInstance = {
          id: 'alert_1',
          ruleId: 'rule_1',
          seriesId: 'cpu',
          state: 'firing',
          severity: 'critical',
          value: 95,
          threshold: 80,
          message: 'High CPU',
          labels: {},
          annotations: {},
          startsAt: Date.now(),
          fingerprint: 'fp_1',
          firedCount: 1,
          lastEvaluatedAt: Date.now(),
        };

        const matches = engine.findMatchingActions(criticalAlert, 'alert_firing');
        expect(matches).toHaveLength(1);
        expect(matches[0].name).toBe('Critical Alert Handler');
      });

      it('should filter by rule ID', () => {
        engine.registerAction(createActionDefinition({
          name: 'Specific Rule Handler',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{
            type: 'alert_firing',
            ruleFilter: ['rule_123'],
          }],
        }));

        const matchingAlert: AlertInstance = {
          id: 'alert_1',
          ruleId: 'rule_123',
          seriesId: 'cpu',
          state: 'firing',
          severity: 'warning',
          value: 90,
          threshold: 80,
          message: 'Alert',
          labels: {},
          annotations: {},
          startsAt: Date.now(),
          fingerprint: 'fp_1',
          firedCount: 1,
          lastEvaluatedAt: Date.now(),
        };

        const nonMatchingAlert: AlertInstance = {
          ...matchingAlert,
          ruleId: 'rule_456',
        };

        const matches1 = engine.findMatchingActions(matchingAlert, 'alert_firing');
        expect(matches1).toHaveLength(1);

        const matches2 = engine.findMatchingActions(nonMatchingAlert, 'alert_firing');
        expect(matches2).toHaveLength(0);
      });

      it('should filter by labels', () => {
        engine.registerAction(createActionDefinition({
          name: 'Production Handler',
          tenantId: 'tenant_1',
          type: 'pagerduty',
          config: {},
          triggers: [{
            type: 'alert_firing',
            labelFilter: { env: 'production' },
          }],
        }));

        const prodAlert: AlertInstance = {
          id: 'alert_1',
          ruleId: 'rule_1',
          seriesId: 'cpu',
          state: 'firing',
          severity: 'critical',
          value: 95,
          threshold: 80,
          message: 'High CPU',
          labels: { env: 'production', team: 'platform' },
          annotations: {},
          startsAt: Date.now(),
          fingerprint: 'fp_1',
          firedCount: 1,
          lastEvaluatedAt: Date.now(),
        };

        const stagingAlert: AlertInstance = {
          ...prodAlert,
          labels: { env: 'staging', team: 'platform' },
        };

        const matches1 = engine.findMatchingActions(prodAlert, 'alert_firing');
        expect(matches1).toHaveLength(1);

        const matches2 = engine.findMatchingActions(stagingAlert, 'alert_firing');
        expect(matches2).toHaveLength(0);
      });
    });

    describe('Process Alert', () => {
      it('should process alert and execute matching actions', async () => {
        engine.registerAction(createActionDefinition({
          name: 'Alert Handler',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: { webhookUrl: 'https://example.com/hook' },
          triggers: [{ type: 'alert_firing' }],
        }));

        const alert: AlertInstance = {
          id: 'alert_1',
          ruleId: 'rule_1',
          seriesId: 'cpu',
          state: 'firing',
          severity: 'warning',
          value: 90,
          threshold: 80,
          message: 'High CPU',
          labels: {},
          annotations: {},
          startsAt: Date.now(),
          fingerprint: 'fp_1',
          firedCount: 1,
          lastEvaluatedAt: Date.now(),
        };

        const executions = await engine.processAlert(alert, 'alert_firing');
        expect(executions).toHaveLength(1);
        expect(executions[0].state).toBe('completed');
      });
    });

    describe('Execution Management', () => {
      it('should get execution by ID', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Test',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        const execution = await engine.executeAction(action.id);
        const retrieved = engine.getExecution(execution.id);
        expect(retrieved).toEqual(execution);
      });

      it('should list executions with filters', async () => {
        const action1 = engine.registerAction(createActionDefinition({
          name: 'Action 1',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        const action2 = engine.registerAction(createActionDefinition({
          name: 'Action 2',
          tenantId: 'tenant_1',
          type: 'slack',
          config: {},
          triggers: [{ type: 'alert_resolved' }],
        }));

        await engine.executeAction(action1.id);
        await engine.executeAction(action1.id);
        await engine.executeAction(action2.id);

        const allExecutions = engine.listExecutions();
        expect(allExecutions).toHaveLength(3);

        const action1Executions = engine.listExecutions({ actionId: action1.id });
        expect(action1Executions).toHaveLength(2);

        const completedExecutions = engine.listExecutions({ state: ['completed'] });
        expect(completedExecutions).toHaveLength(3);
      });
    });

    describe('Audit Log', () => {
      it('should log action executions', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Audited Action',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        await engine.executeAction(action.id, undefined, 'alert_firing', 'user_123');

        const auditLog = engine.getAuditLog({ tenantId: 'tenant_1' });
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].actionName).toBe('Audited Action');
        expect(auditLog[0].triggeredBy).toBe('user_123');
      });

      it('should filter audit log by action ID', async () => {
        const action1 = engine.registerAction(createActionDefinition({
          name: 'Action 1',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        const action2 = engine.registerAction(createActionDefinition({
          name: 'Action 2',
          tenantId: 'tenant_1',
          type: 'slack',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        await engine.executeAction(action1.id);
        await engine.executeAction(action2.id);

        const action1Log = engine.getAuditLog({ actionId: action1.id });
        expect(action1Log).toHaveLength(1);
        expect(action1Log[0].actionId).toBe(action1.id);
      });

      it('should filter audit log by time range', async () => {
        const action = engine.registerAction(createActionDefinition({
          name: 'Test',
          tenantId: 'tenant_1',
          type: 'webhook',
          config: {},
          triggers: [{ type: 'alert_firing' }],
        }));

        const startTime = Date.now();
        await engine.executeAction(action.id);
        const endTime = Date.now();

        const filteredLog = engine.getAuditLog({
          startTime,
          endTime: endTime + 1000,
        });
        expect(filteredLog.length).toBeGreaterThan(0);

        const emptyLog = engine.getAuditLog({
          startTime: endTime + 10000,
          endTime: endTime + 20000,
        });
        expect(emptyLog).toHaveLength(0);
      });
    });
  });

  describe('Zod Schemas', () => {
    it('should validate ActionConfigSchema', () => {
      const config = {
        webhookUrl: 'https://example.com/hook',
        webhookMethod: 'POST',
        webhookHeaders: { 'Content-Type': 'application/json' },
      };
      const result = ActionConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate ActionTriggerSchema', () => {
      const trigger = {
        type: 'alert_firing',
        severityFilter: ['critical', 'emergency'],
        delaySeconds: 60,
      };
      const result = ActionTriggerSchema.safeParse(trigger);
      expect(result.success).toBe(true);
    });

    it('should validate ActionRateLimitConfigSchema', () => {
      const config = {
        maxActions: 100,
        windowSeconds: 3600,
        onLimited: 'queue',
      };
      const result = ActionRateLimitConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate ActionCircuitBreakerConfigSchema', () => {
      const config = {
        failureThreshold: 5,
        successThreshold: 3,
        halfOpenTimeout: 30,
        resetTimeout: 60,
      };
      const result = ActionCircuitBreakerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate ActionRetryConfigSchema', () => {
      const config = {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };
      const result = ActionRetryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject maxAttempts > 10', () => {
      const config = {
        maxAttempts: 15,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };
      const result = ActionRetryConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Exports', () => {
    it('should export all types', () => {
      const actionType: ActionType = 'webhook';
      const state: ActionState = 'completed';
      const triggerType: TriggerType = 'alert_firing';

      expect(actionType).toBe('webhook');
      expect(state).toBe('completed');
      expect(triggerType).toBe('alert_firing');
    });
  });
});
