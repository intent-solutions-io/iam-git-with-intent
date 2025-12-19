# A1: Firestore Data Model Specification

> **Status**: Complete
> **Phase**: A (Platform Core Runtime)
> **Epic**: A1 - Firestore Data Model
> **Last Updated**: 2024-12-19

## Overview

This document defines the complete Firestore data model for Git With Intent (GWI). All collections follow multi-tenant isolation patterns with strict tenant-scoped access.

## Collection Hierarchy

```
Firestore Database
├── gwi_tenants/{tenantId}                    # Top-level tenant documents
│   ├── repos/{repoId}                        # Subcollection: Connected repositories
│   ├── connector_configs/{connectorId}       # Subcollection: Phase 12 connector configs
│   ├── instances/{instanceId}                # Subcollection: Phase 13 workflow instances
│   ├── schedules/{scheduleId}                # Subcollection: Phase 13 schedules
│   ├── signals/{signalId}                    # Subcollection: Phase 14 signals
│   ├── work_items/{workItemId}               # Subcollection: Phase 14 work items
│   └── pr_candidates/{candidateId}           # Subcollection: Phase 14 PR candidates
├── gwi_runs/{runId}                          # Top-level runs (indexed by tenantId)
│   ├── steps/{stepId}                        # Subcollection: Run steps
│   └── logs/{logId}                          # Subcollection: Run logs
├── gwi_users/{userId}                        # Top-level user profiles
├── gwi_memberships/{membershipId}            # User-Tenant relationships
├── gwi_installations/{installationId}        # GitHub App installations
├── gwi_approvals/{approvalId}                # Phase 11: Run approval records
├── gwi_audit_events/{eventId}                # Phase 11: Audit trail
├── gwi_run_locks/{lockId}                    # Phase 16: Distributed locks
├── gwi_idempotency/{idempotencyKey}          # Phase 16: Idempotency records
├── gwi_checkpoints/{checkpointId}            # Phase 16: Run checkpoints
├── gwi_usage_events/{eventId}                # Phase 22: Usage ledger
├── gwi_usage_daily/{tenantId_date}           # Phase 22: Daily aggregates
├── gwi_usage_monthly/{tenantId_month}        # Phase 22: Monthly aggregates
└── gwi_usage_snapshots/{tenantId}            # Phase 22: Current usage state
```

## Document ID Patterns

| Collection | ID Pattern | Example |
|------------|------------|---------|
| gwi_tenants | `gh-org-{githubOrgId}` | `gh-org-12345678` |
| repos | `gh-repo-{githubRepoId}` | `gh-repo-987654321` |
| gwi_runs | `run-{timestamp36}-{random}` | `run-m5v2kx8-a7b3c9d2` |
| steps | `step-{timestamp36}-{random}` | `step-m5v2kxa-x1y2z3w4` |
| gwi_users | Firebase Auth UID | `abc123def456ghi789` |
| gwi_memberships | `{userId}_{tenantId}` | `abc123_gh-org-12345678` |
| gwi_installations | `{installationId}` | `12345678` |
| gwi_approvals | `appr-{timestamp36}-{random}` | `appr-m5v2kxb-p9q8r7s6` |
| gwi_audit_events | `evt-{timestamp36}-{random}` | `evt-m5v2kxc-u5v4w3x2` |
| signals | `sig-{timestamp36}-{random}` | `sig-m5v2kxd-y1z0a9b8` |
| work_items | `wi-{timestamp36}-{random}` | `wi-m5v2kxe-c7d6e5f4` |
| pr_candidates | `cand-{timestamp36}-{random}` | `cand-m5v2kxf-g3h2i1j0` |

---

## Core Collections

### 1. gwi_tenants/{tenantId}

Represents a GitHub organization with GWI installed.

