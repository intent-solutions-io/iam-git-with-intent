# 121-AA-AUDT: Architecture, Security & Scale Audit

| Field | Value |
|-------|-------|
| **Document ID** | 121-AA-AUDT |
| **Title** | Architecture, Security & Scale Audit |
| **Date** | 2026-02-11 |
| **Auditor** | Claude Opus 4.6 (multi-agent) |
| **Scope** | Full monorepo: apps/, packages/, infra/, .github/ |
| **Classification** | Internal / Confidential |

---

## Executive Summary

This audit examined the Git With Intent (GWI) monorepo across four domains: **security/AuthN/AuthZ**, **scale/reliability**, **infrastructure/CI/supply chain**, and **approval gating/audit trail**. The codebase demonstrates strong architectural foundations -- Firestore security rules with RBAC, WIF-based CI/CD, comprehensive monitoring, and a well-designed idempotency system. However, **critical gaps exist in the execution path**: the autopilot executor bypasses the hook runner entirely, Firebase Auth token verification is not implemented, and the sandbox package is not wired into the primary code generation pipeline.

### Severity Distribution (Deduplicated)

| Severity | Count | Stop-Ship? |
|----------|-------|------------|
| **CRITICAL** | 5 | Yes |
| **HIGH** | 11 | Yes (security-relevant) |
| **MEDIUM** | 10 | No (pre-GA) |
| **LOW** | 4 | No |
| **Total** | 30 | |

### Stop-Ship Findings (CRITICAL)

| ID | Finding | Domain |
|----|---------|--------|
| S-01 | Firebase Auth token verification not implemented (API returns 401 for all real users) | Security |
| S-02 | `DEPLOYMENT_ENV` defaults to `'dev'` -- debug header bypass active unless explicitly set | Security |
| S-03 | Gateway A2A endpoints have zero authentication | Security |
| S-04 | AutopilotExecutor bypasses hook runner entirely (no risk enforcement, no audit trail, no approval gate before commit/push) | Approval/Safety |
| S-05 | Sandbox package not used by critical path -- LLM-generated code has full host filesystem access | Safety |

---

## Domain 1: Security (AuthN, AuthZ, Tenant Isolation)

### S-01: Firebase Auth Token Verification Not Implemented [CRITICAL]

**File**: `apps/api/src/index.ts:434-447`
**OWASP**: A07:2021 -- Identification and Authentication Failures

The authentication middleware has Firebase Auth token verification **commented out** with a TODO. In production, the API returns 401 for all authenticated requests unless callers use the debug header bypass.

```typescript
// SECURITY: Firebase Auth token verification needed (tracked in git-with-intent-scod)
// const authHeader = req.headers.authorization;
// ...
return res.status(401).json({
  error: 'Authentication required',
  hint: 'Set X-Debug-User header for development',
});
```

### S-02: Debug Authentication Header Bypass via Default Environment [CRITICAL]

**File**: `apps/api/src/index.ts:421-431, 623`
**OWASP**: A07:2021

The `X-Debug-User` header is accepted when `isDevEnvironment()` returns true. The `config.env` is sourced from `process.env.DEPLOYMENT_ENV || 'dev'`. If `DEPLOYMENT_ENV` is not explicitly set in production, it defaults to `'dev'`, enabling the debug header bypass. An attacker could send `X-Debug-User: any-id` and `X-Debug-Role: owner` to gain OWNER-level access.

### S-03: Gateway A2A Endpoints Have No Authentication [CRITICAL]

**File**: `apps/gateway/src/index.ts:321-549`
**OWASP**: A01:2021 -- Broken Access Control

Core endpoints have zero authentication middleware:
- `POST /a2a/foreman` -- starts workflow runs
- `POST /a2a/:agent` -- routes to any agent
- `POST /api/workflows` -- starts workflows

The `tenantId` is taken directly from the request body and trusted. Any unauthenticated caller who can reach the gateway can start workflow runs for any tenant.

### S-06: Worker Service Has No Request Authentication [HIGH]

