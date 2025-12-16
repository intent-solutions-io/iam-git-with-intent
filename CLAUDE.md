# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## SESSION START PROTOCOL (MANDATORY)

**EVERY new Claude Code session on this repository MUST begin by reading:**

1. This file (`CLAUDE.md`) - Repository conventions
2. `000-docs/003-AA-AUDT-appaudit-devops-playbook.md` - DevOps rules
3. `000-docs/006-DR-ADRC-agentfs-beads-policy.md` - AgentFS/Beads policy

**After context compaction/summarization**, read these files again before continuing work.

This ensures:
- You understand Runtime vs DevTools separation
- You know when to use AgentFS/Beads (internal dev only)
- You follow documentation standards (6767 filing)

**Quick Command:** `/session-start` (if available) runs the session initialization.

---

## IMPORTANT: Runtime vs Dev Tools

**Git With Intent is a PUBLIC PRODUCT** designed for external users to install and pay for.

### What This Means

1. **Product Runtime** (user-facing):
   - CLI (`gwi`) and future API/UI
   - Depends ONLY on standard, boring components:
     - Node.js/TypeScript
     - GitHub API (via Octokit)
     - Vertex AI / Anthropic APIs
     - Standard database (SQLite/Turso by default, swappable)
   - **Does NOT require** AgentFS, Beads, or any experimental tools
   - Must work for any user who runs `npm install -g @gwi/cli`

2. **Dev/Ops Tools** (internal only):
   - AgentFS, Beads, "Hard Mode" CI rules
   - Used by our team and AI agents working IN this repo
   - Live in `internal/` or behind feature flags
   - Safe to remove without breaking user functionality

### The Golden Rule

> Any code path that affects user-visible behavior MUST work without AgentFS or Beads.
> These tools are opt-in enhancements for internal development, not runtime requirements.

---

## Project Overview

**Git With Intent** is an AI-powered multi-agent PR assistant that helps developers:

- Read and understand GitHub issues and PRs
- Detect and resolve merge conflicts
- Generate code changes from issue descriptions
- Run validation (tests, linting)
- Produce human-readable review summaries

**CLI Command:** `gwi` (git with intent)

**Target Users:** Developers who want AI assistance with PR workflows

**Business Model:** CLI is open-source; hosted service will be paid

---

## Multi-Agent Architecture (Hidden from Users)

The system uses multiple specialized agents internally, but users interact through simple commands:

### User-Facing Commands

```bash
gwi triage <pr-url>      # Analyze PR/issue, classify complexity
gwi plan <pr-url>        # Generate a change plan
gwi resolve <pr-url>     # Apply conflict resolutions
gwi review <pr-url>      # Generate review summary
gwi autopilot <pr-url>   # Full pipeline: triage -> plan -> code -> validate -> review
```

### Internal Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| TriageAgent | Gemini Flash | Classify complexity, identify files, understand context |
| PlannerAgent | Claude Sonnet | Turn triage findings into actionable change plan |
| CoderAgent | Claude Sonnet/Opus | Apply code edits using patches/AST transforms |
| ValidatorAgent | Gemini Flash | Run tests/linters, interpret results |
| ReviewerAgent | Claude Sonnet | Produce summaries, risks, PR comments |

**Key Point:** Users never need to know about agents. Multi-agent coordination happens inside the CLI/backend.

---

## Storage Architecture

### Interfaces (Required)

All storage is abstracted behind interfaces that can be swapped:

```typescript
// packages/core/src/storage/interfaces.ts

interface PRStore {
  savePR(pr: PRMetadata): Promise<void>;
  getPR(id: string): Promise<PRMetadata | null>;
  listPRs(filter?: PRFilter): Promise<PRMetadata[]>;
}

interface RunStore {
  createRun(prId: string): Promise<Run>;
  updateStep(runId: string, step: RunStep): Promise<void>;
  getRun(runId: string): Promise<Run | null>;
  getLatestRun(prId: string): Promise<Run | null>;
}

interface SettingsStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}
```

### Default Implementation (SQLite/Turso)

The default storage uses SQLite (via better-sqlite3 or Turso):

