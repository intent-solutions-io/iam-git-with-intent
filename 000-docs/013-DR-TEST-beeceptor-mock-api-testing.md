# Beeceptor Mock API Testing Guide

**Document ID:** 013-DR-TEST
**Date:** 2025-12-27
**Epic:** B (Data Ingestion & Connector Framework)
**Story:** B1 (Study Existing Connector Patterns)
**Task:** B1.6 (Test with Beeceptor mock APIs)
**Status:** Complete

---

## Purpose

This document provides a comprehensive guide for testing connector implementations using Beeceptor mock APIs. Mock testing enables:

1. **Fast iteration** - No API rate limits, instant responses
2. **Deterministic tests** - Predictable responses for edge cases
3. **Offline development** - Test without internet connectivity
4. **Error scenario testing** - Simulate 401, 403, 429, 500 errors
5. **Pagination testing** - Verify cursor/offset pagination logic
6. **Auth flow testing** - Test OAuth and token authentication

---

## Table of Contents

1. [Beeceptor Setup](#beeceptor-setup)
2. [Mock Endpoint Definitions](#mock-endpoint-definitions)
3. [Authentication Testing](#authentication-testing)
4. [Pagination Testing](#pagination-testing)
5. [Error Response Testing](#error-response-testing)
6. [Rate Limiting Testing](#rate-limiting-testing)
7. [Integration Test Examples](#integration-test-examples)
8. [Best Practices](#best-practices)

---

## Beeceptor Setup

### Creating a Mock Endpoint

1. Go to https://beeceptor.com
2. Create new endpoint: `https://my-test-api.free.beeceptor.com`
3. Define rules for different paths

### Alternative: Local Mock Server

```bash
# Install beeceptor-cli (if available) or use json-server
npm install -g json-server

# Create db.json
cat > db.json <<'EOF'
{
  "users": [
    {"id": 1, "name": "Alice", "email": "alice@example.com"},
    {"id": 2, "name": "Bob", "email": "bob@example.com"}
  ],
  "repos": [
    {"id": 101, "name": "repo-1", "owner": "Alice"},
    {"id": 102, "name": "repo-2", "owner": "Bob"}
  ]
}
EOF

# Run server
json-server --watch db.json --port 3000
# http://localhost:3000/users
# http://localhost:3000/repos
```

---

## Mock Endpoint Definitions

### Endpoint 1: GET /users (Success Response)

**Request:**
```http
GET /users HTTP/1.1
Host: my-test-api.free.beeceptor.com
Authorization: Bearer mock-token-123
```

**Response:**
```json
{
  "data": [
    {
      "id": "user-1",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-12-27T10:00:00Z"
    },
    {
      "id": "user-2",
      "name": "Bob Smith",
      "email": "bob@example.com",
      "created_at": "2025-01-02T00:00:00Z",
      "updated_at": "2025-12-27T11:00:00Z"
    }
  ]
}
```

---

### Endpoint 2: GET /repos (Paginated Response - Cursor)

**First Page Request:**
```http
GET /repos?limit=2 HTTP/1.1
Host: my-test-api.free.beeceptor.com
Authorization: Bearer mock-token-123
```

**First Page Response:**
```json
{
  "data": [
    {
      "id": "repo-1",
      "name": "awesome-project",
      "owner": "alice",
      "updated_at": "2025-12-20T00:00:00Z"
    },
    {
      "id": "repo-2",
      "name": "cool-tool",
      "owner": "bob",
      "updated_at": "2025-12-21T00:00:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "eyJpZCI6InJlcG8tMiJ9",
    "has_more": true
  }
}
```

**Second Page Request:**
```http
GET /repos?limit=2&cursor=eyJpZCI6InJlcG8tMiJ9 HTTP/1.1
Host: my-test-api.free.beeceptor.com
Authorization: Bearer mock-token-123
```

**Second Page Response:**
```json
{
  "data": [
    {
      "id": "repo-3",
      "name": "test-framework",
      "owner": "alice",
      "updated_at": "2025-12-22T00:00:00Z"
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

---

### Endpoint 3: GET /issues (Paginated Response - Offset)

**Request:**
```http
GET /issues?limit=10&offset=0 HTTP/1.1
Host: my-test-api.free.beeceptor.com
```

**Response:**
```json
{
  "issues": [
    {"id": 1, "title": "Bug in login", "state": "open"},
    {"id": 2, "title": "Feature request", "state": "closed"}
  ],
  "pagination": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "has_more": true
  }
}
```

---

### Endpoint 4: POST /webhooks (Webhook Simulation)

**Request:**
```http
POST /webhooks HTTP/1.1
Host: my-test-api.free.beeceptor.com
Content-Type: application/json
X-Hub-Signature-256: sha256=abc123...
X-GitHub-Event: pull_request

{
  "action": "opened",
  "pull_request": {
    "id": 123,
    "number": 42,
    "title": "Add new feature",
    "state": "open",
    "user": {"login": "alice"}
  }
}
```

**Response:**
```json
{
  "status": "received",
  "event_id": "evt_123456"
}
```

---

## Authentication Testing

### Test 1: Valid Bearer Token

**Mock Rule:**
```javascript
// Beeceptor rule
if (request.headers.authorization === 'Bearer valid-token-123') {
  return {
    status: 200,
    body: { user: { id: 1, name: 'Alice' } }
  };
}
```

**Test Code:**
```typescript
test('authenticates with valid bearer token', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    token: 'valid-token-123'
  });

  await connector.authenticate();
  const user = await connector.getCurrentUser();

  expect(user.name).toBe('Alice');
});
```

---

### Test 2: Invalid Token (401)

**Mock Rule:**
```javascript
if (request.headers.authorization !== 'Bearer valid-token-123') {
  return {
    status: 401,
    body: { error: 'Invalid or expired token' }
  };
}
```

**Test Code:**
```typescript
test('throws error on invalid token', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    token: 'invalid-token'
  });

  await expect(connector.authenticate()).rejects.toThrow('Invalid or expired token');
});
```

---

### Test 3: OAuth Token Refresh

**Mock OAuth Endpoint:**
```http
POST /oauth/token HTTP/1.1
Host: my-test-api.free.beeceptor.com
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=refresh-abc123
```

**Response:**
```json
{
  "access_token": "new-access-token-456",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "new-refresh-token-def789"
}
```

**Test Code:**
```typescript
test('refreshes OAuth token when expired', async () => {
  const connector = new OAuth2Connector({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    refreshToken: 'refresh-abc123',
    tokenUrl: 'https://my-test-api.free.beeceptor.com/oauth/token'
  });

  const token = await connector.refreshAccessToken();

  expect(token.access_token).toBe('new-access-token-456');
  expect(token.refresh_token).toBe('new-refresh-token-def789');
});
```

---

## Pagination Testing

### Test 4: Cursor-Based Pagination

**Test Code:**
```typescript
test('paginates through all pages using cursors', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  const allRepos: Repo[] = [];
  let cursor: string | null = null;

  do {
    const response = await connector.getRepos({ cursor, limit: 2 });
    allRepos.push(...response.data);
    cursor = response.pagination.next_cursor;
  } while (cursor);

  expect(allRepos).toHaveLength(3); // Total repos across all pages
  expect(allRepos[0].id).toBe('repo-1');
  expect(allRepos[2].id).toBe('repo-3');
});
```

---

### Test 5: Offset-Based Pagination

**Test Code:**
```typescript
test('paginates through all pages using offset', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  const allIssues: Issue[] = [];
  let offset = 0;
  const limit = 10;

  while (true) {
    const response = await connector.getIssues({ offset, limit });
    allIssues.push(...response.issues);

    if (!response.pagination.has_more) break;
    offset += limit;
  }

  expect(allIssues).toHaveLength(25); // Total issues
});
```

---

### Test 6: Link Header Pagination (GitHub Style)

**Mock Response with Link Header:**
```http
HTTP/1.1 200 OK
Link: <https://my-test-api.free.beeceptor.com/repos?page=2>; rel="next",
      <https://my-test-api.free.beeceptor.com/repos?page=5>; rel="last"
