# Compliance Checklist Template

> **Document**: 235-DR-TMPL-compliance-checklist
> **Epic**: EPIC 021 - Compliance Tracking (SOC2/SOX)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this checklist template to track compliance readiness for audits. Customize per framework and audit cycle.

---

## SOC2 Type II Audit Checklist

### Pre-Audit Preparation (T-60 days)

```yaml
# soc2-checklist.yaml
# SOC2 Type II Audit Preparation Checklist

audit_info:
  framework: SOC2
  type: Type II
  period_start: "2025-01-01"
  period_end: "2025-12-31"
  audit_firm: "[Auditor Name]"
  audit_start: "2026-02-01"

# ═══════════════════════════════════════════════════════════════════════════════
# PRE-AUDIT PREPARATION (T-60 days)
# ═══════════════════════════════════════════════════════════════════════════════
preparation:
  documentation:
    - id: PREP-001
      task: "Update system description document"
      owner: engineering
      due: T-45
      status: pending
      evidence: system-description-v2.pdf
      notes: ""

    - id: PREP-002
      task: "Review and update security policies"
      owner: security
      due: T-45
      status: pending
      evidence: policy-directory/
      notes: ""

    - id: PREP-003
      task: "Verify control documentation accuracy"
      owner: compliance
      due: T-40
      status: pending
      evidence: control-matrix.xlsx
      notes: ""

    - id: PREP-004
      task: "Collect management attestations"
      owner: compliance
      due: T-30
      status: pending
      evidence: attestations/
      notes: "CEO, CTO, CISO signatures required"

  access_preparation:
    - id: PREP-010
      task: "Set up auditor portal access"
      owner: it
      due: T-14
      status: pending
      evidence: portal-access-log.csv
      notes: ""

    - id: PREP-011
      task: "Prepare evidence repository"
      owner: compliance
      due: T-14
      status: pending
      evidence: evidence-index.xlsx
      notes: "Organize by control ID"

    - id: PREP-012
      task: "Schedule key personnel interviews"
      owner: compliance
      due: T-14
      status: pending
      evidence: interview-schedule.pdf
      notes: ""

# ═══════════════════════════════════════════════════════════════════════════════
# CONTROL TESTING - SECURITY (CC6)
# ═══════════════════════════════════════════════════════════════════════════════
security_controls:
  logical_access:
    - id: CC6.1-001
      control: "Role-based access control implemented"
      test: "Review RBAC configuration and assignments"
      evidence_required:
        - iam_policy_export.json
        - role_assignments.csv
        - access_matrix.xlsx
      population: all_users
      sample_size: 25
      status: pending
      test_result: null
      findings: []

    - id: CC6.1-002
      control: "Access reviews performed quarterly"
      test: "Verify quarterly access review completion"
      evidence_required:
        - q1_access_review.pdf
        - q2_access_review.pdf
        - q3_access_review.pdf
        - q4_access_review.pdf
      population: 4_quarters
      sample_size: 4
      status: pending
      test_result: null
      findings: []

    - id: CC6.2-001
      control: "User provisioning follows approval workflow"
      test: "Sample new user requests for approval evidence"
      evidence_required:
        - new_user_tickets.csv
        - approval_screenshots/
      population: new_users_in_period
      sample_size: 25
      status: pending
      test_result: null
      findings: []

    - id: CC6.3-001
      control: "Terminated users removed within 24 hours"
      test: "Verify termination timing for departed users"
      evidence_required:
        - termination_log.csv
        - access_removal_tickets.csv
      population: terminated_users
      sample_size: all
      status: pending
      test_result: null
      findings: []

  threat_protection:
    - id: CC6.6-001
      control: "Security scanning in CI/CD pipeline"
      test: "Verify SAST/DAST scans run on all deployments"
      evidence_required:
        - cicd_config.yaml
        - scan_results_sample/
      population: deployments_in_period
      sample_size: 25
      status: pending
      test_result: null
      findings: []

    - id: CC6.6-002
      control: "Vulnerability remediation SLAs met"
      test: "Sample critical/high vulnerabilities for SLA compliance"
      evidence_required:
        - vulnerability_report.csv
        - remediation_tickets.csv
      population: critical_high_vulns
      sample_size: 25
      status: pending
      test_result: null
      findings: []

  data_security:
    - id: CC6.7-001
      control: "Data encrypted in transit (TLS 1.2+)"
      test: "Verify TLS configuration on all endpoints"
      evidence_required:
        - ssl_scan_results.json
        - load_balancer_config.yaml
      population: all_endpoints
      sample_size: all
      status: pending
      test_result: null
      findings: []

    - id: CC6.7-002
      control: "Data encrypted at rest"
      test: "Verify encryption on databases and storage"
      evidence_required:
        - database_encryption_config.json
        - storage_encryption_status.json
      population: all_data_stores
      sample_size: all
      status: pending
      test_result: null
      findings: []

# ═══════════════════════════════════════════════════════════════════════════════
# CONTROL TESTING - MONITORING (CC7)
# ═══════════════════════════════════════════════════════════════════════════════
monitoring_controls:
  logging:
    - id: CC7.1-001
      control: "Comprehensive audit logging enabled"
      test: "Verify audit log coverage for security events"
      evidence_required:
        - logging_config.yaml
        - sample_audit_logs.json
      population: all_services
      sample_size: all
      status: pending
      test_result: null
      findings: []

    - id: CC7.1-002
      control: "Logs retained for 1 year minimum"
      test: "Verify log retention configuration"
      evidence_required:
        - retention_policy.yaml
        - oldest_log_screenshot.png
      population: log_storage
      sample_size: all
      status: pending
      test_result: null
      findings: []

  alerting:
    - id: CC7.2-001
      control: "Security alerts configured and monitored"
      test: "Review alert configuration and response times"
      evidence_required:
        - alert_rules.yaml
        - alert_history.csv
        - incident_response_times.csv
      population: security_alerts
      sample_size: 25
      status: pending
      test_result: null
      findings: []

# ═══════════════════════════════════════════════════════════════════════════════
# CONTROL TESTING - CHANGE MANAGEMENT (CC8)
# ═══════════════════════════════════════════════════════════════════════════════
change_management:
  approvals:
    - id: CC8.1-001
      control: "All production changes require approval"
      test: "Sample deployments for approval evidence"
      evidence_required:
        - deployment_log.csv
        - pr_approval_screenshots/
      population: production_deployments
      sample_size: 25
      status: pending
      test_result: null
      findings: []

    - id: CC8.1-002
      control: "Changes tested before production deployment"
      test: "Verify testing evidence for sampled changes"
      evidence_required:
        - test_results_sample/
        - staging_deployment_logs.csv
      population: production_deployments
      sample_size: 25
      status: pending
      test_result: null
      findings: []

    - id: CC8.1-003
      control: "Emergency changes documented retroactively"
      test: "Review emergency change procedures"
      evidence_required:
        - emergency_change_policy.pdf
        - emergency_change_log.csv
      population: emergency_changes
      sample_size: all
      status: pending
      test_result: null
      findings: []

# ═══════════════════════════════════════════════════════════════════════════════
# CONTROL TESTING - AVAILABILITY (A1)
# ═══════════════════════════════════════════════════════════════════════════════
availability_controls:
  uptime:
    - id: A1.1-001
      control: "System availability meets SLA (99.9%)"
      test: "Review uptime metrics for audit period"
      evidence_required:
        - uptime_report.pdf
        - incident_log.csv
      population: audit_period
      sample_size: all
      status: pending
      test_result: null
      findings: []

  capacity:
    - id: A1.2-001
      control: "Capacity monitoring and alerting configured"
      test: "Verify capacity monitoring setup"
      evidence_required:
        - capacity_dashboard_screenshot.png
        - capacity_alerts.yaml
      population: infrastructure
      sample_size: all
      status: pending
      test_result: null
      findings: []

  recovery:
    - id: A1.3-001
      control: "Backup and recovery procedures tested"
      test: "Review backup test results"
      evidence_required:
        - backup_test_results.pdf
        - recovery_test_results.pdf
      population: backup_tests
      sample_size: all
      status: pending
      test_result: null
      findings: []

    - id: A1.3-002
      control: "Business continuity plan documented and tested"
      test: "Review BCP documentation and test results"
      evidence_required:
        - bcp_document.pdf
        - bcp_test_results.pdf
      population: bcp_tests
      sample_size: all
      status: pending
      test_result: null
      findings: []
```

