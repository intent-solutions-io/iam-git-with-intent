# Security Scanning Policy Template

> **Document**: 231-DR-TMPL-security-policy
> **Epic**: EPIC 016 - Security Scanning (SAST/DAST Integration)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template to define security scanning policies for your organization. Policies control scan frequency, severity thresholds, and remediation requirements.

---

## Security Policy Template

```yaml
# security-policy.yaml
# Organization security scanning policy

# ═══════════════════════════════════════════════════════════════════════════════
# POLICY IDENTITY
# ═══════════════════════════════════════════════════════════════════════════════
policy:
  name: "GWI Security Policy"
  version: "1.0.0"
  effective_date: "2026-02-01"
  owner: "security-team"
  approvers:
    - "cto@company.com"
    - "ciso@company.com"

# ═══════════════════════════════════════════════════════════════════════════════
# SCAN REQUIREMENTS
# ═══════════════════════════════════════════════════════════════════════════════
scanning:
  # SAST (Static Analysis)
  sast:
    enabled: true
    frequency:
      - trigger: push
        branches: [main, develop, "release/*"]
      - trigger: pull_request
        branches: [main]
      - trigger: schedule
        cron: "0 0 * * *"  # Daily

    scanners:
      - name: semgrep
        required: true
        config: p/security-audit
      - name: codeql
        required: true
        languages: [javascript-typescript]
      - name: snyk
        required: false

    # Block deployment if these fail
    blocking_rules:
      - severity: critical
        action: block
      - severity: high
        action: block
        max_age_days: 7  # Block if high severity > 7 days old

  # DAST (Dynamic Analysis)
  dast:
    enabled: true
    frequency:
      - trigger: deployment
        environments: [staging]
      - trigger: schedule
        cron: "0 2 * * *"  # Daily at 2 AM

    scanners:
      - name: zap
        required: true
        scan_type: baseline
      - name: nuclei
        required: true
        templates: [cves, vulnerabilities]

    # Target environments
    targets:
      staging:
        url: "https://staging.gwi.dev"
        auth: oauth2
      production:
        url: "https://api.gwi.dev"
        auth: oauth2
        frequency: weekly  # Less frequent for prod

  # Container Scanning
  container:
    enabled: true
    frequency:
      - trigger: push
        paths: ["**/Dockerfile", "docker-compose*.yml"]
      - trigger: schedule
        cron: "0 4 * * *"  # Daily at 4 AM

    scanners:
      - name: trivy
        required: true
        severity: [CRITICAL, HIGH]

    # Block if base image has critical CVEs
    blocking_rules:
      - type: os_vulnerability
        severity: critical
        action: block
      - type: library_vulnerability
        severity: critical
        action: block

  # Dependency Scanning
  dependencies:
    enabled: true
    frequency:
      - trigger: push
        paths: ["package*.json", "requirements*.txt", "go.mod"]
      - trigger: schedule
        cron: "0 6 * * *"  # Daily at 6 AM

    scanners:
      - name: npm_audit
        required: true
      - name: snyk
        required: false

    # Auto-create PRs for security updates
    auto_remediation:
      enabled: true
      severity: [critical, high]
      max_prs_per_day: 5

# ═══════════════════════════════════════════════════════════════════════════════
# SEVERITY DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════
severity:
  critical:
    description: "Actively exploitable, immediate risk to data/systems"
    examples:
      - "Remote code execution"
      - "SQL injection with data access"
      - "Authentication bypass"
      - "Hardcoded production secrets"
    response_time: 4h
    remediation_time: 24h
    escalation: immediate

  high:
    description: "Significant risk, exploitable with some effort"
    examples:
      - "Cross-site scripting (stored)"
      - "Privilege escalation"
      - "Sensitive data exposure"
      - "Insecure deserialization"
    response_time: 24h
    remediation_time: 7d
    escalation: team_lead

  medium:
    description: "Moderate risk, limited exploitability"
    examples:
      - "Cross-site scripting (reflected)"
      - "Information disclosure"
      - "Missing security headers"
      - "Weak cryptography"
    response_time: 72h
    remediation_time: 30d
    escalation: sprint_planning

  low:
    description: "Minor risk, defense-in-depth improvement"
    examples:
      - "Verbose error messages"
      - "Missing best practices"
      - "Outdated but unexploitable dependencies"
    response_time: 1w
    remediation_time: 90d
    escalation: backlog

# ═══════════════════════════════════════════════════════════════════════════════
# REMEDIATION REQUIREMENTS
# ═══════════════════════════════════════════════════════════════════════════════
remediation:
  # SLA definitions
  sla:
    critical:
      acknowledge: 4h
      plan: 8h
      fix: 24h
      verify: 48h
    high:
      acknowledge: 24h
      plan: 48h
      fix: 7d
      verify: 10d
    medium:
      acknowledge: 72h
      plan: 1w
      fix: 30d
      verify: 35d
    low:
      acknowledge: 1w
      plan: 2w
      fix: 90d
      verify: 95d

  # Escalation matrix
  escalation:
    sla_breach:
      - at: 80%  # 80% of SLA elapsed
        notify: [assignee, team_lead]
      - at: 100%  # SLA breached
        notify: [assignee, team_lead, security_team]
      - at: 150%  # 50% over SLA
        notify: [assignee, team_lead, security_team, cto]

  # Accepted risk process
  accepted_risk:
    requires_approval: true
    approvers:
      critical: [ciso, cto]
      high: [security_team, team_lead]
      medium: [security_team]
      low: [team_lead]
    max_duration: 90d
    review_frequency: 30d

  # False positive process
  false_positive:
    requires_justification: true
    requires_approval: true
    approvers: [security_team]

# ═══════════════════════════════════════════════════════════════════════════════
# BLOCKING RULES
# ═══════════════════════════════════════════════════════════════════════════════
blocking:
  # CI/CD gates
  ci_gates:
    - stage: pr_merge
      rules:
        - no_critical_findings: true
        - no_high_findings_over_sla: true
        - sast_scan_completed: true

    - stage: staging_deploy
      rules:
        - no_critical_findings: true
        - no_high_findings_over_sla: true
        - dast_scan_completed: true
        - container_scan_passed: true

    - stage: production_deploy
      rules:
        - no_critical_findings: true
        - no_high_findings: true
        - all_scans_completed: true
        - security_review_approved: true

  # Exceptions
  exceptions:
    - name: "Emergency hotfix"
      requires: [cto_approval, post_deploy_scan]
      max_duration: 24h

# ═══════════════════════════════════════════════════════════════════════════════
# REPORTING
# ═══════════════════════════════════════════════════════════════════════════════
reporting:
  # Dashboards
  dashboards:
    - name: "Security Overview"
      refresh: 1h
      audience: [engineering, security]
    - name: "Executive Summary"
      refresh: 24h
      audience: [leadership]

  # Scheduled reports
  reports:
    - name: "Weekly Security Summary"
      frequency: weekly
      day: monday
      recipients: [security_team, engineering_leads]
      format: pdf

    - name: "Monthly Security Report"
      frequency: monthly
      day: 1
      recipients: [security_team, cto, ciso]
      format: pdf

    - name: "Quarterly Compliance Report"
      frequency: quarterly
      recipients: [security_team, compliance, leadership]
      format: pdf

  # Real-time alerts
  alerts:
    - condition: critical_finding
      channels: [slack, pagerduty]
      target: ["#security-alerts", "security-oncall"]

    - condition: sla_breach
      channels: [slack, email]
      target: ["#security-alerts"]

# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE MAPPING
# ═══════════════════════════════════════════════════════════════════════════════
compliance:
  frameworks:
    - name: SOC2
      controls:
        - CC6.1  # Logical access security
        - CC6.6  # External threats
        - CC7.1  # System monitoring
    - name: ISO27001
      controls:
        - A.12.6.1  # Technical vulnerability management
        - A.14.2.1  # Secure development policy
    - name: OWASP
      categories:
        - A01:2021-Broken_Access_Control
        - A02:2021-Cryptographic_Failures
        - A03:2021-Injection
```

