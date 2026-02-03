# ADR: Connector Framework Architecture

**Document ID:** 012-DR-ADRC
**Date:** 2025-12-27
**Status:** ✅ Accepted
**Epic:** B (Data Ingestion & Connector Framework)
**Story:** B1 (Study Existing Connector Patterns)
**Task:** B1.5 (Document connector patterns ADR)
**Deciders:** @connectors-lead, @backend-architect, @security

---

## Context and Problem Statement

Git With Intent requires a production-ready connector framework to ingest data from multiple sources (GitHub, GitLab, Jira, Linear, Slack, Vertex AI). We need to decide on the architectural patterns, abstractions, and implementation approach for building 6+ connectors with minimal code duplication and maximum maintainability.

**Key Requirements:**
- Support multiple authentication methods (OAuth 2.0, API tokens, service accounts)
- Handle pagination across different API styles (cursor, offset, link headers)
- Implement robust rate limiting and retry logic
- Provide webhook support for real-time data ingestion
- Enable rapid development of new connectors (<2 days per connector)
- Achieve >80% test coverage
- Support both pull (API polling) and push (webhooks) patterns

**Research Conducted:**
- Analyzed Airbyte CDK architecture (600+ connectors, 3-tier approach)
- Studied 15 production connectors from SurfSense (GitHub, Jira, Linear, Slack, Discord, Notion, Google Calendar/Gmail, Confluence, ClickUp, Airtable, Bookstack, Elasticsearch, Luma, WebCrawler)
- Documented patterns in 010-DR-ADOC and 011-DR-PATT

---

## Decision Drivers

1. **Time to Market:** Must enable rapid connector development
2. **Maintainability:** Minimize code duplication across connectors
3. **Type Safety:** Leverage TypeScript strict mode for compile-time safety
4. **Production Readiness:** Handle edge cases (rate limits, retries, errors)
5. **Developer Experience:** Clear abstractions, good documentation, testing utilities
6. **Scalability:** Support high-throughput webhook ingestion and concurrent syncs
7. **Security:** Secure credential storage, HMAC webhook verification
8. **Observability:** Health checks, logging, metrics

---

## Considered Options

### Option 1: Full Custom Implementation (No Framework)
- **Pros:** Maximum flexibility, no abstraction overhead
- **Cons:** High code duplication, slow connector development, inconsistent error handling
- **Verdict:** ❌ Rejected (would take 5-7 days per connector)

### Option 2: Adopt Airbyte Python CDK Directly
- **Pros:** Battle-tested, 600+ connectors, comprehensive features
- **Cons:** Python (not TypeScript), requires Python runtime, heavyweight for our use case
- **Verdict:** ❌ Rejected (language mismatch, operational complexity)

### Option 3: Port Airbyte CDK Patterns to TypeScript
- **Pros:** Proven patterns, TypeScript native, tailored to our needs
- **Cons:** Initial framework development effort
- **Verdict:** ✅ **SELECTED** (best balance of flexibility and structure)

### Option 4: Use Off-the-Shelf Node.js ETL Framework
- **Pros:** Pre-built connectors
- **Cons:** Most are data warehouse focused (not PR automation), licensing concerns
- **Verdict:** ❌ Rejected (wrong domain focus)

---

## Decision Outcome

**Chosen Option:** Build a TypeScript connector framework inspired by Airbyte CDK patterns

We will implement a 3-layer connector architecture:

### Layer 1: Core Framework (`@gwi/connectors`)
- **BaseConnector** abstract class with shared utilities
- **ConnectorRegistry** for discovery and health monitoring
- **Authentication strategies** (BearerTokenAuth, OAuth2Auth, ServiceAccountAuth)
- **Pagination helpers** (CursorPagination, OffsetPagination, LinkHeaderPagination)
- **Rate limiter** with exponential backoff
- **Webhook receiver service** (Cloud Run)
- **Testing utilities** (MockConnector, WebhookTestHarness)

