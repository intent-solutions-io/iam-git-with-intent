# Design: IConnector Interface

**Document ID:** 015-DR-DSGN
**Date:** 2025-12-28
**Status:** ✅ Approved
**Epic:** B (Data Ingestion & Connector Framework)
**Story:** B2 (Design Core Connector Framework)
**Task:** B2.2 (Define IConnector interface)
**Author:** @backend-architect
**Reviewers:** @connectors-lead, @security

---

## Overview

This document defines the `IConnector` interface, which is the contract all connectors must implement. This interface establishes the public API for connectors and ensures consistency across GitHub, GitLab, Linear, Jira, Slack, and Vertex AI integrations.

**Goals:**
1. Define clear contract for connector implementations
2. Enable type-safe connector usage in TypeScript
3. Support both pull (API polling) and push (webhooks) patterns
4. Provide health check and observability hooks
5. Enable dependency injection and testing

---

## Interface Definition

### Core Interface

**Location:** `packages/connectors/src/interfaces/IConnector.ts`

```typescript
import { z } from 'zod';

/**
 * IConnector defines the contract all data source connectors must implement.
 *
 * Connectors are responsible for:
 * - Authenticating with external APIs
 * - Fetching data via pull (API polling)
 * - Processing incoming webhooks (push)
 * - Health monitoring
 * - Error handling and retries
 */
export interface IConnector {
  /**
   * Unique identifier for this connector type.
   * Examples: 'github', 'gitlab', 'linear', 'jira', 'slack'
   */
  readonly name: string;

  /**
   * Version of the connector implementation.
   * Used for compatibility tracking and debugging.
   */
  readonly version: string;

  /**
   * Configuration schema for this connector.
   * Defines required/optional fields for authentication and sync options.
   */
  readonly configSchema: z.ZodSchema<ConnectorConfig>;

  /**
   * Authenticate with the external API.
   *
   * @param config - Connector-specific configuration (tokens, credentials, etc.)
   * @throws {AuthenticationError} If authentication fails
   * @returns Promise resolving to authentication result
   */
  authenticate(config: ConnectorConfig): Promise<AuthResult>;

  /**
   * Check connector health and connectivity.
   *
   * @returns Promise resolving to health status
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Sync data from the external source.
   *
   * Returns an async iterator to support streaming large datasets
   * without loading everything into memory.
   *
   * @param options - Sync options (incremental cursor, date ranges, filters)
   * @yields Records from the external source
   * @throws {ConnectorError} If sync fails
   */
  sync(options: SyncOptions): AsyncIterator<ConnectorRecord>;

  /**
   * Process an incoming webhook event.
   *
   * @param event - Webhook event payload
   * @returns Promise resolving to processing result
   * @throws {ValidationError} If webhook signature is invalid
   */
  processWebhook(event: WebhookEvent): Promise<WebhookResult>;

  /**
   * Get metadata about this connector.
   *
   * @returns Connector metadata (supported features, rate limits, etc.)
   */
  getMetadata(): ConnectorMetadata;
}
```

---

## Type Definitions

### ConnectorConfig

```typescript
/**
 * Base configuration for all connectors.
 * Individual connectors extend this with connector-specific fields.
 */
export interface ConnectorConfig {
  /**
   * Tenant ID (for multi-tenant deployments)
   */
  tenantId: string;

  /**
   * Authentication credentials
   */
  auth: AuthConfig;

  /**
   * Optional rate limit overrides
   */
  rateLimit?: RateLimitConfig;

  /**
   * Optional timeout overrides
   */
  timeout?: number;

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;
}

/**
 * Authentication configuration (strategy pattern)
 */
export type AuthConfig =
  | BearerTokenAuthConfig
  | OAuth2AuthConfig
  | ServiceAccountAuthConfig;

export interface BearerTokenAuthConfig {
  type: 'bearer';
  token: string;
}

export interface OAuth2AuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
}

export interface ServiceAccountAuthConfig {
  type: 'service_account';
  serviceAccountEmail: string;
  privateKey: string;
  projectId: string;
}

export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerHour: number;
  maxConcurrentRequests: number;
}

// Zod schema for validation
export const ConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('bearer'),
      token: z.string().min(1)
    }),
    z.object({
      type: z.literal('oauth2'),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      redirectUri: z.string().url(),
      refreshToken: z.string().optional(),
      accessToken: z.string().optional(),
      expiresAt: z.string().datetime().optional()
    }),
    z.object({
      type: z.literal('service_account'),
      serviceAccountEmail: z.string().email(),
      privateKey: z.string().min(1),
      projectId: z.string().min(1)
    })
  ]),
  rateLimit: z.object({
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerHour: z.number().positive(),
    maxConcurrentRequests: z.number().positive()
  }).optional(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string()).optional()
});
```

