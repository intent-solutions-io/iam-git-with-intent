# SDK Type Codegen - Quick Start

## TL;DR

The SDK automatically generates TypeScript types from the OpenAPI specification. Types are always in sync with the Gateway API.

## Common Commands

```bash
# Generate types (usually automatic via prebuild)
npm run generate:sdk-types

# Validate types are in sync
npm run validate:sdk-types

# Build SDK (auto-generates types first)
cd packages/sdk && npm run build
```

## When You Should Care

### 1. You Changed the OpenAPI Spec

After editing `apps/gateway/openapi.yaml`:

```bash
npm run generate:sdk-types
npm run validate:sdk-types
git add packages/sdk/src/generated/
```

### 2. CI Fails with "Types Out of Date"

```bash
npm run generate:sdk-types
git add packages/sdk/src/generated/
git commit -m "chore(sdk): regenerate types"
```

### 3. You Want to Use Gateway API Types

```typescript
import type {
  // Auto-generated types
  paths,
  components,
  operations,

  // Helper utilities
  RequestBody,
  SuccessResponse,
  PathParams,
  QueryParams,

  // Convenience aliases
  SearchConnectorsParams,
  SearchConnectorsResponse,
  PublishConnectorRequest,
  ScimUser,
} from '@gwi/sdk';

// Example: Type-safe search
async function search(params: SearchConnectorsParams): Promise<SearchConnectorsResponse> {
  // Full autocomplete and type checking!
  return await fetch('/v1/search?' + new URLSearchParams(params));
}
```

## File Locations

| What | Where |
|------|-------|
| OpenAPI Spec | `apps/gateway/openapi.yaml` |
| Generated Types | `packages/sdk/src/generated/gateway-types.ts` |
| Generation Script | `scripts/generate-sdk-types.ts` |
| Validation Script | `scripts/validate-sdk-types.ts` |
| Documentation | `packages/sdk/README-CODEGEN.md` |
| Examples | `packages/sdk/examples/gateway-api-usage.ts` |

## How It Works

```
OpenAPI Spec (apps/gateway/openapi.yaml)
    │
    ├─> npm run generate:sdk-types
    │       │
    │       └─> packages/sdk/src/generated/gateway-types.ts (53KB)
    │
    └─> npm run build (in packages/sdk)
            │
            ├─> prebuild hook runs generate:types
            └─> TypeScript compilation uses fresh types
```

## ARV Integration

Type validation runs automatically in the ARV pipeline:

```bash
npm run arv  # Includes SDK type validation
```

CI will fail if:
- Generated types are missing
- Types are out of date with OpenAPI spec
- Generated file structure is invalid

## Type Helpers

### Extract Request Body
```typescript
type MyRequest = RequestBody<'publishFull'>;
```

### Extract Response
```typescript
type MyResponse = SuccessResponse<'searchConnectors'>;
```

### Extract Parameters
```typescript
type MyPathParams = PathParams<'getConnector'>;
type MyQueryParams = QueryParams<'searchConnectors'>;
```

### Use Component Schemas
```typescript
type User = components['schemas']['ScimUser'];
type Manifest = components['schemas']['ConnectorManifest'];
```

## Troubleshooting

### "Types are out of date"
```bash
npm run generate:sdk-types
```

### "Generated types missing"
```bash
npm run generate:sdk-types
```

### Type errors after OpenAPI change
```bash
npm run generate:sdk-types
npm run build
```

## Best Practices

1. ✅ Always regenerate after editing OpenAPI spec
2. ✅ Commit generated files to version control
3. ✅ Use type helpers instead of raw operations types
4. ✅ Let prebuild hook generate types automatically
5. ❌ Never manually edit generated files

## Need More Info?

See comprehensive docs: `packages/sdk/README-CODEGEN.md`

## Quick Reference

```typescript
import type {
  // All Gateway API endpoints
  paths,

  // All reusable schemas
  components,

  // All operations by operationId
  operations,

  // Extract types from operations
  RequestBody<T>,
  SuccessResponse<T>,
  ErrorResponse<T>,
  PathParams<T>,
  QueryParams<T>,

  // Common operation types (pre-defined)
  SearchConnectorsParams,
  SearchConnectorsResponse,
  GetConnectorResponse,
  PublishConnectorRequest,
  ScimUser,
  ScimGroup,
} from '@gwi/sdk';
```
