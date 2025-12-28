# GitLab Connector

Full-featured connector for GitLab API integration with support for:
- Projects, merge requests, issues, commits
- Personal Access Token (PAT) and OAuth 2.0 authentication
- Webhook processing
- Pagination and rate limiting
- Self-hosted GitLab instances

## Installation

```bash
npm install @gwi/connectors
```

## Quick Start

### Basic Usage with PAT

```typescript
import { GitLabConnector } from '@gwi/connectors/gitlab';
import { ConsoleLogger, NoOpMetrics } from '@gwi/connectors/core';

const connector = new GitLabConnector(
  new ConsoleLogger({ service: 'gitlab' }),
  new NoOpMetrics()
);

await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: process.env.GITLAB_TOKEN // Your GitLab PAT
  }
});

// Check health
const health = await connector.healthCheck();
console.log(health);
```

### Sync Merge Requests

```typescript
for await (const record of connector.sync({
  projects: ['group/project', 'another-group/another-project'],
  recordTypes: ['merge_request'],
  state: 'opened',
  limit: 50
})) {
  console.log(record.type, record.id, record.data);
}
```

### Sync Issues

```typescript
for await (const record of connector.sync({
  projects: ['group/project'],
  recordTypes: ['issue'],
  state: 'opened',
  labels: ['bug', 'critical'],
  updatedAfter: '2024-01-01T00:00:00Z'
})) {
  console.log(record.type, record.id, record.data);
}
```

### Get Specific Resources

```typescript
// Get project details
const project = await connector.getProject('group%2Fproject');

// Get merge request
const mr = await connector.getMergeRequest('group%2Fproject', 123);

// Get merge request changes (file diffs)
const changes = await connector.getMergeRequestChanges('group%2Fproject', 123);

// Get issue
const issue = await connector.getIssue('group%2Fproject', 456);
```

### Add Comments and Labels

```typescript
// Create comment on MR
await connector.createComment(
  'group%2Fproject',
  'merge_requests',
  123,
  'This looks good to me!'
);

// Add labels to issue
await connector.addLabels(
  'group%2Fproject',
  'issues',
  456,
  ['reviewed', 'approved']
);
```

## Authentication

### Personal Access Token (PAT)

Create a PAT at https://gitlab.com/-/profile/personal_access_tokens with scopes:
- `api` - Full API access
- `read_api` - Read-only API access (if write operations not needed)
- `read_user` - Read user information

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: 'glpat-xxxxxxxxxxxx'
  }
});
```

### OAuth 2.0

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'oauth2',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'https://your-app.com/callback',
    accessToken: 'current-access-token',
    refreshToken: 'refresh-token'
  }
});
```

### Self-Hosted GitLab

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: 'your-token'
  },
  baseUrl: 'https://gitlab.example.com/api/v4'
});
```

## Sync Options

### GitLabSyncOptions

| Option | Type | Description |
|--------|------|-------------|
| `projects` | `string[]` | Projects to sync (e.g., `['group/project']`) |
| `recordTypes` | `GitLabRecordType[]` | Types to sync: `project`, `merge_request`, `issue`, etc. |
| `state` | `'opened' \| 'closed' \| 'merged' \| 'all'` | Filter by state |
| `updatedAfter` | `string` | ISO 8601 timestamp - only records updated after this |
| `createdAfter` | `string` | ISO 8601 timestamp - only records created after this |
| `orderBy` | `'created_at' \| 'updated_at'` | Sort field |
| `sort` | `'asc' \| 'desc'` | Sort direction |
| `limit` | `number` | Max records to fetch |
| `includeChanges` | `boolean` | Include file diffs for MRs |
| `includeCommits` | `boolean` | Include commit history |
| `scope` | `string` | Scope filter (e.g., `'created_by_me'`, `'assigned_to_me'`) |
| `labels` | `string[]` | Filter by labels |

## Project Identifiers

GitLab uses two formats for project identifiers:

1. **Numeric ID**: `123456`
2. **Path with namespace**: `group/project` (must be URL-encoded: `group%2Fproject`)

Always URL-encode project paths before passing to API methods:

```typescript
const encodedProject = encodeURIComponent('group/project');
const mr = await connector.getMergeRequest(encodedProject, 123);
```

## Webhook Processing

```typescript
const result = await connector.processWebhook({
  id: 'webhook-123',
  source: 'gitlab',
  type: 'merge_request',
  timestamp: new Date().toISOString(),
  signature: 'webhook-signature',
  headers: {},
  payload: {
    object_kind: 'merge_request',
    project: {
      id: 123,
      name: 'my-project',
      path_with_namespace: 'group/project',
      namespace: 'group'
    },
    user: {
      id: 456,
      username: 'johndoe',
      name: 'John Doe',
      email: 'john@example.com'
    },
    object_attributes: {
      id: 789,
      iid: 12,
      title: 'Fix bug',
      state: 'opened',
      target_branch: 'main',
      source_branch: 'fix-bug'
    }
  }
});

