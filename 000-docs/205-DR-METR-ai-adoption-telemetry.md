# AI Tool Adoption Telemetry

> **Document**: 205-DR-METR-ai-adoption-telemetry
> **Epic**: EPIC 026 - AI Tool Rollout Framework
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Metrics specification for tracking AI coding tool adoption, usage, and impact across the organization.

---

## Metric Categories

| Category | Purpose | Update Frequency |
|----------|---------|------------------|
| Adoption | Track rollout progress | Daily |
| Usage | Measure engagement | Daily |
| Productivity | Assess impact | Weekly |
| Quality | Measure code outcomes | Weekly |
| Satisfaction | Gauge developer sentiment | Monthly |

---

## Adoption Metrics

### AD-001: Activation Rate

**Definition:** Percentage of licensed users who have used the tool at least once

```
activation_rate = (users_with_activity / total_licensed_users) × 100
```

| Target | Warning | Critical |
|--------|---------|----------|
| > 90% | 70-90% | < 70% |

### AD-002: Active Users (DAU/WAU/MAU)

**Definition:** Users with at least one interaction in the time period

```sql
-- Daily Active Users
SELECT COUNT(DISTINCT user_id)
FROM ai_tool_events
WHERE event_date = CURRENT_DATE;

-- Weekly Active Users
SELECT COUNT(DISTINCT user_id)
FROM ai_tool_events
WHERE event_date >= CURRENT_DATE - INTERVAL '7 days';

-- Monthly Active Users
SELECT COUNT(DISTINCT user_id)
FROM ai_tool_events
WHERE event_date >= CURRENT_DATE - INTERVAL '30 days';
```

**Stickiness Ratio:** DAU/MAU (target > 0.4)

### AD-003: Rollout Progress

**Definition:** Percentage of target teams onboarded

```
rollout_progress = (teams_onboarded / total_target_teams) × 100
```

Track by wave:
- Wave 1: Engineering leads
- Wave 2: Backend teams
- Wave 3: Frontend teams
- Wave 4: All remaining

### AD-004: Time to First Value

**Definition:** Days from license assignment to first accepted suggestion

| Target | Warning | Critical |
|--------|---------|----------|
| < 3 days | 3-7 days | > 7 days |

---

## Usage Metrics

### US-001: Interactions per User per Day

**Definition:** Average number of AI interactions per active user

```sql
SELECT
  DATE(event_time) as date,
  AVG(interactions) as avg_interactions
FROM (
  SELECT user_id, DATE(event_time), COUNT(*) as interactions
  FROM ai_tool_events
  GROUP BY user_id, DATE(event_time)
) daily_counts
GROUP BY date;
```

| Level | Interactions/Day |
|-------|------------------|
| Power user | > 20 |
| Regular user | 5-20 |
| Light user | 1-5 |
| Inactive | 0 |

### US-002: Acceptance Rate

**Definition:** Percentage of AI suggestions accepted by users

```
acceptance_rate = (suggestions_accepted / suggestions_shown) × 100
```

| Target | Warning | Critical |
|--------|---------|----------|
| > 30% | 20-30% | < 20% |

### US-003: Feature Utilization

**Definition:** Usage distribution across tool features

Track:
- Code completion
- Code generation
- Bug fixing
- Documentation
- Testing
- Refactoring
- Code review

### US-004: Session Duration

**Definition:** Time spent actively using AI assistance per session

```sql
SELECT
  AVG(session_duration_minutes) as avg_duration,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY session_duration_minutes) as median_duration
FROM ai_sessions;
```

---

## Productivity Metrics

### PR-001: PR Cycle Time

**Definition:** Time from PR creation to merge

```sql
SELECT
  team,
  AVG(EXTRACT(EPOCH FROM (merged_at - created_at))/3600) as avg_hours,
  COUNT(*) as pr_count
FROM pull_requests
WHERE merged_at IS NOT NULL
  AND created_at >= :start_date
GROUP BY team;
```

**Compare:** Before vs after AI tool adoption

### PR-002: Code Review Iterations

**Definition:** Number of review cycles before approval

```sql
SELECT
  AVG(review_cycles) as avg_cycles
FROM pull_requests
WHERE merged_at IS NOT NULL;
```

| Target | Before AI | After AI |
|--------|-----------|----------|
| Reduction | Baseline | -30% |

### PR-003: Lines of Code per Day

**Definition:** Net lines added per developer per day

```sql
SELECT
  author,
  DATE(committed_at) as date,
  SUM(additions - deletions) as net_loc
FROM commits
GROUP BY author, date;
```

**Note:** Use as directional indicator only, not as performance metric

### PR-004: Time to Resolution

