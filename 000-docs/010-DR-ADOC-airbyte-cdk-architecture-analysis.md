# Airbyte CDK Architecture Analysis

**Document ID:** 010-DR-ADOC
**Date:** 2025-12-27
**Epic:** B (Data Ingestion & Connector Framework)
**Story:** B1 (Study Existing Connector Patterns)
**Task:** B1.2 (Analyze Airbyte CDK architecture)
**Status:** Complete

---

## Executive Summary

This document provides a comprehensive analysis of the Airbyte Connector Development Kit (CDK) architecture, patterns, and implementation approaches. The analysis is based on studying the Airbyte codebase at `/tmp/airbyte-local` and official documentation.

**Key Findings:**
- Airbyte supports 3 connector development approaches (low-code → Python CDK → custom)
- Declarative YAML-based connectors cover ~90% of use cases
- Strong abstractions for Sources, Streams, Authentication, and Pagination
- TypeScript/Node.js equivalent would follow similar patterns

---

## Table of Contents

1. [CDK Overview](#cdk-overview)
2. [Development Approaches](#development-approaches)
3. [Architecture Components](#architecture-components)
4. [Connector Specification Format](#connector-specification-format)
5. [Example: Declarative Connector](#example-declarative-connector)
6. [Key Patterns Identified](#key-patterns-identified)
7. [Implications for Git With Intent](#implications-for-git-with-intent)
8. [Recommendations](#recommendations)

---

## CDK Overview

### Purpose

The Airbyte CDK is **"a framework for rapidly developing production-grade Airbyte connectors."** It provides:

- Abstract base classes for Sources and Streams
- Authentication providers (OAuth, Bearer Token, API Key, HMAC)
- HTTP client with retry logic and rate limiting
- Pagination helpers (cursor-based, offset, page number)
- Incremental sync with cursor fields
- Schema validation and type safety
- Testing utilities and fixtures

### Repository Structure

```
airbyte-python-cdk/
├── airbyte_cdk/
│   ├── sources/
│   │   ├── declarative/          # Low-code YAML-based connectors
│   │   ├── concurrent_source/    # High-throughput parallel reading
│   │   ├── file_based/           # S3, GCS, Azure file sources
│   │   └── abstract_source.py    # Base Source class
│   ├── destinations/             # Destination connector support
│   ├── models/                   # Data models
│   └── utils/                    # Shared utilities
```

**Note:** The Python CDK moved to a separate repo: https://github.com/airbytehq/airbyte-python-cdk

---

## Development Approaches

Airbyte offers **3 tiers** of connector development (ordered by complexity):

### 1. Connector Builder UI (Recommended - 90% of use cases)
- **Visual interface** for building connectors
- No code required for simple REST APIs
- Generates declarative YAML manifest
- Best for: Standard REST/GraphQL APIs with simple auth

### 2. Low-Code CDK (Declarative YAML)
- **YAML manifest** defines connector behavior
- Minimal Python code (1 class, 3 lines)
- Supports complex scenarios (pagination, incremental sync, transformations)
- Best for: REST APIs with OAuth, cursor pagination, date-based incremental sync

**Example (source-adjust):**
```python
from airbyte_cdk.sources.declarative.yaml_declarative_source import YamlDeclarativeSource

class SourceAdjust(YamlDeclarativeSource):
    def __init__(self):
        super().__init__(**{"path_to_yaml": "manifest.yaml"})
```

### 3. Full Python CDK (Custom Implementation)
- **Extend AbstractSource** and implement custom logic
- Full control over HTTP requests, response parsing, state management
- Best for: Complex APIs, custom auth flows, non-REST protocols

---

## Architecture Components

### 1. Source Abstraction

**Core interface:**
```python
class AbstractSource:
    def check(self, config: Mapping[str, Any]) -> AirbyteConnectionStatus:
        """Test connection and credentials"""

    def discover(self, config: Mapping[str, Any]) -> AirbyteCatalog:
        """Return available streams and their schemas"""

    def read(self, config: Mapping[str, Any], catalog: ConfiguredAirbyteCatalog,
             state: Mapping[str, Any]) -> Iterator[AirbyteMessage]:
        """Yield records from configured streams"""
```

**Responsibilities:**
- Connection health checks
- Schema discovery (what data is available)
- Data extraction with state management

---

### 2. Stream Abstraction

**Core concept:** A Stream represents a single data resource (e.g., GitHub Pull Requests, Jira Issues)

**Key methods:**
```python
class Stream:
    def path(self) -> str:
        """API endpoint path"""

    def parse_response(self, response: requests.Response) -> Iterable[Mapping]:
        """Extract records from API response"""

    def stream_slices(self, **kwargs) -> Iterable[Optional[Mapping[str, Any]]]:
        """Partition data retrieval (e.g., by date ranges)"""

    def request_params(self, **kwargs) -> MutableMapping[str, Any]:
        """Query parameters for API request"""
```

**Stream Types:**
- **Full Refresh:** Reloads all data every sync
- **Incremental:** Only fetches new/updated records (uses cursor field like `updated_at`)

---

### 3. Authentication Patterns

Airbyte CDK supports multiple auth strategies:

#### Bearer Token Authentication
```yaml
authenticator:
  type: BearerAuthenticator
  api_token: '{{ config["api_token"] }}'
```

#### OAuth 2.0
```yaml
authenticator:
  type: OAuthAuthenticator
  client_id: '{{ config["client_id"] }}'
  client_secret: '{{ config["client_secret"] }}'
  refresh_token: '{{ config["refresh_token"] }}'
  token_refresh_endpoint: https://api.example.com/oauth/token
```

#### API Key (Header/Query Param)
```yaml
authenticator:
  type: ApiKeyAuthenticator
  header: X-API-Key
  api_token: '{{ config["api_key"] }}'
```

#### Custom Authentication
Extend `HttpAuthenticator` class for custom flows (HMAC, JWT, etc.)

---

### 4. Pagination Strategies

#### Cursor-Based Pagination
```yaml
paginator:
  type: DefaultPaginator
  pagination_strategy:
    type: CursorPagination
    cursor_value: '{{ response.next_cursor }}'
    page_token_option:
      type: RequestPath
```

#### Offset Pagination
```yaml
paginator:
  type: DefaultPaginator
  pagination_strategy:
    type: OffsetIncrement
    page_size: 100
```

#### Page Number Pagination
```yaml
paginator:
  type: DefaultPaginator
  pagination_strategy:
    type: PageIncrement
    page_size: 50
```

---

### 5. Incremental Sync

**Cursor-based incremental sync** tracks the last synced record:

```yaml
incremental_sync:
  type: DatetimeBasedCursor
  cursor_field: updated_at           # Field to track progress
  cursor_datetime_formats:
    - "%Y-%m-%dT%H:%M:%SZ"
  start_datetime:
    type: MinMaxDatetime
    datetime: "{{ config['start_date'] }}"
  end_datetime:
    type: MinMaxDatetime
    datetime: "{{ now_utc() }}"
  step: P1D                          # Fetch 1 day at a time
  cursor_granularity: P1D
```

**How it works:**
1. First sync: Fetch from `start_date` to `now()`
2. Subsequent syncs: Fetch from `last_cursor_value` to `now()`
3. State stored in connector's internal state (not exposed to API)

---

## Connector Specification Format

Every connector has a **spec** defining configuration requirements:

```yaml
spec:
  type: Spec
  documentationUrl: https://docs.airbyte.com/integrations/sources/adjust
  connection_specification:
    type: object
    $schema: http://json-schema.org/draft-07/schema#
    required:
      - api_token
      - ingest_start
      - metrics
    properties:
      api_token:
        type: string
        title: API Token
        description: Your API token from the service
        airbyte_secret: true        # Mark as sensitive

      ingest_start:
        type: string
        format: date
        title: Ingest Start Date
        description: Data ingest start date

      metrics:
        type: array
        title: Metrics to ingest
        description: Select at least one metric to query
        items:
          type: string
          enum: [installs, clicks, revenue, sessions]
        minItems: 1
        uniqueItems: true
```

**Key features:**
- JSON Schema validation
- Secret masking (`airbyte_secret: true`)
- Enums for dropdown options
- Required vs optional fields

---

## Example: Declarative Connector

### Source Code (3 lines!)

**File:** `source_adjust/source.py`
```python
from airbyte_cdk.sources.declarative.yaml_declarative_source import YamlDeclarativeSource

class SourceAdjust(YamlDeclarativeSource):
    def __init__(self):
        super().__init__(**{"path_to_yaml": "manifest.yaml"})
```

### Manifest YAML (Declarative Definition)

**File:** `source_adjust/manifest.yaml`
```yaml
version: 0.83.0
type: DeclarativeSource

# Health check
check:
  type: CheckStream
  stream_names:
    - AdjustReport

# Stream definitions
definitions:
  streams:
    AdjustReport:
      type: DeclarativeStream
      name: AdjustReport
      retriever:
        type: SimpleRetriever
        requester:
          $ref: "#/definitions/base_requester"
          path: /report
          http_method: GET
          request_parameters:
            metrics: '{{ config["metrics"] | join(",") }}'
            dimensions: '{{ config["dimensions"] | join(",") }}'
            date_period: "{{ stream_interval['start_time'] }}:{{ stream_interval['end_time'] }}"
        record_selector:
          type: RecordSelector
          extractor:
            type: DpathExtractor
            field_path: [rows]      # Extract from response.rows

      # Incremental sync by date
      incremental_sync:
        type: DatetimeBasedCursor
        cursor_field: day
        cursor_datetime_formats: ["%Y-%m-%d"]
        datetime_format: "%Y-%m-%dT%H:%M:%SZ"
        start_datetime:
          type: MinMaxDatetime
          datetime: "{{ config['ingest_start'] }}"
        end_datetime:
          type: MinMaxDatetime
          datetime: "{{ now_utc() }}"
        step: P1D                    # 1 day chunks
        cursor_granularity: P1D

      # Dynamic schema loading
      schema_loader:
        type: CustomSchemaLoader
        class_name: source_adjust.components.AdjustSchemaLoader

  # Base HTTP requester with auth
  base_requester:
    type: HttpRequester
    url_base: https://dash.adjust.com/control-center/reports-service
    authenticator:
      type: BearerAuthenticator
      api_token: '{{ config["api_token"] }}'

streams:
  - $ref: "#/definitions/streams/AdjustReport"

# Connector specification (config schema)
spec:
  type: Spec
  connection_specification:
    type: object
    required: [api_token, ingest_start, metrics, dimensions]
    properties:
      api_token:
        type: string
        airbyte_secret: true
      ingest_start:
        type: string
        format: date
      metrics:
        type: array
        items:
          type: string
          enum: [installs, clicks, revenue, ...]
      dimensions:
        type: array
        items:
          type: string
          enum: [os_name, country, network, ...]
```

**Analysis:**
- **Zero boilerplate:** HTTP client, auth, pagination handled by framework
- **Declarative:** Entire connector logic in 200 lines of YAML
- **Testable:** YAML is version-controlled, diff-friendly
- **Maintainable:** API changes = YAML updates, no code changes

---

## Key Patterns Identified

### 1. Separation of Concerns

| Layer | Responsibility | Example |
|-------|----------------|---------|
| **Source** | Connection, discovery, orchestration | `AbstractSource.read()` |
| **Stream** | Single resource extraction | `PullRequestsStream`, `IssuesStream` |
| **Retriever** | HTTP request execution | `SimpleRetriever`, `ConcurrentRetriever` |
| **Authenticator** | Credential management | `BearerAuthenticator`, `OAuthAuthenticator` |
| **Paginator** | Multi-page fetching | `CursorPagination`, `OffsetIncrement` |
| **RecordSelector** | Response parsing | `DpathExtractor`, `JSONPathExtractor` |

### 2. Configuration as Data

- **Config schema** is JSON Schema (validated at runtime)
- **Secrets** marked with `airbyte_secret: true`
- **Templating** using Jinja2 (`{{ config["api_key"] }}`)
- **Environment variables** supported via config injection

### 3. State Management

- **Incremental sync state** stored as JSON: `{"stream_name": {"updated_at": "2025-12-27T10:00:00Z"}}`
- **Framework manages state** (read → update → persist)
- **Connector doesn't touch storage** (abstracted away)

### 4. Error Handling

- **Retry with exponential backoff** (built into `HttpRequester`)
- **Rate limit detection** (429 status code → automatic retry)
- **Circuit breaker** pattern for failing endpoints
- **Graceful degradation** (skip failing streams, continue others)

### 5. Testing Strategy

- **Unit tests:** Mock HTTP responses, test parsing logic
- **Integration tests:** Real API calls with test accounts
- **Contract tests:** Validate output matches Airbyte protocol
- **Fixtures:** Example API responses stored as JSON

---

## Implications for Git With Intent

### Similarities to Our Use Case

| Airbyte Pattern | GWI Equivalent |
|-----------------|----------------|
| Source connectors (GitHub, GitLab, Jira) | VCS integrations (GitHub, GitLab) |
| Incremental sync with cursor fields | Fetch PRs updated since last run |
| OAuth/token authentication | GitHub App installation tokens |
| Webhook handling | GitHub webhook receiver (already implemented) |
| Stream abstraction (PRs, Issues, Reviews) | Resource types (PullRequest, Issue, Comment) |
| Declarative YAML manifests | Connector configs in TypeScript/JSON |

### Key Differences

| Aspect | Airbyte | Git With Intent |
|--------|---------|-----------------|
| **Language** | Python | TypeScript/Node.js |
| **Data Flow** | Pull (sync jobs) | Push (webhooks) + Pull (fallback) |
| **Storage** | Destinations (databases, warehouses) | Firestore (operational) + SQLite (dev) |
| **Focus** | ETL/data ingestion | PR automation workflows |
| **Connectors** | 600+ general-purpose | 6 specific to dev tools |

### Reusable Patterns for TypeScript

1. **BaseConnector abstract class** (like Airbyte's AbstractSource)
   ```typescript
   abstract class BaseConnector implements IConnector {
     abstract authenticate(config: ConnectorConfig): Promise<void>;
     abstract healthCheck(): Promise<HealthStatus>;
     abstract sync(options: SyncOptions): AsyncIterator<Record>;

     // Shared utilities
     protected async retryRequest(...) { }
     protected async checkRateLimit(...) { }
   }
   ```

2. **Stream-based architecture**
   ```typescript
   class GitHubPullRequestsStream extends BaseStream {
     async *read(cursor?: string): AsyncIterator<PullRequest> {
       // Fetch PRs with incremental sync
     }
   }
   ```

3. **Declarative connectors** (simplified TypeScript equivalent)
   ```typescript
   const githubConnector = new DeclarativeConnector({
     name: 'github',
     auth: { type: 'oauth', scopes: ['repo', 'read:org'] },
     streams: [
       {
         name: 'pull_requests',
         path: '/repos/:owner/:repo/pulls',
         cursor_field: 'updated_at',
         paginator: { type: 'link_header' }
       }
     ]
   });
   ```

---

## Recommendations

### For Epic B Implementation

1. **Adopt 3-tier approach:**
   - Simple connectors: Declarative config (JSON/TypeScript)
   - Complex connectors: Extend `BaseConnector`
   - Custom flows: Full TypeScript implementation

2. **Implement core abstractions:**
   - `IConnector` interface (check, discover, sync, healthCheck)
   - `BaseConnector` abstract class with shared utilities
   - `BaseStream` for resource-specific logic
   - `ConnectorRegistry` for discovery and health monitoring

3. **Authentication strategy:**
   - Support OAuth 2.0 (GitHub, GitLab, Linear, Slack)
   - Support token auth (API keys for Jira, Vertex AI)
   - Support HMAC webhook verification
   - Store credentials in GCP Secret Manager

4. **Pagination helpers:**
   - Link header parsing (GitHub, GitLab)
   - Cursor-based pagination (Linear GraphQL)
   - Offset pagination (Jira REST API)

5. **Incremental sync pattern:**
   ```typescript
   interface IncrementalSyncConfig {
     cursor_field: string;           // e.g., 'updated_at'
     start_datetime?: string;
     end_datetime?: string;
     granularity: 'hour' | 'day';
   }
   ```

6. **Testing utilities:**
   - Mock connector for unit tests
   - Webhook test harness
   - Integration test helpers with real API calls

---

## Next Steps

**Completed:**
- ✅ B1.1: Cloned Airbyte repo, studied deployment docs
- ✅ B1.2: Analyzed CDK architecture (this document)

**Up Next:**
- **B1.3:** Study 10+ production connectors (GitHub, GitLab, Jira, Slack, Stripe, etc.)
- **B1.4:** Clone and analyze SurfSense (15+ open source connectors)
- **B1.5:** Document connector patterns (ADR)
- **B1.6:** Test with Beeceptor mock APIs

---

## References

### External Resources
- Airbyte CDK Docs: https://docs.airbyte.com/connector-development/cdk-python/
- Python CDK Repo: https://github.com/airbytehq/airbyte-python-cdk
- Connector Builder: https://docs.airbyte.com/connector-development/connector-builder-ui/
- Airbyte Protocol: https://docs.airbyte.com/understanding-airbyte/airbyte-protocol/

### Internal Resources
- Epic B Documentation: 000-docs/008-DR-EPIC-epic-b-connector-framework.md
- CLAUDE.md: Task tracking and workflow
- Beads task: `git-with-intent-0xb.1.2`

---

**Document Status:** ✅ Complete
**Author:** @connectors-lead
**Reviewed By:** TBD
**Last Updated:** 2025-12-27
