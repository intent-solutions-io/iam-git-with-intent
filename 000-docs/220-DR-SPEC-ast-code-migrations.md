# AST-Based Code Migrations Specification

> **Document**: 220-DR-SPEC-ast-code-migrations
> **Epic**: EPIC 011 - Code Migrations/Refactors (AST-based)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

AST-based code migrations enable safe, automated transformations across large codebases. This spec defines the migration framework, transformation patterns, and safety guarantees.

---

## Migration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AST MIGRATION PIPELINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │  Parse   │──▶│ Analyze  │──▶│Transform │──▶│ Validate │──▶│  Apply   │  │
│  │  Source  │   │   AST    │   │   AST    │   │  Output  │   │  Patch   │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│   TypeScript      Pattern        Codemod       Type Check     Git Commit   │
│   Parser          Matching       Rules         & Test         (atomic)     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Migration Definition

```typescript
// packages/core/src/migrations/types.ts

interface Migration {
  // Identity
  id: string;
  name: string;
  version: string;
  description: string;

  // Scope
  filePatterns: string[];
  excludePatterns?: string[];

  // Transformation
  transforms: Transform[];

  // Safety
  preChecks: PreCheck[];
  postChecks: PostCheck[];

  // Metadata
  breaking: boolean;
  reversible: boolean;
  estimatedImpact: 'low' | 'medium' | 'high';
}

interface Transform {
  type: 'rename' | 'replace' | 'delete' | 'insert' | 'wrap' | 'unwrap';
  pattern: ASTPattern;
  replacement?: ASTTemplate;
  condition?: (node: Node, context: Context) => boolean;
}

interface ASTPattern {
  nodeType: string;
  constraints?: Record<string, unknown>;
  capture?: string[];
}

interface ASTTemplate {
  template: string;
  interpolations?: Record<string, (captured: Node) => string>;
}
```

### 2. Migration Engine

```typescript
// packages/core/src/migrations/engine.ts

class MigrationEngine {
  private parser: TypeScriptParser;
  private transformer: ASTTransformer;
  private validator: MigrationValidator;

  async run(migration: Migration, options: RunOptions): Promise<MigrationResult> {
    const files = await this.findFiles(migration.filePatterns, migration.excludePatterns);

    // Pre-checks
    for (const check of migration.preChecks) {
      const result = await check.run(files);
      if (!result.passed) {
        return { success: false, reason: `Pre-check failed: ${check.name}` };
      }
    }

    // Transform each file
    const changes: FileChange[] = [];
    for (const file of files) {
      const ast = await this.parser.parse(file);
      const transformed = await this.transformer.transform(ast, migration.transforms);

      if (transformed.changed) {
        changes.push({
          file,
          original: ast,
          transformed: transformed.ast,
          diff: transformed.diff,
        });
      }
    }

    // Post-checks
    for (const check of migration.postChecks) {
      const result = await check.run(changes);
      if (!result.passed) {
        return { success: false, reason: `Post-check failed: ${check.name}` };
      }
    }

    // Apply changes if not dry run
    if (!options.dryRun) {
      await this.applyChanges(changes, options);
    }

    return {
      success: true,
      filesModified: changes.length,
      changes,
    };
  }
}
```

---

## Common Migration Patterns

### Pattern 1: Rename Symbol

```typescript
// Rename function/variable/type across codebase
const renameSymbol: Migration = {
  id: 'rename-symbol',
  name: 'Rename Symbol',
  version: '1.0.0',
  description: 'Rename a symbol across the entire codebase',
  filePatterns: ['**/*.ts', '**/*.tsx'],
  transforms: [
    {
      type: 'rename',
      pattern: {
        nodeType: 'Identifier',
        constraints: { name: 'oldName' },
      },
      replacement: {
        template: 'newName',
      },
    },
  ],
  preChecks: [typeCheckPasses],
  postChecks: [typeCheckPasses, testsPass],
  breaking: false,
  reversible: true,
  estimatedImpact: 'low',
};
```

### Pattern 2: Update Import Paths