---

## Quick Reference

### Severity Response Times

| Severity | Acknowledge | Plan | Fix | Verify |
|----------|-------------|------|-----|--------|
| Critical | 4 hours | 8 hours | 24 hours | 48 hours |
| High | 24 hours | 48 hours | 7 days | 10 days |
| Medium | 72 hours | 1 week | 30 days | 35 days |
| Low | 1 week | 2 weeks | 90 days | 95 days |

### Scanner Requirements

| Stage | SAST | DAST | Container | Dependency |
|-------|------|------|-----------|------------|
| PR | ✓ | - | - | ✓ |
| Merge | ✓ | - | ✓ | ✓ |
| Staging Deploy | ✓ | ✓ | ✓ | ✓ |
| Production Deploy | ✓ | ✓ | ✓ | ✓ |

### Blocking Rules Summary

| Finding Type | PR Merge | Staging | Production |
|--------------|----------|---------|------------|
| Critical | Block | Block | Block |
| High | Block if >7d | Block | Block |
| Medium | Allow | Allow | Block if >30d |
| Low | Allow | Allow | Allow |

---

## Related Documentation

- [230-DR-SPEC-security-scanning.md](./230-DR-SPEC-security-scanning.md)
- [110-DR-TMOD-security-threat-model.md](./110-DR-TMOD-security-threat-model.md)
