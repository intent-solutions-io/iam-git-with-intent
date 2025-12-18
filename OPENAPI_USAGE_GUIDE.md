# Git With Intent OpenAPI Usage Guide

Complete guide for using the OpenAPI 3.0 specification for the Git With Intent API.

## Overview

The OpenAPI specification is located at:
- **Source**: `/packages/core/src/openapi/spec.ts`
- **Compiled**: `/packages/core/dist/openapi/`
- **Exports**: Available as `@gwi/core/openapi`

## Quick Import

```typescript
import { openAPISpec } from '@gwi/core/openapi';

// Use the spec
console.log(openAPISpec.info.version);
console.log(openAPISpec.paths);
```

## Integration with Express API

### Serving the OpenAPI Spec

Add to your API server (`apps/api/src/index.ts`):

```typescript
import { openAPISpec } from '@gwi/core/openapi';

// Serve OpenAPI spec as JSON
app.get('/openapi.json', (_req, res) => {
  res.json(openAPISpec);
});

// Alternative: Use a more semantic endpoint
app.get('/api/spec', (_req, res) => {
  res.json(openAPISpec);
});
```

### Swagger UI Integration

```typescript
import swaggerUi from 'swagger-ui-express';
import { openAPISpec } from '@gwi/core/openapi';

// Mount Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openAPISpec));
```

Once deployed:
- Visit `http://localhost:8080/api-docs` to see interactive documentation
- Download spec from `http://localhost:8080/openapi.json`

### ReDoc Integration

```typescript
import redoc from 'redoc-express';
import { openAPISpec } from '@gwi/core/openapi';

// Alternative: Use ReDoc for different UI style
app.use('/api-docs-redoc', redoc.render(openAPISpec));
```

## Client SDK Generation

The OpenAPI spec can be used to automatically generate client libraries.

### Using OpenAPI Generator CLI

#### TypeScript/JavaScript
```bash
# Install generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript Fetch Client
openapi-generator-cli generate \
  -i packages/core/dist/openapi/spec.json \
  -g typescript-fetch \
  -o generated/typescript-client \
  -c <config-file>
```

Configuration file example (`openapi-config.json`):
```json
{
  "packageName": "@gwi/api-client",
  "packageVersion": "1.0.0",
  "supportsES6": true,
  "withoutRuntimeChecks": false
}
```

#### Python
```bash
openapi-generator-cli generate \
  -i packages/core/dist/openapi/spec.json \
  -g python \
  -o generated/python-client
```

#### Go
```bash
openapi-generator-cli generate \
  -i packages/core/dist/openapi/spec.json \
  -g go \
  -o generated/go-client
```

### Direct SDK Implementation

In `packages/sdk/`, manually implement a client:

```typescript
// packages/sdk/src/client.ts
import { openAPISpec } from '@gwi/core/openapi';

export class GitWithIntentClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async listTenants() {
    const response = await fetch(`${this.baseUrl}/tenants`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    return response.json();
  }

  async startRun(tenantId: string, payload: any) {
    const response = await fetch(
      `${this.baseUrl}/tenants/${tenantId}/runs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    return response.json();
  }
}
```

## API Testing

### Postman Collection

1. Import the OpenAPI spec into Postman:
   - Postman → Import → Link → Enter URL or paste JSON
   - Upload file: `/packages/core/dist/openapi/spec.json`

2. Create an environment:
```json
{
  "base_url": "http://localhost:8080",
  "token": "your-token-here",
  "tenant_id": "gh-org-12345",
  "run_id": ""
}
```

3. Use variables in requests:
   - URL: `{{base_url}}/tenants/{{tenant_id}}/runs`
   - Header: `Authorization: Bearer {{token}}`

### curl Examples

#### List Tenants
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.gitwithintent.com/tenants
```

#### Create Tenant
```bash
curl -X POST https://api.gitwithintent.com/tenants \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "My Org",
    "githubOrgLogin": "my-org"
  }'
```

#### Start a Run
```bash
curl -X POST https://api.gitwithintent.com/tenants/gh-org-12345/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/owner/repo",
    "runType": "TRIAGE",
    "prNumber": 42,
    "riskMode": "comment_only"
  }'
```

#### Get Run Status
```bash
curl https://api.gitwithintent.com/tenants/gh-org-12345/runs/run-123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Type Generation from OpenAPI

### Using openapi-typescript

```bash
npm install -D openapi-typescript

npx openapi-typescript \
  packages/core/dist/openapi/spec.json \
  -o packages/sdk/src/types/api.ts
```

This generates TypeScript types matching all API operations.

### Manual Type Usage

```typescript
// TypeScript types are already defined in @gwi/core/storage
import type {
  User,
  Tenant,
  Membership,
  TenantRepo,
  Run,
} from '@gwi/core';
```

## API Documentation

### Markdown Generation

Use the spec to generate markdown documentation:

```bash
npm install -D widdershins

widdershins packages/core/dist/openapi/spec.json \
  -o API_DOCS.md
```

### Hosting Documentation

#### Option 1: Static hosting with Swagger UI
```bash
npm install -g http-server

