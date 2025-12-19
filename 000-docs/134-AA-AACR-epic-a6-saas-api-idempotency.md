# AAR: A6 SaaS API Idempotency

> **Phase**: A (Platform Core Runtime)
> **Date**: 2024-12-19
> **Status**: Complete
> **Epic**: A6 - Add Idempotency to SaaS API Mutations

## Summary

Added idempotency middleware to all SaaS API mutation endpoints to prevent duplicate processing of API requests. This completes the idempotency layer integration across the entire platform.

## What Was Completed

### A6.s1: Identify Mutation Endpoints

Identified 16 high-priority POST endpoints requiring idempotency:

| Endpoint | Purpose |
|----------|---------|
| `POST /tenants` | Create tenant |
| `POST /tenants/:tenantId/invites` | Invite member |
| `POST /tenants/:tenantId/repos:connect` | Connect repository |
| `POST /tenants/:tenantId/runs` | Start agent run |
| `POST /tenants/:tenantId/runs/:runId/approve` | Approve run |
| `POST /tenants/:tenantId/runs/:runId/reject` | Reject run |
| `POST /tenants/:tenantId/settings` | Update settings |
| `POST /tenants/:tenantId/workflows` | Start workflow |
| `POST /tenants/:tenantId/workflows/:workflowId/approve` | Approve workflow |
| `POST /v1/tenants/:tenantId/instances` | Create instance |
| `POST /v1/instances/:instanceId/run` | Execute instance |
| `POST /v1/instances/:instanceId/schedules` | Create schedule |
| `POST /v1/tenants/:tenantId/signals` | Create signal |
| `POST /v1/tenants/:tenantId/queue/:itemId/dismiss` | Dismiss work item |
| `POST /v1/tenants/:tenantId/queue/:itemId/candidate` | Generate candidate |
| `POST /v1/candidates/:candidateId/approve` | Approve candidate |

### A6.s2: Apply Idempotency Middleware

Added `idempotencyMiddleware` to each endpoint with tenant-specific context:

```typescript
app.post('/tenants/:tenantId/runs',
  rateLimitMiddleware('expensive'),
  authMiddleware,
  tenantAuthMiddleware,
  requirePermission('run:create'),
  idempotencyMiddleware({
    getTenantId: (req) => req.params.tenantId,
  }),
  async (req, res) => {
    // Handler only runs once per idempotency key
  }
);
```

### A6.s3: Update Mock for E2E Tests

Updated `workflow.e2e.test.ts` mock to include idempotency exports:

```typescript
vi.mock('@gwi/engine', () => ({
  createEngine: vi.fn(() => ({ ... })),
  idempotencyMiddleware: vi.fn(() => (_req, _res, next) => next()),
  requireIdempotency: vi.fn(() => (_req, _res, next) => next()),
}));
```

### A6.s4: Add Integration Tests

Created `apps/api/src/__tests__/api-idempotency.test.ts` with 12 tests:

| Test Suite | Tests |
|------------|-------|
| Tenant Creation | Create, duplicate detection, different keys, optional mode |
| Runs | Create, duplicate skip, tenant isolation |
| Concurrent Requests | Rapid duplicate handling |
| Instance Execution | Create, duplicate skip |
| Header Variants | X-Request-ID, Idempotency-Key support |

## Files Created

| File | Purpose |
|------|---------|
| `apps/api/src/__tests__/api-idempotency.test.ts` | API idempotency tests (12 tests) |
| `000-docs/134-AA-AACR-epic-a6-saas-api-idempotency.md` | This AAR |

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Added idempotency middleware to 16 endpoints |
| `apps/api/src/__tests__/workflow.e2e.test.ts` | Added idempotency mocks |

## Endpoints Not Modified (By Design)

| Endpoint | Reason |
|----------|--------|
| `POST /signup` | Auth uniqueness handles duplicates |
| `POST /invites/:inviteToken/accept` | Token is single-use |
| `POST /webhooks/stripe` | Stripe handles idempotency |
| `POST /tenants/:tenantId/billing/*` | Stripe handles idempotency |
| `POST /tenants/:tenantId/policy/validate` | Read-only validation |
| `POST /v1/tenants/:tenantId/signals/process` | Processing is idempotent by signal ID |

## Key Integration Patterns

### 1. Tenant-Scoped Idempotency

```typescript
idempotencyMiddleware({
  getTenantId: (req) => req.params.tenantId,
})
```

### 2. User-Scoped Idempotency (Tenant Creation)

```typescript
idempotencyMiddleware({
  getTenantId: (req) => req.context?.userId || 'default',
})
```

### 3. Resource-Scoped Idempotency (Instance Execution)

```typescript
idempotencyMiddleware({
  getTenantId: (req) => req.params.instanceId,
})
```

## Client Usage

```bash
# Using X-Idempotency-Key
curl -X POST /tenants/acme/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Idempotency-Key: run-12345" \
  -d '{"prUrl": "https://github.com/org/repo/pull/1"}'

# Using X-Request-ID (alternative)
curl -X POST /tenants/acme/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Request-ID: request-uuid-12345" \
  -d '{"prUrl": "https://github.com/org/repo/pull/1"}'
```

## Response Headers

```
X-Idempotency-Key: run-12345
X-Idempotency-Replayed: true  # Only on duplicate requests
```

## Test Results

```
 Tasks:    23 successful, 23 total
 Tests:    18 passed (18) in api
 Build:    12 successful, 12 total
```

## Security Considerations

- Idempotency keys are scoped by tenant/resource for isolation
- Client ID derived from auth header or IP for additional context
- Rate limiting still applies (idempotency doesn't bypass)
- Optional mode allows clients to opt-in without breaking existing integrations

## Next Steps

- Configure Cloud Scheduler for idempotency TTL cleanup
- Add dashboard metrics for duplicate rate monitoring
- Document idempotency headers in API documentation

## Evidence

```bash
# Build
$ npm run build
Tasks: 12 successful, 12 total
Cached: 12 cached, 12 total

# Tests
$ npm run test
Tasks: 23 successful, 23 total
Tests: 18 passed (18)
```
