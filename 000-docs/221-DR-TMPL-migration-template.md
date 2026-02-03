# Migration Template

> **Document**: 221-DR-TMPL-migration-template
> **Epic**: EPIC 011 - Code Migrations/Refactors (AST-based)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template when creating new AST-based migrations. Copy and customize for your specific migration needs.

---

## Migration Template

```typescript
// migrations/<migration-id>.ts

import { Migration, Transform, PreCheck, PostCheck } from '@gwi/core/migrations';

/**
 * Migration: <MIGRATION_NAME>
 *
 * Purpose: <Describe what this migration does>
 * Impact: <low|medium|high>
 * Breaking: <yes|no>
 *
 * Before:
 *   <code example before migration>
 *
 * After:
 *   <code example after migration>
 */
export const migration: Migration = {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: '<unique-migration-id>',
  name: '<Human Readable Name>',
  version: '1.0.0',
  description: '<Detailed description of what this migration does>',

  // ═══════════════════════════════════════════════════════════════════════════
  // SCOPE
  // ═══════════════════════════════════════════════════════════════════════════
  filePatterns: [
    '**/*.ts',
    '**/*.tsx',
    // Add specific patterns
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    // Add exclusions
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFORMS
  // ═══════════════════════════════════════════════════════════════════════════
  transforms: [
    // Transform 1: <Description>
    {
      type: 'replace', // or 'rename', 'delete', 'insert', 'wrap', 'unwrap'
      pattern: {
        nodeType: 'CallExpression',
        constraints: {
          // Add constraints to match specific nodes
        },
        capture: ['arg1', 'arg2'], // Names for captured sub-nodes
      },
      replacement: {
        template: `newFunction($arg1, $arg2)`,
        interpolations: {
          arg1: (node) => node.getText(),
          arg2: (node) => node.getText(),
        },
      },
      condition: (node, context) => {
        // Optional: additional runtime conditions
        return true;
      },
    },

    // Transform 2: <Description>
    // ... add more transforms as needed
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY CHECKS
  // ═══════════════════════════════════════════════════════════════════════════
  preChecks: [
    // Checks that must pass BEFORE migration runs
    {
      name: 'TypeScript compiles',
      run: async () => {
        const { exitCode } = await exec('npx tsc --noEmit');
        return {
          passed: exitCode === 0,
          message: exitCode === 0 ? 'Type check passed' : 'Type errors found',
        };
      },
    },
    {
      name: 'Tests pass',
      run: async () => {
        const { exitCode } = await exec('npm run test');
        return {
          passed: exitCode === 0,
          message: exitCode === 0 ? 'Tests passed' : 'Tests failing',
        };
      },
    },
    {
      name: 'Clean git state',
      run: async () => {
        const { stdout } = await exec('git status --porcelain');
        const clean = stdout.trim() === '';
        return {
          passed: clean,
          message: clean ? 'Working directory clean' : 'Uncommitted changes',
        };
      },
    },
  ],

  postChecks: [
    // Checks that must pass AFTER migration runs
    {
      name: 'No new type errors',
      run: async (changes) => {
        const { exitCode } = await exec('npx tsc --noEmit');
        return {
          passed: exitCode === 0,
          message: exitCode === 0 ? 'No new type errors' : 'Migration introduced type errors',
        };
      },
    },
    {
      name: 'Tests still pass',
      run: async (changes) => {
        const { exitCode } = await exec('npm run test');
        return {
          passed: exitCode === 0,
          message: exitCode === 0 ? 'Tests still pass' : 'Migration broke tests',
        };
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  breaking: false, // Does this migration break existing APIs?
  reversible: true, // Can this migration be automatically rolled back?
  estimatedImpact: 'medium', // 'low' | 'medium' | 'high'
};

export default migration;
```

---

## Example Migrations

### Example 1: Rename Function

```typescript
// migrations/rename-createUser-to-addUser.ts

export const migration: Migration = {
  id: 'rename-createUser-to-addUser',
  name: 'Rename createUser to addUser',
  version: '1.0.0',
  description: 'Standardize naming: rename createUser() to addUser()',

  filePatterns: ['**/*.ts', '**/*.tsx'],
  excludePatterns: ['**/node_modules/**', '**/dist/**'],

  transforms: [
    // Rename function declarations
    {
      type: 'rename',
      pattern: {
        nodeType: 'FunctionDeclaration',
        constraints: { name: { text: 'createUser' } },
      },
      replacement: { template: 'addUser' },
    },
    // Rename function calls
    {
      type: 'rename',
      pattern: {
        nodeType: 'CallExpression',
        constraints: {
          expression: { nodeType: 'Identifier', text: 'createUser' },
        },
      },
      replacement: { template: 'addUser' },
    },
  ],

  preChecks: [typeCheckPasses, testsPass],
  postChecks: [typeCheckPasses, testsPass],
  breaking: false,
  reversible: true,
  estimatedImpact: 'low',
};
```

### Example 2: Update Import Paths

