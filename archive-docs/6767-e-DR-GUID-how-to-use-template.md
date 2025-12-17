# HOW TO USE THIS TEMPLATE

**Document ID:** 6767-e
**Purpose:** Step-by-step procedure for bootstrapping a new Intent Solutions project
**Status:** Production Guide
**Last Updated:** 2025-12-15

---

## Overview

This guide explains how to start a new Intent Solutions project using the `project-template` repository as the foundation.

**Key Principle:** Every project starts with 000-docs/ and the 6767 standards. Nothing else.

---

## Prerequisites

Before starting:

1. GitHub CLI (`gh`) installed and authenticated
2. Access to `intent-solutions-io` GitHub organization
3. This template repo cloned or accessible

---

## Step-by-Step: Bootstrap a New Project

### Step 1: Create the New Repository

```bash
# Create private repo in the org
gh repo create intent-solutions-io/<project-name> --private --description "<one-line description>"

# Clone to local projects directory
cd /home/jeremy/000-projects
gh repo clone intent-solutions-io/<project-name>
cd <project-name>
```

### Step 2: Copy 000-docs/ from Template

```bash
# Create the 000-docs directory
mkdir 000-docs

# Copy all 6767 standards from the template
cp /home/jeremy/000-projects/project-template/000-docs/6767-*.md 000-docs/
```

**Verify the copy:**
```bash
ls 000-docs/
# Should show:
# 6767-a-DR-STND-document-filing-system-standard-v4.md
# 6767-b-AA-TMPL-after-action-report-template.md
# 6767-c-DR-SOPS-project-start-sop.md
# 6767-d-DR-TMPL-project-spec-pack.md
# 6767-e-DR-GUID-how-to-use-template.md
```

### Step 3: Create the Project Spec Pack

```bash
# Copy the template and rename
cp 000-docs/6767-d-DR-TMPL-project-spec-pack.md 000-docs/001-PP-PROD-project-spec-pack.md
```

**Edit the spec pack:**
- Open `000-docs/001-PP-PROD-project-spec-pack.md`
- Fill in ALL sections for your specific project
- Do not leave placeholder text

### Step 4: Create the Phase 0 AAR

```bash
# Copy the AAR template
cp 000-docs/6767-b-AA-TMPL-after-action-report-template.md 000-docs/002-AA-AACR-phase-0-foundation.md
```

**Edit the AAR:**
- Fill in metadata (Phase 0, repo name, owner, date)
- Document what was created
- Document what was NOT created
- List verification steps
- Define Phase 1 entry criteria

### Step 5: Commit as Phase 0

```bash
# Stage all documents
git add 000-docs/

# Commit with proper message
git commit -m "$(cat <<'EOF'
docs: phase 0 foundation - import standards and spec pack

Phase 0 deliverables:
- Imported 6767 canonical standards (a-e)
- Created project spec pack (001-PP-PROD)
- Created Phase 0 AAR (002-AA-AACR)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# Push to remote
git push -u origin main
```

### Step 6: Verify Phase 0 Completion

Run these checks:

```bash
# Verify only 000-docs exists
ls -la
# Should show ONLY: .git/ and 000-docs/

# Verify 000-docs is flat (no subdirectories)
find 000-docs -type d
# Should show ONLY: 000-docs

# Verify all required files exist
ls 000-docs/
# Should show 7 files (5 x 6767-* + 001-PP-PROD + 002-AA-AACR)
```

---

## Document Numbering Rules

### 6767 Series (Canonical Standards)

Pattern: `6767-{letter}-CC-ABCD-short-description.md`

| Letter | Document |
|--------|----------|
| a | Document Filing System Standard |
| b | AAR Template |
| c | Project Start SOP |
| d | Project Spec Pack Template |
| e | How to Use Template (this file) |
| f+ | Future canonical standards |

**Rule:** 6767 docs are universal across all repos. Never modify them per-project.

