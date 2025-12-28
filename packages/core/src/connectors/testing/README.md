# Connector Testing Utilities

Comprehensive testing utilities for building and testing connectors in the Git With Intent platform.

## Overview

This testing framework provides everything you need to build robust, well-tested connectors:

1. **MockConnector** - Configurable mock connector for unit tests
2. **WebhookTestHarness** - Generate and verify webhook payloads
3. **Integration Helpers** - Test factories, mocks, and assertions
4. **Test Fixtures** - Sample API responses, webhooks, and configs

## Table of Contents

- [MockConnector](#mockconnector)
- [WebhookTestHarness](#webhooktestharness)
- [Integration Helpers](#integration-helpers)
- [Test Fixtures](#test-fixtures)
- [Complete Examples](#complete-examples)

---

## MockConnector

A flexible mock connector for unit testing with configurable responses, error simulation, and request tracking.

### Basic Usage

```typescript
import { MockConnector } from '@gwi/core/connectors/testing';
import { createTestContext } from '@gwi/core/connectors/testing';

// Create a mock connector
const mock = new MockConnector({
  id: 'test-connector',
  trackInvocations: true,
});

// Configure tool responses
mock.setToolResponse('getData', {
  data: { items: [1, 2, 3], count: 3 }
});

// Use in tests
const ctx = createTestContext();
const tool = mock.getTool('getData');
const result = await tool.invoke(ctx, {});

console.log(result); // { items: [1, 2, 3], count: 3 }
```

### Simulate Errors

```typescript
// Simulate authentication error
mock.setToolResponse('getData', {
  error: new Error('401 Unauthorized'),
  statusCode: 401
});

try {
  await tool.invoke(ctx, {});
} catch (error) {
  console.log(error.message); // '401 Unauthorized'
}
```

### Simulate Rate Limiting

```typescript
// Create mock with rate limit
const mock = new MockConnector({
  rateLimit: 5, // 5 requests per second
});

// First 5 requests succeed immediately
// 6th request waits ~200ms
for (let i = 0; i < 10; i++) {
  const start = Date.now();
  await tool.invoke(ctx, {});
  console.log(`Request ${i + 1}: ${Date.now() - start}ms`);
}
```

### Simulate Retries

```typescript
// Fail 2 times, then succeed
mock.setToolResponse('getData', {
  failureCount: 2,
  data: { success: true }
});

// First call: throws error "Simulated failure 1/2"
// Second call: throws error "Simulated failure 2/2"
// Third call: returns { success: true }
```

### Simulate Network Delays

```typescript
// Simulate slow API
mock.setToolResponse('getData', {
  delayMs: 5000, // 5-second delay
  data: { items: [] }
});

const start = Date.now();
await tool.invoke(ctx, {});
console.log(`Took ${Date.now() - start}ms`); // ~5000ms
```

### Assertions

```typescript
// Assert tool was called
mock.assertCalled('getData');

// Assert called specific number of times
mock.assertCalled('getData', 3);

// Assert called with specific input
mock.assertCalledWith('getData', { id: 123 });

// Assert NOT called
mock.assertNotCalled('deleteData');

// Get invocation history
const invocations = mock.getInvocations('getData');
console.log(invocations.length); // 3

// Get last invocation
const last = mock.getLastInvocation('getData');
console.log(last.input); // { id: 123 }
console.log(last.durationMs); // 12
```

---

## WebhookTestHarness

Generate valid webhook payloads with proper HMAC signatures for testing webhook handlers.

### GitHub Webhooks

```typescript
import { WebhookTestHarness } from '@gwi/core/connectors/testing';

const harness = new WebhookTestHarness();

// Generate PR opened webhook
const { payload, headers } = harness.github('pull_request', {
  owner: 'acme',
  repo: 'app',
  number: 42,
  action: 'opened'
});

console.log(headers['X-GitHub-Event']); // 'pull_request'
console.log(headers['X-Hub-Signature-256']); // 'sha256=abc123...'

// Send webhook to local endpoint
const response = await harness.sendWebhook(
  'http://localhost:3000/webhooks/github',
  payload,
  headers
);

console.log(response.status); // 200
```

### Verify Webhook Signatures

```typescript
// Server-side signature verification
function handleWebhook(req: Request) {
  const signature = req.headers.get('X-Hub-Signature-256');
  const payload = await req.text();

  const isValid = harness.verifySignature(
    payload,
    signature,
    { secret: process.env.WEBHOOK_SECRET, algorithm: 'sha256' }
  );

  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Process webhook...
}
```

### Generate Custom Webhooks

```typescript
// GitHub PR lifecycle (opened → commented → merged)
const events = harness.githubPRLifecycle('acme', 'app', 42, 'my-secret');

for (const { event, payload, headers } of events) {
  console.log(`Processing: ${event}`);
  await processWebhook(payload, headers);
}
```

### GitLab Webhooks

```typescript
// Generate GitLab merge request webhook
const { payload, headers } = harness.gitlab('Merge Request Hook', {
  owner: 'gitlab-org',
  repo: 'gitlab',
  number: 1,
  action: 'open'
});

console.log(headers['X-Gitlab-Event']); // 'Merge Request Hook'
console.log(headers['X-Gitlab-Token']); // Token-based auth (not HMAC)
```

### Batch Webhooks

```typescript
// Generate 10 similar webhooks
const batch = harness.generateBatch(10, () =>
  harness.github('push', { owner: 'acme', repo: 'app' })
);

console.log(batch.length); // 10
```

---

## Integration Helpers

Utilities for integration testing: test factories, mock services, and assertions.

### Test Tenant Factory

```typescript
import { createTestTenant } from '@gwi/core/connectors/testing';

const tenant = createTestTenant({
  orgName: 'acme-corp',
  userEmail: 'test@acme.com'
});

console.log(tenant.tenantId); // 'test-tenant-abc123...'
console.log(tenant.orgName); // 'acme-corp'
```

### Test Context Factory

```typescript
import { createTestContext } from '@gwi/core/connectors/testing';

// Without approval
const ctx = createTestContext();

// With approval
const ctxWithApproval = createTestContext({
  withApproval: true,
  approvalScope: ['commit', 'push']
});

console.log(ctxWithApproval.approval?.scope); // ['commit', 'push']
```

### Mock Secret Manager

```typescript
import { MockSecretManager } from '@gwi/core/connectors/testing';

const secretManager = new MockSecretManager();

// Store secrets
await secretManager.setSecret('github-token', 'ghp_abc123');
await secretManager.setSecret('slack-token', 'xoxb-123');

// Retrieve secrets
const token = await secretManager.getSecret('github-token');
console.log(token); // 'ghp_abc123'

// List secrets
const secrets = await secretManager.listSecrets();
console.log(secrets); // ['github-token', 'slack-token']

// Check existence
const exists = await secretManager.hasSecret('github-token');
console.log(exists); // true

// Delete secret
await secretManager.deleteSecret('github-token');
```

### Mock Pub/Sub

```typescript
import { MockPubSub } from '@gwi/core/connectors/testing';

const pubsub = new MockPubSub();

// Subscribe to topic
const unsubscribe = pubsub.subscribe('webhook-events', async (msg) => {
  const data = JSON.parse(msg.data);
  console.log('Received:', data.type);
});

// Publish message
await pubsub.publish('webhook-events', { type: 'pr.opened', pr: 42 });

// Wait for specific message
const message = await pubsub.waitForMessage(
  (msg) => JSON.parse(msg.data).type === 'pr.merged',
  5000 // 5-second timeout
);

// Clean up
unsubscribe();
pubsub.clearMessages();
```

### Test Data Generators

```typescript
import {
  generateRepo,
  generatePullRequest,
  generateIssue,
  generatePaginatedResponse
} from '@gwi/core/connectors/testing';

// Generate test repository
const repo = generateRepo({ owner: 'acme', name: 'app' });

// Generate test PR
const pr = generatePullRequest({ owner: 'acme', repo: 'app', number: 42 });

// Generate test issue
const issue = generateIssue({ state: 'closed' });

// Generate paginated response
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const page1 = generatePaginatedResponse(items, 1, 3);
console.log(page1.data); // [1, 2, 3]
console.log(page1.pagination.has_more); // true
```

### Assertion Utilities

```typescript
import {
  assertSchema,
  assertThrows,
  assertDeepEqual,
  waitFor
} from '@gwi/core/connectors/testing';
import { z } from 'zod';

// Schema validation
const UserSchema = z.object({ id: z.number(), name: z.string() });
assertSchema({ id: 1, name: 'Alice' }, UserSchema); // Passes
assertSchema({ id: 'invalid' }, UserSchema); // Throws

// Assert async throws
await assertThrows(
  async () => { throw new Error('Unauthorized'); },
  'Unauthorized'
);

// Deep equality
assertDeepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } });

// Wait for condition
let ready = false;
setTimeout(() => { ready = true; }, 100);
await waitFor(() => ready, { timeoutMs: 5000 });
```

---

## Test Fixtures

Pre-built sample data for common scenarios.

### GitHub API Responses

```typescript
import { fixtures } from '@gwi/core/connectors/testing';

// Sample repository
console.log(fixtures.githubRepo.name); // 'hello-world'

// Sample pull request
console.log(fixtures.githubPullRequest.number); // 42

// Sample issue
console.log(fixtures.githubIssue.title); // 'Bug: Login fails with OAuth'

// Sample commit
console.log(fixtures.githubCommit.sha); // 'a1b2c3d4...'

// Sample review
console.log(fixtures.githubReview.state); // 'APPROVED'

// Paginated responses
console.log(fixtures.githubReposPage1.pagination.has_more); // true
console.log(fixtures.githubReposPage2.data.length); // 2

// Error responses
console.log(fixtures.githubErrors.unauthorized.message); // 'Bad credentials'
console.log(fixtures.githubErrors.rateLimited.message); // 'API rate limit exceeded...'
```

### Webhook Payloads

```typescript
import { fixtures } from '@gwi/core/connectors/testing';

// GitHub PR opened
console.log(fixtures.githubPROpened.action); // 'opened'
console.log(fixtures.githubPROpened.number); // 42

// GitHub PR synchronized (new commits)
console.log(fixtures.githubPRSynchronize.action); // 'synchronize'

// GitHub PR merged
console.log(fixtures.githubPRMerged.pull_request.merged); // true

// GitHub push
console.log(fixtures.githubPush.commits.length); // 1

// GitLab merge request
console.log(fixtures.gitlabMROpened.object_kind); // 'merge_request'
```

### Connector Configurations

```typescript
import { fixtures } from '@gwi/core/connectors/testing';

// GitHub connector config
const githubConfig = fixtures.githubConnectorConfig;
console.log(githubConfig.auth.token); // 'ghp_test123...'
console.log(githubConfig.rateLimits.core); // 5000

// Slack connector config
const slackConfig = fixtures.slackConnectorConfig;
console.log(slackConfig.auth.accessToken); // 'xoxb-test...'

// Webhook config
const webhookConfig = fixtures.githubWebhookConfig;
console.log(webhookConfig.secret); // 'webhook_secret_test...'
```

---

## Complete Examples

### Example 1: Unit Test with MockConnector

```typescript
import { describe, test, expect } from 'vitest';
import { MockConnector, createTestContext } from '@gwi/core/connectors/testing';

describe('MyConnector', () => {
  test('fetches data successfully', async () => {
    // Setup
    const mock = new MockConnector({ trackInvocations: true });
    mock.setToolResponse('fetchData', {
      data: { items: [1, 2, 3], total: 3 }
    });

    // Execute
    const ctx = createTestContext();
    const tool = mock.getTool('fetchData');
    const result = await tool.invoke(ctx, { filter: 'active' });

    // Assert
    expect(result).toEqual({ items: [1, 2, 3], total: 3 });
    mock.assertCalledWith('fetchData', { filter: 'active' });
  });

  test('handles rate limit with retry', async () => {
    const mock = new MockConnector();
    mock.setToolResponse('fetchData', {
      failureCount: 2, // Fail twice
      data: { items: [] }
    });

    const ctx = createTestContext();
    const tool = mock.getTool('fetchData');

    // First call throws
    await expect(tool.invoke(ctx, {})).rejects.toThrow('Simulated failure 1/2');

    // Second call throws
    await expect(tool.invoke(ctx, {})).rejects.toThrow('Simulated failure 2/2');

    // Third call succeeds
    const result = await tool.invoke(ctx, {});
    expect(result).toEqual({ items: [] });
  });
});
```

### Example 2: Webhook Integration Test

```typescript
import { describe, test, expect } from 'vitest';
import { WebhookTestHarness } from '@gwi/core/connectors/testing';

describe('Webhook Handler', () => {
  test('processes GitHub PR opened webhook', async () => {
    const harness = new WebhookTestHarness();

    // Generate webhook
    const { payload, headers } = harness.github('pull_request', {
      owner: 'acme',
      repo: 'app',
      number: 42,
      action: 'opened'
    });

    // Verify signature
    const isValid = harness.verifySignature(
      payload,
      headers['X-Hub-Signature-256'],
      { secret: 'test-secret', algorithm: 'sha256' }
    );
    expect(isValid).toBe(true);

    // Parse payload
    const event = JSON.parse(payload);
    expect(event.action).toBe('opened');
    expect(event.pull_request.number).toBe(42);
  });

  test('rejects invalid signature', () => {
    const harness = new WebhookTestHarness();
    const payload = '{"test": true}';
    const fakeSignature = 'sha256=fakehash123';

    const isValid = harness.verifySignature(
      payload,
      fakeSignature,
      { secret: 'test-secret', algorithm: 'sha256' }
    );

    expect(isValid).toBe(false);
  });
});
```

### Example 3: Full Integration Test

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  MockConnector,
  MockSecretManager,
  MockPubSub,
  createTestTenant,
  createTestContext,
  generatePullRequest,
} from '@gwi/core/connectors/testing';

describe('PR Automation Integration', () => {
  let secretManager: MockSecretManager;
  let pubsub: MockPubSub;
  let connector: MockConnector;

  beforeEach(() => {
    secretManager = new MockSecretManager();
    pubsub = new MockPubSub();
    connector = new MockConnector({ trackInvocations: true });
  });

  afterEach(() => {
    secretManager.clear();
    pubsub.clearMessages();
    connector.clearInvocations();
  });

  test('end-to-end PR triage flow', async () => {
    // Setup
    const tenant = createTestTenant({ orgName: 'acme' });
    await secretManager.setSecret('github-token', 'ghp_test123');

    const pr = generatePullRequest({ owner: 'acme', repo: 'app', number: 42 });

    connector.setToolResponse('getPR', { data: pr });
    connector.setToolResponse('analyzePR', {
      data: { complexity: 'medium', filesChanged: 8 }
    });

    // Subscribe to events
    const events: string[] = [];
    pubsub.subscribe('pr-events', async (msg) => {
      events.push(JSON.parse(msg.data).type);
    });

    // Execute
    const ctx = createTestContext({ tenantId: tenant.tenantId });

    const prData = await connector.getTool('getPR').invoke(ctx, { number: 42 });
    await pubsub.publish('pr-events', { type: 'pr.fetched', pr: prData });

    const analysis = await connector.getTool('analyzePR').invoke(ctx, { pr: prData });
    await pubsub.publish('pr-events', { type: 'pr.analyzed', analysis });

    // Assert
    connector.assertCalled('getPR', 1);
    connector.assertCalled('analyzePR', 1);
    expect(events).toEqual(['pr.fetched', 'pr.analyzed']);
    expect(analysis.data.complexity).toBe('medium');
  });
});
```

---

## Best Practices

### 1. Use Realistic Mock Data

Instead of minimal stubs, use realistic data from `fixtures`:

```typescript
// ❌ Bad
mock.setToolResponse('getRepo', { data: { name: 'test' } });

// ✅ Good
import { fixtures } from '@gwi/core/connectors/testing';
mock.setToolResponse('getRepo', { data: fixtures.githubRepo });
```

### 2. Test Error Scenarios

```typescript
// Test authentication errors
mock.setToolResponse('fetchData', {
  error: new Error('401 Unauthorized'),
  statusCode: 401
});

// Test rate limiting
mock.setToolResponse('fetchData', {
  error: new Error('429 Rate limit exceeded'),
  statusCode: 429
});

// Test network errors
mock.setToolResponse('fetchData', {
  error: new Error('ECONNRESET'),
  delayMs: 5000
});
```

### 3. Test Pagination

```typescript
import { generatePaginatedResponse } from '@gwi/core/connectors/testing';

const allItems = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));

mock.setToolResponse('getItems', {
  data: generatePaginatedResponse(allItems, 1, 100)
});

// Test pagination loop
let page = 1;
let allFetched = [];
while (true) {
  const result = await fetchPage(page);
  allFetched.push(...result.data);
  if (!result.pagination.has_more) break;
  page++;
}

expect(allFetched).toHaveLength(250);
```

### 4. Verify Signatures in Production

```typescript
// In production webhook handler
const harness = new WebhookTestHarness();

function handleWebhook(req: Request) {
  const signature = req.headers.get('X-Hub-Signature-256');
  const payload = await req.text();

  if (!harness.verifySignature(payload, signature, {
    secret: process.env.WEBHOOK_SECRET,
    algorithm: 'sha256'
  })) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Process webhook safely...
}
```

### 5. Clean Up After Tests

```typescript
afterEach(() => {
  mock.clearInvocations();
  secretManager.clear();
  pubsub.clearMessages();
});
```

---

## API Reference

See individual module documentation:

- [MockConnector](./mock-connector.ts)
- [WebhookTestHarness](./webhook-harness.ts)
- [Integration Helpers](./helpers.ts)
- [Test Fixtures](./fixtures/)

---

## Contributing

When adding new test utilities:

1. Add comprehensive JSDoc comments
2. Include usage examples in docstrings
3. Add realistic test fixtures
4. Update this README

---

## License

Part of Git With Intent - see LICENSE in root directory.
