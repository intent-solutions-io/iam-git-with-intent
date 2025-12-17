# Phase 21: Connector Marketplace Hosting + Publish/Update + Signature Enforcement + Federation

**Document ID**: 092-AA-AACR-phase-21-connector-marketplace-hosting
**Type**: After-Action Completion Report (AACR)
**Phase**: 21
**Status**: COMPLETE
**Date**: 2025-12-17 14:00 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-9zj` |
| Beads (Tasks) | `git-with-intent-9zj.1` (21.1), `git-with-intent-9zj.2` (21.2), `git-with-intent-9zj.3` (21.3), `git-with-intent-9zj.4` (21.4), `git-with-intent-9zj.5` (21.5), `git-with-intent-9zj.6` (21.6) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |
| Related Issues/PRs | N/A |
| Commit(s) | (uncommitted - Phase 21 implementation) |

---

## Executive Summary

Phase 21 implements a production-grade connector registry system with:

- Real Ed25519 signature signing and verification on publish
- Enhanced registry server with manifest validation
- Multi-registry federation configuration
- CLI commands for keypair generation and federated search
- ARV gate for registry integration verification

---

## Scope

### In Scope
- Ed25519 signing functions (`signChecksum`, `generateKeyPair`, `createSignedSignatureFile`)
- Enhanced registry server with signature verification on publish
- Manifest validation with required field enforcement
- Federation configuration system with priority ordering
- CLI `generate-key` command for keypair creation
- CLI `registries` command for listing configured registries
- CLI `federated-search` command for cross-registry search
- ARV registry integration gate

### Out of Scope
- GCS backend for tarball storage (file-based remains)
- Terraform for Cloud Run deployment of registry
- UI for connector marketplace browsing
- Automatic key rotation

---

## Deliverables

### 21.1 Registry Service Enhancement

**File Modified**: `apps/registry/src/index.ts`

| Enhancement | Description |
|-------------|-------------|
| Ed25519 verification | Server-side signature verification on publish |
| Manifest validation | Required fields: id, version, displayName, capabilities |
| Immutability enforcement | Same id+version cannot be republished |
| Stats endpoint | New `/v1/stats` endpoint with registry statistics |
| Configuration | `REGISTRY_REQUIRE_SIGNATURE`, `REGISTRY_TRUSTED_KEYS` env vars |

Environment Variables:
```bash
REGISTRY_REQUIRE_SIGNATURE=true   # Default: true
REGISTRY_TRUSTED_KEYS='[{"keyId":"my-key","publicKey":"base64..."}]'
```

### 21.2 Ed25519 Signing Functions

**File Modified**: `packages/core/src/connectors/signature.ts`

| Function | Description |
|----------|-------------|
| `signChecksum(checksum, privateKey)` | Sign a checksum with Ed25519 private key |
| `generateKeyPair()` | Generate new Ed25519 keypair |
| `createSignedSignatureFile(keyId, checksum, privateKey)` | Create complete signature file |

These use Node.js crypto with Ed25519 support (falls back to @noble/ed25519 if available).

### 21.3 CLI Publish Enhancement

**File Modified**: `apps/cli/src/commands/connector.ts`

The `gwi connector publish` command now requires a real Ed25519 private key:

```bash
# Generate keypair
gwi connector generate-key

# Publish with real signature
GWI_SIGNING_KEY=<private-key-base64> gwi connector publish \
  --key my-key-id \
  --path ./my-connector
