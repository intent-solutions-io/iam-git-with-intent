# 011-DR-ADRC: Git With Intent API Surface v0.1

**Document ID:** 011-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** gwi-api Cloud Run service

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `011` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Git With Intent Cloud needs a REST API (`gwi-api`) that:

1. Serves the web UI (Firebase Hosting SPA)
2. Serves the CLI (`gwi` command)
3. Coordinates with `gwi-webhook` for GitHub events
4. Routes agent calls through `gwi-a2a-gateway`
5. Stores data in Firestore (tenants, repos, runs)

This ADR defines the public API surface for v0.1.

---

## Decision

### 1. Service Architecture

```
                    ┌─────────────────┐
                    │   Web UI (SPA)  │
                    │ Firebase Hosting│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    gwi-api      │
                    │   (Cloud Run)   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Firestore   │  │  gwi-webhook    │  │ gwi-a2a-gateway │
│  (Data Store) │  │ (GitHub Events) │  │ (Agent Engine)  │
└───────────────┘  └─────────────────┘  └─────────────────┘
```

### 2. Authentication Model

**Firebase Auth with GitHub OAuth Provider:**

1. User authenticates via Firebase Auth (GitHub OAuth)
2. Firebase issues a JWT token
3. All API requests include `Authorization: Bearer {jwt}`
4. gwi-api validates JWT and extracts user ID
5. Tenant access resolved via membership lookup

**Auth Flow:**

```
1. Web UI: firebase.auth().signInWithPopup(githubProvider)
2. CLI: firebase.auth().signInWithCustomToken(cliToken)
3. API: Verify JWT → Get userId → Look up memberships → Resolve tenantId
```

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer {firebase_jwt}` |
| `X-GWI-Tenant-Id` | Optional | Override tenant (must be member) |
| `X-GWI-Request-Id` | Optional | Client-provided correlation ID |

### 3. API Endpoints (v0.1)

**Base URL:** `https://api.gitwithintent.com/v1`

---

#### 3.1 User Endpoints

##### GET /me

**Description:** Get current authenticated user and their tenants.

**Auth:** Required (any authenticated user)

**Response:**
```json
{
  "user": {
    "id": "firebase_uid_123",
    "githubLogin": "username",
    "displayName": "Display Name",
    "email": "user@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/..."
  },
  "tenants": [
    {
      "id": "gh-org-12345",
      "displayName": "My Organization",
      "role": "owner",
      "plan": "team"
    }
  ],
  "defaultTenantId": "gh-org-12345"
}
```

---

#### 3.2 Tenant Endpoints

##### GET /tenants

**Description:** List all tenants the user can access.

**Auth:** Required

**Response:**
```json
{
  "tenants": [
    {
      "id": "gh-org-12345",
      "displayName": "My Organization",
      "githubOrgLogin": "my-org",
      "plan": "team",
      "role": "owner",
      "repoCount": 15,
      "runsThisMonth": 42
    }
  ]
}
```

---

##### GET /tenants/{tenantId}

**Description:** Get tenant details.

**Auth:** Required (tenant member)