**File**: `apps/worker/src/index.ts:139-240`
**OWASP**: A01:2021

The worker exposes `/push`, `/stats`, `/process`, and `/tasks/*` without authentication. The cleanup endpoint uses User-Agent string checking (`Google-Cloud-Scheduler`) which is trivially spoofable.

### S-07: Gateway Marketplace Publisher API Key Validation Stubbed [HIGH]

**File**: `apps/gateway/src/marketplace-routes.ts:241-304`

In dev environments, any well-formed `gwi_pub_` API key is accepted. In production, the endpoint rejects all keys (secure but non-functional).

### S-08: SPIFFE IDs Are Decorative, Not Verified [HIGH]

**File**: `packages/agents/src/base/agent.ts:30-32`

SPIFFE IDs are constructed by string concatenation and used as identifiers only. No SVID certificate verification, no mTLS enforcement. Any service can claim to be any agent by setting the `from` field in A2A messages.

### S-09: GitHub Webhook Replay Protection Missing [HIGH]

**File**: `apps/github-webhook/src/index.ts:56-73`

When `GITHUB_WEBHOOK_SECRET` is set, verification uses `timingSafeEqual` (correct). But there is no timestamp-based replay protection. An intercepted valid webhook payload can be replayed indefinitely.

### S-10: Hardcoded Beta Invite Codes in Source Code [MEDIUM]

**File**: `packages/core/src/security/index.ts:515`

Beta invite codes (`GWIBETA2025`, `EARLYBIRD`, `FOUNDER50`) are hardcoded and committed. Anyone with source access can use them.

### S-11: Service Account Header Bypass [MEDIUM]

**File**: `apps/api/src/index.ts:411-419`

In non-production environments, `X-Service-Account: any-value` grants full service account (OWNER-level) privileges. Combined with S-02 (`DEPLOYMENT_ENV` defaulting to `dev`), this provides an additional escalation path.

### S-12: `listOrphanedRuns` and `listInFlightRunsByOwner` Bypass Tenant Scoping [MEDIUM]

**File**: `packages/core/src/storage/firestore-tenant.ts:682-707`

Both methods query across all tenants without a `tenantId` filter. Currently used only by recovery processes internally.

### S-13: Rate Limiting is In-Memory Only [MEDIUM]

**Files**: `apps/api/src/index.ts:268`, `apps/gateway/src/marketplace-routes.ts`

Token bucket rate limiting exists but uses in-memory state. Not distributed across Cloud Run instances. Gateway core A2A endpoints and worker have no rate limiting at all.

### Positive Finding: Firestore Security Rules [STRENGTH]

**File**: `firestore.rules` (342 lines)

Comprehensive server-side rules with membership-based access control, role hierarchy enforcement, immutable audit events (`update: false`, `delete: false` on `gwi_audit_events`), and default-deny. This is the strongest security layer in the system.

### Positive Finding: Tenant Isolation in Application Code [STRENGTH]

**File**: `packages/core/src/storage/firestore-tenant.ts`

The `FirestoreTenantStore` consistently applies `tenantId` filters on all user-facing queries. Cross-tenant `getRun()` returns null on mismatch. Negative tests exist at `packages/core/src/storage/__tests__/tenant-isolation-negative.test.ts`.

---

## Domain 2: Scale & Reliability

### R-01: Checkpoints Not Created During Execution [HIGH]

**File**: `packages/engine/src/run/autopilot-executor.ts`

The `AutopilotExecutor` does **not** call `createCheckpoint()` at any point. Search for `createCheckpoint` in autopilot-executor.ts returns zero results. If the worker crashes during execution, there is no checkpoint to resume from.

### R-02: Worker Does Not Initialize Recovery on Startup [HIGH]

**File**: `apps/worker/src/index.ts`

No call to `RecoveryOrchestrator.recoverOrphanedRuns()` in the startup sequence. Orphaned runs from crashed instances remain stuck in `running` state until manual intervention.

### R-03: Run Document Steps Array is Unbounded [HIGH]

