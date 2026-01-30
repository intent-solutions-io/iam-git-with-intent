# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-01-30

### Added

#### Epic A: Firebase Hosting
- Multi-target Firebase Hosting deployment (staging/production)
- Security headers with Content-Security-Policy
- Workload Identity Federation for CI/CD

#### Epic B: Cloud Run Reliability
- **B2**: Firestore run persistence with heartbeat durability
- **B3**: Recovery/resume on Cloud Run restart
- **B4**: Standardized Pub/Sub queue and DLQ semantics
- **B5**: Health check endpoints (`/health`, `/health/ready`, `/health/deep`)
  - ServiceHealthManager for Cloud Run services
  - Firestore, Pub/Sub, and cache health checks
  - Integration with system health monitoring

#### Documentation
- Epic C: Observability operations runbook
- Epic D: Security/IAM operations runbook
- Epic E: Release process checklist
- 6767 document filing system standard v4.2
- Secrets inventory and Secret Manager guide
- Run lifecycle state model specification

### Fixed
- Resolved lint errors blocking CI
- Removed unused ImmutableAuditLogStore type import

### Changed
- Improved health check DRY patterns in core package
- Enhanced webhook receiver error handling

## [0.5.1] - 2026-01-29

### Added
- Community health files (CONTRIBUTING, SECURITY, SUPPORT, GOVERNANCE, CODE_OF_CONDUCT)
- GitHub issue templates (bug, feature, question, security)
- Pull request template with checklist
- CODEOWNERS for critical paths
- Documentation: Discussions enablement guide, repo gaps audit

### Changed
- Expanded CONTRIBUTING.md with full development guidelines
- Organized loose docs into 000-docs/ with proper naming
- Updated CHANGELOG with historical v0.2.0 and v0.1.0 entries

## [0.5.0] - 2026-01-29

### Added
- Epic J complete: Local development review features
  - `gwi review --local` for staged change review
  - `gwi gate` pre-commit approval gate
  - `gwi hooks install` for git hook management
- ReviewerAgent integration for AI-powered local analysis

### Changed
- Updated CLAUDE.md with v0.5.0 commands and structure

### Fixed
- Time window policy test determinism

## [0.4.0] - 2026-01-23

### Added

#### Epic J: Local Development Review
- `gwi review --local` - Review staged/unstaged changes locally before PR
- `gwi triage --diff` - Score complexity of local commits
- `gwi explain --local` - AI-generated summary of what changed and why
- `gwi gate` - Pre-commit review gate with approval workflow
- `gwi hooks install/uninstall/status` - Manage git hooks for local review
- `gwi init --hooks` - Initialize repository with pre-commit hooks
- 27 E2E tests for local review commands

#### Epic D: Policy & Audit
- **D3: Immutable Audit Logs**
  - Cryptographic chaining for audit log integrity
  - Immutable audit log storage with retention policies
  - `gwi audit verify` - Verify audit log integrity
  - Audit log export service with multiple formats

- **D4: Compliance Reporting**
  - Compliance report templates (SOC2, HIPAA, GDPR)
  - Evidence collection service
  - Report generator with scheduling
  - Report signing and verification (Ed25519)
  - Report storage with versioning
  - Report distribution service

- **D5: Violation Detection**
  - Violation type schema and detector service
  - Alert channels for violation notifications
  - Remediation suggestions for violations
  - Violation dashboard pages in web UI

- **D6: Gateway API**
  - REST API endpoints for audit logs and policies

### Fixed
- Resolved test failures after PR merges
- Resolved build errors from PR merge conflicts
- Fixed memory leak in D5.4 remediation suggestions
- Fixed type safety issues in D5.5 violation dashboard
- Fixed unused variable warning in audit.ts

### Changed
- Updated SDK gateway types for new API endpoints

## [0.3.0] - 2025-12-15

### Added
- Initial multi-agent architecture (Triage, Coder, Resolver, Reviewer)
- PR automation commands: `gwi triage`, `gwi plan`, `gwi resolve`, `gwi review`
- Autopilot mode for full PR pipeline
- Issue-to-code transformation
- Dual storage backend (Firestore production, SQLite local)
- Run artifact bundles with audit trails
- Approval gating with SHA256 hash binding

## [0.2.0] - 2025-12-01

### Added
- Phase 7: Firestore runtime stores and engine wiring
- Phase 6: Live AgentFS and Beads wiring
- Phase 5: gwi-api and A2A gateway skeleton
- Phase 4: Claude Internal Hook Protocol
- Phase 3: AgentFS + Beads integration hooks
- Staging Cloud Run deployment infrastructure
- GitHub App + webhook integration

## [0.1.0] - 2025-11-01

### Added
- Initial MVP: AI-powered git automation
- Multi-agent architecture foundation
- Basic CLI commands
- Project template and monorepo structure

[0.6.0]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/intent-solutions-io/iam-git-with-intent/releases/tag/v0.1.0