```

### 21.4 Federation System

**File Created**: `packages/core/src/connectors/federation.ts`

| Export | Description |
|--------|-------------|
| `FederationConfig` | Configuration type for multi-registry |
| `RegistryConfig` | Individual registry configuration |
| `loadFederationConfig()` | Load from `~/.gwi/federation.json` |
| `saveFederationConfig()` | Save configuration |
| `addRegistry()` | Add a registry to federation |
| `removeRegistry()` | Remove a registry |
| `listRegistries()` | List all registries |
| `FederatedRegistryClient` | Client that searches across all registries |
| `createFederatedRegistry()` | Create federated client |

Trust Levels:
- `official` - GWI official registry
- `enterprise` - Enterprise/private registries
- `community` - Community-contributed connectors
- `local` - Local development registries

### 21.5 CLI Federation Commands

**New Commands in `apps/cli/src/commands/connector.ts`**:

| Command | Description |
|---------|-------------|
| `gwi connector generate-key` | Generate Ed25519 keypair |
| `gwi connector registries` | List configured registries |
| `gwi connector federated-search <query>` | Search across all enabled registries |

### 21.6 ARV Gate

**File Created**: `scripts/arv/registry-gate.ts`

**File Modified**: `scripts/arv/run-all.ts` (added gate)

Gate checks:
1. Registry server has Ed25519 verification
2. Signing functions exist and exported
3. Federation module exists
4. CLI has Phase 21 commands
5. TypeScript compilation passes

---

## Technical Decisions

### 1. Node.js Crypto for Ed25519
**Decision**: Use Node.js built-in crypto module for Ed25519
**Rationale**: No additional dependencies required; @noble/ed25519 remains optional fallback

### 2. File-Based Federation Config
**Decision**: Store federation config in `~/.gwi/federation.json`
**Rationale**: Follows existing trusted-keys.json pattern; easy to inspect/edit

### 3. Registry Trust Levels
**Decision**: Four trust levels (official, enterprise, community, local)
**Rationale**: Allows policy enforcement based on registry source

### 4. Signature Required by Default
**Decision**: `REGISTRY_REQUIRE_SIGNATURE=true` is the default
**Rationale**: Security-first approach; must explicitly opt-out

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/connectors/federation.ts` | Multi-registry federation |
| `scripts/arv/registry-gate.ts` | ARV gate for registry verification |
| `000-docs/092-AA-AACR-phase-21-connector-marketplace-hosting.md` | This document |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/connectors/signature.ts` | Added signing functions |
| `packages/core/src/connectors/index.ts` | Export signing and federation |
| `apps/registry/src/index.ts` | Ed25519 verification, manifest validation, stats endpoint |
| `apps/cli/src/commands/connector.ts` | generate-key, registries, federated-search commands |
| `scripts/arv/run-all.ts` | Added registry gate |

---

## Verification

### Build Status
```
npm run build
 Tasks:    12 successful, 12 total
  Time:    ~6s
```

### Tests
```
npm run test
 Tasks:    23 successful, 23 total
  Time:    ~8s
```

### ARV Gate
```
npx tsx scripts/arv/registry-gate.ts
✅ Registry server module
✅ Ed25519 signing functions
✅ Federation module
✅ Federation exports from @gwi/core
✅ CLI Phase 21 commands
✅ TypeScript compilation
 6 passed, 0 failed
✅ Registry Integration Gate PASSED
```

---

## API Reference

### Generate Keypair
```typescript
import { generateKeyPair } from '@gwi/core';

const { publicKey, privateKey } = await generateKeyPair();
// publicKey: base64 encoded Ed25519 public key (32 bytes)
// privateKey: base64 encoded Ed25519 private key (32 bytes)
```

### Sign a Connector
```typescript
import { createSignedSignatureFile, createTarball } from '@gwi/core';

const tarball = await createTarball('./my-connector');
const signature = await createSignedSignatureFile(
  'my-key-id',
  tarball.checksum,
  privateKeyBase64
);
```

### Federation Config
```typescript
import {
  loadFederationConfig,
  createFederatedRegistry,
} from '@gwi/core';

// Load config (from ~/.gwi/federation.json or defaults)
const config = await loadFederationConfig();

// Create federated client
const federated = await createFederatedRegistry();
const results = await federated.search('github');
```

### CLI Usage
```bash
# Generate keypair
gwi connector generate-key --json

# List registries
gwi connector registries

# Federated search
gwi connector federated-search "github"

# Publish with signature
GWI_SIGNING_KEY=<key> gwi connector publish --key my-key-id
```

---

## Known Limitations

1. **File-Based Storage**: Registry still uses file storage, not GCS
2. **No Key Rotation**: Manual key management required
3. **No UI**: Federation is CLI-only
4. **Single Registry Write**: Can only publish to one registry at a time

---

## Next Phases / TODOs

1. **GCS Backend**: Move tarball storage to Cloud Storage for production
2. **Terraform Deployment**: Add Cloud Run deployment for registry
3. **Web UI**: Connector marketplace browsing interface
4. **Key Rotation**: Automated key rotation with deprecation periods
5. **Webhook Notifications**: Notify on new connector versions
6. **Rate Limiting**: Add publish rate limits per API key

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 3 |
| Files modified | 5 |
| Lines added (estimated) | ~800 |
| Build time | 6s |
| Test time | 8s |
| ARV gate checks | 6 |
| All checks passing | Yes |

---

## Conclusion

Phase 21 successfully implements a production-grade connector registry system:

1. **Real Ed25519 Signing**: `gwi connector publish` now uses real cryptographic signatures
2. **Server Verification**: Registry validates signatures before accepting connectors
3. **Federation**: Multi-registry support with trust levels and priority ordering
4. **CLI Commands**: New commands for keypair generation and federated search
5. **ARV Gate**: Continuous verification of registry infrastructure

The system enforces "no signature bypass by default" - publishers must provide valid signatures, and registries verify them before accepting uploads.

**Phase Status**: COMPLETE

---

intent solutions io - confidential IP
Contact: jeremy@intentsolutions.io