### AuthResult

```typescript
/**
 * Result of authentication attempt
 */
export interface AuthResult {
  /**
   * Whether authentication succeeded
   */
  success: boolean;

  /**
   * Access token (if applicable)
   */
  token?: string;

  /**
   * Token expiration time
   */
  expiresAt?: string;

  /**
   * Refresh token (if applicable)
   */
  refreshToken?: string;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Metadata (scopes, user info, etc.)
   */
  metadata?: Record<string, any>;
}

export const AuthResultSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  refreshToken: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});
```

### HealthStatus

```typescript
/**
 * Health check result
 */
export interface HealthStatus {
  /**
   * Overall health status
   */
  healthy: boolean;

  /**
   * Timestamp of health check
   */
  timestamp: string;

  /**
   * Connector name
   */
  connector: string;

  /**
   * Individual check results
   */
  checks: HealthCheck[];

  /**
   * Error message (if unhealthy)
   */
  error?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

export interface HealthCheck {
  /**
   * Name of the check (e.g., 'auth_valid', 'api_reachable')
   */
  name: string;

  /**
   * Check status
   */
  status: 'pass' | 'fail' | 'warn';

  /**
   * Duration of check in milliseconds
   */
  durationMs: number;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

export const HealthStatusSchema = z.object({
  healthy: z.boolean(),
  timestamp: z.string().datetime(),
  connector: z.string(),
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'warn']),
    durationMs: z.number().nonnegative(),
    error: z.string().optional(),
    metadata: z.record(z.any()).optional()
  })),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional()
});
```

### SyncOptions

```typescript
/**
 * Options for sync operation
 */
export interface SyncOptions {
  /**
   * Incremental sync configuration
   */
  incremental?: IncrementalSyncConfig;

  /**
   * Resource filters (repository, channels, projects, etc.)
   */
  resources?: ResourceFilter[];

  /**
   * Data type filters (pull_requests, issues, messages, etc.)
   */
  types?: string[];

  /**
   * Maximum records to fetch (for testing/limiting)
   */
  limit?: number;

  /**
   * Whether to validate schemas (slower but safer)
   */
  validateSchemas?: boolean;
}

export interface IncrementalSyncConfig {
  /**
   * Field to use for cursor (e.g., 'updated_at', 'created_at')
   */
  cursorField: string;

  /**
   * Starting cursor value (ISO 8601 timestamp or opaque cursor)
   */
  startCursor?: string;

  /**
   * Ending cursor value
   */
  endCursor?: string;

  /**
   * Granularity for time-based cursors
   */
  granularity?: 'hour' | 'day' | 'week';
}

export interface ResourceFilter {
  /**
   * Resource type (e.g., 'repository', 'channel', 'project')
   */
  type: string;

  /**
   * Resource identifier (e.g., 'owner/repo', 'channel-id')
   */
  id: string;
}

export const SyncOptionsSchema = z.object({
  incremental: z.object({
    cursorField: z.string(),
    startCursor: z.string().optional(),
    endCursor: z.string().optional(),
    granularity: z.enum(['hour', 'day', 'week']).optional()
  }).optional(),
  resources: z.array(z.object({
    type: z.string(),
    id: z.string()
  })).optional(),
  types: z.array(z.string()).optional(),
  limit: z.number().positive().optional(),
  validateSchemas: z.boolean().optional()
});
```

### ConnectorRecord

```typescript
/**
 * Generic record returned by connectors
 */
export interface ConnectorRecord {
  /**
   * Unique identifier for this record
   */
  id: string;

  /**
   * Record type (e.g., 'pull_request', 'issue', 'message')
   */
  type: string;

  /**
   * Source connector
   */
  source: string;

  /**
   * Timestamp when record was created in source system
   */
  createdAt: string;

  /**
   * Timestamp when record was last updated in source system
   */
  updatedAt: string;

  /**
   * Raw data from source (connector-specific schema)
   */
  data: Record<string, any>;

  /**
   * Metadata (cursor position, etag, etc.)
   */
  metadata?: Record<string, any>;
}

export const ConnectorRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional()
});
```

### WebhookEvent

