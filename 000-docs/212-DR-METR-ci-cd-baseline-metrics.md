# CI/CD Baseline Metrics & Performance Targets

> **Document**: 212-DR-METR-ci-cd-baseline-metrics
> **Epic**: EPIC 007 - CI/CD Golden Paths
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Baseline measurements and performance targets for GWI CI/CD pipelines. Tracks build times, test duration, flake rates, and optimization opportunities.

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CI/CD PIPELINE FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   Trigger   │───▶│   Quality   │───▶│    Build    │                  │
│  │  (PR/Push)  │    │    Gates    │    │   & Test    │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                           │                   │                          │
│                           │                   │                          │
│                           ▼                   ▼                          │
│                    ┌─────────────┐    ┌─────────────┐                   │
│                    │   Security  │    │   Docker    │                   │
│                    │    Scan     │    │   Images    │                   │
│                    └─────────────┘    └─────────────┘                   │
│                           │                   │                          │
│                           │                   │                          │
│                           └───────┬───────────┘                          │
│                                   │                                      │
│                                   ▼                                      │
│                    ┌─────────────────────────────┐                       │
│                    │          Deploy             │                       │
│                    │   (Dev → Staging → Prod)    │                       │
│                    └─────────────────────────────┘                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Baseline Measurements

### Job Duration Baseline (2026-02-03)

| Job | Current P50 | Current P95 | Target P50 | Target P95 |
|-----|-------------|-------------|------------|------------|
| Quality Checks | 45s | 60s | 30s | 45s |
| Build & Test | 4m 30s | 6m | 3m | 4m |
| Docker Images | 3m | 4m 30s | 2m | 3m |
| Deploy Dev | 2m 30s | 3m 30s | 2m | 2m 30s |
| Deploy Prod | 3m | 4m | 2m 30s | 3m |
| **Total Pipeline** | **13m** | **18m** | **10m** | **13m** |

### Build Step Breakdown

| Step | Duration | % of Total | Optimization Potential |
|------|----------|------------|------------------------|
| Checkout | 5s | 1% | Low - already fast |
| npm ci | 90s | 20% | High - cache dependencies |
| Lint | 30s | 7% | Medium - parallel linting |
| Build | 120s | 27% | High - Turbo caching |
| Typecheck | 45s | 10% | Medium - incremental |
| Test | 120s | 27% | High - parallel + sharding |
| Upload artifacts | 15s | 3% | Low |

### Test Suite Metrics

| Suite | Tests | Duration | Flake Rate | Target Flake |
|-------|-------|----------|------------|--------------|
| Unit Tests | 324 | 45s | 0.3% | < 0.1% |
| Integration | 87 | 60s | 1.2% | < 0.5% |
| Contract (ARV) | 42 | 30s | 0.1% | < 0.1% |
| Golden Tests | 18 | 15s | 0% | 0% |
| **Total** | **471** | **150s** | **0.5%** | **< 0.2%** |

---

## Flake Rate Tracking

### Definition

```
flake_rate = (flaky_failures / total_runs) × 100
```

A test is considered flaky if it:
- Passes on retry without code changes
- Has inconsistent results across identical runs
- Fails due to timing/race conditions

### Current Flaky Tests

| Test File | Flake Rate | Root Cause | Fix Priority |
|-----------|------------|------------|--------------|
| `webhook.integration.test.ts` | 2.1% | Network timeout | P1 |
| `queue.test.ts` | 1.5% | Race condition | P1 |
| `storage.firestore.test.ts` | 0.8% | Emulator startup | P2 |
| `agent.resolver.test.ts` | 0.5% | Mock timing | P2 |

### Flake Rate History

```
Week 1 (Jan 27): 1.2%
Week 2 (Feb 03): 0.5%  ← Current
Target:          0.2%
```

### Flake Detection Query

```sql
-- BigQuery: Detect flaky tests
SELECT
  test_name,
  COUNT(*) as total_runs,
  COUNTIF(passed = false AND retry_passed = true) as flaky_failures,
  SAFE_DIVIDE(
    COUNTIF(passed = false AND retry_passed = true),
    COUNT(*)
  ) * 100 as flake_rate
FROM `gwi.ci_test_results`
WHERE run_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY test_name
HAVING flake_rate > 0.1
ORDER BY flake_rate DESC
```

---

## Caching Strategy

### npm Dependency Cache

```yaml
# Current implementation
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

# Cache hit rate: 85%
# Savings: ~60s per run
```

### Turbo Remote Cache

```yaml
# Proposed: Add Turbo remote cache
- name: Setup Turbo Cache
  uses: actions/cache@v4
  with:
    path: |
      .turbo
      node_modules/.cache/turbo
    key: turbo-${{ runner.os }}-${{ hashFiles('**/turbo.json', '**/package-lock.json') }}
    restore-keys: |
      turbo-${{ runner.os }}-

# Expected improvement: 40% faster builds
```

