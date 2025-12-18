# Phase 9: Remote Connector Registry + Signed Installs

**Document ID**: 080-AA-AACR-phase-9-remote-registry-signatures
**Type**: After-Action Completion Report (AACR)
**Phase**: 9
**Status**: COMPLETE
**Date**: 2025-12-16 23:55 CST
**Author**: Claude Code (Bob-style foreman)

---

## Executive Summary

Phase 9 implements the remote connector registry protocol and cryptographic signature verification for connector installations. Users can now search, install, and verify connectors from remote HTTP registries with Ed25519 signature verification, deterministic tarball packaging, and full audit trail via install receipts.

---

## Scope

### In Scope
- Remote HTTP registry protocol (search, info, download)
- Deterministic tarball creation and extraction
- Ed25519 signature verification (with Node.js crypto fallback)
- Trusted key management
- Install receipts for audit trail
- CLI connector commands (search, install, uninstall, list, key management)
- Local development registry server
- ARV supply chain gate updates for signature verification

### Out of Scope
- SaaS-hosted registry (future phase)
- Connector publishing workflow
- Paid/private connector registry
- Multi-registry federation

---

## Deliverables

### 9.1 Remote Registry Client
**File**: `packages/core/src/connectors/remote-registry.ts`

- `RemoteRegistryClient` class with HTTP JSON protocol
- Endpoints: `/v1/search`, `/v1/connectors/{id}`, `/v1/connectors/{id}/{version}`
- Download tarball and signature endpoints
- Configurable base URL with default registry support
- Error handling with `RegistryError` class

### 9.2 Deterministic Tarball Format
**File**: `packages/core/src/connectors/tarball.ts`

- TAR format implementation from scratch (no external dependencies)
- Determinism rules:
  - Files sorted alphabetically
  - Timestamps normalized to Unix epoch (0)
  - Permissions normalized (0644 files, 0755 dirs)
  - Gzip compression level 9
- Functions: `createTarball()`, `extractTarball()`, `computeTarballChecksum()`, `verifyTarballChecksum()`

### 9.3 Signature Verification
**File**: `packages/core/src/connectors/signature.ts`

- Ed25519 signature verification
- `@noble/ed25519` support (optional) with Node.js crypto fallback
- Trusted key management (`trusted-keys.json` in `~/.gwi/`)
- Functions: `verifySignature()`, `addTrustedKey()`, `removeTrustedKey()`, `listTrustedKeys()`
- Default trusted keys for official GWI registry

### 9.4 Connector Installer
**File**: `packages/core/src/connectors/installer.ts`

- Full install/uninstall workflow
- Install receipt generation for audit trail
- Cache management under `~/.gwi/cache/registry/`
- Version pinning support (`pins.json`)
- Rollback on verification failure

### 9.5 CLI Commands
**File**: `apps/cli/src/commands/connector.ts`

Commands implemented:
- `gwi connector search <query>` - Search remote registry
- `gwi connector info <id>` - Get connector details
- `gwi connector install <id>[@version]` - Install from registry
- `gwi connector uninstall <id>@<version>` - Remove installed connector
- `gwi connector list` - List installed connectors
- `gwi connector add-key <keyId> <publicKey>` - Add trusted key
- `gwi connector list-keys` - List trusted keys
- `gwi connector remove-key <keyId>` - Remove trusted key

Options:
- `--registry <url>` - Override registry URL
- `--json` - Output JSON format
- `--verbose` - Show additional details
- `--skip-signature` - Skip signature verification (warning shown)
- `--force` - Force reinstall

### 9.6 Local Development Server
**File**: `scripts/registry/server.ts`

- Simple HTTP server for local development
- Serves connectors from `connectors/` directory
- Port 3456 by default (`REGISTRY_PORT` env var)
- Mock signature endpoint for testing
- All API endpoints implemented

### 9.7 ARV Supply Chain Gate
**File**: `scripts/arv/connector-supply-chain.ts`

Updates:
- Extended `ValidationResult` with signature fields
- Install receipt checking for registry installs
- Signature verification required for registry-sourced connectors
- CLI output shows signature status

---

## Technical Decisions

### 1. TAR Implementation from Scratch
**Decision**: Implement TAR format directly instead of using external library.
**Rationale**: Ensures determinism without dependency on external library behavior. Full control over timestamp/permission normalization.

### 2. Ed25519 with Fallback
**Decision**: Use `@noble/ed25519` if available, fallback to Node.js crypto.
**Rationale**: Node.js crypto supports Ed25519 via SPKI format. Optional dependency keeps install lightweight while allowing better performance with noble library.

### 3. Install Receipts
**Decision**: Store `install-receipt.json` with each installed connector.
**Rationale**: Provides audit trail for supply chain verification. ARV can distinguish local vs registry installs and enforce appropriate signature requirements.

### 4. Cache Management
**Decision**: Cache downloaded tarballs in `~/.gwi/cache/registry/`.
**Rationale**: Reduces network requests, speeds up reinstalls, enables offline verification.

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/connectors/remote-registry.ts` | Remote registry client |
| `packages/core/src/connectors/tarball.ts` | Deterministic tarball packaging |
| `packages/core/src/connectors/signature.ts` | Ed25519 signature verification |
| `packages/core/src/connectors/installer.ts` | Connector installation workflow |
| `apps/cli/src/commands/connector.ts` | CLI connector commands |
| `scripts/registry/server.ts` | Local development registry server |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/connectors/index.ts` | Added exports for Phase 9 modules |
| `apps/cli/src/index.ts` | Added connector command registration |
| `scripts/arv/connector-supply-chain.ts` | Added signature verification support |

---

## Verification

### Build Status
```
Tasks:    10 successful, 10 total
Time:     16.776s
```

### Type Check
```
Tasks:    14 successful, 14 total
```

### Tests
```
Test Files  10 passed
Tests       149 passed (106 + 43)
```

---

## Known Limitations

1. **No registry hosting** - Local development server only; production registry deployment deferred
2. **No connector publishing** - Install workflow complete; publish workflow deferred
3. **Single registry** - No multi-registry federation support
4. **No connector updates** - Must manually reinstall to update versions

---

## Next Phases / TODOs

1. **Registry Hosting** - Deploy production registry service
2. **Connector Publishing** - `gwi connector publish` command
3. **Automatic Updates** - Check for and apply connector updates
4. **Registry Federation** - Support multiple registries with priority ordering
5. **Rate Limiting** - Add rate limits to registry API

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 6 |
| Files modified | 3 |
| Lines added (estimated) | ~2,100 |
| Build time | 16.8s |
| All tests passing | Yes |

---

## Conclusion

Phase 9 successfully implements the remote connector registry infrastructure with cryptographic verification. The system provides a secure, auditable mechanism for distributing and installing connectors while maintaining the CLI-first approach. Local development workflow is supported via the mock registry server.

**Phase Status**: COMPLETE
