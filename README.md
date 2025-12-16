# Git With Intent

> AI-powered DevOps automation platform for PRs, merge conflicts, and issue-to-PR workflows.

**"Git with purpose. Ship with confidence."**

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Resolve a PR
gwi resolve https://github.com/org/repo/pull/123
```

## Architecture

Git With Intent uses a multi-agent architecture:

| Agent | Model | Purpose |
|-------|-------|---------|
| Triage | Gemini Flash | Classify complexity, route work |
| Resolver | Claude Sonnet/Opus | Resolve merge conflicts |
| Reviewer | Claude Sonnet | Quality check, security scan |

## Non-Negotiable Dependencies

- **AgentFS** - All agent state management
- **Beads** - All task tracking (NO markdown TODOs)
- **Vertex AI Agent Engine** - Agent orchestration

## Project Structure

```
git-with-intent/
├── apps/cli/          # CLI: gwi resolve <url>
├── packages/
│   ├── agents/        # Agent implementations
│   ├── core/          # AgentFS, Beads, A2A, Models
│   └── integrations/  # GitHub, GitLab
├── docs/vision/       # Architecture docs
├── .beads/            # Task tracking
└── .agentfs/          # Agent state
```

## Development

```bash
# Initialize Beads
bd init --quiet

# Check ready work
bd ready --json

# Run development
pnpm dev

# Run tests
pnpm test
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
GITHUB_TOKEN=ghp_...
```

## Documentation

- [PRD](docs/vision/PRD.md)
- [Architecture](docs/vision/architecture.md)
- [MVP Scope](docs/vision/mvp-scope.md)

## License

MIT
