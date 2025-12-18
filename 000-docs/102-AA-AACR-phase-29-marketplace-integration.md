# AAR-102: Phase 29 - Connector Marketplace UI + Hosting

| Field | Value |
|-------|-------|
| Phase | 29 |
| Title | Connector Marketplace UI + Hosting |
| Status | COMPLETE |
| Date | 2025-12-17 |
| Duration | ~4 hours |
| Beads Epic | git-with-intent-vyw |

## Executive Summary

Phase 29 delivered a complete connector marketplace infrastructure including:
- Signed package format with Ed25519 verification
- GCS-backed registry with REST API
- Policy-aware installation pipeline
- React UI for browsing and installing connectors
- ARV gate with 14 automated checks

## Objectives vs Outcomes

| Objective | Status | Notes |
|-----------|--------|-------|
| Package manifest schema | DONE | `PublishedConnectorSchema`, `ConnectorVersionSchema` |
| Signed package format | DONE | Ed25519 signatures with SHA256 checksums |
| GCS hosting layer | DONE | Tarball and signature storage |
| Registry API routes | DONE | npm-compatible REST endpoints |
| Publish/update flows | DONE | Server-side GCS upload, deprecation |
| Browse marketplace UI | DONE | Search, filters, pagination |
| Install UI | DONE | Version selection, policy-aware |
| Install pipeline | DONE | Capability-based approval requirements |
| ARV gate | DONE | 14 checks, all passing |

## Deliverables

### Core Package (`packages/core/src/marketplace/`)

| File | Purpose | LOC |
|------|---------|-----|
| `types.ts` | Zod schemas for connectors, versions, installations | ~200 |
| `storage.ts` | Firestore + InMemory storage implementations | ~300 |
| `service.ts` | MarketplaceService with publish/install/verify | ~400 |
| `install-pipeline.ts` | Policy enforcement with approval workflow | ~375 |
| `index.ts` | Module exports | ~60 |

### Gateway (`apps/gateway/src/`)

| File | Purpose | LOC |
|------|---------|-----|
| `marketplace-routes.ts` | Registry REST API endpoints | ~200 |
| `index.ts` (modified) | Router integration | +15 |

### Web UI (`apps/web/src/pages/`)

| File | Purpose | LOC |
|------|---------|-----|
| `Marketplace.tsx` | Browse/search page | ~330 |
| `MarketplaceDetail.tsx` | Connector detail with install | ~400 |

### Supporting Changes

| File | Change |
|------|--------|
| `apps/web/src/App.tsx` | Added `/marketplace` routes |
| `apps/web/src/components/Layout.tsx` | Added nav link |
| `packages/core/src/policy/types.ts` | Added connector actions |
| `packages/core/src/index.ts` | Export marketplace module |

### ARV Gate

| File | Checks |
|------|--------|
| `scripts/arv/marketplace-gate.ts` | 14 checks, all passing |

## Commits

1. `5e69c0f` - phase29(gateway): integrate marketplace routes
2. `c945106` - phase29(gateway): add publish and deprecate endpoints
3. `d403c0e` - phase29(web): marketplace browse and detail pages
4. `fd8041f` - phase29(core): install pipeline with policy enforcement
5. `44bcfa0` - phase29(arv): add marketplace integration gate

## Beads Tasks Closed

| Task ID | Description |
|---------|-------------|
| git-with-intent-xuw | Hosting layer (GCS + registry API) |
| git-with-intent-qhk | Publish/update flows |
| git-with-intent-4xu | Browse/install UI |
| git-with-intent-7fb | Install pipeline (policy + approvals) |
| git-with-intent-q3b | ARV gates |

## Technical Decisions

### 1. Server-Side GCS Upload
The publish endpoint accepts base64-encoded tarball and handles GCS upload server-side. This simplifies client implementation and keeps GCS credentials out of CLI.

### 2. Capability-Based Approval
The `InstallPipeline` uses capability analysis to determine approval requirements. Sensitive capabilities (auth, cloud, database) require human approval by default.

### 3. Verified Publisher Auto-Approve
Tenants can configure `autoApproveVerified: true` to auto-approve connectors from verified publishers, reducing friction for trusted sources.

### 4. In-Memory Pending Requests
Pending install requests are stored in-memory in `InstallPipeline`. For production persistence, these should migrate to Firestore.

## Known Gaps

| Gap | Severity | Mitigation |
|-----|----------|------------|
| Pending requests in-memory | MEDIUM | Add Firestore persistence in future phase |
| No CLI publish command | LOW | Can use REST API directly |
| No connector ratings/reviews | LOW | Future enhancement |
| No publisher verification flow | MEDIUM | Manual verification for now |

## Metrics

| Metric | Value |
|--------|-------|
| Files created | 8 |
| Files modified | 5 |
| Total new LOC | ~2,000 |
| ARV checks | 14/14 passing |
| TypeScript errors | 0 |

## Next Phases

1. **Phase 30**: CLI publish command (`gwi connector publish`)
2. **Phase 31**: Publisher verification workflow
3. **Phase 32**: Connector ratings and reviews
4. **Phase 33**: Persistent approval request storage

## Lessons Learned

1. **Good**: Reusing existing patterns (Firestore stores, policy types) accelerated development
2. **Good**: Creating ARV gate early caught issues before commit
3. **Improve**: Could have created UI mockups first for faster iteration
4. **Improve**: Should document GCS bucket setup requirements for ops

## References

- ADR-101: Phase 29 Marketplace Architecture
- Phase 22 AAR: Connector Abstraction
- Phase 25 AAR: Approval Commands + Policy-as-Code
