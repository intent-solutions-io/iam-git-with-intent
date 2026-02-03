# AI Governance Framework Specification

> **Document**: 232-DR-SPEC-ai-governance
> **Epic**: EPIC 020 - AI Governance Policies
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

AI governance ensures responsible, transparent, and compliant use of AI models across GWI operations. This specification covers model selection policies, usage auditing, ethical guidelines, and accountability frameworks.

---

## Governance Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI GOVERNANCE FRAMEWORK                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   POLICIES   │   │   CONTROLS   │   │   AUDITING   │   │  OVERSIGHT   │ │
│  ├──────────────┤   ├──────────────┤   ├──────────────┤   ├──────────────┤ │
│  │ Model Usage  │   │ Access Gates │   │ Decision Log │   │ Ethics Board │ │
│  │ Data Handling│   │ Rate Limits  │   │ Cost Tracking│   │ Incident Mgmt│ │
│  │ Ethics Rules │   │ Approval     │   │ Performance  │   │ Compliance   │ │
│  │ Compliance   │   │ Kill Switches│   │ Quality      │   │ Review       │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│           │                 │                 │                 │           │
│           └─────────────────┴────────┬────────┴─────────────────┘           │
│                                      │                                       │
│                             ┌────────▼────────┐                             │
│                             │  GOVERNANCE     │                             │
│                             │  ENGINE         │                             │
│                             └────────┬────────┘                             │
│                                      │                                       │
│           ┌─────────────────┬────────┴────────┬─────────────────┐           │
│           ▼                 ▼                 ▼                 ▼           │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ Orchestrator │   │   Coder      │   │  Reviewer    │   │  Resolver    │ │
│  │    Agent     │   │   Agent      │   │    Agent     │   │    Agent     │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Model Usage Policies

### 1.1 Approved Models

| Provider | Model | Tier | Use Cases | Restrictions |
|----------|-------|------|-----------|--------------|
| Anthropic | claude-opus-4 | 5 | Complex reasoning, code generation | Cost approval for non-enterprise |
| Anthropic | claude-sonnet-4 | 3 | General code, reviews | Default for most operations |
| Anthropic | claude-3-5-haiku | 1 | Fast triage, simple tasks | No sensitive data |
| Google | gemini-2.0-flash | 1 | Orchestration, fast routing | No PII processing |
| Google | gemini-1.5-pro | 3 | Analysis, documentation | Approved data only |
| OpenAI | gpt-4o | 3 | Code generation, reviews | Requires tenant opt-in |
| OpenAI | gpt-4o-mini | 1 | Fast operations | Non-sensitive only |
| OpenAI | o1 | 5 | Deep reasoning | Approval required |

### 1.2 Model Selection Rules

```typescript
interface ModelSelectionPolicy {
  // Task complexity determines base tier
  complexityTiers: {
    low: 1,      // 1-3 complexity score
    medium: 3,   // 4-6 complexity score
    high: 5      // 7-10 complexity score
  };

  // Task type overrides
  taskTypeOverrides: {
    code_generation: { minTier: 3 },
    merge_resolution: { minTier: 3 },
    security_analysis: { minTier: 5 },
    simple_classification: { maxTier: 1 }
  };

  // Tenant-level restrictions
  tenantRestrictions: {
    allowedProviders: string[];  // Per tenant
    maxTier: number;             // Cost control
    requiredFeatures: string[];  // Compliance
  };
}
```

### 1.3 Prohibited Uses

| Category | Prohibited Actions |
|----------|-------------------|
| **Data** | Processing PII without encryption; storing prompts with credentials |
| **Output** | Auto-committing to production without review; bypassing approval gates |
| **Access** | Sharing API keys; using personal credentials for org work |
| **Content** | Generating harmful code; circumventing safety filters |

---

## 2. Data Governance

### 2.1 Data Classification

```yaml
classification_levels:
  public:
    description: "Non-sensitive, publicly available"
    examples: ["Open source code", "Public documentation"]
    ai_allowed: all_models
    retention: indefinite

  internal:
    description: "Internal company data"
    examples: ["Internal code", "Business logic", "Config files"]
    ai_allowed: all_approved_models
    retention: 90_days
    encryption: at_rest

  confidential:
    description: "Sensitive business data"
    examples: ["Customer data", "Financial info", "Strategic plans"]
    ai_allowed: [claude-sonnet-4, claude-opus-4]
    retention: 30_days
    encryption: at_rest_and_transit
    audit: full

  restricted:
    description: "Highly sensitive data"
    examples: ["PII", "Secrets", "Security configs"]
    ai_allowed: claude-opus-4_with_approval
    retention: 7_days
    encryption: at_rest_and_transit
    audit: full
    approval: required
```

