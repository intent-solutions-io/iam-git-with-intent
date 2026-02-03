# Feature Flag Definition Template

> **Document**: 229-DR-TMPL-flag-definition
> **Epic**: EPIC 018 - Feature Flags Integration
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template to define feature flags. Store flag definitions in `flags/` directory as YAML files.

---

## Flag Definition Template

```yaml
# flags/<flag-key>.yaml
# Feature flag definition

# ═══════════════════════════════════════════════════════════════════════════════
# FLAG IDENTITY
# ═══════════════════════════════════════════════════════════════════════════════
key: my-feature-flag
name: "My Feature Flag"
description: |
  Detailed description of what this flag controls.
  Include context about when and why to enable/disable.

# ═══════════════════════════════════════════════════════════════════════════════
# FLAG CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Flag type: boolean | string | number | json
type: boolean

# Whether flag is currently active (can be evaluated)
enabled: true

# Default value when no targeting rules match
defaultValue: false

# For string/enum flags: list of valid values
# variations:
#   - option-a
#   - option-b
#   - option-c

# ═══════════════════════════════════════════════════════════════════════════════
# TARGETING RULES
# ═══════════════════════════════════════════════════════════════════════════════

# Rules are evaluated in priority order (lower number = higher priority)
# First matching rule wins

targeting:
  # Rule 1: Internal users always get the feature
  - id: internal-users
    name: "Internal Users"
    priority: 1
    conditions:
      - attribute: user.email
        operator: ends_with
        value: "@company.com"
    variation: true

  # Rule 2: Enterprise tenants get the feature
  - id: enterprise-tenants
    name: "Enterprise Tenants"
    priority: 2
    conditions:
      - attribute: tenant.plan
        operator: equals
        value: enterprise
    variation: true

  # Rule 3: Beta users (specific list)
  - id: beta-users
    name: "Beta Users"
    priority: 3
    conditions:
      - attribute: tenant.id
        operator: in
        value:
          - tenant-beta-1
          - tenant-beta-2
          - tenant-beta-3
    variation: true

  # Rule 4: Percentage rollout for remaining users
  - id: percentage-rollout
    name: "25% Rollout"
    priority: 4
    conditions: []  # No conditions = matches all
    variation: true
    percentage: 25  # Only 25% of users get this variation

# ═══════════════════════════════════════════════════════════════════════════════
# METADATA
# ═══════════════════════════════════════════════════════════════════════════════

metadata:
  # Owner of this flag
  owner: team:backend

  # Related ticket/issue
  ticket: "GWI-1234"

  # Tags for organization
  tags:
    - feature
    - backend
    - ai

  # Lifecycle stage
  # Values: development | testing | rollout | stable | deprecated
  lifecycle: rollout

  # Expected removal date (for temporary flags)
  sunset_date: "2026-06-01"

  # Created timestamp
  created_at: "2026-02-01"
  created_by: "developer@company.com"

  # Last modified
  updated_at: "2026-02-03"
  updated_by: "admin@company.com"
```

---

## Flag Type Examples

### Boolean Flag

```yaml
key: enable-opus-model
name: "Enable Opus Model"
description: "Allow use of Claude Opus model for complex tasks"
type: boolean
enabled: true
defaultValue: false
targeting:
  - id: enterprise-only
    name: "Enterprise Only"
    priority: 1
    conditions:
      - attribute: tenant.plan
        operator: equals
        value: enterprise
    variation: true
```

### String Flag

```yaml
key: default-ai-model
name: "Default AI Model"
description: "Default model for code generation tasks"
type: string
enabled: true
defaultValue: claude-sonnet-4
variations:
  - claude-sonnet-4
  - claude-opus-4
  - gpt-4o
  - gemini-2.0-flash
targeting:
  - id: high-value-tenants
    name: "High Value Tenants"
    priority: 1
    conditions:
      - attribute: tenant.attributes.tier
        operator: equals
        value: premium
    variation: claude-opus-4
```

### Number Flag

```yaml
key: max-concurrent-runs
name: "Max Concurrent Runs"
description: "Maximum number of concurrent runs per tenant"
type: number
enabled: true
defaultValue: 5
min: 1
max: 50
targeting:
  - id: enterprise-limit
    name: "Enterprise Limit"
    priority: 1
    conditions:
      - attribute: tenant.plan
        operator: equals
        value: enterprise
    variation: 20
  - id: pro-limit
    name: "Pro Limit"
    priority: 2
    conditions:
      - attribute: tenant.plan
        operator: equals
        value: pro
    variation: 10
```

### JSON Flag

