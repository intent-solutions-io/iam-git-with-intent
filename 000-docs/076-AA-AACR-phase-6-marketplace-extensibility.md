# Phase 6 After-Action Completion Report: Marketplace Extensibility

## Meta

| Field | Value |
|-------|-------|
| Phase | 6 |
| Sub-Phases | 6.1-6.5 |
| Title | Marketplace Extensibility - Connector Packaging + Versioning + Registry |
| Repo/App | git-with-intent |
| Owner | Claude (gwi-foreman) |
| Date/Time | 2025-12-16 23:15 CST |
| Status | **COMPLETE** |
| Related Issues/PRs | N/A |
| Commit(s) | 4a60273 |
| Beads | missing (not recorded) |
| AgentFS | missing (not recorded) |

---

## Executive Summary

Phase 6 introduces a complete connector packaging and registry system enabling versioned, distributable connector packages with integrity verification. Connectors are now installable, versioned, discoverable, and safely loadable without requiring core code changes.

Key deliverables:
- Connector manifest schema (Zod-validated JSON)
- Local filesystem-based registry for discovery
- Runtime dynamic loading with checksum/conformance gates
- Supply chain security gate integrated into ARV

---

## What Changed

### 6.1 Connector Manifest Schema

**Files Created:**
- `packages/core/src/connectors/manifest.ts` (320 lines)
- `packages/core/src/connectors/__tests__/manifest.test.ts` (16 tests)

**Key Types:**
- `ConnectorManifest`: Full schema with id, version, tools, capabilities, checksum
- `ManifestToolDef`: Tool definition with policyClass
- `ConnectorCapability`: Enum (ISSUE_TRACKING, CODE_HOSTING, CI_CD, etc.)

**Helper Functions:**
- `validateManifest()` - Zod validation
- `parseManifest()` - JSON parse + validate
- `getFullToolName()` - Build connector.tool name
- `buildPolicyClassMap()` - Extract tool→policy mapping
- `createTestManifest()` - Factory for tests

### 6.2 Local Connector Registry

**Files Created:**
- `packages/core/src/connectors/registry.ts` (419 lines)
- `packages/core/src/connectors/__tests__/registry.test.ts` (16 tests)

**Key Classes:**
- `LocalConnectorRegistry`: Filesystem registry with scan/load
  - `scan()`: Discover all `connectors/id@version/` directories
  - `listInstalled()`: Return installed connector metadata
  - `getInstalled()`: Get specific connector by id/version
  - `loadConnector()`: Dynamic import with checksum verification

**Utilities:**
- `computeChecksum()`: SHA256 hash of entrypoint
- `verifyChecksum()`: Compare computed vs manifest checksum
- `loadConnectorsIntoRegistry()`: Batch load into ConnectorRegistry

### 6.3 Packaged Connectors

**GitHub Connector** (`connectors/github@1.0.0/`):
- `connector.manifest.json` - 9 tools manifest
- `dist/index.js` - Entrypoint stub
- Tools: getIssue, listIssues, createIssue, updateIssue, closeIssue, getPR, listPRs, createPRComment, mergePR
- Capabilities: ISSUE_TRACKING, CODE_HOSTING, CODE_REVIEW

**Airbyte Connector** (`connectors/airbyte@0.1.0/`):
- `connector.manifest.json` - 8 tools manifest
- `dist/index.js` - Entrypoint stub
- Tools: listConnectors, getConnectorSpec, getConnection, listConnections, syncConnection, createConnection, updateConnection, deleteConnection
- Capabilities: DATA_SYNC, SCHEMA_MANAGEMENT, MONITORING

### 6.4 Runtime Connector Loading

**Files Created:**
- `packages/core/src/connectors/loader.ts` (248 lines)

**Key Functions:**
- `loadAllConnectors(options)`: Discover + verify + load all
- `loadConnector(id, version?, options)`: Load specific connector
- `listInstalledConnectors(registryPath?)`: List without loading
- `unloadConnector(id)`: Remove from registry (placeholder)

**Loading Pipeline:**
1. Scan registry for installed connectors
2. Verify checksums (block on mismatch unless skipped)
3. Run conformance tests (validate schemas, policy classes)
4. Register in global ConnectorRegistry singleton
5. Return detailed results with errors/skips

