# High-Performance Testing Guide

This project uses **Vitest** as the test runner, configured for maximum performance with parallel execution, test sharding, and comprehensive coverage reporting.

## Quick Start

```bash
# Run all tests (parallel, with coverage)
npm test

# Run tests in parallel with sharding (4 shards)
./scripts/test-parallel.sh

# Run tests without coverage (faster)
npm test -- --no-coverage

# Run specific test file
npx vitest run path/to/test.test.ts

# Watch mode (for development)
npm test -- --watch
```

## Architecture

### Test Runner: Vitest

Vitest is a blazing-fast unit test framework powered by Vite. Key advantages:

- ⚡ **Fast**: Native ESM, instant hot module replacement
- 🔀 **Parallel**: Multi-threaded execution using all CPU cores
- 📊 **Coverage**: Built-in coverage with V8 provider
- 🎯 **Compatible**: Jest-compatible API
- 🔧 **Configurable**: Extensive configuration options

### Performance Optimizations

The `vitest.config.mts` is optimized for maximum performance:

#### 1. **Parallel Execution**
```typescript
pool: 'threads',                    // Use worker threads (faster than forks)
poolOptions: {
  threads: {
    maxThreads: os.cpus().length,   // Use ALL CPU cores
    minThreads: Math.floor(os.cpus().length / 2),
    isolate: true,                  // Isolate tests for better parallelism
    useAtomics: true,              // Use atomic operations
  },
},
fileParallelism: true,              // Run tests in parallel within files
```

#### 2. **Test Sharding**
Distribute tests across multiple shards for CI/CD:

```bash
# Run first quarter of tests
npx vitest run --shard=1/4

# Run second quarter of tests
npx vitest run --shard=2/4

# Parallel shard execution (4 shards in background)
./scripts/test-parallel.sh
```

#### 3. **V8 Coverage Provider**
```typescript
coverage: {
  provider: 'v8',    // Fastest coverage provider (vs istanbul/c8)
  reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
}
```

## Test Structure

```
git-with-intent/
├── test/
│   ├── e2e/                      # End-to-end tests
│   │   ├── helpers/              # E2E test helpers
│   │   └── *.e2e.test.ts         # E2E test files
│   └── integration/              # Integration tests
├── packages/*/
│   └── src/__tests__/            # Unit tests (co-located)
│       ├── *.test.ts
│       └── __snapshots__/
└── apps/*/
    └── src/__tests__/            # App-specific tests
        └── *.test.ts
```

## Test Categories

### 1. Unit Tests
Fast, isolated tests for individual functions/classes.

Location: `packages/*/src/__tests__/*.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('QuotaManager', () => {
  it('should check quota limits', async () => {
    // Test implementation
  });
});
```

### 2. Integration Tests
Tests that verify multiple components working together.

Location: `packages/sdk/src/__tests__/integration/*.test.ts`

```typescript
describe('SCIM API Integration', () => {
  let mockServer: GatewayMock;

  beforeEach(async () => {
    mockServer = await createGatewayMock();
  });

  // Tests...
});
```

### 3. End-to-End Tests
Full workflow tests using test helpers and mocks.

Location: `test/e2e/*.e2e.test.ts`

```typescript
describe('Marketplace Connector Installation', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient();
  });

  // Tests...
});
```

## Coverage

### Coverage Thresholds

Minimum required coverage (enforced in CI):

```typescript
thresholds: {
  lines: 70,
  functions: 70,
  branches: 70,
  statements: 70,
}
```

### View Coverage Reports

```bash
# Run tests with coverage
npm test

# Open HTML coverage report
open coverage/index.html

# View text summary
cat coverage/coverage-summary.txt
```

### Coverage Exclusions

The following are excluded from coverage:
- Test files (`**/*.test.ts`, `**/__tests__/**`)
- Config files (`**/*.config.*`)
- Generated code (`**/generated/**`)
- Node modules (`**/node_modules/**`)

## Parallel Test Execution

### Strategy 1: Multi-threaded Execution (Default)

Vitest automatically distributes tests across CPU cores:

```bash
npm test
# Uses all available CPU cores
```