### 2.2 Data Handling Rules

```typescript
interface DataHandlingPolicy {
  // Input sanitization
  sanitization: {
    stripSecrets: true;
    maskPII: true;
    removeCredentials: true;
    truncateLargeFiles: true;
    maxInputSize: '100KB';
  };

  // Output handling
  output: {
    scanForSecrets: true;
    validatePatterns: true;
    requireHumanReview: ['production_changes', 'security_configs'];
  };

  // Retention
  retention: {
    prompts: '30_days';
    responses: '30_days';
    auditLogs: '7_years';
    errorLogs: '90_days';
  };
}
```

### 2.3 PII Handling

```yaml
pii_policy:
  detection:
    - email_addresses
    - phone_numbers
    - social_security
    - credit_cards
    - ip_addresses
    - names_in_context

  actions:
    before_prompt:
      - detect: true
      - mask: true
      - log: "PII detected and masked"

    in_response:
      - scan: true
      - redact: true
      - alert_if_leaked: true
```

---

## 3. Audit Trail

### 3.1 Audit Events

Every AI operation generates an audit record:

```typescript
interface AIAuditEvent {
  // Identity
  id: string;                    // Unique event ID
  timestamp: Date;
  correlationId: string;         // Links related events

  // Context
  tenantId: string;
  userId?: string;
  runId: string;
  agentId: string;

  // Operation
  operation: AIOperation;
  model: string;
  provider: string;

  // Input (sanitized)
  inputHash: string;             // SHA256 of sanitized input
  inputSizeBytes: number;
  inputClassification: DataClassification;

  // Output
  outputHash: string;
  outputSizeBytes: number;
  tokensUsed: {
    input: number;
    output: number;
  };

  // Cost
  costUSD: number;
  billingTier: number;

  // Governance
  policyViolations: string[];
  approvals: Approval[];
  humanReviewRequired: boolean;
  humanReviewCompleted: boolean;

  // Quality
  latencyMs: number;
  success: boolean;
  errorCode?: string;
}

type AIOperation =
  | 'code_generation'
  | 'code_review'
  | 'merge_resolution'
  | 'triage'
  | 'classification'
  | 'summarization'
  | 'explanation';
```

### 3.2 Audit Storage

```yaml
audit_storage:
  primary:
    type: bigquery
    dataset: gwi_audit
    table: ai_operations
    retention: 7_years

  streaming:
    type: pubsub
    topic: ai-audit-events
    subscribers:
      - compliance-monitoring
      - cost-tracking
      - security-analytics

  backup:
    type: gcs
    bucket: gwi-audit-archive
    format: parquet
    partition_by: [date, tenant_id]
```

### 3.3 Audit Queries

```sql
-- High cost operations by tenant
SELECT
  tenant_id,
  DATE(timestamp) as date,
  model,
  COUNT(*) as operations,
  SUM(cost_usd) as total_cost,
  AVG(tokens_used.input + tokens_used.output) as avg_tokens
FROM `gwi_audit.ai_operations`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY tenant_id, date, model
ORDER BY total_cost DESC;

-- Policy violations
SELECT
  timestamp,
  tenant_id,
  agent_id,
  operation,
  policy_violations
FROM `gwi_audit.ai_operations`
WHERE ARRAY_LENGTH(policy_violations) > 0
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY timestamp DESC;

-- Human review completion rate
SELECT
  DATE(timestamp) as date,
  COUNTIF(human_review_required) as reviews_required,
  COUNTIF(human_review_completed) as reviews_completed,
  SAFE_DIVIDE(
    COUNTIF(human_review_completed),
    COUNTIF(human_review_required)
  ) * 100 as completion_rate
FROM `gwi_audit.ai_operations`
GROUP BY date
ORDER BY date DESC;
```

---

## 4. Ethical Guidelines

### 4.1 Principles

