# GitHub Connector

Reference implementation for the GWI Connector Framework.

## Overview

The GitHub Connector provides integration with GitHub's REST and GraphQL APIs for synchronizing repositories, pull requests, issues, and handling webhooks.

## Features

- **Authentication**: Bearer token, OAuth2, and GitHub App authentication
- **REST API**: Full access to GitHub's REST API via Octokit
- **GraphQL API**: Direct GraphQL query support
- **Webhooks**: Process GitHub webhook events
- **Pagination**: Automatic pagination for large datasets
- **Health Checks**: API connectivity, rate limit, and auth verification

## Installation

```typescript
import { GitHubConnector, ConnectorRegistry } from '@gwi/connectors';
```

## Usage

### Basic Authentication (Personal Access Token)

```typescript
import { GitHubConnector, ConsoleLogger, NoOpMetrics } from '@gwi/connectors';

const connector = new GitHubConnector(
  new ConsoleLogger({ service: 'github' }),
  new NoOpMetrics()
);

await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: process.env.GITHUB_TOKEN
  }
});
```

### OAuth2 Authentication

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'oauth2',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: 'https://myapp.com/callback',
    accessToken: 'user-access-token'
  }
});
```

### GitHub App Authentication

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'app',
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
    installationId: 'installation-123'
  }
});
```

## API Reference

### `authenticate(config: GitHubConnectorConfig): Promise<AuthResult>`

Authenticate with GitHub using the specified configuration.

### `healthCheck(): Promise<HealthStatus>`

Check API connectivity, rate limits, and authentication status.

### `getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest>`

Fetch a single pull request with full details.

### `getIssue(owner: string, repo: string, number: number): Promise<GitHubIssue>`

Fetch a single issue with full details.

### `getPullRequestFiles(owner: string, repo: string, number: number): Promise<GitHubFileChange[]>`

Get the list of files changed in a pull request.

### `getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string>`

Get the content of a file from a repository.

### `createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<number>`

Create a comment on an issue or pull request.

### `addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void>`

Add labels to an issue or pull request.

### `graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>`

Execute a GraphQL query against the GitHub API.

### `sync(options: SyncOptions): AsyncGenerator<SyncRecord>`

Sync records from GitHub repositories.

### `processWebhook(event: WebhookEvent): Promise<WebhookResult>`

Process incoming GitHub webhook events.

## Supported Record Types

| Type | Description |
|------|-------------|
| `repository` | Repository metadata |
| `pull_request` | Pull request details |
| `issue` | Issue details |
| `commit` | Commit history |
| `branch` | Branch information |
| `release` | Release tags |
| `workflow_run` | GitHub Actions runs |
| `check_run` | Status checks |
| `comment` | PR/Issue comments |
| `review` | PR reviews |
| `user` | User profiles |

## Webhook Events

The connector processes these webhook event types:

- `push` - Code pushes
- `pull_request` - PR lifecycle events
- `pull_request_review` - PR review submissions
- `issues` - Issue lifecycle events
- `issue_comment` - Comments on issues/PRs
- `check_run` / `check_suite` - CI status updates
- `workflow_run` - GitHub Actions events
- `release` - Release publications

## Rate Limits

GitHub API has the following limits:

- **Authenticated requests**: 5,000/hour
- **GraphQL**: 5,000 points/hour
- **Search API**: 30 requests/minute

The connector automatically tracks rate limits via health checks.

## Error Handling

```typescript
import { ConnectorError, AuthenticationError, RateLimitError } from '@gwi/connectors';

try {
  await connector.authenticate(config);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid credentials');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, retry after:', error.retryAfter);
  }
}
```

## Configuration Options

```typescript
interface GitHubConnectorConfig {
  tenantId: string;
  auth: GitHubAuthConfig;
  baseUrl?: string;        // For GitHub Enterprise
  timeout?: number;        // Request timeout (default: 30000ms)
  headers?: Record<string, string>;
  rateLimit?: {
    maxRequestsPerSecond: number;
    maxRequestsPerHour: number;
    maxConcurrentRequests: number;
  };
}
```

## GitHub Enterprise

For GitHub Enterprise Server, specify the `baseUrl`:

```typescript
await connector.authenticate({
  tenantId: 'enterprise-tenant',
  auth: { type: 'bearer', token: 'ghe-token' },
  baseUrl: 'https://github.mycompany.com/api/v3'
});
```

## Registry Integration

Register the connector with the framework registry:

```typescript
import { ConnectorRegistry, GitHubConnector, ConsoleLogger, NoOpMetrics } from '@gwi/connectors';

const registry = new ConnectorRegistry();

registry.register('github', (config) => {
  const connector = new GitHubConnector(
    new ConsoleLogger({ service: 'github' }),
    new NoOpMetrics()
  );
  return connector;
});

// Get connector instance
const github = await registry.get('github', {
  tenantId: 'my-tenant',
  config: {
    tenantId: 'my-tenant',
    auth: { type: 'bearer', token: process.env.GITHUB_TOKEN }
  }
});
```
