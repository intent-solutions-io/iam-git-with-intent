# Slack Connector

Full-featured connector for Slack workspaces, channels, messages, and users.

## Features

- **Authentication**: Bot tokens and OAuth 2.0
- **Sync**: Messages, channels, users, files, reactions
- **Webhooks**: Events API support with URL verification
- **Operations**: Post messages, add reactions, upload files
- **Pagination**: Cursor-based pagination for all list operations
- **Rate Limiting**: Aware of Slack's tiered rate limits

## Installation

```bash
npm install @gwi/connectors
```

## Quick Start

### Bot Token Authentication

```typescript
import { SlackConnector } from '@gwi/connectors/slack';

const connector = new SlackConnector();

await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: 'xoxb-your-bot-token' // Slack bot token
  }
});

// Post a message
const result = await connector.postMessage(
  'C123456', // channel ID
  'Hello from the Slack connector!'
);

console.log('Message posted:', result.ts);
```

### OAuth 2.0 Authentication

```typescript
await connector.authenticate({
  tenantId: 'my-tenant',
  auth: {
    type: 'oauth2',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'https://your-app.com/oauth/callback',
    accessToken: 'xoxp-user-token', // Obtained from OAuth flow
    scopes: ['channels:read', 'chat:write', 'users:read']
  }
});
```

## Syncing Data

### Sync All Channels

```typescript
const options = {
  recordTypes: ['channel']
};

for await (const record of connector.sync(options)) {
  console.log('Channel:', record.data.name);
}
```

### Sync Messages from Channels

```typescript
const options = {
  recordTypes: ['message'],
  channels: ['C123456', 'C789012'], // Channel IDs
  since: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
  limit: 100,
  includeThreads: true,
  includeReactions: true
};

for await (const record of connector.sync(options)) {
  const message = record.data;
  console.log(`[${message.user}] ${message.text}`);
}
```

### Sync Users

```typescript
const options = {
  recordTypes: ['user']
};

for await (const record of connector.sync(options)) {
  const user = record.data;
  console.log(`User: ${user.realName} (${user.profile.email})`);
}
```

## Connector Operations

### Post a Message

```typescript
// Simple message
const result = await connector.postMessage('C123456', 'Hello!');

// Threaded reply
const reply = await connector.postMessage('C123456', 'Reply!', {
  threadTs: '1234567890.123456'
});

// Message with blocks
const richMessage = await connector.postMessage('C123456', 'Fallback text', {
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Hello* from the connector!'
      }
    }
  ]
});
```

### Add Reactions

```typescript
await connector.addReaction(
  'C123456', // channel
  '1234567890.123456', // message timestamp
  'thumbsup' // emoji name (without colons)
);

// Also works with colons
await connector.addReaction('C123456', '1234567890.123456', ':rocket:');
```

### Upload Files

```typescript
// Upload from buffer
const fileBuffer = Buffer.from('File content');
const result = await connector.uploadFile(
  ['C123456'], // channels
  fileBuffer,
  {
    filename: 'document.txt',
    title: 'Important Document',
    initialComment: 'Check this out!'
  }
);

console.log('File uploaded:', result.file.permalink);

// Upload text content
await connector.uploadFile(['C123456'], 'Code snippet', {
  filename: 'code.js',
  title: 'Code Example'
});
```

### Get Channel Details

```typescript
const channel = await connector.getChannel('C123456');
console.log('Channel:', channel.name);
console.log('Topic:', channel.topic?.value);
console.log('Members:', channel.numMembers);
```

### Get User Details

```typescript
const user = await connector.getUser('U123456');
console.log('User:', user.realName);
console.log('Email:', user.profile.email);
console.log('Is Bot:', user.isBot);
```

## Webhook Processing

