# DevEx Dashboard (IDP Portal) Specification

> **Document**: 217-DR-SPEC-devex-dashboard
> **Epic**: EPIC 009 - DevEx Dashboard (IDP Portal)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Single-pane-of-glass dashboard for developer productivity metrics, GWI run status, and team health. The Internal Developer Platform (IDP) portal provides visibility into SDLC performance and AI-assisted development.

---

## Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DEVEX DASHBOARD ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Navigation Bar                               │    │
│  │  [Overview] [Runs] [Metrics] [Golden Tasks] [Team] [Settings]   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Data Sources                                 │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │    │
│  │  │ Firestore │ │  GitHub   │ │  Metrics  │ │    AI     │        │    │
│  │  │   Runs    │ │    API    │ │ Registry  │ │ Providers │        │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Dashboard Views                              │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │    │
│  │  │ Run Explorer │ │ SDLC Metrics │ │ Golden Tasks │             │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │    │
│  │  │Provider Usage│ │Approval Queue│ │  Team Health │             │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard Views

### 1. Overview (Home)

**Purpose:** At-a-glance system health and key metrics.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DEVEX DASHBOARD - Overview                                              │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│   Today's Runs  │  Success Rate   │  Avg Duration   │  Pending Reviews  │
│       47        │      94%        │     4.2 min     │        3          │
│    ↑ 12%        │    ↓ 2%         │    ↓ 15%        │                   │
├─────────────────┴─────────────────┴─────────────────┴───────────────────┤
│                                                                          │
│  Run Activity (7 days)                    System Health                  │
│  ████████████████████████████             ✓ API: Healthy                │
│  ████████████████████████████             ✓ Gateway: Healthy            │
│  ████████████████████████████             ✓ Worker: Healthy             │
│  ████████████████████████████             ⚠ Queue: 12 pending           │
│                                                                          │
├─────────────────────────────────┬───────────────────────────────────────┤
│  Recent Runs                    │  Pending Approvals                     │
│  ─────────────────────────────  │  ─────────────────────────────────    │
│  ✓ run-abc123 triage 2m ago    │  ⏳ run-xyz789 awaiting approval       │
│  ✓ run-def456 review 5m ago    │  ⏳ run-uvw321 awaiting approval       │
│  ✗ run-ghi789 coder  12m ago   │                                        │
│  ✓ run-jkl012 resolve 15m ago  │                                        │
└─────────────────────────────────┴───────────────────────────────────────┘
```

**Metrics:**
- Today's runs (count, % change from yesterday)
- Success rate (% of successful runs)
- Average duration (median run time)
- Pending reviews (awaiting approval)
- System health (service status)

---

### 2. Run Explorer

**Purpose:** Browse, filter, and inspect all GWI runs.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Run Explorer                                        [Export] [Refresh] │
├─────────────────────────────────────────────────────────────────────────┤
│  Filters:                                                                │
│  [Status ▼] [Type ▼] [Tenant ▼] [Date Range ▼] [Search...]             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Run ID          Type      Status     Duration   Agent    Created        │
│  ──────────────  ────────  ─────────  ────────   ─────    ───────────   │
│  run-abc123      triage    ✓ success  45s        triage   5 min ago     │
│  run-def456      review    ✓ success  2.3m       reviewer 12 min ago    │
│  run-ghi789      coder     ✗ failed   4.5m       coder    25 min ago    │
│  run-jkl012      resolve   ⏳ pending  -          resolver 30 min ago    │
│  run-mno345      autopilot ✓ success  8.2m       multiple 1 hour ago    │
│                                                                          │
│  [◀ Previous]  Page 1 of 24  [Next ▶]                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Filter by status (success, failed, pending, cancelled)
- Filter by workflow type (triage, review, coder, resolve, autopilot)
- Filter by tenant/organization
- Date range selection
- Full-text search
- Click to view run details
- Export to CSV

---

### 3. SDLC Metrics

**Purpose:** Software development lifecycle performance metrics.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SDLC Metrics                                    Period: [Last 30 days] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Lead Time Metrics                                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  PR Cycle Time          Code Review Time          Deploy Frequency       │
│     4.2 hours              2.1 hours                 12/day              │
│     ↓ 18% vs last month    ↓ 25%                    ↑ 30%               │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PR Cycle Time Trend (30 days)                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 8h ─                                                              │  │
│  │ 6h ─    ╭──╮                                                      │  │
│  │ 4h ─ ───╯  ╰───────╮        ╭─────────────────                    │  │
│  │ 2h ─               ╰────────╯                                     │  │
│  │ 0h ─                                                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  GWI Impact                                                              │
│  ─────────────────────────────────────────────────────────────────────  │
│  AI-Assisted PRs         Time Saved              Code Quality           │
│     78%                    45 hours/week           +15% coverage        │
│                                                                          │
│  Issues Auto-Resolved    Reviews Auto-Approved    Conflicts Resolved    │
│     23                       45                        12               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Metrics:**
- PR Cycle Time (creation to merge)
- Code Review Time (review requested to approved)
- Deploy Frequency (deploys per day/week)
- Change Failure Rate (failed deploys %)
- Mean Time to Recovery (MTTR)
- AI-assisted PR percentage
- Time saved by automation

---

### 4. Golden Task Scores

**Purpose:** Track performance on standardized evaluation tasks.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Golden Task Performance                              [Run All] [Export]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Overall Score: 87/100                   Last Run: 2 hours ago          │
│  ████████████████████░░░░░                                              │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Category Scores                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  Code Generation        ████████████████░░░░  85%   (17/20 tasks)      │
│  Bug Fixing             █████████████████░░░  90%   (18/20 tasks)      │
│  Refactoring            ████████████████████  95%   (19/20 tasks)      │
│  Code Review            ███████████████░░░░░  80%   (16/20 tasks)      │
│  Documentation          ████████████████░░░░  85%   (17/20 tasks)      │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Recent Task Results                                                     │
│  ─────────────────────────────────────────────────────────────────────  │
│  Task                          Model           Result    Time    Score  │
│  ────────────────────────────  ──────────────  ────────  ──────  ────── │
│  GT-001: REST endpoint         claude-sonnet-4 ✓ Pass    45s     95    │
│  GT-002: Auth middleware       claude-sonnet-4 ✓ Pass    62s     90    │
│  GT-003: SQL injection fix     claude-sonnet-4 ✓ Pass    28s     100   │
│  GT-004: N+1 query fix         claude-sonnet-4 ✗ Fail    55s     60    │
│  GT-005: Type migration        claude-opus-4   ✓ Pass    120s    85    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Overall score across all golden tasks
- Category breakdown (generation, fixing, review, etc.)
- Individual task results with model used
- Historical trend tracking
- Run individual tasks or full suite
- Compare scores across models

---

### 5. Provider Usage

**Purpose:** Monitor AI provider usage, costs, and performance.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI Provider Usage                              Period: [This Month]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Monthly Summary                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  Total Cost: $1,247.50          Tokens: 45.2M          Requests: 12.4K │
│  Budget: $2,000 (62% used)      ↑ 15% vs last month    ↑ 23%           │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Cost by Provider                         Usage by Model                 │
│  ┌────────────────────────┐              ┌────────────────────────┐    │
│  │  Anthropic   $892 72%  │              │ claude-sonnet-4  65%   │    │
│  │  Google      $245 20%  │              │ gemini-flash     22%   │    │
│  │  OpenAI      $110  8%  │              │ claude-opus-4     8%   │    │
│  └────────────────────────┘              │ gpt-4o            5%   │    │
│                                          └────────────────────────┘    │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Daily Cost Trend                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ $80 ─           ╭─╮                                               │  │
│  │ $60 ─    ╭──────╯ ╰────╮        ╭────────────                     │  │
│  │ $40 ─ ───╯             ╰────────╯                                 │  │
│  │ $20 ─                                                             │  │
│  │  $0 ─                                                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Model Performance                                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  Model              Latency P95    Success    Cost/1K     Requests      │
│  ────────────────── ───────────    ───────    ────────    ──────────   │
│  claude-sonnet-4    2.4s           98.5%      $0.018      8,124        │
│  gemini-flash       0.8s           99.1%      $0.0004     2,734        │
│  claude-opus-4      8.2s           97.2%      $0.090      987          │
│  gpt-4o             3.1s           98.8%      $0.012      621          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Metrics:**
- Total cost (vs budget)
- Token usage (input/output)
- Request count
- Cost by provider/model
- Performance by model (latency, success rate)
- Daily/weekly cost trends

---

### 6. Approval Queue

**Purpose:** Manage pending approvals for GWI operations.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Approval Queue                                     [Bulk Actions ▼]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Pending Approvals: 3           Approved Today: 12   Rejected: 2       │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Run ID          Action      Repository           Requester   Waiting   │
│  ──────────────  ──────────  ───────────────────  ─────────── ──────── │
│  run-abc123      commit      org/repo-1           user1       5 min    │
│                  [View Diff] [Approve] [Reject]                         │
│  ────────────────────────────────────────────────────────────────────  │
│  run-def456      push        org/repo-2           user2       12 min   │
│                  [View Changes] [Approve] [Reject]                      │
│  ────────────────────────────────────────────────────────────────────  │
│  run-ghi789      merge       org/repo-1           user1       25 min   │
│                  [View PR] [Approve] [Reject]                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- List pending approvals
- View changes/diff before approval
- Approve/reject actions
- Bulk approve (with caution)
- Filter by action type, repository, requester
- Auto-expire old requests

---

### 7. Team Health

**Purpose:** Team productivity and collaboration metrics.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Team Health                                        Period: [This Week] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Team Overview                                                           │
│  ─────────────────────────────────────────────────────────────────────  │
│  Active Users: 8/10        Runs/User: 12.5        AI Adoption: 85%     │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Individual Metrics                                                      │
│  ─────────────────────────────────────────────────────────────────────  │
│  User          Runs    Success   Avg Duration   Time Saved   Last Active│
│  ───────────── ─────   ───────   ────────────   ──────────   ───────── │
│  alice         23      96%       3.2 min        4.5 hours    2 min ago │
│  bob           18      89%       4.1 min        3.2 hours    1 hour ago│
│  carol         15      93%       3.8 min        2.8 hours    30 min    │
│  dave          12      91%       5.2 min        2.1 hours    2 hours   │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Feature Adoption                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  Triage        ████████████████████  100%  (all users)                 │
│  Review        ████████████████░░░░   85%  (8/10 users)                │
│  Code Gen      ████████████░░░░░░░░   65%  (6/10 users)                │
│  Autopilot     ████████░░░░░░░░░░░░   40%  (4/10 users)                │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Weekly Activity                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │      Mon  Tue  Wed  Thu  Fri  Sat  Sun                           │  │
│  │  8am  ██   ██   ██   ██   ██   ░    ░                            │  │
│  │  12pm ██   ██   ██   ██   ██   ░    ░                            │  │
│  │  4pm  ██   ██   ██   ██   █░   ░    ░                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Metrics:**
- Active users
- Runs per user
- Success rate per user
- Time saved estimate
- Feature adoption rates
- Activity heatmap

---

## Data Sources

| View | Primary Source | Update Frequency |
|------|----------------|------------------|
| Overview | Firestore + Metrics | Real-time |
| Run Explorer | Firestore | Real-time |
| SDLC Metrics | GitHub API + BigQuery | Hourly |
| Golden Tasks | Test Results DB | On-demand |
| Provider Usage | Metrics Registry | Hourly |
| Approval Queue | Firestore | Real-time |
| Team Health | Firestore + GitHub | Daily |

---

## Access Control

| Role | Overview | Runs | Metrics | Golden | Provider | Approvals | Team |
|------|----------|------|---------|--------|----------|-----------|------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Developer | ✓ | Own | Limited | ✓ | Limited | Own | - |
| Viewer | ✓ | - | - | - | - | - | - |

---

## Related Documentation

- [218-DR-TMPL-dashboard-widgets.md](./218-DR-TMPL-dashboard-widgets.md)
- [205-DR-METR-ai-adoption-telemetry.md](./205-DR-METR-ai-adoption-telemetry.md)
- [210-DR-SPEC-ai-performance-metrics.md](./210-DR-SPEC-ai-performance-metrics.md)
