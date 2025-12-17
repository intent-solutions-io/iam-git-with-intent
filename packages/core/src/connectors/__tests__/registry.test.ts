/**
 * Connector Registry Tests
 *
 * Phase 6: Tests for local filesystem connector registry.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  LocalConnectorRegistry,
  computeChecksum,
  verifyChecksum,
} from '../registry.js';

// Test directory
const TEST_REGISTRY = join(process.cwd(), '.test-connectors');

// Helper to create a test connector directory
async function createTestConnector(
  id: string,
  version: string,
  options?: {
    invalidChecksum?: boolean;
    missingEntrypoint?: boolean;
    invalidManifest?: boolean;
  }
): Promise<string> {
  const dirName = `${id}@${version}`;
  const dirPath = join(TEST_REGISTRY, dirName);
  await mkdir(dirPath, { recursive: true });

  // Create entry point
  const entryContent = `
    export const connector = {
      id: '${id}',
      name: '${id} Connector',
      tools: [],
      getTool: (name) => undefined,
      listTools: () => [],
    };
    export default connector;
  `;
  const entrypointPath = join(dirPath, 'dist');
  await mkdir(entrypointPath, { recursive: true });

  if (!options?.missingEntrypoint) {
    await writeFile(join(entrypointPath, 'index.js'), entryContent);
  }

  // Compute checksum
  let checksum = 'sha256:' + 'a'.repeat(64);
  if (!options?.invalidChecksum && !options?.missingEntrypoint) {
    const hash = createHash('sha256').update(entryContent).digest('hex');
    checksum = `sha256:${hash}`;
  }

  // Create manifest
  const manifest = options?.invalidManifest
    ? { invalid: true }
    : {
        manifestVersion: '1.0',
        id,
        version,
        displayName: `${id} Connector`,
        description: `Test ${id} connector`,
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'testTool', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum,
      };

  await writeFile(
    join(dirPath, 'connector.manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  return dirPath;
}

describe('Connector Registry', () => {
  beforeEach(async () => {
    await mkdir(TEST_REGISTRY, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(TEST_REGISTRY, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('computeChecksum', () => {
    it('should compute SHA256 checksum of file', async () => {
      const testFile = join(TEST_REGISTRY, 'test.txt');
      await writeFile(testFile, 'hello world');

      const checksum = await computeChecksum(testFile);
      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
      // Known hash for "hello world"
      expect(checksum).toBe('sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });
  });

  describe('LocalConnectorRegistry', () => {
    it('should report exists=false for non-existent registry', () => {
      const registry = new LocalConnectorRegistry(join(TEST_REGISTRY, 'nonexistent'));
      expect(registry.exists()).toBe(false);
    });

    it('should report exists=true for existing registry', () => {
      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      expect(registry.exists()).toBe(true);
    });

    it('should scan empty registry', async () => {
      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const result = await registry.scan();
      expect(result.connectors).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should scan and find valid connectors', async () => {
      await createTestConnector('test-connector', '1.0.0');
      await createTestConnector('another-connector', '2.0.0');

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const result = await registry.scan();

      expect(result.connectors).toHaveLength(2);
      expect(result.connectors.map(c => c.id)).toContain('test-connector');
      expect(result.connectors.map(c => c.id)).toContain('another-connector');
    });

    it('should detect checksum mismatch', async () => {
      await createTestConnector('bad-checksum', '1.0.0', { invalidChecksum: true });

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const result = await registry.scan();

      expect(result.connectors).toHaveLength(1);
      expect(result.connectors[0].checksumVerified).toBe(false);
      expect(result.errors.some(e => e.error.includes('Checksum mismatch'))).toBe(true);
    });

    it('should report missing entrypoint', async () => {
      await createTestConnector('missing-entry', '1.0.0', { missingEntrypoint: true });

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const result = await registry.scan();

      expect(result.connectors).toHaveLength(0);
      expect(result.errors.some(e => e.error.includes('Entrypoint not found'))).toBe(true);
    });

    it('should report invalid manifest', async () => {
      await createTestConnector('invalid-manifest', '1.0.0', { invalidManifest: true });

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const result = await registry.scan();

      expect(result.connectors).toHaveLength(0);
      expect(result.errors.some(e => e.error.includes('Invalid manifest'))).toBe(true);
    });

    it('should list installed connectors', async () => {
      await createTestConnector('test-a', '1.0.0');
      await createTestConnector('test-b', '1.0.0');

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const installed = await registry.listInstalled();

      expect(installed).toHaveLength(2);
    });

    it('should get specific connector by id', async () => {
      await createTestConnector('specific', '1.0.0');
      await createTestConnector('specific', '2.0.0');

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);

      const v1 = await registry.getInstalled('specific', '1.0.0');
      expect(v1?.version).toBe('1.0.0');

      const v2 = await registry.getInstalled('specific', '2.0.0');
      expect(v2?.version).toBe('2.0.0');
    });

    it('should get latest version when no version specified', async () => {
      await createTestConnector('multi-version', '1.0.0');
      await createTestConnector('multi-version', '2.0.0');
      await createTestConnector('multi-version', '1.5.0');

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const latest = await registry.getInstalled('multi-version');

      expect(latest?.version).toBe('2.0.0');
    });

    it('should refuse to load connector with invalid checksum', async () => {
      await createTestConnector('bad-checksum', '1.0.0', { invalidChecksum: true });

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      await registry.scan();

      const result = await registry.loadConnector('bad-checksum');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Checksum verification failed');
    });

    it('should allow forced load with skipChecksumVerification', async () => {
      await createTestConnector('force-load', '1.0.0', { invalidChecksum: true });

      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      await registry.scan();

      const result = await registry.loadConnector('force-load', undefined, {
        skipChecksumVerification: true,
      });

      // Will fail at import since it's not a real module, but should get past checksum
      // Error may be undefined if it somehow succeeds, or contains import error
      if (result.error) {
        expect(result.error).not.toContain('Checksum verification failed');
      }
    });

    it('should return error for non-existent connector', async () => {
      const registry = new LocalConnectorRegistry(TEST_REGISTRY);
      const result = await registry.loadConnector('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('verifyChecksum', () => {
    it('should verify valid checksum', async () => {
      const dirPath = await createTestConnector('verify-test', '1.0.0');

      const manifest = {
        entrypoint: 'dist/index.js',
        checksum: await computeChecksum(join(dirPath, 'dist/index.js')),
      };

      const result = await verifyChecksum(dirPath, manifest as any);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid checksum', async () => {
      const dirPath = await createTestConnector('verify-bad', '1.0.0');

      const manifest = {
        entrypoint: 'dist/index.js',
        checksum: 'sha256:' + 'b'.repeat(64),
      };

      const result = await verifyChecksum(dirPath, manifest as any);
      expect(result.valid).toBe(false);
    });
  });
});
