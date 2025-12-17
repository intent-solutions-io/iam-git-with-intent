/**
 * ARV: Connector Supply Chain Gate
 *
 * Phase 6: Validates all installed connectors in the local registry.
 *
 * Checks:
 * - Manifest schema validation
 * - Checksum verification
 * - Conformance tests
 * - Forbidden patterns (no filesystem access outside allowed paths)
 *
 * @module arv/connector-supply-chain
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

// Types (inline to avoid import issues in script)
interface ManifestTool {
  name: string;
  description?: string;
  policyClass: 'READ' | 'WRITE_NON_DESTRUCTIVE' | 'DESTRUCTIVE';
}

interface ConnectorManifest {
  manifestVersion: string;
  id: string;
  version: string;
  displayName: string;
  description?: string;
  author: string;
  license: string;
  entrypoint: string;
  tools: ManifestTool[];
  capabilities: string[];
  checksum: string;
  minCoreVersion?: string;
  repository?: string;
  homepage?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
}

interface ValidationResult {
  id: string;
  version: string;
  path: string;
  manifestValid: boolean;
  manifestErrors: string[];
  checksumValid: boolean;
  checksumError?: string;
  conformanceValid: boolean;
  conformanceErrors: string[];
  forbiddenPatterns: string[];
  passed: boolean;
}

interface SupplyChainReport {
  timestamp: string;
  registryPath: string;
  totalConnectors: number;
  passed: number;
  failed: number;
  results: ValidationResult[];
}

// =============================================================================
// Manifest Validation
// =============================================================================

function validateManifest(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const manifest = data as Record<string, unknown>;

  // Required fields
  if (manifest.manifestVersion !== '1.0') {
    errors.push('manifestVersion must be "1.0"');
  }

  if (typeof manifest.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
    errors.push('id must be lowercase alphanumeric with hyphens');
  }

  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('version must be semver');
  }

  if (typeof manifest.displayName !== 'string' || manifest.displayName.length === 0) {
    errors.push('displayName is required');
  }

  if (typeof manifest.author !== 'string' || manifest.author.length === 0) {
    errors.push('author is required');
  }

  if (typeof manifest.license !== 'string' || manifest.license.length === 0) {
    errors.push('license is required');
  }

  if (typeof manifest.entrypoint !== 'string' || !/\.(js|mjs|cjs)$/.test(manifest.entrypoint)) {
    errors.push('entrypoint must be a .js/.mjs/.cjs file');
  }

  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    errors.push('tools must be a non-empty array');
  }

  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    errors.push('capabilities must be a non-empty array');
  }

  if (typeof manifest.checksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(manifest.checksum)) {
    errors.push('checksum must be sha256:hexstring');
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Checksum Verification
// =============================================================================

async function verifyChecksum(
  connectorPath: string,
  manifest: ConnectorManifest
): Promise<{ valid: boolean; error?: string }> {
  const entrypointPath = join(connectorPath, manifest.entrypoint);

  if (!existsSync(entrypointPath)) {
    return { valid: false, error: `Entrypoint not found: ${manifest.entrypoint}` };
  }

  try {
    const content = await readFile(entrypointPath);
    const hash = createHash('sha256').update(content).digest('hex');
    const computed = `sha256:${hash}`;

    if (computed !== manifest.checksum) {
      return {
        valid: false,
        error: `Checksum mismatch: expected ${manifest.checksum}, got ${computed}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Failed to read entrypoint: ${error}` };
  }
}

// =============================================================================
// Forbidden Pattern Detection
// =============================================================================

const FORBIDDEN_PATTERNS = [
  // Filesystem access outside allowed paths
  { pattern: /require\s*\(\s*['"]fs['"]\s*\)/, message: 'Direct fs require (use allowed APIs)' },
  { pattern: /from\s+['"]fs['"]/, message: 'Direct fs import (use allowed APIs)' },
  { pattern: /process\.env\.HOME/, message: 'Access to HOME directory' },
  { pattern: /process\.cwd\(\)/, message: 'Access to current working directory (use relative paths)' },
  { pattern: /child_process/, message: 'Child process execution' },
  { pattern: /eval\s*\(/, message: 'eval() usage' },
  { pattern: /Function\s*\(/, message: 'Dynamic Function creation' },
  { pattern: /\.\.\/\.\.\/\.\.\//, message: 'Path traversal attempt' },
  { pattern: /\/etc\//, message: 'System config access' },
  { pattern: /\/root\//, message: 'Root directory access' },
];

async function detectForbiddenPatterns(entrypointPath: string): Promise<string[]> {
  const violations: string[] = [];

  try {
    const content = await readFile(entrypointPath, 'utf-8');

    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(message);
      }
    }
  } catch {
    violations.push('Failed to read entrypoint for pattern analysis');
  }

  return violations;
}

// =============================================================================
// Conformance Check (simplified)
// =============================================================================

function checkConformance(manifest: ConnectorManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check each tool has required fields
  for (const tool of manifest.tools) {
    if (!tool.name) {
      errors.push('Tool missing name');
    }
    if (!['READ', 'WRITE_NON_DESTRUCTIVE', 'DESTRUCTIVE'].includes(tool.policyClass)) {
      errors.push(`Tool ${tool.name} has invalid policyClass: ${tool.policyClass}`);
    }
  }

  // Check for duplicate tool names
  const toolNames = manifest.tools.map(t => t.name);
  const duplicates = toolNames.filter((name, i) => toolNames.indexOf(name) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate tool names: ${duplicates.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Registry Scan
// =============================================================================

async function scanRegistry(registryPath: string): Promise<SupplyChainReport> {
  const report: SupplyChainReport = {
    timestamp: new Date().toISOString(),
    registryPath: resolve(registryPath),
    totalConnectors: 0,
    passed: 0,
    failed: 0,
    results: [],
  };

  if (!existsSync(registryPath)) {
    return report;
  }

  const entries = await readdir(registryPath);

  for (const entry of entries) {
    const entryPath = join(registryPath, entry);
    const stats = await stat(entryPath);

    if (!stats.isDirectory()) continue;

    // Parse directory name: id@version
    const match = entry.match(/^([a-z][a-z0-9-]*)@(\d+\.\d+\.\d+.*)$/);
    if (!match) continue;

    const [, id, version] = match;
    const manifestPath = join(entryPath, 'connector.manifest.json');

    const result: ValidationResult = {
      id,
      version,
      path: entryPath,
      manifestValid: false,
      manifestErrors: [],
      checksumValid: false,
      conformanceValid: false,
      conformanceErrors: [],
      forbiddenPatterns: [],
      passed: false,
    };

    report.totalConnectors++;

    // Check manifest
    if (!existsSync(manifestPath)) {
      result.manifestErrors.push('Missing connector.manifest.json');
      report.results.push(result);
      report.failed++;
      continue;
    }

    let manifest: ConnectorManifest;
    try {
      const manifestJson = await readFile(manifestPath, 'utf-8');
      const data = JSON.parse(manifestJson);
      const validation = validateManifest(data);

      if (!validation.valid) {
        result.manifestErrors = validation.errors;
        report.results.push(result);
        report.failed++;
        continue;
      }

      manifest = data as ConnectorManifest;
      result.manifestValid = true;
    } catch (error) {
      result.manifestErrors.push(`Failed to parse manifest: ${error}`);
      report.results.push(result);
      report.failed++;
      continue;
    }

    // Check checksum
    const checksumResult = await verifyChecksum(entryPath, manifest);
    result.checksumValid = checksumResult.valid;
    if (!checksumResult.valid) {
      result.checksumError = checksumResult.error;
    }

    // Check conformance
    const conformanceResult = checkConformance(manifest);
    result.conformanceValid = conformanceResult.valid;
    result.conformanceErrors = conformanceResult.errors;

    // Check forbidden patterns
    const entrypointPath = join(entryPath, manifest.entrypoint);
    if (existsSync(entrypointPath)) {
      result.forbiddenPatterns = await detectForbiddenPatterns(entrypointPath);
    }

    // Overall pass/fail
    result.passed =
      result.manifestValid &&
      result.checksumValid &&
      result.conformanceValid &&
      result.forbiddenPatterns.length === 0;

    if (result.passed) {
      report.passed++;
    } else {
      report.failed++;
    }

    report.results.push(result);
  }

  return report;
}

// =============================================================================
// Main
// =============================================================================

export async function runConnectorSupplyChainGate(
  registryPath: string = 'connectors'
): Promise<{ passed: boolean; report: SupplyChainReport }> {
  const report = await scanRegistry(registryPath);
  return {
    passed: report.failed === 0,
    report,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const registryPath = process.argv[2] || 'connectors';

  console.log('🔍 Connector Supply Chain Gate');
  console.log('─'.repeat(60));

  runConnectorSupplyChainGate(registryPath).then(({ passed, report }) => {
    console.log(`\nRegistry: ${report.registryPath}`);
    console.log(`Connectors: ${report.totalConnectors}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);

    if (report.results.length > 0) {
      console.log('\nResults:');
      for (const result of report.results) {
        const status = result.passed ? '✅' : '❌';
        console.log(`  ${status} ${result.id}@${result.version}`);

        if (!result.manifestValid) {
          console.log(`     Manifest: ${result.manifestErrors.join(', ')}`);
        }
        if (!result.checksumValid) {
          console.log(`     Checksum: ${result.checksumError}`);
        }
        if (!result.conformanceValid) {
          console.log(`     Conformance: ${result.conformanceErrors.join(', ')}`);
        }
        if (result.forbiddenPatterns.length > 0) {
          console.log(`     Forbidden: ${result.forbiddenPatterns.join(', ')}`);
        }
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(passed ? '✅ PASSED' : '❌ FAILED');

    process.exit(passed ? 0 : 1);
  });
}