**File**: `packages/core/src/storage/firestore-tenant.ts:110-122`

Steps are stored as an unbounded array in the run document. Firestore limit is 1MB. At ~500 bytes/step, complex runs with 100+ steps approach the limit. A steps subcollection already exists in the schema but is not used consistently.

### R-04: In-Memory Checkpoint Store Used by Default [MEDIUM]

**File**: `packages/engine/src/run/recovery.ts:151-157`

The `RecoveryOrchestrator` defaults to `InMemoryCheckpointStore` unless explicitly wired. Cloud Run instance restart = lost checkpoint data.

### R-05: No Circuit Breaker for LLM Calls [MEDIUM]

Searching for "circuit breaker" in `packages/` returns no code matches, only documentation references. If AI provider APIs go down, agents retry indefinitely (or until timeout), blocking worker threads.

### R-06: No Backpressure Between Webhook Receipt and Execution [MEDIUM]

**File**: `apps/worker/src/index.ts:139-196`

The push endpoint processes jobs synchronously. 100 webhooks arriving simultaneously = 100 concurrent `processJob()` calls. No queueing or throttling exists.

### R-07: Single Document Write Contention on Tenant Run Counter [MEDIUM]

**File**: `packages/core/src/storage/firestore-tenant.ts`

Every run creation updates the tenant document to increment `runsThisMonth`. High-traffic tenants create write contention on a single document.

### R-08: Pub/Sub Ack Deadline vs Job Timeout Mismatch [MEDIUM]

**File**: `apps/worker/src/index.ts:46`

Pub/Sub ack deadline (60s) < job timeout (5 min). Long-running jobs have their ack deadline expire before completion, causing re-delivery.

### R-09: Checkpoint Artifacts Truncate Instead of Offloading [LOW]

**File**: `packages/core/src/reliability/firestore-checkpoint.ts:42,227-251`

Artifacts exceeding 1MB are truncated (data loss). Should store large artifacts in Cloud Storage and reference by URL.

### R-10: DLQ Replay is Manual [LOW]

**File**: `000-docs/029-OD-RUNB-pubsub-dlq-management.md:124-142`

Requires manual `gcloud` commands. No automated DLQ replay endpoint.

### Positive Finding: Idempotency System [STRENGTH]

**File**: `packages/engine/src/idempotency/store.ts:260-361`

Firestore transaction-based atomic check-and-set. SHA-256 payload hashing. Lock timeout (5 min) with max attempts (5). No duplicate runs from replayed webhooks.

### Positive Finding: State Machine [STRENGTH]

**File**: `packages/engine/src/run/state-machine.ts`

Well-defined state transitions with validation. Terminal states correctly enforced. `InvalidTransitionError` on violations.

### Positive Finding: Heartbeat System [STRENGTH]

**File**: `packages/engine/src/run/heartbeat.ts`

Updates `lastHeartbeatAt` every 30 seconds. Persists `ownerId` for orphan detection. Unique owner IDs per instance.

---

## Domain 3: Infrastructure, CI/CD & Supply Chain

### I-01: GitHub Actions Pinned to Tags, Not SHAs [HIGH]

**Files**: All `.github/workflows/*.yml`

All third-party actions use mutable tag references (`@v4`), not immutable SHA digests. Vulnerable to tag mutation attacks. Affected: `actions/checkout@v4`, `google-github-actions/auth@v2`, `hashicorp/setup-terraform@v3`, `softprops/action-gh-release@v1`, and 6+ more.

### I-02: Disaster Recovery Runbook Missing [HIGH]

The file `000-docs/112-DR-RUNB-disaster-recovery-runbook.md` does **not exist**. No documented procedure for region failure, Firestore data loss, state file corruption, or secret compromise. No RTO/RPO targets defined.

### I-03: No Firestore Backup/Export Schedule [HIGH]

No Terraform-managed Firestore export/backup schedule. The primary production database (multi-tenant) has no automated backup. A data corruption or accidental collection deletion has no recovery path.

