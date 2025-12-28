# @gwi/connectors

Production-ready connector framework for Git With Intent. Build type-safe, observable, and resilient data connectors with minimal boilerplate.

## Overview

The Connector Framework provides a standardized way to integrate with external data sources (GitHub, GitLab, Linear, Jira, Slack, Vertex AI). It eliminates ~200 lines of boilerplate per connector by providing:

- **BaseConnector** abstract class with shared utilities
- **Authentication strategies** (Bearer, OAuth2, Service Account)
- **Pagination helpers** (Cursor, Offset, Link Header)
- **Rate limiting** with exponential backoff
- **Health monitoring** and metrics
- **Testing utilities** and mocks

**Target:** Enable rapid connector development (<2 days per connector) with >80% test coverage.

## Quick Start

### Installation

```bash
npm install @gwi/connectors
```

### Basic Usage

```typescript
import { ConnectorRegistry, GitHubConnector } from '@gwi/connectors';

// Create registry
const registry = new ConnectorRegistry();

// Register connector
registry.register('github', (config) => new GitHubConnector(config));

// Get connector for a tenant
const github = await registry.get('github', {
  tenantId: 'tenant-123',
  config: {
    auth: { type: 'bearer', token: process.env.GITHUB_TOKEN! }
  }
});

// Sync data
for await (const record of github.sync({
  resources: [{ type: 'repository', id: 'owner/repo' }],
  types: ['pull_request']
})) {
  console.log(`PR #${record.data.number}: ${record.data.title}`);
}
```

### Health Checks

```typescript
// Check all connectors
const health = await registry.healthCheckAll();

for (const [name, status] of health.entries()) {
  console.log(`${name}: ${status.healthy ? 'OK' : 'UNHEALTHY'}`);
}
```

## Architecture

The framework follows a **6-layer architecture** designed for separation of concerns:

```
+--------------------------------------------------+
|                 IConnector Interface              |
+--------------------------------------------------+
|                BaseConnector Class                |
+--------------------------------------------------+
|  HTTP Transport  |  Authentication  |  Storage   |
+--------------------------------------------------+
|       Rate Limiter / Retry Handler / Pagination  |
+--------------------------------------------------+
|                 Observability Layer              |
|           (Logger / Metrics / Health)            |
+--------------------------------------------------+
```

### Layer Overview

| Layer | Purpose | Key Components |
|-------|---------|----------------|
| **Interface** | Contract definition | `IConnector`, `ConnectorConfig`, `SyncOptions` |
| **Base Class** | Shared utilities, lifecycle | `BaseConnector`, lifecycle hooks |
| **Transport** | HTTP client, retries | `HttpClient`, `RateLimiter`, `RetryHandler` |
| **Authentication** | Credential management | `BearerTokenAuth`, `OAuth2Auth`, `ServiceAccountAuth` |
| **Storage** | State persistence | `FirestoreStorage`, `SQLiteStorage`, `InMemoryStorage` |
| **Observability** | Logging, metrics, health | `Logger`, `Metrics`, `HealthCheck` |

## Supported Connectors

| Connector | Status | API Type | Auth Methods | Features |
|-----------|--------|----------|--------------|----------|
| **GitHub** | Planned | REST/GraphQL | Bearer, OAuth | PRs, Issues, Commits, Webhooks |
| **GitLab** | Planned | REST | Bearer, OAuth | MRs, Issues, Pipelines |
| **Linear** | Planned | GraphQL | Bearer | Issues, Projects, Comments |
| **Jira** | Planned | REST | Bearer, OAuth | Issues, Sprints, Boards |
| **Slack** | Planned | REST/Events | Bearer | Messages, Channels, Webhooks |
| **Vertex AI** | Planned | REST | Service Account | Models, Predictions |

## Core Concepts

### 1. IConnector Interface

Every connector implements this interface:

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

### 2. BaseConnector Abstract Class

Extend this class to build new connectors with built-in utilities:

```typescript
abstract class BaseConnector implements IConnector {
  // Must implement
  abstract authenticate(config: ConnectorConfig): Promise<void>;
  abstract healthCheck(): Promise<HealthStatus>;
  abstract sync(options: SyncOptions): AsyncIterator<ConnectorRecord>;

  // Shared utilities (free)
  protected async retryRequest<T>(fn: () => Promise<T>): Promise<T>;
  protected async checkRateLimit(): Promise<void>;
  protected handleError(error: any): never;
  protected log(level: string, message: string, meta?: any): void;