```yaml
ethical_principles:
  transparency:
    description: "Users know when AI is involved"
    requirements:
      - AI-generated content clearly marked
      - Decision rationale available on request
      - Model information disclosed

  fairness:
    description: "No discriminatory outcomes"
    requirements:
      - No bias in code suggestions
      - Equal treatment across tenants
      - Diverse training acknowledgment

  accountability:
    description: "Clear responsibility chain"
    requirements:
      - Human approval for production changes
      - Audit trail for all decisions
      - Escalation paths defined

  privacy:
    description: "User data protected"
    requirements:
      - Minimal data collection
      - Purpose limitation
      - Data subject rights

  safety:
    description: "No harmful outputs"
    requirements:
      - Content filtering enabled
      - Security scanning of outputs
      - Kill switches available
```

### 4.2 Prohibited Outputs

```typescript
interface OutputProhibitions {
  // Content types
  prohibitedContent: [
    'malicious_code',
    'vulnerability_exploits',
    'credential_harvesting',
    'obfuscated_code_without_reason',
    'backdoors',
    'data_exfiltration'
  ];

  // Detection
  detection: {
    patterns: string[];           // Regex patterns
    signatures: string[];         // Known bad signatures
    semanticAnalysis: boolean;    // AI-based detection
  };

  // Response
  onDetection: {
    block: true;
    alert: ['security_team'];
    audit: true;
    quarantine: true;
  };
}
```

### 4.3 Bias Mitigation

```yaml
bias_mitigation:
  # Code review fairness
  code_review:
    - anonymize_author_during_review: true
    - consistent_criteria_application: true
    - no_style_preference_penalties: true

  # Complexity scoring
  triage:
    - calibrated_across_languages: true
    - no_framework_bias: true
    - documented_scoring_rationale: true

  # Model selection
  model_routing:
    - tenant_agnostic_selection: true
    - cost_tier_transparency: true
    - capability_based_not_brand_based: true
```

---

## 5. Access Control

### 5.1 Role-Based Access

```yaml
ai_roles:
  viewer:
    permissions:
      - view_audit_logs
      - view_costs
      - view_policies
    restrictions:
      - cannot_invoke_models
      - cannot_modify_policies

  user:
    permissions:
      - invoke_tier1_models
      - invoke_tier3_models
      - view_own_audit_logs
    restrictions:
      - cannot_invoke_tier5_without_approval
      - cannot_modify_policies

  power_user:
    permissions:
      - invoke_all_approved_models
      - approve_tier5_usage
      - view_all_audit_logs
    restrictions:
      - cannot_modify_policies
      - cannot_disable_controls

  admin:
    permissions:
      - all_user_permissions
      - modify_policies
      - manage_kill_switches
      - override_controls
    restrictions:
      - all_actions_audited
      - requires_mfa

  governance_officer:
    permissions:
      - view_all_audit_logs
      - generate_compliance_reports
      - investigate_incidents
      - recommend_policy_changes
    restrictions:
      - cannot_invoke_models
      - cannot_modify_controls
```

### 5.2 Approval Workflows

```typescript
interface ApprovalWorkflow {
  // Tier 5 model usage
  tier5ModelUsage: {
    requiredApprovers: ['power_user', 'admin'];
    minApprovals: 1;
    expiresAfter: '24h';
    autoApproveFor: ['enterprise_tenants'];
  };

  // Restricted data processing
  restrictedData: {
    requiredApprovers: ['admin', 'governance_officer'];
    minApprovals: 2;
    expiresAfter: '4h';
    requiresJustification: true;
  };

  // Production changes
  productionChanges: {
    requiredApprovers: ['user'];  // Self-approval with SHA binding
    minApprovals: 1;
    expiresAfter: '1h';
    requiresSHABinding: true;
  };
}
```

---

## 6. Kill Switches

### 6.1 Emergency Controls

```yaml
kill_switches:
  # Global AI shutdown
  global_ai_kill:
    scope: all_ai_operations
    activation:
      - manual: admin_only
      - automatic:
          - cost_threshold_exceeded
          - security_incident_detected
          - provider_outage
    effect: block_all_ai_calls
    fallback: queue_for_retry

  # Provider-specific
  provider_kill:
    scope: single_provider
    activation:
      - manual: power_user
      - automatic:
          - error_rate > 50%
          - latency_p99 > 30s
    effect: route_to_alternate_provider
    fallback: queue_with_degraded_notice

  # Tenant-specific
  tenant_kill:
    scope: single_tenant
    activation:
      - manual: admin
      - automatic:
          - abuse_detected
          - billing_issue
          - security_concern
    effect: block_tenant_ai_calls
    fallback: return_service_unavailable

  # Operation-specific
  operation_kill:
    scope: specific_operation_type
    activation:
      - manual: admin
      - automatic:
          - quality_degradation
          - compliance_issue
    effect: disable_operation_type
    fallback: skip_operation
```

