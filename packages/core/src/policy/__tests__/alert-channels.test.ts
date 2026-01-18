/**
 * Alert Channels Tests
 *
 * Tests for alert channel implementations and dispatcher
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EmailChannel,
  SlackChannel,
  WebhookChannel,
  AlertDispatcher,
  createEmailChannel,
  createSlackChannel,
  createWebhookChannel,
  createAlertDispatcher,
  initializeAlertDispatcher,
  getAlertDispatcher,
  resetAlertDispatcher,
  type AlertPayload,
  type EmailChannelConfig,
  type SlackChannelConfig,
  type WebhookChannelConfig,
} from '../alert-channels.js';
import {
  createPolicyDeniedViolation,
  createAnomalyDetectedViolation,
  type ViolationActor,
  type ViolationResource,
  type ViolationAction,
  type PolicyDeniedDetails,
  type AnomalyDetectedDetails,
} from '../violation-schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestActor(id = 'user-123'): ViolationActor {
  return {
    type: 'user',
    id,
    name: 'Test User',
    email: 'test@example.com',
  };
}

function createTestResource(id = 'repo-456'): ViolationResource {
  return {
    type: 'repository',
    id,
    name: 'test-repo',
  };
}

function createTestAction(): ViolationAction {
  return {
    type: 'push',
    description: 'Push to protected branch',
    timestamp: new Date(),
  };
}

function createTestViolation(severity: 'low' | 'medium' | 'high' | 'critical' = 'high') {
  const details: PolicyDeniedDetails = {
    policyId: 'policy-1',
    policyName: 'Protected Branch Policy',
    ruleId: 'rule-1',
    ruleDescription: 'Direct push to main is not allowed',
    effect: 'deny',
  };

  const violation = createPolicyDeniedViolation(
    'tenant-1',
    createTestActor(),
    createTestResource(),
    createTestAction(),
    details
  );

  // Override severity for testing
  return { ...violation, severity };
}

function createTestPayload(violation = createTestViolation()): AlertPayload {
  return {
    id: `alert-${Date.now()}`,
    violation,
    priority: 'high',
    title: 'Policy Violation: push by Test User',
    summary: 'Test User attempted push on test-repo but was denied by policy',
    detailsUrl: 'https://example.com/violations/123',
    timestamp: new Date(),
  };
}

// =============================================================================
// Mock fetch
// =============================================================================

const originalFetch = global.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

function setupFetchMock(response: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  mockFetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.json ?? {},
    text: async () => response.text ?? '',
  });
  global.fetch = mockFetch;
}

// =============================================================================
// Email Channel Tests
// =============================================================================

describe('EmailChannel', () => {
  const baseConfig: EmailChannelConfig = {
    type: 'email',
    enabled: true,
    minSeverity: 'medium',
    apiKey: 'test-api-key',
    from: 'alerts@example.com',
    to: ['recipient@example.com'],
  };

  beforeEach(() => {
    setupFetchMock({ ok: true, json: { id: 'msg-123' } });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('configuration', () => {
    it('should create channel with valid config', () => {
      const channel = createEmailChannel(baseConfig);
      expect(channel.type).toBe('email');
      expect(channel.name).toBe('email:recipient@example.com');
      expect(channel.isEnabled()).toBe(true);
    });

    it('should reject invalid config', () => {
      expect(() => createEmailChannel({
        ...baseConfig,
        from: 'invalid-email',
      })).toThrow();
    });

    it('should respect enabled flag', () => {
      const channel = createEmailChannel({ ...baseConfig, enabled: false });
      expect(channel.isEnabled()).toBe(false);
    });
  });

  describe('shouldAlert', () => {
    it('should alert when severity meets threshold', () => {
      const channel = createEmailChannel({ ...baseConfig, minSeverity: 'medium' });

      expect(channel.shouldAlert(createTestViolation('critical'))).toBe(true);
      expect(channel.shouldAlert(createTestViolation('high'))).toBe(true);
      expect(channel.shouldAlert(createTestViolation('medium'))).toBe(true);
      expect(channel.shouldAlert(createTestViolation('low'))).toBe(false);
    });

    it('should filter by violation type', () => {
      const channel = createEmailChannel({
        ...baseConfig,
        violationTypes: ['policy-denied'],
      });

      expect(channel.shouldAlert(createTestViolation())).toBe(true);

      // Create anomaly violation
      const anomalyDetails: AnomalyDetectedDetails = {
        anomalyType: 'unusual_access',
        confidence: 0.9,
        baseline: 'Normal access pattern',
        observed: 'Unusual access at 3am',
      };
      const anomalyViolation = createAnomalyDetectedViolation(
        'tenant-1',
        createTestActor(),
        createTestResource(),
        createTestAction(),
        anomalyDetails
      );
      expect(channel.shouldAlert(anomalyViolation)).toBe(false);
    });

    it('should not alert when disabled', () => {
      const channel = createEmailChannel({ ...baseConfig, enabled: false });
      expect(channel.shouldAlert(createTestViolation())).toBe(false);
    });
  });

  describe('send', () => {
    it('should send email via Resend API', async () => {
      const channel = createEmailChannel(baseConfig);
      const payload = createTestPayload();

      const result = await channel.send(payload);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('email');
      expect(result.messageId).toBe('msg-123');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should handle API errors', async () => {
      setupFetchMock({ ok: false, status: 401, text: 'Unauthorized' });

      const channel = createEmailChannel(baseConfig);
      const result = await channel.send(createTestPayload());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resend API error');
    });

    it('should handle network errors', async () => {
      mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const channel = createEmailChannel(baseConfig);
      const result = await channel.send(createTestPayload());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should include CC recipients', async () => {
      const channel = createEmailChannel({
        ...baseConfig,
        cc: ['cc@example.com'],
      });

      await channel.send(createTestPayload());

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.cc).toEqual(['cc@example.com']);
    });
  });

  describe('test', () => {
    it('should validate configuration', async () => {
      const channel = createEmailChannel(baseConfig);
      const result = await channel.test();
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Slack Channel Tests
// =============================================================================

describe('SlackChannel', () => {
  const baseConfig: SlackChannelConfig = {
    type: 'slack',
    enabled: true,
    minSeverity: 'high',
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
  };

  beforeEach(() => {
    setupFetchMock({ ok: true, text: 'ok' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('configuration', () => {
    it('should create channel with valid config', () => {
      const channel = createSlackChannel(baseConfig);
      expect(channel.type).toBe('slack');
      expect(channel.name).toBe('slack:default');
      expect(channel.isEnabled()).toBe(true);
    });

    it('should use channel override in name', () => {
      const channel = createSlackChannel({ ...baseConfig, channel: '#security' });
      expect(channel.name).toBe('slack:#security');
    });
  });

  describe('shouldAlert', () => {
    it('should alert based on severity', () => {
      const channel = createSlackChannel({ ...baseConfig, minSeverity: 'high' });

      expect(channel.shouldAlert(createTestViolation('critical'))).toBe(true);
      expect(channel.shouldAlert(createTestViolation('high'))).toBe(true);
      expect(channel.shouldAlert(createTestViolation('medium'))).toBe(false);
    });
  });

  describe('send', () => {
    it('should send to Slack webhook', async () => {
      const channel = createSlackChannel(baseConfig);
      const result = await channel.send(createTestPayload());

      expect(result.success).toBe(true);
      expect(result.channel).toBe('slack');

      expect(mockFetch).toHaveBeenCalledWith(
        baseConfig.webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should include attachments with fields', async () => {
      const channel = createSlackChannel(baseConfig);
      await channel.send(createTestPayload());

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.attachments).toBeDefined();
      expect(callBody.attachments[0].fields).toBeDefined();
      expect(callBody.attachments[0].fields.length).toBeGreaterThan(0);
    });

    it('should mention users for critical alerts', async () => {
      const channel = createSlackChannel({
        ...baseConfig,
        mentionUsers: ['U123', 'U456'],
      });

      const violation = createTestViolation('critical');
      await channel.send(createTestPayload(violation));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).toContain('<@U123>');
      expect(callBody.text).toContain('<@U456>');
    });

    it('should not mention users for non-critical alerts', async () => {
      const channel = createSlackChannel({
        ...baseConfig,
        mentionUsers: ['U123'],
      });

      const violation = createTestViolation('high');
      await channel.send(createTestPayload(violation));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).not.toContain('<@U123>');
    });

    it('should handle webhook errors', async () => {
      setupFetchMock({ ok: false, status: 404, text: 'Not found' });

      const channel = createSlackChannel(baseConfig);
      const result = await channel.send(createTestPayload());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Slack webhook error');
    });
  });

  describe('test', () => {
    it('should send test message', async () => {
      const channel = createSlackChannel(baseConfig);
      const result = await channel.test();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should report test failure', async () => {
      setupFetchMock({ ok: false, status: 404 });

      const channel = createSlackChannel(baseConfig);
      const result = await channel.test();

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });
  });
});

// =============================================================================
// Webhook Channel Tests (Stub)
// =============================================================================

describe('WebhookChannel', () => {
  const baseConfig: WebhookChannelConfig = {
    type: 'webhook',
    enabled: true,
    minSeverity: 'medium',
    url: 'https://example.com/webhook',
  };

  describe('configuration', () => {
    it('should create channel with valid config', () => {
      const channel = createWebhookChannel(baseConfig);
      expect(channel.type).toBe('webhook');
      expect(channel.name).toBe('webhook:example.com');
      expect(channel.isEnabled()).toBe(true);
    });
  });

  describe('send', () => {
    it('should return not implemented error', async () => {
      const channel = createWebhookChannel(baseConfig);
      const result = await channel.send(createTestPayload());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('test', () => {
    it('should validate URL but report not implemented', async () => {
      const channel = createWebhookChannel(baseConfig);
      const result = await channel.test();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });
});

// =============================================================================
// Alert Dispatcher Tests
// =============================================================================

describe('AlertDispatcher', () => {
  let emailChannel: EmailChannel;
  let slackChannel: SlackChannel;

  beforeEach(() => {
    setupFetchMock({ ok: true, json: { id: 'msg-123' } });

    emailChannel = createEmailChannel({
      type: 'email',
      enabled: true,
      minSeverity: 'medium',
      apiKey: 'test-key',
      from: 'alerts@example.com',
      to: ['recipient@example.com'],
    });

    slackChannel = createSlackChannel({
      type: 'slack',
      enabled: true,
      minSeverity: 'high',
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
    });

    resetAlertDispatcher();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetAlertDispatcher();
  });

  describe('dispatch', () => {
    it('should dispatch to matching channels', async () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel, slackChannel],
      });

      const violation = createTestViolation('high');
      const result = await dispatcher.dispatch(violation, 'tenant-1');

      expect(result.channelsAttempted).toBe(2);
      expect(result.channelsSucceeded).toBe(2);
      expect(result.results.length).toBe(2);
    });

    it('should skip channels below severity threshold', async () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel, slackChannel],
      });

      // Medium severity - only email should fire (minSeverity: medium)
      // Slack has minSeverity: high so it shouldn't fire
      const violation = createTestViolation('medium');
      const result = await dispatcher.dispatch(violation, 'tenant-1');

      expect(result.channelsAttempted).toBe(1);
      expect(result.results[0].channel).toBe('email');
    });

    it('should skip disabled channels', async () => {
      const disabledEmail = createEmailChannel({
        type: 'email',
        enabled: false,
        minSeverity: 'low',
        apiKey: 'test',
        from: 'a@b.com',
        to: ['c@d.com'],
      });

      const dispatcher = createAlertDispatcher({
        channels: [disabledEmail, slackChannel],
      });

      const violation = createTestViolation('critical');
      const result = await dispatcher.dispatch(violation, 'tenant-1');

      // Only slack should fire
      expect(result.channelsAttempted).toBe(1);
      expect(result.results[0].channel).toBe('slack');
    });

    it('should rate limit channels', async () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel],
        defaultRateLimit: { maxAlerts: 2, windowMs: 60000 },
      });

      const violation = createTestViolation();

      // First two should succeed
      await dispatcher.dispatch(violation, 'tenant-1');
      await dispatcher.dispatch(violation, 'tenant-1');

      // Third should be rate limited
      const result = await dispatcher.dispatch(violation, 'tenant-1');

      expect(result.channelsRateLimited).toBe(1);
      expect(result.results[0].rateLimited).toBe(true);
    });

    it('should track rate limits per tenant', async () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel],
        defaultRateLimit: { maxAlerts: 1, windowMs: 60000 },
      });

      const violation = createTestViolation();

      // Tenant 1 - first succeeds
      const result1 = await dispatcher.dispatch(violation, 'tenant-1');
      expect(result1.channelsSucceeded).toBe(1);

      // Tenant 2 - also succeeds (different tenant)
      const result2 = await dispatcher.dispatch(violation, 'tenant-2');
      expect(result2.channelsSucceeded).toBe(1);

      // Tenant 1 again - rate limited
      const result3 = await dispatcher.dispatch(violation, 'tenant-1');
      expect(result3.channelsRateLimited).toBe(1);
    });

    it('should call onAlertDispatched callback', async () => {
      const onAlertDispatched = vi.fn();

      const dispatcher = createAlertDispatcher({
        channels: [emailChannel],
        onAlertDispatched,
      });

      await dispatcher.dispatch(createTestViolation(), 'tenant-1');

      expect(onAlertDispatched).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        expect.objectContaining({ id: expect.any(String) })
      );
    });

    it('should call onRateLimited callback', async () => {
      const onRateLimited = vi.fn();

      const dispatcher = createAlertDispatcher({
        channels: [emailChannel],
        defaultRateLimit: { maxAlerts: 1, windowMs: 60000 },
        onRateLimited,
      });

      // First dispatch succeeds
      await dispatcher.dispatch(createTestViolation(), 'tenant-1');
      expect(onRateLimited).not.toHaveBeenCalled();

      // Second dispatch hits rate limit
      await dispatcher.dispatch(createTestViolation(), 'tenant-1');

      expect(onRateLimited).toHaveBeenCalledWith(
        emailChannel,
        expect.objectContaining({ type: 'policy-denied' })
      );
    });

    it('should include details URL when configured', async () => {
      const onAlertDispatched = vi.fn();

      const dispatcher = createAlertDispatcher({
        channels: [emailChannel],
        detailsBaseUrl: 'https://dashboard.example.com',
        onAlertDispatched,
      });

      await dispatcher.dispatch(createTestViolation(), 'tenant-1');

      const payload = onAlertDispatched.mock.calls[0][1];
      expect(payload.detailsUrl).toContain('https://dashboard.example.com/violations/');
    });
  });

  describe('channel management', () => {
    it('should get all channels', () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel, slackChannel],
      });

      expect(dispatcher.getChannels()).toHaveLength(2);
    });

    it('should get only enabled channels', () => {
      const disabledChannel = createEmailChannel({
        type: 'email',
        enabled: false,
        minSeverity: 'low',
        apiKey: 'test',
        from: 'a@b.com',
        to: ['c@d.com'],
      });

      const dispatcher = createAlertDispatcher({
        channels: [emailChannel, disabledChannel],
      });

      expect(dispatcher.getEnabledChannels()).toHaveLength(1);
    });

    it('should add channels', () => {
      const dispatcher = createAlertDispatcher({ channels: [] });
      dispatcher.addChannel(emailChannel);

      expect(dispatcher.getChannels()).toHaveLength(1);
    });

    it('should remove channels by name', () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel, slackChannel],
      });

      const removed = dispatcher.removeChannel(emailChannel.name);

      expect(removed).toBe(true);
      expect(dispatcher.getChannels()).toHaveLength(1);
    });

    it('should return false when removing non-existent channel', () => {
      const dispatcher = createAlertDispatcher({ channels: [] });
      const removed = dispatcher.removeChannel('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('testChannels', () => {
    it('should test all channels', async () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel, slackChannel],
      });

      const results = await dispatcher.testChannels();

      expect(results.size).toBe(2);
      expect(results.get(emailChannel.name)?.success).toBe(true);
      expect(results.get(slackChannel.name)?.success).toBe(true);
    });
  });

  describe('resetRateLimits', () => {
    it('should clear rate limits', async () => {
      const dispatcher = createAlertDispatcher({
        channels: [emailChannel],
        defaultRateLimit: { maxAlerts: 1, windowMs: 60000 },
      });

      const violation = createTestViolation();

      // First succeeds
      await dispatcher.dispatch(violation, 'tenant-1');

      // Second rate limited
      const result1 = await dispatcher.dispatch(violation, 'tenant-1');
      expect(result1.channelsRateLimited).toBe(1);

      // Reset rate limits
      dispatcher.resetRateLimits();

      // Now should succeed again
      const result2 = await dispatcher.dispatch(violation, 'tenant-1');
      expect(result2.channelsSucceeded).toBe(1);
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton management', () => {
  beforeEach(() => {
    resetAlertDispatcher();
  });

  afterEach(() => {
    resetAlertDispatcher();
  });

  it('should throw when getting uninitialized dispatcher', () => {
    expect(() => getAlertDispatcher()).toThrow('not initialized');
  });

  it('should initialize and get dispatcher', () => {
    const dispatcher = initializeAlertDispatcher({ channels: [] });
    expect(getAlertDispatcher()).toBe(dispatcher);
  });

  it('should reset dispatcher', () => {
    initializeAlertDispatcher({ channels: [] });
    resetAlertDispatcher();
    expect(() => getAlertDispatcher()).toThrow();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  beforeEach(() => {
    setupFetchMock({ ok: true, json: { id: 'msg-123' } });
    resetAlertDispatcher();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetAlertDispatcher();
  });

  it('should handle mixed channel success and failure', async () => {
    // Email succeeds, webhook fails (stub)
    const emailChannel = createEmailChannel({
      type: 'email',
      enabled: true,
      minSeverity: 'low',
      apiKey: 'test',
      from: 'a@b.com',
      to: ['c@d.com'],
    });

    const webhookChannel = createWebhookChannel({
      type: 'webhook',
      enabled: true,
      minSeverity: 'low',
      url: 'https://example.com/webhook',
    });

    const dispatcher = createAlertDispatcher({
      channels: [emailChannel, webhookChannel],
    });

    const result = await dispatcher.dispatch(createTestViolation(), 'tenant-1');

    expect(result.channelsAttempted).toBe(2);
    expect(result.channelsSucceeded).toBe(1);
    expect(result.results.find(r => r.channel === 'email')?.success).toBe(true);
    expect(result.results.find(r => r.channel === 'webhook')?.success).toBe(false);
  });

  it('should build appropriate titles for different violation types', async () => {
    const onAlertDispatched = vi.fn();

    const dispatcher = createAlertDispatcher({
      channels: [createEmailChannel({
        type: 'email',
        enabled: true,
        minSeverity: 'low',
        apiKey: 'test',
        from: 'a@b.com',
        to: ['c@d.com'],
      })],
      onAlertDispatched,
    });

    // Policy denied
    await dispatcher.dispatch(createTestViolation(), 'tenant-1');
    expect(onAlertDispatched.mock.calls[0][1].title).toContain('Policy Violation');

    // Anomaly
    const anomalyDetails: AnomalyDetectedDetails = {
      anomalyType: 'unusual_access',
      confidence: 0.9,
      baseline: 'normal',
      observed: 'unusual',
    };
    const anomaly = createAnomalyDetectedViolation(
      'tenant-1',
      createTestActor(),
      createTestResource(),
      createTestAction(),
      anomalyDetails
    );
    await dispatcher.dispatch(anomaly, 'tenant-1');
    expect(onAlertDispatched.mock.calls[1][1].title).toContain('Anomaly Detected');
  });
});
