# Git With Intent: MVP Scope

## Phase 1 - Minimum Viable Product

**Goal:** CLI that resolves merge conflicts on GitHub PRs

---

## MVP Features

### Core Functionality

1. **CLI Command: `gwi resolve <pr-url>`**
   - Takes a GitHub PR URL
   - Authenticates with GitHub
   - Fetches PR details and conflict information
   - Runs triage → resolution → review pipeline
   - Outputs resolution or escalates to human

2. **Triage Agent**
   - Classify conflict complexity (1-10)
   - Decide: auto-resolve | agent-resolve | human-required
   - Heuristics + LLM for MVP

3. **Resolver Agent**
   - Handle merge conflicts in single files
   - Support common patterns:
     - Import ordering conflicts
     - Formatting conflicts
     - Simple addition conflicts
   - Generate explanation for resolution

4. **Reviewer Agent**
   - Syntax validation
   - Code loss detection
   - Basic sanity checks

---

## Out of Scope for MVP

- GitLab / Bitbucket support
- VS Code extension
- Web dashboard
- Issue → PR workflow
- Test generation
- Doc generation
- Multi-repo support
- Team features / billing

---

## Success Criteria

### Functional
- [ ] 80%+ resolution on simple conflicts (complexity ≤ 3)
- [ ] 60%+ resolution on medium conflicts (complexity 4-6)
- [ ] 90%+ correct escalation on complex conflicts

### Performance
- [ ] Triage < 5 seconds
- [ ] Simple resolution < 30 seconds
- [ ] Medium resolution < 2 minutes

### Quality
- [ ] Zero silent code loss
- [ ] Zero syntax errors
- [ ] Clear explanations

---

## MVP User Flow

```
$ gwi resolve https://github.com/myorg/myrepo/pull/123

🔍 Fetching PR #123...
   - 3 files with conflicts
   - Base: main, Head: feature/auth

🧠 Analyzing conflicts...
   - src/auth.ts: Medium complexity (5/10)
   - src/utils.ts: Low complexity (2/10)
   - package.json: Low complexity (1/10)

⚙️  Resolving conflicts...
   ✓ package.json resolved
   ✓ src/utils.ts resolved
   ⏳ src/auth.ts resolving...
   ✓ src/auth.ts resolved

🔎 Reviewing resolutions...
   ✓ All files pass syntax check
   ✓ No code loss detected

📋 Resolution Summary:
   - 3/3 conflicts resolved
   - Confidence: 94%

🚀 Next steps:
   1. Review: gwi diff 123
   2. Apply: gwi apply 123
   3. Reject: gwi reject 123
```

---

## Dependencies

```json
{
  "agentfs-sdk": "^0.1.0",
  "@anthropic-ai/sdk": "^0.30.0",
  "@google/generative-ai": "^0.21.0",
  "octokit": "^4.0.0",
  "commander": "^12.0.0",
  "chalk": "^5.0.0",
  "ora": "^8.0.0"
}
```