```typescript
// Migrate imports from old path to new path
const updateImports: Migration = {
  id: 'update-imports',
  name: 'Update Import Paths',
  version: '1.0.0',
  description: 'Update import paths after package restructure',
  filePatterns: ['**/*.ts', '**/*.tsx'],
  transforms: [
    {
      type: 'replace',
      pattern: {
        nodeType: 'ImportDeclaration',
        constraints: {
          moduleSpecifier: { text: '@old/package' },
        },
      },
      replacement: {
        template: "import { $captures } from '@new/package';",
        interpolations: {
          captures: (node) => extractImportSpecifiers(node),
        },
      },
    },
  ],
  preChecks: [],
  postChecks: [typeCheckPasses],
  breaking: false,
  reversible: true,
  estimatedImpact: 'medium',
};
```

### Pattern 3: Deprecate Function

```typescript
// Add deprecation warning to function calls
const deprecateFunction: Migration = {
  id: 'deprecate-function',
  name: 'Deprecate Function',
  version: '1.0.0',
  description: 'Add deprecation notices to deprecated function usage',
  filePatterns: ['**/*.ts', '**/*.tsx'],
  transforms: [
    {
      type: 'wrap',
      pattern: {
        nodeType: 'CallExpression',
        constraints: {
          expression: { name: 'deprecatedFn' },
        },
      },
      replacement: {
        template: `(() => {
          console.warn('deprecatedFn is deprecated, use newFn instead');
          return $call;
        })()`,
        interpolations: {
          call: (node) => node.getText(),
        },
      },
    },
  ],
  preChecks: [],
  postChecks: [typeCheckPasses],
  breaking: false,
  reversible: true,
  estimatedImpact: 'low',
};
```

### Pattern 4: Upgrade API Version

```typescript
// Migrate from v1 to v2 API
const upgradeAPI: Migration = {
  id: 'upgrade-api-v2',
  name: 'Upgrade to API v2',
  version: '1.0.0',
  description: 'Migrate all v1 API calls to v2 format',
  filePatterns: ['**/*.ts'],
  transforms: [
    // Update method calls
    {
      type: 'replace',
      pattern: {
        nodeType: 'CallExpression',
        constraints: {
          expression: {
            nodeType: 'PropertyAccessExpression',
            name: { text: 'createUser' },
          },
        },
      },
      replacement: {
        template: '$obj.users.create($args)',
        interpolations: {
          obj: (node) => node.expression.expression.getText(),
          args: (node) => transformArgs(node.arguments),
        },
      },
    },
    // Update type imports
    {
      type: 'replace',
      pattern: {
        nodeType: 'ImportDeclaration',
        constraints: {
          moduleSpecifier: { text: '@api/v1' },
        },
      },
      replacement: {
        template: "import type { $types } from '@api/v2';",
      },
    },
  ],
  preChecks: [typeCheckPasses],
  postChecks: [typeCheckPasses, testsPass, e2eTestsPass],
  breaking: true,
  reversible: false,
  estimatedImpact: 'high',
};
```

### Pattern 5: Remove Dead Code

```typescript
// Remove unused exports and their dependencies
const removeDeadCode: Migration = {
  id: 'remove-dead-code',
  name: 'Remove Dead Code',
  version: '1.0.0',
  description: 'Remove exports with no usages',
  filePatterns: ['**/*.ts'],
  transforms: [
    {
      type: 'delete',
      pattern: {
        nodeType: 'ExportDeclaration',
        capture: ['declaration'],
      },
      condition: (node, context) => {
        const symbol = context.typeChecker.getSymbolAtLocation(node);
        return symbol && context.usageAnalyzer.getUsageCount(symbol) === 0;
      },
    },
  ],
  preChecks: [typeCheckPasses],
  postChecks: [typeCheckPasses, testsPass],
  breaking: false,
  reversible: false,
  estimatedImpact: 'low',
};
```

---

## Safety Checks

### Pre-Checks