**Definition:** Time from bug report to fix merged

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (fix_merged_at - bug_created_at))/3600) as avg_hours
FROM bugs
WHERE fix_merged_at IS NOT NULL;
```

---

## Quality Metrics

### QA-001: Bug Escape Rate

**Definition:** Bugs found in production per release

```
bug_escape_rate = production_bugs / releases
```

**Compare:** Pre and post AI adoption

### QA-002: Test Coverage Delta

**Definition:** Change in test coverage after AI tool adoption

```
coverage_delta = current_coverage - baseline_coverage
```

| Target | Warning | Critical |
|--------|---------|----------|
| +10% | 0-10% | Negative |

### QA-003: Code Review Defect Density

**Definition:** Issues found per 100 lines reviewed

```
defect_density = (issues_found / lines_reviewed) × 100
```

### QA-004: Security Finding Rate

**Definition:** Security issues per 1000 lines of AI-assisted code

```sql
SELECT
  COUNT(security_findings) / (SUM(ai_assisted_lines) / 1000) as rate
FROM code_scans
WHERE scan_date >= :start_date;
```

---

## Satisfaction Metrics

### SA-001: Net Promoter Score (NPS)

**Question:** "How likely are you to recommend this AI tool to a colleague?"

Scale: 0-10
- Promoters: 9-10
- Passives: 7-8
- Detractors: 0-6

```
NPS = %Promoters - %Detractors
```

| Target | Warning | Critical |
|--------|---------|----------|
| > 50 | 20-50 | < 20 |

### SA-002: Task Completion Satisfaction

**Question:** "How satisfied are you with the AI tool's help on your last task?"

Scale: 1-5 stars

Track by task type:
- Code generation
- Debugging
- Documentation
- Testing

### SA-003: Friction Points

**Question:** "What, if anything, prevents you from using the AI tool more?"

Categories:
- Performance/speed
- Accuracy issues
- Context understanding
- Integration problems
- Training gaps
- Security concerns

### SA-004: Feature Requests

Track most requested features and improvements

---

## Dashboard Specification

### Executive Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ AI TOOL ADOPTION - EXECUTIVE SUMMARY                        │
├─────────────────────────────────────────────────────────────┤
│ Activation: ████████░░ 85%    │ NPS: +45                    │
│ Weekly Active: 234/275        │ Acceptance Rate: 34%        │
├─────────────────────────────────────────────────────────────┤
│ PRODUCTIVITY IMPACT                                         │
│ PR Cycle Time: -22% ✓         │ Review Iterations: -28% ✓   │
│ Bug Escape Rate: -18% ✓       │ Test Coverage: +8%          │
├─────────────────────────────────────────────────────────────┤
│ COST                                                        │
│ Monthly: $5,500               │ Per-user ROI: $312/month    │
└─────────────────────────────────────────────────────────────┘
```

### Team Dashboard

- Usage trends (7-day rolling)
- Top users leaderboard
- Feature utilization breakdown
- Satisfaction trends

### Individual Dashboard

- Personal usage stats
- Acceptance rate trend
- Productivity metrics
- Suggested training

---

## Data Collection

### Event Schema

```typescript
interface AIToolEvent {
  event_id: string;
  event_type: 'suggestion_shown' | 'suggestion_accepted' | 'suggestion_rejected' | 'generation_requested' | 'session_start' | 'session_end';
  user_id: string;
  team_id: string;
  timestamp: Date;
  tool_name: string;
  feature: string;
  context: {
    language: string;
    file_type: string;
    project: string;
  };
  metrics: {
    latency_ms?: number;
    tokens_generated?: number;
    lines_affected?: number;
  };
}
```

### Privacy Considerations

- No code content stored
- User IDs pseudonymized in reports
- Aggregate metrics only for small teams (< 5)
- Opt-out available for individual tracking
- Data retained for 90 days

### Integration Points

| Source | Data | Frequency |
|--------|------|-----------|
| AI Tool API | Usage events | Real-time |
| GitHub/GitLab | PR metrics | Hourly |
| CI/CD | Test coverage | Per build |
| Survey tool | Satisfaction | Monthly |
| Security scanner | Findings | Daily |

---

## Alerting

### Critical Alerts

| Metric | Threshold | Action |
|--------|-----------|--------|
| Activation rate | < 50% after 2 weeks | Escalate to rollout lead |
| Acceptance rate | < 15% | Review prompt quality |
| Security findings | > 5 critical/week | Pause and review |
| NPS | < 0 | Executive review |

### Warning Alerts

| Metric | Threshold | Action |
|--------|-----------|--------|
| DAU drop | > 20% week-over-week | Investigate |
| Avg latency | > 10 seconds | Check infrastructure |
| Support tickets | > 10/day | Add training |

---

## Reporting Cadence

| Report | Audience | Frequency |
|--------|----------|-----------|
| Executive summary | Leadership | Monthly |
| Team metrics | Team leads | Weekly |
| Adoption progress | Rollout team | Daily |
| Incident report | Security | As needed |
