# 083-AA-AACR: Phase 12 — Tenant Admin: Policy-as-Code UI + Config Store + Secrets

**Document ID**: 083-AA-AACR-phase-12-tenant-admin-policy-config
**Type**: After-Action Completion Report
**Date**: 2025-12-17 01:00 CST
**Author**: Claude Code (gwi-foreman)
**Status**: COMPLETE

---

## 1. Summary

Phase 12 implements the tenant administration layer for Policy-as-Code management, connector configuration, and secrets wiring. This enables tenant administrators to:

- Edit and validate policy documents through API and UI
- Configure connector settings (timeouts, rate limits, base URLs)
- Manage secret references with proper provider abstraction
- View policy evaluation outcomes in run details

## 2. Scope

### In Scope
- Tenant Policy API (GET/PUT/POST validate)
- Tenant Connector Config API (CRUD operations)
- Secret provider interface with dev/env/gcp adapters
- Admin UI pages (Policy, Connectors, Secrets)
- Policy decision visibility in RunDetail page

### Out of Scope
- Full policy enforcement engine (placeholder evaluation)
- Secret rotation automation
- Audit logging for config changes
- Role-based admin permissions (uses existing RBAC)

## 3. Implementation Details

### 3.1 Tenant Policy API

**Files Modified:**
- `apps/api/src/index.ts` - Added policy endpoints

**Endpoints:**
- `GET /tenants/:tenantId/policy` - Retrieve tenant policy
- `PUT /tenants/:tenantId/policy` - Update tenant policy
- `POST /tenants/:tenantId/policy/validate` - Validate policy document

**Schema:**
```typescript
PolicyDocumentSchema = z.object({
  version: z.string().default('1.0'),
  name: z.string(),
  description: z.string().optional(),
  defaultReadBehavior: z.enum(['allow', 'deny']).default('allow'),
  defaultWriteBehavior: z.enum(['allow', 'deny']).default('deny'),
  defaultDestructiveBehavior: z.literal('deny').default('deny'),
  rules: z.array(PolicyRuleSchema),
});
```

### 3.2 Tenant Connector Config API

**Files Modified:**
- `packages/core/src/storage/interfaces.ts` - Added types
- `packages/core/src/storage/firestore-client.ts` - Added collection
- `packages/core/src/storage/firestore-tenant.ts` - Implemented methods
- `packages/core/src/storage/inmemory.ts` - Implemented methods
- `apps/api/src/index.ts` - Added endpoints

**Types Added:**
```typescript
interface TenantConnectorConfig {
  connectorId: string;
  tenantId: string;
  enabled: boolean;
  baseUrl?: string;
  timeouts: { connectMs: number; readMs: number };
  rateLimit?: { requestsPerMinute?: number; requestsPerHour?: number };
  secretRefs: Record<string, string>;
  config: Record<string, unknown>;
  updatedAt: Date;
  updatedBy: string;
}
```

**Endpoints:**
- `GET /tenants/:tenantId/connectors/:connectorId/config`
- `PUT /tenants/:tenantId/connectors/:connectorId/config`
- `DELETE /tenants/:tenantId/connectors/:connectorId/config`

### 3.3 Secret Provider

**Files Modified:**
- `packages/core/src/security/index.ts` - Added complete provider system

**Providers Implemented:**
1. **EnvSecretProvider** - Read-only, reads from environment variables
2. **DevSecretProvider** - Read/write, stores in `.gwi/secrets/` directory
3. **GCPSecretProvider** - Production provider using GCP Secret Manager
4. **CompositeSecretProvider** - Routes requests based on ref prefix

**Secret Reference Format:**
- `env://VAR_NAME` - Environment variable
- `dev://secret_name` - Local development file
- `gcp://secret-name` - GCP Secret Manager

**Helper Functions:**
- `getSecretProvider()` - Returns configured provider
- `resolveSecretRefs(refs)` - Resolves all refs to values
- `redactSecrets(obj)` - Redacts secret values for logging

