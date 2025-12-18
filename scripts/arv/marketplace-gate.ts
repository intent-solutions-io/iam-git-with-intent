#!/usr/bin/env npx tsx
/**
 * Marketplace Integration Gate - ARV Check
 *
 * Phase 29: Verifies connector marketplace infrastructure.
 *
 * Checks:
 * 1. Marketplace types and schemas exist
 * 2. Marketplace storage (Firestore + InMemory)
 * 3. MarketplaceService with publish/install
 * 4. Registry API routes in gateway
 * 5. Install pipeline with policy enforcement
 * 6. Web UI pages (Marketplace, MarketplaceDetail)
 * 7. Policy types include connector actions
 * 8. TypeScript compilation passes
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

console.log('🛒 Marketplace Integration Gate - ARV Check (Phase 29)');
console.log('─'.repeat(55));

// Check 1: Marketplace types
check('Marketplace types', () => {
  const typesPath = join(rootDir, 'packages/core/src/marketplace/types.ts');
  if (!existsSync(typesPath)) {
    return `Marketplace types not found at ${typesPath}`;
  }

  const content = readFileSync(typesPath, 'utf-8');

  // Check for key schemas
  const requiredSchemas = [
    'PublishedConnectorSchema',
    'ConnectorVersionSchema',
    'ConnectorInstallationSchema',
    'PublishRequestSchema',
    'InstallRequestSchema',
  ];

  for (const schema of requiredSchemas) {
    if (!content.includes(schema)) {
      return `Missing schema: ${schema}`;
    }
  }

  // Check for search types
  if (!content.includes('MarketplaceSearchOptions') || !content.includes('MarketplaceSearchResult')) {
    return 'Missing search types';
  }

  // Check for categories
  if (!content.includes('MARKETPLACE_CATEGORIES')) {
    return 'Missing marketplace categories';
  }

  console.log(`  ✓ Marketplace types has ${requiredSchemas.length} required schemas`);
  return true;
});

// Check 2: Marketplace storage
check('Marketplace storage', () => {
  const storagePath = join(rootDir, 'packages/core/src/marketplace/storage.ts');
  if (!existsSync(storagePath)) {
    return `Marketplace storage not found at ${storagePath}`;
  }

  const content = readFileSync(storagePath, 'utf-8');

  // Check for both implementations
  if (!content.includes('FirestoreMarketplaceStore')) {
    return 'Missing FirestoreMarketplaceStore class';
  }

  if (!content.includes('InMemoryMarketplaceStore')) {
    return 'Missing InMemoryMarketplaceStore class';
  }

  // Check for MarketplaceStore interface
  if (!content.includes('interface MarketplaceStore')) {
    return 'Missing MarketplaceStore interface';
  }

  // Check for key methods
  const requiredMethods = [
    'getConnector',
    'createConnector',
    'searchConnectors',
    'getVersion',
    'createVersion',
    'createInstallation',
    'incrementDownloads',
  ];

  for (const method of requiredMethods) {
    if (!content.includes(method)) {
      return `Missing method: ${method}`;
    }
  }

  console.log('  ✓ Marketplace storage has Firestore and InMemory implementations');
  return true;
});

// Check 3: MarketplaceService
check('MarketplaceService', () => {
  const servicePath = join(rootDir, 'packages/core/src/marketplace/service.ts');
  if (!existsSync(servicePath)) {
    return `Marketplace service not found at ${servicePath}`;
  }

  const content = readFileSync(servicePath, 'utf-8');

  // Check for key class
  if (!content.includes('class MarketplaceService')) {
    return 'Missing MarketplaceService class';
  }

  // Check for key methods
  const requiredMethods = [
    'getConnector',
    'listConnectors',
    'searchConnectors',
    'getConnectorWithVersions',
    'getVersion',
    'publish',
    'deprecateVersion',
    'install',
    'uninstall',
    'upgrade',
    'listInstallations',
  ];

  for (const method of requiredMethods) {
    if (!content.includes(method)) {
      return `Missing method: ${method}`;
    }
  }

  // Check for signature verification
  if (!content.includes('verifySignature')) {
    return 'Missing signature verification';
  }

  console.log('  ✓ MarketplaceService has publish, install, and signature verification');
  return true;
});

// Check 4: Registry API routes
check('Registry API routes', () => {
  const routesPath = join(rootDir, 'apps/gateway/src/marketplace-routes.ts');
  if (!existsSync(routesPath)) {
    return `Marketplace routes not found at ${routesPath}`;
  }

  const content = readFileSync(routesPath, 'utf-8');

  // Check for API endpoints
  const requiredEndpoints = [
    '/v1/search',
    '/v1/connectors/:id',
    '/v1/connectors/:id/:version',
    '/v1/connectors/:id/:version/tarball',
    '/v1/connectors/:id/:version/signature',
    '/v1/publish',
    '/v1/connectors/:id/:version/deprecate',
  ];

  for (const endpoint of requiredEndpoints) {
    if (!content.includes(endpoint)) {
      return `Missing endpoint: ${endpoint}`;
    }
  }

  // Check for GCS integration
  if (!content.includes('@google-cloud/storage')) {
    return 'Missing GCS storage integration';
  }

  console.log('  ✓ Registry API has all required endpoints');
  return true;
});

// Check 5: Gateway integration
check('Gateway integration', () => {
  const gatewayPath = join(rootDir, 'apps/gateway/src/index.ts');
  if (!existsSync(gatewayPath)) {
    return `Gateway index not found`;
  }

  const content = readFileSync(gatewayPath, 'utf-8');

  // Check for marketplace router import
  if (!content.includes('marketplaceRouter')) {
    return 'Missing marketplaceRouter import in gateway';
  }

  // Check for marketplace endpoint documentation
  if (!content.includes('/v1/search')) {
    return 'Missing marketplace endpoint documentation';
  }

  console.log('  ✓ Gateway imports and mounts marketplace routes');
  return true;
});

// Check 6: Install pipeline
check('Install pipeline with policy', () => {
  const pipelinePath = join(rootDir, 'packages/core/src/marketplace/install-pipeline.ts');
  if (!existsSync(pipelinePath)) {
    return `Install pipeline not found at ${pipelinePath}`;
  }

  const content = readFileSync(pipelinePath, 'utf-8');

  // Check for key class
  if (!content.includes('class InstallPipeline')) {
    return 'Missing InstallPipeline class';
  }

  // Check for policy types
  if (!content.includes('ConnectorInstallPolicy')) {
    return 'Missing ConnectorInstallPolicy type';
  }

  // Check for key methods
  const requiredMethods = [
    'requestInstall',
    'approveInstall',
    'denyInstall',
    'getPendingRequests',
    'setPolicy',
    'getPolicy',
  ];

  for (const method of requiredMethods) {
    if (!content.includes(method)) {
      return `Missing method: ${method}`;
    }
  }

  // Check for capability-based approval
  if (!content.includes('requireApprovalForCapabilities')) {
    return 'Missing capability-based approval policy';
  }

  console.log('  ✓ Install pipeline has policy enforcement with capability checks');
  return true;
});

// Check 7: Marketplace module exports
check('Marketplace module exports', () => {
  const indexPath = join(rootDir, 'packages/core/src/marketplace/index.ts');
  if (!existsSync(indexPath)) {
    return `Marketplace index not found at ${indexPath}`;
  }

  const content = readFileSync(indexPath, 'utf-8');

  // Check for key exports
  const requiredExports = [
    'PublishedConnectorSchema',
    'MarketplaceService',
    'getMarketplaceService',
    'FirestoreMarketplaceStore',
    'InMemoryMarketplaceStore',
    'InstallPipeline',
    'getInstallPipeline',
    'DEFAULT_INSTALL_POLICY',
  ];

  for (const exp of requiredExports) {
    if (!content.includes(exp)) {
      return `Missing export: ${exp}`;
    }
  }

  console.log('  ✓ Marketplace module exports all required items');
  return true;
});

// Check 8: Core exports marketplace
check('Core exports marketplace', () => {
  const indexPath = join(rootDir, 'packages/core/src/index.ts');
  if (!existsSync(indexPath)) {
    return `Core index not found`;
  }

  const content = readFileSync(indexPath, 'utf-8');

  if (!content.includes('./marketplace')) {
    return 'Core index does not export marketplace module';
  }

  console.log('  ✓ Core index exports marketplace module');
  return true;
});

// Check 9: Web UI - Marketplace page
check('Web UI: Marketplace page', () => {
  const marketplacePath = join(rootDir, 'apps/web/src/pages/Marketplace.tsx');
  if (!existsSync(marketplacePath)) {
    return `Marketplace page not found at ${marketplacePath}`;
  }

  const content = readFileSync(marketplacePath, 'utf-8');

  // Check for key features
  const features = [
    'MarketplaceConnector',
    'SearchResult',
    'searchQuery',
    '/search',
    'capabilities',
    'CATEGORIES',
  ];

  for (const feature of features) {
    if (!content.includes(feature)) {
      return `Missing feature: ${feature}`;
    }
  }

  console.log('  ✓ Marketplace browse page has search and filters');
  return true;
});

// Check 10: Web UI - MarketplaceDetail page
check('Web UI: MarketplaceDetail page', () => {
  const detailPath = join(rootDir, 'apps/web/src/pages/MarketplaceDetail.tsx');
  if (!existsSync(detailPath)) {
    return `MarketplaceDetail page not found at ${detailPath}`;
  }

  const content = readFileSync(detailPath, 'utf-8');

  // Check for key features
  const features = [
    'ConnectorInfo',
    'VersionInfo',
    'handleInstall',
    'selectedVersion',
    'installation',
    'Install',
  ];

  for (const feature of features) {
    if (!content.includes(feature)) {
      return `Missing feature: ${feature}`;
    }
  }

  console.log('  ✓ MarketplaceDetail page has install functionality');
  return true;
});

// Check 11: Routes configured
check('Routes configured', () => {
  const appPath = join(rootDir, 'apps/web/src/App.tsx');
  if (!existsSync(appPath)) {
    return `App.tsx not found`;
  }

  const content = readFileSync(appPath, 'utf-8');

  if (!content.includes('"/marketplace"')) {
    return 'Missing /marketplace route';
  }

  if (!content.includes('/marketplace/:connectorId')) {
    return 'Missing /marketplace/:connectorId route';
  }

  if (!content.includes('Marketplace')) {
    return 'Missing Marketplace import';
  }

  console.log('  ✓ Routes configured (/marketplace, /marketplace/:connectorId)');
  return true;
});

// Check 12: Policy types include connector actions
check('Policy types with connector actions', () => {
  const policyPath = join(rootDir, 'packages/core/src/policy/types.ts');
  if (!existsSync(policyPath)) {
    return `Policy types not found at ${policyPath}`;
  }

  const content = readFileSync(policyPath, 'utf-8');

  // Check for connector actions
  const connectorActions = [
    'connector.install',
    'connector.uninstall',
    'connector.upgrade',
  ];

  for (const action of connectorActions) {
    if (!content.includes(action)) {
      return `Missing policy action: ${action}`;
    }
  }

  // Check for connector resource type
  if (!content.includes("'connector'")) {
    return 'Missing connector resource type';
  }

  console.log('  ✓ Policy types include connector actions');
  return true;
});

// Check 13: Navigation link
check('Navigation link in Layout', () => {
  const layoutPath = join(rootDir, 'apps/web/src/components/Layout.tsx');
  if (!existsSync(layoutPath)) {
    return `Layout not found at ${layoutPath}`;
  }

  const content = readFileSync(layoutPath, 'utf-8');

  if (!content.includes('/marketplace')) {
    return 'Missing Marketplace navigation link';
  }

  console.log('  ✓ Navigation includes Marketplace link');
  return true;
});

// Check 14: TypeScript compilation
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
  console.error('\n❌ Marketplace Integration Gate FAILED');
  process.exit(1);
}

console.log('\n✅ Marketplace Integration Gate PASSED');
