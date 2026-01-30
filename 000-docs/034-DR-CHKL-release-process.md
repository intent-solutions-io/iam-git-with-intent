# Release Process Checklist

**Epic E: Repo Governance + Release Hygiene**
**Version:** 1.0.0
**Last Updated:** 2026-01-30

## Overview

This document defines the standard release process for Git With Intent. Follow this checklist for every release to ensure quality, security, and documentation consistency.

## Release Types

| Type | Version Bump | Triggers | Example |
|------|--------------|----------|---------|
| Major | X.0.0 | Breaking changes | 1.0.0 |
| Minor | 0.X.0 | New features | 0.6.0 |
| Patch | 0.0.X | Bug fixes only | 0.5.2 |
| Pre-release | 0.X.0-beta.N | Early access | 0.6.0-beta.1 |

## Pre-Release Checklist

### Code Quality

- [ ] All tests passing locally (`npm run test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] ARV checks pass (`npm run arv`)
- [ ] Build completes successfully (`npm run build`)

### Security

- [ ] No secrets in codebase (secret scan passes)
- [ ] Dependency vulnerabilities addressed (`npm audit`)
- [ ] No sensitive files tracked in git
- [ ] Security-related changes have been reviewed

### Documentation

- [ ] README.md reflects current features
- [ ] CHANGELOG.md has all changes since last release
- [ ] API documentation is current
- [ ] Breaking changes documented with migration guide

### CI/CD

- [ ] All CI workflows passing on main branch
- [ ] Docker images build successfully
- [ ] Infrastructure changes validated with `tofu plan`

## Release Process

### Step 1: Prepare Branch

```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Create release branch (required for review process)
git checkout -b release/vX.Y.Z
```

### Step 2: Version Bump

```bash
# Update version in VERSION file
echo "X.Y.Z" > VERSION

# Update package.json versions (root and packages)
npm version X.Y.Z --no-git-tag-version --workspaces --include-workspace-root
```

### Step 3: Update CHANGELOG

Add release section to CHANGELOG.md:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature A
- New feature B

### Changed
- Modified behavior X

### Fixed
- Bug fix Y
- Bug fix Z

### Security
- Security fix (if applicable)
```

### Step 4: Final Validation

```bash
# Full validation suite
npm run build
npm run typecheck
npm run test
npm run arv
```

### Step 5: Commit Release

```bash
# Include all version-bumped files (root and workspace packages)
git add VERSION CHANGELOG.md package.json package-lock.json \
  apps/*/package.json packages/*/package.json

git commit -m "chore(release): prepare vX.Y.Z

- Update version to X.Y.Z
- Update CHANGELOG with release notes
"
```

### Step 6: Create PR and Merge

```bash
# Push release branch
git push origin release/vX.Y.Z

# Create PR for review
gh pr create --title "chore(release): prepare vX.Y.Z" \
  --body "Release preparation for vX.Y.Z. See CHANGELOG.md for details."

# After PR is approved and merged, create tag on main
git checkout main
git pull origin main

# Create annotated tag
git tag -a vX.Y.Z -m "Release vX.Y.Z

Highlights:
- Feature A
- Feature B
- Bug fix Y
"

# Push tag
git push origin vX.Y.Z
```

### Step 7: Create GitHub Release

1. Go to GitHub Releases page
2. Click "Draft a new release"
3. Select tag `vX.Y.Z`
4. Title: `vX.Y.Z`
5. Copy CHANGELOG section as release notes
6. Check "Set as the latest release"
7. Publish release

### Step 8: Verify Deployment

```bash
# Check CI workflow triggered
gh run list --limit 5

# Verify production deployment
curl -sf https://api.gwi.dev/health
curl -sf https://gateway.gwi.dev/health

# Check version in deployed services
curl -s https://api.gwi.dev/health | jq .version
```

## Post-Release Checklist

- [ ] GitHub Release published
- [ ] CI deployment succeeded
- [ ] Production health checks passing
- [ ] npm package published (if applicable)
- [ ] Announcement posted (if major release)
- [ ] Close related GitHub issues/milestones

## Rollback Procedure

### Quick Rollback (Revert to Previous Tag)

```bash
# Identify previous stable version
git tag --list 'v*' --sort=-v:refname | head -5

# Deploy previous version via CI
# Trigger deploy workflow with specific version
gh workflow run deploy.yml -f version=vX.Y.Z-1

# Or manually deploy infrastructure
cd infra
tofu apply -var-file=envs/prod.tfvars \
  -var="gwi_api_image=...:vX.Y.Z-1" \
  -var="a2a_gateway_image=...:vX.Y.Z-1" \
  -var="github_webhook_image=...:vX.Y.Z-1" \
  -var="gwi_worker_image=...:vX.Y.Z-1"
```

### Full Rollback (Revert Commits)

```bash
# Revert release commit
git revert HEAD
git push origin main

# Delete broken tag (local and remote)
git push origin --delete vX.Y.Z
git tag -d vX.Y.Z

# Delete GitHub release (via UI or API)
gh release delete vX.Y.Z --yes
```

## Version History

| Version | Date | Type | Notes |
|---------|------|------|-------|
| 0.5.1 | 2026-01-29 | Patch | Community health files, templates |
| 0.5.0 | 2026-01-29 | Minor | Epic J local dev review |
| 0.4.0 | 2026-01-23 | Minor | Epic D & J features |
| 0.3.0 | 2025-12-15 | Minor | Multi-agent architecture |
| 0.2.0 | 2025-12-01 | Minor | Cloud infrastructure |
| 0.1.0 | 2025-11-01 | Major | Initial MVP |

## Automation

### Automated Release (Future)

The release process can be automated using:

1. **GitHub Actions Workflow** (`release.yml`)
   - Triggered by pushing a version tag
   - Runs full test suite
   - Builds and pushes Docker images
   - Creates GitHub Release with generated notes

2. **Semantic Release** (optional)
   - Automatic version bump based on commit messages
   - Automatic CHANGELOG generation
   - Automatic GitHub Release creation

### Current Status

- Manual release process (this checklist)
- Automated CI/CD on push to main
- Manual version bump and CHANGELOG update required

## Related Documentation

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development guidelines
- [SECURITY.md](../SECURITY.md) - Security policy
- [Firebase Hosting Runbook](./031-OD-RUNB-firebase-hosting-operations.md)
- [Observability Runbook](./032-OD-RUNB-observability-operations.md)
- [Security/IAM Runbook](./033-DR-RUNB-security-iam-operations.md)
