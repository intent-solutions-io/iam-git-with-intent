# Git With Intent

> AI-powered CLI for GitHub PR workflows: triage, conflict resolution, and issue-to-code generation.

**"Git with purpose. Ship with confidence."**

---

## What It Does Today

| Command | What It Does |
|---------|--------------|
| `gwi triage <pr-url>` | Analyze PR complexity, score conflicts (1-10) |
| `gwi plan <pr-url>` | Generate resolution plan |
| `gwi resolve <pr-url>` | Full AI-powered conflict resolution |
| `gwi autopilot <pr-url>` | End-to-end: triage → plan → resolve → review |
| `gwi issue-to-code <issue-url>` | Generate code from GitHub issue |
| `gwi run list` | List recent runs |
| `gwi run status <id>` | Show run status and details |
| `gwi run approve <id>` | Approve run for commit/push |

---

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Set up credentials
export GITHUB_TOKEN=ghp_...
export ANTHROPIC_API_KEY=sk-ant-...  # or GOOGLE_AI_API_KEY

# Triage a PR
gwi triage https://github.com/owner/repo/pull/123

# Full resolution with approval
gwi resolve https://github.com/owner/repo/pull/123
```

---

## Safety and Approval Gates

GWI classifies operations by risk level:

| Operation | Risk | Approval Required |
|-----------|------|-------------------|
| Read PR/issue data | Safe | No |
| Post comments, labels | Safe | No |
| Generate patch (no write) | Safe | No |
| **Commit changes** | Gated | **Yes** |
| **Push to remote** | Gated | **Yes** |
| **Create/update PR** | Gated | **Yes** |
| **Merge PR** | Gated | **Yes** |

**Approval binding**: Each approval is bound to a SHA256 hash of the proposed changes. If the patch changes, the approval is invalidated.

```bash
# Check what would be approved
gwi run status <run-id>

# Approve with hash binding
gwi run approve <run-id>
```

---

## Run Artifacts and Auditability

Every run produces a bundle at `.gwi/runs/<runId>/`:

```
.gwi/runs/550e8400.../
├── run.json          # Run context, state, config
├── triage.json       # Complexity score, route decision
├── plan.json         # Execution plan
├── plan.md           # Human-readable plan
├── patch.diff        # Proposed changes
├── review.json       # Review findings
├── approval.json     # Approval record (if approved)
└── audit.log         # Append-only JSONL audit trail
```

**Audit log format** (each line is JSON):
```json
{"timestamp":"2025-12-16T12:00:00Z","runId":"550e8400...","actor":"agent","action":"state_transition","details":{"from":"queued","to":"triaged"}}
```

---

## Capabilities Modes

| Mode | What's Allowed | Use Case |
|------|----------------|----------|
| `comment-only` | Read, comment, label | Analysis only |
| `patch-only` | Generate patch.diff | Propose for review |
| `commit-after-approval` | All, with approval | Full automation |

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                    CLI / API                       │
│         gwi triage, resolve, autopilot            │
└───────────────────────────────────────────────────┘
                        │
┌───────────────────────────────────────────────────┐
│                 WORKFLOW LAYER                     │
│   Orchestrator → Triage → Coder → Resolver →      │
│                                    Reviewer       │
└───────────────────────────────────────────────────┘
                        │
┌───────────────────────────────────────────────────┐
│                  ENGINE CORE                       │
│  Run State │ Artifacts │ Scoring │ Approvals     │
│  Machine   │ (.gwi/)   │ (1-10)  │ (hash-bound)  │
└───────────────────────────────────────────────────┘
                        │
┌───────────────────────────────────────────────────┐
│                   CONNECTORS                       │
│              GitHub │ Filesystem                  │
└───────────────────────────────────────────────────┘
```

**Agents:**

| Agent | Model | Purpose |
|-------|-------|---------|
| Orchestrator | Gemini Flash | Route work, manage workflows |
| Triage | Gemini Flash | Score complexity, recommend route |
| Coder | Claude Sonnet | Generate code from issues |
| Resolver | Claude Sonnet/Opus | Resolve merge conflicts |
| Reviewer | Claude Sonnet | Quality check, security scan |

---

## Project Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI (gwi command)
│   ├── api/              # SaaS API
│   └── web/              # Web dashboard
├── packages/
│   ├── core/             # Engine: runs, scoring, approvals
│   ├── agents/           # Agent implementations
│   ├── engine/           # Workflow orchestration
│   └── integrations/     # GitHub client
├── infra/terraform/      # Infrastructure as Code
├── docs/                 # User documentation
└── 000-docs/             # Internal docs, AARs
```

---

## Development

```bash
# Install
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Type check
npm run typecheck

# Development mode
npm run dev
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `GITHUB_TOKEN` | GitHub API access | Yes |
| `ANTHROPIC_API_KEY` | Claude API | One AI key required |
| `GOOGLE_AI_API_KEY` | Gemini API | One AI key required |
| `GWI_STORE_BACKEND` | Storage (memory, firestore) | No |

---

## Roadmap

### Current (v0.2.x)
- CLI workflows (triage, resolve, autopilot)
- Issue-to-code generation
- Run artifact bundles
- Approval gating with hash binding
- Deterministic complexity scoring

### Planned (v0.3.x)
- GitHub Actions runner
- Webhook-triggered automation
- Multi-tenant dashboard
- Additional connectors (Slack, Jira)

---

## Documentation

| Document | Purpose |
|----------|---------|
| [Architecture Context](docs/context.md) | System architecture, substrate model |
| [Contributor Guide](docs/contributing-orientation.md) | Where to add code |
| [CLAUDE.md](CLAUDE.md) | Working contract for AI assistance |

---

## License

MIT
