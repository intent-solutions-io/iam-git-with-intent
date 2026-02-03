# AI Coding Assistant + GWI Integration Playbook

> **Document**: 207-DR-GUID-ai-assistant-gwi-playbook
> **Epic**: EPIC 006 - AI Coding Assistant Enablement
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

How to effectively use AI coding assistants (Claude Code, Copilot, Cursor, Windsurf) alongside GWI workflows for maximum productivity.

---

## GWI + AI Assistant Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPER WORKFLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PLAN         2. CODE          3. REVIEW       4. SHIP       │
│  ─────────       ────────         ────────        ─────         │
│  gwi plan        AI Assistant     gwi review      gwi gate      │
│  gwi triage      + GWI hooks      --local         gwi autopilot │
│                                                                  │
│  AI helps:       AI helps:        AI helps:       GWI handles:  │
│  - Break down    - Write code     - Self-review   - Approval    │
│  - Estimate      - Write tests    - Fix issues    - Merge       │
│  - Identify      - Debug          - Document      - Deploy      │
│    risks                                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Planning with AI + GWI

### Start with GWI Triage

```bash
# Get complexity score for an issue
gwi triage https://github.com/org/repo/issues/123

# Output:
# Complexity: 7/10
# Estimated files: 12
# Risk areas: Authentication, Database
```

### Use AI to Break Down

```
Prompt to AI Assistant:
─────────────────────
Given this issue: [paste issue]
And this triage result: Complexity 7/10, touches auth and database

Break this into subtasks that can each be:
- Completed in < 2 hours
- Independently testable
- Safely reviewable

Output as a checklist.
```

### Create Implementation Plan

```bash
# Generate GWI plan
gwi plan https://github.com/org/repo/issues/123

# AI enhances the plan
# Paste GWI plan output to AI:
"Review this implementation plan and suggest:
1. Missing edge cases
2. Test scenarios
3. Potential blockers"
```

---

## Phase 2: Coding with AI + GWI Hooks

### Install GWI Hooks

```bash
# Install pre-commit hooks
gwi hooks install

# Hooks include:
# - Pre-commit: Format check, lint, secrets scan
# - Commit-msg: Conventional commit validation
# - Pre-push: Test run, complexity check
```

### AI-Assisted Development Loop

```
┌──────────────────────────────────────────────┐
│ 1. Ask AI to generate code                   │
│    ↓                                         │
│ 2. Review generated code (don't trust blindly)│
│    ↓                                         │
│ 3. Run locally: npm test                     │
│    ↓                                         │
│ 4. Commit (GWI hooks validate)               │
│    ↓                                         │
│ 5. If hooks fail → Ask AI to fix             │
│    ↓                                         │
│ 6. Repeat until clean                        │
└──────────────────────────────────────────────┘
```

### Example: AI + GWI Code Generation

```
Prompt:
───────
Create a REST endpoint for /api/users/:id/preferences

Requirements:
- GET: Return user preferences
- PUT: Update preferences (partial update)
- Follow patterns in src/routes/users.ts
- Include Zod validation
- Add tests

After you generate:
- I'll run `gwi review --local` to check
- Fix any issues it flags
```

### Handling Hook Failures

When GWI hooks reject your commit:

```bash
# Hook fails with lint errors
$ git commit -m "feat: add preferences endpoint"
❌ ESLint errors found

# Ask AI to fix
"These ESLint errors occurred: [paste errors]
Fix them while maintaining the functionality."

# Retry
$ git commit -m "feat: add preferences endpoint"
✓ All hooks passed
```

---

## Phase 3: Review with AI + GWI

### Pre-Review Self-Check

Before requesting review, run:

```bash
# Local AI-powered review
gwi review --local --ai

# Output:
# ✓ Code style: OK
# ✓ Test coverage: 85%
# ⚠ Complexity: Method X is 45 lines (consider splitting)
# ⚠ Security: Input validation missing on line 23
```

### AI-Assisted Self-Review

```
Prompt:
───────
Review my changes before I create a PR:

[paste diff or describe changes]

Check for:
1. Logic errors
2. Missing error handling
3. Security issues
4. Performance concerns
5. Missing tests

Be critical - I want to fix issues before review.
```

### GWI Full Review

```bash
# Full PR review
gwi review https://github.com/org/repo/pull/456

# If issues found, ask AI to help fix:
"GWI review found these issues:
[paste issues]

Provide fixes for each."
```

---

## Phase 4: Ship with GWI

### Pre-Merge Gate

```bash
# Final approval gate
gwi gate

# Validates:
# - All tests pass
# - No security issues
# - Complexity acceptable
# - Proper approvals
```

### Autopilot Mode

For trusted changes:

```bash
# Full automation with approval
gwi autopilot https://github.com/org/repo/pull/456

# GWI will:
# 1. Run full review
# 2. Request approval if needed
# 3. Merge when approved
# 4. Monitor for issues
```