---

## SOX Control Checklist

### IT General Controls

```yaml
# sox-itgc-checklist.yaml
# SOX IT General Controls Checklist

audit_info:
  framework: SOX
  section: 404
  fiscal_year: 2025
  material_systems:
    - billing_system
    - revenue_recognition
    - financial_reporting

# ═══════════════════════════════════════════════════════════════════════════════
# ACCESS CONTROLS
# ═══════════════════════════════════════════════════════════════════════════════
access_controls:
  privileged_access:
    - id: SOX-AC-001
      control: "Privileged access limited to authorized personnel"
      risk: "Unauthorized access to financial data"
      test: "Review privileged user list and justifications"
      evidence_required:
        - privileged_users.csv
        - access_justifications/
      frequency: quarterly
      status: pending

    - id: SOX-AC-002
      control: "Segregation of duties enforced"
      risk: "Fraudulent transactions"
      test: "Review SoD matrix and violations"
      evidence_required:
        - sod_matrix.xlsx
        - sod_violations.csv
      frequency: quarterly
      status: pending

  user_access:
    - id: SOX-AC-003
      control: "Access requests require manager approval"
      risk: "Inappropriate access granted"
      test: "Sample access requests for approval"
      evidence_required:
        - access_request_tickets.csv
        - approval_screenshots/
      sample_size: 25
      status: pending

    - id: SOX-AC-004
      control: "Terminated user access removed promptly"
      risk: "Former employees retain access"
      test: "Compare HR terminations to access removals"
      evidence_required:
        - hr_terminations.csv
        - access_removals.csv
      sample_size: all
      status: pending

# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════
change_management:
  development:
    - id: SOX-CM-001
      control: "Code changes require peer review"
      risk: "Unauthorized code changes"
      test: "Sample code changes for review evidence"
      evidence_required:
        - pr_list.csv
        - review_screenshots/
      sample_size: 25
      status: pending

    - id: SOX-CM-002
      control: "Developers cannot deploy to production"
      risk: "Segregation of duties violation"
      test: "Verify deployment permissions"
      evidence_required:
        - deployment_permissions.csv
        - cicd_config.yaml
      status: pending

  deployment:
    - id: SOX-CM-003
      control: "Production deployments require approval"
      risk: "Unauthorized production changes"
      test: "Sample deployments for approval"
      evidence_required:
        - deployment_log.csv
        - approval_evidence/
      sample_size: 25
      status: pending

    - id: SOX-CM-004
      control: "Emergency changes documented"
      risk: "Uncontrolled emergency changes"
      test: "Review emergency change log"
      evidence_required:
        - emergency_changes.csv
        - post_implementation_reviews/
      sample_size: all
      status: pending

# ═══════════════════════════════════════════════════════════════════════════════
# OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════
operations:
  backups:
    - id: SOX-OP-001
      control: "Financial data backed up daily"
      risk: "Data loss"
      test: "Verify backup completion logs"
      evidence_required:
        - backup_logs.csv
        - backup_success_rate.pdf
      status: pending

    - id: SOX-OP-002
      control: "Backups tested quarterly"
      risk: "Backup restoration failure"
      test: "Review backup test results"
      evidence_required:
        - backup_test_results/
      status: pending

  monitoring:
    - id: SOX-OP-003
      control: "Batch job failures investigated"
      risk: "Incomplete financial processing"
      test: "Review batch job monitoring"
      evidence_required:
        - batch_job_failures.csv
        - investigation_tickets.csv
      status: pending
```

