#!/usr/bin/env npx tsx
/**
 * Forbidden Patterns Check
 *
 * Scans codebase for deprecated or disallowed patterns.
 * Fails if any forbidden pattern is detected.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

interface ForbiddenPattern {
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  // Deprecated ADK patterns
  {
    pattern: /google\.adk\.serving\.fastapi/gi,
    message: 'Deprecated ADK FastAPI serving pattern',
    severity: 'error',
  },
  {
    pattern: /from\s+google\.adk\.serving\s+import/gi,
    message: 'Deprecated ADK serving import',
    severity: 'error',
  },
  {
    pattern: /FastAPIServer/g,
    message: 'Deprecated FastAPIServer class',
    severity: 'error',
  },

  // Hardcoded model names (should use MODELS config)
  {
    pattern: /['"]claude-3-opus-\d+['"]/g,
    message: 'Hardcoded Claude model name - use MODELS config',
    severity: 'warning',
  },
  {
    pattern: /['"]claude-3-sonnet-\d+['"]/g,
    message: 'Hardcoded Claude model name - use MODELS config',
    severity: 'warning',
  },
  {
    pattern: /['"]gemini-\d+\.\d+-flash['"]/g,
    message: 'Hardcoded Gemini model name - use MODELS config',
    severity: 'warning',
  },

  // Local-only state storage (should use TenantStore)
  {
    pattern: /fs\.writeFileSync\s*\(\s*['"]\.gwi\/state/g,
    message: 'Local-only state storage - use TenantStore',
    severity: 'error',
  },

  // Unstructured console logging in production code
  {
    pattern: /console\.log\s*\(\s*`[^`]*\$\{/g,
    message: 'Unstructured console.log with template - use structured logging',
    severity: 'warning',
  },
];

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const IGNORE_DIRS = ['node_modules', 'dist', '.git', 'coverage', '.turbo'];
const IGNORE_FILES = ['forbidden-patterns.ts']; // Don't check ourselves

interface Violation {
  file: string;
  line: number;
  pattern: ForbiddenPattern;
  match: string;
}

async function scanFile(filePath: string): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of FORBIDDEN_PATTERNS) {
        const matches = line.match(pattern.pattern);
        if (matches) {
          for (const match of matches) {
            violations.push({
              file: filePath,
              line: i + 1,
              pattern,
              match,
            });
          }
        }
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return violations;
}

async function scanDirectory(dir: string): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry)) continue;

      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        violations.push(...(await scanDirectory(fullPath)));
      } else if (stats.isFile()) {
        const ext = extname(entry);
        if (SCAN_EXTENSIONS.includes(ext) && !IGNORE_FILES.includes(entry)) {
          violations.push(...(await scanFile(fullPath)));
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return violations;
}

async function main(): Promise<void> {
  console.log('🔍 Scanning for forbidden patterns...\n');

  const rootDir = process.cwd();
  const violations = await scanDirectory(rootDir);

  const errors = violations.filter((v) => v.pattern.severity === 'error');
  const warnings = violations.filter((v) => v.pattern.severity === 'warning');

  // Print warnings
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:\n');
    for (const v of warnings) {
      const relativePath = v.file.replace(rootDir + '/', '');
      console.log(`  ${relativePath}:${v.line}`);
      console.log(`    ${v.pattern.message}`);
      console.log(`    Match: "${v.match}"\n`);
    }
  }

  // Print errors
  if (errors.length > 0) {
    console.log('❌ Errors:\n');
    for (const v of errors) {
      const relativePath = v.file.replace(rootDir + '/', '');
      console.log(`  ${relativePath}:${v.line}`);
      console.log(`    ${v.pattern.message}`);
      console.log(`    Match: "${v.match}"\n`);
    }
  }

  // Summary
  console.log('─'.repeat(50));
  console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Forbidden patterns check FAILED');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Forbidden patterns check passed with warnings');
  } else {
    console.log('\n✅ Forbidden patterns check PASSED');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