---

## IDE-Specific Integration

### VS Code

```json
// .vscode/settings.json
{
  "gwi.enabled": true,
  "gwi.autoReview": true,
  "gwi.reviewOnSave": false,
  "gwi.complexityWarningThreshold": 7,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### JetBrains (IntelliJ, WebStorm)

```xml
<!-- .idea/gwi.xml -->
<component name="GWISettings">
  <option name="enabled" value="true" />
  <option name="autoReview" value="true" />
  <option name="complexityThreshold" value="7" />
</component>
```

### Neovim

```lua
-- lua/plugins/gwi.lua
return {
  "gwi/gwi.nvim",
  config = function()
    require("gwi").setup({
      auto_review = true,
      complexity_threshold = 7,
      keymaps = {
        review = "<leader>gr",
        triage = "<leader>gt",
      },
    })
  end,
}
```

### Cursor / Windsurf

These AI-native IDEs work with GWI via CLI:

```bash
# Add to your workflow
alias code-review="gwi review --local --ai"
alias pre-commit="gwi gate --check-only"
```

---

## Prompt Packs for GWI Workflows

### Review Checklist Prompt

```
Before I submit this PR, review against this checklist:

Code Quality:
- [ ] No TODO comments without issue links
- [ ] No console.log/print statements
- [ ] Error handling is comprehensive
- [ ] Types are properly defined

Testing:
- [ ] Unit tests for new functions
- [ ] Edge cases covered
- [ ] Mocks are appropriate

Security:
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] SQL injection prevention
- [ ] XSS prevention

Performance:
- [ ] No N+1 queries
- [ ] Appropriate caching
- [ ] No blocking operations in async code

Changes: [paste diff]
```

### Commit Message Prompt

```
Generate a conventional commit message for these changes:

[paste diff or description]

Format:
<type>(<scope>): <subject>

<body>

<footer>

Types: feat, fix, docs, style, refactor, test, chore
Scope: Component or area affected
Subject: Imperative, present tense, no period
Body: What and why (not how)
Footer: Breaking changes, issue references
```

### PR Description Prompt

```
Generate a PR description for these changes:

Title: [brief title]

Changes:
[paste diff or list changes]

Template:
## Summary
[2-3 sentences on what this PR does]

## Changes
- [Bullet points of key changes]

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing performed
- [ ] Edge cases covered

## Screenshots (if UI changes)
[placeholder]

## Related Issues
Closes #[issue number]
```

---

## Telemetry & Measurement

### Enable GWI Telemetry

```bash
# Enable usage tracking
gwi config set telemetry.enabled true
gwi config set telemetry.anonymous true

# View your stats
gwi metrics --personal

# Team stats (if admin)
gwi metrics --team
```

### Metrics Tracked

| Metric | Description |
|--------|-------------|
| `reviews_requested` | GWI reviews initiated |
| `issues_found` | Problems detected |
| `issues_fixed` | AI-assisted fixes |
| `time_saved` | Estimated time savings |
| `complexity_reduced` | Refactoring impact |

### Dashboard Integration

```bash
# Export to your dashboard
gwi metrics export --format prometheus
gwi metrics export --format datadog
gwi metrics export --format json
```

---

## Best Practices

### Do's

1. **Run `gwi review --local` before pushing** - Catch issues early
2. **Use AI for boilerplate, review the logic** - Don't trust blindly
3. **Let GWI handle merge decisions** - Removes human bottleneck
4. **Track your metrics** - Measure improvement over time
5. **Iterate with AI on hook failures** - Faster fixes

### Don'ts

1. **Don't skip local review** - AI can introduce subtle bugs
2. **Don't bypass GWI gates** - They exist for a reason
3. **Don't commit AI code without tests** - Always verify
4. **Don't ignore complexity warnings** - Refactor early
5. **Don't share secrets with AI** - Even in error messages

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| GWI hooks slow | Run `gwi hooks optimize` |
| AI suggestions rejected by hooks | Ask AI to fix specific violations |
| Review taking too long | Use `--local` for quick checks |
| Complexity too high | Ask AI to split into smaller functions |
| Tests failing | Share test output with AI for diagnosis |

---

## Quick Reference

```bash
# Planning
gwi triage <issue-url>        # Get complexity score
gwi plan <issue-url>          # Generate implementation plan

# Development
gwi hooks install             # Install git hooks
gwi review --local            # Quick local review
gwi review --local --ai       # AI-powered local review

# Review
gwi review <pr-url>           # Full PR review
gwi explain <run-id>          # Explain AI decisions

# Ship
gwi gate                      # Pre-merge validation
gwi autopilot <pr-url>        # Automated merge flow

# Metrics
gwi metrics --personal        # Your stats
gwi metrics --team            # Team stats
```
