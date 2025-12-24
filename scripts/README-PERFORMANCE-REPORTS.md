# Auto-Fix Performance Reports

Quick reference for generating and using weekly performance reports.

## Quick Start

### Automated Weekly Reports

Reports are automatically generated every **Monday at 9:00 AM UTC** and posted to GitHub Discussions.

**View Reports:**
1. Go to GitHub repository
2. Click "Discussions" tab
3. Select "Auto-Fix Reports" category
4. Browse weekly reports

### Manual Report Generation

#### Via GitHub Actions

1. Go to **Actions** → **Auto-Fix Performance Report**
2. Click **"Run workflow"**
3. Optionally set `week_offset`:
   - `0` = Current week (default)
   - `1` = Last week
   - `2` = Two weeks ago, etc.
4. Click **"Run workflow"**
5. Report posted to Discussions in ~10 seconds

#### Locally

```bash
# Install dependencies and build
npm ci
npm run build --workspace=packages/core

# Download production database from GCS
gcloud storage cp gs://your-analytics-bucket/autofix.db ./autofix-test.db

# Generate current week report
DB_PATH=./autofix-test.db \
WEEK_OFFSET=0 \
INCLUDE_CHARTS=true \
OUTPUT_FILE=./report.md \
node scripts/dist/scripts/generate-performance-report.js

# View report
cat report.md
```

## Report Contents

### 1. Executive Summary
High-level metrics at a glance:
- Total runs
- Success rate
- Average grade
- Total cost
- Active repositories
- Average duration

### 2. Week-over-Week Comparison
Trend analysis:
- Change in runs (📈/📉)
- Success rate delta
- Cost delta
- Grade improvement/decline

### 3. Success Rates by Repository
Top repositories ranked by:
- Total runs
- Success percentage
- Average duration
- Files changed per run

### 4. Cost Analysis
Detailed breakdown:
- Total cost by week
- Average cost per run
- Cost by provider (Anthropic, Google, OpenAI)
- Cost trend chart (Mermaid)

### 5. Grade Distribution
Quality metrics:
- A/B/C/D/F grade percentages
- Average score per grade
- Cost and duration per grade
- Grade pie chart (Mermaid)

### 6. Performance Metrics
Latency analysis:
- Run duration (P50/P95/P99)
- AI call latency (P50/P95/P99)
- Cost percentiles (P50/P95/P99)

### 7. Quality Trends
Code quality over time:
- Lint pass rate
- Typecheck pass rate
- Test pass rate
- Coverage delta
- Complexity delta

### 8. Top Errors
Most common errors:
- Error type and frequency
- First/last occurrence
- Latency impact
- Cost impact

### 9. Repository Leaderboard
Top performers ranked by:
- 🥇 Average grade score
- Success rate
- Total runs
- Merge rate

### 10. Recommendations
AI-generated action items:
- Success rate improvements
- Cost optimization tips
- Quality enhancements
- Performance optimizations
- Error resolution priorities

## Using Reports

### Weekly Team Review

**When:** Every Monday morning (after 9am UTC)

**Process:**
1. Review executive summary
2. Check week-over-week trends
3. Identify action items from recommendations
4. Create tasks for improvements
5. Celebrate wins (high grades, cost savings)

### Responding to Alerts

Reports highlight critical thresholds:

| Alert | Threshold | Action |
|-------|-----------|--------|
| ⚠️ Low Success Rate | < 80% | Investigate failures |
| 💰 High Cost | > $0.10/run | Optimize prompts/models |
| 🔴 Many F Grades | > 10% | Improve validation |
| ⏱️ Slow Performance | P99 > 60s | Profile and optimize |
| 🐛 High Error Rate | > 5% | Fix top errors |

### Tracking Improvements

Compare reports week-over-week:

1. **Identify problem** (Week 1 report)
2. **Implement fix** (During week)
3. **Verify improvement** (Week 2 report)
4. **Document success** (Comment on discussion)

## Testing and Development

### Local Testing

Test report generation without production data:

```bash
# Run test script
./scripts/test-performance-report.sh ./path/to/test-db.db

# Script generates:
# - report-current.md (current week)
# - report-last-week.md (previous week)
```

### Custom Date Ranges

Generate reports for specific weeks:

```bash
# Last week (offset 1)
DB_PATH=./autofix.db WEEK_OFFSET=1 \
node scripts/dist/scripts/generate-performance-report.js > last-week.md

# Two weeks ago (offset 2)
DB_PATH=./autofix.db WEEK_OFFSET=2 \
node scripts/dist/scripts/generate-performance-report.js > two-weeks-ago.md
```

### Without Charts

For faster generation or simpler output:

```bash
DB_PATH=./autofix.db INCLUDE_CHARTS=false \
node scripts/dist/scripts/generate-performance-report.js > simple-report.md
```

## Configuration

### Required Variables

