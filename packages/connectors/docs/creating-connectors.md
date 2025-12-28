# Creating Connectors

This comprehensive guide walks you through building production-ready connectors for the Git With Intent framework. You'll learn how to extend BaseConnector, implement the IConnector interface, choose authentication strategies, handle pagination, process webhooks, and test your connectors.

## Table of Contents

1. [Overview](#overview)
2. [Extending BaseConnector](#extending-baseconnector)
3. [Implementing IConnector Interface](#implementing-iconnector-interface)
4. [Authentication Strategies](#authentication-strategies)
5. [Adding Pagination](#adding-pagination)
6. [Handling Webhooks](#handling-webhooks)
7. [Error Handling](#error-handling)
8. [Testing Your Connector](#testing-your-connector)
9. [Best Practices](#best-practices)
10. [Production Checklist](#production-checklist)

---

## Overview

### What is a Connector?

A connector is a TypeScript class that integrates with an external data source (GitHub, GitLab, Jira, Slack, etc.). Connectors:

- **Authenticate** with external APIs
- **Sync** data using pull (polling) or push (webhooks)
- **Transform** external data into standardized `ConnectorRecord` format
- **Handle errors** gracefully with retries and backoff
- **Monitor health** for observability

### Connector Lifecycle

```
+----------------+     +---------------+     +----------------+
|   Register     | --> |  Authenticate | --> |     Sync       |
|   (registry)   |     |   (tokens)    |     |  (paginated)   |
+----------------+     +---------------+     +----------------+
                                                     |
                                                     v
+----------------+     +---------------+     +----------------+
|  Health Check  | <-- |   Transform   | <-- |   Fetch Page   |
|  (monitoring)  |     |   (records)   |     |   (API call)   |
+----------------+     +---------------+     +----------------+
```

### Framework Provides

- **Retry logic** with exponential backoff
- **Rate limiting** with Retry-After header support
- **Structured logging** with context
- **Metrics** instrumentation
- **Error handling** with typed exceptions
- **Testing utilities** and mocks

### You Implement

- **Authentication** specific to your API
- **Sync logic** with pagination
- **Data transformation** to `ConnectorRecord`
- **Webhook processing** (optional)
- **Health checks** for your API

---

## Extending BaseConnector

### Basic Structure

```typescript
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

export class MyConnector extends BaseConnector implements IConnector {
  // Required: Unique identifier
  readonly name = 'my-connector';

  // Required: Semantic version
  readonly version = '1.0.0';

  // Required: Zod schema for configuration validation
  readonly configSchema = MyConnectorConfigSchema;

  // Private state
  private token: string = '';
  private baseUrl: string = 'https://api.example.com';

  // Required: Implement all IConnector methods
  async authenticate(config: ConnectorConfig): Promise<AuthResult> { /* ... */ }
  async healthCheck(): Promise<HealthStatus> { /* ... */ }
  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> { /* ... */ }
  async processWebhook(event: WebhookEvent): Promise<WebhookResult> { /* ... */ }
  getMetadata(): ConnectorMetadata { /* ... */ }
}
```

### Configuration Schema

Define your connector's configuration with Zod:

```typescript
import { z } from 'zod';
import { ConnectorConfigSchema } from '@gwi/connectors';

// Extend the base schema with connector-specific fields
export const MyConnectorConfigSchema = ConnectorConfigSchema.extend({
  // Optional: Custom base URL (for self-hosted instances)
  baseUrl: z.string().url().optional(),

  // Optional: API version
  apiVersion: z.string().default('v2'),

  // Optional: Specific resources to sync
  resources: z.array(z.string()).optional(),

  // Optional: Feature flags
  features: z.object({
    syncComments: z.boolean().default(true),
    syncAttachments: z.boolean().default(false)
  }).optional()
});

export type MyConnectorConfig = z.infer<typeof MyConnectorConfigSchema>;
```

### Using BaseConnector Utilities

BaseConnector provides several protected methods:

```typescript
// Retry with exponential backoff
const data = await this.retryRequest(async () => {
  return await this.httpClient.get('/api/resource');
}, {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
});

// Structured logging
this.log('info', 'Starting sync', { repository: 'owner/repo' });
this.log('warn', 'Rate limit approaching', { remaining: 100 });
this.log('error', 'API error', { statusCode: 500, error });

// Record metrics
this.recordMetric('records_processed', 1, { type: 'pull_request' });
this.recordMetric('api_latency_ms', 150, { endpoint: '/pulls' });

// Handle errors consistently
try {
  await someOperation();
} catch (error) {
  this.handleError(error, { operation: 'fetch_data' });
}
```

### Lifecycle Hooks

Override these methods to customize behavior:

```typescript
export class MyConnector extends BaseConnector {
  // Called before sync starts
  protected async onBeforeSync(options: SyncOptions): Promise<void> {
    await super.onBeforeSync(options);

    // Custom: Validate resources exist
    for (const resource of options.resources || []) {
      await this.validateResource(resource);
    }

    this.log('info', 'Pre-sync validation complete');
  }

  // Called after sync completes successfully
  protected async onAfterSync(result: SyncResult): Promise<void> {
    await super.onAfterSync(result);

    // Custom: Update analytics
    await this.updateSyncStats({
      connector: this.name,
      recordsProcessed: result.recordsProcessed,
      duration: result.durationMs
    });
  }

  // Called on any error
  protected async onError(error: Error, context: any): Promise<void> {
    await super.onError(error, context);

    // Custom: Alert on critical errors
    if (error instanceof AuthenticationError) {
      await this.alertOps('Auth failure', { error, context });
    }
  }

  // Called when rate limited
  protected async onRateLimit(error: RateLimitError): Promise<void> {
    this.log('warn', 'Rate limited', {
      retryAfter: error.retryAfter,
      connector: this.name
    });

    // Wait for rate limit to reset
    await this.sleep(error.retryAfter);
  }
}
```

---

## Implementing IConnector Interface

### authenticate()

Validate credentials and establish connection:

```typescript
async authenticate(config: ConnectorConfig): Promise<AuthResult> {
  // 1. Validate configuration
  const validated = this.configSchema.parse(config);

  // 2. Store credentials
  this.token = validated.auth.token;
  this.tenantId = validated.tenantId;

  if (validated.baseUrl) {
    this.baseUrl = validated.baseUrl;
  }

  // 3. Test connection with a simple API call
  try {
    const response = await this.httpClient.get(`${this.baseUrl}/me`, {
      headers: this.getAuthHeaders()
    });

    // 4. Return success with metadata
    return {
      success: true,
      token: this.token,
      metadata: {
        userId: response.data.id,
        userName: response.data.name,
        scopes: response.data.scopes
      }
    };
  } catch (error) {
    // 5. Return failure with error message
    if (error.statusCode === 401) {
      return {
        success: false,
        error: 'Invalid or expired token'
      };
    }

    if (error.statusCode === 403) {
      return {
        success: false,
        error: 'Insufficient permissions'
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}
```

### healthCheck()

Verify connector is operational:

```typescript
async healthCheck(): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];
  const startTime = Date.now();

  // Check 1: Authentication
  const authStart = Date.now();
  try {
    await this.httpClient.get(`${this.baseUrl}/me`, {
      headers: this.getAuthHeaders()
    });

    checks.push({
      name: 'auth_valid',
      status: 'pass',
      durationMs: Date.now() - authStart
    });
  } catch (error) {
    checks.push({
      name: 'auth_valid',
      status: 'fail',
      durationMs: Date.now() - authStart,
      error: error.message
    });
  }

  // Check 2: API Reachability
  const apiStart = Date.now();
  try {
    await this.httpClient.get(`${this.baseUrl}/health`, {
      headers: this.getAuthHeaders(),
      timeout: 5000  // 5 second timeout
    });

    checks.push({
      name: 'api_reachable',
      status: 'pass',
      durationMs: Date.now() - apiStart
    });
  } catch (error) {
    checks.push({
      name: 'api_reachable',
      status: 'fail',
      durationMs: Date.now() - apiStart,
      error: error.message
    });
  }

  // Check 3: Rate Limit Status (warning if low)
  const rateStart = Date.now();
  try {
    const response = await this.httpClient.get(`${this.baseUrl}/rate_limit`, {
      headers: this.getAuthHeaders()
    });

    const remaining = response.data.remaining;
    const limit = response.data.limit;
    const percentUsed = ((limit - remaining) / limit) * 100;

    checks.push({
      name: 'rate_limit_ok',
      status: percentUsed > 90 ? 'warn' : 'pass',
      durationMs: Date.now() - rateStart,
      metadata: { remaining, limit, percentUsed }
    });
  } catch (error) {
    // Rate limit check is optional - don't fail health check
    checks.push({
      name: 'rate_limit_ok',
      status: 'warn',
      durationMs: Date.now() - rateStart,
      error: 'Could not check rate limit'
    });
  }

  // Aggregate results
  const healthy = checks.every(c => c.status !== 'fail');

  return {
    healthy,
    timestamp: new Date().toISOString(),
    connector: this.name,
    checks,
    error: healthy ? undefined : 'One or more health checks failed',
    metadata: {
      totalDurationMs: Date.now() - startTime
    }
  };
}
```

### sync()

Fetch data using async iterators for memory efficiency:

```typescript
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  // 1. Call lifecycle hook
  await this.onBeforeSync(options);

  const startTime = Date.now();
  let totalRecords = 0;
  let latestCursor: string | null = null;

  try {
    // 2. Determine resources to sync
    const resources = options.resources || await this.getDefaultResources();

    for (const resource of resources) {
      // 3. Sync each resource type
      if (options.types?.includes('pull_request') || !options.types) {
        yield* this.syncPullRequests(resource, options);
      }

      if (options.types?.includes('issue') || !options.types) {
        yield* this.syncIssues(resource, options);
      }

      if (options.types?.includes('comment') || !options.types) {
        yield* this.syncComments(resource, options);
      }
    }

    // 4. Call success hook
    await this.onAfterSync({
      recordsProcessed: totalRecords,
      durationMs: Date.now() - startTime,
      cursor: latestCursor
    });

  } catch (error) {
    // 5. Call error hook
    await this.onError(error, { options });
    throw error;
  }
}

// Helper: Sync a specific resource type with pagination
private async *syncPullRequests(
  resource: ResourceFilter,
  options: SyncOptions
): AsyncIterator<ConnectorRecord> {
  let cursor: string | null = null;

  do {
    // Fetch page with retry
    const response = await this.retryRequest(async () => {
      return await this.httpClient.get(
        `${this.baseUrl}/repos/${resource.id}/pulls`,
        {
          headers: this.getAuthHeaders(),
          params: {
            state: 'all',
            per_page: 100,
            cursor,
            ...(options.incremental?.startCursor && {
              since: options.incremental.startCursor
            })
          }
        }
      );
    });

    // Transform and yield records
    for (const pr of response.data) {
      yield this.transformPullRequest(pr, resource);

      // Check limit
      if (options.limit && ++totalRecords >= options.limit) {
        return;
      }
    }

    // Get next cursor from Link header
    cursor = this.parseLinkHeader(response.headers.link);

  } while (cursor);
}

// Transform API response to ConnectorRecord
private transformPullRequest(pr: any, resource: ResourceFilter): ConnectorRecord {
  return {
    id: `pr-${pr.id}`,
    type: 'pull_request',
    source: this.name,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    data: {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      draft: pr.draft,
      merged: pr.merged,
      author: pr.user?.login,
      assignees: pr.assignees?.map((a: any) => a.login),
      labels: pr.labels?.map((l: any) => l.name),
      head: pr.head?.ref,
      base: pr.base?.ref,
      repository: resource.id
    },
    metadata: {
      url: pr.html_url,
      apiUrl: pr.url
    }
  };
}
```

### processWebhook()

Handle incoming webhook events:

```typescript
async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
  const startTime = Date.now();

  // 1. Verify signature (CRITICAL - never skip)
  const secret = await this.getWebhookSecret(event.source);
  if (!this.verifySignature(event.payload, event.signature, secret)) {
    throw new ValidationError(
      'Invalid webhook signature',
      this.name,
      [{ field: 'signature', message: 'HMAC verification failed' }]
    );
  }

  // 2. Check for duplicate processing (idempotency)
  const eventKey = `webhook:${event.id}`;
  const alreadyProcessed = await this.storage.hasKey(eventKey);
  if (alreadyProcessed) {
    this.log('info', 'Skipping duplicate webhook', { eventId: event.id });
    return {
      success: true,
      durationMs: 0,
      recordsProcessed: 0,
      metadata: { skipped: true, reason: 'duplicate' }
    };
  }

  // 3. Route to handler based on event type
  let recordsProcessed = 0;

  try {
    switch (event.type) {
      case 'pull_request':
      case 'pull_request.opened':
      case 'pull_request.closed':
      case 'pull_request.merged':
        recordsProcessed = await this.handlePullRequestEvent(event);
        break;

      case 'issue':
      case 'issues.opened':
      case 'issues.closed':
        recordsProcessed = await this.handleIssueEvent(event);
        break;

      case 'push':
        recordsProcessed = await this.handlePushEvent(event);
        break;

      case 'comment':
      case 'issue_comment':
        recordsProcessed = await this.handleCommentEvent(event);
        break;

      default:
        this.log('warn', 'Unhandled webhook event type', { type: event.type });
    }

    // 4. Mark as processed
    await this.storage.setKey(eventKey, {
      processedAt: new Date().toISOString(),
      recordsProcessed
    }, { ttl: 86400 * 7 }); // 7 day TTL

    return {
      success: true,
      durationMs: Date.now() - startTime,
      recordsProcessed,
      metadata: { eventType: event.type }
    };

  } catch (error) {
    this.log('error', 'Webhook processing failed', {
      eventId: event.id,
      type: event.type,
      error: error.message
    });

    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: error.message
    };
  }
}

// Webhook event handler
private async handlePullRequestEvent(event: WebhookEvent): Promise<number> {
  const pr = event.payload.pull_request;

  const record: ConnectorRecord = {
    id: `pr-${pr.id}`,
    type: 'pull_request',
    source: this.name,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    data: {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      action: event.payload.action // 'opened', 'closed', etc.
    }
  };

  await this.storage.saveRecords([record]);
  return 1;
}

// HMAC signature verification
private verifySignature(
  payload: any,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### getMetadata()

Return connector capabilities:

```typescript
getMetadata(): ConnectorMetadata {
  return {
    name: this.name,
    version: this.version,
    recordTypes: [
      'pull_request',
      'issue',
      'commit',
      'comment',
      'review',
      'workflow_run'
    ],
    authMethods: ['bearer', 'oauth2'],
    supportsIncremental: true,
    supportsWebhooks: true,
    rateLimits: {
      requestsPerSecond: 30,
      requestsPerHour: 5000
    },
    capabilities: [
      'sync',
      'webhooks',
      'incremental',
      'graphql',
      'search'
    ],
    documentationUrl: 'https://docs.gwi.dev/connectors/github'
  };
}
```

---

## Authentication Strategies

### Bearer Token (Most Common)

```typescript
import { BearerTokenAuth, IAuthStrategy } from '@gwi/connectors';

class MyConnector extends BaseConnector {
  private auth: IAuthStrategy;

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    // Use bearer token strategy
    this.auth = new BearerTokenAuth(config.auth.token);

    // Test authentication
    try {
      await this.httpClient.get(`${this.baseUrl}/me`, {
        headers: this.auth.getHeaders()
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Use in requests
  private getAuthHeaders(): Record<string, string> {
    return this.auth.getHeaders();
  }
}
```

### OAuth 2.0 with Token Refresh

```typescript
import { OAuth2Auth, IAuthStrategy } from '@gwi/connectors';

class GoogleConnector extends BaseConnector {
  private auth: OAuth2Auth;

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    if (config.auth.type !== 'oauth2') {
      throw new Error('OAuth2 configuration required');
    }

    this.auth = new OAuth2Auth({
      clientId: config.auth.clientId,
      clientSecret: config.auth.clientSecret,
      redirectUri: config.auth.redirectUri,
      tokenUrl: 'https://oauth2.googleapis.com/token',
      accessToken: config.auth.accessToken,
      refreshToken: config.auth.refreshToken,
      expiresAt: config.auth.expiresAt
    });

    // Test and refresh if needed
    try {
      await this.auth.refreshIfNeeded();

      return {
        success: true,
        token: await this.auth.getAccessToken(),
        expiresAt: this.auth.getExpiresAt(),
        refreshToken: this.auth.getRefreshToken()
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Refresh before each request
  private async getAuthHeaders(): Promise<Record<string, string>> {
    await this.auth.refreshIfNeeded();
    return this.auth.getHeaders();
  }
}
```

### Service Account (GCP)

```typescript
import { ServiceAccountAuth, IAuthStrategy } from '@gwi/connectors';

class VertexAIConnector extends BaseConnector {
  private auth: ServiceAccountAuth;

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    if (config.auth.type !== 'service_account') {
      throw new Error('Service account configuration required');
    }

    this.auth = new ServiceAccountAuth({
      serviceAccountEmail: config.auth.serviceAccountEmail,
      privateKey: config.auth.privateKey,
      projectId: config.auth.projectId,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    try {
      await this.auth.authenticate(config);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

---

## Adding Pagination

### Cursor-Based Pagination

Most scalable, recommended for modern APIs:

```typescript
import { CursorPagination, IPaginationStrategy, paginate } from '@gwi/connectors';

class SlackConnector extends BaseConnector {
  async *syncMessages(channelId: string): AsyncIterator<ConnectorRecord> {
    const pagination = new CursorPagination('response_metadata.next_cursor');

    for await (const page of paginate(
      async (cursor) => {
        return await this.httpClient.get(`${this.baseUrl}/conversations.history`, {
          headers: this.getAuthHeaders(),
          params: {
            channel: channelId,
            limit: 100,
            cursor
          }
        });
      },
      pagination
    )) {
      for (const message of page.data.messages) {
        yield this.transformMessage(message, channelId);
      }
    }
  }
}
```

### Offset-Based Pagination

For APIs without cursor support:

```typescript
import { OffsetPagination } from '@gwi/connectors';

class JiraConnector extends BaseConnector {
  async *syncIssues(projectKey: string): AsyncIterator<ConnectorRecord> {
    const pagination = new OffsetPagination(100); // 100 items per page

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.httpClient.get(`${this.baseUrl}/search`, {
        headers: this.getAuthHeaders(),
        params: {
          jql: `project = ${projectKey}`,
          startAt: offset,
          maxResults: 100
        }
      });

      for (const issue of response.data.issues) {
        yield this.transformIssue(issue);
      }

      // Check if more pages exist
      offset += response.data.issues.length;
      hasMore = offset < response.data.total;
    }
  }
}
```

### Link Header Pagination (GitHub)

```typescript
import { LinkHeaderPagination } from '@gwi/connectors';

class GitHubConnector extends BaseConnector {
  async *syncPullRequests(repo: string): AsyncIterator<ConnectorRecord> {
    const pagination = new LinkHeaderPagination();
    let url: string | null = `${this.baseUrl}/repos/${repo}/pulls?per_page=100&state=all`;

    while (url) {
      const response = await this.httpClient.get(url, {
        headers: this.getAuthHeaders()
      });

      for (const pr of response.data) {
        yield this.transformPullRequest(pr);
      }

      // Parse Link header for next URL
      url = pagination.getNextCursor(response);
    }
  }
}
```

### GraphQL Pagination

```typescript
class LinearConnector extends BaseConnector {
  async *syncIssues(): AsyncIterator<ConnectorRecord> {
    let hasNextPage = true;
    let endCursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query($after: String) {
          issues(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              description
              state { name }
              createdAt
              updatedAt
            }
          }
        }
      `;

      const response = await this.httpClient.post(
        `${this.baseUrl}/graphql`,
        {
          query,
          variables: { after: endCursor }
        },
        { headers: this.getAuthHeaders() }
      );

      const { nodes, pageInfo } = response.data.data.issues;

      for (const issue of nodes) {
        yield this.transformIssue(issue);
      }

      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
    }
  }
}
```

---

## Handling Webhooks

### Webhook Endpoint Setup

```typescript
// Webhook receiver (separate Cloud Run service)
import express from 'express';
import { registry } from '@gwi/connectors';

const app = express();

// Raw body needed for signature verification
app.use('/webhooks/:connector', express.raw({ type: 'application/json' }));

app.post('/webhooks/:connector', async (req, res) => {
  const { connector: connectorName } = req.params;

  // Get connector
  const connector = await registry.get(connectorName);
  if (!connector) {
    return res.status(404).json({ error: 'Connector not found' });
  }

  // Build webhook event
  const event: WebhookEvent = {
    id: req.headers['x-request-id'] || generateId(),
    source: connectorName,
    type: req.headers['x-event-type'] || 'unknown',
    timestamp: new Date().toISOString(),
    payload: JSON.parse(req.body.toString()),
    signature: req.headers['x-signature'] || '',
    headers: req.headers as Record<string, string>
  };

  try {
    // Process webhook
    const result = await connector.processWebhook(event);

    // Respond quickly (webhook processing should be fast)
    res.status(200).json({
      success: result.success,
      recordsProcessed: result.recordsProcessed
    });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Signature Verification

**CRITICAL:** Always verify webhook signatures:

```typescript
private verifyGitHubSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');

  // GitHub uses HMAC-SHA256
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Constant-time comparison prevents timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

private verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');

  // Slack's signing format: v0=hash
  const baseString = `v0:${timestamp}:${body}`;
  const expected = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(baseString)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

---

## Error Handling

### Error Types

```typescript
import {
  ConnectorError,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ValidationError
} from '@gwi/connectors';

// Use specific error types
async authenticate(config: ConnectorConfig): Promise<AuthResult> {
  try {
    const response = await this.httpClient.get('/me', {
      headers: this.getAuthHeaders()
    });
    return { success: true };
  } catch (error) {
    // Handle specific errors
    if (error.statusCode === 401) {
      throw new AuthenticationError(
        'Invalid or expired token',
        this.name
      );
    }

    if (error.statusCode === 403) {
      throw new AuthenticationError(
        'Insufficient permissions',
        this.name,
        { requiredScopes: ['repo', 'read:org'] }
      );
    }

    if (error.statusCode === 429) {
      throw new RateLimitError(
        'Rate limit exceeded',
        this.name,
        parseInt(error.headers['retry-after'] || '60') * 1000
      );
    }

    if (error.code === 'ECONNREFUSED') {
      throw new NetworkError(
        'Could not connect to API',
        this.name
      );
    }

    // Generic error for unknowns
    throw new ConnectorError(
      error.message,
      this.name,
      { originalError: error }
    );
  }
}
```

### Retry Logic

Built-in retry with exponential backoff:

```typescript
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  for (const resource of options.resources || []) {
    // Retry individual page fetches
    const page = await this.retryRequest(
      async () => {
        return await this.httpClient.get(`/resources/${resource.id}`);
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableErrors: (error) => {
          // Retry on network errors and 5xx
          return error.code === 'ECONNRESET' ||
                 error.code === 'ETIMEDOUT' ||
                 (error.statusCode >= 500 && error.statusCode < 600);
        }
      }
    );

    for (const item of page.data.items) {
      yield this.transform(item);
    }
  }
}
```

---

## Testing Your Connector

### Unit Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyConnector } from './my-connector';
import { MockHttpClient, MockStorage, MockLogger } from '@gwi/connectors/testing';

describe('MyConnector', () => {
  let connector: MyConnector;
  let mockHttp: MockHttpClient;
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockHttp = new MockHttpClient();
    mockStorage = new MockStorage();
    connector = new MyConnector();
    connector.httpClient = mockHttp;
    connector.storage = mockStorage;
  });

  describe('authenticate', () => {
    it('should authenticate with valid token', async () => {
      mockHttp.get.mockResolvedValue({
        data: { id: '1', name: 'Test User' }
      });

      const result = await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'valid-token' }
      });

      expect(result.success).toBe(true);
      expect(mockHttp.get).toHaveBeenCalledWith(
        expect.stringContaining('/me'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token'
          })
        })
      );
    });

    it('should fail with invalid token', async () => {
      mockHttp.get.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });

      const result = await connector.authenticate({
        tenantId: 'test',
        auth: { type: 'bearer', token: 'invalid' }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('sync', () => {
    it('should yield all records from paginated API', async () => {
      mockHttp.get
        .mockResolvedValueOnce({
          data: [{ id: '1' }, { id: '2' }],
          headers: { link: '</next>; rel="next"' }
        })
        .mockResolvedValueOnce({
          data: [{ id: '3' }],
          headers: {}
        });

      const records = [];
      for await (const record of connector.sync({})) {
        records.push(record);
      }

      expect(records).toHaveLength(3);
      expect(mockHttp.get).toHaveBeenCalledTimes(2);
    });

    it('should handle rate limits gracefully', async () => {
      mockHttp.get
        .mockRejectedValueOnce({
          statusCode: 429,
          headers: { 'retry-after': '1' }
        })
        .mockResolvedValueOnce({
          data: [{ id: '1' }],
          headers: {}
        });

      const records = [];
      for await (const record of connector.sync({})) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
    });
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('MyConnector Integration', () => {
  const token = process.env.MY_API_TOKEN;

  it.skipIf(!token)('should sync real data', async () => {
    const connector = new MyConnector();

    await connector.authenticate({
      tenantId: 'test',
      auth: { type: 'bearer', token: token! }
    });

    const records = [];
    for await (const record of connector.sync({ limit: 10 })) {
      records.push(record);
    }

    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty('id');
    expect(records[0]).toHaveProperty('type');
    expect(records[0]).toHaveProperty('data');
  });

  it.skipIf(!token)('should pass health check', async () => {
    const connector = new MyConnector();

    await connector.authenticate({
      tenantId: 'test',
      auth: { type: 'bearer', token: token! }
    });

    const health = await connector.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.checks.length).toBeGreaterThan(0);
  });
});
```

### Contract Tests

```typescript
import { describe, it, expect } from 'vitest';
import { ConnectorRecordSchema } from '@gwi/connectors';

describe('MyConnector Contract', () => {
  it('should return valid ConnectorRecord schema', async () => {
    const connector = createTestConnector();

    for await (const record of connector.sync({ limit: 5 })) {
      // Should not throw
      expect(() => ConnectorRecordSchema.parse(record)).not.toThrow();

      // Required fields
      expect(record.id).toBeDefined();
      expect(record.type).toBeDefined();
      expect(record.source).toBe('my-connector');
      expect(record.createdAt).toBeDefined();
      expect(record.updatedAt).toBeDefined();
      expect(record.data).toBeDefined();
    }
  });
});
```

---

## Best Practices

### 1. Use Async Iterators for Large Datasets

```typescript
// GOOD: Memory efficient, streams records
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  for await (const page of this.fetchPages()) {
    for (const item of page.items) {
      yield this.transform(item);
    }
  }
}

// BAD: Loads everything into memory
async sync(options: SyncOptions): Promise<ConnectorRecord[]> {
  const allRecords = [];
  for await (const page of this.fetchPages()) {
    allRecords.push(...page.items.map(this.transform));
  }
  return allRecords; // OOM risk for large datasets
}
```

### 2. Always Verify Webhook Signatures

```typescript
// GOOD: Verify before processing
async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
  if (!this.verifySignature(event.payload, event.signature, secret)) {
    throw new ValidationError('Invalid signature', this.name, []);
  }
  // Process...
}

// BAD: Process without verification (security risk!)
async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
  await this.handleEvent(event.payload); // Attacker can send fake events
}
```

### 3. Implement Idempotent Webhook Processing

```typescript
// GOOD: Check if already processed
async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
  if (await this.storage.hasProcessed(event.id)) {
    return { success: true, recordsProcessed: 0 };
  }
  // Process...
  await this.storage.markProcessed(event.id);
}
```

### 4. Use Structured Logging

```typescript
// GOOD: Context-rich logs
this.log('info', 'Syncing repository', {
  repository: 'owner/repo',
  since: options.incremental?.startCursor,
  types: options.types
});

// BAD: Unstructured, hard to query
console.log('Syncing repo owner/repo');
```

### 5. Handle Rate Limits Proactively

```typescript
// GOOD: Check before hitting limit
await this.rateLimiter.checkLimit(this.name);
const response = await this.httpClient.get(url);
this.rateLimiter.recordRequest(this.name);

// Also good: Handle 429 with Retry-After
if (error.statusCode === 429) {
  const retryAfter = parseInt(error.headers['retry-after'] || '60');
  await this.sleep(retryAfter * 1000);
  // Retry...
}
```

---

## Production Checklist

Before deploying a new connector, verify:

### Code Quality
- [ ] Type-safe with TypeScript strict mode
- [ ] >80% test coverage
- [ ] ARV checks pass (`npm run arv`)
- [ ] No hardcoded credentials

### Authentication
- [ ] Token validation on authenticate()
- [ ] Token refresh for OAuth (if applicable)
- [ ] Credentials stored in Secret Manager

### Sync
- [ ] Pagination implemented correctly
- [ ] Incremental sync supported
- [ ] Memory-efficient (async iterators)
- [ ] Rate limiting respected

### Webhooks
- [ ] HMAC signature verification
- [ ] Idempotency (duplicate detection)
- [ ] Quick response (<1s)

### Error Handling
- [ ] Specific error types used
- [ ] Retry logic for transient errors
- [ ] Graceful degradation

### Observability
- [ ] Health check implemented
- [ ] Structured logging
- [ ] Metrics instrumented

### Documentation
- [ ] README updated
- [ ] API examples
- [ ] Configuration documented

---

## Next Steps

- **[API Reference](./api-reference.md)** - Complete API documentation
- **[Architecture](./architecture.md)** - Framework internals
- **[Examples](./examples/)** - Real connector implementations

---

**Need help?** Check the [troubleshooting guide](./getting-started.md#troubleshooting) or file an issue.
