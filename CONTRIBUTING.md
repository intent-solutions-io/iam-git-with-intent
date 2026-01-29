# Contributing to Git With Intent

## Quick Start

```bash
npm install                # Install dependencies
npm run build              # Build all packages
npm run test               # Run all tests
npm run typecheck          # Type check
npm run arv                # Pre-commit validation (required)
```

## Development

### Single Package

```bash
npx turbo run test --filter=@gwi/core
npx turbo run build --filter=@gwi/agents
npx vitest run path/to/test.test.ts
```

### Run CLI Locally

```bash
node apps/cli/dist/index.js --help
```

## PR Rules

- All changes via PR (no direct pushes to `main`)
- CI must pass: build, typecheck, ARV
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Keep PRs focused and small

## Security Issues

See [SECURITY.md](SECURITY.md) — do not file public issues for vulnerabilities.

## Questions

Use [GitHub Discussions](https://github.com/intent-solutions-io/iam-git-with-intent/discussions) for Q&A.
