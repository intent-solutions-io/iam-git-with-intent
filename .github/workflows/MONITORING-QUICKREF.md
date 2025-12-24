# Auto-Fix Monitoring Quick Reference

## Alert Response Cheat Sheet

### High Failure Rate (>20%)

```bash
# 1. Check recent failures
gh run list --workflow=auto-fix.yml --limit=20

# 2. View failed run logs
gh run view <run-id> --log-failed

# 3. Check AI provider status
curl -s https://status.anthropic.com/api/v2/status.json | jq .
curl -s https://status.cloud.google.com/ | grep -i "vertex ai"

# 4. Verify database
sqlite3 autofix-monitor.db "PRAGMA integrity_check;"
```

### Stuck Runs (>2 hours)

```bash
# 1. List running workflows
gh run list --workflow=auto-fix.yml --status=in_progress

# 2. Cancel stuck runs
gh run cancel <run-id>

# 3. Clean database
sqlite3 autofix-monitor.db <<EOF
UPDATE autofix_runs
SET status = 'failure',
    error_message = 'Stuck run timeout',
    completed_at = datetime('now')
WHERE status = 'running'
  AND started_at < datetime('now', '-2 hours');
EOF

# 4. Verify cleanup
sqlite3 autofix-monitor.db "SELECT COUNT(*) FROM autofix_runs WHERE status='running';"
```

### Database Integrity Failed

```bash
# 1. BACKUP IMMEDIATELY
cp autofix-monitor.db autofix-monitor.db.backup-$(date +%Y%m%d-%H%M%S)

# 2. Check integrity
sqlite3 autofix-monitor.db "PRAGMA integrity_check;"

# 3. Attempt recovery
sqlite3 autofix-monitor.db ".recover" | sqlite3 autofix-monitor-recovered.db

# 4. Verify recovered database
sqlite3 autofix-monitor-recovered.db "PRAGMA integrity_check;"

# 5. Replace if successful
mv autofix-monitor.db autofix-monitor.db.corrupted
mv autofix-monitor-recovered.db autofix-monitor.db
```

### Database Too Large (>100 MB)

```bash
# 1. Check current size
ls -lh autofix-monitor.db

# 2. Archive old data
sqlite3 autofix-monitor.db -json \
  "SELECT * FROM autofix_runs WHERE created_at < datetime('now', '-90 days');" \
  > archive-$(date +%Y%m%d).json

# 3. Delete archived data
sqlite3 autofix-monitor.db \
  "DELETE FROM autofix_runs WHERE created_at < datetime('now', '-90 days');"

# 4. Vacuum to reclaim space
sqlite3 autofix-monitor.db "VACUUM;"

# 5. Verify size reduced
ls -lh autofix-monitor.db
```

### Slow Performance (>600s avg)

```bash
# 1. Identify slow runs
sqlite3 autofix-monitor.db <<EOF
SELECT id, issue_number, duration_ms/1000.0 as duration_sec
FROM autofix_runs
WHERE duration_ms > 600000
ORDER BY duration_ms DESC
LIMIT 10;
EOF

# 2. Check AI call latency
sqlite3 autofix-monitor.db <<EOF
SELECT provider, model, AVG(latency_ms) as avg_latency
FROM ai_calls
GROUP BY provider, model
ORDER BY avg_latency DESC;
EOF

# 3. Review recent costs
sqlite3 autofix-monitor.db <<EOF
SELECT DATE(started_at) as date,
       SUM(cost_usd) as daily_cost,
       SUM(total_tokens) as daily_tokens
FROM ai_calls
GROUP BY DATE(started_at)
ORDER BY date DESC
LIMIT 7;
EOF
```

## Common Queries

### Health Check

```bash
# Run monitoring script
npx tsx scripts/monitor-autofix-health.ts --dry-run

# Check specific time window
npx tsx scripts/monitor-autofix-health.ts \
  --workflow-runs="$(gh api repos/:owner/:repo/actions/workflows/auto-fix.yml/runs --jq '{total_runs: .total_count, runs: .workflow_runs}')"
```

### Database Stats

```sql
-- Overall stats
SELECT
  COUNT(*) as total_runs,
  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failed,
  ROUND(AVG(duration_ms)/1000.0, 2) as avg_duration_sec
FROM autofix_runs;

-- Recent failures
SELECT issue_number, error_message, created_at
FROM autofix_runs
WHERE status='failure'
  AND created_at > datetime('now', '-24 hours')
ORDER BY created_at DESC;

-- Cost by provider
SELECT provider, model,
       COUNT(*) as calls,
       ROUND(SUM(cost_usd), 4) as total_cost
FROM ai_calls
GROUP BY provider, model
ORDER BY total_cost DESC;

-- Grade distribution
SELECT letter_grade, COUNT(*) as count,
       ROUND(AVG(overall_score), 2) as avg_score
FROM grades
GROUP BY letter_grade
ORDER BY letter_grade;
```

### Workflow Commands

```bash
# List recent monitoring runs
gh run list --workflow=auto-fix-monitor.yml --limit=10

# View latest monitoring report
gh run view $(gh run list --workflow=auto-fix-monitor.yml --json databaseId --jq '.[0].databaseId')

# Download health report artifact
gh run download <run-id> -n autofix-health-report-<run-id>

# Trigger manual monitoring
gh workflow run auto-fix-monitor.yml

# Check with custom time window
gh workflow run auto-fix-monitor.yml -f check_hours=48
```

## Thresholds

| Metric | Threshold | Alert Level |
|--------|-----------|-------------|
| Failure Rate | >20% | High |
| Success Rate | <50% | Critical |
| Avg Duration | >600s | Medium |
| DB Size | >100 MB | Medium |
| Stuck Runs | >2 hrs | High |

## File Locations

```
.github/workflows/auto-fix-monitor.yml    # Monitoring workflow
scripts/monitor-autofix-health.ts         # Health analysis script
scripts/github-alerts.ts                  # Alert library
db/schema.sql                             # Database schema
autofix-monitor.db                        # Database file (created at runtime)
000-docs/130-DR-MNTR-*                    # Full documentation
```

## Emergency Contacts

**Critical Alerts:**
1. Check GitHub Actions for workflow failures
2. Review database integrity immediately
3. Backup database before any recovery attempts
4. Escalate if unable to resolve within 1 hour

**Non-Critical Alerts:**
1. Review alert details in GitHub issue
2. Follow remediation steps provided
3. Monitor after fix to verify improvement
4. Close issue when resolved

---

**Quick Help:** `npx tsx scripts/monitor-autofix-health.ts --help`
