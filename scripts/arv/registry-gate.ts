#!/usr/bin/env npx tsx
/**
 * Registry Integration Gate - ARV Check
 *
 * Phase 21: Verifies connector registry and federation infrastructure.
 *
 * Checks:
 * 1. Registry server module builds and exports properly
 * 2. Signature signing/verification functions exist
 * 3. Federation module exists and exports
 * 4. CLI connector commands include Phase 21 features
 * 5. TypeScript compilation passes
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

interface GateResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: GateResult[] = [];

function check(name: string, fn: () => boolean | string): void {
  try {
    const result = fn();
    if (result === true) {
      results.push({ name, passed: true, message: 'OK' });
    } else if (typeof result === 'string') {
      results.push({ name, passed: false, message: result });
    } else {
      results.push({ name, passed: false, message: 'Check returned false' });
    }
  } catch (err) {
    results.push({
      name,
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// Gate Checks
// =============================================================================

console.log('🔬 Registry Integration Gate - ARV Check (Phase 21)');
console.log('─'.repeat(55));

// Check 1: Registry server exists
check('Registry server module', () => {
  const indexPath = join(rootDir, 'apps/registry/src/index.ts');
  if (!existsSync(indexPath)) {
    return `Registry server not found at ${indexPath}`;
  }

  const content = readFileSync(indexPath, 'utf-8');

  // Check for Phase 21 signature verification
  if (!content.includes('verifyEd25519Signature')) {
    return 'Registry missing Ed25519 signature verification (Phase 21)';
  }

  // Check for manifest validation
  if (!content.includes('validateManifest')) {
    return 'Registry missing manifest validation (Phase 21)';
  }

  // Check for stats endpoint
  if (!content.includes('/v1/stats')) {
    return 'Registry missing /v1/stats endpoint (Phase 21)';
  }

  console.log('  ✓ Registry server has Phase 21 enhancements');
  return true;
});

// Check 2: Signature module has signing functions
check('Ed25519 signing functions', () => {
  const sigPath = join(rootDir, 'packages/core/src/connectors/signature.ts');
  if (!existsSync(sigPath)) {
    return `Signature module not found at ${sigPath}`;
  }

  const content = readFileSync(sigPath, 'utf-8');

  const requiredFunctions = [
    'signChecksum',
    'generateKeyPair',
    'createSignedSignatureFile',
    'verifySignature',
  ];

  for (const fn of requiredFunctions) {
    if (!content.includes(`export async function ${fn}`) && !content.includes(`export function ${fn}`)) {
      return `Missing function: ${fn}`;
    }
  }

  console.log(`  ✓ Found ${requiredFunctions.length} signing functions`);
  return true;
});

// Check 3: Federation module exists
check('Federation module', () => {
  const fedPath = join(rootDir, 'packages/core/src/connectors/federation.ts');
  if (!existsSync(fedPath)) {
    return `Federation module not found at ${fedPath}`;
  }

  const content = readFileSync(fedPath, 'utf-8');

  // Check for key types and functions
  const requiredExports = [
    'FederationConfig',
    'RegistryConfig',
    'FederatedRegistryClient',
    'loadFederationConfig',
    'createFederatedRegistry',
  ];

  for (const exp of requiredExports) {
    if (!content.includes(exp)) {
      return `Missing export: ${exp}`;
    }
  }

  console.log(`  ✓ Federation module has ${requiredExports.length} required exports`);
  return true;
});

// Check 4: Connector index exports federation
check('Federation exports from @gwi/core', () => {
  const indexPath = join(rootDir, 'packages/core/src/connectors/index.ts');
  if (!existsSync(indexPath)) {
    return 'Connectors index not found';
  }

  const content = readFileSync(indexPath, 'utf-8');

  // Check for federation exports
  if (!content.includes("from './federation.js'")) {
    return 'Federation not exported from connectors index';
  }

  // Check for signing exports
  if (!content.includes('signChecksum')) {
    return 'signChecksum not exported from connectors index';
  }

  console.log('  ✓ Federation and signing functions exported from @gwi/core');
  return true;
});

// Check 5: CLI has Phase 21 commands
check('CLI Phase 21 commands', () => {
  const cliPath = join(rootDir, 'apps/cli/src/commands/connector.ts');
  if (!existsSync(cliPath)) {
    return 'CLI connector.ts not found';
  }

  const content = readFileSync(cliPath, 'utf-8');

  // Check for Phase 21 features
  if (!content.includes('connectorGenerateKeyCommand')) {
    return 'Missing generate-key command';
  }

  if (!content.includes('connectorRegistriesCommand')) {
    return 'Missing registries command';
  }

  if (!content.includes('connectorFederatedSearchCommand')) {
    return 'Missing federated-search command';
  }

  if (!content.includes('createSignedSignatureFile')) {
    return 'Publish command not using real Ed25519 signing';
  }

  console.log('  ✓ CLI has Phase 21 commands (generate-key, registries, federated-search)');
  return true;
});

// Check 6: TypeScript compilation passes
check('TypeScript compilation', () => {
  try {
    execSync('npm run typecheck 2>&1', {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 120000,
    });
    console.log('  ✓ TypeScript compilation passes');
    return true;
  } catch (error) {
    return `TypeScript errors: ${String(error).slice(0, 200)}`;
  }
});

// =============================================================================
// Summary
// =============================================================================

console.log('─'.repeat(55));

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

for (const result of results) {
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} ${result.name}`);
  if (!result.passed) {
    console.log(`   → ${result.message}`);
  }
}

console.log('─'.repeat(55));
console.log(`Total: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n❌ Registry Integration Gate FAILED');
  process.exit(1);
}

console.log('\n✅ Registry Integration Gate PASSED');