```typescript
// packages/core/src/storage/sqlite.ts
export class SQLiteStore implements PRStore, RunStore, SettingsStore { ... }
```

### Optional Implementations

- `AgentFSStore` - Uses AgentFS (internal/experimental)
- `PostgresStore` - For hosted deployments
- `FirestoreStore` - For Firebase hosting

**Selection:** Set via `GWI_STORAGE=sqlite|postgres|firestore|agentfs`

---

## File Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI: gwi triage/plan/resolve/review/autopilot
│   └── api/              # Future: hosted API
├── packages/
│   ├── core/             # Shared utilities
│   │   ├── src/
│   │   │   ├── storage/  # Storage interfaces + implementations
│   │   │   ├── github/   # GitHub API client
│   │   │   ├── models/   # LLM client abstraction
│   │   │   └── types.ts  # Shared types
│   ├── engine/           # Agent execution engine with hooks
│   │   ├── src/
│   │   │   └── hooks/    # Hook system (AgentHook, AgentHookRunner)
│   ├── agents/           # Agent implementations
│   │   ├── src/
│   │   │   ├── triage/
│   │   │   ├── planner/
│   │   │   ├── coder/
│   │   │   ├── validator/
│   │   │   └── reviewer/
│   └── integrations/     # GitHub, future: GitLab
├── internal/             # Dev tools (AgentFS, Beads wrappers) - NOT for users
│   ├── agentfs-tools/    # AgentFS adapters and hooks
│   └── beads-tools/      # Beads adapters and hooks
├── infra/                # Terraform, Docker
├── docs/                 # Documentation
└── 000-docs/             # Project docs (6767 standard)
```

---

## Code Standards

- **Language:** TypeScript (primary)
- **Runtime:** Node.js 20+
- **Package Manager:** npm workspaces + Turbo
- **Testing:** Vitest
- **Linting:** ESLint + Prettier

### Commit Messages

```
<type>(<scope>): description

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`

---

## Environment Variables

### Required for Users

```bash
# At least one AI provider
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_AI_API_KEY=...

# GitHub access
GITHUB_TOKEN=ghp_...
```

### Optional

```bash
GWI_STORAGE=sqlite              # Storage backend (default: sqlite)
GWI_DB_PATH=~/.gwi/data.db      # SQLite path
LOG_LEVEL=info                  # Logging level
```

### Internal/Dev Only

```bash
# Hook system (enables internal auditing)
GWI_AGENTFS_ENABLED=true        # Enable AgentFS audit hook
GWI_AGENTFS_ID=gwi-agent        # AgentFS agent identifier
GWI_BEADS_ENABLED=true          # Enable Beads task tracking hook
GWI_HOOK_DEBUG=true             # Debug logging for hooks

# Legacy (deprecated, use above)
GWI_USE_AGENTFS=true            # Enable AgentFS (internal)
GWI_USE_BEADS=true              # Enable Beads (internal)
HARD_MODE=true                  # Enable strict CI checks (internal)
```

---

## Development Commands

```bash
# Install
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint

# Development
npm run dev

