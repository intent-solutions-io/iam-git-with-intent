# 004-DR-ADRC: Runtime vs Dev Tools Architecture Decision

**Document ID:** 004-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `004` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type (not in standard table, derived from ADR + Context)

---

## Context

Git With Intent was initially designed as an internal multi-agent DevOps automation system using experimental tools (AgentFS, Beads) and a complex A2A gateway architecture. This architecture assumed:

1. Users would install and configure AgentFS for agent state
2. Users would use Beads for task tracking
3. A2A protocol gateways would be required infrastructure
4. "Hard Mode" CI rules would enforce these dependencies

However, the product vision has evolved: **Git With Intent should be a public, commercial product** that normal developers can install and use without understanding our internal tooling.

---

## Decision

**We will cleanly separate Product Runtime from Dev/Ops Tools.**

### Product Runtime (User-Facing)

Everything that affects user-visible behavior:

- CLI commands (`gwi triage`, `gwi resolve`, etc.)
- Future hosted API
- Future web UI

**Requirements:**
- Depend ONLY on standard, boring components
- Work out-of-the-box with `npm install`
- No requirement for AgentFS, Beads, or custom infrastructure
- Default to SQLite for local persistence
- Multi-agent orchestration runs in-process (no external A2A gateway needed)

### Dev/Ops Tools (Internal Only)

Tools used by our team for development and operations:

- AgentFS (state management for dev environments)
- Beads (task tracking for our team)
- Hard Mode CI rules
- A2A gateway (for distributed agent testing)

**Requirements:**
- Behind feature flags or in `internal/` directory
- Opt-in only (environment variables)
- Safe to completely remove without affecting users
- Not documented in user-facing docs

---

## Storage Architecture

### Interfaces

All persistence MUST go through swappable interfaces:

```typescript
// packages/core/src/storage/interfaces.ts

/**
 * Store for PR metadata and state
 */
export interface PRStore {
  savePR(pr: PRMetadata): Promise<void>;
  getPR(id: string): Promise<PRMetadata | null>;
  getPRByUrl(url: string): Promise<PRMetadata | null>;
  listPRs(filter?: PRFilter): Promise<PRMetadata[]>;
  deletePR(id: string): Promise<void>;
}

/**
 * Store for multi-agent run tracking
 */
export interface RunStore {
  createRun(prId: string, type: RunType): Promise<Run>;
  getRun(runId: string): Promise<Run | null>;
  getLatestRun(prId: string): Promise<Run | null>;
  listRuns(prId: string): Promise<Run[]>;

  // Step tracking
  addStep(runId: string, step: RunStep): Promise<void>;
  updateStep(runId: string, stepId: string, update: Partial<RunStep>): Promise<void>;
  getSteps(runId: string): Promise<RunStep[]>;

  // Run lifecycle
  completeRun(runId: string, result: RunResult): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
}

/**
 * Store for user/project settings
 */
export interface SettingsStore {
  get<T>(key: string, defaultValue?: T): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<Record<string, unknown>>;
}

/**
 * Combined store factory
 */
export interface StoreFactory {
  createPRStore(): PRStore;
  createRunStore(): RunStore;
  createSettingsStore(): SettingsStore;
  close(): Promise<void>;
}
```

### Default Implementation: SQLite

```typescript
// packages/core/src/storage/sqlite/index.ts

import Database from 'better-sqlite3';

export class SQLiteStoreFactory implements StoreFactory {
  private db: Database.Database;

  constructor(dbPath: string = '~/.gwi/data.db') {
    this.db = new Database(expandPath(dbPath));
    this.migrate();
  }

  createPRStore(): PRStore {
    return new SQLitePRStore(this.db);
  }

  createRunStore(): RunStore {
    return new SQLiteRunStore(this.db);
  }

  createSettingsStore(): SettingsStore {
    return new SQLiteSettingsStore(this.db);
  }
}
```

### Optional Implementations

| Implementation | Use Case | Activation |
|----------------|----------|------------|
| SQLiteStoreFactory | Default, local CLI | `GWI_STORAGE=sqlite` (default) |
| TursoStoreFactory | Edge/distributed | `GWI_STORAGE=turso` |
| PostgresStoreFactory | Hosted API | `GWI_STORAGE=postgres` |
| FirestoreStoreFactory | Firebase hosting | `GWI_STORAGE=firestore` |
| AgentFSStoreFactory | Internal dev | `GWI_STORAGE=agentfs` (internal) |

### Store Selection

```typescript
// packages/core/src/storage/index.ts

export function createStoreFactory(): StoreFactory {
  const storageType = process.env.GWI_STORAGE || 'sqlite';

  switch (storageType) {
    case 'sqlite':
      return new SQLiteStoreFactory(process.env.GWI_DB_PATH);
    case 'turso':
      return new TursoStoreFactory(process.env.TURSO_URL, process.env.TURSO_AUTH_TOKEN);
    case 'postgres':
      return new PostgresStoreFactory(process.env.DATABASE_URL);
    case 'firestore':
      return new FirestoreStoreFactory(process.env.GCP_PROJECT_ID);
    case 'agentfs':
      // Internal only - not documented for users
      return new AgentFSStoreFactory();
    default:
      return new SQLiteStoreFactory();
  }
}
```

---

