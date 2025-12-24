# GitHub Actions Workflows

This directory contains automated workflows for the Git With Intent platform.

## Workflows

### CI/CD Pipelines

#### `ci.yml` - Continuous Integration
- **Trigger:** Push to any branch, pull requests
- **Purpose:** Build, test, typecheck, and lint all packages
- **Duration:** ~5-10 minutes
- **Key Steps:**
  - Install dependencies
  - Build all packages (Turbo)
  - Run ~1700 tests
  - Type checking
  - Linting

#### `arv.yml` - Agent Readiness Verification
- **Trigger:** Push to main/develop, pull requests
- **Purpose:** Enforce code quality standards
- **Duration:** ~2-3 minutes
- **Checks:**
  - Forbidden patterns (no deprecated code)
  - Contract validation (Zod schemas)
  - Golden tests (deterministic outputs)
  - Smoke tests (boot check)

### Infrastructure

#### `tofu-plan.yml` - Infrastructure Planning
- **Trigger:** Pull requests affecting `infra/`
- **Purpose:** Preview infrastructure changes
- **Duration:** ~3-5 minutes
- **Key Steps:**
  - Authenticate via Workload Identity Federation
  - Run OpenTofu plan
  - Post plan summary as PR comment

#### `tofu-apply.yml` - Infrastructure Deployment
- **Trigger:** Push to main (after merge)
- **Purpose:** Apply infrastructure changes to production
- **Duration:** ~5-10 minutes
- **Environment:** prod
- **Key Steps:**
  - Authenticate via WIF
  - Run OpenTofu apply
  - Deploy to Cloud Run
  - Update service configurations

#### `drift-detection.yml` - Infrastructure Drift Detection
- **Trigger:** Weekly (Sunday midnight UTC), manual
- **Purpose:** Detect manual changes to infrastructure
- **Duration:** ~3-5 minutes
- **Actions:**
  - Create issue if drift detected
  - Post drift summary
  - Notify team

### Monitoring and Reporting

#### `auto-fix-report.yml` - Weekly Performance Report
- **Trigger:** Weekly (Monday 9am UTC), manual
- **Purpose:** Generate comprehensive performance analytics
- **Duration:** ~10-15 seconds
- **Key Steps:**
  - Download analytics database from GCS
  - Query performance metrics
  - Generate markdown report with charts
  - Post to GitHub Discussions
- **Report Contents:**
  - Executive summary
  - Week-over-week comparison
  - Success rates by repository
  - Cost analysis with trend charts
  - Grade distribution
  - Performance metrics (P50/P95/P99)
  - Quality trends
  - Top errors
  - Repository leaderboard
  - Actionable recommendations

### Code Assistance

#### `code-assist.yml` - Code Review Assistant
- **Trigger:** Issue/PR comments with `/gwi` commands
- **Purpose:** AI-powered code assistance
- **Duration:** ~30-60 seconds
- **Commands:**
  - `/gwi triage` - Analyze complexity
  - `/gwi plan` - Generate resolution plan
  - `/gwi resolve` - Apply fixes
  - `/gwi review` - Generate review summary

## Configuration

### Environment Variables

Required for all workflows:

| Variable | Description | Used By |
|----------|-------------|---------|
| `GITHUB_TOKEN` | Automatic token | All workflows |
| `GCP_PROJECT_ID` | Google Cloud project | Infrastructure workflows |
| `WIF_PROVIDER` | Workload Identity Federation provider | Infrastructure workflows |
| `WIF_SERVICE_ACCOUNT` | Service account email | Infrastructure workflows |
| `ANALYTICS_BUCKET` | GCS bucket for analytics DB | auto-fix-report |

### Secrets

Managed via GitHub Secrets:

- **Repository Secrets:** Development/staging credentials
- **Environment Secrets:** Production credentials (gated)
- **Organization Secrets:** Shared across multiple repos

### Permissions

Each workflow declares minimal required permissions:

```yaml
permissions:
  contents: read
  id-token: write
  pull-requests: write
```

## Workflow Dependencies