# CLI (after build)
node apps/cli/dist/index.js --help
```

---

## Do NOT

- Require AgentFS or Beads for user-facing features
- Add dependencies that users must install separately
- Expose multi-agent complexity in the CLI interface
- Hard-code model names (use config/env)
- Break the storage interface contract

---

## Do

- Keep user experience simple (one command does the job)
- Use storage interfaces for all persistence
- Test with the default SQLite storage
- Document any internal-only features clearly
- Design for future hosted deployment

---

## MVP Scope (v0.1)

**Goal:** CLI that helps with PR conflict resolution

```bash
gwi resolve https://github.com/org/repo/pull/123
```

**In scope:**
- Triage, Planner, Coder, Reviewer agents
- GitHub PR/issue reading
- Merge conflict detection and resolution
- PR comment generation

**Out of scope (for now):**
- GitLab support
- Web dashboard
- Slack integration
- Complex A2A gateway infrastructure

---

## Documentation Standards (Docs-Filing v4 + 6767)

This repository follows **docs-filing v4** for all documentation:

### Key Rules

1. **All docs live in `000-docs/`** (flat, no subdirectories)
2. **Naming convention:** `NNN-CC-ABCD-short-description.md`
   - `NNN`: Chronological sequence (001-999)
   - `CC`: Category code (DR, AA, AT, etc.)
   - `ABCD`: Type code (ADRC, AACR, STND, etc.)
3. **After each phase:** Create an AAR using template `6767-b-AA-TMPL-after-action-report-template.md`
4. **Canonical standards:** Files starting with `6767-` are cross-repo standards

### Category Codes Used in This Repo

| Code | Category | Common Types |
|------|----------|--------------|
| DR | Documentation & Reference | ADRC (ADR), STND, GUID |
| AA | After Action & Review | AACR (AAR), AUDT |
| AT | Architecture & Technical | ADEC, ARCH |

### Templates

- **AAR Template:** `000-docs/6767-b-AA-TMPL-after-action-report-template.md`
- **Filing Standard:** `000-docs/6767-a-DR-STND-document-filing-system-standard-v4.md`

---

## Claude Internal Hook Protocol (Post-Message Audit)

**This section defines a behavioral contract for Claude when working on git-with-intent.**

When you (Claude) work in this repository, you must consider running a post-message audit after completing meaningful work. This audit logs your activity to AgentFS (audit trail) and Beads (task tracking).

### When to Run the Audit

**After EVERY message where:**

1. You changed files in git-with-intent (created, modified, deleted)
2. You completed a clearly defined phase or sub-phase task
3. You introduced new TODOs or follow-up work
4. You performed multi-step or non-trivial work (architecture, refactor, multi-file changes)

### Mental Checklist (Required)

Before ending a message, ask yourself:

- [ ] Did I perform non-trivial work (architecture, refactor, new files)?
- [ ] Is there follow-up work that won't be completed in this message?
- [ ] Would future-me benefit from an AgentFS audit record (who/what/why)?
- [ ] Would a Beads task help track longer-lived or blocked work?

**If YES to any of the above**, run the post-message script.

### How to Run the Audit

```bash
npm run claude:after-message -- '{
  "runType": "PLAN",
  "agentRole": "FOREMAN",
  "inputSummary": "What you were asked to do or analyze",
  "outputSummary": "What you produced or changed",
  "metadata": { "phase": "4", "subPhase": "4.1", "filesChanged": 3 }
}'
```

### Run Type Guidelines

| Work Type | runType | agentRole | Example |
|-----------|---------|-----------|---------|
| Architecture/docs | `PLAN` | `FOREMAN` | Designing a new system, writing ADRs |
| Code changes | `RESOLVE` | `CODER` | Implementing features, fixing bugs |
| Full phase work | `AUTOPILOT` | `FOREMAN` | Completing an entire phase end-to-end |
| Classification | `TRIAGE` | `TRIAGE` | Analyzing issues, categorizing work |
| Code review | `REVIEW` | `REVIEWER` | Reviewing PR, suggesting changes |

### Example Invocations

**After completing Phase 4 design work:**
```bash
npm run claude:after-message -- '{
  "runType": "PLAN",
  "agentRole": "FOREMAN",
  "inputSummary": "Phase 4: Claude Internal Hook Protocol design",
  "outputSummary": "Created ADR 016, updated CLAUDE.md with protocol, implemented claude-after-message script",
  "metadata": { "phase": "4", "filesCreated": 3, "filesModified": 2 }
}'
```

**After fixing a bug:**
```bash
npm run claude:after-message -- '{
  "runType": "RESOLVE",
  "agentRole": "CODER",
  "inputSummary": "Fix hook runner timeout issue",
  "outputSummary": "Updated runner.ts to handle Promise.race correctly",
  "metadata": { "bugFix": true, "files": ["packages/engine/src/hooks/runner.ts"] }
}'
```

### Even If You Don't Actually Run It

Even if you cannot execute the script in this environment, you should **behave as if this step exists**. This means:

1. Document your work clearly in commit messages
2. Note any follow-up work explicitly
3. Consider what audit trail would be useful for debugging

### Every Session Checklist

When starting or resuming work on git-with-intent:

- [ ] Is AgentFS configured? (`GWI_AGENTFS_ENABLED=true`, `GWI_AGENTFS_ID=gwi-internal`)
- [ ] Is Beads configured? (`GWI_BEADS_ENABLED=true`)
- [ ] Will I run Post-Message Audit for non-trivial work?

### AgentFS and Beads Are LIVE (Phase 6)

**As of Phase 6, AgentFS and Beads are initialized and live in this repo.**

When working in git-with-intent, assume Beads and AgentFS are installed and initialized. Use `bd create`, `bd ready`, `bd update`, and `bd dep add` for task planning, and rely on AgentFS for per-run state and tool audit logs.

When unsure, run `bd quickstart` inside the repo to refresh your mental model.

```bash
# Verify both systems are working
bd doctor                    # Check Beads health
ls -la .agentfs/gwi.db*      # Check AgentFS database

