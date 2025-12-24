# Auto-Fix Workflow Health Monitoring

## Quick Start

The Auto-Fix Health Monitoring system automatically monitors your auto-fix workflow every 6 hours. No setup required - it works out of the box!

### View Health Status

1. **GitHub Actions**: Navigate to Actions → Auto-Fix Health Monitor
2. **Workflow Summary**: Each run includes a detailed health report
3. **Artifacts**: Download JSON reports for detailed analysis

### Manual Health Check

Trigger a manual check at any time:

```bash
# Via GitHub UI
Actions → Auto-Fix Health Monitor → Run workflow

# Via CLI (requires gh CLI)
gh workflow run auto-fix-monitor.yml

# Local testing
npx tsx scripts/monitor-autofix-health.ts --dry-run
```

## What It Monitors

### Workflow Health
- ✅ Success/failure rates
- ✅ Average execution duration
- ✅ Stuck or hung workflow runs
- ✅ Concurrent run limits

### Database Health
- ✅ SQLite integrity checks
- ✅ Database size monitoring
- ✅ Stuck runs detection
- ✅ Connection health

### Performance Metrics
- ✅ Average run duration
- ✅ P95 latency
- ✅ Performance variance
- ✅ Trend analysis

## Alert Thresholds

Default thresholds (configurable in workflow):

| Metric | Threshold | Alert Level |
|--------|-----------|-------------|
| Failure Rate | >20% | High |
| Success Rate | <50% | Critical |
| Avg Duration | >600s (10min) | Medium |
| Database Size | >100 MB | Medium |
| Stuck Runs | >2 hours | High |
| Concurrent Runs | >3 | Medium |

## Alert Types

### 1. High Failure Rate
**When:** >20% of auto-fix runs fail

**What happens:**
- GitHub issue created with label `auto-fix,alert,high-failure-rate,p1`
- Issue includes failed run analysis and remediation steps

**What to do:**
1. Review failed workflow logs
2. Check AI provider quotas
3. Verify database health
4. Review recent code changes

### 2. Stuck Runs
**When:** Runs in "running" state for >2 hours

**What happens:**
- GitHub issue created with label `auto-fix,alert,stuck-runs,p1`
- Issue includes SQL cleanup commands

**What to do:**
1. Cancel hung workflows in GitHub Actions
2. Run cleanup SQL to mark as failed
3. Review logs for root cause

### 3. Database Problems
**When:** Integrity check fails OR size >100 MB

**What happens:**
- GitHub issue created with label `auto-fix,alert,database,p2`
- Issue includes recovery procedures

**What to do:**
1. Backup database immediately
2. Run integrity recovery if corrupted
3. Archive old data if too large

### 4. Slow Performance
**When:** Average duration >2x baseline (600s)

**What happens:**
- Warning in workflow summary
- Recommendations for optimization

**What to do:**
1. Review AI provider latency
2. Check for large files being processed
3. Optimize AI prompts
4. Review database query performance

## Configuration

### Adjust Thresholds

Edit `.github/workflows/auto-fix-monitor.yml`:

```yaml
env:
  FAILURE_RATE_THRESHOLD: 20  # Change to 30 for less sensitive
  SLOW_PERFORMANCE_THRESHOLD: 2.0  # Change to 3.0 for less sensitive
  DB_SIZE_THRESHOLD_MB: 100  # Change to 200 for larger databases
  STUCK_RUN_HOURS: 2  # Change to 4 for longer tolerance
```

### Change Schedule

Edit the cron expression:

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours (default)
    # - cron: '0 */12 * * *'  # Every 12 hours
    # - cron: '0 0 * * *'  # Daily at midnight
```

## Troubleshooting

### Workflow Not Running

**Check:**
1. GitHub Actions enabled: Settings → Actions → General
2. Workflow file syntax: `npx js-yaml .github/workflows/auto-fix-monitor.yml`
3. Repository permissions: Workflow needs `issues: write`

### No Alerts Created

**Check:**
1. Workflow run logs for errors
2. Thresholds may be too high
3. Verify permissions are correct

### False Positive Alerts

**Solutions:**
1. Increase thresholds in workflow env vars
2. Increase minimum runs for analysis (default: 5)
3. Review alert logic in `scripts/monitor-autofix-health.ts`

## Advanced Usage

### Custom Time Window

```bash
# Check last 48 hours
gh workflow run auto-fix-monitor.yml -f check_hours=48

# Check last 7 days
gh workflow run auto-fix-monitor.yml -f check_hours=168
```

### Local Analysis

```bash
# Analyze with custom data
npx tsx scripts/monitor-autofix-health.ts \
  --workflow-runs='{"total_runs":50,"successful":45,"failed":5,...}' \
  --db-health='{"exists":true,"size_mb":50,...}' \
  --performance='{"avg_duration":180,...}' \
  --output-json > health-report.json

# View human-readable output
npx tsx scripts/monitor-autofix-health.ts # Uses defaults
```

### Extract Metrics from Database

```bash
# Query database directly
sqlite3 autofix-monitor.db "
  SELECT status, COUNT(*) as count
  FROM autofix_runs
  GROUP BY status;
