# Git With Intent

CLI tool that automates PR workflows. Resolves merge conflicts, creates PRs from issues, reviews code, runs in full autopilot with approval gating.

**Version:** 0.5.1 | **Status:** Active development

---

## Who It's For

**Teams that:**
- Spend hours resolving merge conflicts that AI could handle
- Want to turn GitHub issues into working PRs with one command
- Need audit trails for AI-assisted code changes
- Want AI help but don't trust fully autonomous commits

**Not for teams that:**
- Need a web dashboard first (CLI-only for now)
- Want AI to push directly without approval (intentionally blocked)
- Need GitLab/Bitbucket support today (GitHub only for now)

---

## How It's Different

| Tool | What it does | GWI difference |
|------|--------------|----------------|
| **GitHub Copilot** | Suggests code in editor | We generate PRs from issues, resolve conflicts, run pipelines |
| **Cursor / Windsurf** | AI coding assistants | We're repo-level automation, not editor plugins |
| **Linear / Jira** | Project management | We actually write the code, not just track it |
| **SonarQube** | Static analysis | We fix issues, not just report them |
| **Dependabot** | Dependency updates | We handle any issue type, not just deps |

**Key differentiators:**

1. **Semantic conflict resolution** - Understands code intent, not just text diffs
2. **Approval gating** - AI can't push without explicit user consent (hash-bound)
3. **Multi-agent routing** - Simple tasks → cheap models, complex → powerful models
4. **Full audit trail** - Every decision is logged and explainable
5. **CLI-first** - Works in your terminal, not another web app

---

## What It Does

```mermaid
flowchart LR
    subgraph Inputs
        A[GitHub Issue] --> CLI
        B[Pull Request] --> CLI
        C[Merge Conflict] --> CLI
        D[Local Changes] --> CLI
    end

    subgraph CLI[gwi CLI]
        E[triage]
        F[resolve]
        G[review]
        H[issue-to-code]
        I[autopilot]
        J[gate]
    end

    subgraph Outputs
        CLI --> K[Complexity Score]
        CLI --> L[Resolved Conflicts]
        CLI --> M[Review Summary]
        CLI --> N[Generated PR]
        CLI --> O[Approval Gate]
    end
```

**Core capabilities:**
- Resolve merge conflicts (semantic understanding, not just textual)
- Create PRs from GitHub issues
- Score PR complexity (deterministic 1-10 scale)
- Review and summarize PRs
- Full autopilot: triage → resolve → review → commit
- **Local review before PR** (v0.5.0): Review staged/unstaged changes locally

---

## User Journeys

### Journey 1: Resolve a Merge Conflict

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant CLI as gwi CLI
    participant Agent as Resolver Agent
    participant GH as GitHub

    Dev->>CLI: gwi resolve owner/repo/pull/123
    CLI->>GH: Fetch PR details + conflict files
    GH-->>CLI: Conflict data
    CLI->>Agent: Analyze conflicts semantically
    Agent-->>CLI: Resolution patch
    CLI->>Dev: Show diff + ask for approval
    Dev->>CLI: gwi run approve <run-id>
    CLI->>GH: Push resolved files
    GH-->>Dev: Conflict resolved
```

**Commands:**
```bash
gwi resolve https://github.com/owner/repo/pull/123
# Review the proposed resolution
gwi run status <run-id>
# Approve and commit
gwi run approve <run-id>
```

### Journey 2: Create PR from Issue

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant CLI as gwi CLI
    participant Triage as Triage Agent
    participant Coder as Coder Agent
    participant GH as GitHub

    Dev->>CLI: gwi issue-to-code owner/repo/issues/456
    CLI->>GH: Fetch issue details
    GH-->>CLI: Issue content
    CLI->>Triage: Score complexity
    Triage-->>CLI: Complexity: 4/10
    CLI->>Coder: Generate code changes
    Coder-->>CLI: Patch + explanation
    CLI->>Dev: Show changes + ask for approval
    Dev->>CLI: gwi run approve <run-id>
    CLI->>GH: Create branch + open PR
    GH-->>Dev: PR #789 created
```