---

## ISO 27001 Checklist

### ISMS Documentation

```yaml
# iso27001-checklist.yaml
# ISO 27001 Certification Checklist

audit_info:
  framework: ISO27001
  certification_body: "[Certification Body]"
  audit_type: certification  # or surveillance
  audit_date: "2026-03-15"

# ═══════════════════════════════════════════════════════════════════════════════
# ISMS DOCUMENTATION
# ═══════════════════════════════════════════════════════════════════════════════
documentation:
  mandatory:
    - id: DOC-001
      document: "Information Security Policy"
      clause: "5.2"
      status: pending
      location: policies/information-security-policy.pdf
      last_reviewed: null

    - id: DOC-002
      document: "Risk Assessment Methodology"
      clause: "6.1.2"
      status: pending
      location: policies/risk-assessment-methodology.pdf
      last_reviewed: null

    - id: DOC-003
      document: "Statement of Applicability"
      clause: "6.1.3d"
      status: pending
      location: compliance/soa.xlsx
      last_reviewed: null

    - id: DOC-004
      document: "Risk Treatment Plan"
      clause: "6.1.3e"
      status: pending
      location: compliance/risk-treatment-plan.pdf
      last_reviewed: null

    - id: DOC-005
      document: "Information Security Objectives"
      clause: "6.2"
      status: pending
      location: policies/security-objectives.pdf
      last_reviewed: null

  records:
    - id: REC-001
      record: "Training Records"
      clause: "7.2"
      status: pending
      location: hr/training-records/

    - id: REC-002
      record: "Internal Audit Results"
      clause: "9.2"
      status: pending
      location: compliance/internal-audits/

    - id: REC-003
      record: "Management Review Minutes"
      clause: "9.3"
      status: pending
      location: compliance/management-reviews/

    - id: REC-004
      record: "Corrective Action Records"
      clause: "10.1"
      status: pending
      location: compliance/corrective-actions/

# ═══════════════════════════════════════════════════════════════════════════════
# ANNEX A CONTROLS
# ═══════════════════════════════════════════════════════════════════════════════
annex_a:
  A5_policies:
    - id: A.5.1.1
      control: "Policies for information security"
      status: pending
      evidence: policies/index.md

  A6_organization:
    - id: A.6.1.1
      control: "Information security roles and responsibilities"
      status: pending
      evidence: policies/roles-responsibilities.pdf

  A8_asset_management:
    - id: A.8.1.1
      control: "Inventory of assets"
      status: pending
      evidence: assets/inventory.xlsx

    - id: A.8.2.1
      control: "Classification of information"
      status: pending
      evidence: policies/data-classification.pdf

  A9_access_control:
    - id: A.9.2.1
      control: "User registration and de-registration"
      status: pending
      evidence: iam/user-management-procedure.pdf

    - id: A.9.2.3
      control: "Management of privileged access rights"
      status: pending
      evidence: iam/privileged-access-policy.pdf

    - id: A.9.4.1
      control: "Information access restriction"
      status: pending
      evidence: iam/access-control-matrix.xlsx

  A12_operations:
    - id: A.12.1.1
      control: "Documented operating procedures"
      status: pending
      evidence: operations/runbooks/

    - id: A.12.4.1
      control: "Event logging"
      status: pending
      evidence: monitoring/logging-policy.pdf

    - id: A.12.6.1
      control: "Management of technical vulnerabilities"
      status: pending
      evidence: security/vulnerability-management.pdf

  A14_development:
    - id: A.14.2.1
      control: "Secure development policy"
      status: pending
      evidence: engineering/secure-sdlc.pdf

    - id: A.14.2.2
      control: "System change control procedures"
      status: pending
      evidence: engineering/change-management.pdf

  A16_incident:
    - id: A.16.1.1
      control: "Responsibilities and procedures"
      status: pending
      evidence: security/incident-response-plan.pdf

    - id: A.16.1.2
      control: "Reporting information security events"
      status: pending
      evidence: security/incident-reporting.pdf

  A17_continuity:
    - id: A.17.1.1
      control: "Planning information security continuity"
      status: pending
      evidence: bcp/business-continuity-plan.pdf

    - id: A.17.1.2
      control: "Implementing information security continuity"
      status: pending
      evidence: bcp/dr-procedures.pdf
```

