# @gwi/sdk

TypeScript SDK client for the Git With Intent API.

## Features

- Full TypeScript support with comprehensive type definitions
- Works in Node.js and browser environments
- Supports authentication with API keys and bearer tokens
- Uses native `fetch` for HTTP requests
- Async/await based API
- Comprehensive JSDoc comments for IntelliSense

## Installation

```bash
npm install @gwi/sdk
```

## Quick Start

```typescript
import { GWIClient } from '@gwi/sdk';

// Create a client instance
const client = new GWIClient({
  baseUrl: 'https://api.gitwithintent.com',
  auth: {
    bearerToken: 'your-firebase-jwt-token'
  }
});

// List your tenants
const { tenants } = await client.tenants.list();
console.log(`You have access to ${tenants.length} tenants`);

// Start an autopilot run
const run = await client.runs.start('tenant-123', {
  repoUrl: 'https://github.com/owner/repo',
  runType: 'AUTOPILOT',
  prNumber: 42,
  riskMode: 'suggest_patch'
});

console.log(`Run started: ${run.runId}`);
```

## Authentication

### Firebase Auth (Production)

```typescript
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const token = await auth.currentUser?.getIdToken();

const client = new GWIClient({
  baseUrl: 'https://api.gitwithintent.com',
  auth: {
    bearerToken: token
  }
});
```

### Development Mode

```typescript
const client = new GWIClient({
  baseUrl: 'http://localhost:8080',
  auth: {
    debugUserId: 'user-123',
    debugRole: 'owner'
  }
});
```

### API Key (Service Accounts)

```typescript
const client = new GWIClient({
  baseUrl: 'https://api.gitwithintent.com',
  auth: {
    apiKey: process.env.GWI_API_KEY
  }
});
```

## API Reference

### Tenants

```typescript
// List tenants
const { tenants } = await client.tenants.list();

// Get a specific tenant
const tenant = await client.tenants.get('tenant-123');

// Create a new tenant
const { tenant } = await client.tenants.create({
  displayName: 'My Team',
  githubOrgLogin: 'my-org'
});

// Update settings
const updated = await client.tenants.updateSettings('tenant-123', {
  defaultRiskMode: 'auto_patch',
  autoRunOnConflict: true
});
```

### Repositories

```typescript
// List repositories
const { repos } = await client.repos.list('tenant-123');

// Connect a repository
const repo = await client.repos.connect('tenant-123', {
  repoUrl: 'https://github.com/owner/repo',
  displayName: 'My Repo',
  settings: {
    autoTriage: true,
    autoReview: true,
    autoResolve: false
  }
});

// Remove a repository
await client.repos.remove('tenant-123', 'gh-repo-owner-repo');
```

### Runs

```typescript
// Start a run
const run = await client.runs.start('tenant-123', {
  repoUrl: 'https://github.com/owner/repo',
  runType: 'AUTOPILOT',
  prNumber: 42,
  riskMode: 'suggest_patch'
});

// Get run status
const status = await client.runs.get('tenant-123', run.runId);
console.log(`Status: ${status.status}`);
console.log(`Steps: ${status.steps.length}`);

// List recent runs
const { runs } = await client.runs.list('tenant-123', { limit: 10 });

// Cancel a run
await client.runs.cancel('tenant-123', 'run-xyz');
```

### Workflows

```typescript
// Start a workflow
const workflow = await client.workflows.start('tenant-123', {
  workflowType: 'issue-to-code',
  input: {
    issueUrl: 'https://github.com/owner/repo/issues/123',
    targetBranch: 'main'
  }
});

// Get workflow status
const status = await client.workflows.get('tenant-123', workflow.workflowId);

// List workflows
const { workflows } = await client.workflows.list('tenant-123', {
  status: 'running'
});

// Approve a workflow
await client.workflows.approve('tenant-123', 'wf-xyz', true);

// Reject a workflow
await client.workflows.reject('tenant-123', 'wf-xyz');
```

### Members

```typescript
// List members
const { members } = await client.members.list('tenant-123');

// Invite a member
const { invite } = await client.members.invite('tenant-123', {
  email: 'user@example.com',
  role: 'admin'
});

// List pending invites
const { invites } = await client.members.listInvites('tenant-123');

// Accept an invite
const { membership } = await client.members.acceptInvite('inv-xyz123');

// Cancel an invite
await client.members.cancelInvite('tenant-123', 'pending_inv-xyz');
```

### User

```typescript
// Get current user
const { user, memberships } = await client.user.me();
console.log(`Logged in as ${user.displayName}`);

// Sign up a new user
const { user } = await client.user.signup({
  email: 'user@example.com',
  displayName: 'John Doe',
  githubLogin: 'johndoe'
});
```

### Health & Metrics

```typescript
// Check API health
const health = await client.health();
console.log(`API is ${health.status}`);

// Get metrics
const metrics = await client.metrics();
console.log(`Total requests: ${metrics.requests.total}`);
console.log(`Average latency: ${metrics.latency.avgMs}ms`);
```

## Error Handling

```typescript
import { GWIApiError } from '@gwi/sdk';

try {
  const run = await client.runs.start('tenant-123', {
    repoUrl: 'https://github.com/owner/repo',
    runType: 'AUTOPILOT'
  });
} catch (error) {
  if (error instanceof GWIApiError) {
    console.error(`API Error: ${error.code} (${error.status})`);
    console.error(`Message: ${error.message}`);
    console.error(`Details:`, error.details);

    // Handle specific errors
    if (error.status === 429) {
      console.error('Rate limited or plan limit exceeded');
    } else if (error.status === 403) {
      console.error('Insufficient permissions');
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Configuration

### Custom Timeout

```typescript
const client = new GWIClient({
  baseUrl: 'https://api.gitwithintent.com',
  auth: { bearerToken: token },
  timeout: 60000 // 60 seconds
});
```

### Custom Fetch Implementation

```typescript
import nodeFetch from 'node-fetch';

const client = new GWIClient({
  baseUrl: 'https://api.gitwithintent.com',
  auth: { bearerToken: token },
  fetch: nodeFetch as unknown as typeof fetch
});
```

### Updating Authentication

```typescript
// Update token
const newToken = await auth.currentUser?.getIdToken();
client.setAuth({ bearerToken: newToken });

// Clear authentication
client.clearAuth();
```

## Run Types

- `TRIAGE` - Analyze PR and assess complexity
- `PLAN` - Generate resolution plan for conflicts
- `RESOLVE` - Automatically resolve merge conflicts
- `REVIEW` - Review code changes
- `AUTOPILOT` - Full end-to-end automation

## Risk Modes

- `comment_only` - Only add comments to PRs
- `suggest_patch` - Generate patch files for review
- `auto_patch` - Automatically apply patches
- `auto_push` - Apply patches and push to remote

## Workflow Types

- `issue-to-code` - Convert GitHub issue to PR
- `pr-resolve` - Resolve PR conflicts
- `pr-review` - Review PR changes
- `test-gen` - Generate test cases
- `docs-update` - Update documentation

## TypeScript Support

The SDK is written in TypeScript and provides comprehensive type definitions for all API operations. All request and response types are fully typed for IntelliSense support.

```typescript
import type {
  Tenant,
  TenantSettings,
  RunType,
  RunStatus,
  RiskMode
} from '@gwi/sdk';
```

## Node.js and Browser Support

The SDK works in both Node.js (18+) and modern browsers. It uses native `fetch` API, so ensure your environment supports it or provide a polyfill.

## License

MIT
