# CI/CD Pipeline Documentation

Complete CI/CD automation using GitHub Actions with parallel testing, automated builds, and deployment to Google Cloud Platform.

## Overview

The CI/CD pipeline consists of 5 main workflows:

1. **Test** (`test.yml`) - Parallel test execution with sharding
2. **CI Enhanced** (`ci-enhanced.yml`) - Build, lint, security checks
3. **Deploy** (`deploy.yml`) - Staging and production deployments
4. **Release** (`release.yml`) - Automated release management
5. **ARV** (`arv.yml`) - Agent Readiness Verification

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Pull Request / Push                      │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┬────────────┬───────────┐
         │                       │            │           │
    ┌────▼────┐            ┌────▼────┐  ┌───▼────┐ ┌───▼────┐
    │Security │            │  Lint   │  │  ARV   │ │ Tests  │
    │ Checks  │            │& Types  │  │ Checks │ │(4 shards)│
    └────┬────┘            └────┬────┘  └───┬────┘ └───┬────┘
         │                      │           │          │
         └──────────────────────┴───────────┴──────────┘
                                │
                           ┌────▼─────┐
                           │  Build   │
                           └────┬─────┘
                                │
                    ┌───────────┴──────────┐
                    │                      │
              ┌─────▼──────┐         ┌────▼─────┐
              │   Staging  │         │   Prod   │
              │   Deploy   │         │  Deploy  │
              └────────────┘         └──────────┘
```

## Workflows

### 1. Test Workflow (`test.yml`)

**Triggers**: All pushes and PRs
**Duration**: ~5-8 minutes (parallel)
**Shards**: 4 parallel test shards

**Features**:
- ✅ Parallel test execution (4 shards)
- ✅ Test coverage collection
- ✅ Coverage report merging
- ✅ PR comment with coverage
- ✅ Test result summary

**Usage**:
```bash
# Runs automatically on PR/push
# Or manually: gh workflow run test.yml
```

**Shard Distribution**:
- Shard 1/4: ~25% of tests
- Shard 2/4: ~25% of tests
- Shard 3/4: ~25% of tests
- Shard 4/4: ~25% of tests

Total parallel speedup: **~4x faster**

### 2. CI Enhanced Workflow (`ci-enhanced.yml`)

**Triggers**: All pushes and PRs
**Duration**: ~10-15 minutes
**Jobs**: Security → Lint → Build → ARV → Tests

**Security Checks**:
- ✅ Secret scanning (gitleaks)
- ✅ .env file verification
- ✅ Code pattern analysis
- ✅ Dependency vulnerability scan

**Quality Checks**:
- ✅ ESLint
- ✅ TypeScript type checking
- ✅ Prettier format check
- ✅ Build verification

**Caching**:
- ✅ npm dependencies
- ✅ Turbo cache
- ✅ Build artifacts

### 3. Deploy Workflow (`deploy.yml`)

**Triggers**:
- Push to `main` → Production
- Push to `develop` → Staging
- Version tags (`v*`) → Production
- Manual trigger → User choice

**Environments**:
- **Staging**: `develop` branch
- **Production**: `main` branch or tags

**Deployment Steps**:
1. Build Docker images (API, Gateway, Webhook, Worker)
2. Push to Artifact Registry
3. Deploy with OpenTofu
4. Health checks
5. Smoke tests (staging only)

**Image Tags**:
- `{version}` - Specific version (e.g., `dc0b8ba`)
- `{env}` - Environment tag (e.g., `staging`, `production`)
- `latest-{env}` - Latest for environment

**Usage**:
```bash
# Auto-deploy staging
git push origin develop

# Auto-deploy production
git push origin main

# Manual deploy
gh workflow run deploy.yml \
  -f environment=staging \
  -f version=abc123
```

### 4. Release Workflow (`release.yml`)

**Triggers**:
- Push version tag (`v1.0.0`)
- Manual trigger

**Release Process**:
1. ✅ Validate version format
2. ✅ Run full test suite
3. ✅ Build release artifacts
4. ✅ Generate changelog
5. ✅ Create GitHub release
6. ✅ Deploy to production (stable only)
7. ✅ Publish to npm (optional)

**Version Format**:
- Stable: `v1.0.0`, `v0.2.1`
- Pre-release: `v1.0.0-alpha.1`, `v0.2.0-beta`

**Usage**:
```bash
# Create and push tag
git tag v1.0.0
git push origin v1.0.0

# Or manually
gh workflow run release.yml \
  -f version=v1.0.0 \
  -f draft=false
