# Metrics Dashboard Configuration Template

> **Document**: 237-DR-TMPL-metrics-dashboard
> **Epic**: EPIC 022 - Developer Analytics + DORA Metrics
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template to configure metrics dashboards for teams and organizations. Dashboards can be customized per team with relevant metrics and thresholds.

---

## Dashboard Configuration Template

```yaml
# dashboard-config.yaml
# Team metrics dashboard configuration

# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD IDENTITY
# ═══════════════════════════════════════════════════════════════════════════════
dashboard:
  name: "Backend Team Dashboard"
  id: backend-team-dashboard
  description: "Engineering metrics for the backend team"
  owner: team:backend
  refresh_interval: 5m  # How often to refresh data

# ═══════════════════════════════════════════════════════════════════════════════
# DATA SCOPE
# ═══════════════════════════════════════════════════════════════════════════════
scope:
  # Filter by team
  team: backend

  # Filter by repositories
  repositories:
    - org/api-service
    - org/worker-service
    - org/shared-lib

  # Filter by services
  services:
    - api
    - worker
    - scheduler

  # Default time range
  default_period: 30d

  # Comparison period
  comparison_period: previous_period  # or specific date range

# ═══════════════════════════════════════════════════════════════════════════════
# DORA METRICS SECTION
# ═══════════════════════════════════════════════════════════════════════════════
dora_metrics:
  enabled: true
  position: top

  # Classification thresholds (override defaults)
  thresholds:
    deployment_frequency:
      elite: 7      # 7+ per week
      high: 3       # 3-6 per week
      medium: 1     # 1-2 per week
      low: 0        # <1 per week

    lead_time_hours:
      elite: 24     # <24 hours
      high: 168     # <1 week
      medium: 720   # <1 month
      low: 4320     # >1 month

    change_failure_rate:
      elite: 0.05   # <5%
      high: 0.15    # <15%
      medium: 0.30  # <30%
      low: 1.0      # >30%

    time_to_restore_hours:
      elite: 1      # <1 hour
      high: 24      # <1 day
      medium: 168   # <1 week
      low: 720      # >1 week

  # Display options
  display:
    show_classification: true
    show_trend: true
    show_sparkline: true
    comparison_enabled: true

# ═══════════════════════════════════════════════════════════════════════════════
# VELOCITY METRICS SECTION
# ═══════════════════════════════════════════════════════════════════════════════
velocity_metrics:
  enabled: true
  position: middle

  metrics:
    - id: prs_merged
      name: "PRs Merged"
      query: |
        SELECT COUNT(*) as value
        FROM analytics.pull_requests
        WHERE team = @team
          AND merged_at BETWEEN @start_date AND @end_date
      format: number
      target: 20  # per week
      alert_below: 10

    - id: avg_pr_size
      name: "Avg PR Size"
      query: |
        SELECT AVG(lines_added + lines_removed) as value
        FROM analytics.pull_requests
        WHERE team = @team
          AND merged_at BETWEEN @start_date AND @end_date
      format: number
      target: 200
      alert_above: 500  # Large PRs are harder to review

    - id: cycle_time
      name: "Cycle Time"
      query: |
        SELECT
          PERCENTILE_CONT(
            TIMESTAMP_DIFF(merged_at, created_at, HOUR),
            0.5
          ) as value
        FROM analytics.pull_requests
        WHERE team = @team
          AND merged_at BETWEEN @start_date AND @end_date
      format: hours
      target: 24
      alert_above: 72

    - id: review_time
      name: "Review Time"
      query: |
        SELECT
          PERCENTILE_CONT(
            TIMESTAMP_DIFF(first_review_at, created_at, HOUR),
            0.5
          ) as value
        FROM analytics.pull_requests
        WHERE team = @team
          AND created_at BETWEEN @start_date AND @end_date
      format: hours
      target: 4
      alert_above: 24

# ═══════════════════════════════════════════════════════════════════════════════
# QUALITY METRICS SECTION
# ═══════════════════════════════════════════════════════════════════════════════
quality_metrics:
  enabled: true
  position: middle

  metrics:
    - id: test_coverage
      name: "Test Coverage"
      source: codecov  # or custom query
      format: percentage
      target: 80
      alert_below: 70

    - id: bugs_introduced
      name: "Bugs Introduced"
      query: |
        SELECT COUNT(*) as value
        FROM analytics.issues
        WHERE team = @team
          AND type = 'bug'
          AND created_at BETWEEN @start_date AND @end_date
      format: number
      target: 5
      alert_above: 10

    - id: deployment_success
      name: "Deploy Success Rate"
      query: |
        SELECT
          COUNTIF(success) / COUNT(*) * 100 as value
        FROM analytics.deployments
        WHERE team = @team
          AND timestamp BETWEEN @start_date AND @end_date
      format: percentage
      target: 99
      alert_below: 95

    - id: build_time
      name: "Build Time (p95)"
      query: |
        SELECT
          PERCENTILE_CONT(duration_seconds, 0.95) / 60 as value
        FROM analytics.builds
        WHERE team = @team
          AND timestamp BETWEEN @start_date AND @end_date
      format: minutes
      target: 10
      alert_above: 20

# ═══════════════════════════════════════════════════════════════════════════════
# TEAM HEALTH SECTION
# ═══════════════════════════════════════════════════════════════════════════════
team_health:
  enabled: true
  position: bottom

  metrics:
    - id: workload_distribution
      name: "Workload Balance"
      type: distribution_chart
      query: |
        SELECT author, COUNT(*) as pr_count
        FROM analytics.pull_requests
        WHERE team = @team
          AND merged_at BETWEEN @start_date AND @end_date
        GROUP BY author
      visualization: bar_chart
      alert_gini_above: 0.5

    - id: review_distribution
      name: "Review Balance"
      type: distribution_chart
      query: |
        SELECT reviewer, COUNT(*) as review_count
        FROM analytics.reviews
        WHERE team = @team
          AND submitted_at BETWEEN @start_date AND @end_date
        GROUP BY reviewer
      visualization: bar_chart

    - id: after_hours
      name: "After Hours Work"
      query: |
        SELECT
          COUNTIF(
            EXTRACT(HOUR FROM committed_at) NOT BETWEEN 9 AND 18
            OR EXTRACT(DAYOFWEEK FROM committed_at) IN (1, 7)
          ) / COUNT(*) * 100 as value
        FROM analytics.commits
        WHERE team = @team
          AND committed_at BETWEEN @start_date AND @end_date
      format: percentage
      target: 10
      alert_above: 25

    - id: pr_age_distribution
      name: "PR Age Distribution"
      type: histogram
      query: |
        SELECT
          TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), created_at, DAY) as age_days
        FROM analytics.pull_requests
        WHERE team = @team
          AND state = 'open'
      visualization: histogram
      buckets: [1, 3, 7, 14, 30]

# ═══════════════════════════════════════════════════════════════════════════════
# GWI METRICS SECTION
# ═══════════════════════════════════════════════════════════════════════════════
gwi_metrics:
  enabled: true
  position: bottom

  metrics:
    - id: gwi_runs
      name: "GWI Runs"
      query: |
        SELECT COUNT(*) as value
        FROM analytics.gwi_runs
        WHERE team = @team
          AND started_at BETWEEN @start_date AND @end_date
      format: number

    - id: gwi_success_rate
      name: "GWI Success Rate"
      query: |
        SELECT
          COUNTIF(success) / COUNT(*) * 100 as value
        FROM analytics.gwi_runs
        WHERE team = @team
          AND started_at BETWEEN @start_date AND @end_date
      format: percentage
      target: 95

    - id: time_saved
      name: "Est. Time Saved"
      query: |
        SELECT
          SUM(estimated_manual_minutes) / 60 as value
        FROM analytics.gwi_runs
        WHERE team = @team
          AND success = true
          AND started_at BETWEEN @start_date AND @end_date
      format: hours

    - id: cost_per_run
      name: "Avg Cost/Run"
      query: |
        SELECT AVG(cost_usd) as value
        FROM analytics.gwi_runs
        WHERE team = @team
          AND started_at BETWEEN @start_date AND @end_date
      format: currency

# ═══════════════════════════════════════════════════════════════════════════════
# CHARTS SECTION
# ═══════════════════════════════════════════════════════════════════════════════
charts:
  - id: deployment_trend
    name: "Deployments Over Time"
    type: line
    query: |
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as deployments,
        COUNTIF(success) as successful
      FROM analytics.deployments
      WHERE team = @team
        AND timestamp BETWEEN @start_date AND @end_date
      GROUP BY date
      ORDER BY date
    x_axis: date
    y_axis:
      - deployments
      - successful
    period: 90d

  - id: lead_time_trend
    name: "Lead Time Trend"
    type: line
    query: |
      SELECT
        DATE(merged_at) as date,
        PERCENTILE_CONT(
          TIMESTAMP_DIFF(merged_at, created_at, HOUR),
          0.5
        ) as lead_time_p50,
        PERCENTILE_CONT(
          TIMESTAMP_DIFF(merged_at, created_at, HOUR),
          0.9
        ) as lead_time_p90
      FROM analytics.pull_requests
      WHERE team = @team
        AND merged_at BETWEEN @start_date AND @end_date
      GROUP BY date
      ORDER BY date
    x_axis: date
    y_axis:
      - lead_time_p50
      - lead_time_p90
    reference_lines:
      - value: 24
        label: "Target"

  - id: cycle_time_breakdown
    name: "Cycle Time Breakdown"
    type: stacked_bar
    query: |
      SELECT
        DATE_TRUNC(merged_at, WEEK) as week,
        AVG(coding_time_hours) as coding,
        AVG(pickup_time_hours) as pickup,
        AVG(review_time_hours) as review,
        AVG(deploy_time_hours) as deploy
      FROM analytics.pr_cycle_times
      WHERE team = @team
        AND merged_at BETWEEN @start_date AND @end_date
      GROUP BY week
      ORDER BY week
    x_axis: week
    y_axis:
      - coding
      - pickup
      - review
      - deploy

# ═══════════════════════════════════════════════════════════════════════════════
# ALERTS CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
alerts:
  channels:
    slack: "#backend-alerts"
    email: backend-leads@company.com

  rules:
    - metric: deployment_frequency
      condition: value < 1 for 7d
      severity: warning
      message: "Deployment frequency dropped below 1/week"

    - metric: lead_time_hours
      condition: value > 168
      severity: warning
      message: "Lead time exceeds 1 week"

    - metric: change_failure_rate
      condition: value > 0.30
      severity: critical
      message: "Change failure rate exceeds 30%"

    - metric: test_coverage
      condition: value < 70
      severity: warning
      message: "Test coverage dropped below 70%"

    - metric: after_hours
      condition: value > 25
      severity: warning
      message: "After-hours work exceeds 25%"

# ═══════════════════════════════════════════════════════════════════════════════
# ACCESS CONTROL
# ═══════════════════════════════════════════════════════════════════════════════
access:
  viewers:
    - team:backend
    - team:engineering-leadership
  editors:
    - team:backend-leads
  admins:
    - user:admin@company.com
```

