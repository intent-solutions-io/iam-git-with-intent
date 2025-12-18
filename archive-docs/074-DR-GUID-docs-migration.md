# Documentation Migration Guide

## Meta

| Field | Value |
|-------|-------|
| Doc ID | 074-DR-GUID |
| Title | docs/ Folder Migration to 000-docs/ |
| Created | 2025-12-16 |
| Status | Complete |

---

## Summary

The `docs/` folder has been retired. All project documentation now lives **flat** in `000-docs/` per the v4.2 filing standard.

---

## What Changed

- **docs/** folder: **REMOVED** (no longer exists)
- **All contents**: Migrated to `000-docs/` with proper naming
- **Templates**: Moved to `templates/` (not 000-docs/)

---

## How to Find Documents

### After-Action Reports (AARs)
Look for files matching: `NNN-AA-AACR-*.md`

```bash
ls 000-docs/*-AA-AACR-*.md
```

### Architecture Decision Records (ADRs)
Look for files matching: `NNN-DR-ADRC-*.md`

```bash
ls 000-docs/*-DR-ADRC-*.md
```

### All Documents
```bash
ls -1 000-docs/*.md | sort
```

---

## Filing Rules (v4.2)

1. **All docs go in 000-docs/** - no exceptions
2. **No subdirectories** under 000-docs/
3. **Naming format**: `NNN-CC-ABCD-description.md`
   - NNN: Sequential number (001-999)
   - CC: Category (AA=After-Action, DR=Design Record, LS=Log/Status)
   - ABCD: Subcategory (AACR=AAR, ADRC=ADR, GUID=Guide, PLAN=Plan, etc.)
4. **Templates** go in `/templates/` (not 000-docs/)

---

## Migration Mapping

| Old Path | New Path |
|----------|----------|
| docs/phase-11-aar.md | 000-docs/060-AA-AACR-phase-11-billing-stripe.md |
| docs/phase-11-adr.md | 000-docs/061-DR-ADRC-phase-11-billing-stripe.md |
| docs/phase-12-aar.md | 000-docs/062-AA-AACR-phase-12-security-rbac.md |
| docs/phase-12-adr.md | 000-docs/063-DR-ADRC-phase-12-security-rbac.md |
| docs/phase-13-aar.md | 000-docs/064-AA-AACR-phase-13-workflows.md |
| docs/phase-13-adr.md | 000-docs/065-DR-ADRC-phase-13-workflows.md |
| docs/phase-14-aar.md | 000-docs/066-AA-AACR-phase-14-plugins.md |
| docs/phase-14-adr.md | 000-docs/067-DR-ADRC-phase-14-plugins.md |
| docs/phase-15-aar.md | 000-docs/068-AA-AACR-phase-15-launch-prep.md |
| docs/phase-15-adr.md | 000-docs/069-DR-ADRC-phase-15-launch-prep.md |
| docs/context-capsule.md | 000-docs/070-DR-GUID-context-capsule.md |
| docs/vision/PRD.md | 000-docs/071-DR-PLAN-product-requirements.md |
| docs/vision/architecture.md | 000-docs/072-DR-ARCH-system-architecture.md |
| docs/vision/mvp-scope.md | 000-docs/073-DR-PLAN-mvp-scope.md |
| docs/templates/aar-template.md | templates/aar-template.md |

---

## Reference

- Filing standard: `000-docs/6767-a-DR-STND-document-filing-system-standard-v4.md`
