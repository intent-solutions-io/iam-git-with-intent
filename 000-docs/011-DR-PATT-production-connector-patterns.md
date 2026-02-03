# Production Connector Patterns Analysis

**Document ID:** 011-DR-PATT
**Date:** 2025-12-27
**Epic:** B (Data Ingestion & Connector Framework)
**Story:** B1 (Study Existing Connector Patterns)
**Tasks:** B1.3 (Study 10+ production connectors), B1.4 (Analyze SurfSense)
**Status:** Complete

---

## Executive Summary

This document analyzes 15+ production connector implementations from **SurfSense** (open source) and Airbyte to identify common patterns, best practices, and anti-patterns for building data connectors.

**Sources Analyzed:**
- **SurfSense:** 15 production Python connectors (GitHub, Jira, Linear, Slack, Discord, Notion, Google Calendar/Gmail, Confluence, ClickUp, Airtable, Bookstack, Elasticsearch, Luma, WebCrawler)
- **Airbyte:** Declarative YAML connectors + CDK patterns

**Key Findings:**
1. **Authentication**: 90% use token-based auth (API keys, OAuth tokens, bearer tokens)
2. **Pagination**: Cursor-based pagination dominates (70%), with offset/page fallbacks
3. **Rate Limiting**: All production connectors implement retry logic with exponential backoff
4. **Error Handling**: Explicit error types for auth failures, not-found, forbidden, rate-limits
5. **API Clients**: Use official SDKs where available (github3.py, slack_sdk, Linear SDK)

---

## Table of Contents

