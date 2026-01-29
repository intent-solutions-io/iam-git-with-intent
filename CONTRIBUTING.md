# Contributing to Git With Intent

Thank you for your interest in contributing to Git With Intent (gwi). This document outlines our development workflow and contribution guidelines.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Environment](#development-environment)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Messages](#commit-messages)

---

## Quick Start

```bash
npm install                # Install dependencies
npm run build              # Build all packages
npm run test               # Run all tests (~1700 tests)
npm run typecheck          # Type check
npm run arv                # Pre-commit validation (required)
```

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

---

## Development Environment

### Prerequisites

- Node.js 20+
- npm 10+
- Git 2.40+
- GitHub CLI (`gh`) recommended

### Required API Keys

For full functionality, you'll need:

```bash
# At least one AI provider
export ANTHROPIC_API_KEY="your-key"
export GOOGLE_AI_API_KEY="your-key"

# GitHub access
export GITHUB_TOKEN="your-token"
```

### Monorepo Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI tool (gwi command)
│   ├── api/              # REST API (Cloud Run)
│   ├── gateway/          # A2A agent coordination
│   ├── github-webhook/   # Webhook handler
│   ├── worker/           # Background jobs
│   └── web/              # Dashboard (React)
├── packages/
│   ├── core/             # Storage, billing, security
│   ├── agents/           # AI agent implementations
│   ├── engine/           # Workflow orchestration
│   ├── integrations/     # GitHub/GitLab connectors
│   └── sdk/              # TypeScript SDK
└── infra/                # OpenTofu (GCP infrastructure)
```

---

## Making Changes

### Branch Naming

Use descriptive branch names:

```
feature/add-gitlab-support
fix/resolve-conflict-edge-case
docs/update-api-reference
refactor/simplify-agent-routing
```

### Workflow

1. **Create a branch** from `main`
2. **Make changes** following our code style
3. **Write tests** for new functionality
4. **Run ARV checks** before committing
5. **Submit PR** against `main`

---

## Pull Request Process

### PR Rules

- All changes via PR (no direct pushes to `main`)
- CI must pass: build, typecheck, ARV
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Keep PRs focused and small

### Before Submitting

```bash
npm run arv         # Run all checks
npm run test        # Ensure tests pass
npm run typecheck   # Check types
npm run format      # Format code
```

### PR Requirements

- [ ] Clear description of changes
- [ ] Tests for new functionality
- [ ] Documentation updates if needed
- [ ] No type errors
- [ ] ARV checks passing
- [ ] Rebased on latest `main`

---

## Code Style

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer explicit types for function signatures
- Use Zod for runtime validation
- Avoid `any` - use `unknown` if type is truly unknown

```typescript
// Good
export function processIntent(input: IntentInput): Promise<IntentResult> {
  const validated = IntentInputSchema.parse(input);
  // ...
}

// Avoid
export function processIntent(input: any): any {
  // ...
}
```

### Naming Conventions

- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, classes
- `SCREAMING_SNAKE_CASE` for constants
- Descriptive names over abbreviations

---

## Testing

### Running Tests

```bash
npm run test                               # All tests
npx turbo run test --filter=@gwi/core      # Single package
npm run test:watch                         # Watch mode
npm run test:coverage                      # Coverage
```

### Test Guidelines

- Test behavior, not implementation
- Use descriptive test names
- One assertion per test when possible
- Mock external services (AI APIs, GitHub)

```typescript
describe('ResolverAgent', () => {
  it('should resolve simple merge conflicts', async () => {
    const result = await resolver.resolve(simpleConflict);
    expect(result.status).toBe('resolved');
  });
});
```

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code change that neither fixes nor adds
- `test`: Adding or updating tests
- `chore`: Build process, dependencies

### Scope Reference

- `cli` - CLI application
- `api` - REST API
- `agents` - AI agents
- `core` - Core package
- `engine` - Workflow engine
- `integrations` - GitHub/GitLab connectors
- `sdk` - TypeScript SDK
- `infra` - Infrastructure

### Examples

```
feat(cli): add --local flag for local review
fix(resolver): handle three-way merge edge case
docs(readme): update installation instructions
```

---

## ARV (Agent Readiness Verification)

Before every commit, run ARV:

```bash
npm run arv
```

This includes:

- `arv:lint` - No deprecated patterns
- `arv:contracts` - Schema validation
- `arv:goldens` - Deterministic outputs
- `arv:smoke` - Boot test

---

## Getting Help

- **Questions**: Use [GitHub Discussions](https://github.com/intent-solutions-io/git-with-intent/discussions)
- **Bugs**: Use the bug report template
- **Features**: Use the feature request template
- **Security**: See [SECURITY.md](SECURITY.md) - do not file public issues for vulnerabilities

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
