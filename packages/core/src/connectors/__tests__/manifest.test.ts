/**
 * Connector Manifest Tests
 *
 * Phase 6: Tests for connector manifest schema and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  ConnectorManifest,
  validateManifest,
  parseManifest,
  createTestManifest,
  getFullToolName,
  buildPolicyClassMap,
} from '../manifest.js';

describe('ConnectorManifest', () => {
  describe('Schema Validation', () => {
    it('should accept a valid manifest', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'github',
        version: '1.0.0',
        displayName: 'GitHub Connector',
        description: 'Connect to GitHub API',
        author: 'GWI Team',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [
          { name: 'getPullRequest', description: 'Get PR details', policyClass: 'READ' },
          { name: 'createComment', description: 'Create a comment', policyClass: 'WRITE_NON_DESTRUCTIVE' },
          { name: 'mergePullRequest', description: 'Merge a PR', policyClass: 'DESTRUCTIVE' },
        ],
        capabilities: ['vcs', 'ci-cd'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifest).toBeDefined();
    });

    it('should reject manifest without id', () => {
      const manifest = {
        manifestVersion: '1.0',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('id'))).toBe(true);
    });

    it('should reject invalid id format', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'Invalid-ID',  // uppercase not allowed
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    it('should reject invalid version format', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'test',
        version: 'v1.0',  // must be semver
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('semver'))).toBe(true);
    });

    it('should accept semver with prerelease', () => {
      const manifest = createTestManifest('test', { version: '1.0.0-beta.1' });
      expect(manifest.version).toBe('1.0.0-beta.1');
    });

    it('should reject invalid entrypoint extension', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'test',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.ts',  // must be .js/.mjs/.cjs
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('entrypoint'))).toBe(true);
    });

    it('should reject empty tools array', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'test',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [],  // at least one tool required
        capabilities: ['custom'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid checksum format', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'test',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum: 'invalid-checksum',
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sha256'))).toBe(true);
    });

    it('should accept valid capabilities', () => {
      const manifest = createTestManifest('test', {
        capabilities: ['vcs', 'ci-cd', 'issue-tracking'],
      });
      expect(manifest.capabilities).toContain('vcs');
      expect(manifest.capabilities).toContain('ci-cd');
    });

    it('should reject invalid capabilities', () => {
      const manifest = {
        manifestVersion: '1.0',
        id: 'test',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['invalid-capability'],
        checksum: 'sha256:' + 'a'.repeat(64),
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('should accept optional fields', () => {
      const manifest = createTestManifest('test', {
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
        keywords: ['test', 'example'],
        minCoreVersion: '0.1.0',
        dependencies: { 'other-connector': '^1.0.0' },
      });

      expect(manifest.repository).toBe('https://github.com/test/test');
      expect(manifest.homepage).toBe('https://test.com');
      expect(manifest.keywords).toContain('test');
      expect(manifest.minCoreVersion).toBe('0.1.0');
    });
  });

  describe('parseManifest', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        manifestVersion: '1.0',
        id: 'test',
        version: '1.0.0',
        displayName: 'Test',
        author: 'Test',
        license: 'MIT',
        entrypoint: 'dist/index.js',
        tools: [{ name: 'test', policyClass: 'READ' }],
        capabilities: ['custom'],
        checksum: 'sha256:' + 'a'.repeat(64),
      });

      const result = parseManifest(json);
      expect(result.valid).toBe(true);
      expect(result.manifest?.id).toBe('test');
    });

    it('should reject invalid JSON', () => {
      const result = parseManifest('{ invalid json }');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid JSON'))).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('getFullToolName should combine connector and tool name', () => {
      expect(getFullToolName('github', 'getPullRequest')).toBe('github.getPullRequest');
      expect(getFullToolName('airbyte', 'listConnections')).toBe('airbyte.listConnections');
    });

    it('buildPolicyClassMap should create map from manifest', () => {
      const manifest = createTestManifest('test', {
        tools: [
          { name: 'read', policyClass: 'READ' },
          { name: 'write', policyClass: 'WRITE_NON_DESTRUCTIVE' },
          { name: 'destroy', policyClass: 'DESTRUCTIVE' },
        ],
      });

      const map = buildPolicyClassMap(manifest);
      expect(map['test.read']).toBe('READ');
      expect(map['test.write']).toBe('WRITE_NON_DESTRUCTIVE');
      expect(map['test.destroy']).toBe('DESTRUCTIVE');
    });

    it('createTestManifest should create valid manifest', () => {
      const manifest = createTestManifest('my-connector');
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(manifest.id).toBe('my-connector');
    });
  });
});
