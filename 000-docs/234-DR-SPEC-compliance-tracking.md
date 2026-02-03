# Compliance Tracking Specification

> **Document**: 234-DR-SPEC-compliance-tracking
> **Epic**: EPIC 021 - Compliance Tracking (SOC2/SOX)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

GWI's compliance tracking system provides continuous monitoring, evidence collection, and audit reporting for SOC2, SOX, and other regulatory frameworks. This specification covers the architecture for automated compliance management.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLIANCE TRACKING SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  FRAMEWORKS  │   │   CONTROLS   │   │   EVIDENCE   │   │  REPORTING   │ │
│  ├──────────────┤   ├──────────────┤   ├──────────────┤   ├──────────────┤ │
│  │ SOC2 Type II │   │ Control Map  │   │ Auto-Collect │   │ Audit Ready  │ │
│  │ SOX          │   │ Test Cases   │   │ Attestations │   │ Gap Analysis │ │
│  │ ISO 27001    │   │ Ownership    │   │ Screenshots  │   │ Dashboards   │ │
│  │ GDPR         │   │ Schedules    │   │ Logs         │   │ Exports      │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│           │                 │                 │                 │           │
│           └─────────────────┴────────┬────────┴─────────────────┘           │
│                                      │                                       │
│                             ┌────────▼────────┐                             │
│                             │   COMPLIANCE    │                             │
│                             │     ENGINE      │                             │
│                             └────────┬────────┘                             │
│                                      │                                       │
│           ┌─────────────────┬────────┼────────┬─────────────────┐           │
│           ▼                 ▼        ▼        ▼                 ▼           │
│  ┌──────────────┐   ┌──────────────┐ │ ┌──────────────┐ ┌──────────────┐   │
│  │  Audit Logs  │   │   IAM        │ │ │  Security    │ │   Change     │   │
│  │  (BigQuery)  │   │   Policies   │ │ │  Scans       │ │   Mgmt       │   │
│  └──────────────┘   └──────────────┘ │ └──────────────┘ └──────────────┘   │
│                                      │                                       │
│                             ┌────────▼────────┐                             │
│                             │    EXTERNAL     │                             │
│                             │    AUDITORS     │                             │
│                             └─────────────────┘                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Supported Frameworks

### 1.1 SOC2 Type II

SOC2 is the primary compliance framework for SaaS operations.

```yaml
soc2:
  trust_service_criteria:
    security:
      description: "Protection against unauthorized access"
      controls:
        - CC6.1: Logical access security
        - CC6.2: User registration and authorization
        - CC6.3: Access removal
        - CC6.6: External threats
        - CC6.7: Data transmission security
        - CC6.8: Malicious software prevention

    availability:
      description: "System availability for operation"
      controls:
        - CC9.1: Business continuity planning
        - A1.1: Availability commitments
        - A1.2: Capacity planning
        - A1.3: Recovery procedures

    processing_integrity:
      description: "Complete and accurate processing"
      controls:
        - PI1.1: Quality objectives
        - PI1.2: System inputs
        - PI1.3: System processing
        - PI1.4: System outputs
        - PI1.5: Data retention

    confidentiality:
      description: "Protection of confidential information"
      controls:
        - C1.1: Confidential information identification
        - C1.2: Confidential information disposal

    privacy:
      description: "Personal information handling"
      controls:
        - P1.1: Privacy notice
        - P2.1: Data collection
        - P3.1: Retention
        - P4.1: Disposal
        - P5.1: Access
        - P6.1: Disclosure
        - P7.1: Quality
        - P8.1: Complaints

  audit_period: 12_months
  report_type: type_ii
```

### 1.2 SOX (Sarbanes-Oxley)

For financial systems and reporting controls.