### I-04: axios HIGH CVE (Fix Available) [HIGH]

`npm audit`: axios <=1.13.4 (`GHSA-43fc-jf86-j433`), DoS via `__proto__` key in `mergeConfig`. CVSS 7.5. Fix available via version bump.

### I-05: auto-fix.yml Overly Broad Permissions [MEDIUM]

**File**: `.github/workflows/auto-fix.yml`

Has `contents: write`, `issues: write`, `pull-requests: write`, `id-token: write` and injects AI provider API keys directly as environment variables. Large blast radius.

### I-06: VPC Connector Defined but Disabled [MEDIUM]

**File**: `infra/network.tf`, `infra/variables.tf:146-150`

VPC, subnet, NAT, and firewall rules are all defined but gated behind `enable_vpc_connector = false`. Cloud Run services route over public internet.

### I-07: Budget Alerts Defined but Disabled [MEDIUM]

**File**: `infra/monitoring.tf`

Budget alert resource fully defined with tiered thresholds ($50-$120) but `enable_budget_alerts` defaults to `false`.

### I-08: No Dependabot/Renovate Configured [MEDIUM]

No `.github/dependabot.yml` or Renovate config found. Dependency updates are manual.

### I-09: No SBOM or Container Image Signing [MEDIUM]

No Software Bill of Materials generated during build or release. Docker images pushed to Artifact Registry are not signed. No cosign/Sigstore integration.

### I-10: Single-Region Deployment [LOW]

All resources deployed to `us-central1`. No multi-region configuration, failover routing, or global load balancer.

### I-11: No PagerDuty/On-Call Integration [LOW]

**File**: `infra/monitoring.tf`

Alert notification is email-only. No PagerDuty, Opsgenie, or Slack integration.

### Positive Finding: OpenTofu IaC [STRENGTH]

17 `.tf` files covering Cloud Run, IAM, networking, monitoring, Pub/Sub, storage, and scheduling. GCS remote state. Full environment separation (dev/staging/prod/local).

### Positive Finding: WIF Authentication [STRENGTH]

All CI/CD workflows use Workload Identity Federation. No long-lived service account keys anywhere in the pipeline.

### Positive Finding: Monitoring [STRENGTH]

**File**: `infra/monitoring.tf` (1616 lines)

12+ alert policies, 4 uptime checks, 6+ log-based metrics, idempotency monitoring dashboard. Comprehensive for a pre-GA product.

---

## Domain 4: Approval Gating, Audit Trail & LLM Safety

### S-04: AutopilotExecutor Bypasses Hook Runner Entirely [CRITICAL]

**File**: `packages/engine/src/run/autopilot-executor.ts`

The `AutopilotExecutor.execute()` directly instantiates agents, generates code, writes files, commits, pushes, and creates PRs **without ever calling the hook runner**. `AgentHookRunner` is not imported or referenced. This means:
- Risk enforcement hook is never invoked
- Decision trace hook is never invoked
- Code quality hook (newly added) is never invoked
- No audit trail is created for autopilot runs
- No approval gate is checked before commit/push/PR creation

### S-05: Sandbox Package Not Used by Critical Path [CRITICAL]

**File**: `packages/sandbox/` vs `packages/engine/src/run/autopilot-executor.ts`

The sandbox package provides Docker containers, KVM VMs, Deno isolates, and git worktree isolation. However, the `AutopilotExecutor` does not import or use any sandbox package. It uses `createIsolatedWorkspace` from `@gwi/core` which is a different, less secure mechanism. Generated code has full host filesystem access.

### A-01: No File Path Sanitization in Coder Agent Output [HIGH]

**File**: `packages/agents/src/coder/index.ts:492-531`

The `parseResponse` method extracts file paths from LLM-generated JSON (`path: f.path || ''`). No validation that paths are safe. An LLM could output `../../../etc/crontab` (path traversal) or paths with shell metacharacters. The `runId` is sanitized in `workspace.ts:76`, but individual file paths from LLM output are not.

