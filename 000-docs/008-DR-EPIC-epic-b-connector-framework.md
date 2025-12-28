# Epic B: Data Ingestion & Connector Framework

**Document ID:** 131-DR-EPIC
**Epic:** B (Data Ingestion)
**Owner:** @connectors
**Priority:** P1
**Status:** Planning
**Created:** 2025-12-28
**Total Tasks:** 69 (9 stories)

---

## Executive Summary

Build production-ready, Airbyte-style connector framework for ingesting data from multiple sources (GitHub, GitLab, Jira, Linear, Slack). Study existing patterns from 600+ Airbyte connectors and implement reusable abstraction layer with webhook support, OAuth/token auth, and comprehensive testing.

**Strategic Value:**
- Enable multi-source data ingestion for PR automation
- Provide extensible framework for future integrations
- Reduce time-to-market for new connector development
- Support both pull (API polling) and push (webhooks) patterns

**Success Metrics:**
- 6 production-ready connectors (GitHub, GitLab, Linear, Jira/Plane, Slack, Vertex AI)
- < 2 days to add new connector
- 99.9% webhook delivery reliability
- Comprehensive test coverage (>80%)

---

## Table of Contents

1. [Free Trial Resources](#free-trial-resources)
2. [Epic Structure](#epic-structure)
3. [Story Breakdown](#story-breakdown)
4. [Dependencies & Sequencing](#dependencies--sequencing)
5. [Technical Architecture](#technical-architecture)
6. [Testing Strategy](#testing-strategy)
7. [Cost Analysis](#cost-analysis)
8. [Acceptance Criteria](#acceptance-criteria)

---

## Free Trial Resources

### 1. Airbyte (Pattern Study & Reference)

**Free Options:**
- Self-hosted: 100% free forever (open source)
- Cloud: 14-day trial with 400 credits
- Alpha/Beta connectors: Completely free (no time limit)

**Resources:**
- 600+ pre-built connectors for reference
- Connector Development Kit (CDK)
- Mock services and synthetic datasets
- Pricing after trial: $10/month base + usage

**Value:**
- Study production-ready connector implementations
- Learn best practices from 600+ examples
- Understand error handling, retry logic, rate limiting
- Mock testing infrastructure

**Links:**
- GitHub: https://github.com/airbytehq/airbyte
- Cloud: https://airbyte.com/product/airbyte-cloud
- Connectors: https://airbyte.com/connectors
- CDK Guide: https://airbyte.com/data-engineering-resources/develop-custom-data-connectors

---

### 2. Real APIs with Free Tiers

#### GitHub API (Already Integrated)
- **Free Tier:** 5,000 requests/hour (authenticated)
- **Features:** REST + GraphQL, webhooks included
- **Test Data:** Your own repositories
- **Status:** ✅ Already using
- **Use Case:** Reference implementation, PR automation

#### GitLab API
- **Free Tier:** 2,000 CI/CD minutes/month
- **Features:** REST + GraphQL APIs, webhooks
- **Self-Hosted:** Truly free (unlimited)
- **Integration:** PHP GitLab-JIRA integration available
- **Use Case:** Multi-source VCS support

#### Linear API
- **Free Plan:** Available for small teams
- **Features:** GraphQL API, webhooks
- **Integrations:** GitHub, GitLab, Slack, Figma, Sentry
- **Clean Design:** Excellent API reference
- **Use Case:** Modern issue tracking alternative

#### Jira Cloud API
- **Free Tier:** Up to 10 users
- **Features:** REST API + webhooks
- **Alternative:** Plane (open source, self-host for unlimited)
- **Use Case:** Enterprise issue tracking

#### Slack API
- **Free Tier:** Available for development
- **Features:** Events API, webhooks, slash commands
- **Interactive:** Buttons, modals, app home
- **Use Case:** Notifications, interactive approvals

#### Vertex AI API (Google Cloud)
- **Free Tier:** $300 credit for 90 days (new accounts)
- **Features:** Gemini models, text embeddings, streaming
- **Models:** Gemini 2.0 Flash, Gemini Pro, PaLM
- **Rate Limits:** Generous free tier quotas
- **Use Case:** AI/ML integration, code analysis, embeddings
- **Links:**
  - Console: https://console.cloud.google.com/vertex-ai
  - Docs: https://cloud.google.com/vertex-ai/docs
  - Pricing: https://cloud.google.com/vertex-ai/pricing

---

### 3. Development & Testing Tools

#### Webhook Testing (100% Free)
- **Webhook.site** - Quick tests, simple interface
- **RequestBin** - Reliable, purpose-built for webhooks
- **Beeceptor** - Mock API responses, custom rules
- **ngrok** - Localhost tunneling (free tier)

#### API Clients (Open Source)
- **Bruno** - Git-friendly, stores requests as plain text
- **Hoppscotch** - Browser-based, no installation

#### Mock Data & APIs
- **Beeceptor Mock Server** - JSON responses (posts, users, comments, todos)
- **SurfSense** - 15+ open source connector implementations

---

### 4. Open Source Reference Implementations

#### SurfSense (Study Material)
- **GitHub:** https://github.com/MODSetter/SurfSense
- **Connectors:** Slack, Linear, Jira, ClickUp, Notion, Discord, GitHub, Gmail, Google Calendar (15+ total)
- **Value:** Real-world connector patterns to study
- **License:** Open source

#### Plane (Self-Hosted Alternative)
- **GitHub:** https://github.com/makeplane/plane
- **Purpose:** Open source Jira/Linear alternative
- **Value:** Unlimited test data (self-host)
- **Features:** Tasks, sprints, docs, triage

---

## Epic Structure

```
Epic B: Data Ingestion & Connector Framework (P1)
│
├── Story B1: Study Existing Connector Patterns (Week 1)
│   ├── Task B1.1: Set up Airbyte self-hosted locally
│   ├── Task B1.2: Analyze Airbyte CDK architecture
│   ├── Task B1.3: Study 10+ production connectors
│   ├── Task B1.4: Clone and analyze SurfSense
│   ├── Task B1.5: Document connector patterns
│   └── Task B1.6: Test with Beeceptor mock APIs
│
├── Story B2: Design Core Connector Framework (Week 2)
│   ├── Task B2.1: Design connector abstraction layer
│   ├── Task B2.2: Define IConnector interface
│   ├── Task B2.3: Design authentication strategy (OAuth, token, HMAC)
│   ├── Task B2.4: Design webhook receiver architecture
│   ├── Task B2.5: Create connector registry system
│   └── Task B2.6: Document architecture decisions
│
├── Story B3: Implement Core Framework (Week 2-3)
│   ├── Task B3.1: Create @gwi/connectors package
│   ├── Task B3.2: Implement BaseConnector abstract class
│   ├── Task B3.3: Implement ConnectorRegistry
│   ├── Task B3.4: Add webhook receiver service
│   ├── Task B3.5: Implement retry and rate limiting
│   ├── Task B3.6: Add connector health checks
│   ├── Task B3.7: Create connector testing utilities
│   └── Task B3.8: Write framework documentation
│
├── Story B4: GitHub Connector (Reference Implementation, Week 3)
│   ├── Task B4.1: Design GitHub connector specification
│   ├── Task B4.2: Implement OAuth/token authentication
│   ├── Task B4.3: Add REST API client
│   ├── Task B4.4: Add GraphQL API client
│   ├── Task B4.5: Implement webhook handlers (PR, issue, push)
│   ├── Task B4.6: Add pagination support
│   ├── Task B4.7: Write integration tests
│   ├── Task B4.8: Create connector documentation
│   └── Task B4.9: Add to connector registry
│
├── Story B5: GitLab Connector (Week 4)
│   ├── Task B5.1: Set up GitLab test account (free tier)
│   ├── Task B5.2: Implement OAuth authentication
│   ├── Task B5.3: Add REST API client
│   ├── Task B5.4: Add GraphQL API client (optional)
│   ├── Task B5.5: Implement webhook handlers (MR, issue, pipeline)
│   ├── Task B5.6: Write integration tests
│   ├── Task B5.7: Document differences from GitHub
│   └── Task B5.8: Add to connector registry
│
├── Story B6: Linear Connector (Week 5)
│   ├── Task B6.1: Set up Linear free account
│   ├── Task B6.2: Implement OAuth authentication
│   ├── Task B6.3: Implement GraphQL client
│   ├── Task B6.4: Add webhook support (issue updates)
│   ├── Task B6.5: Implement issue sync
│   ├── Task B6.6: Write integration tests
│   ├── Task B6.7: Document GraphQL patterns
│   └── Task B6.8: Add to connector registry
│
├── Story B7: Jira/Plane Connector (Week 6)
│   ├── Task B7.1: Evaluate Jira Cloud vs Plane (self-hosted)
│   ├── Task B7.2: Set up test instance
│   ├── Task B7.3: Implement authentication (Basic/OAuth)
│   ├── Task B7.4: Add REST API client
│   ├── Task B7.5: Implement webhook handlers
│   ├── Task B7.6: Add issue/project sync
│   ├── Task B7.7: Write integration tests
│   └── Task B7.8: Add to connector registry
│
├── Story B8: Slack Connector (Week 7)
│   ├── Task B8.1: Create Slack app in workspace
│   ├── Task B8.2: Implement OAuth flow
│   ├── Task B8.3: Add Events API subscription
│   ├── Task B8.4: Implement slash commands
│   ├── Task B8.5: Add interactive components (buttons, modals)
│   ├── Task B8.6: Implement notification sending
│   ├── Task B8.7: Write integration tests
│   └── Task B8.8: Add to connector registry
│
└── Story B9: Vertex AI Connector (Week 8)
    ├── Task B9.1: Set up Vertex AI project
    ├── Task B9.2: Implement authentication (API key/service account)
    ├── Task B9.3: Add Gemini API client
    ├── Task B9.4: Add embeddings support
    ├── Task B9.5: Implement streaming responses
    ├── Task B9.6: Add quota/rate limiting
    ├── Task B9.7: Write integration tests
    └── Task B9.8: Add to connector registry
```

**Total Tasks:** 69 (granular breakdown)
**Timeline:** 8 weeks for full epic completion

---

## Story Breakdown

### Story B1: Study Existing Connector Patterns

**Goal:** Learn from production systems before building our own

**Tasks:**

#### B1.1: Set up Airbyte self-hosted locally
- Clone Airbyte repository
- Follow Docker Compose setup
- Verify can access UI at localhost:8000
- **Acceptance:** Running Airbyte instance with accessible UI

#### B1.2: Analyze Airbyte CDK architecture
- Study Airbyte CDK documentation
- Understand Source/Destination abstraction
- Review connector specification format
- **Acceptance:** Document summarizing CDK patterns

#### B1.3: Study 10+ production connectors
- GitHub connector (REST + webhooks)
- GitLab connector (REST + GraphQL)
- Jira connector (REST + pagination)
- Slack connector (Events API)
- Stripe connector (webhooks + idempotency)
- Postgres connector (streaming)
- MongoDB connector (change streams)
- Salesforce connector (bulk API)
- HubSpot connector (rate limiting)
- Snowflake connector (batch loading)
- **Acceptance:** Comparative analysis document

#### B1.4: Clone and analyze SurfSense
- Clone SurfSense repository
- Study connector implementations (15+ connectors)
- Review error handling patterns
- **Acceptance:** Document connector patterns found

#### B1.5: Document connector patterns
- Common authentication patterns (OAuth, token, HMAC)
- Webhook handling best practices
- Rate limiting strategies
- Error handling and retries
- Pagination patterns
- **Acceptance:** Architecture decision record (ADR)

#### B1.6: Test with Beeceptor mock APIs
- Create Beeceptor mock endpoints
- Test authentication flows
- Test pagination scenarios
- Test error responses
- **Acceptance:** Working mock test suite

**Dependencies:** None (can start immediately)
**Assignee:** @connectors-lead
**Priority:** P1
**Estimated:** 5 days

---

### Story B2: Design Core Connector Framework

**Goal:** Create architectural blueprint before implementation

**Tasks:**

#### B2.1: Design connector abstraction layer
- Define separation of concerns
- Identify common vs connector-specific logic
- Design plugin architecture
- **Acceptance:** Architecture diagram + ADR

#### B2.2: Define IConnector interface
```typescript
interface IConnector {
  name: string;
  version: string;
  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  healthCheck(): Promise<HealthStatus>;
  sync(options: SyncOptions): AsyncIterator<Record>;
  handleWebhook(payload: WebhookPayload): Promise<void>;
}
```
- **Acceptance:** TypeScript interface definitions

#### B2.3: Design authentication strategy
- OAuth 2.0 flow (GitHub, GitLab, Linear, Slack)
- Token-based auth (API keys)
- HMAC signature verification (webhooks)
- Credential storage (Secret Manager)
- **Acceptance:** Authentication flow diagrams

#### B2.4: Design webhook receiver architecture
- Cloud Run service for webhook ingestion
- Signature verification
- Pub/Sub for async processing
- Idempotency keys
- **Acceptance:** Webhook architecture diagram

#### B2.5: Create connector registry system
- Connector discovery mechanism
- Version management
- Health status tracking
- Configuration schema validation
- **Acceptance:** Registry design document

#### B2.6: Document architecture decisions
- ADR for chosen patterns
- Trade-offs analysis
- Scalability considerations
- **Acceptance:** Complete ADR document

**Dependencies:** B1 (Study patterns first)
**Assignee:** @connectors-architect
**Priority:** P1
**Estimated:** 3 days

---

### Story B3: Implement Core Framework

**Goal:** Build reusable connector infrastructure

**Tasks:**

#### B3.1: Create @gwi/connectors package
```
packages/connectors/
├── src/
│   ├── core/
│   │   ├── base-connector.ts
│   │   ├── connector-registry.ts
│   │   └── connector-types.ts
│   ├── auth/
│   │   ├── oauth.ts
│   │   ├── token.ts
│   │   └── hmac.ts
│   ├── webhook/
│   │   ├── receiver.ts
│   │   └── verifier.ts
│   └── utils/
│       ├── retry.ts
│       ├── rate-limit.ts
│       └── pagination.ts
├── tests/
└── package.json
```
- **Acceptance:** Package scaffolding with TypeScript config

#### B3.2: Implement BaseConnector abstract class
```typescript
abstract class BaseConnector implements IConnector {
  protected config: ConnectorConfig;
  protected http: HttpClient;

  abstract authenticate(): Promise<void>;
  abstract sync(options: SyncOptions): AsyncIterator<Record>;

  // Shared utilities
  protected async retryRequest(...) { }
  protected async checkRateLimit(...) { }
}
```
- **Acceptance:** BaseConnector with tests

#### B3.3: Implement ConnectorRegistry
- Connector registration
- Discovery by name/type
- Health status aggregation
- Version management
- **Acceptance:** Registry with unit tests

#### B3.4: Add webhook receiver service
- Cloud Run service for ingestion
- Signature verification middleware
- Pub/Sub publishing
- Dead letter queue
- **Acceptance:** Deployable webhook service

#### B3.5: Implement retry and rate limiting
- Exponential backoff
- Jitter for distributed systems
- Per-connector rate limits
- Circuit breaker pattern
- **Acceptance:** Retry/rate-limit utilities with tests

#### B3.6: Add connector health checks
- /health endpoint per connector
- Aggregate health status
- Alert on degraded connectors
- **Acceptance:** Health check system

#### B3.7: Create connector testing utilities
- Mock connector for tests
- Webhook test harness
- Integration test helpers
- **Acceptance:** Testing utilities package

#### B3.8: Write framework documentation
- Getting started guide
- Creating custom connectors
- API reference
- Best practices
- **Acceptance:** Complete docs in packages/connectors/README.md

**Dependencies:** B2 (Design complete)
**Assignee:** @connectors-team
**Priority:** P1
**Estimated:** 10 days

---

### Story B4: GitHub Connector (Reference Implementation)

**Goal:** Implement first production connector as reference for others

**Tasks:**

#### B4.1: Design GitHub connector specification
```yaml
name: github
version: 1.0.0
auth_type: oauth
scopes: [repo, read:org, webhook]
webhooks:
  - pull_request
  - issues
  - push
  - pull_request_review
sync_modes:
  - full_refresh
  - incremental
```
- **Acceptance:** Connector spec file

#### B4.2: Implement OAuth/token authentication
- OAuth app registration flow
- Token refresh logic
- Installation token support (GitHub Apps)
- **Acceptance:** Auth working with test app

#### B4.3: Add REST API client
- Repository data
- Pull requests
- Issues
- Comments
- Reviews
- **Acceptance:** REST client with pagination

#### B4.4: Add GraphQL API client
- Efficient data fetching
- Nested queries
- Rate limit handling
- **Acceptance:** GraphQL client for complex queries

#### B4.5: Implement webhook handlers
```typescript
class GitHubConnector extends BaseConnector {
  async handlePullRequestWebhook(payload: PullRequestPayload) { }
  async handleIssueWebhook(payload: IssuePayload) { }
  async handlePushWebhook(payload: PushPayload) { }
}
```
- **Acceptance:** Webhook handlers with signature verification

#### B4.6: Add pagination support
- Link header parsing
- Cursor-based pagination
- Page size optimization
- **Acceptance:** Handles repos with 1000+ PRs

#### B4.7: Write integration tests
- OAuth flow test
- Webhook delivery test
- Sync test with real data
- Rate limit handling test
- **Acceptance:** >80% test coverage

#### B4.8: Create connector documentation
- Setup guide
- Configuration options
- Webhook setup
- Troubleshooting
- **Acceptance:** Complete connector docs

#### B4.9: Add to connector registry
- Register in ConnectorRegistry
- Add health check endpoint
- Deploy to Cloud Run
- **Acceptance:** Connector discoverable and healthy

**Dependencies:** B3 (Framework ready)
**Assignee:** @connectors-github-lead
**Priority:** P1
**Estimated:** 7 days

---

### Story B5: GitLab Connector

**Goal:** Support GitLab as alternative VCS

**Tasks:**

#### B5.1: Set up GitLab test account
- Create free tier account
- Set up test project
- Generate access token
- **Acceptance:** GitLab account with test data

#### B5.2: Implement OAuth authentication
- OAuth app registration
- Token refresh
- Scope management
- **Acceptance:** OAuth working

#### B5.3: Add REST API client
- Merge requests
- Issues
- Pipelines
- Comments
- **Acceptance:** REST client implementation

#### B5.4: Add GraphQL API client (optional)
- Evaluate GitLab GraphQL maturity
- Implement if beneficial
- **Acceptance:** Decision documented

#### B5.5: Implement webhook handlers
- Merge request events
- Issue events
- Pipeline events
- Push events
- **Acceptance:** Webhook handlers working

#### B5.6: Write integration tests
- Test with real GitLab account
- Webhook delivery tests
- **Acceptance:** >80% coverage

#### B5.7: Document differences from GitHub
- API differences
- Webhook payload differences
- Rate limit differences
- **Acceptance:** Migration guide

#### B5.8: Add to connector registry
- Register connector
- Deploy
- Health checks
- **Acceptance:** Production-ready connector

**Dependencies:** B4 (GitHub connector as reference)
**Assignee:** @connectors-gitlab-lead
**Priority:** P2
**Estimated:** 5 days

---

### Story B6: Linear Connector

**Goal:** Support modern issue tracking

**Tasks:**

#### B6.1: Set up Linear free account
- Create workspace
- Create test issues
- Set up OAuth app
- **Acceptance:** Linear workspace ready

#### B6.2: Implement OAuth authentication
- OAuth flow
- Refresh tokens
- **Acceptance:** Auth working

#### B6.3: Implement GraphQL client
```graphql
query Issues {
  issues {
    nodes {
      id
      title
      state
      assignee { name }
      createdAt
    }
  }
}
```
- **Acceptance:** GraphQL client

#### B6.4: Add webhook support
- Issue updates
- State changes
- Comments
- **Acceptance:** Webhooks working

#### B6.5: Implement issue sync
- Bidirectional sync
- Conflict resolution
- **Acceptance:** Issues sync correctly

#### B6.6: Write integration tests
- GraphQL query tests
- Webhook tests
- **Acceptance:** >80% coverage

#### B6.7: Document GraphQL patterns
- Query optimization
- Pagination with cursors
- Rate limiting
- **Acceptance:** GraphQL best practices doc

#### B6.8: Add to connector registry
- Register
- Deploy
- **Acceptance:** Production connector

**Dependencies:** B4 (Framework patterns established)
**Assignee:** @connectors-linear-lead
**Priority:** P2
**Estimated:** 5 days

---

### Story B7: Jira/Plane Connector

**Goal:** Enterprise issue tracking integration

**Tasks:**

#### B7.1: Evaluate Jira Cloud vs Plane
- Cost comparison
- Feature parity
- API maturity
- Self-hosting requirements
- **Acceptance:** Decision document

#### B7.2: Set up test instance
- Jira Cloud (free tier, 10 users) OR
- Plane (self-hosted, unlimited)
- **Acceptance:** Working instance

#### B7.3: Implement authentication
- Basic auth (Jira)
- OAuth (Jira Cloud)
- Token (Plane)
- **Acceptance:** Auth working

#### B7.4: Add REST API client
- Issues/tickets
- Projects
- Comments
- Attachments
- **Acceptance:** REST client

#### B7.5: Implement webhook handlers
- Issue created/updated
- Status changes
- Comments
- **Acceptance:** Webhooks working

#### B7.6: Add issue/project sync
- Sync issues
- Sync projects
- Field mapping
- **Acceptance:** Bi-directional sync

#### B7.7: Write integration tests
- API tests
- Webhook tests
- **Acceptance:** >80% coverage

#### B7.8: Add to connector registry
- Register
- Deploy
- **Acceptance:** Production connector

**Dependencies:** B4 (Framework ready)
**Assignee:** @connectors-jira-lead
**Priority:** P2
**Estimated:** 6 days

---

### Story B8: Slack Connector

**Goal:** Enable notifications and interactive approvals

**Tasks:**

#### B8.1: Create Slack app
- Register app in workspace
- Configure OAuth scopes
- Set up event subscriptions
- **Acceptance:** Slack app created

#### B8.2: Implement OAuth flow
- Add to Slack button
- Token storage
- Workspace installation
- **Acceptance:** OAuth working

#### B8.3: Add Events API subscription
- Message events
- App mentions
- Channel events
- **Acceptance:** Events received

#### B8.4: Implement slash commands
```
/gwi status <run-id>
/gwi approve <run-id>
/gwi reject <run-id>
```
- **Acceptance:** Slash commands working

#### B8.5: Add interactive components
- Approval buttons
- Modal forms
- App home tab
- **Acceptance:** Interactive UI working

#### B8.6: Implement notification sending
- PR status updates
- Run completion
- Error alerts
- **Acceptance:** Notifications sent correctly

#### B8.7: Write integration tests
- Event handling tests
- Command tests
- Interactive component tests
- **Acceptance:** >80% coverage

#### B8.8: Add to connector registry
- Register
- Deploy
- **Acceptance:** Production connector

**Dependencies:** B4 (Framework ready)
**Assignee:** @connectors-slack-lead
**Priority:** P2
**Estimated:** 6 days

---

### Story B9: Vertex AI Connector

**Goal:** Integrate Google Cloud Vertex AI platform for ML/AI capabilities

**Tasks:**

#### B9.1: Set up Vertex AI project
- Enable Vertex AI API in GCP project
- Create service account with appropriate IAM roles
- Configure authentication (API key or service account JSON)
- **Acceptance:** Vertex AI enabled and accessible

#### B9.2: Implement authentication
- API key authentication
- Service account JSON key support
- Application Default Credentials (ADC)
- Token refresh handling
- **Acceptance:** Auth working for all methods

#### B9.3: Add Gemini API client
- Models API integration (generateContent endpoint)
- Streaming support
- Safety settings configuration
- Multi-modal input support (text, images)
- **Acceptance:** Can invoke Gemini models

#### B9.4: Add embeddings support
- Text embeddings API client
- Batch processing for multiple texts
- Embedding dimensions configuration
- **Acceptance:** Can generate embeddings

#### B9.5: Implement streaming responses
- Server-sent events (SSE) handling
- Token-by-token streaming
- Error handling during streaming
- Stream cancellation support
- **Acceptance:** Streaming responses working

#### B9.6: Add quota/rate limiting
- Quota tracking per project
- Exponential backoff on rate limits
- Circuit breaker pattern
- Per-model quota management
- **Acceptance:** Rate limits handled gracefully

#### B9.7: Write integration tests
- Real Vertex AI API calls (with test project)
- Streaming tests
- Error handling tests
- Quota limit tests
- **Acceptance:** >80% coverage

#### B9.8: Add to connector registry
- Register connector
- Deploy to Cloud Run
- Health check endpoint
- **Acceptance:** Production-ready connector

**Dependencies:** B4 (Framework ready)
**Assignee:** @connectors-ai-lead
**Priority:** P2
**Estimated:** 5 days

---

## Dependencies & Sequencing

### Critical Path

```
B1 (Study) → B2 (Design) → B3 (Framework) → B4 (GitHub)
                                                  ↓
                                    B5, B6, B7, B8, B9 (parallel)
```

### Dependency Rules

1. **B1 must complete before B2**: Need to study patterns before designing
2. **B2 must complete before B3**: Need design before implementation
3. **B3 must complete before any connector**: Framework must exist
4. **B4 should complete before B5-B9**: GitHub connector is reference implementation
5. **B5-B9 can run in parallel**: Once B4 is done, all other connectors can proceed independently

### Team Assignments

- **Week 1:** Full team on B1 (learning phase)
- **Week 2:** Architect on B2, rest on B3 prep
- **Week 3:** Full team on B3 (framework)
- **Week 4:** Full team on B4 (GitHub reference)
- **Week 5-8:** Split team across B5-B9 (1-2 people per connector)

---

## Technical Architecture

### Package Structure

```
packages/connectors/
├── src/
│   ├── core/
│   │   ├── base-connector.ts         # Abstract base class
│   │   ├── connector-registry.ts     # Discovery & health
│   │   ├── connector-config.ts       # Config schemas
│   │   └── types.ts                  # Common types
│   │
│   ├── auth/
│   │   ├── oauth-provider.ts         # OAuth 2.0 flow
│   │   ├── token-provider.ts         # API key/token auth
│   │   ├── hmac-verifier.ts          # HMAC signature verification
│   │   └── secret-manager.ts         # GCP Secret Manager integration
│   │
│   ├── webhook/
│   │   ├── receiver-service.ts       # Cloud Run webhook receiver
│   │   ├── signature-verifier.ts     # Signature validation
│   │   ├── payload-parser.ts         # Webhook payload parsing
│   │   └── pubsub-publisher.ts       # Async processing via Pub/Sub
│   │
│   ├── utils/
│   │   ├── http-client.ts            # HTTP client with retry
│   │   ├── retry-strategy.ts         # Exponential backoff
│   │   ├── rate-limiter.ts           # Token bucket rate limiting
│   │   ├── pagination.ts             # Pagination helpers
│   │   └── circuit-breaker.ts        # Circuit breaker pattern
│   │
│   ├── connectors/
│   │   ├── github/
│   │   │   ├── github-connector.ts
│   │   │   ├── github-rest-client.ts
│   │   │   ├── github-graphql-client.ts
│   │   │   └── github-webhook-handler.ts
│   │   ├── gitlab/
│   │   ├── linear/
│   │   ├── jira/
│   │   └── slack/
│   │
│   └── index.ts                       # Public API
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
└── docs/
    ├── README.md                      # Getting started
    ├── creating-connectors.md         # Connector development guide
    └── api-reference.md               # API docs
```

### Cloud Infrastructure

```
Cloud Run Services:
├── gwi-webhook-receiver (public)
│   ├── Receives webhooks from all sources
│   ├── Verifies signatures
│   └── Publishes to Pub/Sub
│
└── gwi-connector-workers (private)
    ├── Subscribe to Pub/Sub topics
    ├── Process webhook events
    └── Execute connector sync jobs

Pub/Sub Topics:
├── connector-webhooks-github
├── connector-webhooks-gitlab
├── connector-webhooks-linear
├── connector-webhooks-jira
└── connector-webhooks-slack

Cloud Scheduler:
├── Hourly sync jobs (for connectors without webhooks)
└── Health check jobs

Secret Manager:
├── github-oauth-token-{tenant-id}
├── gitlab-oauth-token-{tenant-id}
├── linear-api-key-{tenant-id}
├── jira-api-token-{tenant-id}
└── slack-bot-token-{tenant-id}
```

### Authentication Flows

#### OAuth 2.0 (GitHub, GitLab, Linear, Slack)
```
1. User clicks "Connect {Service}"
2. Redirect to OAuth provider
3. User authorizes scopes
4. Callback with authorization code
5. Exchange code for access token
6. Store token in Secret Manager
7. Refresh token when expired
```

#### Token-Based (API Keys)
```
1. User provides API key
2. Validate key with test API call
3. Store in Secret Manager
4. Include in Authorization header
```

#### Webhook Signature Verification
```
1. Receive webhook POST
2. Extract signature from headers
3. Compute HMAC(secret, payload)
4. Compare signatures
5. Reject if mismatch
6. Process if valid
```

---

## Testing Strategy

### Unit Tests (>90% coverage)
- BaseConnector functionality
- Authentication providers
- Retry logic
- Rate limiting
- Pagination helpers

### Integration Tests (>80% coverage)
- Real API calls (test accounts)
- Webhook delivery
- OAuth flows
- Error scenarios

### Contract Tests
- Verify connector interface compliance
- Schema validation
- Backward compatibility

### Load Tests
- Webhook burst handling (1000 req/s)
- Rate limit enforcement
- Circuit breaker activation
- Concurrent sync jobs

### End-to-End Tests
- Full OAuth flow
- Webhook → processing → storage
- Connector health degradation

---

## Cost Analysis

### Development Costs (Free Tier)

**Services:**
- Airbyte self-hosted: $0 (open source)
- GitHub API: $0 (5,000 req/hr free)
- GitLab free tier: $0
- Linear free plan: $0
- Jira Cloud: $0 (up to 10 users)
- Slack free tier: $0
- Webhook testing tools: $0 (Webhook.site, RequestBin, ngrok)

**Total Development Cost: $0**

### Production Costs (Estimated Monthly)

**Cloud Run:**
- Webhook receiver: ~$10/month (always-on, low traffic)
- Connector workers: ~$20/month (on-demand)

**Pub/Sub:**
- Webhooks: ~$5/month (assuming 100K messages)

**Secret Manager:**
- Credential storage: ~$1/month

**Cloud Scheduler:**
- Health checks: $0 (free tier)

**API Quotas:**
- GitHub: $0 (within free tier for most use cases)
- GitLab: $0 (free tier)
- Linear: $8/user/month (if exceeding free tier)
- Jira: $7.75/user/month (if exceeding free tier)
- Slack: $0 (free tier sufficient for notifications)

**Total Production Cost: ~$36-50/month**

**Cost per connector: ~$7-10/month**

---

## Acceptance Criteria

### Epic-Level Success Criteria

1. **Framework Completeness**
   - [ ] BaseConnector abstract class with comprehensive utilities
   - [ ] ConnectorRegistry with health monitoring
   - [ ] OAuth/token/HMAC authentication providers
   - [ ] Webhook receiver service (Cloud Run)
   - [ ] Retry, rate-limiting, circuit breaker utilities
   - [ ] Test harness and mocking utilities

2. **Connector Implementations**
   - [ ] GitHub connector (production-ready)
   - [ ] GitLab connector (production-ready)
   - [ ] Linear connector (production-ready)
   - [ ] Jira/Plane connector (production-ready)
   - [ ] Slack connector (production-ready)

3. **Quality Metrics**
   - [ ] >80% test coverage across all packages
   - [ ] All integration tests passing
   - [ ] Load test: Handle 1000 webhooks/second
   - [ ] 99.9% webhook delivery reliability
   - [ ] <100ms p95 latency for webhook ingestion

4. **Documentation**
   - [ ] Framework architecture doc (this document)
   - [ ] Getting started guide
   - [ ] Creating custom connectors guide
   - [ ] API reference documentation
   - [ ] Per-connector setup guides
   - [ ] Troubleshooting guide

5. **Operational Readiness**
   - [ ] All connectors deployed to Cloud Run
   - [ ] Health check endpoints operational
   - [ ] Monitoring dashboards configured
   - [ ] Alerting rules defined
   - [ ] Runbooks for common issues

6. **Developer Experience**
   - [ ] Can add new connector in <2 days
   - [ ] Clear error messages for auth failures
   - [ ] Webhook testing tools documented
   - [ ] Local development setup documented

### Story-Level Acceptance Criteria

Defined per-story in sections above.

---

## Timeline & Milestones

**Week 1:** B1 Complete (Study phase)
**Week 2:** B2 Complete (Design phase)
**Week 3:** B3 Complete (Framework implementation)
**Week 4:** B4 Complete (GitHub connector - reference)
**Week 5:** B5 Complete (GitLab connector)
**Week 6:** B6, B7 Complete (Linear, Jira connectors - parallel)
**Week 7:** B8 Complete (Slack connector)

**Total: 7 weeks to production-ready connector framework**

---

## Risks & Mitigations

### Risk 1: API Rate Limiting
**Impact:** High
**Probability:** Medium
**Mitigation:**
- Implement per-connector rate limiters
- Use exponential backoff
- Cache frequently accessed data
- Batch API calls where possible

### Risk 2: Webhook Delivery Failures
**Impact:** High
**Probability:** Medium
**Mitigation:**
- Implement retry with exponential backoff
- Dead letter queue for failed webhooks
- Manual replay mechanism
- Alert on high failure rate

### Risk 3: OAuth Token Expiration
**Impact:** Medium
**Probability:** High
**Mitigation:**
- Automatic token refresh
- Proactive refresh before expiry
- User notification for manual re-auth
- Graceful degradation

### Risk 4: Connector API Changes
**Impact:** Medium
**Probability:** Medium
**Mitigation:**
- Version locking (specify API version)
- Automated tests detect breaking changes
- Monitoring for API deprecation notices
- Contract testing

### Risk 5: Secret Management
**Impact:** High
**Probability:** Low
**Mitigation:**
- Use GCP Secret Manager exclusively
- No secrets in code/logs
- Audit secret access
- Rotation policy

---

## References

### External Documentation
- Airbyte GitHub: https://github.com/airbytehq/airbyte
- Airbyte CDK: https://airbyte.com/data-engineering-resources/develop-custom-data-connectors
- SurfSense: https://github.com/MODSetter/SurfSense
- Plane: https://github.com/makeplane/plane
- GitHub API: https://docs.github.com/en/rest
- GitLab API: https://docs.gitlab.com/ee/api/
- Linear API: https://developers.linear.app/
- Jira API: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
- Slack API: https://api.slack.com/

### Internal Documentation
- 110-DR-TMOD-security-threat-model.md
- 111-DR-TARG-slo-sla-targets.md
- CLAUDE.md (Epic structure)

---

## Appendix A: Connector Specification Format

```yaml
# Example: GitHub Connector Specification
name: github
display_name: GitHub
version: 1.0.0
description: Connect to GitHub repositories for PR automation

# Authentication
auth:
  type: oauth2
  oauth_url: https://github.com/login/oauth/authorize
  token_url: https://github.com/login/oauth/access_token
  scopes:
    - repo
    - read:org
    - webhook
  refresh_supported: true

# Webhook configuration
webhooks:
  enabled: true
  events:
    - pull_request
    - pull_request_review
    - issues
    - push
    - status
  signature_header: X-Hub-Signature-256
  signature_algorithm: sha256

# Data sync
sync:
  modes:
    - full_refresh
    - incremental
  resources:
    - name: pull_requests
      primary_key: id
      cursor_field: updated_at
    - name: issues
      primary_key: id
      cursor_field: updated_at
    - name: repositories
      primary_key: id
      cursor_field: updated_at

# Rate limiting
rate_limits:
  requests_per_hour: 5000
  strategy: token_bucket

# Health check
health_check:
  endpoint: /
  method: GET
  expected_status: 200
  timeout_seconds: 5

# Dependencies
dependencies:
  - "@octokit/rest": "^19.0.0"
  - "@octokit/graphql": "^5.0.0"
```

---

## Appendix B: Sample Connector Implementation

```typescript
/**
 * GitHub Connector - Reference Implementation
 *
 * Demonstrates best practices for connector development:
 * - OAuth authentication
 * - Webhook handling
 * - Rate limiting
 * - Error handling
 */

import { BaseConnector } from '../core/base-connector';
import { Octokit } from '@octokit/rest';
import type {
  IConnector,
  ConnectorConfig,
  SyncOptions,
  WebhookPayload
} from '../core/types';

export class GitHubConnector extends BaseConnector implements IConnector {
  name = 'github';
  version = '1.0.0';

  private octokit?: Octokit;

  async authenticate(config: ConnectorConfig): Promise<void> {
    const token = await this.getOAuthToken(config.tenantId);

    this.octokit = new Octokit({
      auth: token,
      throttle: {
        onRateLimit: (retryAfter, options, octokit) => {
          this.logger.warn(`Rate limit hit, retrying after ${retryAfter}s`);
          return true; // Retry
        },
        onSecondaryRateLimit: (retryAfter, options, octokit) => {
          this.logger.warn(`Secondary rate limit hit`);
          return false; // Don't retry
        },
      },
    });

    // Test authentication
    await this.octokit.rest.users.getAuthenticated();
  }

  async *sync(options: SyncOptions): AsyncIterator<Record> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }

    // Incremental sync using cursor
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await this.octokit.rest.pulls.list({
        owner: options.owner,
        repo: options.repo,
        state: 'all',
        per_page: perPage,
        page,
        sort: 'updated',
        direction: 'desc',
      });

      for (const pr of response.data) {
        // Stop if we've reached data we've already synced
        if (options.cursor && pr.updated_at <= options.cursor) {
          return;
        }

        yield {
          type: 'pull_request',
          id: pr.id,
          data: pr,
        };
      }

      // No more pages
      if (response.data.length < perPage) {
        break;
      }

      page++;
    }
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    // Verify signature
    const isValid = await this.verifyWebhookSignature(
      payload.body,
      payload.headers['x-hub-signature-256']
    );

    if (!isValid) {
      throw new Error('Invalid webhook signature');
    }

    // Parse event
    const event = payload.headers['x-github-event'];

    switch (event) {
      case 'pull_request':
        await this.handlePullRequestEvent(payload.body);
        break;
      case 'issues':
        await this.handleIssueEvent(payload.body);
        break;
      default:
        this.logger.info(`Unhandled event: ${event}`);
    }
  }

  private async handlePullRequestEvent(data: any): Promise<void> {
    // Process PR event
    this.logger.info(`PR ${data.action}: ${data.pull_request.title}`);

    // Publish to internal event bus
    await this.publishEvent({
      type: 'github.pull_request',
      action: data.action,
      pr: {
        number: data.pull_request.number,
        title: data.pull_request.title,
        state: data.pull_request.state,
      },
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (!this.octokit) {
        return { healthy: false, message: 'Not authenticated' };
      }

      await this.octokit.rest.users.getAuthenticated();

      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async verifyWebhookSignature(
    payload: string,
    signature: string
  ): Promise<boolean> {
    const secret = await this.getWebhookSecret();
    const computed = this.computeHMAC(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computed)
    );
  }
}
```

---

**Document End**

*This document will be updated as Epic B progresses. All changes should be tracked with date stamps and author attribution.*

**Last Updated:** 2025-12-28
**Author:** @connectors-lead
**Reviewers:** @backend, @security, @infra
