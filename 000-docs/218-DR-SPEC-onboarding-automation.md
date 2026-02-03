# Developer Onboarding Automation Specification

> **Document**: 218-DR-SPEC-onboarding-automation
> **Epic**: EPIC 010 - Onboarding Automation
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Automated onboarding reduces time-to-productivity for new developers from days to hours. This spec defines the onboarding pipeline, automated provisioning, and verification checkpoints.

---

## Onboarding Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPER ONBOARDING PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │  Invite  │──▶│  Access  │──▶│   Env    │──▶│  Verify  │──▶│  Assign  │  │
│  │  Sent    │   │ Granted  │   │  Setup   │   │  Ready   │   │  Task    │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│   Email +        GitHub +       Clone +        Build +       First PR      │
│   Slack          GCP IAM        Install        Tests         Assigned      │
│                                                                              │
│  Timeline: ─────────────────────────────────────────────────────────────▶  │
│            0h          1h           2h           3h           4h            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Invitation & Identity

### 1.1 Onboarding Trigger

```typescript
interface OnboardingRequest {
  // Identity
  email: string;
  name: string;
  github_username: string;

  // Role
  role: 'engineer' | 'senior_engineer' | 'staff_engineer' | 'manager';
  team: string;
  start_date: string;

  // Access levels
  repositories: string[];
  gcp_projects: string[];

  // Manager
  manager_email: string;
  buddy_email?: string;
}
```

### 1.2 Identity Provisioning

```yaml
# GitHub Actions: .github/workflows/onboard-developer.yml
name: Onboard Developer

on:
  workflow_dispatch:
    inputs:
      email:
        description: 'Developer email'
        required: true
      github_username:
        description: 'GitHub username'
        required: true
      role:
        description: 'Role level'
        required: true
        type: choice
        options:
          - engineer
          - senior_engineer
          - staff_engineer
      team:
        description: 'Team name'
        required: true

jobs:
  provision-identity:
    runs-on: ubuntu-latest
    steps:
      - name: Add to GitHub Organization
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.ORG_ADMIN_TOKEN }}
          script: |
            await github.rest.orgs.setMembershipForUser({
              org: 'intent-solutions-io',
              username: '${{ inputs.github_username }}',
              role: 'member'
            });

      - name: Add to Team
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.ORG_ADMIN_TOKEN }}
          script: |
            await github.rest.teams.addOrUpdateMembershipForUserInOrg({
              org: 'intent-solutions-io',
              team_slug: '${{ inputs.team }}',
              username: '${{ inputs.github_username }}',
              role: 'member'
            });

      - name: Grant Repository Access
        run: |
          for repo in gwi-core gwi-api gwi-web; do
            gh api repos/intent-solutions-io/$repo/collaborators/${{ inputs.github_username }} \
              -X PUT -f permission=push
          done
```

### 1.3 GCP IAM Provisioning

```bash
#!/bin/bash
# scripts/onboard/provision-gcp.sh

EMAIL="$1"
ROLE="$2"
PROJECT="git-with-intent"

echo "Provisioning GCP access for $EMAIL..."

# Base roles for all engineers
gcloud projects add-iam-policy-binding $PROJECT \
  --member="user:$EMAIL" \
  --role="roles/viewer"

gcloud projects add-iam-policy-binding $PROJECT \
  --member="user:$EMAIL" \
  --role="roles/logging.viewer"

gcloud projects add-iam-policy-binding $PROJECT \
  --member="user:$EMAIL" \
  --role="roles/monitoring.viewer"

# Role-specific permissions
case $ROLE in
  engineer)
    gcloud projects add-iam-policy-binding $PROJECT \
      --member="user:$EMAIL" \
      --role="roles/run.developer"
    ;;
  senior_engineer|staff_engineer)
    gcloud projects add-iam-policy-binding $PROJECT \
      --member="user:$EMAIL" \
      --role="roles/run.admin"
    gcloud projects add-iam-policy-binding $PROJECT \
      --member="user:$EMAIL" \
      --role="roles/secretmanager.secretAccessor"
    ;;
esac

echo "GCP provisioning complete"
```

---

## Phase 2: Environment Setup

