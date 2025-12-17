# 005-AA-AACR: Phase 1 - Runtime vs DevTools Reset

> **Use this template after every phase; save AARs to `000-docs/` with NNN naming:**
> `NNN-AA-AACR-phase-<n>-short-description.md`

---

## Metadata

| Field | Value |
|-------|-------|
| **Phase** | `1` |
| **Repo/App** | `git-with-intent` |
| **Owner** | `Jeremy Longshore` |
| **Date/Time (CST)** | `2025-12-15 21:30 CST` |
| **Status** | `FINAL` |
| **Related Issues/PRs** | N/A |
| **Commit(s)** | Pending |

> **Note:** This AAR documents Phase 1 of the Git With Intent architectural reset.

---

## Beads / Task IDs Touched

| Task ID | Status | Title |
|---------|--------|-------|
| N/A | N/A | N/A |

**Beads Status:** `N/A (docs-only phase)` - Beads is an internal tool, not tracked for this docs/architecture phase.

---

## Executive Summary

- Locked in the **Runtime vs DevTools** decision as a formal ADR (004-DR-ADRC)
- Updated **CLAUDE.md** with docs-filing v4 compliance and clear runtime/devtools guidance
- Updated **003-AA-AUDT** playbook to mark AgentFS/Beads as OPTIONAL for internal ops only
- Verified **storage interfaces** (PRStore, RunStore, SettingsStore) are complete in `packages/core/src/storage/`
- Verified **SQLite default implementation** exists as the "boring backend"
- Aligned all documentation with **docs-filing v4** and **6767 standards**
- CI scripts already updated to make Hard Mode optional (HARD_MODE=true required)

---

## What Changed

### Documentation Updates

- **004-DR-ADRC-runtime-vs-devtools.md**: Added Document ID, filing standard reference, and footer
- **003-AA-AUDT-appaudit-devops-playbook.md**: Added Document ID, version bump to 1.2.0, docs-filing v4 reference, and footer
- **CLAUDE.md**: Added "Documentation Standards (Docs-Filing v4 + 6767)" section with explicit rules and references

### Code Verified (No Changes Needed)

- `packages/core/src/storage/interfaces.ts`: Complete interfaces for PRStore, RunStore, SettingsStore, StoreFactory
- `packages/core/src/storage/sqlite.ts`: SQLite implementation of all storage interfaces
- `packages/core/src/storage/index.ts`: Factory function with backend selection logic
- `scripts/ci/check_nodrift.sh`: Already makes Hard Mode optional via HARD_MODE env var
- `scripts/ci/check_arv.sh`: Already makes Hard Mode optional via HARD_MODE env var

### CLI Commands (Previously Scaffolded)

- `gwi triage` - Complexity analysis
- `gwi plan` - Resolution planning
- `gwi resolve` - Conflict resolution with approval
- `gwi review` - Review AI resolutions
- `gwi autopilot` - Full automated pipeline
- `gwi status` - Agent/run status (uses storage interfaces, not AgentFS)

---

## Why

### Decision Drivers

1. **Commercial Product Vision**: Git With Intent must be installable by any developer with `npm install -g @gwi/cli`
2. **Simple Onboarding**: Users should not need to understand AgentFS, Beads, or A2A protocols
3. **Internal Experimentation**: Team can still use experimental tools for development without imposing them on users
4. **Documentation Consistency**: All docs must follow the same filing standard for AI assistant compatibility

### Technical Rationale

- **Storage Interfaces**: Abstract away implementation details - users get SQLite, team can use AgentFS internally
- **In-Process Orchestration**: Multi-agent pipeline runs inside CLI, no external gateway needed for basic use
- **Hard Mode as Opt-In**: CI quality gates always run; experimental checks only when HARD_MODE=true

---

## How to Verify

```bash
# Step 1: Verify ADR exists and has correct format
head -20 000-docs/004-DR-ADRC-runtime-vs-devtools.md

# Step 2: Verify CLAUDE.md has docs-filing section
grep -A 5 "Documentation Standards" CLAUDE.md

# Step 3: Verify storage interfaces exist
ls -la packages/core/src/storage/

# Step 4: Verify SQLite implementation
head -50 packages/core/src/storage/sqlite.ts

# Step 5: Verify CI scripts support HARD_MODE toggle
grep "HARD_MODE" scripts/ci/check_nodrift.sh
grep "HARD_MODE" scripts/ci/check_arv.sh

# Step 6: Verify CLI commands exist
ls -la apps/cli/src/commands/
```

---

## Risks / Gotchas

- **Feature Drift**: Internal and public modes could diverge over time
  - Mitigation: All user-visible features MUST work with SQLite first
- **Documentation Lag**: Docs may fall behind code changes
  - Mitigation: AAR requirement after each phase ensures documentation
- **Type Conflicts**: Some CLI commands import from types defined in storage interfaces
  - Status: Verified imports work correctly

---

## Rollback Plan

1. Revert documentation changes: `git checkout HEAD~1 -- 000-docs/ CLAUDE.md`
2. No code changes were made in this phase, only verification
3. If storage interfaces need changes, they are backward-compatible

---

## Open Questions

- [x] Should storage interfaces support transactions? (Deferred - not needed for MVP)
- [x] Where should AgentFS wrapper live? (Answer: `internal/` directory when implemented)
- [ ] Should we add a `memory` storage backend for testing? (Deferred to Phase 2)
- [ ] When to implement Turso/Postgres backends? (Deferred - SQLite sufficient for MVP)

---

## Next Actions

| Action | Owner | Due |
|--------|-------|-----|
| Add better-sqlite3 to packages/core dependencies | Dev | Phase 2 |
| Create `internal/` directory for dev tools | Dev | Phase 2 |
| Implement full CLI command logic | Dev | Phase 2 |
| Run full build and test suite | Dev | Phase 2 |

---

## Evidence Links / Artifacts

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `000-docs/004-DR-ADRC-runtime-vs-devtools.md` | `modified` | Added Document ID, filing standard, footer |
| `000-docs/003-AA-AUDT-appaudit-devops-playbook.md` | `modified` | Added Document ID, version bump, footer |
| `CLAUDE.md` | `modified` | Added Documentation Standards section |
| `000-docs/005-AA-AACR-phase-1-runtime-devtools-reset.md` | `created` | This AAR |

### Commits

| Hash | Message |
|------|---------|
| Pending | Phase 1: Runtime vs DevTools docs alignment |

### AgentFS Snapshots

**AgentFS Status:** `N/A (docs-only phase)` - This phase did not use AgentFS.

### External References

- Docs-filing v4: `000-docs/6767-a-DR-STND-document-filing-system-standard-v4.md`
- AAR Template: `000-docs/6767-b-AA-TMPL-after-action-report-template.md`

---

## Phase Completion Checklist

- [x] ADR added: `004-DR-ADRC-runtime-vs-devtools.md` updated with 6767 compliance
- [x] CLAUDE.md updated: Contains Runtime vs DevTools policy and docs-filing v4 reference
- [x] Architecture/ops docs clarified: `003-AA-AUDT` marked internal, AgentFS/Beads optional
- [x] Storage interfaces verified: PRStore, RunStore, SettingsStore in `packages/core/src/storage/`
- [x] Default backend stub verified: SQLiteStoreFactory in `packages/core/src/storage/sqlite.ts`
- [x] Phase 1 AAR written: This document
- [x] All planned task IDs completed or accounted for
- [x] Verification steps documented above
- [x] Evidence documented above
- [x] No blocking open questions
- [x] Next phase entry criteria defined

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
