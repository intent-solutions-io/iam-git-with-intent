# 017-AA-AACR: Phase 4 After-Action Report - Claude Internal Hook Protocol

**Document ID:** 017-AA-AACR
**Document Type:** After-Action Completion Report (AAR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** FINAL
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Phase:** Phase 4 - Claude Internal Hook Protocol

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `017` = chronological sequence number
> - `AA` = Administrative category
> - `AACR` = After-Action Completion Report type

---

## Metadata

| Field | Value |
|-------|-------|
| **Phase** | 4 |
| **Repo/App** | git-with-intent |
| **Owner** | Jeremy Longshore |
| **Date/Time (CST)** | 2025-12-15 CST |
| **Status** | FINAL |
| **Related Issues/PRs** | N/A |
| **Commit(s)** | phase-4-claude-internal-hook branch |

---

## Beads / Task IDs Touched

**Beads Status:** Not yet active in this session

| Task ID | Status | Title |
|---------|--------|-------|
| N/A | - | Phase 4 was implementation focused |

---

## Executive Summary

- **Corrected design direction**: Phase 3 created engine hooks for runtime; Phase 4 clarifies these are for Claude's internal use when working on this repo
- **Created claude-after-message CLI script** that Claude can invoke after completing work
- **Updated CLAUDE.md** with explicit behavioral contract for post-message auditing
- **Created ADR 016** documenting the Claude Internal Hook Protocol
- **Wired npm script** (`npm run claude:after-message`) for easy invocation
- **Protocol is internal only** - not shipped to users, uses existing hook infrastructure
- **Added getHooks() method** to AgentHookRunner for script introspection

---

## What Changed

### New Files Created

| File | Purpose |
|------|---------|
| `scripts/claude-after-message.ts` | CLI entrypoint for Claude post-message audit |
| `000-docs/016-DR-ADRC-claude-internal-hook-protocol.md` | ADR defining the protocol |
| `000-docs/017-AA-AACR-phase-4-*.md` | This AAR |

### Files Modified

| File | Changes |
|------|---------|
| `CLAUDE.md` | Added "Claude Internal Hook Protocol" section with checklist and examples |
| `package.json` | Added `claude:after-message` npm script |
| `packages/engine/src/hooks/runner.ts` | Added `getHooks()` method |

---

## Why

### Problem

Phase 3 created a hook system (`AgentHookRunner`, `AgentFSHook`, `BeadsHook`) but left ambiguity about who uses it and when:
- The hooks were designed for the GWI runtime pipeline
- There was no protocol for Claude (the AI assistant) to audit its own work
- Claude's work across sessions had no systematic tracking

### Solution

Define a **behavioral contract** specifically for Claude that:
1. Tells Claude when to run audits (non-trivial work, follow-up needed, phase completion)
2. Provides a simple CLI command to invoke existing hooks
3. Documents the protocol in CLAUDE.md so it persists across sessions
4. Creates an ADR so the decision is explicit and traceable

### Key Insight

The hooks are most valuable when Claude uses them to track its OWN work in this repo, not just for runtime agent execution. This creates a self-documenting development process.

---

## How to Verify

```bash
# Step 1: Check the script exists
ls scripts/claude-after-message.ts

# Step 2: Verify npm script is wired
npm run claude:after-message -- --help

# Step 3: Check CLAUDE.md has protocol section
grep -A 5 "Claude Internal Hook Protocol" CLAUDE.md

# Step 4: Check ADR exists
ls 000-docs/016-DR-ADRC-claude-internal-hook-protocol.md

# Step 5: Test the script (with hooks disabled, just validates parsing)
npm run claude:after-message -- '{"runType": "PLAN", "agentRole": "FOREMAN", "inputSummary": "test"}'
```

---

## Risks / Gotchas

1. **Manual discipline required**: Claude must remember to run the audit; there's no automatic enforcement
2. **Environment setup needed**: For full functionality, AgentFS and Beads must be initialized
3. **ts-node required**: The script uses ts-node for TypeScript execution; ensure it's installed
4. **ESM modules**: The script uses ES modules (--esm flag); may need Node 18+ for full compatibility

---

## Rollback Plan

1. Delete `scripts/claude-after-message.ts`
2. Remove `claude:after-message` script from `package.json`
3. Revert CLAUDE.md changes (remove Claude Internal Hook Protocol section)
4. Delete `000-docs/016-DR-ADRC-claude-internal-hook-protocol.md`
5. Revert `getHooks()` addition to runner.ts

---

## Open Questions

- [ ] Should the protocol be enforced via a pre-commit hook or CI check?
- [ ] Should Claude sessions auto-query AgentFS for prior context on startup?
- [ ] Would a VSCode extension or Claude Code integration be useful for invoking the script?

---

## Next Actions

| Action | Owner | Due |
|--------|-------|-----|
| Test hooks with actual AgentFS/Beads installation | Jeremy | Phase 5 |
| Consider automated enforcement of protocol | Jeremy | Future |
| Add session startup query to AgentFS | Jeremy | Future |

---

## Evidence Links / Artifacts

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `scripts/claude-after-message.ts` | created | CLI entrypoint for post-message audit |
| `000-docs/016-DR-ADRC-claude-internal-hook-protocol.md` | created | ADR for the protocol |
| `000-docs/017-AA-AACR-phase-4-*.md` | created | This AAR |
| `CLAUDE.md` | modified | Added protocol section and checklist |
| `package.json` | modified | Added npm script |
| `packages/engine/src/hooks/runner.ts` | modified | Added getHooks() method |

### Commits

| Hash | Message |
|------|---------|
| (pending) | feat: Phase 4 - Claude Internal Hook Protocol |

### AgentFS Snapshots

**AgentFS Status:** Not yet initialized (protocol created but not tested with live AgentFS)

### External References

- AgentFS: https://github.com/tursodatabase/agentfs
- Beads: https://github.com/steveyegge/beads
- Phase 3 AAR: 000-docs/015-AA-AACR-phase-3-agentfs-beads-hooks-and-repo-wiring.md

---

## Phase Completion Checklist

- [x] CLAUDE.md contains "Claude Internal Hook Protocol" section
- [x] CLAUDE.md contains "Post-Message Audit" checklist
- [x] CLAUDE.md contains example invocations of `npm run claude:after-message`
- [x] CLI entrypoint exists (`scripts/claude-after-message.ts`)
- [x] CLI accepts JSON context and builds AgentRunContext
- [x] CLI uses AgentHookRunner to invoke hooks
- [x] npm script wired (`claude:after-message`)
- [x] Hook configuration via env vars documented
- [x] ADR 016 created for Claude Internal Hook Protocol
- [x] Phase 4 AAR created (this document)
- [x] All work on dedicated branch (`phase-4-claude-internal-hook`)

---

## Technical Details

### Script Usage

```bash
# Basic invocation
npm run claude:after-message -- '{
  "runType": "PLAN",
  "agentRole": "FOREMAN",
  "inputSummary": "What was requested",
  "outputSummary": "What was produced",
  "metadata": { "phase": "4" }
}'

# Help
npm run claude:after-message -- --help
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `GWI_AGENTFS_ENABLED` | Enable AgentFS audit | `false` |
| `GWI_AGENTFS_ID` | AgentFS agent identifier | — |
| `GWI_BEADS_ENABLED` | Enable Beads tracking | `false` |
| `GWI_HOOK_DEBUG` | Debug logging | `false` |

### Run Type Mapping

| Work Type | runType | agentRole |
|-----------|---------|-----------|
| Architecture/docs | `PLAN` | `FOREMAN` |
| Code changes | `RESOLVE` | `CODER` |
| Full phase work | `AUTOPILOT` | `FOREMAN` |
| Classification | `TRIAGE` | `TRIAGE` |
| Code review | `REVIEW` | `REVIEWER` |

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
