# Jira Cloud Connector

Full-featured connector for Jira Cloud using the REST API v3.

## Features

- **Authentication**: API token (recommended), OAuth 2.0 (3LO), and Basic Auth
- **Record Types**: Issues, Projects, Sprints, Boards, Users, Comments, Attachments, Worklogs
- **JQL Support**: Powerful query language for filtering issues
- **Webhooks**: Process real-time updates from Jira
- **Pagination**: Automatic handling of large datasets
- **Rate Limiting**: Built-in awareness and retry logic

## Installation

```bash
npm install @gwi/connectors
```

## Authentication

### API Token (Recommended)

1. Generate an API token: https://id.atlassian.com/manage-profile/security/api-tokens
2. Use your email and API token for authentication

```typescript
import { JiraConnector } from '@gwi/connectors/jira';

const connector = new JiraConnector();

await connector.authenticate({
  tenantId: 'my-org',
  domain: 'mycompany', // for mycompany.atlassian.net
  auth: {
    type: 'api_token',
    email: 'user@example.com',
    apiToken: 'your-api-token-here'
  }
});
```

### OAuth 2.0 (3LO)

```typescript
await connector.authenticate({
  tenantId: 'my-org',
  domain: 'mycompany',
  auth: {
    type: 'oauth2',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'https://yourapp.com/oauth/callback',
    accessToken: 'access-token-from-oauth-flow',
    refreshToken: 'refresh-token',
    expiresAt: '2024-12-31T23:59:59Z'
  }
});
```

## Usage Examples

### Basic Issue Sync

```typescript
import { JiraConnector } from '@gwi/connectors/jira';

const connector = new JiraConnector();

await connector.authenticate({
  tenantId: 'my-org',
  domain: 'mycompany',
  auth: {
    type: 'api_token',
    email: 'user@example.com',
    apiToken: process.env.JIRA_API_TOKEN!
  }
});

// Sync all open issues from specific projects
for await (const record of connector.sync({
  projects: ['PROJ1', 'PROJ2'],
  recordTypes: ['issue'],
  jql: 'status != Done',
  includeComments: true,
  includeAttachments: false
})) {
  console.log(`Issue: ${record.data.key} - ${record.data.fields.summary}`);
}
```

### Advanced JQL Queries

```typescript
// Sync issues updated in the last 24 hours
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

for await (const record of connector.sync({
  jql: 'updated >= -24h AND assignee = currentUser()',
  since: yesterday,
  limit: 100
})) {
  console.log(`Updated issue: ${record.data.key}`);
}
```

### Working with Issues

```typescript
// Get a specific issue
const issue = await connector.getIssue('PROJ-123', {
  expand: ['changelog', 'renderedFields'],
  fields: ['summary', 'status', 'assignee', 'description']
});

// Create a new issue
const newIssue = await connector.createIssue({
  projectKey: 'PROJ',
  summary: 'Bug: Login page not loading',
  description: 'Users are experiencing issues with the login page',
  issuetype: 'Bug',
  priority: 'High',
  labels: ['frontend', 'critical']
});

// Update an issue
await connector.updateIssue('PROJ-123', {
  summary: 'Updated summary',
  assignee: 'account-id-here'
});

// Add a comment
await connector.addComment('PROJ-123', 'This issue is now being reviewed');

// Transition an issue
const transitions = await connector.getTransitions('PROJ-123');
const doneTransition = transitions.find(t => t.name === 'Done');
if (doneTransition) {
  await connector.transition('PROJ-123', doneTransition.id, 'Completed as part of sprint 42');
}
```

### Search with JQL

```typescript
const { issues, total } = await connector.searchIssues(
  'project = PROJ AND status IN (Open, "In Progress") ORDER BY priority DESC',
  {
    startAt: 0,
    maxResults: 50,
    fields: ['summary', 'status', 'priority', 'assignee'],
    expand: ['changelog']
  }
);

console.log(`Found ${total} issues, retrieved ${issues.length}`);
```

### Sync Multiple Record Types

