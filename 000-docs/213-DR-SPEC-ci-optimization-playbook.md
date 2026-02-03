# CI/CD Optimization Playbook

> **Document**: 213-DR-SPEC-ci-optimization-playbook
> **Epic**: EPIC 007 - CI/CD Golden Paths
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Detailed optimization strategies for GWI CI/CD pipelines. Covers caching, parallelization, test optimization, and workflow improvements.

---

## Optimization Categories

| Category | Potential Savings | Implementation Effort |
|----------|-------------------|----------------------|
| Caching | 40-60% | Low |
| Parallelization | 30-50% | Medium |
| Test Optimization | 20-40% | Medium |
| Incremental Builds | 25-35% | Low |
| Runner Optimization | 10-20% | Low |

---

## 1. Caching Strategies

### 1.1 npm/pnpm Dependency Cache

```yaml
# Optimal npm caching with actions/setup-node
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: '**/package-lock.json'
```

**Key points:**
- Uses `package-lock.json` hash for cache key
- Caches `~/.npm` directory
- Hit rate target: > 90%

### 1.2 Turbo Remote Cache

```yaml
# Enable Turbo remote cache for monorepo builds
- name: Setup Turbo Remote Cache
  run: |
    npx turbo login --token=${{ secrets.TURBO_TOKEN }}
    npx turbo link --team=${{ vars.TURBO_TEAM }}

- name: Build with remote cache
  run: npx turbo build --cache-dir=.turbo
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

**Alternative: Self-hosted cache**

```yaml
# Using GitHub Actions cache as Turbo backend
- name: Turbo Cache
  uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-

- name: Build
  run: npm run build
  env:
    TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets.TURBO_SIGNATURE_KEY }}
```

### 1.3 Docker BuildKit Cache

```yaml
# Enable BuildKit caching with GitHub Actions cache backend
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and push API
  uses: docker/build-push-action@v5
  with:
    context: .
    file: apps/api/Dockerfile
    push: true
    tags: ${{ env.REGISTRY }}/api:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
    build-args: |
      BUILDKIT_INLINE_CACHE=1
```

### 1.4 TypeScript Incremental Compilation

```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

```yaml
# Cache TypeScript build info
- name: TypeScript Cache
  uses: actions/cache@v4
  with:
    path: |
      **/.tsbuildinfo
      **/tsconfig.tsbuildinfo
    key: tsc-${{ runner.os }}-${{ hashFiles('**/tsconfig.json', '**/*.ts') }}
    restore-keys: |
      tsc-${{ runner.os }}-
```

### 1.5 ESLint Cache

```json
// package.json
{
  "scripts": {
    "lint": "eslint . --cache --cache-location .eslintcache"
  }
}
```

```yaml
- name: ESLint Cache
  uses: actions/cache@v4
  with:
    path: .eslintcache
    key: eslint-${{ runner.os }}-${{ hashFiles('**/eslintrc*', '**/.eslintrc*') }}
```

---

## 2. Parallelization Strategies

### 2.1 Job-Level Parallelization

```yaml
jobs:
  # Run these in parallel (no dependencies)
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high

  # These depend on the parallel jobs
  build:
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

### 2.2 Test Sharding

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --shard=${{ matrix.shard }}/${{ strategy.job-total }}
```

**Vitest sharding config:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Enable sharding when shard index provided
    ...(process.env.VITEST_SHARD && {
      shard: process.env.VITEST_SHARD,
    }),
  },
});
```

### 2.3 Docker Build Parallelization

```yaml
jobs:
  build-images:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - { name: api, dockerfile: apps/api/Dockerfile }
          - { name: gateway, dockerfile: apps/gateway/Dockerfile }
          - { name: webhook, dockerfile: apps/github-webhook/Dockerfile }
          - { name: worker, dockerfile: apps/worker/Dockerfile }
    steps:
      - uses: actions/checkout@v4

      - name: Build ${{ matrix.service.name }}
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ${{ matrix.service.dockerfile }}
          push: true
          tags: ${{ env.REGISTRY }}/${{ matrix.service.name }}:${{ github.sha }}
          cache-from: type=gha,scope=${{ matrix.service.name }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service.name }}
```

### 2.4 Turbo Parallel Execution

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

```bash
# Run lint, typecheck, test in parallel after build
npx turbo run lint typecheck test --parallel
```

---

## 3. Test Optimization

### 3.1 Test Categorization

```
tests/
├── unit/           # Fast, no I/O (< 100ms each)
├── integration/    # External deps (< 1s each)
├── e2e/           # Full stack (< 10s each)
└── golden/        # Snapshot comparison (< 500ms each)
```

### 3.2 Selective Test Running

```yaml
# Run only affected tests on PRs
- name: Affected Tests
  run: |
    # Get changed files
    CHANGED=$(git diff --name-only origin/main...HEAD)

    # Map files to test patterns
    if echo "$CHANGED" | grep -q "packages/core/"; then
      npm test -- packages/core
    fi

    if echo "$CHANGED" | grep -q "apps/api/"; then
      npm test -- apps/api
    fi
