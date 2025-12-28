# Linear Connector

GraphQL-based connector for [Linear](https://linear.app) issue tracking and project management.

## Features

- **Authentication**: API Key and OAuth 2.0 support
- **GraphQL API**: Full GraphQL API integration with cursor-based pagination
- **Record Types**: Issues, Projects, Teams, Cycles, Labels, Users, Comments, Workflow States
- **Webhooks**: Real-time event processing for Issues, Projects, Comments, Labels, Cycles
- **CRUD Operations**: Create, read, and update issues with full comment support
- **Filtering**: Advanced filtering by team, state, project, cycle, assignee, labels
- **Rate Limiting**: Built-in rate limit awareness (10 req/s, 6000 req/hr)

## Installation

```bash
npm install @gwi/connectors
```

## Quick Start

### API Key Authentication

```typescript
import { LinearConnector } from '@gwi/connectors/linear';

const connector = new LinearConnector();

await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: 'lin_api_xxxxxxxxxxxxxxxx' // Your Linear API key
  }
});

// Sync issues from Engineering team
const options = {
  recordTypes: ['issue'],
  teams: ['ENG'],
  states: ['In Progress', 'Todo']
};

for await (const record of connector.sync(options)) {
  console.log(record.data.identifier, record.data.title);
  // ENG-123 Implement OAuth flow
  // ENG-124 Fix authentication bug
}
```

### OAuth 2.0 Authentication

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'oauth2',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'https://yourapp.com/callback',
    accessToken: 'access-token-from-oauth-flow',
    refreshToken: 'refresh-token',
    expiresAt: '2024-12-31T23:59:59Z'
  }
});
```

## Usage Examples

### Sync Issues

```typescript
// Get all open issues from multiple teams
const options = {
  recordTypes: ['issue'],
  teams: ['ENG', 'PRODUCT'],
  states: ['Todo', 'In Progress', 'In Review'],
  since: '2024-01-01T00:00:00Z', // Only updated after this date
  limit: 100
};

for await (const record of connector.sync(options)) {
  const issue = record.data;
  console.log(`${issue.identifier}: ${issue.title}`);
  console.log(`  Priority: ${issue.priorityLabel}`);
  console.log(`  Assignee: ${issue.assignee?.name || 'Unassigned'}`);
  console.log(`  State: ${issue.state.name}`);
}
```

### Sync Projects

```typescript
const options = {
  recordTypes: ['project'],
  limit: 50
};

for await (const record of connector.sync(options)) {
  const project = record.data;
  console.log(`${project.name} (${project.state})`);
  console.log(`  Progress: ${(project.progress * 100).toFixed(1)}%`);
  console.log(`  Issues: ${project.completedIssueCount}/${project.issueCount}`);
}
```

### Get Issue Details

```typescript
const issue = await connector.getIssue('issue-id-here');

console.log(issue.title);
console.log(issue.description);
console.log(`Team: ${issue.team.name} (${issue.team.key})`);
console.log(`State: ${issue.state.name}`);
console.log(`Assignee: ${issue.assignee?.name}`);
console.log(`Labels: ${issue.labels.map(l => l.name).join(', ')}`);
```

### Create Issue

```typescript
const issueId = await connector.createIssue({
  teamId: 'team-id-here',
  title: 'New feature request',
  description: 'Detailed description of the feature',
  priority: 2, // 1=Urgent, 2=High, 3=Medium, 4=Low
  assigneeId: 'user-id-here',
  labelIds: ['label-1', 'label-2'],
  projectId: 'project-id-here'
});

console.log(`Created issue: ${issueId}`);
```

### Update Issue

```typescript
await connector.updateIssue('issue-id-here', {
  title: 'Updated title',
  description: 'Updated description',
  priority: 1, // Increase priority to Urgent
  stateId: 'state-id-for-in-progress',
  assigneeId: 'new-assignee-id'
});
```

### Add Comment

```typescript
const commentId = await connector.addComment(
  'issue-id-here',
  'This is a comment with **markdown** support'
);

