# E2E Testing Framework

Comprehensive end-to-end testing framework for Git With Intent.

## Overview

This E2E testing framework provides:

- **Test Helpers**: Reusable utilities for API testing, GitHub mocking, and test data
- **Test Isolation**: Each test runs in isolation with clean state
- **Type Safety**: Full TypeScript support with type-safe API client
- **Mock Infrastructure**: GitHub API mocking and in-memory storage
- **Best Practices**: Example tests demonstrating patterns and conventions

## Quick Start

### Running E2E Tests

```bash
# Run all E2E tests
npx vitest run test/e2e/

# Run specific test file
npx vitest run test/e2e/example.e2e.test.ts

# Run with watch mode
npx vitest test/e2e/ --watch

# Run with coverage
npx vitest run test/e2e/ --coverage
```

### Writing Your First E2E Test

```typescript
import { describe, it, expect } from 'vitest';
import { createApiClient } from './helpers/api-client.js';
import { createCompleteScenario } from './helpers/test-data.js';
import { setupE2E } from './setup.js';

// Initialize E2E setup
setupE2E();

describe('My E2E Test', () => {
  it('should test something', async () => {
    // Create test scenario
    const scenario = createCompleteScenario();

    // Create API client
    const client = createApiClient({
      app: myExpressApp,
      defaultUserId: scenario.user.id,
    });

    // Make API request
    const response = await client.get('/some-endpoint');

    // Assert response
    expect(response.status).toBe(200);
  });
});
```

## Directory Structure

```
test/e2e/
├── README.md              # This file
├── setup.ts               # Global test setup and teardown
├── example.e2e.test.ts    # Example test demonstrating best practices
├── helpers/               # Reusable test helpers
│   ├── api-client.ts      # HTTP client wrapper for testing
│   ├── github-mock.ts     # Mock GitHub API server
│   └── test-data.ts       # Test data fixtures and factories
└── fixtures/              # Static test fixtures (JSON, files, etc.)
```

## Test Helpers

### ApiClient

Type-safe HTTP client wrapper for testing APIs.

```typescript
import { createApiClient, assertResponse } from './helpers/api-client.js';

// Create client
const client = createApiClient({
  app: myExpressApp,
  enableLogging: true,  // Enable request/response logging
  defaultUserId: 'user-123',
  defaultTenantId: 'tenant-123',
});

// Make requests
const response = await client.get('/endpoint');
const response = await client.post('/endpoint', {
  body: { data: 'value' },
  headers: { 'Custom-Header': 'value' },
});

// Specialized methods
const health = await client.healthCheck();
const run = await client.createWorkflow('tenant-id', 'issue-to-code', input);
const status = await client.getRunStatus('tenant-id', 'run-id');

// Assertions
assertResponse.isSuccess(response);
assertResponse.isUnauthorized(response);
assertResponse.isForbidden(response);
assertResponse.isNotFound(response);
assertResponse.hasProperty(response, 'propertyName');
assertResponse.matchesStructure(response, { expected: 'structure' });
```

### GitHubMock

Mock GitHub API for testing without external dependencies.

```typescript
import { createGitHubMock, scenarios } from './helpers/github-mock.js';

// Create mock
const mock = createGitHubMock();

// Add fixtures
const issue = mock.addIssue('owner', 'repo', {
  number: 1,
  title: 'Test Issue',
  body: 'Issue description',
});

const pr = mock.addPullRequest('owner', 'repo', {
  number: 2,
  title: 'Test PR',
  mergeable: true,
});

const repo = mock.addRepository('owner', 'repo', {
  default_branch: 'main',
});

// Retrieve fixtures
const retrievedIssue = mock.getIssue('owner', 'repo', 1);
const retrievedPR = mock.getPullRequest('owner', 'repo', 2);

// Track requests
mock.trackRequest('GET', '/repos/owner/repo/issues/1');
const history = mock.getRequestHistory();
const getRequests = mock.findRequests({ method: 'GET' });

// Create webhook events
const event = mock.createWebhookEvent('issues', 'opened', 'owner', 'repo', 1);

// Use scenarios
const { mock, issue, repository } = scenarios.bugFixIssue();
const { mock, pr, repository } = scenarios.conflictingPR();
const { mock, pr, repository } = scenarios.cleanPR();
```

### Test Data Fixtures

Factory functions for creating test data.