```typescript
interface TenantDocument {
  // Identity
  id: string;                      // "gh-org-{githubOrgId}"
  githubOrgId: number;             // GitHub org numeric ID
  githubOrgLogin: string;          // GitHub org login (e.g., "acme-corp")
  displayName: string;             // Human-readable name

  // Installation
  installationId: number;          // GitHub App installation ID
  installedAt: Timestamp;          // When installed
  installedBy: string;             // userId who installed

  // Status (Phase 11)
  status: 'active' | 'suspended' | 'deactivated';

  // Plan
  plan: 'free' | 'team' | 'pro' | 'enterprise';
  planLimits: {
    runsPerMonth: number;          // Max runs per month
    reposMax: number;              // Max connected repos
    membersMax: number;            // Max team members
  };

  // Settings
  settings: {
    defaultRiskMode: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
    defaultTriageModel: string;    // e.g., "gemini-1.5-flash"
    defaultCodeModel: string;      // e.g., "claude-sonnet"
    complexityThreshold: number;   // 1-5, for model escalation
    autoRunOnConflict: boolean;    // Auto-trigger on merge conflicts
    autoRunOnPrOpen: boolean;      // Auto-trigger on PR open
  };

  // Policy (Phase 12)
  policy?: {
    document: PolicyDocument;      // Policy-as-code document
    version: number;
    updatedAt: Timestamp;
    updatedBy: string;
    valid: boolean;
    validationErrors?: string[];
  };

  // Usage
  runsThisMonth: number;
  lastRunAt?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Example Document**:
```json
{
  "id": "gh-org-12345678",
  "githubOrgId": 12345678,
  "githubOrgLogin": "acme-corp",
  "displayName": "ACME Corporation",
  "installationId": 98765432,
  "installedAt": "2024-01-15T10:30:00Z",
  "installedBy": "user-abc123",
  "status": "active",
  "plan": "team",
  "planLimits": {
    "runsPerMonth": 1000,
    "reposMax": 50,
    "membersMax": 25
  },
  "settings": {
    "defaultRiskMode": "suggest_patch",
    "defaultTriageModel": "gemini-1.5-flash",
    "defaultCodeModel": "claude-sonnet",
    "complexityThreshold": 3,
    "autoRunOnConflict": true,
    "autoRunOnPrOpen": false
  },
  "runsThisMonth": 127,
  "lastRunAt": "2024-12-19T08:45:00Z",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-12-19T08:45:00Z"
}
```

---

### 2. gwi_tenants/{tenantId}/repos/{repoId}

Connected repositories within a tenant.

```typescript
interface RepoDocument {
  id: string;                      // "gh-repo-{githubRepoId}"
  tenantId: string;                // Parent tenant ID
  githubRepoId: number;            // GitHub repo numeric ID
  githubFullName: string;          // "org/repo-name"
  displayName: string;             // Human-readable name

  // Status
  enabled: boolean;
  lastSyncAt?: Timestamp;

  // Settings (override tenant defaults)
  settings: {
    riskModeOverride?: string;     // Override default risk mode
    autoTriage: boolean;           // Auto-triage new PRs
    autoReview: boolean;           // Auto-review PRs
    autoResolve: boolean;          // Auto-resolve conflicts
    branchPatterns?: string[];     // Branch patterns to watch
  };

  // Stats
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunId?: string;