---

## Dashboard Types

### Executive Dashboard

```yaml
# executive-dashboard.yaml
dashboard:
  name: "Engineering Executive Dashboard"
  id: exec-dashboard
  description: "High-level engineering metrics for leadership"

scope:
  team: all
  default_period: 90d

sections:
  - name: "DORA Summary"
    metrics:
      - overall_dora_score
      - deployment_frequency_all
      - lead_time_all
      - change_failure_rate_all
      - time_to_restore_all

  - name: "Team Comparison"
    visualization: comparison_table
    teams:
      - backend
      - frontend
      - platform
      - data
    metrics:
      - deployment_frequency
      - lead_time
      - change_failure_rate

  - name: "Trends"
    charts:
      - quarterly_dora_trend
      - headcount_vs_velocity
      - incident_trend

  - name: "Investment ROI"
    metrics:
      - gwi_time_saved
      - automation_coverage
      - engineering_efficiency
```

### Team Comparison Dashboard

```yaml
# team-comparison.yaml
dashboard:
  name: "Team Comparison"
  id: team-comparison

comparison:
  teams:
    - backend
    - frontend
    - platform
    - mobile

  metrics:
    - name: deployment_frequency
      higher_is_better: true
    - name: lead_time
      higher_is_better: false
    - name: change_failure_rate
      higher_is_better: false
    - name: test_coverage
      higher_is_better: true
    - name: pr_merge_rate
      higher_is_better: true

  visualization:
    type: radar_chart
    normalize: true
```