```yaml
sox:
  sections:
    section_302:
      description: "CEO/CFO certification of financial reports"
      controls:
        - financial_reporting_accuracy
        - disclosure_controls
        - internal_control_effectiveness

    section_404:
      description: "Management assessment of internal controls"
      controls:
        - access_to_financial_systems
        - segregation_of_duties
        - change_management
        - audit_trail
        - backup_and_recovery

    section_409:
      description: "Real-time disclosure"
      controls:
        - material_event_notification
        - timely_reporting

  material_systems:
    - billing_system
    - revenue_recognition
    - financial_reporting
    - access_management

  audit_period: fiscal_year
```

### 1.3 ISO 27001

Information security management system.

```yaml
iso27001:
  domains:
    A5: Information security policies
    A6: Organization of information security
    A7: Human resource security
    A8: Asset management
    A9: Access control
    A10: Cryptography
    A11: Physical security
    A12: Operations security
    A13: Communications security
    A14: System acquisition and development
    A15: Supplier relationships
    A16: Incident management
    A17: Business continuity
    A18: Compliance

  certification_cycle: 3_years
  surveillance_audits: annual
```

### 1.4 GDPR

EU data protection requirements.

```yaml
gdpr:
  principles:
    lawfulness: Article 5(1)(a)
    purpose_limitation: Article 5(1)(b)
    data_minimization: Article 5(1)(c)
    accuracy: Article 5(1)(d)
    storage_limitation: Article 5(1)(e)
    integrity_confidentiality: Article 5(1)(f)
    accountability: Article 5(2)

  data_subject_rights:
    - right_of_access: Article 15
    - right_to_rectification: Article 16
    - right_to_erasure: Article 17
    - right_to_restrict: Article 18
    - right_to_portability: Article 20
    - right_to_object: Article 21

  requirements:
    - privacy_by_design: Article 25
    - data_breach_notification: Article 33
    - dpia: Article 35
    - dpo_appointment: Article 37
```

---

## 2. Control Framework

### 2.1 Control Definition

```typescript
interface Control {
  // Identity
  id: string;                    // e.g., "CC6.1", "SOX-404.1"
  framework: Framework;
  category: string;

  // Description
  title: string;
  description: string;
  objective: string;

  // Ownership
  owner: string;                 // Team/individual
  implementer: string;           // Technical owner
  reviewer: string;              // Compliance reviewer

  // Implementation
  type: 'preventive' | 'detective' | 'corrective';
  automation: 'automated' | 'semi-automated' | 'manual';
  frequency: 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

  // Testing
  testProcedure: string;
  testFrequency: string;
  sampleSize?: number;

  // Evidence
  evidenceTypes: EvidenceType[];
  evidenceSources: string[];

  // Status
  status: 'implemented' | 'partial' | 'planned' | 'not_applicable';
  effectiveDate?: Date;
  lastTested?: Date;
  nextTestDue?: Date;
}

type Framework = 'SOC2' | 'SOX' | 'ISO27001' | 'GDPR';
type EvidenceType = 'log' | 'screenshot' | 'config' | 'attestation' | 'report' | 'policy';
```

### 2.2 Control Mapping

Map technical controls to framework requirements:

```yaml
control_mapping:
  # GWI Control -> Framework Controls
  access_control:
    gwi_control: "RBAC implementation"
    maps_to:
      SOC2:
        - CC6.1  # Logical access security
        - CC6.2  # User registration
      SOX:
        - section_404.access_control
      ISO27001:
        - A.9.2.1  # User registration
        - A.9.2.2  # Privileged access
        - A.9.4.1  # Information access restriction

  audit_logging:
    gwi_control: "Comprehensive audit trail"
    maps_to:
      SOC2:
        - CC7.1  # System monitoring
        - CC7.2  # Anomaly detection
      SOX:
        - section_404.audit_trail
      ISO27001:
        - A.12.4.1  # Event logging
        - A.12.4.2  # Protection of log information

  change_management:
    gwi_control: "CI/CD with approval gates"
    maps_to:
      SOC2:
        - CC8.1  # Change management
      SOX:
        - section_404.change_management
      ISO27001:
        - A.14.2.2  # System change control

  encryption:
    gwi_control: "Data encryption at rest and in transit"
    maps_to:
      SOC2:
        - CC6.7  # Data transmission security
      ISO27001:
        - A.10.1.1  # Cryptographic controls
        - A.10.1.2  # Key management
      GDPR:
        - Article_32  # Security of processing
```