**Commands:**
```bash
gwi issue-to-code https://github.com/owner/repo/issues/456
gwi run approve <run-id>
```

### Journey 3: Full Autopilot

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant CLI as gwi CLI
    participant Agents as Agent Pipeline
    participant GH as GitHub

    Dev->>CLI: gwi autopilot owner/repo/pull/123

    CLI->>Agents: 1. Triage
    Agents-->>CLI: Complexity: 5/10

    CLI->>Agents: 2. Resolve conflicts
    Agents-->>CLI: Patch ready

    CLI->>Agents: 3. Review
    Agents-->>CLI: Review summary

    CLI->>Dev: Awaiting approval (hash: abc123)
    Dev->>CLI: gwi run approve abc123
    CLI->>GH: Commit + push
    GH-->>Dev: Changes committed
```

### Journey 4: Local Review Before PR (v0.5.0)

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant CLI as gwi CLI
    participant Reviewer as ReviewerAgent
    participant Git as Local Git

    Dev->>CLI: gwi review --local
    CLI->>Git: Read staged changes
    Git-->>CLI: Diff content
    CLI->>CLI: Analyze complexity (deterministic)
    CLI->>Dev: Show score + patterns

    Dev->>CLI: gwi review --local --ai
    CLI->>Reviewer: AI-powered analysis
    Reviewer-->>CLI: Security issues + suggestions
    CLI->>Dev: Show AI findings

    Dev->>CLI: gwi gate
    CLI->>Dev: Approve/reject prompt
    Dev->>CLI: approve
    CLI-->>Dev: Ready for commit
```

**Commands:**
```bash
# Review staged changes (fast, deterministic)
gwi review --local

# Review all uncommitted changes
gwi review --local --all

# AI-powered review (uses ReviewerAgent)
gwi review --local --ai

# Pre-commit approval gate
gwi gate

# Non-interactive gate for CI/hooks
gwi gate --no-interactive

# Score complexity of recent commits
gwi triage --diff HEAD~1

# Explain local changes
gwi explain .
```

---

## Architecture

### System Overview

```mermaid
flowchart TB
    subgraph CLI["CLI (gwi)"]
        commands[Commands]
    end

    subgraph Engine["Workflow Engine"]
        orchestrator[Orchestrator]
        runner[Step Runner]
        approval[Approval Gate]
    end

    subgraph Agents["AI Agents"]
        triage[Triage<br/>Gemini Flash]
        coder[Coder<br/>Claude Sonnet]
        resolver[Resolver<br/>Claude Opus]
        reviewer[Reviewer<br/>Claude Sonnet]
    end

    subgraph Storage["Storage"]
        firestore[(Firestore<br/>Production)]
        sqlite[(SQLite<br/>Local Dev)]
    end

    subgraph External["External"]
        github[GitHub API]
    end

    CLI --> Engine
    Engine --> Agents
    Engine --> Storage
    Engine --> External
    orchestrator --> runner
    runner --> approval
```

### Agent Routing

```mermaid
flowchart LR
    PR[PR/Issue] --> Score{Complexity?}

    Score -->|1-3| Fast[Gemini Flash<br/>Fast, cheap]
    Score -->|4-6| Medium[Claude Sonnet<br/>Balanced]
    Score -->|7-10| Powerful[Claude Opus<br/>Complex tasks]
```

Simple tasks use fast/cheap models. Complex tasks use powerful models.

### Approval Flow

```mermaid
stateDiagram-v2
    [*] --> Pending: Run created
    Pending --> Running: Start execution
    Running --> AwaitingApproval: Patch ready
    AwaitingApproval --> Approved: User approves
    AwaitingApproval --> Rejected: User rejects
    Approved --> Committed: Push to remote
    Committed --> [*]
    Rejected --> [*]

    Running --> Failed: Error occurred
    Failed --> [*]
```

Destructive operations (commit, push, merge) require explicit approval with SHA256 hash binding.

---