### Service Health Dashboard

```yaml
# service-health.yaml
dashboard:
  name: "Service Health"
  id: service-health

scope:
  services:
    - api
    - worker
    - scheduler
    - gateway

metrics_per_service:
  - deployment_count
  - error_rate
  - latency_p99
  - availability
  - incident_count

alerts:
  - service: any
    metric: error_rate
    threshold: 1%
    severity: critical
```

---

## Metric Definitions

### Standard Metrics

| Metric ID | Name | Query Template | Format |
|-----------|------|----------------|--------|
| `deployment_frequency` | Deployments/Week | COUNT deploys / weeks | number |
| `lead_time` | Lead Time | MEDIAN(merged_at - first_commit_at) | hours |
| `change_failure_rate` | Failure Rate | failed_deploys / total_deploys | percentage |
| `mttr` | MTTR | MEDIAN(resolved_at - created_at) | hours |
| `prs_merged` | PRs Merged | COUNT merged PRs | number |
| `avg_pr_size` | Avg PR Size | AVG(lines_changed) | number |
| `cycle_time` | Cycle Time | MEDIAN(merged_at - created_at) | hours |
| `review_time` | Review Time | MEDIAN(first_review_at - created_at) | hours |
| `test_coverage` | Test Coverage | coverage_percent | percentage |
| `build_time` | Build Time | P95(build_duration) | minutes |