  // Lifecycle hooks (optional)
  protected async onBeforeSync(options: SyncOptions): Promise<void>;
  protected async onAfterSync(result: SyncResult): Promise<void>;
  protected async onError(error: Error, context: any): Promise<void>;
}
```

### 3. ConnectorRegistry

Central hub for connector discovery and health monitoring:

```typescript
class ConnectorRegistry {
  register(name: string, factory: ConnectorFactory): void;
  get(name: string, options?: GetConnectorOptions): Promise<IConnector>;
  list(): string[];
  healthCheckAll(): Promise<Map<string, HealthStatus>>;
  getHealthy(): Promise<string[]>;
}
```

### 4. Authentication Strategies

Three authentication patterns with a consistent interface:

```typescript
interface IAuthStrategy {
  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;
  getHeaders(): Record<string, string>;
  isExpired(): boolean;
}

// Implementations
class BearerTokenAuth implements IAuthStrategy { /* ... */ }
class OAuth2Auth implements IAuthStrategy { /* ... */ }
class ServiceAccountAuth implements IAuthStrategy { /* ... */ }
```

### 5. Pagination Strategies

Support for different API pagination styles:

```typescript
interface IPaginationStrategy<T> {
  hasMore(response: T): boolean;
  getNextCursor(response: T): string | null;
  buildRequest(cursor: string | null): RequestOptions;
}

// Implementations
class CursorPagination implements IPaginationStrategy { /* ... */ }
class OffsetPagination implements IPaginationStrategy { /* ... */ }
class LinkHeaderPagination implements IPaginationStrategy { /* ... */ }
```

## Directory Structure

```
packages/connectors/
├── src/
│   ├── interfaces/           # Core interfaces
│   │   ├── IConnector.ts
│   │   ├── IAuthStrategy.ts
│   │   ├── IPaginationStrategy.ts
│   │   └── types.ts
│   ├── base/                 # Base implementations
│   │   ├── BaseConnector.ts
│   │   └── BaseConnector.test.ts
│   ├── auth/                 # Authentication strategies
│   │   ├── BearerTokenAuth.ts
│   │   ├── OAuth2Auth.ts
│   │   └── ServiceAccountAuth.ts
│   ├── transport/            # HTTP layer
│   │   ├── HttpClient.ts
│   │   ├── RateLimiter.ts
│   │   └── RetryHandler.ts
│   ├── pagination/           # Pagination helpers
│   │   ├── CursorPagination.ts
│   │   ├── OffsetPagination.ts
│   │   └── LinkHeaderPagination.ts
│   ├── storage/              # State persistence
│   │   ├── FirestoreStorage.ts
│   │   ├── SQLiteStorage.ts
│   │   └── InMemoryStorage.ts
│   ├── observability/        # Logging, metrics, health
│   │   ├── Logger.ts
│   │   ├── Metrics.ts
│   │   └── HealthCheck.ts
│   ├── registry/             # Connector registry
│   │   ├── ConnectorRegistry.ts
│   │   └── TenantConfigStore.ts
│   ├── errors/               # Error types
│   │   └── ConnectorErrors.ts
│   ├── testing/              # Testing utilities
│   │   ├── MockConnector.ts
│   │   └── TestHarness.ts
│   ├── connectors/           # Connector implementations
│   │   ├── github/
│   │   ├── gitlab/
│   │   ├── linear/
│   │   ├── jira/
│   │   ├── slack/
│   │   └── vertex/
│   └── index.ts              # Public exports
├── docs/                     # Documentation
│   ├── getting-started.md
│   ├── creating-connectors.md
│   ├── api-reference.md
│   ├── architecture.md
│   └── examples/
├── test/                     # Tests
├── package.json
├── tsconfig.json
└── README.md
```

## Key Features

### Automatic Retry with Exponential Backoff

```typescript
// Built into BaseConnector
const data = await this.retryRequest(async () => {
  return await this.httpClient.get('/api/resource');
}, {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
});
```

### Rate Limiting with Retry-After

```typescript
// Automatic detection and handling
if (error.statusCode === 429) {
  const retryAfter = error.headers['retry-after'];
  await this.sleep(parseInt(retryAfter) * 1000);
  // Retry automatically
}
```

### Memory-Efficient Streaming

```typescript
// Async iterators for large datasets
async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
  for await (const page of this.fetchPages()) {
    for (const item of page.items) {
      yield this.transform(item);  // One at a time, low memory
    }
  }
}
```

### Webhook Processing

```typescript
// HMAC signature verification included
async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
  // Verify signature
  if (!this.verifySignature(event.payload, event.signature)) {
    throw new ValidationError('Invalid webhook signature');
  }

  // Process event
  const records = await this.handleEvent(event);

  return { success: true, recordsProcessed: records.length };
}
```

### Health Monitoring

```typescript
// Standardized health checks
async healthCheck(): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];

  // Auth check
  checks.push(await this.checkAuth());

  // API reachability
  checks.push(await this.checkApiReachable());

  // Rate limit status
  checks.push(await this.checkRateLimit());

  return {
    healthy: checks.every(c => c.status === 'pass'),
    checks,
    timestamp: new Date().toISOString()
  };
}
```

## Documentation

- **[Getting Started](./docs/getting-started.md)** - Installation and first connector
- **[Creating Connectors](./docs/creating-connectors.md)** - Build your own connector
- **[API Reference](./docs/api-reference.md)** - Complete API documentation
- **[Architecture](./docs/architecture.md)** - Deep dive into framework design
- **[Examples](./docs/examples/)** - Sample code and patterns

## Design Decisions

This framework is based on extensive research documented in:

- **[ADR-012](../../000-docs/012-DR-ADRC-connector-framework-architecture-decision.md)** - Architecture decisions
- **[Design-014](../../000-docs/014-DR-DSGN-connector-abstraction.md)** - Abstraction layer design
- **[Design-015](../../000-docs/015-DR-DSGN-iconnector-interface.md)** - IConnector interface
- **[Design-018](../../000-docs/018-DR-DSGN-connector-registry.md)** - Registry system
- **[Patterns-011](../../000-docs/011-DR-PATT-production-connector-patterns.md)** - Production patterns analysis

### Key Insights from Research

- **Airbyte CDK:** Studied 600+ connectors, adopted 3-tier architecture
- **SurfSense:** Analyzed 15 production connectors, identified common patterns
- **Authentication:** 73% use bearer tokens, 13% OAuth, 14% service accounts
- **Pagination:** 70% cursor-based, 25% offset, 5% link headers
- **Rate Limiting:** 100% implement retry logic with exponential backoff

## Performance Targets

| Metric | Target |
|--------|--------|
| Connector development time | <2 days |
| Test coverage | >80% |
| Health check response | <100ms p95 |
| Webhook delivery success | 99.9% |
| Code reuse | >60% shared utilities |

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific connector tests
npm test -- --filter=github

# Run integration tests (requires tokens)
GITHUB_TEST_TOKEN=xxx npm run test:integration
```

