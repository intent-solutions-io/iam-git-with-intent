# OpenAPI 3.0 Specification - Git With Intent API

This directory contains the complete OpenAPI 3.0 specification for the Git With Intent SaaS platform.

## Overview

The OpenAPI specification is the source of truth for the API and serves multiple purposes:
- **API Documentation**: Generates interactive API docs (Swagger UI, ReDoc)
- **Client SDK Generation**: Automates SDK creation for TypeScript, Python, Go, etc.
- **Type Safety**: Ensures request/response validation and TypeScript type generation
- **Testing**: Powers automated API testing and validation
- **Versioning**: Tracks breaking changes and API evolution

## Files

- **`spec.ts`** - Complete OpenAPI 3.0 specification as a TypeScript constant
- **`index.ts`** - Module exports for easy importing
- **`README.md`** - This file

## Quick Start

### Importing the Specification

```typescript
// In your application
import { openAPISpec } from '@gwi/core/openapi';

// Access the spec object
console.log(openAPISpec.info.version);
console.log(openAPISpec.paths);
```

### Serving via Express

```typescript
import express from 'express';
import { openAPISpec } from '@gwi/core/openapi';

const app = express();

// Serve OpenAPI spec as JSON
app.get('/openapi.json', (_req, res) => {
  res.json(openAPISpec);
});

// Alternative: Serve with custom endpoint
app.get('/api/openapi', (_req, res) => {
  res.json(openAPISpec);
});
```

### Swagger UI Integration

```typescript
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openAPISpec } from '@gwi/core/openapi';

const app = express();

// Mount Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openAPISpec));
```

## API Endpoints Overview

### Health & Observability
- `GET /health` - Service health check
- `GET /metrics` - API metrics and statistics

### Authentication
- `POST /signup` - User registration
- `GET /me` - Current user profile
- `GET /github/install` - GitHub App installation redirect
- `GET /github/callback` - GitHub App callback handler

### Tenants (Workspaces)
- `POST /tenants` - Create new workspace
- `GET /tenants` - List user's workspaces
- `GET /tenants/:tenantId` - Get workspace details

### Members & Invitations
- `GET /tenants/:tenantId/members` - List team members
- `POST /tenants/:tenantId/invites` - Invite new member (ADMIN+)
- `GET /tenants/:tenantId/invites` - List pending invites (ADMIN+)
- `DELETE /tenants/:tenantId/invites/:inviteId` - Cancel invite (ADMIN+)
- `POST /invites/:inviteToken/accept` - Accept invitation

### Repositories
- `GET /tenants/:tenantId/repos` - List connected repos
- `POST /tenants/:tenantId/repos:connect` - Connect new repo (ADMIN+)

### Runs
- `GET /tenants/:tenantId/runs` - List runs (VIEWER+)
- `POST /tenants/:tenantId/runs` - Start new run (DEVELOPER+)
- `GET /tenants/:tenantId/runs/:runId` - Get run status (VIEWER+)

### Settings
- `POST /tenants/:tenantId/settings` - Update settings (ADMIN+)

### Workflows
- `POST /tenants/:tenantId/workflows` - Start workflow (DEVELOPER+)
- `GET /tenants/:tenantId/workflows` - List workflows (VIEWER+)
- `GET /tenants/:tenantId/workflows/:workflowId` - Get workflow details (VIEWER+)
- `POST /tenants/:tenantId/workflows/:workflowId/approve` - Approve workflow (ADMIN+)

## Authentication

The API uses Bearer token authentication. Include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.gitwithintent.com/tenants
```

### Development Mode

In development, use the `X-Debug-User` header:

```bash
curl -H "X-Debug-User: user-123" \
  -H "X-Debug-Role: owner" \
  http://localhost:8080/tenants
```

## Role-Based Access Control

The API implements fine-grained role-based access control:

| Role      | Hierarchy | Permissions |
|-----------|-----------|-------------|
| VIEWER    | 0         | Read-only access to runs and settings |
| DEVELOPER | 1         | Can trigger runs, modify repo settings |
| ADMIN     | 2         | Full operational access, manage members |
| OWNER     | 3         | Full access including billing and deletion |

### Permission Matrix

| Action | VIEWER | DEVELOPER | ADMIN | OWNER |
|--------|--------|-----------|-------|-------|
| tenant:read | ✓ | ✓ | ✓ | ✓ |
| tenant:update | | | ✓ | ✓ |
| tenant:delete | | | | ✓ |
| tenant:billing | | | | ✓ |
| member:invite | | | ✓ | ✓ |
| member:remove | | | ✓ | ✓ |
| member:update_role | | | | ✓ |
| repo:read | ✓ | ✓ | ✓ | ✓ |
| repo:connect | | | ✓ | ✓ |
| repo:disconnect | | | ✓ | ✓ |
| repo:settings | | ✓ | ✓ | ✓ |
| run:read | ✓ | ✓ | ✓ | ✓ |
| run:create | | ✓ | ✓ | ✓ |
| run:cancel | | ✓ | ✓ | ✓ |
| settings:read | ✓ | ✓ | ✓ | ✓ |
| settings:update | | | ✓ | ✓ |

## Error Handling

All error responses include standardized error information:

```typescript
// 4xx Client Errors
{
  error: "Forbidden",
  message: "You do not have access to this tenant"
}

