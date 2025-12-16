# DOCUMENT FILING SYSTEM STANDARD v4.2 (LLM/AI-ASSISTANT FRIENDLY)
**Purpose:** Universal, deterministic naming + filing standard for project docs with canonical cross-repo "6767" standards series
**Status:** ✅ Production Standard (v3-compatible, v4.0-compatible)
**Last Updated:** 2025-12-07
**Changelog:** v4.2 enforces strict flat 000-docs (no subdirectories)
**Applies To:** All projects in `/home/jeremy/000-projects/` and all canonical standards in the 6767 series

---

## 0) ONE-SCREEN RULES (AI SHOULD MEMORIZE THESE)
1) **Two filename families only:**
   - **Project docs:** `NNN-CC-ABCD-short-description.ext`
   - **Canonical standards:** `6767-[TOPIC-]CC-ABCD-short-description.ext`
2) **NNN is chronological** (001–999). **6767 never uses extra numeric IDs in filenames.**
3) **All codes are mandatory:** `CC` (category) + `ABCD` (type).
4) **Description is short:** 1–4 words (project), 1–5 words (6767), **kebab-case**, lowercase.
5) **Subdocs:** either `005a` letter suffix or `006-1` numeric suffix.
6) **6767 doc IDs like "6767-120" may appear in headers/content for cross-ref, but NOT in the filename.**

---

## 1) FILENAME SPEC (DETERMINISTIC)
### 1.1 Project Docs (NNN series)
**Pattern**

NNN-CC-ABCD-short-description.ext

**Fields**
- `NNN`: 001–999 (zero padded, chronological)
- `CC`: 2-letter category code (table below)
- `ABCD`: 4-letter doc type abbreviation (tables below)
- `short-description`: 1–4 words, kebab-case
- `ext`: `.md` preferred; others allowed (`.pdf`, `.txt`, `.xlsx`, etc.)

**Examples**

001-AT-ADEC-initial-architecture.md
005-PM-TASK-api-endpoints.md
009-AA-AACR-sprint-1-review.md

### 1.2 Sub-Docs (same parent number)
**Option A — letter suffix**

005-PM-TASK-api-endpoints.md
005a-PM-TASK-auth-endpoints.md
005b-PM-TASK-payment-endpoints.md

**Option B — numeric suffix**

006-PM-RISK-security-audit.md
006-1-PM-RISK-encryption-review.md
006-2-PM-RISK-access-controls.md

### 1.3 Canonical Standards (6767 series)
**Purpose:** Cross-repo reusable SOPs, standards, patterns, architectures.

**Pattern**

6767-{a|b|c|...}-[TOPIC-]CC-ABCD-short-description.ext

**Fields**
- `6767`: fixed canonical prefix (used ONCE)
- `{a|b|c|...}`: **mandatory letter suffix** for chronological ordering (a, b, c, d, etc.)
- `[TOPIC-]`: optional uppercase grouping prefix (examples: `INLINE`, `LAZY`, `SLKDEV`)
- `CC`: same category codes as NNN series
- `ABCD`: 4-letter type code (same master tables)
- `short-description`: 1–5 words, kebab-case

**Correct examples**

6767-a-DR-STND-document-filing-system-standard-v4.md
6767-b-DR-INDEX-standards-catalog.md
6767-c-RB-OPS-adk-department-operations-runbook.md
6767-d-INLINE-DR-STND-inline-source-deployment-for-vertex-agent-engine.md

**Incorrect (banned)**

6767-DR-STND-missing-letter-suffix.md          ❌ No letter suffix
6767-000-DR-INDEX-standards-catalog.md          ❌ Numeric ID instead of letter
6767-120-DR-STND-agent-engine-index.md          ❌ Numeric ID instead of letter

**Reason:** All 6767 docs MUST have letter suffix (-a, -b, -c, etc.) for ordering. No numeric IDs allowed.

### 1.4 Document IDs vs Filenames (6767 only)
- ✅ Allowed in document header/body: `Document ID: 6767-120`
- ❌ Not allowed in filename: `6767-120-DR-...`

---

## 2) FAST DECISION: WHICH SERIES DO I USE?
Use this rule of thumb:

| If the doc is… | Use… |
|---|---|
| reusable standard/process/pattern across multiple repos | **6767** |
| specific to one repo/app/phase/sprint/implementation | **NNN** |

---

## 3) CANONICAL STORAGE LOCATIONS (DEFAULTS)
- **Project docs:** `<repo>/000-docs/` (flat, no subdirectories)
- **6767 canonical docs:** `<repo>/000-docs/` (same folder as NNN docs)

---

## 3.1) 000-docs Flatness Rule (Strict)

**Purpose:** Keep all documentation in a single flat directory for simplicity and discoverability.

**Rules:**
- `000-docs/` contains all docs (NNN and 6767) at one level.
- **No subdirectories allowed under `000-docs/`.**
- If assets are needed, store them adjacent to the doc file (same folder) and keep naming clear.

**Folder Structure:**
```
000-docs/
├── 001-PP-PROD-mvp-requirements.md       # NNN project docs
├── 002-AT-ADEC-architecture.md
├── 010-AA-AACR-phase-1-review.md
├── 6767-DR-STND-document-filing-system-standard-v4.md   # 6767 canonical docs
├── 6767-DR-INDEX-standards-catalog.md
└── 6767-AA-TMPL-after-action-report-template.md
```