```typescript
// migrations/move-utils-to-helpers.ts

export const migration: Migration = {
  id: 'move-utils-to-helpers',
  name: 'Move utils to helpers',
  version: '1.0.0',
  description: 'Migrate imports from @app/utils to @app/helpers',

  filePatterns: ['**/*.ts', '**/*.tsx'],
  excludePatterns: ['**/node_modules/**'],

  transforms: [
    {
      type: 'replace',
      pattern: {
        nodeType: 'ImportDeclaration',
        constraints: {
          moduleSpecifier: { text: '@app/utils' },
        },
        capture: ['specifiers'],
      },
      replacement: {
        template: "import { $specifiers } from '@app/helpers';",
        interpolations: {
          specifiers: (node) =>
            node.importClause?.namedBindings
              ?.elements?.map((e) => e.getText())
              .join(', ') || '',
        },
      },
    },
  ],

  preChecks: [typeCheckPasses],
  postChecks: [typeCheckPasses, testsPass],
  breaking: false,
  reversible: true,
  estimatedImpact: 'medium',
};
```

### Example 3: Add Error Handling

```typescript
// migrations/add-error-boundary.ts

export const migration: Migration = {
  id: 'add-error-boundary',
  name: 'Add Error Handling to Async Functions',
  version: '1.0.0',
  description: 'Wrap async functions with try-catch error handling',

  filePatterns: ['**/services/**/*.ts'],
  excludePatterns: ['**/*.test.ts'],

  transforms: [
    {
      type: 'wrap',
      pattern: {
        nodeType: 'FunctionDeclaration',
        constraints: {
          modifiers: { includes: 'async' },
        },
        capture: ['name', 'params', 'body'],
      },
      condition: (node) => {
        // Only wrap if no try-catch already present
        return !node.body?.statements?.some(
          (s) => s.kind === ts.SyntaxKind.TryStatement
        );
      },
      replacement: {
        template: `async function $name($params) {
  try {
    $body
  } catch (error) {
    logger.error('Error in $name', { error });
    throw error;
  }
}`,
      },
    },
  ],

  preChecks: [typeCheckPasses],
  postChecks: [typeCheckPasses, testsPass],
  breaking: false,
  reversible: true,
  estimatedImpact: 'medium',
};
```

### Example 4: Remove Deprecated API

```typescript
// migrations/remove-deprecated-fetch.ts

export const migration: Migration = {
  id: 'remove-deprecated-fetch',
  name: 'Replace deprecated fetch with httpClient',
  version: '1.0.0',
  description: 'Migrate from deprecated global fetch to httpClient service',

  filePatterns: ['**/*.ts'],
  excludePatterns: ['**/node_modules/**', '**/polyfills/**'],

  transforms: [
    // Add import if not present
    {
      type: 'insert',
      pattern: {
        nodeType: 'SourceFile',
      },
      condition: (node, context) => {
        const hasFetch = context.usageAnalyzer.hasCallTo('fetch', node);
        const hasImport = context.usageAnalyzer.hasImport('httpClient', node);
        return hasFetch && !hasImport;
      },
      replacement: {
        template: "import { httpClient } from '@app/services/http';\n",
        position: 'start',
      },
    },
    // Replace fetch calls
    {
      type: 'replace',
      pattern: {
        nodeType: 'CallExpression',
        constraints: {
          expression: { text: 'fetch' },
        },
        capture: ['url', 'options'],
      },
      replacement: {
        template: 'httpClient.request($url, $options)',
      },
    },
  ],

  preChecks: [typeCheckPasses, testsPass],
  postChecks: [typeCheckPasses, testsPass, e2eTestsPass],
  breaking: true,
  reversible: false,
  estimatedImpact: 'high',
};
```

---

## Migration Checklist

Before submitting a migration:

- [ ] Migration has unique ID
- [ ] Description clearly explains the change
- [ ] File patterns are specific enough
- [ ] Transforms handle edge cases
- [ ] Pre-checks validate preconditions
- [ ] Post-checks verify success
- [ ] Breaking flag is accurate
- [ ] Reversible flag is accurate
- [ ] Impact assessment is realistic
- [ ] Tested on sample files
- [ ] Tested with dry-run
- [ ] Tested end-to-end

---

## Testing Migrations

```bash
# Test migration syntax
gwi migrate validate my-migration

# Dry run on test fixtures
gwi migrate run my-migration --dry-run --files "test/fixtures/**/*.ts"

# Interactive preview
gwi migrate run my-migration --interactive --files "src/**/*.ts"

# Full test run (creates branch, applies, runs tests)
gwi migrate test my-migration
```

---

## Registry Entry

Add to `migrations/registry.yml`:

```yaml
migrations:
  - id: my-migration-id
    name: My Migration Name
    version: 1.0.0
    path: ./migrations/my-migration.ts
    status: experimental  # experimental | stable | deprecated
    created: 2026-02-03
    author: your-github-username
    tags:
      - refactor
      - api-change
    dependencies: []  # List migration IDs this depends on
```

---

## Common Patterns Reference

| Pattern | Node Type | Use Case |
|---------|-----------|----------|
| Function rename | `FunctionDeclaration`, `CallExpression` | Rename functions |
| Variable rename | `Identifier`, `VariableDeclaration` | Rename variables |
| Import update | `ImportDeclaration` | Change import paths |
| Type rename | `TypeReference`, `InterfaceDeclaration` | Rename types |
| Add wrapper | `FunctionDeclaration` | Add try-catch, logging |
| Remove code | `*` | Delete deprecated code |
| Add import | `SourceFile` | Add missing imports |
| Method chain | `CallExpression` | Transform method chains |

---

## Related Documentation

- [220-DR-SPEC-ast-code-migrations.md](./220-DR-SPEC-ast-code-migrations.md)