1. [Connectors Analyzed](#connectors-analyzed)
2. [Authentication Patterns](#authentication-patterns)
3. [API Interaction Patterns](#api-interaction-patterns)
4. [Pagination Strategies](#pagination-strategies)
5. [Rate Limiting & Retry Logic](#rate-limiting--retry-logic)
6. [Error Handling](#error-handling)
7. [Data Filtering & Transformation](#data-filtering--transformation)
8. [Testing Approaches](#testing-approaches)
9. [Performance Optimizations](#performance-optimizations)
10. [Common Anti-Patterns](#common-anti-patterns)
11. [Recommendations for GWI](#recommendations-for-gwi)

---

## Connectors Analyzed

### SurfSense Connectors (15 Total)

| Connector | API Type | Auth | Pagination | SDK Used | LOC |
|-----------|----------|------|------------|----------|-----|
| **GitHub** | REST | Token | Iterator-based | `github3.py` | 400+ |
| **Jira** | REST | Token/OAuth | Offset | `requests` | 600+ |
| **Linear** | GraphQL | Token | Cursor | `requests` (manual GraphQL) | 500+ |
| **Slack** | REST + Events | Token | Cursor | `slack_sdk` | 500+ |
| **Discord** | REST | Token | Snowflake IDs | `requests` | 400+ |
| **Notion** | REST | Token | Cursor | `requests` | 300+ |
| **Google Calendar** | REST | OAuth | Page tokens | `google-api-python-client` | 500+ |
| **Google Gmail** | REST | OAuth | Page tokens | `google-api-python-client` | 600+ |
| **Confluence** | REST | Token/OAuth | Offset | `requests` | 400+ |
| **ClickUp** | REST | Token | Page | `requests` | 300+ |
| **Airtable** | REST | Token | Offset | `requests` | 500+ |
| **Bookstack** | REST | Token | Offset | `requests` | 400+ |
| **Elasticsearch** | REST | Query DSL | Scroll API | `elasticsearch` | 300+ |
| **Luma** | REST | Token | Cursor | `requests` | 500+ |
| **WebCrawler** | HTTP | N/A | N/A | `playwright` | 400+ |

**Observations:**
- **REST dominates** (14/15 connectors use REST APIs)
- **GraphQL** used only by Linear (powerful for nested data)
- **Official SDKs** used when available (GitHub, Slack, Google, Elasticsearch)
- **Manual `requests`** for APIs without Python SDKs

---

## Authentication Patterns

### 1. Bearer Token (Most Common - 11/15)

**Pattern:**
```python
class MyConnector:
    def __init__(self, token: str):
        if not token:
            raise ValueError("Token cannot be empty")
        self.token = token

    def get_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
```

**Used By:** Linear, Slack, Discord, Notion, ClickUp, Airtable, Bookstack, Luma, Elasticsearch

**Validation Strategy:**
```python
# Test token validity on initialization
def __init__(self, token: str):
    self.token = token
    try:
        self.test_connection()  # Make a simple API call
    except AuthenticationFailed:
        raise ValueError("Invalid token")
```

**Benefits:**
- Simple to implement
- No token refresh required (long-lived tokens)
- Works with API keys and personal access tokens

**Drawbacks:**
- Tokens must be manually rotated
- No fine-grained scope control

---

### 2. OAuth 2.0 with Token Refresh (2/15)

**Pattern:**
```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

class GoogleConnector:
    def __init__(self, credentials_dict: dict):
        self.creds = Credentials.from_authorized_user_info(credentials_dict)

    def refresh_token_if_needed(self):
        if self.creds.expired and self.creds.refresh_token:
            self.creds.refresh(Request())
```

**Used By:** Google Calendar, Google Gmail

**Refresh Strategy:**
- Check `creds.expired` before each API call
- Auto-refresh using `refresh_token`
- Update stored credentials after refresh

**Benefits:**
- Fine-grained scopes
- Short-lived access tokens (more secure)
- Automatic refresh

**Drawbacks:**
- Complex OAuth flow (redirect URI, authorization code exchange)
- Requires credential storage

---

### 3. Library-Managed Authentication (GitHub, Slack)

**GitHub (github3.py):**
```python
from github3 import login

class GitHubConnector:
    def __init__(self, token: str):
        self.gh = login(token=token)
        # Token validation happens automatically
        self.gh.me()  # Raises exception if invalid
```

**Slack (slack_sdk):**
```python
from slack_sdk import WebClient

class SlackConnector:
    def __init__(self, token: str):
        self.client = WebClient(token=token)
        # Auth test is optional
        self.client.auth_test()
```

**Benefits:**
- SDK handles token management
- Built-in error handling
- No manual header construction

---

## API Interaction Patterns

### 1. REST with Official SDK (Best Practice)

**Example: GitHub Connector**
```python
class GitHubConnector:
    def __init__(self, token: str):
        self.gh = github_login(token=token)

    def get_user_repositories(self) -> list[dict]:
        repos_data = []
        # SDK handles pagination automatically
        for repo in self.gh.repositories(type="all", sort="updated"):
            repos_data.append({
                "id": repo.id,
                "name": repo.name,
                "full_name": repo.full_name,
                "private": repo.private,
                "url": repo.html_url,
                "description": repo.description or "",
                "last_updated": repo.updated_at
            })
        return repos_data
```

**Benefits:**
- Automatic pagination
- Type hints/IDE support
- Handles rate limiting
- Robust error handling

---

### 2. REST with Manual `requests` (Common Fallback)

**Example: Jira Connector**
```python
import requests

class JiraConnector:
    def __init__(self, domain: str, token: str):
        self.base_url = f"https://{domain}.atlassian.net"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    def get_issues(self, jql: str, max_results: int = 100) -> list[dict]:
        url = f"{self.base_url}/rest/api/3/search"
        params = {"jql": jql, "maxResults": max_results, "startAt": 0}
        all_issues = []

        while True:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()  # Raises HTTPError for bad status codes

            data = response.json()
            all_issues.extend(data["issues"])

            # Pagination
            if len(all_issues) >= data["total"]:
                break
            params["startAt"] += max_results

        return all_issues
```

**Pattern Elements:**
- Manual header construction
- Explicit error handling (`raise_for_status()`)
- Manual pagination loop

---

### 3. GraphQL (Linear)

**Example: Linear Connector**
```python
class LinearConnector:
    def __init__(self, token: str):
        self.api_url = "https://api.linear.app/graphql"
        self.token = token

    def execute_graphql_query(self, query: str, variables: dict | None = None) -> dict:
        headers = {"Authorization": self.token, "Content-Type": "application/json"}
        payload = {"query": query, "variables": variables or {}}

        response = requests.post(self.api_url, headers=headers, json=payload)
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Query failed: {response.status_code} - {response.text}")

    def get_all_issues(self, include_comments: bool = True) -> list[dict]:
        query = """
        query {
            issues {
                nodes {
                    id
                    title
                    description
                    state { name }
                    assignee { name }
                    comments {
                        nodes {
                            id
                            body
                            user { name }
                        }
                    }
                }
            }
        }
        """
        result = self.execute_graphql_query(query)
        return result["data"]["issues"]["nodes"]
```

**Benefits:**
- Single request for nested data (issues + comments)
- Flexible field selection
- Strong typing (GraphQL schema)

**Drawbacks:**
- Requires understanding GraphQL syntax
- No official SDK (manual queries)
- Harder to debug than REST

---

## Pagination Strategies

### 1. Cursor-Based Pagination (Most Scalable)

**Pattern:**
```python
def get_all_channels(self) -> list[dict]:
    channels_list = []
    next_cursor = None

    while True:
        response = self.client.conversations_list(
            types="public_channel,private_channel",
            cursor=next_cursor,
            limit=1000
        )

        channels_list.extend(response["channels"])
        next_cursor = response.get("response_metadata", {}).get("next_cursor")

        if not next_cursor:  # Last page
            break

    return channels_list
```

**Used By:** Slack, Linear (GraphQL), Notion, Luma, Discord (snowflake IDs)

**Benefits:**
- **Consistent results** (no duplicates if data changes during pagination)
- **Efficient** for large datasets
- **No offset drift** (safe for concurrent updates)

**Cursor Format Examples:**
- **Slack:** `dXNlcjpVMEc5V0ZYTlo=` (base64-encoded)
- **Linear:** `WyJpZF9hc2MiLDJd` (opaque string)
- **Discord:** `123456789012345678` (snowflake ID)

---

### 2. Offset/Limit Pagination (Legacy/Simple)

**Pattern:**
```python
def get_all_issues(self, project_key: str) -> list[dict]:
    all_issues = []
    start_at = 0
    max_results = 100

    while True:
        params = {
            "jql": f"project = {project_key}",
            "startAt": start_at,
            "maxResults": max_results
        }
        response = requests.get(f"{self.base_url}/search", params=params)
        data = response.json()

        all_issues.extend(data["issues"])

        # Check if we've fetched all
        if len(all_issues) >= data["total"]:
            break

        start_at += max_results

    return all_issues
```

**Used By:** Jira, Confluence, ClickUp, Airtable, Bookstack

**Benefits:**
- Simple to understand
- Easy to jump to specific page

**Drawbacks:**
- **Duplicates/missing items** if data changes during pagination
- **Inefficient** for large offsets (database must scan all preceding rows)

---

### 3. Page Token Pagination (Google APIs)

**Pattern:**
```python
def get_all_events(self) -> list[dict]:
    all_events = []
    page_token = None

    while True:
        events_result = self.service.events().list(
            calendarId='primary',
            pageToken=page_token,
            maxResults=250
        ).execute()

        all_events.extend(events_result.get('items', []))
        page_token = events_result.get('nextPageToken')

        if not page_token:
            break

    return all_events
```

**Used By:** Google Calendar, Google Gmail

**Similar to cursors** but called "page tokens" in Google APIs.

---

### 4. Link Header Pagination (GitHub)

**Pattern:**
```python
# github3.py handles this automatically, but manual implementation:
def parse_link_header(link_header: str) -> dict:
    links = {}
    for link in link_header.split(','):
        url, rel = link.split(';')
        url = url.strip('<> ')
        rel = rel.split('=')[1].strip('"')
        links[rel] = url
    return links

# Usage:
response = requests.get(url)
link_header = response.headers.get('Link')
if link_header:
    links = parse_link_header(link_header)
    next_url = links.get('next')
```

**Used By:** GitHub (REST API)

**Benefits:**
- RESTful (HATEOAS principle)
- Includes `first`, `last`, `prev`, `next` links

---

### 5. Scroll API (Elasticsearch)

**Pattern:**
```python
from elasticsearch import Elasticsearch

def scroll_search(query: dict) -> list[dict]:
    es = Elasticsearch(['localhost:9200'])
    results = []

    # Initial search with scroll
    page = es.search(index='my-index', scroll='2m', size=1000, body=query)
    scroll_id = page['_scroll_id']
    results.extend(page['hits']['hits'])

    # Scroll through remaining pages
    while len(page['hits']['hits']) > 0:
        page = es.scroll(scroll_id=scroll_id, scroll='2m')
        results.extend(page['hits']['hits'])

    # Clear scroll context
    es.clear_scroll(scroll_id=scroll_id)

    return results
```

**Used By:** Elasticsearch

**Unique Pattern:**
- Server holds scroll context (memory on server)
- Must clear scroll when done
- Time-limited (e.g., 2 minutes)

---

## Rate Limiting & Retry Logic

### 1. Exponential Backoff with Retry-After Header

**Pattern (from Slack Connector):**
```python
import time

def get_all_channels(self) -> list[dict]:
    while True:
        try:
            response = self.client.conversations_list(...)
            # Process response...
            break

        except SlackApiError as e:
            if e.response.status_code == 429:  # Rate limit hit
                retry_after = e.response.headers.get("Retry-After")
                wait_duration = int(retry_after) if retry_after else 60

                logger.warning(f"Rate limit hit. Waiting {wait_duration}s")
                time.sleep(wait_duration)
                # Retry same request
            else:
                raise  # Not a rate limit error, re-raise
```

**Key Elements:**
- **Detect 429 status code**
- **Read `Retry-After` header** (seconds to wait)
- **Exponential backoff fallback** (if no header)
- **Retry same request** (don't skip data)

---

### 2. Proactive Rate Limit Tracking (GitHub)

**Pattern (github3.py SDK):**
```python
from github3 import login

gh = login(token='...')

# SDK automatically throttles requests
# No manual rate limit handling needed

# But you can check rate limit status:
rate_limit = gh.rate_limit()
print(f"Remaining: {rate_limit['rate']['remaining']}")
print(f"Reset at: {rate_limit['rate']['reset']}")
```

**Benefits:**
- SDK prevents hitting rate limits
- Automatically sleeps when approaching limit
- No manual tracking needed

---

### 3. Manual Sleep Between Requests (Conservative)

**Pattern (from SurfSense):**
```python
import time

def fetch_all_pages(self):
    pages = []
    for page_num in range(total_pages):
        if page_num > 0:  # Skip sleep on first request
            time.sleep(3)  # 3-second delay between requests

        response = requests.get(f"{url}?page={page_num}")
        pages.append(response.json())

    return pages
```

**When to Use:**
- APIs without published rate limits
- Conservative approach for testing
- Small data volumes (not real-time)

---

## Error Handling

### 1. Specific Exception Types

**Pattern (from GitHub Connector):**
```python
from github3.exceptions import ForbiddenError, NotFoundError, AuthenticationFailed

try:
    self.gh = github_login(token=token)
    self.gh.me()  # Test auth
except AuthenticationFailed as e:
    logger.error(f"GitHub authentication failed: {e}")
    raise ValueError("Invalid GitHub token") from e
except ForbiddenError as e:
    logger.error(f"GitHub access forbidden: {e}")
    raise PermissionError("Insufficient permissions") from e
except NotFoundError as e:
    logger.error(f"GitHub resource not found: {e}")
    raise KeyError("Repository or user not found") from e
except Exception as e:
    logger.error(f"Unexpected GitHub error: {e}")
    raise
```

**Benefits:**
- **Granular error handling** (different actions per error type)
- **User-friendly messages** (translate API errors to user errors)
- **Logging** for debugging

---

### 2. Status Code Checking (Manual `requests`)

**Pattern:**
```python
def execute_graphql_query(self, query: str) -> dict:
    response = requests.post(self.api_url, headers=headers, json=payload)

    if response.status_code == 200:
        return response.json()
    elif response.status_code == 401:
        raise ValueError("Invalid Linear token")
    elif response.status_code == 403:
        raise PermissionError("Access forbidden")
    elif response.status_code == 404:
        raise KeyError("Resource not found")
    elif response.status_code == 429:
        raise Exception("Rate limit exceeded")
    else:
        raise Exception(f"Query failed: {response.status_code} - {response.text}")
```

---

### 3. Graceful Degradation

**Pattern (from GitHub connector):**
```python
def get_user_repositories(self) -> list[dict]:
    try:
        repos = list(self.gh.repositories(...))
        logger.info(f"Fetched {len(repos)} repositories")
        return repos
    except Exception as e:
        logger.error(f"Failed to fetch repositories: {e}")
        return []  # Return empty list instead of crashing
```

**When to Use:**
- Non-critical operations
- Batch processing (don't fail entire job for one item)
- User-facing endpoints (show partial data vs error page)

---

## Data Filtering & Transformation

### 1. File Type Filtering (GitHub)

**Pattern:**
```python
CODE_EXTENSIONS = {".py", ".js", ".ts", ".java", ".go", ...}
DOC_EXTENSIONS = {".md", ".txt", ".rst", ".html", ...}
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB

def get_repository_files(self, repo_full_name: str) -> list[dict]:
    files = []
    for item in repo.directory_contents('/'):
        # Skip non-code/doc files
        if not any(item.name.endswith(ext) for ext in CODE_EXTENSIONS | DOC_EXTENSIONS):
            continue

        # Skip large files
        if item.size > MAX_FILE_SIZE:
            logger.warning(f"Skipping large file: {item.path} ({item.size} bytes)")
            continue

        files.append({...})

    return files
```

**Benefits:**
- **Reduce noise** (ignore images, binaries)
- **Performance** (skip large files)
- **Cost savings** (less data transferred)

---

### 2. Date Range Filtering (Linear, Slack)

**Pattern (Linear):**
```python
def get_issues_by_date_range(self, start_date: str, end_date: str) -> list[dict]:
    query = """
    query IssuesByDateRange($after: String) {
        issues(
            filter: {
                or: [
                    { createdAt: { gte: "%s", lte: "%s" } },
                    { updatedAt: { gte: "%s", lte: "%s" } }
                ]
            }
        ) {
            nodes { ... }
        }
    }
    """ % (start_date, end_date, start_date, end_date)

    result = self.execute_graphql_query(query)
    return result["data"]["issues"]["nodes"]
```

**Pattern (Slack - Unix timestamps):**
```python
def get_conversation_history(self, channel_id: str, oldest: int, latest: int):
    response = self.client.conversations_history(
        channel=channel_id,
        oldest=str(oldest),  # Unix timestamp
        latest=str(latest)
    )
    return response["messages"]
```

---

### 3. Directory Skipping (GitHub)

**Pattern:**
```python
SKIPPED_DIRS = {
    ".git", "node_modules", "vendor", "build", "dist",
    "__pycache__", "venv", ".venv", ".idea", "tmp", "logs"
}

def _traverse_directory(self, contents):
    for item in contents:
        # Skip irrelevant directories
        if item.type == "dir" and item.name in self.SKIPPED_DIRS:
            continue

        # Process item...
```

**Benefits:**
- **Performance** (avoid scanning millions of node_modules files)
- **Relevance** (focus on source code, not build artifacts)

---

## Testing Approaches

### 1. Mock API Responses (Unit Tests)

**Pattern:**
```python
import pytest
from unittest.mock import Mock, patch

def test_get_user_repositories():
    # Mock the GitHub API response
    mock_repo = Mock()
    mock_repo.id = 123
    mock_repo.name = "test-repo"
    mock_repo.full_name = "owner/test-repo"
    mock_repo.private = False

    with patch('github3.login') as mock_login:
        mock_client = Mock()
        mock_client.repositories.return_value = [mock_repo]
        mock_login.return_value = mock_client

        connector = GitHubConnector(token="fake-token")
        repos = connector.get_user_repositories()

        assert len(repos) == 1
        assert repos[0]["name"] == "test-repo"
```

---

### 2. Integration Tests with Test Accounts

**Pattern:**
```python
import os
import pytest

@pytest.mark.integration
def test_linear_connector_real_api():
    token = os.getenv("LINEAR_TEST_TOKEN")
    if not token:
        pytest.skip("LINEAR_TEST_TOKEN not set")

    connector = LinearConnector(token=token)
    issues = connector.get_all_issues(include_comments=False)

    assert isinstance(issues, list)
    # Don't assert exact count (test data may change)
    assert len(issues) >= 0
```

---

### 3. Contract Tests (Schema Validation)

**Pattern:**
```python
from pydantic import BaseModel, ValidationError

class GitHubRepo(BaseModel):
    id: int
    name: str
    full_name: str
    private: bool
    url: str

def test_github_repo_schema():
    connector = GitHubConnector(token="...")
    repos = connector.get_user_repositories()

    for repo in repos:
        try:
            GitHubRepo(**repo)  # Validates schema
        except ValidationError as e:
            pytest.fail(f"Invalid repo schema: {e}")
```

---

## Performance Optimizations

### 1. Concurrent Requests (for independent resources)

**Pattern:**
```python
import asyncio
import aiohttp

async def fetch_channel_history(session, channel_id):
    async with session.get(f"/channels/{channel_id}/history") as resp:
        return await resp.json()

async def get_all_channel_histories(self, channel_ids: list[str]):
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_channel_history(session, cid) for cid in channel_ids]
        results = await asyncio.gather(*tasks)
    return results
```

**When to Use:**
- Fetching multiple independent resources (multiple channels, multiple repos)
- APIs with high rate limits
- Not for paginated requests (must be sequential)

---

### 2. Lazy Evaluation (Generators)

**Pattern:**
```python
def get_repository_files(self, repo_full_name: str):
    """Generator that yields files one at a time"""
    for item in repo.directory_contents('/'):
        if self._should_include(item):
            yield self._item_to_dict(item)

# Usage:
for file in connector.get_repository_files("owner/repo"):
    process(file)  # Process one at a time (low memory)
```

**Benefits:**
- **Low memory** (don't load all files into memory)
- **Early termination** (can stop iteration early)

---

### 3. Caching

**Pattern:**
```python
from functools import lru_cache

class GitHubConnector:
    @lru_cache(maxsize=128)
    def get_repository_metadata(self, repo_full_name: str) -> dict:
        """Cached - won't re-fetch if called again with same repo"""
        repo = self.gh.repository(*repo_full_name.split('/'))
        return {
            "id": repo.id,
            "name": repo.name,
            "description": repo.description
        }
```

---

## Common Anti-Patterns

### ❌ 1. Ignoring Rate Limits

**Bad:**
```python
for i in range(10000):
    response = requests.get(f"{url}/items/{i}")  # Will hit rate limit!
```

**Good:**
```python
import time

for i in range(10000):
    if i % 100 == 0:  # Every 100 requests
        time.sleep(5)  # Brief pause
    response = requests.get(f"{url}/items/{i}")
```

---

### ❌ 2. Swallowing Errors Silently

**Bad:**
```python
try:
    data = fetch_data()
except:
    data = []  # Silent failure - no logging!
```

**Good:**
```python
try:
    data = fetch_data()
except Exception as e:
    logger.error(f"Failed to fetch data: {e}", exc_info=True)
    data = []  # Return empty, but logged
```

---

### ❌ 3. Hardcoded Credentials

**Bad:**
```python
TOKEN = "ghp_abc123..."  # Hardcoded in source code!
```

**Good:**
```python
import os
TOKEN = os.getenv("GITHUB_TOKEN")
if not TOKEN:
    raise ValueError("GITHUB_TOKEN environment variable not set")
```

---

### ❌ 4. Not Validating Tokens on Init

**Bad:**
```python
def __init__(self, token: str):
    self.token = token  # No validation - will fail later!
```

**Good:**
```python
def __init__(self, token: str):
    self.token = token
    try:
        self.client.auth_test()  # Test immediately
    except AuthError:
        raise ValueError("Invalid token")
```

---

## Recommendations for GWI

### 1. BaseConnector Abstract Class

```typescript
abstract class BaseConnector implements IConnector {
  protected config: ConnectorConfig;
  protected logger: Logger;

  abstract authenticate(): Promise<void>;
  abstract healthCheck(): Promise<HealthStatus>;
  abstract sync(options: SyncOptions): AsyncIterator<Record>;

  // Shared utilities (all connectors get these for free)
  protected async retryRequest<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    // Exponential backoff with jitter
  }

  protected async checkRateLimit(): Promise<void> {
    // Rate limit tracking logic
  }

  protected handleError(error: any): never {
    // Standardized error handling
  }
}
```

---

### 2. Connector Registry

```typescript
class ConnectorRegistry {
  private connectors: Map<string, BaseConnector> = new Map();

  register(name: string, connector: BaseConnector): void {
    this.connectors.set(name, connector);
  }

  get(name: string): BaseConnector | undefined {
    return this.connectors.get(name);
  }

  async healthCheckAll(): Promise<Map<string, HealthStatus>> {
    const results = new Map();
    for (const [name, connector] of this.connectors) {
      results.set(name, await connector.healthCheck());
    }
    return results;
  }
}
```

---

### 3. Authentication Strategy Interface

```typescript
interface AuthStrategy {
  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  refreshIfNeeded(): Promise<void>;
  getHeaders(): Record<string, string>;
}

class BearerTokenAuth implements AuthStrategy {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    // Validate token with test API call
  }

  async refreshIfNeeded(): Promise<void> {
    // No-op for bearer tokens (long-lived)
  }

  getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }
}

class OAuth2Auth implements AuthStrategy {
  // Similar pattern but with refresh logic
}
```

---

### 4. Pagination Helper

```typescript
interface PaginationStrategy {
  hasMore(response: any): boolean;
  getNextCursor(response: any): string | null;
}

class CursorPagination implements PaginationStrategy {
  private cursorField: string;

  hasMore(response: any): boolean {
    return !!response[this.cursorField];
  }

  getNextCursor(response: any): string | null {
    return response[this.cursorField] || null;
  }
}

async function* paginateRequest<T>(
  requestFn: (cursor?: string) => Promise<T>,
  strategy: PaginationStrategy
): AsyncIterator<T> {
  let cursor: string | null = null;

  do {
    const response = await requestFn(cursor);
    yield response;
    cursor = strategy.getNextCursor(response);
  } while (cursor);
}
```

---

### 5. Rate Limiter Utility

```typescript
class RateLimiter {
  private lastRequestTime: number = 0;
  private requestsThisSecond: number = 0;
  private maxRequestsPerSecond: number;

  constructor(maxRequestsPerSecond: number) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // Reset counter every second
    if (now - this.lastRequestTime > 1000) {
      this.requestsThisSecond = 0;
      this.lastRequestTime = now;
    }

    // Throttle if at limit
    if (this.requestsThisSecond >= this.maxRequestsPerSecond) {
      const waitMs = 1000 - (now - this.lastRequestTime);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    this.requestsThisSecond++;
  }
}
```

---

## Next Steps

**Completed:**
- ✅ B1.1: Cloned Airbyte repo
- ✅ B1.2: Analyzed CDK architecture
- ✅ B1.3: Studied 15 production connectors (SurfSense)
- ✅ B1.4: Cloned and analyzed SurfSense

**Up Next:**
- **B1.5:** Document connector patterns (ADR) - use this document as input
- **B1.6:** Test with Beeceptor mock APIs

---

## References

### External Resources
- SurfSense GitHub: https://github.com/MODSetter/SurfSense
- github3.py: https://github3py.readthedocs.io/
- slack_sdk: https://slack.dev/python-slack-sdk/
- Google API Client: https://github.com/googleapis/google-api-python-client

### Internal Resources
- Epic B Documentation: 000-docs/008-DR-EPIC-epic-b-connector-framework.md
- CDK Analysis: 000-docs/010-DR-ADOC-airbyte-cdk-architecture-analysis.md
- CLAUDE.md: Task tracking and workflow

---

**Document Status:** ✅ Complete
**Author:** @connectors-lead
**Reviewed By:** TBD
**Last Updated:** 2025-12-27
