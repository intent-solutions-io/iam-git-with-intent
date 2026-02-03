# AI Governance Policy Template

> **Document**: 233-DR-TMPL-governance-policy
> **Epic**: EPIC 020 - AI Governance Policies
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template to define organization-specific AI governance policies. Policies control model usage, data handling, and compliance requirements.

---

## Governance Policy Template

```yaml
# governance-policy.yaml
# Organization AI governance policy

# ═══════════════════════════════════════════════════════════════════════════════
# POLICY IDENTITY
# ═══════════════════════════════════════════════════════════════════════════════
policy:
  name: "GWI AI Governance Policy"
  version: "1.0.0"
  effective_date: "2026-02-01"
  review_date: "2026-08-01"
  owner: "ai-governance-team"
  approvers:
    - "cto@company.com"
    - "ciso@company.com"
    - "legal@company.com"

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL USAGE POLICY
# ═══════════════════════════════════════════════════════════════════════════════
model_usage:
  # Approved models by tier
  approved_models:
    tier_1:  # Fast, low cost
      - provider: anthropic
        model: claude-3-5-haiku
        max_tokens: 4096
      - provider: google
        model: gemini-2.0-flash
        max_tokens: 8192
      - provider: openai
        model: gpt-4o-mini
        max_tokens: 4096

    tier_3:  # Balanced
      - provider: anthropic
        model: claude-sonnet-4
        max_tokens: 8192
      - provider: google
        model: gemini-1.5-pro
        max_tokens: 32768
      - provider: openai
        model: gpt-4o
        max_tokens: 16384

    tier_5:  # High capability
      - provider: anthropic
        model: claude-opus-4
        max_tokens: 32768
        requires_approval: true
      - provider: openai
        model: o1
        max_tokens: 100000
        requires_approval: true

  # Model selection rules
  selection_rules:
    # Complexity-based routing
    complexity_routing:
      low:      # 1-3
        preferred_tier: 1
        fallback_tier: 3
      medium:   # 4-6
        preferred_tier: 3
        fallback_tier: 5
      high:     # 7-10
        preferred_tier: 5
        fallback_tier: 3

    # Task-specific requirements
    task_requirements:
      code_generation:
        min_tier: 3
        preferred_providers: [anthropic, openai]
      security_analysis:
        min_tier: 5
        preferred_providers: [anthropic]
      triage:
        max_tier: 1
        preferred_providers: [google]

  # Usage limits
  limits:
    per_tenant_daily:
      tier_1: 10000
      tier_3: 1000
      tier_5: 100
    per_run:
      max_tokens: 100000
      max_cost_usd: 10.00
      max_duration_minutes: 30

# ═══════════════════════════════════════════════════════════════════════════════
# DATA HANDLING POLICY
# ═══════════════════════════════════════════════════════════════════════════════
data_handling:
  # Classification requirements
  classification:
    required: true
    default_level: internal
    levels:
      - public
      - internal
      - confidential
      - restricted

  # Input sanitization
  input_sanitization:
    enabled: true
    rules:
      - type: secrets
        action: mask
        patterns:
          - "AKIA[0-9A-Z]{16}"           # AWS keys
          - "ghp_[a-zA-Z0-9]{36}"        # GitHub tokens
          - "sk-[a-zA-Z0-9]{48}"         # OpenAI keys
          - "AIza[0-9A-Za-z_-]{35}"      # Google API keys

      - type: pii
        action: mask
        patterns:
          - email: '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
          - phone: '\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'
          - ssn: '\b\d{3}-\d{2}-\d{4}\b'

      - type: credentials
        action: redact
        patterns:
          - password: '(?i)(password|passwd|pwd)\s*[=:]\s*\S+'
          - token: '(?i)(token|secret|key)\s*[=:]\s*\S+'

  # Output scanning
  output_scanning:
    enabled: true
    scan_for:
      - secrets
      - pii
      - malicious_code
      - prohibited_content
    on_detection:
      secrets: redact_and_alert
      pii: redact
      malicious_code: block_and_alert
      prohibited_content: block

  # Retention policy
  retention:
    prompts:
      duration: 30_days
      exceptions:
        - compliance_investigation: 7_years
    responses:
      duration: 30_days
      exceptions:
        - compliance_investigation: 7_years
    audit_logs:
      duration: 7_years
      immutable: true

# ═══════════════════════════════════════════════════════════════════════════════
# ACCESS CONTROL POLICY
# ═══════════════════════════════════════════════════════════════════════════════
access_control:
  # Role definitions
  roles:
    viewer:
      permissions:
        - audit.read
        - costs.read
        - policies.read
      ai_access: none

    user:
      permissions:
        - audit.read.own
        - costs.read.own
        - ai.invoke.tier1
        - ai.invoke.tier3
      ai_access: tier_3

    power_user:
      permissions:
        - audit.read.all
        - costs.read.all
        - ai.invoke.all
        - ai.approve.tier5
      ai_access: tier_5

    admin:
      permissions:
        - "*"
      ai_access: tier_5
      restrictions:
        - mfa_required
        - actions_audited

  # Approval workflows
  approvals:
    tier5_usage:
      required_approvers:
        - power_user
        - admin
      min_approvals: 1
      expires_after: 24h
      auto_approve:
        - enterprise_tenants

    restricted_data:
      required_approvers:
        - admin
        - governance_officer
      min_approvals: 2
      expires_after: 4h
      justification_required: true

    production_changes:
      required_approvers:
        - self
      min_approvals: 1
      expires_after: 1h
      sha_binding_required: true

# ═══════════════════════════════════════════════════════════════════════════════
# ETHICAL GUIDELINES
# ═══════════════════════════════════════════════════════════════════════════════
ethics:
  # Principles
  principles:
    transparency:
      - ai_involvement_disclosed
      - decision_rationale_available
      - model_information_accessible

    fairness:
      - no_discriminatory_outputs
      - consistent_treatment
      - bias_monitoring_enabled

    accountability:
      - human_approval_for_production
      - full_audit_trail
      - clear_escalation_paths

    privacy:
      - minimal_data_collection
      - purpose_limitation
      - data_subject_rights

    safety:
      - content_filtering_enabled
      - output_security_scanning
      - kill_switches_available

  # Prohibited uses
  prohibited:
    content:
      - malicious_code_generation
      - vulnerability_exploits
      - credential_harvesting
      - backdoors
      - data_exfiltration

    actions:
      - auto_commit_to_production
      - bypass_approval_gates
      - disable_audit_logging
      - share_api_credentials

  # Bias mitigation
  bias_mitigation:
    code_review:
      anonymize_author: true
      consistent_criteria: true
    triage:
      calibrated_scoring: true
      documented_rationale: true
    model_selection:
      tenant_agnostic: true
      capability_based: true

# ═══════════════════════════════════════════════════════════════════════════════
# AUDIT REQUIREMENTS
# ═══════════════════════════════════════════════════════════════════════════════
audit:
  # What to audit
  events:
    - ai_invocation
    - model_selection
    - policy_evaluation
    - approval_request
    - approval_decision
    - kill_switch_activation
    - data_classification
    - output_scan_result

  # Required fields
  required_fields:
    - timestamp
    - correlation_id
    - tenant_id
    - agent_id
    - operation
    - model
    - input_hash
    - output_hash
    - tokens_used
    - cost_usd
    - success
    - policy_violations

  # Storage
  storage:
    primary: bigquery
    backup: gcs
    retention: 7_years
    encryption: aes_256

  # Real-time streaming
  streaming:
    enabled: true
    destination: pubsub
    topics:
      - compliance-monitoring
      - cost-tracking
      - security-analytics

# ═══════════════════════════════════════════════════════════════════════════════
# KILL SWITCHES
# ═══════════════════════════════════════════════════════════════════════════════
kill_switches:
  global:
    name: "Global AI Kill Switch"
    activation:
      manual:
        authorized: [admin]
      automatic:
        - condition: cost_threshold_exceeded
          threshold: $10000/day
        - condition: security_incident
          severity: critical
        - condition: provider_outage
          duration: 5m

  provider:
    name: "Provider Kill Switch"
    scope: per_provider
    activation:
      manual:
        authorized: [power_user, admin]
      automatic:
        - condition: error_rate
          threshold: 50%
          window: 5m
        - condition: latency_p99
          threshold: 30s
          window: 5m

  tenant:
    name: "Tenant Kill Switch"
    scope: per_tenant
    activation:
      manual:
        authorized: [admin]
      automatic:
        - condition: abuse_detected
        - condition: billing_issue
        - condition: security_concern

  operation:
    name: "Operation Kill Switch"
    scope: per_operation_type
    activation:
      manual:
        authorized: [admin]
      automatic:
        - condition: quality_degradation
          threshold: quality_score < 3.0
        - condition: compliance_issue

# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE MAPPING
# ═══════════════════════════════════════════════════════════════════════════════
compliance:
  frameworks:
    - name: SOC2
      controls:
        - id: CC6.1
          requirement: "Logical access security"
          evidence:
            - role_based_access_implemented
            - approval_workflows_active
            - audit_logging_enabled

        - id: CC6.7
          requirement: "Data transmission protection"
          evidence:
            - tls_1_3_enforced
            - api_encryption_verified

        - id: CC7.2
          requirement: "Security monitoring"
          evidence:
            - audit_trail_complete
            - anomaly_detection_active
            - incident_alerting_configured

    - name: GDPR
      articles:
        - id: Article22
          requirement: "Automated decision-making"
          evidence:
            - human_in_the_loop_enabled
            - explanation_capability_available
            - opt_out_mechanism_implemented

        - id: Article35
          requirement: "Data protection impact assessment"
          evidence:
            - dpia_completed
            - risk_mitigation_documented

    - name: ISO27001
      controls:
        - id: A.9.4.1
          requirement: "Information access restriction"
          evidence:
            - data_classification_implemented
            - access_controls_enforced

        - id: A.12.4.1
          requirement: "Event logging"
          evidence:
            - comprehensive_audit_trail
            - log_retention_7_years

# ═══════════════════════════════════════════════════════════════════════════════
# INCIDENT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════
incidents:
  # Incident types
  types:
    data_leak:
      severity: critical
      response_time: 15m
      notification:
        - security_team
        - legal
        - affected_parties

    model_misuse:
      severity: high
      response_time: 1h
      notification:
        - security_team
        - governance_team

    quality_degradation:
      severity: medium
      response_time: 4h
      notification:
        - engineering_team

    cost_anomaly:
      severity: medium
      response_time: 4h
      notification:
        - finance_team
        - tenant

  # Response procedures
  response:
    immediate:
      - isolate_affected_systems
      - preserve_evidence
      - notify_stakeholders

    investigation:
      - gather_audit_logs
      - identify_scope
      - determine_root_cause

    remediation:
      - implement_fixes
      - verify_resolution
      - update_policies

    post_incident:
      - document_findings
      - conduct_review
      - implement_preventive_measures
```

