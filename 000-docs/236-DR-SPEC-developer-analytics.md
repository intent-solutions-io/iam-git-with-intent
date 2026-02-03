# Developer Analytics & DORA Metrics Specification

> **Document**: 236-DR-SPEC-developer-analytics
> **Epic**: EPIC 022 - Developer Analytics + DORA Metrics
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

GWI's developer analytics system tracks DORA (DevOps Research and Assessment) metrics, developer productivity, and engineering health indicators. This enables data-driven improvements to engineering practices.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEVELOPER ANALYTICS PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        DATA SOURCES                                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │  │
│  │  │ GitHub │  │CI/CD   │  │ GWI    │  │PagerDuty│  │ Jira   │        │  │
│  │  │Commits │  │Pipeline│  │ Runs   │  │Incidents│  │Tickets │        │  │
│  │  │  PRs   │  │Deploys │  │        │  │         │  │        │        │  │
│  │  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘        │  │
│  └───────┼──────────┼──────────┼──────────┼──────────┼────────────────┘  │
│          │          │          │          │          │                     │
│          └──────────┴──────────┴──────────┴──────────┘                     │
│                                │                                            │
│                       ┌────────▼────────┐                                  │
│                       │   ETL PIPELINE  │                                  │
│                       └────────┬────────┘                                  │
│                                │                                            │
│                       ┌────────▼────────┐                                  │
│                       │    BigQuery     │                                  │
│                       │ (Analytics DW)  │                                  │
│                       └────────┬────────┘                                  │
│                                │                                            │
│           ┌────────────────────┼────────────────────┐                      │
│           │                    │                    │                      │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐            │
│  │  DORA Metrics   │  │ Productivity    │  │  Engineering   │            │
│  │  Dashboard      │  │ Dashboard       │  │  Health        │            │
│  └─────────────────┘  └─────────────────┘  └────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. DORA Metrics

### 1.1 The Four Key Metrics

| Metric | Definition | Elite | High | Medium | Low |
|--------|------------|-------|------|--------|-----|
| **Deployment Frequency** | How often code deploys to production | On-demand (multiple/day) | Daily-Weekly | Weekly-Monthly | Monthly+ |
| **Lead Time for Changes** | Time from commit to production | < 1 hour | 1 day - 1 week | 1 week - 1 month | 1-6 months |
| **Change Failure Rate** | % of deployments causing failures | 0-15% | 16-30% | 31-45% | 46-100% |
| **Time to Restore Service** | Time to recover from failures | < 1 hour | < 1 day | 1 day - 1 week | 1 week+ |

### 1.2 Metric Calculations

```typescript
interface DORAMetrics {
  // Deployment Frequency
  deploymentFrequency: {
    value: number;              // Deployments per day
    period: 'daily' | 'weekly' | 'monthly';
    classification: 'elite' | 'high' | 'medium' | 'low';
    trend: 'improving' | 'stable' | 'declining';
  };

  // Lead Time for Changes
  leadTimeForChanges: {
    value: number;              // Hours
    p50: number;                // Median
    p90: number;                // 90th percentile
    classification: 'elite' | 'high' | 'medium' | 'low';
    breakdown: {
      codingTime: number;       // First commit to PR open
      pickupTime: number;       // PR open to first review
      reviewTime: number;       // First review to approval
      deployTime: number;       // Approval to production
    };
  };

  // Change Failure Rate
  changeFailureRate: {
    value: number;              // Percentage
    failedDeployments: number;
    totalDeployments: number;
    classification: 'elite' | 'high' | 'medium' | 'low';
    byType: {
      rollbacks: number;
      hotfixes: number;
      incidents: number;
    };
  };

  // Time to Restore Service
  timeToRestore: {
    value: number;              // Hours
    p50: number;
    p90: number;
    classification: 'elite' | 'high' | 'medium' | 'low';
    incidentCount: number;
    mttr: number;               // Mean Time to Recover
  };
}
```

### 1.3 Data Collection

