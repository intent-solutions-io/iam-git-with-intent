# AUDIT_PACK.md

**Repository Forensic Audit Report**
**Generated:** 2026-01-26
**Auditor:** Claude Code (read-only forensic mode)
**Repo:** git-with-intent

---

# 0. Executive Summary

## What This Repo Is

| Attribute | Value |
|-----------|-------|
| **Name** | git-with-intent (gwi) |
| **Type** | Node.js/TypeScript Turbo Monorepo |
| **Purpose** | AI-powered CLI for PR automation: semantic merge conflict resolution, issue-to-code generation, complexity scoring, autopilot with approval gating |
| **Version** | 0.5.0 |
| **Build System** | Turbo (npm workspaces) |
| **Deploy Target** | Firebase Hosting (web), Cloud Run (services), Firestore (data) |
| **Infrastructure** | OpenTofu (Terraform-compatible) |

## Current Status Signals

| Signal | Status |
|--------|--------|
| Git State | CLEAN (no uncommitted changes) |
| Branch | `main` (tracking `origin/main`) |
| Last Commit | `f29670c` - `chore(release): prepare v0.5.0` |
| Tag | `v0.5.0` |
| Total Tracked Files | 977 |
| Git Objects | 5516 objects (27.71 MiB loose) |

## Top 10 Cleanup Opportunities

1. **Large package-lock.json** - 500KB tracked file; consider if this is necessary for repo
2. **000-docs/ tracking inconsistency** - Listed in `.gitignore` but 11 files are tracked (force-added)
3. **Generated SDK types** - `packages/sdk/src/generated/gateway-types.ts` (77KB) may not need tracking
4. **Large source files** - Several files >100KB (`apps/api/src/index.ts` at 134KB)
5. **Pre-built connector dist files** - `connectors/*/dist/` explicitly un-ignored; verify need
6. **Multiple workflow files** - 18 GitHub Actions workflows; some may be redundant
7. **ARV gate scripts** - 21 gate scripts in `scripts/arv/`; audit for overlap
8. **Test fixtures** - Golden/fixture files may accumulate; check freshness
9. **Beads runtime** - `.beads/` at 16MB (gitignored, local only) - consider cleanup
10. **Node modules** - 873MB; standard but verify not accidentally tracked

---

# 1. Environment + Tooling Snapshot

```bash
# Commands run:
uname -a
node -v
npm -v
python3 --version
hugo version
git --version
which hugo
which python3
```

**Outputs:**

```
uname -a:
Linux team-server 6.8.0-90-generic #91-Ubuntu SMP PREEMPT_DYNAMIC Tue Nov 18 14:14:30 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux

node -v:
v22.21.0

npm -v:
10.9.4

python3 --version:
Python 3.12.3

hugo version:
hugo v0.152.2-6abdacad3f3fe944ea42177844469139e81feda6+extended linux/amd64 BuildDate=2025-10-24T15:31:49Z VendorInfo=snap:0.152.2

git --version:
git version 2.43.0

which hugo:
/snap/bin/hugo

which python3:
/usr/bin/python3
```

**Note:** Hugo is installed but this is NOT a Hugo site. This is a Node.js monorepo.

---

# 2. Git + Branch State

```bash
# Commands run:
git status -sb
git rev-parse --show-toplevel
git log -5 --oneline --decorate
git remote -v
git branch -vv
git ls-files | wc -l
git count-objects -vH
```

**Outputs:**

```
git status -sb:
## main...origin/main

git rev-parse --show-toplevel:
/home/jeremy/000-projects/git-with-intent

git log -5 --oneline --decorate:
f29670c (HEAD -> main, tag: v0.5.0, origin/main) chore(release): prepare v0.5.0
e7a9932 fix(core): make time_window policy test deterministic
f966d21 Merge pull request #43 from intent-solutions-io/feat/j4.1-reviewer-integration
e90e4b8 Merge pull request #42 from intent-solutions-io/feat/j3.4-gwi-gate-command
4d84c78 Merge pull request #41 from intent-solutions-io/feat/j1.4-architecture-adr

git remote -v:
origin	https://github.com/intent-solutions-io/iam-git-with-intent.git (fetch)
origin	https://github.com/intent-solutions-io/iam-git-with-intent.git (push)

git branch -vv:
+ beads-sync 7983db5 (/home/jeremy/000-projects/git-with-intent/.git/beads-worktrees/beads-sync) fix: correct Epic B task count (66 -> 69)
* main       f29670c [origin/main] chore(release): prepare v0.5.0

git ls-files | wc -l:
977

git count-objects -vH:
count: 5516
size: 27.71 MiB
in-pack: 0
packs: 0
size-pack: 0 bytes
prune-packable: 0
garbage: 0
size-garbage: 0 bytes
```