**Migration Note (v4.2):** The v4.1 folder convention (6767-a/b/c) has been removed. All docs now live flat in `000-docs/`. Move any files from subfolders up to `000-docs/` without renaming.

---

## 4) CATEGORIES (CC) — 2 LETTERS
| Code | Category |
|---|---|
| PP | Product & Planning |
| AT | Architecture & Technical |
| DC | Development & Code |
| TQ | Testing & Quality |
| OD | Operations & Deployment |
| LS | Logs & Status |
| RA | Reports & Analysis |
| MC | Meetings & Communication |
| PM | Project Management |
| DR | Documentation & Reference |
| UC | User & Customer |
| BL | Business & Legal |
| RL | Research & Learning |
| AA | After Action & Review |
| WA | Workflows & Automation |
| DD | Data & Datasets |
| MS | Miscellaneous |

---

## 5) DOCUMENT TYPES (ABCD) — 4 LETTERS (MASTER TABLES)
> Keep this section authoritative. Do not invent new type codes without updating this standard.

### PP — Product & Planning
PROD, PLAN, RMAP, BREQ, FREQ, SOWK, KPIS, OKRS

### AT — Architecture & Technical
ADEC, ARCH, DSGN, APIS, SDKS, INTG, DIAG

### DC — Development & Code
DEVN, CODE, LIBR, MODL, COMP, UTIL

### TQ — Testing & Quality
TEST, CASE, QAPL, BUGR, PERF, SECU, PENT

### OD — Operations & Deployment
OPNS, DEPL, INFR, CONF, ENVR, RELS, CHNG, INCD, POST

### LS — Logs & Status
LOGS, WORK, PROG, STAT, CHKP

### RA — Reports & Analysis
REPT, ANLY, AUDT, REVW, RCAS, DATA, METR, BNCH

### MC — Meetings & Communication
MEET, AGND, ACTN, SUMM, MEMO, PRES, WKSP

### PM — Project Management
TASK, BKLG, SPRT, RETR, STND, RISK, ISSU

### DR — Documentation & Reference
REFF, GUID, MANL, FAQS, GLOS, SOPS, TMPL, CHKL, STND, INDEX

### UC — User & Customer
USER, ONBD, TRNG, FDBK, SURV, INTV, PERS

### BL — Business & Legal
CNTR, NDAS, LICN, CMPL, POLI, TERM, PRIV

### RL — Research & Learning
RSRC, LERN, EXPR, PROP, WHIT, CSES

### AA — After Action & Review
AACR, LESN, PMRT

### WA — Workflows & Automation
WFLW, N8NS, AUTO, HOOK

### DD — Data & Datasets
DSET, CSVS, SQLS, EXPT

### MS — Miscellaneous
MISC, DRFT, ARCH, OLDV, WIPS, INDX

---

## 6) NAMING CONSTRAINTS (HARD RULES)
**DO**
- lowercase kebab-case descriptions
- keep descriptions short (avoid sentence titles)
- use `.md` for most docs
- keep `NNN` chronological
- keep `6767` for cross-repo standards only

**DON'T**
- no underscores / camelCase in descriptions
- no special chars except hyphens
- no missing category or type codes
- no numeric IDs after `6767-` in filenames (v3+ rule)

---

## 7) EXAMPLES (COPY/PASTE)
### Project docs

000-docs/
001-PP-PROD-mvp-requirements.md
002-AT-ADEC-auth-decision.md
003-AT-ARCH-system-design.md
004-PM-TASK-api-endpoints.md
004a-PM-TASK-auth-endpoints.md
010-AA-AACR-sprint-1-review.md

### Canonical standards

000-docs/
6767-DR-STND-document-filing-system-standard-v4.md
6767-DR-INDEX-standards-catalog.md
6767-INLINE-DR-STND-inline-source-deployment-for-vertex-agent-engine.md

---

## 8) MIGRATION NOTES (V3 → V4)
- **No breaking changes** to v3 rules.
- v4 is a **condensed, LLM-friendly restatement** of v3 with the same constraints.
- Pre-v3 6767 files with numeric IDs in filenames remain "legacy" until renamed.

---

## 9) AI ASSISTANT OPERATING INSTRUCTIONS (STRICT)
When creating or renaming a document:
1) Decide series: **6767** if cross-repo standard; else **NNN**.
2) Pick `CC` from Category table.
3) Pick `ABCD` from Type tables (do not invent).
4) Create filename using the exact pattern rules.
5) Keep description short and kebab-case.
6) If a 6767 doc needs an internal ID for cross-ref, place it in the header only.
7) **Place ALL docs (both NNN and 6767) directly in `000-docs/`** — no subdirectories.
8) **After every phase, create an AAR:** `NNN-AA-AACR-phase-<n>-short-description.md`

---

**DOCUMENT FILING SYSTEM STANDARD v4.2**
*Fully compatible with v3.0 and v4.0; optimized for AI assistants and deterministic naming.*
*v4.2 enforces strict flat 000-docs (no subdirectories allowed).*
