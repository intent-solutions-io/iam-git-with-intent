# Changelog

All notable changes to git-with-intent will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-15

### Added

#### Phase 7: Firestore Runtime Stores
- `FirestoreTenantStore` - Production-ready tenant storage with Firestore
- `FirestoreRunStore` - Persistent run tracking with Firestore
- `firestore-client.ts` - Firebase Admin SDK client singleton
- Environment-based store selection (`GWI_STORE_BACKEND=firestore|memory`)
- Engine uses TenantStore for persistent runs with graceful fallback

#### Phase 6: Live AgentFS and Beads Wiring
- AgentFS initialized with local SQLite database (`.agentfs/gwi.db`)
- Beads task tracking integrated with hook system
- `npm run test:hooks:smoke` - Smoke test for hook verification
- `npm run agentfs:init` - AgentFS initialization script

#### Phase 5: gwi-api and A2A Gateway
- Express-based API server (`apps/api/`)
- Multi-tenant endpoints: `/tenants`, `/tenants/:id/repos`, `/tenants/:id/runs`
- A2A gateway skeleton for Vertex AI Agent Engine integration
- Zod-based request validation

#### Phase 4: Claude Internal Hook Protocol
- Post-message audit protocol for Claude sessions
- `npm run claude:after-message` - Audit script for hook logging
- Mental checklist for determining when to run audits

#### Phase 3: AgentFS + Beads Integration Hooks
- `AgentHookRunner` - Manages hook lifecycle with parallel/sequential execution
- `AgentFSHook` - Audit tool calls to AgentFS
- `BeadsHook` - Create/update Beads issues for task tracking
- `packages/engine/` - New package for agent execution engine
- Hook configuration via environment variables

### Infrastructure
- Monorepo structure with npm workspaces + Turbo
- TypeScript strict mode throughout
- Comprehensive ADR documentation (000-docs/)
- docs-filing v4 + 6767 naming standard

### Documentation
- ADR 014: Agent Hook System Policy
- ADR 016: Claude Internal Hook Protocol
- ADR 018: gwi-api and Gateway Skeleton
- ADR 020: Live AgentFS and Beads Config
- ADR 022: Firestore Runtime Stores
- After-Action Reports for Phases 3-7

## [0.1.0] - 2025-12-15

### Added
- Initial project structure from project-template
- Core packages: `@gwi/core`, `@gwi/agents`, `@gwi/integrations`
- Storage interfaces with SQLite implementation
- Multi-agent architecture design (Triage, Planner, Coder, Validator, Reviewer)
- CLAUDE.md with session protocol and conventions

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