---

## Quick Reference Tables

### Evidence Collection Schedule

| Control Area | Evidence Type | Collection Frequency | Responsible |
|--------------|---------------|---------------------|-------------|
| Access Control | User list, roles | Monthly | IT |
| Access Reviews | Review reports | Quarterly | Security |
| Vulnerability Mgmt | Scan results | Weekly | Security |
| Change Management | Deployment logs | Continuous | Engineering |
| Logging | Log samples | Monthly | Operations |
| Backups | Backup logs | Daily | Operations |
| Incidents | Incident reports | Per event | Security |
| Training | Completion records | Per training | HR |

### Audit Timeline

| Milestone | Timeline | Owner |
|-----------|----------|-------|
| Documentation review | T-60 days | Compliance |
| Evidence preparation | T-45 days | All |
| Internal testing | T-30 days | Internal Audit |
| Auditor kickoff | T-14 days | Compliance |
| Fieldwork begins | T-0 | Auditor |
| Management response | T+14 days | Management |
| Final report | T+30 days | Auditor |

### Finding Severity Matrix

| Severity | Definition | Response Time |
|----------|------------|---------------|
| Critical | Pervasive control failure | 24 hours |
| High | Significant control gap | 7 days |
| Medium | Moderate weakness | 30 days |
| Low | Minor improvement | 90 days |

---

## CLI Commands

```bash
# Generate checklist from template
gwi compliance checklist generate --framework soc2 --period 2025

# Update checklist status
gwi compliance checklist update CC6.1-001 --status complete --evidence ./evidence/

# View checklist progress
gwi compliance checklist status --framework soc2

# Export for auditor
gwi compliance checklist export --format xlsx --output audit-package.xlsx

# Track evidence
gwi compliance evidence track --control CC6.1-001
gwi compliance evidence upload --control CC6.1-001 --file ./evidence.pdf
```

---

## Related Documentation

- [234-DR-SPEC-compliance-tracking.md](./234-DR-SPEC-compliance-tracking.md) - Compliance tracking specification
- [232-DR-SPEC-ai-governance.md](./232-DR-SPEC-ai-governance.md) - AI governance framework