### Strategy 2: Sharded Execution (CI/CD)

Distribute tests across multiple machines/processes:

```bash
# Run in 4 shards (parallel)
SHARD_COUNT=4 ./scripts/test-parallel.sh

# Custom shard count
SHARD_COUNT=8 ./scripts/test-parallel.sh

# Disable coverage (faster)
COVERAGE=false ./scripts/test-parallel.sh
```

### Strategy 3: Package-specific Tests

Run tests for a specific package only:

```bash
npx turbo run test --filter=@gwi/core
npx turbo run test --filter=@gwi/agents
npx turbo run test --filter=@gwi/engine
```

## Performance Benchmarks

Typical test execution times (depends on hardware):

| Test Suite | Tests | Serial Time | Parallel Time (8 cores) | Speedup |
|------------|-------|-------------|-------------------------|---------|
| Unit Tests | ~500 | ~60s | ~12s | 5x |
| Integration Tests | ~45 | ~30s | ~8s | 3.75x |
| E2E Tests | ~78 | ~90s | ~18s | 5x |
| **Total** | **~623** | **~180s** | **~38s** | **4.7x** |

*Note: Actual times vary based on CPU count and system load.*

## Debugging Failed Tests

### 1. Run Specific Test File

```bash
npx vitest run path/to/failing.test.ts
```

### 2. Run in Watch Mode

```bash
npx vitest watch path/to/failing.test.ts
```

### 3. Enable Verbose Logging

```bash
npx vitest run --reporter=verbose
```

### 4. Run Single Test

```typescript
it.only('should do something', () => {
  // This test runs, others are skipped
});
```

### 5. Debug with Node Inspector

```bash
node --inspect-brk ./node_modules/vitest/vitest.mjs run
# Then attach Chrome DevTools
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx vitest run --shard=${{ matrix.shard }}/4 --coverage
      - uses: actions/upload-artifact@v3
        with:
          name: coverage-${{ matrix.shard }}
          path: coverage/
```

## Best Practices

### 1. Test Isolation
```typescript
beforeEach(() => {
  // Reset state before each test
  vi.clearAllMocks();
  resetStore();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});
```

### 2. Use Factories for Test Data
```typescript
import { createTenantFixture } from './helpers/test-data';

it('should create tenant', () => {
  const tenant = createTenantFixture({ plan: 'pro' });
  // Use tenant in test
});
```

### 3. Mock External Dependencies
```typescript
vi.mock('@gwi/external-api', () => ({
  callAPI: vi.fn().mockResolvedValue({ success: true }),
}));
```

### 4. Parallel-safe Tests
```typescript
// Bad: Shared mutable state
let counter = 0;
it('test 1', () => { counter++; });
it('test 2', () => { counter++; });

// Good: Isolated state
it('test 1', () => {
  const counter = 0;
  // test uses local counter
});
```

## Troubleshooting

### Tests Hang or Timeout

Increase timeout:
```typescript
// In test file
it('slow test', async () => {
  // ...
}, { timeout: 60000 }); // 60 seconds
```

Or in config:
```typescript
// vitest.config.mts
testTimeout: 30000,
```

### Out of Memory Errors

Reduce parallelism:
```bash
npx vitest run --poolOptions.threads.maxThreads=2
```

Or disable coverage:
```bash
npx vitest run --no-coverage
```

### Flaky Tests

Enable retries:
```typescript
// vitest.config.mts
retry: 2,  // Retry failed tests up to 2 times
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest GitHub](https://github.com/vitest-dev/vitest)
- [V8 Coverage Provider](https://vitest.dev/guide/coverage.html#v8)
- [Test Sharding](https://vitest.dev/guide/features.html#sharding)

## Summary

This testing infrastructure provides:

✅ **Fast**: Parallel execution across all CPU cores
✅ **Scalable**: Test sharding for distributed execution
✅ **Reliable**: Comprehensive coverage reporting
✅ **Flexible**: Multiple execution strategies
✅ **CI/CD Ready**: JSON reports and exit codes for automation

Run `npm test` to execute all tests with optimal performance!