```
ci.yml
  └─> Must pass before merge

arv.yml
  └─> Must pass before merge

tofu-plan.yml
  └─> Runs on PR
       └─> tofu-apply.yml
            └─> Runs on merge to main

drift-detection.yml
  └─> Weekly monitoring
       └─> Creates issue if drift detected

auto-fix-report.yml
  └─> Weekly reporting
       └─> Posts to Discussions
```

## Best Practices

### Adding New Workflows

1. **Name clearly** - Use descriptive workflow names
2. **Set permissions** - Minimal required permissions only
3. **Add documentation** - Update this README
4. **Test thoroughly** - Test on development branch first
5. **Use caching** - Cache dependencies when possible
6. **Set timeouts** - Prevent runaway jobs

### Workflow Structure

```yaml
name: Descriptive Name

on:
  push:
    branches: [main, develop]
  pull_request:
  workflow_dispatch:  # Always include for manual trigger

env:
  # Global environment variables

permissions:
  # Minimal required permissions

jobs:
  job-name:
    name: Human Readable Name
    runs-on: ubuntu-latest
    timeout-minutes: 10  # Always set timeout

    steps:
      - uses: actions/checkout@v4
      # ... steps
```

### Security

- **No secrets in code** - Use GitHub Secrets
- **Workload Identity Federation** - No service account keys
- **Minimal permissions** - Only what's required
- **Environment protection** - Prod requires approval
- **Audit logging** - All deployments logged

### Performance

- **Cache dependencies** - `npm ci` with cache
- **Parallel jobs** - Run independent jobs in parallel
- **Turbo build system** - Efficient monorepo builds
- **Conditional steps** - Skip unnecessary steps

## Monitoring

### Workflow Status

View workflow runs:
- **GitHub UI:** Actions tab
- **CLI:** `gh run list`
- **API:** `GET /repos/{owner}/{repo}/actions/runs`

### Failure Notifications

Failed workflows notify via:
- GitHub UI (badge on PR)
- Email (to committer)
- Slack (if configured)

### Metrics

Track workflow performance:
- Duration trends
- Success rates
- Cost per run
- Resource utilization

## Troubleshooting

### Common Issues

#### Workflow Not Triggering

**Problem:** Push to branch doesn't trigger workflow

**Solutions:**
1. Check trigger conditions in `on:` section
2. Verify branch name matches pattern
3. Check workflow file syntax (YAML valid)
4. Ensure workflow is on default branch

#### Authentication Failures

**Problem:** `gcloud` or `tofu` authentication fails

**Solutions:**
1. Verify WIF_PROVIDER is correct
2. Check service account has required roles
3. Confirm id-token: write permission set
4. Review workload identity pool configuration

#### Build Failures

**Problem:** `npm ci` or `npm run build` fails

**Solutions:**
1. Check package.json for correct dependencies
2. Verify Node version matches engines requirement
3. Clear cache and retry
4. Check for platform-specific issues

#### Workflow Timeout

**Problem:** Workflow exceeds timeout limit

**Solutions:**
1. Increase timeout-minutes value
2. Optimize slow steps (caching, parallelization)
3. Break into multiple jobs
4. Review resource constraints

### Debug Mode

Enable debug logging:

1. Go to Settings → Secrets and variables → Actions
2. Add secret: `ACTIONS_STEP_DEBUG` = `true`
3. Re-run workflow
4. View detailed logs

## Related Documentation

- **Infrastructure:** `infra/README.md`
- **Performance Reporting:** `000-docs/130-DR-PERF-auto-fix-performance-reporting.md`
- **DevOps Playbook:** `000-docs/126-AA-AUDT-appaudit-devops-playbook.md`
- **Disaster Recovery:** `000-docs/112-DR-RUNB-disaster-recovery-runbook.md`

## Contributing

When modifying workflows:

1. Test on feature branch first
2. Document changes in this README
3. Update related documentation
4. Add tests for new functionality
5. Request review from DevOps team
6. Monitor first production run

---

**Last Updated:** 2025-12-24
**Maintainer:** DevOps Team
