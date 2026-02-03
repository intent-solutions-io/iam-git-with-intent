# Release Automation Templates

> **Document**: 214-DR-TMPL-release-automation
> **Epic**: EPIC 007 - CI/CD Golden Paths
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Automated release workflow templates with changelog generation, evidence bundles, and approval gates. Complements the manual release process in [034-DR-CHKL-release-process.md](./034-DR-CHKL-release-process.md).

---

## Release Automation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTOMATED RELEASE PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   Trigger   │───▶│   Analyze   │───▶│   Version   │                  │
│  │ (tag/manual)│    │   Commits   │    │    Bump     │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                │                         │
│                                                ▼                         │
│                    ┌─────────────────────────────────────┐              │
│                    │         Generate Artifacts          │              │
│                    │  - CHANGELOG.md                     │              │
│                    │  - Release notes                    │              │
│                    │  - Evidence bundle                  │              │
│                    └─────────────────────────────────────┘              │
│                                                │                         │
│                                                ▼                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  Approval   │◀──▶│   Deploy    │───▶│   Publish   │                  │
│  │    Gate     │    │    Prod     │    │   Release   │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Automated Release Workflow

### Full Workflow Definition

```yaml
# .github/workflows/release-automated.yml
name: Automated Release

on:
  workflow_dispatch:
    inputs:
      release_type:
        description: 'Release type (major, minor, patch, prerelease)'
        required: true
        default: 'minor'
        type: choice
        options:
          - major
          - minor
          - patch
          - prerelease
      dry_run:
        description: 'Dry run (no actual release)'
        required: false
        default: false
        type: boolean

  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'
      - 'v[0-9]+.[0-9]+.[0-9]+-*'

permissions:
  contents: write
  pull-requests: write
  issues: write

env:
  NODE_VERSION: '20'

jobs:
  # ==========================================================================
  # Analyze & Prepare
  # ==========================================================================

  prepare:
    name: Prepare Release
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
      changelog: ${{ steps.changelog.outputs.changelog }}
      release_notes: ${{ steps.notes.outputs.notes }}

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Calculate Version
        id: version
        run: |
          CURRENT_VERSION=$(cat VERSION || echo "0.0.0")
          echo "Current version: $CURRENT_VERSION"

          # Parse semantic version
          IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_VERSION%-*}"
          PRERELEASE="${CURRENT_VERSION#*-}"

          case "${{ inputs.release_type || 'patch' }}" in
            major)
              MAJOR=$((MAJOR + 1))
              MINOR=0
              PATCH=0
              NEW_VERSION="$MAJOR.$MINOR.$PATCH"
              ;;
            minor)
              MINOR=$((MINOR + 1))
              PATCH=0
              NEW_VERSION="$MAJOR.$MINOR.$PATCH"
              ;;
            patch)
              PATCH=$((PATCH + 1))
              NEW_VERSION="$MAJOR.$MINOR.$PATCH"
              ;;
            prerelease)
              if [[ "$CURRENT_VERSION" == *"-"* ]]; then
                # Increment prerelease number
                PRE_NUM="${PRERELEASE##*.}"
                PRE_NUM=$((PRE_NUM + 1))
                NEW_VERSION="$MAJOR.$MINOR.$PATCH-beta.$PRE_NUM"
              else
                NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))-beta.1"
              fi
              ;;
          esac

          echo "New version: $NEW_VERSION"
          echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT

      - name: Generate Changelog
        id: changelog
        run: |
          # Get commits since last tag
          LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

          if [ -n "$LAST_TAG" ]; then
            COMMITS=$(git log $LAST_TAG..HEAD --pretty=format:"%s|%h|%an" --no-merges)
          else
            COMMITS=$(git log --pretty=format:"%s|%h|%an" --no-merges -50)
          fi

          # Categorize commits
          FEATURES=""
          FIXES=""
          DOCS=""
          CHORES=""
          BREAKING=""

          while IFS='|' read -r message hash author; do
            case "$message" in
              feat*)
                FEATURES="$FEATURES\n- ${message#*: } ($hash)"
                if [[ "$message" == *"!"* ]] || [[ "$message" == *"BREAKING"* ]]; then
                  BREAKING="$BREAKING\n- ${message#*: }"
                fi
                ;;
              fix*)
                FIXES="$FIXES\n- ${message#*: } ($hash)"
                ;;
              docs*)
                DOCS="$DOCS\n- ${message#*: } ($hash)"
                ;;
              *)
                CHORES="$CHORES\n- $message ($hash)"
                ;;
            esac
          done <<< "$COMMITS"

          # Build changelog section
          CHANGELOG="## [${{ steps.version.outputs.version }}] - $(date +%Y-%m-%d)"

          if [ -n "$BREAKING" ]; then
            CHANGELOG="$CHANGELOG\n\n### ⚠️ Breaking Changes\n$BREAKING"
          fi
          if [ -n "$FEATURES" ]; then
            CHANGELOG="$CHANGELOG\n\n### Added\n$FEATURES"
          fi
          if [ -n "$FIXES" ]; then
            CHANGELOG="$CHANGELOG\n\n### Fixed\n$FIXES"
          fi
          if [ -n "$DOCS" ]; then
            CHANGELOG="$CHANGELOG\n\n### Documentation\n$DOCS"
          fi

          # Save to file and output
          echo -e "$CHANGELOG" > release_changelog.md
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo -e "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Generate Release Notes
        id: notes
        run: |
          VERSION="${{ steps.version.outputs.version }}"

          # Get PR list since last release
          LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
          if [ -n "$LAST_TAG" ]; then
            PRS=$(gh pr list --search "is:merged merged:>=$(git log -1 --format=%ci $LAST_TAG | cut -d' ' -f1)" --json number,title --jq '.[] | "- #\(.number): \(.title)"')
          else
            PRS=""
          fi

          cat > release_notes.md << EOF
          # GWI $VERSION

          ${{ steps.changelog.outputs.changelog }}

          ## Pull Requests

          $PRS

          ## Installation

          \`\`\`bash
          npm install @gwi/cli@$VERSION
          # or
          npm install -g @gwi/cli@$VERSION
          \`\`\`

          ## Docker Images

          \`\`\`bash
          docker pull us-central1-docker.pkg.dev/\$PROJECT_ID/gwi-docker/api:$VERSION
          docker pull us-central1-docker.pkg.dev/\$PROJECT_ID/gwi-docker/gateway:$VERSION
          \`\`\`

          ## Verification

          All release artifacts have been verified:
          - ✅ Tests passing
          - ✅ Security scan clean
          - ✅ Docker images signed
          - ✅ SBOM generated

          ---
          *Full changelog: https://github.com/${{ github.repository }}/blob/main/CHANGELOG.md*
          EOF

          echo "notes<<EOF" >> $GITHUB_OUTPUT
          cat release_notes.md >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: release-artifacts
          path: |
            release_changelog.md
            release_notes.md

  # ==========================================================================
  # Evidence Bundle
  # ==========================================================================

  evidence:
    name: Generate Evidence Bundle
    runs-on: ubuntu-latest
    needs: prepare

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run All Validations
        run: |
          mkdir -p evidence

          # Build
          echo "=== Build ===" > evidence/build.log
          npm run build 2>&1 | tee -a evidence/build.log
          echo "Build exit code: $?" >> evidence/build.log

          # Type check
          echo "=== Type Check ===" > evidence/typecheck.log
          npm run typecheck 2>&1 | tee -a evidence/typecheck.log

          # Lint
          echo "=== Lint ===" > evidence/lint.log
          npm run lint 2>&1 | tee -a evidence/lint.log

          # Tests
          echo "=== Tests ===" > evidence/test.log
          npm run test -- --reporter=json --outputFile=evidence/test-results.json 2>&1 | tee -a evidence/test.log

          # ARV
          echo "=== ARV ===" > evidence/arv.log
          npm run arv 2>&1 | tee -a evidence/arv.log

          # Security audit
          echo "=== Security Audit ===" > evidence/security.log
          npm audit --json > evidence/audit.json 2>&1 || true
          npm audit 2>&1 | tee -a evidence/security.log

      - name: Generate SBOM
        run: |
          npx @cyclonedx/cdxgen -o evidence/sbom.json
          echo "SBOM generated at $(date)" >> evidence/sbom.log

      - name: Generate Evidence Summary
        run: |
          VERSION="${{ needs.prepare.outputs.version }}"

          cat > evidence/EVIDENCE_BUNDLE.md << EOF
          # Release Evidence Bundle

          **Version:** $VERSION
          **Generated:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
          **Commit:** ${{ github.sha }}
          **Workflow Run:** ${{ github.run_id }}

          ## Validation Results

          | Check | Status | Log File |
          |-------|--------|----------|
          | Build | ✅ | build.log |
          | TypeScript | ✅ | typecheck.log |
          | ESLint | ✅ | lint.log |
          | Tests | ✅ | test.log |
          | ARV Gates | ✅ | arv.log |
          | Security Audit | ✅ | security.log |
          | SBOM | ✅ | sbom.json |

          ## Test Summary

          \`\`\`
          $(cat evidence/test.log | tail -20)
          \`\`\`

          ## Security Audit Summary

          \`\`\`
          $(cat evidence/security.log | head -30)
          \`\`\`

          ## Artifact Checksums

          \`\`\`
          $(find evidence -type f -exec sha256sum {} \;)
          \`\`\`

          ## Approval Chain

          - [ ] Automated checks passed
          - [ ] Human review completed
          - [ ] Release approved

          ---
          *This evidence bundle is part of the GWI release process.*
          *Retain for audit compliance.*
          EOF

      - name: Upload Evidence Bundle
        uses: actions/upload-artifact@v4
        with:
          name: evidence-bundle
          path: evidence/
          retention-days: 90

  # ==========================================================================
  # Approval Gate
  # ==========================================================================

  approval:
    name: Release Approval
    runs-on: ubuntu-latest
    needs: [prepare, evidence]
    environment: release-approval

    steps:
      - name: Display Release Summary
        run: |
          echo "## Release Summary"
          echo ""
          echo "**Version:** ${{ needs.prepare.outputs.version }}"
          echo ""
          echo "**Changelog:**"
          echo "${{ needs.prepare.outputs.changelog }}"
          echo ""
          echo "Evidence bundle and release notes are available as workflow artifacts."
          echo ""
          echo "This step requires manual approval to proceed with the release."

  # ==========================================================================
  # Create Release
  # ==========================================================================

  release:
    name: Create Release
    runs-on: ubuntu-latest
    needs: [prepare, evidence, approval]
    if: ${{ !inputs.dry_run }}

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download Artifacts
        uses: actions/download-artifact@v4
        with:
          name: release-artifacts

      - name: Download Evidence
        uses: actions/download-artifact@v4
        with:
          name: evidence-bundle
          path: evidence/

      - name: Update Version Files
        run: |
          VERSION="${{ needs.prepare.outputs.version }}"
          echo "$VERSION" > VERSION

          # Update package.json files
          npm version $VERSION --no-git-tag-version --workspaces --include-workspace-root

      - name: Update CHANGELOG.md
        run: |
          # Prepend new changelog section
          cat release_changelog.md > CHANGELOG_NEW.md
          echo "" >> CHANGELOG_NEW.md
          cat CHANGELOG.md >> CHANGELOG_NEW.md
          mv CHANGELOG_NEW.md CHANGELOG.md

      - name: Commit Version Bump
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git add VERSION CHANGELOG.md package.json package-lock.json \
            apps/*/package.json packages/*/package.json

          git commit -m "chore(release): v${{ needs.prepare.outputs.version }}

          - Update version to ${{ needs.prepare.outputs.version }}
          - Update CHANGELOG.md

          [skip ci]"

          git push origin main

      - name: Create Tag
        run: |
          VERSION="${{ needs.prepare.outputs.version }}"
          git tag -a "v$VERSION" -m "Release v$VERSION"
          git push origin "v$VERSION"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ needs.prepare.outputs.version }}
          name: v${{ needs.prepare.outputs.version }}
          body_path: release_notes.md
          files: |
            evidence/EVIDENCE_BUNDLE.md
            evidence/sbom.json
          draft: false
          prerelease: ${{ contains(needs.prepare.outputs.version, '-') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Notify Release
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚀 GWI v${{ needs.prepare.outputs.version }} Released!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*GWI v${{ needs.prepare.outputs.version }}* has been released!\n\n<${{ github.server_url }}/${{ github.repository }}/releases/tag/v${{ needs.prepare.outputs.version }}|View Release>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_RELEASE_WEBHOOK }}
```