### A-02: Autopilot Writes LLM-Controlled Paths to Disk [HIGH]

**File**: `packages/engine/src/run/autopilot-executor.ts:498-507`

The `applyPatches` method calls `workspaceManager.writeFile(file.path, file.content)` where `file.path` is the raw, unsanitized path from the LLM. An LLM-generated path like `../../.git/hooks/pre-commit` could overwrite git hooks.

### A-03: Shell Injection in Worktree Manager [HIGH]

**File**: `packages/sandbox/src/worktree-manager.ts`

- Line 141: `git worktree add -b "${workingBranch}" "${worktreePath}" "${sourceBranch}"` -- shell metacharacters not validated.
- Line 223: `git commit -m "${message.replace(/"/g, '\\"')}"` -- only escapes double quotes. Backticks, `$()` not escaped.
- Lines 255-260: `targetBranch` interpolated directly into shell commands.

### A-04: Two Unconnected Approval Systems [HIGH]

The codebase contains two completely independent approval systems:

1. **Engine Approval Gate** (`packages/engine/src/approval/approval-gate.ts`): Polling-based, in-memory store, **no SHA256 hash binding**, no cryptographic signing.
2. **Phase 25 CLI Signed Approvals** (`apps/cli/src/commands/approval.ts`): Ed25519 signatures, `intentHash`/`patchHash` computation. Proper canonical JSON + signature verification.

These systems are not connected. The autopilot executor calls neither before committing.

### A-05: Audit CLI Verifies Empty In-Memory Store [HIGH]

**File**: `apps/cli/src/commands/audit.ts:220-221`

The `gwi audit verify` command creates `createInMemoryAuditLogStore()` -- it verifies an **empty** store every time, never connecting to the production Firestore backend. Verification theater.

### A-06: Risk Enforcement is Post-Hoc [HIGH]

**File**: `packages/engine/src/hooks/risk-enforcement-hook.ts:166-178`

The `onAfterStep` method checks operation-level risk tier **after the step has already completed**: "Log but don't throw - step already completed." If a CODER agent performs a `merge_pr` operation (R4) in an R2 environment, the operation succeeds and the violation is only logged.

### A-07: Approval Replay Vulnerability [MEDIUM]

**File**: `apps/cli/src/commands/approval.ts:349, 452`

When no plan exists, `intentHash` defaults to `'cli-approval-no-plan'` (hardcoded). Denial uses `intentHash: 'cli-denial'` (also static). These can be replayed across runs.

### A-08: Risk Tier Mutable at Runtime [MEDIUM]

**File**: `packages/engine/src/hooks/risk-enforcement-hook.ts:229`

`setMaxRiskTier(tier: RiskTier)` is public. Any code with a reference can change enforcement level with no authorization check or audit log.

### A-09: Forensics Gate is Structural Only [MEDIUM]

**File**: `scripts/arv/forensics-gate.ts`

The 317-line forensics ARV gate only checks whether files exist and contain certain string patterns (e.g., `content.includes('class RedactionService')`). It does not run forensics code, validate schemas against data, or test the hash chain.

### Positive Finding: Crypto Audit Chain [STRENGTH]

**File**: `packages/core/src/policy/crypto-chain.ts`

SHA-256 hash chain with `prevHash`/`contentHash` linking. Merkle tree for batch verification. Proper chain verification with sequence, content hash, and chain link validation.

### Positive Finding: Firestore Immutable Audit Events [STRENGTH]

**File**: `firestore.rules:246-253`

`gwi_audit_events`: `allow update, delete: if false` -- immutable at the database level. Even service accounts cannot modify or delete audit events.

---

## Consolidated Findings Table

