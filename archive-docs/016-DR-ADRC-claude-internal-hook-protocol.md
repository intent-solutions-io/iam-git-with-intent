# 016-DR-ADRC: Claude Internal Hook Protocol

**Document ID:** 016-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `016` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Phase 3 created a generic engine hook system (`AgentHookRunner`, `AgentFSHook`, `BeadsHook`) that can run after agent steps. However, that system was designed for the runtime pipeline—it would be used by the GWI engine when executing agent workflows.

**The Missing Piece:** There was no protocol for Claude (the AI assistant) to use when working IN this repository. Claude performs significant work—implementing phases, writing code, creating docs—but there was no systematic way to:

1. Log Claude's activity to AgentFS for audit trails
2. Create Beads issues for follow-up work
3. Track what Claude did across sessions

This ADR defines a **behavioral contract for Claude** that uses the existing hook infrastructure to audit its own work.

---

## Decision

**Implement a "Claude Internal Hook Protocol" that tells Claude what to do after every message where it works on git-with-intent.**

### Core Contract

After every message where Claude:
- Changed files in git-with-intent, OR
- Completed a phase/sub-phase task, OR
- Introduced follow-up work/TODOs

Claude must consider running a post-message audit by invoking:

```bash
npm run claude:after-message -- '{
  "runType": "PLAN",
  "agentRole": "FOREMAN",
  "inputSummary": "What was requested",
  "outputSummary": "What was produced",
  "metadata": { "phase": "4" }
}'
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Working Session                       │
│                                                                  │
│  User Prompt → Claude Execution → Files Changed                  │
│                                                                  │
│                       ▼                                          │
│              ┌───────────────────┐                              │
│              │ Post-Message      │                              │
│              │ Mental Checklist  │                              │
│              │                   │                              │
│              │ - Non-trivial?    │                              │
│              │ - Follow-up?      │                              │
│              │ - Audit useful?   │                              │
│              │ - Bead needed?    │                              │
│              └─────────┬─────────┘                              │
│                        │                                         │
│              (If YES to any)                                     │
│                        │                                         │
│                        ▼                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ npm run claude:after-message -- '<json-context>'           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                scripts/claude-after-message.ts                   │
│                                                                  │
│  1. Parse JSON context                                          │
│  2. Build AgentRunContext                                        │
│  3. Call buildDefaultHookRunner()                                │
│  4. Execute runner.afterStep(ctx)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│      AgentFSHook        │   │       BeadsHook         │
│                         │   │                         │
│ - tools.record()        │   │ - bd create             │
│ - kv.set()              │   │ - bd update             │
│ - Audit trail           │   │ - bd close              │
└─────────────────────────┘   └─────────────────────────┘
```

### This is NOT Part of Public Runtime

This protocol is:
- **Internal to this repository** - only for Claude working on git-with-intent
- **Not shipped to users** - the `claude:after-message` script is not part of the `gwi` CLI
- **Optional** - if AgentFS/Beads are not configured, the script does nothing

External users of Git With Intent never interact with this protocol.

---

## Implementation

### 1. CLI Entrypoint

**File:** `scripts/claude-after-message.ts`

A simple TypeScript script that:
1. Accepts a JSON argument with context
2. Builds an `AgentRunContext`
3. Calls `buildDefaultHookRunner()` to get the configured hooks
4. Executes `runner.afterStep(ctx)`

### 2. npm Script

**In `package.json`:**
```json
{
  "scripts": {
    "claude:after-message": "npx ts-node --esm scripts/claude-after-message.ts"
  }
}
```

### 3. CLAUDE.md Documentation

A new section "Claude Internal Hook Protocol (Post-Message Audit)" that:
- Defines when to run the audit
- Provides a mental checklist
- Shows example invocations
- Explains run type mapping

### 4. Environment Configuration

The hooks are controlled by existing environment variables:

| Variable | Purpose |
|----------|---------|
| `GWI_AGENTFS_ENABLED=true` | Enable AgentFS audit hook |
| `GWI_AGENTFS_ID=gwi-internal` | AgentFS agent identifier |
| `GWI_BEADS_ENABLED=true` | Enable Beads task tracking |
| `GWI_HOOK_DEBUG=true` | Enable debug logging |

---

## Run Type Mapping

When Claude invokes the post-message script, it should choose appropriate values:

| Work Type | runType | agentRole |
|-----------|---------|-----------|
| Architecture/design/docs | `PLAN` | `FOREMAN` |
| Code implementation | `RESOLVE` | `CODER` |
| Full phase execution | `AUTOPILOT` | `FOREMAN` |
| Issue analysis | `TRIAGE` | `TRIAGE` |
| Code review | `REVIEW` | `REVIEWER` |

---

## Consequences

### Positive

- **Audit trail**: Claude's work is recorded in AgentFS for debugging and replay
- **Task tracking**: Complex or blocked work creates Beads issues for follow-up
- **Session continuity**: Future Claude sessions can query AgentFS to understand past work
- **Discipline**: The checklist encourages Claude to be deliberate about documentation
- **Non-invasive**: Uses existing hook infrastructure, no new dependencies

### Negative

- **Manual discipline required**: Claude must remember to run the audit (no automatic enforcement)
- **Not automatic**: The hook doesn't run unless Claude explicitly invokes it
- **Environment setup**: Requires AgentFS/Beads initialization for full functionality

### Risks

| Risk | Mitigation |
|------|------------|
| Claude forgets to run audit | Checklist in CLAUDE.md, explicit protocol section |
| Hooks fail silently | Hook runner logs errors, doesn't crash |
| Audit spam | Claude uses mental checklist to filter trivial work |
| Missing context | Script defaults to reasonable values for missing fields |

---

## Compliance with Existing Policy

This ADR complies with:

1. **006-DR-ADRC (AgentFS/Beads Policy)**: Uses AgentFS and Beads for internal dev only
2. **014-DR-ADRC (Agent Hook System Policy)**: Reuses existing hook infrastructure
3. **Runtime vs DevTools separation**: Script is internal, not shipped to users

---

## References

- **006-DR-ADRC**: AgentFS and Beads Internal Tooling Policy
- **014-DR-ADRC**: Agent Hook System Policy
- **CLAUDE.md**: Claude Internal Hook Protocol section
- **scripts/claude-after-message.ts**: CLI entrypoint implementation
- AgentFS: https://github.com/tursodatabase/agentfs
- Beads: https://github.com/steveyegge/beads

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