### Layer 2: Connector Implementations
- **GitHub Connector** (reference implementation)
- **GitLab Connector**
- **Linear Connector** (GraphQL example)
- **Jira/Plane Connector**
- **Slack Connector** (Events API example)
- **Vertex AI Connector** (Google Cloud integration)

### Layer 3: Integration Points
- **Firestore** for operational data (runs, approvals)
- **Pub/Sub** for async webhook processing
- **Secret Manager** for credential storage
- **Cloud Run** for webhook ingestion and connector workers

---

## Architecture Decisions

### AD-1: BaseConnector Abstract Class

**Decision:** All connectors extend `BaseConnector` which provides:
```typescript
abstract class BaseConnector implements IConnector {
  // Must implement
  abstract authenticate(config: ConnectorConfig): Promise<void>;
  abstract healthCheck(): Promise<HealthStatus>;
  abstract sync(options: SyncOptions): AsyncIterator<Record>;

  // Shared utilities
  protected async retryRequest<T>(fn: () => Promise<T>): Promise<T>;
  protected async checkRateLimit(): Promise<void>;
  protected handleError(error: any): never;
  protected log(level: string, message: string, meta?: any): void;
}
```

**Rationale:**
- Eliminates code duplication (retry, rate limiting, error handling)
- Enforces interface compliance
- Provides consistent logging and observability
- Enables testing with MockConnector

**Based on:** SurfSense connectors all implement similar patterns manually (each ~50 lines of boilerplate)

---

### AD-2: Authentication Strategy Pattern

**Decision:** Use Strategy pattern with multiple auth implementations:
```typescript
interface AuthStrategy {
  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;
  getHeaders(): Record<string, string>;
}

class BearerTokenAuth implements AuthStrategy { /* ... */ }
class OAuth2Auth implements AuthStrategy { /* ... */ }
class ServiceAccountAuth implements AuthStrategy { /* ... */ }
```

**Rationale:**
- 73% of connectors use bearer tokens (simple path)
- OAuth 2.0 needed for Google services (13%)
- Service accounts needed for Vertex AI
- Strategy pattern allows swapping auth without changing connector logic

**Based on:** SurfSense analysis (11/15 connectors use bearer tokens, 2/15 use OAuth)

---

### AD-3: Cursor-Based Pagination by Default

**Decision:** Implement cursor-based pagination as primary method, with fallbacks:
```typescript
interface PaginationStrategy {
  hasMore(response: any): boolean;
  getNextCursor(response: any): string | null;
}

async function* paginateRequest<T>(
  requestFn: (cursor?: string) => Promise<T>,
  strategy: PaginationStrategy
): AsyncIterator<T> { /* ... */ }
```

**Supported strategies:**
1. **CursorPagination** (primary) - Slack, Linear, Notion, Discord
2. **OffsetPagination** (fallback) - Jira, Confluence, ClickUp
3. **LinkHeaderPagination** (GitHub-specific)

**Rationale:**
- Cursor pagination prevents duplicates/missing items (70% of studied connectors use it)
- Consistent for large datasets
- Safe for concurrent updates
- Offset pagination as fallback for APIs that don't support cursors

**Based on:** 11/15 SurfSense connectors use cursor or equivalent (70%)

---

### AD-4: Rate Limiting with Retry-After Header

**Decision:** Implement rate limiter that:
1. Detects 429 status codes
2. Reads `Retry-After` header
3. Falls back to exponential backoff (2^n * 1000ms with jitter)
4. Supports per-connector rate limits

```typescript
class RateLimiter {
  async handleRateLimit(error: any): Promise<void> {
    if (error.statusCode === 429) {
      const retryAfter = error.headers?.['retry-after'];
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : this.exponentialBackoff();
      await this.sleep(waitMs);
      return; // Retry
    }
    throw error; // Not a rate limit, re-raise
  }
}
```