cd packages/core/dist/openapi
http-server
# Visit http://localhost:8080 to see hosted spec
```

#### Option 2: ReDoc static
```bash
docker pull redocly/redoc

docker run -p 8080:8080 \
  -e SPEC_URL=file:///spec.json \
  -v $(pwd)/packages/core/dist/openapi:/specs \
  redocly/redoc
```

## Validation

### Request Validation

The API validates all requests against the OpenAPI schema:

```typescript
import { z } from 'zod';

// Schema definitions from openapi spec
const CreateTenantSchema = z.object({
  displayName: z.string().min(1).max(100),
  githubOrgLogin: z.string().min(1).max(39).optional(),
  githubOrgId: z.number().optional(),
});
```

### Response Validation

Validate responses match schema:

```typescript
const tenantSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  plan: z.enum(['free', 'team', 'pro', 'enterprise']),
  // ... other fields
});

const response = await fetch('/tenants/123').then(r => r.json());
const validated = tenantSchema.parse(response);
```

## Development Workflow

### Making API Changes

1. **Update the OpenAPI Spec**
   - Edit `packages/core/src/openapi/spec.ts`
   - Add new endpoint to `/paths`
   - Add new schema to `/components/schemas`
   - Update examples

2. **Rebuild**
   ```bash
   npm run build
   ```

3. **Update Implementation**
   - Modify `apps/api/src/index.ts` to match spec
   - Ensure request/response bodies match schema

4. **Update Tests**
   - Generate new test cases from examples
   - Validate against OpenAPI spec

5. **Generate Clients**
   ```bash
   npm run generate:clients
   ```

6. **Update Documentation**
   - Markdown docs auto-generated from spec
   - Update README with breaking changes

### Example: Adding New Endpoint

```typescript
// 1. Add to spec.ts paths
'/tenants/{tenantId}/archives': {
  post: {
    operationId: 'archiveTenant',
    tags: ['Tenants'],
    summary: 'Archive a tenant',
    // ...
  }
}

// 2. Add to components/schemas
ArchiveTenantRequest: {
  type: 'object',
  properties: {
    reason: { type: 'string' },
    retentionDays: { type: 'integer' }
  }
}

// 3. Implement in API
app.post('/tenants/:tenantId/archive',
  authMiddleware,
  tenantAuthMiddleware,
  requirePermission('tenant:delete'),
  async (req, res) => {
    // Implementation
  }
);

// 4. Update tests
describe('POST /tenants/:tenantId/archive', () => {
  // Test cases
});
```

## Versioning

### Handling Breaking Changes

When making breaking changes:

1. Create new endpoint version
2. Deprecate old endpoint
3. Support both versions temporarily
4. Document migration path

Example:
```typescript
// New version
app.post('/v2/tenants/:tenantId/runs', ...);

// Old version (deprecated)
app.post('/v1/tenants/:tenantId/runs', ...);
app.post('/tenants/:tenantId/runs', ...); // Points to v1
```

## Best Practices

### 1. Keep Spec in Sync

- Update spec first
- Implement API second
- Test implementation matches spec
- Validate through automated tests

### 2. Clear Examples

All endpoints should have realistic examples:

```typescript
example: {
  email: 'user@example.com',
  displayName: 'John Doe',
  githubLogin: 'johndoe',
}
```

### 3. Error Documentation

Document all error cases:

```typescript
responses: {
  '200': { /* Success */ },
  '400': { /* Validation error */ },
  '401': { /* Unauthorized */ },
  '403': { /* Forbidden */ },
  '404': { /* Not found */ },
  '429': { /* Rate limit */ },
}
```

### 4. Security Headers

Clearly document security requirements:

```typescript
security: [
  { bearerAuth: [] }
]
```

### 5. Status Codes

Use semantically correct status codes:
- `200` - Success
- `201` - Created
- `202` - Accepted (async)
- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `429` - Rate limited
- `500` - Server error

## Monitoring

### Request Metrics

Track API usage via the spec:
- Which endpoints are most used
- How long requests take
- Error rates by status code

The `/metrics` endpoint provides:
```json
{
  "requests": {
    "total": 15234,
    "byPath": {
      "/tenants": 4521,
      "/tenants/:tenantId/runs": 8923
    },
    "byStatus": {
      "200": 14200,
      "401": 512,
      "429": 265
    }
  },
  "errors": {
    "total": 777,
    "rate": "5.1%"
  }
}
```

## Support Resources

- **Documentation**: `/packages/core/src/openapi/README.md`
- **Spec File**: `/packages/core/src/openapi/spec.ts`
- **API Code**: `/apps/api/src/index.ts`
- **Examples**: See curl commands in README.md

## Related Files

| File | Purpose |
|------|---------|
| `/packages/core/src/openapi/spec.ts` | OpenAPI specification |
| `/packages/core/src/openapi/index.ts` | Module exports |
| `/packages/core/src/openapi/README.md` | OpenAPI documentation |
| `/apps/api/src/index.ts` | API implementation |
| `/packages/core/src/types.ts` | Core type definitions |
| `/packages/core/src/storage/interfaces.ts` | Storage types |
| `/packages/core/src/security/index.ts` | RBAC types |

---

For questions or issues with the OpenAPI spec, see the README.md in the openapi directory.
