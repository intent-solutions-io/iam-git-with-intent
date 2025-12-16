# 025-DR-ADRC: GitHub App + Webhook + Tenant Linking

**Document ID:** 025-DR-ADRC
**Document Type:** Architecture Decision Record - Comprehensive
**Created:** 2025-12-16
**Status:** IMPLEMENTED
**Author:** Claude Code (Opus 4.5)

---

> **Filing Standard:** This document follows docs-filing v4
> - `025` = chronological sequence number
> - `DR` = Design/Reference category
> - `ADRC` = ADR Comprehensive type

---

## Context

Phase 8 implements GitHub App integration for the git-with-intent SaaS platform. This enables:
1. Automatic tenant creation when GitHub App is installed
2. Repository mapping to tenants
3. Webhook event routing through tenant context
4. Plan limit enforcement per tenant

## Decision

### 1. Installation Handler (`apps/github-webhook/src/handlers/installation.ts`)

Handles GitHub App lifecycle events:

- **`installation.created`**: Creates tenant in Firestore with default settings
- **`installation.deleted`**: Soft-deletes tenant (disables repos, sets installationId=0)
- **`installation_repositories`**: Adds/removes repos from tenant

**Tenant ID Convention:**
```
gh-{type}-{account_id}
// Examples:
// gh-organization-12345678
// gh-user-87654321
```

**Repo ID Convention:**
```
gh-repo-{github_repo_id}
// Example: gh-repo-987654321
```

### 2. Tenant Linker Service (`apps/github-webhook/src/services/tenant-linker.ts`)

Provides tenant resolution for webhook events:

```typescript
interface TenantContext {
  tenant: Tenant;
  repo?: TenantRepo;
  repoEnabled: boolean;
  withinLimits: boolean;
  limitReason?: string;
}
```

**Features:**
- Installation ID to Tenant ID cache
- Plan limit checking
- Effective settings resolution (repo overrides tenant defaults)
- Run creation with proper trigger metadata

### 3. Webhook Event Flow

```
GitHub Webhook
    │
    ▼
POST /webhook
    │
    ├── installation events ──► InstallationHandler
    │                               │
    │                               ▼
    │                          TenantStore (Firestore)
    │
    └── PR/issue events ──► TenantLinker.resolveTenant()
                                │
                                ├── Tenant not found ──► Skip
                                │
                                ├── Repo disabled ──► Skip
                                │
                                ├── Over plan limits ──► Skip
                                │
                                └── OK ──► Create Run + Trigger Workflow
```

### 4. Default Settings

**Tenant Settings:**
```typescript
{
  defaultRiskMode: 'comment_only',
  defaultTriageModel: 'gemini-1.5-flash',
  defaultCodeModel: 'gemini-1.5-pro',
  complexityThreshold: 3,
  autoRunOnConflict: true,
  autoRunOnPrOpen: false,
}
```

**Plan Limits (Free Tier):**
```typescript
{
  runsPerMonth: 100,
  reposMax: 5,
  membersMax: 3,
}
```

**Repo Settings:**
```typescript
{
  autoTriage: true,
  autoReview: false,
  autoResolve: false,
}
```

## Consequences

### Positive

1. **Automatic onboarding**: Installing the GitHub App creates all necessary Firestore documents
2. **Multi-tenant isolation**: Each webhook event is scoped to its tenant
3. **Plan enforcement**: Limits are checked before creating runs
4. **Soft deletion**: Uninstall preserves run history for auditing

### Negative

1. **Cache dependency**: TenantLinker uses in-memory cache; requires installation events to populate
2. **No installationId index**: Currently relies on conventions; production needs Firestore index

### Risks

1. **Cache cold start**: First webhook after restart may fail if installation event wasn't processed
2. **Rate limiting**: High-volume tenants could hit plan limits quickly

## Implementation Files

| File | Purpose |
|------|---------|
| `apps/github-webhook/src/handlers/installation.ts` | GitHub App installation handlers |
| `apps/github-webhook/src/services/tenant-linker.ts` | Tenant resolution and run creation |
| `apps/github-webhook/src/index.ts` | Updated webhook router with tenant context |
| `apps/github-webhook/package.json` | Added @gwi/core dependency |

## Related Documents

- 022-DR-ADRC: Firestore Runtime Stores
- 018-DR-ADRC: gwi-api and Gateway Skeleton
- 014-DR-ADRC: Agent Hook System Policy

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
