# Repository Gaps Audit

Remaining items for "perfect repo" status.

## Recommended

| Item | Priority | Notes |
|------|----------|-------|
| GitHub Releases | High | Create releases from existing tags (v0.2.0-v0.5.0) |
| Dependabot config | Medium | Add `.github/dependabot.yml` for npm updates |
| Branch protection | Medium | Require PR reviews, status checks on `main` |
| Actions SHA pinning | Medium | Pin workflow action versions to full SHAs |

## Optional

| Item | Priority | Notes |
|------|----------|-------|
| Code scanning | Low | Enable GitHub Advanced Security if available |
| Signed commits | Low | Require GPG-signed commits |
| Docs site | Low | GitHub Pages or dedicated docs |
| Architecture diagrams | Low | Mermaid in README covers basics |

## Custom Properties (Org-Level)

GitHub custom properties are org metadata, not repo files. Suggested schema for org admin:

| Property | Values | Purpose |
|----------|--------|---------|
| `risk_level` | low/med/high | Ruleset targeting |
| `release_tier` | experimental/beta/ga | Deployment gates |
| `owner_team` | core/infra/sdk | Ownership routing |

Set in: GitHub Org Settings > Custom Properties

These are NOT committed to the repo - they are configured in the GitHub organization settings.