```typescript
import {
  createTenantFixture,
  createUserFixture,
  createMembershipFixture,
  createRepositoryFixture,
  createCompleteScenario,
  scenarios,
  batch,
} from './helpers/test-data.js';

// Create individual fixtures
const tenant = createTenantFixture({
  name: 'My Org',
  plan: 'pro',
});

const user = createUserFixture({
  name: 'John Doe',
  email: 'john@example.com',
});

const membership = createMembershipFixture({
  userId: user.id,
  tenantId: tenant.id,
  role: 'ADMIN',
});

// Create complete scenario
const scenario = createCompleteScenario({
  tenantOptions: { plan: 'enterprise' },
  userOptions: { name: 'Admin User' },
  membershipRole: 'OWNER',
});

// Use pre-built scenarios
const solo = scenarios.soloDeveloper();
const team = scenarios.team();
const enterprise = scenarios.enterprise();
const multiTenant = scenarios.multiTenant();

// Batch creation
const tenants = batch.tenants(5, { plan: 'free' });
const users = batch.users(10);
const repos = batch.repositories(3, { owner: 'myorg' });
```

## Test Setup and Teardown

### Global Setup

Use `setupE2E()` to initialize test environment:

```typescript
import { setupE2E } from './setup.js';

// This sets up:
// - Environment variables
// - Global before/after hooks
// - Test isolation
// - Cleanup
setupE2E();
```

### Per-Test Setup

```typescript
import { beforeEach, afterEach } from 'vitest';
import { createMockStores } from './setup.js';

let stores: ReturnType<typeof createMockStores>;

beforeEach(() => {
  stores = createMockStores();
});

afterEach(() => {
  stores.reset();
});
```

### Environment Variables

E2E tests automatically set these environment variables:

- `GWI_STORE_BACKEND=memory` - Use in-memory storage
- `NODE_ENV=test` - Test environment
- `SKIP_EXTERNAL_APIS=true` - Disable external API calls
- `DISABLE_RATE_LIMITING=true` - Disable rate limiting
- Mock API keys for Anthropic, Google AI, GitHub

## Best Practices

### 1. Test Isolation

Each test should be independent and not rely on state from other tests:

```typescript
beforeEach(() => {
  // Reset all state
  mockStores.reset();
  githubMock.reset();
});
```

### 2. Use Fixtures

Create reusable test data using fixtures:

```typescript
// Good
const scenario = scenarios.soloDeveloper();

// Avoid
const tenant = { id: 'tenant-1', name: 'Test', ... };
const user = { id: 'user-1', email: 'test@example.com', ... };
```

### 3. Type-Safe Assertions

Use TypeScript and assertion helpers:

```typescript
// Good
assertResponse.isSuccess(response);
expect(response.body).toHaveProperty('runId');

// Avoid
expect(response.status).toBeGreaterThanOrEqual(200);
expect(response.status).toBeLessThan(300);
```

### 4. Test Organization

Organize tests by feature or workflow:

```typescript
describe('Issue to Code Workflow', () => {
  describe('Happy Path', () => {
    it('should create code from simple bug fix', async () => {
      // ...
    });
  });

  describe('Error Cases', () => {
    it('should handle invalid issue URL', async () => {
      // ...
    });
  });
});
```

### 5. Clear Test Names

Use descriptive test names that explain what is being tested:

```typescript
// Good
it('should reject workflow creation when user lacks tenant access', async () => {
  // ...
});

// Avoid
it('should fail', async () => {
  // ...
});
```

### 6. Minimal Mocking

Only mock what's necessary:

```typescript
// Good - mock external dependencies
vi.mock('@gwi/integrations', () => ({
  createGitHubClient: () => mockGitHubClient,
}));

// Avoid - mocking too much internal logic
vi.mock('@gwi/core');
vi.mock('@gwi/engine');
vi.mock('@gwi/agents');
```

### 7. Test Both Success and Failure

Test happy paths and error cases:

```typescript
describe('Workflow Creation', () => {
  it('should create workflow with valid input', async () => {
    // Test success case
  });

  it('should reject workflow with invalid input', async () => {
    // Test validation
  });

  it('should handle network errors gracefully', async () => {
    // Test error handling
  });
});
```

## Common Patterns

### Testing Authentication

```typescript
it('should require authentication', async () => {
  const client = createApiClient({ app });  // No userId
  const response = await client.get('/protected');
  assertResponse.isUnauthorized(response);
});

it('should accept valid authentication', async () => {
  const client = createApiClient({
    app,
    defaultUserId: 'user-123',
  });
  const response = await client.get('/protected');
  assertResponse.isSuccess(response);
});
```