### 2.1 Automated Setup Script

```bash
#!/bin/bash
# scripts/onboard/setup-dev-environment.sh

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  GWI Developer Environment Setup                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
check_prerequisites() {
  echo "Checking prerequisites..."

  command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }
  command -v git >/dev/null 2>&1 || { echo "Git required"; exit 1; }
  command -v gh >/dev/null 2>&1 || { echo "GitHub CLI required"; exit 1; }

  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Node.js 20+ required (found: $NODE_VERSION)"
    exit 1
  fi

  echo "  ✓ All prerequisites met"
}

# Clone repositories
clone_repos() {
  echo ""
  echo "Cloning repositories..."

  WORKSPACE="${GWI_WORKSPACE:-$HOME/workspace/gwi}"
  mkdir -p "$WORKSPACE"
  cd "$WORKSPACE"

  if [ ! -d "git-with-intent" ]; then
    gh repo clone intent-solutions-io/iam-git-with-intent git-with-intent
    echo "  ✓ Cloned git-with-intent"
  else
    echo "  ○ git-with-intent already exists"
  fi
}

# Install dependencies
install_deps() {
  echo ""
  echo "Installing dependencies..."

  cd "$WORKSPACE/git-with-intent"
  npm install
  echo "  ✓ Dependencies installed"
}

# Build project
build_project() {
  echo ""
  echo "Building project..."

  npm run build
  echo "  ✓ Build successful"
}

# Run tests
run_tests() {
  echo ""
  echo "Running tests..."

  npm run test
  echo "  ✓ Tests passed"
}

# Configure local environment
configure_env() {
  echo ""
  echo "Configuring local environment..."

  if [ ! -f .env.local ]; then
    cat > .env.local << 'EOF'
# Local development configuration
GWI_STORE_BACKEND=sqlite
GWI_LOG_LEVEL=debug

# AI Providers (add your keys)
# ANTHROPIC_API_KEY=
# GOOGLE_AI_API_KEY=
# OPENAI_API_KEY=

# GitHub (for local testing)
# GITHUB_TOKEN=
EOF
    echo "  ✓ Created .env.local (add your API keys)"
  else
    echo "  ○ .env.local already exists"
  fi
}

# Install git hooks
install_hooks() {
  echo ""
  echo "Installing git hooks..."

  npm run prepare 2>/dev/null || npx husky install
  echo "  ✓ Git hooks installed"
}

# Verify setup
verify_setup() {
  echo ""
  echo "Verifying setup..."

  # Check CLI works
  node apps/cli/dist/index.js --version >/dev/null 2>&1
  echo "  ✓ CLI executable"

  # Check ARV gates
  npm run arv:smoke 2>/dev/null
  echo "  ✓ ARV smoke test passed"

  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  Setup Complete!                                             ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  Next steps:                                                 ║"
  echo "║  1. Add API keys to .env.local                               ║"
  echo "║  2. Run: gwi --help                                          ║"
  echo "║  3. Try: gwi review --local                                  ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
}

# Main
check_prerequisites
clone_repos
install_deps
build_project
run_tests
configure_env
install_hooks
verify_setup
```

### 2.2 IDE Configuration

```json
// .vscode/settings.json (committed to repo)
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.tsdk": "node_modules/typescript/lib",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.turbo": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.turbo": true
  }
}
```

```json
// .vscode/extensions.json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "github.copilot",
    "eamodio.gitlens"
  ]
}
```

---

## Phase 3: Verification Checkpoints

### 3.1 Onboarding Checklist

```typescript
interface OnboardingChecklist {
  identity: {
    github_org_member: boolean;
    github_team_member: boolean;
    gcp_iam_provisioned: boolean;
    slack_workspace_joined: boolean;
  };

  environment: {
    repo_cloned: boolean;
    deps_installed: boolean;
    build_successful: boolean;
    tests_passing: boolean;
    hooks_installed: boolean;
  };

  verification: {
    cli_working: boolean;
    arv_smoke_passed: boolean;
    local_review_tested: boolean;
  };

  onboarding: {
    docs_reviewed: boolean;
    buddy_assigned: boolean;
    first_task_assigned: boolean;
    first_pr_merged: boolean;
  };
}
```