### 2.3 Control Testing

```typescript
interface ControlTest {
  controlId: string;
  testId: string;

  // Test details
  procedure: string;
  methodology: 'inspection' | 'observation' | 'inquiry' | 'reperformance';

  // Execution
  executedBy: string;
  executedAt: Date;
  sampleSize: number;
  samplePeriod: {
    start: Date;
    end: Date;
  };

  // Results
  result: 'pass' | 'fail' | 'partial' | 'not_tested';
  findings: Finding[];
  evidence: Evidence[];

  // Review
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
  remediationPlan?: string;
  dueDate?: Date;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted_risk';
}
```

---

## 3. Evidence Collection

### 3.1 Automated Evidence

```yaml
automated_evidence:
  # Audit logs from BigQuery
  audit_logs:
    source: bigquery
    dataset: gwi_audit
    tables:
      - ai_operations
      - user_actions
      - system_events
    collection_frequency: daily
    retention: 7_years

  # IAM policies from GCP
  iam_policies:
    source: gcp_iam
    collection_frequency: daily
    captures:
      - project_iam_policies
      - service_account_keys
      - role_bindings

  # Security scan results
  security_scans:
    source: security_scanning
    collection_frequency: per_scan
    captures:
      - sast_results
      - dast_results
      - dependency_vulnerabilities

  # Change management
  change_records:
    source: github
    collection_frequency: per_event
    captures:
      - pull_requests
      - reviews
      - approvals
      - deployments

  # System configurations
  configurations:
    source: infrastructure
    collection_frequency: daily
    captures:
      - cloud_run_configs
      - firestore_rules
      - network_policies
```

### 3.2 Evidence Types

```typescript
interface Evidence {
  id: string;
  type: EvidenceType;

  // Source
  source: string;
  collectedAt: Date;
  collectedBy: 'automated' | string;

  // Content
  title: string;
  description: string;
  content: string | Buffer;
  hash: string;  // SHA256 for integrity

  // Metadata
  controlIds: string[];
  period: {
    start: Date;
    end: Date;
  };

  // Storage
  location: string;
  encrypted: boolean;
  retention: string;

  // Attestation
  attestedBy?: string;
  attestedAt?: Date;
}

type EvidenceType =
  | 'audit_log'
  | 'screenshot'
  | 'configuration'
  | 'policy_document'
  | 'attestation'
  | 'scan_report'
  | 'access_review'
  | 'incident_report'
  | 'training_record';
```

### 3.3 Evidence Collection Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sources   │────▶│  Collector  │────▶│  Processor  │────▶│   Storage   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │
      │                   │                   │                   │
      ▼                   ▼                   ▼                   ▼
 ┌─────────┐        ┌─────────┐        ┌─────────┐        ┌─────────┐
 │ BigQuery│        │ Schedule│        │ Validate│        │   GCS   │
 │ GitHub  │        │ Trigger │        │ Hash    │        │ Archive │
 │ GCP IAM │        │ Manual  │        │ Classify│        │ Index   │
 └─────────┘        └─────────┘        └─────────┘        └─────────┘
```

### 3.4 Evidence Integrity

```typescript
interface EvidenceIntegrity {
  // Hash chain for tamper detection
  hashChain: {
    evidenceId: string;
    hash: string;
    previousHash: string;
    timestamp: Date;
  }[];

  // Verification
  verify(evidenceId: string): Promise<boolean>;

