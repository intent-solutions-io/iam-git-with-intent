#!/usr/bin/env npx tsx
/**
 * Cloud Smoke Test for Git With Intent
 *
 * Tests deployed Cloud Run services and Firestore connectivity.
 * Run after deploying to staging or production.
 *
 * Usage:
 *   npx tsx scripts/cloud-smoke-test.ts --env=staging
 *   npx tsx scripts/cloud-smoke-test.ts --env=production
 *
 * Environment Variables:
 *   GWI_API_URL - API service URL
 *   GWI_WEBHOOK_URL - Webhook service URL
 *   GCP_PROJECT_ID - Google Cloud project ID
 *
 * Phase 9: Staging Cloud Run + Firestore + Cloud Smoke Tests
 */

import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// =============================================================================
// Configuration
// =============================================================================

interface SmokeTestConfig {
  env: 'staging' | 'production';
  apiUrl: string;
  webhookUrl: string;
  projectId: string;
}

function getConfig(): SmokeTestConfig {
  const env = process.argv.find(arg => arg.startsWith('--env='))?.split('=')[1] as 'staging' | 'production' || 'staging';

  const envPrefix = env === 'production' ? '' : 'staging-';

  return {
    env,
    apiUrl: process.env.GWI_API_URL || `https://${envPrefix}gwi-api-xxxxx-uc.a.run.app`,
    webhookUrl: process.env.GWI_WEBHOOK_URL || `https://${envPrefix}gwi-webhook-xxxxx-uc.a.run.app`,
    projectId: process.env.GCP_PROJECT_ID || '',
  };
}

// =============================================================================
// Test Results
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
    });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`  ❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// API Tests
// =============================================================================

async function testApiHealth(config: SmokeTestConfig): Promise<void> {
  const response = await fetch(`${config.apiUrl}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 'healthy') {
    throw new Error(`Unhealthy status: ${data.status}`);
  }
}

async function testApiTenants(config: SmokeTestConfig): Promise<void> {
  // This should fail without auth, which is expected
  const response = await fetch(`${config.apiUrl}/tenants`);
  // 401 or 403 is expected, 500+ is an error
  if (response.status >= 500) {
    throw new Error(`Server error: ${response.status}`);
  }
}

// =============================================================================
// Webhook Tests
// =============================================================================

async function testWebhookHealth(config: SmokeTestConfig): Promise<void> {
  const response = await fetch(`${config.webhookUrl}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 'healthy') {
    throw new Error(`Unhealthy status: ${data.status}`);
  }
}

async function testWebhookEndpoint(config: SmokeTestConfig): Promise<void> {
  // Send a ping event (should be accepted but skipped)
  const response = await fetch(`${config.webhookUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'ping',
      'X-GitHub-Delivery': 'test-delivery-123',
    },
    body: JSON.stringify({ zen: 'Test ping', hook_id: 12345 }),
  });

  // 200 or 401 (if signature required) are acceptable
  if (response.status >= 500) {
    throw new Error(`Server error: ${response.status}`);
  }
}

// =============================================================================
// Firestore Tests
// =============================================================================

async function testFirestoreConnection(): Promise<void> {
  const db = getFirestore();

  // Try to read a non-existent document (should succeed without error)
  const doc = await db.collection('gwi_smoke_test').doc('test').get();

  // Document doesn't exist, but connection worked
  if (doc.exists) {
    console.log('    (Note: smoke test document exists)');
  }
}

async function testFirestoreWrite(): Promise<void> {
  const db = getFirestore();

  // Write a test document
  const testDoc = db.collection('gwi_smoke_test').doc('test');
  await testDoc.set({
    timestamp: new Date(),
    test: 'smoke',
    env: process.argv.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'staging',
  });

  // Read it back
  const doc = await testDoc.get();
  if (!doc.exists || doc.data()?.test !== 'smoke') {
    throw new Error('Write verification failed');
  }

  // Clean up
  await testDoc.delete();
}

async function testFirestoreCollections(): Promise<void> {
  const db = getFirestore();

  // List collections (should include gwi_ prefixed ones if data exists)
  const collections = await db.listCollections();
  const collectionNames = collections.map(c => c.id);

  console.log(`    (Found ${collectionNames.length} collections)`);

  // Check for expected collections
  const expectedPrefixes = ['gwi_tenants', 'gwi_runs'];
  for (const prefix of expectedPrefixes) {
    if (!collectionNames.includes(prefix)) {
      console.log(`    (Note: ${prefix} collection not yet created)`);
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('\n🔬 Git With Intent - Cloud Smoke Test\n');

  const config = getConfig();
  console.log(`Environment: ${config.env}`);
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Webhook URL: ${config.webhookUrl}`);
  console.log(`Project ID: ${config.projectId || '(from default credentials)'}`);
  console.log('');

  // Initialize Firebase Admin
  try {
    initializeApp({
      projectId: config.projectId || undefined,
    });
  } catch (error) {
    // May already be initialized
    if (!(error instanceof Error && error.message.includes('already exists'))) {
      throw error;
    }
  }

  // Run API tests
  console.log('📡 API Service Tests:');
  await runTest('API Health Check', () => testApiHealth(config));
  await runTest('API Tenants Endpoint', () => testApiTenants(config));

  // Run Webhook tests
  console.log('\n🔔 Webhook Service Tests:');
  await runTest('Webhook Health Check', () => testWebhookHealth(config));
  await runTest('Webhook Endpoint', () => testWebhookEndpoint(config));

  // Run Firestore tests
  console.log('\n🔥 Firestore Tests:');
  await runTest('Firestore Connection', testFirestoreConnection);
  await runTest('Firestore Write/Read', testFirestoreWrite);
  await runTest('Firestore Collections', testFirestoreCollections);

  // Summary
  console.log('\n📊 Summary:');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`  Total: ${results.length} tests`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Duration: ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('\n💥 Smoke test failed:', error);
  process.exit(1);
});