### 6.2 Kill Switch Dashboard

```typescript
interface KillSwitchStatus {
  global: {
    active: boolean;
    activatedAt?: Date;
    activatedBy?: string;
    reason?: string;
  };

  providers: {
    [provider: string]: {
      active: boolean;
      activatedAt?: Date;
      reason?: string;
    };
  };

  tenants: {
    [tenantId: string]: {
      active: boolean;
      activatedAt?: Date;
      reason?: string;
    };
  };

  operations: {
    [operation: string]: {
      active: boolean;
      activatedAt?: Date;
      reason?: string;
    };
  };
}
```

---

## 7. Compliance Integration

### 7.1 Framework Mapping

```yaml
compliance_mapping:
  SOC2:
    controls:
      CC6.1:
        description: "Logical access security"
        ai_relevance:
          - role_based_access
          - approval_workflows
          - audit_logging
      CC6.7:
        description: "Data transmission protection"
        ai_relevance:
          - encryption_in_transit
          - secure_api_calls
      CC7.2:
        description: "Security monitoring"
        ai_relevance:
          - audit_trail
          - anomaly_detection
          - incident_alerting

  GDPR:
    articles:
      Article22:
        description: "Automated decision-making"
        ai_relevance:
          - human_in_the_loop
          - explanation_capability
          - right_to_object
      Article35:
        description: "Data protection impact assessment"
        ai_relevance:
          - risk_assessment
          - mitigation_measures

  ISO27001:
    controls:
      A.9.4.1:
        description: "Information access restriction"
        ai_relevance:
          - data_classification
          - access_controls
      A.12.4.1:
        description: "Event logging"
        ai_relevance:
          - audit_trail
          - log_retention
```

### 7.2 Compliance Reports

```typescript
interface ComplianceReport {
  framework: 'SOC2' | 'GDPR' | 'ISO27001';
  period: {
    start: Date;
    end: Date;
  };

  controlAssessments: {
    controlId: string;
    status: 'compliant' | 'partial' | 'non_compliant';
    evidence: string[];
    gaps: string[];
    remediationPlan?: string;
  }[];

  metrics: {
    totalOperations: number;
    operationsWithAudit: number;
    policyViolations: number;
    humanReviewRate: number;
    dataClassificationCoverage: number;
  };

  incidents: {
    date: Date;
    description: string;
    resolution: string;
    preventiveMeasures: string[];
  }[];
}
```

---

## 8. Incident Management

### 8.1 AI-Specific Incidents

```yaml
incident_types:
  data_leak:
    description: "Sensitive data exposed in AI output"
    severity: critical
    response:
      - isolate_affected_runs
      - notify_security_team
      - assess_data_exposure
      - notify_affected_parties
      - implement_prevention

  model_misuse:
    description: "AI used for prohibited purposes"
    severity: high
    response:
      - block_offending_tenant
      - preserve_audit_logs
      - investigate_scope
      - report_to_provider

  quality_degradation:
    description: "AI outputs below quality threshold"
    severity: medium
    response:
      - enable_human_review
      - investigate_cause
      - adjust_model_selection
      - notify_affected_users

  cost_anomaly:
    description: "Unexpected AI cost spike"
    severity: medium
    response:
      - activate_cost_controls
      - investigate_cause
      - notify_tenant
      - adjust_limits

  bias_detected:
    description: "Systematic bias in AI outputs"
    severity: high
    response:
      - flag_affected_outputs
      - investigate_patterns
      - adjust_prompts
      - retrain_if_needed
```

### 8.2 Response Playbooks

```typescript
interface IncidentPlaybook {
  incidentType: string;

  detection: {
    automated: string[];    // Monitoring rules
    manual: string[];       // Reporting channels
  };

  triage: {
    questions: string[];
    severityMatrix: Record<string, string>;
  };

  response: {
    immediate: string[];    // First 15 minutes
    shortTerm: string[];    // First 4 hours
    longTerm: string[];     // Resolution
  };

  communication: {
    internal: string[];
    external: string[];
    regulatory?: string[];
  };

  postMortem: {
    required: boolean;
    template: string;
    reviewers: string[];
  };
}
```

---

## 9. Governance Metrics