```yaml
dora_data_sources:
  # Deployment Frequency
  deployments:
    source: github_actions
    events:
      - workflow_run.completed
    filters:
      - workflow_name: "Deploy to Production"
      - conclusion: success
    timestamp: completed_at

  # Lead Time for Changes
  commits:
    source: github
    events:
      - push
      - pull_request
    fields:
      - sha
      - timestamp
      - author
      - pr_number

  pull_requests:
    source: github
    events:
      - pull_request.opened
      - pull_request.closed
      - pull_request_review.submitted
    fields:
      - number
      - created_at
      - merged_at
      - first_review_at
      - approval_at

  # Change Failure Rate
  incidents:
    source: pagerduty
    events:
      - incident.triggered
      - incident.resolved
    filters:
      - service: production
    fields:
      - id
      - created_at
      - resolved_at
      - urgency

  rollbacks:
    source: github_actions
    events:
      - workflow_run.completed
    filters:
      - workflow_name: "Rollback"
    fields:
      - run_id
      - trigger_sha
      - timestamp

  # Time to Restore
  resolution:
    source: pagerduty
    fields:
      - incident_id
      - time_to_acknowledge
      - time_to_resolve
```

---

## 2. Developer Productivity Metrics

### 2.1 Throughput Metrics

```typescript
interface ThroughputMetrics {
  // Code velocity
  codeVelocity: {
    commitsPerDay: number;
    linesAddedPerWeek: number;
    linesRemovedPerWeek: number;
    netLinesPerWeek: number;
  };

  // PR metrics
  pullRequests: {
    openedPerWeek: number;
    mergedPerWeek: number;
    closedWithoutMerge: number;
    averageSize: number;          // Lines changed
    averageFilesChanged: number;
  };

  // Review metrics
  reviews: {
    reviewsGivenPerWeek: number;
    reviewsReceivedPerWeek: number;
    commentsPerReview: number;
    approvalRate: number;
  };

  // Issue completion
  issues: {
    closedPerWeek: number;
    pointsCompletedPerSprint: number;
    averageCycleTime: number;     // Hours from start to done
  };
}
```

### 2.2 Quality Metrics

```typescript
interface QualityMetrics {
  // Code quality
  codeQuality: {
    testCoverage: number;         // Percentage
    coverageTrend: 'up' | 'down' | 'stable';
    techDebtRatio: number;
    duplicateCodeRatio: number;
  };

  // Bug metrics
  bugs: {
    bugsIntroducedPerWeek: number;
    bugsFixedPerWeek: number;
    bugEscapeRate: number;        // Bugs found in prod vs pre-prod
    criticalBugsCount: number;
  };

  // Review quality
  reviewQuality: {
    defectsFoundInReview: number;
    reviewCoverage: number;       // % of PRs reviewed
    reviewDepth: number;          // Comments per 100 lines
  };
}
```

### 2.3 Efficiency Metrics

```typescript
interface EfficiencyMetrics {
  // Cycle time breakdown
  cycleTime: {
    total: number;                // Hours
    phases: {
      planning: number;
      development: number;
      review: number;
      testing: number;
      deployment: number;
    };
    bottlenecks: string[];
  };

  // Flow efficiency
  flowEfficiency: {
    activeTime: number;           // Time actually working
    waitTime: number;             // Time waiting
    efficiency: number;           // activeTime / total
  };

  // Rework metrics
  rework: {
    reworkRate: number;           // % of commits that are fixes
    iterationsPerPR: number;
    reviewRounds: number;
  };
}
```

---

## 3. Engineering Health

### 3.1 Team Health Indicators

```yaml
team_health:
  # Workload distribution
  workload:
    metrics:
      - pr_distribution: "Gini coefficient of PR authorship"
      - review_distribution: "Gini coefficient of reviews"
      - oncall_burden: "Hours per person per month"
    thresholds:
      healthy: gini < 0.3
      concerning: gini 0.3-0.5
      unhealthy: gini > 0.5

  # Knowledge distribution
  knowledge:
    metrics:
      - bus_factor: "Min people who know each codebase area"
      - review_coverage: "% of codebase with multiple reviewers"
      - documentation_coverage: "% of code with docs"
    thresholds:
      healthy: bus_factor >= 3
      concerning: bus_factor == 2
      unhealthy: bus_factor == 1

  # Sustainability
  sustainability:
    metrics:
      - after_hours_commits: "% of commits outside business hours"
      - weekend_deployments: "% of deploys on weekends"
      - pr_age_99th: "99th percentile PR age"
    thresholds:
      healthy: after_hours < 10%
      concerning: after_hours 10-25%
      unhealthy: after_hours > 25%
```

### 3.2 Technical Health