### 3.2 Automated Verification

```typescript
// packages/core/src/onboarding/verifier.ts

interface VerificationResult {
  passed: boolean;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    message?: string;
    duration_ms: number;
  }[];
  summary: string;
}

async function verifyOnboarding(
  username: string
): Promise<VerificationResult> {
  const checks: VerificationResult['checks'] = [];

  // Check GitHub access
  checks.push(await checkGitHubAccess(username));

  // Check GCP access
  checks.push(await checkGCPAccess(username));

  // Check local environment
  checks.push(await checkLocalBuild());
  checks.push(await checkLocalTests());
  checks.push(await checkARVGates());

  // Check CLI functionality
  checks.push(await checkCLIVersion());
  checks.push(await checkLocalReview());

  const passed = checks.every(c => c.status === 'pass');
  const failedCount = checks.filter(c => c.status === 'fail').length;

  return {
    passed,
    checks,
    summary: passed
      ? 'All verification checks passed'
      : `${failedCount} check(s) failed`,
  };
}

async function checkLocalBuild(): Promise<VerificationResult['checks'][0]> {
  const start = Date.now();
  try {
    await exec('npm run build');
    return {
      name: 'Local Build',
      status: 'pass',
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'Local Build',
      status: 'fail',
      message: error.message,
      duration_ms: Date.now() - start,
    };
  }
}
```

### 3.3 Onboarding Dashboard

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ ONBOARDING STATUS: jane.doe@company.com                                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Identity Provisioning                                        [████████] 100% ║
║   ✓ GitHub organization member                                                ║
║   ✓ Added to 'engineering' team                                               ║
║   ✓ GCP IAM roles assigned                                                    ║
║   ✓ Slack workspace joined                                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Environment Setup                                            [██████░░]  75% ║
║   ✓ Repository cloned                                                         ║
║   ✓ Dependencies installed                                                    ║
║   ✓ Build successful                                                          ║
║   ○ API keys not configured                                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Verification                                                 [████░░░░]  50% ║
║   ✓ CLI working                                                               ║
║   ✓ ARV smoke passed                                                          ║
║   ○ Local review not tested                                                   ║
║   ○ First PR not created                                                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Overall Progress                                             [██████░░]  75% ║
║ Estimated Time to Completion: 1 hour                                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Phase 4: First Task Assignment

### 4.1 Starter Task Templates

```yaml
# .github/ISSUE_TEMPLATE/starter-task.yml
name: Starter Task
description: First task for new team members
labels: ["good-first-issue", "onboarding"]
body:
  - type: markdown
    attributes:
      value: |
        ## Welcome to GWI!

        This is your first task. It's designed to help you:
        - Get familiar with the codebase
        - Practice the development workflow
        - Make your first contribution

  - type: input
    id: assignee
    attributes:
      label: New Developer
      placeholder: "@username"
    validations:
      required: true

  - type: dropdown
    id: task-type
    attributes:
      label: Task Type
      options:
        - Documentation improvement
        - Test coverage addition
        - Small bug fix
        - Code cleanup
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Task Description
      placeholder: Describe what needs to be done...
    validations:
      required: true
```

### 4.2 Recommended First Tasks

| Task Type | Difficulty | Time | Learning |
|-----------|------------|------|----------|
| Add JSDoc to function | Easy | 30m | Code navigation |
| Add unit test | Easy | 1h | Testing patterns |
| Fix typo in docs | Easy | 15m | PR workflow |
| Add error handling | Medium | 2h | Error patterns |
| Improve log message | Easy | 30m | Observability |

### 4.3 First PR Template

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE/first-pr.md -->

## My First PR! 🎉

### What I Changed
<!-- Describe your changes -->

### What I Learned
<!-- Share what you discovered while working on this -->

### Questions
<!-- Any questions for reviewers? -->

### Checklist
- [ ] I ran `npm run build` locally
- [ ] I ran `npm run test` locally
- [ ] I ran `npm run arv` locally
- [ ] I asked my buddy for a review

### Onboarding Feedback
<!-- How was your onboarding experience? Any suggestions? -->
```

---

## Automation Workflows

### Complete Onboarding Workflow

```yaml
# .github/workflows/complete-onboarding.yml
name: Complete Onboarding

