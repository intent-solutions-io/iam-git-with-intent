# API Reference

Complete API documentation for the @gwi/connectors framework.

## Table of Contents

1. [Core Interfaces](#core-interfaces)
   - [IConnector](#iconnector)
   - [ConnectorConfig](#connectorconfig)
   - [AuthResult](#authresult)
   - [HealthStatus](#healthstatus)
   - [SyncOptions](#syncoptions)
   - [ConnectorRecord](#connectorrecord)
   - [WebhookEvent](#webhookevent)
   - [WebhookResult](#webhookresult)
   - [ConnectorMetadata](#connectormetadata)
2. [BaseConnector](#baseconnector)
3. [ConnectorRegistry](#connectorregistry)
4. [Authentication Strategies](#authentication-strategies)
   - [IAuthStrategy](#iauthstrategy)
   - [BearerTokenAuth](#bearertokenauth)
   - [OAuth2Auth](#oauth2auth)
   - [ServiceAccountAuth](#serviceaccountauth)
5. [Rate Limiting](#rate-limiting)
   - [IRateLimiter](#iratelimiter)
   - [TokenBucketRateLimiter](#tokenbucketratelimiter)
6. [Retry Handler](#retry-handler)
   - [IRetryHandler](#iretryhandler)
   - [ExponentialBackoffRetry](#exponentialbackoffretry)
7. [Pagination Strategies](#pagination-strategies)
   - [IPaginationStrategy](#ipaginationstrategy)
   - [CursorPagination](#cursorpagination)
   - [OffsetPagination](#offsetpagination)
   - [LinkHeaderPagination](#linkheaderpagination)
8. [Health Check](#health-check)
9. [Testing Utilities](#testing-utilities)
10. [Error Types](#error-types)
11. [Zod Schemas](#zod-schemas)

---

## Core Interfaces

### IConnector

The primary interface all connectors must implement.

```typescript
interface IConnector {
  readonly name: string;
  readonly version: string;
  readonly configSchema: z.ZodSchema<ConnectorConfig>;

  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  healthCheck(): Promise<HealthStatus>;
  sync(options: SyncOptions): AsyncIterator<ConnectorRecord>;
  processWebhook(event: WebhookEvent): Promise<WebhookResult>;
  getMetadata(): ConnectorMetadata;
}
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier (e.g., 'github', 'gitlab') |
| `version` | `string` | Semantic version (e.g., '1.0.0') |
| `configSchema` | `z.ZodSchema` | Zod schema for configuration validation |

#### Methods

##### authenticate(config)

Authenticate with the external API.

**Parameters:**
- `config: ConnectorConfig` - Authentication and connection configuration

**Returns:** `Promise<AuthResult>`

**Throws:** `AuthenticationError` if credentials are invalid

**Example:**
```typescript
const result = await connector.authenticate({
  tenantId: 'tenant-123',
  auth: {
    type: 'bearer',
    token: process.env.GITHUB_TOKEN!
  }
});

if (!result.success) {
  console.error('Auth failed:', result.error);
}
```

##### healthCheck()

Check connector health and API connectivity.

**Returns:** `Promise<HealthStatus>`

**Example:**
```typescript
const health = await connector.healthCheck();
console.log(`Healthy: ${health.healthy}`);

for (const check of health.checks) {
  console.log(`${check.name}: ${check.status} (${check.durationMs}ms)`);
}
```

##### sync(options)

Sync data from the external source.

**Parameters:**
- `options: SyncOptions` - Sync configuration (filters, limits, incremental cursor)

**Returns:** `AsyncIterator<ConnectorRecord>`

**Throws:** `ConnectorError` on sync failure

**Example:**
```typescript
for await (const record of connector.sync({
  resources: [{ type: 'repository', id: 'owner/repo' }],
  types: ['pull_request', 'issue'],
  limit: 100
})) {
  console.log(`Record: ${record.id} (${record.type})`);
}
```

##### processWebhook(event)

Process an incoming webhook event.

**Parameters:**
- `event: WebhookEvent` - Webhook payload and metadata

**Returns:** `Promise<WebhookResult>`

**Throws:** `ValidationError` if signature is invalid

**Example:**
```typescript
const result = await connector.processWebhook({
  id: 'evt-123',
  source: 'github',
  type: 'pull_request.opened',
  timestamp: new Date().toISOString(),
  payload: { ... },
  signature: 'sha256=abc123',
  headers: { 'x-github-event': 'pull_request' }
});
```

##### getMetadata()

Get connector capabilities and metadata.

**Returns:** `ConnectorMetadata`

**Example:**
```typescript
const meta = connector.getMetadata();
console.log(`${meta.name} v${meta.version}`);
console.log(`Supports: ${meta.capabilities.join(', ')}`);
```

---

### ConnectorConfig

Configuration for connector initialization.

```typescript
interface ConnectorConfig {
  tenantId: string;
  auth: AuthConfig;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  headers?: Record<string, string>;
}

type AuthConfig =
  | BearerTokenAuthConfig
  | OAuth2AuthConfig
  | ServiceAccountAuthConfig;

interface BearerTokenAuthConfig {
  type: 'bearer';
  token: string;
}

interface OAuth2AuthConfig {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
}

interface ServiceAccountAuthConfig {
  type: 'service_account';
  serviceAccountEmail: string;
  privateKey: string;
  projectId: string;
}

interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerHour: number;
  maxConcurrentRequests: number;
}
```

---

### AuthResult

Result of authentication attempt.

```typescript
interface AuthResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  refreshToken?: string;
  error?: string;
  metadata?: Record<string, any>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether authentication succeeded |
| `token` | `string?` | Access token (if applicable) |
| `expiresAt` | `string?` | ISO 8601 token expiration |
| `refreshToken` | `string?` | Refresh token (for OAuth) |
| `error` | `string?` | Error message if failed |
| `metadata` | `object?` | Additional data (user info, scopes) |

---

### HealthStatus

Health check result.

```typescript
interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  connector: string;
  checks: HealthCheck[];
  error?: string;
  metadata?: Record<string, any>;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  durationMs: number;
  error?: string;
  metadata?: Record<string, any>;
}
```

**Standard Check Names:**
- `auth_valid` - Can authenticate successfully
- `api_reachable` - Can reach API endpoint
- `credentials_valid` - Credentials not expired
- `rate_limit_ok` - Not rate limited

---

### SyncOptions

Options for sync operation.

```typescript
interface SyncOptions {
  incremental?: IncrementalSyncConfig;
  resources?: ResourceFilter[];
  types?: string[];
  limit?: number;
  validateSchemas?: boolean;
}

interface IncrementalSyncConfig {
  cursorField: string;
  startCursor?: string;
  endCursor?: string;
  granularity?: 'hour' | 'day' | 'week';
}

interface ResourceFilter {
  type: string;
  id: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `incremental` | `object?` | Incremental sync configuration |
| `resources` | `array?` | Resources to sync (repos, channels, etc.) |
| `types` | `string[]?` | Record types to sync (pull_request, issue, etc.) |
| `limit` | `number?` | Maximum records to fetch |
| `validateSchemas` | `boolean?` | Validate output schemas |

---

### ConnectorRecord

Standardized record returned by connectors.

```typescript
interface ConnectorRecord {
  id: string;
  type: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `type` | `string` | Record type (pull_request, issue, message) |
| `source` | `string` | Connector name |
| `createdAt` | `string` | ISO 8601 creation timestamp |
| `updatedAt` | `string` | ISO 8601 update timestamp |
| `data` | `object` | Source-specific data |
| `metadata` | `object?` | Cursor, etag, URL, etc. |

---

### WebhookEvent

Incoming webhook event.

```typescript
interface WebhookEvent {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  payload: Record<string, any>;
  signature: string;
  headers: Record<string, string>;
}
```

---

### WebhookResult

Webhook processing result.

```typescript
interface WebhookResult {
  success: boolean;
  durationMs: number;
  error?: string;
  recordsProcessed?: number;
  metadata?: Record<string, any>;
}
```

---

### ConnectorMetadata

Connector capabilities metadata.

```typescript
interface ConnectorMetadata {
  name: string;
  version: string;
  recordTypes: string[];
  authMethods: ('bearer' | 'oauth2' | 'service_account')[];
  supportsIncremental: boolean;
  supportsWebhooks: boolean;
  rateLimits: {
    requestsPerSecond: number;
    requestsPerHour: number;
  };
  capabilities: string[];
  documentationUrl?: string;
}
```

---

## BaseConnector

Abstract base class providing shared utilities.

```typescript
abstract class BaseConnector implements IConnector {
  // Dependencies (injected)
  protected httpClient: IHttpClient;
  protected auth: IAuthStrategy;
  protected storage: IStorage;
  protected logger: ILogger;
  protected metrics: IMetrics;
  protected rateLimiter: IRateLimiter;
  protected retryHandler: IRetryHandler;

  // Abstract methods (must implement)
  abstract authenticate(config: ConnectorConfig): Promise<void>;
  abstract healthCheck(): Promise<HealthStatus>;
  abstract sync(options: SyncOptions): AsyncIterator<ConnectorRecord>;
  abstract processWebhook(event: WebhookEvent): Promise<WebhookResult>;

  // Utility methods
  protected async retryRequest<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T>;

  protected async checkRateLimit(response: any): Promise<void>;
  protected handleError(error: any, context?: any): never;
  protected log(level: LogLevel, message: string, meta?: any): void;
  protected recordMetric(name: string, value: number, labels?: Record<string, string>): void;

  // Lifecycle hooks (optional to override)
  protected async onBeforeSync(options: SyncOptions): Promise<void>;
  protected async onAfterSync(result: SyncResult): Promise<void>;
  protected async onError(error: Error, context: any): Promise<void>;
  protected async onRateLimit(error: RateLimitError): Promise<void>;
}
```

### Protected Methods

#### retryRequest(fn, options?)

Retry a function with exponential backoff.

```typescript
protected async retryRequest<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>;

interface RetryOptions {
  maxAttempts?: number;      // Default: 3
  initialDelayMs?: number;   // Default: 1000
  maxDelayMs?: number;       // Default: 30000
  backoffMultiplier?: number; // Default: 2
  retryableErrors?: (error: any) => boolean;
}
```

**Example:**
```typescript
const data = await this.retryRequest(
  async () => await this.httpClient.get('/api/data'),
  {
    maxAttempts: 5,
    initialDelayMs: 500,
    retryableErrors: (e) => e.statusCode >= 500
  }
);
```

#### log(level, message, meta?)

Structured logging.

```typescript
protected log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, any>
): void;
```

**Example:**
```typescript
this.log('info', 'Starting sync', {
  repository: 'owner/repo',
  types: ['pull_request']
});
```

#### recordMetric(name, value, labels?)

Record a metric.

```typescript
protected recordMetric(
  name: string,
  value: number,
  labels?: Record<string, string>
): void;
```

**Example:**
```typescript
this.recordMetric('records_synced', 100, {
  connector: this.name,
  type: 'pull_request'
});
```

#### handleError(error, context?)

Standardized error handling.

```typescript
protected handleError(error: any, context?: any): never;
```

---

## ConnectorRegistry

Central registry for connector management.

```typescript
class ConnectorRegistry implements IConnectorRegistry {
  constructor(
    tenantConfigStore: ITenantConfigStore,
    logger: ILogger,
    metrics: IMetrics
  );

  register(name: string, factory: ConnectorFactory): void;
  unregister(name: string): void;
  get(name: string, options?: GetConnectorOptions): Promise<IConnector>;
  has(name: string): boolean;
  list(): string[];
  getMetadata(name: string): Promise<ConnectorMetadata>;
  healthCheck(name: string, options?: GetConnectorOptions): Promise<HealthStatus>;
  healthCheckAll(): Promise<Map<string, HealthStatus>>;
  getHealthy(): Promise<string[]>;
  getVersion(name: string): string;
  isCompatible(name: string): Promise<boolean>;
}

type ConnectorFactory = (config: ConnectorConfig) => IConnector | Promise<IConnector>;

interface GetConnectorOptions {
  tenantId?: string;
  config?: Partial<ConnectorConfig>;
  skipHealthCheck?: boolean;
}
```

### Methods

#### register(name, factory)

Register a connector factory.

```typescript
registry.register('github', (config) => new GitHubConnector(config));
```

#### get(name, options?)

Get or create a connector instance.

```typescript
const github = await registry.get('github', {
  tenantId: 'tenant-123',
  config: { auth: { type: 'bearer', token: '...' } }
});
```

#### healthCheckAll()

Health check all registered connectors.

```typescript
const health = await registry.healthCheckAll();

for (const [name, status] of health.entries()) {
  console.log(`${name}: ${status.healthy ? 'OK' : 'FAIL'}`);
}
```

#### getHealthy()

Get list of healthy connector names.

```typescript
const healthy = await registry.getHealthy();
console.log('Healthy connectors:', healthy.join(', '));
```

---

## Authentication Strategies

### IAuthStrategy

Interface for authentication strategies.

```typescript
interface IAuthStrategy {
  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;
  getHeaders(): Record<string, string>;
  isExpired(): boolean;
}
```

### BearerTokenAuth

Simple bearer token authentication.

```typescript
class BearerTokenAuth implements IAuthStrategy {
  constructor(token: string);

  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;  // No-op for bearer tokens
  getHeaders(): Record<string, string>;
  isExpired(): boolean;  // Always false for bearer tokens
}
```

**Usage:**
```typescript
const auth = new BearerTokenAuth('your_token');
const headers = auth.getHeaders();
// { 'Authorization': 'Bearer your_token', 'Content-Type': 'application/json' }
```

### OAuth2Auth

OAuth 2.0 with automatic token refresh.

```typescript
class OAuth2Auth implements IAuthStrategy {
  constructor(options: OAuth2Options);

  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;
  getHeaders(): Record<string, string>;
  isExpired(): boolean;
  getAccessToken(): Promise<string>;
  getRefreshToken(): string | undefined;
  getExpiresAt(): string | undefined;
}

interface OAuth2Options {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}
```

**Usage:**
```typescript
const auth = new OAuth2Auth({
  clientId: 'xxx',
  clientSecret: 'yyy',
  redirectUri: 'https://app.example.com/callback',
  tokenUrl: 'https://oauth.example.com/token',
  refreshToken: 'refresh_token_here'
});

// Auto-refresh before getting headers
await auth.refreshIfNeeded();
const headers = auth.getHeaders();
```

### ServiceAccountAuth

Google Cloud service account authentication.

```typescript
class ServiceAccountAuth implements IAuthStrategy {
  constructor(options: ServiceAccountOptions);

  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;
  getHeaders(): Record<string, string>;
  isExpired(): boolean;
}

interface ServiceAccountOptions {
  serviceAccountEmail: string;
  privateKey: string;
  projectId: string;
  scopes?: string[];
}
```

---

## Rate Limiting

### IRateLimiter

Interface for rate limiters.

```typescript
interface IRateLimiter {
  checkLimit(key: string): Promise<void>;
  recordRequest(key: string): void;
  handleRateLimit(error: RateLimitError): Promise<void>;
  getRemainingRequests(key: string): number;
  getResetTime(key: string): number;
}
```

### TokenBucketRateLimiter

Token bucket rate limiter implementation.

```typescript
class TokenBucketRateLimiter implements IRateLimiter {
  constructor(options: TokenBucketOptions);

  checkLimit(key: string): Promise<void>;
  recordRequest(key: string): void;
  handleRateLimit(error: RateLimitError): Promise<void>;
  getRemainingRequests(key: string): number;
  getResetTime(key: string): number;
}

interface TokenBucketOptions {
  maxTokens: number;     // Maximum requests in bucket
  refillRate: number;    // Tokens per second to refill
  refillInterval?: number; // Refill interval in ms (default: 1000)
}
```

**Usage:**
```typescript
const limiter = new TokenBucketRateLimiter({
  maxTokens: 100,
  refillRate: 10  // 10 requests per second
});

// Before each request
await limiter.checkLimit('github');
const response = await fetch('/api/data');
limiter.recordRequest('github');
```

---

## Retry Handler

### IRetryHandler

Interface for retry handlers.

```typescript
interface IRetryHandler {
  retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T>;
}

interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: (error: any) => boolean;
}
```

### ExponentialBackoffRetry

Exponential backoff retry handler with jitter.

```typescript
class ExponentialBackoffRetry implements IRetryHandler {
  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T>;
}
```

**Usage:**
```typescript
const retry = new ExponentialBackoffRetry();

const result = await retry.retry(
  async () => await fetch('/api/data'),
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: (error) => error.statusCode >= 500
  }
);
```

**Delay Calculation:**
```
delay = min(initialDelayMs * (backoffMultiplier ^ attempt), maxDelayMs) + jitter
```

---

## Pagination Strategies

### IPaginationStrategy

Interface for pagination strategies.

```typescript
interface IPaginationStrategy<T = any> {
  hasMore(response: T): boolean;
  getNextCursor(response: T): string | null;
  buildRequest(cursor: string | null): RequestOptions;
}
```

### CursorPagination

Cursor-based pagination (Slack, Linear, Notion).

```typescript
class CursorPagination implements IPaginationStrategy {
  constructor(cursorField?: string);  // Default: 'next_cursor'

  hasMore(response: any): boolean;
  getNextCursor(response: any): string | null;
  buildRequest(cursor: string | null): RequestOptions;
}
```

**Usage:**
```typescript
const pagination = new CursorPagination('response_metadata.next_cursor');

let cursor: string | null = null;
do {
  const response = await fetch(`/api/items?cursor=${cursor || ''}`);
  // Process response.data.items
  cursor = pagination.getNextCursor(response);
} while (pagination.hasMore(response));
```

### OffsetPagination

Offset-based pagination (Jira, Confluence).

```typescript
class OffsetPagination implements IPaginationStrategy {
  constructor(pageSize?: number);  // Default: 100

  hasMore(response: any): boolean;
  getNextCursor(response: any): string | null;
  buildRequest(cursor: string | null): RequestOptions;
}
```

### LinkHeaderPagination

Link header pagination (GitHub).

```typescript
class LinkHeaderPagination implements IPaginationStrategy {
  hasMore(response: any): boolean;
  getNextCursor(response: any): string | null;
  buildRequest(cursor: string | null): RequestOptions;
}
```

**Usage:**
```typescript
const pagination = new LinkHeaderPagination();

let url: string | null = '/api/repos/owner/repo/pulls';
while (url) {
  const response = await fetch(url);
  // Process response.data
  url = pagination.getNextCursor(response);
}
```

### paginate() Helper

Generic pagination helper function.

```typescript
async function* paginate<T>(
  requestFn: (cursor: string | null) => Promise<T>,
  strategy: IPaginationStrategy<T>
): AsyncIterator<T>;
```

**Usage:**
```typescript
for await (const page of paginate(
  (cursor) => fetch(`/api/items?cursor=${cursor || ''}`),
  new CursorPagination()
)) {
  for (const item of page.data.items) {
    console.log(item);
  }
}
```

---

## Health Check

### Standard Health Check Pattern

```typescript
async healthCheck(): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];

  // Check 1: Authentication
  checks.push(await this.checkAuth());

  // Check 2: API Reachability
  checks.push(await this.checkApiReachable());

  // Check 3: Rate Limit Status
  checks.push(await this.checkRateLimitStatus());

  return {
    healthy: checks.every(c => c.status !== 'fail'),
    timestamp: new Date().toISOString(),
    connector: this.name,
    checks
  };
}

private async checkAuth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await this.httpClient.get('/me', { headers: this.getAuthHeaders() });
    return { name: 'auth_valid', status: 'pass', durationMs: Date.now() - start };
  } catch (error) {
    return { name: 'auth_valid', status: 'fail', durationMs: Date.now() - start, error: error.message };
  }
}
```

---

## Testing Utilities

### MockConnector

Mock connector for unit tests.

```typescript
class MockConnector implements IConnector {
  readonly name = 'mock';
  readonly version = '1.0.0';
  readonly configSchema = ConnectorConfigSchema;

  authenticate = jest.fn().mockResolvedValue({ success: true });
  healthCheck = jest.fn().mockResolvedValue({
    healthy: true,
    timestamp: new Date().toISOString(),
    connector: 'mock',
    checks: []
  });
  sync = jest.fn();
  processWebhook = jest.fn().mockResolvedValue({ success: true, durationMs: 0 });
  getMetadata = jest.fn().mockReturnValue({
    name: 'mock',
    version: '1.0.0',
    recordTypes: [],
    authMethods: ['bearer'],
    supportsIncremental: false,
    supportsWebhooks: false,
    rateLimits: { requestsPerSecond: 10, requestsPerHour: 1000 },
    capabilities: []
  });
}
```

### MockHttpClient

Mock HTTP client for unit tests.

```typescript
class MockHttpClient implements IHttpClient {
  get = jest.fn();
  post = jest.fn();
  put = jest.fn();
  delete = jest.fn();
  patch = jest.fn();
}
```

### MockStorage

Mock storage for unit tests.

```typescript
class MockStorage implements IStorage {
  saveState = jest.fn();
  loadState = jest.fn();
  saveRun = jest.fn();
  updateRun = jest.fn();
  getRun = jest.fn();
  saveRecords = jest.fn();
  queryRecords = jest.fn();
}
```

### TestHarness

Test harness for integration testing.

```typescript
class TestHarness<T extends IConnector> {
  constructor(ConnectorClass: new (...args: any[]) => T);

  async testAuthentication(config: ConnectorConfig): Promise<void>;
  async testHealthCheck(): Promise<void>;
  async testSyncPagination(options: { pages: number; itemsPerPage: number }): Promise<void>;
  async testWebhookSignature(options: { secret: string; payload: any }): Promise<void>;
  async testRateLimiting(options: { requests: number }): Promise<void>;
}
```

**Usage:**
```typescript
const harness = new TestHarness(GitHubConnector);

// Test all connector behaviors
await harness.testAuthentication({ tenantId: 'test', auth: { type: 'bearer', token: 'xxx' } });
await harness.testHealthCheck();
await harness.testSyncPagination({ pages: 3, itemsPerPage: 100 });
await harness.testWebhookSignature({ secret: 'secret', payload: { action: 'opened' } });
```

---

## Error Types

### ConnectorError

Base error for all connector errors.

```typescript
class ConnectorError extends Error {
  constructor(
    message: string,
    public connector: string,
    public context?: any
  );
}
```

### AuthenticationError

Authentication failure.

```typescript
class AuthenticationError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    context?: any
  );
}
```

### RateLimitError

Rate limit exceeded.

```typescript
class RateLimitError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    public retryAfter: number,  // milliseconds
    context?: any
  );
}
```

### NetworkError

Network/connection errors.

```typescript
class NetworkError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    public statusCode?: number,
    context?: any
  );
}
```

### ValidationError

Validation failures.

```typescript
class ValidationError extends ConnectorError {
  constructor(
    message: string,
    connector: string,
    public validationErrors: any[],
    context?: any
  );
}
```

---

## Zod Schemas

All types have corresponding Zod schemas for runtime validation.

### ConnectorConfigSchema

```typescript
const ConnectorConfigSchema = z.object({
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

### ConnectorRecordSchema

```typescript
const ConnectorRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional()
});
```

### HealthStatusSchema

```typescript
const HealthStatusSchema = z.object({
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

### Usage

```typescript
import { ConnectorConfigSchema, ConnectorRecordSchema } from '@gwi/connectors';

// Validate configuration
const config = ConnectorConfigSchema.parse(inputConfig);

// Validate record output
const record = ConnectorRecordSchema.parse(rawRecord);
```

---

## Type Exports

All types are exported from the package root:

```typescript
import {
  // Interfaces
  IConnector,
  IAuthStrategy,
  IPaginationStrategy,
  IRateLimiter,
  IRetryHandler,
  IConnectorRegistry,

  // Types
  ConnectorConfig,
  AuthConfig,
  AuthResult,
  HealthStatus,
  HealthCheck,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata,
  RetryOptions,

  // Classes
  BaseConnector,
  ConnectorRegistry,
  BearerTokenAuth,
  OAuth2Auth,
  ServiceAccountAuth,
  TokenBucketRateLimiter,
  ExponentialBackoffRetry,
  CursorPagination,
  OffsetPagination,
  LinkHeaderPagination,

  // Errors
  ConnectorError,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ValidationError,

  // Schemas
  ConnectorConfigSchema,
  ConnectorRecordSchema,
  HealthStatusSchema,
  SyncOptionsSchema,
  WebhookEventSchema,

  // Testing
  MockConnector,
  MockHttpClient,
  MockStorage,
  TestHarness,

  // Utilities
  paginate
} from '@gwi/connectors';
```

---

**Next:** [Architecture](./architecture.md) | [Examples](./examples/)
