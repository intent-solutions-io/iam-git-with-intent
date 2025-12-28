/**
 * Integration Test Helpers
 *
 * Provides utilities for integration testing connectors:
 * - Test tenant factories
 * - Mock Secret Manager
 * - Mock Pub/Sub
 * - Test data fixtures
 * - Assertion utilities
 *
 * @module @gwi/core/connectors/testing
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import type { ToolContext } from '../types.js';

// =============================================================================
// Test Tenant Factory
// =============================================================================

/**
 * Options for creating a test tenant
 */
export interface TestTenantOptions {
  /** Tenant ID (auto-generated if not provided) */
  tenantId?: string;

  /** Organization name */
  orgName?: string;

  /** User ID */
  userId?: string;

  /** User email */
  userEmail?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Test tenant data
 */
export interface TestTenant {
  tenantId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Create a test tenant for integration tests
 *
 * @example
 * ```typescript
 * const tenant = createTestTenant({
 *   orgName: 'acme-corp',
 *   userEmail: 'test@acme.com'
 * });
 * ```
 */
export function createTestTenant(options: TestTenantOptions = {}): TestTenant {
  const tenantId = options.tenantId ?? `test-tenant-${crypto.randomBytes(8).toString('hex')}`;
  const orgName = options.orgName ?? `test-org-${Date.now()}`;
  const userId = options.userId ?? `user-${crypto.randomBytes(8).toString('hex')}`;
  const userEmail = options.userEmail ?? `${userId}@example.com`;

  return {
    tenantId,
    orgName,
    userId,
    userEmail,
    createdAt: new Date().toISOString(),
    metadata: options.metadata ?? {},
  };
}

// =============================================================================
// Test Context Factory
// =============================================================================

/**
 * Options for creating a test tool context
 */
export interface TestContextOptions {
  /** Run ID (auto-generated if not provided) */
  runId?: string;

  /** Tenant ID (auto-generated if not provided) */
  tenantId?: string;

  /** Include approval record */
  withApproval?: boolean;

  /** Approval scope */
  approvalScope?: Array<'commit' | 'push' | 'open_pr' | 'merge'>;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create a test tool context for integration tests
 *
 * @example
 * ```typescript
 * const ctx = createTestContext({
 *   withApproval: true,
 *   approvalScope: ['commit', 'push']
 * });
 * ```
 */
export function createTestContext(options: TestContextOptions = {}): ToolContext {
  const runId = options.runId ?? crypto.randomUUID();
  const tenantId = options.tenantId ?? `test-tenant-${crypto.randomBytes(8).toString('hex')}`;

  const ctx: ToolContext = {
    runId,
    tenantId,
    metadata: options.metadata,
  };

  if (options.withApproval) {
    ctx.approval = {
      runId,
      approvedAt: new Date().toISOString(),
      approvedBy: `user-${crypto.randomBytes(8).toString('hex')}`,
      scope: options.approvalScope ?? ['commit'],
      patchHash: crypto.randomBytes(32).toString('hex'),
      comment: 'Test approval',
    };
  }

  return ctx;
}

// =============================================================================
// Mock Secret Manager
// =============================================================================

/**
 * Mock Secret Manager for testing
 *
 * Stores secrets in memory for testing purposes.
 *
 * @example
 * ```typescript
 * const secretManager = new MockSecretManager();
 * await secretManager.setSecret('github-token', 'ghp_abc123');
 * const token = await secretManager.getSecret('github-token');
 * ```
 */
export class MockSecretManager {
  private secrets = new Map<string, string>();

  /**
   * Store a secret
   */
  async setSecret(name: string, value: string): Promise<void> {
    this.secrets.set(name, value);
  }

  /**
   * Retrieve a secret
   */
  async getSecret(name: string): Promise<string | undefined> {
    return this.secrets.get(name);
  }

  /**
   * Delete a secret
   */
  async deleteSecret(name: string): Promise<void> {
    this.secrets.delete(name);
  }

  /**
   * List all secret names
   */
  async listSecrets(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }

  /**
   * Clear all secrets
   */
  clear(): void {
    this.secrets.clear();
  }

  /**
   * Check if a secret exists
   */
  async hasSecret(name: string): Promise<boolean> {
    return this.secrets.has(name);
  }
}

// =============================================================================
// Mock Pub/Sub
// =============================================================================

/**
 * Pub/Sub message
 */
export interface PubSubMessage {
  id: string;
  data: string;
  attributes: Record<string, string>;
  publishTime: string;
}

/**
 * Pub/Sub subscription handler
 */
export type PubSubHandler = (message: PubSubMessage) => Promise<void>;

/**
 * Mock Pub/Sub for testing
 *
 * Provides in-memory pub/sub for testing event-driven connectors.
 *
 * @example
 * ```typescript
 * const pubsub = new MockPubSub();
 * pubsub.subscribe('webhook-events', async (msg) => {
 *   console.log('Received:', JSON.parse(msg.data));
 * });
 * await pubsub.publish('webhook-events', { type: 'pr.opened' });
 * ```
 */
export class MockPubSub {
  private subscriptions = new Map<string, Set<PubSubHandler>>();
  private messages: PubSubMessage[] = [];