Set in GitHub repository settings:

| Variable | Description | Example |
|----------|-------------|---------|
| `ANALYTICS_BUCKET` | GCS bucket with analytics DB | `gwi-analytics` |
| `WIF_PROVIDER` | Workload Identity Federation | `projects/123/.../providers/github` |
| `WIF_SERVICE_ACCOUNT` | Service account email | `analytics@project.iam.gserviceaccount.com` |

### Database Location

Analytics database stored in GCS:

- **Bucket:** `gs://${ANALYTICS_BUCKET}/`
- **File:** `autofix.db`
- **Format:** SQLite 3
- **Update Frequency:** After each auto-fix run
- **Backup Schedule:** Daily

### Discussion Category

Reports posted to GitHub Discussions:

- **Category:** Auto-Fix Reports
- **Created:** Automatically if missing
- **Emoji:** 📈 (chart_with_upwards_trend)
- **Visibility:** Public (all team members)

## Troubleshooting

### No Data in Report

**Problem:** Report shows "No data available"

**Solutions:**
1. Verify `ANALYTICS_BUCKET` is set
2. Check database exists in GCS bucket
3. Confirm date range has data
4. Review database backup logs

### Report Generation Fails

**Problem:** Workflow fails with error

**Solutions:**
1. Check workflow logs in Actions tab
2. Verify WIF authentication working
3. Ensure database schema is current
4. Test locally with production database

### Charts Not Rendering

**Problem:** Mermaid charts show as code blocks

**Solutions:**
1. Verify Mermaid syntax is valid
2. Check GitHub Discussions supports Mermaid
3. Try without charts: `INCLUDE_CHARTS=false`
4. Report issue to GitHub support

### Old/Stale Data

**Problem:** Report shows outdated metrics

**Solutions:**
1. Check database backup schedule
2. Verify auto-fix runs writing to database
3. Manually trigger database backup
4. Review analytics pipeline logs

## Advanced Usage

### Custom Queries

Query analytics database directly:

```bash
# Download database
gcloud storage cp gs://your-bucket/autofix.db ./analytics.db

# Query with sqlite3
sqlite3 analytics.db << EOF
SELECT
  repo_owner || '/' || repo_name as repository,
  COUNT(*) as total_runs,
  AVG(duration_ms) as avg_duration
FROM autofix_runs
WHERE created_at >= date('now', '-7 days')
GROUP BY repository
ORDER BY total_runs DESC
LIMIT 10;
EOF
```

### Export to CSV

Convert report data to CSV:

```bash
# Query and export
sqlite3 -csv analytics.db "SELECT * FROM autofix_runs" > runs.csv

# Import to spreadsheet
# - Google Sheets: File → Import
# - Excel: Data → From Text/CSV
```

### Integration with Tools

Use reports in other tools:

**Slack:**
- Set up webhook in workflow
- Post summary to #engineering channel

**Email:**
- Use GitHub Actions send-email action
- Distribute to stakeholders

**Grafana:**
- Import database to PostgreSQL
- Create custom dashboards

## Best Practices

### Do's

✅ **Review reports weekly** - Make it part of team ritual
✅ **Act on recommendations** - Create tasks for improvements
✅ **Celebrate wins** - Acknowledge teams with high grades
✅ **Track trends** - Compare multiple weeks
✅ **Share insights** - Comment on discussions with analysis

### Don'ts

❌ **Ignore alerts** - Respond to critical thresholds
❌ **Skip weeks** - Maintain consistent review cadence
❌ **Cherry-pick data** - Look at full picture
❌ **Blame teams** - Focus on process improvement
❌ **Ignore context** - Consider external factors

## Related Documentation

- **Full Documentation:** `000-docs/130-DR-PERF-auto-fix-performance-reporting.md`
- **Analytics Schema:** `packages/core/src/database/analytics.ts`
- **GitHub Alerts:** `scripts/github-alerts.ts`
- **Workflow:** `.github/workflows/auto-fix-report.yml`
- **DevOps Playbook:** `000-docs/126-AA-AUDT-appaudit-devops-playbook.md`

## Support

### Getting Help

- **Documentation:** Check `000-docs/130-DR-PERF-*.md`
- **Discussions:** Post question in GitHub Discussions
- **Slack:** #devops-help channel
- **Email:** devops@intentsolutions.io

### Reporting Issues

Create GitHub issue with:
- Workflow run URL
- Error message/logs
- Expected vs actual behavior
- Steps to reproduce

---

**Quick Links:**
- [View Reports](https://github.com/your-org/git-with-intent/discussions/categories/auto-fix-reports)
- [Run Workflow](https://github.com/your-org/git-with-intent/actions/workflows/auto-fix-report.yml)
- [Full Documentation](../000-docs/130-DR-PERF-auto-fix-performance-reporting.md)

**Last Updated:** 2025-12-24
