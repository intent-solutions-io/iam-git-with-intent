/**
 * WebhookTestHarness Tests
 *
 * @module @gwi/core/connectors/testing/__tests__
 */

import { describe, test, expect } from 'vitest';
import { WebhookTestHarness } from '../webhook-harness.js';

describe('WebhookTestHarness', () => {
  const harness = new WebhookTestHarness();

  describe('GitHub webhooks', () => {
    test('generates pull_request opened webhook', () => {
      const { payload, headers } = harness.github('pull_request', {
        owner: 'acme',
        repo: 'app',
        number: 42,
        action: 'opened',
      });

      expect(headers['X-GitHub-Event']).toBe('pull_request');
      expect(headers['X-Hub-Signature-256']).toMatch(/^sha256=/);
      expect(headers['Content-Type']).toBe('application/json');

      const event = JSON.parse(payload);
      expect(event.action).toBe('opened');
      expect(event.pull_request.number).toBe(42);
      expect(event.repository.full_name).toBe('acme/app');
    });

    test('generates push webhook', () => {
      const { payload, headers } = harness.github('push', {
        owner: 'acme',
        repo: 'app',
      });

      expect(headers['X-GitHub-Event']).toBe('push');

      const event = JSON.parse(payload);
      expect(event.ref).toBe('refs/heads/main');
      expect(event.commits).toBeInstanceOf(Array);
    });

    test('generates issue comment webhook', () => {
      const { payload, headers } = harness.github('issue_comment', {
        owner: 'acme',
        repo: 'app',
        number: 123,
        action: 'created',
      });

      expect(headers['X-GitHub-Event']).toBe('issue_comment');

      const event = JSON.parse(payload);
      expect(event.action).toBe('created');
      expect(event.issue.number).toBe(123);
      expect(event.comment).toBeDefined();
    });
  });

  describe('GitLab webhooks', () => {
    test('generates merge request webhook', () => {
      const { payload, headers } = harness.gitlab('Merge Request Hook', {
        owner: 'gitlab-org',
        repo: 'gitlab',
        number: 1,
        action: 'open',
      });

      expect(headers['X-Gitlab-Event']).toBe('Merge Request Hook');
      expect(headers['X-Gitlab-Token']).toBeDefined();

      const event = JSON.parse(payload);
      expect(event.object_kind).toBe('merge_request');
      expect(event.object_attributes.iid).toBe(1);
    });

    test('generates push webhook', () => {
      const { payload, headers } = harness.gitlab('Push Hook', {
        owner: 'gitlab-org',
        repo: 'gitlab',
      });

      expect(headers['X-Gitlab-Event']).toBe('Push Hook');

      const event = JSON.parse(payload);
      expect(event.object_kind).toBe('push');
      expect(event.ref).toBe('refs/heads/main');
    });
  });

  describe('Signature generation and verification', () => {
    test('generates valid HMAC signature', () => {
      const payload = '{"test": true}';
      const signature = harness.generateSignature(payload, {
        secret: 'my-secret',
        algorithm: 'sha256',
      });

      expect(signature).toMatch(/^sha256=/);
      expect(signature.length).toBeGreaterThan(10);
    });

    test('verifies valid signature', () => {
      const payload = '{"test": true}';
      const signature = harness.generateSignature(payload, {
        secret: 'my-secret',
        algorithm: 'sha256',
      });

      const isValid = harness.verifySignature(payload, signature, {
        secret: 'my-secret',
        algorithm: 'sha256',
      });

      expect(isValid).toBe(true);
    });

    test('rejects invalid signature', () => {
      const payload = '{"test": true}';
      const isValid = harness.verifySignature(
        payload,
        'sha256=fakehash123',
        {
          secret: 'my-secret',
          algorithm: 'sha256',
        }
      );

      expect(isValid).toBe(false);
    });

    test('rejects signature with wrong secret', () => {
      const payload = '{"test": true}';
      const signature = harness.generateSignature(payload, {
        secret: 'secret-1',
        algorithm: 'sha256',
      });

      const isValid = harness.verifySignature(payload, signature, {
        secret: 'secret-2',
        algorithm: 'sha256',
      });

      expect(isValid).toBe(false);
    });
  });

  describe('PR lifecycle', () => {
    test('generates PR lifecycle events', () => {
      const events = harness.githubPRLifecycle('acme', 'app', 42, 'my-secret');

      expect(events).toHaveLength(4);
      expect(events[0].event).toBe('PR opened');
      expect(events[1].event).toBe('Comment added');
      expect(events[2].event).toBe('Review submitted');
      expect(events[3].event).toBe('PR merged');

      events.forEach((event) => {
        expect(event.payload).toBeDefined();
        expect(event.headers['X-Hub-Signature-256']).toMatch(/^sha256=/);
      });
    });
  });

  describe('Batch generation', () => {
    test('generates batch of webhooks', () => {
      const batch = harness.generateBatch(5, () =>
        harness.github('push', { owner: 'acme', repo: 'app' })
      );

      expect(batch).toHaveLength(5);
      batch.forEach((item) => {
        expect(item.payload).toBeDefined();
        expect(item.headers['X-GitHub-Event']).toBe('push');
      });
    });
  });
});