Content-Type: application/json

[
  {"id": 1, "name": "repo-1"},
  {"id": 2, "name": "repo-2"}
]
```

**Test Code:**
```typescript
test('follows Link header for pagination', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  const allRepos: Repo[] = [];
  let nextUrl: string | null = '/repos';

  while (nextUrl) {
    const response = await connector.fetchUrl(nextUrl);
    allRepos.push(...response.data);

    const linkHeader = response.headers.get('Link');
    nextUrl = parseLinkHeader(linkHeader)?.next || null;
  }

  expect(allRepos.length).toBeGreaterThan(2);
});
```

---

## Error Response Testing

### Test 7: 401 Unauthorized

**Mock Response:**
```json
{
  "status": 401,
  "body": {
    "error": "Unauthorized",
    "message": "Invalid or expired token"
  }
}
```

**Test Code:**
```typescript
test('handles 401 unauthorized error', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    token: 'expired-token'
  });

  await expect(connector.getRepos()).rejects.toThrow(AuthenticationError);
});
```

---

### Test 8: 403 Forbidden (Insufficient Permissions)

**Mock Response:**
```json
{
  "status": 403,
  "body": {
    "error": "Forbidden",
    "message": "Insufficient permissions to access this resource"
  }
}
```

**Test Code:**
```typescript
test('handles 403 forbidden error', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    token: 'readonly-token'
  });

  await expect(connector.deleteRepo('repo-1')).rejects.toThrow(PermissionError);
});
```

---

### Test 9: 404 Not Found

**Mock Response:**
```json
{
  "status": 404,
  "body": {
    "error": "Not Found",
    "message": "Repository not found"
  }
}
```

**Test Code:**
```typescript
test('handles 404 not found error', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  await expect(connector.getRepo('nonexistent-repo')).rejects.toThrow(NotFoundError);
});
```

---

### Test 10: 500 Internal Server Error

**Mock Response:**
```json
{
  "status": 500,
  "body": {
    "error": "Internal Server Error",
    "message": "An unexpected error occurred"
  }
}
```

**Test Code:**
```typescript
test('handles 500 server error with retry', async () => {
  let attemptCount = 0;

  // Mock that fails twice, then succeeds
  const mockFetch = jest.fn(async () => {
    attemptCount++;
    if (attemptCount < 3) {
      return { status: 500, json: async () => ({ error: 'Server error' }) };
    }
    return { status: 200, json: async () => ({ data: [] }) };
  });

  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    fetch: mockFetch,
    maxRetries: 3
  });

  const repos = await connector.getRepos();

  expect(attemptCount).toBe(3); // 2 failures + 1 success
  expect(repos.data).toEqual([]);
});
```

---

## Rate Limiting Testing

### Test 11: 429 Rate Limit with Retry-After

**Mock Response:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit. Please try again in 60 seconds."
}
```