## Monorepo Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI tool (gwi command)
│   ├── api/              # REST API (Cloud Run)
│   ├── gateway/          # A2A agent coordination
│   ├── github-webhook/   # Webhook handler
│   ├── worker/           # Background jobs
│   └── web/              # Dashboard (React)
├── packages/
│   ├── core/             # Storage, billing, security (68 modules)
│   ├── agents/           # AI agent implementations
│   ├── engine/           # Workflow orchestration
│   ├── integrations/     # GitHub/GitLab connectors
│   └── sdk/              # TypeScript SDK
└── infra/                # OpenTofu (GCP infrastructure)
```

### Package Dependencies

```mermaid
flowchart TD
    cli[apps/cli] --> agents[packages/agents]
    cli --> integrations[packages/integrations]
    cli --> core[packages/core]

    agents --> core
    integrations --> core

    api[apps/api] --> core
    gateway[apps/gateway] --> core
    webhook[apps/github-webhook] --> core
    worker[apps/worker] --> core

    sdk[packages/sdk] --> core
    engine[packages/engine] --> agents
    engine --> core
```

---

## Quick Start

### Install

```bash
npm install
npm run build
```

### Configure

```bash
# Required: At least one AI provider
export ANTHROPIC_API_KEY="your-key"
export GOOGLE_AI_API_KEY="your-key"

# Required: GitHub access
export GITHUB_TOKEN="your-token"
```

### Use

```bash
# Score PR complexity
gwi triage https://github.com/owner/repo/pull/123

# Resolve merge conflicts
gwi resolve https://github.com/owner/repo/pull/123

# Create PR from issue
gwi issue-to-code https://github.com/owner/repo/issues/456

# Full pipeline with approval
gwi autopilot https://github.com/owner/repo/pull/123

# Check run status
gwi run list
gwi run status <run-id>

# Approve pending changes
gwi run approve <run-id>
```

### Local Development Review (v0.5.0)

Review code locally **before** creating a PR:

```bash
# Review staged changes (fast, no AI)
gwi review --local

# Review all uncommitted changes
gwi review --local --all

# AI-powered local review
gwi review --local --ai

# Pre-commit approval gate
gwi gate

# Non-interactive for CI/git hooks
gwi gate --no-interactive

# Score complexity of local commits
gwi triage --diff HEAD~1

# Explain what changed locally
gwi explain .

# Manage git hooks
gwi hooks install    # Install pre-commit hook
gwi hooks status     # Check hook status
```

---

## Context Graph & Explainability

Captures decision traces to answer "why did AI do that?"

```mermaid
flowchart LR
    subgraph Capture
        A[Agent Decision] --> B[Decision Trace]
        B --> C[Context Graph]
    end

    subgraph Query
        C --> D[gwi explain]
    end

    subgraph Output
        D --> E[Why AI did X]
    end
```

### Decision Trace Flow

```mermaid
sequenceDiagram
    participant Agent
    participant Trace as Decision Trace
    participant Graph as Context Graph
    participant User

    Agent->>Trace: Log decision + reasoning
    Trace->>Graph: Store as node
    Graph->>Graph: Link to prior decisions

    User->>Graph: gwi explain <run-id>
    Graph-->>User: Inputs, reasoning, alternatives, outcome
```

**Commands:**
```bash
# Explain a run or decision
gwi explain <run-id>
gwi explain <run-id> --step=coder

