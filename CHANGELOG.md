# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.4.0]: https://github.com/intent-solutions-io/iam-git-with-intent/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/intent-solutions-io/iam-git-with-intent/releases/tag/v0.3.0