### 6.5 ARV Supply Chain Gate

**Files Created:**
- `scripts/arv/connector-supply-chain.ts` (389 lines)

**Files Modified:**
- `scripts/arv/run-all.ts` - Added connector supply chain check

**Security Checks:**
- Manifest schema validation
- Checksum verification
- Conformance test validation
- Forbidden pattern detection:
  - Direct `fs` imports
  - `process.env.HOME` access
  - `child_process` execution
  - `eval()` and dynamic `Function()`
  - Path traversal attempts
  - System config access (`/etc/`, `/root/`)

### Module Exports

**Files Modified:**
- `packages/core/src/connectors/index.ts` - Added manifest, registry, loader exports

---

## Why

1. **Extensibility**: Users can add connectors without modifying core code
2. **Versioning**: Semver enables safe upgrades and rollbacks
3. **Security**: Checksum verification prevents tampered connectors
4. **Discovery**: Registry enables `gwi connector list` type commands
5. **Safety Gates**: Conformance + forbidden patterns catch issues before runtime

---

## How to Verify

```bash
# Build all packages
npm run build

# Run all tests (includes manifest + registry tests)
npm test

# Run ARV including connector supply chain
npx tsx scripts/arv/run-all.ts

# Run just connector supply chain gate
npx tsx scripts/arv/connector-supply-chain.ts

# Verify connector packages exist
ls -la connectors/github@1.0.0/
ls -la connectors/airbyte@0.1.0/
```

**Expected Results:**
- Build: 10/10 packages successful
- Tests: All passing (includes 32 new connector tests)
- ARV: 5/5 checks passing, 2/2 connectors verified

---

## Risks / Gotchas

| Risk | Severity | Mitigation |
|------|----------|------------|
| No remote registry | Medium | Manual copy for now; remote registry is future work |
| No runtime sandboxing | Medium | Forbidden patterns + checksum + trust boundary |
| No signature verification | Low | Future: GPG/sigstore integration |
| Dynamic import security | Medium | Only load checksummed, verified connectors |

---

## Rollback Plan

1. Remove `connectors/` directory to disable packaged connectors
2. Revert loader integration if issues arise
3. Core connector functionality in `packages/core/src/connectors/` unaffected
4. Registry is additive - existing code paths unchanged

---

## Open Questions

1. Should remote registry use npm-style or custom protocol?
2. What signature format for connector verification?
3. Should connectors support hot-reload in long-running processes?

---

## Next Actions

1. **Phase 7**: Reliability + Scale (operator-grade hardening)
2. **Future**: Remote connector registry (`gwi install connector-name`)
3. **Future**: Connector signature verification
4. **Future**: Runtime sandboxing (vm2, isolated-vm, or WASM)

---

## Artifacts

### New Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/core/src/connectors/manifest.ts` | 320 | Manifest schema (Zod) |
| `packages/core/src/connectors/registry.ts` | 419 | Local filesystem registry |
| `packages/core/src/connectors/loader.ts` | 248 | Runtime loading with safety |
| `packages/core/src/connectors/__tests__/manifest.test.ts` | - | Manifest tests (16) |
| `packages/core/src/connectors/__tests__/registry.test.ts` | - | Registry tests (16) |
| `connectors/github@1.0.0/connector.manifest.json` | - | GitHub connector manifest |
| `connectors/github@1.0.0/dist/index.js` | - | GitHub connector entrypoint |
| `connectors/airbyte@0.1.0/connector.manifest.json` | - | Airbyte connector manifest |
| `connectors/airbyte@0.1.0/dist/index.js` | - | Airbyte connector entrypoint |
| `scripts/arv/connector-supply-chain.ts` | 389 | Supply chain security gate |
| `000-docs/076-AA-AACR-phase-6-marketplace-extensibility.md` | - | This file |

### Modified Files
| File | Change |
|------|--------|
| `packages/core/src/connectors/index.ts` | Export manifest, registry, loader |
| `scripts/arv/run-all.ts` | Added connector supply chain check |

---

intent solutions io — confidential IP
Contact: jeremy@intentsolutions.io
