# Budget Policy Template

> **Document**: 225-DR-TMPL-budget-policy
> **Epic**: EPIC 013 - Cost Optimization + Budget Alerts
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template to define budget policies for tenants. Budget policies control spending limits, alert thresholds, and enforcement actions.

---

## Budget Policy Template

```yaml
# budget-policy.yml
# Template for GWI tenant budget configuration

# ═══════════════════════════════════════════════════════════════════════════════
# BUDGET IDENTITY
# ═══════════════════════════════════════════════════════════════════════════════
budget:
  name: "Monthly AI Budget"
  description: "Controls AI/LLM spending for the organization"
  tenant_id: "tenant-xxx"  # Leave blank for org-wide
  created_by: "admin@company.com"
  effective_date: "2026-02-01"

# ═══════════════════════════════════════════════════════════════════════════════
# SPENDING LIMITS
# ═══════════════════════════════════════════════════════════════════════════════
limits:
  # Total budget
  amount: 2000.00
  currency: USD
  period: monthly  # daily | weekly | monthly | quarterly

  # Per-category limits (optional, must sum to <= total)
  categories:
    ai:
      amount: 1500.00
      description: "AI/LLM API costs"
    infrastructure:
      amount: 400.00
      description: "GCP compute and storage"
    other:
      amount: 100.00
      description: "Miscellaneous"

  # Per-run limits (optional)
  per_run:
    max_cost: 5.00  # Maximum cost per single run
    max_tokens: 100000  # Maximum tokens per run

  # Per-user limits (optional)
  per_user:
    daily_max: 50.00
    monthly_max: 500.00

# ═══════════════════════════════════════════════════════════════════════════════
# ALERT THRESHOLDS
# ═══════════════════════════════════════════════════════════════════════════════
alerts:
  # Alert at 50% utilization
  - threshold: 50
    severity: info
    channels:
      - type: slack
        target: "#gwi-alerts"
    message: "Budget at 50% - on track for the month"

  # Alert at 80% utilization
  - threshold: 80
    severity: warning
    channels:
      - type: slack
        target: "#gwi-alerts"
      - type: email
        target: "finance@company.com"
    message: "Budget at 80% - review spending patterns"

  # Alert at 90% utilization
  - threshold: 90
    severity: high
    channels:
      - type: slack
        target: "#gwi-alerts"
      - type: email
        target: ["finance@company.com", "engineering@company.com"]
      - type: pagerduty
        target: "budget-alerts"
    message: "Budget at 90% - approaching limit"

  # Alert at 100% utilization
  - threshold: 100
    severity: critical
    channels:
      - type: slack
        target: "#gwi-alerts"
      - type: email
        target: ["finance@company.com", "engineering@company.com", "cto@company.com"]
      - type: pagerduty
        target: "budget-critical"
    message: "Budget EXCEEDED - immediate action required"

# ═══════════════════════════════════════════════════════════════════════════════
# ENFORCEMENT ACTIONS
# ═══════════════════════════════════════════════════════════════════════════════
enforcement:
  # Actions at different thresholds
  actions:
    # At 90%: Throttle to cheaper models
    - threshold: 90
      action: throttle
      config:
        # Force lower-tier models
        model_policy: cost_optimized
        # Reduce rate limits by 50%
        rate_limit_factor: 0.5
        # Increase cache TTL to reduce API calls
        cache_ttl_factor: 2.0

    # At 100%: Block new runs
    - threshold: 100
      action: block
      config:
        # Block all new runs
        block_new_runs: true
        # Allow in-progress runs to complete
        allow_in_progress: true
        # Message shown to users
        user_message: "Monthly budget exceeded. Contact admin for assistance."

  # Exceptions (always allowed even when blocked)
  exceptions:
    - type: user
      values: ["admin@company.com", "cto@company.com"]
    - type: run_type
      values: ["emergency", "incident"]

  # Auto-reset
  reset:
    enabled: true
    time: "00:00 UTC"  # Reset at midnight UTC on period boundary

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL POLICIES
# ═══════════════════════════════════════════════════════════════════════════════
model_policies:
  default:
    name: "balanced"
    description: "Balance cost and quality"
    rules:
      - complexity: [1, 3]
        models: ["gemini-2.0-flash", "gpt-4o-mini"]
      - complexity: [4, 6]
        models: ["claude-sonnet-4", "gpt-4o"]
      - complexity: [7, 10]
        models: ["claude-opus-4", "gpt-4o"]

  cost_optimized:
    name: "cost_optimized"
    description: "Minimize costs (used when throttling)"
    rules:
      - complexity: [1, 5]
        models: ["gemini-2.0-flash"]
      - complexity: [6, 8]
        models: ["claude-sonnet-4"]
      - complexity: [9, 10]
        models: ["claude-sonnet-4"]  # No premium models

  quality_first:
    name: "quality_first"
    description: "Prioritize quality over cost"
    rules:
      - complexity: [1, 3]
        models: ["claude-sonnet-4", "gpt-4o"]
      - complexity: [4, 10]
        models: ["claude-opus-4"]

# ═══════════════════════════════════════════════════════════════════════════════
# REPORTING
# ═══════════════════════════════════════════════════════════════════════════════
reporting:
  # Scheduled reports
  schedules:
    - name: "Weekly Cost Summary"
      frequency: weekly
      day: monday
      time: "09:00 UTC"
      recipients: ["finance@company.com"]
      format: pdf

    - name: "Monthly Cost Report"
      frequency: monthly
      day: 1  # First of month
      time: "09:00 UTC"
      recipients: ["finance@company.com", "engineering@company.com"]
      format: pdf

  # Real-time dashboard access
  dashboard:
    enabled: true
    url: "https://app.gwi.dev/billing"
    access:
      - role: admin
        permissions: [read, write]
      - role: finance
        permissions: [read]
      - role: developer
        permissions: [read_own]  # Only see own costs
```