on:
  workflow_dispatch:
    inputs:
      email:
        required: true
      github_username:
        required: true
      role:
        required: true
        type: choice
        options: [engineer, senior_engineer, staff_engineer]
      team:
        required: true
      buddy_username:
        required: true

jobs:
  provision:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Provision GitHub Access
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.ORG_ADMIN_TOKEN }}
          script: |
            // Add to org
            await github.rest.orgs.setMembershipForUser({
              org: 'intent-solutions-io',
              username: '${{ inputs.github_username }}',
              role: 'member'
            });

            // Add to team
            await github.rest.teams.addOrUpdateMembershipForUserInOrg({
              org: 'intent-solutions-io',
              team_slug: '${{ inputs.team }}',
              username: '${{ inputs.github_username }}'
            });

      - name: Provision GCP Access
        run: |
          bash scripts/onboard/provision-gcp.sh \
            "${{ inputs.email }}" \
            "${{ inputs.role }}"
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}

      - name: Create Starter Issue
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: 'intent-solutions-io',
              repo: 'iam-git-with-intent',
              title: `Onboarding: Welcome ${{ inputs.github_username }}!`,
              body: `Welcome to GWI! 🎉\n\n` +
                    `Buddy: @${{ inputs.buddy_username }}\n\n` +
                    `## Setup Checklist\n` +
                    `- [ ] Clone repository\n` +
                    `- [ ] Run setup script\n` +
                    `- [ ] Configure API keys\n` +
                    `- [ ] Complete first PR\n`,
              assignees: ['${{ inputs.github_username }}'],
              labels: ['onboarding']
            });

      - name: Send Welcome Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "channel": "#engineering",
              "text": "Welcome @${{ inputs.github_username }} to the team! 🎉",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Welcome to GWI!*\n\n👤 ${{ inputs.github_username }}\n🏢 Team: ${{ inputs.team }}\n👥 Buddy: @${{ inputs.buddy_username }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

  notify-completion:
    needs: provision
    runs-on: ubuntu-latest
    steps:
      - name: Send Completion Email
        run: |
          echo "Onboarding workflow complete for ${{ inputs.email }}"
          # Integration with email service
```

---

## Metrics & Tracking

### Onboarding Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Time to First Commit | < 4 hours | From invite to first commit |
| Time to First PR | < 8 hours | From invite to first PR |
| Time to First Merge | < 24 hours | From invite to first merged PR |
| Setup Success Rate | > 95% | Percentage completing setup |
| Buddy Response Time | < 2 hours | Average buddy response time |

### Tracking Dashboard Query

```sql
-- Onboarding metrics query
SELECT
  developer_email,
  start_date,
  TIMESTAMP_DIFF(first_commit_at, start_date, HOUR) AS hours_to_first_commit,
  TIMESTAMP_DIFF(first_pr_at, start_date, HOUR) AS hours_to_first_pr,
  TIMESTAMP_DIFF(first_merge_at, start_date, HOUR) AS hours_to_first_merge,
  setup_completed,
  buddy_assigned
FROM `gwi.onboarding.developer_metrics`
WHERE start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY start_date DESC
```

---

## Offboarding

### Automated Offboarding

```bash
#!/bin/bash
# scripts/onboard/offboard-developer.sh

EMAIL="$1"
GITHUB_USERNAME="$2"

echo "Offboarding $EMAIL ($GITHUB_USERNAME)..."

# Remove GitHub access
gh api -X DELETE "orgs/intent-solutions-io/members/$GITHUB_USERNAME"

# Remove GCP IAM
gcloud projects remove-iam-policy-binding git-with-intent \
  --member="user:$EMAIL" \
  --all

# Archive in tracking
echo "Offboarding complete. Please manually:"
echo "  - Revoke Slack access"
echo "  - Transfer any open issues"
echo "  - Archive personal branches"
```

---

## Related Documentation

- [219-DR-TMPL-onboarding-checklist.md](./219-DR-TMPL-onboarding-checklist.md)
- [032-OD-RUNB-observability-operations.md](./032-OD-RUNB-observability-operations.md)