```typescript
// packages/core/src/migrations/checks.ts

const typeCheckPasses: PreCheck = {
  name: 'TypeScript Type Check',
  async run(files: string[]): Promise<CheckResult> {
    const result = await exec('npx tsc --noEmit');
    return {
      passed: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Type check passed' : result.stderr,
    };
  },
};

const testsPass: PreCheck = {
  name: 'Unit Tests',
  async run(files: string[]): Promise<CheckResult> {
    const result = await exec('npm run test');
    return {
      passed: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Tests passed' : 'Tests failed',
    };
  },
};

const noUncommittedChanges: PreCheck = {
  name: 'Clean Git State',
  async run(): Promise<CheckResult> {
    const result = await exec('git status --porcelain');
    const clean = result.stdout.trim() === '';
    return {
      passed: clean,
      message: clean ? 'Working directory clean' : 'Uncommitted changes found',
    };
  },
};

const branchProtection: PreCheck = {
  name: 'Branch Protection',
  async run(): Promise<CheckResult> {
    const branch = await exec('git branch --show-current');
    const protected_branches = ['main', 'master', 'production'];
    const isProtected = protected_branches.includes(branch.stdout.trim());
    return {
      passed: !isProtected,
      message: isProtected
        ? 'Cannot migrate on protected branch'
        : 'Branch is safe for migration',
    };
  },
};
```

### Post-Checks

```typescript
const syntaxValid: PostCheck = {
  name: 'Syntax Validation',
  async run(changes: FileChange[]): Promise<CheckResult> {
    for (const change of changes) {
      try {
        ts.createSourceFile(change.file, change.transformed.getText(), ts.ScriptTarget.Latest);
      } catch (e) {
        return {
          passed: false,
          message: `Syntax error in ${change.file}: ${e.message}`,
        };
      }
    }
    return { passed: true, message: 'All files have valid syntax' };
  },
};

const noNewErrors: PostCheck = {
  name: 'No New Type Errors',
  async run(changes: FileChange[]): Promise<CheckResult> {
    // Compare error count before and after
    const beforeErrors = await getTypeErrors();
    await applyChangesTemporarily(changes);
    const afterErrors = await getTypeErrors();
    await revertChanges(changes);

    const newErrors = afterErrors.filter(
      (e) => !beforeErrors.some((b) => b.code === e.code && b.file === e.file)
    );

    return {
      passed: newErrors.length === 0,
      message:
        newErrors.length === 0
          ? 'No new type errors'
          : `${newErrors.length} new type errors introduced`,
    };
  },
};
```

---

## CLI Interface

### Migration Commands

```bash
# List available migrations
gwi migrate list

# Dry run a migration (preview changes)
gwi migrate run <migration-id> --dry-run

# Run migration with interactive approval
gwi migrate run <migration-id> --interactive

# Run migration on specific files
gwi migrate run <migration-id> --files "src/**/*.ts"

# Create new migration
gwi migrate create "Rename oldFn to newFn"

# Validate migration definition
gwi migrate validate <migration-id>

# Show migration history
gwi migrate history
```

### Interactive Mode

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ MIGRATION: upgrade-api-v2                                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Files to modify: 47                                                           ║
║ Estimated impact: HIGH                                                        ║
║ Breaking: Yes                                                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Pre-checks:                                                                   ║
║   ✓ TypeScript Type Check                                                     ║
║   ✓ Unit Tests                                                                ║
║   ✓ Clean Git State                                                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Preview (1/47):                                                               ║
║                                                                               ║
║ src/services/user.ts                                                          ║
║ ───────────────────────────────────────────────────────────────────────────  ║
║ - const user = await api.createUser({ name, email });                         ║
║ + const user = await api.users.create({ name, email });                       ║
║                                                                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ [a] Apply all  [n] Next file  [s] Skip this file  [q] Quit                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Migration Registry

### Registry Format