### NNN Series (Project-Specific)

Pattern: `NNN-CC-ABCD-short-description.md`

| NNN | Typical Use |
|-----|-------------|
| 001 | Project spec pack |
| 002 | Phase 0 AAR |
| 003 | Phase 1 AAR |
| ... | Continues chronologically |

**Rule:** NNN docs are specific to one project. Number them chronologically.

### Keeping 000-docs/ Flat

**Flat means:**
- All files directly in 000-docs/
- No subdirectories under 000-docs/
- No nested folders like 000-docs/phase-1/ or 000-docs/standards/

**Why flat?**
- Simpler discovery
- Deterministic CI checks
- No confusion about where to file

---

## External Systems: Beads and AgentFS

### Current Status (Phase 0)

In Phase 0, Beads and AgentFS are **referenced only**:
- Links in documentation
- Design mentions in spec pack
- NOT installed
- NOT configured

### When to Install (Phase 1+)

Beads and AgentFS are installed during Phase 1 of the project repo:

```bash
# Phase 1: Install Beads
npm install -g @beads/bd
bd init --quiet

# Phase 1: Install AgentFS
npm install -g agentfs-cli
agentfs init <project-name>
```

### Reference Links

- **Beads:** https://github.com/steveyegge/beads
  - Work graph / issue tracker for agent workflows
  - "No orphan work" principle

- **AgentFS:** https://github.com/tursodatabase/agentfs
  - Audit ledger for agent actions
  - Snapshot/replay for reproducibility

- **bobs-brain:** https://github.com/intent-solutions-io/bobs-brain.git
  - Reference implementation of ARV-style CI gates
  - Study for implementing tight gates in Phase 1+

---

## Common Mistakes to Avoid

### Mistake 1: Creating Files Outside 000-docs/

**Wrong:**
```
<repo>/
├── 000-docs/
├── README.md        ❌ Not in Phase 0
└── .gitignore       ❌ Not in Phase 0
```

**Right:**
```
<repo>/
└── 000-docs/        ✅ Only directory
    ├── 6767-*.md
    ├── 001-PP-PROD-*.md
    └── 002-AA-AACR-*.md
```

### Mistake 2: Creating Subdirectories in 000-docs/

**Wrong:**
```
000-docs/
├── standards/       ❌ No subdirectories
│   └── 6767-a.md
└── project/
    └── 001-PP.md
```

**Right:**
```
000-docs/            ✅ Flat
├── 6767-a-DR-STND-...md
├── 6767-b-AA-TMPL-...md
├── 001-PP-PROD-...md
└── 002-AA-AACR-...md
```

### Mistake 3: Skipping the Spec Pack

**Wrong:** Starting code before filling in 001-PP-PROD

**Right:** Complete spec pack, get it reviewed, then start Phase 1

### Mistake 4: Installing Tools in Phase 0

**Wrong:** Running `bd init` or `agentfs init` in Phase 0

**Right:** Reference in docs only; install in Phase 1

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────┐
│                    NEW PROJECT CHECKLIST                   │
├────────────────────────────────────────────────────────────┤
│ □ Create repo in intent-solutions-io org                   │
│ □ Clone locally to /home/jeremy/000-projects/<name>        │
│ □ Create 000-docs/ directory                               │
│ □ Copy 6767-*.md from project-template                     │
│ □ Create 001-PP-PROD-project-spec-pack.md (fill in)        │
│ □ Create 002-AA-AACR-phase-0-foundation.md (fill in)       │
│ □ Verify: only 000-docs/ exists, flat structure            │
│ □ Commit: "docs: phase 0 foundation..."                    │
│ □ Push to remote                                           │
│ □ Phase 0 complete — ready for Phase 1                     │
└────────────────────────────────────────────────────────────┘
```

---

**HOW TO USE THIS TEMPLATE — Intent Solutions Guide**
*Every project starts here. Follow exactly.*
