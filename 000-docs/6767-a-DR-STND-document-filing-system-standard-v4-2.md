# Document Filing System Standard v4.2

> **6767 Series**: Canonical cross-repo reusable standard
> **Category**: DR (Documentation & Reference)
> **Type**: STND (Standard)
> **Status**: Production Standard (v3-compatible, v4.0-compatible)

## Overview

Universal, deterministic naming and filing standard for project documentation with canonical cross-repo "6767" standards series.

This standard automatically organizes loose project documents into a flat `000-docs/` directory using:

1. **Chronological Sequencing** - NNN prefixes (001-999)
2. **Category Codes** - 2-letter codes (PP, AT, DR, etc.)
3. **Document Types** - 4-letter codes (PROD, ARCH, STND, etc.)
4. **Kebab-case Descriptions** - 1-4 words lowercase

---

## One-Screen Rules (Memorize These)

1. **Two filename families only:**
   - **Project docs:** `NNN-CC-ABCD-short-description.ext`
   - **Canonical standards:** `6767-{a|b|c|...}-[TOPIC-]CC-ABCD-short-description.ext`

2. **NNN is chronological** (001-999). **6767 uses letter suffixes (a,b,c...) NOT numeric IDs.**

3. **All codes are mandatory:** `CC` (category) + `ABCD` (type).

4. **Description is short:** 1-4 words (project), 1-5 words (6767), **kebab-case**, lowercase.

5. **Subdocs:** either `005a` letter suffix or `006-1` numeric suffix.

6. **6767 doc IDs like "6767-120" may appear in headers/content for cross-ref, but NOT in the filename.**

---

## Filename Patterns

### Project Documents

```
NNN-CC-ABCD-short-description.ext
```

| Field | Description | Example |
|-------|-------------|---------|
| `NNN` | Chronological sequence (001-999) | `042` |
| `CC` | 2-letter category code | `DR` |
| `ABCD` | 4-letter document type | `STND` |
| `short-description` | 1-4 words, kebab-case | `api-design-guide` |
| `.ext` | File extension | `.md` |

**Examples:**
- `001-PP-PROD-project-requirements.md`
- `042-AT-APIS-api-integration-guide.pdf`
- `103-MC-MEET-sprint-planning.docx`

### 6767 Canonical Standards

```
6767-{a|b|c|...}-[TOPIC-]CC-ABCD-short-description.ext
```

| Field | Description | Example |
|-------|-------------|---------|
| `6767` | Fixed canonical prefix | `6767` |
| `{a\|b\|c\|...}` | Mandatory letter suffix | `a` |
| `[TOPIC-]` | Optional uppercase grouping | `INLINE-` |
| `CC` | 2-letter category code | `DR` |
| `ABCD` | 4-letter document type | `STND` |
| `short-description` | 1-5 words, kebab-case | `document-filing-system` |

**Correct Examples:**
- `6767-a-DR-STND-document-filing-system-standard-v4.md`
- `6767-b-DR-INDEX-standards-catalog.md`
- `6767-c-INLINE-DR-STND-inline-source-deployment.md`

**Wrong Examples:**
- `6767-DR-STND-...` (WRONG - missing letter suffix)
- `6767-000-DR-INDEX-...` (WRONG - numeric ID instead of letter)

---

## Category Codes (CC) - 2 Letters

| Code | Category |
|------|----------|
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

## Document Types (ABCD) - 4 Letters

### PP - Product & Planning
`PROD`, `PLAN`, `RMAP`, `BREQ`, `FREQ`, `SOWK`, `KPIS`, `OKRS`

### AT - Architecture & Technical
`ADEC`, `ARCH`, `DSGN`, `APIS`, `SDKS`, `INTG`, `DIAG`

### DC - Development & Code
`DEVN`, `CODE`, `LIBR`, `MODL`, `COMP`, `UTIL`

### TQ - Testing & Quality
`TEST`, `CASE`, `QAPL`, `BUGR`, `PERF`, `SECU`, `PENT`

### OD - Operations & Deployment
`OPNS`, `DEPL`, `INFR`, `CONF`, `ENVR`, `RELS`, `CHNG`, `INCD`, `POST`

### LS - Logs & Status
`LOGS`, `WORK`, `PROG`, `STAT`, `CHKP`

### RA - Reports & Analysis
`REPT`, `ANLY`, `AUDT`, `REVW`, `RCAS`, `DATA`, `METR`, `BNCH`

### MC - Meetings & Communication
`MEET`, `AGND`, `ACTN`, `SUMM`, `MEMO`, `PRES`, `WKSP`

### PM - Project Management
`TASK`, `BKLG`, `SPRT`, `RETR`, `STND`, `RISK`, `ISSU`

### DR - Documentation & Reference
`REFF`, `GUID`, `MANL`, `FAQS`, `GLOS`, `SOPS`, `TMPL`, `CHKL`, `STND`, `INDEX`