  // Audit
  getAuditTrail(evidenceId: string): Promise<AuditEntry[]>;
}
```

---

## 4. Continuous Monitoring

### 4.1 Compliance Monitors

```yaml
monitors:
  # Access control monitoring
  access_control:
    name: "Privileged Access Monitor"
    control_ids: [CC6.1, CC6.2]
    checks:
      - name: admin_access_review
        frequency: daily
        query: |
          SELECT user_id, role, last_access
          FROM gwi_audit.user_roles
          WHERE role IN ('admin', 'power_user')
            AND last_access < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        alert_on: results > 0

      - name: orphaned_accounts
        frequency: daily
        query: |
          SELECT user_id
          FROM gwi_audit.users
          WHERE status = 'active'
            AND last_login IS NULL
            AND created_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        alert_on: results > 0

  # Change management monitoring
  change_management:
    name: "Change Approval Monitor"
    control_ids: [CC8.1]
    checks:
      - name: unapproved_deployments
        frequency: hourly
        query: |
          SELECT deployment_id, service, deployed_by
          FROM gwi_audit.deployments
          WHERE approval_status != 'approved'
            AND environment = 'production'
        alert_on: results > 0

  # Security monitoring
  security:
    name: "Security Scan Monitor"
    control_ids: [CC6.6, CC6.8]
    checks:
      - name: critical_vulnerabilities
        frequency: daily
        query: |
          SELECT scan_id, vulnerability_id, severity
          FROM gwi_audit.security_scans
          WHERE severity = 'critical'
            AND status = 'open'
        alert_on: results > 0
```

### 4.2 Compliance Scoring

```typescript
interface ComplianceScore {
  framework: Framework;
  period: {
    start: Date;
    end: Date;
  };

  // Overall score
  overallScore: number;  // 0-100
  trend: 'improving' | 'stable' | 'declining';

  // By category
  categoryScores: {
    category: string;
    score: number;
    controlsPassing: number;
    controlsFailing: number;
    controlsNotTested: number;
  }[];

  // Issues
  openFindings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  // Risk areas
  riskAreas: {
    area: string;
    risk: 'high' | 'medium' | 'low';
    recommendation: string;
  }[];
}
```

### 4.3 Alert Configuration

```yaml
alerts:
  compliance_violation:
    severity: critical
    channels: [slack, email, pagerduty]
    recipients:
      - compliance_team
      - security_team
    message_template: |
      🚨 Compliance Violation Detected

      Control: {{control_id}} - {{control_title}}
      Framework: {{framework}}
      Details: {{details}}

      Action Required: Investigate and remediate within {{sla_hours}} hours

  control_test_failure:
    severity: high
    channels: [slack, email]
    recipients:
      - control_owner
      - compliance_team
    message_template: |
      ⚠️ Control Test Failed

      Control: {{control_id}} - {{control_title}}
      Test: {{test_name}}
      Result: {{result}}
      Findings: {{findings_count}}

  evidence_gap:
    severity: medium
    channels: [slack]
    recipients:
      - control_owner
    message_template: |
      📋 Evidence Gap Detected

      Control: {{control_id}}
      Missing Evidence: {{evidence_types}}
      Due Date: {{due_date}}
```

---

## 5. Audit Preparation

### 5.1 Audit Types

```yaml
audit_types:
  internal:
    frequency: quarterly
    scope: all_controls
    conducted_by: internal_audit
    deliverables:
      - control_test_results
      - findings_report
      - remediation_tracking

  external_soc2:
    frequency: annual
    scope: soc2_controls
    conducted_by: external_auditor
    deliverables:
      - soc2_report
      - management_letter
      - bridge_letter

  external_sox:
    frequency: annual
    scope: sox_controls
    conducted_by: external_auditor
    deliverables:
      - management_assessment
      - auditor_attestation
      - deficiency_report

  certification_iso27001:
    frequency: triennial
    scope: iso27001_controls
    conducted_by: certification_body
    deliverables:
      - certification_report
      - nonconformity_report
      - corrective_action_plan
```

### 5.2 Audit Package Generation

```typescript
interface AuditPackage {
  framework: Framework;
  period: {
    start: Date;
    end: Date;
  };

  // Control documentation
  controls: {
    control: Control;
    tests: ControlTest[];
    evidence: Evidence[];
    findings: Finding[];
  }[];

  // Summary reports
  summaries: {
    executiveSummary: string;
    controlMatrix: ControlMatrix;
    findingsSummary: FindingsSummary;
    riskAssessment: RiskAssessment;
  };