```typescript
/**
 * Incoming webhook event
 */
export interface WebhookEvent {
  /**
   * Unique event ID (for idempotency)
   */
  id: string;

  /**
   * Source connector
   */
  source: string;

  /**
   * Event type (e.g., 'pull_request.opened', 'issue.closed')
   */
  type: string;

  /**
   * Timestamp when event was generated
   */
  timestamp: string;

  /**
   * Raw event payload
   */
  payload: Record<string, any>;

  /**
   * HMAC signature for verification
   */
  signature: string;

  /**
   * HTTP headers from webhook request
   */
  headers: Record<string, string>;
}

export interface WebhookResult {
  /**
   * Whether webhook was processed successfully
   */
  success: boolean;

  /**
   * Processing duration in milliseconds
   */
  durationMs: number;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Records created/updated
   */
  recordsProcessed?: number;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

export const WebhookEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  timestamp: z.string().datetime(),
  payload: z.record(z.any()),
  signature: z.string(),
  headers: z.record(z.string())
});

export const WebhookResultSchema = z.object({
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
  recordsProcessed: z.number().nonnegative().optional(),
  metadata: z.record(z.any()).optional()
});
```

### ConnectorMetadata

```typescript
/**
 * Metadata about connector capabilities
 */
export interface ConnectorMetadata {
  /**
   * Connector name
   */
  name: string;

  /**
   * Connector version
   */
  version: string;

  /**
   * Supported record types
   */
  recordTypes: string[];

  /**
   * Supported authentication methods
   */
  authMethods: ('bearer' | 'oauth2' | 'service_account')[];

  /**
   * Whether connector supports incremental sync
   */
  supportsIncremental: boolean;

  /**
   * Whether connector supports webhooks
   */
  supportsWebhooks: boolean;

  /**
   * Rate limits
   */
  rateLimits: {
    requestsPerSecond: number;
    requestsPerHour: number;
  };

  /**
   * Additional capabilities
   */
  capabilities: string[];

  /**
   * Documentation URL
   */
  documentationUrl?: string;
}

export const ConnectorMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  recordTypes: z.array(z.string()),
  authMethods: z.array(z.enum(['bearer', 'oauth2', 'service_account'])),
  supportsIncremental: z.boolean(),
  supportsWebhooks: z.boolean(),
  rateLimits: z.object({
    requestsPerSecond: z.number().positive(),
    requestsPerHour: z.number().positive()
  }),
  capabilities: z.array(z.string()),
  documentationUrl: z.string().url().optional()
});
```

---

## Connector-Specific Extensions

### GitHubConnectorConfig

```typescript
/**
 * GitHub-specific configuration
 */
export interface GitHubConnectorConfig extends ConnectorConfig {
  /**
   * GitHub API version
   */
  apiVersion?: string;

  /**
   * Base URL (for GitHub Enterprise)
   */
  baseUrl?: string;

  /**
   * GraphQL endpoint (for GitHub GraphQL API)
   */
  graphqlUrl?: string;
}

export const GitHubConnectorConfigSchema = ConnectorConfigSchema.extend({
  apiVersion: z.string().optional(),
  baseUrl: z.string().url().optional(),
  graphqlUrl: z.string().url().optional()
});
```

### LinearConnectorConfig

```typescript
/**
 * Linear-specific configuration
 */
export interface LinearConnectorConfig extends ConnectorConfig {
  /**
   * Team IDs to sync
   */
  teamIds?: string[];

  /**
   * Whether to include archived issues
   */
  includeArchived?: boolean;
}

export const LinearConnectorConfigSchema = ConnectorConfigSchema.extend({
  teamIds: z.array(z.string()).optional(),
  includeArchived: z.boolean().optional()
});
```

### SlackConnectorConfig

```typescript
/**
 * Slack-specific configuration
 */
export interface SlackConnectorConfig extends ConnectorConfig {
  /**
   * Channel IDs to sync
   */
  channelIds?: string[];

  /**
   * Bot token (for Slack Bot API)
   */
  botToken?: string;

  /**
   * Whether to sync private channels
   */
  syncPrivate?: boolean;
}

export const SlackConnectorConfigSchema = ConnectorConfigSchema.extend({
  channelIds: z.array(z.string()).optional(),
  botToken: z.string().optional(),
  syncPrivate: z.boolean().optional()
});
```

---

## Usage Examples

### Example 1: Authenticate and Sync

