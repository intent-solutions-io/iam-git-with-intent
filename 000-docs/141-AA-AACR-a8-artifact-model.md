# AAR: A8 - Artifact Model (GCS)

**Date**: 2025-12-19
**Phase**: A8 - Artifact Model for Evidence Bundles
**Status**: COMPLETE

## Summary

Implemented multi-tenant artifact storage using Google Cloud Storage with tenant isolation, signed URL generation, secret detection, and integrity hashing.

## Components Implemented

### A8.s1: Bucket Layout (Terraform)

**Path Structure**:
```
gs://{project}-run-artifacts/{tenantId}/{repoId}/{runId}/{artifactName}
```

**Example**:
```
gs://gwi-prod-run-artifacts/tenant-abc/repo-123/run-456/triage.json
gs://gwi-prod-run-artifacts/tenant-abc/repo-123/run-456/audit.log
```

### A8.s2: Signed URL Generation

The `GcsArtifactStore` provides signed URLs for secure UI access:

```typescript
const url = await store.getSignedUrl(
  tenantId, repoId, runId, 'triage.json',
  'read',  // action: 'read' | 'write'
  15       // expiry in minutes (default: 15)
);
```

- V4 signing for better compatibility
- Configurable expiry via `artifact_signed_url_expiry_minutes` variable
- Tenant isolation enforced at application layer

### A8.s3: Lifecycle Rules (Terraform)

| Rule | Condition | Action |
|------|-----------|--------|
| General artifacts | 90 days | Delete |
| Audit logs | 365 days | Delete |
| Storage class transition | 30 days | Move to NEARLINE |

### A8.s4: Secret Validation

Comprehensive secret detection with patterns for:
- API keys (OpenAI, Anthropic, Google, AWS)
- GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
- Stripe keys (sk_live_, sk_test_, rk_*)
- Slack tokens (xoxb-, xoxp-, etc.)
- JWT tokens
- Private keys (RSA, EC, DSA, OPENSSH)
- Generic password/secret patterns

```typescript
// Throws if secrets detected
validateNoSecrets(content);

// Or check manually
const secrets = detectSecrets(content);
if (secrets.length > 0) {
  console.warn('Detected secrets:', secrets);
}
```

### A8.s5: Integrity Hashes

All artifacts stored with SHA256 hash in metadata:

```typescript
// Compute hash
const hash = computeHash(content); // "sha256:abc123..."

// Verify integrity
const valid = await store.verifyArtifactIntegrity(
  tenantId, repoId, runId, 'triage.json'
);
```

## Files Changed

### Infrastructure (`infra/`)
- `storage.tf` - Added `google_storage_bucket.run_artifacts` with lifecycle rules
- `variables.tf` - Added retention and signed URL expiry variables

### Core Package (`packages/core/`)
- `package.json` - Added `@google-cloud/storage` dependency
- `src/run-bundle/gcs-artifact-store.ts` - New GCS artifact store implementation
- `src/run-bundle/index.ts` - Exported GCS artifact store module
- `src/run-bundle/__tests__/gcs-artifact-store.test.ts` - 25 unit tests

## API Usage

```typescript
import { getGcsArtifactStore, validateNoSecrets } from '@gwi/core/run-bundle';

// Get store (configured via GWI_ARTIFACTS_BUCKET env var)
const store = getGcsArtifactStore();

// Write artifact (validates no secrets by default)
const result = await store.writeArtifact(
  tenantId, repoId, runId,
  'triage.json',
  { complexity: 'high', score: 0.85 }
);

// Read artifact
const content = await store.readJsonArtifact<TriageResult>(
  tenantId, repoId, runId, 'triage.json'
);

// Generate signed URL for UI
const url = await store.getSignedUrl(
  tenantId, repoId, runId, 'patch.diff'
);

// Verify integrity
const valid = await store.verifyArtifactIntegrity(
  tenantId, repoId, runId, 'triage.json'
);
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GWI_ARTIFACTS_BUCKET` | GCS bucket name | Required |
| `GCP_PROJECT_ID` | GCP project | ADC default |
| `GWI_SIGNED_URL_EXPIRY_MINUTES` | Signed URL expiry | 15 |

## Terraform Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `artifact_retention_days` | Days to retain artifacts | 90 |
| `audit_log_retention_days` | Days to retain audit logs | 365 |
| `artifact_signed_url_expiry_minutes` | Signed URL expiry | 15 |

## Test Results

```
Test Files  1 passed (1)
     Tests  25 passed (25)
```

## Security Considerations

1. **Tenant Isolation**: Enforced at application layer via signed URLs
2. **No Public Access**: `public_access_prevention = "enforced"`
3. **Secret Scanning**: Prevents credential leakage in artifacts
4. **Integrity Verification**: SHA256 hashes detect tampering
5. **Soft Delete**: 7-day recovery window for accidental deletions

## Next Steps

- A9: Secrets model (Secret Manager)
- A10: Multi-tenant authorization middleware