  // Supporting documentation
  supporting: {
    policies: Policy[];
    procedures: Procedure[];
    systemDescriptions: SystemDescription[];
  };

  // Export formats
  export(format: 'pdf' | 'xlsx' | 'json'): Promise<Buffer>;
}
```

### 5.3 Auditor Portal

```yaml
auditor_portal:
  features:
    - secure_login: mfa_required
    - evidence_browser: searchable_indexed
    - document_download: watermarked
    - inquiry_tracking: threaded_discussions
    - sample_selection: random_sampling_tool
    - timeline_view: audit_period_navigation

  access_control:
    - time_limited: audit_period_only
    - scope_limited: assigned_controls_only
    - activity_logged: all_actions_audited

  collaboration:
    - request_evidence: submit_ipc_requests
    - ask_questions: inquiry_management
    - share_findings: preliminary_findings
    - track_responses: response_due_dates
```

---

## 6. Remediation Tracking

### 6.1 Finding Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Identified │────▶│   Triaged   │────▶│ Remediation │────▶│   Verified  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │
      │                   │                   │                   │
      ▼                   ▼                   ▼                   ▼
 Auditor finds      Owner assigned      Fix implemented     Auditor confirms
   issue             due date set        evidence added      issue resolved
```

### 6.2 Remediation Tracking

```typescript
interface RemediationPlan {
  findingId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';

  // Assignment
  owner: string;
  createdAt: Date;
  dueDate: Date;

  // Plan
  rootCause: string;
  remediation: string;
  preventionMeasures: string;
  resources: string[];
  milestones: Milestone[];

  // Progress
  status: 'not_started' | 'in_progress' | 'pending_verification' | 'closed';
  percentComplete: number;
  updates: StatusUpdate[];

  // Verification
  verifiedBy?: string;
  verifiedAt?: Date;
  verificationEvidence?: string;

  // Escalation
  escalationHistory: Escalation[];
}

interface Milestone {
  name: string;
  dueDate: Date;
  completedAt?: Date;
  evidence?: string;
}
```

### 6.3 SLA Enforcement

```yaml
remediation_slas:
  critical:
    response: 4h
    plan: 24h
    remediation: 7d
    verification: 14d
    escalation:
      - at: 50%
        notify: [owner, manager]
      - at: 75%
        notify: [owner, manager, compliance]
      - at: 100%
        notify: [owner, manager, compliance, cto]

  high:
    response: 24h
    plan: 3d
    remediation: 30d
    verification: 45d

  medium:
    response: 3d
    plan: 1w
    remediation: 60d
    verification: 75d

  low:
    response: 1w
    plan: 2w
    remediation: 90d
    verification: 105d
```

---

## 7. Reporting

### 7.1 Report Types

```yaml
reports:
  compliance_dashboard:
    frequency: real_time
    audience: [compliance_team, leadership]
    content:
      - overall_compliance_score
      - framework_status
      - open_findings
      - upcoming_tests
      - audit_timeline

  control_status:
    frequency: weekly
    audience: [control_owners, compliance_team]
    content:
      - control_test_results
      - evidence_status
      - remediation_progress

  executive_summary:
    frequency: monthly
    audience: [leadership, board]
    content:
      - compliance_posture
      - risk_areas
      - key_initiatives
      - audit_readiness

  audit_readiness:
    frequency: on_demand
    audience: [compliance_team, auditors]
    content:
      - control_matrix
      - evidence_inventory
      - gap_analysis
      - remediation_status

  regulatory_filing:
    frequency: as_required
    audience: [regulators]
    content:
      - certification_status
      - incident_disclosures
      - material_changes
```

### 7.2 Dashboard Metrics

