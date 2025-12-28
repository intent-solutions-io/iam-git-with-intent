# Auto-Fix Monitoring and Grading System

Complete guide to the auto-fix quality monitoring and grading system for Git With Intent.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Grading Rubric](#grading-rubric)
- [CI/CD Integration](#cicd-integration)
- [Monitoring Dashboard](#monitoring-dashboard)
- [Metrics and Alerting](#metrics-and-alerting)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Overview

The auto-fix monitoring system provides comprehensive quality assessment for AI-generated code fixes. It combines:

- **Rule-based grading** - Deterministic scoring using weighted criteria
- **AI-assisted analysis** - Optional LLM enhancement (Gemini/Claude)
- **Real-time monitoring** - Dashboard with metrics and trends
- **CI/CD integration** - Automated grading in GitHub Actions
- **Audit trail** - Complete history of all auto-fix runs

### Key Features

- Five-dimensional quality assessment (code, tests, PR, cost, docs)
- Letter grades (A-F) with detailed breakdowns
- Configurable rubrics (default, strict, custom)
- SQLite storage for analytics
- Auto-refresh dashboard with trends
- GitHub integration for PR comments

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Auto-Fix Monitoring                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   GitHub     │─────▶│   Grading    │─────▶│  SQLite   │ │
│  │   Actions    │      │   Service    │      │  Database │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│         │                      │                     │       │
│         │                      ▼                     │       │
│         │              ┌──────────────┐              │       │
│         │              │  AI Provider │              │       │
│         │              │ (Gemini/     │              │       │
│         │              │  Claude)     │              │       │
│         │              └──────────────┘              │       │
│         │                                            │       │
│         ▼                                            ▼       │
│  ┌──────────────┐                          ┌────────────┐   │
│  │  PR Comment  │                          │ Dashboard  │   │
│  │  (Results)   │                          │  (Metrics) │   │
│  └──────────────┘                          └────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Trigger**: GitHub Actions workflow runs on issue label
2. **Execution**: `gwi issue-to-code` generates fix
3. **Quality Checks**: Lint, typecheck, tests run
4. **Grading**: AI service grades fix using rubric
5. **Storage**: Metrics stored in SQLite
6. **Reporting**: Results posted to GitHub PR + dashboard

## Grading Rubric

### Default Criteria (5 dimensions)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Code Quality | 30% | Lint, typecheck, complexity |
| Test Coverage | 25% | Tests run, pass rate, coverage delta |
| PR Outcome | 25% | Merged, time to merge, human edits |
| Cost Efficiency | 10% | API costs, token usage, duration |
| Documentation | 10% | README, comments, changelog |

### Grade Scale

| Grade | Score Range | Description |
|-------|-------------|-------------|
| A | 90-100 | Excellent - production ready |
| B | 80-89 | Good - minor improvements needed |
| C | 70-79 | Acceptable - some issues |
| D | 60-69 | Needs work - significant issues |
| F | 0-59 | Failing - major problems |

### Rubric Schema

Rubrics are defined in JSON format conforming to `schemas/grading-rubric.schema.json`.

**Example rubric structure:**

```json
{
  "version": "1.0.0",
  "metadata": {
    "name": "default",
    "description": "Default grading rubric"
  },
  "criteria": [
    {
      "id": "code_quality",
      "name": "Code Quality",
      "weight": 0.30,
      "subcriteria": [
        {
          "id": "lint_passed",
          "name": "Linting Passed",
          "points": 10,
          "evaluationMethod": "rule_based",
          "threshold": "zero linting errors"
        }
      ]
    }
  ],
  "gradeScale": {
    "A": [90, 100],
    "B": [80, 89],
    "C": [70, 79],
    "D": [60, 69],
    "F": [0, 59]
  }
}
```

### Custom Rubrics

Create custom rubrics for different repositories or teams:

```bash
# Use custom rubric
export GWI_RUBRIC_PATH=./custom-rubric.json

# Validate rubric
node -e "
const { AutoFixGradingService } = require('./packages/core/dist/monitoring');
const rubric = require('./custom-rubric.json');
AutoFixGradingService.validateRubric(rubric);
console.log('Rubric valid!');
"
```

## CI/CD Integration

### GitHub Actions Workflow

The auto-fix workflow (`.github/workflows/auto-fix.yml`) runs on issue labels:

```yaml
on:
  issues:
    types: [labeled]

# Triggers on labels: auto-fix, gwi:auto, gwi-auto-code
```

### Workflow Steps

1. **Setup** - Checkout, install dependencies, build
2. **Auth** - WIF authentication for GCP services
3. **Database** - Initialize SQLite database
4. **Auto-Fix** - Run `gwi issue-to-code`
5. **Quality Checks** - Lint, typecheck, tests
6. **Grading** - Grade using AI service
7. **Storage** - Store metrics in SQLite
8. **Reporting** - Post results to GitHub

### Environment Variables

Required in GitHub Secrets:

```bash
ANTHROPIC_API_KEY="<your-key>"      # Claude API
GOOGLE_AI_API_KEY="<your-key>"         # Gemini API
GITHUB_TOKEN="<auto-provided>"         # GitHub access (auto-provided)
```

Optional:

```bash
GWI_RUBRIC_PATH="./custom-rubric.json"  # Custom rubric
WIF_PROVIDER="projects/..."             # GCP WIF provider
WIF_SERVICE_ACCOUNT="..."               # GCP service account
```

### Database Schema

SQLite tables for metrics:

- `autofix_runs` - Run metadata (ID, status, duration, etc.)
- `quality_metrics` - Quality checks (lint, tests, coverage)
- `grades` - Grade results (score, letter, breakdown)
- `alerts` - Alert events (errors, warnings)

## Monitoring Dashboard

### Web Dashboard

React component: `AutoFixMonitoring.tsx` in `apps/web/src/components/`

**Features:**

- Real-time metrics (total runs, success rate, avg grade)
- Trend charts (7-day score history)
- Grade distribution (A-F breakdown)
- Recent runs table (last 10 runs)
- Auto-refresh (configurable interval)
- Export functionality (CSV, JSON)

### Accessing Dashboard

```bash
# Development
cd apps/web
npm run dev
# Visit http://localhost:5173/monitoring

# Production
# Visit https://your-domain.com/monitoring
```

### Mock Data

The dashboard includes mock data for development. In production, connect to API:

```typescript
// Update fetchMetrics() in AutoFixMonitoring.tsx
const response = await fetch('/api/auto-fix/metrics');
const data = await response.json();
setMetrics(data);
```

## Metrics and Alerting

### Key Metrics

| Metric | Description | Good Target |
|--------|-------------|-------------|
| Success Rate | % of runs that create PRs | > 85% |
| Average Score | Mean quality score | > 80 |
| Average Grade | Most common grade | B+ or better |
| Cost per Fix | API cost per run | < $0.10 |
| Time to Merge | Hours until PR merged | < 24h |

### Alert Thresholds

Configure alerts in workflow or dashboard:

```yaml
# Example: Alert on low success rate
- name: Check Success Rate
  run: |
    RATE=$(sqlite3 "$DB_PATH" "SELECT AVG(CASE WHEN status='success' THEN 1 ELSE 0 END)*100 FROM autofix_runs WHERE created_at > datetime('now', '-24 hours')")
    if (( $(echo "$RATE < 80" | bc -l) )); then
      echo "::warning::Success rate below 80%: $RATE%"
    fi
```

### Notification Channels

- **GitHub** - PR comments, issue comments
- **Slack** - Webhook integration (planned)
- **Email** - SMTP alerts (planned)
- **Discord** - Webhook integration (planned)

## API Reference

### AutoFixGradingService

```typescript
import { AutoFixGradingService } from '@gwi/core/monitoring';

// Initialize service
const service = new AutoFixGradingService({
  rubricPath: './custom-rubric.json',  // Optional
  aiProvider: 'gemini',                // 'gemini' | 'claude' | 'mock'
  useAI: true                          // Enable AI assistance
});

// Grade single run
const grade = await service.grade(run, useAI);

// Grade multiple runs
const grades = await service.gradeMultiple(runs, useAI);

// Get rubric
const rubric = service.getRubric();

// Validate rubric
AutoFixGradingService.validateRubric(rubric);
```

### GradeResult Interface

```typescript
interface GradeResult {
  overallScore: number;              // 0-100
  letterGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  criteria: CriterionScore[];        // Detailed breakdown
  summary: string;                   // Human-readable summary
  strengths: string[];               // What went well
  weaknesses: string[];              // What needs improvement
  recommendations: string[];         // Actionable suggestions
  metadata: {
    gradedAt: string;                // ISO timestamp
    version: string;                 // Rubric version
    runId: string;                   // Run identifier
  };
}
```

### CLI Usage

```bash
# Grade a PR manually
gwi grade <pr-url>

# Grade with custom rubric
gwi grade <pr-url> --rubric ./strict-rubric.json

# Export grades to CSV
gwi grade --export grades.csv

# View grade history
gwi grade --history --last 30
```

## Troubleshooting

### Common Issues

#### Low Grades

**Problem**: Consistently receiving C/D/F grades

**Solutions:**
- Ensure code passes lint and typecheck before PR
- Add test coverage for new code
- Update documentation (README, comments)
- Review AI-generated code before committing

#### Grading Failures

**Problem**: Workflow fails at grading step

**Solutions:**
- Check API keys are set correctly
- Verify rubric JSON is valid
- Review workflow logs for errors
- Fall back to mock provider for testing

#### Missing Metrics

**Problem**: Dashboard shows no data

**Solutions:**
- Verify SQLite database exists
- Check GitHub Actions artifacts
- Ensure workflow completed successfully
- Connect dashboard to correct API endpoint

#### High API Costs

**Problem**: API costs exceed budget

**Solutions:**
- Use mock provider for testing
- Limit grading to important PRs only
- Reduce token usage (smaller diffs)
- Use Gemini Flash instead of Claude

### Debug Mode

Enable verbose logging:

```bash
# In GitHub Actions
export DEBUG=gwi:grading

# In local development
export LOG_LEVEL=debug
npm run dev
```

### Support

- GitHub Issues: https://github.com/intent-solutions-io/git-with-intent/issues
- Documentation: https://git-with-intent.io/docs
- Slack: https://git-with-intent.slack.com

## Best Practices

1. **Run ARV before committing** - Catch issues early
2. **Review AI suggestions** - Don't blindly accept
3. **Add tests** - Improves grade significantly
4. **Update docs** - README, comments, changelog
5. **Monitor trends** - Watch for degradation
6. **Tune rubric** - Adjust weights for your team
7. **Set alerts** - Get notified of problems
8. **Analyze failures** - Learn from low grades

## Roadmap

- [ ] TimeGPT integration for predictive analytics
- [ ] Slack/Discord notifications
- [ ] Advanced visualizations (heatmaps, treemaps)
- [ ] Multi-repository aggregation
- [ ] Custom scoring functions
- [ ] A/B testing for rubrics
- [ ] ML-based anomaly detection

## License

MIT License - See LICENSE file for details

---

**Last Updated**: 2025-12-27
**Version**: 1.0.0