### Testing Authorization

```typescript
it('should verify tenant membership', async () => {
  const scenario = createCompleteScenario();

  // User has access
  await mockStores.membershipStore.addMember(scenario.membership);
  const response = await client.get(`/tenants/${scenario.tenant.id}/data`);
  assertResponse.isSuccess(response);

  // User lacks access
  const otherTenant = createTenantFixture();
  const response2 = await client.get(`/tenants/${otherTenant.id}/data`);
  assertResponse.isForbidden(response2);
});
```

### Testing Workflows

```typescript
it('should execute issue-to-code workflow', async () => {
  const scenario = createCompleteScenario();
  const { issue } = githubScenarios.bugFixIssue();

  await mockStores.tenantStore.createTenant(scenario.tenant);
  await mockStores.userStore.createUser(scenario.user);
  await mockStores.membershipStore.addMember(scenario.membership);

  const client = createApiClient({
    app,
    defaultUserId: scenario.user.id,
  });

  const response = await client.createWorkflow(
    scenario.tenant.id,
    'issue-to-code',
    {
      issue: {
        url: issue.html_url,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        owner: 'testorg',
        repo: 'testrepo',
      },
      targetBranch: 'main',
    }
  );

  assertResponse.isSuccess(response);
  expect(response.body).toHaveProperty('runId');
});
```

### Testing Async Operations

```typescript
import { waitFor } from './setup.js';

it('should complete async workflow', async () => {
  const response = await client.createWorkflow(tenantId, 'autopilot', input);
  const runId = response.body.runId;

  // Wait for workflow to complete
  await waitFor(
    async () => {
      const status = await client.getRunStatus(tenantId, runId);
      return status.body.status === 'completed';
    },
    {
      timeoutMs: 10000,
      intervalMs: 500,
      timeoutMessage: 'Workflow did not complete in time',
    }
  );

  const finalStatus = await client.getRunStatus(tenantId, runId);
  expect(finalStatus.body.status).toBe('completed');
});
```

## Debugging Tests

### Enable Logging

```typescript
const client = createApiClient({
  app,
  enableLogging: true,  // Log all requests/responses
});
```

### Inspect Test State

```typescript
it('should...', async () => {
  // ... test code ...

  // Debug: log request history
  console.log('GitHub requests:', githubMock.getRequestHistory());

  // Debug: log store state
  const tenants = await mockStores.tenantStore.listTenants();
  console.log('Tenants:', tenants);
});
```

### Run Single Test

```bash
# Run specific test file
npx vitest run test/e2e/example.e2e.test.ts

# Run specific test by name
npx vitest run test/e2e/example.e2e.test.ts -t "should test something"
```

## Integration with CI/CD

E2E tests run automatically in CI:

```bash
# In GitHub Actions
npm run build
npm run test  # Includes E2E tests via vitest
```

## Performance Tips

1. **Use in-memory storage** - Default for E2E tests
2. **Mock external APIs** - Don't hit real GitHub, Anthropic, etc.
3. **Parallelize tests** - Vitest runs tests in parallel by default
4. **Clean up resources** - Reset stores between tests
5. **Keep tests focused** - Test one thing per test

## Troubleshooting

### Tests are flaky

- Ensure test isolation (use `beforeEach` to reset state)
- Avoid timing-dependent assertions
- Use `waitFor` for async operations

### Tests are slow

- Check for unnecessary `waitForAsync` calls
- Ensure external APIs are mocked
- Use in-memory storage (not real database)

### Import errors

```bash
# Rebuild packages
npm run build

# Check imports are using .js extension
import { createApiClient } from './helpers/api-client.js';
```

### Type errors

```bash
# Run typecheck
npm run typecheck

# Check tsconfig.json includes test files
```

## Examples

See `example.e2e.test.ts` for comprehensive examples of:

- Health check tests
- Authentication tests
- Test data fixtures
- GitHub mocking
- Store management
- Complete workflow simulation
- Error handling

## Next Steps

1. **Write tests for your feature** - Use patterns from `example.e2e.test.ts`
2. **Run tests locally** - `npx vitest run test/e2e/`
3. **Ensure tests pass in CI** - Tests run automatically on PR
4. **Keep tests maintainable** - Use helpers and fixtures

## Support

For questions or issues with E2E testing:

1. Check existing tests in `test/e2e/`
2. Review this README
3. Consult `000-docs/` for architecture details
4. Ask in team chat or PR comments