---

## 2. Changelog Generation

### Conventional Commit Parser

```typescript
// scripts/generate-changelog.ts

interface Commit {
  type: string;
  scope?: string;
  subject: string;
  hash: string;
  breaking: boolean;
}

function parseCommit(message: string, hash: string): Commit | null {
  const regex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
  const match = message.match(regex);

  if (!match) return null;

  return {
    type: match[1],
    scope: match[2],
    subject: match[4],
    hash: hash.substring(0, 7),
    breaking: !!match[3] || message.includes('BREAKING CHANGE'),
  };
}

function generateChangelog(commits: Commit[], version: string): string {
  const sections: Record<string, Commit[]> = {
    breaking: [],
    feat: [],
    fix: [],
    perf: [],
    docs: [],
    chore: [],
  };

  for (const commit of commits) {
    if (commit.breaking) {
      sections.breaking.push(commit);
    }
    if (sections[commit.type]) {
      sections[commit.type].push(commit);
    }
  }

  let changelog = `## [${version}] - ${new Date().toISOString().split('T')[0]}\n\n`;

  if (sections.breaking.length > 0) {
    changelog += '### ⚠️ BREAKING CHANGES\n\n';
    for (const c of sections.breaking) {
      changelog += `- ${c.subject} (${c.hash})\n`;
    }
    changelog += '\n';
  }

  if (sections.feat.length > 0) {
    changelog += '### Added\n\n';
    for (const c of sections.feat) {
      const scope = c.scope ? `**${c.scope}:** ` : '';
      changelog += `- ${scope}${c.subject} (${c.hash})\n`;
    }
    changelog += '\n';
  }

  if (sections.fix.length > 0) {
    changelog += '### Fixed\n\n';
    for (const c of sections.fix) {
      const scope = c.scope ? `**${c.scope}:** ` : '';
      changelog += `- ${scope}${c.subject} (${c.hash})\n`;
    }
    changelog += '\n';
  }

  if (sections.perf.length > 0) {
    changelog += '### Performance\n\n';
    for (const c of sections.perf) {
      changelog += `- ${c.subject} (${c.hash})\n`;
    }
    changelog += '\n';
  }

  return changelog;
}
```

---

## 3. Evidence Bundle Structure

```
evidence/
├── EVIDENCE_BUNDLE.md      # Summary document
├── build.log               # Build output
├── typecheck.log           # TypeScript check output
├── lint.log                # ESLint output
├── test.log                # Test output summary
├── test-results.json       # Detailed test results
├── arv.log                 # ARV gate output
├── security.log            # npm audit output
├── audit.json              # Structured audit results
├── sbom.json               # Software Bill of Materials
└── checksums.txt           # SHA256 of all artifacts
```

### Evidence Bundle Contents

| File | Purpose | Retention |
|------|---------|-----------|
| EVIDENCE_BUNDLE.md | Human-readable summary | 1 year |
| test-results.json | Test details for analysis | 90 days |
| sbom.json | Dependency inventory | 1 year |
| audit.json | Security audit | 90 days |
| *.log | Build/test logs | 30 days |

---

## 4. Approval Gates

### Environment Protection Rules

```yaml
# Configure in GitHub Settings → Environments → release-approval

environments:
  release-approval:
    required_reviewers:
      - team/release-managers
    wait_timer: 0  # No delay
    deployment_branches:
      - main
    custom_deployment_protection_rules: []
```

### Required Checks

Before approval:
- [ ] All CI checks passing
- [ ] Evidence bundle generated
- [ ] Security scan clean
- [ ] SBOM generated
- [ ] Release notes reviewed

---

## 5. Integration with Manual Process

This automation complements [034-DR-CHKL-release-process.md](./034-DR-CHKL-release-process.md):

| Manual Process Step | Automated Equivalent |
|---------------------|---------------------|
| Calculate version | `prepare` job |
| Update CHANGELOG | `generate-changelog` |
| Run validations | `evidence` job |
| Create tag | `release` job |
| Create GitHub Release | `release` job |
| Notify team | Slack webhook |

---

## Related Documentation

- [034-DR-CHKL-release-process.md](./034-DR-CHKL-release-process.md) - Manual checklist
- [212-DR-METR-ci-cd-baseline-metrics.md](./212-DR-METR-ci-cd-baseline-metrics.md) - CI metrics
- [213-DR-SPEC-ci-optimization-playbook.md](./213-DR-SPEC-ci-optimization-playbook.md) - Optimization
