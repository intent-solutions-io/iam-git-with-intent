# AAR: A9 - Secrets Model (Secret Manager)

**Date**: 2025-12-19
**Phase**: A9 - Secrets Model
**Status**: COMPLETE

## Summary

Implemented unified secrets management with Google Cloud Secret Manager, including service-specific loading, rotation tracking, plaintext detection, and least-privilege IAM bindings.

## Components Implemented

### A9.s1: Secrets Inventory

Documented all secrets with their purpose and consumers:

| Secret ID | Description | Consumers | Rotation |
|-----------|-------------|-----------|----------|
| `gwi-github-app-private-key` | GitHub App authentication | gateway, worker, github-webhook | 90 days |
| `gwi-github-webhook-secret` | Webhook HMAC validation | github-webhook | 180 days |
| `gwi-anthropic-api-key` | Claude API access | worker | 90 days |
| `gwi-google-ai-api-key` | Gemini API access | worker | 90 days |
| `gwi-stripe-secret-key` | Stripe billing | api | 90 days |
| `gwi-stripe-webhook-secret` | Stripe webhook validation | api | 180 days |
| `gwi-slack-signing-secret` | Slack request verification | gateway | 180 days |
| `gwi-slack-bot-token` | Slack bot OAuth | gateway | 365 days |

### A9.s2: Service Secret Loading

Each service loads only the secrets it needs:

```typescript
import { getSecretsClient, loadServiceSecrets } from '@gwi/core';

const client = getSecretsClient();
const secrets = await loadServiceSecrets(client, 'worker');
// Returns: { 'gwi-github-app-private-key': '...', 'gwi-anthropic-api-key': '...', ... }
```

Service mappings:
- **api**: stripe-secret-key, stripe-webhook-secret
- **gateway**: github-app-private-key
- **worker**: github-app-private-key, anthropic-api-key, google-ai-api-key
- **github-webhook**: github-app-private-key, github-webhook-secret

### A9.s3: Rotation Procedure

Built-in rotation tracking:

```typescript
import { checkSecretRotation, getRotationReport } from '@gwi/core';

// Check single secret
const status = await checkSecretRotation(client, 'gwi-anthropic-api-key');
// { needsRotation: false, daysSinceCreation: 45, recommendedRotationDays: 90 }

// Full rotation report
const report = await getRotationReport(client);
```

### A9.s4: Plaintext Enforcement

Prevents plaintext secrets in environment variables:

```typescript
import { enforceNoPlaintextSecrets, validateNoPlaintextSecrets } from '@gwi/core';

// At startup - throws if violations found
enforceNoPlaintextSecrets();

// Manual check
const violations = validateNoPlaintextSecrets(process.env);
```

Detected patterns:
- API keys (sk-, ghp_, AKIA, etc.)
- Private keys (-----BEGIN ... PRIVATE KEY-----)
- Base64-encoded long strings
- Slack tokens (xoxb-, xoxp-, etc.)

### A9.s5: Least-Privilege IAM

Per-secret IAM bindings in Terraform:

```hcl
# Each service only gets access to its required secrets
resource "google_secret_manager_secret_iam_member" "worker_anthropic_key" {
  secret_id = "gwi-anthropic-api-key"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gwi_worker[0].email}"
}
```

## Files Changed

### Core Package (`packages/core/`)
- `package.json` - Added `@google-cloud/secret-manager`
- `src/secrets/index.ts` - New secrets management module
- `src/secrets/__tests__/secrets.test.ts` - 21 unit tests
- `src/index.ts` - Export secrets module

### Infrastructure (`infra/`)
- `iam.tf` - Per-secret IAM bindings for all services

## API Usage

```typescript
import {
  SecretsClient,
  getSecretsClient,
  loadServiceSecrets,
  verifyServiceSecrets,
  checkSecretRotation,
  getRotationReport,
  enforceNoPlaintextSecrets,
  SECRET_INVENTORY,
} from '@gwi/core';

// Initialize client
const client = getSecretsClient({ projectId: 'my-project' });

// Get single secret (with caching)
const apiKey = await client.getSecretValue('gwi-anthropic-api-key');

// Load all secrets for a service
const secrets = await loadServiceSecrets(client, 'worker');

// Verify all required secrets exist
const ready = await verifyServiceSecrets(client, 'worker');

// Check if secret needs rotation
const rotationStatus = await checkSecretRotation(client, 'gwi-anthropic-api-key');

// Enforce no plaintext at startup
enforceNoPlaintextSecrets();
```

## Caching

- Default TTL: 5 minutes
- Configurable via `cacheTtlMinutes` option
- Automatic cache invalidation on rotation
- Thread-safe in-memory cache

## Test Results

```
Test Files  1 passed (1)
     Tests  21 passed (21)
```

## Terraform Validation

```
Success! The configuration is valid.
```

## Security Considerations

1. **No Plaintext**: Startup check prevents hardcoded secrets
2. **Least Privilege**: Each service only accesses required secrets
3. **Rotation Tracking**: Built-in rotation policy monitoring
4. **Caching**: Reduces API calls while supporting rotation
5. **Audit Trail**: Secret Manager provides access logs

## Next Steps

- A10: Multi-tenant authorization middleware
- A11: Cost metering primitives
- A12: SLO definitions + perf tests