---

## Example Configurations

### Startup Budget (Cost Conscious)

```yaml
budget:
  name: "Startup Monthly Budget"

limits:
  amount: 500.00
  currency: USD
  period: monthly
  per_run:
    max_cost: 1.00
    max_tokens: 50000

alerts:
  - threshold: 50
    severity: warning
    channels:
      - type: slack
        target: "#alerts"

enforcement:
  actions:
    - threshold: 80
      action: throttle
      config:
        model_policy: cost_optimized
    - threshold: 100
      action: block

model_policies:
  default:
    name: "cost_first"
    rules:
      - complexity: [1, 10]
        models: ["gemini-2.0-flash", "gpt-4o-mini"]
```

### Enterprise Budget (Quality Focused)

```yaml
budget:
  name: "Enterprise Monthly Budget"

limits:
  amount: 50000.00
  currency: USD
  period: monthly
  categories:
    ai:
      amount: 40000.00
    infrastructure:
      amount: 10000.00

alerts:
  - threshold: 80
    severity: warning
  - threshold: 95
    severity: high
  - threshold: 100
    severity: critical

enforcement:
  actions:
    - threshold: 100
      action: alert  # Alert only, no blocking

model_policies:
  default:
    name: "quality_first"
    rules:
      - complexity: [1, 4]
        models: ["claude-sonnet-4", "gpt-4o"]
      - complexity: [5, 10]
        models: ["claude-opus-4"]
```

### Per-Team Budgets

```yaml
budget:
  name: "Engineering Team Budget"
  tenant_id: "team-engineering"

limits:
  amount: 5000.00
  currency: USD
  period: monthly

  per_user:
    daily_max: 100.00
    monthly_max: 1000.00

alerts:
  - threshold: 80
    channels:
      - type: slack
        target: "#engineering-costs"

enforcement:
  actions:
    - threshold: 100
      action: throttle
```

---

## Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| `amount` | > 0 | Budget amount must be positive |
| `period` | enum | Period must be daily, weekly, monthly, or quarterly |
| `threshold` | 0-100 | Alert threshold must be between 0 and 100 |
| `categories` | sum <= total | Category limits cannot exceed total budget |
| `model_policy` | exists | Referenced model policy must be defined |

---

## API Usage

### Create Budget

```bash
curl -X POST https://api.gwi.dev/v1/billing/budgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @budget-policy.yml
```

### Update Budget

```bash
curl -X PUT https://api.gwi.dev/v1/billing/budgets/budget-123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @budget-policy-updated.yml
```

### Get Budget Status

```bash
curl https://api.gwi.dev/v1/billing/budgets/budget-123/status \
  -H "Authorization: Bearer $TOKEN"
```

---

## CLI Commands

```bash
# Create budget from template
gwi billing budget create -f budget-policy.yml

# List budgets
gwi billing budget list

# Check budget status
gwi billing budget status budget-123

# Update budget
gwi billing budget update budget-123 -f budget-policy.yml

# Delete budget
gwi billing budget delete budget-123

# Simulate budget usage
gwi billing budget simulate budget-123 --runs 100 --avg-cost 2.50
```

---

## Related Documentation

- [224-DR-SPEC-cost-optimization.md](./224-DR-SPEC-cost-optimization.md)
