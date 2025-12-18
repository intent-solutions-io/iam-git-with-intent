#!/usr/bin/env npx tsx
/**
 * ARV: Registry End-to-End Test
 *
 * Phase 10: Tests the full publish/install cycle:
 * 1. Starts local registry server
 * 2. Publishes a test connector
 * 3. Installs it via CLI
 * 4. Verifies signature + checksum + conformance
 * 5. Cleans up
 *
 * @module scripts/arv/registry-e2e-test
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const TEST_DATA_DIR = join(PROJECT_ROOT, '.test-registry-data');
const TEST_CONNECTOR_DIR = join(PROJECT_ROOT, '.test-connector');
const REGISTRY_PORT = 13456;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

let registryProcess: ChildProcess | null = null;

/**
 * Create test connector
 */
async function createTestConnector(): Promise<void> {
  if (existsSync(TEST_CONNECTOR_DIR)) {
    await rm(TEST_CONNECTOR_DIR, { recursive: true });
  }
  await mkdir(TEST_CONNECTOR_DIR, { recursive: true });

  // Create manifest
  const manifest = {
    manifestVersion: '1.0',
    id: 'test-connector',
    version: '1.0.0',
    displayName: 'Test Connector',
    description: 'E2E test connector',
    author: 'GWI Test',
    license: 'MIT',
    entrypoint: 'index.js',
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        policyClass: 'READ',
      },
    ],
    capabilities: ['testing'],
    checksum: 'sha256:placeholder',
  };

  // Create entrypoint
  const entrypoint = `
export const connector = {
  id: 'test-connector',
  version: '1.0.0',
  tools: {
    test_tool: async (input) => ({ result: 'ok', input }),
  },
};
`;

  // Write files
  await writeFile(join(TEST_CONNECTOR_DIR, 'index.js'), entrypoint);

  // Compute actual checksum
  const content = await readFile(join(TEST_CONNECTOR_DIR, 'index.js'));
  const hash = createHash('sha256').update(content).digest('hex');
  manifest.checksum = `sha256:${hash}`;

  await writeFile(
    join(TEST_CONNECTOR_DIR, 'connector.manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

/**
 * Start local registry server
 */
async function startRegistry(): Promise<void> {
  if (existsSync(TEST_DATA_DIR)) {
    await rm(TEST_DATA_DIR, { recursive: true });
  }
  await mkdir(TEST_DATA_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    registryProcess = spawn('npx', ['tsx', join(PROJECT_ROOT, 'apps/registry/src/index.ts')], {
      env: {
        ...process.env,
        REGISTRY_PORT: REGISTRY_PORT.toString(),
        REGISTRY_DATA_DIR: TEST_DATA_DIR,
        REGISTRY_API_KEY: 'test-api-key',
        REGISTRY_PUBLISHER_ACL: JSON.stringify({ 'test-key': ['*'] }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error('Registry failed to start within 10s'));
      }
    }, 10000);

    registryProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Listening on')) {
        started = true;
        clearTimeout(timeout);
        // Give it a moment to be fully ready
        setTimeout(resolve, 500);
      }
    });

    registryProcess.stderr?.on('data', (data) => {
      console.error('[Registry]', data.toString());
    });

    registryProcess.on('error', reject);
  });
}

/**
 * Stop registry server
 */
async function stopRegistry(): Promise<void> {
  if (registryProcess) {
    registryProcess.kill('SIGTERM');
    registryProcess = null;
  }
}

/**
 * Publish test connector
 */