```

**Turbo affected:**

```bash
# Only run tests for changed packages
npx turbo run test --filter="...[origin/main]"
```

### 3.3 Test Timeout Optimization

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 5000,      // Default 5s
    hookTimeout: 10000,     // Setup/teardown 10s
    teardownTimeout: 1000,  // Cleanup 1s
  },
});
```

### 3.4 Mock External Services

```typescript
// Replace real API calls with mocks in CI
beforeAll(() => {
  if (process.env.CI) {
    vi.mock('@gwi/integrations', () => ({
      GitHubClient: MockGitHubClient,
      GitLabClient: MockGitLabClient,
    }));
  }
});
```

---

## 4. Workflow Optimization

### 4.1 Conditional Job Execution

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
      infra: ${{ steps.filter.outputs.infra }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            backend:
              - 'packages/**'
              - 'apps/api/**'
              - 'apps/worker/**'
            frontend:
              - 'apps/web/**'
            infra:
              - 'infra/**'

  build-backend:
    needs: changes
    if: ${{ needs.changes.outputs.backend == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: npm run build:backend

  build-frontend:
    needs: changes
    if: ${{ needs.changes.outputs.frontend == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: npm run build:frontend

  deploy-infra:
    needs: changes
    if: ${{ needs.changes.outputs.infra == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: tofu plan
```

### 4.2 Merge Queue

```yaml
# .github/merge-queue.yml
name: Merge Queue

on:
  merge_group:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - run: npm run build
```

### 4.3 Fail Fast vs Resilient

```yaml
strategy:
  # For development: Fail fast to save resources
  fail-fast: true
  matrix:
    os: [ubuntu-latest, macos-latest]

# For releases: Run all to gather complete results
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
```

---

## 5. Runner Optimization

### 5.1 Use Larger Runners for Builds

```yaml
jobs:
  build:
    runs-on: ubuntu-latest-8-cores  # 8 core runner
    steps:
      - run: npm run build
```

### 5.2 Self-Hosted Runners for Docker

```yaml
jobs:
  build-images:
    runs-on: [self-hosted, linux, docker]
    steps:
      - run: docker build .
```

### 5.3 Container Jobs

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: node:20-slim
      options: --user root
    steps:
      # Already have Node.js, skip setup
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
```

---

## 6. Monitoring & Feedback

### 6.1 CI Analytics

```yaml
# Post job metrics to Datadog
- name: Report CI Metrics
  if: always()
  run: |
    curl -X POST "https://api.datadoghq.com/api/v1/series" \
      -H "Content-Type: application/json" \
      -H "DD-API-KEY: ${{ secrets.DD_API_KEY }}" \
      -d '{
        "series": [{
          "metric": "ci.job.duration",
          "points": [["'"$(date +%s)"'", '"${{ job.duration }}"']],
          "tags": ["job:${{ github.job }}", "workflow:${{ github.workflow }}"]
        }]
      }'
```

### 6.2 Slack Notifications

```yaml
- name: Notify on Failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "CI Failed: ${{ github.repository }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Workflow:* ${{ github.workflow }}\n*Job:* ${{ github.job }}\n*Branch:* ${{ github.ref_name }}"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Implementation Checklist

### Week 1: Caching

- [ ] Enable Turbo remote cache
- [ ] Add Docker BuildKit cache
- [ ] Configure TypeScript incremental
- [ ] Add ESLint cache

### Week 2: Parallelization

- [ ] Split lint/typecheck into parallel jobs
- [ ] Implement test sharding (4 shards)
- [ ] Parallelize Docker builds
- [ ] Add path filtering

### Week 3: Test Optimization

- [ ] Fix top 5 flaky tests
- [ ] Add test timeouts
- [ ] Implement selective test running
- [ ] Mock external services in CI

### Week 4: Monitoring

- [ ] Add CI metrics collection
- [ ] Create performance dashboard
- [ ] Set up alerts for regressions
- [ ] Document optimization results

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| PR Check (P95) | 8m | 4m | 50% |
| Main Branch (P95) | 18m | 10m | 44% |
| Flake Rate | 0.5% | 0.1% | 80% |
| Cache Hit Rate | 85% | 95% | 12% |
| Runner Minutes/week | 2000 | 1200 | 40% |

---

## Related Documentation

- [212-DR-METR-ci-cd-baseline-metrics.md](./212-DR-METR-ci-cd-baseline-metrics.md)
- [214-DR-TMPL-release-automation.md](./214-DR-TMPL-release-automation.md)
