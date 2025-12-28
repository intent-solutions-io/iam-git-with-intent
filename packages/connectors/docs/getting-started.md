# Getting Started with @gwi/connectors

This guide walks you through installing the connector framework, creating your first connector, and running tests.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Quick Start Example](#quick-start-example)
4. [Your First Connector](#your-first-connector)
5. [Running Tests](#running-tests)
6. [Common Patterns](#common-patterns)
7. [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20+** installed
- **npm 9+** or compatible package manager
- **TypeScript 5.x** knowledge
- Access to at least one data source API (GitHub, GitLab, etc.)

### Development Tools

```bash
# Verify Node.js version
node --version  # Should be 20.x or higher

# Verify npm version
npm --version   # Should be 9.x or higher
```

---

## Installation

### Option 1: Using in Git With Intent Monorepo

If you're working within the GWI monorepo:

```bash
# From repository root
cd git-with-intent

# Install all dependencies
npm install

# Build the connectors package
npx turbo run build --filter=@gwi/connectors
```

### Option 2: Standalone Package

```bash
npm install @gwi/connectors
```

### Verify Installation

```typescript
import { ConnectorRegistry } from '@gwi/connectors';

const registry = new ConnectorRegistry();
console.log('Connector framework installed successfully!');
```

---

## Quick Start Example

Let's sync some GitHub pull requests in under 50 lines of code:

```typescript
// sync-github-prs.ts
import {
  ConnectorRegistry,
  GitHubConnector,
  BearerTokenAuth
} from '@gwi/connectors';

async function main() {
  // 1. Create the registry
  const registry = new ConnectorRegistry();

  // 2. Register the GitHub connector
  registry.register('github', (config) => new GitHubConnector(config));

  // 3. Get a configured connector instance
  const github = await registry.get('github', {
    tenantId: 'my-org',
    config: {
      tenantId: 'my-org',
      auth: {
        type: 'bearer',
        token: process.env.GITHUB_TOKEN!
      }
    }
  });

  // 4. Check health
  const health = await github.healthCheck();
  console.log(`GitHub connector health: ${health.healthy ? 'OK' : 'UNHEALTHY'}`);

  if (!health.healthy) {
    console.error('Health check failed:', health.error);
    process.exit(1);
  }

  // 5. Sync pull requests
  console.log('Syncing pull requests...');
  let count = 0;

  for await (const record of github.sync({
    resources: [{ type: 'repository', id: 'owner/repo' }],
    types: ['pull_request'],
    limit: 10  // Limit to 10 for quick demo
  })) {
    count++;
    console.log(`[${count}] PR #${record.data.number}: ${record.data.title}`);
  }

  console.log(`\nSynced ${count} pull requests.`);
}

main().catch(console.error);
```

Run it:

```bash
GITHUB_TOKEN=your_github_token npx ts-node sync-github-prs.ts
```

---

## Your First Connector

Let's build a simple REST API connector step by step.

### Step 1: Create the Connector Class

```typescript
// my-connector.ts
import {
  BaseConnector,
  IConnector,
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata
} from '@gwi/connectors';
import { z } from 'zod';

// Define config schema
const MyConnectorConfigSchema = z.object({
  tenantId: z.string(),
  auth: z.object({
    type: z.literal('bearer'),
    token: z.string().min(1)
  }),
  baseUrl: z.string().url().optional()
});

export class MyConnector extends BaseConnector implements IConnector {
  readonly name = 'my-connector';
  readonly version = '1.0.0';
  readonly configSchema = MyConnectorConfigSchema;

  private token: string = '';
  private baseUrl: string = 'https://api.example.com';

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    // Validate config
    const validated = this.configSchema.parse(config);

    // Store credentials
    this.token = validated.auth.token;
    if (validated.baseUrl) {
      this.baseUrl = validated.baseUrl;
    }

    // Test connection
    try {
      const response = await this.httpClient.get(`${this.baseUrl}/me`, {
        headers: this.getAuthHeaders()
      });

      return {
        success: true,
        token: this.token,
        metadata: { user: response.data }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const checks = [];
    const startTime = Date.now();

    // Check authentication
    try {
      await this.httpClient.get(`${this.baseUrl}/me`, {
        headers: this.getAuthHeaders()
      });
      checks.push({
        name: 'auth_valid',
        status: 'pass' as const,
        durationMs: Date.now() - startTime
      });
    } catch (error) {
      checks.push({
        name: 'auth_valid',
        status: 'fail' as const,
        durationMs: Date.now() - startTime,
        error: error.message
      });
    }

    // Check API reachability
    const apiCheckStart = Date.now();
    try {
      await this.httpClient.get(`${this.baseUrl}/health`);
      checks.push({
        name: 'api_reachable',
        status: 'pass' as const,
        durationMs: Date.now() - apiCheckStart
      });
    } catch (error) {
      checks.push({
        name: 'api_reachable',
        status: 'fail' as const,
        durationMs: Date.now() - apiCheckStart,
        error: error.message
      });
    }

    return {
      healthy: checks.every(c => c.status === 'pass'),
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks
    };
  }

  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    this.log('info', 'Starting sync', { options });

    let cursor: string | null = null;
    let totalRecords = 0;

    do {
      // Fetch page with retry
      const response = await this.retryRequest(async () => {
        const url = `${this.baseUrl}/items`;
        const params: Record<string, string> = { limit: '100' };
        if (cursor) {
          params.cursor = cursor;
        }

        return await this.httpClient.get(url, {
          headers: this.getAuthHeaders(),
          params
        });
      });

      // Yield records one at a time
      for (const item of response.data.items) {
        totalRecords++;

        yield {
          id: item.id,
          type: 'item',
          source: this.name,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          data: item
        };

        // Check limit
        if (options.limit && totalRecords >= options.limit) {
          return;
        }
      }

      // Get next cursor
      cursor = response.data.next_cursor || null;

    } while (cursor);

    this.log('info', 'Sync completed', { totalRecords });
  }

  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    // Verify signature
    if (!this.verifyWebhookSignature(event)) {
      throw new ValidationError(
        'Invalid webhook signature',
        this.name,
        []
      );
    }

    // Process event
    this.log('info', 'Processing webhook', {
      type: event.type,
      id: event.id
    });

    // Handle different event types
    let recordsProcessed = 0;
    switch (event.type) {
      case 'item.created':
      case 'item.updated':
        await this.handleItemEvent(event.payload);
        recordsProcessed = 1;
        break;
      default:
        this.log('warn', 'Unknown event type', { type: event.type });
    }

    return {
      success: true,
      durationMs: Date.now() - startTime,
      recordsProcessed
    };
  }

  getMetadata(): ConnectorMetadata {
    return {
      name: this.name,
      version: this.version,
      recordTypes: ['item'],
      authMethods: ['bearer'],
      supportsIncremental: true,
      supportsWebhooks: true,
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerHour: 1000
      },
      capabilities: ['sync', 'webhooks', 'incremental']
    };
  }

  // Private helpers
  private getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  private verifyWebhookSignature(event: WebhookEvent): boolean {
    // Implement HMAC verification
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) return false;

    const expectedSignature = this.computeHmac(
      JSON.stringify(event.payload),
      secret
    );

    return event.signature === expectedSignature;
  }

  private async handleItemEvent(payload: any): Promise<void> {
    // Process item event
    await this.storage.saveRecords([{
      id: payload.id,
      type: 'item',
      source: this.name,
      createdAt: payload.created_at,
      updatedAt: payload.updated_at,
      data: payload
    }]);
  }

  private computeHmac(payload: string, secret: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}
```

### Step 2: Register Your Connector

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { MyConnector } from './my-connector';

const registry = new ConnectorRegistry();

registry.register('my-connector', (config) => new MyConnector(config));

export { registry };
```

### Step 3: Write Tests

```typescript
// my-connector.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MyConnector } from './my-connector';
import { MockHttpClient, MockStorage, MockLogger } from '@gwi/connectors/testing';

describe('MyConnector', () => {
  let connector: MyConnector;
  let mockHttpClient: MockHttpClient;

  beforeEach(() => {
    mockHttpClient = new MockHttpClient();
    connector = new MyConnector();
    connector.httpClient = mockHttpClient;
  });

  describe('authenticate', () => {
    it('should authenticate with valid token', async () => {
      mockHttpClient.get.mockResolvedValue({
        data: { id: '1', name: 'Test User' }
      });

      const result = await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'valid-token' }
      });

      expect(result.success).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/me'),
        expect.any(Object)
      );
    });

    it('should fail with invalid token', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Unauthorized'));

      const result = await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'invalid-token' }
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { ok: true } });

      const status = await connector.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.checks.length).toBeGreaterThan(0);
      expect(status.checks.every(c => c.status === 'pass')).toBe(true);
    });
  });

  describe('sync', () => {
    it('should yield records from paginated API', async () => {
      // Mock two pages of results
      mockHttpClient.get
        .mockResolvedValueOnce({
          data: {
            items: [{ id: '1', name: 'Item 1' }],
            next_cursor: 'cursor-1'
          }
        })
        .mockResolvedValueOnce({
          data: {
            items: [{ id: '2', name: 'Item 2' }],
            next_cursor: null
          }
        });

      const records = [];
      for await (const record of connector.sync({})) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].id).toBe('1');
      expect(records[1].id).toBe('2');
    });

    it('should respect limit option', async () => {
      mockHttpClient.get.mockResolvedValue({
        data: {
          items: [
            { id: '1' },
            { id: '2' },
            { id: '3' },
            { id: '4' },
            { id: '5' }
          ],
          next_cursor: 'more-data'
        }
      });

      const records = [];
      for await (const record of connector.sync({ limit: 3 })) {
        records.push(record);
      }

      expect(records).toHaveLength(3);
    });
  });
});
```

---

## Running Tests

### Unit Tests

```bash
# Run all connector tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- my-connector.test.ts

# Watch mode for development
npm test -- --watch
```

### Integration Tests

Integration tests require real API tokens:

```bash
# Set environment variables
export GITHUB_TOKEN=your_github_token
export MY_API_TOKEN=xxx

# Run integration tests
npm run test:integration
```

### Contract Tests

Verify output schemas match expectations:

```bash
npm run test:contracts
```

---

## Common Patterns

### Pattern 1: Incremental Sync

Only fetch records updated since last sync:

```typescript
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  // Get last sync cursor from storage
  const state = await this.storage.loadState(this.name);
  const since = options.incremental?.startCursor || state?.lastSyncCursor;

  let cursor: string | null = null;
  let latestTimestamp: string | null = null;

  do {
    const response = await this.httpClient.get('/items', {
      params: {
        since,
        cursor,
        limit: 100
      }
    });

    for (const item of response.data.items) {
      yield this.toRecord(item);

      // Track latest timestamp
      if (!latestTimestamp || item.updated_at > latestTimestamp) {
        latestTimestamp = item.updated_at;
      }
    }

    cursor = response.data.next_cursor;
  } while (cursor);

  // Save cursor for next sync
  if (latestTimestamp) {
    await this.storage.saveState(this.name, {
      lastSyncCursor: latestTimestamp,
      lastSyncTime: new Date().toISOString(),
      totalRecordsSynced: this.recordCount
    });
  }
}
```

### Pattern 2: Error Handling

Handle specific error types gracefully:

```typescript
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  try {
    // ... sync logic
  } catch (error) {
    if (error.statusCode === 401) {
      throw new AuthenticationError(
        'Token expired or invalid',
        this.name
      );
    }

    if (error.statusCode === 429) {
      const retryAfter = error.headers['retry-after'] || 60;
      throw new RateLimitError(
        'Rate limit exceeded',
        this.name,
        parseInt(retryAfter) * 1000
      );
    }

    if (error.statusCode === 404) {
      // Resource not found - skip and continue
      this.log('warn', 'Resource not found', { url: error.url });
      return;
    }

    // Unknown error - re-throw
    throw error;
  }
}
```

### Pattern 3: Webhook Handling

Process webhooks with signature verification:

```typescript
async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
  // 1. Verify signature (CRITICAL)
  const isValid = this.verifySignature(
    event.payload,
    event.signature,
    event.headers['x-webhook-secret']
  );

  if (!isValid) {
    throw new ValidationError('Invalid signature', this.name, []);
  }

  // 2. Check idempotency (avoid duplicate processing)
  const processed = await this.storage.hasProcessed(event.id);
  if (processed) {
    return { success: true, durationMs: 0, recordsProcessed: 0 };
  }

  // 3. Process event
  const record = this.webhookToRecord(event);
  await this.storage.saveRecords([record]);

  // 4. Mark as processed
  await this.storage.markProcessed(event.id);

  return { success: true, durationMs: Date.now() - startTime, recordsProcessed: 1 };
}
```

### Pattern 4: Rate Limit Handling

Use the built-in rate limiter:

```typescript
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  for (const resource of options.resources) {
    // Check rate limit before each request
    await this.rateLimiter.checkLimit(this.name);

    const response = await this.retryRequest(async () => {
      return await this.httpClient.get(`/resources/${resource.id}`);
    });

    // Record the request
    this.rateLimiter.recordRequest(this.name);

    for (const item of response.data.items) {
      yield this.toRecord(item);
    }
  }
}
```

---

## Next Steps

Now that you have the basics, explore:

1. **[Creating Connectors](./creating-connectors.md)** - Deep dive into connector development
2. **[API Reference](./api-reference.md)** - Complete API documentation
3. **[Architecture](./architecture.md)** - Framework internals
4. **[Examples](./examples/)** - More code samples

### Building Production Connectors

For production use, ensure you:

1. Add comprehensive tests (>80% coverage)
2. Implement proper error handling for all API responses
3. Add metrics and logging
4. Handle pagination for all list endpoints
5. Verify webhook signatures with HMAC
6. Use Secret Manager for credentials
7. Document rate limits and quotas

---

## Troubleshooting

### Common Issues

**"Connector not registered"**

```typescript
// Make sure to register before calling get()
registry.register('github', (config) => new GitHubConnector(config));
const github = await registry.get('github', { ... });
```

**"Authentication failed"**

- Check that your token is valid and not expired
- Ensure token has required scopes/permissions
- Verify the API endpoint is correct

**"Rate limit exceeded"**

- Reduce request frequency
- Check if you're respecting `Retry-After` headers
- Consider implementing request batching

**"Health check fails"**

- Verify network connectivity to API endpoint
- Check if API is experiencing downtime
- Ensure credentials haven't expired

### Getting Help

- Check [API Reference](./api-reference.md) for method signatures
- Review [Examples](./examples/) for common use cases
- File an issue on GitHub for bugs

---

**Next:** [Creating Connectors](./creating-connectors.md)