```yaml
technical_health:
  # Dependency health
  dependencies:
    metrics:
      - outdated_deps: "% of dependencies behind latest"
      - critical_vulns: "Count of critical vulnerabilities"
      - deprecated_usage: "Count of deprecated API uses"
    collection: weekly

  # Infrastructure health
  infrastructure:
    metrics:
      - deploy_success_rate: "% of successful deployments"
      - build_time_p95: "95th percentile build time"
      - test_flakiness: "% of test runs that are flaky"
    collection: continuous

  # Code health
  code:
    metrics:
      - complexity_trend: "Average cyclomatic complexity trend"
      - large_file_count: "Files over 500 lines"
      - dead_code_estimate: "Estimated dead code %"
    collection: weekly
```

---

## 4. GWI-Specific Metrics

### 4.1 AI Agent Metrics

```typescript
interface GWIMetrics {
  // Run metrics
  runs: {
    runsPerDay: number;
    successRate: number;
    averageDuration: number;
    byType: Record<RunType, number>;
  };

  // Triage accuracy
  triage: {
    accuracyScore: number;        // Predicted vs actual complexity
    falseHighRate: number;        // Over-estimated complexity
    falseLowRate: number;         // Under-estimated complexity
  };

  // Resolution effectiveness
  resolution: {
    conflictsResolvedPerWeek: number;
    resolutionSuccessRate: number;
    humanOverrideRate: number;
    averageResolutionTime: number;
  };

  // Cost efficiency
  costEfficiency: {
    costPerRun: number;
    costPerLOC: number;
    costSavings: number;          // Estimated manual time saved
    roi: number;
  };
}

type RunType = 'triage' | 'resolve' | 'review' | 'issue-to-code' | 'autopilot';
```

### 4.2 Autopilot Metrics

```yaml
autopilot_metrics:
  approval_flow:
    - pending_approvals_avg: "Average time in pending state"
    - approval_rate: "% of runs approved"
    - rejection_reasons: "Categorized rejection reasons"

  quality:
    - first_pass_success: "% of autopilot runs that succeed first try"
    - iteration_count: "Average iterations to success"
    - human_intervention_rate: "% requiring human fix"

  impact:
    - prs_generated_per_week: "PRs created by autopilot"
    - merged_pr_rate: "% of autopilot PRs that merge"
    - avg_merge_time: "Time from generation to merge"
```

---

## 5. Data Pipeline

### 5.1 ETL Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ETL PIPELINE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Extract   │────▶│  Transform  │────▶│    Load     │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│        │                   │                   │                            │
│        ▼                   ▼                   ▼                            │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │ GitHub API  │     │ Normalize   │     │  BigQuery   │                   │
│  │ PagerDuty   │     │ Aggregate   │     │  Tables     │                   │
│  │ CI/CD       │     │ Calculate   │     │             │                   │
│  │ GWI Events  │     │             │     │             │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Schema

```sql
-- Deployment events
CREATE TABLE analytics.deployments (
  deployment_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  environment STRING NOT NULL,  -- staging, production
  service STRING NOT NULL,
  commit_sha STRING NOT NULL,
  triggered_by STRING,
  success BOOLEAN NOT NULL,
  duration_seconds INT64,
  pr_number INT64,
  PARTITION BY DATE(timestamp)
);

-- Pull request events
CREATE TABLE analytics.pull_requests (
  pr_number INT64 NOT NULL,
  repo STRING NOT NULL,
  author STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  first_review_at TIMESTAMP,
  approved_at TIMESTAMP,
  merged_at TIMESTAMP,
  closed_at TIMESTAMP,
  lines_added INT64,
  lines_removed INT64,
  files_changed INT64,
  review_count INT64,
  comment_count INT64,
  PARTITION BY DATE(created_at)
);

-- Incidents
CREATE TABLE analytics.incidents (
  incident_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP,
  severity STRING NOT NULL,  -- critical, high, medium, low
  service STRING,
  trigger_deployment_id STRING,
  root_cause STRING,
  time_to_acknowledge_seconds INT64,
  time_to_resolve_seconds INT64,
  PARTITION BY DATE(created_at)
);

-- GWI runs
CREATE TABLE analytics.gwi_runs (
  run_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  run_type STRING NOT NULL,  -- triage, resolve, review, etc.
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  success BOOLEAN,
  complexity_score INT64,
  tokens_used INT64,
  cost_usd NUMERIC,
  approval_status STRING,
  PARTITION BY DATE(started_at)
);

-- Daily aggregates (materialized)
CREATE TABLE analytics.daily_metrics (
  date DATE NOT NULL,
  team STRING,
  deployment_count INT64,
  deployment_success_rate NUMERIC,
  lead_time_p50_hours NUMERIC,
  lead_time_p90_hours NUMERIC,
  change_failure_rate NUMERIC,
  mttr_hours NUMERIC,
  prs_merged INT64,
  prs_opened INT64,
  avg_pr_size INT64,
  avg_review_time_hours NUMERIC
);
```

