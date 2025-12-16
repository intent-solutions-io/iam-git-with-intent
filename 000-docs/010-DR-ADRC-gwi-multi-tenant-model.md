# 010-DR-ADRC: Git With Intent Multi-Tenant Data Model

**Document ID:** 010-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent SaaS platform

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `010` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Git With Intent Cloud is a multi-tenant SaaS platform where each **tenant** represents a GitHub organization that has installed the GWI GitHub App. We need a data model that:

1. Cleanly isolates tenant data
2. Supports multiple users per tenant
3. Tracks runs (TRIAGE, PLAN, RESOLVE, REVIEW, AUTOPILOT) per repo
4. Integrates with Firebase Auth for user identity
5. Maps cleanly to storage interfaces (RunStore, PRStore, TenantStore)
6. Propagates tenant context through A2A gateway to Agent Engine

---

## Decision

### 1. Tenant Definition

**A Tenant = A GitHub Organization Installation**

When a GitHub org admin installs the GWI GitHub App:
1. A new tenant record is created
2. The GitHub org ID becomes the tenant identifier
3. The installing user becomes the tenant owner

```
Tenant ID Format: gh-org-{github_org_id}
Example: gh-org-12345678
```

### 2. User Model

**Users = GitHub Users authenticated via Firebase Auth**

Users authenticate via GitHub OAuth through Firebase Auth. Each user can belong to multiple tenants based on their GitHub org memberships.

**User Roles:**

| Role | Permissions |
|------|-------------|
| **owner** | Full access, manage members, billing, delete tenant |
| **admin** | Manage repos, configure settings, view all runs |
| **member** | Start runs, view runs on accessible repos |

**User-to-Tenant Relationship:**

```
User (Firebase Auth) ──── has many ────► TenantMembership
                                              │
                                              ▼
                                         Tenant (GitHub Org)
```

### 3. Data Model (Firestore)

#### 3.1 Top-Level Collections

```
firestore/
├── tenants/{tenantId}                    # Tenant documents
│   ├── repos/{repoId}                    # Subcollection: Linked repos
│   └── runs/{runId}                      # Subcollection: Run records
├── users/{userId}                        # User documents
└── memberships/{membershipId}            # User-Tenant memberships
```

#### 3.2 Tenant Document

```typescript
// Collection: tenants/{tenantId}
interface TenantDocument {
  // Identity
  id: string;                    // e.g., "gh-org-12345678"
  githubOrgId: number;           // GitHub org ID
  githubOrgLogin: string;        // GitHub org login (slug)
  displayName: string;           // User-friendly name

  // GitHub App Installation
  installationId: number;        // GitHub App installation ID
  installedAt: Timestamp;
  installedBy: string;           // userId of installer

  // Plan & Billing
  plan: 'free' | 'team' | 'pro' | 'enterprise';
  planLimits: {
    runsPerMonth: number;
    reposMax: number;
    membersMax: number;
  };
  billingEmail: string;
  stripeCustomerId?: string;

  // Settings
  settings: {
    defaultRiskMode: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
    defaultTriageModel: string;
    defaultCodeModel: string;
    complexityThreshold: number; // 1-5, for model escalation
    autoRunOnConflict: boolean;
    autoRunOnPrOpen: boolean;
  };

  // Usage
  runsThisMonth: number;
  lastRunAt?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### 3.3 Repo Document (Subcollection)

```typescript
// Collection: tenants/{tenantId}/repos/{repoId}
interface RepoDocument {
  // Identity
  id: string;                    // e.g., "gh-repo-987654321"
  githubRepoId: number;          // GitHub repo ID
  githubFullName: string;        // e.g., "org/repo-name"
  displayName: string;           // Just the repo name

  // Status
  enabled: boolean;              // Is GWI active on this repo?
  lastSyncAt?: Timestamp;        // Last webhook sync