### Testing Utilities

```typescript
import { MockConnector, TestHarness } from '@gwi/connectors/testing';

// Create mock connector
const mock = new MockConnector();
mock.sync.mockImplementation(async function* () {
  yield { id: '1', type: 'test', data: { title: 'Test' } };
});

// Use test harness
const harness = new TestHarness(MyConnector);
await harness.testAuthentication({ token: 'valid' });
await harness.testSyncPagination({ pages: 5, itemsPerPage: 100 });
await harness.testWebhookSignature({ secret: 'abc123' });
```

## Environment Variables

```bash
# Required for production
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=your-project

# Optional rate limit overrides
GWI_RATE_LIMIT_MAX_RPS=10
GWI_RATE_LIMIT_MAX_RPH=1000

# Connector-specific tokens (for development/testing)
GITHUB_TOKEN=your_github_token
GITLAB_TOKEN=glpat_xxx
LINEAR_TOKEN=lin_xxx
SLACK_TOKEN=xoxb_xxx
```

## Security

- **Secret Manager Integration:** All credentials stored in GCP Secret Manager
- **HMAC Verification:** Mandatory for webhook endpoints
- **Tenant Isolation:** Each tenant has independent credentials
- **No Secrets in Code:** Environment variables or Secret Manager only
- **Audit Logging:** All connector operations logged

## Contributing

1. Read the [Creating Connectors](./docs/creating-connectors.md) guide
2. Follow the existing connector structure
3. Add comprehensive tests (>80% coverage)
4. Update documentation
5. Run ARV checks before submitting

```bash
npm run arv           # All checks
npm run arv:lint      # Forbidden patterns
npm run arv:contracts # Schema validation
npm run arv:goldens   # Deterministic outputs
```

## License

Apache 2.0 - See LICENSE file for details.

---

**Part of the Git With Intent project** - AI-powered PR automation platform.
