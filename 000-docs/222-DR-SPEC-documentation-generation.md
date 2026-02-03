# Documentation Generation Specification

> **Document**: 222-DR-SPEC-documentation-generation
> **Epic**: EPIC 012 - Documentation Generation
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Automated documentation generation keeps docs in sync with code. This spec defines the generation pipeline, supported formats, and integration with GWI agents.

---

## Documentation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DOCUMENTATION GENERATION PIPELINE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │  Source  │──▶│  Parse   │──▶│ Generate │──▶│ Validate │──▶│  Output  │  │
│  │   Code   │   │ & Extract│   │   Docs   │   │  Links   │   │  Files   │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│   TypeScript      JSDoc +        Markdown       Dead Link      README.md   │
│   + Comments      Types          + OpenAPI      Check          API.md      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Documentation Types

### 1. API Reference Documentation

#### From TypeScript/JSDoc

```typescript
/**
 * Creates a new user in the system.
 *
 * @param options - User creation options
 * @param options.email - User's email address (must be unique)
 * @param options.name - User's display name
 * @param options.role - Initial role assignment
 * @returns The created user with generated ID
 * @throws {ValidationError} If email is invalid or already exists
 * @throws {QuotaExceededError} If user limit reached
 *
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: 'jane@example.com',
 *   name: 'Jane Doe',
 *   role: 'developer'
 * });
 * console.log(user.id); // 'usr_abc123'
 * ```
 *
 * @since 1.0.0
 * @see {@link updateUser} for modifying users
 * @see {@link deleteUser} for removing users
 */
export async function createUser(options: CreateUserOptions): Promise<User> {
  // ...
}
```

#### Generated Markdown

```markdown
## createUser

Creates a new user in the system.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| options.email | `string` | Yes | User's email address (must be unique) |
| options.name | `string` | Yes | User's display name |
| options.role | `Role` | No | Initial role assignment |

### Returns

`Promise<User>` - The created user with generated ID

### Throws

- `ValidationError` - If email is invalid or already exists
- `QuotaExceededError` - If user limit reached

### Example

\`\`\`typescript
const user = await createUser({
  email: 'jane@example.com',
  name: 'Jane Doe',
  role: 'developer'
});
console.log(user.id); // 'usr_abc123'
\`\`\`

### See Also

- [updateUser](#updateuser) - for modifying users
- [deleteUser](#deleteuser) - for removing users

---
```

### 2. OpenAPI/REST Documentation

```typescript
// packages/core/src/docs/openapi-generator.ts

interface OpenAPIGeneratorOptions {
  title: string;
  version: string;
  servers: { url: string; description: string }[];
  securitySchemes: Record<string, SecurityScheme>;
}

async function generateOpenAPI(
  routes: Route[],
  options: OpenAPIGeneratorOptions
): Promise<OpenAPIDocument> {
  const paths: Record<string, PathItem> = {};

  for (const route of routes) {
    const pathItem = generatePathItem(route);
    paths[route.path] = {
      ...paths[route.path],
      [route.method.toLowerCase()]: pathItem,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: options.title,
      version: options.version,
    },
    servers: options.servers,
    paths,
    components: {
      securitySchemes: options.securitySchemes,
      schemas: extractSchemas(routes),
    },
  };
}
```

### 3. Architecture Documentation

```typescript
// Generate architecture docs from code analysis
interface ArchitectureDoc {
  overview: string;
  components: ComponentDoc[];
  dataFlow: DataFlowDoc[];
  dependencies: DependencyGraph;
}

async function generateArchitectureDocs(
  codebase: Codebase
): Promise<ArchitectureDoc> {
  // Analyze package dependencies
  const dependencies = await analyzeDependencies(codebase);

  // Extract component definitions
  const components = await extractComponents(codebase);

  // Trace data flow
  const dataFlow = await traceDataFlow(codebase);

  // Generate Mermaid diagrams
  const diagrams = generateMermaidDiagrams(dependencies, dataFlow);

  return {
    overview: generateOverview(codebase),
    components: components.map(formatComponentDoc),
    dataFlow: dataFlow.map(formatDataFlowDoc),
    dependencies,
    diagrams,
  };
}
```

---

## Generation Commands

### CLI Interface

```bash
# Generate all documentation
gwi docs generate

# Generate specific types
gwi docs generate --type api
gwi docs generate --type architecture
gwi docs generate --type changelog

# Generate for specific package
gwi docs generate --package @gwi/core

# Watch mode (regenerate on change)
gwi docs generate --watch

# Validate existing docs
gwi docs validate

# Check for stale docs
gwi docs check-freshness
```

### Configuration