**Rationale:**
- All production connectors implement rate limiting (100%)
- `Retry-After` header is standard (Slack, GitHub, Linear)
- Exponential backoff prevents thundering herd
- Per-connector limits needed (GitHub: 5000/hr, Linear: varies)

**Based on:** Slack connector pattern in SurfSense (handles 429 with Retry-After)

---

### AD-5: Webhook Receiver as Separate Service

**Decision:** Deploy webhook receiver as dedicated Cloud Run service:
```
[GitHub/GitLab/Slack]
    → POST /webhooks/:connector
    → Webhook Receiver (Cloud Run)
    → Verify HMAC signature
    → Publish to Pub/Sub (topic: connector-webhooks-{source})
    → Return 200 OK

[Pub/Sub Subscriber]
    → Connector Workers (Cloud Run)
    → Process webhook event
    → Store in Firestore
```

**Rationale:**
- Decouples ingestion from processing (webhooks need <1s response)
- Scalable (Cloud Run auto-scales on webhook bursts)
- Reliable (Pub/Sub handles backpressure)
- Idempotent (use event ID as idempotency key)

**Based on:** Airbyte pattern + SurfSense GitHub webhook verification

---

### AD-6: Incremental Sync with Cursor Fields

**Decision:** Support incremental sync for all time-series data:
```typescript
interface IncrementalSyncConfig {
  cursor_field: string;           // e.g., 'updated_at'
  start_datetime?: string;
  end_datetime?: string;
  granularity: 'hour' | 'day';
}

async function* incrementalSync(config: IncrementalSyncConfig) {
  const lastCursor = await getLastSyncCursor(config);
  // Fetch only records where cursor_field > lastCursor
  for await (const record of fetchRecords({ since: lastCursor })) {
    yield record;
  }
}
```

**Rationale:**
- Reduces API calls (only fetch new/updated data)
- Essential for large datasets (PRs, issues, messages)
- Standard pattern across all studied connectors

**Based on:** Linear, Slack, Notion all implement date range filtering

---

### AD-7: Testing Strategy (Unit + Integration + Contract)

**Decision:** Implement 3-tier testing:
1. **Unit tests** (mock API responses)
2. **Integration tests** (real API calls with test accounts)
3. **Contract tests** (validate output schemas)

```typescript
// Unit test (mock)
test('GitHubConnector.getPullRequests', async () => {
  const mockClient = createMockGitHubClient({
    pulls: { list: jest.fn().mockResolvedValue({ data: [...] }) }
  });
  const connector = new GitHubConnector({ client: mockClient });
  const prs = await connector.getPullRequests('owner/repo');
  expect(prs).toHaveLength(5);
});

// Integration test (real API)
test('GitHubConnector integration', async () => {
  const token = process.env.GITHUB_TEST_TOKEN;
  const connector = new GitHubConnector({ token });
  const repos = await connector.getRepositories();
  expect(repos).toBeInstanceOf(Array);
});

// Contract test (schema validation)
test('GitHubConnector output schema', async () => {
  const connector = new GitHubConnector({ token: '...' });
  const prs = await connector.getPullRequests('owner/repo');
  for (const pr of prs) {
    expect(() => PullRequestSchema.parse(pr)).not.toThrow();
  }
});
```

**Rationale:**
- Unit tests ensure logic correctness (fast, no API calls)
- Integration tests catch API changes (real data)
- Contract tests prevent breaking downstream consumers

**Target:** >80% coverage (ARV enforces this)

---

### AD-8: Health Check Endpoints

**Decision:** All connectors implement `/health` endpoint:
```typescript
async healthCheck(): Promise<HealthStatus> {
  try {
    await this.authenticate();
    await this.testConnection(); // Simple API call (e.g., GET /user)
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}
```

**Rationale:**
- Enables monitoring (Prometheus, Cloud Monitoring)
- Detects credential expiration
- Alerts on degraded connectors

**Based on:** Airbyte connector health check pattern

---

### AD-9: Connector Registry Pattern

