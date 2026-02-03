#!/usr/bin/env npx tsx
/**
 * ARV: Architectural Drift Detection Gate
 *
 * EPIC 024.6: Implements check_nodrift.sh pattern from Bob's Brain.
 *
 * Detects architectural violations that would cause drift from
 * established patterns. Based on Hard Mode Rules (R1-R8):
 *
 * R1: No LangChain/CrewAI mixing (ADK/native only)
 * R2: Managed Runtime patterns (Vertex Agent Engine compatible)
 * R3: Gateway Separation (Cloud Run = REST proxies only)
 * R4: CI-Only Deployments (no direct gcloud deploy)
 * R5: Dual Memory patterns (Session + Storage interfaces)
 * R6: Single Docs Folder (000-docs with NNN-CC-ABCD naming)
 * R7: SPIFFE Identity patterns (agent IDs)
 * R8: This gate - CI blocks violations
 *
 * @module arv/drift-gate
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

// =============================================================================
// Types
// =============================================================================

interface DriftViolation {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  line?: number;
  message: string;
  match?: string;
}

interface DriftReport {
  timestamp: string;
  totalChecks: number;
  violations: DriftViolation[];
  errors: number;
  warnings: number;
}

// =============================================================================
// Configuration
// =============================================================================

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.yaml', '.yml', '.md'];
const IGNORE_DIRS = ['node_modules', 'dist', '.git', 'coverage', '.turbo', '.next'];
const IGNORE_FILES = ['drift-gate.ts']; // Don't check ourselves

// =============================================================================
// R1: No LangChain/CrewAI mixing
// =============================================================================

const FORBIDDEN_FRAMEWORKS = [
  { pattern: /from\s+langchain/gi, name: 'LangChain' },
  { pattern: /import\s+.*\s+from\s+['"]langchain/gi, name: 'LangChain' },
  { pattern: /from\s+crewai/gi, name: 'CrewAI' },
  { pattern: /import\s+.*\s+from\s+['"]crewai/gi, name: 'CrewAI' },
  { pattern: /require\(['"]langchain/gi, name: 'LangChain' },
  { pattern: /require\(['"]crewai/gi, name: 'CrewAI' },
  { pattern: /"langchain":\s*"/g, name: 'LangChain (package.json)' },
  { pattern: /"crewai":\s*"/g, name: 'CrewAI (package.json)' },
];

async function checkR1(filePath: string, content: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const framework of FORBIDDEN_FRAMEWORKS) {
      if (framework.pattern.test(line)) {
        violations.push({
          rule: 'R1',
          severity: 'error',
          file: filePath,
          line: i + 1,
          message: `Forbidden framework: ${framework.name}. GWI uses native Claude/Gemini APIs only.`,
          match: line.trim(),
        });
      }
      // Reset regex lastIndex
      framework.pattern.lastIndex = 0;
    }
  }

  return violations;
}

// =============================================================================
// R3: Gateway Separation
// =============================================================================

async function checkR3(filePath: string, content: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];
  const lines = content.split('\n');

  // Check if this is a gateway/api app
  const isGateway = filePath.includes('apps/gateway') || filePath.includes('apps/api');

  if (isGateway) {
    // Gateway should NOT have direct LLM calls
    const llmPatterns = [
      /new\s+Anthropic\s*\(/g,
      /new\s+GoogleGenerativeAI\s*\(/g,
      /anthropic\.messages\.create/g,
      /\.generateContent\s*\(/g,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of llmPatterns) {
        if (pattern.test(line)) {
          violations.push({
            rule: 'R3',
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: 'Gateway should not make direct LLM calls. Route to worker/engine instead.',
            match: line.trim(),
          });
        }
        pattern.lastIndex = 0;
      }
    }
  }

  return violations;
}

// =============================================================================
// R4: CI-Only Deployments
// =============================================================================

async function checkR4(filePath: string, content: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];
  const lines = content.split('\n');

  // Check for direct deploy commands in scripts (not in CI)
  const isScript = filePath.includes('/scripts/') && !filePath.includes('.github');
  const isCIWorkflow = filePath.includes('.github/workflows');

  if (isScript || basename(filePath) === 'package.json') {
    const directDeployPatterns = [
      { pattern: /gcloud\s+run\s+deploy/g, cmd: 'gcloud run deploy' },
      { pattern: /gcloud\s+app\s+deploy/g, cmd: 'gcloud app deploy' },
      { pattern: /gcloud\s+functions\s+deploy/g, cmd: 'gcloud functions deploy' },
      { pattern: /firebase\s+deploy/g, cmd: 'firebase deploy' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, cmd } of directDeployPatterns) {
        if (pattern.test(line)) {
          violations.push({
            rule: 'R4',
            severity: 'warning',
            file: filePath,
            line: i + 1,
            message: `Direct deploy command '${cmd}' found. All deploys should go through GitHub Actions + OpenTofu.`,
            match: line.trim(),
          });
        }
        pattern.lastIndex = 0;
      }
    }
  }

  return violations;
}

// =============================================================================
// R5: Storage Interface Compliance
// =============================================================================

async function checkR5(filePath: string, content: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];
  const lines = content.split('\n');

  // Skip test files and the storage implementation itself
  if (filePath.includes('.test.') || filePath.includes('/storage/')) {
    return violations;
  }

  // Check for direct Firestore/SQLite usage outside storage package
  const isStoragePackage = filePath.includes('packages/core/src/storage');
  const isConnectorsPackage = filePath.includes('packages/connectors');

  if (!isStoragePackage && !isConnectorsPackage) {
    const directStoragePatterns = [
      { pattern: /new\s+Firestore\s*\(/g, storage: 'Firestore' },
      { pattern: /admin\.firestore\s*\(\)/g, storage: 'Firestore' },
      { pattern: /getFirestore\s*\(/g, storage: 'Firestore' },
      { pattern: /new\s+Database\s*\([^)]*\.sqlite/gi, storage: 'SQLite' },
      { pattern: /better-sqlite3/g, storage: 'SQLite' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, storage } of directStoragePatterns) {
        if (pattern.test(line)) {
          violations.push({
            rule: 'R5',
            severity: 'warning',
            file: filePath,
            line: i + 1,
            message: `Direct ${storage} usage. Use Storage interfaces from @gwi/core instead.`,
            match: line.trim(),
          });
        }
        pattern.lastIndex = 0;
      }
    }
  }

  return violations;
}

// =============================================================================
// R6: Documentation Naming Convention
// =============================================================================

async function checkR6DocsNaming(): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];
  const docsDir = join(process.cwd(), '000-docs');

  try {
    const entries = await readdir(docsDir);

    // Valid patterns:
    // NNN-CC-ABCD-description.ext (project docs)
    // 6767-X-CC-ABCD-description.ext (canonical standards)
    // 000-INDEX.md (index file)
    const projectDocPattern = /^\d{3}-[A-Z]{2}-[A-Z]{4}-[\w-]+\.\w+$/;
    const canonicalPattern = /^6767-[a-z]-[A-Z]{2}-[A-Z]{4}-[\w-]+\.\w+$/;
    const indexPattern = /^000-INDEX\.md$/;

    for (const entry of entries) {
      const stats = await stat(join(docsDir, entry));

      if (stats.isDirectory()) {
        violations.push({
          rule: 'R6',
          severity: 'error',
          file: `000-docs/${entry}`,
          message: '000-docs must be flat (no subdirectories). Move contents to root of 000-docs.',
        });
      } else if (stats.isFile()) {
        const isValid =
          projectDocPattern.test(entry) ||
          canonicalPattern.test(entry) ||
          indexPattern.test(entry) ||
          entry.startsWith('.'); // Hidden files OK

        if (!isValid) {
          violations.push({
            rule: 'R6',
            severity: 'warning',
            file: `000-docs/${entry}`,
            message: `Document naming violation. Expected: NNN-CC-ABCD-description.ext or 6767-X-CC-ABCD-description.ext`,
          });
        }
      }
    }
  } catch {
    // 000-docs doesn't exist - that's a violation
    violations.push({
      rule: 'R6',
      severity: 'warning',
      file: '000-docs/',
      message: '000-docs directory not found. Create it for project documentation.',
    });
  }

  return violations;
}

// =============================================================================
// R7: SPIFFE Identity Pattern
// =============================================================================

async function checkR7(filePath: string, content: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];

  // Check agent files for SPIFFE ID patterns
  if (filePath.includes('packages/agents') && filePath.endsWith('.ts')) {
    const hasSpiffeId = /spiffe:\/\/intent\.solutions\/agent\//i.test(content);
    const isAgentImpl =
      /class\s+\w+Agent\s+extends\s+BaseAgent/i.test(content) ||
      /implements\s+.*Agent/i.test(content);

    if (isAgentImpl && !hasSpiffeId) {
      violations.push({
        rule: 'R7',
        severity: 'warning',
        file: filePath,
        message: 'Agent implementation should have SPIFFE ID for identity. Add spiffe://intent.solutions/agent/<name>',
      });
    }
  }

  return violations;
}

// =============================================================================
// Package Dependency Checks
// =============================================================================

async function checkPackageDependencies(): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];

  // Check root package.json
  try {
    const pkgContent = await readFile(join(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Forbidden dependencies
    const forbidden = ['langchain', 'crewai', 'autogen', 'semantic-kernel'];
    for (const dep of forbidden) {
      if (allDeps[dep]) {
        violations.push({
          rule: 'R1',
          severity: 'error',
          file: 'package.json',
          message: `Forbidden dependency: ${dep}. GWI uses native Claude/Gemini APIs only.`,
        });
      }
    }

    // Check for peer dependency misalignments in workspace packages
    const workspacePackages = await readdir(join(process.cwd(), 'packages')).catch(() => []);
    for (const pkgName of workspacePackages) {
      try {
        const subPkgPath = join(process.cwd(), 'packages', pkgName, 'package.json');
        const subPkgContent = await readFile(subPkgPath, 'utf-8');
        const subPkg = JSON.parse(subPkgContent);

        // Check for workspace protocol violations
        const deps = { ...subPkg.dependencies, ...subPkg.devDependencies };
        for (const [depName, version] of Object.entries(deps)) {
          if (depName.startsWith('@gwi/') && typeof version === 'string') {
            if (!version.startsWith('workspace:')) {
              violations.push({
                rule: 'R5',
                severity: 'warning',
                file: `packages/${pkgName}/package.json`,
                message: `Internal dependency ${depName} should use "workspace:*" protocol.`,
              });
            }
          }
        }
      } catch {
        // Package doesn't have package.json or isn't a package
      }
    }
  } catch {
    // No package.json - not a Node project
  }

  return violations;
}

// =============================================================================
// File Scanner
// =============================================================================

async function scanFile(filePath: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');

    // Run all file-based checks
    violations.push(...(await checkR1(filePath, content)));
    violations.push(...(await checkR3(filePath, content)));
    violations.push(...(await checkR4(filePath, content)));
    violations.push(...(await checkR5(filePath, content)));
    violations.push(...(await checkR7(filePath, content)));
  } catch {
    // Skip files that can't be read
  }

  return violations;
}

async function scanDirectory(dir: string): Promise<DriftViolation[]> {
  const violations: DriftViolation[] = [];

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

// =============================================================================
// Main
// =============================================================================

async function runDriftGate(): Promise<{ passed: boolean; report: DriftReport }> {
  const violations: DriftViolation[] = [];

  // File-based checks
  const rootDir = process.cwd();
  violations.push(...(await scanDirectory(rootDir)));

  // Directory structure checks
  violations.push(...(await checkR6DocsNaming()));

  // Package dependency checks
  violations.push(...(await checkPackageDependencies()));

  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');

  const report: DriftReport = {
    timestamp: new Date().toISOString(),
    totalChecks: 8, // R1-R8
    violations,
    errors: errors.length,
    warnings: warnings.length,
  };

  return {
    passed: errors.length === 0,
    report,
  };
}

// CLI entry point
async function main(): Promise<void> {
  console.log('Architectural Drift Detection Gate');
  console.log('-'.repeat(60));
  console.log('');
  console.log('Checking Hard Mode Rules (R1-R8):');
  console.log('  R1: No LangChain/CrewAI (native APIs only)');
  console.log('  R3: Gateway separation (no direct LLM in gateway)');
  console.log('  R4: CI-only deploys (no direct gcloud deploy)');
  console.log('  R5: Storage interface compliance');
  console.log('  R6: 000-docs naming convention');
  console.log('  R7: SPIFFE identity patterns');
  console.log('');

  const { passed, report } = await runDriftGate();

  // Print warnings
  if (report.warnings > 0) {
    console.log('⚠️  Warnings:\n');
    for (const v of report.violations.filter((v) => v.severity === 'warning')) {
      const relativePath = v.file.replace(process.cwd() + '/', '');
      console.log(`  ${relativePath}${v.line ? `:${v.line}` : ''}`);
      console.log(`    [${v.rule}] ${v.message}`);
      if (v.match) {
        console.log(`    Match: "${v.match.substring(0, 80)}${v.match.length > 80 ? '...' : ''}"\n`);
      } else {
        console.log('');
      }
    }
  }

  // Print errors
  if (report.errors > 0) {
    console.log('❌ Errors:\n');
    for (const v of report.violations.filter((v) => v.severity === 'error')) {
      const relativePath = v.file.replace(process.cwd() + '/', '');
      console.log(`  ${relativePath}${v.line ? `:${v.line}` : ''}`);
      console.log(`    [${v.rule}] ${v.message}`);
      if (v.match) {
        console.log(`    Match: "${v.match.substring(0, 80)}${v.match.length > 80 ? '...' : ''}"\n`);
      } else {
        console.log('');
      }
    }
  }

  // Summary
  console.log('-'.repeat(60));
  console.log(`Errors: ${report.errors}, Warnings: ${report.warnings}`);

  if (!passed) {
    console.log('\n❌ Drift detection FAILED');
    console.log('   Fix errors before committing to prevent architectural drift.');
    process.exit(1);
  }

  if (report.warnings > 0) {
    console.log('\n⚠️  Drift detection passed with warnings');
  } else {
    console.log('\n✅ Drift detection PASSED');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export { runDriftGate };
