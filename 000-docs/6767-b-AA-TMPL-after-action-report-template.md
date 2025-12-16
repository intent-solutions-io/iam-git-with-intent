# AFTER ACTION REPORT (AAR) TEMPLATE

> **Use this template after every phase; save AARs to `000-docs/` with NNN naming:**
> `NNN-AA-AACR-phase-<n>-short-description.md`

---

## Metadata

| Field | Value |
|-------|-------|
| **Phase** | `<phase number>` |
| **Repo/App** | `<repository or application name>` |
| **Owner** | `<name or team>` |
| **Date/Time (CST)** | `YYYY-MM-DD HH:MM CST` *(America/Chicago)* |
| **Status** | `DRAFT` / `FINAL` |
| **Related Issues/PRs** | `#<issue>`, `PR #<number>` |
| **Commit(s)** | `<commit hash(es)>` |

> **Note:** When creating an AAR, replace the Date/Time placeholder with the current timestamp in CST (America/Chicago timezone).

---

## Beads / Task IDs Touched

<!--
List all Beads task IDs that were worked on in this phase.
Format: bd-<hash> | <status> | <title>
If Beads not yet initialized, note "Beads not yet active" and list logical work units.
-->

| Task ID | Status | Title |
|---------|--------|-------|
| `bd-xxxx` | `completed` | `<task title>` |
| `bd-yyyy` | `in_progress` | `<task title>` |
| `bd-zzzz` | `blocked` | `<task title>` |

**Beads Status:** `Active` / `Not yet initialized` / `N/A (docs-only phase)`

---

## Executive Summary

<!-- 5-8 bullets max summarizing the phase outcome -->
-
-
-

---

## What Changed

<!-- Bullet list of concrete changes made -->
-
-
-

---

## Why

<!-- Decision drivers, business context, technical rationale -->
-
-

---

## How to Verify

<!-- Copy/paste steps to confirm the changes work -->
```bash
# Step 1:

# Step 2:

# Step 3:
```

---

## Risks / Gotchas

<!-- Known issues, edge cases, or concerns -->
-
-

---

## Rollback Plan

<!-- Steps to revert if something goes wrong -->
1.
2.
3.

---

## Open Questions

<!-- Unresolved items needing follow-up -->
- [ ]
- [ ]

---

## Next Actions

<!-- Owner + what needs to happen next -->
| Action | Owner | Due |
|--------|-------|-----|
| | | |
| | | |

---

## Evidence Links / Artifacts

<!--
All evidence supporting this phase's completion.
Include: file paths, commit hashes, screenshots, logs, AgentFS snapshots.
For AgentFS: note snapshot IDs or "not yet active" if not initialized.
-->

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `<path>` | `created` / `modified` | `<why>` |

### Commits

| Hash | Message |
|------|---------|
| `<hash>` | `<message>` |

### AgentFS Snapshots

<!-- If AgentFS active, list relevant snapshot IDs for audit/replay -->
| Snapshot ID | Timestamp | Description |
|-------------|-----------|-------------|
| `<id>` | `<timestamp>` | `<what was captured>` |

**AgentFS Status:** `Active` / `Not yet initialized` / `N/A (docs-only phase)`

### External References

<!-- Links to external docs, PRs, issues, dashboards -->
-
-

---

## Phase Completion Checklist

<!-- Confirm all requirements met before marking phase complete -->
- [ ] All planned task IDs completed or accounted for
- [ ] Verification steps executed successfully
- [ ] Evidence documented above
- [ ] No blocking open questions
- [ ] Next phase entry criteria defined

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
