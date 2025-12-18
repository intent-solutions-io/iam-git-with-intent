# 007-DR-ADRC: Directory Structure for SaaS-Ready Architecture

**Document ID:** 007-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `007` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Git With Intent is evolving into a commercial SaaS product. The directory structure must:

1. Support multiple deployment targets (CLI, API, web)
2. Separate public runtime from internal dev tools
3. Enable clean npm workspace dependencies
4. Follow monorepo best practices with Turborepo

The structure must make it immediately clear what code is user-facing vs internal-only.

---

## Decision

**Adopt a layered monorepo structure with clear boundaries.**

### Top-Level Structure

```
git-with-intent/
├── .claude/                    # Claude Code settings and hooks
├── .github/                    # GitHub workflows and config
├── 000-docs/                   # Documentation (6767 filing)
├── apps/                       # Deployable applications
│   ├── cli/                    # gwi CLI (public)
│   ├── api/                    # REST API (future)
│   └── web/                    # Web dashboard (future)
├── packages/                   # Shared libraries
│   ├── core/                   # Core abstractions and types
│   │   └── src/
│   │       ├── storage/        # PRStore, RunStore, SettingsStore
│   │       ├── models/         # LLM integration
│   │       ├── types/          # Shared TypeScript types
│   │       └── index.ts
│   └── agents/                 # Agent implementations
│       └── src/
│           ├── base/           # BaseAgent class
│           ├── orchestrator/   # Workflow coordinator
│           ├── triage/         # Complexity analysis
│           ├── resolver/       # Conflict resolution
│           ├── reviewer/       # Code review
│           └── index.ts
├── internal/                   # Intent Solutions internal tools
│   ├── agentfs-tools/          # AgentFS adapters
│   ├── beads-tools/            # Beads adapters
│   └── ci-hardmode/            # Hard Mode CI
├── infra/                      # Infrastructure as Code
│   ├── terraform/              # GCP/Cloud resources
│   └── docker/                 # Container definitions
├── scripts/                    # Development and CI scripts
│   ├── ci/                     # CI/CD scripts
│   └── dev/                    # Development utilities
├── turbo.json                  # Turborepo configuration
├── package.json                # Workspace root
└── CLAUDE.md                   # Repository conventions
```

---

## Layer Definitions

### Layer 1: Documentation (`000-docs/`)

**Purpose:** All project documentation, ADRs, AARs, standards

**Rules:**
- Flat directory structure (no subdirectories)
- Files follow `NNN-CC-ABCD-name.md` naming convention
- 6767 templates imported from project-template

### Layer 2: Applications (`apps/`)

**Purpose:** Deployable entry points for the product

**Rules:**
- Each app is a separate npm package
- Apps depend on `packages/*` only
- Apps NEVER import from `internal/`
- Each app has its own deployment pipeline

| App | Description | Status |
|-----|-------------|--------|
| `cli` | Command-line interface (`gwi`) | Active |
| `api` | REST API for hosted service | Future |
| `web` | Web dashboard | Future |

### Layer 3: Packages (`packages/`)

**Purpose:** Shared libraries used by apps

**Rules:**
- Pure TypeScript, no deployment concerns
- Published to npm (or internal registry)
- NEVER import from `internal/`
- NEVER import from `apps/`

| Package | Description | Dependencies |
|---------|-------------|--------------|
| `@gwi/core` | Types, interfaces, utilities | None |
| `@gwi/agents` | Agent implementations | `@gwi/core` |

### Layer 4: Internal (`internal/`)

**Purpose:** Intent Solutions development tools

**Rules:**
- NOT published to npm
- NOT imported by `apps/` or `packages/`
- MAY import from `packages/`
- Implements adapters for internal tools (AgentFS, Beads)

See: 006-DR-ADRC (AgentFS/Beads Policy)

### Layer 5: Infrastructure (`infra/`)

**Purpose:** Deployment and infrastructure configuration

**Rules:**
- Terraform modules for GCP resources
- Docker configurations for containers
- No runtime code (only infrastructure)

---

## Agent Architecture

### Orchestrator Pattern

The multi-agent system uses an orchestrator (foreman) coordinating specialists:

```
┌─────────────────────────────────────────────────────┐
│                    Orchestrator                      │
│            (Workflow Management, Routing)            │
└─────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Triage    │  │  Resolver   │  │  Reviewer   │
│ (Analysis)  │  │ (Conflicts) │  │  (Review)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Agent Directory

```
packages/agents/src/
├── base/
│   └── agent.ts          # BaseAgent abstract class
├── orchestrator/
│   └── index.ts          # OrchestratorAgent
├── triage/
│   └── index.ts          # TriageAgent
├── resolver/
│   └── index.ts          # ResolverAgent
└── reviewer/
    └── index.ts          # ReviewerAgent
```

### Future Agents

| Agent | Purpose | Status |
|-------|---------|--------|
| `PlannerAgent` | Generate execution plans | Planned |
| `CoderAgent` | Write/modify code | Planned |
| `ValidatorAgent` | Run tests, verify changes | Planned |
| `DocsAgent` | Update documentation | Planned |

---

## Import Rules

### Allowed Imports

```
apps/cli     ──▶ packages/core
apps/cli     ──▶ packages/agents
packages/agents ──▶ packages/core
internal/*   ──▶ packages/core
internal/*   ──▶ packages/agents
```

### Forbidden Imports

```
packages/core   ──✗──▶ apps/*
packages/core   ──✗──▶ internal/*
packages/agents ──✗──▶ apps/*
packages/agents ──✗──▶ internal/*
apps/*          ──✗──▶ internal/*
```

### Enforcement

CI checks (`scripts/ci/check_imports.sh`) will fail if forbidden imports are detected.

---

## Workspace Configuration

### Root `package.json`

```json
{
  "name": "git-with-intent",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  }
}
```

### Turborepo Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^typecheck"]
    }
  }
}
```

---

## Consequences

### Positive

- Clear separation between public runtime and internal tools
- Standard monorepo patterns (familiar to contributors)
- Turborepo enables fast, cached builds
- Easy to add new apps or packages

### Negative

- More directories to navigate
- Import rules require discipline
- Internal tools are somewhat isolated

### Risks

| Risk | Mitigation |
|------|------------|
| Import rule violations | CI enforcement script |
| Package version drift | Turborepo dependency tracking |
| Internal code leaking | Code review checklist |

---

## Migration Checklist

- [x] Create `internal/` directory structure
- [x] Create `internal/README.md`
- [x] Create `internal/agentfs-tools/`
- [x] Create `internal/beads-tools/`
- [ ] Update `turbo.json` to exclude `internal/` from builds
- [ ] Create `scripts/ci/check_imports.sh`
- [ ] Update CLAUDE.md with directory reference

---

## References

- 004-DR-ADRC: Runtime vs DevTools Architecture
- 006-DR-ADRC: AgentFS and Beads Policy
- Turborepo: https://turbo.build/repo
- npm Workspaces: https://docs.npmjs.com/cli/v8/using-npm/workspaces

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