// Validation Errors
{
  error: "Invalid request body",
  details: [
    {
      path: ["email"],
      message: "Expected string",
      code: "invalid_type"
    }
  ]
}

// Plan Limit Errors
{
  error: "Plan limit exceeded",
  reason: "Maximum 50 runs per month allowed on free plan",
  currentUsage: 50,
  limit: 50,
  plan: "free",
  upgradeUrl: "/billing/upgrade"
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (async operation) |
| 400 | Invalid request |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden (no permission) |
| 404 | Not found |
| 409 | Conflict (e.g., user already exists) |
| 429 | Too many requests / Plan limit exceeded |
| 500 | Server error |
| 503 | Service unavailable |

## Request/Response Examples

### Start a Run

```bash
curl -X POST https://api.gitwithintent.com/tenants/gh-org-12345/runs \
  -H "Authorization: Bearer token123" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/owner/repo",
    "runType": "TRIAGE",
    "prNumber": 42,
    "riskMode": "comment_only",
    "metadata": {
      "triggeredBy": "webhook"
    }
  }'
```

Response (202 Accepted):
```json
{
  "runId": "run-1234567890abcdef",
  "status": "pending",
  "message": "Run started successfully"
}
```

### List Tenant Members

```bash
curl https://api.gitwithintent.com/tenants/gh-org-12345/members \
  -H "Authorization: Bearer token123"
```

Response:
```json
{
  "members": [
    {
      "userId": "user-123",
      "displayName": "John Doe",
      "email": "john@example.com",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123",
      "role": "owner",
      "joinedAt": "2025-01-01T10:00:00Z"
    }
  ]
}
```

## Client SDK Generation

Generate SDKs for multiple languages using OpenAPI Generator:

### TypeScript/JavaScript
```bash
openapi-generator-cli generate \
  -i https://api.gitwithintent.com/openapi.json \
  -g typescript-fetch \
  -o ./generated/typescript-client
```

### Python
```bash
openapi-generator-cli generate \
  -i https://api.gitwithintent.com/openapi.json \
  -g python \
  -o ./generated/python-client
```

### Go
```bash
openapi-generator-cli generate \
  -i https://api.gitwithintent.com/openapi.json \
  -g go \
  -o ./generated/go-client
```

## Type Generation

TypeScript types can be generated from the OpenAPI spec:

```bash
# Using OpenAPI TypeScript
npx openapi-typescript https://api.gitwithintent.com/openapi.json \
  --output ./src/generated/api.ts
```

## Plan Limits

Different plans have different resource limits:

| Feature | Free | Team | Pro | Enterprise |
|---------|------|------|-----|------------|
| Runs/month | 50 | 500 | Unlimited | Unlimited |
| Repositories | 3 | 20 | Unlimited | Unlimited |
| Team members | 3 | 10 | Unlimited | Unlimited |

When a limit is exceeded, the API returns a 429 error with upgrade information.

## Testing with Postman/Insomnia

1. Import the OpenAPI spec:
   ```
   https://api.gitwithintent.com/openapi.json
   ```

2. Create an environment with variables:
   ```json
   {
     "base_url": "http://localhost:8080",
     "tenant_id": "gh-org-12345",
     "auth_token": "your-token-here"
   }
   ```

3. Use collection variables in requests:
   ```
   {{base_url}}/tenants/{{tenant_id}}/runs
   ```

## Schema Definitions

The specification includes comprehensive schema definitions for:

- **Users**: Profile, preferences, authentication
- **Tenants**: Workspace configuration, settings, plan info
- **Members**: Team members, invitations, roles
- **Repos**: Connected repositories, settings, statistics
- **Runs**: AI agent executions, steps, results
- **Workflows**: Multi-step orchestrations, approvals
- **Errors**: Standardized error responses and codes

## Versioning Strategy

The API follows semantic versioning:
- **MAJOR**: Breaking changes (new version required)
- **MINOR**: Backward-compatible additions
- **PATCH**: Bug fixes and improvements

Current version: **1.0.0**

## Best Practices

1. **Always check response status codes** - Different codes mean different things
2. **Handle 429 errors gracefully** - Implement exponential backoff
3. **Use request IDs** - The API returns `X-Request-ID` for debugging
4. **Cache sparingly** - Use ETags and Last-Modified headers when available
5. **Implement timeouts** - API operations can take up to 30s
6. **Monitor rate limits** - Check remaining quota in response headers
7. **Log errors** - Include request ID for support investigation

## Related Documentation

- [API Documentation](https://docs.gitwithintent.com)
- [SDK Guides](https://docs.gitwithintent.com/sdks)
- [Migration Guides](https://docs.gitwithintent.com/migration)
- [Security Guide](https://docs.gitwithintent.com/security)

## Support

For API issues and support:
- Email: api-support@gitwithintent.com
- Docs: https://docs.gitwithintent.com
- GitHub Issues: https://github.com/intent-solutions/git-with-intent/issues
