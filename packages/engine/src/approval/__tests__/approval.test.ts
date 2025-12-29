/**
 * Approval Gates System Tests
 *
 * Story C4: Tests for approval gates, escalation, and notifications.
 *
 * @module @gwi/engine/approval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ApprovalGate,
  InMemoryApprovalStore,
  type ApprovalGateConfig,
  type ApprovalRequest,
  checkEscalation,
  performEscalation,
  StubNotifier,
  setNotifier,
  resetNotifier,
  createApprovalRequestNotification,
} from '../index.js';

describe('ApprovalStore', () => {
  let store: InMemoryApprovalStore;

  beforeEach(() => {
    store = new InMemoryApprovalStore();
  });

  it('should create an approval request', async () => {
    const request = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1', 'approver-2'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
    });

    expect(request.id).toMatch(/^apr-/);
    expect(request.runId).toBe('run-1');
    expect(request.stepId).toBe('step-1');
    expect(request.approvers).toEqual(['approver-1', 'approver-2']);
    expect(request.escalationCount).toBe(0);
    expect(request.decisions).toEqual([]);
  });

  it('should get request by ID', async () => {
    const created = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
    });

    const retrieved = await store.getRequest(created.id);
    expect(retrieved).toEqual(created);
  });

  it('should get request by run and step ID', async () => {
    const created = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
    });

    const retrieved = await store.getRequestByRunAndStep('run-1', 'step-1');
    expect(retrieved).toEqual(created);
  });

  it('should update request status', async () => {
    const request = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
    });

    await store.updateStatus(request.id, 'approved');
    const updated = await store.getRequest(request.id);
    expect(updated?.status).toBe('approved');
  });

  it('should add decisions', async () => {
    const request = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
    });

    await store.addDecision(request.id, {
      approved: true,
      decidedBy: 'approver-1',
      decidedAt: new Date(),
    });

    const updated = await store.getRequest(request.id);
    expect(updated?.decisions).toHaveLength(1);
    expect(updated?.decisions[0].approved).toBe(true);
    expect(updated?.decisions[0].decidedBy).toBe('approver-1');
  });

  it('should list pending requests', async () => {
    await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
    });

    await store.createRequest({
      runId: 'run-2',
      stepId: 'step-2',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'approved',
      notificationChannels: [],
    });

    const pending = await store.listPending('tenant-1');
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
  });
});

describe('Escalation', () => {
  let store: InMemoryApprovalStore;

  beforeEach(() => {
    store = new InMemoryApprovalStore();
  });

  it('should detect timeout', () => {
    const request: ApprovalRequest = {
      id: 'apr-1',
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      decisions: [],
      escalationCount: 0,
      notificationChannels: [],
      createdAt: new Date(Date.now() - 10000),
      expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      escalationPolicy: {
        timeoutMs: 5000,
        action: 'auto_reject',
      },
    };

    const result = checkEscalation(request);
    expect(result.shouldEscalate).toBe(true);
    expect(result.action).toBe('auto_reject');
  });

  it('should not escalate if not expired', () => {
    const request: ApprovalRequest = {
      id: 'apr-1',
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      decisions: [],
      escalationCount: 0,
      notificationChannels: [],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10000), // Expires in 10 seconds
      escalationPolicy: {
        timeoutMs: 5000,
        action: 'auto_reject',
      },
    };

    const result = checkEscalation(request);
    expect(result.shouldEscalate).toBe(false);
  });

  it('should auto-reject on timeout', async () => {
    const request = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
      expiresAt: new Date(Date.now() - 1000), // Already expired
      escalationPolicy: {
        timeoutMs: 5000,
        action: 'auto_reject',
      },
    });

    const result = await performEscalation(request, store);
    expect(result.escalated).toBe(true);
    expect(result.action).toBe('auto_reject');

    const updated = await store.getRequest(request.id);
    expect(updated?.status).toBe('timeout');
    expect(updated?.resolvedAt).toBeDefined();
  });

  it('should escalate to next level', async () => {
    const request = await store.createRequest({
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      notificationChannels: [],
      expiresAt: new Date(Date.now() - 1000),
      escalationPolicy: {
        timeoutMs: 5000,
        action: 'escalate',
        escalateToApprovers: ['approver-2', 'approver-3'],
      },
    });

    const result = await performEscalation(request, store);
    expect(result.escalated).toBe(true);
    expect(result.action).toBe('escalate');
    expect(result.notifyUsers).toContain('approver-2');
    expect(result.notifyUsers).toContain('approver-3');

    const updated = await store.getRequest(request.id);
    expect(updated?.status).toBe('escalated');
    expect(updated?.escalationCount).toBe(1);
  });

  it('should respect max escalation levels', () => {
    const request: ApprovalRequest = {
      id: 'apr-1',
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      status: 'pending',
      decisions: [],
      escalationCount: 3,
      notificationChannels: [],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
      escalationPolicy: {
        timeoutMs: 5000,
        action: 'escalate',
        maxEscalations: 3,
        escalateToApprovers: ['approver-2'],
      },
    };

    const result = checkEscalation(request);
    expect(result.shouldEscalate).toBe(true);
    expect(result.action).toBe('auto_reject');
  });
});

describe('ApprovalGate', () => {
  let store: InMemoryApprovalStore;
  let notifier: StubNotifier;

  beforeEach(() => {
    store = new InMemoryApprovalStore();
    notifier = new StubNotifier();
    setNotifier(notifier);
  });

  afterEach(() => {
    resetNotifier();
  });

  it('should create approval request', async () => {
    const config: ApprovalGateConfig = {
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      pollIntervalMs: 100,
      maxWaitMs: 1000,
    };

    const gate = new ApprovalGate(config, store);
    const waitPromise = gate.waitForApproval();

    // Give it time to create the request
    await new Promise(resolve => setTimeout(resolve, 50));

    const request = gate.getRequest();
    expect(request).toBeDefined();
    expect(request?.runId).toBe('run-1');
    expect(request?.stepId).toBe('step-1');

    // Approve to prevent hanging
    if (request) {
      await gate.approve('approver-1', 'LGTM');
    }

    await waitPromise;
  });

  it('should wait for approval with "any" policy', async () => {
    const config: ApprovalGateConfig = {
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1', 'approver-2'],
      policy: 'any',
      pollIntervalMs: 100,
      maxWaitMs: 5000,
    };

    const gate = new ApprovalGate(config, store);
    const waitPromise = gate.waitForApproval();

    // Wait for request to be created
    await new Promise(resolve => setTimeout(resolve, 150));

    // Approve
    await gate.approve('approver-1', 'LGTM');

    const result = await waitPromise;
    expect(result.approved).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.request.status).toBe('approved');
  });

  it('should wait for approval with "all" policy', async () => {
    const config: ApprovalGateConfig = {
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1', 'approver-2'],
      policy: 'all',
      pollIntervalMs: 100,
      maxWaitMs: 5000,
    };

    const gate = new ApprovalGate(config, store);
    const waitPromise = gate.waitForApproval();

    await new Promise(resolve => setTimeout(resolve, 150));

    // First approval - should not complete
    await gate.approve('approver-1', 'LGTM');
    await new Promise(resolve => setTimeout(resolve, 150));

    const request1 = gate.getRequest();
    expect(request1?.status).toBe('pending');

    // Second approval - should complete
    await gate.approve('approver-2', 'LGTM');

    const result = await waitPromise;
    expect(result.approved).toBe(true);
    expect(result.request.decisions).toHaveLength(2);
  });

  it('should handle rejection', async () => {
    const config: ApprovalGateConfig = {
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      pollIntervalMs: 100,
      maxWaitMs: 5000,
    };

    const gate = new ApprovalGate(config, store);
    const waitPromise = gate.waitForApproval();

    await new Promise(resolve => setTimeout(resolve, 150));

    // Reject
    await gate.reject('approver-1', 'Not ready');

    const result = await waitPromise;
    expect(result.approved).toBe(false);
    expect(result.request.status).toBe('rejected');
  });

  it('should send notifications', async () => {
    const config: ApprovalGateConfig = {
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1'],
      policy: 'any',
      pollIntervalMs: 100,
      maxWaitMs: 5000,
      notificationChannels: [
        {
          type: 'slack',
          config: { channel: '#approvals' },
          enabled: true,
        },
      ],
      context: {
        description: 'Deploy to production',
        riskLevel: 'high',
      },
    };

    const gate = new ApprovalGate(config, store);
    const waitPromise = gate.waitForApproval();

    await new Promise(resolve => setTimeout(resolve, 150));

    // Check notification was sent
    const sent = notifier.getSentNotifications();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].channel).toBe('slack');

    // Approve to finish
    await gate.approve('approver-1', 'LGTM');
    await waitPromise;
  });
});

describe('Notifier', () => {
  let notifier: StubNotifier;

  beforeEach(() => {
    notifier = new StubNotifier();
  });

  it('should send notification', async () => {
    const channel = {
      type: 'slack' as const,
      config: { channel: '#approvals' },
      enabled: true,
    };

    const message = {
      subject: 'Approval Required',
      body: 'Please review',
      approvalRequestId: 'apr-1',
      runId: 'run-1',
      recipients: ['user-1'],
    };

    const result = await notifier.send(channel, message);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('slack');
    expect(result.messageId).toBeDefined();
  });

  it('should send to multiple channels', async () => {
    const channels = [
      {
        type: 'slack' as const,
        config: { channel: '#approvals' },
        enabled: true,
      },
      {
        type: 'email' as const,
        config: { to: ['admin@example.com'] },
        enabled: true,
      },
    ];

    const message = {
      subject: 'Approval Required',
      body: 'Please review',
      approvalRequestId: 'apr-1',
      runId: 'run-1',
      recipients: ['user-1'],
    };

    const results = await notifier.sendToAll(channels, message);
    expect(results).toHaveLength(2);
    expect(results[0].channel).toBe('slack');
    expect(results[1].channel).toBe('email');
  });

  it('should skip disabled channels', async () => {
    const channels = [
      {
        type: 'slack' as const,
        config: { channel: '#approvals' },
        enabled: false,
      },
    ];

    const message = {
      subject: 'Approval Required',
      body: 'Please review',
      approvalRequestId: 'apr-1',
      runId: 'run-1',
      recipients: ['user-1'],
    };

    const results = await notifier.sendToAll(channels, message);
    expect(results).toHaveLength(0);
  });

  it('should create approval request notification', () => {
    const request: ApprovalRequest = {
      id: 'apr-1',
      runId: 'run-1',
      stepId: 'step-1',
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      approvers: ['approver-1', 'approver-2'],
      policy: 'any',
      status: 'pending',
      decisions: [],
      escalationCount: 0,
      notificationChannels: [],
      createdAt: new Date(),
      context: {
        description: 'Deploy to production',
        riskLevel: 'high',
        changes: [
          { file: 'app.ts', action: 'update', linesAdded: 10, linesDeleted: 5 },
        ],
      },
    };

    const message = createApprovalRequestNotification(request, 'created');
    expect(message.subject).toContain('Approval Required');
    expect(message.body).toContain('Deploy to production');
    expect(message.body).toContain('app.ts');
    expect(message.priority).toBe('high');
  });
});