**Test Code:**
```typescript
test('respects Retry-After header on 429', async () => {
  const sleepSpy = jest.spyOn(global, 'setTimeout');
  let attemptCount = 0;

  const mockFetch = jest.fn(async () => {
    attemptCount++;
    if (attemptCount === 1) {
      return {
        status: 429,
        headers: new Headers({ 'Retry-After': '60' }),
        json: async () => ({ error: 'Rate limit exceeded' })
      };
    }
    return {
      status: 200,
      json: async () => ({ data: [] })
    };
  });

  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    fetch: mockFetch
  });

  await connector.getRepos();

  expect(sleepSpy).toHaveBeenCalledWith(60000, expect.any(Function)); // 60 seconds
  expect(attemptCount).toBe(2); // 1 rate limit + 1 success
});
```

---

### Test 12: Rate Limiter Prevents Hitting Limits

**Test Code:**
```typescript
test('rate limiter prevents exceeding limits', async () => {
  const rateLimiter = new RateLimiter({ maxRequestsPerSecond: 5 });

  const startTime = Date.now();

  // Make 10 requests (should take ~2 seconds with limit of 5/sec)
  for (let i = 0; i < 10; i++) {
    await rateLimiter.waitIfNeeded();
  }

  const elapsedMs = Date.now() - startTime;

  expect(elapsedMs).toBeGreaterThanOrEqual(1000); // At least 1 second
  expect(elapsedMs).toBeLessThan(3000); // But not too slow
});
```

---

## Integration Test Examples

### Test 13: Full Sync Workflow

**Test Code:**
```typescript
test('full sync workflow: auth → paginate → store', async () => {
  const connector = new GitHubConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com',
    token: 'valid-token-123'
  });

  // Authenticate
  await connector.authenticate();

  // Sync all repos
  const repos: Repo[] = [];
  for await (const repo of connector.sync({ resource: 'repos' })) {
    repos.push(repo);
  }

  expect(repos.length).toBeGreaterThan(0);
  expect(repos[0]).toMatchObject({
    id: expect.any(String),
    name: expect.any(String),
    updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
  });
});
```

---

### Test 14: Incremental Sync (Date Range)

**Mock Request:**
```http
GET /repos?since=2025-12-25T00:00:00Z HTTP/1.1
```

**Test Code:**
```typescript
test('incremental sync fetches only new/updated items', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  const lastSyncTime = '2025-12-25T00:00:00Z';

  const repos = await connector.getRepos({
    since: lastSyncTime,
    sortBy: 'updated_at',
    direction: 'desc'
  });

  // All repos should be updated after lastSyncTime
  for (const repo of repos.data) {
    expect(new Date(repo.updated_at).getTime()).toBeGreaterThan(
      new Date(lastSyncTime).getTime()
    );
  }
});
```

---

### Test 15: Webhook Signature Verification