### 5.3 Refresh Schedule

```yaml
data_refresh:
  # Real-time via webhooks
  real_time:
    - github_events
    - pagerduty_webhooks
    - gwi_events

  # Scheduled extracts
  hourly:
    - github_api_backfill
    - ci_cd_status

  # Daily aggregations
  daily:
    - dora_metrics_calculation
    - team_health_scores
    - trend_analysis

  # Weekly reports
  weekly:
    - engineering_health_report
    - team_velocity_report
    - dependency_audit
```

---

## 6. Dashboards

### 6.1 DORA Dashboard

```typescript
interface DORADashboard {
  // Header metrics
  header: {
    overallScore: 'elite' | 'high' | 'medium' | 'low';
    deploymentFrequency: MetricCard;
    leadTimeForChanges: MetricCard;
    changeFailureRate: MetricCard;
    timeToRestore: MetricCard;
  };

  // Trend charts
  charts: {
    deploymentTrend: TimeSeriesChart;       // 90 days
    leadTimeTrend: TimeSeriesChart;
    failureRateTrend: TimeSeriesChart;
    restoreTimeTrend: TimeSeriesChart;
  };

  // Breakdowns
  breakdowns: {
    byTeam: Record<string, DORAMetrics>;
    byService: Record<string, DORAMetrics>;
    byEnvironment: Record<string, number>;
  };

  // Filters
  filters: {
    dateRange: DateRange;
    team: string[];
    service: string[];
  };
}

interface MetricCard {
  value: number;
  unit: string;
  classification: string;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
  sparkline: number[];
}
```

### 6.2 Team Dashboard

```yaml
team_dashboard:
  sections:
    velocity:
      - prs_merged_this_week
      - prs_in_progress
      - avg_cycle_time
      - sprint_burndown

    quality:
      - test_coverage
      - bug_count
      - review_coverage
      - deployment_success_rate

    health:
      - workload_distribution
      - knowledge_bus_factor
      - after_hours_work
      - pr_age_distribution

    gwi_impact:
      - runs_this_week
      - time_saved_estimate
      - autopilot_pr_count
      - ai_assisted_reviews
```

### 6.3 Engineering Health Dashboard

```typescript
interface EngineeringHealthDashboard {
  // Overall health score
  overallHealth: {
    score: number;            // 0-100
    trend: 'improving' | 'stable' | 'declining';
    topConcerns: string[];
  };

  // Category scores
  categories: {
    teamHealth: CategoryScore;
    technicalHealth: CategoryScore;
    processHealth: CategoryScore;
    sustainabilityHealth: CategoryScore;
  };

  // Alerts
  alerts: {
    critical: Alert[];
    warning: Alert[];
    info: Alert[];
  };

  // Recommendations
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    suggestion: string;
    impact: string;
  }[];
}

interface CategoryScore {
  score: number;
  status: 'healthy' | 'concerning' | 'unhealthy';
  metrics: {
    name: string;
    value: number;
    target: number;
    status: 'good' | 'warning' | 'critical';
  }[];
}
```

---

## 7. Alerting

### 7.1 Alert Rules

