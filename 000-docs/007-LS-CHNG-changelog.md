# Changelog

All notable changes to git-with-intent.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** This project is in active development. Version numbers reflect development milestones, not production releases.

---

## [Unreleased]

### In Progress
- Web dashboard improvements
- TimeGPT forecasting integration

---

## [0.3.0] - 2025-12-27

Epic E (RBAC & Governance) complete. Enterprise CI/CD pipeline operational. High-performance testing infrastructure in place.

### Added

#### Epic E: RBAC & Governance (~8,600 lines)
- **Tenant Lifecycle** - State machine (active/suspended/paused/deactivated), plan management, soft/hard delete
- **Quota Enforcement** - Express middleware, 3 enforcement modes (hard/soft/warn), burst allowances
- **Secrets Management** - AES-256-GCM encryption, unique IVs per secret, constant-time comparison
- **Governance & Audit** - 5 compliance report types, anomaly detection, CSV/JSON export

#### CI/CD Pipeline (4 workflows)
- **test.yml** - 4-shard parallel test execution, coverage collection, PR comments
- **ci-enhanced.yml** - Security scanning, quality gates, ARV integration
- **deploy.yml** - Auto-deploy to staging/production via OpenTofu
- **release.yml** - Semantic versioning, changelog generation, GitHub releases

#### Testing Infrastructure
- **Vitest configuration** - Multi-threaded execution (all CPU cores), V8 coverage
- **Test sharding** - 4x speedup (180s → 45s)
- **Marketplace E2E tests** - 33 tests for connector installation flows
- **SDK integration tests** - 45 tests for SCIM, Registry, Workflows APIs

### Fixed
- Module exports for governance and tenants packages
- RBACRequest type now extends Express Request (includes params/query/body)
- TypeScript strict mode violations in Epic E code
- CI false positives (.env detection, credential file checks)

### Documentation
- `docs/CICD.md` - Complete CI/CD workflow documentation
- `docs/TESTING.md` - Testing infrastructure guide

---

## [0.2.0] - 2025-12-18

Major expansion of core infrastructure. Added 68 modules covering storage, security, billing, reliability, and more.

### Added

#### Core Infrastructure
- **Storage** - Firestore backend with fallback to in-memory for development
- **Security** - RBAC, audit logging, secrets management, API key management
- **Billing** - Usage metering, quotas, cost management
- **Reliability** - Rate limiting (Redis + Firestore stores), circuit breakers, retry with backoff
- **Observability** - Telemetry, structured logging, metrics collection

#### Production Modules
- **Marketplace** - Plugin registry with publish/install flows
- **Forecasting** - Time series analysis and prediction
- **Alerts** - Configurable alerting system
- **Data Governance** - Data classification and retention policies
- **System Health** - Health checks, dependency monitoring, incident management
- **GA Readiness** - Production readiness gates and checklists

#### CLI Commands
- `gwi triage` - PR complexity scoring
- `gwi plan` - Resolution planning
- `gwi resolve` - AI-powered conflict resolution
- `gwi review` - Review summary generation
- `gwi issue-to-code` - Generate code from GitHub issues
- `gwi autopilot` - Full automated pipeline
- `gwi run list/status/approve` - Run management

#### Testing
- 1700+ tests across all packages
- ARV (Agent Readiness Verification) pre-commit checks
- Contract tests for all Zod schemas

### Architecture
- Monorepo with npm workspaces + Turborepo
- TypeScript strict mode
- Multi-agent routing (Gemini Flash for simple, Claude for complex)
- Approval gating with SHA256 hash binding

---

## [0.1.0] - 2025-12-15

Initial project structure.

### Added
- Project scaffolding from template
- Core packages: `@gwi/core`, `@gwi/agents`, `@gwi/integrations`
- Storage interfaces
- Multi-agent architecture design
- Basic CLI structure

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 0.3.0 | 2025-12-27 | Epic E (RBAC), CI/CD pipeline, testing infrastructure |
| 0.2.0 | 2025-12-18 | 68 core modules, 1700+ tests, production infrastructure |
| 0.1.0 | 2025-12-15 | Initial structure |

---

*This changelog reflects actual implemented features, not planned work.*