| ID | Severity | Domain | Finding | File |
|----|----------|--------|---------|------|
| S-01 | CRITICAL | Security | Firebase Auth not implemented | `apps/api/src/index.ts:434` |
| S-02 | CRITICAL | Security | DEPLOYMENT_ENV defaults to dev | `apps/api/src/index.ts:623` |
| S-03 | CRITICAL | Security | Gateway A2A no auth | `apps/gateway/src/index.ts:321` |
| S-04 | CRITICAL | Safety | Autopilot bypasses hook runner | `packages/engine/src/run/autopilot-executor.ts` |
| S-05 | CRITICAL | Safety | Sandbox not used by critical path | `packages/sandbox/` vs autopilot |
| S-06 | HIGH | Security | Worker no auth | `apps/worker/src/index.ts:139` |
| S-07 | HIGH | Security | Marketplace API key stubbed | `apps/gateway/src/marketplace-routes.ts:241` |
| S-08 | HIGH | Security | SPIFFE IDs decorative | `packages/agents/src/base/agent.ts:30` |
| S-09 | HIGH | Security | Webhook replay protection missing | `apps/github-webhook/src/index.ts:56` |
| R-01 | HIGH | Reliability | No checkpoints during execution | `autopilot-executor.ts` |
| R-02 | HIGH | Reliability | No recovery on worker startup | `apps/worker/src/index.ts` |
| R-03 | HIGH | Reliability | Run steps array unbounded | `firestore-tenant.ts:110` |
| I-01 | HIGH | Supply Chain | Actions pinned to tags not SHAs | `.github/workflows/*.yml` |
| I-02 | HIGH | DR | DR runbook missing | `000-docs/112-*` does not exist |
| I-03 | HIGH | DR | No Firestore backup schedule | `infra/` |
| I-04 | HIGH | Supply Chain | axios HIGH CVE | `package-lock.json` |
| A-01 | HIGH | Safety | No LLM output path sanitization | `coder/index.ts:492` |
| A-02 | HIGH | Safety | Unsafe path writes from LLM | `autopilot-executor.ts:498` |
| A-03 | HIGH | Safety | Shell injection in worktree mgr | `worktree-manager.ts:141,223` |
| A-04 | HIGH | Approval | Two unconnected approval systems | `approval-gate.ts` vs `approval.ts` |
| A-05 | HIGH | Audit | Audit CLI verifies empty store | `audit.ts:220` |
| A-06 | HIGH | Safety | Risk enforcement post-hoc only | `risk-enforcement-hook.ts:166` |
| S-10 | MEDIUM | Security | Hardcoded beta invite codes | `security/index.ts:515` |
| S-11 | MEDIUM | Security | Service account header bypass | `apps/api/src/index.ts:411` |
| S-12 | MEDIUM | Security | Cross-tenant recovery queries | `firestore-tenant.ts:682` |
| S-13 | MEDIUM | Security | Rate limiting in-memory only | `apps/api/src/index.ts:268` |
| R-04 | MEDIUM | Reliability | In-memory checkpoint store default | `recovery.ts:151` |
| R-05 | MEDIUM | Reliability | No circuit breaker for LLM calls | `packages/agents/` |
| R-06 | MEDIUM | Reliability | No backpressure webhook-to-exec | `apps/worker/src/index.ts:139` |
| R-07 | MEDIUM | Reliability | Tenant run counter contention | `firestore-tenant.ts` |
| R-08 | MEDIUM | Reliability | Pub/Sub ack vs job timeout mismatch | `apps/worker/src/index.ts:46` |
| I-05 | MEDIUM | CI/CD | auto-fix.yml overly broad perms | `.github/workflows/auto-fix.yml` |
| I-06 | MEDIUM | Infra | VPC connector disabled | `infra/network.tf` |
| I-07 | MEDIUM | Infra | Budget alerts disabled | `infra/monitoring.tf` |
| I-08 | MEDIUM | Supply Chain | No Dependabot/Renovate | `.github/` |
| I-09 | MEDIUM | Supply Chain | No SBOM or image signing | `.github/workflows/` |
| A-07 | MEDIUM | Approval | Approval replay vulnerability | `approval.ts:349` |
| A-08 | MEDIUM | Safety | Risk tier mutable at runtime | `risk-enforcement-hook.ts:229` |
| A-09 | MEDIUM | Audit | Forensics gate structural only | `scripts/arv/forensics-gate.ts` |
| R-09 | LOW | Reliability | Checkpoint artifacts truncate | `firestore-checkpoint.ts:42` |
| R-10 | LOW | Reliability | DLQ replay manual | `000-docs/029-*` |
| I-10 | LOW | Infra | Single-region deployment | `infra/` |
| I-11 | LOW | Observability | No PagerDuty/on-call | `infra/monitoring.tf` |