### 9.1 KPIs

```yaml
governance_kpis:
  compliance:
    - name: policy_violation_rate
      target: < 0.1%
      measurement: violations / total_operations

    - name: human_review_completion
      target: > 99%
      measurement: reviews_completed / reviews_required

    - name: audit_coverage
      target: 100%
      measurement: operations_audited / total_operations

  quality:
    - name: output_quality_score
      target: > 4.0/5.0
      measurement: average_quality_rating

    - name: false_positive_rate
      target: < 5%
      measurement: false_positives / total_flagged

  efficiency:
    - name: approval_turnaround
      target: < 1 hour
      measurement: median_approval_time

    - name: incident_response_time
      target: < 15 minutes
      measurement: median_time_to_response
```

### 9.2 Dashboards

```typescript
interface GovernanceDashboard {
  // Summary view
  summary: {
    totalOperationsToday: number;
    policyViolations: number;
    pendingApprovals: number;
    activeIncidents: number;
    killSwitchesActive: number;
  };

  // Trend charts
  trends: {
    operationsOverTime: TimeSeriesData;
    violationsOverTime: TimeSeriesData;
    costOverTime: TimeSeriesData;
    qualityOverTime: TimeSeriesData;
  };

  // Breakdowns
  breakdowns: {
    byModel: Record<string, number>;
    byOperation: Record<string, number>;
    byTenant: Record<string, number>;
    byClassification: Record<string, number>;
  };

  // Alerts
  alerts: {
    critical: Alert[];
    warning: Alert[];
    info: Alert[];
  };
}
```

---

## 10. Implementation

### 10.1 Governance Engine

```typescript
// packages/core/src/governance/engine.ts

import { AIAuditEvent, GovernancePolicy, KillSwitch } from './types';

export class GovernanceEngine {
  private policies: GovernancePolicy[];
  private killSwitches: KillSwitch[];
  private auditStore: AuditStore;

  async evaluateRequest(request: AIRequest): Promise<GovernanceDecision> {
    // Check kill switches
    const killSwitch = await this.checkKillSwitches(request);
    if (killSwitch.active) {
      return { allowed: false, reason: killSwitch.reason };
    }

    // Evaluate policies
    const violations = await this.evaluatePolicies(request);
    if (violations.length > 0 && violations.some(v => v.blocking)) {
      return { allowed: false, violations };
    }

    // Check approvals
    if (await this.requiresApproval(request)) {
      const approval = await this.checkApproval(request);
      if (!approval.granted) {
        return { allowed: false, reason: 'approval_required' };
      }
    }

    return { allowed: true, warnings: violations.filter(v => !v.blocking) };
  }

  async auditOperation(event: AIAuditEvent): Promise<void> {
    // Sanitize before storing
    const sanitized = this.sanitizeEvent(event);

    // Store in primary
    await this.auditStore.store(sanitized);

    // Publish to streaming
    await this.publishEvent(sanitized);

    // Check for anomalies
    await this.checkAnomalies(sanitized);
  }
}
```

### 10.2 Integration Points

```yaml
integration_points:
  # Agent invocation
  agent_invocation:
    hook: pre_invoke
    action: evaluate_governance
    on_violation: block_or_warn

  # Model selection
  model_selection:
    hook: pre_select
    action: check_model_policy
    on_violation: select_alternative

  # Output processing
  output_processing:
    hook: post_generate
    action: scan_output
    on_violation: redact_or_block

  # Cost tracking
  cost_tracking:
    hook: post_invoke
    action: record_cost
    on_threshold: alert_and_throttle
```

---

## CLI Commands

```bash
# View governance status
gwi governance status

# List active policies
gwi governance policies list

# Check kill switches
gwi governance kill-switches

# Generate compliance report
gwi governance report --framework soc2 --period 30d

# Audit query
gwi governance audit --tenant <id> --since 7d

# Activate kill switch
gwi governance kill --scope provider --target anthropic --reason "outage"

# Deactivate kill switch
gwi governance unkill --scope provider --target anthropic
```

---

## Related Documentation

- [233-DR-TMPL-governance-policy.md](./233-DR-TMPL-governance-policy.md) - Governance policy template
- [224-DR-SPEC-cost-optimization.md](./224-DR-SPEC-cost-optimization.md) - Cost controls
- [230-DR-SPEC-security-scanning.md](./230-DR-SPEC-security-scanning.md) - Security integration