```yaml
# gwi.docs.yml
documentation:
  output:
    directory: ./docs
    format: markdown  # markdown | html | json

  api:
    enabled: true
    sources:
      - packages/*/src/**/*.ts
    exclude:
      - '**/*.test.ts'
      - '**/internal/**'
    template: ./templates/api.md.hbs

  architecture:
    enabled: true
    diagrams: true
    diagramFormat: mermaid

  changelog:
    enabled: true
    conventionalCommits: true
    groupBy: type  # type | scope | none

  readme:
    enabled: true
    sections:
      - overview
      - installation
      - quickstart
      - api
      - contributing

  validation:
    checkLinks: true
    checkExamples: true
    requireJsDoc: true
    minCoverage: 80
```

---

## README Generation

### Template Structure

```handlebars
{{! templates/readme.md.hbs }}

# {{package.name}}

{{package.description}}

{{#if badges}}
## Badges

{{#each badges}}
[![{{this.alt}}]({{this.url}})]({{this.link}})
{{/each}}
{{/if}}

## Installation

```bash
npm install {{package.name}}
```

## Quick Start

{{#each quickstart}}
### {{this.title}}

```{{this.language}}
{{this.code}}
```
{{/each}}

## API Reference

{{#each exports}}
### {{this.name}}

{{this.description}}

{{#if this.params}}
#### Parameters

| Name | Type | Description |
|------|------|-------------|
{{#each this.params}}
| `{{this.name}}` | `{{this.type}}` | {{this.description}} |
{{/each}}
{{/if}}

{{#if this.returns}}
#### Returns

`{{this.returns.type}}` - {{this.returns.description}}
{{/if}}

{{#if this.example}}
#### Example

```{{this.example.language}}
{{this.example.code}}
```
{{/if}}

---

{{/each}}

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

{{package.license}}
```

### Generation Script

```typescript
// packages/core/src/docs/readme-generator.ts

async function generateReadme(packagePath: string): Promise<string> {
  const pkg = await readPackageJson(packagePath);
  const exports = await extractExports(packagePath);
  const examples = await extractExamples(packagePath);

  const template = await loadTemplate('readme.md.hbs');

  return template({
    package: pkg,
    badges: generateBadges(pkg),
    quickstart: examples.filter((e) => e.quickstart),
    exports: exports.map((e) => ({
      ...e,
      params: extractParams(e),
      returns: extractReturns(e),
      example: examples.find((ex) => ex.for === e.name),
    })),
  });
}
```

---

## Changelog Generation

### From Conventional Commits

```typescript
// packages/core/src/docs/changelog-generator.ts

interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    type: string;
    title: string;
    items: {
      scope?: string;
      description: string;
      pr?: string;
      author?: string;
      breaking?: boolean;
    }[];
  }[];
}

async function generateChangelog(
  fromTag: string,
  toTag: string
): Promise<ChangelogEntry> {
  const commits = await getCommitsBetween(fromTag, toTag);
  const parsed = commits.map(parseConventionalCommit);

  const sections = [
    { type: 'feat', title: 'Features', items: [] },
    { type: 'fix', title: 'Bug Fixes', items: [] },
    { type: 'perf', title: 'Performance', items: [] },
    { type: 'docs', title: 'Documentation', items: [] },
    { type: 'refactor', title: 'Refactoring', items: [] },
    { type: 'test', title: 'Tests', items: [] },
    { type: 'chore', title: 'Chores', items: [] },
  ];

  for (const commit of parsed) {
    const section = sections.find((s) => s.type === commit.type);
    if (section) {
      section.items.push({
        scope: commit.scope,
        description: commit.description,
        pr: commit.pr,
        author: commit.author,
        breaking: commit.breaking,
      });
    }
  }

  return {
    version: toTag,
    date: new Date().toISOString().split('T')[0],
    sections: sections.filter((s) => s.items.length > 0),
  };
}
```

### Output Format

```markdown
## [1.2.0] - 2026-02-03

### Features

- **agents**: Add parallel execution support (#123) - @developer
- **cli**: Add `--watch` flag for continuous mode (#124)

### Bug Fixes

- **core**: Fix memory leak in long-running processes (#125)
- **api**: Handle edge case in authentication flow (#126)

### Breaking Changes

- **BREAKING** **api**: Remove deprecated `v1` endpoints (#127)
  - Migration: Update all API calls to use `/v2/` prefix

### Documentation

- Update installation guide for Node 20
- Add troubleshooting section

---
```

---

## Validation

### Link Checker

```typescript
// packages/core/src/docs/validators/link-checker.ts

interface LinkCheckResult {
  valid: boolean;
  broken: BrokenLink[];
  warnings: LinkWarning[];
}

async function checkLinks(docsDir: string): Promise<LinkCheckResult> {
  const files = await glob(`${docsDir}/**/*.md`);
  const broken: BrokenLink[] = [];
  const warnings: LinkWarning[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const links = extractLinks(content);

    for (const link of links) {
      if (link.type === 'internal') {
        const exists = await fileExists(resolvePath(file, link.href));
        if (!exists) {
          broken.push({ file, link: link.href, type: 'internal' });
        }
      } else if (link.type === 'external') {
        const response = await fetch(link.href, { method: 'HEAD' });
        if (!response.ok) {
          broken.push({ file, link: link.href, type: 'external', status: response.status });
        }
      } else if (link.type === 'anchor') {
        const targetFile = resolvePath(file, link.href.split('#')[0]);
        const anchor = link.href.split('#')[1];
        const hasAnchor = await checkAnchorExists(targetFile, anchor);
        if (!hasAnchor) {
          broken.push({ file, link: link.href, type: 'anchor' });
        }
      }
    }
  }

  return {
    valid: broken.length === 0,
    broken,
    warnings,
  };
}
```