---

# 3. Repo Inventory

## File Type Distribution (Tracked Files)

| Type | Count |
|------|-------|
| TypeScript (*.ts) | 716 |
| JSON (*.json) | 68 |
| Markdown (*.md) | 49 |
| YAML (*.yaml, *.yml) | 17 |
| Shell (*.sh) | 9 |

## Files by Top-Level Directory

```
664 packages/
157 apps/
 39 scripts/
 26 test/
 22 infra/
 18 .github/
 11 000-docs/
  4 connectors/
  3 docs/
  2 examples/
  2 db/
  2 .claude/
  1 schemas/
  1 data/
```

## Files by Subdirectory (depth 2)

```
440 packages/core
 79 packages/connectors
 57 packages/engine
 57 apps/web
 38 packages/integrations
 36 apps/cli
 21 scripts/arv
 18 packages/sdk
 18 apps/webhook-receiver
 18 .github/workflows
 17 packages/forecasting
 15 packages/agents
 13 test/goldens
 12 apps/worker
 11 apps/github-webhook
 10 apps/api
  9 apps/gateway
  8 test/e2e
  5 test/contracts
```

## Largest Tracked Files (Top 25)

```
499,796  package-lock.json
133,887  apps/api/src/index.ts
 76,704  packages/sdk/src/generated/gateway-types.ts
 72,848  packages/core/src/openapi/spec.ts
 65,170  apps/gateway/openapi.yaml
 57,346  apps/cli/src/index.ts
 47,551  infra/monitoring.tf
 46,679  packages/core/src/policy/report-templates.ts
 45,114  test/e2e/marketplace.e2e.test.ts
 43,178  packages/core/src/prediction-connectors/index.ts
 41,183  packages/core/src/policy/report-distribution.ts
 40,285  000-docs/008-DR-EPIC-epic-b-connector-framework.md
 39,765  packages/core/src/storage/interfaces.ts
 38,645  packages/core/src/policy/__tests__/report-distribution.test.ts
 38,402  packages/core/src/security/index.ts
 36,935  packages/core/src/policy/report-storage.ts
 36,254  packages/agents/src/reviewer/index.ts
 36,049  packages/connectors/docs/creating-connectors.md
 35,265  packages/core/src/admin-api/index.ts
 35,127  packages/core/src/forecasting/index.ts
 35,047  packages/core/src/policy/__tests__/schema-engine.test.ts
 34,891  apps/github-webhook/src/index.ts
 34,588  apps/web/src/pages/ViolationDetail.tsx
 34,331  packages/core/src/policy/__tests__/report-templates.test.ts
 33,804  packages/core/src/marketplace/storage.ts
```

## Generated/Derived Directory Status

| Directory | Gitignored? | Tracked Files | Notes |
|-----------|-------------|---------------|-------|
| `node_modules/` | Yes | 0 | 873MB local |
| `dist/` | Yes (except connectors) | 0 | Build outputs |
| `.gwi/` | Yes | 0 | 172KB local runtime |
| `.beads/` | Yes | 0 | 16MB local task tracking |
| `coverage/` | Yes | 0 | Test coverage |
| `.turbo/` | Yes | 0 | Turbo cache |
| `000-docs/` | Listed in .gitignore | 11 | Force-added |
| `connectors/*/dist/` | No (exception) | 4 | Pre-built connectors |

---

# 4. Build Configuration

## Package.json (Root)