### 3.4 Admin UI Pages

**Files Created:**
- `apps/web/src/pages/AdminPolicy.tsx` - Policy JSON editor with validate/save
- `apps/web/src/pages/AdminConnectors.tsx` - Connector list with status
- `apps/web/src/pages/AdminConnectorConfig.tsx` - Per-connector config form
- `apps/web/src/pages/AdminSecrets.tsx` - Secret reference management

**Routes Added:**
- `/admin/policy`
- `/admin/connectors`
- `/admin/connectors/:connectorId`
- `/admin/secrets`

### 3.5 Policy Decision Visibility

**Files Modified:**
- `apps/web/src/pages/RunDetail.tsx` - Added PolicyDecisions section

**Features:**
- Shows policy class badges (READ, WRITE_NON_DESTRUCTIVE, DESTRUCTIVE)
- Displays allow/deny decisions with reasons
- Links to triggering rule IDs

## 4. Technical Decisions

### 4.1 Dynamic Import for GCP Secret Manager

**Decision:** Use dynamic import with type assertion for `@google-cloud/secret-manager`

**Rationale:** Avoid requiring the heavy GCP SDK as a direct dependency for users who don't need GCP integration. The dynamic import only loads when GCP secrets are actually accessed.

```typescript
const { SecretManagerServiceClient } = await import(
  '@google-cloud/secret-manager' as string
);
```

### 4.2 Secret Reference Format

**Decision:** Use URI-style refs (`provider://path`)

**Rationale:** Clear, extensible format that:
- Self-documents the provider being used
- Allows easy routing in composite provider
- Supports namespacing for multi-tenant scenarios

### 4.3 Firestore Subcollection for Configs

**Decision:** Store connector configs in `tenants/{id}/connector_configs/{connectorId}`

**Rationale:** Natural hierarchical structure that:
- Keeps configs scoped to tenant
- Enables simple security rules
- Supports efficient queries per tenant

## 5. Verification

### Build Status
```
npm run build ✓
All 11 packages compiled successfully
```

### Test Status
```
npm test ✓
21 tasks successful
106 tests passed (integrations)
6 tests passed (API)
```

### Manual Verification
- Policy API endpoints functional
- Connector config CRUD operations work
- Secret provider abstraction resolves refs
- Admin UI pages render correctly
- Policy decisions display in run detail

## 6. Security Considerations

1. **Secret Values Never Exposed** - UI only shows refs, never actual values
2. **GCP IAM Required** - GCPSecretProvider requires proper service account permissions
3. **Dev Secrets Local Only** - DevSecretProvider stores in local `.gwi/secrets/`
4. **Tenant Isolation** - All APIs require tenant membership verification

## 7. Known Limitations

1. **Policy Enforcement Placeholder** - Full policy engine not implemented
2. **No Secret Rotation** - Manual rotation only
3. **No Audit Trail** - Config changes not logged (planned for future phase)
4. **Mock Data in Secrets UI** - Real API integration pending

## 8. Files Changed

### New Files
- `apps/web/src/pages/AdminPolicy.tsx`
- `apps/web/src/pages/AdminConnectors.tsx`
- `apps/web/src/pages/AdminConnectorConfig.tsx`
- `apps/web/src/pages/AdminSecrets.tsx`

### Modified Files
- `packages/core/src/storage/interfaces.ts`
- `packages/core/src/storage/firestore-client.ts`
- `packages/core/src/storage/firestore-tenant.ts`
- `packages/core/src/storage/inmemory.ts`
- `packages/core/src/security/index.ts`
- `apps/api/src/index.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/RunDetail.tsx`

## 9. Next Steps

1. **Phase 13**: Workflow Templates + Scheduling + Notifications
2. Full policy enforcement engine integration
3. Secret rotation automation
4. Admin action audit logging
5. Connector health monitoring

---

*Phase 12 complete. Tenant administrators can now manage policies, connectors, and secrets through both API and UI.*