### Coverage Checker

```typescript
// packages/core/src/docs/validators/coverage-checker.ts

interface CoverageResult {
  total: number;
  documented: number;
  percentage: number;
  undocumented: UndocumentedItem[];
}

async function checkDocCoverage(sourceDir: string): Promise<CoverageResult> {
  const exports = await extractPublicExports(sourceDir);
  const undocumented: UndocumentedItem[] = [];

  for (const exp of exports) {
    if (!exp.jsDoc || exp.jsDoc.trim() === '') {
      undocumented.push({
        name: exp.name,
        file: exp.file,
        line: exp.line,
        type: exp.type,
      });
    }
  }

  return {
    total: exports.length,
    documented: exports.length - undocumented.length,
    percentage: ((exports.length - undocumented.length) / exports.length) * 100,
    undocumented,
  };
}
```

### Freshness Checker

```typescript
// packages/core/src/docs/validators/freshness-checker.ts

interface FreshnessResult {
  fresh: boolean;
  stale: StaleDoc[];
}

async function checkFreshness(docsDir: string): Promise<FreshnessResult> {
  const docs = await glob(`${docsDir}/**/*.md`);
  const stale: StaleDoc[] = [];

  for (const doc of docs) {
    // Find corresponding source file
    const sourceFile = findSourceFile(doc);
    if (!sourceFile) continue;

    const docMtime = await getLastModified(doc);
    const sourceMtime = await getLastModified(sourceFile);

    if (sourceMtime > docMtime) {
      stale.push({
        doc,
        sourceFile,
        docModified: docMtime,
        sourceModified: sourceMtime,
        daysBehind: Math.floor((sourceMtime - docMtime) / (1000 * 60 * 60 * 24)),
      });
    }
  }

  return {
    fresh: stale.length === 0,
    stale,
  };
}
```

---

## CI Integration

### Documentation Workflow

```yaml
# .github/workflows/docs.yml
name: Documentation

on:
  push:
    branches: [main]
    paths:
      - 'packages/**/*.ts'
      - 'docs/**'
  pull_request:
    paths:
      - 'packages/**/*.ts'
      - 'docs/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Check Documentation Coverage
        run: |
          npx gwi docs coverage --min 80
          if [ $? -ne 0 ]; then
            echo "Documentation coverage below 80%"
            exit 1
          fi

      - name: Validate Links
        run: npx gwi docs validate --check-links

      - name: Check Freshness
        run: npx gwi docs check-freshness --warn-days 30

  generate:
    needs: validate
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Generate Documentation
        run: npx gwi docs generate --all

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/dist
```

---

## AI-Assisted Documentation

### Integration with GWI Agents

```typescript
// packages/agents/src/documentation-agent.ts

class DocumentationAgent extends BaseAgent {
  async generateDocs(
    sourceFile: string,
    options: DocGenOptions
  ): Promise<GeneratedDoc> {
    // Parse source code
    const ast = await this.parser.parse(sourceFile);

    // Extract documentation targets
    const targets = this.extractTargets(ast, options);

    // Generate documentation for each target
    const docs = await Promise.all(
      targets.map(async (target) => {
        const context = this.buildContext(target, ast);

        const prompt = `Generate comprehensive JSDoc documentation for:

${target.code}

Context:
- File: ${sourceFile}
- Type: ${target.type}
- Used by: ${context.usedBy.join(', ')}

Requirements:
- Include @param for all parameters
- Include @returns with type and description
- Include @throws for possible errors
- Include @example with working code
- Include @see for related functions`;

        const response = await this.llm.complete(prompt);
        return this.parseDocResponse(response);
      })
    );

    return this.assembleDocument(docs);
  }
}
```

### Auto-Documentation Command

```bash
# Generate JSDoc for undocumented exports
gwi docs ai-generate --target undocumented

# Improve existing documentation
gwi docs ai-improve src/services/user.ts

# Generate architecture overview
gwi docs ai-architecture --output docs/architecture.md
```

---

## Output Formats

| Format | Use Case | Tools |
|--------|----------|-------|
| Markdown | GitHub, static sites | Built-in |
| HTML | Web documentation | Docusaurus, VitePress |
| OpenAPI | API documentation | Swagger UI, Redoc |
| JSON | Programmatic access | Built-in |
| PDF | Offline documentation | Pandoc |

---

## Related Documentation

- [223-DR-TMPL-jsdoc-standards.md](./223-DR-TMPL-jsdoc-standards.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