```typescript
import { GitHubConnector } from '@gwi/connectors/github';

// Create connector
const connector = new GitHubConnector();

// Authenticate
const authResult = await connector.authenticate({
  tenantId: 'tenant-123',
  auth: {
    type: 'bearer',
    token: process.env.GITHUB_TOKEN!
  }
});

if (!authResult.success) {
  throw new Error(`Authentication failed: ${authResult.error}`);
}

// Sync pull requests
for await (const record of connector.sync({
  resources: [{ type: 'repository', id: 'owner/repo' }],
  types: ['pull_request'],
  incremental: {
    cursorField: 'updated_at',
    startCursor: '2025-01-01T00:00:00Z'
  }
})) {
  console.log(`PR #${record.data.number}: ${record.data.title}`);
}
```

### Example 2: Process Webhook

```typescript
import { GitHubConnector } from '@gwi/connectors/github';
import express from 'express';

const app = express();
const connector = new GitHubConnector();

app.post('/webhooks/github', express.json(), async (req, res) => {
  const event: WebhookEvent = {
    id: req.headers['x-github-delivery'] as string,
    source: 'github',
    type: req.headers['x-github-event'] as string,
    timestamp: new Date().toISOString(),
    payload: req.body,
    signature: req.headers['x-hub-signature-256'] as string,
    headers: req.headers as Record<string, string>
  };

  try {
    const result = await connector.processWebhook(event);
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.listen(3000);
```

### Example 3: Health Check

```typescript
import { ConnectorRegistry } from '@gwi/connectors/registry';

const registry = new ConnectorRegistry();

// Health check all connectors
const health = await registry.healthCheckAll();

for (const [name, status] of health.entries()) {
  if (!status.healthy) {
    console.error(`${name} is unhealthy:`, status.error);
  } else {
    console.log(`${name} is healthy (${status.checks.length} checks passed)`);
  }
}
```

### Example 4: Custom Connector Implementation

```typescript
import { IConnector, ConnectorConfig, AuthResult, HealthStatus, SyncOptions, ConnectorRecord, WebhookEvent, WebhookResult, ConnectorMetadata } from '@gwi/connectors/interfaces';
import { BaseConnector } from '@gwi/connectors/base';

export class CustomConnector extends BaseConnector implements IConnector {
  readonly name = 'custom';
  readonly version = '1.0.0';
  readonly configSchema = CustomConnectorConfigSchema;

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    // Custom authentication logic
    return { success: true, token: 'abc123' };
  }

  async healthCheck(): Promise<HealthStatus> {
    // Custom health check logic
    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks: [
        { name: 'api_reachable', status: 'pass', durationMs: 50 }
      ]
    };
  }

  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    // Custom sync logic
    yield {
      id: '1',
      type: 'custom_record',
      source: this.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: { foo: 'bar' }
    };
  }

  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    // Custom webhook processing logic
    return {
      success: true,
      durationMs: 100,
      recordsProcessed: 1
    };
  }

  getMetadata(): ConnectorMetadata {
    return {
      name: this.name,
      version: this.version,
      recordTypes: ['custom_record'],
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
}
```

---

## Validation and Type Safety

### Runtime Validation with Zod

```typescript
import { ConnectorConfigSchema, SyncOptionsSchema } from '@gwi/connectors/interfaces';

// Validate configuration
const config = {
  tenantId: 'tenant-123',
  auth: { type: 'bearer', token: 'abc123' }
};

const validatedConfig = ConnectorConfigSchema.parse(config);
// ✅ Type-safe and validated

// Validate sync options
const options = {
  incremental: { cursorField: 'updated_at' },
  limit: 100
};

const validatedOptions = SyncOptionsSchema.parse(options);
// ✅ Type-safe and validated
```

### Compile-Time Type Safety

```typescript
// TypeScript enforces interface compliance
class GitHubConnector implements IConnector {
  // ✅ Must implement all interface methods
  // ❌ TypeScript error if any method is missing
  // ❌ TypeScript error if method signatures don't match
}
```

---

## Error Handling

### Standard Error Types

```typescript
// Authentication errors
export class AuthenticationError extends Error {
  constructor(message: string, public connector: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// Rate limit errors
export class RateLimitError extends Error {
  constructor(
    message: string,
    public connector: string,
    public retryAfter: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Validation errors
export class ValidationError extends Error {
  constructor(
    message: string,
    public connector: string,
    public errors: any[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Network errors
export class NetworkError extends Error {
  constructor(
    message: string,
    public connector: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

### Error Handling in Connectors

```typescript
async authenticate(config: ConnectorConfig): Promise<AuthResult> {
  try {
    // Validate config
    const validated = this.configSchema.parse(config);

    // Attempt authentication
    const result = await this.auth.authenticate(validated);

    return { success: true, token: result.token };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Invalid configuration',
        this.name,
        error.errors
      );
    }

    if (error.statusCode === 401) {
      throw new AuthenticationError(
        'Invalid credentials',
        this.name
      );
    }

    throw error;
  }
}
```

---

## Testing

### Mock Connector

```typescript
export class MockConnector implements IConnector {
  readonly name = 'mock';
  readonly version = '1.0.0';
  readonly configSchema = ConnectorConfigSchema;

  authenticate = jest.fn().mockResolvedValue({ success: true });
  healthCheck = jest.fn().mockResolvedValue({ healthy: true, timestamp: new Date().toISOString(), connector: 'mock', checks: [] });
  sync = jest.fn().mockImplementation(async function* () {
    yield { id: '1', type: 'test', source: 'mock', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: {} };
  });
  processWebhook = jest.fn().mockResolvedValue({ success: true, durationMs: 100 });
  getMetadata = jest.fn().mockReturnValue({ name: 'mock', version: '1.0.0', recordTypes: [], authMethods: [], supportsIncremental: false, supportsWebhooks: false, rateLimits: { requestsPerSecond: 0, requestsPerHour: 0 }, capabilities: [] });
}
```

### Unit Tests

```typescript
describe('IConnector interface compliance', () => {
  let connector: IConnector;

  beforeEach(() => {
    connector = new GitHubConnector();
  });

  it('should implement authenticate', async () => {
    const result = await connector.authenticate({
      tenantId: 'test',
      auth: { type: 'bearer', token: 'test' }
    });

    expect(result).toHaveProperty('success');
  });

  it('should implement healthCheck', async () => {
    const result = await connector.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('connector');
  });

  it('should implement sync', async () => {
    const records = [];
    for await (const record of connector.sync({})) {
      records.push(record);
      if (records.length >= 5) break;
    }

    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty('id');
    expect(records[0]).toHaveProperty('type');
  });
});
```

---

## Performance Considerations

### Async Iterators for Memory Efficiency

```typescript
// ✅ GOOD: Stream records one at a time
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  for await (const page of this.fetchPages()) {
    for (const item of page.items) {
      yield this.transform(item);
    }
  }
}

// ❌ BAD: Load all records into memory
async sync(options: SyncOptions): Promise<ConnectorRecord[]> {
  const allRecords = [];
  for await (const page of this.fetchPages()) {
    allRecords.push(...page.items.map(this.transform));
  }
  return allRecords;
}
```

### Batch Processing

```typescript
// Process records in batches for better performance
async syncBatch(options: SyncOptions, batchSize: number = 100): Promise<void> {
  const batch: ConnectorRecord[] = [];

  for await (const record of this.sync(options)) {
    batch.push(record);

    if (batch.length >= batchSize) {
      await this.processBatch(batch);
      batch.length = 0; // Clear batch
    }
  }

  // Process remaining records
  if (batch.length > 0) {
    await this.processBatch(batch);
  }
}
```

---

## Backwards Compatibility

### Versioning Strategy

- **Interface Version:** Encoded in package version (`@gwi/connectors@2.0.0`)
- **Connector Version:** Each connector has own version (`GitHubConnector.version = '1.2.0'`)
- **Breaking Changes:** Require major version bump and migration guide

### Deprecation Process

1. Mark method/field as deprecated with JSDoc
2. Add deprecation warning in implementation
3. Provide migration path in documentation
4. Remove in next major version

```typescript
export interface IConnector {
  /**
   * @deprecated Use sync() instead. Will be removed in v3.0.0
   */
  fetchAll?(options: any): Promise<any[]>;
}
```

---

## References

- 014-DR-DSGN-connector-abstraction.md (Abstraction layer design)
- 012-DR-ADRC-connector-framework-architecture-decision.md (Parent ADR)
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/
- Zod Documentation: https://zod.dev/

---

**Next Steps:**
1. Implement authentication strategies → 015-DR-DSGN-authentication-strategy.md
2. Design webhook receiver → 016-DR-DSGN-webhook-receiver.md
3. Create connector registry → 017-DR-DSGN-connector-registry.md
4. Build reference implementation (GitHub connector)

**Status:** ✅ Approved for implementation
**Approved By:** @connectors-lead, @backend-architect, @security
