/**
 * Supply Chain Security Tests
 *
 * Phase 49: Tests for dependency scanning, SBOM generation, and supply chain security.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemorySBOMStore,
  InMemoryVulnerabilityDB,
  SupplyChainManager,
  createSupplyChainManager,
  DEFAULT_SUPPLY_CHAIN_CONFIG,
  LICENSE_CATEGORIES,
} from '../index.js';

// =============================================================================
// InMemorySBOMStore Tests
// =============================================================================

describe('InMemorySBOMStore', () => {
  let store: InMemorySBOMStore;

  beforeEach(() => {
    store = new InMemorySBOMStore();
  });

  describe('save()', () => {
    it('should save SBOM', async () => {
      const sbom = await store.save({
        id: 'sbom_1',
        format: 'cyclonedx',
        version: '1.0',
        createdAt: new Date(),
        projectName: 'test-project',
        projectVersion: '1.0.0',
        dependencies: [],
        metadata: { tool: 'test', toolVersion: '1.0.0', generator: 'test' },
      });

      const retrieved = await store.get(sbom.id);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('getLatest()', () => {
    it('should get latest SBOM for project', async () => {
      await store.save({
        id: 'sbom_1',
        format: 'cyclonedx',
        version: '1.0',
        createdAt: new Date(Date.now() - 1000),
        projectName: 'test-project',
        projectVersion: '1.0.0',
        dependencies: [],
        metadata: { tool: 'test', toolVersion: '1.0.0', generator: 'test' },
      });

      await store.save({
        id: 'sbom_2',
        format: 'cyclonedx',
        version: '1.0',
        createdAt: new Date(),
        projectName: 'test-project',
        projectVersion: '1.1.0',
        dependencies: [],
        metadata: { tool: 'test', toolVersion: '1.0.0', generator: 'test' },
      });

      const latest = await store.getLatest('test-project');
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe('sbom_2');
    });
  });

  describe('compare()', () => {
    it('should compare two SBOMs', async () => {
      await store.save({
        id: 'sbom_1',
        format: 'cyclonedx',
        version: '1.0',
        createdAt: new Date(),
        projectName: 'test',
        projectVersion: '1.0.0',
        dependencies: [
          { name: 'dep-a', version: '1.0.0', type: 'direct', ecosystem: 'npm', licenseRisk: 'none', dependencies: [] },
          { name: 'dep-b', version: '2.0.0', type: 'direct', ecosystem: 'npm', licenseRisk: 'none', dependencies: [] },
        ],
        metadata: { tool: 'test', toolVersion: '1.0.0', generator: 'test' },
      });

      await store.save({
        id: 'sbom_2',
        format: 'cyclonedx',
        version: '1.0',
        createdAt: new Date(),
        projectName: 'test',
        projectVersion: '1.1.0',
        dependencies: [
          { name: 'dep-a', version: '1.1.0', type: 'direct', ecosystem: 'npm', licenseRisk: 'none', dependencies: [] },
          { name: 'dep-c', version: '1.0.0', type: 'direct', ecosystem: 'npm', licenseRisk: 'none', dependencies: [] },
        ],
        metadata: { tool: 'test', toolVersion: '1.0.0', generator: 'test' },
      });

      const diff = await store.compare('sbom_1', 'sbom_2');

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].name).toBe('dep-c');

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].name).toBe('dep-b');

      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0].name).toBe('dep-a');
      expect(diff.changed[0].oldVersion).toBe('1.0.0');
      expect(diff.changed[0].newVersion).toBe('1.1.0');
    });
  });
});

// =============================================================================
// InMemoryVulnerabilityDB Tests
// =============================================================================

describe('InMemoryVulnerabilityDB', () => {
  let db: InMemoryVulnerabilityDB;

  beforeEach(() => {
    db = new InMemoryVulnerabilityDB();
  });

  describe('query()', () => {
    it('should find vulnerabilities for dependency', async () => {
      db.addVulnerability({
        id: 'vuln_1',
        cveId: 'CVE-2025-1234',
        dependencyName: 'lodash',
        dependencyVersion: '4.17.0',
        severity: 'high',
        title: 'Prototype Pollution',
        description: 'Test vulnerability',
        fixedVersions: ['4.17.21'],
        publishedAt: new Date(),
        references: [],
      });

      const vulns = await db.query('lodash', '4.17.0');
      expect(vulns).toHaveLength(1);
      expect(vulns[0].cveId).toBe('CVE-2025-1234');
    });

    it('should return empty for non-vulnerable version', async () => {
      db.addVulnerability({
        id: 'vuln_1',
        dependencyName: 'lodash',
        dependencyVersion: '4.17.0',
        severity: 'high',
        title: 'Test',
        description: 'Test',
        fixedVersions: [],
        publishedAt: new Date(),
        references: [],
      });

      const vulns = await db.query('lodash', '4.17.21');
      expect(vulns).toHaveLength(0);
    });
  });

  describe('getById()', () => {
    it('should get vulnerability by CVE ID', async () => {
      db.addVulnerability({
        id: 'vuln_1',
        cveId: 'CVE-2025-5678',
        dependencyName: 'test',
        dependencyVersion: '1.0.0',
        severity: 'critical',
        title: 'Test Vuln',
        description: 'Test',
        fixedVersions: [],
        publishedAt: new Date(),
        references: [],
      });

      const vuln = await db.getById('CVE-2025-5678');
      expect(vuln).not.toBeNull();
      expect(vuln!.severity).toBe('critical');
    });
  });
});

// =============================================================================
// SupplyChainManager Tests
// =============================================================================

describe('SupplyChainManager', () => {
  let manager: SupplyChainManager;

  beforeEach(() => {
    manager = createSupplyChainManager();
  });

  describe('generateSBOM()', () => {
    it('should generate SBOM', async () => {
      const sbom = await manager.generateSBOM('test-project', '1.0.0', [
        {
          name: 'lodash',
          version: '4.17.21',
          type: 'direct',
          ecosystem: 'npm',
          license: 'MIT',
          dependencies: [],
        },
      ]);

      expect(sbom.projectName).toBe('test-project');
      expect(sbom.dependencies).toHaveLength(1);
      expect(sbom.dependencies[0].licenseRisk).toBe('none');
    });

    it('should assess license risk', async () => {
      const sbom = await manager.generateSBOM('test', '1.0.0', [
        { name: 'mit-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'MIT', dependencies: [] },
        { name: 'gpl-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'GPL-3.0', dependencies: [] },
        { name: 'unknown-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', dependencies: [] },
      ]);

      const mitPkg = sbom.dependencies.find((d) => d.name === 'mit-pkg');
      const gplPkg = sbom.dependencies.find((d) => d.name === 'gpl-pkg');
      const unknownPkg = sbom.dependencies.find((d) => d.name === 'unknown-pkg');

      expect(mitPkg!.licenseRisk).toBe('none');
      expect(gplPkg!.licenseRisk).toBe('high');
      expect(unknownPkg!.licenseRisk).toBe('unknown');
    });
  });

  describe('scan()', () => {
    it('should scan project', async () => {
      const result = await manager.scan('test-project', [
        { name: 'lodash', version: '4.17.21', type: 'direct', ecosystem: 'npm', license: 'MIT', dependencies: [] },
        { name: 'express', version: '4.18.0', type: 'direct', ecosystem: 'npm', license: 'MIT', dependencies: [] },
      ]);

      expect(result.projectId).toBe('test-project');
      expect(result.sbom).toBeDefined();
      expect(result.summary.totalDependencies).toBe(2);
    });

    it('should calculate risk score', async () => {
      const result = await manager.scan('test', [
        { name: 'safe-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'MIT', dependencies: [] },
      ]);

      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should identify license issues', async () => {
      const result = await manager.scan('test', [
        { name: 'gpl-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'GPL-3.0', dependencies: [] },
      ]);

      expect(result.licenseIssues.length).toBeGreaterThan(0);
    });
  });

  describe('License Policy', () => {
    it('should create license policy', async () => {
      const policy = await manager.createLicensePolicy({
        tenantId: 'tenant-1',
        name: 'Strict Policy',
        allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
        blockedLicenses: ['GPL-3.0', 'AGPL-3.0'],
        requireApprovalLicenses: ['LGPL-3.0'],
        enabled: true,
      });

      expect(policy.id).toMatch(/^policy_/);
    });

    it('should evaluate dependencies against policy', async () => {
      const policy = await manager.createLicensePolicy({
        tenantId: 'tenant-1',
        name: 'Test Policy',
        allowedLicenses: ['MIT', 'Apache-2.0'],
        blockedLicenses: ['GPL-3.0'],
        requireApprovalLicenses: ['LGPL-3.0'],
        enabled: true,
      });

      const result = await manager.evaluateLicensePolicy(policy.id, [
        { name: 'mit-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'MIT', licenseRisk: 'none', dependencies: [] },
        { name: 'gpl-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'GPL-3.0', licenseRisk: 'high', dependencies: [] },
        { name: 'lgpl-pkg', version: '1.0.0', type: 'direct', ecosystem: 'npm', license: 'LGPL-3.0', licenseRisk: 'low', dependencies: [] },
      ]);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].dependencyName).toBe('gpl-pkg');
      expect(result.requiresApproval).toHaveLength(1);
      expect(result.requiresApproval[0].dependencyName).toBe('lgpl-pkg');
    });
  });

  describe('checkUpdates()', () => {
    it('should check for updates', async () => {
      const updates = await manager.checkUpdates([
        { name: 'lodash', version: '4.17.0', type: 'direct', ecosystem: 'npm', licenseRisk: 'none', dependencies: [] },
      ]);

      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].currentVersion).toBe('4.17.0');
      expect(updates[0].latestVersion).toBe('4.17.1');
      expect(updates[0].updateType).toBe('patch');
    });
  });

  describe('compareSBOMs()', () => {
    it('should compare SBOMs', async () => {
      const sbom1 = await manager.generateSBOM('test', '1.0.0', [
        { name: 'dep-a', version: '1.0.0', type: 'direct', ecosystem: 'npm', dependencies: [] },
      ]);

      const sbom2 = await manager.generateSBOM('test', '1.1.0', [
        { name: 'dep-a', version: '1.1.0', type: 'direct', ecosystem: 'npm', dependencies: [] },
        { name: 'dep-b', version: '1.0.0', type: 'direct', ecosystem: 'npm', dependencies: [] },
      ]);

      const diff = await manager.compareSBOMs(sbom1.id, sbom2.id);

      expect(diff.added).toHaveLength(1);
      expect(diff.changed).toHaveLength(1);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default supply chain config', () => {
    expect(DEFAULT_SUPPLY_CHAIN_CONFIG.defaultSBOMFormat).toBe('cyclonedx');
    expect(DEFAULT_SUPPLY_CHAIN_CONFIG.autoScan).toBe(true);
    expect(DEFAULT_SUPPLY_CHAIN_CONFIG.failOnCritical).toBe(true);
  });

  it('should have license categories', () => {
    expect(LICENSE_CATEGORIES.none).toContain('MIT');
    expect(LICENSE_CATEGORIES.none).toContain('Apache-2.0');
    expect(LICENSE_CATEGORIES.high).toContain('GPL-3.0');
  });
});
