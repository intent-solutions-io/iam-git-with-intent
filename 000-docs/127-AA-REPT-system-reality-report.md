# 127-AA-REPT: System Reality Report

**Generated:** 2025-12-18 23:45 CST (America/Chicago)
**Git HEAD:** `196597a7fc9e6ba413be4a8fa221ff78ea64dbd4`
**Report Type:** Evidence-Based System Analysis

---

## 1. Executive Summary (What's Real vs Planned)

### What Git With Intent Does Today (End-to-End)

1. **Trigger:** GitHub webhook events (PR opened, comment, push) or CLI commands (`gwi triage <pr-url>`)
2. **Processing:** Orchestrator routes to specialized agents (Triage, Coder, Resolver, Reviewer)
3. **Actions:** AI analyzes PRs, generates code, resolves conflicts, produces reviews
4. **Outcomes:** Comments on PRs, generates patches locally, requires approval before destructive operations

### What is Real in Code

| Capability | Status | Evidence |
|------------|--------|----------|
| CLI commands (triage, resolve, review, autopilot) | **REAL** | `apps/cli/src/commands/*.ts` |
| GitHub webhook handling | **REAL** | `apps/github-webhook/src/index.ts` |
| Multi-agent orchestration | **REAL** | `packages/agents/src/orchestrator/index.ts` |
| Firestore storage backend | **REAL** | `packages/core/src/storage/firestore-*.ts` |
| Approval gating for destructive ops | **REAL** | `packages/integrations/src/github/connector.ts` |
| WIF authentication for CI/CD | **REAL** | `.github/workflows/ci.yml` |
| Agent Engine proxy (gateway) | **REAL** | `apps/gateway/src/index.ts` |

### What is Planned/Partial

| Capability | Status | Notes |
|------------|--------|-------|
| Vertex AI Agent Engine deployment | **PARTIAL** | Gateway proxies to it; no ADK SDK usage |
| Web dashboard | **MINIMAL** | Basic React app at `apps/web/` |
| Auto-merge capability | **NOT DEPLOYED** | Code exists, gated by approval |
| Long-term memory/embeddings | **NOT IMPLEMENTED** | No vector DB, no retrieval |

### Current Deployment Reality

| Surface | Target | Actually Deployed |
|---------|--------|-------------------|
| Web UI | Firebase Hosting | **YES** - basic dashboard |
| API | Cloud Run | **NO** - not deployed yet |
| Gateway | Cloud Run | **NO** - not deployed yet |
| Webhook | Cloud Run | **NO** - not deployed yet |
| Agent Engine | Vertex AI | **NO** - infra defined, not deployed |

---

## 2. Runtime Surfaces and Entry Points

### 2.1 CLI (gwi commands)