```json
{
  "name": "git-with-intent",
  "version": "0.5.0",
  "private": true,
  "engines": { "node": ">=20.0.0" },
  "packageManager": "npm@10.2.0",
  "workspaces": ["apps/*", "packages/*"]
}
```

## Key Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Build all packages (turbo) |
| `npm run test` | Run all tests (turbo) |
| `npm run typecheck` | Type check (turbo) |
| `npm run arv` | Agent Readiness Verification (pre-commit) |
| `npm run arv:lint` | Forbidden patterns check |
| `npm run arv:contracts` | Zod schema validation |
| `npm run arv:goldens` | Deterministic output fixtures |
| `npm run arv:smoke` | Boot test |

## Turbo Configuration

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["build"], "outputs": ["coverage/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] }
  }
}
```

## Firebase Configuration

```json
{
  "hosting": {
    "site": "git-with-intent",
    "public": "apps/web/dist"
  }
}
```

## Dockerfiles

```
apps/api/Dockerfile
apps/cli/Dockerfile
apps/gateway/Dockerfile
apps/github-webhook/Dockerfile
apps/webhook-receiver/Dockerfile
apps/worker/Dockerfile
```

---

# 5. Documentation Structure

## Root-Level Markdown Files

| File | Size | Purpose |
|------|------|---------|
| `README.md` | 14KB | Main documentation |
| `CHANGELOG.md` | 2.5KB | Version history |
| `CLAUDE.md` | 5.1KB | Claude Code instructions |
| `AGENTS.md` | 492B | Agent descriptions |
| `C3_VERIFICATION_REPORT.md` | 6.9KB | Verification report |

## 000-docs/ Directory (11 tracked files)

| File | Size | Type |
|------|------|------|
| `008-DR-EPIC-epic-b-connector-framework.md` | 40KB | Epic planning |
| `021-DR-ADRC-local-dev-review-architecture-decision.md` | 20KB | ADR |
| `005-DR-PERF-auto-fix-performance-reporting.md` | 14KB | Performance |
| `002-DR-GUID-openapi-implementation-summary.md` | 11KB | Guide |
| `001-DR-CHKL-openapi-creation-checklist.md` | 11KB | Checklist |
| `003-DR-GUID-openapi-usage-guide.md` | 11KB | Guide |
| `009-AA-AACR-doc-filing-cleanup.md` | 10KB | Audit |
| `020-DR-EPIC-epic-j-local-review.md` | 9KB | Epic planning |
| `004-BL-POLI-security-policy.md` | 6KB | Policy |
| `007-LS-CHNG-changelog.md` | 4KB | Changelog |
| `006-DR-DIAG-auto-fix-performance-reporting.mmd` | 2KB | Mermaid diagram |

**Note:** `.gitignore` lists `000-docs/` but these files are tracked (force-added).

## docs/ Directory (3 tracked files)

```
docs/AUTO-FIX-MONITORING.md  (13KB)
docs/CICD.md                 (11KB)
docs/TESTING.md              (8KB)
```

---

# 6. Scripts + Automation Audit

## scripts/ Directory Structure

```
scripts/
├── arv/           (21 gate scripts for Agent Readiness Verification)
├── ci/            (CI helper scripts)
├── docs/          (Documentation generation)
├── hooks/         (Git hooks helpers)
├── registry/      (Connector registry scripts)
├── budget-monitor.ts
├── check-secrets.sh
├── cloud-smoke-test.ts
├── deploy-staging.sh
├── generate-performance-report.ts
├── generate-sdk-types.ts
├── github-alerts.ts
├── monitor-autofix-health.ts
├── test-parallel.sh
├── test-performance-report.sh
└── validate-sdk-types.ts
```

## ARV Gate Scripts (scripts/arv/)

| Script | Purpose |
|--------|---------|
| `run-all.ts` | Orchestrator |
| `forbidden-patterns.ts` | Lint patterns |
| `smoke-test.ts` | Boot test |
| `update-goldens.ts` | Update fixtures |
| `approval-policy-gate.ts` | Policy validation |
| `connector-supply-chain.ts` | Supply chain checks |
| `docs-gate.ts` | Documentation gate |
| `forensics-gate.ts` | Forensics validation |
| `ga-readiness-gate.ts` | GA readiness |
| `identity-gate.ts` | Identity validation |
| `load-test.ts` | Load testing |
| `marketplace-gate.ts` | Marketplace checks |
| `merge-resolver-gate.ts` | Merge resolver |
| `metering-gate.ts` | Metering validation |
| `observability-gate.ts` | Observability |
| `openapi-gate.ts` | OpenAPI validation |
| `planner-gate.ts` | Planner validation |
| `registry-gate.ts` | Registry checks |
| `reliability-gate.ts` | Reliability gate |
| `security-gate.ts` | Security validation |

## GitHub Actions Workflows (18 files)

```
.github/workflows/
├── arv.yml                  (ARV checks)
├── auto-fix-budget.yml      (Budget monitoring)
├── auto-fix-monitor.yml     (Auto-fix monitoring)
├── auto-fix-report.yml      (Reporting)
├── auto-fix.yml             (Auto-fix automation)
├── ci-enhanced.yml          (Enhanced CI)
├── ci.yml                   (Main CI)
├── code-assist.yml          (Code assistance)
├── deploy.yml               (Deployment)
├── drift-detection.yml      (Drift detection)
├── release.yml              (Release automation)
├── test.yml                 (Test runner)
├── tofu-apply.yml           (OpenTofu apply)
├── tofu-plan.yml            (OpenTofu plan)
├── examples/
│   └── budget-config.example.yml
├── MONITORING-QUICKREF.md
├── README-monitoring.md
└── README.md
```

---

# 7. Build/Deploy Behavior

## Build System

- **Monorepo Manager:** Turbo (v2.3.0)
- **Package Manager:** npm (v10.2.0)
- **Node Version:** >=20.0.0
- **TypeScript Version:** ^5.3.0

## Build Command

```bash
npm install
npm run build
```

## Deploy Target

| Component | Destination |
|-----------|-------------|
| Web Dashboard | Firebase Hosting |
| API | Cloud Run |
| Gateway | Cloud Run |
| GitHub Webhook | Cloud Run |
| Worker | Cloud Run |
| Webhook Receiver | Cloud Run |
| Database | Firestore |
| Infrastructure | OpenTofu (GCP) |

## Infrastructure (infra/)

```
infra/
├── envs/
│   ├── dev.tfvars
│   ├── local.tfvars
│   ├── prod.tfvars
│   └── staging.tfvars
├── agent_engine.tf
├── artifact_registry.tf
├── cloud_run.tf
├── iam.tf
├── main.tf
├── monitoring.tf       (48KB - largest)
├── network.tf
├── outputs.tf
├── provider.tf
├── README.md
├── scheduler.tf
├── service_auth.tf
├── service_topology.tf
├── storage.tf
├── variables.tf
├── versions.tf
└── webhook_receiver.tf
```

**Deploy Rule:** No direct `gcloud` deploys. All infrastructure via GitHub Actions + OpenTofu.

---

# 8. Test Structure

## Test Directory Layout

```
test/
├── contracts/      (5 files - Zod schema tests)
├── e2e/            (8 files - End-to-end tests)
└── goldens/        (13 files - Deterministic output fixtures)
```

## Test Files

```
test/contracts/
├── approval-policy.test.ts
├── autopilot.test.ts
├── identity.test.ts
├── onboarding.test.ts
└── schemas.test.ts