```typescript
// Sync projects, boards, and sprints
for await (const record of connector.sync({
  recordTypes: ['project', 'board', 'sprint'],
  projects: ['PROJ1']
})) {
  switch (record.type) {
    case 'project':
      console.log(`Project: ${record.data.name}`);
      break;
    case 'board':
      console.log(`Board: ${record.data.name} (${record.data.type})`);
      break;
    case 'sprint':
      console.log(`Sprint: ${record.data.name} (${record.data.state})`);
      break;
  }
}
```

### Process Webhooks

```typescript
import type { WebhookEvent } from '@gwi/connectors';

// Set up webhook endpoint
app.post('/webhooks/jira', async (req, res) => {
  const event: WebhookEvent = {
    id: req.headers['x-request-id'] as string,
    type: req.body.webhookEvent,
    timestamp: new Date().toISOString(),
    payload: req.body
  };

  const result = await connector.processWebhook(event);

  if (result.success) {
    console.log(`Processed ${result.recordsProcessed} records in ${result.durationMs}ms`);
    res.status(200).json({ ok: true });
  } else {
    console.error(`Webhook processing failed: ${result.error}`);
    res.status(500).json({ error: result.error });
  }
});
```

### Health Checks

```typescript
const health = await connector.healthCheck();

if (health.healthy) {
  console.log('Jira connector is healthy');
} else {
  console.error('Health check failed:');
  health.checks.forEach(check => {
    if (check.status === 'fail') {
      console.error(`- ${check.name}: ${check.error}`);
    }
  });
}
```

## Connector Registry

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { registerJiraConnector } from '@gwi/connectors/jira';

const registry = new ConnectorRegistry();
registerJiraConnector(registry);

// Create connector via registry
const connector = await registry.create('jira', {
  tenantId: 'my-org',
  domain: 'mycompany',
  auth: {
    type: 'api_token',
    email: 'user@example.com',
    apiToken: process.env.JIRA_API_TOKEN!
  }
});
```

## Configuration Options

### JiraSyncOptions

```typescript
interface JiraSyncOptions {
  projects?: string[];              // Filter by project keys (e.g., ['PROJ1', 'PROJ2'])
  recordTypes?: JiraRecordType[];   // Types to sync: 'issue', 'project', 'sprint', etc.
  jql?: string;                     // JQL query for filtering issues
  since?: string;                   // ISO 8601 date to filter by updated date
  limit?: number;                   // Max records to retrieve
  includeComments?: boolean;        // Include comments in issue sync
  includeAttachments?: boolean;     // Include attachments in issue sync
  includeWorklogs?: boolean;        // Include worklogs in issue sync
  expand?: string[];                // Fields to expand (e.g., ['changelog'])
  fields?: string[];                // Specific fields to retrieve
}
```

## Record Types

- `issue` - Jira issues with full field data
- `project` - Projects with metadata
- `sprint` - Agile sprints from boards
- `board` - Scrum/Kanban boards
- `user` - User accounts
- `comment` - Issue comments
- `attachment` - File attachments
- `worklog` - Time tracking entries
- `transition` - Available status transitions

## Webhook Events

Supported webhook events:

- `jira:issue_created`
- `jira:issue_updated`
- `jira:issue_deleted`
- `comment_created/updated/deleted`
- `worklog_created/updated/deleted`
- `project_created/updated/deleted`
- `sprint_created/updated/closed/deleted/started`

## Rate Limits

Jira Cloud enforces rate limits that vary by plan:

- **Free**: ~200 requests/minute
- **Standard/Premium**: Higher limits based on license tier
- **Enterprise**: Custom limits

The connector includes automatic retry logic with exponential backoff for rate limit errors.

## API Documentation

For more details on Jira Cloud REST API v3:
https://developer.atlassian.com/cloud/jira/platform/rest/v3/

## TypeScript Support

All types are fully typed with TypeScript:

```typescript
import type {
  JiraIssue,
  JiraProject,
  JiraSprint,
  JiraBoard,
  JiraConnectorConfig,
  JiraSyncOptions
} from '@gwi/connectors/jira';
```

## Error Handling

```typescript
import { AuthenticationError, ConnectorError, ValidationError } from '@gwi/connectors';

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