**Decision:** Centralized registry for connector discovery:
```typescript
class ConnectorRegistry {
  private connectors = new Map<string, BaseConnector>();

  register(name: string, connector: BaseConnector): void;
  get(name: string): BaseConnector | undefined;
  list(): string[];
  async healthCheckAll(): Promise<Map<string, HealthStatus>>;
}

// Usage
const registry = new ConnectorRegistry();
registry.register('github', new GitHubConnector({ ... }));
registry.register('gitlab', new GitLabConnector({ ... }));

// Health check all
const health = await registry.healthCheckAll();
console.log(health.get('github')); // { healthy: true, ... }
```

**Rationale:**
- Single source of truth for available connectors
- Simplifies orchestrator integration
- Enables bulk health checks

---

### AD-10: Credential Storage in Secret Manager

**Decision:** Store all credentials in GCP Secret Manager:
```typescript
class SecretManagerAuth {
  async getSecret(tenantId: string, connector: string): Promise<string> {
    const secretName = `projects/${PROJECT_ID}/secrets/${connector}-token-${tenantId}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name: secretName });
    return version.payload.data.toString();
  }

  async rotateSecret(tenantId: string, connector: string, newToken: string): Promise<void> {
    // Add new version, disable old version
  }
}
```

**Rationale:**
- Security best practice (no secrets in code/env)
- Audit trail (who accessed what, when)
- Rotation support
- Fine-grained IAM permissions

**Based on:** Google Cloud security best practices

---

## Consequences

### Positive

✅ **Rapid Connector Development:** BaseConnector eliminates ~200 lines of boilerplate per connector (2-3 days → <1 day)

✅ **Consistency:** All connectors handle errors, rate limits, retries the same way

✅ **Type Safety:** TypeScript strict mode catches bugs at compile time

✅ **Testability:** MockConnector and testing utilities make testing easy

✅ **Observability:** Standardized logging, health checks, metrics

✅ **Scalability:** Webhook receiver + Pub/Sub handles bursts (1000+ req/s)

✅ **Security:** Secret Manager, HMAC verification, no secrets in code

### Negative

⚠️ **Initial Framework Effort:** ~5 days to build BaseConnector + utilities (one-time cost)

⚠️ **Learning Curve:** Developers must understand BaseConnector abstractions

⚠️ **Over-Engineering Risk:** Simple connectors might not need all features (mitigated by optional utilities)

### Neutral

🔄 **Not Declarative:** Unlike Airbyte's YAML approach, we're using TypeScript classes (more flexible, less concise)

🔄 **Cloud Run Dependency:** Webhook receiver requires Cloud Run (acceptable for our GCP stack)

---

## Alternatives Considered

### Alternative 1: Declarative JSON/YAML Connectors (Like Airbyte)

**Example:**
```yaml
name: github
auth:
  type: oauth
  scopes: [repo, read:org]
endpoints:
  - name: pull_requests
    path: /repos/:owner/:repo/pulls
    pagination: link_header
    cursor_field: updated_at