test/e2e/
├── README.md
├── example.e2e.test.ts
├── helpers/
├── local-review.e2e.test.ts
├── marketplace.e2e.test.ts
└── setup.ts

test/goldens/
├── billing/
├── expected/
├── forensics/
├── metering/
├── planner/
└── scoring.test.ts
```

---

# 9. Risk Register

| Item/Path | Why Critical | Verification Command |
|-----------|--------------|---------------------|
| `packages/` | Core source code (664 files) | `git ls-files packages/ \| wc -l` |
| `apps/` | Application source (157 files) | `git ls-files apps/ \| wc -l` |
| `infra/` | OpenTofu infrastructure definitions | `ls -la infra/` |
| `.github/workflows/` | CI/CD pipeline definitions | `ls -la .github/workflows/` |
| `package.json` | Root package config | `cat package.json` |
| `turbo.json` | Monorepo build config | `cat turbo.json` |
| `firebase.json` | Firebase hosting config | `cat firebase.json` |
| `firestore.rules` | Database security rules | `cat firestore.rules` |
| `firestore.indexes.json` | Database indexes | `cat firestore.indexes.json` |
| `CLAUDE.md` | AI assistant instructions | `cat CLAUDE.md` |
| `package-lock.json` | Dependency lockfile | `ls -la package-lock.json` |
| `.gitignore` | Ignore rules | `cat .gitignore` |
| `test/` | Test suite (26 files) | `git ls-files test/ \| wc -l` |
| `scripts/` | Build/deploy automation (39 files) | `git ls-files scripts/ \| wc -l` |
| `000-docs/` | Architecture decisions (11 files) | `git ls-files 000-docs/ \| wc -l` |
| `connectors/*/dist/` | Pre-built connector code | `git ls-files connectors/` |
| `db/` | Database migrations | `git ls-files db/` |
| `schemas/` | JSON schemas | `git ls-files schemas/` |

---

# 10. Cleanup Plan Inputs

## Tracked vs Generated Directories

| Directory | Tracked | Generated | Action |
|-----------|---------|-----------|--------|
| `packages/` | Yes | No | Keep |
| `apps/` | Yes | No | Keep |
| `infra/` | Yes | No | Keep |
| `test/` | Yes | No | Keep |
| `scripts/` | Yes | No | Keep |
| `.github/` | Yes | No | Keep |
| `000-docs/` | Yes (11 files) | No | Review gitignore discrepancy |
| `docs/` | Yes (3 files) | No | Keep |
| `connectors/*/dist/` | Yes (4 files) | Partial | Review need for pre-built |
| `node_modules/` | No | Yes | Auto-ignored |
| `dist/` | No | Yes | Auto-ignored |
| `.turbo/` | No | Yes | Auto-ignored |
| `.gwi/` | No | Yes | Auto-ignored |
| `.beads/` | No | Yes | Auto-ignored |

## Root-Level Markdown Classification

| File | Type | Recommendation |
|------|------|----------------|
| `README.md` | Living doc | Keep, maintain |
| `CHANGELOG.md` | Living doc | Keep, maintain |
| `CLAUDE.md` | Living doc | Keep, maintain |
| `AGENTS.md` | Living doc | Keep, maintain |
| `C3_VERIFICATION_REPORT.md` | One-off report | Consider archiving |
| `LICENSE` | Legal | Keep |

## Potential Redundancy

1. **ARV scripts:** 21 gate scripts - review for overlap/consolidation
2. **GitHub workflows:** 18 workflows - some may have overlapping triggers
3. **000-docs/ in .gitignore:** Listed as ignored but files are tracked (confusing)
4. **Multiple test locations:** `test/`, `packages/*/src/__tests__/`, `apps/*/src/__tests__/`

## Proposed Structure Changes

### Option A: Consolidate docs

```
000-docs/ → docs/internal/          # Rename for clarity
docs/     → docs/public/            # External-facing docs
```

### Option B: Keep separate, fix gitignore

```
# Remove from .gitignore:
# 000-docs/
```

### Option C: Untrack 000-docs

```bash
# If truly internal, untrack:
git rm --cached -r 000-docs/
```

## Sizes (Local Only, Not Tracked)

| Directory | Size |
|-----------|------|
| Total repo | 1.3GB |
| node_modules/ | 873MB |
| .beads/ | 16MB |
| .gwi/ | 172KB |

---

# Next Actions (for ChatGPT cleanup prompt)

1. **Decide on 000-docs/ fate** - Either remove from .gitignore or untrack the files
2. **Review C3_VERIFICATION_REPORT.md** - Archive if one-time report
3. **Audit ARV gate scripts** - Check for redundancy
4. **Audit GitHub workflows** - Check for trigger overlap
5. **Review large source files** - Consider splitting files >50KB
6. **Verify connector dist tracking** - Confirm pre-built connectors are intentional
7. **Clean local .beads/** - 16MB may accumulate; consider rotation

---

*End of Audit Pack*