  // Settings (override tenant defaults)
  settings: {
    riskModeOverride?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
    autoTriage: boolean;
    autoReview: boolean;
    autoResolve: boolean;
    branchPatterns?: string[];   // e.g., ["main", "develop"]
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

#### 3.4 Run Document (Subcollection)

```typescript
// Collection: tenants/{tenantId}/runs/{runId}
interface RunDocument {
  // Identity
  id: string;                    // UUID
  tenantId: string;
  repoId: string;

  // PR/Issue Reference
  prNumber?: number;
  prUrl?: string;
  issueNumber?: number;
  issueUrl?: string;
  baseBranch?: string;
  headBranch?: string;

  // Run Type
  type: 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';

  // Status
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  // Trigger
  trigger: {
    source: 'ui' | 'cli' | 'webhook' | 'scheduled';
    userId?: string;             // If triggered by user
    webhookEventId?: string;     // If triggered by GitHub
    commandText?: string;        // e.g., "/gwi resolve"
  };

  // Steps (denormalized for query efficiency)
  steps: RunStep[];
  currentStep?: string;

  // Results
  result?: {
    success: boolean;
    summary: string;
    conflictsResolved?: number;
    filesModified?: string[];
    prCommentUrl?: string;
    patchUrl?: string;
  };

  // Error
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };

  // Metrics
  durationMs?: number;
  tokensUsed?: {
    triage: number;
    plan: number;
    code: number;
    review: number;
    total: number;
  };

  // A2A Tracking (bobs-brain pattern)
  a2aCorrelationId?: string;     // Pipeline correlation ID
  agentInvocations?: {
    agent: string;               // e.g., "triage", "coder"
    spiffeId: string;
    startedAt: Timestamp;
    completedAt?: Timestamp;
    success: boolean;
  }[];

  // Timestamps
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  updatedAt: Timestamp;
}

interface RunStep {
  id: string;
  agent: 'triage' | 'planner' | 'coder' | 'validator' | 'reviewer';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}
```

#### 3.5 User Document

```typescript
// Collection: users/{userId}
interface UserDocument {
  // Identity
  id: string;                    // Firebase Auth UID

  // GitHub Identity
  githubUserId: number;
  githubLogin: string;
  githubAvatarUrl?: string;

  // Profile
  displayName: string;
  email: string;

  // Preferences
  preferences: {
    defaultTenantId?: string;    // Last used tenant
    notificationsEnabled: boolean;
    theme: 'light' | 'dark' | 'system';
  };

  // Timestamps
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### 3.6 Membership Document

```typescript
// Collection: memberships/{membershipId}
// Composite key: {userId}_{tenantId}
interface MembershipDocument {
  id: string;                    // e.g., "user123_gh-org-456"
  userId: string;
  tenantId: string;

  role: 'owner' | 'admin' | 'member';

  // GitHub context
  githubRole?: 'owner' | 'admin' | 'member' | 'collaborator';

  // Status
  status: 'active' | 'invited' | 'suspended';
  invitedBy?: string;
  invitedAt?: Timestamp;
  acceptedAt?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 4. Tenant Isolation & Security

### 4.1 Data Partitioning

**All tenant data is partitioned by tenantId:**

- Repos are subcollections under `tenants/{tenantId}/repos/`
- Runs are subcollections under `tenants/{tenantId}/runs/`
- This ensures Firestore queries are scoped to a single tenant

### 4.2 Query Patterns

| Query | Collection | Filter |
|-------|------------|--------|
| List user's tenants | memberships | where userId == currentUser.uid |
| List tenant's repos | tenants/{tenantId}/repos | (subcollection scan) |
| List tenant's runs | tenants/{tenantId}/runs | where status == 'running' |
| Get run by ID | tenants/{tenantId}/runs/{runId} | (direct doc read) |

### 4.3 Security Rules

```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // Memberships readable by the user or tenant admins
    match /memberships/{membershipId} {
      allow read: if request.auth.uid == resource.data.userId
                  || isTenantAdmin(resource.data.tenantId);
      allow write: if isTenantOwner(resource.data.tenantId);
    }

    // Tenant documents readable by members, writable by admins
    match /tenants/{tenantId} {
      allow read: if isTenantMember(tenantId);
      allow write: if isTenantAdmin(tenantId);

      // Subcollections inherit tenant access
      match /repos/{repoId} {
        allow read: if isTenantMember(tenantId);
        allow write: if isTenantAdmin(tenantId);
      }

      match /runs/{runId} {
        allow read: if isTenantMember(tenantId);
        allow create: if isTenantMember(tenantId);
        allow update, delete: if isTenantAdmin(tenantId);
      }
    }

    // Helper functions
    function isTenantMember(tenantId) {
      return exists(/databases/$(database)/documents/memberships/$(request.auth.uid)_$(tenantId));
    }

    function isTenantAdmin(tenantId) {
      let membership = get(/databases/$(database)/documents/memberships/$(request.auth.uid)_$(tenantId));
      return membership != null && membership.data.role in ['owner', 'admin'];
    }

    function isTenantOwner(tenantId) {
      let membership = get(/databases/$(database)/documents/memberships/$(request.auth.uid)_$(tenantId));
      return membership != null && membership.data.role == 'owner';
    }
  }
}
```

### 4.4 Index Strategy

**Required Firestore Indexes:**

```yaml
# firestore.indexes.json
indexes:
  # Runs by status and date
  - collectionGroup: runs
    queryScope: COLLECTION
    fields:
      - fieldPath: status
        order: ASCENDING
      - fieldPath: createdAt
        order: DESCENDING

  # Runs by type and date
  - collectionGroup: runs
    queryScope: COLLECTION
    fields:
      - fieldPath: type
        order: ASCENDING
      - fieldPath: createdAt
        order: DESCENDING

  # Memberships by userId
  - collectionGroup: memberships
    queryScope: COLLECTION
    fields:
      - fieldPath: userId
        order: ASCENDING
      - fieldPath: status
        order: ASCENDING
```

---

## 5. A2A Protocol Integration (bobs-brain Pattern)

### 5.1 Tenant Context Propagation

When a run is triggered, tenant and run IDs must flow through the entire pipeline:

```
1. API Layer (gwi-api)
   ├── Validates user auth (Firebase JWT)
   ├── Resolves tenantId from membership
   ├── Creates Run document in Firestore
   └── Calls gwi-a2a-gateway with context

2. A2A Gateway (gwi-a2a-gateway)
   ├── Receives A2AAgentCall with:
   │   ├── tenantId
   │   ├── runId
   │   └── correlationId
   └── Forwards to Agent Engine

3. Agent Engine (Orchestrator)
   ├── Receives context in payload
   ├── Passes to specialist agents
   └── Returns results with same IDs

4. Storage (RunStore)
   ├── Updates Run document by runId
   └── Scoped to tenantId
```

### 5.2 A2A Payload with Tenant Context

```typescript
interface A2AAgentCall {
  agent_role: string;          // "orchestrator", "triage", etc.
  prompt: string;              // Task description

  // Tenant context (GWI-specific)
  context: {
    tenantId: string;          // "gh-org-12345678"
    runId: string;             // UUID
    repoId: string;            // "gh-repo-987654321"
    prUrl?: string;            // GitHub PR URL
  };

  // A2A standard fields
  correlation_id: string;      // Pipeline run ID
  caller_spiffe_id: string;    // SPIFFE ID of caller
  session_id?: string;         // Optional session continuity
  env: string;                 // "dev" | "staging" | "prod"
}
```

### 5.3 RunStore Interface Mapping

The existing RunStore interface maps to Firestore:

```typescript
// packages/core/src/storage/interfaces.ts
interface RunStore {
  createRun(prId: string, prUrl: string, type: RunType): Promise<Run>;
  getRun(runId: string): Promise<Run | null>;
  getLatestRun(prId: string): Promise<Run | null>;
  listRuns(prId: string, limit?: number): Promise<Run[]>;
  updateRunStatus(runId: string, status: RunStatus): Promise<void>;
  addStep(runId: string, agent: string): Promise<RunStep>;
  updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void>;
  completeRun(runId: string, result: RunResult): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
}

// packages/core/src/storage/firestore/firestore-run-store.ts (future)
class FirestoreRunStore implements RunStore {
  constructor(private tenantId: string) {}

  async createRun(prId: string, prUrl: string, type: RunType): Promise<Run> {
    const runRef = db.collection(`tenants/${this.tenantId}/runs`).doc();
    // ... implementation
  }
}
```

---

## 6. Consequences

### Positive

- Clean tenant isolation at database level
- Firestore subcollections provide natural scoping
- Security rules enforce tenant boundaries
- A2A context propagation is explicit and traceable
- Storage interfaces remain backend-agnostic

### Negative

- Firestore's query limitations (no cross-tenant aggregations)
- Membership lookup required for every request
- More documents than a single-collection approach

### Risks

| Risk | Mitigation |
|------|------------|
| Cross-tenant data leak | Security rules + API validation |
| Query performance | Proper indexes, denormalization |
| Membership sync drift | GitHub webhook on org changes |
| Orphaned data on tenant delete | Cascading delete job |

---

## 7. Compliance Checklist

- [x] Tenant = GitHub org installation (clear definition)
- [x] User model with Firebase Auth integration
- [x] Role-based access (owner, admin, member)
- [x] Firestore data model defined
- [x] Security rules drafted
- [x] Index strategy documented
- [x] A2A context propagation designed
- [x] RunStore interface mapping confirmed

---

## 8. References

- 009-PM-PRDC: Git With Intent Cloud PRD
- 006-DR-ADRC: AgentFS/Beads Policy
- 007-DR-ADRC: Directory Structure
- bobs-brain/101-AT-ARCH: Agent Engine Topology
- bobs-brain/102-AT-ARCH: Cloud Run Gateways

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