## Multi-Agent Architecture

### Design Principle

Multi-agent coordination is an **implementation detail**, not a user requirement.

Users see:
```bash
gwi autopilot https://github.com/org/repo/pull/123
```

Internally, this runs:
```
TriageAgent -> PlannerAgent -> CoderAgent -> ValidatorAgent -> ReviewerAgent
```

But all of this happens **in-process** in the CLI. No external A2A gateway needed.

### Agent Interface

```typescript
// packages/agents/src/base/agent.ts

export interface AgentInput {
  prMetadata: PRMetadata;
  previousSteps?: RunStep[];
  context?: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  data: unknown;
  nextAgent?: string;
  humanReviewRequired?: boolean;
  error?: string;
}

export abstract class Agent {
  abstract name: string;
  abstract run(input: AgentInput): Promise<AgentOutput>;
}
```

### Pipeline Orchestration

```typescript
// packages/core/src/pipeline/index.ts

export class Pipeline {
  private agents: Map<string, Agent>;
  private runStore: RunStore;

  async execute(prUrl: string, type: 'triage' | 'plan' | 'resolve' | 'review' | 'autopilot'): Promise<PipelineResult> {
    const run = await this.runStore.createRun(prUrl, type);

    const agentSequence = this.getAgentSequence(type);
    let context: AgentInput = { prMetadata: await this.fetchPR(prUrl) };

    for (const agentName of agentSequence) {
      const agent = this.agents.get(agentName);
      const step = await this.runStore.addStep(run.id, { agent: agentName, status: 'running' });

      try {
        const result = await agent.run(context);
        await this.runStore.updateStep(run.id, step.id, { status: 'completed', output: result });

        if (!result.success || result.humanReviewRequired) {
          break;
        }

        context = { ...context, previousSteps: await this.runStore.getSteps(run.id) };
      } catch (error) {
        await this.runStore.updateStep(run.id, step.id, { status: 'failed', error: error.message });
        await this.runStore.failRun(run.id, error.message);
        throw error;
      }
    }

    await this.runStore.completeRun(run.id, { success: true });
    return this.buildResult(run);
  }

  private getAgentSequence(type: string): string[] {
    switch (type) {
      case 'triage': return ['triage'];
      case 'plan': return ['triage', 'planner'];
      case 'resolve': return ['triage', 'planner', 'coder'];
      case 'review': return ['triage', 'reviewer'];
      case 'autopilot': return ['triage', 'planner', 'coder', 'validator', 'reviewer'];
      default: throw new Error(`Unknown pipeline type: ${type}`);
    }
  }
}
```

---

## CI/CD Changes

### Current State (Hard Mode)

The current CI enforces:
- R1: AgentFS for ALL state
- R5: Beads for task tracking (NO markdown TODOs)
- Other "Hard Mode" rules

### New State (Optional Hard Mode)

```yaml
# .github/workflows/ci.yml

jobs:
  # Always run - standard quality gates
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm run test
      - run: npm run lint

  # Optional - only runs when HARD_MODE=true or on internal branches
  hard-mode-checks:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && (github.ref == 'refs/heads/internal' || contains(github.event.head_commit.message, '[hard-mode]'))
    steps:
      - uses: actions/checkout@v4
      - run: HARD_MODE=true bash scripts/ci/check_nodrift.sh
      - run: HARD_MODE=true bash scripts/ci/check_arv.sh
```

### Updated Scripts

```bash
# scripts/ci/check_nodrift.sh

#!/bin/bash
# Only enforce experimental tool checks if HARD_MODE is enabled

if [ "$HARD_MODE" != "true" ]; then
  echo "Skipping Hard Mode checks (set HARD_MODE=true to enable)"
  exit 0
fi

# ... existing Hard Mode checks ...
```

---

## Migration Path

### Phase 1: Interface Extraction (This PR)
- [x] Define storage interfaces
- [x] Update CLAUDE.md
- [x] Create this ADR
- [ ] Create `internal/` directory for dev tools

### Phase 2: Implementation (Next PR)
- [ ] Implement SQLiteStoreFactory
- [ ] Refactor agents to use storage interfaces
- [ ] Update CLI to use Pipeline class
- [ ] Add new commands (triage, plan, autopilot)

### Phase 3: Cleanup (Future)
- [ ] Move AgentFS/Beads wrappers to `internal/`
- [ ] Update CI to make Hard Mode optional
- [ ] Remove user-facing references to experimental tools

---

## Consequences

### Positive
- Users can install and use GWI without understanding our internal tooling
- Simpler onboarding: `npm install -g @gwi/cli && gwi resolve <url>`
- Clear separation makes the codebase easier to understand
- We can still use AgentFS/Beads internally for our own workflows

### Negative
- Maintaining two "modes" (public vs internal) adds complexity
- Some features designed for AgentFS may need reimplementation
- Internal team needs to remember which tools are internal-only

### Risks
- Feature drift between internal and public modes
- Mitigation: All user-visible features MUST work with SQLite first

---

## References

- Previous: `003-AA-AUDT-appaudit-devops-playbook.md` (now marked as internal ops doc)
- CLAUDE.md (updated with Runtime vs DevTools section)
- AgentFS: https://github.com/tursodatabase/agentfs
- Beads: https://github.com/steveyegge/beads

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