The Slack connector supports the [Events API](https://api.slack.com/apis/connections/events-api).

### Setup

1. Configure your Slack app's Event Subscriptions
2. Point the Request URL to your webhook endpoint
3. Subscribe to bot events (e.g., `message.channels`, `reaction_added`)

### Handle URL Verification

When Slack verifies your webhook URL, it sends a challenge:

```typescript
const result = await connector.processWebhook({
  id: 'webhook-1',
  source: 'slack',
  type: 'url_verification',
  timestamp: new Date().toISOString(),
  payload: {
    type: 'url_verification',
    challenge: 'challenge-string'
  },
  signature: 'signature',
  headers: {}
});

// Return the challenge in your HTTP response
if (result.metadata?.type === 'url_verification') {
  res.json({ challenge: result.metadata.challenge });
}
```

### Process Events

```typescript
app.post('/slack/events', async (req, res) => {
  const result = await connector.processWebhook({
    id: req.headers['x-slack-request-timestamp'],
    source: 'slack',
    type: 'event_callback',
    timestamp: new Date().toISOString(),
    payload: req.body,
    signature: req.headers['x-slack-signature'],
    headers: req.headers
  });

  if (result.success) {
    // Process the event
    const event = req.body.event;

    if (event.type === 'message') {
      console.log('Message:', event.text);
    } else if (event.type === 'reaction_added') {
      console.log('Reaction:', event.reaction);
    }
  }

  res.sendStatus(200);
});
```

## Configuration Options

### SlackConnectorConfig

```typescript
interface SlackConnectorConfig {
  tenantId: string;
  auth: SlackAuthConfig;
  baseUrl?: string; // For Slack Enterprise Grid
  timeout?: number; // Request timeout (default: 30000ms)
  headers?: Record<string, string>; // Custom headers
  rateLimit?: {
    maxRequestsPerSecond: number;
    maxRequestsPerMinute: number;
    maxConcurrentRequests: number;
  };
}
```

### SlackSyncOptions

```typescript
interface SlackSyncOptions {
  channels?: string[]; // Channel IDs to sync
  recordTypes?: SlackRecordType[]; // 'message' | 'channel' | 'user' | etc.
  since?: number; // Unix timestamp (seconds)
  until?: number; // Unix timestamp (seconds)
  limit?: number; // Max records
  includeThreads?: boolean;
  includeFiles?: boolean;
  includeReactions?: boolean;
  cursor?: string; // Pagination cursor
}
```

## Record Types

The connector supports these record types:

- `message` - Channel messages
- `channel` - Public/private channels
- `user` - Workspace users
- `reaction` - Message reactions
- `file` - Uploaded files
- `thread` - Message threads
- `workspace` - Workspace info
- `team` - Team info

## Rate Limits

Slack uses [tiered rate limits](https://api.slack.com/docs/rate-limits):

- **Tier 1**: 1+ requests/minute (e.g., `chat.postMessage`)
- **Tier 2**: 20+ requests/minute
- **Tier 3**: 50+ requests/minute (most methods)
- **Tier 4**: 100+ requests/minute

The connector automatically handles rate limit responses with exponential backoff.

## Required Scopes

Depending on your use case, you'll need these OAuth scopes:

### Bot Token Scopes
- `channels:read` - List public channels
- `channels:history` - Read messages from public channels
- `chat:write` - Post messages
- `groups:read` - List private channels
- `groups:history` - Read messages from private channels
- `users:read` - List users
- `reactions:write` - Add reactions
- `files:write` - Upload files

### User Token Scopes
- Similar to bot scopes, but for user context

## Error Handling

```typescript
try {
  await connector.postMessage('C123456', 'Hello!');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Auth failed:', error.message);
  } else if (error instanceof ConnectorError) {
    console.error('Connector error:', error.message);
  }
}
```

## Health Checks

```typescript
const health = await connector.healthCheck();

console.log('Healthy:', health.healthy);
console.log('Checks:', health.checks);

// Example output:
// {
//   healthy: true,
//   connector: 'slack',
//   timestamp: '2024-01-01T00:00:00Z',
//   checks: [
//     { name: 'api_connectivity', status: 'pass', durationMs: 123 },
//     { name: 'authentication', status: 'pass', durationMs: 45 },
//     { name: 'bot_info', status: 'pass', durationMs: 67 }
//   ]
// }
```

## Registry Integration

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { registerSlackConnector } from '@gwi/connectors/slack';

const registry = new ConnectorRegistry();
registerSlackConnector(registry);

// Use the connector
const connector = await registry.create('slack', {
  tenantId: 'my-tenant',
  auth: {
    type: 'bearer',
    token: 'xoxb-token'
  }
});
```

## TypeScript Types

All types are fully typed with TypeScript:

```typescript
import type {
  SlackConnectorConfig,
  SlackMessage,
  SlackChannel,
  SlackUser,
  SlackSyncOptions
} from '@gwi/connectors/slack';
```

## Resources

- [Slack API Documentation](https://api.slack.com/docs)
- [Events API](https://api.slack.com/apis/connections/events-api)
- [Web API Methods](https://api.slack.com/methods)
- [Rate Limits](https://api.slack.com/docs/rate-limits)
- [OAuth Scopes](https://api.slack.com/scopes)

## License

MIT