# Run hook smoke test
export GWI_AGENTFS_ENABLED=true GWI_AGENTFS_ID=gwi GWI_BEADS_ENABLED=true
npm run test:hooks:smoke

# Verify Beads recorded the test task
bd list --json | jq '.[0:3]'
```

### (Re-)Initializing AgentFS and Beads

If starting fresh or on a new machine:

```bash
# AgentFS initialization (one-time)
npm run agentfs:init         # Creates .agentfs/gwi.db

# Beads initialization (one-time, likely already done)
bd init                      # Creates .beads/ directory

# Set environment variables
export GWI_AGENTFS_ENABLED=true
export GWI_AGENTFS_ID=gwi
export GWI_BEADS_ENABLED=true
export GWI_HOOK_DEBUG=true   # Optional: verbose logging
```

---

## Agent Hook System (Internal)

The agent execution engine includes a hook system that runs after each agent step, message, or run.

### Hook Architecture

```
Agent Step → [AgentHookRunner] → [AgentFSHook (audit)] → AgentFS
                              → [BeadsHook (tasks)]  → Beads
```

### Configuration

```typescript
// packages/engine/src/hooks/config.ts
const runner = await buildDefaultHookRunner();

// After each agent step:
await runner.afterStep({
  runId: 'run-123',
  runType: 'RESOLVE',
  stepId: 'step-456',
  agentRole: 'CODER',
  stepStatus: 'completed',
  timestamp: new Date().toISOString(),
});
```

### Rules for Hook Usage

1. **Hooks are internal-only** - External runtime does not require hooks
2. **Hooks never crash the pipeline** - Errors are logged, not thrown
3. **Hooks are configurable** - Enabled via environment variables
4. **New sub-agents should use the existing hook pipeline** - Don't invent custom logging

### Available Hooks

| Hook | Purpose | Environment Variable |
|------|---------|---------------------|
| `AgentFSHook` | Audit tool calls to AgentFS | `GWI_AGENTFS_ENABLED=true` |
| `BeadsHook` | Create/update Beads issues | `GWI_BEADS_ENABLED=true` |

See `000-docs/014-DR-ADRC-agent-hook-system-policy.md` for the full policy.

---

## References

- **Architecture Decision (Runtime vs DevTools):** `000-docs/004-DR-ADRC-runtime-vs-devtools.md`
- **AgentFS/Beads Policy:** `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
- **Agent Hook System Policy:** `000-docs/014-DR-ADRC-agent-hook-system-policy.md`
- **Claude Internal Hook Protocol:** `000-docs/016-DR-ADRC-claude-internal-hook-protocol.md`
- **Directory Structure:** `000-docs/007-DR-ADRC-directory-structure.md`
- **DevOps Playbook (Internal):** `000-docs/003-AA-AUDT-appaudit-devops-playbook.md`
- **Filing Standard:** `000-docs/6767-a-DR-STND-document-filing-system-standard-v4.md`
- **AAR Template:** `000-docs/6767-b-AA-TMPL-after-action-report-template.md`
- **Session Start Command:** `.claude/commands/session-start.md`