### UC - User & Customer
`USER`, `ONBD`, `TRNG`, `FDBK`, `SURV`, `INTV`, `PERS`

### BL - Business & Legal
`CNTR`, `NDAS`, `LICN`, `CMPL`, `POLI`, `TERM`, `PRIV`

### RL - Research & Learning
`RSRC`, `LERN`, `EXPR`, `PROP`, `WHIT`, `CSES`

### AA - After Action & Review
`AACR`, `LESN`, `PMRT`

### WA - Workflows & Automation
`WFLW`, `N8NS`, `AUTO`, `HOOK`

### DD - Data & Datasets
`DSET`, `CSVS`, `SQLS`, `EXPT`

### MS - Miscellaneous
`MISC`, `DRFT`, `ARCH`, `OLDV`, `WIPS`, `INDX`

---

## Pattern Matching Rules

| Pattern Keywords | Category | Type |
|------------------|----------|------|
| requirement, product, feature, spec | PP | PROD |
| plan, roadmap, strategy | PP | PLAN |
| architecture, design, technical | AT | ARCH |
| decision, adr, choice | AT | ADEC |
| api, endpoint, integration | AT | APIS |
| code, module, component | DC | CODE |
| test, testing, qa | TQ | TEST |
| bug, issue, defect | TQ | BUGR |
| security, audit, pentest | TQ | SECU |
| deploy, deployment, release | OD | DEPL |
| infrastructure, devops, config | OD | INFR |
| log, journal, daily | LS | LOGS |
| status, progress, update | LS | STAT |
| report, analysis, findings | RA | REPT |
| meeting, notes, minutes | MC | MEET |
| task, backlog, sprint | PM | TASK |
| guide, manual, handbook | DR | GUID |
| reference, docs, documentation | DR | REFF |
| sop, procedure, process | DR | SOPS |
| standard | DR | STND |
| template | DR | TMPL |
| research, study, experiment | RL | RSRC |
| proposal, pitch, whitepaper | RL | PROP |
| postmortem, lessons | AA | PMRT |
| after-action, aar | AA | AACR |
| workflow, automation | WA | WFLW |
| data, dataset, csv, sql | DD | DSET |
| No pattern matches | MS | MISC |

---

## Directory Structure

v4.2 enforces **strict flat 000-docs** (no subdirectories).

```
project-root/
├── 000-docs/                    # Flat structure, all docs here
│   ├── 000-INDEX.md             # Auto-generated inventory
│   ├── 001-PP-PROD-requirements.md
│   ├── 002-AT-ARCH-system-design.md
│   ├── 003-DR-GUID-api-usage.md
│   └── 6767-a-DR-STND-document-filing-standard-v4-2.md
├── README.md                    # Not moved (root file)
├── CLAUDE.md                    # Not moved (root file)
└── src/                         # Source code
```

### Protected Files (Never Moved)

- `README.md`
- `CLAUDE.md`
- `LICENSE.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

### Excluded Directories

- `node_modules/`
- `.git/`
- `dist/`
- `build/`
- `vendor/`
- `.next/`
- `coverage/`

---

## Implementation

### Get Next Sequence Number

```bash
NEXT_NUM=$(printf "%03d" $(($(ls 000-docs/ 2>/dev/null | grep -oP '^\d{3}' | sort -n | tail -1) + 1)))
```

### Rename and Move

```bash
NEW_NAME="${NEXT_NUM}-${CATEGORY}-${DOC_TYPE}-${DESCRIPTION}.${EXTENSION}"
mv "$ORIGINAL_FILE" "000-docs/$NEW_NAME"
```

### Generate Index

Create `000-docs/000-INDEX.md` with:
- Documents grouped by category
- Chronological listing
- Quick reference for codes

---

## Safety Features

- Never modifies files already in 000-docs/
- Never touches project root files (README, CLAUDE.md, etc.)
- Preserves original file extensions
- Skips system directories (.git, node_modules)
- Generates audit trail (000-INDEX.md)
- Safe to run multiple times (idempotent)

---

## Error Handling

| Situation | Behavior |
|-----------|----------|
| No loose documents found | Reports "0 documents found", creates empty 000-docs/ |
| File already exists in 000-docs/ | Skips file, reports in summary |
| Permission denied | Reports error, continues with remaining files |
| Invalid filename characters | Sanitizes to kebab-case automatically |
| Duplicate sequence number | Increments to next available NNN |
| User cancels categorization | Skips file, no partial moves |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v4.2 | 2026-01 | Enforces strict flat 000-docs (no subdirectories) |
| v4.0 | 2025 | Added 6767 canonical standards series |
| v3.0 | 2024 | Added category and type codes |
| v2.0 | 2023 | Added chronological sequencing |
| v1.0 | 2022 | Initial naming convention |

---

## Related Standards

- `6767-b-DR-INDEX-standards-catalog.md` - Full catalog of all 6767 standards
- `6767-c-DR-SOPS-document-review-process.md` - Review and approval workflow
