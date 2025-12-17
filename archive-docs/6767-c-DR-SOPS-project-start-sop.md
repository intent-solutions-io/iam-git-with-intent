# PROJECT START SOP (Standard Operating Procedure)

**Document ID:** 6767-c
**Purpose:** Universal Day 0 procedure for every Intent Solutions project
**Status:** Production Standard
**Last Updated:** 2025-12-15
**Applies To:** All repositories in intent-solutions-io GitHub org

---

## 0. INTERRUPT RULE (MANDATORY)

**If you notice setup drifting from this SOP — STOP immediately.**

Return to this document before continuing any build work. Every project MUST follow this SOP exactly. Skipping steps creates technical debt that compounds across phases.

---

## 1. DAY 0 REQUIREMENTS

Every new Intent Solutions project repository MUST have these elements before any code is written:

### 1.1 Directory Structure

```
<repo>/
└── 000-docs/           # ONLY directory created in Phase 0
    ├── 6767-a-DR-STND-document-filing-system-standard-v4.md
    ├── 6767-b-AA-TMPL-after-action-report-template.md
    ├── 6767-c-DR-SOPS-project-start-sop.md (this file)
    ├── 6767-d-DR-TMPL-project-spec-pack.md
    ├── 6767-e-DR-GUID-how-to-use-template.md
    ├── 001-PP-PROD-project-spec-pack.md     # Filled-in spec for THIS project
    └── 002-AA-AACR-phase-0-foundation.md    # Phase 0 AAR
```

### 1.2 Mandatory Documents

| Document | Type | Purpose |
|----------|------|---------|
| 6767-a | Standard | Document filing system rules |
| 6767-b | Template | AAR template for every phase |
| 6767-c | SOP | This procedure (project start) |
| 6767-d | Template | Project spec pack blueprint |
| 6767-e | Guide | How to bootstrap from template |
| 001-PP-PROD | Spec | Filled-in project spec |
| 002-AA-AACR | AAR | Phase 0 completion report |

### 1.3 What Phase 0 Does NOT Include

- No README.md at repo root
- No .gitignore (yet)
- No LICENSE file (yet)
- No CI/CD workflows
- No infrastructure code
- No application source code
- No cloud deployment
- No external tool installations

These are created in Phase 1+ of the actual project repo.

---

## 2. PHASE WORKFLOW RULES

### 2.1 Phase Definition

A **Phase** is a distinct milestone of work with:
- Clear entry criteria (previous phase complete)
- Defined deliverables
- An After-Action Report upon completion

### 2.2 Phase Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     PHASE LIFECYCLE                         │
├─────────────────────────────────────────────────────────────┤
│  1. PLAN      → Define scope, deliverables, success criteria│
│  2. EXECUTE   → Do the work, track in Beads (when enabled) │
│  3. VERIFY    → Confirm deliverables meet criteria         │
│  4. DOCUMENT  → Write AAR, update docs                     │
│  5. COMMIT    → Small commits with clear messages          │
│  6. REVIEW    → Phase complete only after AAR is committed │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 AAR Rule (Non-Negotiable)

**Every phase produces an AAR.**

- AAR filename: `NNN-AA-AACR-phase-<n>-short-description.md`
- AAR must be committed before declaring phase complete
- AAR must include: what changed, why, how to verify, risks, rollback plan

### 2.4 Evidence Expectations

Each phase AAR must include evidence of completion:

| Evidence Type | Example |
|--------------|---------|
| File lists | "Created: 001-PP-PROD-..., 002-AA-AACR-..." |
| Commands | "Run `ls 000-docs/` to verify" |
| Commit hashes | "Commits: abc123, def456" |
| Screenshots | Only if UI work (rare in early phases) |

---

## 3. COMMIT DISCIPLINE

### 3.1 Commit Message Format

```
<type>: <short description>

<optional body explaining why>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### 3.2 Commit Types

| Type | Use For |
|------|---------|
| `docs` | Documentation changes |
| `feat` | New features |
| `fix` | Bug fixes |
| `ci` | CI/CD changes |
| `infra` | Infrastructure changes |
| `refactor` | Code restructuring |
| `test` | Test additions/changes |
| `chore` | Maintenance tasks |

### 3.3 Commit Size

- Small, focused commits
- One logical change per commit
- Phase 0 typically has 2-4 commits

---

## 4. TEMPLATE REPO VS PROJECT REPO

### 4.1 Template Repo (project-template)

**Purpose:** Docs-only seed for bootstrapping new projects

**Contains:**
- 000-docs/ with 6767 canonical standards
- Universal templates (spec pack, AAR)
- This SOP

**Does NOT contain:**
- Code
- CI/CD
- Infrastructure
- Project-specific documents

### 4.2 Project Repo (e.g., intentvision)

**Purpose:** Actual project implementation

**Phase 0 contains:**
- Copy of 000-docs/ from template
- Filled-in project spec pack
- Phase 0 AAR

**Phase 1+ adds:**
- README.md, .gitignore, LICENSE
- CI/CD workflows (.github/workflows/)
- Infrastructure code (infrastructure/)
- Application source code (src/, services/, etc.)
- Cloud deployment configurations

---

## 5. EXTERNAL REFERENCE SYSTEMS

These systems are referenced for future phases but NOT installed in Phase 0:

### 5.1 Beads (Work Graph)

- **Repo:** https://github.com/steveyegge/beads
- **Purpose:** Track all work as dependency-chained tasks/epics
- **Install Phase:** Phase 1 of project repo
- **Rule:** "No orphan work" — every task tracked

### 5.2 AgentFS (Audit Ledger)

- **Repo:** https://github.com/tursodatabase/agentfs
- **Purpose:** Record agent actions for reproducibility/audit
- **Install Phase:** Phase 1 of project repo
- **Rule:** Every agent action recorded; every session reproducible

### 5.3 bobs-brain (ARV Posture Reference)

- **Repo:** https://github.com/intent-solutions-io/bobs-brain.git
- **Purpose:** Reference implementation of tight CI/CD gates
- **Use:** Study for implementing ARV-style gates in Phase 1+

---

## 6. QUICK REFERENCE: PHASE 0 CHECKLIST

Before declaring Phase 0 complete:

- [ ] 000-docs/ exists (flat, no subdirectories)
- [ ] 6767 standards imported (a, b, c, d, e)
- [ ] Project spec pack filled in (001-PP-PROD-...)
- [ ] Phase 0 AAR written (002-AA-AACR-phase-0-...)
- [ ] All commits follow message format
- [ ] No files exist outside 000-docs/
- [ ] AAR confirms what was created and what was NOT created

---

## 7. WHAT HAPPENS AFTER PHASE 0

Phase 1 typically includes:
- README.md at repo root
- .gitignore with standard exclusions
- LICENSE file
- .github/workflows/ with ARV gate
- scripts/ci/ with local check scripts
- docs/ for living architecture docs (separate from 000-docs/)
- Beads initialization
- AgentFS initialization

But that's for the project repo, not the template repo.

---

**PROJECT START SOP — Intent Solutions Standard**
*All projects begin here. No exceptions.*