```

**Changelog Generation**:
Automatically generates changelog from git commits between tags.

### 5. ARV Workflow (`arv.yml`)

**Triggers**: PRs, scheduled daily
**Duration**: ~5 minutes

**Checks**:
- ✅ Forbidden patterns (deprecated code)
- ✅ Contract validation (Zod schemas)
- ✅ Golden tests (deterministic outputs)
- ✅ Smoke tests (boot check)

## Secrets & Variables

### Required Secrets

| Secret | Description | Where Used |
|--------|-------------|------------|
| `NPM_TOKEN` | npm publish token | Release workflow |
| `ANTHROPIC_API_KEY` | Anthropic API key | Tests (optional) |
| `GOOGLE_AI_API_KEY` | Google AI key | Tests (optional) |

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | GCP project ID | `gwi-production` |
| `WIF_PROVIDER` | Workload Identity provider | `projects/123.../providers/...` |
| `WIF_SERVICE_ACCOUNT` | Service account email | `gh-actions@....iam.gserviceaccount.com` |

## Environments

GitHub Environments with protection rules:

### Staging
- **Branch**: `develop`
- **Protection**: None
- **Auto-deploy**: Yes

### Production
- **Branch**: `main`
- **Protection**: Required reviewers (optional)
- **Auto-deploy**: Yes (on main push)

## Caching Strategy

### npm Dependencies
```yaml
key: ${{ runner.os }}-node-${{ env.NODE_VERSION }}-${{ hashFiles('**/package-lock.json') }}
```
**Hit Rate**: ~90%
**Time Saved**: ~2-3 minutes

### Turbo Cache
```yaml
key: ${{ runner.os }}-turbo-${{ github.sha }}
```
**Hit Rate**: ~60%
**Time Saved**: ~1-2 minutes

### Build Artifacts
**Retention**: 7 days
**Size**: ~50MB per build

## Performance Metrics

### Test Execution

| Metric | Without Sharding | With 4 Shards | Speedup |
|--------|------------------|---------------|---------|
| Total Tests | ~623 | ~623 | - |
| Duration | ~180s | ~45s | 4x |
| Parallelism | Sequential | 4 shards | 4x |

### CI Pipeline

| Stage | Duration | Caching Impact |
|-------|----------|----------------|
| Security | 30-60s | Minimal |
| Lint | 60-90s | npm cache |
| Build | 120-180s | npm + Turbo |
| Tests | 240-300s | npm cache |
| **Total** | **8-12 min** | **~3 min saved** |

## Monitoring & Debugging

### View Workflow Runs

```bash
# List recent runs
gh run list

# View specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log

# Re-run failed jobs
gh run rerun <run-id> --failed
```

### Common Issues

#### 1. Test Failures

**Problem**: Tests pass locally but fail in CI

**Solutions**:
- Check environment variables
- Verify Node.js version matches
- Check for flaky tests
- Review test isolation

```bash
# Run tests locally with CI mode
CI=true npm test
```

#### 2. Build Failures

**Problem**: Build succeeds locally but fails in CI

**Solutions**:
- Clear npm cache
- Check TypeScript strict mode
- Verify all dependencies in package.json

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### 3. Deployment Failures

**Problem**: Deployment fails with authentication errors

**Solutions**:
- Verify WIF configuration
- Check service account permissions
- Validate Artifact Registry access

```bash
# Test WIF locally
gcloud auth application-default login
```

## Best Practices

### 1. Commit Messages

Follow Conventional Commits for changelog generation:

```
feat: add new feature
fix: resolve bug
docs: update documentation
test: add tests
chore: update dependencies
```

### 2. Branch Strategy

- `main` - Production (stable)
- `develop` - Staging (integration)
- `feat/*` - Feature branches
- `fix/*` - Bug fixes

### 3. PR Workflow

1. Create feature branch from `develop`
2. Make changes and commit
3. Push and create PR to `develop`
4. CI runs automatically
5. Review and merge
6. Auto-deploy to staging

### 4. Release Process

1. Merge `develop` to `main`
2. Create version tag
3. Push tag
4. Release workflow runs
5. Auto-deploy to production

## Cost Optimization

### GitHub Actions Minutes

**Free Tier**: 2,000 minutes/month
**Typical Usage**: ~500 minutes/month

**Optimization Tips**:
- ✅ Use caching extensively
- ✅ Fail fast on errors
- ✅ Skip jobs when not needed
- ✅ Use matrix builds efficiently

### GCP Costs

**Cloud Run**: Pay per request
**Artifact Registry**: Storage costs
**Cloud Build**: Build minutes

**Estimated**: $50-100/month for staging + production

## Troubleshooting

### Check Workflow Status

```bash
# View all workflows
gh workflow list

# View specific workflow runs
gh run list --workflow=test.yml

# Download logs
gh run download <run-id>
```

### Re-run Workflows

```bash
# Re-run all jobs
gh run rerun <run-id>

# Re-run only failed jobs
gh run rerun <run-id> --failed
```

### Manual Triggers

```bash
# Trigger deployment
gh workflow run deploy.yml \
  -f environment=staging

# Trigger release
gh workflow run release.yml \
  -f version=v1.0.0
```

## Future Enhancements

- [ ] E2E tests in CI
- [ ] Performance benchmarking
- [ ] Lighthouse CI for web app
- [ ] Automated rollback on failures
- [ ] Canary deployments
- [ ] Blue-green deployments
- [ ] Integration with monitoring

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest Documentation](https://vitest.dev/)
- [OpenTofu Documentation](https://opentofu.org/)
- [Google Cloud Run](https://cloud.google.com/run)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
