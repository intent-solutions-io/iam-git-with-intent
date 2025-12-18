#!/usr/bin/env npx tsx
/**
 * Metering Integration Gate - ARV Check
 *
 * Phase 22 + 28: Verifies metering, billing, and enforcement infrastructure.
 *
 * Phase 22 Checks:
 * 1. Entitlements module exists with plan limits
 * 2. Usage module exists with event types
 * 3. Enforcement module exists with limit checking
 * 4. Metering store exists (Firestore + InMemory)
 * 5. Stripe webhook handler exists
 * 6. Exports are available from @gwi/core
 *
 * Phase 28 Checks:
 * 7. MeteringEvent schema + service (provider-agnostic)
 * 8. MeteringBridge (Stripe→Metering sync)
 * 9. Usage dashboard UI page exists
 * 10. Upgrade flow UI page exists
 * 11. TypeScript compilation passes
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

console.log('🔬 Metering Integration Gate - ARV Check (Phase 22 + 28)');
console.log('─'.repeat(55));

// Check 1: Entitlements module
check('Entitlements module', () => {
  const entPath = join(rootDir, 'packages/core/src/billing/entitlements.ts');
  if (!existsSync(entPath)) {
    return `Entitlements module not found at ${entPath}`;
  }

  const content = readFileSync(entPath, 'utf-8');

  // Check for key exports
  const requiredExports = [
    'EXTENDED_PLAN_LIMITS',
    'MeteredResource',
    'checkEntitlement',
    'TenantUsageSnapshot',
    'createEmptyUsageSnapshot',
  ];

  for (const exp of requiredExports) {
    if (!content.includes(exp)) {
      return `Missing export: ${exp}`;
    }
  }

  // Check for plan limits
  if (!content.includes('runsPerDay') || !content.includes('signalsPerDay')) {
    return 'Missing Phase 22 extended plan limits';
  }

  console.log(`  ✓ Entitlements module has ${requiredExports.length} required exports`);
  return true;
});

// Check 2: Usage module
check('Usage module', () => {
  const usagePath = join(rootDir, 'packages/core/src/billing/usage.ts');
  if (!existsSync(usagePath)) {
    return `Usage module not found at ${usagePath}`;
  }

  const content = readFileSync(usagePath, 'utf-8');

  // Check for key exports
  const requiredExports = [
    'ExtendedUsageEventType',
    'ExtendedUsageEvent',
    'DailyUsageAggregate',
    'MonthlyUsageAggregate',
    'createUsageEvent',
    'updateDailyAggregate',
  ];

  for (const exp of requiredExports) {
    if (!content.includes(exp)) {
      return `Missing export: ${exp}`;
    }
  }

  // Check for event types
  if (!content.includes('signal_ingested') || !content.includes('candidate_generated')) {
    return 'Missing Phase 22 usage event types';
  }

  console.log(`  ✓ Usage module has ${requiredExports.length} required exports`);
  return true;
});

// Check 3: Enforcement module
check('Enforcement module', () => {
  const enfPath = join(rootDir, 'packages/core/src/billing/enforcement.ts');
  if (!existsSync(enfPath)) {
    return `Enforcement module not found at ${enfPath}`;
  }

  const content = readFileSync(enfPath, 'utf-8');

  // Check for key exports
  const requiredExports = [
    'enforceLimit',
    'enforceRunCreation',
    'build429Response',
    'build402Response',
    'EnforcementResult',
    'PreflightCheckResult',
  ];

  for (const exp of requiredExports) {
    if (!content.includes(exp)) {
      return `Missing export: ${exp}`;
    }
  }

  // Check for 429/402 handling
  if (!content.includes('429') || !content.includes('402')) {
    return 'Missing HTTP status code handling (429/402)';
  }

  console.log(`  ✓ Enforcement module has ${requiredExports.length} required exports`);
  return true;
});

// Check 4: Metering store
check('Metering store', () => {
  const storePath = join(rootDir, 'packages/core/src/storage/firestore-metering.ts');
  if (!existsSync(storePath)) {
    return `Metering store not found at ${storePath}`;
  }

  const content = readFileSync(storePath, 'utf-8');

  // Check for both implementations
  if (!content.includes('FirestoreMeteringStore')) {
    return 'Missing FirestoreMeteringStore class';
  }

  if (!content.includes('InMemoryMeteringStore')) {
    return 'Missing InMemoryMeteringStore class';
  }

  // Check for MeteringStore interface
  if (!content.includes('interface MeteringStore')) {
    return 'Missing MeteringStore interface';
  }

  // Check for key methods
  const requiredMethods = ['recordEvent', 'getUsageSnapshot', 'incrementUsage'];

  for (const method of requiredMethods) {
    if (!content.includes(method)) {
      return `Missing method: ${method}`;
    }
  }

  console.log('  ✓ Metering store has Firestore and InMemory implementations');
  return true;
});

// Check 5: Stripe webhook handler
check('Stripe webhook handler', () => {
  const webhookPath = join(rootDir, 'packages/core/src/billing/stripe-webhooks.ts');
  if (!existsSync(webhookPath)) {
    return `Stripe webhook handler not found at ${webhookPath}`;
  }

  const content = readFileSync(webhookPath, 'utf-8');

  // Check for key exports
  if (!content.includes('StripeWebhookHandler')) {
    return 'Missing StripeWebhookHandler class';
  }

  if (!content.includes('createStripeWebhookHandler')) {
    return 'Missing createStripeWebhookHandler function';
  }

  // Check for event handling
  const events = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'invoice.paid',
    'invoice.payment_failed',
  ];

  for (const event of events) {
    if (!content.includes(event)) {
      return `Missing handler for event: ${event}`;
    }
  }

  console.log('  ✓ Stripe webhook handler handles subscription and invoice events');
  return true;
});

// Check 6: Billing index exports
check('Billing index exports', () => {
  const indexPath = join(rootDir, 'packages/core/src/billing/index.ts');
  if (!existsSync(indexPath)) {
    return 'Billing index not found';
  }

  const content = readFileSync(indexPath, 'utf-8');

  // Check for Phase 22 exports
  const phase22Exports = [
    'checkEntitlement',
    'enforceLimit',
    'createUsageEvent',
    'StripeWebhookHandler',
    'EXTENDED_PLAN_LIMITS',
  ];

  for (const exp of phase22Exports) {
    if (!content.includes(exp)) {
      return `Missing Phase 22 export: ${exp}`;
    }
  }

  console.log('  ✓ Billing index exports Phase 22 modules');
  return true;
});

// Check 7: Storage index exports metering
check('Storage index exports metering', () => {
  const indexPath = join(rootDir, 'packages/core/src/storage/index.ts');
  if (!existsSync(indexPath)) {
    return 'Storage index not found';
  }

  const content = readFileSync(indexPath, 'utf-8');

  // Check for metering exports
  if (!content.includes('getMeteringStore')) {
    return 'Missing getMeteringStore export';
  }

  if (!content.includes('MeteringStore')) {
    return 'Missing MeteringStore type export';
  }

  console.log('  ✓ Storage index exports metering store');
  return true;
});

// Check 8: Firestore collections defined
check('Firestore collections defined', () => {
  const clientPath = join(rootDir, 'packages/core/src/storage/firestore-client.ts');
  if (!existsSync(clientPath)) {
    return 'Firestore client not found';
  }

  const content = readFileSync(clientPath, 'utf-8');

  // Check for Phase 22 collections
  const collections = ['USAGE_EVENTS', 'USAGE_DAILY', 'USAGE_MONTHLY', 'USAGE_SNAPSHOTS'];

  for (const col of collections) {
    if (!content.includes(col)) {
      return `Missing Firestore collection: ${col}`;
    }
  }

  console.log('  ✓ Firestore collections defined for metering');
  return true;
});

// =============================================================================
// Phase 28 Checks
// =============================================================================

// Check 9: MeteringEvent schema + service
check('Phase 28: MeteringEvent schema', () => {
  const typesPath = join(rootDir, 'packages/core/src/metering/types.ts');
  if (!existsSync(typesPath)) {
    return `Metering types not found at ${typesPath}`;
  }

  const content = readFileSync(typesPath, 'utf-8');

  // Check for key exports
  const requiredExports = [
    'MeteringEventSchema',
    'UsageAggregateSchema',
    'PlanSchema',
    'DEFAULT_PLANS',
    'validateMeteringEvent',
    'getPlanById',
  ];

  for (const exp of requiredExports) {
    if (!content.includes(exp)) {
      return `Missing export: ${exp}`;
    }
  }

  // Check for provider-agnostic design (freeform strings)
  if (!content.includes('provider: z.string()') || !content.includes('model: z.string()')) {
    return 'Missing provider-agnostic design (provider/model should be freeform strings)';
  }

  console.log('  ✓ Phase 28 MeteringEvent schema is provider-agnostic');
  return true;
});

// Check 10: MeteringService
check('Phase 28: MeteringService', () => {
  const servicePath = join(rootDir, 'packages/core/src/metering/service.ts');
  if (!existsSync(servicePath)) {
    return `Metering service not found at ${servicePath}`;
  }

  const content = readFileSync(servicePath, 'utf-8');

  // Check for key class/functions
  const required = [
    'MeteringService',
    'InMemoryMeteringStorage',
    'recordLLMUsage',
    'recordToolUsage',
    'computeAggregate',
    'checkLimits',
    'isMeteringEnabled',
  ];

  for (const exp of required) {
    if (!content.includes(exp)) {
      return `Missing: ${exp}`;
    }
  }

  console.log('  ✓ Phase 28 MeteringService with plan limits and checkLimits');
  return true;
});

// Check 11: MeteringBridge
check('Phase 28: MeteringBridge', () => {
  const bridgePath = join(rootDir, 'packages/core/src/billing/metering-bridge.ts');
  if (!existsSync(bridgePath)) {
    return `Metering bridge not found at ${bridgePath}`;
  }

  const content = readFileSync(bridgePath, 'utf-8');

  // Check for key exports
  const required = [
    'MeteringBridge',
    'TenantBillingState',
    'InMemoryBillingStateStorage',
    'syncSubscriptionToMeteringPlan',
    'createWebhookDeps',
  ];

  for (const exp of required) {
    if (!content.includes(exp)) {
      return `Missing: ${exp}`;
    }
  }

  console.log('  ✓ Phase 28 MeteringBridge syncs Stripe→Metering');
  return true;
});

// Check 12: Metering module exports
check('Phase 28: Metering module exports', () => {
  const indexPath = join(rootDir, 'packages/core/src/metering/index.ts');
  if (!existsSync(indexPath)) {
    return `Metering index not found at ${indexPath}`;
  }

  const content = readFileSync(indexPath, 'utf-8');

  // Check for Phase 28 exports
  const phase28Exports = [
    'MeteringEventSchema',
    'MeteringService',
    'validateMeteringEvent',
    'getPlanById',
    'isMeteringEnabled',
  ];

  for (const exp of phase28Exports) {
    if (!content.includes(exp)) {
      return `Missing Phase 28 export: ${exp}`;
    }
  }

  console.log('  ✓ Metering module exports Phase 28 schema and service');
  return true;
});

// Check 13: Usage dashboard UI page
check('Phase 28: Usage dashboard UI', () => {
  const usagePath = join(rootDir, 'apps/web/src/pages/Usage.tsx');
  if (!existsSync(usagePath)) {
    return `Usage page not found at ${usagePath}`;
  }

  const content = readFileSync(usagePath, 'utf-8');

  // Check for key components
  const components = [
    'PlanInfoCard',
    'UsageSummaryCard',
    'InvoiceHistoryTable',
    'UsageBar',
  ];

  for (const comp of components) {
    if (!content.includes(comp)) {
      return `Missing UI component: ${comp}`;
    }
  }

  console.log('  ✓ Phase 28 Usage dashboard has required components');
  return true;
});

// Check 14: Upgrade flow UI page
check('Phase 28: Upgrade flow UI', () => {
  const upgradePath = join(rootDir, 'apps/web/src/pages/Upgrade.tsx');
  if (!existsSync(upgradePath)) {
    return `Upgrade page not found at ${upgradePath}`;
  }

  const content = readFileSync(upgradePath, 'utf-8');

  // Check for key features
  const features = [
    'createCheckoutSession',
    'success',
    'canceled',
    'monthly',
    'yearly',
    'PLANS',
  ];

  for (const feature of features) {
    if (!content.includes(feature)) {
      return `Missing feature: ${feature}`;
    }
  }

  console.log('  ✓ Phase 28 Upgrade page has Stripe checkout integration');
  return true;
});

// Check 15: Usage and Upgrade routes exist
check('Phase 28: Routes configured', () => {
  const appPath = join(rootDir, 'apps/web/src/App.tsx');
  if (!existsSync(appPath)) {
    return `App.tsx not found`;
  }

  const content = readFileSync(appPath, 'utf-8');

  if (!content.includes('"/usage"')) {
    return 'Missing /usage route';
  }

  if (!content.includes('"/upgrade"')) {
    return 'Missing /upgrade route';
  }

  console.log('  ✓ Phase 28 routes configured (/usage, /upgrade)');
  return true;
});

// Check 16: TypeScript compilation
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
  console.error('\n❌ Metering Integration Gate FAILED');
  process.exit(1);
}

console.log('\n✅ Metering Integration Gate PASSED');