console.log(result.success, result.recordsProcessed);
```

## Registry Usage

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { registerGitLabConnector } from '@gwi/connectors/gitlab';

const registry = new ConnectorRegistry();
registerGitLabConnector(registry);

const connector = await registry.create('gitlab', {
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: process.env.GITLAB_TOKEN
  }
});

// Connector is already authenticated
for await (const record of connector.sync({ ... })) {
  console.log(record);
}
```

## Rate Limiting

GitLab enforces rate limits:
- **Default**: 10 requests/second
- **Total**: ~36,000 requests/hour

The connector automatically:
- Retries on rate limit errors (429)
- Respects `RateLimit-*` headers
- Implements exponential backoff

Override defaults:

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: { type: 'bearer', token: 'token' },
  rateLimit: {
    maxRequestsPerSecond: 5,
    maxRequestsPerHour: 18000,
    maxConcurrentRequests: 3
  }
});
```

## Pagination

GitLab uses header-based pagination:
- `X-Page` - Current page
- `X-Next-Page` - Next page number
- `X-Per-Page` - Items per page
- `X-Total` - Total items
- `X-Total-Pages` - Total pages

The connector handles pagination automatically:

```typescript
// Fetches all merge requests across all pages
for await (const record of connector.sync({
  projects: ['group/project'],
  recordTypes: ['merge_request']
})) {
  console.log(record);
}
```

## Error Handling

```typescript
import { AuthenticationError, ConnectorError, ValidationError } from '@gwi/connectors/errors';

try {
  await connector.authenticate(config);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Auth failed:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Invalid config:', error.validationErrors);
  } else if (error instanceof ConnectorError) {
    console.error('Connector error:', error.message);
  }
}
```

## Record Types

Supported GitLab record types:

- `project` - GitLab projects/repositories
- `merge_request` - Merge requests (GitLab's version of PRs)
- `issue` - Issues
- `commit` - Git commits
- `branch` - Git branches
- `release` - Project releases
- `pipeline` - CI/CD pipelines
- `job` - CI/CD jobs
- `comment` - Comments/notes
- `user` - GitLab users

## Metadata

```typescript
const metadata = connector.getMetadata();
console.log(metadata.name);           // 'gitlab'
console.log(metadata.version);        // '1.0.0'
console.log(metadata.recordTypes);    // ['project', 'merge_request', ...]
console.log(metadata.authMethods);    // ['bearer', 'oauth2']
console.log(metadata.capabilities);   // ['sync', 'webhook', 'write_comments', ...]
```

## Differences from GitHub Connector

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **MR/PR term** | `pull_request` | `merge_request` |
| **Project ID** | `owner/repo` | `group/project` (URL-encoded) or numeric ID |
| **Auth header** | `Authorization: Bearer` | `PRIVATE-TOKEN` (PAT) or `Authorization: Bearer` (OAuth) |
| **Pagination** | Link headers | `X-Page`, `X-Next-Page` headers |
| **Draft PRs** | `draft: boolean` | `draft: boolean` + `work_in_progress: boolean` |
| **API SDK** | Octokit (official) | Axios (no official SDK) |

## TypeScript Support

Full TypeScript support with strict types:

```typescript
import type {
  GitLabMergeRequest,
  GitLabIssue,
  GitLabProject,
  GitLabSyncOptions
} from '@gwi/connectors/gitlab';

const options: GitLabSyncOptions = {
  projects: ['group/project'],
  recordTypes: ['merge_request'],
  state: 'opened'
};

const mr: GitLabMergeRequest = await connector.getMergeRequest(
  'group%2Fproject',
  123
);
```

## Documentation

- [GitLab REST API Docs](https://docs.gitlab.com/ee/api/)
- [GitLab Authentication](https://docs.gitlab.com/ee/api/#authentication)
- [GitLab Webhooks](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html)
- [GitLab Rate Limits](https://docs.gitlab.com/ee/user/admin_area/settings/rate_limits.html)