# Explain local changes (v0.5.0)
gwi explain .
gwi explain HEAD~3
```

> **Roadmap:** `gwi simulate` (world model simulation) is planned for Phase 35.

---

## Development

### Build & Test

```bash
npm run build        # Build all packages
npm run typecheck    # Type check
npm run test         # ~1700 tests
npm run arv          # Pre-commit checks
```

### Test Single Package

```bash
npx turbo run test --filter=@gwi/core
npx turbo run test --filter=@gwi/agents
```

### ARV (Agent Readiness Verification)

```bash
npm run arv           # All checks
npm run arv:lint      # No deprecated patterns
npm run arv:contracts # Schema validation
npm run arv:goldens   # Deterministic outputs
npm run arv:smoke     # Boot test
```

---

## Task Tracking

Uses [beads](https://github.com/steveyegge/beads) for issue tracking.

```bash
bd list --status open       # View open tasks
bd ready                    # Available tasks
bd update <id> --status in_progress
bd close <id> -r "reason"
bd sync                     # Push to git
```

### Epic Status

| Epic | Status | Focus |
|------|--------|-------|
| A | Active | Core infrastructure |
| B | Active | Data connectors |
| C | Active | Workflow engine |
| D | Active | Policy & audit |
| E | Complete | RBAC & governance |
| F | Active | Web dashboard |
| G | Planned | Slack integration |
| H | Active | Infrastructure |
| I | Active | Forecasting & ML |
| J | **Complete** | **Local dev review (v0.5.0)** |

---

## Security Model

```mermaid
flowchart TB
    subgraph Safe["Safe (No Approval)"]
        A[Read repo data]
        B[Analyze patterns]
        C[Generate patch]
        D[Post comments]
    end

    subgraph Gated["Approval Required"]
        E[Commit changes]
        F[Push to remote]
        G[Merge PR]
    end

    A --> |direct| Output
    E --> |hash-bound| Approval
    Approval --> |verified| Output
```

| Operation | Approval |
|-----------|----------|
| Read/analyze | No |
| Generate patch | No |
| Commit/push | Yes (hash-bound) |
| Merge | Yes (hash-bound) |

Hash binding: if the patch changes after approval, approval is invalidated.

---

## Deployment

```mermaid
flowchart LR
    subgraph CI["GitHub Actions"]
        PR[PR Created] --> Test[Build + Test]
        Test --> Plan[OpenTofu Plan]
    end

    subgraph Deploy["Production"]
        Plan --> Apply[OpenTofu Apply]
        Apply --> CloudRun[Cloud Run]
        Apply --> Firebase[Firebase]
    end
```

**Services:**
- `gwi-api` - REST API (Cloud Run)
- `gwi-gateway` - A2A coordination (Cloud Run)
- `gwi-webhook` - GitHub webhooks (Cloud Run)
- `gwi-worker` - Background jobs (Cloud Run)
- Firestore - Operational database
- Firebase Hosting - Web dashboard

**No direct `gcloud` deploys.** All infrastructure via GitHub Actions + OpenTofu.

---

## Run Artifacts

Every run creates a bundle at `.gwi/runs/<runId>/`:

```
.gwi/runs/550e8400.../
├── run.json          # Metadata
├── triage.json       # Complexity score
├── plan.json         # Resolution plan
├── patch.diff        # Proposed changes
├── review.json       # Findings
├── approval.json     # Approval record
└── audit.log         # JSONL audit trail
```

Replay, audit, or debug any run from these artifacts.

---

## Roadmap

```mermaid
gantt
    title Development Phases
    dateFormat  YYYY-MM
    section Phase 1
    PR Automation     :done, 2025-01, 2025-06
    section Phase 2
    Data Ingestion    :active, 2025-06, 2025-09
    section Phase 3
    Repo Analysis     :active, 2025-07, 2025-10
    section Phase 4
    Forecasting       :2025-10, 2026-01
    section Phase 5
    Platform          :2026-01, 2026-06
```

| Phase | Status | Features |
|-------|--------|----------|
| 1. PR Automation | Shipped | Triage, resolve, review, autopilot |
| 2. Data Ingestion | In Progress | GitHub connector, storage layer |
| 3. Repo Analysis | In Progress | Single/multi-repo patterns |
| 4. Forecasting | Planned | TimeGPT integration |
| 5. Platform | Planned | GitHub App, Slack, dashboard |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security Policy: [SECURITY.md](SECURITY.md)
- Support: [SUPPORT.md](SUPPORT.md)

📧 jeremy@intentsolutions.io

---

## Security

[Security Policy](SECURITY.md)

- Security audit completed Dec 2025
- Pre-alpha software - not production-ready
- Security issues: security@intentsolutions.io

---

## License

MIT License - Copyright (c) 2025-2026 Intent Solutions LLC

Open source CLI. Hosted service (when available) is commercial.