### Custom Metric Template

```yaml
custom_metric:
  id: my_custom_metric
  name: "My Custom Metric"
  description: "Description of what this measures"

  query: |
    SELECT
      {{aggregation}}({{field}}) as value
    FROM {{table}}
    WHERE team = @team
      AND {{timestamp_field}} BETWEEN @start_date AND @end_date
    {{group_by}}

  parameters:
    aggregation: AVG
    field: duration_seconds
    table: analytics.custom_events
    timestamp_field: event_time
    group_by: ""  # or GROUP BY date for time series

  format: number  # number, percentage, hours, minutes, currency
  target: 100
  alert_above: 150  # or alert_below for minimizing metrics

  visualization:
    type: metric_card  # metric_card, line_chart, bar_chart
    show_trend: true
    show_sparkline: true
```

---

## CLI Commands

```bash
# Create dashboard from template
gwi analytics dashboard create --config dashboard-config.yaml

# Update dashboard
gwi analytics dashboard update backend-team-dashboard --config updated-config.yaml

# View dashboard metrics
gwi analytics dashboard view backend-team-dashboard

# Export dashboard
gwi analytics dashboard export backend-team-dashboard --format pdf

# List dashboards
gwi analytics dashboard list

# Test dashboard queries
gwi analytics dashboard test --config dashboard-config.yaml --dry-run
```

---

## Related Documentation

- [236-DR-SPEC-developer-analytics.md](./236-DR-SPEC-developer-analytics.md) - Analytics specification
- [224-DR-SPEC-cost-optimization.md](./224-DR-SPEC-cost-optimization.md) - Cost tracking
