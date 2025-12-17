# Git With Intent - User Journey

**Document ID**: 041-AA-GUID
**Date**: 2025-12-16
**Purpose**: Explain the user experience from discovery to daily use

---

## What is Git With Intent?

Git With Intent (GWI) is an AI-powered CLI tool that helps developers:
- **Resolve merge conflicts** automatically
- **Generate code from GitHub issues**
- **Review AI-generated changes** before applying

Think of it as an AI pair programmer that handles the tedious parts of PR workflows.

---

## 1. Discovery & Installation

A developer dealing with merge conflict pain finds the repo:

```bash
# Clone and install
git clone https://github.com/your-org/git-with-intent
cd git-with-intent
npm install
npm run build

# Or eventually (when published to npm):
npm install -g @gwi/cli
```

---

## 2. Setup (One-Time)

Set your API keys:

```bash
# Required: Claude API for conflict resolution
export ANTHROPIC_API_KEY=sk-ant-...

# Required: GitHub access
export GITHUB_TOKEN=ghp_...

# Optional: Google AI for faster triage
export GOOGLE_AI_API_KEY=...
```

---

## 3. Primary Use Cases

### A) Resolve Merge Conflicts (Main Use Case)

You have a PR with merge conflicts. Instead of manually resolving:

```bash
gwi workflow start pr-resolve --pr-url https://github.com/org/repo/pull/123
```

**What happens behind the scenes:**

1. **Triage Agent** → Analyzes conflicts, rates complexity (1-10)
2. **Resolver Agent** → Generates conflict resolutions using AI
3. **Reviewer Agent** → Security scan, syntax check
4. **Human Approval** → You review before anything is applied

### B) Issue-to-Code (Generate PR from Issue)

You have a GitHub issue you want turned into code:

```bash
gwi issue-to-code https://github.com/org/repo/issues/456
```

**What happens:**

1. Fetches issue details from GitHub
2. **Triage Agent** → Understands requirements
3. **Coder Agent** → Generates implementation
4. **Reviewer Agent** → Checks code quality
5. Outputs files for your review

---

## 4. The Workflow Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  You: gwi workflow start pr-resolve --pr-url <url>          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  1. TRIAGE (Gemini Flash - fast & cheap)                    │
│                                                             │
│     • Fetch PR metadata from GitHub                         │
│     • Analyze each conflicting file                         │
│     • Rate complexity: 1-10                                 │
│     • Recommend strategy: "accept-ours", "merge-both", etc  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. RESOLVE (Claude Sonnet or Opus)                         │
│                                                             │
│     • For each conflict:                                    │
│       - Read base, ours, theirs versions                    │
│       - Generate merged resolution                          │
│       - Explain reasoning                                   │
│     • Uses Opus for complexity > 4 (harder conflicts)       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. REVIEW (Claude Sonnet)                                  │
│                                                             │
│     • Syntax validation (bracket matching, etc)             │
│     • Security scan (passwords, API keys, eval)             │
│     • Code quality check                                    │
│     • Approve automatically or escalate to human            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. HUMAN APPROVAL (You're in control)                      │
│                                                             │
│     • Check status: gwi workflow status <id>                │
│     • Review proposed changes                               │
│     • Approve: gwi workflow approve <id>                    │
│     • Or reject: gwi workflow reject <id>                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. APPLY (Only after your approval)                        │
│                                                             │
│     • Writes resolved files to your repo                    │
│     • Creates commit                                        │
│     • Pushes to branch                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. CLI Commands Reference

| Command | What it does |
|---------|--------------|
| `gwi triage <pr-url>` | Just analyze complexity, don't resolve |
| `gwi plan <pr-url>` | Generate a resolution plan |
| `gwi workflow start pr-resolve --pr-url <url>` | Full automated pipeline |
| `gwi workflow list` | See all your running workflows |
| `gwi workflow status <id>` | Check a specific workflow's progress |
| `gwi workflow approve <id>` | Approve and apply the changes |
| `gwi workflow reject <id>` | Reject the proposed changes |
| `gwi issue-to-code <issue-url>` | Generate code from a GitHub issue |
| `gwi status` | Show overall agent status |

---

## 6. Example Session

```bash
# You have a PR with conflicts
$ gwi workflow start pr-resolve --pr-url https://github.com/acme/api/pull/42

✓ Fetching PR metadata...
✓ Found 3 conflicting files
✓ Triage complete: complexity 6/10
✓ Resolving conflicts...
  • src/auth/login.ts - merged both changes
  • src/api/users.ts - accepted theirs (newer)
  • config/settings.json - manual merge needed
✓ Review complete: 2 approved, 1 needs attention

Workflow ID: wf-abc123
Status: awaiting_approval

Run 'gwi workflow status wf-abc123' to see details
Run 'gwi workflow approve wf-abc123' to apply changes

# Check what it did
$ gwi workflow status wf-abc123

Workflow: wf-abc123
Status: awaiting_approval
PR: https://github.com/acme/api/pull/42

Resolutions:
  ✓ src/auth/login.ts    - merged both (confidence: 92%)
  ✓ src/api/users.ts     - accept theirs (confidence: 88%)
  ⚠ config/settings.json - needs review (confidence: 65%)

# Happy with it? Approve!
$ gwi workflow approve wf-abc123

✓ Changes applied
✓ Commit created: "Resolve merge conflicts via GWI"
✓ Pushed to branch: feature/new-auth
```

---

## 7. SaaS Version (For Teams)

There's also a hosted web version for teams:

1. **Install GitHub App** → Connects to your repos
2. **Comment on any PR** → `@gwi resolve` triggers the workflow
3. **Web Dashboard** → View all runs, approve/reject from browser
4. **Team Billing** → Pay per workflow run via Stripe

---

## 8. The Value Proposition

### Before GWI

```
Developer sees merge conflicts
    ↓
Manually reads both versions (10-30 min)
    ↓
Figures out what to keep (error-prone)
    ↓
Tests locally
    ↓
Commits and hopes it works
    ↓
Total: 30-60 minutes per conflict
```

### After GWI

```
Developer runs: gwi workflow start pr-resolve
    ↓
AI analyzes and resolves conflicts (2-3 min)
    ↓
Security & syntax auto-checked
    ↓
Developer reviews the diff (2 min)
    ↓
Approve and done
    ↓
Total: 5 minutes
```

---

## 9. AI Models Used

| Agent | Model | Why |
|-------|-------|-----|
| Triage | Gemini Flash | Fast, cheap, good at classification |
| Resolver | Claude Sonnet | Great at code understanding |
| Resolver (hard) | Claude Opus | For complexity > 4 |
| Reviewer | Claude Sonnet | Security-aware, thorough |
| Coder | Claude Sonnet | Code generation |

---

## 10. Safety Features

- **Human approval required** - AI never pushes without your OK
- **Security scanning** - Catches hardcoded passwords, API keys
- **Syntax validation** - Won't approve broken code
- **Confidence scores** - Low confidence = escalate to human
- **Dry-run mode** - See what would happen without doing it

---

## Questions?

- Check the [README](../README.md) for setup
- See [Architecture docs](../docs/) for technical details
- File an issue on GitHub for bugs/features

---

*"Git with purpose. Ship with confidence."*