  // Timestamps
  addedAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 3. gwi_runs/{runId}

Multi-agent pipeline executions. Top-level for cross-tenant admin queries, indexed by tenantId.

```typescript
interface RunDocument {
  // Identity
  id: string;                      // "run-{timestamp36}-{random}"
  tenantId: string;                // Tenant isolation
  repoId: string;                  // Which repo
  prId: string;                    // Internal PR reference
  prUrl: string;                   // GitHub PR URL

  // Type and Status
  type: 'triage' | 'plan' | 'resolve' | 'review' | 'autopilot';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep?: string;            // Current step ID

  // Steps (denormalized for single-read performance)
  steps: Array<{
    id: string;
    runId: string;
    agent: string;                 // "triage", "coder", "resolver", "reviewer"
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    input?: unknown;
    output?: unknown;
    error?: string;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
    durationMs?: number;
    tokensUsed?: { input: number; output: number };
  }>;

  // Trigger context
  trigger: {
    source: 'ui' | 'cli' | 'webhook' | 'scheduled' | 'api';
    userId?: string;               // If user-initiated
    webhookEventId?: string;       // GitHub webhook delivery ID
    commandText?: string;          // CLI command if applicable
  };

  // A2A correlation
  a2aCorrelationId?: string;

  // Token usage
  tokensUsed?: {
    triage: number;
    plan: number;
    code: number;
    review: number;
    total: number;
  };

  // Approval (Phase 11)
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  approvalReason?: string;
  proposedChanges?: Array<{
    file: string;
    action: 'create' | 'modify' | 'delete';
    diff?: string;
    summary?: string;
  }>;

  // Results
  result?: unknown;
  error?: string;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
}
```

---

### 4. gwi_users/{userId}

User profiles linked to Firebase Auth.

```typescript
interface UserDocument {
  id: string;                      // Firebase Auth UID
  githubUserId: number;            // GitHub user ID
  githubLogin: string;             // GitHub username
  githubAvatarUrl?: string;        // Avatar URL
  displayName: string;             // Display name
  email: string;                   // Email address

  // Preferences
  preferences: {
    defaultTenantId?: string;      // Default workspace
    notificationsEnabled: boolean;
    theme: 'light' | 'dark' | 'system';
  };

  // Timestamps
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 5. gwi_memberships/{membershipId}

User-Tenant relationships. Document ID is composite: `{userId}_{tenantId}`.

```typescript
interface MembershipDocument {
  id: string;                      // "{userId}_{tenantId}"
  userId: string;                  // Firebase Auth UID
  tenantId: string;                // Tenant ID

  // Role
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  githubRole?: string;             // GitHub org role if available

  // Status
  status: 'active' | 'invited' | 'suspended';

  // Invitation tracking
  invitedBy?: string;              // userId who invited
  invitedAt?: Timestamp;
  acceptedAt?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 6. gwi_installations/{installationId}

GitHub App installation index for webhook lookup.

```typescript
interface InstallationDocument {
  installationId: number;          // GitHub installation ID (document ID)
  tenantId: string;                // Linked tenant ID
  githubOrgId: number;             // GitHub org ID
  githubOrgLogin: string;          // GitHub org login
  installedAt: Timestamp;
  installedBy?: string;            // userId if known
  permissions: Record<string, string>;  // GitHub permission levels
  events: string[];                // Subscribed events
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Phase 11: Approval & Audit Collections

### 7. gwi_approvals/{approvalId}

Run approval decisions.

```typescript
interface ApprovalDocument {
  id: string;
  runId: string;
  tenantId: string;
  decision: 'approved' | 'rejected';
  decidedBy: string;               // userId
  decidedAt: Timestamp;
  reason?: string;
  proposedChangesSnapshot?: Array<ProposedChange>;
}
```

### 8. gwi_audit_events/{eventId}

Immutable audit trail.

```typescript
interface AuditEventDocument {
  id: string;
  runId: string;
  tenantId: string;
  eventType: 'run_started' | 'run_completed' | 'run_failed' |
             'step_started' | 'step_completed' | 'step_failed' |
             'approval_requested' | 'approval_granted' | 'approval_rejected' |
             'github_comment_posted' | 'branch_created' |
             'commit_pushed' | 'pr_created' | 'pr_updated';
  timestamp: Timestamp;
  actor?: string;                  // userId, 'system', or 'webhook'
  details: Record<string, unknown>;