console.log(`Added comment: ${commentId}`);
```

### Process Webhooks

```typescript
// In your webhook handler endpoint
app.post('/webhooks/linear', async (req, res) => {
  const event = {
    id: req.body.webhookId,
    type: req.body.type,
    payload: req.body,
    timestamp: req.body.createdAt
  };

  const result = await connector.processWebhook(event);

  if (result.success) {
    console.log(`Processed ${result.recordsProcessed} records`);
    res.status(200).send('OK');
  } else {
    console.error(`Webhook failed: ${result.error}`);
    res.status(500).send('Error');
  }
});
```

## Advanced Filtering

```typescript
const options = {
  recordTypes: ['issue'],
  teams: ['ENG'],
  states: ['In Progress'],
  projectIds: ['project-1', 'project-2'],
  assigneeIds: ['user-1', 'user-2'],
  labelIds: ['bug', 'feature'],
  since: '2024-01-01T00:00:00Z',
  limit: 100,
  includeComments: true,
  includeSubIssues: true
};

for await (const record of connector.sync(options)) {
  const issue = record.data;
  // Filtered results
}
```

## Health Check

```typescript
const health = await connector.healthCheck();

console.log(`Healthy: ${health.healthy}`);
console.log(`Timestamp: ${health.timestamp}`);

for (const check of health.checks) {
  console.log(`${check.name}: ${check.status} (${check.durationMs}ms)`);
  if (check.error) {
    console.log(`  Error: ${check.error}`);
  }
}
```

## Registry Integration

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { registerLinearConnector } from '@gwi/connectors/linear';

const registry = new ConnectorRegistry();
registerLinearConnector(registry);

// Use via registry
const connector = await registry.create('linear', {
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: 'lin_api_xxxxxxxxxxxxxxxx'
  }
});
```

## Configuration

### LinearConnectorConfig

```typescript
interface LinearConnectorConfig {
  tenantId: string;
  auth: LinearAuthConfig;
  baseUrl?: string; // Default: https://api.linear.app/graphql
  timeout?: number; // Default: 30000ms
  headers?: Record<string, string>;
  rateLimit?: {
    maxRequestsPerSecond: number;
    maxRequestsPerHour: number;
    maxConcurrentRequests: number;
  };
}
```

### Issue Priority Levels

- `0` - None
- `1` - Urgent
- `2` - High
- `3` - Medium
- `4` - Low

### Workflow State Types

- `backlog` - Backlog
- `unstarted` - Unstarted
- `started` - In Progress
- `completed` - Completed
- `canceled` - Canceled

## Rate Limits

Linear enforces the following rate limits:

- **Requests per second**: 10
- **Requests per hour**: 6,000

The connector automatically handles rate limiting with exponential backoff and retry logic.

## GraphQL API

The connector uses Linear's GraphQL API exclusively. All queries use cursor-based pagination for efficient data fetching.

### Example GraphQL Query

```graphql
query($first: Int!, $after: String) {
  issues(first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      identifier
      title
      description
      priority
      state {
        name
        type
      }
      team {
        name
        key
      }
    }
  }
}
```

## Error Handling

```typescript
try {
  await connector.authenticate(config);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Invalid config:', error.validationErrors);
  } else if (error instanceof ConnectorError) {
    console.error('Connector error:', error.message);
  }
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  LinearIssue,
  LinearProject,
  LinearTeam,
  LinearCycle,
  LinearSyncOptions
} from '@gwi/connectors/linear';

const issue: LinearIssue = await connector.getIssue('issue-id');
const project: LinearProject = await connector.getProject('project-id');
```

## Testing

```bash
npm test -- linear-connector.test.ts
```

## Documentation

- [Linear API Documentation](https://developers.linear.app/docs)
- [Linear GraphQL API Reference](https://studio.apollographql.com/public/Linear-API/explorer)
- [Linear Webhooks](https://developers.linear.app/docs/graphql/webhooks)

## License

See root package LICENSE file.