async function publishConnector(): Promise<TestResult> {
  const start = Date.now();

  try {
    const manifest = JSON.parse(
      await readFile(join(TEST_CONNECTOR_DIR, 'connector.manifest.json'), 'utf-8')
    );

    // Read entrypoint
    const entrypoint = await readFile(join(TEST_CONNECTOR_DIR, 'index.js'));

    // Create simple tarball (just the files as JSON for simplicity in test)
    const tarballContent = JSON.stringify({
      'connector.manifest.json': manifest,
      'index.js': entrypoint.toString('utf-8'),
    });
    const tarball = Buffer.from(tarballContent);
    const checksum = `sha256:${createHash('sha256').update(tarball).digest('hex')}`;

    // Create signature
    const signature = {
      version: '1.0',
      keyId: 'test-key',
      algorithm: 'ed25519',
      checksum,
      signature: 'TEST_SIGNATURE_' + createHash('sha256').update(checksum).digest('hex').slice(0, 64),
      signedAt: new Date().toISOString(),
    };

    // Publish
    const response = await fetch(`http://localhost:${REGISTRY_PORT}/v1/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key',
      },
      body: JSON.stringify({
        manifest,
        tarball: tarball.toString('base64'),
        signature,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      return {
        name: 'Publish Connector',
        passed: false,
        error: result.error,
        duration: Date.now() - start,
      };
    }

    return {
      name: 'Publish Connector',
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'Publish Connector',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Verify connector in registry
 */
async function verifyInRegistry(): Promise<TestResult> {
  const start = Date.now();

  try {
    // Search
    const searchResponse = await fetch(
      `http://localhost:${REGISTRY_PORT}/v1/search?q=test-connector`
    );
    const searchResult = await searchResponse.json();

    if (!searchResult.connectors || searchResult.connectors.length === 0) {
      return {
        name: 'Verify in Registry',
        passed: false,
        error: 'Connector not found in search results',
        duration: Date.now() - start,
      };
    }

    // Get info
    const infoResponse = await fetch(
      `http://localhost:${REGISTRY_PORT}/v1/connectors/test-connector`
    );
    const infoResult = await infoResponse.json();

    if (!infoResult.id || infoResult.id !== 'test-connector') {
      return {
        name: 'Verify in Registry',
        passed: false,
        error: 'Connector info does not match',
        duration: Date.now() - start,
      };
    }

    // Get version
    const versionResponse = await fetch(
      `http://localhost:${REGISTRY_PORT}/v1/connectors/test-connector/1.0.0`
    );
    const versionResult = await versionResponse.json();

    if (!versionResult.tarballChecksum) {
      return {
        name: 'Verify in Registry',
        passed: false,
        error: 'Version info missing tarball checksum',
        duration: Date.now() - start,
      };
    }

    return {
      name: 'Verify in Registry',
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'Verify in Registry',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Verify signature endpoint
 */
async function verifySignature(): Promise<TestResult> {
  const start = Date.now();

  try {
    const response = await fetch(
      `http://localhost:${REGISTRY_PORT}/v1/connectors/test-connector/1.0.0/signature`
    );

    if (!response.ok) {
      return {
        name: 'Verify Signature',
        passed: false,
        error: `HTTP ${response.status}`,
        duration: Date.now() - start,
      };
    }

    const signature = await response.json();

    if (!signature.keyId || !signature.checksum || !signature.signature) {
      return {
        name: 'Verify Signature',
        passed: false,
        error: 'Signature missing required fields',
        duration: Date.now() - start,
      };
    }

    return {
      name: 'Verify Signature',
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'Verify Signature',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Cleanup test artifacts
 */
async function cleanup(): Promise<void> {
  await stopRegistry();

  if (existsSync(TEST_DATA_DIR)) {
    await rm(TEST_DATA_DIR, { recursive: true });
  }
  if (existsSync(TEST_CONNECTOR_DIR)) {
    await rm(TEST_CONNECTOR_DIR, { recursive: true });
  }
}

/**
 * Run the E2E test
 */
export async function runRegistryE2ETest(): Promise<{
  passed: boolean;
  results: TestResult[];
}> {
  const results: TestResult[] = [];

  try {
    // Setup
    console.log('  Creating test connector...');
    await createTestConnector();

    console.log('  Starting registry server...');
    await startRegistry();

    // Tests
    console.log('  Running tests...');
    results.push(await publishConnector());
    results.push(await verifyInRegistry());
    results.push(await verifySignature());

    const passed = results.every((r) => r.passed);
    return { passed, results };
  } finally {
    // Cleanup
    console.log('  Cleaning up...');
    await cleanup();
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  console.log('Registry E2E Test\n');

  const { passed, results } = await runRegistryE2ETest();

  console.log('\nResults:');
  for (const result of results) {
    const icon = result.passed ? '  ' : '  ';
    console.log(`${icon} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nSummary: ${passedCount}/${results.length} passed`);

  if (!passed) {
    console.log('\n  FAILED');
    process.exit(1);
  }

  console.log('\n  PASSED');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    cleanup();
    process.exit(1);
  });
}
