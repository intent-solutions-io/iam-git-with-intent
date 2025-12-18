# ADR-011: Production Readiness - Multi-Tenant Security, Plans/Billing, and Observability

**Status:** Accepted
**Date:** 2025-12-16
**Phase:** 11
**Author:** Claude (AI Assistant) with Jeremy

## Context

Git With Intent has evolved from a CLI tool to a multi-tenant SaaS platform through Phases 8-10. We now need to harden the platform for production use with:

1. **Security**: Role-based access control (RBAC) with proper tenant isolation
2. **Plans/Billing**: Enforcing plan limits without full Stripe integration (hooks ready)
3. **Observability**: Structured logging, metrics, and alerting

The existing codebase had basic tenant isolation but lacked:
- Role-based permissions (only owner/member distinction)
- Plan limit enforcement
- Tenant status management (suspension/deactivation)
- Production-grade observability

## Decision

### 1. Role-Based Access Control (RBAC)

Implement a four-tier role hierarchy:

| Role | Level | Capabilities |
|------|-------|--------------|
| OWNER | 3 | Full access, delete tenant, manage billing |
| ADMIN | 2 | Manage members, settings, connect repos |
| DEVELOPER | 1 | Trigger runs, view logs, repo settings |
| VIEWER | 0 | Read-only access to runs and logs |

**Permission Matrix** (see `/packages/core/src/security/index.ts`):
- `tenant:*` - VIEWER reads, ADMIN updates, OWNER deletes
- `member:*` - ADMIN invites/removes, OWNER manages roles
- `repo:*` - VIEWER reads, ADMIN connects/disconnects
- `run:*` - VIEWER reads, DEVELOPER creates/cancels
- `settings:*` - VIEWER reads, ADMIN updates

### 2. Plan Configuration

Three plan tiers with soft limits:

| Plan | Monthly Runs | Repos | Members | Features |
|------|-------------|-------|---------|----------|
| Free | 50 | 3 | 3 | API access |
| Pro ($49/mo) | 500 | 20 | 15 | Multi-model, analytics, webhooks |
| Enterprise ($299/mo) | 10,000 | 200 | 100 | SSO, priority queue, full features |

Enforcement happens at the API layer before run creation:
```typescript
const runLimitCheck = checkRunLimit(tenant.runsThisMonth, tenant.plan);
if (!runLimitCheck.allowed) {
  return res.status(429).json({ error: 'Plan limit exceeded', ... });
}
```

### 3. Tenant Status Management

New `status` field on Tenant model:
- `active`: Normal operation
- `suspended`: Blocked from creating runs (billing issues)
- `deactivated`: Fully disabled (account closed)

### 4. Observability

**Structured Logging** (Cloud Logging compatible):
```json
{
  "severity": "INFO",
  "type": "http_request",
  "requestId": "req-xxx",
  "method": "POST",
  "path": "/tenants/:tenantId/runs",
  "statusCode": 202,
  "durationMs": 123,
  "tenantId": "gh-org-xxx",
  "userId": "user-xxx"
}
```

**Metrics Endpoint** (`GET /metrics`):
- Request counts by path and status
- Error rate percentage
- Average latency

**Alerting** (Terraform managed):
- High error rate (>5% 5xx responses)
- High latency (P95 > 5000ms)
- Service unavailability (no requests for 5 minutes)

## Consequences

### Positive

1. **Security**: Proper role-based access prevents unauthorized actions
2. **Revenue Protection**: Plan limits prevent abuse and enable monetization
3. **Operational Visibility**: Structured logs and metrics enable debugging
4. **Proactive Response**: Alerts catch issues before users report them
5. **Scalability**: Foundation for proper billing integration

### Negative

1. **Complexity**: More middleware in request chain
2. **Migration Required**: Existing tenants need `status: 'active'` backfill
3. **Breaking Changes**: API now enforces roles (previously assumed owner)

### Neutral

1. **No Stripe Yet**: Billing hooks are ready but not connected
2. **In-Memory Metrics**: Production should use OpenTelemetry/Prometheus

## Implementation

### Files Changed

| File | Changes |
|------|---------|
| `packages/core/src/security/index.ts` | New - RBAC model, plan configs, limits |
| `packages/core/src/storage/interfaces.ts` | Added TenantStatus type |
| `packages/core/src/storage/firestore-membership.ts` | New - Membership store with hasAccess |
| `packages/core/src/storage/firestore-tenant.ts` | Added status field handling |
| `apps/api/src/index.ts` | RBAC middleware, plan enforcement, observability |
| `apps/gateway/src/index.ts` | Tenant verification |
| `apps/github-webhook/src/handlers/installation.ts` | Set status: 'active' on new tenants |
| `firestore.rules` | Enhanced role-based rules, audit/usage collections |
| `infra/terraform/cloud_run.tf` | GWI API Cloud Run service |
| `infra/terraform/monitoring.tf` | New - Alert policies |
| `infra/terraform/variables.tf` | API and Firestore variables |
| `infra/terraform/envs/prod.tfvars` | Production configuration |

### Migration

Existing tenants need status field:
```javascript
// Firestore migration
db.collection('gwi_tenants').get().then(snapshot => {
  snapshot.docs.forEach(doc => {
    if (!doc.data().status) {
      doc.ref.update({ status: 'active' });
    }
  });
});
```

## Verification

1. Build passes: `npm run build -w @gwi/core -w @gwi/api -w @gwi/gateway -w @gwi/github-webhook`
2. Firestore rules updated for role-based access
3. API returns 429 when plan limits exceeded
4. API returns 403 for insufficient permissions
5. Structured logs appear in Cloud Logging
6. /metrics endpoint returns request statistics
7. Terraform validates without errors

## References

- [Previous ADR: Phase 10 UI Shell](#)
- [OWASP Authorization Guidelines](https://owasp.org/www-project-web-security-testing-guide/)
- [Cloud Logging Structured Logging](https://cloud.google.com/logging/docs/structured-logging)
- [Terraform google_monitoring_alert_policy](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/monitoring_alert_policy)