```typescript
interface ComplianceDashboard {
  // Overall status
  overallScore: number;
  frameworkScores: Record<Framework, number>;

  // Control status
  controls: {
    total: number;
    implemented: number;
    partial: number;
    notImplemented: number;
    notApplicable: number;
  };

  // Testing status
  testing: {
    testsScheduled: number;
    testsCompleted: number;
    testsPassing: number;
    testsFailing: number;
  };

  // Findings
  findings: {
    open: number;
    bySeverity: Record<string, number>;
    overdue: number;
    closedThisPeriod: number;
  };

  // Evidence
  evidence: {
    totalRequired: number;
    collected: number;
    stale: number;
    gaps: number;
  };

  // Audit readiness
  auditReadiness: {
    nextAudit: Date;
    daysUntil: number;
    readinessScore: number;
    blockers: string[];
  };
}
```

---

## 8. Implementation

### 8.1 Compliance Engine

```typescript
// packages/core/src/compliance/engine.ts

export class ComplianceEngine {
  private controlStore: ControlStore;
  private evidenceStore: EvidenceStore;
  private monitoringService: MonitoringService;

  // Framework management
  async registerFramework(framework: FrameworkDefinition): Promise<void>;
  async getFrameworkStatus(framework: Framework): Promise<FrameworkStatus>;

  // Control management
  async createControl(control: Control): Promise<Control>;
  async testControl(controlId: string): Promise<ControlTest>;
  async getControlStatus(controlId: string): Promise<ControlStatus>;

  // Evidence management
  async collectEvidence(source: string): Promise<Evidence[]>;
  async attachEvidence(controlId: string, evidence: Evidence): Promise<void>;
  async verifyEvidenceIntegrity(evidenceId: string): Promise<boolean>;

  // Monitoring
  async runComplianceCheck(): Promise<ComplianceCheckResult>;
  async getComplianceScore(framework?: Framework): Promise<ComplianceScore>;

  // Reporting
  async generateReport(type: ReportType, options: ReportOptions): Promise<Report>;
  async generateAuditPackage(framework: Framework, period: Period): Promise<AuditPackage>;

  // Remediation
  async createFinding(finding: Finding): Promise<Finding>;
  async updateRemediation(findingId: string, update: RemediationUpdate): Promise<void>;
  async verifyRemediation(findingId: string): Promise<boolean>;
}
```

### 8.2 Integration Points

```yaml
integrations:
  # BigQuery for audit logs
  bigquery:
    purpose: audit_data_source
    datasets:
      - gwi_audit
      - gwi_compliance
    sync: real_time

  # GCP IAM for access evidence
  gcp_iam:
    purpose: access_control_evidence
    resources:
      - project_policies
      - service_accounts
      - roles
    sync: daily

  # GitHub for change management
  github:
    purpose: change_control_evidence
    data:
      - pull_requests
      - reviews
      - deployments
    sync: per_event

  # Security scanning
  security_tools:
    purpose: security_control_evidence
    tools:
      - semgrep
      - trivy
      - zap
    sync: per_scan

  # External: Auditor systems
  auditor_integration:
    purpose: audit_collaboration
    capabilities:
      - evidence_sharing
      - inquiry_management
      - finding_exchange
    format: excel_export
```

---

## CLI Commands

```bash
# View compliance status
gwi compliance status
gwi compliance status --framework soc2

# Control management
gwi compliance controls list
gwi compliance controls test CC6.1
gwi compliance controls evidence CC6.1

# Evidence collection
gwi compliance evidence collect --source bigquery --period 30d
gwi compliance evidence verify --id <evidence-id>

# Reporting
gwi compliance report --type dashboard
gwi compliance report --type audit-package --framework soc2 --period 2025

# Findings
gwi compliance findings list --status open
gwi compliance findings update <id> --status in_progress

# Audit preparation
gwi compliance audit-prep --framework soc2 --date 2026-03-01
```

---

## Related Documentation

- [235-DR-TMPL-compliance-checklist.md](./235-DR-TMPL-compliance-checklist.md) - Compliance checklist template
- [232-DR-SPEC-ai-governance.md](./232-DR-SPEC-ai-governance.md) - AI governance framework
- [230-DR-SPEC-security-scanning.md](./230-DR-SPEC-security-scanning.md) - Security scanning integration