```yaml
alerts:
  # DORA metric alerts
  dora:
    - name: deployment_frequency_drop
      condition: deployments_per_day < 0.5 for 7 days
      severity: warning
      message: "Deployment frequency has dropped below 1 per 2 days"

    - name: lead_time_spike
      condition: lead_time_p90 > 168 hours  # 1 week
      severity: warning
      message: "Lead time for changes exceeds 1 week"

    - name: high_change_failure_rate
      condition: change_failure_rate > 30%
      severity: critical
      message: "Change failure rate exceeds 30%"

    - name: slow_recovery
      condition: mttr > 24 hours
      severity: critical
      message: "Mean time to recover exceeds 24 hours"

  # Team health alerts
  team:
    - name: workload_imbalance
      condition: gini_coefficient > 0.5
      severity: warning
      message: "Workload distribution is significantly unbalanced"

    - name: low_bus_factor
      condition: bus_factor == 1 for any area
      severity: warning
      message: "Single point of knowledge identified"

    - name: excessive_after_hours
      condition: after_hours_commits > 25%
      severity: warning
      message: "After-hours work exceeds 25%"

  # Technical health alerts
  technical:
    - name: build_degradation
      condition: build_time_p95 > previous_week * 1.5
      severity: warning
      message: "Build times have increased significantly"

    - name: test_flakiness
      condition: flaky_test_rate > 5%
      severity: warning
      message: "Test flakiness exceeds 5%"

    - name: critical_vulnerabilities
      condition: critical_vulns > 0
      severity: critical
      message: "Critical security vulnerabilities detected"
```

### 7.2 Notification Channels

```yaml
notifications:
  channels:
    slack:
      critical: "#engineering-alerts"
      warning: "#engineering-health"
      info: "#engineering-digest"

    email:
      critical: [engineering-leads@company.com]
      weekly_digest: [engineering@company.com]

    pagerduty:
      critical: engineering-oncall

  schedules:
    real_time:
      - severity: critical
        channels: [slack, email, pagerduty]

    daily_digest:
      - time: "09:00"
        channels: [slack]
        content: [warnings, info]

    weekly_report:
      - day: monday
        time: "09:00"
        channels: [email]
        content: [full_report]
```

---

## 8. Implementation

### 8.1 Analytics Engine

```typescript
// packages/core/src/analytics/engine.ts

export class AnalyticsEngine {
  private dataWarehouse: BigQueryClient;
  private cache: Cache;

  // DORA metrics
  async calculateDORAMetrics(options: DORAOptions): Promise<DORAMetrics> {
    const { team, dateRange, service } = options;

    const [deployments, leadTimes, incidents] = await Promise.all([
      this.getDeployments(dateRange, { team, service }),
      this.getLeadTimes(dateRange, { team, service }),
      this.getIncidents(dateRange, { service }),
    ]);

    return {
      deploymentFrequency: this.calculateDeploymentFrequency(deployments),
      leadTimeForChanges: this.calculateLeadTime(leadTimes),
      changeFailureRate: this.calculateFailureRate(deployments, incidents),
      timeToRestore: this.calculateMTTR(incidents),
    };
  }

  // Productivity metrics
  async calculateProductivityMetrics(options: ProductivityOptions): Promise<ProductivityMetrics>;

  // Health scores
  async calculateHealthScores(options: HealthOptions): Promise<HealthScores>;

  // Trend analysis
  async analyzeTrends(metric: string, options: TrendOptions): Promise<TrendAnalysis>;

  // Benchmarking
  async benchmark(team: string, against: 'industry' | 'company'): Promise<Benchmark>;
}
```

### 8.2 Data Collection

```typescript
// packages/core/src/analytics/collectors/github-collector.ts

export class GitHubCollector {
  async collectPullRequests(repo: string, since: Date): Promise<PREvent[]> {
    const prs = await this.github.pulls.list({
      owner: repo.split('/')[0],
      repo: repo.split('/')[1],
      state: 'all',
      since: since.toISOString(),
    });

    return prs.map(pr => ({
      number: pr.number,
      author: pr.user.login,
      createdAt: new Date(pr.created_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    }));
  }

  async collectDeployments(repo: string, since: Date): Promise<DeploymentEvent[]>;
  async collectReviews(repo: string, since: Date): Promise<ReviewEvent[]>;
}
```

---

## CLI Commands

```bash
# View DORA metrics
gwi analytics dora
gwi analytics dora --team backend --period 30d

# View team metrics
gwi analytics team --name backend
gwi analytics velocity --period sprint

# View engineering health
gwi analytics health
gwi analytics health --category technical

# Export reports
gwi analytics export --type dora --format pdf --period 2025-Q4
gwi analytics export --type weekly --email engineering@company.com

# Run data collection
gwi analytics collect --source github --since 7d
gwi analytics refresh --all
```

---

## Related Documentation

- [237-DR-TMPL-metrics-dashboard.md](./237-DR-TMPL-metrics-dashboard.md) - Dashboard configuration template
- [224-DR-SPEC-cost-optimization.md](./224-DR-SPEC-cost-optimization.md) - Cost tracking integration
