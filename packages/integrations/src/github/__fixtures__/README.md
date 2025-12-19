# GitHub HTTP Fixtures

VCR-style recorded HTTP fixtures for deterministic GitHub API testing.

## Overview

This directory contains recorded HTTP interactions with the GitHub API. Tests can replay these fixtures instead of making real API calls, providing:

- **Deterministic behavior** - Tests always see the same responses
- **Fast execution** - No network latency
- **Offline testing** - No internet connection required
- **Rate limit protection** - No API quota consumption

## Directory Structure

```
__fixtures__/
├── http-recordings/          # Recorded HTTP interactions
│   ├── get-issue/           # Example: GET /repos/.../issues/123
│   │   ├── request.json     # HTTP request
│   │   ├── response.json    # HTTP response
│   │   └── meta.json        # Fixture metadata
│   └── create-branch/       # Example: POST /repos/.../git/refs
│       ├── request.json
│       ├── response.json
│       └── meta.json
├── index.ts                 # Fixture loading utilities
├── recorder.ts              # Fixture recording utilities
├── replayer.ts              # Fixture replay for tests
└── README.md               # This file
```

## Fixture Format

Each fixture contains three files:

### request.json

```json
{
  "method": "GET",
  "url": "https://api.github.com/repos/owner/repo/issues/123",
  "headers": {
    "accept": "application/vnd.github.v3+json",
    "authorization": "Bearer REDACTED_TOKEN"
  }
}
```

### response.json

```json
{
  "status": 200,
  "statusText": "OK",
  "headers": {
    "content-type": "application/json; charset=utf-8"
  },
  "body": {
    "id": 123456789,
    "number": 123,
    "title": "Issue title"
  }
}
```

### meta.json

```json
{
  "name": "get-issue",
  "description": "GET /repos/{owner}/{repo}/issues/{issue_number}",
  "recordedAt": "2025-12-19T10:00:00.000Z",
  "category": "read",
  "apiEndpoint": "/repos/:owner/:repo/issues/:issue_number"
}
```

## Usage in Tests

### Basic Usage

```typescript
import { describe, it, expect } from 'vitest';
import { loadHttpFixture } from '../__fixtures__/index.js';
import { createReplayer } from '../__fixtures__/replayer.js';

describe('GitHub API Tests', () => {
  it('should fetch issue details', () => {
    const replayer = createReplayer();
    replayer.loadFixture('get-issue');

    const response = replayer.getResponse({
      method: 'GET',
      url: '/issues/123',
    });

    expect(response).toHaveProperty('number', 123);
  });
});
```

### Using Test Helpers

```typescript
import { setupFixtureTests } from './helpers/fixture-test-helper.js';

describe('Branch Workflow', () => {
  it('should create branch', async () => {
    const { mockOctokit, cleanup } = setupFixtureTests(['create-branch']);

    const result = await mockOctokit.rest.git.createRef({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/heads/feature-branch',
      sha: 'abc123',
    });

    expect(result.data.ref).toBe('refs/heads/feature-branch');

    cleanup();
  });
});
```

## Recording New Fixtures

### Option 1: Manual Recording

1. Make a real API call
2. Save request and response
3. Create fixture files manually

### Option 2: Automatic Recording (Future)

```bash
# Set environment variable
export RECORD_FIXTURES=true

# Run tests - new fixtures will be recorded
npm test

# Commit fixtures
git add packages/integrations/src/github/__fixtures__/http-recordings/
git commit -m "feat: add new HTTP fixtures"
```

### Option 3: Using the Recorder

```typescript
import { recorder } from '../__fixtures__/recorder.js';

// In your test setup
if (recorder.shouldRecord()) {
  await recorder.recordInteraction(
    'my-fixture',
    request,
    response,
    {
      name: 'my-fixture',
      description: 'Description',
      category: 'read',
      apiEndpoint: '/api/endpoint',
    }
  );
}
```

## Fixture Categories

- **read** - Non-destructive read operations (GET requests)
- **write** - Non-destructive writes (POST comments, labels)
- **destructive** - Destructive operations (branch creation, commits, PRs)

## Security

All fixtures are automatically sanitized to remove:

- Authorization tokens (replaced with "REDACTED_TOKEN")
- API keys and secrets
- Personal access tokens
- OAuth credentials

Never commit real credentials to fixtures.

## Best Practices

1. **One fixture per API endpoint** - Keep fixtures focused
2. **Use descriptive names** - `get-issue-with-labels` not `test1`
3. **Update stale fixtures** - When API changes, update fixtures
4. **Test both success and error cases** - Record error responses too
5. **Sanitize sensitive data** - Always remove real tokens/keys

## Fixture Naming Convention

Format: `{action}-{resource}[-{variant}]`

Examples:
- `get-issue` - Basic issue retrieval
- `get-issue-with-labels` - Issue with labels
- `create-branch` - Branch creation
- `create-branch-error` - Branch creation failure
- `push-commit-multi-file` - Commit with multiple files

## Maintenance

### Updating Fixtures

When GitHub API changes:

```bash
# Update specific fixture
export UPDATE_FIXTURES=true
npm test -- --run fixtures.test.ts

# Or delete and re-record
rm -rf packages/integrations/src/github/__fixtures__/http-recordings/get-issue
export RECORD_FIXTURES=true
npm test
```

### Validating Fixtures

```bash
# Run fixture validation tests
npm test -- --run fixtures.test.ts

# Check for required fields
npm test -- --run "Fixture Metadata Validation"
```

## Troubleshooting

### Fixture Not Found

```
Error: HTTP fixture not found: my-fixture
```

Solution: Ensure fixture directory exists with all required files (request.json, response.json, meta.json)

### No Matching Fixture

```
Error: No fixture found for request: {"method":"GET","url":"/issues/999"}
```

Solution: Either record the missing fixture or use non-strict mode:

```typescript
const replayer = createReplayer({ strict: false });
```

### Sanitization Issues

If sensitive data is not being sanitized:

1. Check recorder sanitization logic in `recorder.ts`
2. Add custom sanitization rules
3. Manually edit fixture files (be careful!)

## Future Enhancements

- [ ] Automatic fixture recording from live tests
- [ ] Fixture expiration and staleness detection
- [ ] HAR format support for browser compatibility
- [ ] Fixture generation from OpenAPI specs
- [ ] Request/response validation against schemas
- [ ] Fixture compression for large responses