---

## Remediation Plan

### Phase 1: Stop-Ship Fixes (Before Any External User)

| Priority | Finding | PR Scope | Effort |
|----------|---------|----------|--------|
| P0-1 | S-02: Default DEPLOYMENT_ENV to 'production' | 1 line change + env verification | 1 hour |
| P0-2 | S-04: Wire hook runner into AutopilotExecutor | Import runner, call afterStep/runStart/runEnd at each phase | 1 day |
| P0-3 | A-01/A-02: Sanitize LLM-generated file paths | Add path validation in parseResponse + applyPatches | 4 hours |
| P0-4 | A-03: Fix shell injection in worktree manager | Replace `execAsync` string interpolation with `execFile` argument arrays | 4 hours |
| P0-5 | S-01: Implement Firebase Auth token verification | Add `firebase-admin` verifyIdToken in auth middleware | 1 day |

### Phase 2: Pre-GA Security Hardening

| Priority | Finding | PR Scope | Effort |
|----------|---------|----------|--------|
| P1-1 | S-03: Add auth to gateway A2A endpoints | Cloud Run IAM OIDC token or bearer token verification | 1 day |
| P1-2 | S-06: Add auth to worker endpoints | OIDC token verification for Pub/Sub push, Cloud Scheduler | 4 hours |
| P1-3 | I-01: Pin GitHub Actions to SHA digests | Use `pin-github-action` tool across all workflows | 2 hours |
| P1-4 | I-04: Upgrade axios | `npm audit fix` or manual bump | 30 min |
| P1-5 | R-01/R-02: Wire checkpoints + recovery | Add checkpoint calls in executor, recovery in worker startup | 2 days |
| P1-6 | A-04: Unify approval systems | Connect Phase 25 signed approvals to engine gate | 2 days |
| P1-7 | A-05: Fix audit CLI to use real store | Connect to Firestore backend in verify/health commands | 4 hours |
| P1-8 | I-02/I-03: DR runbook + Firestore backups | Write runbook, add Cloud Scheduler Firestore export in Tofu | 2 days |

### Phase 3: Scale & Operational Maturity

| Priority | Finding | PR Scope | Effort |
|----------|---------|----------|--------|
| P2-1 | S-05: Wire sandbox into autopilot | Route code execution through sandbox providers | 3 days |
| P2-2 | R-03: Migrate steps to subcollection | Use existing `gwi_runs/{runId}/steps/{stepId}` schema | 2 days |
| P2-3 | R-05: Implement circuit breaker for LLM | Add circuit breaker pattern to model selector | 1 day |
| P2-4 | S-13: Distributed rate limiting | Replace in-memory token bucket with Redis/Firestore-backed | 2 days |
| P2-5 | I-06/I-07: Enable VPC connector + budget alerts | Set `true` in prod tfvars, apply | 2 hours |
| P2-6 | A-06: Move risk enforcement pre-execution | Check risk tier before step execution, not after | 1 day |
| P2-7 | I-08/I-09: Add Dependabot + SBOM generation | Create dependabot.yml, add SBOM to Docker build | 4 hours |

---

## Implementation Jumpstart: First 3 PRs

### PR 1: `fix(security): enforce production defaults and sanitize LLM paths`

**Findings addressed**: S-02, A-01, A-02, A-03, S-10

