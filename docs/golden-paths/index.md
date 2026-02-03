# Golden Paths

Standard workflows for common tasks with GWI. Follow these paths for reliable, repeatable results.

## What Are Golden Paths?

Golden paths are the recommended ways to accomplish common tasks. They're:
- **Tested** - We use these daily
- **Safe** - Approval gating prevents accidents
- **Auditable** - Every step is logged
- **Recoverable** - If something fails, you can fix it

## Available Paths

| Path | Use When | Time |
|------|----------|------|
| [Planning to PR](./planning-to-pr.md) | You have a GitHub issue and want working code | 5-15 min |
| [PR Review](./pr-review.md) | You need to review a PR (yours or someone else's) | 2-5 min |
| [Conflict Resolution](./conflict-resolution.md) | A PR has merge conflicts | 3-10 min |
| [Release](./release.md) | You're shipping a new version | 10-20 min |
| [Incident Response](./incident-response.md) | Something went wrong in production | Varies |

## Quick Reference

```bash
# Most common commands
gwi issue-to-code <issue-url>      # Issue → PR
gwi review <pr-url>                # Review a PR
gwi review --local                 # Review local changes
gwi resolve <pr-url>               # Fix merge conflicts
gwi autopilot <pr-url>             # Full pipeline

# Check status
gwi run list                       # Recent runs
gwi run status <id>                # Run details
gwi run approve <id>               # Approve pending changes

# Debugging
gwi explain <run-id>               # Why did AI do that?
gwi diagnose <run-id>              # Troubleshoot failures
gwi doctor                         # Environment health
```

## Prerequisites

Before using any path, ensure:

1. **API Keys configured**
   ```bash
   export ANTHROPIC_API_KEY="<your-anthropic-key>"
   export GOOGLE_AI_API_KEY="<your-google-key>"
   export GITHUB_TOKEN="<your-github-token>"
   ```

2. **GWI installed and built**
   ```bash
   npm install && npm run build
   ```

3. **Health check passes**
   ```bash
   gwi doctor
   ```

## Path Structure

Each golden path document follows this structure:

1. **When to use** - Trigger conditions
2. **Prerequisites** - What you need before starting
3. **Steps** - The exact commands and actions
4. **Success criteria** - How to know it worked
5. **Common issues** - Troubleshooting
6. **Next steps** - What comes after

## Safety Model

All golden paths respect GWI's safety model:

| Operation | Approval Required |
|-----------|-------------------|
| Read/analyze code | No |
| Generate patches | No |
| Post PR comments | No |
| **Commit changes** | **Yes** |
| **Push to remote** | **Yes** |
| **Merge PR** | **Yes** |

Destructive operations require explicit `gwi run approve <id>` with hash-bound verification.

## Getting Help

```bash
gwi --help                    # All commands
gwi <command> --help          # Command-specific help
gwi doctor --verbose          # Detailed diagnostics
```

For issues: [GitHub Issues](https://github.com/intent-solutions-io/iam-git-with-intent/issues)