```yaml
# migrations/registry.yml
migrations:
  - id: rename-symbol-v1
    name: Rename Symbol
    version: 1.0.0
    path: ./migrations/rename-symbol.ts
    status: stable
    created: 2026-01-15
    author: engineering

  - id: upgrade-api-v2
    name: Upgrade to API v2
    version: 1.0.0
    path: ./migrations/upgrade-api-v2.ts
    status: stable
    created: 2026-01-20
    author: engineering
    dependencies:
      - rename-symbol-v1

  - id: remove-legacy-types
    name: Remove Legacy Types
    version: 1.0.0
    path: ./migrations/remove-legacy-types.ts
    status: experimental
    created: 2026-02-01
    author: engineering
```

### Migration History

```typescript
// Track applied migrations
interface MigrationHistory {
  id: string;
  migration_id: string;
  applied_at: Date;
  applied_by: string;
  files_modified: number;
  commit_sha: string;
  rollback_sha?: string;
  status: 'applied' | 'rolled_back' | 'failed';
}

// Store in .gwi/migrations/history.json
```

---

## Rollback Strategy

### Automatic Rollback

```typescript
async function runWithRollback(
  migration: Migration,
  options: RunOptions
): Promise<MigrationResult> {
  // Create rollback point
  const rollbackSha = await exec('git rev-parse HEAD');

  try {
    // Run migration
    const result = await engine.run(migration, options);

    if (!result.success) {
      throw new Error(result.reason);
    }

    // Commit changes
    await exec(`git add -A && git commit -m "migration: ${migration.name}"`);

    return result;
  } catch (error) {
    // Automatic rollback
    await exec(`git reset --hard ${rollbackSha}`);

    return {
      success: false,
      reason: `Migration failed and rolled back: ${error.message}`,
      rollbackSha,
    };
  }
}
```

### Manual Rollback

```bash
# Rollback last migration
gwi migrate rollback

# Rollback specific migration
gwi migrate rollback <migration-id>

# Rollback to specific commit
gwi migrate rollback --to <commit-sha>
```

---

## Integration with GWI Agents

### Migration via Coder Agent

```typescript
// Agent can suggest and apply migrations
interface MigrationSuggestion {
  migration_id: string;
  reason: string;
  confidence: number;
  affected_files: string[];
  estimated_impact: string;
}

async function suggestMigrations(codebase: Codebase): Promise<MigrationSuggestion[]> {
  // Analyze codebase for migration opportunities
  const suggestions: MigrationSuggestion[] = [];

  // Check for deprecated patterns
  const deprecatedUsages = await findDeprecatedUsages(codebase);
  if (deprecatedUsages.length > 0) {
    suggestions.push({
      migration_id: 'remove-deprecated',
      reason: `Found ${deprecatedUsages.length} deprecated API usages`,
      confidence: 0.9,
      affected_files: deprecatedUsages.map((u) => u.file),
      estimated_impact: 'medium',
    });
  }

  // Check for unused exports
  const unusedExports = await findUnusedExports(codebase);
  if (unusedExports.length > 0) {
    suggestions.push({
      migration_id: 'remove-dead-code',
      reason: `Found ${unusedExports.length} unused exports`,
      confidence: 0.95,
      affected_files: unusedExports.map((u) => u.file),
      estimated_impact: 'low',
    });
  }

  return suggestions;
}
```

---

## Performance Optimization

### Parallel Processing

```typescript
async function runParallel(
  migration: Migration,
  files: string[],
  concurrency: number = 4
): Promise<FileChange[]> {
  const queue = [...files];
  const results: FileChange[] = [];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const file = queue.shift();
          if (file) {
            const change = await processFile(migration, file);
            if (change) {
              results.push(change);
            }
          }
        }
      })()
    );
  }

  await Promise.all(workers);
  return results;
}
```

### Incremental Processing

```typescript
// Only process files changed since last run
async function runIncremental(
  migration: Migration,
  since: string
): Promise<MigrationResult> {
  const changedFiles = await exec(`git diff --name-only ${since}`);
  const filteredFiles = changedFiles
    .split('\n')
    .filter((f) => migration.filePatterns.some((p) => minimatch(f, p)));

  return engine.run(migration, { files: filteredFiles });
}
```

---

## Related Documentation

- [221-DR-TMPL-migration-template.md](./221-DR-TMPL-migration-template.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