```

**Pros:**
- Very concise (200 lines YAML vs 500 lines TypeScript)
- Non-developers can create connectors
- Easy to version control

**Cons:**
- Limited flexibility (hard to add custom logic)
- Requires building YAML interpreter
- TypeScript type safety lost

**Decision:** Rejected for now (can revisit for B9+ if pattern emerges)

---

### Alternative 2: Use Airbyte Platform + Custom Destination

**Approach:** Run Airbyte, create custom destination that writes to Firestore

**Pros:**
- 600+ connectors out of the box
- No connector development needed

**Cons:**
- Operational overhead (Kubernetes cluster for Airbyte)
- Python runtime dependency
- Over-engineered for 6 connectors
- Vendor lock-in to Airbyte patterns

**Decision:** Rejected (overkill for our use case)

---

### Alternative 3: Serverless Functions per Connector (No Framework)

**Approach:** Each connector is standalone Cloud Function

**Pros:**
- Maximum isolation
- Independent scaling

**Cons:**
- Code duplication (each connector reimplements retries, rate limiting)
- Inconsistent error handling
- Slow development (5-7 days per connector)

**Decision:** Rejected (doesn't scale to 6+ connectors)

---

## Implementation Plan

### Phase 1: Core Framework (Week 2-3, Story B3)
- [ ] BaseConnector abstract class
- [ ] BearerTokenAuth, OAuth2Auth implementations
- [ ] CursorPagination, OffsetPagination helpers
- [ ] RateLimiter utility
- [ ] ConnectorRegistry
- [ ] Testing utilities (MockConnector, fixtures)

### Phase 2: Reference Implementation (Week 3-4, Story B4)
- [ ] GitHub Connector (full implementation)
- [ ] REST API client (Octokit wrapper)
- [ ] GraphQL API client
- [ ] Webhook handlers (PR, issue, push events)
- [ ] Integration tests
- [ ] Documentation

### Phase 3: Additional Connectors (Week 5-8, Stories B5-B9)
- [ ] GitLab Connector (Story B5)
- [ ] Linear Connector (Story B6)
- [ ] Jira/Plane Connector (Story B7)
- [ ] Slack Connector (Story B8)
- [ ] Vertex AI Connector (Story B9)

### Phase 4: Production Readiness (Week 8+)
- [ ] Webhook receiver service (Cloud Run)
- [ ] Pub/Sub topics and subscriptions
- [ ] Health check dashboard
- [ ] Monitoring and alerting
- [ ] Runbooks

---

## Validation

### Success Criteria

✅ **Time to add new connector:** <2 days (vs 5-7 days without framework)

✅ **Test coverage:** >80% across all packages

✅ **Webhook delivery reliability:** 99.9%

✅ **Health check response time:** <100ms p95

✅ **Code reuse:** >60% of connector code is shared utilities

✅ **Developer satisfaction:** Positive feedback from team

### Metrics to Track

- Connector development time (days)
- Test coverage (%)
- Webhook delivery success rate (%)
- API error rate (%)
- Health check uptime (%)
- Time to detect credential expiration (minutes)

---

## References

### Internal Documents
- 008-DR-EPIC-epic-b-connector-framework.md (Epic plan)
- 010-DR-ADOC-airbyte-cdk-architecture-analysis.md (CDK research)
- 011-DR-PATT-production-connector-patterns.md (15 connector analysis)

### External Resources
- Airbyte CDK: https://docs.airbyte.com/connector-development/cdk-python/
- SurfSense: https://github.com/MODSetter/SurfSense
- GitHub API: https://docs.github.com/en/rest
- Linear API: https://developers.linear.app/
- Slack API: https://api.slack.com/

### Prior Art
- Airbyte (600+ connectors, Python CDK)
- SurfSense (15 connectors, manual implementation)
- Meltano (Singer taps, JSON schema)
- Fivetran (proprietary, no open source)

---

## Decision Status History

| Date | Status | Notes |
|------|--------|-------|
| 2025-12-27 | **ACCEPTED** | Approved by @connectors-lead, @backend-architect after Epic B research |
| TBD | Review after B4 | Validate framework decisions after GitHub connector |
| TBD | Review after B9 | Consider declarative YAML if repetitive patterns emerge |

---

## Stakeholder Feedback

**@connectors-lead:** "Framework approach aligns with research. Cursor pagination and rate limiting are critical."

**@backend-architect:** "BaseConnector abstractions are sound. Webhook receiver separation is correct pattern."

**@security:** "Secret Manager integration is required. HMAC verification must be mandatory for all webhooks."

**@infra:** "Cloud Run + Pub/Sub is the right choice for webhook ingestion. Ensures scalability."

---

**Document Status:** ✅ Accepted
**Next Review:** After Story B4 (GitHub connector implementation)
**Author:** @connectors-lead
**Approved By:** @backend-architect, @security, @infra
**Last Updated:** 2025-12-27
