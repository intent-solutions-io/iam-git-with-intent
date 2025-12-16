# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Git With Intent** is an AI-powered DevOps automation platform that handles PRs, merge conflicts, and issue-to-PR workflows using a multi-agent architecture built on Vertex AI Agent Engine, AgentFS, and Beads.

**CLI Command:** `gwi` (git with intent)
**Architecture Model:** Based on `bobs-brain` (Vertex AI Agent Engine, A2A Protocol)

---

## Non-Negotiable Dependencies

### 1. AgentFS (Turso)
```bash
npm install agentfs-sdk
```

**Use for:** All agent state management, file operations, audit trail, FUSE mount for git.

```typescript
import { AgentFS } from 'agentfs-sdk';
const agent = await AgentFS.open({ id: 'my-agent-name' });
await agent.kv.set('key', value);
await agent.fs.writeFile('/path', content);
await agent.tools.record('tool_name', startTime, endTime, input, output);
```

### 2. Beads (steveyegge/beads)
```bash
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
bd init --quiet
```

**Use for:** ALL task tracking (NO markdown TODOs), agent memory, work coordination.

```bash
bd create "Task title" --description="Details" -t task -p 1 --json
bd ready --json
bd update bd-42 --status in_progress
bd close bd-42 "Completion notes"
```

### 3. Vertex AI Agent Engine
- A2A protocol for agent communication
- Session management with persistent state

---

## Development Workflow

### Before Starting ANY Task
```bash
bd ready --json           # Check for ready work
bd update <id> --status in_progress  # Claim work
```

### If You Discover New Work
```bash
bd create "Found: <description>" -t task -p 2 --deps discovered-from:<current-issue>
```

### Code Standards
- **Language:** TypeScript (primary), Python (Vertex AI SDK)
- **Runtime:** Node.js 20+, Python 3.11+
- **Package Manager:** pnpm (monorepo)
- **Testing:** Vitest (unit), Playwright (E2E)
- **Linting:** ESLint + Prettier

### Commit Messages
```
<type>(<agent-name>): description

[Task: bd-xxxx]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`

---

## Agent Architecture

### Agents Are NOT Functions
Each agent must be:
- **Stateful:** Uses AgentFS for persistent memory
- **Autonomous:** Makes decisions within its domain
- **Collaborative:** Uses A2A protocol to communicate
- **Observable:** Logs all actions to AgentFS toolcalls

### Current Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| Orchestrator | - | Routes work, manages workflow |
| Triage | Gemini Flash | Classify complexity, route work |
| Resolver | Claude Sonnet/Opus | Resolve merge conflicts |
| Reviewer | Claude Sonnet | Quality check, security scan |
| Coder | Claude Sonnet | Issue → Code implementation |
| Test | Gemini Flash | Generate and run tests |
| Docs | Gemini Flash | Update documentation |

### Creating a New Agent
```typescript
import { AgentFS } from 'agentfs-sdk';
import { Agent, A2AMessage } from '@pr-agent/core';

export class MyAgent extends Agent {
  private agentfs: AgentFS;

  async initialize() {
    this.agentfs = await AgentFS.open({ id: 'my-agent' });
  }

  async handleMessage(message: A2AMessage) {
    await this.agentfs.tools.record('handle_message', Date.now(), ...);
    const result = await this.process(message.payload);
    await this.agentfs.kv.set('last_processed', result);
    return this.createResponse(message, result);
  }
}
```

---

## File Structure

```
git-with-intent/
├── apps/
│   ├── cli/           # CLI: gwi resolve <url>
│   ├── api/           # API Gateway (Cloud Run)
│   └── web/           # Dashboard (Phase 4)
├── packages/
│   ├── agents/        # All agent implementations
│   ├── core/          # Shared: AgentFS, Beads, A2A, Models
│   └── integrations/  # GitHub, GitLab, Slack
├── infrastructure/    # Terraform, Docker
├── docs/              # Documentation
├── .beads/            # Beads database (git-tracked)
└── .agentfs/          # AgentFS databases
```

---

## Common Commands

```bash
# Beads
bd init --quiet
bd create "Title" -t task -p 1
bd ready --json
bd update bd-42 --status in_progress
bd close bd-42 "Done"

# AgentFS
agentfs run /bin/bash
agentfs mount my-agent ./workspace

# Development
pnpm install
pnpm dev
pnpm build
pnpm test
```

---

## Debug an Agent

```bash
sqlite3 .agentfs/resolver-agent.db "SELECT * FROM kv;"
sqlite3 .agentfs/resolver-agent.db "SELECT * FROM toolcalls ORDER BY started_at DESC LIMIT 10;"
bd show <issue-id>
bd list --verbose
```

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
GITHUB_TOKEN=ghp_...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...
AGENT_MAIL_URL=http://localhost:8765
LOG_LEVEL=debug
```

---

## Do NOT

- Use markdown for task tracking (use Beads)
- Store state in memory only (use AgentFS)
- Make agents that are just function wrappers
- Skip the Reviewer agent for any code changes
- Merge without CI passing
- Hard-code model names (use model selector)

---

## Do

- File Beads issues for all discovered work
- Use AgentFS for ALL agent state
- Log all tool calls to AgentFS audit trail
- Follow A2A protocol for agent communication
- Escalate to human when confidence < threshold
- Write tests for new functionality

---

## Document Filing (000-docs/)

All docs follow the 6767 filing standard:
- Project docs: `NNN-CC-ABCD-short-description.md`
- Canonical standards: `6767-{letter}-CC-ABCD-short-description.md`
- All docs flat in `000-docs/` (no subdirectories)
- Every phase produces an AAR: `NNN-AA-AACR-phase-n-description.md`

---

## MVP Scope (Phase 1)

**Goal:** CLI that resolves merge conflicts on GitHub PRs

```bash
gwi resolve https://github.com/org/repo/pull/123
```

**In scope:** Triage Agent, Resolver Agent, Reviewer Agent, GitHub integration
**Out of scope:** GitLab, VS Code extension, web dashboard, issue→PR workflow

---

## References

- **Architecture:** `docs/vision/architecture.md`
- **Product:** `docs/vision/PRD.md`
- **MVP Scope:** `docs/vision/mvp-scope.md`
- **Beads:** https://github.com/steveyegge/beads
- **AgentFS:** https://github.com/tursodatabase/agentfs
- **bobs-brain:** https://github.com/intent-solutions-io/bobs-brain.git
- This is a multi-agent DevOps automation platform. Before writing any code, clone and study these non-negotiable dependencies:

1. **AgentFS** (Turso) - Agent filesystem and state management
   https://github.com/tursodatabase/agentfs
   - SQLite-backed filesystem for agents
   - Key-value store for state
   - Toolcall audit trail
   - FUSE support for native git operations

2. **Beads** (Steve Yegge) - Agent memory and task coordination
   https://github.com/steveyegge/beads
   - Graph-based issue tracking (NOT markdown)
   - Dependency tracking (blocks, related, parent-child, discovered-from)
   - Agent Mail for real-time multi-agent coordination
   - Git-versioned JSONL

3. **Reference architecture** - bobs-brain pattern
   https://github.com/intent-solutions-io/bobs-brain
   - Vertex AI Agent Engine
   - A2A protocol
   - Session Cache
   - Hard Mode architecture

4. **Project template**
   https://github.com/intent-solutions-io/project-template