### Docker Layer Cache

```yaml
# Current: No layer caching
# Proposed: Add BuildKit cache
- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    context: .
    file: apps/api/Dockerfile
    push: true
    tags: ${{ env.REGISTRY }}/api:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max

# Expected improvement: 50% faster image builds
```

### Cache Performance

| Cache Type | Hit Rate | Time Saved | Monthly Savings |
|------------|----------|------------|-----------------|
| npm dependencies | 85% | 60s/run | 300 min |
| Turbo build | 70%* | 90s/run | 450 min* |
| Docker layers | 60%* | 120s/run | 600 min* |
| TypeScript incremental | 90% | 30s/run | 150 min |

*Projected after implementation

---

## Parallelization Opportunities

### Current Sequential Flow

```
Quality Checks (45s) → Build (120s) → Test (150s) → Images (180s)
Total: ~8 minutes
```

### Proposed Parallel Flow

```
┌─ Quality Checks (45s) ─┐
├─ Lint (30s)            │
│                        ├─ Build (120s) ─┬─ Test (150s) ─┬─ Images (180s)
├─ Security Scan (60s)   │                │               │
└─ Format Check (15s)   ─┘                │               │
                                          │               │
                         ┌─ Unit Tests ───┤               │
                         ├─ Integration ──┤               │
                         └─ Contract ─────┘               │
                                                          │
                                          ┌─ API Image ───┤
                                          ├─ Gateway ─────┤
                                          ├─ Webhook ─────┤
                                          └─ Worker ──────┘
```

### Test Sharding

```yaml
# Proposed: Split tests across runners
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npm run test -- --shard=${{ matrix.shard }}/4

# Expected: 150s → 45s (with 4 shards)
```

### Parallel Job Configuration

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - run: npm run typecheck

  test-unit:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2]
    steps:
      - run: npm run test:unit -- --shard=${{ matrix.shard }}/2

  test-integration:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:integration

  build:
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    steps:
      - run: npm run build

  images:
    needs: [build, test-unit, test-integration]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api, gateway, webhook, worker]
    steps:
      - run: docker build -f apps/${{ matrix.service }}/Dockerfile .
```

---

## Performance Targets

### Build Time SLOs

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| PR Check (P95) | 8m | 5m | Q1 2026 |
| Main Branch (P95) | 18m | 12m | Q1 2026 |
| Flake Rate | 0.5% | 0.1% | Q1 2026 |
| Cache Hit Rate | 85% | 95% | Q1 2026 |

### Developer Feedback Loop

| Event | Target Response Time |
|-------|---------------------|
| First CI feedback | < 2 minutes |
| Full PR status | < 6 minutes |
| Deploy to dev | < 10 minutes |
| Deploy to prod | < 15 minutes |

---

## Monitoring & Alerts

### CI Metrics Dashboard

Track these metrics in Grafana/Datadog:

```yaml
metrics:
  - name: ci_pipeline_duration_seconds
    type: histogram
    labels: [workflow, job, branch]

  - name: ci_job_failure_total
    type: counter
    labels: [workflow, job, reason]

  - name: ci_test_flake_total
    type: counter
    labels: [test_name, suite]

  - name: ci_cache_hit_total
    type: counter
    labels: [cache_type]

  - name: ci_queue_time_seconds
    type: histogram
    labels: [runner_type]
```

### Alert Rules

```yaml
alerts:
  - name: CIPipelineSlow
    condition: ci_pipeline_duration_seconds{quantile="0.95"} > 1200
    severity: warning
    summary: "CI pipeline P95 exceeds 20 minutes"

  - name: CIFlakeRateHigh
    condition: rate(ci_test_flake_total[1h]) > 0.01
    severity: warning
    summary: "Test flake rate exceeds 1%"

  - name: CICacheHitLow
    condition: rate(ci_cache_hit_total[1h]) / rate(ci_cache_total[1h]) < 0.7
    severity: info
    summary: "Cache hit rate below 70%"
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1)

- [ ] Enable Turbo remote cache
- [ ] Add Docker layer caching
- [ ] Fix top 2 flaky tests
- [ ] Parallel lint/typecheck

### Phase 2: Optimization (Week 2-3)

- [ ] Test sharding (4 shards)
- [ ] Parallel Docker builds
- [ ] TypeScript incremental builds
- [ ] Reduce checkout depth

### Phase 3: Monitoring (Week 4)

- [ ] CI metrics dashboard
- [ ] Flake detection automation
- [ ] Performance regression alerts
- [ ] Weekly reports

---

## Related Documentation

- [213-DR-SPEC-ci-optimization-playbook.md](./213-DR-SPEC-ci-optimization-playbook.md)
- [214-DR-TMPL-release-automation.md](./214-DR-TMPL-release-automation.md)
- [034-DR-CHKL-release-process.md](./034-DR-CHKL-release-process.md)