| Field | Value |
|-------|-------|
| **Name** | gwi CLI |
| **Purpose** | Local PR analysis and automation |
| **Entry File** | `apps/cli/src/index.ts` |
| **Exposed Commands** | `triage`, `plan`, `resolve`, `review`, `autopilot`, `issue-to-code`, `run list`, `run status`, `run approve` |
| **Authentication** | Environment variables: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY` or `GOOGLE_AI_API_KEY` |

### 2.2 API Service

| Field | Value |
|-------|-------|
| **Name** | REST API |
| **Purpose** | Programmatic access to GWI features |
| **Entry File** | `apps/api/src/index.ts` |
| **Exposed Routes** | `/health`, `/api/v1/tenants/*`, `/api/v1/runs/*`, `/api/v1/workflows/*`, `/webhooks/stripe` |
| **Authentication** | API keys via `x-api-key` header; Firebase Auth tokens for web |

### 2.3 GitHub Webhook Handler

| Field | Value |
|-------|-------|
| **Name** | GitHub Webhook Service |
| **Purpose** | Receive and process GitHub events |
| **Entry File** | `apps/github-webhook/src/index.ts` |
| **Exposed Routes** | `POST /webhook` |
| **Authentication** | HMAC signature validation via `GITHUB_WEBHOOK_SECRET` |

### 2.4 A2A Gateway

| Field | Value |
|-------|-------|
| **Name** | Agent-to-Agent Gateway |
| **Purpose** | Route requests to local engine or Vertex AI Agent Engine |
| **Entry File** | `apps/gateway/src/index.ts` |
| **Exposed Routes** | `GET /a2a` (discovery), `POST /a2a/foreman`, `POST /a2a/:agent` |
| **Authentication** | None currently (internal service) |

### 2.5 Web UI

| Field | Value |
|-------|-------|
| **Name** | GWI Dashboard |
| **Purpose** | User dashboard for managing repos, viewing runs |
| **Entry File** | `apps/web/src/main.tsx` |
| **Authentication** | Firebase Auth (GitHub OAuth) |

### 2.6 Worker (Pub/Sub Consumer)

| Field | Value |
|-------|-------|
| **Name** | Background Worker |
| **Purpose** | Process async jobs from Pub/Sub queue |
| **Entry File** | `apps/worker/src/index.ts` |
| **Authentication** | GCP service account with Pub/Sub subscriber role |

---

## 3. Agents vs LLM Calls Reality

### Answer: This is PROMPT-ONLY ORCHESTRATION, NOT ADK Agents

**Evidence:**

1. **No ADK SDK imports found in runtime code:**
   ```bash
   rg -n "from.*@google-cloud/adk|import.*adk|AgentBuilder" packages/ apps/
   # Returns: No matches
   ```

2. **Agents are TypeScript classes with direct LLM calls:**
   - `packages/agents/src/orchestrator/index.ts:141` - `OrchestratorAgent extends BaseAgent`
   - `packages/agents/src/triage/index.ts` - Direct Gemini/Claude calls
   - `packages/agents/src/coder/index.ts` - Direct LLM calls

3. **"Agent Engine" usage is REST proxy, not ADK:**
   ```typescript
   // apps/gateway/src/index.ts:452
   const url = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/reasoningEngines/${engineId}:query`;
   ```

### How Multi-Step Flows Work

**Orchestrator Pattern (Prompt-Based Routing):**

```
OrchestratorAgent.startWorkflow(type, payload)
  ├── Determines workflow steps from WORKFLOW_DEFINITIONS
  ├── For each step:
  │   ├── Instantiate agent (TriageAgent, CoderAgent, etc.)
  │   ├── Call agent.execute() with task payload
  │   ├── Wait for result
  │   └── Pass result to next agent
  └── Return final result
```

**File:** `packages/agents/src/orchestrator/index.ts:113-119`
```typescript
const WORKFLOW_DEFINITIONS: Record<WorkflowType, string[]> = {
  'pr-resolve': ['triage', 'resolver', 'reviewer'],
  'issue-to-code': ['triage', 'coder', 'reviewer'],
  'pr-review': ['triage', 'reviewer'],
  ...
};
```

### Prompt Templates Location

| Agent | System Prompt Location | Line |
|-------|------------------------|------|
| Orchestrator | `packages/agents/src/orchestrator/index.ts` | L124 |
| Triage | `packages/agents/src/triage/index.ts` | L73, L119 |
| Coder | `packages/agents/src/coder/index.ts` | L116 |
| Resolver | `packages/agents/src/resolver/index.ts` | L64 |
| Reviewer | `packages/agents/src/reviewer/index.ts` | L124, L176, L212 |

### Tool Use Implementation

Tools are defined as Zod schemas and invoked via the connector pattern:

**File:** `packages/integrations/src/github/connector.ts`
- `CommentInput` schema (L24)
- `CheckRunInput` schema (L36)
- `PushCommitInput` schema (L79)
- `PROperationInput` schema (L97)

Tools require `ApprovalRecord` for destructive operations.

---

## 4. State, Memory, and Caching

### Run State (Short-Term)

| Question | Answer | Evidence |
|----------|--------|----------|
| Where stored? | **Firestore** (prod) / **In-Memory** (dev) | `GWI_STORE_BACKEND` env var |
| Collection name | `runs`, `runSteps` | `packages/core/src/storage/firestore-run.ts` |
| Key fields | `id`, `prId`, `type`, `status`, `steps[]`, `createdAt` | `packages/core/src/storage/interfaces.ts:99-113` |
| Idempotency? | **YES** | `IdempotencyStore` in `apps/worker/src/processor.ts:17` |

**Idempotency Implementation:**
```typescript
// apps/worker/src/processor.ts:201-210
const idempotencyKey = createIdempotencyKey(job.type, job.tenantId, job.input);
const idempotencyResult = await this.config.idempotencyStore.checkIdempotency(idempotencyKey);
if (idempotencyResult.skip) {
  this.stats.cached++;
  return { ...idempotencyResult };
}
```

### Long-Term Memory

| Question | Answer |
|----------|--------|
| Store repo preferences/style rules? | **NO** |
| Store history? | **YES** - run history in Firestore |
| Vector embeddings? | **NO** - no vector DB |
| Retrieval mechanism? | **NONE** - no RAG implementation |

**Evidence:** No `embedding`, `vector`, `pinecone`, `chromadb`, `qdrant` references in codebase.

### Caching

| What's Cached | Where | TTL |
|---------------|-------|-----|
| Installation → Tenant mapping | In-memory `Map` | Session lifetime |
| GitHub API responses | Not cached | N/A |
| LLM responses | Not cached | N/A |

**Evidence:** `apps/github-webhook/src/services/tenant-linker.ts:91`
```typescript
private installationCache = new Map<number, string>();
```

**THIS IS PROMPT-ONLY WITH NO PERSISTENT MEMORY.** Each run starts fresh with context provided in the prompt.

---

## 5. PR Lifecycle Capabilities

| Capability | Status | Evidence |
|------------|--------|----------|
| **Open PR** | Implemented | `packages/integrations/src/github/connector.ts` - `PROperationInput.create` |
| **Comment on PR** | Implemented | `packages/integrations/src/github/connector.ts:24` - `CommentInput` |
| **Update PR** | Implemented | `packages/integrations/src/github/connector.ts:98` - `PROperationInput.update` |
| **Close PR** | Not Implemented | No `close` operation in connector |
| **Merge PR** | Partially Implemented | Policy gate exists, not exposed in CLI |
| **Rebase/Resolve Conflicts** | Implemented | `packages/agents/src/resolver/index.ts` - `ResolverAgent` |
| **Post Evidence Bundle** | Implemented | `packages/core/src/evidence/index.ts` |
| **Request Reviewers** | Not Implemented | No reviewer assignment in connector |

### Merge Policy Gate

**File:** `packages/integrations/src/github/connector.ts:194-204`
```typescript
private getRequiredScope(operation: string): 'commit' | 'push' | 'open_pr' | 'merge' {
  switch (operation) {
    case 'createBranch':
    case 'pushCommit':
      return 'push';
    case 'createPR':
    case 'updatePR':
      return 'open_pr';
    // Note: merge scope exists but no merge operation exposed
  }
}
```

---

## 6. Auth Model

### User-Facing Authentication

| Method | Implementation | Evidence |
|--------|----------------|----------|
| Web Login | Firebase Auth (GitHub OAuth) | `apps/web/src/lib/firebase.ts:27` |
| CLI Auth | Environment variables | `GITHUB_TOKEN`, `ANTHROPIC_API_KEY` |
| API Auth | API keys (x-api-key header) | `apps/api/src/index.ts` |

### GitHub App Installation Flow

**File:** `apps/github-webhook/src/handlers/installation.ts`

1. GitHub sends `installation.created` webhook
2. Handler creates tenant in Firestore (`L130`)
3. Installation ID stored in tenant record
4. Webhook events use installation ID to resolve tenant

```typescript
// apps/github-webhook/src/services/tenant-linker.ts:211-214
const cached = this.installationCache.get(installationId);
if (cached) {
  return cached;
}
```

### Cloud Run Auth Stance

| Service | Auth Mode | Reason |
|---------|-----------|--------|
| API | Allow unauthenticated | Public API with app-level auth |
| Gateway | Allow unauthenticated | Internal service, may be restricted later |
| Webhook | Allow unauthenticated | GitHub webhooks can't authenticate |

**Evidence:** `infra/cloud_run.tf` - services configured without IAM invoker restriction.

### Slack Integration

**NOT IMPLEMENTED** - No Slack references in codebase.

---

## 7. Deployment & CI/CD Reality

### GitHub Actions Workflows

```bash
ls -la .github/workflows
# arv.yml - Agent Readiness Verification
# ci.yml - Main CI/CD pipeline
# drift-detection.yml - Infrastructure drift checks
# tofu-apply.yml - OpenTofu apply
# tofu-plan.yml - OpenTofu plan
```

### Workload Identity Federation (WIF)

**File:** `.github/workflows/ci.yml:118-122`
```yaml
- name: Authenticate to GCP (WIF)
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ vars.WIF_PROVIDER }}
    service_account: ${{ vars.WIF_SERVICE_ACCOUNT }}
```

**Required GitHub Variables:**
- `WIF_PROVIDER` - Workload Identity Provider resource name
- `WIF_SERVICE_ACCOUNT` - Service account email
- `GCP_PROJECT_ID` - GCP project ID

### OpenTofu vs Terraform

**OPENTOFU is used.** Terraform has been removed.

**Evidence:**
```bash
ls -la infra/
# .terraform/ - OpenTofu state directory
# *.tf files - All OpenTofu configurations
# No .terraform-version or terraform.* files
```

**File:** `.github/workflows/ci.yml:198-199`
```yaml
- name: Setup OpenTofu
  uses: opentofu/setup-opentofu@v1
```

### No-Drift Validator

**YES** - Present and enforced.

**File:** `scripts/ci/check_nodrift.sh`

**CI Integration:** `.github/workflows/ci.yml:27-29`
```yaml
- name: Security & Architecture Checks
  run: |
    chmod +x scripts/ci/check_nodrift.sh
    bash scripts/ci/check_nodrift.sh
```

---

## 8. Internal Tools Boundary

### Internal-Only Tools

| Tool | Location | Used At Runtime? |
|------|----------|------------------|
| AgentFS | `internal/agentfs-tools/`, root `agentfs:*` scripts | **NO** |
| Beads | `.beads/`, `bd` commands | **NO** |

### Proof: AgentFS NOT Required at Runtime

**Evidence 1:** CI Guard passes
```bash
npm run arv:no-agentfs
# PASSED: No AgentFS imports found in runtime code paths.
```

**Evidence 2:** Build works without AgentFS installed
```bash
npm run build
# 12 successful, 12 total
```

**Evidence 3:** Tests pass without AgentFS
```bash
npm run test
# All tests pass (run-index.test.ts: 13 passed)
```

### Documentation Compliance

**CLAUDE.md** updated to clarify:
```markdown
### AgentFS + Beads: INTERNAL DEV TOOLS ONLY

**These tools are for internal development only and are NOT required:**
- **AgentFS**: Optional dev tool for agent state inspection.
- **Beads**: Optional task tracking tool.
- **IMPORTANT**: Production code MUST NOT depend on AgentFS or Beads.
```

---

## 9. How to Reproduce Locally

### Install Dependencies
```bash
npm install
```

### Build All Packages
```bash
npm run build
```

### Run Tests
```bash
npm run test
# Or specific package:
npx turbo run test --filter=@gwi/core
```

### Run Services (Development)

**CLI:**
```bash
export GITHUB_TOKEN=ghp_...
export ANTHROPIC_API_KEY=sk-ant-...  # or GOOGLE_AI_API_KEY

# Run triage on a PR
node apps/cli/dist/index.js triage https://github.com/owner/repo/pull/123
```

**API (local):**
```bash
cd apps/api
npm run dev
# Listens on http://localhost:3000
```

**Gateway (local):**
```bash
cd apps/gateway
npm run dev
# Listens on http://localhost:8080
```

### Sample "Issue → PR" Flow (Dry Run)

```bash
# Set environment variables
export GITHUB_TOKEN=ghp_...
export ANTHROPIC_API_KEY=sk-ant-...
export GWI_STORE_BACKEND=memory  # Use in-memory storage

# Run issue-to-code workflow
node apps/cli/dist/index.js issue-to-code https://github.com/owner/repo/issues/1

# Check run status
node apps/cli/dist/index.js run list
node apps/cli/dist/index.js run status <run-id>

# Approve changes (required for destructive operations)
node apps/cli/dist/index.js run approve <run-id>
```

---

## 10. Evidence Extraction Outputs

### Git Status
```bash
git rev-parse HEAD
# 196597a7fc9e6ba413be4a8fa221ff78ea64dbd4

git status
# On branch main
# Your branch is ahead of 'origin/main' by 4 commits.
# Changes not staged: .firebase/hosting cache
```

### Directory Structure
```bash
ls -la
# total 672
# apps/           - Runtime applications (api, cli, gateway, webhook, web, worker)
# packages/       - Shared libraries (core, agents, engine, integrations)
# infra/          - OpenTofu infrastructure
# .github/        - CI/CD workflows
# 000-docs/       - Internal documentation
```

### Workflows Present
```bash
ls -la .github/workflows
# arv.yml, ci.yml, drift-detection.yml, tofu-apply.yml, tofu-plan.yml
```

### Infrastructure Files
```bash
ls -la infra/
# agent_engine.tf, artifact_registry.tf, cloud_run.tf, iam.tf
# main.tf, monitoring.tf, outputs.tf, provider.tf, storage.tf
# variables.tf, versions.tf
```

---

## Summary: Key Answers

| Question | Answer |
|----------|--------|
| Is this ADK/Agent Engine or prompt-only? | **PROMPT-ONLY** orchestration with REST proxy to Agent Engine |
| Where does state live? | **Firestore** (prod) / **In-memory** (dev) |
| Is there long-term memory? | **NO** - no embeddings, no RAG |
| What's actually deployed? | **Firebase Hosting only** (web dashboard) |
| Are internal tools required at runtime? | **NO** - AgentFS/Beads are optional dev tools |

---

**intent solutions io** — confidential IP
Contact: jeremy@intentsolutions.io