  /**
   * Publish a message to a topic
   */
  async publish(
    topic: string,
    data: unknown,
    attributes: Record<string, string> = {}
  ): Promise<string> {
    const message: PubSubMessage = {
      id: crypto.randomUUID(),
      data: JSON.stringify(data),
      attributes,
      publishTime: new Date().toISOString(),
    };

    this.messages.push(message);

    const handlers = this.subscriptions.get(topic);
    if (handlers) {
      await Promise.all(Array.from(handlers).map((handler) => handler(message)));
    }

    return message.id;
  }

  /**
   * Subscribe to a topic
   */
  subscribe(topic: string, handler: PubSubHandler): () => void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(topic)?.delete(handler);
    };
  }

  /**
   * Get all messages published to a topic
   */
  getMessages(topic?: string): PubSubMessage[] {
    if (topic) {
      // Filter by topic (stored in attributes)
      return this.messages.filter((msg) => msg.attributes.topic === topic);
    }
    return [...this.messages];
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  /**
   * Wait for a message matching a predicate
   */
  async waitForMessage(
    predicate: (msg: PubSubMessage) => boolean,
    timeoutMs = 5000
  ): Promise<PubSubMessage> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const match = this.messages.find(predicate);
      if (match) return match;
      await sleep(50);
    }

    throw new Error('Timeout waiting for message');
  }
}

// =============================================================================
// Test Data Generators
// =============================================================================

/**
 * Generate a random GitHub repository
 */
export function generateRepo(overrides: Partial<{
  owner: string;
  name: string;
  id: number;
}> = {}) {
  const owner = overrides.owner ?? 'octocat';
  const name = overrides.name ?? `repo-${crypto.randomBytes(4).toString('hex')}`;
  const id = overrides.id ?? Math.floor(Math.random() * 1000000);

  return {
    id,
    name,
    full_name: `${owner}/${name}`,
    owner: { login: owner, id: Math.floor(Math.random() * 100000) },
    private: false,
    description: `Test repository: ${name}`,
    html_url: `https://github.com/${owner}/${name}`,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Generate a random GitHub pull request
 */
export function generatePullRequest(overrides: Partial<{
  owner: string;
  repo: string;
  number: number;
  state: 'open' | 'closed';
  merged: boolean;
}> = {}) {
  const owner = overrides.owner ?? 'octocat';
  const repo = overrides.repo ?? 'hello-world';
  const number = overrides.number ?? Math.floor(Math.random() * 1000);
  const state = overrides.state ?? 'open';

  return {
    id: number * 1000,
    number,
    state,
    title: `Test PR #${number}`,
    body: 'This is a test pull request',
    user: { login: 'test-user', id: 12345 },
    head: {
      ref: 'feature-branch',
      sha: crypto.randomBytes(20).toString('hex'),
    },
    base: {
      ref: 'main',
      sha: crypto.randomBytes(20).toString('hex'),
    },
    mergeable: state === 'open',
    merged: overrides.merged ?? false,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

/**
 * Generate a random GitHub issue
 */
export function generateIssue(overrides: Partial<{
  owner: string;
  repo: string;
  number: number;
  state: 'open' | 'closed';
}> = {}) {
  const owner = overrides.owner ?? 'octocat';
  const repo = overrides.repo ?? 'hello-world';
  const number = overrides.number ?? Math.floor(Math.random() * 1000);
  const state = overrides.state ?? 'open';

  return {
    id: number * 1000,
    number,
    state,
    title: `Test Issue #${number}`,
    body: 'This is a test issue',
    user: { login: 'test-user', id: 12345 },
    labels: [],
    assignees: [],
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    html_url: `https://github.com/${owner}/${repo}/issues/${number}`,
  };
}

/**
 * Generate a paginated response
 */
export function generatePaginatedResponse<T>(
  items: T[],
  page: number,
  perPage: number
): {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    has_more: boolean;
    next_cursor?: string;
  };
} {
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const paginatedItems = items.slice(start, end);
  const hasMore = end < items.length;

  return {
    data: paginatedItems,
    pagination: {
      page,
      per_page: perPage,
      total: items.length,
      has_more: hasMore,
      next_cursor: hasMore ? `cursor-${page + 1}` : undefined,
    },
  };
}

// =============================================================================
// Assertion Utilities
// =============================================================================

/**
 * Assert that a value matches a Zod schema
 */
export function assertSchema<T extends z.ZodTypeAny>(
  value: unknown,
  schema: T
): asserts value is z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Schema validation failed: ${JSON.stringify(result.error.issues, null, 2)}`
    );
  }
}

/**
 * Assert that an async function throws
 */
export async function assertThrows(
  fn: () => Promise<unknown>,
  expectedError?: string | RegExp
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (expectedError) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof expectedError === 'string') {
        if (!message.includes(expectedError)) {
          throw new Error(
            `Expected error message to include "${expectedError}", but got: ${message}`
          );
        }
      } else if (!expectedError.test(message)) {
        throw new Error(
          `Expected error message to match ${expectedError}, but got: ${message}`
        );
      }
    }
  }
}

/**
 * Assert that two objects are deeply equal
 */
export function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  message?: string
): void {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);

  if (actualStr !== expectedStr) {
    throw new Error(
      message ??
        `Expected:\n${expectedStr}\n\nActual:\n${actualStr}`
    );
  }
}

/**
 * Wait for a condition to become true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    message?: string;
  } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 100;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await sleep(intervalMs);
  }

  throw new Error(
    options.message ?? `Timeout waiting for condition after ${timeoutMs}ms`
  );
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Types are already exported via the interface/type declarations above
// No need for re-export