```yaml
key: model-config
name: "Model Configuration"
description: "AI model generation parameters"
type: json
enabled: true
defaultValue:
  temperature: 0.7
  maxTokens: 4096
  topP: 0.9
  frequencyPenalty: 0
  presencePenalty: 0
targeting:
  - id: creative-mode
    name: "Creative Mode Tenants"
    priority: 1
    conditions:
      - attribute: tenant.attributes.creative_mode
        operator: equals
        value: true
    variation:
      temperature: 0.9
      maxTokens: 8192
      topP: 0.95
      frequencyPenalty: 0.5
      presencePenalty: 0.5
```

---

## Targeting Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `tenant.plan equals enterprise` |
| `not_equals` | Not equal | `user.role not_equals guest` |
| `contains` | String contains | `user.email contains @beta` |
| `not_contains` | String not contains | `tenant.name not_contains test` |
| `starts_with` | String starts with | `user.id starts_with usr_` |
| `ends_with` | String ends with | `user.email ends_with @company.com` |
| `matches_regex` | Regex match | `tenant.id matches_regex ^tenant-[a-z]+$` |
| `in` | Value in list | `tenant.id in [a, b, c]` |
| `not_in` | Value not in list | `user.role not_in [guest, trial]` |
| `greater_than` | Numeric greater | `tenant.usage greater_than 1000` |
| `less_than` | Numeric less | `context.complexity less_than 5` |
| `greater_than_or_equal` | Numeric >= | `tenant.age_days greater_than_or_equal 30` |
| `less_than_or_equal` | Numeric <= | `context.retries less_than_or_equal 3` |
| `semver_greater_than` | Semver comparison | `context.sdk_version semver_greater_than 2.0.0` |
| `semver_less_than` | Semver comparison | `context.sdk_version semver_less_than 3.0.0` |

---

## Context Attributes

### User Attributes

```yaml
user.id              # User unique identifier
user.email           # User email address
user.name            # User display name
user.role            # User role (admin, developer, etc.)
user.created_at      # User creation timestamp
user.attributes.*    # Custom user attributes
```

### Tenant Attributes

```yaml
tenant.id            # Tenant unique identifier
tenant.name          # Tenant display name
tenant.plan          # Subscription plan (free, pro, enterprise)
tenant.created_at    # Tenant creation timestamp
tenant.usage         # Usage metrics
tenant.attributes.*  # Custom tenant attributes
```

### Context Attributes

```yaml
context.environment   # Environment (development, staging, production)
context.sdk_version   # SDK version
context.platform      # Platform (web, cli, api)
context.region        # Geographic region
context.ip_address    # Client IP address
context.user_agent    # User agent string
context.custom.*      # Custom context attributes
```

---

## Kill Switch Template

```yaml
# flags/kill-switches/kill-ai-operations.yaml
key: kill-ai-operations
name: "Kill AI Operations"
description: |
  EMERGENCY: Immediately stops all AI model API calls.
  Use when provider is down or costs are exceeding limits.

type: boolean
enabled: true
defaultValue: false  # When true, AI operations are blocked

# No targeting - global kill switch
targeting: []

metadata:
  owner: team:platform
  tags:
    - kill-switch
    - emergency
    - ai
  lifecycle: stable

  # Kill switches never sunset
  sunset_date: null

  # Emergency contacts
  emergency_contacts:
    - oncall@company.com
    - cto@company.com
```

---

## Validation Rules

### Required Fields

| Field | Required | Notes |
|-------|----------|-------|
| `key` | Yes | Unique identifier, lowercase with hyphens |
| `name` | Yes | Human-readable name |
| `description` | Yes | Detailed description |
| `type` | Yes | boolean, string, number, or json |
| `enabled` | Yes | Whether flag is active |
| `defaultValue` | Yes | Value when no rules match |

### Naming Conventions

- Flag keys: lowercase, alphanumeric with hyphens
- Examples: `enable-feature-x`, `max-concurrent-runs`, `default-model`
- Avoid: `EnableFeatureX`, `enable_feature_x`, `ENABLE-FEATURE-X`

### Best Practices

1. **Keep flags temporary** - Set sunset dates and clean up after rollout
2. **One purpose per flag** - Don't overload flags with multiple uses
3. **Document thoroughly** - Explain what, why, and when
4. **Use meaningful defaults** - Default should be safe/conservative
5. **Test targeting rules** - Verify rules before enabling in production
6. **Monitor flag usage** - Track evaluations and values returned

---

## CLI Commands

```bash
# Validate flag definition
gwi flags validate flags/my-flag.yaml

# Create flag from template
gwi flags create my-new-flag \
  --type boolean \
  --default false \
  --description "My new feature flag"

# Dry-run targeting evaluation
gwi flags evaluate my-flag \
  --context '{"tenant": {"id": "test", "plan": "enterprise"}}'

# List all flags
gwi flags list --format yaml

# Export flag definitions
gwi flags export --output flags-backup.yaml
```

---

## Related Documentation

- [228-DR-SPEC-feature-flags.md](./228-DR-SPEC-feature-flags.md)