  // Intent Receipt fields
  intent?: string;
  changeSummary?: string;
  scope?: string;
  policyApproval?: string;
  evidenceText?: string;
}
```

---

## Phase 14: Signal & Work Item Collections

### 9. gwi_tenants/{tenantId}/signals/{signalId}

Raw inbound events before normalization.

```typescript
interface SignalDocument {
  id: string;
  tenantId: string;
  source: 'github_issue' | 'github_pr' | 'github_comment' |
          'webhook' | 'scheduled' | 'manual' | 'api';
  externalId: string;              // Delivery ID for dedup
  occurredAt: Timestamp;           // When event occurred at source
  receivedAt: Timestamp;           // When we received it
  status: 'pending' | 'processed' | 'ignored' | 'failed';
  payload: Record<string, unknown>;
  context: {
    repo?: { owner: string; name: string; fullName: string; id?: number };
    resourceNumber?: number;
    resourceType?: 'issue' | 'pr' | 'comment' | 'commit';
    resourceUrl?: string;
    actor?: string;
    action?: string;
    title?: string;
    body?: string;
    labels?: string[];
  };
  processingMeta?: {
    processedAt?: Timestamp;
    workItemId?: string;
    ignoredReason?: string;
    errorMessage?: string;
  };
}
```

### 10. gwi_tenants/{tenantId}/work_items/{workItemId}

Normalized, scored units of work.

```typescript
interface WorkItemDocument {
  id: string;
  tenantId: string;
  type: 'issue_to_code' | 'pr_review' | 'pr_resolve' |
        'docs_update' | 'test_gen' | 'custom';
  title: string;
  summary: string;
  status: 'queued' | 'in_progress' | 'awaiting_approval' |
          'approved' | 'rejected' | 'completed' | 'dismissed';
  dedupeKey: string;               // For duplicate prevention
  score: number;                   // 0-100 priority
  scoreBreakdown: {
    baseScore: number;
    modifiers: Array<{ name: string; value: number; reason: string }>;
    finalScore: number;
    explanation: string;
  };
  signalIds: string[];             // Source signals
  evidence: {
    sourceUrls: string[];
    relatedPRs?: string[];
    relatedIssues?: string[];
    files?: string[];
    additionalContext?: Record<string, unknown>;
  };
  repo?: { owner: string; name: string; fullName: string };
  resourceNumber?: number;
  resourceUrl?: string;
  assignedTo?: string;
  candidateId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  dueAt?: Timestamp;
}
```

### 11. gwi_tenants/{tenantId}/pr_candidates/{candidateId}

Generated plans/patches awaiting approval.

```typescript
interface PRCandidateDocument {
  id: string;
  workItemId: string;
  tenantId: string;
  status: 'draft' | 'ready' | 'approved' | 'rejected' | 'applied' | 'failed';
  plan: {
    summary: string;
    steps: Array<{
      order: number;
      description: string;
      files?: string[];
      action: 'create' | 'modify' | 'delete' | 'review' | 'test';
    }>;
    complexity: number;            // 1-5
    affectedFiles: string[];
    estimatedMinutes?: number;
  };
  patchset?: {
    branchName: string;
    baseCommit: string;
    changes: Array<{
      file: string;
      action: 'create' | 'modify' | 'delete';
      content?: string;
      diff?: string;
    }>;
    commitMessage: string;
  };
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    score: number;
    factors: Array<{ name: string; severity: number; description: string }>;
    mitigations?: string[];
  };
  confidence: number;              // 0-100
  requiredApprovals: number;
  approvals: Array<{
    userId: string;
    decision: 'approved' | 'rejected' | 'changes_requested';
    comment?: string;
    timestamp: Timestamp;
  }>;
  intentReceipt: {
    intent: string;
    changeSummary: string;
    actor: string;
    when: string;
    scope: string;
    policyApproval: string;
    evidence: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  appliedAt?: Timestamp;
  resultingPRUrl?: string;
  runId?: string;
}
```

---

## Phase 16: Reliability Collections

### 12. gwi_run_locks/{lockId}

Distributed locks for run exclusivity.

```typescript
interface RunLockDocument {
  lockId: string;                  // e.g., "run-lock-{runId}"
  heldBy: string;                  // Worker/instance ID
  acquiredAt: Timestamp;
  expiresAt: Timestamp;            // TTL for automatic release
  purpose: string;                 // Description
}
```

### 13. gwi_idempotency/{idempotencyKey}

Idempotency records for exactly-once processing.

```typescript
interface IdempotencyDocument {
  key: string;                     // Idempotency key (document ID)
  result?: unknown;                // Cached result
  status: 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt: Timestamp;            // Cleanup TTL
}
```

### 14. gwi_checkpoints/{checkpointId}

Run recovery checkpoints.

```typescript
interface CheckpointDocument {
  checkpointId: string;
  runId: string;
  tenantId: string;
  stepId: string;
  state: Record<string, unknown>;  // Serialized state
  createdAt: Timestamp;
  isLatest: boolean;
}
```

---

## Phase 22: Usage Metering Collections

### 15. gwi_usage_events/{eventId}

Append-only usage ledger.

```typescript
interface UsageEventDocument {
  id: string;
  tenantId: string;
  eventType: 'run_completed' | 'tokens_used' | 'api_call';
  runId?: string;
  timestamp: Timestamp;
  metrics: {
    runs?: number;
    inputTokens?: number;
    outputTokens?: number;
    apiCalls?: number;
  };
  metadata?: Record<string, unknown>;
}
```

### 16. gwi_usage_daily/{tenantId_date}

Daily usage aggregates.

```typescript
interface UsageDailyDocument {
  id: string;                      // "{tenantId}_{YYYY-MM-DD}"
  tenantId: string;
  date: string;                    // "YYYY-MM-DD"
  runs: number;
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  updatedAt: Timestamp;
}
```

### 17. gwi_usage_monthly/{tenantId_month}

Monthly usage aggregates.

```typescript
interface UsageMonthlyDocument {
  id: string;                      // "{tenantId}_{YYYY-MM}"
  tenantId: string;
  month: string;                   // "YYYY-MM"
  runs: number;
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  updatedAt: Timestamp;
}
```

### 18. gwi_usage_snapshots/{tenantId}

Current usage state per tenant.

```typescript
interface UsageSnapshotDocument {
  tenantId: string;
  currentMonth: string;            // "YYYY-MM"
  runsThisMonth: number;
  inputTokensThisMonth: number;
  outputTokensThisMonth: number;
  lastUpdatedAt: Timestamp;
}
```

---

## Security Rules Summary

| Collection | Read | Write | Notes |
|------------|------|-------|-------|
| gwi_tenants | Members | Admin+/Service | Tenant members can read, admins+ can write |
| repos (sub) | Members | Admin+/Service | Same as tenant |
| gwi_runs | Members | Service | Members read, only service accounts write |
| steps (sub) | Members | Service | Same as runs |
| gwi_users | Self/Service | Self/Service | Users access own profile |
| gwi_memberships | Self/Admin | Admin/Service | Users see own, admins see tenant |
| gwi_installations | Service | Service | Internal use only |
| gwi_approvals | Admin | Service | Admins can read approvals |
| gwi_audit_events | Admin | Service | Immutable audit trail |
| Phase 14 subs | Members | Service | Signals, work items, candidates |
| Phase 16 | Service | Service | Internal reliability infrastructure |
| Phase 22 | Members | Service | Usage data is read-only for users |

---

## Indexes Required

See `firestore.indexes.json` for the complete index configuration.

### Critical Indexes

1. **Runs by tenant + date**: `gwi_runs (tenantId ASC, createdAt DESC)`
2. **Runs by tenant + repo**: `gwi_runs (tenantId ASC, repoId ASC, createdAt DESC)`
3. **Runs by tenant + status**: `gwi_runs (tenantId ASC, status ASC, createdAt DESC)`
4. **Memberships by user**: `gwi_memberships (userId ASC, status ASC)`
5. **Memberships by tenant**: `gwi_memberships (tenantId ASC, status ASC)`
6. **Work items by score**: `work_items (status ASC, score DESC)` (collection group)
7. **Signals pending**: `signals (status ASC, receivedAt ASC)` (collection group)

---

## Migration Strategy

For existing deployments:

1. **Additive changes only** - New fields default to undefined
2. **Backward compatibility** - Old documents work without migration
3. **Lazy migration** - Update documents on next write
4. **Version field** - Consider adding `schemaVersion` for complex migrations

---

## Tenant Isolation Rules

1. **All queries must filter by tenantId** - Never query without tenant context
2. **Top-level collections index tenantId** - For efficient tenant-scoped queries
3. **Subcollections under tenant** - Natural isolation for tenant-specific data
4. **Security rules enforce ownership** - Membership check before any access
5. **Service accounts bypass for admin** - Cloud Run services use service account auth