"

# Recent errors
sqlite3 autofix-monitor.db "
  SELECT id, issue_number, error_message
  FROM autofix_runs
  WHERE status='failure'
    AND created_at > datetime('now', '-24 hours')
  ORDER BY created_at DESC;
"

# Performance trends
sqlite3 autofix-monitor.db "
  SELECT DATE(created_at) as date,
         AVG(duration_ms)/1000.0 as avg_duration_sec,
         COUNT(*) as runs
  FROM autofix_runs
  WHERE completed_at IS NOT NULL
  GROUP BY DATE(created_at)
  ORDER BY date DESC
  LIMIT 7;
"
```

## Health Report Format

The JSON health report includes:

```json
{
  "timestamp": "2025-12-24T18:00:00Z",
  "status": "healthy|degraded|critical",
  "summary": "Overall health summary",
  "metrics": {
    "workflow": {
      "avg_duration": 120,
      "p95_duration": 180,
      "failure_rate": 5.5,
      "success_rate": 94.5,
      "total_runs": 20,
      "in_progress": 0
    },
    "database": {
      "exists": true,
      "size_mb": 25,
      "table_count": 6,
      "total_runs": 150,
      "integrity": "ok",
      "stuck_runs": 0
    }
  },
  "alerts": [
    {
      "type": "error|warning|info",
      "severity": "critical|high|medium|low",
      "title": "Alert title",
      "message": "Detailed description",
      "remediation": ["Step 1", "Step 2", ...]
    }
  ],
  "recommendations": [
    "Recommendation 1",
    "Recommendation 2"
  ]
}
```

## Integration with CI/CD

### Pre-deployment Health Check

Add to your deployment workflow:

```yaml
- name: Check Auto-Fix Health
  run: |
    # Run health check
    npx tsx scripts/monitor-autofix-health.ts --output-json > health.json

    # Fail if critical status
    STATUS=$(jq -r '.status' health.json)
    if [ "$STATUS" = "critical" ]; then
      echo "Auto-fix system in critical state - blocking deployment"
      exit 1
    fi
```

### Custom Alerting

Forward alerts to external systems:

```yaml
- name: Send to Slack
  if: steps.alert_check.outputs.has_alerts == 'true'
  run: |
    curl -X POST $SLACK_WEBHOOK_URL \
      -H 'Content-Type: application/json' \
      -d @health-report.json
```

## Database Maintenance

### Backup Database

```bash
# Daily backup (add to cron)
cp autofix-monitor.db backups/autofix-monitor-$(date +%Y%m%d).db

# Keep last 30 days
find backups/ -name "autofix-monitor-*.db" -mtime +30 -delete
```

### Archive Old Data

```bash
# Export runs older than 90 days
sqlite3 autofix-monitor.db -json \
  "SELECT * FROM autofix_runs WHERE created_at < datetime('now', '-90 days');" \
  > archive-$(date +%Y%m%d).json

# Delete old runs
sqlite3 autofix-monitor.db \
  "DELETE FROM autofix_runs WHERE created_at < datetime('now', '-90 days');"

# Reclaim space
sqlite3 autofix-monitor.db "VACUUM;"
```

### Verify Integrity

```bash
# Check integrity
sqlite3 autofix-monitor.db "PRAGMA integrity_check;"

# Should output: ok
```

## Performance Considerations

### Workflow Execution
- **Duration:** ~30-60 seconds per run
- **API Calls:** ~3-5 GitHub API requests
- **Cost:** Free (GitHub Actions minutes)

### Rate Limits
- **GitHub API:** 1,000 requests/hour
- **Monitoring Usage:** ~12-20 requests/day (4 runs)
- **Headroom:** 98% API quota available

### Storage
- **Database Growth:** ~10-50 KB per auto-fix run
- **Artifacts:** ~5-10 KB per health report
- **Retention:** 30 days (configurable)

## Security

### Permissions Required
- `contents: read` - Read repository files
- `actions: read` - Query workflow runs
- `issues: write` - Create alert issues

### Data Exposure
**Public:**
- Workflow run statistics
- Success/failure rates
- Database health metrics

**Never Exposed:**
- API keys or secrets
- Code changes or diffs
- User data or PII

## Support

### Documentation
- **Full Guide:** `000-docs/130-DR-MNTR-autofix-monitoring-guide.md`
- **Database Schema:** `db/schema.sql`
- **Monitoring Script:** `scripts/monitor-autofix-health.ts`
- **Alert Library:** `scripts/github-alerts.ts`

### Getting Help

1. **View workflow runs:** Actions → Auto-Fix Health Monitor
2. **Check artifacts:** Download health-report.json for details
3. **Review issues:** Look for `auto-fix,alert` labels
4. **Local testing:** Run `npx tsx scripts/monitor-autofix-health.ts --dry-run`

---

**Version:** 1.0.0
**Last Updated:** 2025-12-24
