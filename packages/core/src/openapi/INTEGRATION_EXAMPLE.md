# OpenAPI Integration Example

## Quick Start: Integrate OpenAPI into Express API

This example shows how to add OpenAPI documentation to the existing Git With Intent API.

## Basic Setup

### 1. Install Dependencies (if not already installed)

```bash
npm install swagger-ui-express
npm install -D @types/swagger-ui-express
```

### 2. Add to API Server

Add these imports to `apps/api/src/index.ts`:

```typescript
import swaggerUi from 'swagger-ui-express';
import { openAPISpec } from '@gwi/core/openapi';
```

### 3. Add Endpoints

Add these routes to your Express app:

```typescript
// Serve OpenAPI spec as JSON (for tools, SDKs, etc.)
app.get('/openapi.json', (_req, res) => {
  res.json(openAPISpec);
});

// Serve Swagger UI documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openAPISpec, {
  swaggerOptions: {
    urls: [
      {
        url: '/openapi.json',
        name: 'Git With Intent API',
      },
    ],
  },
}));
```

### 4. Verify

After deploying, visit:
- **Swagger UI**: http://localhost:8080/api-docs
- **OpenAPI Spec**: http://localhost:8080/openapi.json

## Full Example

Here's a complete snippet to add to `apps/api/src/index.ts`:

```typescript
/**
 * OpenAPI Documentation
 */
import swaggerUi from 'swagger-ui-express';
import { openAPISpec } from '@gwi/core/openapi';

// Serve OpenAPI specification as JSON
app.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openAPISpec);
});

// Serve interactive Swagger UI documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(openAPISpec, {
    explorer: true,
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestHeaders: true,
      presets: [
        swaggerUi.presets.apis,
        swaggerUi.SwaggerUIBundle.presets.apis,
      ],
    },
  })
);

// Log OpenAPI endpoint
console.log('OpenAPI documentation available at:');
console.log(`  Swagger UI: http://localhost:${PORT}/api-docs`);
console.log(`  Spec JSON:  http://localhost:${PORT}/openapi.json`);
```

## Advanced: ReDoc Alternative

For a different documentation style, use ReDoc:

```bash
npm install redoc-express
```

```typescript
import redoc from 'redoc-express';
import { openAPISpec } from '@gwi/core/openapi';

app.use(
  '/api-docs-redoc',
  redoc.render(openAPISpec)
);
```

## Testing with curl

Once running, test the endpoints:

```bash
# Get the OpenAPI spec
curl http://localhost:8080/openapi.json | jq '.info'

# Extract all endpoint paths
curl http://localhost:8080/openapi.json | jq '.paths | keys'

# Extract specific endpoint info
curl http://localhost:8080/openapi.json | jq '.paths["/health"]'
```

## Integration with Client SDKs

Once the OpenAPI endpoint is live, generate client libraries:

### TypeScript SDK

```bash
npm install -g @openapitools/openapi-generator-cli

openapi-generator-cli generate \
  -i http://localhost:8080/openapi.json \
  -g typescript-fetch \
  -o generated/typescript-client \
  -c <<EOF
{
  "packageName": "@gwi/api-client",
  "packageVersion": "1.0.0"
}
EOF
```

### Python SDK

```bash
openapi-generator-cli generate \
  -i http://localhost:8080/openapi.json \
  -g python \
  -o generated/python-client
```

## Using with Docker

If running in Docker, expose the documentation:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install && npm run build

EXPOSE 8080

CMD ["npm", "start"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

Then access:
```bash
docker run -p 8080:8080 gwi-api
# Visit http://localhost:8080/api-docs
```

## Postman Integration

### Import into Postman

1. Open Postman
2. Click "Import"
3. Select "Link" tab
4. Paste: `http://localhost:8080/openapi.json`
5. Click "Continue"
6. Click "Import"

Postman will automatically create:
- All 29 endpoints
- Request/response examples
- Authentication setup
- Variable placeholders

### Create Collection Variables

In Postman, create an environment with:

```json
{
  "base_url": "http://localhost:8080",
  "tenant_id": "gh-org-12345",
  "run_id": "run-abcdef123456",
  "auth_token": "your-firebase-token"
}
```

### Use in Requests

Replace hardcoded values with variables:

```
GET {{base_url}}/tenants/{{tenant_id}}/runs/{{run_id}}
Authorization: Bearer {{auth_token}}
```

## Programmatic Access

Access the spec in your code:

```typescript
import { openAPISpec } from '@gwi/core/openapi';

// Get all paths
const paths = Object.keys(openAPISpec.paths);
console.log('Available endpoints:', paths);

// Get specific endpoint
const runEndpoint = openAPISpec.paths['/tenants/{tenantId}/runs'];
console.log('Run endpoints:', Object.keys(runEndpoint));

// Get schema
const userSchema = openAPISpec.components.schemas.User;
console.log('User fields:', Object.keys(userSchema.properties));

// List all operations
Object.entries(openAPISpec.paths).forEach(([path, methods]) => {
  Object.entries(methods).forEach(([method, operation]: any) => {
    if (method !== 'parameters') {
      console.log(`${method.toUpperCase()} ${path}`);
    }
  });
});
```

## Auto-Documentation from Endpoints

You can generate markdown docs:

```bash
npm install -D widdershins

npx widdershins packages/core/dist/openapi/spec.json -o API.md
```

This creates a comprehensive markdown guide of all endpoints.

## Validation with OpenAPI Standards

Validate that your implementation matches the spec:

```typescript
import { validate } from 'openapi-validator-middleware';
import { openAPISpec } from '@gwi/core/openapi';

// Add validation middleware
app.use(validate(openAPISpec));
```

This automatically:
- Validates request bodies against schemas
- Validates request parameters
- Validates response bodies
- Returns 400 on validation errors

## Monitoring the API

Track API usage based on the spec:

```typescript
const metrics = {
  byEndpoint: new Map<string, number>(),
  byStatus: new Map<number, number>(),
};

// Update metrics middleware
app.use((req, res, next) => {
  const originalJson = res.json;

  res.json = function(data) {
    const path = req.route?.path || req.path;
    metrics.byEndpoint.set(path, (metrics.byEndpoint.get(path) || 0) + 1);
    metrics.byStatus.set(res.statusCode, (metrics.byStatus.get(res.statusCode) || 0) + 1);

    return originalJson.call(this, data);
  };

  next();
});

// Serve metrics
app.get('/metrics/endpoints', (_req, res) => {
  const byEndpoint: Record<string, number> = {};
  metrics.byEndpoint.forEach((count, endpoint) => {
    byEndpoint[endpoint] = count;
  });

  res.json({
    endpoints: byEndpoint,
    totalRequests: Array.from(metrics.byEndpoint.values()).reduce((a, b) => a + b, 0),
  });
});
```

## Best Practices

1. **Keep Spec Updated**
   - Update spec.ts before implementing
   - Keep implementation in sync
   - Test all examples work

2. **Document Breaking Changes**
   - Mark deprecated endpoints
   - Provide migration guide
   - Support old version temporarily

3. **Use Standard Status Codes**
   - 200: Success
   - 201: Created
   - 202: Accepted (async)
   - 400: Validation error
   - 401: Unauthorized
   - 403: Forbidden
   - 404: Not found
   - 429: Rate limited
   - 500: Server error

4. **Comprehensive Examples**
   - Real values in examples
   - Show success and error cases
   - Include complex scenarios

5. **Security First**
   - Document all auth methods
   - List required permissions
   - Show secure curl examples

6. **Test the Spec**
   - Generate and run SDKs
   - Use examples in tests
   - Validate in CI/CD

## Troubleshooting

### Swagger UI not loading

Check that:
1. Dependencies installed: `npm install swagger-ui-express`
2. Import correct: `import swaggerUi from 'swagger-ui-express'`
3. Endpoint mounted: `app.use('/api-docs', swaggerUi.serve, ...)`
4. Spec valid JSON: Test with `curl http://localhost:8080/openapi.json | jq`

### Spec not found error

Ensure:
1. openAPISpec exported from `@gwi/core/openapi`
2. Module compiled: `npm run build`
3. Import uses correct path: `from '@gwi/core/openapi'`

### Generation tools failing

Try:
1. Validate spec: `npm install -g openapi-validator` then `openapi-validator openapi.json`
2. Check spec matches OpenAPI 3.0.3
3. Ensure all required fields present
4. Validate against OpenAPI schema

## Next Steps

1. Add endpoints to your API
2. Start the server: `npm run dev`
3. Visit http://localhost:8080/api-docs
4. Test endpoints in Swagger UI
5. Generate SDKs for clients
6. Share documentation URL with team

---

For more details, see:
- `/packages/core/src/openapi/README.md` - OpenAPI documentation
- `/OPENAPI_USAGE_GUIDE.md` - Detailed integration guide
- `/apps/api/src/index.ts` - API implementation