**Response:**
```json
{
  "id": "gh-org-12345",
  "displayName": "My Organization",
  "githubOrgId": 12345,
  "githubOrgLogin": "my-org",
  "plan": "team",
  "planLimits": {
    "runsPerMonth": 500,
    "reposMax": 20,
    "membersMax": 10
  },
  "settings": {
    "defaultRiskMode": "comment_only",
    "defaultTriageModel": "gemini-2.0-flash",
    "defaultCodeModel": "claude-sonnet-4",
    "complexityThreshold": 4,
    "autoRunOnConflict": false
  },
  "usage": {
    "runsThisMonth": 42,
    "reposConnected": 15,
    "membersCount": 5
  },
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

##### PATCH /tenants/{tenantId}/settings

**Description:** Update tenant settings.

**Auth:** Required (tenant admin)

**Request:**
```json
{
  "defaultRiskMode": "suggest_patch",
  "complexityThreshold": 3,
  "autoRunOnConflict": true
}
```

**Response:**
```json
{
  "success": true,
  "settings": {
    "defaultRiskMode": "suggest_patch",
    "defaultTriageModel": "gemini-2.0-flash",
    "defaultCodeModel": "claude-sonnet-4",
    "complexityThreshold": 3,
    "autoRunOnConflict": true
  }
}
```

---

#### 3.3 Repo Endpoints

##### GET /tenants/{tenantId}/repos

**Description:** List connected repositories.

**Auth:** Required (tenant member)

**Query Params:**
- `enabled` (boolean): Filter by enabled status
- `limit` (number): Max results (default: 50)
- `cursor` (string): Pagination cursor

**Response:**
```json
{
  "repos": [
    {
      "id": "gh-repo-987654",
      "githubFullName": "my-org/my-repo",
      "displayName": "my-repo",
      "enabled": true,
      "settings": {
        "autoTriage": true,
        "autoReview": false,
        "autoResolve": false
      },
      "stats": {
        "totalRuns": 25,
        "successfulRuns": 23,
        "lastRunAt": "2025-12-15T10:30:00Z"
      }
    }
  ],
  "nextCursor": "abc123"
}
```

---

##### POST /tenants/{tenantId}/repos:connect

**Description:** Connect repositories after GitHub App installation.

**Auth:** Required (tenant admin)

**Request:**
```json
{
  "repos": [
    {
      "githubRepoId": 987654321,
      "githubFullName": "my-org/new-repo"
    }
  ]
}
```

**Response:**
```json
{
  "connected": [
    {
      "id": "gh-repo-987654321",
      "githubFullName": "my-org/new-repo",
      "enabled": true
    }
  ],
  "errors": []
}
```

---

##### PATCH /tenants/{tenantId}/repos/{repoId}

**Description:** Update repo settings.

**Auth:** Required (tenant admin)

**Request:**
```json
{
  "enabled": true,
  "settings": {
    "autoTriage": true,
    "autoReview": true,
    "riskModeOverride": "auto_patch"
  }
}
```

**Response:**
```json
{
  "success": true,
  "repo": {
    "id": "gh-repo-987654",
    "enabled": true,
    "settings": {
      "autoTriage": true,
      "autoReview": true,
      "autoResolve": false,
      "riskModeOverride": "auto_patch"
    }
  }
}
```

---

#### 3.4 Run Endpoints

##### GET /tenants/{tenantId}/runs

**Description:** List runs for a tenant.

**Auth:** Required (tenant member)

**Query Params:**
- `repoId` (string): Filter by repo
- `type` (string): Filter by run type (TRIAGE, PLAN, RESOLVE, REVIEW, AUTOPILOT)
- `status` (string): Filter by status (pending, running, completed, failed)
- `limit` (number): Max results (default: 20)
- `cursor` (string): Pagination cursor

**Response:**
```json
{
  "runs": [
    {
      "id": "run-uuid-123",
      "repoId": "gh-repo-987654",
      "repoFullName": "my-org/my-repo",
      "type": "RESOLVE",
      "status": "completed",
      "prNumber": 42,
      "prUrl": "https://github.com/my-org/my-repo/pull/42",
      "trigger": {
        "source": "webhook",
        "commandText": "/gwi resolve"
      },
      "result": {
        "success": true,
        "summary": "Resolved 3 conflicts in 2 files",
        "conflictsResolved": 3
      },
      "durationMs": 45000,
      "createdAt": "2025-12-15T10:30:00Z",
      "completedAt": "2025-12-15T10:30:45Z"
    }
  ],
  "nextCursor": "xyz789"
}
```

---

##### POST /tenants/{tenantId}/runs

**Description:** Start a new run.

**Auth:** Required (tenant member)

**Request:**
```json
{
  "repoId": "gh-repo-987654",
  "type": "RESOLVE",
  "prUrl": "https://github.com/my-org/my-repo/pull/42",
  "options": {
    "riskMode": "suggest_patch",
    "dryRun": false
  }
}
```

**Response:**
```json
{
  "run": {
    "id": "run-uuid-456",
    "repoId": "gh-repo-987654",
    "type": "RESOLVE",
    "status": "pending",
    "prUrl": "https://github.com/my-org/my-repo/pull/42",
    "trigger": {
      "source": "ui",
      "userId": "firebase_uid_123"
    },
    "createdAt": "2025-12-15T10:35:00Z"
  }
}
```

---

##### GET /tenants/{tenantId}/runs/{runId}

**Description:** Get run details.

**Auth:** Required (tenant member)

**Response:**
```json
{
  "id": "run-uuid-123",
  "repoId": "gh-repo-987654",
  "type": "RESOLVE",
  "status": "completed",
  "prUrl": "https://github.com/my-org/my-repo/pull/42",
  "trigger": {
    "source": "webhook",
    "commandText": "/gwi resolve"
  },
  "steps": [
    {
      "id": "step-1",
      "agent": "triage",
      "status": "completed",
      "startedAt": "2025-12-15T10:30:01Z",
      "completedAt": "2025-12-15T10:30:05Z",
      "output": {
        "complexity": 3,
        "conflictCount": 3,
        "riskTags": ["merge-conflict", "file-rename"]
      }
    },
    {
      "id": "step-2",
      "agent": "coder",
      "status": "completed",
      "startedAt": "2025-12-15T10:30:06Z",
      "completedAt": "2025-12-15T10:30:40Z",
      "output": {
        "patchesGenerated": 3,
        "filesModified": ["src/app.ts", "src/utils.ts"]
      }
    },
    {
      "id": "step-3",
      "agent": "reviewer",
      "status": "completed",
      "startedAt": "2025-12-15T10:30:41Z",
      "completedAt": "2025-12-15T10:30:45Z",
      "output": {
        "summary": "Changes look good. No security concerns.",
        "commentUrl": "https://github.com/my-org/my-repo/pull/42#issuecomment-123"
      }
    }
  ],
  "result": {
    "success": true,
    "summary": "Resolved 3 conflicts in 2 files",
    "conflictsResolved": 3,
    "filesModified": ["src/app.ts", "src/utils.ts"],
    "prCommentUrl": "https://github.com/my-org/my-repo/pull/42#issuecomment-123"
  },
  "metrics": {
    "durationMs": 45000,
    "tokensUsed": {
      "triage": 1500,
      "code": 8000,
      "review": 2000,
      "total": 11500
    }
  },
  "createdAt": "2025-12-15T10:30:00Z",
  "completedAt": "2025-12-15T10:30:45Z"
}
```

---

##### POST /tenants/{tenantId}/runs/{runId}:cancel

**Description:** Cancel a running run.

**Auth:** Required (tenant admin)

**Response:**
```json
{
  "success": true,
  "run": {
    "id": "run-uuid-123",
    "status": "cancelled"
  }
}
```

---

### 4. Service Coordination

#### 4.1 gwi-api ↔ gwi-webhook

**GitHub App Installation Flow:**

1. User installs GWI GitHub App to org
2. GitHub sends `installation` webhook to `gwi-webhook`
3. `gwi-webhook` creates tenant in Firestore
4. User accesses gwi-api → sees new tenant

**Run Trigger from Webhook:**

1. GitHub sends PR event to `gwi-webhook`
2. `gwi-webhook` creates Run in Firestore (status: pending)
3. `gwi-webhook` calls `gwi-a2a-gateway` to start agents
4. UI polls `gwi-api` for run status

#### 4.2 gwi-api ↔ gwi-a2a-gateway

**Run Execution Flow:**

```
gwi-api POST /runs
    │
    ├── 1. Validate auth, resolve tenant
    ├── 2. Create Run in Firestore (status: pending)
    ├── 3. POST to gwi-a2a-gateway /a2a/run
    │       {
    │         "agent_role": "orchestrator",
    │         "prompt": "Execute RESOLVE run for PR...",
    │         "context": {
    │           "tenantId": "gh-org-12345",
    │           "runId": "run-uuid-456",
    │           "repoId": "gh-repo-987654",
    │           "prUrl": "..."
    │         },
    │         "correlation_id": "run-uuid-456",
    │         "env": "prod"
    │       }
    │
    └── 4. Return run ID to client (async execution)