**Test Code:**
```typescript
import crypto from 'crypto';

test('verifies webhook HMAC signature', () => {
  const secret = 'webhook-secret-123';
  const payload = JSON.stringify({
    action: 'opened',
    pull_request: { id: 123 }
  });

  // Generate signature (server-side)
  const signature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  // Verify signature (connector-side)
  const connector = new GitHubConnector({ webhookSecret: secret });
  const isValid = connector.verifyWebhookSignature(payload, signature);

  expect(isValid).toBe(true);
});

test('rejects webhook with invalid signature', () => {
  const connector = new GitHubConnector({ webhookSecret: 'webhook-secret-123' });

  const payload = '{"action":"opened"}';
  const fakeSignature = 'sha256=fakehash123';

  const isValid = connector.verifyWebhookSignature(payload, fakeSignature);

  expect(isValid).toBe(false);
});
```

---

## Best Practices

### 1. Use Realistic Mock Data

❌ **Bad:**
```json
{"id": 1, "name": "test"}
```

✅ **Good:**
```json
{
  "id": "repo-abc-123",
  "name": "awesome-project",
  "owner": {
    "id": "user-456",
    "login": "alice",
    "avatar_url": "https://example.com/avatar.png"
  },
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-12-27T10:00:00Z",
  "stargazers_count": 42,
  "language": "TypeScript"
}
```

---

### 2. Test Edge Cases

- **Empty responses:** `{"data": []}`
- **Null values:** `{"description": null}`
- **Missing fields:** `{"id": 1}` (no name)
- **Large datasets:** Paginate 1000+ items
- **Unicode characters:** Names with emoji, Chinese, Arabic

---

### 3. Simulate Network Delays

```typescript
test('handles slow API responses', async () => {
  const mockFetch = jest.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5s delay
    return { status: 200, json: async () => ({ data: [] }) };
  });

  const connector = new MockConnector({
    fetch: mockFetch,
    timeout: 10000 // 10s timeout
  });

  const repos = await connector.getRepos();
  expect(repos.data).toEqual([]);
});
```

---

### 4. Test Concurrent Requests

```typescript
test('handles concurrent requests safely', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  // Fire 10 requests concurrently
  const promises = Array.from({ length: 10 }, (_, i) =>
    connector.getRepo(`repo-${i}`)
  );

  const results = await Promise.all(promises);

  expect(results).toHaveLength(10);
  expect(results.every(r => r.id)).toBe(true);
});
```

---

### 5. Verify Schema Compliance

```typescript
import { z } from 'zod';

const RepoSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  created_at: z.string(),
  updated_at: z.string()
});

test('API response matches schema', async () => {
  const connector = new MockConnector({
    baseUrl: 'https://my-test-api.free.beeceptor.com'
  });

  const repos = await connector.getRepos();

  for (const repo of repos.data) {
    expect(() => RepoSchema.parse(repo)).not.toThrow();
  }
});
```

---

## Summary

### Test Coverage Matrix

| Test Category | Tests | Coverage |
|---------------|-------|----------|
| Authentication | 3 | Bearer token, OAuth, expiration |
| Pagination | 3 | Cursor, offset, link header |
| Error Handling | 4 | 401, 403, 404, 500 |
| Rate Limiting | 2 | 429 retry, proactive limiting |
| Integration | 3 | Full sync, incremental, webhooks |
| **Total** | **15** | **Comprehensive** |

### Key Takeaways

✅ **Mock testing is essential** for rapid connector development

✅ **Beeceptor/json-server** provide free, easy mock endpoints

✅ **Test edge cases** (empty, null, errors) to build robust connectors

✅ **Verify schemas** to prevent breaking downstream consumers

✅ **Simulate rate limits** to ensure production resilience

---

## Next Steps

**Completed:**
- ✅ B1.6: Beeceptor mock testing guide

**Up Next:**
- **Story B2:** Design Core Connector Framework (3 days)
  - B2.1: Design connector abstraction layer
  - B2.2: Define IConnector interface
  - B2.3: Design authentication strategy
  - B2.4: Design webhook receiver architecture
  - B2.5: Create connector registry system
  - B2.6: Document architecture decisions (already done in 012-DR-ADRC)

---

## References

### Tools
- Beeceptor: https://beeceptor.com
- json-server: https://github.com/typicode/json-server
- RequestBin: https://requestbin.com
- Webhook.site: https://webhook.site

### Testing Libraries
- Jest: https://jestjs.io
- Vitest: https://vitest.dev
- Zod: https://zod.dev

### Internal Docs
- 012-DR-ADRC-connector-framework-architecture-decision.md (ADR)
- 011-DR-PATT-production-connector-patterns.md (Patterns analysis)
- 010-DR-ADOC-airbyte-cdk-architecture-analysis.md (CDK study)

---

**Document Status:** ✅ Complete
**Author:** @connectors-lead
**Last Updated:** 2025-12-27
