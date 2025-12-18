# ADR-014: Developer Experience, Extensibility, and Documentation

**Status:** In Progress
**Date:** 2025-12-16
**Phase:** 14
**Author:** Claude (AI Assistant) with Jeremy

## Context

Phase 13 delivered full multi-agent workflow execution. Phase 14 focuses on making Git With Intent accessible and extensible for developers:

1. **CLI DX**: Improved command-line experience with new workflow management
2. **Plugin System**: Allow third-party extensions
3. **API Documentation**: OpenAPI specification
4. **SDK**: TypeScript client library

The platform needs these improvements before GA launch to ensure developers can integrate effectively.

## Decision

### 1. CLI Developer Experience Improvements

Added new CLI commands and improved existing ones:

**New Commands:**
| Command | Description |
|---------|-------------|
| `gwi init` | Initialize GWI in a repository |
| `gwi workflow start <type>` | Start a multi-agent workflow |
| `gwi workflow list` | List recent workflows |
| `gwi workflow status <id>` | Get workflow status |
| `gwi workflow approve <id>` | Approve a waiting workflow |
| `gwi workflow reject <id>` | Reject a waiting workflow |
| `gwi config show` | Show configuration |
| `gwi config set <key> <value>` | Set a config value |
| `gwi config get <key>` | Get a config value |
| `gwi config list` | List all config keys |
| `gwi config reset` | Reset to defaults |

**Legacy Commands Migrated:**
- `autopilot` → Redirects to `workflow start pr-resolve`
- `plan` → Redirects to `triage` + `workflow`
- `resolve` → Redirects to `workflow start pr-resolve`
- `review` → Redirects to `workflow approve/reject`

### 2. Plugin/Extension Architecture

Created a comprehensive plugin system in `@gwi/core/plugins`:

**Plugin Capabilities:**
- Define custom workflow types
- Register custom agents
- Provide storage backends
- Add CLI commands
- Hook into workflow events

**Plugin Lifecycle:**
```typescript
interface Plugin {
  metadata: PluginMetadata;     // name, version, dependencies
  hooks?: PluginHooks;          // lifecycle callbacks
  contributions?: {
    workflows?: WorkflowContribution[];
    agents?: AgentContribution[];
    storage?: StorageContribution[];
    commands?: CommandContribution[];
    events?: EventContribution[];
  };
}
```

**Plugin Registry:**
- Global registry for plugin management
- Automatic dependency resolution
- Conflict detection for contributions
- Event emission system

### 3. API Documentation (OpenAPI)

Created OpenAPI 3.0 specification covering:
- All REST endpoints
- Request/response schemas
- Authentication requirements
- Error responses
- Example values

The spec can be served at `/api/docs` and used to generate client SDKs.

### 4. TypeScript SDK

Created `@gwi/sdk` package providing:
- `GWIClient` class for API interaction
- Full TypeScript support
- Browser and Node.js compatibility
- Automatic error handling
- Typed responses

## Consequences

### Positive

1. **Better Developer Onboarding**: CLI `init` and `config` commands make setup easier
2. **Workflow Management**: CLI access to all workflow operations
3. **Extensibility**: Plugin system allows third-party integrations
4. **Documentation**: OpenAPI spec enables automated tooling
5. **Client Library**: SDK reduces integration effort

### Negative

1. **Legacy Command Stubs**: Old commands now just redirect (technical debt)
2. **Plugin Overhead**: Plugin system adds initialization cost
3. **SDK Maintenance**: Another package to maintain and version

### Neutral

1. **Migration Path**: Old commands still work but recommend new ones
2. **Plugin Discovery**: No official plugin registry yet
3. **SDK Scope**: SDK covers REST API, not agent operations

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `apps/cli/src/commands/workflow.ts` | Workflow management commands |
| `apps/cli/src/commands/config.ts` | Configuration commands |
| `apps/cli/src/commands/init.ts` | Project initialization |
| `packages/core/src/plugins/index.ts` | Plugin system |
| `packages/core/src/openapi/spec.ts` | OpenAPI specification |
| `packages/sdk/src/client.ts` | SDK client |
| `packages/sdk/src/index.ts` | SDK exports |

### Files Modified

| File | Changes |
|------|---------|
| `apps/cli/src/index.ts` | Added new commands |
| `apps/cli/src/commands/autopilot.ts` | Migration stub |
| `apps/cli/src/commands/plan.ts` | Migration stub |
| `apps/cli/src/commands/resolve.ts` | Migration stub |
| `apps/cli/src/commands/review.ts` | Migration stub |
| `apps/cli/src/commands/status.ts` | Fixed type compatibility |
| `apps/cli/src/commands/triage.ts` | Fixed type compatibility |
| `packages/core/src/index.ts` | Added plugin exports |

## Technical Debt Addressed

1. **CLI Type Mismatches**: Fixed incompatibilities between CLI commands and storage interfaces
2. **Storage Module Path**: Fixed import paths from `@gwi/core/storage` to `@gwi/core`

## Technical Debt Created

1. **Legacy CLI Commands**: autopilot, plan, resolve, review need full refactor to use new storage interfaces
2. **Plugin Testing**: No automated tests for plugin system yet
3. **SDK Testing**: No automated tests for SDK yet

## Verification

1. Core builds: `npm run build -w @gwi/core` passes
2. CLI builds: `npm run build -w @gwi/cli` passes
3. All packages build successfully

## Recommendations for Phase 15

1. **Pricing/Billing**: Implement plan limits and usage tracking
2. **GA Controls**: Feature flags for beta vs GA features
3. **Plugin Registry**: Consider hosting official plugins
4. **SDK Publishing**: Publish @gwi/sdk to npm

## References

- [ADR-013: Full Multi-Agent Workflows](./phase-13-adr.md)
- [OpenAPI Specification](https://spec.openapis.org/oas/v3.0.3)
- [Commander.js CLI Framework](https://github.com/tj/commander.js)
