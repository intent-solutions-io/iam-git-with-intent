# ADR-101: Phase 29 Marketplace Architecture

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2025-12-17 |
| Decision Makers | Jeremy (Principal), Claude (Implementer) |
| Phase | 29: Connector Marketplace UI + Hosting |

## Context

Git With Intent needs a connector marketplace to allow:
- Third-party connector publishing
- Discovery and search of connectors
- Policy-controlled installation for tenants
- Signed package verification for security

## Decision

### 1. Package Format: Signed Tarballs

**Choice**: Ed25519-signed gzipped tarballs with embedded manifests

**Alternatives Considered**:
- npm-style packages: Too complex, requires npm infrastructure
- Git submodules: Version management difficult
- Docker images: Overkill for JavaScript connectors

**Rationale**: Ed25519 provides strong cryptographic signing with small keys. Tarballs are universal and easy to extract. Manifest-in-tarball ensures integrity.

### 2. Registry Protocol: npm-compatible REST API

**Choice**: Express router with npm-compatible endpoints

**Endpoints**:
```
GET  /v1/search?q=&categories=&sortBy=
GET  /v1/connectors/:id
GET  /v1/connectors/:id/:version
GET  /v1/connectors/:id/:version/tarball
GET  /v1/connectors/:id/:version/signature
POST /v1/publish
POST /v1/connectors/:id/:version/deprecate
```

**Rationale**: npm-compatible allows potential future CLI tooling integration. REST is simple and well-understood.

### 3. Storage: GCS + Firestore

**Choice**:
- **GCS bucket**: Tarball and signature storage
- **Firestore**: Metadata, search indexes, installations

**Alternatives Considered**:
- S3: Would work, but project is GCP-native
- Cloud Storage only: No query capability for search
- Firestore only: Binary blobs don't fit well

**Rationale**: GCS handles large binary assets efficiently. Firestore provides real-time sync and complex queries for marketplace UX.

### 4. Installation Policy: Capability-Based Approval

**Choice**: `InstallPipeline` with `ConnectorInstallPolicy` per tenant

**Policy Features**:
- `blockedCapabilities`: Hard block certain capabilities
- `requireApprovalForCapabilities`: Require human approval for sensitive capabilities (auth, cloud, database)
- `autoApproveVerified`: Auto-approve verified publisher connectors
- `minApprovals`: Multi-party approval for high-risk installs

**Rationale**: Enterprises need control over what connectors can access. Capability-based filtering is granular but not overwhelming.

### 5. UI Architecture: Dedicated Marketplace Pages

**Choice**: Two React pages - browse and detail

**Pages**:
- `/marketplace`: Search, filter, browse grid
- `/marketplace/:connectorId`: Detail view with install button

**Rationale**: Follows standard marketplace UX patterns (npm, VS Code extensions, etc.).

## Consequences

### Positive
- Strong security model with signed packages
- Flexible policy enforcement per tenant
- Standard REST API enables CLI/automation
- Clear separation of concerns (GCS for blobs, Firestore for metadata)

### Negative
- GCS bucket requires additional infrastructure
- Ed25519 signing requires key management for publishers
- Policy complexity may confuse small teams

### Risks
- Search performance at scale (mitigated by Firestore indexes)
- Key compromise for publishers (mitigated by signature revocation)

## Implementation Files

| Component | File |
|-----------|------|
| Types | `packages/core/src/marketplace/types.ts` |
| Storage | `packages/core/src/marketplace/storage.ts` |
| Service | `packages/core/src/marketplace/service.ts` |
| Install Pipeline | `packages/core/src/marketplace/install-pipeline.ts` |
| Registry Routes | `apps/gateway/src/marketplace-routes.ts` |
| Browse UI | `apps/web/src/pages/Marketplace.tsx` |
| Detail UI | `apps/web/src/pages/MarketplaceDetail.tsx` |
| ARV Gate | `scripts/arv/marketplace-gate.ts` |

## Related Decisions

- Phase 25 ADR: Approval Commands + Policy-as-Code (provides SignedApproval types)
- Phase 22 ADR: Connector Abstraction (defines ConnectorCapability)