```

**Status Updates:**

Agents update run status via callback or Firestore direct:
- Option A: Agents write to Firestore (requires SA permissions)
- Option B: Agents call `gwi-api` callback endpoint (preferred for isolation)

#### 4.3 CLI Integration

The CLI uses the same gwi-api endpoints:

```bash
# CLI authenticates via Firebase Auth (custom token flow)
gwi auth login

# CLI calls gwi-api
gwi triage https://github.com/org/repo/pull/123
  → POST /tenants/{defaultTenantId}/runs
    { "type": "TRIAGE", "prUrl": "..." }

# CLI polls for completion
gwi status run-uuid-123
  → GET /tenants/{defaultTenantId}/runs/{runId}
```

---

### 5. Error Handling

#### 5.1 Standard Error Response

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing required field: repoId",
    "details": {
      "field": "repoId",
      "reason": "required"
    }
  },
  "requestId": "req-abc-123"
}
```

#### 5.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHENTICATED` | 401 | Missing or invalid auth token |
| `PERMISSION_DENIED` | 403 | User lacks required role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `INVALID_REQUEST` | 400 | Malformed request |
| `CONFLICT` | 409 | Resource state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Dependency unavailable |

---

### 6. Rate Limiting

| Plan | Requests/min | Runs/hour |
|------|-------------|-----------|
| Free | 60 | 10 |
| Team | 300 | 50 |
| Pro | 600 | 100 |
| Enterprise | Unlimited | Unlimited |

Rate limit headers:
- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp of reset

---

## Consequences

### Positive

- Clean REST API with consistent patterns
- Clear auth model with Firebase Auth
- Tenant isolation enforced at API level
- CLI and UI share same backend
- A2A integration is explicit and traceable

### Negative

- More endpoints to maintain
- Firebase Auth adds dependency
- Async run execution requires polling or websockets

### Risks

| Risk | Mitigation |
|------|------------|
| Auth token leakage | Short-lived tokens, HTTPS only |
| Rate limit bypass | Per-user limits, not just per-tenant |
| Slow agent execution | Async model with status polling |
| API versioning | /v1 prefix, deprecation policy |

---

## Compliance Checklist

- [x] Authentication model defined (Firebase Auth)
- [x] Tenant resolution documented
- [x] All v0.1 endpoints specified
- [x] Request/response shapes defined
- [x] Service coordination documented
- [x] Error handling standardized
- [x] Rate limiting defined

---

## References

- 009-PM-PRDC: Git With Intent Cloud PRD
- 010-DR-ADRC: Multi-Tenant Data Model
- bobs-brain/102-AT-ARCH: Cloud Run Gateways
- Firebase Auth: https://firebase.google.com/docs/auth

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