---

## Quick Reference

### Model Tiers

| Tier | Cost | Capabilities | Approval |
|------|------|--------------|----------|
| 1 | Low | Fast, simple tasks | None |
| 3 | Medium | General code, analysis | None |
| 5 | High | Complex reasoning | Required |

### Data Classification

| Level | AI Models Allowed | Encryption | Audit |
|-------|-------------------|------------|-------|
| Public | All | None | Basic |
| Internal | All approved | At rest | Standard |
| Confidential | Tier 3+ | Full | Full |
| Restricted | Tier 5 with approval | Full | Full + approval |

### Access Roles

| Role | AI Access | Approvals | Admin Actions |
|------|-----------|-----------|---------------|
| Viewer | None | Cannot | Cannot |
| User | Tier 1-3 | Cannot | Cannot |
| Power User | All tiers | Can approve Tier 5 | Cannot |
| Admin | All tiers | All | All (audited) |

### Kill Switch Activation

| Scope | Auto Triggers | Manual Auth |
|-------|---------------|-------------|
| Global | Cost >$10k/day, Security incident | Admin |
| Provider | Error rate >50%, Latency >30s | Power User |
| Tenant | Abuse, Billing, Security | Admin |
| Operation | Quality <3.0, Compliance issue | Admin |

---

## Policy Validation

```bash
# Validate governance policy
gwi governance validate ./governance-policy.yaml

# Test policy against sample requests
gwi governance test-policy ./governance-policy.yaml --scenarios ./test-scenarios.yaml

# Generate compliance report from policy
gwi governance report --policy ./governance-policy.yaml --framework soc2

# Diff two policy versions
gwi governance diff ./policy-v1.yaml ./policy-v2.yaml
```

---

## Related Documentation

- [232-DR-SPEC-ai-governance.md](./232-DR-SPEC-ai-governance.md) - Governance specification
- [224-DR-SPEC-cost-optimization.md](./224-DR-SPEC-cost-optimization.md) - Cost controls
- [225-DR-TMPL-budget-policy.md](./225-DR-TMPL-budget-policy.md) - Budget policies