**Files to modify**:
1. `apps/api/src/index.ts` -- Change `process.env.DEPLOYMENT_ENV || 'dev'` to `process.env.DEPLOYMENT_ENV || 'production'`
2. `packages/agents/src/coder/index.ts` -- Add path sanitization in `parseResponse()`:
   ```typescript
   // After extracting file paths from LLM JSON
   const sanitizedPath = file.path
     .replace(/\.\./g, '')           // Remove path traversal
     .replace(/^\//, '')             // Remove absolute path prefix
     .replace(/[^\w\-./]/g, '_');    // Sanitize special chars
   if (sanitizedPath.includes('..') || path.isAbsolute(sanitizedPath)) {
     throw new Error(`Unsafe file path from LLM: ${file.path}`);
   }
   ```
3. `packages/engine/src/run/autopilot-executor.ts` -- Add same path validation before `writeFile()`
4. `packages/sandbox/src/worktree-manager.ts` -- Replace all `execAsync(\`git ...\`)` with `execFile('git', [...args])` using argument arrays
5. `packages/core/src/security/index.ts` -- Move beta invite codes to environment variable or Secret Manager

**Tests**: Add path traversal test cases to coder and autopilot test files. Add shell injection test to worktree manager.

### PR 2: `feat(engine): wire hook runner into autopilot executor`

**Findings addressed**: S-04, A-06, R-01

**Files to modify**:
1. `packages/engine/src/run/autopilot-executor.ts`:
   - Import `AgentHookRunner`, `buildDefaultHookRunner`
   - Initialize hook runner in constructor or `execute()`
   - Call `runner.runStart(ctx)` at beginning of execute
   - Call `runner.afterStep(ctx)` after each phase (triage, plan, code, apply, test, PR)
   - Call `runner.runEnd(ctx)` at completion/failure
   - Add checkpoint creation after each successful phase
   - Pass generated files in `ctx.metadata.generatedFiles` so CodeQualityHook fires
2. `packages/engine/src/hooks/risk-enforcement-hook.ts`:
   - Move operation-level risk check from `onAfterStep` to a new `onBeforeStep` method (or check in `onRunStart` with operation whitelist)

**Tests**: Add integration test verifying hook runner is called during autopilot execution.

### PR 3: `fix(auth): implement Firebase Auth token verification`

**Findings addressed**: S-01, S-03, S-06

**Files to modify**:
1. `apps/api/src/index.ts`:
   - Uncomment and implement Firebase Auth `verifyIdToken()` in auth middleware
   - Remove debug header bypass when `DEPLOYMENT_ENV !== 'dev'` (keep for actual local dev only)
   - Remove service account header bypass in production
2. `apps/gateway/src/index.ts`:
   - Add auth middleware to A2A endpoints (Cloud Run IAM OIDC or bearer token)
3. `apps/worker/src/index.ts`:
   - Add Pub/Sub push authentication (verify OIDC token from Pub/Sub)
   - Add Cloud Scheduler OIDC verification for `/tasks/*` endpoints
4. Add `firebase-admin` dependency if not present

**Tests**: Add auth middleware tests for valid/invalid/missing tokens.

---

## Strengths Worth Preserving

| Area | Evidence |
|------|----------|
| **Firestore Rules** | 342-line RBAC with default-deny, immutable audit trail |
| **WIF CI/CD** | Zero long-lived credentials in any workflow |
| **IaC Coverage** | 17 .tf files, 4 environments, full resource coverage |
| **Monitoring** | 1616-line monitoring.tf with 12+ alert policies |
| **Idempotency** | Transaction-based atomic check-and-set with SHA-256 |
| **Tenant Isolation** | Application-layer + Firestore rules double enforcement |
| **Crypto Audit Chain** | SHA-256 hash chain with Merkle tree verification |
| **Agent Architecture** | Well-defined state machine, heartbeat, recovery design |
| **ARV Gates** | 19 pre-merge validation gates in CI |
| **Slop Detection** | 4-layer quality analysis for external PRs |

---

*Generated by multi-agent audit (Claude Opus 4.6 + Claude Sonnet 4.5). 4 parallel agents examining 50+ files across apps/, packages/, infra/, .github/.*
