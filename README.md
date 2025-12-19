# Git With Intent

AI-powered CLI for GitHub PR workflows. Handles merge conflicts, generates code from issues, and automates the tedious parts of PR management.

**Status:** Active development. Core functionality works, rough edges remain.

---

## What This Actually Does

Most AI coding tools focus on writing new code. GWI focuses on the messy middle: merge conflicts, PR triage, and turning issues into working PRs.

| Command | Purpose |
|---------|---------|
| `gwi triage <pr-url>` | Score PR complexity (1-10), identify conflicts |
| `gwi plan <pr-url>` | Generate resolution strategy |
| `gwi resolve <pr-url>` | AI-powered conflict resolution |
| `gwi review <pr-url>` | Generate review summary |
| `gwi issue-to-code <issue-url>` | Turn GitHub issue into code |
| `gwi autopilot <pr-url>` | Full pipeline: triage → plan → resolve → review |
| `gwi run list` | List recent runs |
| `gwi run status <id>` | Check run details |
| `gwi run approve <id>` | Approve changes for commit |

---

## How It Differs From Other Tools

### vs GitHub Copilot
Copilot writes code inline. GWI operates at the PR level - it reads the full context of a PR, understands what changed across multiple files, and resolves conflicts that span branches. Different problem space.

### vs Dependabot / Renovate
Those handle dependency updates. GWI handles arbitrary PRs with conflicts, including feature branches where humans made conflicting changes. Dependabot can't reason about semantic conflicts in business logic.

### vs Generic AI Chat
You could paste diffs into ChatGPT. GWI automates the workflow: fetches PR data, parses conflicts, generates patches in the right format, and can commit results. It's the difference between a tool and a workflow.

### The Actual Innovation
1. **Deterministic scoring** - Complexity scores (1-10) are reproducible, not vibes
2. **Approval gating** - Changes require explicit approval before commit, with SHA256 hash binding
3. **Audit trail** - Every run produces artifacts you can review and reproduce
4. **Multi-agent routing** - Simple PRs get fast models, complex ones get stronger models

---

## Quick Start

```bash
npm install
npm run build

export GITHUB_TOKEN=ghp_...
export ANTHROPIC_API_KEY=sk-ant-...  # or GOOGLE_AI_API_KEY

# Try it
gwi triage https://github.com/owner/repo/pull/123
```

---

## Safety Model

GWI won't push code without approval. Operations are classified by risk:

| Operation | Risk Level |
|-----------|------------|
| Read PR data, post comments | Safe (auto) |
| Generate patch locally | Safe (auto) |
| Commit changes | Gated (requires approval) |
| Push to remote | Gated (requires approval) |
| Merge PR | Gated (requires approval) |

Approvals are hash-bound. If the patch changes after you approve, the approval is invalidated.

```bash
gwi run status <run-id>   # See what would be committed
gwi run approve <run-id>  # Approve with hash binding
```

---

## Run Artifacts

Every run creates a bundle at `.gwi/runs/<runId>/`:

```
.gwi/runs/550e8400.../
├── run.json          # Run metadata
├── triage.json       # Complexity score
├── plan.json         # Resolution plan
├── patch.diff        # Proposed changes
├── review.json       # Review findings
├── approval.json     # Approval record
└── audit.log         # JSONL audit trail
```

You can replay, audit, or debug any run from these artifacts.

---

## Architecture

```
CLI (gwi commands)
       │
Workflow Layer (Orchestrator → Triage → Coder → Resolver → Reviewer)
       │
Engine Core (Run State, Artifacts, Scoring, Approvals)
       │
Connectors (GitHub API, Filesystem)
```

**Agent routing:**
- Simple PRs → Gemini Flash (fast, cheap)
- Complex PRs → Claude Sonnet/Opus (better reasoning)
- Code generation → Claude Sonnet
- Conflict resolution → Claude Sonnet or Opus depending on complexity

---

## Project Structure

```
git-with-intent/
├── apps/
│   ├── cli/           # CLI tool (gwi command)
│   ├── api/           # REST API
│   ├── gateway/       # A2A gateway
│   └── web/           # Dashboard (WIP)
├── packages/
│   ├── core/          # 68 modules: storage, scoring, billing, security, etc.
│   ├── agents/        # Agent implementations
│   ├── engine/        # Workflow orchestration
│   └── integrations/  # GitHub client
└── infra/             # Infrastructure as Code (OpenTofu)
```

The `packages/core/` directory has grown significantly. Major subsystems:
- **Storage** - Firestore/memory backends
- **Billing** - Usage metering, quotas
- **Security** - RBAC, audit logging, secrets management
- **Reliability** - Rate limiting, circuit breakers, retry logic
- **Forecasting** - Time series analysis (for usage prediction)
- **Marketplace** - Plugin system (in development)

---

## Development

```bash
npm install
npm run build
npm run test       # ~1700 tests
npm run typecheck
```

### ARV (Agent Readiness Verification)

Pre-commit checks that enforce code standards:

```bash
npm run arv           # All checks
npm run arv:lint      # No deprecated patterns
npm run arv:contracts # Schema validation
npm run arv:smoke     # Boot check
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | GitHub API access |
| `ANTHROPIC_API_KEY` | Claude API |
| `GOOGLE_AI_API_KEY` | Gemini API |
| `GWI_STORE_BACKEND` | `memory` or `firestore` |

---

## Current State

**What works:**
- CLI commands (triage, resolve, autopilot, issue-to-code)
- Approval gating with hash binding
- Run artifacts and audit trail
- Firestore storage backend
- 1700+ tests passing

**What's rough:**
- Error messages could be clearer
- Some edge cases in conflict detection
- Web dashboard is minimal
- Documentation gaps

**What's planned:**
- GitHub Actions integration
- Webhook-triggered automation
- Better multi-repo support

---

## License

**Proprietary** - Copyright (c) 2025 Intent Solutions LLC. All Rights Reserved.

This software is proprietary and confidential. No license is granted for use,
modification, or distribution. See [LICENSE](./LICENSE) for details.

For licensing inquiries: jeremy@intentsolutions.io

---

*Work in progress. Not production-ready for all use cases.*
